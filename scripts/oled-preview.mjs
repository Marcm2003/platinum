// Renders the bridge's OLED screens on this computer (no board needed) into docs/images/oled/:
// a PNG per screen and an animated GIF of the tour, for both the 72×40 and 128×64 displays.
//   node scripts/oled-preview.mjs
// Builds firmware/tools/oled-preview with the host C compiler, or inside the Retro68 Docker image
// when there's none; needs the U8g2 Arduino library and Python with Pillow for the images.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const u8g2 = [join(homedir(), "Documents", "Arduino", "libraries", "U8g2", "src"), join(homedir(), "Arduino", "libraries", "U8g2", "src")].find(existsSync);
if (!u8g2) throw new Error('U8g2 not found: arduino-cli lib install "U8g2"');

const work = resolve("node_modules/.cache/oled-preview");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
const sizes = ["72x40", "128x64"];
const build = "g++ -std=c++17 -O1 -w -I \"$U8G2/clib\" -o /tmp/preview firmware/tools/oled-preview/preview.cpp firmware/platinum-bridge/screens.cpp -x c \"$U8G2\"/clib/*.c";
const runAll = sizes.map((s) => `mkdir -p "$OUT/${s}" && /tmp/preview "$OUT/${s}" ${s}`).join(" && ");

if (has("g++")) {
  execFileSync("sh", ["-c", `${build} && ${runAll}`], { stdio: "inherit", env: { ...process.env, U8G2: u8g2, OUT: work } });
} else if (has("docker")) {
  execFileSync("docker", ["run", "--rm", "-v", `${resolve(".")}:/src`, "-v", `${u8g2}:/u8g2`, "-v", `${work}:/out`, "-w", "/src", "-e", "U8G2=/u8g2", "-e", "OUT=/out",
    "ghcr.io/autc04/retro68:latest", "sh", "-c", `${build} && ${runAll}`], { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
} else {
  throw new Error("Needs g++ or Docker.");
}

execFileSync("python", ["scripts/oled-frames.py", work, "docs/images/oled", ...sizes], { stdio: "inherit" });
