// @vitest-environment node
import { expect, test } from "vitest";
import {
  addedToMap,
  type Change,
  changelog,
  composeWithVersion,
  consistencyProblems,
  gateProblems,
  latestTag,
  nextVersion,
  parseChange,
  releaseEntry,
  selfHostSteps,
} from "./release";
import { releaseMarkdown } from "./release-notes";

const change = (over: Partial<Change> = {}): Change => ({
  slug: "x",
  bump: "patch",
  kind: "fixed",
  note: "Something works again.",
  selfHost: null,
  ...over,
});

test("before 1.0 breaking and minor raise the minor number, patch the patch", () => {
  expect(nextVersion("0.7.0", "patch")).toBe("0.7.1");
  expect(nextVersion("0.7.3", "minor")).toBe("0.8.0");
  expect(nextVersion("0.7.3", "breaking")).toBe("0.8.0");
  expect(nextVersion("0.9.2", "minor")).toBe("0.10.0");
});

test("from 1.0 breaking raises the major number and resets the rest", () => {
  expect(nextVersion("1.4.2", "breaking")).toBe("2.0.0");
  expect(nextVersion("1.4.2", "minor")).toBe("1.5.0");
  expect(nextVersion("1.4.2", "patch")).toBe("1.4.3");
});

test("nothing to release keeps the version; a non-version is refused", () => {
  expect(nextVersion("v0.7.0", null)).toBe("0.7.0");
  expect(() => nextVersion("0.7", "patch")).toThrow();
});

test("the last tag compares versions as numbers, ignores other tags and can be limited to older ones", () => {
  const tags = ["v0.9.0", "v0.10.0", "v0.4.4", "launch", "v1.0.0-rc1", ""];
  expect(latestTag(tags)).toBe("v0.10.0");
  expect(latestTag(tags, "0.10.0")).toBe("v0.9.0");
  expect(latestTag(["nightly"])).toBeNull();
});

test("a change file is checked: fields, one plain sentence, and a shot that exists", () => {
  const shots = new Set(["today"]);
  const ok = parseChange("demo", "bump: minor\nkind: new\nnote: You can try the demo.\nselfHost: null\nshot: today\n", shots);
  expect(ok.problems).toEqual([]);
  expect(ok.change).toMatchObject({ slug: "demo", bump: "minor", shot: "today" });

  const problems = (text: string) => parseChange("c", text, shots).problems.join("\n");
  expect(problems("bump: major\nkind: new\nnote: A thing.\nselfHost: null\n")).toMatch(/bump/);
  expect(problems("bump: patch\nkind: new\nnote: A thing.\n")).toMatch(/selfHost/);
  expect(problems("bump: patch\nkind: new\nnote: A thing.\nselfHost: null\nextra: 1\n")).toMatch(/extra/);
  expect(problems("bump: patch\nkind: new\nnote: Fixed it. Then more.\nselfHost: null\n")).toMatch(/one sentence/);
  expect(problems("bump: patch\nkind: new\nnote: fixed the thing\nselfHost: null\n")).toMatch(/capital.*full stop|full stop/);
  expect(problems("bump: patch\nkind: new\nnote: Fixed in 3739ca4.\nselfHost: null\n")).toMatch(/commit/);
  expect(problems("bump: patch\nkind: new\nnote: \"Fixes #12.\"\nselfHost: null\n")).toMatch(/issue/);
  expect(problems("bump: patch\nkind: new\nnote: A thing.\nselfHost: null\nissue: 12\n")).toBe("");
  expect(problems("bump: patch\nkind: new\nnote: A thing.\nselfHost: null\nissue: PROJ-12\n")).toMatch(/issue/);
  expect(problems("bump: patch\nkind: new\nnote: Runs `pnpm x`.\nselfHost: null\n")).toMatch(/backticks/);
  expect(problems("bump: patch\nkind: new\nnote: A thing.\nselfHost: null\nshot: gone\n")).toMatch(/shot "gone"/);
  expect(problems("bump: [\n")).toMatch(/not YAML/);
});

test("the release entry sorts notes into new, better and fixed, largest bump first, and needs action with selfHost steps", () => {
  const entry = releaseEntry("0.8.0", "2026-10-06", "One. Two.", [
    change({ slug: "b", kind: "fixed", note: "B fixed." }),
    change({ slug: "a", kind: "fixed", note: "A fixed." }),
    change({ slug: "z", bump: "minor", kind: "new", note: "Z is new.", selfHost: "Set `X` in .env.", shot: "today" }),
    change({ slug: "y", kind: "better", note: "Y is better.", shot: "today" }),
  ]);
  expect(entry).toEqual({
    version: "0.8.0",
    date: "2026-10-06",
    summary: "One. Two.",
    new: ["Z is new."],
    better: ["Y is better."],
    fixed: ["A fixed.", "B fixed."],
    selfHost: ["Set `X` in .env."],
    needsAction: true,
    shots: [{ id: "today", alt: "Z is new." }],
  });
  expect(releaseEntry("0.8.1", "2026-10-07", "One. Two.", [change()]).needsAction).toBe(false);
});

test("a selfHost list becomes one step per item, so the notes never put a list inside a bullet", () => {
  const list = ["- Back up first.", "- Docker Compose: run", "  ```", "  - not an item", "  ```", "  then reload.", "- Coolify: deploy again."].join("\n");
  expect(selfHostSteps(list)).toEqual(["Back up first.", "Docker Compose: run\n```\n- not an item\n```\nthen reload.", "Coolify: deploy again."]);
  expect(selfHostSteps("1. One.\n2. Two.\n   More of two.\n\nAfter the list.")).toEqual(["One.", "Two.\nMore of two.", "After the list."]);
  // Steps that aren't a list stay as written, code and all.
  const prose = "Add this to `.env`:\n\n```\nX=1\n```";
  expect(selfHostSteps(`\n${prose}\n`)).toEqual([prose]);

  const entry = releaseEntry("0.8.0", "2026-10-06", "One. Two.", [change({ selfHost: list }), change({ slug: "y", selfHost: prose })]);
  expect(entry.selfHost).toHaveLength(4);
  const notes = releaseMarkdown(entry);
  expect(notes).not.toMatch(/^\s*- - /m);
  expect(notes).toContain("- Back up first.\n- Docker Compose: run\n  ```\n  - not an item\n  ```\n  then reload.\n- Coolify: deploy again.\n- Add this");
});

test("compose's image versions follow the release; other lines stay", () => {
  const compose = [
    "    image: ghcr.io/careerbotdev/careerbot-web:${CAREERBOT_VERSION:-0.7.0}",
    "    image: ghcr.io/careerbotdev/careerbot-setup:${CAREERBOT_VERSION:-0.7.0}",
    "    image: ghcr.io/get-convex/convex-backend:${CONVEX_VERSION:-1.2.3}",
  ].join("\n");
  expect(composeWithVersion(compose, "0.8.0")).toBe(compose.replaceAll(":-0.7.0}", ":-0.8.0}"));
});

// A release's files as release:prepare writes them for `version`, the one before it 0.7.0.
function releaseFiles(version: string) {
  const releases = [releaseEntry(version, "2026-10-06", "One. Two.", [change()]), releaseEntry("0.7.0", "2026-10-01", "One. Two.", [change()])];
  return {
    packageJson: JSON.stringify({ name: "careerbot", version }),
    compose: composeWithVersion("    image: ghcr.io/o/careerbot-web:${CAREERBOT_VERSION:-0.7.0}\n    image: ghcr.io/o/careerbot-setup:${CAREERBOT_VERSION:-0.7.0}\n", version),
    releases: JSON.stringify(releases),
    changelog: changelog(releases),
  };
}

test("a version tag agrees with package.json, both compose images and the newest release in the notes", () => {
  expect(consistencyProblems("v0.8.0", releaseFiles("0.8.0"))).toEqual([]);
  // A tag on an export that doesn't carry its release (or an older one) is named in every file that disagrees.
  expect(consistencyProblems("v0.8.1", releaseFiles("0.8.0"))).toHaveLength(5);
  expect(consistencyProblems("0.8.0", releaseFiles("0.8.0"))).toEqual(["0.8.0 isn't a version tag (vX.Y.Z)"]);
});

test("each release file that falls out of step is named on its own", () => {
  const files = releaseFiles("0.8.0");
  const setupBehind = files.compose.replace("careerbot-setup:${CAREERBOT_VERSION:-0.8.0}", "careerbot-setup:${CAREERBOT_VERSION:-0.7.0}");
  expect(consistencyProblems("v0.8.0", { ...files, compose: setupBehind })).toEqual(["compose.yaml's careerbot-setup default is 0.7.0, not 0.8.0"]);
  expect(consistencyProblems("v0.8.0", { ...files, packageJson: "{}" })).toEqual(["package.json's version names no version, not 0.8.0"]);
  const notesBehind = JSON.stringify(JSON.parse(files.releases).slice(1));
  expect(consistencyProblems("v0.8.0", { ...files, releases: notesBehind })[0]).toMatch(/newest release in .*releases\.json is 0\.7\.0/);
  expect(consistencyProblems("v0.8.0", { ...files, changelog: changelog(JSON.parse(notesBehind)) })).toEqual([
    "the newest release in CHANGELOG.md is 0.7.0, not 0.8.0",
  ]);
});

const map = (body: string) => `model {\n  careerbot = system 'CareerBot' {\n${body}\n  }\n}`;

test("the map's new screens, tables and functions are found by name, not by moved lines", () => {
  const before = map(`    today = screen 'Today' {\n      metadata {\n        functions 'a:one, a:two'\n      }\n    }\n    tUsers = table 'users' {}`);
  const after = map(
    `    tUsers = table 'users' {}\n    tNotes = table 'notes' {}\n    today = screen 'Today' {\n      metadata {\n        functions 'a:two, a:one, a:three'\n      }\n    }\n    demo = screen 'Demo' {}`,
  );
  expect(addedToMap(before, after).sort()).toEqual(["function a:three", "screen Demo", "table notes"]);
  expect(addedToMap(after, before)).toEqual([]);
});

test("the gate: releasable paths need a new change file; tests, stories and docs don't", () => {
  const changed = (...paths: string[]) => paths.map((path) => ({ status: "M", path }));
  const quiet = { depsChanged: false, mapAdded: [] };
  expect(gateProblems({ changed: changed("docs/BUILD.md", "src/app/x.test.ts", "src/app/X.stories.tsx", "scripts/a.ts"), added: [], ...quiet })).toEqual([]);
  expect(gateProblems({ changed: changed("src/app/Today.tsx"), added: [], ...quiet })[0]).toMatch(/src\/app\/Today.tsx.*no new change file/);
  expect(gateProblems({ changed: changed("Dockerfile"), added: [], ...quiet })).toHaveLength(1);
  expect(gateProblems({ changed: [], added: [], depsChanged: true, mapAdded: [] })[0]).toMatch(/dependencies/);
  expect(gateProblems({ changed: changed("convex/notes.ts"), added: [change()], ...quiet })).toEqual([]);
});

test("the gate: a patch that grows the map, or a setup change with no selfHost, is flagged unless reviewed", () => {
  const mapAdded = ["table notes"];
  const changed = [{ status: "M", path: "convex/schema.ts" }];
  expect(gateProblems({ changed, depsChanged: false, added: [change()], mapAdded })[0]).toMatch(/table notes.*patch/);
  expect(gateProblems({ changed, depsChanged: false, added: [change(), change({ bump: "minor" })], mapAdded })).toEqual([]);
  expect(gateProblems({ changed, depsChanged: false, added: [change({ reviewed: true })], mapAdded })).toEqual([]);

  const setup = [{ status: "M", path: ".env.example" }];
  expect(gateProblems({ changed: setup, depsChanged: false, added: [change()], mapAdded: [] })[0]).toMatch(/\.env\.example.*selfHost/);
  expect(gateProblems({ changed: setup, depsChanged: false, added: [change({ selfHost: "Add `X` to .env." })], mapAdded: [] })).toEqual([]);
  expect(gateProblems({ changed: setup, depsChanged: false, added: [change({ reviewed: true })], mapAdded: [] })).toEqual([]);
});
