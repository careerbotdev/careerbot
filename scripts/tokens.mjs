// Build everything that comes from DESIGN.md:
//   src/app/tokens.css            Tailwind theme (colors, type, radius, spacing)
//   src/app/tokens.json           the same values resolved, for images drawn in code without CSS (the share card)
//   public/brand/*-{light,dark}.svg  the logo, colored with DESIGN.md colors
// Run with `pnpm tokens` after changing DESIGN.md or brand/.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { lint } from "@google/design.md/linter";

const design = readFileSync("DESIGN.md", "utf8");
const system = lint(design).designSystem;
const colors = system.colors;
const hex = (name) => {
  const c = colors.get(name);
  if (!c) throw new Error(`DESIGN.md has no color "${name}"`);
  return c.hex;
};

// Tailwind theme. The `initial` resets drop Tailwind's default colors and radii so only DESIGN.md values exist.
const theme = execFileSync("designmd", ["export", "--format", "css-tailwind", "DESIGN.md"], { encoding: "utf8" });
writeFileSync(
  "src/app/tokens.css",
  "/* Generated from DESIGN.md by `pnpm tokens`. Do not edit. */\n" +
    theme.replace("@theme {", "@theme {\n  --color-*: initial;\n  --radius-*: initial;"),
);

// The resolved values: colors as hex, type as CSS lengths, radii in px.
const length = (d) => (d ? `${d.value}${d.unit}` : undefined);
writeFileSync(
  "src/app/tokens.json",
  JSON.stringify(
    {
      colors: Object.fromEntries([...colors].map(([name, c]) => [name, c.hex])),
      typography: Object.fromEntries(
        [...system.typography].map(([name, t]) => [
          name,
          { fontSize: length(t.fontSize), lineHeight: length(t.lineHeight), fontWeight: t.fontWeight, letterSpacing: length(t.letterSpacing) },
        ]),
      ),
      rounded: Object.fromEntries([...system.rounded].map(([name, r]) => [name, length(r)])),
    },
    null,
    2,
  ) + "\n",
);

// Logo. The files in brand/ are master drawings with three color classes; only the colors change here.
const logoColors = {
  light: { ink: hex("text"), accent: hex("primary"), mark: hex("primary") },
  dark: { ink: hex("text-dark"), accent: hex("primary"), mark: hex("primary") },
};
mkdirSync("public/brand", { recursive: true });
for (const file of ["mark", "wordmark"]) {
  const master = readFileSync(`brand/${file}.svg`, "utf8");
  for (const [mode, c] of Object.entries(logoColors)) {
    const style = `<style>.ink{fill:${c.ink}}.accent{fill:${c.accent}}.mark{fill:${c.mark}}</style>`;
    const svg = master.replace(/<style>[\s\S]*?<\/style>/, style);
    if (svg === master) throw new Error(`brand/${file}.svg has no <style> block to color`);
    writeFileSync(`public/brand/${file}-${mode}.svg`, svg);
  }
}

// App icon (the browser tab, bookmarks, home screens): the mark in its dark colors on an ink square, at 60% of it,
// as the Logo board sets it. src/app/icon.svg is what Next.js serves as the favicon; src/app/apple-icon.png is a 180px
// render of it for iPhone home screens, redrawn by hand when the mark changes.
const mark = readFileSync("brand/mark.svg", "utf8");
const size = Number(/viewBox="0 0 (\d+(?:\.\d+)?)/.exec(mark)?.[1]);
if (!size) throw new Error("brand/mark.svg needs a square viewBox from 0 0");
const inner = mark
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<style>[\s\S]*?<\/style>/, "");
const d = logoColors.dark;
const pad = size * 0.2;
writeFileSync(
  "src/app/icon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><style>.ink{fill:${d.ink}}.accent{fill:${d.accent}}.mark{fill:${d.mark}}</style>` +
    `<rect width="${size}" height="${size}" fill="${hex("ink")}"/><g transform="translate(${pad} ${pad}) scale(0.6)">${inner}</g></svg>\n`,
);
