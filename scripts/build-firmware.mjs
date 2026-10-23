// Compiles the bridge firmware for every board in src/lib/hardware/boards.ts and writes one
// ready-to-flash image per board to firmware/dist/platinum-bridge-<board>.bin (bootloader,
// partitions and app merged, flash at 0x0).
//   node scripts/build-firmware.mjs            all boards
//   node scripts/build-firmware.mjs esp32c3-oled
// Needs arduino-cli with the esp32:esp32 core and NimBLE-Arduino, WebSockets, ArduinoJson, U8g2.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

await build({
  stdin: { contents: 'export { BOARDS } from "./src/lib/hardware/boards";', resolveDir: ".", loader: "ts" },
  bundle: true, platform: "node", format: "esm", outfile: "node_modules/.cache/boards.mjs", logLevel: "warning",
});
const { BOARDS } = await import(new URL("../node_modules/.cache/boards.mjs", import.meta.url).href);

const only = process.argv.slice(2);
const boards = only.length ? BOARDS.filter((b) => only.includes(b.id)) : BOARDS;
if (!boards.length) throw new Error(`Unknown board. Choose from: ${BOARDS.map((b) => b.id).join(", ")}`);

mkdirSync("firmware/dist", { recursive: true });
for (const b of boards) {
  // --export-binaries writes to firmware/platinum-bridge/build/<vendor.arch.board>/. (With --output-dir,
  // the core's Windows post-build hook fails because it copies into that folder anyway.)
  const out = resolve("firmware/platinum-bridge/build", b.fqbn.split(":").slice(0, 3).join("."));
  console.log(`\n▸ ${b.name} (${b.fqbn}${b.define ? `, ${b.define}` : ""})`);
  execFileSync("arduino-cli", [
    "compile", "--fqbn", b.fqbn, "--export-binaries",
    ...(b.define ? ["--build-property", `compiler.cpp.extra_flags=-D${b.define}`] : []),
    "firmware/platinum-bridge",
  ], { stdio: "inherit" });
  const merged = readdirSync(out).find((f) => f.endsWith(".merged.bin"));
  if (!merged) throw new Error(`No merged image for ${b.id}`);
  copyFileSync(join(out, merged), `firmware/dist/platinum-bridge-${b.id}.bin`);
  console.log(`  → firmware/dist/platinum-bridge-${b.id}.bin`);
}
