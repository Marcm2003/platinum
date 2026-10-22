// MacBinary I/II/III — the usual way to carry both forks + Finder info through non-Mac filesystems.

import { concat, crc16, fourCC, roundUp, u16, u32, w16, w32, wFourCC } from "./bytes";
import { decodeMacRoman, encodeMacRoman } from "./macroman";
import { newFile, type MacFile } from "./volume";

export function isMacBinary(b: Uint8Array): boolean {
  if (b.length < 128 || b[0] !== 0 || b[74] !== 0 || b[82] !== 0) return false;
  const nameLen = b[1];
  if (nameLen < 1 || nameLen > 63) return false;
  const dataLen = u32(b, 83), rsrcLen = u32(b, 87);
  if (dataLen > 0x7fffffff || rsrcLen > 0x7fffffff) return false;
  if (128 + roundUp(dataLen, 128) + rsrcLen > b.length + 128) return false;
  // MacBinary II+ carries a CRC of the header; accept I without it if fields look sane.
  if (b[123] >= 129) return crc16(b.subarray(0, 124)) === u16(b, 124);
  return b[101] === 0 && /^[\x20-\x7e]{4}$/.test(fourCC(b, 65));
}

export function decodeMacBinary(b: Uint8Array): MacFile {
  const name = decodeMacRoman(b.subarray(2, 2 + b[1]));
  const dataLen = u32(b, 83), rsrcLen = u32(b, 87);
  const secondaryHeader = b[123] >= 129 ? u16(b, 120) : 0;
  const dataStart = 128 + roundUp(secondaryHeader, 128);
  const rsrcStart = dataStart + roundUp(dataLen, 128);
  const fi = new Uint8Array(16);
  fi.set(b.subarray(65, 73), 0); // type, creator
  fi[8] = b[73]; // Finder flags (high byte)
  fi[9] = b[101]; // Finder flags (low byte)
  fi.set(b.subarray(75, 79), 10); // location v,h
  fi.set(b.subarray(79, 81), 14); // folder id
  return newFile(name, {
    type: fourCC(b, 65),
    creator: fourCC(b, 69),
    finderInfo: fi,
    locked: (b[81] & 1) !== 0,
    data: b.slice(dataStart, dataStart + dataLen),
    rsrc: b.slice(rsrcStart, rsrcStart + rsrcLen),
    created: u32(b, 91),
    modified: u32(b, 95),
  });
}

export function encodeMacBinary(f: MacFile): Uint8Array {
  const h = new Uint8Array(128);
  const name = encodeMacRoman(f.name, 63);
  h[1] = name.length;
  h.set(name, 2);
  wFourCC(h, 65, f.type);
  wFourCC(h, 69, f.creator);
  h[73] = f.finderInfo[8];
  h.set(f.finderInfo.subarray(10, 14), 75);
  h.set(f.finderInfo.subarray(14, 16), 79);
  h[81] = f.locked ? 1 : 0;
  w32(h, 83, f.data.length);
  w32(h, 87, f.rsrc.length);
  w32(h, 91, f.created);
  w32(h, 95, f.modified);
  h[101] = f.finderInfo[9];
  h.set([0x6d, 0x42, 0x49, 0x4e], 102); // 'mBIN' signature (MacBinary III)
  h[122] = 130;
  h[123] = 129;
  w16(h, 124, crc16(h.subarray(0, 124)));
  const pad = (d: Uint8Array) => concat([d, new Uint8Array(roundUp(d.length, 128) - d.length)]);
  return concat([h, pad(f.data), pad(f.rsrc)]);
}
