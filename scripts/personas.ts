// Test personas (`pnpm personas:run <slug>`): seeds one fictional person from testdata/personas/<slug>/ into a fresh
// workspace on a local Convex backend, runs the real AI steps through the same functions the app calls, and scores what
// came out against the person's answer-key.json. The report goes to testdata/personas/<slug>/runs/<timestamp>.md
// (gitignored), with the raw results beside it as .json.
//
// Where it runs: only a backend on this machine, `npx convex dev --local` (CONVEX_DEPLOYMENT local:… or anonymous:…)
// or a self-hosted one at localhost (CONVEX_SELF_HOSTED_URL). Every cloud deployment is refused, unless one is named
// with --allow-deployment <name> for a dedicated test project and CONVEX_DEPLOYMENT, or CONVEX_DEPLOY_KEY (that
// deployment's own key), points at it; the deployments in REFUSED never run, even then. The backend needs this
// branch's functions (`npx convex dev --once`, or `npx convex deploy` with the key) and MASTER_KEY_V1 set for keys
// to be stored.
//
// Steps: profile, budgets and settings; the goals narrative read (limits and directions approved); each story read in
// the order the person would type it, its roles and facts approved; each project read from its README, it and its
// facts approved; the conflict check; directions' positioning and
// criteria (approved), and more directions suggested (left proposed); the postings added by hand at their companies,
// rated Targets and ranked; a base resume, a resume per direction, a resume tailored to each posting and a cover letter
// for the best fitting one. Company discovery spends Apollo credits and is off unless --discovery is given.
//
// Spending: the workspace's AI budget is set to --budget (default $3), so CareerBot itself stops at the cap (a call
// that would go over pauses instead). The OpenRouter key comes from OPENROUTER_API_KEY and is never printed; without
// one, the run refuses to start unless --seed-only is given, which seeds and stops before any AI step.
//
// Flags: --budget <usd>, --seed-only, --model <openrouter id> (every task), --writer <openrouter id> (resumes and
// letters), --discovery (with APOLLO_API_KEY), --apollo-credits <n> (default 25), --allow-deployment <name>.
//
// `pnpm personas:run <slug> --rescore` scores every saved run of the persona again against its answer-key.json as it is
// now, from the raw results beside each report, and writes each report again: no backend, no keys, no AI calls.
//
// The functions are called with `convex run`, as the persona's user (--identity) for public ones; the user and its
// workspace come from admin:createTrialWorkspace, the postings from admin:addTrialPosting. Projects are read by
// admin:readTrialProject from their README with the same project read GitHub repositories get, since reading a
// repository needs the GitHub App.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { type ResumeDoc, toPlain } from "../convex/resumeDoc";

const exec = promisify(execFile);
// The owner's and the hosted deployments: never seeded, whatever the flags say (the demo script refuses them too). Their
// names are in scripts/refused-deployments.json, which stays in the private repo; a copy without it refuses none by name.
const REFUSED_FILE = join(process.cwd(), "scripts", "refused-deployments.json");
export const REFUSED: string[] = existsSync(REFUSED_FILE) ? (JSON.parse(readFileSync(REFUSED_FILE, "utf8")) as string[]) : [];
const BIN = join(process.cwd(), "node_modules", ".bin", "convex");
const POLL_MS = 5000;
const WAIT_MS = 25 * 60_000;
const MAX_DIRECTION_RESUMES = 3;
const DEFAULT_MODEL = "google/gemini-3.8-flash";
const DEFAULT_WRITER = "anthropic/claude-sonnet-5.5";

// ---- The payload and its answer key ----

type Persona = {
  slug: string;
  name: string;
  oneLine: string;
  workspaceName: string;
  profile: { name: string; email: string; phone: string; location: string; links: string[] };
  budgets: { aiMonthlyUsd: number; apolloMonthlyCredits: number; apolloMode: "on" | "onRequest" | "paused" };
  settings?: { resumeLength?: "one" | "two" | "full"; models?: { default?: string; writer?: string } };
  stories: { file: string; title: string }[];
  goals: string;
  projects: { file: string; repo: string; title: string }[];
  companies: { name: string; domain: string; why: string; fictional: boolean }[];
  postings: { file: string; company: string; title: string; location: string; url: string; expect: "fits" | "filtered"; why: string }[];
};
type Match = string[][];
type AnswerKey = {
  facts: { id: string; story: string; statement: string; match: Match }[];
  contradictions: { id: string; about: string; stories: string[]; values: string[]; match: Match }[];
  noInflation: { id: string; story: string; claim: string; truth: string; forbidden: string[] }[];
  // A number they only guessed at: a sentence that states it (match) must say it's an estimate (one of hedge).
  estimates?: { id: string; story: string; said: string; match: Match; hedge: string[] }[];
  directions: { fit: { id: string; name: string; match: Match }[]; avoid: { id: string; name: string; match: Match }[] };
  limits: { id: string; kind: string; statement: string; match: Match; filters: string[] }[];
  humanReview: string[];
};

// ---- Rows as read back (only the fields used here) ----

type Id = string;
type Job = { _id: Id; kind: string; status: string; pausedFor?: string; error?: string; args: Record<string, unknown>; result?: unknown; _creationTime: number; startedAt?: number };
type Item = { _id: Id; kind: string; status: string; data: Record<string, unknown>; roleKey?: string; runId?: Id; sources: { narrativeId: Id }[]; _creationTime: number };
type Posting = { _id: Id; title: string; companyId: Id; location?: string; fit?: { directionId: Id; level: string; score?: number; reason?: string }[]; brief?: { job: string; forYou: string }; details?: Record<string, unknown> };
type Rank = { postingId: Id; directionId?: Id; state: string; meetsPreferences?: boolean; level?: string; score?: number; payMin?: number; setup?: string; places?: string; clearance?: string; visa?: boolean; travel?: number };
type Resume = { _id: Id; directionId?: Id; postingId?: Id; posting?: string; toReview?: boolean; doc?: ResumeDoc; text?: string; model: string; requirements?: { requirement: string; strength: string }[]; _creationTime: number };
type Letter = { pursuitId: Id; paragraphs: { text: string }[]; model?: string; _creationTime: number };
type Usage = { purpose: string; model?: string; costUsd?: number; reservedUsd?: number; state?: string };
type Company = { _id: Id; name: string; domain?: string; found: { via: string }[] };
type Dump = { jobs: Job[]; items: Item[]; postings: Posting[]; ranks: Rank[]; resumes: Resume[]; letters: Letter[]; usage: Usage[]; companies: Company[]; narratives: { _id: Id; title: string }[] };

// ---- Flags and safety ----

function fail(message: string): never {
  console.error(`personas: ${message}`);
  process.exit(1);
}

type Flags = {
  slug: string;
  budget: number;
  seedOnly: boolean;
  rescore: boolean;
  discovery: boolean;
  apolloCredits: number;
  model?: string;
  writer?: string;
  allowDeployment?: string;
};

function flags(argv: string[]): Flags {
  const valued = /^--(budget|model|writer|apollo-credits|allow-deployment)$/;
  const slug = argv.find((a, i) => !a.startsWith("--") && !valued.test(argv[i - 1] ?? ""));
  const value = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const budget = Number(value("budget") ?? 3);
  if (!slug) fail("usage: pnpm personas:run <slug> [--budget 3] [--seed-only] [--model id] [--writer id] [--discovery] [--apollo-credits 25] [--allow-deployment name] | <slug> --rescore");
  if (!Number.isFinite(budget) || budget <= 0) fail("--budget must be a positive number of dollars.");
  return {
    slug,
    budget,
    seedOnly: argv.includes("--seed-only"),
    rescore: argv.includes("--rescore"),
    discovery: argv.includes("--discovery"),
    apolloCredits: Number(value("apollo-credits") ?? 25),
    model: value("model"),
    writer: value("writer"),
    allowDeployment: value("allow-deployment"),
  };
}

// The backend `convex run` will use, resolved the way the CLI resolves it (a deploy key, then the environment, then
// .env.local), and refused unless it's on this machine or the dedicated test deployment named with --allow-deployment.
// A deploy key is used only when it's that deployment's own key ("<type>:<name>|…"), since it points the CLI at it.
function deployment(allow?: string) {
  const refused = (s: string) => REFUSED.some((r) => s.includes(r));
  if (allow && refused(allow)) fail(`refusing ${allow}: it's never used for test personas.`);
  const deployKey = process.env.CONVEX_DEPLOY_KEY?.trim();
  if (deployKey) {
    const named = deployKey.split("|")[0];
    if (!allow || !/^[a-z]+:/.test(named) || named.split(":")[1] !== allow)
      fail("CONVEX_DEPLOY_KEY is set and isn't the key of the deployment named with --allow-deployment. Unset it, or name its deployment.");
    return { target: named, deployKey };
  }
  const file = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const setting = (name: string) => (process.env[name] ?? file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1])?.replace(/#.*$/, "").trim() || undefined;
  const selfHosted = setting("CONVEX_SELF_HOSTED_URL");
  const named = setting("CONVEX_DEPLOYMENT");
  if (selfHosted) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(selfHosted).hostname)) fail(`refusing ${selfHosted}: a self-hosted backend must be on localhost.`);
    return { target: selfHosted };
  }
  if (!named) fail("no local backend. Start one with `npx convex dev --local` (or a self-hosted one at localhost), then run again.");
  if (refused(named)) fail(`refusing ${named}: it's never used for test personas.`);
  const local = /^(local|anonymous):/.test(named);
  if (!local && !(allow && named.endsWith(`:${allow}`)))
    fail(`refusing ${named}: test personas run only on a backend on this machine. A dedicated test deployment needs --allow-deployment <name>.`);
  return { target: named };
}

// ---- Calling Convex ----

let childEnv = process.env;
let identity = "";

// Runs the Convex CLI and returns what it printed as JSON (as text with `raw`).
async function convex(args: string[], { secret = false, retries = 0, raw = false } = {}): Promise<unknown> {
  const quiet = args[0] === "run" ? ["--codegen", "disable", "--typecheck", "disable"] : [];
  for (let attempt = 0; ; attempt++) {
    try {
      const { stdout } = await exec(BIN, [...args, ...quiet], { env: childEnv, maxBuffer: 512 * 1024 * 1024 });
      const out = stdout.trim();
      if (raw) return out;
      return out ? JSON.parse(out) : null;
    } catch (e) {
      if (attempt < retries) {
        await sleep(2000);
        continue;
      }
      // A call carrying a key says only that it failed, so nothing it was given can be echoed.
      if (secret) throw new Error(`${args[1]} failed.`);
      const err = e as { stderr?: string; message: string };
      const lines = (err.stderr || err.message).trim().split("\n").filter(Boolean);
      throw new Error(`${args[1]}: ${lines.slice(-4).join(" ")}`);
    }
  }
}
const as = (fn: string, args: Record<string, unknown> = {}, opts?: { secret?: boolean }) => convex(["run", fn, JSON.stringify(args), "--identity", identity], opts);
const admin = (fn: string, args: Record<string, unknown>) => convex(["run", fn, JSON.stringify(args)]);
const query = <T>(code: string) => convex(["run", "--inline-query", code], { retries: 2 }) as Promise<T>;
async function sleep(ms: number) {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

class BudgetStop extends Error {}

// Waits until the workspace has no job queued, running or paused. A job paused for the AI budget ends the run's AI
// steps (BudgetStop); one paused for Apollo credits is left paused.
async function idle(ws: Id, label: string) {
  const until = Date.now() + WAIT_MS;
  for (;;) {
    const open = await query<Job[]>(
      `return (await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", ${JSON.stringify(ws)})).collect()).filter((j) => j.status === "queued" || j.status === "running" || j.status === "paused")`,
    );
    if (open.some((j) => j.status === "paused" && j.pausedFor === "openrouter")) throw new BudgetStop(`${label}: the AI budget ran out`);
    if (!open.some((j) => j.status !== "paused")) return;
    if (Date.now() > until) throw new Error(`${label}: still running after ${WAIT_MS / 60_000} minutes (${open.map((j) => j.kind).join(", ")})`);
    await sleep(POLL_MS);
  }
}

async function job(ws: Id, id: unknown, label: string) {
  if (!id) throw new Error(`${label}: didn't start (one was already running)`);
  await idle(ws, label);
  const j = await query<Job>(`return await ctx.db.get(${JSON.stringify(id)})`);
  if (j.status === "failed") throw new Error(`${label} failed: ${j.error ?? "no reason given"}`);
  return j;
}

const itemsOf = (ws: Id, kind: string) =>
  query<Item[]>(`return await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", ${JSON.stringify(ws)}).eq("kind", ${JSON.stringify(kind)})).collect()`);

async function approve(items: Item[]) {
  for (const i of items) await as("extract:review", { id: i._id, status: "approved" });
  return items.length;
}

async function dump(ws: Id): Promise<Dump> {
  const w = JSON.stringify(ws);
  return query<Dump>(`
    const ws = ${w};
    const all = (table, index) => ctx.db.query(table).withIndex(index, (q) => q.eq("workspaceId", ws)).collect();
    return {
      jobs: await all("jobs", "by_workspace"),
      items: await all("items", "by_workspace_kind_status"),
      postings: await all("postings", "by_workspace"),
      ranks: (await ctx.db.query("roleRanks").withIndex("by_ranked", (q) => q.eq("workspaceId", ws)).collect()),
      resumes: await all("resumes", "by_workspace"),
      letters: (await ctx.db.query("letters").collect()).filter((l) => l.workspaceId === ws),
      usage: (await ctx.db.query("usage").withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", ws).eq("service", "openrouter")).collect()),
      companies: await all("companies", "by_workspace"),
      narratives: (await all("narratives", "by_workspace")).map((n) => ({ _id: n._id, title: n.title })),
    };`);
}

// ---- The run ----

type Step = { name: string; ok: boolean; note: string; ms: number };

async function main() {
  const opts = flags(process.argv.slice(2));
  const dir = join("testdata", "personas", opts.slug);
  if (!existsSync(join(dir, "persona.json"))) fail(`no persona at ${dir}`);
  const persona = JSON.parse(readFileSync(join(dir, "persona.json"), "utf8")) as Persona;
  const key = JSON.parse(readFileSync(join(dir, "answer-key.json"), "utf8")) as AnswerKey;
  const text = (file: string) => readFileSync(join(dir, file), "utf8").trim();
  if (opts.rescore) return rescore(dir, persona, key, opts);
  const { target, deployKey } = deployment(opts.allowDeployment);
  const openrouter = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouter && !opts.seedOnly) fail("OPENROUTER_API_KEY isn't set. Set it to run the AI steps, or pass --seed-only to seed and stop before them.");
  const apollo = process.env.APOLLO_API_KEY?.trim();
  if (opts.discovery && !apollo) fail("--discovery needs APOLLO_API_KEY.");
  const aiSteps = !!openrouter && !opts.seedOnly;
  const model = opts.model ?? persona.settings?.models?.default ?? DEFAULT_MODEL;
  const writer = opts.writer ?? persona.settings?.models?.writer ?? DEFAULT_WRITER;

  childEnv = { ...process.env, ...(deployKey || target.startsWith("http") ? {} : { CONVEX_DEPLOYMENT: target }) };
  for (const k of ["CONVEX_DEPLOY_KEY", "OPENROUTER_API_KEY", "APOLLO_API_KEY"]) delete childEnv[k];
  if (deployKey) childEnv.CONVEX_DEPLOY_KEY = deployKey;

  const spec = (await convex(["function-spec"])) as { functions: { identifier?: string }[] };
  const deployed = new Set(spec.functions.map((f) => f.identifier?.replace(/\.js:/, ":")));
  for (const fn of ["admin:createTrialWorkspace", "admin:addTrialPosting", "admin:readTrialProject", "letters:write"])
    if (!deployed.has(fn)) fail(`${target} doesn't have ${fn}. Push this branch's functions to it first: npx convex dev --once`);
  // Only the names are kept; the values never leave this line.
  const envNames = String(await convex(["env", "list"], { secret: true, raw: true })).split("\n").map((l) => l.split("=")[0]);
  if (aiSteps && !envNames.includes("MASTER_KEY_V1")) fail(`${target} has no MASTER_KEY_V1, so it can't store the OpenRouter key. Set one with npx convex env set.`);

  const started = new Date();
  const stamp = started.toISOString().replace(/[:.]/g, "-");
  console.log(`personas: ${persona.name} on ${target}, AI budget $${opts.budget}${aiSteps ? "" : " (seeding only)"}`);

  const { userId, workspaceId: ws } = (await admin("admin:createTrialWorkspace", { name: `${persona.workspaceName} ${stamp}`, email: persona.profile.email })) as { userId: Id; workspaceId: Id };
  identity = JSON.stringify({ subject: `${userId}|personas`, issuer: "careerbot-personas", tokenIdentifier: `careerbot-personas|${userId}` });

  const steps: Step[] = [];
  let stopped: string | null = null;
  const step = async (name: string, run: () => Promise<string>) => {
    if (stopped) return steps.push({ name, ok: false, note: "skipped", ms: 0 });
    const t = Date.now();
    process.stdout.write(`  ${name}… `);
    try {
      const note = await run();
      steps.push({ name, ok: true, note, ms: Date.now() - t });
      console.log(note || "done");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      steps.push({ name, ok: false, note: message, ms: Date.now() - t });
      console.log(`failed: ${message}`);
      if (e instanceof BudgetStop) stopped = message;
    }
  };

  // Seed: everything a person types or sets, no AI.
  const ids = { goals: "" as Id, stories: [] as { id: Id; file: string }[], postings: [] as { id: Id; file: string; expect: string; companyId: Id }[] };
  await step("Profile, budgets and settings", async () => {
    const { name, email, phone, location, links } = persona.profile;
    await as("profile:save", { name, email, phone, location, links });
    const apolloBudget = opts.discovery ? { apolloMonthlyCredits: opts.apolloCredits, apolloMode: "onRequest" } : { apolloMonthlyCredits: 0, apolloMode: "paused" };
    await as("budgets:set", { aiMonthlyUsd: opts.budget, ...apolloBudget });
    if (persona.settings?.resumeLength) await as("resume:setRecordLength", { length: persona.settings.resumeLength });
    await as("discovery:setNamed", { named: persona.companies.filter((c) => !c.fictional).map((c) => c.domain) });
    return `AI budget $${opts.budget} (the persona's own is $${persona.budgets.aiMonthlyUsd}), Apollo ${opts.discovery ? `${opts.apolloCredits} credits` : "paused"}`;
  });
  await step("Narratives", async () => {
    ids.goals = (await as("narratives:create", { kind: "goals", title: "Goals", body: text(persona.goals) })) as Id;
    for (const s of persona.stories) ids.stories.push({ id: (await as("narratives:create", { kind: "career", title: s.title, body: text(s.file) })) as Id, file: s.file });
    return `goals, ${persona.stories.length} stories`;
  });
  await step("Postings at Target companies", async () => {
    for (const p of persona.postings) {
      const company = persona.companies.find((c) => c.name === p.company);
      if (!company) throw new Error(`${p.file}: ${p.company} isn't in companies`);
      const r = (await admin("admin:addTrialPosting", {
        workspaceId: ws, company: { name: company.name, domain: company.domain }, title: p.title, location: p.location,
        remote: /remote/i.test(p.location), url: p.url, text: text(p.file),
      })) as { companyId: Id; postingId: Id };
      ids.postings.push({ id: r.postingId, file: p.file, expect: p.expect, companyId: r.companyId });
    }
    for (const c of new Set(ids.postings.map((p) => p.companyId))) await as("enrich:rate", { id: c, value: "excited" });
    return `${ids.postings.length} postings`;
  });

  if (aiSteps) {
    await step("OpenRouter key and models", async () => {
      const saved = (await as("openrouterKey:save", { key: openrouter }, { secret: true })) as { ok: boolean; message?: string };
      if (!saved.ok) throw new Error(saved.message ?? "OpenRouter didn't accept the key.");
      await as("aiSettings:setDefault", { model });
      for (const task of ["resume", "letter"]) await as("aiSettings:set", { task, model: writer });
      return `${model}; resumes and letters ${writer}`;
    });
    await step("Read goals (limits and directions approved)", async () => {
      const j = await job(ws, await as("goals:start", { narrativeId: ids.goals }), "goals");
      const mine = [...(await itemsOf(ws, "limit")), ...(await itemsOf(ws, "direction"))].filter((i) => i.runId === j._id && i.status === "proposed");
      const n = await approve(mine);
      await idle(ws, "limit rules");
      return `${n} approved`;
    });
    for (const s of ids.stories)
      await step(`Read ${s.file}`, async () => {
        const j = await job(ws, await as("extract:start", { narrativeId: s.id }), s.file);
        const mine = (await Promise.all(["role", "fact", "project"].map((k) => itemsOf(ws, k)))).flat().filter((i) => i.runId === j._id && i.status === "proposed");
        const n = await approve(mine);
        await idle(ws, "after review");
        return `${mine.filter((i) => i.kind === "fact").length} facts, ${mine.filter((i) => i.kind === "role").length} roles; ${n} approved`;
      });
    // Each repository read from its README, the way GitHub repositories are read; the project and its facts approved.
    for (const p of persona.projects)
      await step(`Read project ${p.title}`, async () => {
        const repo = new URL(p.repo).pathname.replace(/^\/|\/$/g, "");
        const j = await job(ws, await admin("admin:readTrialProject", { workspaceId: ws, repo, readme: text(p.file) }), p.title);
        const mine = (await Promise.all(["project", "fact"].map((k) => itemsOf(ws, k)))).flat().filter((i) => i.runId === j._id && i.status === "proposed");
        const n = await approve(mine);
        await idle(ws, "after review");
        return `${mine.filter((i) => i.kind === "fact").length} facts; ${n} approved`;
      });
    await step("Conflict check", async () => {
      const j = await job(ws, await as("conflicts:start"), "conflict check");
      return `${(await itemsOf(ws, "conflict")).filter((i) => i.runId === j._id).length} questions`;
    });
    await step("Directions: positioning and criteria (approved)", async () => {
      await job(ws, await as("directions:detail"), "direction detail");
      let n = 0;
      for (const d of (await itemsOf(ws, "direction")).filter((i) => i.status === "approved"))
        for (const part of ["detail", "criteria"] as const)
          if (d.data[`${part}Status`] === "proposed") {
            await as("directions:approvePart", { id: d._id, part });
            n++;
          }
      return `${n} parts approved`;
    });
    await step("Suggest more directions (left proposed)", async () => {
      const j = await job(ws, await as("directions:suggest"), "suggest directions");
      return `${(await itemsOf(ws, "direction")).filter((i) => i.runId === j._id).length} suggested`;
    });
    await step("Rank the postings", async () => {
      await as("roles:start");
      await idle(ws, "roles pass");
      return "";
    });
    await step("Base resume", async () => {
      await job(ws, await as("resume:start"), "base resume");
      return "";
    });
    const approvedDirections = async () => (await itemsOf(ws, "direction")).filter((d) => d.status === "approved" && d.data.detailStatus === "approved");
    await step("Direction resumes", async () => {
      const ds = (await approvedDirections()).slice(0, MAX_DIRECTION_RESUMES);
      for (const d of ds) await job(ws, await as("resume:start", { directionId: d._id }), `resume for ${String(d.data.name)}`);
      return `${ds.length}`;
    });
    // Each posting is tailored from the direction it ranked best for (else the first direction).
    const bestDirection = async (postingId: Id) => {
      const ds = await approvedDirections();
      const p = await query<Posting>(`return await ctx.db.get(${JSON.stringify(postingId)})`);
      const fits = (p.fit ?? []).filter((f) => ds.some((d) => d._id === f.directionId)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      return { directionId: fits[0]?.directionId ?? ds[0]?._id, score: fits[0]?.score ?? -1 };
    };
    for (const p of ids.postings)
      await step(`Tailor to ${p.file}`, async () => {
        const { directionId } = await bestDirection(p.id);
        if (!directionId) throw new Error("no approved direction with positioning");
        await job(ws, await as("resume:start", { directionId, postingId: p.id }), "tailored resume");
        return "";
      });
    await step("Cover letter", async () => {
      const fits = await Promise.all(ids.postings.filter((p) => p.expect === "fits").map(async (p) => ({ ...p, ...(await bestDirection(p.id)) })));
      const best = fits.sort((a, b) => b.score - a.score)[0];
      if (!best?.directionId) throw new Error("no fitting posting with a direction");
      const pursuitId = await as("pursuits:start", { postingId: best.id, directionId: best.directionId });
      await job(ws, await as("letters:write", { pursuitId }), "cover letter");
      return best.file;
    });
    if (opts.discovery)
      await step("Company discovery (Apollo)", async () => {
        const saved = (await as("apolloKey:save", { key: apollo }, { secret: true })) as { ok: boolean; message?: string };
        if (!saved.ok) throw new Error(saved.message ?? "Apollo didn't accept the key.");
        await as("discovery:start");
        await idle(ws, "discovery");
        return "";
      });
  }

  const data = await dump(ws);
  const spent = (await as("budgets:status")) as { aiSpentUsd: number };
  const report = render({ persona, key, opts: { ...opts, model, writer, aiSteps }, target, ws, started, finished: new Date(), steps, stopped, data, ids, spentUsd: spent.aiSpentUsd });
  const runs = join(dir, "runs");
  mkdirSync(runs, { recursive: true });
  writeFileSync(join(runs, `${stamp}.md`), report.markdown);
  writeFileSync(join(runs, `${stamp}.json`), JSON.stringify({ workspaceId: ws, deployment: target, steps, data }, null, 2));
  console.log(`personas: ${report.summary}`);
  console.log(`personas: report at ${join(runs, `${stamp}.md`)}`);
}

// Every saved run scored again (--rescore). What a report shows beyond the results is read back from the run itself:
// the stories and postings by their titles, the budget and models from the steps that set them, the spending from its
// calls, and when it ended from how long its steps took.
function rescore(dir: string, persona: Persona, key: AnswerKey, opts: Flags) {
  const runs = join(dir, "runs");
  const files = existsSync(runs) ? readdirSync(runs).filter((f) => f.endsWith(".json")).sort() : [];
  if (!files.length) fail(`no saved runs in ${runs}`);
  for (const file of files) {
    const run = JSON.parse(readFileSync(join(runs, file), "utf8")) as { workspaceId: Id; deployment: string; steps: Step[]; data: Dump };
    const { steps, data } = run;
    const stamp = file.replace(/\.json$/, "");
    const started = new Date(stamp.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, "T$1:$2:$3.$4Z"));
    const note = (name: string) => steps.find((s) => s.name === name)?.note ?? "";
    const models = note("OpenRouter key and models").match(/^(\S+); resumes and letters (\S+)$/);
    const companyOf = new Map(data.companies.map((c) => [c._id, c.name]));
    const ids = {
      stories: persona.stories.flatMap((s) => data.narratives.filter((n) => n.title === s.title).map((n) => ({ id: n._id, file: s.file }))),
      postings: persona.postings.flatMap((p) => data.postings.filter((x) => x.title === p.title && companyOf.get(x.companyId) === p.company).map((x) => ({ id: x._id, file: p.file, expect: p.expect }))),
    };
    const held = data.usage.filter((u) => u.state === "reserved" || u.state === "indeterminate").reduce((s, u) => s + (u.reservedUsd ?? 0), 0);
    const report = render({
      persona,
      key,
      opts: { ...opts, budget: Number(note("Profile, budgets and settings").match(/AI budget \$([\d.]+)/)?.[1] ?? opts.budget), model: models?.[1] ?? "?", writer: models?.[2] ?? "?", aiSteps: !!models },
      target: run.deployment,
      ws: run.workspaceId,
      started,
      finished: new Date(started.getTime() + steps.reduce((s, x) => s + x.ms, 0)),
      steps,
      stopped: steps.find((s, i) => !s.ok && steps[i + 1]?.note === "skipped")?.note ?? null,
      data,
      ids,
      spentUsd: data.usage.reduce((s, u) => s + (u.costUsd ?? 0), 0) + held,
    });
    writeFileSync(join(runs, `${stamp}.md`), report.markdown);
    console.log(`personas: ${stamp}: ${report.summary}`);
  }
}

// ---- Scoring and the report ----

const norm = (s: string) => s.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ");
const matches = (m: Match, s: string) => m.every((group) => group.some((p) => new RegExp(p, "i").test(norm(s))));
const str = (x: unknown) => (typeof x === "string" ? x : Array.isArray(x) ? x.filter((y) => typeof y === "string").join(", ") : "");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");
const snippet = (s: string, re: RegExp) => {
  const t = norm(s);
  const m = t.match(re);
  if (!m || m.index === undefined) return t.slice(0, 120);
  return `…${t.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)}…`;
};
const docText = (r: Resume) => (r.doc ? toPlain(r.doc) : (r.text ?? ""));

// A number they only guessed at, written as if measured: each sentence (or clause after a semicolon) that states it
// (`match`) without one of the `hedge` words saying it's an estimate. A sentence that leaves the number out is fine.
export function hardened(estimate: { match: Match; hedge: string[] }, written: { where: string; text: string }[]) {
  return written.flatMap((w) =>
    w.text
      .split(/\n+|(?<=[.!?;])\s+/)
      .map((s) => norm(s).trim())
      .filter((s) => matches(estimate.match, s) && !estimate.hedge.some((p) => new RegExp(p, "i").test(s)))
      .map((s) => ({ where: w.where, snippet: s })),
  );
}

// A claim blown up past the truth: every place CareerBot wrote one of its `forbidden` wordings.
export function inflated(claim: { forbidden: string[] }, written: { where: string; text: string }[]) {
  return claim.forbidden.flatMap((p) => {
    const re = new RegExp(p, "i");
    return written.filter((w) => re.test(norm(w.text))).map((w) => ({ where: w.where, snippet: snippet(w.text, re) }));
  });
}

export function render(r: {
  persona: Persona;
  key: AnswerKey;
  opts: Flags & { model: string; writer: string; aiSteps: boolean };
  target: string;
  ws: Id;
  started: Date;
  finished: Date;
  steps: Step[];
  stopped: string | null;
  data: Dump;
  ids: { stories: { id: Id; file: string }[]; postings: { id: Id; file: string; expect: string }[] };
  spentUsd: number;
}) {
  const { persona, key, data } = r;
  const live = (i: Item) => i.status !== "superseded";
  const of = (kind: string) => data.items.filter((i) => i.kind === kind && live(i));
  // A role told in several stories has an item per reading under one key: one role here, its fields merged (a later
  // reading's set fields win), approved when any reading is.
  const set = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const roles = [...Map.groupBy([...of("role")].sort((a, b) => a._creationTime - b._creationTime), (x) => x.roleKey ?? x._id).values()].map((xs) => ({
    ...xs[0],
    status: xs.some((x) => x.status === "approved") ? "approved" : xs[0].status,
    data: Object.assign({}, ...xs.map((x) => set(x.data))) as Record<string, unknown>,
  }));
  const roleLabel = (k?: string) => {
    const role = roles.find((x) => x.roleKey === k);
    if (!role) return "";
    if (role.data.break) return `Career break ${str(role.data.start)}–${str(role.data.end)}`;
    const alt = Array.isArray(role.data.alternateTitles) ? str(role.data.alternateTitles[0]) : "";
    return `${str(role.data.title) || `(no official title${alt ? `; called ${alt}` : ""})`}, ${str(role.data.employer)} ${str(role.data.start)}–${str(role.data.end)}`;
  };
  const facts = of("fact");
  const storyOf = (i: Item) => r.ids.stories.find((s) => s.id === i.sources[0]?.narrativeId)?.file ?? "";
  const resumes = data.resumes.filter((x) => !x.toReview);
  const newest = (pick: (x: Resume) => boolean) => resumes.filter(pick).sort((a, b) => b._creationTime - a._creationTime)[0];
  const directions = of("direction");
  const nameOf = (id?: Id) => str(directions.find((d) => d._id === id)?.data.name);
  const base = newest((x) => !x.directionId && x.posting === undefined);
  const directionResumes = directions.map((d) => newest((x) => x.directionId === d._id && x.posting === undefined)).filter((x): x is Resume => !!x);
  const tailored = r.ids.postings.map((p) => ({ p, resume: newest((x) => x.postingId === p.id) }));
  const letter = [...data.letters].sort((a, b) => b._creationTime - a._creationTime)[0];
  const letterText = letter ? letter.paragraphs.map((p) => p.text).join("\n\n") : "";

  // Facts: an extracted fact (with its role), a role entry that says it, or a context note (the situation around a
  // role: a break, a move, a clearance), marked as context in the report since resume bullets rest on facts only.
  const context = of("context");
  const factRows = key.facts.map((f) => {
    const hit =
      facts.find((x) => matches(f.match, str(x.data.text))) ??
      facts.find((x) => matches(f.match, `${str(x.data.text)} (${roleLabel(x.roleKey)})`)) ??
      roles.find((x) => matches(f.match, `${roleLabel(x.roleKey)} ${str(x.data.alternateTitles)} ${str(x.data.location)} ${str(x.data.team)} ${str(x.data.tools)} ${str(x.data.skills)}`)) ??
      context.find((x) => matches(f.match, `${str(x.data.text)} (${roleLabel(x.roleKey)})`));
    return { f, hit };
  });
  // Contradictions: a conflict question that names it.
  const conflicts = of("conflict");
  const conflictText = (c: Item) => `${str(c.data.field)} ${str(c.data.recordSays)} ${str(c.data.narrativeSays)} ${str(c.data.narrativeValue)} ${str(c.data.question)}`;
  const contradictionRows = key.contradictions.map((c) => ({ c, hit: conflicts.find((x) => matches(c.match, conflictText(x))) }));
  // Inflation: a forbidden wording anywhere CareerBot wrote about them.
  const written: { where: string; text: string }[] = [
    ...facts.map((x) => ({ where: `fact (${x.status})`, text: str(x.data.text) })),
    ...of("insight").map((x) => ({ where: `insight (${x.status})`, text: str(x.data.text) })),
    ...(base ? [{ where: "base resume", text: docText(base) }] : []),
    ...directionResumes.map((x) => ({ where: `resume: ${nameOf(x.directionId)}`, text: docText(x) })),
    ...tailored.flatMap(({ p, resume }) => (resume ? [{ where: `tailored: ${p.file}`, text: docText(resume) }] : [])),
    ...(letterText ? [{ where: "cover letter", text: letterText }] : []),
  ];
  const inflationRows = key.noInflation.map((n) => ({ n, hits: inflated(n, written) }));
  // Estimates: a number they only guessed at, stated anywhere as if it were measured.
  const estimateRows = (key.estimates ?? []).map((x) => ({ x, hits: hardened(x, written) }));
  // Directions: proposed or approved, from goals or suggested.
  const dirText = (d: Item, withTitles: boolean) => {
    const detail = d.data.detail as { targetTitles?: string[] } | undefined;
    return `${str(d.data.name)} ${str(d.data.includes)} ${withTitles ? str(detail?.targetTitles) : ""}`;
  };
  const fitRows = key.directions.fit.map((x) => ({ x, hit: directions.find((d) => matches(x.match, dirText(d, true))) }));
  const avoidRows = key.directions.avoid.map((x) => ({ x, hit: directions.find((d) => matches(x.match, dirText(d, false))) }));
  // Limits: read as a limit, and the postings they should set apart.
  const limits = of("limit");
  const all = (postingId: Id) => data.ranks.find((x) => x.postingId === postingId && !x.directionId);
  const setApart = (postingId: Id) => {
    const row = all(postingId);
    if (!row) return { filtered: true, how: "not listed (outside their area, or not ranked)" };
    if (row.state === "against") return { filtered: true, how: "set apart: against a firm limit" };
    if (row.meetsPreferences === false) return { filtered: true, how: "ranked lower: against a preference" };
    return { filtered: false, how: `listed: ${row.state}${row.level ? `, ${row.level}` : ""}${row.score !== undefined ? ` ${row.score}` : ""}` };
  };
  const limitRows = key.limits.map((l) => ({
    l,
    hit: limits.find((x) => matches(l.match, `${str(x.data.kind)} ${str(x.data.label)} ${str(x.data.value)}`)),
    filters: l.filters.map((file) => {
      const p = r.ids.postings.find((x) => x.file === file);
      return { file, ...(p ? setApart(p.id) : { filtered: false, how: "posting not seeded" }) };
    }),
  }));
  const fitsListed = r.ids.postings.filter((p) => p.expect === "fits").map((p) => ({ file: p.file, ...setApart(p.id) }));
  // Jobs on the base resume: every approved job with an approved fact belongs there (a career break's showing is theirs
  // to choose), so one left off is a job the person loses without being told.
  const onBase = new Set(base?.doc?.experience.map((e) => e.roleKey) ?? []);
  const jobs = roles.filter((x) => x.status === "approved" && !x.data.break && facts.some((f) => f.status === "approved" && f.roleKey === x.roleKey));
  const leftOff = jobs.filter((x) => !onBase.has(x.roleKey ?? ""));

  const score = (pass: number, total: number) => `${pass}/${total}`;
  const scores = {
    facts: score(factRows.filter((x) => x.hit).length, factRows.length),
    contradictions: score(contradictionRows.filter((x) => x.hit).length, contradictionRows.length),
    noInflation: score(inflationRows.filter((x) => !x.hits.length).length, inflationRows.length),
    estimates: score(estimateRows.filter((x) => !x.hits.length).length, estimateRows.length),
    directionsFit: score(fitRows.filter((x) => x.hit).length, fitRows.length),
    directionsAvoid: score(avoidRows.filter((x) => !x.hit).length, avoidRows.length),
    limitsRead: score(limitRows.filter((x) => x.hit).length, limitRows.length),
    limitsFilter: score(limitRows.flatMap((x) => x.filters).filter((x) => x.filtered).length, limitRows.flatMap((x) => x.filters).length),
    fitsListed: score(fitsListed.filter((x) => !x.filtered).length, fitsListed.length),
    jobsOnBase: score(jobs.length - leftOff.length, jobs.length),
  };
  const settled = data.usage.reduce((s, u) => s + (u.costUsd ?? 0), 0);
  const unsettled = data.usage.filter((u) => u.state === "reserved" || u.state === "indeterminate");
  const byPurpose = new Map<string, { usd: number; calls: number }>();
  for (const u of data.usage) {
    const k = `${u.purpose.split(":")[0]} · ${u.model ?? "?"}`;
    const e = byPurpose.get(k) ?? { usd: 0, calls: 0 };
    byPurpose.set(k, { usd: e.usd + (u.costUsd ?? 0), calls: e.calls + 1 });
  }
  const minutes = ((r.finished.getTime() - r.started.getTime()) / 60_000).toFixed(1);

  const md: string[] = [];
  const h = (s: string) => md.push("", s, "");
  md.push(`# ${persona.name}: test run ${r.started.toISOString()}`, "", persona.oneLine, "");
  md.push(
    `- Deployment: ${r.target}; workspace ${r.ws}`,
    `- Models: ${r.opts.model}; resumes and letters ${r.opts.writer}`,
    `- AI budget cap: $${r.opts.budget}. Spent: $${r.spentUsd.toFixed(4)} (budget's count), $${settled.toFixed(4)} settled across ${data.usage.length} calls${unsettled.length ? `, ${unsettled.length} not settled yet` : ""}`,
    `- Took ${minutes} minutes${r.opts.aiSteps ? "" : ". **Seeding only: no AI steps ran.**"}${r.stopped ? `. **Stopped: ${r.stopped}.**` : ""}`,
  );
  h("## Scores");
  md.push("| Check | Score |", "|---|---|");
  md.push(`| Facts that came out | ${scores.facts} |`, `| Contradictions caught by the conflict check | ${scores.contradictions} |`, `| Claims not inflated | ${scores.noInflation} |`, `| Guesses kept as estimates | ${scores.estimates} |`);
  md.push(`| Fitting directions proposed | ${scores.directionsFit} |`, `| Unwanted directions kept out | ${scores.directionsAvoid} |`, `| Limits read | ${scores.limitsRead} |`);
  md.push(`| Postings set apart by a limit | ${scores.limitsFilter} |`, `| Fitting postings still listed | ${scores.fitsListed} |`, `| Jobs on the base resume | ${scores.jobsOnBase} |`);
  if (leftOff.length) md.push("", "Jobs with approved facts left off the base resume:", ...leftOff.map((x) => `- ${roleLabel(x.roleKey)}`));
  h("## Steps");
  md.push("| Step | OK | Note | Seconds |", "|---|---|---|---|", ...r.steps.map((s) => `| ${s.name} | ${s.ok ? "yes" : "**no**"} | ${cell(s.note)} | ${(s.ms / 1000).toFixed(0)} |`));
  const failedJobs = data.jobs.filter((j) => j.status === "failed");
  if (failedJobs.length) md.push("", "Failed jobs:", ...failedJobs.map((j) => `- ${j.kind}: ${j.error ?? "no reason"}`));

  h("## Facts");
  md.push("| | Should come out | Came out as | From |", "|---|---|---|---|");
  for (const { f, hit } of factRows)
    md.push(`| ${hit ? "✓" : "✗"} ${f.id} | ${cell(f.statement)} | ${hit ? cell(hit.kind === "role" ? `role: ${roleLabel(hit.roleKey)}` : `${hit.kind === "context" ? "context: " : ""}${str(hit.data.text)}`) : ""} | ${hit ? cell(storyOf(hit) || "") : cell(f.story)} |`);
  h("## Contradictions");
  for (const { c, hit } of contradictionRows) md.push(`- ${hit ? "✓" : "✗"} ${c.id} ${c.about} (${c.values.join(" vs ")})${hit ? `: "${cell(str(hit.data.question))}"` : ": not asked"}`);
  md.push("", `All conflict questions (${conflicts.length}):`, ...conflicts.map((c) => `- ${cell(str(c.data.question))} (record: ${cell(str(c.data.recordSays))}; story: ${cell(str(c.data.narrativeSays))})`));
  h("## Claims that must not be inflated");
  for (const { n, hits } of inflationRows) {
    md.push(`- ${hits.length ? "✗" : "✓"} ${n.id} "${n.claim}" (truth: ${n.truth})`);
    for (const x of hits) md.push(`  - ${x.where}: ${cell(x.snippet)}`);
  }
  h("## Guesses that must stay estimates");
  for (const { x, hits } of estimateRows) {
    md.push(`- ${hits.length ? "✗" : "✓"} ${x.id} "${x.said}"`);
    for (const w of hits) md.push(`  - ${w.where}: ${cell(w.snippet)}`);
  }
  h("## Directions");
  for (const { x, hit } of fitRows) md.push(`- ${hit ? "✓" : "✗"} fits: ${x.name}${hit ? ` → "${str(hit.data.name)}" (${hit.status}${hit.data.suggested ? ", suggested" : ""})` : ""}`);
  for (const { x, hit } of avoidRows) md.push(`- ${hit ? "✗" : "✓"} keep out: ${x.name}${hit ? ` → proposed as "${str(hit.data.name)}" (${hit.status}${hit.data.suggested ? ", suggested" : ""})` : ""}`);
  md.push("", "All directions:", ...directions.map((d) => `- ${str(d.data.name)} (${d.status}${d.data.suggested ? ", suggested" : ", from goals"}${d.data.path ? `, ${str(d.data.path)}` : ""}): ${cell(str((d.data.detail as { positioning?: string } | undefined)?.positioning) || str(d.data.summary))}`));
  h("## Limits");
  for (const { l, hit, filters } of limitRows) {
    md.push(`- ${hit ? "✓" : "✗"} ${l.kind}: ${l.statement}${hit ? ` → "${str(hit.data.label)}: ${str(hit.data.value)}"${hit.data.firm === false ? " (preference)" : ""}` : ""}`);
    for (const x of filters) md.push(`  - ${x.filtered ? "✓" : "✗"} ${x.file}: ${x.how}`);
  }
  for (const x of fitsListed) md.push(`- ${x.filtered ? "✗" : "✓"} fits, should stay listed: ${x.file}: ${x.how}`);
  h("## Postings");
  md.push("| Posting | Expected | Where it stands | Pay from | Setup | Clearance | Visa | Best fit |", "|---|---|---|---|---|---|---|---|");
  for (const p of r.ids.postings) {
    const row = all(p.id);
    const posting = data.postings.find((x) => x._id === p.id);
    const best = [...(posting?.fit ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
    md.push(`| ${p.file} | ${p.expect} | ${setApart(p.id).how} | ${row?.payMin ?? ""} | ${row?.setup ?? ""} | ${row?.clearance ?? ""} | ${row?.visa ?? ""} | ${best ? `${nameOf(best.directionId)}: ${best.level} ${best.score ?? ""}` : ""} |`);
  }
  h("## For a human eye");
  md.push(...key.humanReview.map((x) => `- [ ] ${x}`));
  md.push("- [ ] Read the base resume: does it sound like this person on a good day, with nothing they couldn't talk to?", "- [ ] Do the tailored resumes use each posting's language without claiming what the record doesn't hold?", "- [ ] Does the cover letter read as written by them, for this role?");
  h("## Spending by task");
  md.push("| Task · model | Calls | USD |", "|---|---|---|", ...[...byPurpose].sort((a, b) => b[1].usd - a[1].usd).map(([k, v]) => `| ${k} | ${v.calls} | ${v.usd.toFixed(4)} |`));

  h("## Record");
  for (const role of roles) {
    md.push(`### ${roleLabel(role.roleKey)} (${role.status})`, "");
    md.push(...facts.filter((f) => f.roleKey === role.roleKey).map((f) => `- ${str(f.data.text)}${f.status === "approved" ? "" : ` (${f.status})`}`), "");
  }
  const loose = facts.filter((f) => !roles.some((x) => x.roleKey === f.roleKey));
  if (loose.length) md.push("### Facts on no role", "", ...loose.map((f) => `- ${str(f.data.text)} (${f.status})`), "");
  const insights = of("insight");
  if (insights.length) md.push("### Insights", "", ...insights.map((i) => `- ${str(i.data.text)} (${i.status})`), "");
  const block = (title: string, body: string) => md.push(`### ${title}`, "", "```text", body.trim() || "(empty)", "```", "");
  h("## Resumes");
  if (base) block(`Base resume (${base.model})`, docText(base));
  for (const x of directionResumes) block(`${nameOf(x.directionId)} (${x.model})`, docText(x));
  for (const { p, resume } of tailored) {
    if (!resume) continue;
    block(`Tailored to ${p.file} from ${nameOf(resume.directionId)} (${resume.model})`, docText(resume));
    if (resume.requirements?.length) md.push("Requirements:", ...resume.requirements.map((q) => `- ${q.strength}: ${cell(q.requirement)}`), "");
  }
  if (letterText) block(`Cover letter (${letter.model ?? ""})`, letterText);

  const summary = `facts ${scores.facts}, contradictions ${scores.contradictions}, not inflated ${scores.noInflation}, estimates kept ${scores.estimates}, directions ${scores.directionsFit} (kept out ${scores.directionsAvoid}), limits ${scores.limitsRead} (filtered ${scores.limitsFilter}), jobs on base resume ${scores.jobsOnBase}; spent $${r.spentUsd.toFixed(4)} of $${r.opts.budget}`;
  return { markdown: md.join("\n") + "\n", summary };
}

// Run when executed (`pnpm personas:run`), not when imported to check the scoring on made-up results.
if (process.argv[1]?.endsWith("personas.ts")) main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
