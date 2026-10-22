// Big-endian byte helpers over Uint8Array (classic Mac formats are all BE).

export const u8 = (b: Uint8Array, o: number) => b[o];
export const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
export const i16 = (b: Uint8Array, o: number) => (u16(b, o) << 16) >> 16;
export const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

export function w16(b: Uint8Array, o: number, v: number) { b[o] = (v >>> 8) & 255; b[o + 1] = v & 255; }
export function w32(b: Uint8Array, o: number, v: number) {
  b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255;
}

export const fourCC = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
export function wFourCC(b: Uint8Array, o: number, s: string) {
  for (let i = 0; i < 4; i++) b[o + i] = (s.charCodeAt(i) || 0x20) & 255;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const roundUp = (n: number, m: number) => Math.ceil(n / m) * m;

/** Seconds since 1904-01-01 (local time, as classic Mac OS stores it). */
export const MAC_EPOCH_OFFSET = 2082844800;
export function macNow(): number {
  const d = new Date();
  return Math.floor(d.getTime() / 1000 - d.getTimezoneOffset() * 60) + MAC_EPOCH_OFFSET;
}
export function macToDate(secs: number): Date {
  const d = new Date((secs - MAC_EPOCH_OFFSET) * 1000);
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
}

/** CRC-16/XMODEM (CCITT, poly 0x1021, init 0) — used by MacBinary II, BinHex and our serial framing. */
export function crc16(data: Uint8Array, crc = 0): number {
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
