// Cross-validation of the HFS reader/writer against machfs (Python).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openImage, saveImage, createImage, addNode, addFolder, newFile, type MacFolder, decodeMacBinary, encodeMacBinary } from "../src/lib/hfs";
import { decodeMacRoman, encodeMacRoman, relString } from "../src/lib/hfs/macroman";
import { u16, u32 } from "../src/lib/hfs/bytes";

/** Look up every leaf key by descending from the root through index nodes, like the File Manager does. */
function verifyCatalogIndex(image: Uint8Array): string | null {
  const m = image.subarray(1024);
  const blk = u32(m, 20), alSt = u16(m, 28);
  const cat = image.subarray(alSt * 512 + u16(m, 150) * blk, alSt * 512 + u16(m, 150) * blk + u32(m, 146));
  const node = (n: number) => cat.subarray(n * 512, n * 512 + 512);
  const recs = (b: Uint8Array) => Array.from({ length: u16(b, 10) }, (_, i) => b.subarray(u16(b, 510 - 2 * i), u16(b, 508 - 2 * i)));
  const cmp = (a: Uint8Array, b: Uint8Array) => (u32(a, 2) - u32(b, 2)) || relString(a.subarray(7, 7 + a[6]), b.subarray(7, 7 + b[6]));
  const hdr = node(0).subarray(14);
  const root = u32(hdr, 2);
  const leaves: Uint8Array[] = [];
  for (let n = u32(hdr, 10); n; n = u32(node(n), 0)) leaves.push(...recs(node(n)));
  for (let i = 1; i < leaves.length; i++) if (cmp(leaves[i - 1], leaves[i]) >= 0) return `leaf order broken at ${i}`;
  for (const key of leaves) {
    let n = root;
    for (let depth = 0; ; depth++) {
      const b = node(n);
      if (b[8] === 0xff) { if (!recs(b).some((r) => cmp(r, key) === 0)) return `key not found via index (node ${n})`; break; }
      if (b[8] !== 0 || depth > 10) return `unexpected node type ${b[8]} at ${n}`;
      const rs = recs(b);
      let pick = rs[0];
      for (const r of rs) if (cmp(r, key) <= 0) pick = r;
      n = u32(pick, 38);
    }
  }
  return null;
}

const dir = mkdtempSync(join(tmpdir(), "platinum-hfs-"));
const py = (...args: string[]) => execFileSync("python", ["tests/hfs_ref.py", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest("hex");
let failures = 0;
const check = (cond: boolean, msg: string) => { console.log(`${cond ? "  ok " : "  FAIL"} ${msg}`); if (!cond) failures++; };

function listing(root: MacFolder, prefix: string[] = [], out: Record<string, unknown> = {}) {
  for (const c of root.children) {
    const p = [...prefix, c.name];
    if (c.kind === "folder") { out[p.join(":") + ":"] = "dir"; listing(c, p, out); }
    else out[p.join(":")] = [c.type, c.creator, sha1(c.data), sha1(c.rsrc)];
  }
  return out;
}
// machfs hides the Desktop files it creates, so leave it out of comparisons.
const norm = (x: Record<string, unknown>) => JSON.stringify(Object.entries(x).filter(([k]) => !["Desktop", "Desktop DB", "Desktop DF"].includes(k)).sort());
const same = (a: Record<string, unknown>, b: Record<string, unknown>) => norm(a) === norm(b);

// MacRoman table sanity
const roman = new Uint8Array(256).map((_, i) => i);
check(decodeMacRoman(roman).length === 256, "MacRoman table has 256 entries");
check(sha1(encodeMacRoman(decodeMacRoman(roman))) === sha1(roman), "MacRoman round-trips all 256 bytes");

for (const [label, size, n] of [["800K floppy", 800 * 1024, 40], ["20 MB, many files (index nodes)", 20 << 20, 1500], ["700 MB (map nodes)", 700 << 20, 9000]] as const) {
  console.log(`\n▸ ${label}`);
  const ref = join(dir, "ref.img");
  py("make", ref, String(size), String(n));
  const img = openImage(new Uint8Array(readFileSync(ref)), "ref.img");
  const expected = JSON.parse(py("dump", ref));
  check(img.volume.name === "Ref Disk", `volume name "${img.volume.name}"`);
  check(same(listing(img.volume.root), expected.items), `reader matches machfs (${Object.keys(expected.items).length} items)`);

  // Edit, write with our writer, read back with machfs.
  const extra = newFile("Afegit des del PC", { type: "TEXT", creator: "ttxt", data: encodeMacRoman("Hola Mac!\r") });
  addNode(img.volume.root, extra);
  const sub = addFolder(img.volume.root, "Carpeta nova");
  addNode(sub, newFile("Amb recurs", { type: "APPL", creator: "PLAT", data: new Uint8Array(3000).fill(7), rsrc: new Uint8Array(70000).fill(9) }));
  const out = join(dir, "ours.img");
  const t0 = performance.now();
  const saved = saveImage(img);
  writeFileSync(out, saved);
  const idxErr = verifyCatalogIndex(saved);
  check(idxErr === null, `catalog index search finds every key${idxErr ? ": " + idxErr : ""}`);
  console.log(`    write took ${(performance.now() - t0).toFixed(0)} ms`);
  const back = JSON.parse(py("dump", out));
  check(same(listing(img.volume.root), back.items), `machfs reads our volume (${Object.keys(back.items).length} items)`);
  const again = openImage(new Uint8Array(readFileSync(out)), "ours.img");
  check(same(listing(again.volume.root), back.items), "our reader reads our volume");
}

console.log("\n▸ blank images + MacBinary");
const blank = createImage("Disc Buit", 1440 * 1024, true);
check(blank.container.kind === "dc42" && blank.volume.root.children.length === 0, "new 1.44 MB DiskCopy image");
const f = newFile("Prova", { type: "APPL", creator: "abcd", data: new Uint8Array([1, 2, 3]), rsrc: new Uint8Array([4, 5]) });
const mb = decodeMacBinary(encodeMacBinary(f));
check(mb.name === "Prova" && mb.type === "APPL" && mb.creator === "abcd" && sha1(mb.rsrc) === sha1(f.rsrc), "MacBinary round-trip");

console.log(failures ? `\n${failures} FAILED` : "\nAll HFS tests passed");
process.exit(failures ? 1 : 0);
