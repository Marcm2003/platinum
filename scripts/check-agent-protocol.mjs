// Cross-checks the Mac agent's protocol core (mac-agent/src/protocol.c) against the app's
// TypeScript (src/lib/link/agent.ts): CRC, frame encoding, PackBits and stream decoding.
// Builds mac-agent/test/host_test.c with the host C compiler (cc/gcc/clang), or inside the
// Retro68 Docker image when there's no local compiler. Skips if neither is available.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const sources = ["mac-agent/test/host_test.c", "mac-agent/src/protocol.c"];
const has = (cmd, args = ["--version"]) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;

let run;
const cc = ["cc", "gcc", "clang"].find((c) => has(c));
if (cc) {
  mkdirSync("node_modules/.cache", { recursive: true });
  const exe = resolve("node_modules/.cache/host_test" + (process.platform === "win32" ? ".exe" : ""));
  execFileSync(cc, ["-std=c99", "-O2", "-Wall", "-o", exe, ...sources], { stdio: "inherit" });
  run = (args, input) => execFileSync(exe, args, { input, maxBuffer: 1 << 26 }).toString();
} else if (has("docker", ["image", "inspect", "ghcr.io/autc04/retro68:latest"])) {
  const mount = `${resolve("mac-agent")}:/src`;
  run = (args, input) => execFileSync("docker", ["run", "--rm", "-i", "-v", mount, "-w", "/src", "ghcr.io/autc04/retro68:latest", "sh", "-c",
    `gcc -std=c99 -O2 -o /tmp/t test/host_test.c src/protocol.c && /tmp/t ${args.join(" ")}`], { input, maxBuffer: 1 << 26, env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).toString().replace(/^[^{]*/, ""); // the image prints a banner first
} else {
  console.log("  --  agent protocol: skipped (no C compiler or Retro68 Docker image)");
  process.exit(0);
}

await build({
  stdin: { contents: 'export { encodeFrame, FrameDecoder, unpackBits } from "./src/lib/link/agent"; export { crc16 } from "./src/lib/hfs/bytes";', resolveDir: ".", loader: "ts" },
  bundle: true, platform: "node", format: "esm", outfile: "node_modules/.cache/agent-protocol.mjs", logLevel: "warning",
});
const { encodeFrame, FrameDecoder, unpackBits, crc16 } = await import(new URL("../node_modules/.cache/agent-protocol.mjs", import.meta.url).href);

const fromHex = (h) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
const toHex = (b) => Buffer.from(b).toString("hex");
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "  ok " : "  FAIL"} agent protocol: ${msg}`); if (!ok) failures++; };

const v = JSON.parse(run(["vectors"]));
check(v.crc === 0x31c3 && crc16(new TextEncoder().encode("123456789")) === v.crc, "CRC-16/XMODEM matches (0x31C3)");
check(v.frames.every((f) => toHex(encodeFrame(f.type, f.seq, fromHex(f.payload))) === f.frame), `${v.frames.length} frames encode identically`);
check(v.packbits.every((p) => toHex(unpackBits(fromHex(p.packed), p.src.length / 2)) === p.src), `${v.packbits.length} PackBits rows decode in the app`);

// App → agent: garbage, frames up to the size limit, a corrupted frame, then one more.
const sent = [[0x01, 1, new Uint8Array(0)], [0x21, 2, new Uint8Array(512).map((_, i) => i)], [0xb1, 3, new Uint8Array(8192).fill(7)], [0x02, 4, new Uint8Array([9])]];
const corrupt = encodeFrame(0x40, 9, new Uint8Array([1, 2, 3]));
corrupt[7] ^= 0xff;
const stream = Buffer.concat([Buffer.from([0x00, 0xa5, 0x13]), ...sent.slice(0, 3).map(([t, s, p]) => encodeFrame(t, s, p)), corrupt, encodeFrame(...sent[3])]);
const got = JSON.parse(run(["decode"], stream));
check(got.frames.length === sent.length && got.frames.every((f, i) => f.type === sent[i][0] && f.seq === sent[i][1] && f.payload === toHex(sent[i][2])) && got.bad >= 1,
  `agent decodes ${sent.length} app frames and rejects the corrupted one`);

// Agent → app: the app's decoder reads every frame the agent encoded.
const seen = [];
const dec = new FrameDecoder((f) => seen.push(f));
for (const f of v.frames) dec.push(fromHex(f.frame));
check(seen.length === v.frames.length && seen.every((f, i) => toHex(f.payload) === v.frames[i].payload), "app decodes every agent frame");

process.exit(failures ? 1 : 0);
