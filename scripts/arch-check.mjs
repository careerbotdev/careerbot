// Fails when the system map (docs/architecture) and the code disagree. Run with `pnpm arch:check`.
// See docs/BUILD.md "System map".
//
// Two authorities, never a text scan:
// - default: the TypeScript type checker classifies every export of convex/*.ts by its type (RegisteredQuery,
//   RegisteredMutation, RegisteredAction), so aliases, wrappers and destructured exports are all seen.
//   An export whose type can't be resolved fails the check rather than being skipped.
// - `--deployed`: Convex's own `convex function-spec` for the deployment (needs CONVEX_DEPLOY_KEY), which also
//   lists HTTP routes that libraries register at runtime. Run after a deploy.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const deployed = process.argv.includes("--deployed");
const problems = [];

function sourceInventory() {
  const files = readdirSync("convex")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
    .map((f) => resolve("convex", f));
  const config = ts.getParsedCommandLineOfConfigFile("tsconfig.json", {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const program = ts.createProgram(files, { ...config.options, noEmit: true });
  const checker = program.getTypeChecker();
  const fns = new Set();
  for (const file of files) {
    const sf = program.getSourceFile(file);
    const mod = checker.getSymbolAtLocation(sf);
    if (!mod) continue;
    const name = file.split("/").pop().slice(0, -3);
    for (const sym of checker.getExportsOfModule(mod)) {
      const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      if (!(target.flags & ts.SymbolFlags.Value)) continue; // types and interfaces
      const type = checker.getTypeOfSymbol(target);
      if (type.flags & ts.TypeFlags.Any) {
        problems.push(`can't tell what convex/${name}.ts exports as "${sym.name}" (its type is any); give it a type`);
        continue;
      }
      const typeName = (type.aliasSymbol ?? type.getSymbol())?.getName() ?? "";
      if (/^Registered(Query|Mutation|Action)$/.test(typeName)) fns.add(`${name}:${sym.name}`);
    }
  }
  return { fns, routes: null };
}

function deployedInventory() {
  const spec = JSON.parse(execFileSync("npx", ["convex", "function-spec"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const fns = new Set();
  const routes = new Set();
  for (const f of spec.functions) {
    if (f.functionType === "HttpAction") routes.add(`${f.method} ${f.path}`);
    else if (f.identifier) fns.add(f.identifier.replace(/\.js:/, ":"));
    else problems.push(`function-spec entry with no identifier: ${JSON.stringify(f)}`);
  }
  return { fns, routes };
}

const { fns: code, routes } = deployed ? deployedInventory() : sourceInventory();
const tables = new Set([...readFileSync("convex/schema.ts", "utf8").matchAll(/^ {2}([A-Za-z0-9_]+): defineTable\(/gm)].map((m) => m[1]));

const dir = mkdtempSync(join(tmpdir(), "arch-"));
const out = join(dir, "model.json");
execFileSync("npx", ["likec4", "export", "json", "--skip-layout", "-o", out, "docs/architecture"], { stdio: "ignore" });
const model = JSON.parse(readFileSync(out, "utf8"));
rmSync(dir, { recursive: true, force: true });

const list = (x) => (x ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const mapped = new Map();
const mappedTables = new Set();
const mappedRoutes = new Set();
for (const [id, el] of Object.entries(model.elements)) {
  for (const fn of list(el.metadata?.functions)) {
    if (mapped.has(fn)) problems.push(`${fn} is listed on both ${mapped.get(fn)} and ${id}`);
    mapped.set(fn, id);
  }
  for (const r of list(el.metadata?.routes)) mappedRoutes.add(r);
  if (el.metadata?.table) mappedTables.add(el.metadata.table);
}

problems.push(
  ...[...code].filter((f) => !mapped.has(f)).map((f) => `not in the map: function ${f}`),
  ...[...mapped.keys()].filter((f) => !code.has(f)).map((f) => `in the map but not ${deployed ? "deployed" : "in the code"}: function ${f}`),
  ...[...tables].filter((t) => !mappedTables.has(t)).map((t) => `not in the map: table ${t}`),
  ...[...mappedTables].filter((t) => !tables.has(t)).map((t) => `in the map but gone from the schema: table ${t}`),
);
if (routes) {
  problems.push(
    ...[...routes].filter((r) => !mappedRoutes.has(r)).map((r) => `not in the map: HTTP route ${r}`),
    ...[...mappedRoutes].filter((r) => !routes.has(r)).map((r) => `in the map but not deployed: HTTP route ${r}`),
  );
}
if (problems.length) {
  console.error(`System map is out of date (docs/architecture):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`System map covers ${code.size} functions${routes ? `, ${routes.size} HTTP routes` : ""} and ${tables.size} tables (${deployed ? "deployed" : "source"}).`);
