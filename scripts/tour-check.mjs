// Fails when a guided tour (src/app/tours/*.ts) points at a part no screen has: every step's `target` must match a
// `data-tour="…"` (or a part's `tour="…"`) written in a screen, and every tour must be started by some screen (useTour). So renaming or
// removing a part can't silently break a tour. Run with `node scripts/tour-check.mjs`; part of `pnpm lint`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const sources = walk("src").filter((f) => /\.tsx?$/.test(f) && !/\.(stories|test)\.tsx?$/.test(f));
const code = sources.map((f) => [f, readFileSync(f, "utf8")]);
const parts = new Set(code.flatMap(([, t]) => [...t.matchAll(/(?:data-tour|\stour)="([^"]+)"/g)].map((m) => m[1])));

const problems = [];
let steps = 0;
const tours = walk("src/app/tours").filter((f) => f.endsWith(".ts"));
for (const file of tours) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/target:\s*"([^"]+)"/g)) {
    steps++;
    if (!parts.has(m[1])) problems.push(`${relative(".", file)}: no part has data-tour="${m[1]}"`);
  }
  for (const m of text.matchAll(/export const (\w+)\s*:\s*TourDef/g)) {
    if (!code.some(([f, t]) => f !== file && new RegExp(`useTour\\(${m[1]}\\b`).test(t))) problems.push(`${relative(".", file)}: ${m[1]} isn't started by any screen (useTour)`);
  }
}
if (problems.length) {
  console.error(`Tour check: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Tour check: ${tours.length} tours, ${steps} steps, every part found.`);
