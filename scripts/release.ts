// Versions from change files. Every change a person would notice adds one `.changes/<slug>.yaml`:
//
//   bump: patch | minor | breaking
//   kind: new | better | fixed
//   note: One plain sentence for a person: what they can now do, or what's fixed.
//   selfHost: null, or Markdown steps someone who runs their own copy has to take (a list: one step per item)
//   shot: a docs screenshot id from src/app/docs/shots.json (optional)
//   issue: the GitHub issue it closes, as a number or a link (optional)
//   reviewed: true when a person checked a bump or selfHost the gate questions (optional)
//
// The next version is the last tag's, raised by the largest bump: before 1.0 a breaking or minor change raises the
// minor number and anything else the patch; from 1.0 breaking raises the major.
//
//   pnpm release:version                     the next version, then why
//   pnpm release:prepare --summary "…"       consumes .changes/, bumps package.json, writes releases.json and
//                                            CHANGELOG.md, sets compose.yaml's image versions, commits "Release vX.Y.Z"
//   pnpm changes:check                       (part of pnpm lint) a releasable change since the last release has its
//                                            own change file, with a bump and selfHost that fit it
//   tsx scripts/release.ts check-tag vX.Y.Z  (CI on a version tag) the tag, package.json and the computed version agree
//   tsx scripts/release.ts check-consistency vX.Y.Z
//                                            (the public repository's CI on a version tag, where the change files
//                                            aren't in the history) the tag, package.json, compose.yaml's images and
//                                            the newest release in releases.json and CHANGELOG.md agree
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { compareVersions } from "../convex/releases";
import { type Release, releaseMarkdown } from "./release-notes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHANGES = ".changes";
const MAP = "docs/architecture/model.c4";
const SHOTS = "src/app/docs/shots.json";
const RELEASES = "src/app/changelog/releases.json";

// ── Change files ──────────────────────────────────────────────────────────────────────────────────────────────────

export const BUMPS = ["patch", "minor", "breaking"] as const;
export type Bump = (typeof BUMPS)[number];
const KINDS = ["new", "better", "fixed"] as const;

// What a person reads: one line, one sentence, no code, commits, issues or pull requests.
export function wordsProblems(text: string, sentences: number) {
  const problems: string[] = [];
  if (/\n/.test(text)) problems.push("is one line");
  if (!/^["'(]?[A-Z0-9]/.test(text)) problems.push("starts with a capital letter");
  if (!/[.!?]["')]?$/.test(text)) problems.push("ends with a full stop");
  const count = text.split(/(?<=[.!?]["')]?)\s+(?=["'(]?[A-Z0-9])/).length;
  if (count !== sentences) problems.push(`should be ${sentences === 1 ? "one sentence" : `${sentences} sentences`} (found ${count}; a sentence starts with a capital letter)`);
  if (text.includes("`")) problems.push("has no code (backticks)");
  if (/#\d+\b|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/.test(text))
    problems.push("names no issue, pull request or commit");
  if (text.length > 160 * sentences) problems.push(`is at most ${160 * sentences} characters`);
  return problems;
}

export const changeSchema = z.strictObject({
  bump: z.enum(BUMPS),
  kind: z.enum(KINDS),
  note: z
    .string()
    .trim()
    .superRefine((note, ctx) => {
      for (const p of wordsProblems(note, 1)) ctx.addIssue({ code: "custom", message: `the note ${p}` });
    }),
  selfHost: z.string().trim().min(1, "selfHost is null or the steps").nullable(),
  shot: z.string().optional(),
  issue: z
    .union([
      z.number().int().positive(),
      z.string().regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/, "a GitHub issue link"),
    ])
    .optional(),
  reviewed: z.boolean().optional(),
});
export type Change = z.infer<typeof changeSchema> & { slug: string };

// One change file's text, checked. `shots` is the docs screenshot ids a `shot` must be one of.
export function parseChange(slug: string, text: string, shots: Set<string>): { change?: Change; problems: string[] } {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { problems: [`${slug}: not YAML (${e instanceof Error ? e.message.split("\n")[0] : e})`] };
  }
  const result = changeSchema.safeParse(raw);
  if (!result.success)
    return { problems: result.error.issues.map((i) => `${slug}: ${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`) };
  if (result.data.shot && !shots.has(result.data.shot))
    return { problems: [`${slug}: shot "${result.data.shot}" isn't in ${SHOTS}`] };
  return { change: { ...result.data, slug }, problems: [] };
}

function shotIds() {
  return new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, SHOTS), "utf8"))));
}

// Every change file waiting in .changes/, checked.
export function loadChanges(dir = join(ROOT, CHANGES)) {
  const changes: Change[] = [];
  const problems: string[] = [];
  if (!existsSync(dir)) return { changes, problems };
  const shots = shotIds();
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    if (!name.endsWith(".yaml")) {
      problems.push(`${CHANGES}/${name}: change files end in .yaml`);
      continue;
    }
    const parsed = parseChange(name.replace(/\.yaml$/, ""), readFileSync(join(dir, name), "utf8"), shots);
    problems.push(...parsed.problems.map((p) => `${CHANGES}/${p}`));
    if (parsed.change) changes.push(parsed.change);
  }
  return { changes, problems };
}

// ── Versions ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function parseVersion(v: string): [number, number, number] {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) throw new Error(`"${v}" isn't a version (X.Y.Z)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function largestBump(changes: { bump: Bump }[]): Bump | null {
  let largest: Bump | null = null;
  for (const c of changes) if (largest === null || BUMPS.indexOf(c.bump) > BUMPS.indexOf(largest)) largest = c.bump;
  return largest;
}

// The version after `current` for the largest bump; `current` itself when there's nothing to release.
export function nextVersion(current: string, bump: Bump | null): string {
  const [major, minor, patch] = parseVersion(current);
  if (bump === null) return `${major}.${minor}.${patch}`;
  if (bump === "breaking" && major > 0) return `${major + 1}.0.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor + 1}.0`;
}

// The newest version tag (vX.Y.Z) of `tags`, optionally only those older than `below`.
export function latestTag(tags: string[], below?: string): string | null {
  const versions = tags.map((t) => t.trim()).filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  const older = below ? versions.filter((t) => compareVersions(t, below) < 0) : versions;
  return older.sort(compareVersions).at(-1) ?? null;
}

// Why the next version is what it is: the version line, then a line per change, largest bump first.
export function versionReport(from: string, changes: Change[]) {
  const next = nextVersion(from, largestBump(changes));
  if (!changes.length) return `${next}\nNothing to release: no change files in ${CHANGES}/ since v${next}.`;
  const sorted = orderChanges(changes);
  const width = Math.max(...sorted.map((c) => c.slug.length));
  return [
    next,
    `${largestBump(changes)} from ${from}, because of ${changes.length} change file${changes.length === 1 ? "" : "s"}:`,
    ...sorted.map(
      (c) => `  ${c.bump.padEnd(8)} ${c.slug.padEnd(width)}  ${c.kind}: ${c.note}${c.selfHost ? " (self-hosters act)" : ""}`,
    ),
  ].join("\n");
}

function orderChanges(changes: Change[]) {
  return [...changes].sort((a, b) => BUMPS.indexOf(b.bump) - BUMPS.indexOf(a.bump) || a.slug.localeCompare(b.slug));
}

const LIST_ITEM = /^(?:[-*]|\d+\.)\s+/;

// A change file's selfHost as the release's steps, each one bullet wherever the notes show them (/changelog, Settings,
// Updates, CHANGELOG.md, the GitHub Release): a Markdown list becomes its items, each with the lines indented under it,
// so a list doesn't end up inside a bullet of its own; a paragraph after the list is a step too. Steps that don't
// start with a list stay one step, as written.
export function selfHostSteps(markdown: string): string[] {
  const text = markdown.replaceAll("\r\n", "\n").trim();
  if (!LIST_ITEM.test(text)) return [text];
  const steps: { lines: string[]; indent: number }[] = [];
  let fence = false;
  for (const line of text.split("\n")) {
    const item = fence ? null : LIST_ITEM.exec(line);
    const step = steps.at(-1);
    if (item) steps.push({ lines: [line.slice(item[0].length)], indent: item[0].length });
    else if (!step || (!fence && line.trim() && !/^\s/.test(line) && step.lines.at(-1) === "")) steps.push({ lines: [line], indent: 0 });
    else step.lines.push(line.replace(new RegExp(`^ {0,${step.indent}}`), ""));
    if (line.trim().startsWith("```")) fence = !fence;
  }
  return steps.map((s) => s.lines.join("\n").trim());
}

// The release notes entry for `version` from its change files.
export function releaseEntry(version: string, date: string, summary: string, changes: Change[]): Release {
  const sorted = orderChanges(changes);
  const notes = (kind: (typeof KINDS)[number]) => sorted.filter((c) => c.kind === kind).map((c) => c.note);
  const selfHost = sorted.flatMap((c) => (c.selfHost ? selfHostSteps(c.selfHost) : []));
  return {
    version,
    date,
    summary,
    new: notes("new"),
    better: notes("better"),
    fixed: notes("fixed"),
    selfHost,
    needsAction: selfHost.length > 0,
    // A screenshot once, described by the first change that shows it.
    shots: sorted
      .filter((c, i) => c.shot && sorted.findIndex((d) => d.shot === c.shot) === i)
      .map((c) => ({ id: c.shot as string, alt: c.note })),
  };
}

export function changelog(releases: Release[]) {
  return [
    "# Changelog",
    "",
    "What changed in each version of CareerBot, newest first. The same notes are at https://careerbot.dev/changelog.",
    "",
    releases.map(releaseMarkdown).join("\n"),
  ].join("\n");
}

// compose.yaml's image defaults (careerbot-web and careerbot-setup) set to `version`.
export function composeWithVersion(compose: string, version: string) {
  return compose.replace(/(careerbot-(?:web|setup):\$\{CAREERBOT_VERSION:-)[^}]+/g, `$1${version}`);
}

// What disagrees with a version tag in a release's files: package.json's version, compose.yaml's two image defaults,
// and the newest release in releases.json and CHANGELOG.md. The public repository's CI checks a tag with this: its
// history holds exports, not the change files a release consumed.
export function consistencyProblems(tag: string, files: { packageJson: string; compose: string; releases: string; changelog: string }) {
  const version = tag.replace(/^v/, "");
  const problems: string[] = [];
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) problems.push(`${tag} isn't a version tag (vX.Y.Z)`);
  const named = (where: string, found: string | undefined) => {
    if (found !== version) problems.push(`${where} ${found === undefined ? "names no version" : `is ${found}`}, not ${version}`);
  };
  const json = (text: string) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  };
  named("package.json's version", z.object({ version: z.string() }).safeParse(json(files.packageJson)).data?.version);
  for (const image of ["web", "setup"])
    named(`compose.yaml's careerbot-${image} default`, new RegExp(`careerbot-${image}:\\$\\{CAREERBOT_VERSION:-([^}]+)\\}`).exec(files.compose)?.[1]);
  named(`the newest release in ${RELEASES}`, z.array(z.object({ version: z.string() })).safeParse(json(files.releases)).data?.[0]?.version);
  named("the newest release in CHANGELOG.md", /^## (\S+) · /m.exec(files.changelog)?.[1]);
  return problems;
}

// ── The gate ──────────────────────────────────────────────────────────────────────────────────────────────────────

// Paths whose change reaches a person or a self-hosted copy. Tests and stories don't.
export function isReleasable(path: string) {
  if (/\.(test|stories)\.[cm]?[jt]sx?$/.test(path)) return false;
  return /^(src|convex|docker)\//.test(path) || ["compose.yaml", "Dockerfile", ".env.example"].includes(path);
}

// The screens, tables and functions the system map names.
export function mapNames(c4: string) {
  const names = new Set<string>();
  for (const m of c4.matchAll(/^\s*\w+\s*=\s*screen\s+'([^']*)'/gm)) names.add(`screen ${m[1]}`);
  for (const m of c4.matchAll(/^\s*\w+\s*=\s*table\s+'([^']*)'/gm)) names.add(`table ${m[1]}`);
  for (const m of c4.matchAll(/^\s*functions\s+'([^']*)'/gm))
    for (const f of m[1].split(",")) if (f.trim()) names.add(`function ${f.trim()}`);
  return names;
}

export function addedToMap(before: string, after: string) {
  const old = mapNames(before);
  return [...mapNames(after)].filter((n) => !old.has(n));
}

export type Changed = { status: string; path: string };

// What's wrong with a branch's changes since the last release: `changed` is every path changed, `added` the change
// files it adds, `mapAdded` what the system map gained.
export function gateProblems({
  changed,
  depsChanged,
  added,
  mapAdded,
}: {
  changed: Changed[];
  depsChanged: boolean;
  added: Change[];
  mapAdded: string[];
}) {
  const releasable = [...changed.map((c) => c.path).filter(isReleasable), ...(depsChanged ? ["package.json (dependencies)"] : [])];
  if (!releasable.length) return [];
  if (!added.length) {
    const shown = releasable.slice(0, 5).join(", ") + (releasable.length > 5 ? ` and ${releasable.length - 5} more` : "");
    return [`${shown} changed since the last release, with no new change file in ${CHANGES}/. Add one (docs/BUILD.md, "Releases").`];
  }
  if (added.some((c) => c.reviewed)) return [];
  const problems: string[] = [];
  if (mapAdded.length && largestBump(added) === "patch")
    problems.push(
      `The system map gains ${mapAdded.slice(0, 5).join(", ")}${mapAdded.length > 5 ? " and more" : ""}, but the change files only say patch. Make the change minor, or set reviewed: true if patch is right.`,
    );
  const setup = changed.map((c) => c.path).filter((p) => p === ".env.example" || p === "compose.yaml");
  if (setup.length && added.every((c) => c.selfHost === null))
    problems.push(
      `${setup.join(" and ")} changed, but no change file says what self-hosters do (selfHost). Add the steps, or set reviewed: true if they need none.`,
    );
  return problems;
}

// ── Git ───────────────────────────────────────────────────────────────────────────────────────────────────────────

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}

function tryGit(...args: string[]) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

function packageJson(text = readFileSync(join(ROOT, "package.json"), "utf8")) {
  return JSON.parse(text) as { version: string; dependencies?: Record<string, string> };
}

// The last release: the newest version tag in HEAD's history, or the commit after it that set package.json to a newer
// version that isn't tagged yet ("Release vX.Y.Z" here; in the public repository, the export carrying it).
function lastRelease() {
  const tag = latestTag(git("tag", "--merged", "HEAD", "--list", "v*").split("\n"));
  if (!tag) return null;
  const version = packageJson().version;
  if (compareVersions(version, tag) > 0) {
    const pattern = `"version":\\s*"${version.replaceAll(".", "\\.")}"`;
    const commit = tryGit("log", "--format=%H", `-G${pattern}`, `${tag}..HEAD`, "--", "package.json")?.split("\n").filter(Boolean).at(-1);
    if (commit) return { tag, ref: commit, version, untagged: true };
  }
  return { tag, ref: tag, version: tag.slice(1), untagged: false };
}

// Where this branch left master: CHANGES_BASE (CI sets it to a pull request's base), otherwise origin/master on any
// branch but master.
function forkPoint() {
  const branch = tryGit("rev-parse", "--abbrev-ref", "HEAD");
  const against = process.env.CHANGES_BASE || (branch !== "master" ? "origin/master" : "");
  return against ? tryGit("merge-base", "HEAD", against) : null;
}

function changedSince(base: string): Changed[] {
  const tracked = git("diff", "--name-status", "--no-renames", base)
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [status, path] = l.split("\t");
      return { status: status[0], path };
    });
  const untracked = git("ls-files", "--others", "--exclude-standard")
    .split("\n")
    .filter(Boolean)
    .map((path) => ({ status: "A", path }));
  return [...tracked, ...untracked];
}

// The change files consumed by releases after `from`: each one deleted since, as it was just before.
function consumedSince(from: string) {
  const log = git("log", "--format=>%H", "--diff-filter=D", "--name-only", `${from}..HEAD`, "--", `${CHANGES}/`);
  const shots = shotIds();
  const changes: Change[] = [];
  const problems: string[] = [];
  let commit = "";
  for (const line of log.split("\n").filter(Boolean)) {
    if (line.startsWith(">")) commit = line.slice(1);
    else if (line.endsWith(".yaml")) {
      const parsed = parseChange(line.slice(CHANGES.length + 1, -5), git("show", `${commit}^:${line}`), shots);
      problems.push(...parsed.problems);
      if (parsed.change) changes.push(parsed.change);
    }
  }
  return { changes, problems };
}

// ── Commands ──────────────────────────────────────────────────────────────────────────────────────────────────────

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function pending() {
  const { changes, problems } = loadChanges();
  if (problems.length) fail(`Change files with problems:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  return changes;
}

function version() {
  const last = lastRelease();
  if (!last) fail("No version tag (vX.Y.Z) in this branch's history.");
  console.log(versionReport(last.version, pending()));
  if (last.untagged) console.log(`(Release v${last.version} is committed but not tagged yet.)`);
}

function option(args: string[], name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function prepare(args: string[]) {
  const dry = args.includes("--dry-run");
  const summary = option(args, "--summary")?.trim();
  const date = option(args, "--date") ?? new Date().toISOString().slice(0, 10);
  if (!summary) fail('usage: pnpm release:prepare --summary "Two plain sentences on what this release brings." [--date YYYY-MM-DD] [--dry-run]');
  const summaryProblems = wordsProblems(summary, 2);
  if (summaryProblems.length) fail(`The summary ${summaryProblems.join(", ")}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date ${date} isn't YYYY-MM-DD.`);
  if (!dry && git("status", "--porcelain", "--untracked-files=no")) fail("Commit or set aside your changes first: the release commit holds only the release.");

  const last = lastRelease();
  if (!last) fail("No version tag (vX.Y.Z) in this branch's history.");
  if (last.untagged) fail(`Release v${last.version} is committed but not tagged. Tag it (git tag v${last.version}) before the next one.`);
  const changes = pending();
  if (!changes.length) fail(`Nothing to release: no change files in ${CHANGES}/ since ${last.tag}.`);
  const next = nextVersion(last.version, largestBump(changes));

  const releasesPath = join(ROOT, RELEASES);
  const existing: Release[] = existsSync(releasesPath) ? JSON.parse(readFileSync(releasesPath, "utf8")) : [];
  if (existing.some((r) => r.version === next)) fail(`${RELEASES} already has ${next}.`);
  const releases = [releaseEntry(next, date, summary, changes), ...existing];

  console.log(versionReport(last.version, changes));
  if (dry) {
    console.log(`\n${releaseMarkdown(releases[0])}`);
    return;
  }

  const pkgPath = join(ROOT, "package.json");
  const pkg = readFileSync(pkgPath, "utf8");
  writeFileSync(pkgPath, pkg.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
  writeFileSync(releasesPath, `${JSON.stringify(releases, null, 2)}\n`);
  writeFileSync(join(ROOT, "CHANGELOG.md"), changelog(releases));
  const composePath = join(ROOT, "compose.yaml");
  if (existsSync(composePath)) writeFileSync(composePath, composeWithVersion(readFileSync(composePath, "utf8"), next));
  for (const c of changes) rmSync(join(ROOT, CHANGES, `${c.slug}.yaml`));

  git("add", "-A", "--", "package.json", RELEASES, "CHANGELOG.md", "compose.yaml", CHANGES);
  git("commit", "-q", "-m", `Release v${next}`);
  console.log(`\nCommitted "Release v${next}". Tag and push it to release: git tag v${next} && git push origin master v${next}`);
}

function check() {
  const { changes, problems } = loadChanges();
  if (problems.length) fail(`Change files with problems:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  const inRepo = tryGit("rev-parse", "--is-inside-work-tree") !== null;
  const last = inRepo ? lastRelease() : null;
  const forked = inRepo ? forkPoint() : null;
  // A history with no version tag (the public repository before its first tagged release) still has a pull request's
  // base to compare with.
  if (!last && !forked) {
    console.log("changes:check: no version tag or branch point in this history, so nothing to compare with.");
    return;
  }
  // The last release, or where the branch left master when that's later.
  const base = !last ? (forked as string) : forked && tryGit("merge-base", "--is-ancestor", last.ref, forked) !== null ? forked : last.ref;
  const changed = changedSince(base);
  const addedPaths = new Set(changed.filter((c) => c.status === "A").map((c) => c.path));
  const added = changes.filter((c) => addedPaths.has(`${CHANGES}/${c.slug}.yaml`));
  const oldPkg = tryGit("show", `${base}:package.json`);
  const depsChanged =
    oldPkg !== null && JSON.stringify(packageJson(oldPkg).dependencies ?? {}) !== JSON.stringify(packageJson().dependencies ?? {});
  const mapAdded = changed.some((c) => c.path === MAP)
    ? addedToMap(tryGit("show", `${base}:${MAP}`) ?? "", readFileSync(join(ROOT, MAP), "utf8"))
    : [];
  const found = gateProblems({ changed, depsChanged, added, mapAdded });
  const since = !last || base !== last.ref ? `this branch left master at ${base.slice(0, 9)}` : last.untagged ? `Release v${last.version}` : last.tag;
  if (found.length) fail(`changes:check (since ${since}):\n${found.map((p) => `  ${p}`).join("\n")}`);
}

function checkTag(tag: string | undefined) {
  if (!tag) fail("usage: tsx scripts/release.ts check-tag vX.Y.Z");
  const version = packageJson().version;
  if (tag !== `v${version}`) fail(`The tag ${tag} isn't package.json's version (${version}). Tag the "Release v${version}" commit, made by pnpm release:prepare.`);
  const left = pending();
  if (left.length) fail(`${left.length} change file(s) still in ${CHANGES}/: run pnpm release:prepare before tagging.`);
  const previous = latestTag(git("tag", "--merged", "HEAD", "--list", "v*").split("\n"), version);
  if (!previous) {
    console.log(`${tag}: package.json agrees; no earlier version tag to compute from.`);
    return;
  }
  const { changes, problems } = consumedSince(previous);
  if (problems.length) fail(`Change files with problems:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  const computed = nextVersion(previous, largestBump(changes));
  if (computed !== version)
    fail(`${tag} doesn't match its change files: ${previous} with them is ${computed}.\n${versionReport(previous.slice(1), changes)}`);
  console.log(`${tag}: the tag, package.json and the change files since ${previous} agree.`);
}

function checkConsistency(tag: string | undefined) {
  if (!tag) fail("usage: tsx scripts/release.ts check-consistency vX.Y.Z");
  const read = (path: string) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : "");
  const found = consistencyProblems(tag, {
    packageJson: read("package.json"),
    compose: read("compose.yaml"),
    releases: read(RELEASES),
    changelog: read("CHANGELOG.md"),
  });
  if (found.length) fail(`${tag} doesn't match the release it tags:\n${found.map((p) => `  ${p}`).join("\n")}`);
  console.log(`${tag}: package.json, compose.yaml, ${RELEASES} and CHANGELOG.md all name ${tag.slice(1)}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "version") version();
  else if (command === "prepare") prepare(args);
  else if (command === "check") check();
  else if (command === "check-tag") checkTag(args[0] ?? process.env.GITHUB_REF_NAME);
  else if (command === "check-consistency") checkConsistency(args[0] ?? process.env.GITHUB_REF_NAME);
  else fail('usage: tsx scripts/release.ts version | prepare --summary "…" | check | check-tag vX.Y.Z | check-consistency vX.Y.Z');
}
