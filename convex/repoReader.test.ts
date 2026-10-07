import { afterEach, expect, test, vi } from "vitest";
import { CAPS, historyOf, partsOf, pickFiles, readRepo, redact, secretLooking } from "./repoReader";

afterEach(() => vi.unstubAllGlobals());

const blob = (path: string, size = 2000) => ({ path, type: "blob", size });

test("picks what says most about a project, in reading order, and never a secret-looking file", () => {
  const tree = [
    blob("README.md"),
    blob("docs/PRD.md"),
    blob("docs/guides/setup.md"),
    blob("DESIGN.md"),
    blob("brand/logo.svg"),
    blob("docs/architecture/model.c4"),
    blob(".beads/issues.jsonl", 900_000),
    blob("CHANGELOG.md"),
    blob("package.json"),
    blob(".github/workflows/ci.yml"),
    blob("src/app/page.tsx", 9000),
    blob("src/app/layout.tsx", 5000),
    blob("src/app/other.tsx", 4000),
    blob("convex/schema.ts", 20_000),
    blob("convex/schema.test.ts", 20_000),
    // Secret-looking, skipped without a word.
    blob(".env"),
    blob(".env.example"),
    blob("certs/server.pem"),
    blob("config/apiKeys.ts", 9000),
    blob("deploy/credentials.json"),
    blob(".ssh/config"),
    blob("docs/secret-plan.md"),
    // Not worth reading.
    blob("node_modules/react/README.md"),
    blob("pnpm-lock.yaml", 400_000),
    blob("dist/app.js", 90_000),
    blob("convex/_generated/api.d.ts"),
    blob("public/hero.png"),
    { path: "src", type: "tree" },
  ];
  const { picked, assets } = pickFiles(tree);
  expect(picked.map((p) => [p.path, p.kind])).toEqual([
    ["README.md", "readme"],
    ["docs/PRD.md", "planning"],
    ["docs/architecture/model.c4", "architecture"],
    ["DESIGN.md", "design"],
    ["CHANGELOG.md", "changelog"],
    [".beads/issues.jsonl", "tracker"],
    ["package.json", "manifest"],
    [".github/workflows/ci.yml", "manifest"],
    ["docs/guides/setup.md", "docs"],
    // A code sample: largest first, at most two per folder, never tests.
    ["convex/schema.ts", "code"],
    ["src/app/page.tsx", "code"],
    ["src/app/layout.tsx", "code"],
  ]);
  expect(assets).toEqual(["brand/logo.svg"]);
  for (const p of [".env", ".env.local", "a/b/server.pem", "x/id_rsa", "openrouterKey.ts", "credentials.json", ".aws/config", "config/secrets/db.yml", ".npmrc", "prod.tfvars"])
    expect(secretLooking(p), p).toBe(true);
  for (const p of ["README.md", "docs/PRD.md", "src/app/page.tsx", "DESIGN.md", "package.json"]) expect(secretLooking(p), p).toBe(false);
});

test("history: span, count, pace per month and who committed; merges left out of the subjects", () => {
  const h = historyOf(
    [
      { date: "2026-03-02T10:00:00Z", author: "octo", subject: "Add billing" },
      { date: "2026-03-01T10:00:00Z", author: "octo", subject: "Merge pull request #4 from octo/x" },
      { date: "2026-01-05T10:00:00Z", author: "pal", subject: "Fix login" },
      { date: "2025-11-20T10:00:00Z", author: "octo", subject: "First commit" },
    ],
    4,
    null,
  );
  expect(h).toEqual({
    count: 4,
    first: "2025-11-20T10:00:00Z",
    last: "2026-03-02T10:00:00Z",
    byMonth: { "2026-03": 2, "2026-01": 1, "2025-11": 1 },
    authors: [{ name: "octo", commits: 3 }, { name: "pal", commits: 1 }],
    subjects: ["Add billing", "Fix login", "First commit"],
  });
});

test("large files are split into parts that each fit one call, in reading order", () => {
  const f = (path: string, n: number) => ({ path, kind: "docs" as const, text: "x".repeat(n), cut: false });
  expect(partsOf([f("a", 60), f("b", 50), f("c", 30), f("d", 200)], 100).map((p) => p.map((x) => x.path))).toEqual([["a"], ["b", "c"], ["d"]]);
  expect(partsOf([])).toEqual([[]]);
});

// A fake GitHub for one repository: a listing too big for one call (so it's listed a folder at a time), and files.
function fakeGithub(files: Record<string, string>, opts: { truncated?: boolean } = {}) {
  const asked: string[] = [];
  const root = [...new Set(Object.keys(files).map((p) => p.split("/")[0]))].map((top) =>
    files[top] !== undefined ? { path: top, type: "blob", size: files[top].length } : { path: top, type: "tree", sha: `sha-${top}` },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      asked.push(url.pathname + url.search);
      const p = url.pathname;
      if (p === "/repos/octo/trail") return Response.json({ full_name: "octo/trail", name: "trail", html_url: "https://github.com/octo/trail", private: true, fork: false, description: "Trail maps", default_branch: "main" });
      if (p === "/repos/octo/trail/languages") return Response.json({ TypeScript: 900, CSS: 100 });
      if (p === "/repos/octo/trail/git/trees/main")
        return url.searchParams.get("recursive")
          ? Response.json({ tree: Object.entries(files).map(([path, t]) => ({ path, type: "blob", size: t.length })), truncated: !!opts.truncated })
          : Response.json({ tree: root, truncated: false });
      const sub = p.match(/^\/repos\/octo\/trail\/git\/trees\/sha-(.+)$/);
      if (sub)
        return Response.json({ tree: Object.entries(files).filter(([path]) => path.startsWith(`${sub[1]}/`)).map(([path, t]) => ({ path: path.slice(sub[1].length + 1), type: "blob", size: t.length })), truncated: false });
      if (p === "/repos/octo/trail/commits") return Response.json([{ commit: { author: { name: "Octo", date: "2026-02-01T00:00:00Z" }, message: "Add maps\n\nbody" }, author: { login: "octo" } }]);
      const content = p.match(/^\/repos\/octo\/trail\/contents\/(.+)$/);
      if (content && files[decodeURIComponent(content[1])] !== undefined) return new Response(files[decodeURIComponent(content[1])]);
      return new Response("not found", { status: 404 });
    }),
  );
  return asked;
}

test("a repository too big for one listing is read a folder at a time; secret files are never fetched", async () => {
  const asked = fakeGithub({ "README.md": "# Trail", "docs/PRD.md": "Plan", ".env": "TOKEN=abc", "src/deploy/key.ts": "x".repeat(2000), "src/app/map.ts": "y".repeat(2000) }, { truncated: true });
  const read = await readRepo("t0k", "octo/trail");
  expect(read).toMatchObject({ repo: "octo/trail", private: true, languages: ["TypeScript", "CSS"], branch: "main", listedInParts: true, history: { count: 1, first: "2026-02-01T00:00:00Z" } });
  expect(read.files.map((f) => f.path)).toEqual(["README.md", "docs/PRD.md", "src/app/map.ts"]);
  expect(asked.some((a) => a.includes(".env") || a.includes("key.ts"))).toBe(false);
  expect(asked).toContain("/repos/octo/trail/git/trees/sha-docs?recursive=1");
});

test("reading stops at the byte cap; what's left is listed as unread, and each file is cut to its own cap", async () => {
  const big = "z".repeat(CAPS.file + 10);
  const files: Record<string, string> = { "README.md": big };
  for (let i = 0; i < 12; i++) files[`docs/n${String(i).padStart(2, "0")}.md`] = big;
  fakeGithub(files);
  const read = await readRepo("t0k", "octo/trail");
  const perFile = CAPS.file;
  expect(read.files.length).toBe(Math.floor(CAPS.total / perFile));
  expect(read.files[0]).toMatchObject({ path: "README.md", cut: true });
  expect(read.files[0].text.length).toBe(CAPS.file);
  expect(read.unread.length).toBe(13 - read.files.length);
});

test("credentials in what's read become [redacted]; placeholders, code and ordinary text stay as written", () => {
  // Built from parts so no scanner mistakes the fixtures for real credentials.
  const r = "9fQ2xLm7Rt4vKp8Zw3Nc6Hy1Bd5Gs0Ja";
  const leaks: [string, string][] = [
    [`OPENROUTER_API_KEY=${"sk"}-or-v1-${r}`, "OPENROUTER_API_KEY=[redacted]"],
    [`key: "${"sk"}-ant-api03-${r}"`, 'key: "[redacted]"'],
    [`token ${"ghp"}_${r}${r.slice(0, 4)}`, "token [redacted]"],
    [`${"gho"}_${r}${r.slice(0, 4)} and ${"github"}_pat_11AB${r}`, "[redacted] and [redacted]"],
    [`aws_access_key_id = ${"AKIA"}IOSFODNN7EXAMPLE`, "aws_access_key_id = [redacted]"],
    [`temp ${"ASIA"}ABCDEFGHIJ012345 ok`, "temp [redacted] ok"],
    [`SLACK=${"xoxb"}-1234567890-${r}`, "SLACK=[redacted]"],
    [`maps ${"AIza"}Sy${r}a`, "maps [redacted]"],
    [`stripe ${"sk"}_live_${r}`, "stripe [redacted]"],
    [`Authorization: Bearer ${"eyJ"}hbGciOiJIUzI1NiJ9.${"eyJ"}zdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U`, "Authorization: Bearer [redacted]"],
    [`curl -H "Authorization: Bearer ${r}"`, 'curl -H "Authorization: Bearer [redacted]"'],
    [`DATABASE_URL=postgres://app:${r}@db.example.com:5432/app`, "DATABASE_URL=postgres://[redacted]@db.example.com:5432/app"],
    [`CLIENT_SECRET: '${r}'`, "CLIENT_SECRET: '[redacted]'"],
    [`"webhookSecret": "whsec_${r}"`, '"webhookSecret": "[redacted]"'],
    [`db_password=${r}`, "db_password=[redacted]"],
    [`-----BEGIN OPENSSH ${"PRIVATE"} KEY-----\n${r}\n${r}\n-----END OPENSSH ${"PRIVATE"} KEY-----\nafter`, "[redacted]\nafter"],
    [`before\n-----BEGIN ${"PRIVATE"} KEY-----\n${r}\n${r}`, "before\n[redacted]"],
  ];
  for (const [text, want] of leaks) expect(redact(text), text).toBe(want);
  const ordinary = [
    "# Trail\nTrail maps for hikers. Offline maps; share routes.",
    "OPENROUTER_API_KEY=your-openrouter-key",
    "const apiKey = process.env.OPENROUTER_API_KEY;",
    "export const tokens = { spacing: 4, radius: 2 };",
    "items.map((i) => <Row key={i.id} />)",
    'password: v.string(), key: "sidebar-open"',
    "Visit https://github.com/octo/trail and http://localhost:3000/login?next=/app",
    "Uses scikit-learn and the sk-learn wrapper; task-runner v2.",
    "The public key is in docs; see -----BEGIN PUBLIC KEY----- blocks for format.",
  ];
  for (const text of ordinary) expect(redact(text), text).toBe(text);
});
