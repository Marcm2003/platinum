// Checks every dictionary in src/i18n against every t("…"), tx("…") and N_("…") literal in src/:
// nothing missing, nothing stale, and the same {placeholders} on both sides.
//   node scripts/check-i18n.mjs          → check (exit 1 on problems)
//   node scripts/check-i18n.mjs --keys   → print every key as JSON (to help translating)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !p.includes(join("src", "i18n"))) files.push(p);
  }
})("src");

const keys = new Map();
const call = /\b(?:t|tx|N_)\(\s*"((?:[^"\\]|\\.)*)"/g;
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(call)) {
    const key = JSON.parse(`"${m[1]}"`);
    if (!keys.has(key)) keys.set(key, f);
  }
}

if (process.argv.includes("--keys")) {
  console.log(JSON.stringify([...keys.keys()], null, 2));
  process.exit(0);
}

const langs = readdirSync("src/i18n").filter((f) => f !== "index.ts" && f.endsWith(".ts")).map((f) => f.slice(0, -3));
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const problems = [];
for (const lang of langs) {
  await build({ entryPoints: [`src/i18n/${lang}.ts`], bundle: true, platform: "node", format: "esm", outfile: `node_modules/.cache/i18n-${lang}.mjs`, logLevel: "warning" });
  const dict = (await import(new URL(`../node_modules/.cache/i18n-${lang}.mjs`, import.meta.url).href + `?${Date.now()}`))[lang];
  for (const [key, file] of keys) {
    if (!(key in dict)) problems.push(`${lang}: missing  ${JSON.stringify(key)}  (${file})`);
    else if (vars(key) !== vars(dict[key])) problems.push(`${lang}: placeholders differ  ${JSON.stringify(key)}`);
  }
  for (const key of Object.keys(dict)) if (!keys.has(key)) problems.push(`${lang}: unused   ${JSON.stringify(key)}`);
}

if (problems.length) {
  console.error(`i18n: ${problems.length} problem(s) in src/i18n\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`  ok  i18n: ${keys.size} strings in ${langs.length} languages (${langs.join(", ")})`);
