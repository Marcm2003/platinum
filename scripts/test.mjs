import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({ entryPoints: ["tests/hfs.test.ts"], bundle: true, platform: "node", format: "esm", outfile: "node_modules/.cache/hfs.test.mjs", logLevel: "warning" });
const run = (args) => spawnSync(process.execPath, args, { stdio: "inherit" }).status ?? 1;
process.exit(run(["node_modules/.cache/hfs.test.mjs"]) || run(["scripts/check-i18n.mjs"]));
