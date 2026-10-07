// Fails when code steps outside the design system (DESIGN.md, BUILD.md "Controls" and "Words"): browser-default
// controls in screens, colours or radii that aren't tokens, icons from outside the icon map, dark-only token names.
// Run with `pnpm design:check`; part of the pre-push checks.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

// [pattern, what's wrong, which files it applies to]
const rules = [
  [/from ["']lucide-react["']/, "import icons from @/components/icons, not lucide-react", (f) => !f.endsWith("components/icons.tsx")],
  [/<select\b|<option\b|<datalist\b/, "use Select, Combobox or MultiSelect, not a native select", (f) => f.includes("/app/")],
  [/<input\b[^>]*\btype=["'](date|time|checkbox|radio|file|range|number|color)["']/, "use the themed part for this input type", (f) => f.includes("/app/")],
  [/<[a-z][a-z0-9]*\s[^>]*\btitle=\{?["'`]/, "a title attribute is a browser tooltip; use Tooltip", () => true],
  [/\b(window\.)?(confirm|alert|prompt)\(/, "use ConfirmDialog, the bottom bar or a toast, not a browser box", () => true],
  [/#[0-9a-fA-F]{3,8}\b(?![0-9a-zA-Z-])/, "colours come from DESIGN.md roles, not hex", (f) => !f.endsWith(".test.ts")],
  [/\brounded-(md|lg|xl|2xl|3xl|full|\[)/, "corners are rounded-none, rounded-sm (2px), or rounded-xs (1px) for marks and nested parts", () => true],
  [/\b(bg|text|border|ring|fill|stroke|outline|divide)-[a-z-]+-dark\b/, "use the role name; dark mode swaps it", () => true],
  [/\b(text|leading)-\[\d/, "type sizes and line heights come from the DESIGN.md scale", (f) => !f.endsWith(".stories.tsx")],
];

const problems = [];
for (const file of files("src")) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const [pattern, message, applies] of rules)
      if (applies(file) && pattern.test(line)) problems.push(`${relative(".", file)}:${i + 1}  ${message}\n    ${line.trim().slice(0, 140)}`);
  });
}

if (problems.length) {
  console.error(`Design check: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("Design check: every file stays inside the design system.");
