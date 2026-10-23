// Dev runner: Vite dev server + esbuild watch for the main process + Electron.
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import electronPath from "electron";

const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const url = server.resolvedUrls.local[0];

const opts = { bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron", "@serialport/bindings-cpp"], sourcemap: "inline" };
await build({ ...opts, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" });
await build({ ...opts, entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs" });

// Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would start Electron as plain Node.
const env = { ...process.env, PLATINUM_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electronPath, ["."], { stdio: "inherit", env });
app.on("exit", (code) => { server.close(); process.exit(code ?? 0); });
