// Platinum Agent protocol — binary frames over the Mac's serial port.
// Specified in docs/protocol.md (the Mac-side agent must follow it).
//
//   A5 5A | type | seq | len_hi len_lo | payload… | crc_hi crc_lo
//   CRC-16/XMODEM over type..payload.

import { crc16, u16, u32, w16, w32, concat, fourCC, wFourCC } from "../hfs/bytes";
import { decodeMacRoman, encodeMacRoman } from "../hfs/macroman";
import type { MacFile } from "../hfs";
import { t } from "@/i18n";

export const T = {
  PING: 0x01, SYSINFO: 0x02,
  LOG: 0x10,
  FILE_BEGIN: 0x20, FILE_DATA: 0x21, FILE_END: 0x22,
  SCREEN_FULL: 0x30, SCREEN_DELTA: 0x31,
  PEEK: 0x40, POKE: 0x41,
  LAUNCH: 0x50, LIST: 0x51,
  HELLO: 0x7f,
  REPLY: 0x80, // reply type = request | 0x80
  SCREEN_INFO: 0xb0, SCREEN_ROWS: 0xb1, SCREEN_END: 0xb2, SCREEN_CLUT: 0xb3,
  ERROR: 0xff,
} as const;

export const MAX_PAYLOAD = 8192;

export interface Frame { type: number; seq: number; payload: Uint8Array }

export function encodeFrame(type: number, seq: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  out[0] = 0xa5; out[1] = 0x5a; out[2] = type; out[3] = seq & 255;
  w16(out, 4, payload.length);
  out.set(payload, 6);
  w16(out, 6 + payload.length, crc16(out.subarray(2, 6 + payload.length)));
  return out;
}

/** Streaming decoder; resynchronises on garbage and drops frames with bad CRC. */
export class FrameDecoder {
  private buf: Uint8Array = new Uint8Array(0);
  badFrames = 0;
  constructor(private onFrame: (f: Frame) => void) {}
  push(chunk: Uint8Array) {
    this.buf = this.buf.length ? concat([this.buf, chunk]) : chunk.slice();
    for (;;) {
      let i = 0;
      while (i + 1 < this.buf.length && !(this.buf[i] === 0xa5 && this.buf[i + 1] === 0x5a)) i++;
      if (i) this.buf = this.buf.subarray(i);
      if (this.buf.length < 8) return;
      const len = u16(this.buf, 4);
      if (len > MAX_PAYLOAD + 64) { this.buf = this.buf.subarray(2); this.badFrames++; continue; }
      if (this.buf.length < 8 + len) return;
      const crc = u16(this.buf, 6 + len);
      if (crc16(this.buf.subarray(2, 6 + len)) === crc) {
        this.onFrame({ type: this.buf[2], seq: this.buf[3], payload: this.buf.slice(6, 6 + len) });
        this.buf = this.buf.subarray(8 + len);
      } else {
        this.badFrames++;
        this.buf = this.buf.subarray(2);
      }
    }
  }
}

export interface SysInfo {
  machineType: number;
  machineName: string;
  systemVersion: string;
  physicalRam: number;
  screen: { w: number; h: number; depth: number };
  agentVersion: string;
  freeMem: number;
}

export interface LogLine { level: number; tick: number; text: string; source: string; at: number }

export interface ScreenFrame { w: number; h: number; depth: number; rowBytes: number; pixels: Uint8Array; clut?: Uint8Array; dirtyRows: number }

// Gestalt machine types → names (subset used for display).
const GESTALT_NAMES: Record<number, string> = {
  1: "Mac 128K/512K", 2: "Mac 512Ke", 3: "Mac Plus", 4: "Mac SE", 5: "Mac II", 6: "Mac IIx", 7: "Mac IIcx", 8: "Mac SE/30",
  9: "Portable", 10: "Mac IIci", 11: "Mac IIfx", 15: "Mac Classic", 16: "Mac IIsi", 17: "Mac LC", 18: "Quadra 900", 19: "PowerBook 170",
  20: "Quadra 700", 21: "Classic II", 22: "PowerBook 100", 23: "PowerBook 140", 24: "Quadra 950", 25: "LC III", 29: "Centris 650",
  30: "Centris 610", 31: "Quadra 800", 35: "Quadra 650", 36: "LC 475", 37: "Mac TV", 38: "LC II", 39: "Quadra 605",
  41: "Quadra 610", 44: "Quadra 840AV", 45: "Power Mac 6100", 46: "Power Mac 7100", 47: "Power Mac 8100",
  56: "Power Mac 9500", 57: "Power Mac 7500", 67: "Power Mac 6400", 406: "Power Mac G3 / New World",
};

/** PackBits decoder (Apple's run-length scheme, used for screen rows). */
export function unpackBits(src: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen);
  let i = 0, o = 0;
  while (i < src.length && o < outLen) {
    const n = (src[i++] << 24) >> 24;
    if (n >= 0) { const c = n + 1; out.set(src.subarray(i, i + c), o); i += c; o += c; }
    else if (n !== -128) { const c = 1 - n; out.fill(src[i++], o, o + c); o += c; }
  }
  return out;
}

type Pending = { resolve: (f: Frame) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class AgentClient {
  private seq = 1;
  private pending = new Map<number, Pending>();
  private decoder = new FrameDecoder((f) => this.handle(f));
  private screen: ScreenFrame | null = null;
  private screenWaiter: ((s: ScreenFrame) => void) | null = null;

  onLog: (l: LogLine) => void = () => {};
  onHello: (version: string) => void = () => {};
  onScreen: (s: ScreenFrame) => void = () => {};

  constructor(private write: (bytes: Uint8Array) => Promise<void>) {}

  feed(bytes: Uint8Array) { this.decoder.push(bytes); }
  get badFrames() { return this.decoder.badFrames; }

  private handle(f: Frame) {
    if (f.type === T.LOG) {
      const level = f.payload[0], tick = u32(f.payload, 1), srcLen = f.payload[5];
      const source = decodeMacRoman(f.payload.subarray(6, 6 + srcLen));
      this.onLog({ level, tick, source, text: decodeMacRoman(f.payload.subarray(6 + srcLen)), at: Date.now() });
      return;
    }
    if (f.type === T.HELLO) { this.onHello(`${f.payload[0]}.${f.payload[1]}`); return; }
    if (f.type === T.SCREEN_INFO) {
      const w = u16(f.payload, 0), h = u16(f.payload, 2), rowBytes = u16(f.payload, 4), depth = f.payload[6];
      const same = this.screen && this.screen.w === w && this.screen.h === h && this.screen.depth === depth;
      if (!same) this.screen = { w, h, depth, rowBytes, pixels: new Uint8Array(rowBytes * h), dirtyRows: 0 };
      this.screen!.dirtyRows = 0;
      return;
    }
    if (f.type === T.SCREEN_CLUT && this.screen) { this.screen.clut = f.payload.slice(); return; }
    if (f.type === T.SCREEN_ROWS && this.screen) {
      const y = u16(f.payload, 0), n = u16(f.payload, 2);
      const rows = unpackBits(f.payload.subarray(4), n * this.screen.rowBytes);
      this.screen.pixels.set(rows.subarray(0, Math.min(rows.length, this.screen.pixels.length - y * this.screen.rowBytes)), y * this.screen.rowBytes);
      this.screen.dirtyRows += n;
      return;
    }
    if (f.type === T.SCREEN_END && this.screen) {
      this.onScreen(this.screen);
      this.screenWaiter?.(this.screen);
      this.screenWaiter = null;
    }
    const p = this.pending.get(f.seq);
    if (p && (f.type & 0x80)) {
      clearTimeout(p.timer);
      this.pending.delete(f.seq);
      if (f.type === T.ERROR) p.reject(new Error(t("Agent error: {detail}", { detail: `${(f.payload[0] << 24 >> 24) || ""} ${decodeMacRoman(f.payload.subarray(1))}`.trim() })));
      else p.resolve(f);
    }
  }

  request(type: number, payload?: Uint8Array, timeoutMs = 3000): Promise<Frame> {
    const seq = this.seq = (this.seq % 255) + 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(seq); reject(new Error(t("The agent is not responding (timed out)."))); }, timeoutMs);
      this.pending.set(seq, { resolve, reject, timer });
      this.write(encodeFrame(type, seq, payload)).catch((e) => { clearTimeout(timer); this.pending.delete(seq); reject(e); });
    });
  }

  async ping(): Promise<number> {
    const t0 = performance.now();
    await this.request(T.PING);
    return performance.now() - t0;
  }

  async sysinfo(): Promise<SysInfo> {
    const p = (await this.request(T.SYSINFO)).payload;
    const machineType = u32(p, 0);
    const sv = u16(p, 4);
    return {
      machineType,
      machineName: GESTALT_NAMES[machineType] ?? `Gestalt ${machineType}`,
      systemVersion: `${(sv >> 8).toString(16)}.${(sv >> 4) & 15}${sv & 15 ? `.${sv & 15}` : ""}`,
      physicalRam: u32(p, 6),
      screen: { w: u16(p, 10), h: u16(p, 12), depth: u16(p, 14) },
      agentVersion: `${p[16]}.${p[17]}`,
      freeMem: u32(p, 18),
    };
  }

  /** Send a file (both forks) into the agent's "Platinum Inbox" folder. */
  async sendFile(f: MacFile, onProgress?: (sent: number, total: number) => void): Promise<void> {
    const name = encodeMacRoman(f.name, 31);
    const begin = new Uint8Array(18 + 1 + name.length);
    wFourCC(begin, 0, f.type); wFourCC(begin, 4, f.creator);
    begin[8] = f.finderInfo[8]; begin[9] = f.finderInfo[9];
    w32(begin, 10, f.data.length); w32(begin, 14, f.rsrc.length);
    begin[18] = name.length; begin.set(name, 19);
    await this.request(T.FILE_BEGIN, begin, 5000);
    const total = f.data.length + f.rsrc.length;
    let sent = 0;
    const CHUNK = 512;
    for (const [fork, bytes] of [[0, f.data], [1, f.rsrc]] as const) {
      for (let off = 0; off < bytes.length; off += CHUNK) {
        const part = bytes.subarray(off, off + CHUNK);
        const msg = new Uint8Array(5 + part.length);
        msg[0] = fork; w32(msg, 1, off); msg.set(part, 5);
        for (let attempt = 0; ; attempt++) {
          try { await this.request(T.FILE_DATA, msg, 4000); break; }
          catch (e) { if (attempt >= 3) throw e; }
        }
        sent += part.length;
        onProgress?.(sent, total);
      }
    }
    await this.request(T.FILE_END, undefined, 8000);
  }

  /** Ask for the screen; `delta` only sends rows that changed since the last grab. */
  grabScreen(delta: boolean): Promise<ScreenFrame> {
    return new Promise((resolve, reject) => {
      this.screenWaiter = resolve;
      this.request(delta && this.screen ? T.SCREEN_DELTA : T.SCREEN_FULL, undefined, 20000).catch((e) => { this.screenWaiter = null; reject(e); });
    });
  }

  async peek(addr: number, len: number): Promise<Uint8Array> {
    const p = new Uint8Array(6); w32(p, 0, addr); w16(p, 4, Math.min(len, 512));
    return (await this.request(T.PEEK, p)).payload;
  }

  async poke(addr: number, bytes: Uint8Array): Promise<void> {
    const p = new Uint8Array(4 + bytes.length); w32(p, 0, addr); p.set(bytes, 4);
    await this.request(T.POKE, p);
  }

  async launch(name: string): Promise<void> {
    const n = encodeMacRoman(name, 31);
    await this.request(T.LAUNCH, concat([new Uint8Array([n.length]), n]), 10000);
  }

  async list(): Promise<{ name: string; type: string; creator: string; size: number }[]> {
    const p = (await this.request(T.LIST, undefined, 5000)).payload;
    const out = [];
    for (let i = 0; i < p.length;) {
      const type = fourCC(p, i), creator = fourCC(p, i + 4), size = u32(p, i + 8), nl = p[i + 12];
      out.push({ type, creator, size, name: decodeMacRoman(p.subarray(i + 13, i + 13 + nl)) });
      i += 13 + nl;
    }
    return out;
  }
}
