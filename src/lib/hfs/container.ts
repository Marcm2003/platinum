// Disk image containers: raw HFS, DiskCopy 4.2 and Apple Partition Map (.hda / CD).

import { u16, u32, w16, w32 } from "./bytes";
import { decodeMacRoman, encodeMacRoman } from "./macroman";
import { t } from "@/i18n";
import { isHfs, isHfsPlus } from "./volume";

export type ContainerKind = "raw" | "dc42" | "apm";

export interface Container {
  kind: ContainerKind;
  /** Byte range of the HFS volume inside the image. */
  offset: number;
  size: number;
  partitionName?: string;
  partitions?: { name: string; type: string; start: number; size: number }[];
  /** Rebuild the full image file around a new volume of the same size. */
  wrap(volume: Uint8Array): Uint8Array;
  label: string;
}

export function dc42Checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i + 1 < data.length; i += 2) {
    sum = (sum + ((data[i] << 8) | data[i + 1])) >>> 0;
    sum = ((sum >>> 1) | (sum << 31)) >>> 0;
  }
  return sum;
}

function isDc42(img: Uint8Array): boolean {
  if (img.length < 84 || u16(img, 82) !== 0x0100 || img[0] > 63) return false;
  const dataSize = u32(img, 64), tagSize = u32(img, 68);
  return dataSize > 0 && dataSize % 512 === 0 && 84 + dataSize + tagSize <= img.length;
}

export function makeDc42(name: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(84 + data.length);
  const n = encodeMacRoman(name, 63);
  out[0] = n.length;
  out.set(n, 1);
  w32(out, 64, data.length);
  w32(out, 68, 0);
  w32(out, 72, dc42Checksum(data));
  w32(out, 76, 0);
  const kb = data.length / 1024;
  out[80] = kb === 400 ? 0 : kb === 800 ? 1 : kb === 720 ? 2 : kb === 1440 ? 3 : 0xff;
  out[81] = kb === 400 ? 0x02 : 0x22;
  w16(out, 82, 0x0100);
  out.set(data, 84);
  return out;
}

export function detectContainer(img: Uint8Array): Container {
  if (isDc42(img)) {
    const size = u32(img, 64);
    const name = decodeMacRoman(img.subarray(1, 1 + img[0]));
    return { kind: "dc42", offset: 84, size, label: "DiskCopy 4.2", wrap: (vol) => makeDc42(name, vol) };
  }

  if (img.length > 1024 && (u16(img, 0) === 0x4552 || u16(img, 512) === 0x504d)) {
    const blockSize = u16(img, 0) === 0x4552 ? u16(img, 2) || 512 : 512;
    const parts: NonNullable<Container["partitions"]> = [];
    const count = u32(img, 512 + 4);
    for (let i = 1; i <= count && (i + 1) * 512 <= img.length; i++) {
      const p = i * 512;
      if (u16(img, p) !== 0x504d) break;
      const str = (o: number) => decodeMacRoman(img.subarray(p + o, p + o + 32)).replace(/\0[\s\S]*$/, "");
      parts.push({ name: str(16), type: str(48), start: u32(img, p + 8) * 512, size: u32(img, p + 12) * 512 });
    }
    const hfs = parts.find((pt) => pt.type === "Apple_HFS");
    if (hfs) {
      return {
        kind: "apm",
        offset: hfs.start,
        size: Math.min(hfs.size, img.length - hfs.start),
        partitionName: hfs.name,
        partitions: parts,
        label: t("Apple Partition Map ({size} B/block)", { size: blockSize }),
        wrap: (vol) => {
          const out = img.slice();
          out.set(vol, hfs.start);
          return out;
        },
      };
    }
  }

  return { kind: "raw", offset: 0, size: img.length, label: t("Raw image"), wrap: (vol) => vol };
}

export function describeVolumeFormat(vol: Uint8Array): "hfs" | "hfs+" | "mfs" | "unknown" {
  if (isHfsPlus(vol)) return "hfs+";
  if (isHfs(vol)) return "hfs";
  if (vol.length > 1026 && u16(vol, 1024) === 0xd2d7) return "mfs";
  return "unknown";
}
