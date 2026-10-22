// High-level disk image API used by the Disk Studio (our TransMac).

import { decodeBinHex, isBinHex } from "./binhex";
import { detectContainer, makeDc42, type Container } from "./container";
import { decodeMacBinary, encodeMacBinary, isMacBinary } from "./macbinary";
import { blankVolume, readHfs, writeHfs, newFile, newFolder, sortTree, HfsError, type HfsVolume, type MacFile, type MacFolder, type MacNode } from "./volume";
import { relString, encodeMacRoman, sanitizeHfsName } from "./macroman";
import { N_ } from "@/i18n";

export * from "./volume";
export { macToDate, macNow } from "./bytes";
export { encodeMacBinary, decodeMacBinary, isMacBinary, sanitizeHfsName };

export interface OpenedImage {
  fileName: string;
  path?: string;
  container: Container;
  volume: HfsVolume;
  original: Uint8Array;
}

export function openImage(bytes: Uint8Array, fileName: string, path?: string): OpenedImage {
  const container = detectContainer(bytes);
  const vol = bytes.subarray(container.offset, container.offset + container.size);
  return { fileName, path, container, volume: readHfs(vol), original: bytes };
}

export function saveImage(img: OpenedImage): Uint8Array {
  const vol = writeHfs(img.volume, img.container.size);
  return img.container.wrap(vol);
}

export const DISK_PRESETS = [
  { id: "400k", label: N_("400 KB floppy (MFS/HFS, Mac 128K–512K)"), bytes: 400 * 1024, dc42: true },
  { id: "800k", label: N_("800 KB floppy (Mac Plus and later)"), bytes: 800 * 1024, dc42: true },
  { id: "1440k", label: N_("1.44 MB HD floppy (SuperDrive)"), bytes: 1440 * 1024, dc42: true },
  { id: "20m", label: N_("20 MB hard disk"), bytes: 20 * 1024 * 1024, dc42: false },
  { id: "40m", label: N_("40 MB hard disk"), bytes: 40 * 1024 * 1024, dc42: false },
  { id: "100m", label: N_("100 MB hard disk"), bytes: 100 * 1024 * 1024, dc42: false },
  { id: "500m", label: N_("500 MB hard disk"), bytes: 500 * 1024 * 1024, dc42: false },
  { id: "2g", label: N_("2 GB hard disk (HFS maximum)"), bytes: 2047 * 1024 * 1024, dc42: false },
] as const;

export function createImage(name: string, bytes: number, dc42: boolean): OpenedImage {
  const volume = blankVolume(sanitizeHfsName(name, 27), bytes);
  const raw = writeHfs(volume, bytes);
  const file = dc42 ? makeDc42(volume.name, raw) : raw;
  const fileName = `${volume.name}.${dc42 ? "image" : "dsk"}`;
  return openImage(file, fileName);
}

// ───────────── Tree editing helpers ─────────────

export function uniqueName(folder: MacFolder, wanted: string, except?: MacNode): string {
  const base = sanitizeHfsName(wanted);
  const taken = (n: string) => folder.children.some((c) => c !== except && relString(encodeMacRoman(c.name, 31), encodeMacRoman(n, 31)) === 0);
  if (!taken(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = ` ${i}`;
    const n = sanitizeHfsName(base.slice(0, 31 - suffix.length) + suffix);
    if (!taken(n)) return n;
  }
}

export function addNode(folder: MacFolder, node: MacNode) {
  node.name = uniqueName(folder, node.name);
  folder.children.push(node);
  sortTree(folder);
}

export function removeNode(folder: MacFolder, node: MacNode) {
  folder.children = folder.children.filter((c) => c !== node);
}

export function renameNode(folder: MacFolder, node: MacNode, name: string) {
  node.name = uniqueName(folder, name, node);
  sortTree(folder);
}

export function findPath(root: MacFolder, path: number[]): MacFolder {
  let cur = root;
  for (const id of path) {
    const next = cur.children.find((c): c is MacFolder => c.kind === "folder" && c.id === id);
    if (!next) break;
    cur = next;
  }
  return cur;
}

export function addFolder(parent: MacFolder, name: string): MacFolder {
  const f = newFolder(name);
  addNode(parent, f);
  return f;
}

// ───────────── Host <-> Mac file conversion ─────────────

const EXT_TYPES: Record<string, [string, string]> = {
  txt: ["TEXT", "ttxt"], md: ["TEXT", "ttxt"], c: ["TEXT", "MPS "], h: ["TEXT", "MPS "], r: ["TEXT", "MPS "],
  p: ["TEXT", "MPS "], pas: ["TEXT", "MPS "], s: ["TEXT", "MPS "], a: ["TEXT", "MPS "],
  sit: ["SIT!", "SIT!"], sea: ["APPL", "aust"], cpt: ["PACT", "CPCT"], hqx: ["TEXT", "SITx"],
  zip: ["ZIP ", "SITx"], gif: ["GIFf", "ogle"], jpg: ["JPEG", "ogle"], jpeg: ["JPEG", "ogle"],
  pict: ["PICT", "ttxt"], pct: ["PICT", "ttxt"], png: ["PNGf", "ogle"], mp3: ["MPG3", "TVOD"],
  mov: ["MooV", "TVOD"], aiff: ["AIFF", "TVOD"], aif: ["AIFF", "TVOD"], wav: ["WAVE", "TVOD"],
  pdf: ["PDF ", "CARO"], html: ["TEXT", "MOSS"], htm: ["TEXT", "MOSS"], rtf: ["TEXT", "MSWD"],
  dsk: ["dImg", "dCpy"], img: ["dImg", "dCpy"], image: ["dImg", "dCpy"], toast: ["CDr3", "Bmgr"], iso: ["CDr3", "Bmgr"],
  bin: ["BINA", "????"], rsrc: ["rsrc", "RSED"],
};

export interface ImportResult { file: MacFile; detected: "macbinary" | "binhex" | "plain" }

/** Turn a file from the PC into a Mac file, unwrapping MacBinary / BinHex when present. */
export function importHostFile(name: string, data: Uint8Array, opts: { convertText?: boolean } = {}): ImportResult {
  if (isMacBinary(data)) return { file: decodeMacBinary(data), detected: "macbinary" };
  if (/\.hqx$/i.test(name) || isBinHex(data)) {
    try { return { file: decodeBinHex(data), detected: "binhex" }; } catch (e) { if (/\.hqx$/i.test(name)) throw e; }
  }
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const [type, creator] = EXT_TYPES[ext] ?? ["????", "????"];
  let body = data;
  if (opts.convertText && type === "TEXT") body = toMacText(data);
  return { file: newFile(sanitizeHfsName(name), { type, creator, data: body }), detected: "plain" };
}

/** UTF-8 + CRLF/LF → MacRoman + CR, so SimpleText/TeachText show it correctly. */
export function toMacText(utf8: Uint8Array): Uint8Array {
  const s = new TextDecoder().decode(utf8).replace(/\r\n?|\n/g, "\r");
  return encodeMacRoman(s);
}

export function exportForHost(f: MacFile, mode: "macbinary" | "data" | "auto"): { name: string; data: Uint8Array } {
  if (mode === "data" || (mode === "auto" && f.rsrc.length === 0)) return { name: f.name, data: f.data };
  return { name: `${f.name}.bin`, data: encodeMacBinary(f) };
}

export { HfsError, type HfsVolume, type MacFile, type MacFolder, type MacNode };
