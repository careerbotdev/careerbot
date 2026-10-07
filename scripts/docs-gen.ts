// Builds the docs' generated reference (src/app/docs/reference.json) from the code, so the docs never retype what the
// code says: the screens, the AI steps in order with what each reads and how it's filtered (the system map,
// docs/architecture, in the plain words of scripts/docs-words.ts), every explained action of a screen (the explainer
// audit's), the old addresses (next.config.ts), the G shortcuts (src/app/shell/Shortcuts.tsx) and the self-hosting
// settings (.env.example). Run with `pnpm docs:gen`; scripts/docs-check.ts (part of `pnpm lint`) fails when the file is
// out of date. Fails, listing every problem, when the map has a screen, AI step or input with no plain words, or the
// words name something the map no longer has.
//
// type Filter = 'approved' | 'yours' | 'unreviewed' | 'rejected' | 'public';
// type Reference = {
//   screens: { key: string; name: string; paths: string[]; page: string }[];
//   stages: { id: string; name: string; line: string }[];
//   aiSteps: { id: string; name: string; stage: string | null; starts: string; reads: { text: string; filter: Filter | null }[]; may: string; mayNot: string; tasks: string[]; screens: string[] }[];
//   actions: { screen: string; label: string; detail: string; note: string }[];
//   oldAddresses: { from: string; to: string }[];
//   shortcuts: { keys: string; label: string; href: string }[];
//   configuration: { name: string; group: string; text: string; example: string }[];
// };
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LikeC4 } from "likec4";
import ts from "typescript";
import { AI_TASKS } from "../convex/aiTasks";
import { AI_STEPS, PUBLIC_SOURCES, SCREENS, STAGES, WEBSITE_SCREENS } from "./docs-words";

export type Filter = "approved" | "yours" | "unreviewed" | "rejected" | "public";
export type Reference = {
  screens: { key: string; name: string; paths: string[]; page: string }[];
  stages: { id: string; name: string; line: string }[];
  aiSteps: { id: string; name: string; stage: string | null; starts: string; reads: { text: string; filter: Filter | null }[]; may: string; mayNot: string; tasks: string[]; screens: string[] }[];
  actions: { screen: string; label: string; detail: string; note: string }[];
  oldAddresses: { from: string; to: string }[];
  shortcuts: { keys: string; label: string; href: string }[];
  configuration: { name: string; group: string; text: string; example: string }[];
};

export const ROOT = join(__dirname, "..");
export const REFERENCE = "src/app/docs/reference.json";
const MODEL = "docs/architecture/model.c4";
const WORDS = "scripts/docs-words.ts";

// The generator's problems, each `file:line  what's wrong`.
export class DocsGenError extends Error {
  constructor(readonly problems: string[]) {
    super(`Docs generator: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n\n${problems.join("\n")}`);
  }
}

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

// Where a piece of text first appears in a file, as `file:line` (line 1 when it isn't there).
export function at(file: string, ...needles: string[]) {
  const lines = read(file).split("\n");
  for (const needle of needles) {
    const i = lines.findIndex((l) => l.includes(needle));
    if (i >= 0) return `${file}:${i + 1}`;
  }
  return `${file}:1`;
}

// LikeC4 drops the backslash of a `\u2019` escape in model.c4, leaving `u2019` in the title: put the character back.
const decode = (s: string) => s.replace(/u(20[0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
// The label as written in model.c4, to find its line.
const escaped = (s: string) => s.replace(/[\u2000-\u20ff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
const lastPart = (id: string) => id.slice(id.lastIndexOf(".") + 1);

const FILTERS: Record<string, Filter> = { approvedOnly: "approved", rawNarrative: "yours", unreviewedInput: "unreviewed", rejectedAsGuard: "rejected" };

// The AI steps and screens of the system map, joined to their plain words.
async function fromModel(problems: string[]) {
  const lc = await LikeC4.fromWorkspace(join(ROOT, "docs/architecture"), { logger: false, printErrors: false });
  const model = await lc.computedModel();
  const elements = [...model.elements()];

  // Screens: every app screen in the map belongs to exactly one docs screen key.
  const screenOf = new Map<string, string>();
  for (const [key, s] of Object.entries(SCREENS)) for (const el of s.elements) screenOf.set(el, key);
  const mapScreens = elements.filter((e) => e.kind === "screen").map((e) => lastPart(e.id));
  for (const id of mapScreens) {
    if (!WEBSITE_SCREENS.includes(id) && !screenOf.has(id)) problems.push(`${at(MODEL, `${id} = screen`, id)}  screen ${id} has no docs screen key in ${WORDS} (SCREENS)`);
  }
  for (const [el, key] of screenOf) {
    if (!mapScreens.includes(el)) problems.push(`${at(WORDS, `"${el}"`)}  SCREENS.${key} names screen ${el}, which ${MODEL} no longer has`);
  }
  for (const el of WEBSITE_SCREENS) {
    if (!mapScreens.includes(el)) problems.push(`${at(WORDS, `"${el}"`)}  WEBSITE_SCREENS names screen ${el}, which ${MODEL} no longer has`);
  }

  // AI steps: every one a person meets (not tagged #operatorOnly) has words, and the words name only steps there are.
  const steps = elements.filter((e) => e.kind === "aiStep" && !e.tags.includes("operatorOnly"));
  const byId = new Map(steps.map((e) => [lastPart(e.id), e]));
  for (const id of byId.keys()) if (!(id in AI_STEPS)) problems.push(`${at(MODEL, `${id} = aiStep`, id)}  AI step ${id} has no plain words in ${WORDS} (AI_STEPS)`);
  for (const id of Object.keys(AI_STEPS)) if (!byId.has(id)) problems.push(`${at(WORDS, `  ${id}: {`)}  AI_STEPS.${id}: ${MODEL} has no AI step ${id} (or it's #operatorOnly)`);

  const aiSteps: Reference["aiSteps"] = [];
  for (const [id, words] of Object.entries(AI_STEPS)) {
    const e = byId.get(id);
    if (!e) continue;
    // Inputs: what it reads, and what it calls outside CareerBot for (a repository, a company's website).
    const inputs = [...e.outgoing()].filter((r) => r.kind === "reads" || (r.kind === "calls" && !r.target.id.startsWith("careerbot.")));
    const labels = new Set<string>();
    const reads: Reference["aiSteps"][number]["reads"] = [];
    for (const r of inputs) {
      const label = decode(r.title ?? "");
      labels.add(label);
      if (!(label in words.reads)) {
        problems.push(`${at(MODEL, escaped(label), label)}  ${id} reads “${label}”: no plain wording in ${WORDS} (AI_STEPS.${id}.reads; null leaves it out)`);
        continue;
      }
      const text = words.reads[label];
      if (text === null || reads.some((x) => x.text === text)) continue;
      const tag = r.tags.find((t) => t in FILTERS);
      reads.push({ text, filter: tag ? FILTERS[tag] : PUBLIC_SOURCES.includes(lastPart(r.target.id)) ? "public" : null });
    }
    for (const label of Object.keys(words.reads)) {
      if (!labels.has(label)) problems.push(`${at(WORDS, label)}  AI_STEPS.${id}.reads has “${label}”, which ${id} in ${MODEL} no longer reads`);
    }

    // Model settings: model_task names AI tasks (comma-separated; "per contender" is none).
    const meta = e.$element.metadata ?? {};
    const task = typeof meta.model_task === "string" ? meta.model_task : "";
    const tasks: string[] = [];
    for (const part of task.split(",").map((t) => t.trim()).filter(Boolean)) {
      if (part === "per contender") continue;
      const name = part.split(/\s/)[0] as keyof typeof AI_TASKS;
      if (name in AI_TASKS) tasks.push(AI_TASKS[name]);
      else problems.push(`${at(MODEL, `model_task '${task}'`, task)}  ${id}: model_task ${part} isn't an AI task (convex/aiTasks.ts)`);
    }

    // Screens it's started from.
    const from: string[] = [];
    for (const r of e.incoming()) {
      if (r.kind !== "calls" || r.source.kind !== "screen") continue;
      const key = screenOf.get(lastPart(r.source.id));
      if (key && !from.includes(key)) from.push(key);
    }
    const order = Object.keys(SCREENS);
    from.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    aiSteps.push({ id, name: words.name, stage: words.stage, starts: words.starts, reads, may: words.may, mayNot: words.mayNot, tasks, screens: from });
  }
  return aiSteps;
}

// Every route under src/app, as segments (`[id]` matches any one).
export function appRoutes(): string[][] {
  const routes: string[][] = [];
  const walk = (dir: string, segs: string[]) => {
    for (const entry of ts.sys.getDirectories(join(ROOT, dir))) {
      if (entry === "node_modules") continue;
      const seg = entry.startsWith("(") ? [] : [entry];
      walk(`${dir}/${entry}`, [...segs, ...seg]);
    }
    if (existsSync(join(ROOT, dir, "page.tsx")) || existsSync(join(ROOT, dir, "page.ts"))) routes.push(segs);
  };
  walk("src/app", []);
  return routes;
}

export function routeMatches(route: string[], path: string) {
  const segs = path.split("/").filter(Boolean);
  for (let i = 0; i < route.length; i++) {
    const r = route[i];
    if (r.startsWith("[[...")) return true;
    if (r.startsWith("[...")) return segs.length > i;
    if (i >= segs.length) return false;
    if (!r.startsWith("[") && r !== segs[i]) return false;
  }
  return segs.length === route.length;
}

function screens(problems: string[]): Reference["screens"] {
  const routes = appRoutes();
  return Object.entries(SCREENS).map(([key, s]) => {
    for (const p of s.paths) if (!routes.some((r) => routeMatches(r, p))) problems.push(`${at(WORDS, `"${p}"`)}  SCREENS.${key}: ${p} isn't a page under src/app`);
    for (const f of s.folders) if (!existsSync(join(ROOT, f))) problems.push(`${at(WORDS, `"${f}"`)}  SCREENS.${key}: ${f} doesn't exist`);
    return { key, name: s.name, paths: s.paths, page: `/docs/using/${key}` };
  });
}

type AuditAction = { file: string; line: number; kind: string; label: string | null; detail: string | null; note: string | null };

// Every action of a screen with its words written out (the explainer audit's), by the screen its folder belongs to.
function actions(): Reference["actions"] {
  const out = execFileSync(process.execPath, ["scripts/explainer-audit.mjs", "--json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const all = JSON.parse(out) as AuditAction[];
  const order = Object.keys(SCREENS);
  const screenOf = (file: string) => order.find((key) => SCREENS[key].folders.some((f) => file.startsWith(`${f}/`)));
  const picked: (Reference["actions"][number] & { file: string; line: number })[] = [];
  for (const a of all) {
    const screen = screenOf(a.file);
    if (!screen || a.label === null || a.detail === null || a.note === null) continue;
    if (picked.some((p) => p.screen === screen && p.label === a.label && p.detail === a.detail)) continue;
    picked.push({ screen, label: a.label, detail: a.detail, note: a.note, file: a.file, line: a.line });
  }
  picked.sort((a, b) => order.indexOf(a.screen) - order.indexOf(b.screen) || a.file.localeCompare(b.file) || a.line - b.line);
  return picked.map(({ screen, label, detail, note }) => ({ screen, label, detail, note }));
}

const source = (file: string) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const propName = (p: ts.ObjectLiteralElementLike) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined);
const stringProps = (obj: ts.ObjectLiteralExpression) => {
  const out: Record<string, string> = {};
  for (const p of obj.properties) {
    const name = propName(p);
    if (name && ts.isPropertyAssignment(p) && ts.isStringLiteralLike(p.initializer)) out[name] = p.initializer.text;
  }
  return out;
};
function find<T extends ts.Node>(node: ts.Node, test: (n: ts.Node) => n is T): T | undefined {
  if (test(node)) return node;
  return ts.forEachChild(node, (c) => find(c, test));
}

// The redirects in next.config.ts: addresses the app had before.
export function redirects(): { from: string; to: string }[] {
  const sf = source("next.config.ts");
  const method = find(sf, (n): n is ts.MethodDeclaration => ts.isMethodDeclaration(n) && n.name.getText() === "redirects");
  const array = method && find(method, ts.isArrayLiteralExpression);
  if (!array) throw new DocsGenError(["next.config.ts:1  no redirects() returning an array"]);
  return array.elements.filter(ts.isObjectLiteralExpression).map((o) => {
    const { source: from, destination: to } = stringProps(o);
    return { from, to };
  });
}

// G then a letter (src/app/shell/Shortcuts.tsx, GO).
function shortcuts(): Reference["shortcuts"] {
  const sf = source("src/app/shell/Shortcuts.tsx");
  const go = find(sf, (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && n.name.getText() === "GO");
  if (!go?.initializer || !ts.isObjectLiteralExpression(go.initializer)) throw new DocsGenError(["src/app/shell/Shortcuts.tsx:1  no GO object"]);
  return go.initializer.properties.filter(ts.isPropertyAssignment).map((p) => {
    if (!ts.isObjectLiteralExpression(p.initializer)) throw new DocsGenError([`src/app/shell/Shortcuts.tsx  GO.${propName(p)} isn't an object`]);
    const { keys, label, href } = stringProps(p.initializer);
    return { keys, label, href };
  });
}

// Every setting in .env.example, commented-out ones too, with its section and the comment above it.
function configuration(): Reference["configuration"] {
  const out: Reference["configuration"] = [];
  let group = "";
  let comment: string[] = [];
  let afterVariable = false;
  for (const raw of read(".env.example").split("\n")) {
    const line = raw.trim();
    const heading = /^#\s*──\s*(.+?)\s*─+\s*$/.exec(line);
    const variable = /^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (heading) {
      group = heading[1];
      comment = [];
      afterVariable = false;
    } else if (variable) {
      if (group) out.push({ name: variable[1], group, text: comment.join(" ").replace(/\s+/g, " ").trim(), example: variable[2].trim() });
      afterVariable = true;
    } else if (line.startsWith("#")) {
      if (afterVariable) comment = [];
      afterVariable = false;
      comment.push(line.replace(/^#+/, "").trim());
    } else {
      comment = [];
      afterVariable = false;
    }
  }
  return out;
}

export async function generate(): Promise<Reference> {
  const problems: string[] = [];
  const aiSteps = await fromModel(problems);
  const reference: Reference = {
    screens: screens(problems),
    stages: STAGES.map(({ id, name, line }) => ({ id, name, line })),
    aiSteps,
    actions: [],
    oldAddresses: redirects(),
    shortcuts: shortcuts(),
    configuration: configuration(),
  };
  if (problems.length) throw new DocsGenError(problems);
  reference.actions = actions();
  return reference;
}

export const serialise = (r: Reference) => `${JSON.stringify(r, null, 2)}\n`;

async function main() {
  const reference = await generate();
  mkdirSync(dirname(join(ROOT, REFERENCE)), { recursive: true });
  writeFileSync(join(ROOT, REFERENCE), serialise(reference));
  const n = (k: keyof Reference) => reference[k].length;
  console.log(
    `Docs reference: ${n("screens")} screens, ${n("aiSteps")} AI steps, ${n("actions")} actions, ${n("oldAddresses")} old addresses, ${n("shortcuts")} shortcuts, ${n("configuration")} settings written to ${REFERENCE}.`,
  );
}

// Run when executed (`pnpm docs:gen`), not when imported by the docs check.
if (process.argv[1]?.endsWith("docs-gen.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
