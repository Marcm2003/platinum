import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};
const entries = [
  { entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" },
  { entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs" },
];

if (watch) {
  for (const e of entries) await (await context({ ...common, ...e })).watch();
} else {
  await Promise.all(entries.map((e) => build({ ...common, ...e })));
}
