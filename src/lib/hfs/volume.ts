// HFS (Mac OS Standard) volume reader and writer.
//
// Reading walks the catalog B*-tree leaves and resolves every fork through the
// extents overflow tree. Writing rebuilds a fresh, defragmented volume from the
// in-memory tree (the approach machfs uses), preserving CNIDs, Finder info and
// boot blocks so System Folders stay blessed and the disk stays bootable.

import { concat, macNow, roundUp, u16, u32, w16, w32, fourCC, wFourCC } from "./bytes";
import { decodeMacRoman, encodeMacRoman, relString } from "./macroman";
import { t } from "@/i18n";

export interface MacFile {
  kind: "file";
  id: number;
  name: string;
  type: string;
  creator: string;
  /** FInfo (16 bytes): fdType, fdCreator, fdFlags, fdLocation, fdFldr. Type/creator are kept in sync on write. */
  finderInfo: Uint8Array;
  /** FXInfo (16 bytes). */
  extFinderInfo: Uint8Array;
  locked: boolean;
  data: Uint8Array;
  rsrc: Uint8Array;
  created: number;
  modified: number;
}

export interface MacFolder {
  kind: "folder";
  id: number;
  name: string;
  /** DInfo (16 bytes) and DXInfo (16 bytes). */
  finderInfo: Uint8Array;
  extFinderInfo: Uint8Array;
  children: MacNode[];
  created: number;
  modified: number;
}

export type MacNode = MacFile | MacFolder;

export interface HfsVolume {
  name: string;
  created: number;
  modified: number;
  root: MacFolder;
  bootBlocks: Uint8Array;
  /** drFndrInfo: [0] blessed System Folder CNID, [1] startup app folder, [2] open folder… */
  finderInfo: Uint8Array;
  nextId: number;
  /** Size in bytes of the HFS volume itself (excluding container headers / partition map). */
  size: number;
}

export class HfsError extends Error {}

const ROOT_PARENT = 1, ROOT_ID = 2, EXTENTS_ID = 3, CATALOG_ID = 4;
const FIRST_USER_ID = 16;
const NODE = 512;

// ───────────────────────────── Reading ─────────────────────────────

interface Extent { start: number; count: number }

const readExtents = (b: Uint8Array, o: number): Extent[] =>
  [0, 4, 8].map((k) => ({ start: u16(b, o + k), count: u16(b, o + k + 2) })).filter((e) => e.count > 0);

export function isHfs(vol: Uint8Array): boolean {
  return vol.length >= 1536 && u16(vol, 1024) === 0x4244;
}

export function isHfsPlus(vol: Uint8Array): boolean {
  if (vol.length < 1536) return false;
  const sig = u16(vol, 1024);
  return sig === 0x482b || sig === 0x4858 || (sig === 0x4244 && u16(vol, 1024 + 124) === 0x482b);
}

export function readHfs(vol: Uint8Array): HfsVolume {
  if (isHfsPlus(vol)) throw new HfsError(t("This volume is HFS+ (Mac OS Extended). Only HFS (Mac OS Standard) is supported for now."));
  if (!isHfs(vol)) throw new HfsError(t("No HFS volume found (the 'BD' signature is missing)."));

  const m = vol.subarray(1024, 1024 + 162);
  const alBlkSiz = u32(m, 20);
  const alBlSt = u16(m, 28);
  const blockOffset = (n: number) => alBlSt * 512 + n * alBlkSiz;

  // Extents overflow: key (fork, fileID) -> list of { fabn, extents }
  const overflow = new Map<string, { fabn: number; ext: Extent[] }[]>();

  const readFork = (fileId: number, fork: 0 | 0xff, first: Extent[], logical: number): Uint8Array => {
    if (logical === 0) return new Uint8Array(0);
    const out = new Uint8Array(logical);
    let pos = 0;
    const take = (exts: Extent[]) => {
      for (const e of exts) {
        if (pos >= logical) return;
        const off = blockOffset(e.start);
        const len = Math.min(e.count * alBlkSiz, logical - pos);
        if (off + len > vol.length) throw new HfsError(t("Extent outside the volume (file {id}).", { id: fileId }));
        out.set(vol.subarray(off, off + len), pos);
        pos += len;
      }
    };
    take(first);
    const more = overflow.get(`${fork}:${fileId}`);
    if (more) for (const r of more.sort((a, b) => a.fabn - b.fabn)) take(r.ext);
    if (pos < logical) throw new HfsError(t("File {id} is truncated: extents are missing.", { id: fileId }));
    return out;
  };

  // Extents overflow tree first (it can't overflow into itself).
  const xt = readFork(EXTENTS_ID, 0, readExtents(m, 134), u32(m, 130));
  for (const rec of walkLeaves(xt)) {
    const keyLen = rec[0];
    const fork = rec[1] as 0 | 0xff;
    const fileId = u32(rec, 2);
    const fabn = u16(rec, 6);
    const ext = readExtents(rec, 1 + keyLen + ((1 + keyLen) & 1));
    const k = `${fork}:${fileId}`;
    if (!overflow.has(k)) overflow.set(k, []);
    overflow.get(k)!.push({ fabn, ext });
  }

  const cat = readFork(CATALOG_ID, 0, readExtents(m, 150), u32(m, 146));

  const folders = new Map<number, MacFolder>();
  const parentOf = new Map<MacNode, number>();
  let maxId = FIRST_USER_ID;

  for (const rec of walkLeaves(cat)) {
    const keyLen = rec[0];
    const parentId = u32(rec, 2);
    const nameLen = rec[6];
    const name = decodeMacRoman(rec.subarray(7, 7 + Math.min(nameLen, 31)));
    const d = rec.subarray(roundUp(1 + keyLen, 2));
    const type = d[0];
    if (type === 1) {
      const id = u32(d, 6);
      const f: MacFolder = {
        kind: "folder", id, name, children: [],
        created: u32(d, 10), modified: u32(d, 14),
        finderInfo: d.slice(22, 38), extFinderInfo: d.slice(38, 54),
      };
      folders.set(id, f);
      parentOf.set(f, parentId);
      maxId = Math.max(maxId, id);
    } else if (type === 2) {
      const id = u32(d, 20);
      const f: MacFile = {
        kind: "file", id, name,
        locked: (d[2] & 1) !== 0,
        type: fourCC(d, 4), creator: fourCC(d, 8),
        finderInfo: d.slice(4, 20), extFinderInfo: d.slice(56, 72),
        created: u32(d, 44), modified: u32(d, 48),
        data: readFork(id, 0, readExtents(d, 74), u32(d, 26)),
        rsrc: readFork(id, 0xff, readExtents(d, 86), u32(d, 36)),
      };
      parentOf.set(f, parentId);
      maxId = Math.max(maxId, id);
    }
    // 3/4 = thread records: implied by the tree, regenerated on write.
  }

  const root = folders.get(ROOT_ID);
  if (!root) throw new HfsError(t("The catalog has no root folder."));
  for (const [node, parentId] of parentOf) {
    if (node === root) continue;
    const parent = folders.get(parentId);
    if (parent) parent.children.push(node);
  }
  sortTree(root);

  return {
    name: decodeMacRoman(m.subarray(37, 37 + Math.min(m[36], 27))),
    created: u32(m, 2),
    modified: u32(m, 6),
    root,
    bootBlocks: vol.slice(0, 1024),
    finderInfo: m.slice(92, 124),
    nextId: Math.max(u32(m, 30), maxId + 1),
    size: vol.length,
  };
}

/** Iterate leaf records of a B*-tree file by following the leaf chain. */
function* walkLeaves(tree: Uint8Array): Generator<Uint8Array> {
  if (tree.length < NODE) return;
  const hdr = tree.subarray(14);
  let node = u32(hdr, 10); // bthFNode
  const last = u32(hdr, 14);
  const nNodes = u32(hdr, 22);
  if (u32(hdr, 6) === 0) return; // no records
  for (let guard = 0; node !== 0 && guard <= nNodes; guard++) {
    const base = node * NODE;
    if (base + NODE > tree.length) throw new HfsError(t("B-tree node out of range."));
    const n = tree.subarray(base, base + NODE);
    const count = u16(n, 10);
    for (let i = 0; i < count; i++) {
      const start = u16(n, NODE - 2 * (i + 1));
      const end = u16(n, NODE - 2 * (i + 2));
      yield n.subarray(start, end);
    }
    if (node === last) return;
    node = u32(n, 0);
  }
}

export function sortTree(folder: MacFolder) {
  folder.children.sort((a, b) => relString(encodeMacRoman(a.name, 31), encodeMacRoman(b.name, 31)));
  for (const c of folder.children) if (c.kind === "folder") sortTree(c);
}

// ───────────────────────────── Writing ─────────────────────────────

interface CatRecord { key: Uint8Array; value: Uint8Array; parent: number; name: Uint8Array }

/** Leaf key: keyLength, reserved, parentID, Str31 name — padded to even length. */
function leafKey(parent: number, name: Uint8Array): Uint8Array {
  const k = new Uint8Array(roundUp(7 + name.length, 2));
  k[0] = 6 + name.length;
  w32(k, 2, parent);
  k[6] = name.length;
  k.set(name, 7);
  return k;
}

function folderRecord(f: MacFolder, valence: number): Uint8Array {
  const d = new Uint8Array(70);
  d[0] = 1;
  w16(d, 4, Math.min(valence, 0xffff));
  w32(d, 6, f.id);
  w32(d, 10, f.created);
  w32(d, 14, f.modified);
  d.set(f.finderInfo.subarray(0, 16), 22);
  d.set(f.extFinderInfo.subarray(0, 16), 38);
  return d;
}

function threadRecord(type: 3 | 4, parent: number, name: Uint8Array): Uint8Array {
  const d = new Uint8Array(46);
  d[0] = type;
  w32(d, 10, parent);
  d[14] = name.length;
  d.set(name, 15);
  return d;
}

interface ForkAlloc { start: number; blocks: number }

function fileRecord(f: MacFile, data: ForkAlloc, rsrc: ForkAlloc, blk: number): Uint8Array {
  const d = new Uint8Array(102);
  d[0] = 2;
  d[2] = f.locked ? 1 : 0;
  const fi = f.finderInfo.slice(0, 16);
  wFourCC(fi, 0, f.type);
  wFourCC(fi, 4, f.creator);
  d.set(fi, 4);
  w32(d, 20, f.id);
  w32(d, 26, f.data.length);
  w32(d, 30, data.blocks * blk);
  w32(d, 36, f.rsrc.length);
  w32(d, 40, rsrc.blocks * blk);
  w32(d, 44, f.created);
  w32(d, 48, f.modified);
  d.set(f.extFinderInfo.subarray(0, 16), 56);
  if (data.blocks) { w16(d, 74, data.start); w16(d, 76, data.blocks); }
  if (rsrc.blocks) { w16(d, 86, rsrc.start); w16(d, 88, rsrc.blocks); }
  return d;
}

function compareRecords(a: CatRecord, b: CatRecord): number {
  return a.parent - b.parent || relString(a.name, b.name);
}

/**
 * Serialise a B*-tree of the given node capacity. Records must already be sorted.
 * Returns the tree bytes (exactly nNodes * 512).
 */
export function buildBTree(records: { key: Uint8Array; value: Uint8Array }[], maxKeyLen: number, nNodes: number): Uint8Array {
  type Node = { type: number; height: number; recs: Uint8Array[]; flink: number; blink: number };
  const nodes: Node[] = [{ type: 1, height: 0, recs: [], flink: 0, blink: 0 }];
  const fits = (recs: Uint8Array[]) => 14 + recs.reduce((s, r) => s + r.length, 0) + 2 * (recs.length + 1) <= NODE;

  // Leaves
  const leafStart = nodes.length;
  for (const { key, value } of records) {
    const rec = concat([key, value.length & 1 ? concat([value, new Uint8Array(1)]) : value]);
    const cur = nodes.length > leafStart ? nodes[nodes.length - 1] : null;
    if (cur && fits([...cur.recs, rec])) cur.recs.push(rec);
    else nodes.push({ type: 0xff, height: 1, recs: [rec], flink: 0, blink: 0 });
  }

  // Index levels: one pointer record per child, key padded to maxKeyLen.
  let levelStart = leafStart, levelEnd = nodes.length, height = 1, root = nodes.length > leafStart ? leafStart : 0;
  while (levelEnd - levelStart > 1) {
    height++;
    const next = nodes.length;
    for (let i = levelStart; i < levelEnd; i++) {
      const first = nodes[i].recs[0];
      const idx = new Uint8Array(1 + maxKeyLen + 4);
      idx.set(first.subarray(1, 1 + first[0]), 1);
      idx[0] = maxKeyLen;
      w32(idx, 1 + maxKeyLen, i);
      const cur = nodes.length > next ? nodes[nodes.length - 1] : null;
      if (cur && fits([...cur.recs, idx])) cur.recs.push(idx);
      else nodes.push({ type: 0, height, recs: [idx], flink: 0, blink: 0 });
    }
    levelStart = next; levelEnd = nodes.length; root = next;
  }

  // Map nodes when the header's 2048-bit map isn't enough.
  const mapBitsPerNode = (NODE - 14 - 4) * 8;
  const mapNodes: number[] = [];
  for (let covered = 2048; covered < nNodes; covered += mapBitsPerNode) {
    mapNodes.push(nodes.length);
    nodes.push({ type: 2, height: 1, recs: [], flink: 0, blink: 0 });
  }
  if (nodes.length > nNodes) throw new HfsError(t("The catalog needs {need} nodes but only has {have}.", { need: nodes.length, have: nNodes }));

  // Sibling links per level.
  const byLevel = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (i === 0) return;
    const k = `${n.type}:${n.height}`;
    if (!byLevel.has(k)) byLevel.set(k, []);
    byLevel.get(k)!.push(i);
  });
  for (const ids of byLevel.values()) ids.forEach((id, j) => {
    nodes[id].blink = j > 0 ? ids[j - 1] : 0;
    nodes[id].flink = j < ids.length - 1 ? ids[j + 1] : 0;
  });
  nodes[0].flink = mapNodes[0] ?? 0;

  const used = nodes.length;
  const bitmap = (bits: number, from: number) => {
    const b = new Uint8Array(bits / 8);
    for (let i = 0; i < bits; i++) if (from + i < used) b[i >> 3] |= 0x80 >> (i & 7);
    return b;
  };

  const leaves = byLevel.get("255:1") ?? [];
  const header = new Uint8Array(106);
  w16(header, 0, leaves.length ? height : 0);
  w32(header, 2, root);
  w32(header, 6, records.length);
  w32(header, 10, leaves[0] ?? 0);
  w32(header, 14, leaves[leaves.length - 1] ?? 0);
  w16(header, 18, NODE);
  w16(header, 20, maxKeyLen);
  w32(header, 22, nNodes);
  w32(header, 26, nNodes - used);
  nodes[0].recs = [header, new Uint8Array(128), bitmap(2048, 0)];
  mapNodes.forEach((id, j) => { nodes[id].recs = [bitmap(mapBitsPerNode, 2048 + j * mapBitsPerNode)]; });

  const out = new Uint8Array(nNodes * NODE);
  nodes.forEach((n, i) => {
    const b = out.subarray(i * NODE, (i + 1) * NODE);
    w32(b, 0, n.flink); w32(b, 4, n.blink);
    b[8] = n.type; b[9] = n.height; w16(b, 10, n.recs.length);
    let off = 14;
    n.recs.forEach((r, j) => { w16(b, NODE - 2 * (j + 1), off); b.set(r, off); off += r.length; });
    w16(b, NODE - 2 * (n.recs.length + 1), off);
  });
  return out;
}

/** Count leaf+index nodes a record set needs (header excluded). */
function estimateNodes(records: { key: Uint8Array; value: Uint8Array }[]): number {
  let leaves = 0, used = NODE;
  for (const r of records) {
    const size = r.key.length + roundUp(r.value.length, 2) + 2;
    if (used + size > NODE - 16) { leaves++; used = 0; }
    used += size;
  }
  let total = leaves, level = leaves;
  while (level > 1) { level = Math.ceil(level / 11); total += level; }
  return total;
}

export interface VolumeLayout { allocBlockSize: number; allocBlocks: number; bitmapSectors: number; firstAllocSector: number }

export function planLayout(sizeBytes: number): VolumeLayout {
  const sectors = Math.floor(sizeBytes / 512);
  if (sectors < 800) throw new HfsError(t("An HFS volume must be at least 400 KB."));
  const allocBlockSize = (Math.floor((sectors - 5) / 65536) + 1) * 512;
  const spb = allocBlockSize / 512;
  let bitmapSectors = 1;
  for (;;) {
    const blocks = Math.floor((sectors - 5 - bitmapSectors) / spb);
    const need = Math.ceil(Math.min(blocks, 65535) / 4096);
    if (need <= bitmapSectors) {
      return { allocBlockSize, allocBlocks: Math.min(blocks, 65535), bitmapSectors, firstAllocSector: 3 + bitmapSectors };
    }
    bitmapSectors = need;
  }
}

/** Build a complete HFS volume image of exactly `sizeBytes` from the in-memory tree. */
export function writeHfs(v: HfsVolume, sizeBytes = v.size): Uint8Array {
  const L = planLayout(sizeBytes);
  const blk = L.allocBlockSize;
  const img = new Uint8Array(Math.floor(sizeBytes / 512) * 512);
  const now = macNow();

  // Assign IDs to new nodes and collect stats.
  let nextId = Math.max(v.nextId, FIRST_USER_ID);
  const seen = new Set<number>([ROOT_ID]);
  const all: { node: MacNode; parent: number }[] = [];
  const visit = (folder: MacFolder) => {
    for (const c of folder.children) {
      if (!c.id || c.id < FIRST_USER_ID || seen.has(c.id)) c.id = nextId++;
      seen.add(c.id);
      nextId = Math.max(nextId, c.id + 1);
      all.push({ node: c, parent: folder.id });
      if (c.kind === "folder") visit(c);
    }
  };
  v.root.id = ROOT_ID;
  visit(v.root);

  // Allocation: extents tree, catalog, then each fork contiguously.
  const blocksFor = (bytes: number) => Math.ceil(bytes / blk);
  const extNodes = Math.max(4, Math.ceil(Math.min(Math.max(sizeBytes / 1024, 2048), 256 * 1024) / NODE));
  const extBytes = roundUp(extNodes * NODE, blk);

  const volName = encodeMacRoman(v.name, 27);
  const draft: CatRecord[] = [];
  const pushRec = (parent: number, name: Uint8Array, value: Uint8Array) => draft.push({ key: leafKey(parent, name), value, parent, name });

  // Catalog records — file records are filled after allocation, so size with placeholders first.
  const filePlaceholder = new Uint8Array(102);
  pushRec(ROOT_PARENT, volName, folderRecord(v.root, v.root.children.length));
  pushRec(ROOT_ID, new Uint8Array(0), threadRecord(3, ROOT_PARENT, volName));
  for (const { node, parent } of all) {
    const name = encodeMacRoman(node.name, 31);
    if (node.kind === "folder") {
      pushRec(parent, name, folderRecord(node, node.children.length));
      pushRec(node.id, new Uint8Array(0), threadRecord(3, parent, name));
    } else {
      pushRec(parent, name, filePlaceholder);
    }
  }
  draft.sort(compareRecords);
  for (let i = 1; i < draft.length; i++) {
    if (compareRecords(draft[i - 1], draft[i]) === 0) throw new HfsError(t("Two items named “{name}” are in the same folder.", { name: decodeMacRoman(draft[i].name) }));
  }

  const needed = 1 + estimateNodes(draft);
  const slack = Math.max(16, Math.ceil(needed * 0.5));
  const catTarget = Math.max(needed + slack, Math.ceil(Math.min(sizeBytes / 256, 4 * 1024 * 1024) / NODE));
  const catBytes = roundUp(catTarget * NODE, blk);

  let cursor = 0;
  const alloc = (bytes: number): ForkAlloc => {
    const blocks = blocksFor(bytes);
    const a = { start: blocks ? cursor : 0, blocks };
    cursor += blocks;
    if (cursor > L.allocBlocks) throw new HfsError(t("It doesn't fit: more than {mb} MB is needed. Make the disk bigger.", { mb: ((L.allocBlocks * blk) / 1048576).toFixed(1) }));
    return a;
  };
  const extAlloc = alloc(extBytes);
  const catAlloc = alloc(catBytes);
  const blockOffset = (n: number) => L.firstAllocSector * 512 + n * blk;

  const fileAlloc = new Map<MacFile, { data: ForkAlloc; rsrc: ForkAlloc }>();
  for (const { node } of all) {
    if (node.kind !== "file") continue;
    const data = alloc(node.data.length), rsrc = alloc(node.rsrc.length);
    fileAlloc.set(node, { data, rsrc });
    if (data.blocks) img.set(node.data, blockOffset(data.start));
    if (rsrc.blocks) img.set(node.rsrc, blockOffset(rsrc.start));
  }

  // Fill the real file records (same key, same sort order).
  const byKey = new Map<string, MacFile>();
  for (const { node, parent } of all) if (node.kind === "file") byKey.set(`${parent}:${decodeMacRoman(encodeMacRoman(node.name, 31))}`, node);
  for (const r of draft) {
    if (r.value !== filePlaceholder) continue;
    const f = byKey.get(`${r.parent}:${decodeMacRoman(r.name)}`)!;
    const a = fileAlloc.get(f)!;
    r.value = fileRecord(f, a.data, a.rsrc, blk);
  }

  img.set(buildBTree([], 7, extBytes / NODE), blockOffset(extAlloc.start));
  img.set(buildBTree(draft, 37, catBytes / NODE), blockOffset(catAlloc.start));

  // Volume bitmap.
  for (let i = 0; i < cursor; i++) img[3 * 512 + (i >> 3)] |= 0x80 >> (i & 7);

  // Boot blocks.
  img.set(v.bootBlocks.subarray(0, 1024), 0);

  // Master Directory Block.
  const files = all.filter((x) => x.node.kind === "file");
  const folders = all.filter((x) => x.node.kind === "folder");
  const m = new Uint8Array(512);
  w16(m, 0, 0x4244);
  w32(m, 2, v.created || now);
  w32(m, 6, now);
  w16(m, 10, 0x0100); // cleanly unmounted
  w16(m, 12, v.root.children.filter((c) => c.kind === "file").length);
  w16(m, 14, 3);
  w16(m, 16, cursor);
  w16(m, 18, L.allocBlocks);
  w32(m, 20, blk);
  w32(m, 24, blk * 4);
  w16(m, 28, L.firstAllocSector);
  w32(m, 30, nextId);
  w16(m, 34, L.allocBlocks - cursor);
  m[36] = volName.length;
  m.set(volName, 37);
  w32(m, 70, 1);
  w32(m, 74, extBytes);
  w32(m, 78, catBytes);
  w16(m, 82, v.root.children.filter((c) => c.kind === "folder").length);
  w32(m, 84, files.length);
  w32(m, 88, folders.length);
  const fi = v.finderInfo.slice(0, 32);
  // Drop references to folders that no longer exist (e.g. a deleted System Folder).
  const folderIds = new Set([ROOT_ID, ...folders.map((x) => x.node.id)]);
  for (let i = 0; i < 3; i++) if (!folderIds.has(u32(fi, i * 4))) w32(fi, i * 4, 0);
  m.set(fi, 92);
  w32(m, 130, extBytes);
  w16(m, 134, extAlloc.start); w16(m, 136, extAlloc.blocks);
  w32(m, 146, catBytes);
  w16(m, 150, catAlloc.start); w16(m, 152, catAlloc.blocks);

  img.set(m, 1024);
  img.set(m, img.length - 1024); // alternate MDB, second-to-last sector

  v.nextId = nextId;
  return img;
}

// ───────────────────────────── Helpers ─────────────────────────────

export function newFolder(name: string, id = 0): MacFolder {
  const now = macNow();
  return { kind: "folder", id, name, children: [], created: now, modified: now, finderInfo: new Uint8Array(16), extFinderInfo: new Uint8Array(16) };
}

export function newFile(name: string, opts: Partial<MacFile> = {}): MacFile {
  const now = macNow();
  return {
    kind: "file", id: 0, name, type: "TEXT", creator: "ttxt", locked: false,
    finderInfo: new Uint8Array(16), extFinderInfo: new Uint8Array(16),
    data: new Uint8Array(0), rsrc: new Uint8Array(0), created: now, modified: now,
    ...opts,
  };
}

export function blankVolume(name: string, size: number): HfsVolume {
  const now = macNow();
  return {
    name, created: now, modified: now, size,
    root: { ...newFolder(name, ROOT_ID) },
    bootBlocks: new Uint8Array(1024),
    finderInfo: new Uint8Array(32),
    nextId: FIRST_USER_ID,
  };
}

export function blessedFolderId(v: HfsVolume): number { return u32(v.finderInfo, 0); }

export function usedBytes(v: HfsVolume): number {
  let n = 0;
  const walk = (f: MacFolder) => { for (const c of f.children) c.kind === "file" ? (n += c.data.length + c.rsrc.length) : walk(c); };
  walk(v.root);
  return n;
}

export function countNodes(f: MacFolder): { files: number; folders: number } {
  let files = 0, folders = 0;
  for (const c of f.children) {
    if (c.kind === "file") files++;
    else { folders++; const s = countNodes(c); files += s.files; folders += s.folders; }
  }
  return { files, folders };
}

/** Finder flags live in FInfo/DInfo bytes 8..9. */
export const finderFlags = (n: MacNode) => u16(n.finderInfo, 8);
export const isInvisible = (n: MacNode) => (finderFlags(n) & 0x4000) !== 0;
export const hasCustomIcon = (n: MacNode) => (finderFlags(n) & 0x0400) !== 0;
