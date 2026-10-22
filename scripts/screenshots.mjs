// Captures the README screenshots and the emulator boot GIF from the built app.
//   npm run build && npm run screenshots
// Drives Electron over the Chrome DevTools Protocol with a throwaway profile, so your own
// settings are untouched. Needs ffmpeg on the PATH for the GIF.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import electronPath from "electron";

const OUT = "docs/images";
const PORT = 9333;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── A sample disk for Disk Studio, made with the app's own HFS code ──
await build({
  stdin: {
    resolveDir: ".", loader: "ts",
    contents: `
      import { createImage, addFolder, addNode, newFile, saveImage } from "./src/lib/hfs";
      import { encodeMacRoman } from "./src/lib/hfs/macroman";
      export function sampleDisk() {
        const img = createImage("Workbench", 20 * 1024 * 1024, false);
        const root = img.volume.root;
        const text = (s) => encodeMacRoman(s.replace(/\\n/g, "\\r"));
        addNode(root, newFile("Read Me", { type: "TEXT", creator: "ttxt", data: text("Made with Platinum Disk Studio.\\n") }));
        const proj = addFolder(root, "Projects");
        addNode(proj, newFile("Hello World", { type: "APPL", creator: "HELO", data: new Uint8Array(0), rsrc: new Uint8Array(24 * 1024) }));
        addNode(proj, newFile("Hello World.c", { type: "TEXT", creator: "CWIE", data: text("#include <Quickdraw.h>\\n") }));
        const pics = addFolder(root, "Pictures");
        addNode(pics, newFile("Sketch", { type: "PNTG", creator: "MPNT", data: new Uint8Array(51200) }));
        addFolder(root, "Games");
        addFolder(root, "Utilities");
        addNode(root, newFile("Notes", { type: "TEXT", creator: "ttxt", data: text("Things to try on the SE/30.\\n") }));
        return saveImage(img);
      }`,
  },
  bundle: true, platform: "node", format: "esm", outfile: "node_modules/.cache/sample-disk.mjs", logLevel: "warning",
});
const { sampleDisk } = await import(new URL("../node_modules/.cache/sample-disk.mjs", import.meta.url).href);
const diskB64 = Buffer.from(sampleDisk()).toString("base64");

// ── Launch ──
const profile = mkdtempSync(join(tmpdir(), "platinum-shots-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.PLATINUM_DEV_URL;
const app = spawn(electronPath, [".", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--lang=en-US"], { env, stdio: "ignore" });

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page" && t.url.includes("index.html"));
  } catch { /* not up yet */ }
}
if (!target) throw new Error("Platinum didn't start");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let nextId = 1;
const waiting = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const run = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const click = (selector, text) => run(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}));
  if (!el) throw new Error("not found: ${selector} ${text}");
  el.click();
})()`);
const shot = async (name) => {
  await sleep(400);
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
  console.log(`  ${name}`);
};
const go = (label) => click(".nav-item", label);
const theme = async (label) => { await go("Settings"); await click(".seg button", label); await sleep(300); };

try {
  await sleep(2500);
  await theme("Light");

  await go("Home");
  await shot("home.png");

  // Disk Studio with the sample disk dropped in.
  await go("Disk Studio");
  await run(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(diskB64)}), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "Workbench.dsk"));
    const target = document.querySelector(".content:not(.flush) > div");
    for (const type of ["dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  })()`);
  await sleep(800);
  await click(".nav-item", "Projects").catch(() => {});
  await shot("disk-studio.png");

  await go("Hardware & link");
  await shot("hardware.png");

  // Emulator: boot System 7.5.3 and record the boot.
  await go("Emulator");
  await sleep(500);
  const stage = await run(`(() => { const r = document.querySelector(".stage").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  await click(".btn.primary", "Boot");
  // Capture whole frames and crop afterwards: a CDP clip misplaces the <webview>'s contents.
  const frames = join(profile, "frames");
  mkdirSync(frames);
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 14000) {
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(frames, `f${String(n++).padStart(3, "0")}.png`), Buffer.from(data, "base64"));
  }
  const fps = (n / ((Date.now() - t0) / 1000)).toFixed(2);
  await shot("emulator.png");

  await theme("Dark");
  await go("Home");
  await shot("home-dark.png");
  await go("Emulator");
  await shot("emulator-dark.png");

  const crop = `crop=${Math.round(stage.width)}:${Math.round(stage.height)}:${Math.round(stage.x)}:${Math.round(stage.y)}`;
  const gif = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps, "-i", join(frames, "f%03d.png"),
    "-vf", `${crop},fps=8,tpad=stop_mode=clone:stop_duration=2,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    join(OUT, "emulator-boot.gif")], { stdio: "inherit" });
  console.log(gif.status === 0 ? "  emulator-boot.gif" : "  (ffmpeg failed: no GIF)");
} finally {
  ws.close();
  app.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
