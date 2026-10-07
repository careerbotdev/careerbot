// Fails when the docs (content/docs) aren't true to the code: the generated reference is out of date or can't be built
// (scripts/docs-gen.ts), a user-facing string in it names an internal identifier, a page's frontmatter isn't valid YAML,
// lacks a title, description or sources or names a source that doesn't exist, a folder's meta.json and its pages
// disagree, a component names an unknown screen, AI step or stage, a bold phrase isn't the app's own words, a link goes
// nowhere, a Getting started step's Learn more has no page, a screen has no Using page or more than one, or a
// screenshot is missing, stale or left over (a <Shot> names no rendered shot or has no alt text, a shot's story or
// picture is gone, scripts/docs-shots.ts and shots.json disagree, or a shot or file is shown nowhere). Lists every
// problem with file:line.
// Run with `tsx scripts/docs-check.ts` (`--content=<dir>` checks another folder of pages); part of `pnpm lint`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { DONE, PATH_ROWS, PURSUIT_STEPS, SETUP_STEPS } from "../src/app/today/steps";
import { appRoutes, at, DocsGenError, generate, REFERENCE, redirects, type Reference, ROOT, routeMatches, serialise } from "./docs-gen";
import { type Shot, SHOTS_DIR, SHOTS_JSON, SPECS } from "./docs-shots";

const contentArg = process.argv.find((a) => a.startsWith("--content="))?.slice("--content=".length);
const CONTENT = contentArg ? relative(ROOT, resolve(contentArg)) : "content/docs";
const WORDS = "scripts/docs-words.ts";
const problems: string[] = [];

// ── The reference ─────────────────────────────────────────────────────────────────────────────────────────────────────

const INTERNAL: [RegExp, string][] = [
  [/\b[a-z]+[A-Z][A-Za-z0-9]*\b/, "a camelCase name"],
  [/\b[a-z][A-Za-z0-9]*:[a-z][A-Za-z0-9]*\b/, "a module:function name"],
  [/[\w./-]+\.tsx?\b/, "a .ts path"],
  [/\bnarratives?\b/i, "the word narrative"],
];

// Every user-facing string of the reference (not the AI task labels: they are Settings' own words) names no internal
// identifier. A string is pointed at where it's written: its plain words, else the generated file.
function checkWords(r: Reference) {
  const strings: [string, string][] = [
    ...r.screens.map((s): [string, string] => [`screen ${s.key} name`, s.name]),
    ...r.stages.flatMap((s): [string, string][] => [[`stage ${s.id} name`, s.name], [`stage ${s.id} line`, s.line]]),
    ...r.aiSteps.flatMap((s): [string, string][] => [
      [`${s.id} name`, s.name],
      [`${s.id} starts`, s.starts],
      [`${s.id} may`, s.may],
      [`${s.id} mayNot`, s.mayNot],
      ...s.reads.map((x): [string, string] => [`${s.id} reads`, x.text]),
    ]),
    ...r.actions.flatMap((a): [string, string][] => [[`${a.screen} action`, a.label], [`${a.screen} action ${a.label}`, a.detail], [`${a.screen} action ${a.label}`, a.note]]),
    ...r.shortcuts.map((s): [string, string] => [`shortcut ${s.keys}`, s.label]),
    ...r.configuration.flatMap((c): [string, string][] => [[`${c.name} section`, c.group], [c.name, c.text]]),
  ];
  for (const [what, s] of strings) {
    for (const [re, kind] of INTERNAL) {
      const m = re.exec(s);
      if (!m) continue;
      const words = at(WORDS, s);
      problems.push(`${words.endsWith(":1") ? at(REFERENCE, JSON.stringify(s).slice(1, -1)) : words}  ${what} names ${kind} (“${m[0]}”): “${s}”`);
    }
  }
}

async function checkReference() {
  try {
    const reference = await generate();
    const file = join(ROOT, REFERENCE);
    if (!existsSync(file)) problems.push(`${REFERENCE}:1  missing: run pnpm docs:gen`);
    else if (readFileSync(file, "utf8") !== serialise(reference)) problems.push(`${REFERENCE}:1  out of date with the code: run pnpm docs:gen`);
    checkWords(reference);
    return reference;
  } catch (e) {
    if (!(e instanceof DocsGenError)) throw e;
    problems.push(...e.problems);
    return undefined;
  }
}

// ── The pages ─────────────────────────────────────────────────────────────────────────────────────────────────────────

// `invalid`: its frontmatter isn't valid YAML (already reported), so its keys aren't checked.
type Page = { file: string; url: string; invalid: boolean; meta: Record<string, string | string[]>; metaLine: Record<string, number>; body: { line: number; text: string }[] };

function mdxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir)).sort()) {
    const path = `${dir}/${entry}`;
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...mdxFiles(path));
    else if (entry.endsWith(".mdx")) out.push(path);
  }
  return out;
}

// The YAML parser fumadocs-mdx reads frontmatter with (not resolvable from the repo root, so taken from beside it).
type Yaml = { parseDocument(src: string): { errors: { message: string; linePos?: { line: number }[] }[]; toJS(): unknown } };
const YAML = createRequire(require.resolve("fumadocs-mdx/package.json"))("yaml") as Yaml;

// The frontmatter, parsed as fumadocs-mdx parses it, and the body outside fenced code, with inline code blanked so
// nothing quoted as code counts.
function parse(file: string): Page {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const meta: Page["meta"] = {};
  const metaLine: Page["metaLine"] = {};
  let start = 0;
  let invalid = false;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    start = end < 0 ? lines.length : end + 1;
    const doc = YAML.parseDocument(lines.slice(1, end < 0 ? lines.length : end).join("\n"));
    for (const e of doc.errors) problems.push(`${file}:${1 + (e.linePos?.[0]?.line ?? 0)}  frontmatter isn't valid YAML: ${e.message.split("\n")[0].replace(/:$/, "")}`);
    invalid = doc.errors.length > 0;
    const data = invalid ? undefined : doc.toJS();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string") meta[key] = value;
        else if (Array.isArray(value)) meta[key] = value.map(String);
        else if (value !== null && value !== undefined) meta[key] = String(value);
      }
    }
    for (let i = 1; i < start - 1; i++) {
      const key = /^([A-Za-z_][\w-]*):/.exec(lines[i])?.[1];
      if (key && !(key in metaLine)) metaLine[key] = i + 1;
    }
  }
  const body: Page["body"] = [];
  let fence = "";
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && line.trim() === open[1]) fence = "";
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    body.push({ line: i + 1, text: line.replace(/(`+)[^`]*?\1/g, (m) => " ".repeat(m.length)) });
  }
  const path = relative(CONTENT, file).replace(/\.mdx$/, "");
  const url = `/docs/${path.replace(/(^|\/)index$/, "")}`.replace(/\/$/, "");
  return { file, url, invalid, meta, metaLine, body };
}

function checkFrontmatter(pages: Page[]) {
  for (const p of pages.filter((p) => !p.invalid)) {
    for (const key of ["title", "description"]) {
      const v = p.meta[key];
      if (typeof v !== "string" || !v) problems.push(`${p.file}:1  no ${key} in its frontmatter`);
    }
    const sources = p.meta.sources;
    if (!Array.isArray(sources) || !sources.length) problems.push(`${p.file}:${p.metaLine.sources ?? 1}  no sources: list in its frontmatter`);
    else for (const s of sources) if (!existsSync(join(ROOT, s))) problems.push(`${p.file}:${p.metaLine.sources}  source ${s} doesn't exist`);
  }
}

// Each folder's meta.json lists its pages, and only pages (or folders) it has. Fumadocs' separators (`---Title---`),
// links (`[Text](url)`), `...` (the rest) and `!page` (left out) are understood.
function checkMeta(files: string[]) {
  const folderOf = (f: string) => f.slice(0, f.lastIndexOf("/"));
  for (const folder of new Set(files.map(folderOf))) {
    const metaFile = `${folder}/meta.json`;
    const own = files.filter((f) => folderOf(f) === folder).map((f) => f.slice(folder.length + 1, -4));
    if (!existsSync(join(ROOT, metaFile))) {
      problems.push(`${folder}:1  no meta.json listing its pages (${own.join(", ")})`);
      continue;
    }
    let listed: string[] = [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(ROOT, metaFile), "utf8"));
      if (parsed && typeof parsed === "object" && "pages" in parsed && Array.isArray(parsed.pages)) listed = parsed.pages.filter((x): x is string => typeof x === "string");
      else problems.push(`${metaFile}:1  no pages list`);
    } catch {
      problems.push(`${metaFile}:1  isn't valid JSON`);
      continue;
    }
    const rest = listed.some((x) => x === "..." || x === "z...a");
    const names = listed.map((x) => x.replace(/^!|^\.\.\./, ""));
    for (const page of own) if (!rest && !names.includes(page)) problems.push(`${metaFile}:1  doesn't list ${page} (${folder}/${page}.mdx)`);
    for (const [i, entry] of listed.entries()) {
      if (/^(---.*---|\.\.\.|z\.\.\.a)$/.test(entry) || /^\[.*\]\(.*\)$/.test(entry)) continue;
      if (!own.includes(names[i]) && !existsSync(join(ROOT, folder, names[i]))) problems.push(`${at(metaFile, `"${entry}"`)}  lists ${entry}, which isn't a page or folder in ${folder}`);
    }
  }
}

// Components that name a screen, an AI step or a stage.
function checkComponents(pages: Page[], r: Reference) {
  const screens = new Set(r.screens.map((s) => s.key));
  const steps = new Set(r.aiSteps.map((s) => s.id));
  const refs: Record<string, [string, Set<string>, string]> = {
    Screen: ["id", screens, "screen key"],
    ScreenFacts: ["screen", screens, "screen key"],
    Actions: ["screen", screens, "screen key"],
    AiStep: ["id", steps, "AI step"],
    AiStepCard: ["step", steps, "AI step"],
    AiStage: ["stage", new Set(r.stages.map((s) => s.id)), "stage"],
  };
  for (const p of pages) {
    for (const { line, text } of p.body) {
      for (const m of text.matchAll(/<(Screen|ScreenFacts|Actions|AiStep|AiStepCard|AiStage)\b([^>]*)>/g)) {
        const [attr, known, kind] = refs[m[1]];
        const value = new RegExp(`\\b${attr}=(?:"([^"]*)"|'([^']*)'|\\{\\s*["']([^"']*)["']\\s*\\})`).exec(m[2]);
        const v = value && (value[1] ?? value[2] ?? value[3]);
        // <Actions /> on its own lists every screen's actions; the others need their id.
        if (v === null) {
          if (m[1] !== "Actions") problems.push(`${p.file}:${line}  <${m[1]}> has no ${attr}`);
        } else if (!known.has(v)) problems.push(`${p.file}:${line}  <${m[1]} ${attr}="${v}"> isn't a known ${kind}`);
      }
    }
  }
}

// Straight quotes, single spaces, no trailing colon or full stop: how bold phrases and the app's words are compared.
const normalise = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:.]$/, "")
    .trim();

// The app's own words: every string and JSX text in its code, but not its stories, tests, fixtures or the docs. Words
// with something computed in them (`Continue with {PROVIDERS[p]}`, `Read ${n} repositories`) are kept as patterns, the
// computed part matching any words.
function appWords() {
  const words: string[] = [];
  const patterns: RegExp[] = [];
  const escape = (s: string) => normalise(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = (parts: (string | null)[]) => {
    const literal = parts.filter((p): p is string => p !== null).join("");
    if (normalise(literal).length < 3) return;
    const body = parts.map((p) => (p === null ? "(.+?)" : escape(p))).join("\\s*");
    patterns.push(new RegExp(`^${body}$`));
  };
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir)).sort()) {
      const path = `${dir}/${entry}`;
      if (path === "src/app/docs" || path === "convex/_generated" || entry === "node_modules") continue;
      if (statSync(join(ROOT, path)).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry) && !/\.(stories|test)\.tsx?$/.test(entry) && !/fixture/i.test(entry)) {
        const sf = ts.createSourceFile(path, readFileSync(join(ROOT, path), "utf8"), ts.ScriptTarget.Latest, false, entry.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const visit = (n: ts.Node) => {
          if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) words.push(normalise(n.text));
          if (ts.isTemplateExpression(n)) pattern([n.head.text, ...n.templateSpans.flatMap((s) => [null, s.literal.text])]);
          if (ts.isJsxElement(n) && n.children.some(ts.isJsxExpression) && n.children.some(ts.isJsxText)) {
            pattern(n.children.map((c) => (ts.isJsxText(c) ? c.text : null)));
          }
          ts.forEachChild(n, visit);
        };
        visit(sf);
      }
    }
  };
  for (const dir of ["src/app", "src/components", "convex"]) walk(dir);
  const text = `\n${words.join("\n")}\n`;
  return (phrase: string) => text.includes(phrase) || patterns.some((p) => p.test(phrase));
}

// Bold is only for UI words.
function checkBold(pages: Page[]) {
  const isAppWords = appWords();
  for (const p of pages) {
    for (const { line, text } of p.body) {
      for (const m of text.matchAll(/\*\*(?!\s)(.+?)\*\*/g)) {
        const phrase = normalise(m[1]);
        if (phrase && !isAppWords(phrase)) problems.push(`${p.file}:${line}  bold **${m[1]}** isn't in the app's words (bold is only for UI words)`);
      }
    }
  }
}

// Links: /docs/… to a page, any other /… to a page of the app, one of its redirects or a public file.
function checkLinks(pages: Page[], docsPage: (url: string) => boolean) {
  const routes = appRoutes();
  const redirectRoutes = redirects().map((r) => r.from.split("/").filter(Boolean).map((s) => (s.startsWith(":") ? `[${s.slice(1)}]` : s)));
  const check = (p: Page, line: number, href: string) => {
    const path = href.replace(/[?#].*$/, "") || "/";
    if (path === "/docs" || path.startsWith("/docs/")) {
      if (!docsPage(path)) problems.push(`${p.file}:${line}  link ${href} isn't a docs page`);
    } else if (!routes.some((r) => routeMatches(r, path)) && !redirectRoutes.some((r) => routeMatches(r, path)) && !existsSync(join(ROOT, "public", path))) {
      problems.push(`${p.file}:${line}  link ${href} isn't a page of the app or one of its redirects`);
    }
  };
  for (const p of pages) {
    for (const { line, text } of p.body) {
      for (const m of text.matchAll(/\]\((\/[^)\s]*)(?:\s+"[^"]*")?\)/g)) check(p, line, m[1]);
      for (const m of text.matchAll(/\bhref=(?:"(\/[^"]*)"|'(\/[^']*)'|\{\s*["'](\/[^"']*)["']\s*\})/g)) check(p, line, m[1] ?? m[2] ?? m[3]);
    }
  }
}

// Each screen has exactly one Using page.
function checkScreens(pages: Page[], r: Reference) {
  const keys = r.screens.map((s) => s.key);
  for (const p of pages) {
    const s = p.meta.screen;
    if (s !== undefined && (typeof s !== "string" || !keys.includes(s))) problems.push(`${p.file}:${p.metaLine.screen}  screen: ${String(s)} isn't a known screen key`);
  }
  for (const key of keys) {
    const own = pages.filter((p) => p.meta.screen === key);
    if (!own.length) problems.push(`${CONTENT}:1  screen ${key} has no Using page (a page with screen: ${key})`);
    if (own.length > 1) problems.push(`${own[1].file}:${own[1].metaLine.screen}  screen ${key} has more than one Using page: ${own.map((o) => o.file).join(", ")}`);
  }
}

// ── The screenshots ───────────────────────────────────────────────────────────────────────────────────────────────────

// Every <Shot> names a rendered shot and says what it shows; every shot scripts/docs-shots.ts lists is rendered as it
// lists it, both its pictures are there and its story still exists (its file still exports it), so a renamed or deleted
// story fails here rather than leaving a picture of a screen that's gone. On the docs' own pages, every shot is shown
// somewhere and public/docs-shots holds nothing else.
function checkShots(pages: Page[]) {
  const shots: Record<string, Shot> = existsSync(join(ROOT, SHOTS_JSON)) ? JSON.parse(readFileSync(join(ROOT, SHOTS_JSON), "utf8")) : {};
  const attr = (tag: string, name: string) => {
    const m = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|\\{\\s*["']([^"']*)["']\\s*\\})`).exec(tag);
    return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  };
  const shown = new Set<string>();
  for (const p of pages) {
    for (const { line, text } of p.body) {
      for (const m of text.matchAll(/<Shot\b([^>]*)>/g)) {
        const id = attr(m[1], "id");
        const alt = attr(m[1], "alt")?.trim() ?? "";
        if (id === undefined) problems.push(`${p.file}:${line}  <Shot> has no id`);
        else if (!shots[id]) problems.push(`${p.file}:${line}  <Shot id="${id}"> isn't a rendered shot (add it to scripts/docs-shots.ts, then pnpm docs:shots)`);
        else shown.add(id);
        // A sentence about what the screen shows, not a label ("Screenshot", "Today").
        if (alt.split(/\s+/).length < 5) problems.push(`${p.file}:${line}  <Shot${id ? ` id="${id}"` : ""}> needs alt text that says what the screen shows`);
      }
    }
  }

  for (const spec of SPECS) {
    const shot = shots[spec.id];
    if (!shot) problems.push(`${at("scripts/docs-shots.ts", `id: "${spec.id}"`)}  shot ${spec.id} isn't rendered: run pnpm docs:shots`);
    else if (shot.story !== spec.story) problems.push(`${at(SHOTS_JSON, `"${spec.id}"`)}  shot ${spec.id} was rendered from ${shot.story}, not ${spec.story}: run pnpm docs:shots ${spec.id}`);
  }
  for (const [id, shot] of Object.entries(shots)) {
    const where = at(SHOTS_JSON, `"${id}"`);
    if (!SPECS.some((s) => s.id === id)) problems.push(`${where}  shot ${id} isn't in scripts/docs-shots.ts: run pnpm docs:shots`);
    for (const theme of ["light", "dark"]) {
      if (!existsSync(join(ROOT, SHOTS_DIR, `${id}-${theme}.webp`))) problems.push(`${where}  ${SHOTS_DIR}/${id}-${theme}.webp is missing: run pnpm docs:shots ${id}`);
    }
    const source = existsSync(join(ROOT, shot.source)) ? readFileSync(join(ROOT, shot.source), "utf8") : "";
    if (!new RegExp(`^export const ${shot.export}\\b`, "m").test(source)) {
      problems.push(`${where}  the story shot ${id} shows (${shot.export} in ${shot.source}) is gone: point it at a story that shows the screen, then pnpm docs:shots ${id}`);
    }
    if (CONTENT === "content/docs" && !shown.has(id)) problems.push(`${where}  shot ${id} isn't shown on any page: show it with <Shot id="${id}" alt="…" /> or take it out of scripts/docs-shots.ts`);
  }
  if (CONTENT === "content/docs" && existsSync(join(ROOT, SHOTS_DIR))) {
    for (const f of readdirSync(join(ROOT, SHOTS_DIR))) {
      const id = /^(.+)-(light|dark)\.webp$/.exec(f)?.[1];
      if (!id || !shots[id]) problems.push(`${SHOTS_DIR}/${f}:1  isn't a rendered shot: run pnpm docs:shots, or delete it`);
    }
  }
}

async function main() {
  const reference = await checkReference();
  const files = existsSync(join(ROOT, CONTENT)) ? mdxFiles(CONTENT) : [];
  if (!files.length) problems.push(`${CONTENT}:1  no pages`);
  const pages = files.map(parse);
  const urls = new Set(pages.map((p) => p.url));
  const docsPage = (url: string) => urls.has(url.replace(/\/$/, "") || "/docs");

  checkFrontmatter(pages);
  checkMeta(files);
  if (reference) {
    checkComponents(pages, reference);
    checkScreens(pages, reference);
  }
  checkBold(pages);
  checkLinks(pages, docsPage);
  checkShots(pages);
  // Getting started: each step's Learn more has a page.
  for (const step of [...SETUP_STEPS, ...PURSUIT_STEPS, ...PATH_ROWS, DONE]) {
    if (!docsPage(`/docs/${step.learn.path}`)) problems.push(`${at("src/app/today/steps.ts", `path: "${step.learn.path}"`, `"${step.learn.path}"`)}  “${step.title}” learns at /docs/${step.learn.path}, which has no page`);
  }

  if (problems.length) {
    console.error(`Docs check: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`Docs check: all ${pages.length} pages are true to the code, and the reference is up to date.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
