// Platinum Bridge client: newline-delimited JSON with the ESP32 firmware.
// In "direct" mode there is no ESP32: the transport is the Mac's serial port itself.
// Keep in sync with firmware/platinum-bridge/platinum-bridge.ino and docs/protocol.md.

import type { Transport } from "./transport";
import { AgentClient } from "./agent";

export interface BridgeInfo {
  fw: string;
  board: string;
  name: string;
  mode: "adb" | "m0110";
  ip?: string;
  ssid?: string;
  rssi?: number;
  heap?: number;
  uptime?: number;
  baud?: number;
  adbAddr?: { kbd: number; mouse: number };
  macPolling?: boolean;
  /** A status screen is connected. */
  display?: boolean;
  /** Who owns the Mac's serial port: Platinum Agent, or the Mac's network link (PPP). */
  serial?: "agent" | "net";
  net?: { state: "off" | "waiting" | "connecting" | "online"; ip?: string; in: number; out: number };
}

export interface BleDevice { addr: string; name: string; rssi: number; kind: "keyboard" | "mouse" | "hid" | "unknown"; paired: boolean; connected: boolean }

export type BridgeEvent =
  | { t: "info"; info: BridgeInfo }
  | { t: "log"; m: string; at: number }
  | { t: "ble"; list: BleDevice[] }
  | { t: "adb"; ev: string; addr: number; reg: number; at: number }
  | { t: "hid"; kind: "key" | "mouse"; code?: number; down?: boolean; dx?: number; dy?: number; b?: number };

const b64 = {
  enc(bytes: Uint8Array) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); },
  dec(s: string) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; },
};

export class Bridge {
  readonly agent: AgentClient;
  private lineBuf = "";
  private dec = new TextDecoder();
  private enc = new TextEncoder();
  onEvent: (e: BridgeEvent) => void = () => {};
  onClose: (reason?: string) => void = () => {};
  rx = 0;
  tx = 0;

  constructor(readonly transport: Transport) {
    const direct = transport.kind === "direct";
    this.agent = new AgentClient((bytes) => (direct ? this.raw(bytes) : this.json({ t: "ser", d: b64.enc(bytes) })));
    transport.onData = (d) => {
      this.rx += d.length;
      if (direct) this.agent.feed(d);
      else this.ingest(d);
    };
    transport.onClose = (r) => this.onClose(r);
  }

  get direct() { return this.transport.kind === "direct"; }

  private ingest(d: Uint8Array) {
    this.lineBuf += this.dec.decode(d, { stream: true });
    let nl: number;
    while ((nl = this.lineBuf.indexOf("\n")) >= 0) {
      const line = this.lineBuf.slice(0, nl).trim();
      this.lineBuf = this.lineBuf.slice(nl + 1);
      if (!line) continue;
      if (line[0] !== "{") { this.onEvent({ t: "log", m: line, at: Date.now() }); continue; } // boot messages
      try { this.dispatch(JSON.parse(line)); } catch { this.onEvent({ t: "log", m: line, at: Date.now() }); }
    }
  }

  private dispatch(m: Record<string, unknown>) {
    switch (m.t) {
      case "ser": this.agent.feed(b64.dec(m.d as string)); break;
      case "info": this.onEvent({ t: "info", info: m as unknown as BridgeInfo }); break;
      case "log": this.onEvent({ t: "log", m: String(m.m), at: Date.now() }); break;
      case "ble": this.onEvent({ t: "ble", list: (m.list as BleDevice[]) ?? [] }); break;
      case "adb": this.onEvent({ t: "adb", ev: String(m.ev), addr: Number(m.addr), reg: Number(m.reg), at: Date.now() }); break;
      case "hid": this.onEvent(m as BridgeEvent); break;
    }
  }

  private async raw(bytes: Uint8Array) { this.tx += bytes.length; await this.transport.send(bytes); }

  async json(msg: Record<string, unknown>) {
    if (this.direct) return;
    const bytes = this.enc.encode(JSON.stringify(msg) + "\n");
    this.tx += bytes.length;
    await this.transport.send(bytes);
  }

  hello() { return this.json({ t: "hello", app: "platinum", v: 1 }); }
  key(code: number, down: boolean) { return this.json({ t: "key", c: code, d: down ? 1 : 0 }); }
  mouse(dx: number, dy: number, button: boolean) { return this.json({ t: "mouse", dx: Math.round(dx), dy: Math.round(dy), b: button ? 1 : 0 }); }
  power() { return this.json({ t: "power" }); }
  configure(cfg: { mode?: "adb" | "m0110"; serial?: "agent" | "net"; baud?: number; name?: string }) { return this.json({ t: "cfg", ...cfg }); }
  wifi(ssid: string, pass: string) { return this.json({ t: "wifi", ssid, pass }); }
  bleScan() { return this.json({ t: "ble_scan" }); }
  blePair(addr: string) { return this.json({ t: "ble_pair", addr }); }
  bleForget(addr: string) { return this.json({ t: "ble_forget", addr }); }
  reboot() { return this.json({ t: "reboot" }); }

  close() { return this.transport.close(); }
}
