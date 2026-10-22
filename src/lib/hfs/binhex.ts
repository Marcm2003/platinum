// BinHex 4.0 (.hqx) decoder — most classic Mac software archives ship like this.

import { crc16, fourCC, u16, u32 } from "./bytes";
import { t } from "@/i18n";
import { decodeMacRoman } from "./macroman";
import { newFile, type MacFile } from "./volume";

const ALPHABET = "!\"#$%&'()*+,-012345689@ABCDEFGHIJKLMNPQRSTUVXYZ[`abcdefhijklmpqr";
const MARK = "(This file must be converted with BinHex";

export function isBinHex(bytes: Uint8Array): boolean {
  return new TextDecoder("latin1").decode(bytes.subarray(0, 4096)).includes(MARK);
}

export function decodeBinHex(input: Uint8Array): MacFile {
  const text = new TextDecoder("latin1").decode(input);
  const markAt = text.indexOf(MARK);
  const start = text.indexOf(":", text.indexOf("\n", markAt)) + 1;
  const end = text.indexOf(":", start);
  if (markAt < 0 || start <= 0 || end < 0) throw new Error(t("BinHex: the ':' delimiters were not found."));

  // 6-bit → 8-bit
  const sixes: number[] = [];
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (c === "\r" || c === "\n" || c === "\t" || c === " ") continue;
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new Error(t("BinHex: invalid character '{c}'.", { c }));
    sixes.push(v);
  }
  const packed: number[] = [];
  for (let i = 0; i + 1 < sixes.length; i += 4) {
    const a = sixes[i], b = sixes[i + 1], c = sixes[i + 2] ?? 0, d = sixes[i + 3] ?? 0;
    packed.push(((a << 2) | (b >> 4)) & 255);
    if (i + 2 < sixes.length) packed.push(((b << 4) | (c >> 2)) & 255);
    if (i + 3 < sixes.length) packed.push(((c << 6) | d) & 255);
  }

  // Run-length expansion (0x90 marker).
  const out: number[] = [];
  for (let i = 0; i < packed.length; i++) {
    const b = packed[i];
    if (b !== 0x90) { out.push(b); continue; }
    const n = packed[++i];
    if (n === 0) out.push(0x90);
    else { const last = out[out.length - 1]; for (let k = 1; k < n; k++) out.push(last); }
  }
  const d = new Uint8Array(out);

  const nameLen = d[0];
  const name = decodeMacRoman(d.subarray(1, 1 + nameLen));
  let p = 1 + nameLen + 1; // name + version byte
  const type = fourCC(d, p), creator = fourCC(d, p + 4);
  const flags = u16(d, p + 8);
  const dataLen = u32(d, p + 10), rsrcLen = u32(d, p + 14);
  const headerCrc = u16(d, p + 18);
  if (crc16(d.subarray(0, p + 18)) !== headerCrc) throw new Error(t("BinHex: bad header CRC."));
  p += 20;
  const data = d.slice(p, p + dataLen);
  p += dataLen + 2;
  const rsrc = d.slice(p, p + rsrcLen);
  if (data.length !== dataLen || rsrc.length !== rsrcLen) throw new Error(t("BinHex: truncated file."));

  const fi = new Uint8Array(16);
  fi[8] = flags >> 8;
  fi[9] = flags & 0xfe; // clear "inited" so the Finder places it
  return newFile(name, { type, creator, finderInfo: fi, data, rsrc });
}
