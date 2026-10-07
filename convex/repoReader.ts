import { githubFetch } from "./githubApp";

// Reads one GitHub repository whole, not just its code: README, docs, product and planning documents, design and brand
// files, architecture maps, in-repo trackers, changelogs and the manifests that name its stack, with a small sample of
// its code as evidence of what was built, and its commit history (span, count, pace, who committed). Secret-looking
// files are skipped without a word, and credentials inside what is read are redacted before it goes to the AI. A
// repository too big for one listing is listed a folder at a time; what's read is capped in bytes and split into parts
// that each fit one AI call.

export type Kind = "readme" | "planning" | "docs" | "architecture" | "design" | "tracker" | "changelog" | "manifest" | "code";
export type TreeEntry = { path: string; type: string; size?: number; sha?: string };
export type Picked = { path: string; kind: Kind; size: number };

// Read order when the byte cap bites: what says most about the project first.
const ORDER: Kind[] = ["readme", "planning", "architecture", "design", "changelog", "tracker", "manifest", "docs", "code"];
// Bytes per file (code sample: less), files, bytes in all, bytes per AI call; a file bigger than `largest` isn't fetched.
export const CAPS = { file: 40_000, code: 12_000, codeFiles: 6, manifests: 20, files: 200, total: 400_000, part: 150_000, largest: 2_000_000 };

const base = (path: string) => path.split("/").pop()!.toLowerCase();
const ext = (path: string) => (base(path).includes(".") ? base(path).split(".").pop()! : "");

// Anything that could hold a secret: env files, keys and certificates, credentials, anything named like a key.
export function secretLooking(path: string) {
  const name = base(path);
  const dirs = path.toLowerCase().split("/").slice(0, -1);
  return (
    name.startsWith(".env") ||
    /key/.test(name) ||
    /secret|credential|passw(or)?d|service[-_]?account|firebase-adminsdk/.test(name) ||
    /\.(pem|p12|pfx|jks|keystore|crt|cer|der|asc|gpg|ppk|tfvars|tfstate|kdbx)$/.test(name) ||
    /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)/.test(name) ||
    [".npmrc", ".pypirc", ".netrc", ".pgpass", ".htpasswd", ".git-credentials", ".dockercfg"].includes(name) ||
    dirs.some((d) => [".ssh", ".aws", ".gnupg", ".docker", "secrets", "credentials"].includes(d))
  );
}

// Credentials inside files that are read: well-known key and token shapes, private key blocks (to the end of the text
// when cut short), user:password in URLs, and random-looking values given to names like *_KEY, *_SECRET, *_TOKEN or
// password (a placeholder like `your-api-key` is left alone). Each becomes [redacted].
const REDACTED = "[redacted]";
const SHAPES = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
  /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]*/g,
  /(?<![\w-])sk-[\w-]{20,}/g,
  /(?<![\w-])[rs]k_(?:live|test)_\w{10,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_\w{20,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bxox[abposr]-[\w-]{10,}/g,
  /\bAIza[\w-]{35}/g,
];
const random = (value: string) => {
  if (value.length < 16 || !/[a-z]/i.test(value) || !/\d/.test(value)) return false;
  const counts = new Map<string, number>();
  for (const c of value) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / value.length) * Math.log2(n / value.length);
  return bits >= 3;
};
export function redact(text: string) {
  let out = text;
  for (const shape of SHAPES) out = out.replace(shape, REDACTED);
  return out
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/?#]+:[^\s@/?#]+@/gi, `$1${REDACTED}@`)
    .replace(/\b(Bearer[ \t]+)([\w~+/-]+=*)/g, (m, lead: string, value: string) => (random(value) ? lead + REDACTED : m))
    .replace(/\b([\w.-]*(?:key|secret|token|passw(?:or)?d|pwd)[\w.-]*["']?[ \t]*(?:=>|:=|=|:)[ \t]*["'`]?)([\w~+/=-]+)/gi, (m, lead: string, value: string) =>
      random(value) ? lead + REDACTED : m,
    );
}

const SKIP_DIRS = new Set(["node_modules", "vendor", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "coverage", ".git", ".venv", "venv", "__pycache__", "target", "bin", "obj", ".turbo", ".cache", "storybook-static", ".vercel", ".wrangler", "_generated", "generated", ".idea", ".vscode"]);
const LOCKS = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "cargo.lock", "poetry.lock", "gemfile.lock", "composer.lock", "go.sum", "pipfile.lock", "uv.lock"]);
const BINARY = new Set("png jpg jpeg gif webp avif ico bmp tiff svg pdf zip gz tgz tar rar 7z woff woff2 ttf otf eot mp4 mov webm mp3 wav ogg psd ai sketch fig af afdesign xd bin exe dll so dylib jar class wasm db sqlite parquet".split(" "));
const DOC = new Set(["md", "mdx", "markdown", "txt", "rst", "adoc"]);
const CODE = new Set("ts tsx js jsx mjs cjs py go rs rb java kt swift cs php ex exs scala c cc cpp h hpp vue svelte dart sql lua sh".split(" "));
const MANIFESTS = new Set(
  "package.json pnpm-workspace.yaml cargo.toml go.mod pyproject.toml requirements.txt pipfile setup.py setup.cfg gemfile composer.json pom.xml build.gradle build.gradle.kts package.swift pubspec.yaml mix.exs deno.json deno.jsonc dockerfile docker-compose.yml docker-compose.yaml compose.yaml wrangler.toml wrangler.json wrangler.jsonc convex.json vercel.json netlify.toml fly.toml procfile makefile cmakelists.txt flake.nix serverless.yml".split(" "),
);
const ASSET_DIRS = /(^|\/)(brand|branding|design|designs|assets|logo|logos)\//i;

// Not worth reading: dependencies, build output, generated code, lockfiles, binaries.
export function skippable(path: string) {
  const parts = path.split("/");
  return parts.slice(0, -1).some((d) => SKIP_DIRS.has(d.toLowerCase())) || LOCKS.has(base(path)) || BINARY.has(ext(path)) || /\.min\.(js|css)$/.test(base(path));
}

export function kindOf(path: string): Kind | null {
  const name = base(path);
  const e = ext(path);
  const depth = path.split("/").length;
  const stem = name.replace(/\.[^.]+$/, "");
  if (depth === 1 && /^readme(\.|$)/.test(name)) return "readme";
  if (path === ".beads/issues.jsonl" || (/^(todo|backlog|tasks?|issues)([-_.].*)?$/.test(stem) && (DOC.has(e) || e === "jsonl" || e === "json"))) return "tracker";
  if (/^(changelog|changes|history|releases?|news)([-_.].*)?$/.test(stem) && (DOC.has(e) || e === "")) return "changelog";
  if (["c4", "likec4", "mmd", "mermaid", "puml", "plantuml", "dsl", "d2"].includes(e)) return "architecture";
  if (DOC.has(e) && (/^(architecture|arch|system[-_ ]?map)/.test(stem) || /(^|\/)architecture\//i.test(path))) return "architecture";
  if (DOC.has(e) && (/(^|[-_.])prd([-_.]|$)|^(product|roadmap|plan|plans|planning|spec|specs|requirements|vision|milestones?|brief|rfc|adr|build)([-_.].*)?$/.test(stem) || /(^|\/)(adrs?|rfcs?|decisions|plans?|planning|specs?|prd)\//i.test(path)))
    return "planning";
  if ((DOC.has(e) || e === "json" || e === "css") && (/^(design|brand|branding|style[-_]?guide|styleguide|design[-_]?tokens?|tokens)([-_.].*)?$/.test(stem) || ASSET_DIRS.test(path))) return "design";
  if (MANIFESTS.has(name) || /^(next|vite|astro|nuxt|svelte|remix|tailwind)\.config\.[a-z]+$/.test(name) || /\.csproj$/.test(name) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) return "manifest";
  if (DOC.has(e)) return "docs";
  if (CODE.has(e) && !/\.(test|spec|stories)\.|\.d\.ts$|\.config\./.test(name) && !/(^|\/)(tests?|__tests__|__mocks__|fixtures|examples?|migrations)\//i.test(path)) return "code";
  return null;
}

// Which files to read, in reading order, never a secret-looking one; and design assets by name. Code is a sample:
// mid-sized files from different folders, largest first, at most two per folder.
export function pickFiles(tree: TreeEntry[]) {
  const blobs = tree.filter((t) => t.type === "blob");
  const candidates = blobs
    .filter((t) => !secretLooking(t.path) && !skippable(t.path) && (t.size ?? 0) <= CAPS.largest)
    .flatMap((t): Picked[] => {
      const kind = kindOf(t.path);
      return kind ? [{ path: t.path, kind, size: t.size ?? 0 }] : [];
    });
  const byKind = (k: Kind) => candidates.filter((c) => c.kind === k).sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  const perFolder = new Map<string, number>();
  const code = candidates
    .filter((c) => c.kind === "code" && c.size >= 800 && c.size <= 60_000)
    .sort((a, b) => b.size - a.size)
    .filter((c) => {
      const dir = c.path.split("/").slice(0, -1).join("/");
      const n = perFolder.get(dir) ?? 0;
      perFolder.set(dir, n + 1);
      return n < 2;
    })
    .slice(0, CAPS.codeFiles);
  const picked = ORDER.flatMap((k) => (k === "code" ? code : k === "manifest" ? byKind(k).slice(0, CAPS.manifests) : byKind(k))).slice(0, CAPS.files);
  const assets = blobs.filter((t) => ASSET_DIRS.test(t.path) && BINARY.has(ext(t.path)) && !secretLooking(t.path)).map((t) => t.path).slice(0, 40);
  return { picked, assets };
}

export type Commit = { date: string; author: string; subject: string };
export type History = { count: number; first: string | null; last: string | null; byMonth: Record<string, number>; authors: { name: string; commits: number }[]; subjects: string[] };

// Span, count, pace (commits per month) and who committed, from the commits read (newest first) and the total count.
export function historyOf(commits: Commit[], count: number, first: string | null): History {
  const byMonth: Record<string, number> = {};
  for (const c of commits) byMonth[c.date.slice(0, 7)] = (byMonth[c.date.slice(0, 7)] ?? 0) + 1;
  const authors = new Map<string, number>();
  for (const c of commits) authors.set(c.author, (authors.get(c.author) ?? 0) + 1);
  const real = commits.filter((c) => !/^Merge (pull request|branch|remote-tracking)/.test(c.subject));
  const step = Math.max(1, Math.ceil(real.length / 150));
  return {
    count,
    first: first ?? commits.at(-1)?.date ?? null,
    last: commits[0]?.date ?? null,
    byMonth,
    authors: [...authors].map(([name, n]) => ({ name, commits: n })).sort((a, b) => b.commits - a.commits).slice(0, 8),
    subjects: real.filter((_, i) => i % step === 0).map((c) => c.subject.slice(0, 160)),
  };
}

export type RepoFile = { path: string; kind: Kind; text: string; cut: boolean };
export type RepoRead = {
  repo: string;
  name: string;
  url: string;
  private: boolean;
  fork: boolean;
  description: string | null;
  topics: string[];
  languages: string[];
  branch: string;
  history: History;
  files: RepoFile[];
  assets: string[];
  // Files listed but not read because the byte cap was reached.
  unread: string[];
  listedInParts: boolean;
};

async function json<T>(path: string, token: string): Promise<{ res: Response; body: T }> {
  const res = await githubFetch(path, { token });
  if (!res.ok) throw new Error(res.status === 404 ? "CareerBot can’t see that repository. Choose it on GitHub, then read it again." : "GitHub didn’t answer. Try again later.");
  return { res, body: (await res.json()) as T };
}

// The whole file list; a repository too big for one listing is listed a top-level folder at a time.
async function listFiles(token: string, repo: string, branch: string) {
  const whole = await json<{ tree: TreeEntry[]; truncated: boolean }>(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
  if (!whole.body.truncated) return { tree: whole.body.tree, inParts: false };
  const root = await json<{ tree: TreeEntry[] }>(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}`, token);
  const tree = root.body.tree.filter((t) => t.type === "blob");
  for (const dir of root.body.tree.filter((t) => t.type === "tree" && t.sha && !SKIP_DIRS.has(t.path.toLowerCase())).slice(0, 60)) {
    const sub = await json<{ tree: TreeEntry[] }>(`/repos/${repo}/git/trees/${dir.sha}?recursive=1`, token);
    tree.push(...sub.body.tree.map((t) => ({ ...t, path: `${dir.path}/${t.path}` })));
  }
  return { tree, inParts: true };
}

async function readHistory(token: string, repo: string, branch: string): Promise<History> {
  const commits: Commit[] = [];
  type Row = { commit: { author?: { name?: string; date?: string }; committer?: { date?: string }; message: string }; author?: { login?: string } | null };
  for (let page = 1; page <= 10; page++) {
    const { body } = await json<Row[]>(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100&page=${page}`, token);
    commits.push(
      ...body.map((c) => ({ date: c.commit.author?.date ?? c.commit.committer?.date ?? "", author: c.author?.login ?? c.commit.author?.name ?? "unknown", subject: redact(c.commit.message.split("\n")[0]) })),
    );
    if (body.length < 100) return historyOf(commits, commits.length, null);
  }
  // More than a thousand: the count and the first commit come from the last page of a one-per-page listing.
  const { res } = await json<Row[]>(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, token);
  const last = Number(res.headers.get("link")?.match(/[?&]page=(\d+)>; rel="last"/)?.[1] ?? commits.length);
  const oldest = await json<Row[]>(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1&page=${last}`, token);
  return historyOf(commits, last, oldest.body[0]?.commit.author?.date ?? null);
}

export async function readRepo(token: string, repo: string): Promise<RepoRead> {
  const { body: meta } = await json<{ full_name: string; name: string; html_url: string; private: boolean; fork: boolean; description: string | null; topics?: string[]; default_branch: string }>(`/repos/${repo}`, token);
  const { body: langs } = await json<Record<string, number>>(`/repos/${repo}/languages`, token);
  const branch = meta.default_branch;
  const listed = await listFiles(token, repo, branch);
  const { picked, assets } = pickFiles(listed.tree);
  // Up to the byte cap, in reading order; the rest is listed as unread.
  const capOf = (p: Picked) => (p.kind === "code" ? CAPS.code : CAPS.file);
  const toRead: Picked[] = [];
  const unread: string[] = [];
  let total = 0;
  for (const p of picked) {
    const bytes = Math.min(p.size, capOf(p));
    if (total + bytes > CAPS.total) unread.push(p.path);
    else {
      toRead.push(p);
      total += bytes;
    }
  }
  const files: RepoFile[] = [];
  for (let i = 0; i < toRead.length; i += 8) {
    const batch = toRead.slice(i, i + 8);
    const texts = await Promise.all(
      batch.map(async (p) => {
        const res = await githubFetch(`/repos/${repo}/contents/${p.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`, { token, headers: { Accept: "application/vnd.github.raw" } });
        return res.ok ? await res.text() : null;
      }),
    );
    batch.forEach((p, n) => {
      const text = texts[n];
      // Redacted with a margin past the cap, so a credential the cap cuts through is still whole when it's found.
      if (text !== null && text.trim()) files.push({ path: p.path, kind: p.kind, text: redact(text.slice(0, capOf(p) + 4_000)).slice(0, capOf(p)), cut: text.length > capOf(p) });
    });
  }
  return {
    repo: meta.full_name,
    name: meta.name,
    url: meta.html_url,
    private: meta.private,
    fork: meta.fork,
    description: meta.description,
    topics: meta.topics ?? [],
    languages: Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([l]) => l),
    branch,
    history: await readHistory(token, repo, branch),
    files,
    assets,
    unread,
    listedInParts: listed.inParts,
  };
}

// The files split into parts that each fit one AI call, in reading order. The first part carries the overview (README,
// planning, architecture...); every part is read with the repository's summary and history.
export function partsOf(files: RepoFile[], cap = CAPS.part) {
  const parts: RepoFile[][] = [];
  let size = 0;
  for (const f of files) {
    if (!parts.length || (size + f.text.length > cap && parts.at(-1)!.length)) {
      parts.push([]);
      size = 0;
    }
    parts.at(-1)!.push(f);
    size += f.text.length;
  }
  return parts.length ? parts : [[]];
}
