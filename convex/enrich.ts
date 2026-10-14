import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { activeLimits, itemsOf } from "./itemShapes";
import { chatJson } from "./metering";
import { listOf, orNull, type ReplySchema, replyOf, strictObject, string } from "./replyJson";
import { braveKeyFor } from "./braveKey";
import { boardsIn, get, interleave, type Job, NOT_READ, pageText, publicHost, type Read, readBoard, setSearchTitles, viaReader } from "./boards";
import { countryCode, countryName, countryNameList } from "./limitBuckets";
import { DEFAULT_LENS } from "./lens";
import { apollo } from "./metering";
import { origin } from "./schema";
import { dayOf, tally } from "./tallies";
import { requireWorkspace } from "./workspaces";
import { learns, toDomain } from "./discovery";
import { screenCompanies } from "./screening";

// Fills in companies from free sources before any paid enrichment: the company's own website (what they say they build)
// and its public job board (boards.ts: how many roles are open, and which match a direction's titles). A short AI
// summary of what they build is written from the site text only. No Apollo credits.
// Runs in batches; each batch schedules the next until every place-to-work company has details.

const BATCH = 40;
// Fit is judged for every direction at once, so replies are long: 40 companies ran into the model's ~16k-token reply limit.
const FIT_BATCH = 15;
// The companies they turned down that fit judging reads, latest first.
const TURNED_DOWN_MAX = 40;
const TIMEOUT_MS = 8000;

// A job matches a target title when it contains the title's core words (seniority words don't count).
// Which countries a job's location names. Strong signs (a country or a well-known city) win over a two-letter
// region code, which is ambiguous (", IN" is Indiana or India).
const US_STRONG = /\b(united states|usa|u\.s\.a?\.?|us|america)\b|\b(new york|san francisco|seattle|austin|boston|chicago|denver|atlanta|los angeles|washington,? d\.?c|dallas|houston|miami|san jose|palo alto|mountain view|santa clara|sunnyvale|menlo park|redmond|san diego|phoenix|philadelphia|pittsburgh|raleigh|nashville|salt lake city|portland|minneapolis|detroit|columbus|arlington|mclean|reston|huntsville|el segundo|hawthorne|irvine)\b/i;
const US_WEAK = /(^|[,(\s-])(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])(\b|$)/;
const CITIES: Record<string, string> = {
  bengaluru: "IN", bangalore: "IN", hyderabad: "IN", pune: "IN", mumbai: "IN", delhi: "IN", gurgaon: "IN", gurugram: "IN", noida: "IN", chennai: "IN",
  london: "GB", manchester: "GB", edinburgh: "GB", cambridge: "GB", paris: "FR", berlin: "DE", munich: "DE", hamburg: "DE", jakarta: "ID", singapore: "SG",
  toronto: "CA", vancouver: "CA", montreal: "CA", ottawa: "CA", dublin: "IE", tokyo: "JP", sydney: "AU", melbourne: "AU", "tel aviv": "IL", amsterdam: "NL",
  zurich: "CH", "sao paulo": "BR", "são paulo": "BR", "mexico city": "MX", seoul: "KR", warsaw: "PL", krakow: "PL", bucharest: "RO", madrid: "ES", barcelona: "ES",
  stockholm: "SE", copenhagen: "DK", oslo: "NO", helsinki: "FI", lisbon: "PT", prague: "CZ", "buenos aires": "AR", bogota: "CO", manila: "PH", "ho chi minh": "VN",
  dubai: "AE", "abu dhabi": "AE", riyadh: "SA", shanghai: "CN", beijing: "CN", shenzhen: "CN", taipei: "TW", "hong kong": "HK", "kuala lumpur": "MY", bangkok: "TH",
};
// Names that are also US states or common words aren't treated as countries.
const NOT_COUNTRIES = new Set(["georgia", "jordan", "chad", "niger"]);
let countryPatterns: [RegExp, string][] | null = null;
export function jobCountries(loc: string): Set<string> {
  countryPatterns ??= countryNameList()
    .filter(([name]) => name.length > 3 && !NOT_COUNTRIES.has(name))
    .map(([name, code]) => [new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), code] as [RegExp, string]);
  const found = new Set<string>();
  for (const [re, code] of countryPatterns) if (re.test(loc)) found.add(code);
  const lower = (loc ?? "").toLowerCase();
  for (const [city, code] of Object.entries(CITIES)) if (new RegExp(`\\b${city}\\b`).test(lower)) found.add(code);
  if (/\b(uk|england|scotland|wales)\b/i.test(loc)) found.add("GB");
  if (US_STRONG.test(loc)) found.add("US");
  else if (!found.size && US_WEAK.test(loc)) found.add("US");
  return found;
}

// Where they said they'll work, from their approved Location limit: the countries, and whether remote is fine.
export type WorkArea = { countries: string[] | null; remoteOk: boolean };
// A role counts when it names one of their countries; a role that names only other countries never counts, remote or
// not; a remote role naming no country counts if remote is fine; a role with no location counts (unknown, not ruled out).
export function inWorkArea(job: { location?: string; remote: boolean }, area: WorkArea | null) {
  if (!area?.countries?.length) return true;
  const where = job.location ? jobCountries(job.location) : new Set<string>();
  if (where.size) return [...where].some((c) => area.countries!.includes(c));
  if (job.remote || /remote|anywhere/i.test(job.location ?? "")) return area.remoteOk;
  return true;
}

const SENIORITY = /\b(senior|sr\.?|junior|jr\.?|principal|staff|lead|head of|director of|director|vp of|vp|vice president of|chief|associate|manager of)\b/g;
const core = (t: string | undefined) => (t ?? "").toLowerCase().replace(SENIORITY, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
export function matchesTitle(job: string, target: string) {
  const want = core(target);
  if (!want.length) return false;
  const have = new Set(core(job));
  return want.every((w) => have.has(w) || have.has(w.replace(/s$/, "")));
}

const slugGuesses = (c: { name: string; domain?: string }) => {
  const base = c.domain?.split(".")[0] ?? "";
  const squashed = (c.name ?? "").toLowerCase().replace(/\b(inc|llc|corp|corporation|co|ltd|technologies|technology|labs|ai)\b/g, "").replace(/[^a-z0-9]+/g, "");
  return [...new Set([base, squashed, (c.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")].filter((s) => s.length > 1))];
};

// Where they said they'll work, from their approved Location limit (the one that applies everywhere, always).
export async function workAreaOf(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<WorkArea | null> {
  const loc = (await activeLimits(ctx, workspaceId)).find((l) => l.data.kind === "location" && !l.data.appliesTo?.length && !l.data.when);
  if (!loc) return null;
  const countries = Array.isArray(loc.data.rule?.countries) ? (loc.data.rule.countries as string[]) : null;
  const modes = Array.isArray(loc.data.rule?.modes) ? (loc.data.rule.modes as string[]) : null;
  return { countries, remoteOk: !modes || modes.includes("remote") };
}

export const todo = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const all = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    const titles = (await itemsOf(ctx, workspaceId, "direction", "approved"))
      .filter((d) => d.data.criteriaStatus === "approved")
      .map((d) => ({ direction: d.data.name, titles: d.data.criteria?.titles ?? [] }));
    // Strongest signals first: your list, hiring now, lookalikes, large companies, then plain criteria matches.
    const rank = (c: Doc<"companies">) => Math.min(...c.found.map((f) => ({ hand: 0, hiring: 1, lookalike: 2, large: 3, criteria: 4 })[f.via]));
    // What they asked to check again goes first, then strongest source.
    const order = (a: Doc<"companies">, b: Doc<"companies">) => (b.recheckAt ?? 0) - (a.recheckAt ?? 0) || rank(a) - rank(b);
    const left = all.filter((c) => !c.details && c.screened?.employer !== false && c.domain).sort(order);
    const needFit = all.filter((c) => c.details && !c.fitAt && c.screened?.employer !== false).sort(order).slice(0, FIT_BATCH);
    const directions = (await itemsOf(ctx, workspaceId, "direction", "approved"))
      .filter((d) => d.data.criteriaStatus === "approved")
      .map((d) => ({ id: d._id, name: d.data.name, positioning: d.data.detail?.positioning, titles: d.data.criteria?.titles ?? [], industries: d.data.criteria?.industries ?? [], sizes: d.data.criteria?.sizes ?? [] }));
    const limits = (await activeLimits(ctx, workspaceId)).filter((l) => ["companies", "work", "seniority", "location"].includes(l.data.kind)).map((l) => ({ label: l.data.label, value: l.data.value }));
    const settings = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    const judge = (settings?.lens ?? DEFAULT_LENS).judge !== "off";
    // Their approved company goals, as they approved them: the words and the structured lists.
    const companyGoals = (await activeLimits(ctx, workspaceId)).filter((l) => l.data.kind === "companies").map((l) => ({ value: l.data.value, note: l.data.note, rule: l.data.rule }));
    // Learning from their ratings: the companies they turned down, latest first, with the reason when they gave one.
    const turnedDown = learns(settings)
      ? all
          .filter((c) => c.rating?.value === "no")
          .sort((a, b) => b.rating!.at - a.rating!.at)
          .slice(0, TURNED_DOWN_MAX)
          .map((c) => ({ name: c.name, ...(c.details?.summary ? { summary: c.details.summary } : {}), ...(c.rating!.reason ? { why: c.rating!.reason } : {}) }))
      : [];
    const area = await workAreaOf(ctx, workspaceId);
    return {
      area, batch: left.slice(0, BATCH).map((c) => ({ id: c._id, name: c.name, domain: c.domain!, ...(c.apolloId ? { apolloId: c.apolloId } : {}), ...(c.boardUrl ? { boardUrl: c.boardUrl } : {}) })), remaining: left.length, titles, useApollo: !!settings?.apolloJobs,
      fit: { companies: needFit.map((c) => ({ id: c._id, name: c.name, domain: c.domain, summary: c.details?.summary, openRoles: c.details?.jobs?.open, matchingRoles: c.details?.jobs?.matching.slice(0, 5).map((j) => j.title) })), fitLeft: all.filter((c) => c.details && !c.fitAt && c.screened?.employer !== false).length, directions, limits, judge, companyGoals, turnedDown } };
  },
});

export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("companies"), details: v.any() },
  handler: async (ctx, { workspaceId, id, details }) => {
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) return;
    await ctx.db.patch(id, { details: details as Doc<"companies">["details"] });
  },
});

// The next batch of a pass, as the one before it was started (origin).
export const next = internalMutation({
  args: { workspaceId: v.id("workspaces"), origin: v.optional(origin) },
  handler: async (ctx, { workspaceId, origin }) => {
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "enrich", args: {}, status: "queued", origin });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  },
});

// Start a pass unless one is already queued or running (a running pass picks up new work itself). Only they start one.
async function startPass(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  if (jobs.some((j) => j.kind === "enrich" && (j.status === "queued" || j.status === "running"))) return null;
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "enrich", args: {}, status: "queued", origin: "you" });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  return jobId;
}

export const start = mutation({
  args: {},
  handler: async (ctx) => startPass(ctx, (await requireWorkspace(ctx)).workspaceId),
});

// Check companies again: their site and job board are read afresh, then fit and goals are judged again.
export const recheck = mutation({
  args: { ids: v.array(v.id("companies")) },
  handler: async (ctx, { ids }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!ids.length || ids.length > 1000) throw new ConvexError("Pick between 1 and 1,000 companies.");
    const at = Date.now();
    let skipped = 0;
    for (const id of ids) {
      const c = await ctx.db.get(id);
      if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
      // Their own "not a place to work" stands; a company with no website has nothing to read yet.
      if ((c.screened?.by === "you" && !c.screened.employer) || !c.domain) { skipped++; continue; }
      await ctx.db.patch(id, { details: undefined, fitAt: undefined, recheckAt: at, ...(c.screened?.by === "you" ? {} : { screened: undefined }) });
    }
    await startPass(ctx, workspaceId);
    return { skipped };
  },
});

// Give a company's job board directly (or clear it with ""). Checked again right away.
export const setBoard = mutation({
  args: { id: v.id("companies"), url: v.string() },
  handler: async (ctx, { id, url }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const u = url.trim();
    const given = u ? boardsIn(u) : [];
    if (u && !given.length) throw new ConvexError("CareerBot can't read that kind of job board yet. Paste the board's own page, like jobs.lever.co/acme or acme.wd5.myworkdayjobs.com/External.");
    const notRead = given.length ? NOT_READ[given[0].provider] : undefined;
    if (notRead) throw new ConvexError(`CareerBot doesn't read ${notRead.name} boards: ${notRead.why}.`);
    const theirsOut = c.screened?.by === "you" && !c.screened.employer;
    await ctx.db.patch(id, { boardUrl: u || undefined, details: undefined, fitAt: undefined, ...(theirsOut ? {} : { recheckAt: Date.now() }) });
    return theirsOut ? null : startPass(ctx, workspaceId);
  },
});

// Correct a company's website. Its old details were read from the old site, so it's checked again.
export const setWebsite = mutation({
  args: { id: v.id("companies"), website: v.string() },
  handler: async (ctx, { id, website }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const domain = toDomain(website);
    if (!domain) throw new ConvexError("Use the company's website, like nvidia.com.");
    // A new website is a new identity check: the old Apollo match and a rule or AI screening came from the old one.
    // Their own "not a place to work" stands: the website is saved, and it's checked once they Restore it.
    const theirsOut = c.screened?.by === "you" && !c.screened.employer;
    await ctx.db.patch(id, { domain, websiteUrl: `https://${domain}`, apolloId: undefined, details: undefined, fitAt: undefined, ...(theirsOut ? {} : { recheckAt: Date.now() }), ...(c.screened?.by === "you" ? {} : { screened: undefined }) });
    return theirsOut ? null : startPass(ctx, workspaceId);
  },
});

const KNOWN_SUMMARY = `Each company's website couldn't be read. For each company you actually know (matching both the name and the website), write "summary": one plain sentence on what it builds or sells and for whom. No hype. If you don't know the company for sure, set "summary" to null; never guess from the name. Reply with JSON: {"companies":[{"id","summary"}]}.`;

const SUMMARY = `For each company, write "summary": one plain sentence on what the company actually builds or sells and for whom, from its own website text only. No hype, no adjectives it didn't earn, no guessing. If the text doesn't say, write "Its website doesn't say what it builds." Reply with JSON only: {"companies":[{"id": "...", "summary": "..."}]}.`;

// The replies' shapes (structured output, metering.chat), as runEnrich and judgeFit read them.
export const SUMMARY_SCHEMA = replyOf("company_summaries", "companies", { id: string, summary: string });
export const KNOWN_SUMMARY_SCHEMA = replyOf("company_summaries_known", "companies", { id: string, summary: orNull("string") });
// With the company goals judged, each company also carries "goals".
export const companyFitSchema = (judge: boolean): ReplySchema =>
  replyOf("company_fit", "companies", { id: string, fit: listOf({ directionId: string, level: string, reason: string }), ...(judge ? { goals: strictObject({ level: string, reason: string }) } : {}) });

async function braveSearch(key: string, q: string): Promise<string[]> {
  try {
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`, { headers: { accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return [];
    const body = (await r.json()) as { web?: { results?: { url?: string; title?: string; description?: string }[] } };
    return (body.web?.results ?? []).map((x) => `${x.url ?? ""} ${x.title ?? ""} ${x.description ?? ""}`);
  } catch {
    return [];
  }
}

type ApolloJobs = ((apolloId: string) => Promise<Read | null>) | null;
const apolloPostings = (f: NonNullable<ApolloJobs>, id: string) => f(id);

// Apollo's job postings for a company (1 credit each). They run in the background, so they count as automated: Budgets
// must allow automated Apollo work. Apollo gives no id, so a posting's link is its id.
export function apolloJobsFor(ctx: ActionCtx, ws: Id<"workspaces">): NonNullable<ApolloJobs> {
  return async (id) => {
    const body = (await apollo(ctx, { workspaceId: ws, purpose: "job postings", endpoint: "organizations/job_postings", path: `organizations/${id}/job_postings`, method: "GET", automated: true, params: { per_page: 100, page: 1 } }).catch(() => null)) as {
      organization_job_postings?: { title?: string; url?: string; city?: string; state?: string; country?: string }[];
    } | null;
    const jobs = (body?.organization_job_postings ?? []).filter((j) => j.title && j.url).map((j) => ({ title: j.title!, url: j.url!, location: [j.city, j.state, j.country ? (countryName(countryCode(j.country) ?? j.country)) : undefined].filter(Boolean).join(", ") || undefined, remote: /remote/i.test(`${j.title} ${j.city ?? ""}`), externalId: j.url! }));
    return jobs.length ? { board: { provider: "apollo", slug: id, url: jobs[0].url, foundBy: "Apollo job postings" }, jobs } : null;
  };
}

async function one(c: { name: string; domain: string; apolloId?: string; boardUrl?: string }, titles: { direction: string; titles: string[] }[], braveKey: string | null, apolloJobs: ApolloJobs, area: WorkArea | null) {
  const sources: string[] = [];
  if (!publicHost(c.domain)) return { text: "", details: { sources, at: Date.now() } };
  const home = await get(`https://${c.domain}`);
  let html = home ? await home.text().catch(() => "") : "";
  if (html) sources.push(`https://${c.domain}`);
  // Many sites turn away server requests (bot checks). Then read the page through a reader service, which loads it
  // in a real browser and returns its text and links. Only the public company URL is sent.
  else if ((html = await viaReader(`https://${c.domain}`))) sources.push(`https://${c.domain} (through a reader)`);
  const { description, text } = pageText(html);
  // Their own board link wins over anything found.
  let boards = c.boardUrl ? boardsIn(c.boardUrl).map((b) => ({ ...b, foundBy: "you" })) : boardsIn(html);
  if (!boards.length) {
    const careers = (await get(`https://${c.domain}/careers`)) ?? (await get(`https://${c.domain}/jobs`));
    let chtml = careers ? await careers.text().catch(() => "") : "";
    let from = careers?.url;
    if (!chtml && (chtml = await viaReader(`https://${c.domain}/careers`))) from = `https://${c.domain}/careers (through a reader)`;
    boards = boardsIn(chtml);
    if (boards.length && from) sources.push(from);
  }
  // Guess the usual board names when the site doesn't link one (many embed boards with scripts).
  // Not linked from the site: ask Brave Search, when they've added a key. A board found in results for the company's
  // name and website counts as found by search, the same as a link on its site.
  if (!boards.length && braveKey) {
    // Each result on its own: a board link counts only from a result that names this company or its website.
    const nameKey = (c.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const hit of await braveSearch(braveKey, `"${c.name}" careers jobs ${c.domain}`)) {
      const text = hit.toLowerCase();
      if (!text.includes(c.domain.toLowerCase()) && !(nameKey && text.replace(/[^a-z0-9]+/g, " ").includes(nameKey))) continue;
      for (const b of boardsIn(hit)) if (!boards.some((x) => x.provider === b.provider && x.slug === b.slug)) boards.push({ ...b, foundBy: "Brave Search" });
    }
    if (boards.length) sources.push("Brave Search");
  }
  const linked = boards.length > 0;
  if (!linked) for (const slug of slugGuesses(c)) boards.push({ provider: "greenhouse", slug, url: "" }, { provider: "ashby", slug, url: "" }, { provider: "lever", slug, url: "" });
  // Take titles in turn from each direction so every direction gets searched, not just the first ones.
  setSearchTitles(interleave(titles.map((t) => t.titles)));
  let found: Read | null = null;
  for (const b of boards) {
    const r = await readBoard(b);
    if (!r || (!r.jobs.length && !r.total)) continue;
    // A guessed board name can belong to a different company. Keep it only if its board page points back to this site.
    if (!linked) {
      const page = await get(r.board.url);
      const bhtml = page ? await page.text().catch(() => "") : "";
      if (!bhtml.toLowerCase().includes(c.domain.toLowerCase())) continue;
    }
    found = r;
    break;
  }
  if (found) sources.push(found.board.url);
  if (!found && apolloJobs && c.apolloId) found = await apolloPostings(apolloJobs, c.apolloId);
  // A match counts only where they said they'd work (their approved Location limit).
  const where = (j: Job) => inWorkArea(j, area);
  const matching = found
    ? found.jobs.filter(where).flatMap((j) => titles.flatMap((t) => (t.titles.some((x) => matchesTitle(j.title, x)) ? [{ title: j.title, url: j.url, ...(j.location ? { location: j.location } : {}), direction: t.direction }] : []))).slice(0, 20)
    : [];

  return {
    text,
    details: {
      ...(description ? { siteDescription: description.slice(0, 300) } : {}),
      ...(found ? { board: found.board, jobs: { open: found.total ?? found.jobs.length, remote: found.jobs.filter((j) => j.remote).length, matching } } : {}),
      sources,
      at: Date.now(),
    },
  };
}

export async function runEnrich(ctx: ActionCtx, job: Doc<"jobs">) {
  const ws = job.workspaceId;
  // Companies sent back for checking (or given a new website) are screened again first.
  await screenCompanies(ctx, ws);
  const { batch, remaining, titles, useApollo, fit, area } = await ctx.runQuery(internal.enrich.todo, { workspaceId: ws });
  if (!batch.length) {
    // Details are all in; judge fit for the ones that don't have it yet, a batch at a time.
    if (!fit.companies.length || !fit.directions.length) return { done: 0, remaining: 0, fitLeft: 0 };
    const judged = await judgeFit(ctx, ws, fit);
    // Always look again: companies sent back for checking during this pass are picked up by the next one.
    await ctx.runMutation(internal.enrich.next, { workspaceId: ws, origin: job.origin });
    return { done: 0, remaining: 0, judged: judged.n, fitLeft: fit.fitLeft - fit.companies.length, costUsd: judged.costUsd };
  }
  const braveKey = await braveKeyFor(ctx, ws);
  // Last resort, only when they turned it on: Apollo's job postings for a company with no readable public board.
  const apolloJobs: ApolloJobs = useApollo ? apolloJobsFor(ctx, ws) : null;
  const results: { id: Id<"companies">; name: string; text: string; details: Record<string, unknown> }[] = [];
  for (let i = 0; i < batch.length; i += 8) {
    const got = await Promise.all(batch.slice(i, i + 8).map(async (c) => ({ id: c.id, name: c.name, ...(await one(c, titles, braveKey, apolloJobs, area)) })));
    results.push(...got);
  }
  // One AI call for the batch's summaries, from site text only.
  const withText = results.filter((r) => r.text.length > 80);
  let costUsd = 0;
  const summaries = new Map<string, string>();
  if (withText.length) {
    const choice = await modelFor(ctx, ws, "companies");
    const reply = await chatJson<{ companies?: { id?: string; summary?: string }[] }>(ctx, {
      workspaceId: ws,
      purpose: "company summaries",
      model: choice.model,
      reasoning: choice.reasoning,
      schema: SUMMARY_SCHEMA,
      messages: [
        { role: "system", content: SUMMARY },
        { role: "user", content: JSON.stringify(withText.map((r) => ({ id: r.id, name: r.name, website: r.text }))) },
      ],
    });
    costUsd = reply.costUsd;
    for (const x of reply.out.companies ?? []) if (x.id && x.summary) summaries.set(x.id, x.summary.trim());
  }
  // No readable or useful site: a summary from general knowledge, labelled, only for companies the model actually knows.
  // Also when the site was read but says nothing about what the company does (menus and cookie notices only).
  const noText = results.filter((r) => { const x = summaries.get(String(r.id)); return !x || x.startsWith("Its website doesn't say") || x.startsWith("Its website doesn’t say"); });
  if (noText.length) {
    const choice = await modelFor(ctx, ws, "companies");
    const reply = await chatJson<{ companies?: { id?: string; summary?: string | null }[] }>(ctx, {
      workspaceId: ws,
      purpose: "company summaries (general knowledge)",
      model: choice.model,
      reasoning: choice.reasoning,
      schema: KNOWN_SUMMARY_SCHEMA,
      messages: [
        { role: "system", content: KNOWN_SUMMARY },
        { role: "user", content: JSON.stringify(noText.map((r) => ({ id: r.id, name: r.name, website: batch.find((b) => b.id === r.id)?.domain }))) },
      ],
    });
    costUsd += reply.costUsd;
    for (const x of reply.out.companies ?? [])
      if (x.id && x.summary?.trim()) summaries.set(x.id, `From general knowledge: ${x.summary.trim().replace(/^From general knowledge:\s*/i, "")}`);
  }
  for (const r of results) {
    const summary = summaries.get(String(r.id));
    await ctx.runMutation(internal.enrich.save, { workspaceId: ws, id: r.id, details: { ...r.details, ...(summary ? { summary } : {}) } });
  }
  // Keep going until details are in; the batches after that judge fit.
  await ctx.runMutation(internal.enrich.next, { workspaceId: ws, origin: job.origin });
  return { done: results.length, remaining: remaining - batch.length, costUsd };
}

export const setApolloJobs = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    if (row) await ctx.db.patch(row._id, { apolloJobs: on });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], apolloJobs: on });
  },
});

const GOALS = `Separately, judge each company against the seeker's company goals (what kind of company they want to work for, what excites them, what they avoid), given in their own approved words. This is a signal, not a verdict: "goals": {"level": "fits" | "partly" | "doesnt" | "unknown", "reason": one short plain sentence naming the deciding facts}. You may use general knowledge of well-known companies when the summary is thin or missing; when you do, start the reason with "From general knowledge:". Use "unknown" only when you don't know the company and the summary doesn't say enough. A company outside their wanted industries can still fit if it matches what excites them.`;

const FIT = `You judge how well each company fits each of a job seeker's directions, for deciding which companies deserve their time. For the direction fit, use only what's given: the company's own one-line summary, its open roles, and roles matching the direction's titles; the direction's positioning, titles and industries; and the seeker's approved limits (company types they want or avoid, work they avoid, seniority, location). Levels: "strong" (clearly the kind of company and work they want, ideally hiring for it), "some" (plausible fit worth a look), "weak" (a stretch), "none" (wrong kind of company for this direction, or against a limit). "reason": one short plain sentence naming the deciding facts. Missing information lowers confidence, not the level: say what's unknown. Reply with JSON only: {"companies":[{"id": "...", "fit": [{"directionId": "...", "level": "...", "reason": "..."}]}]}.`;

// Companies they turned down steer fit and the goals judgment as their own preferences, beside their approved words.
const TURNED_DOWN = `"Companies they turned down, and why" are companies the seeker rated Not for me, with the reason when they gave one. They are the seeker's own preferences, not facts about other companies: a company that is clearly like one they turned down, in the way their reason names, fits them less, and its reason says so. Never assume a company shares something its summary and roles don't show.`;

type FitInput = { companies: { id: Id<"companies"> }[]; directions: { id: Id<"items"> }[]; limits: unknown[]; judge: boolean; companyGoals: unknown[]; turnedDown: unknown[] };
async function judgeFit(ctx: ActionCtx, ws: Id<"workspaces">, fit: FitInput) {
  const choice = await modelFor(ctx, ws, "companies");
  const { out, costUsd } = await chatJson<{ companies?: { id?: string; fit?: { directionId?: string; level?: string; reason?: string }[]; goals?: { level?: string; reason?: string } }[] }>(ctx, {
    workspaceId: ws,
    purpose: "company fit",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: companyFitSchema(fit.judge),
    messages: [
      { role: "system", content: `${fit.judge ? `${FIT}\n\n${GOALS}\nEach company in the reply also carries "goals".` : FIT}${fit.turnedDown.length ? `\n\n${TURNED_DOWN}` : ""}` },
      {
        role: "user",
        content: `Directions:\n${JSON.stringify(fit.directions)}\n\nTheir approved limits:\n${JSON.stringify(fit.limits)}\n\n${fit.judge ? `Their company goals:\n${JSON.stringify(fit.companyGoals)}\n\n` : ""}${fit.turnedDown.length ? `Companies they turned down, and why:\n${JSON.stringify(fit.turnedDown)}\n\n` : ""}Companies:\n${JSON.stringify(fit.companies)}`,
      },
    ],
  });
  const dirs = new Set(fit.directions.map((d) => String(d.id)));
  const levels = ["strong", "some", "weak", "none"];
  const byId = new Map((out.companies ?? []).map((c) => [String(c.id), c.fit ?? []]));
  const goalsById = new Map((out.companies ?? []).map((c) => [String(c.id), c.goals]));
  let n = 0;
  for (const c of fit.companies) {
    const f = (byId.get(String(c.id)) ?? [])
      .filter((x) => x.directionId && dirs.has(x.directionId) && levels.includes(x.level ?? "") && x.reason)
      .map((x) => ({ directionId: x.directionId as Id<"items">, level: x.level as "strong" | "some" | "weak" | "none", reason: x.reason!.trim() }));
    const g = goalsById.get(String(c.id));
    const goals = fit.judge && g && ["fits", "partly", "doesnt", "unknown"].includes(g.level ?? "") && g.reason ? { level: g.level as "fits" | "partly" | "doesnt" | "unknown", reason: g.reason.trim() } : undefined;
    await ctx.runMutation(internal.enrich.saveFit, { workspaceId: ws, id: c.id, fit: f, goals });
    n++;
  }
  return { n, costUsd };
}

export const saveFit = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("companies"),
    fit: v.array(v.object({ directionId: v.id("items"), level: v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none")), reason: v.string() })),
    goals: v.optional(v.object({ level: v.union(v.literal("fits"), v.literal("partly"), v.literal("doesnt"), v.literal("unknown")), reason: v.string() })),
  },
  handler: async (ctx, { workspaceId, id, fit, goals }) => {
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) return;
    await ctx.db.patch(id, { fit, fitAt: Date.now(), recheckAt: undefined, ...(goals ? { goals: { ...goals, ...(c.goals?.keep ? { keep: true } : {}), at: Date.now() } } : {}) });
  },
});

// Their rating. Excited makes a company a target; Targets and Maybe companies have their roles listed. `reason`: why
// it's not for them, kept with a "no" and shown where it's listed.
export const rate = mutation({
  args: { id: v.id("companies"), value: v.union(v.literal("excited"), v.literal("maybe"), v.literal("no"), v.null()), reason: v.optional(v.string()) },
  handler: async (ctx, { id, value, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new Error("Not found.");
    const why = value === "no" ? reason?.trim() || undefined : undefined;
    // Targets over time: made one, or no longer one when it was counted as one.
    const target = value === "excited";
    await ctx.db.patch(id, { rating: value ? { value, at: Date.now(), ...(why ? { reason: why } : {}) } : undefined, ...(target === !!c.talliedTarget ? {} : { talliedTarget: target || undefined }) });
    if (target !== !!c.talliedTarget) await tally(ctx, workspaceId, "targets", dayOf(Date.now()), target ? 1 : -1);
    await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId, companyId: id });
  },
});

// Keep a company the goals judgment set aside (or undo that).
export const keepAnyway = mutation({
  args: { id: v.id("companies"), keep: v.boolean() },
  handler: async (ctx, { id, keep }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId || !c.goals) throw new Error("Not found.");
    await ctx.db.patch(id, { goals: { ...c.goals, keep } });
  },
});

// Judge fit and goals again for every filled-in company (after goals or the lens change).
export const rejudge = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    for (const c of await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      if (c.fitAt) await ctx.db.patch(c._id, { fitAt: undefined });
    await startPass(ctx, workspaceId);
  },
});
