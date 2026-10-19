import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery } from "./_generated/server";
import { WEB_SEARCH_MODEL } from "./aiSettings";
import { type Board, boardsIn, get, NOT_READ, viaReader } from "./boards";
import type { BoardProvider } from "./boardProviders";
import { braveKeyFor } from "./braveKey";
import { refuseCancelled, stopIfCancelled } from "./cancel";
import { BOARD_QUERIES, normName, toDomain } from "./discovery";
import { type WorkArea, workAreaOf } from "./enrich";
import { searchIndustries } from "./goalIndustries";
import { activeLimits, itemsOf, liveDirection, recordRedirect } from "./itemShapes";
import { countryName } from "./limitBuckets";
import { chatJson, withBackoff } from "./metering";
import { replyOf, string } from "./replyJson";
import { screenCompanies } from "./screening";
import { origin } from "./schema";
import { dayOf, tally } from "./tallies";

// The web search for companies (findCompanies.ts chooses when it runs), for each direction whose search criteria are
// approved. Two kinds, each up to WEB_CAP companies a direction: relevant ones (the kind of company the direction
// should target, hiring or not), from a model that searches the web; and ones hiring now, from the same model asked for
// open roles and from the public job boards through Brave Search (the workspace's own key). Each candidate is a name,
// its website and the page it was seen on; nothing else it says about the company is kept. One row per website: a
// company already found (by Apollo, an earlier search or another direction) gets another `found`, not a second row.
// Past employers and companies they turned down never come back; job sites and agencies are set aside by the same
// screen as every search (screening.ts). Then the companies are looked up as always (enrich.ts).

export const WEB_CAP = 15;
const BRAVE_TIMEOUT_MS = 8000;

type Source = "aiSearch" | "jobBoards";
type Candidate = { name: string; domain: string; source: Source; evidence?: string };
// What one web search found, and what it cost.
type Searched = { candidates: Candidate[]; costUsd: number };
// What the job-board search found for a direction: its companies, the Brave queries it made, how many boards were left
// out for want of a name or website, and why Brave refused, when it did.
type BoardsFound = { candidates: Candidate[]; queries: number; leftOut: number; refused?: string };

// Hosts that are never a company's own website: job boards and job sites.
const NOT_A_SITE = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|myworkdayjobs\.com|linkedin\.com|indeed\.com|glassdoor\.[a-z.]+|ziprecruiter\.com|builtin\.com|wellfound\.com|teamtailor\.com|breezy\.hr|bamboohr\.com|rippling\.com|icims\.com|jobvite\.com|recruitee\.com|dover\.com|google\.com|googleapis\.com|gstatic\.com|cloudflare\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|github\.com|w3\.org|schema\.org)$/;

// Everything the prompts say about the person and each direction, beside discovery.inputs (exclusions, lens).
export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const directions = (await itemsOf(ctx, workspaceId, "direction", "approved")).filter((d) => d.data.criteriaStatus === "approved" && d.data.criteria);
    const limits = (await activeLimits(ctx, workspaceId)).filter((l) => ["companies", "work", "seniority", "location"].includes(l.data.kind)).map((l) => ({ kind: l.data.kind, value: l.data.value }));
    return { positioning: Object.fromEntries(directions.map((d) => [d._id, d.data.detail?.positioning ?? ""])), limits, area: await workAreaOf(ctx, workspaceId) };
  },
});

// Which of these websites already have a company row.
export const known = internalQuery({
  args: { workspaceId: v.id("workspaces"), domains: v.array(v.string()) },
  handler: async (ctx, { workspaceId, domains }) => {
    const out: string[] = [];
    for (const domain of domains)
      if (await ctx.db.query("companies").withIndex("by_workspace_domain", (q) => q.eq("workspaceId", workspaceId).eq("domain", domain)).first()) out.push(domain);
    return out;
  },
});

// Saves one search's companies for a direction (or, for the companies they named, for every direction): a new row per
// website not seen before, else another `found` on the row that has it. A new row needs a name that can be trusted as
// one (trustedName), never a website standing in for it. Returns how many rows are new.
export const saveCompanies = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    runId: v.id("jobs"),
    directionId: v.optional(v.id("items")),
    via: v.union(v.literal("relevant"), v.literal("hiringNow"), v.literal("hand")),
    companies: v.array(v.object({ name: v.string(), domain: v.string(), source: v.optional(v.union(v.literal("aiSearch"), v.literal("jobBoards"))), evidence: v.optional(v.string()) })),
  },
  handler: async (ctx, { workspaceId, runId, directionId: asked, via, companies }) => {
    await refuseCancelled(ctx, runId);
    // A search for a direction merged away since it started counts for the one it went into.
    const directionId = asked && (await liveDirection(ctx, asked));
    let added = 0;
    const at = Date.now();
    for (const c of companies) {
      const seen = { ...(directionId ? { directionId } : {}), via, ...(c.source ? { source: c.source } : {}), ...(c.evidence ? { evidence: c.evidence } : {}), runId, at };
      const row = await ctx.db.query("companies").withIndex("by_workspace_domain", (q) => q.eq("workspaceId", workspaceId).eq("domain", c.domain)).first();
      if (!row) {
        if (!trustedName(c.name)) continue;
        const id = await ctx.db.insert("companies", { workspaceId, name: c.name, domain: c.domain, websiteUrl: `https://${c.domain}`, found: [seen], talliedFound: true, at });
        if (asked && directionId !== asked) await recordRedirect(ctx, workspaceId, asked, { table: "companies", docId: id, before: { was: { fit: null, found: [{ ...seen, directionId: asked }] }, now: { fit: null, found: [seen] } } });
        added++;
      } else if (!row.found.some((f) => f.runId === runId && f.directionId === directionId && f.via === via && f.source === c.source)) {
        await ctx.db.patch(row._id, { found: [...row.found, seen] });
        if (asked && directionId !== asked)
          await recordRedirect(ctx, workspaceId, asked, { table: "companies", docId: row._id, before: { was: { fit: row.fit ?? null, found: [...row.found, { ...seen, directionId: asked }] }, now: { fit: row.fit ?? null, found: [...row.found, seen] } } });
      }
    }
    await tally(ctx, workspaceId, "companies", dayOf(at), added);
    return added;
  },
});

// Starts looking up companies (enrich.ts) unless a pass is already queued or running: a running pass picks up new rows
// itself, so the Apollo search's pass serves the web search's companies too.
export const lookUp = internalMutation({
  args: { workspaceId: v.id("workspaces"), origin: v.optional(origin) },
  handler: async (ctx, args) => {
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId)).order("desc").take(100);
    if (jobs.some((j) => j.kind === "enrich" && (j.status === "queued" || j.status === "running"))) return;
    const jobId = await ctx.db.insert("jobs", { workspaceId: args.workspaceId, kind: "enrich", args: {}, status: "queued", ...(args.origin ? { origin: args.origin } : {}) });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  },
});

type DirectionIn = { id: Id<"items">; name: string; criteria: { titles: string[]; industries: string[]; sizes: string[] } };
type Context = { industries: string[]; positioning: string; limits: { kind: string; value: string }[] };

const SYSTEM = `You find real employers for a job seeker, using web search. Never invent a company, a website or a URL. Skip job sites, job boards, staffing and recruiting agencies. Reply with JSON only.`;

// What the person and the direction are, in the prompts' words.
function about(d: DirectionIn, c: Context) {
  const limit = (kind: string) => c.limits.filter((l) => l.kind === kind).map((l) => l.value).join("; ");
  return [
    `Direction: ${d.name}`,
    c.positioning && `In their words: ${c.positioning}`,
    d.criteria.titles.length && `Titles: ${d.criteria.titles.join("; ")}`,
    c.industries.length && `Industries: ${c.industries.join("; ")}`,
    d.criteria.sizes.length && `Company sizes (employees): ${d.criteria.sizes.join("; ")}`,
    limit("seniority") && `Seniority: ${limit("seniority")}`,
    limit("location") && `Where they can work: ${limit("location")}`,
    limit("companies") && `Companies they want: ${limit("companies")}`,
    limit("work") && `Work they avoid: ${limit("work")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function relevantPrompt(d: DirectionIn, c: Context) {
  return `${about(d, c)}

List ${WEB_CAP} different employers whose work fits this direction: the kind of company this person should target over the next year, whether or not they are hiring today. Not job sites or staffing agencies; real companies with their own website.
For each give: "name"; "website" (its own homepage URL); "why" (one sentence on why it fits this direction); "sourceUrl" (a page from your search that shows what the company does).
Reply with JSON only: {"companies":[{"name":"","website":"","why":"","sourceUrl":""}]}`;
}

export function hiringPrompt(d: DirectionIn, c: Context) {
  return `${about(d, c)}

List ${WEB_CAP} different real companies hiring now for this kind of role that fit where they can work (remote counts where they can work remotely). Only companies you saw with an open posting in your search results.
For each give: "name"; "website" (the company's own homepage URL); "roleTitle" (an open role you saw); "sourceUrl" (where you saw it).
Reply with JSON only: {"companies":[{"name":"","website":"","roleTitle":"","sourceUrl":""}]}`;
}

const RELEVANT_SCHEMA = replyOf("relevant_companies", "companies", { name: string, website: string, why: string, sourceUrl: string });
const HIRING_SCHEMA = replyOf("companies_hiring_now", "companies", { name: string, website: string, roleTitle: string, sourceUrl: string });

// One web search, as companies with a website. A website that's really a job board or job site isn't one.
async function webSearch(ctx: ActionCtx, workspaceId: Id<"workspaces">, purpose: string, user: string, schema: typeof RELEVANT_SCHEMA): Promise<Searched> {
  const reply = await withBackoff(() =>
    chatJson<{ companies?: { name?: string; website?: string; sourceUrl?: string }[] }>(ctx, {
      workspaceId,
      purpose,
      model: WEB_SEARCH_MODEL,
      maxTokens: 4000,
      schema,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  );
  const candidates = (Array.isArray(reply.out.companies) ? reply.out.companies : []).flatMap((c): Candidate[] => {
    const domain = typeof c.website === "string" ? toDomain(c.website) : null;
    const name = trustedName(typeof c.name === "string" ? c.name : null);
    if (!name || !domain || NOT_A_SITE.test(domain)) return [];
    return [{ name, domain, source: "aiSearch", ...(typeof c.sourceUrl === "string" && /^https?:\/\//.test(c.sourceUrl.trim()) ? { evidence: c.sourceUrl.trim() } : {}) }];
  });
  return { candidates, costUsd: reply.costUsd };
}

// A company's name that can be trusted as one: a name it was given (by the web search, its board's page or its own
// site), never a website or address standing in for it ("acme.com", "https://acme.com/jobs").
export function trustedName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;|&#x27;/g, "’").replace(/\s+/g, " ").trim();
  if (!name || name.length > 80 || /:\/\/|\/|^www\./i.test(name) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) return null;
  return name;
}

// A company's name from its own website, for a company they named by its website: the site's own name (og:site_name or
// application-name) or the part of its page title that names it, kept only when it matches the website's name
// ("NVIDIA" for nvidia.com, "Toast" for toasttab.com). A site that turns away server requests is read through a reader.
export async function siteName(domain: string): Promise<string | null> {
  const page = await get(`https://${domain}`);
  const html = page ? await page.text().catch(() => "") : "";
  const meta = (key: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, "i"))?.[1];
  const title = html ? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] : (await viaReader(`https://${domain}`)).match(/^Title:\s*(.+)$/m)?.[1];
  const base = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const names = [meta("og:site_name"), meta("application-name"), ...(title ?? "").split(/\s+[|–—:·-]\s+/)];
  for (const n of names) {
    const name = trustedName(n);
    const s = name ? squash(name) : "";
    if (name && s.length > 1 && (base.includes(s) || s.includes(base))) return name;
  }
  return null;
}

// The public job boards Brave is asked about: boards CareerBot reads (never ones whose rules ask it not to, boards.ts
// NOT_READ), each with its board page by slug.
const BOARD_SITES: Partial<Record<BoardProvider, { site: string[]; root: string }>> = {
  greenhouse: { site: ["job-boards.greenhouse.io", "boards.greenhouse.io"], root: "https://job-boards.greenhouse.io/" },
  lever: { site: ["jobs.lever.co"], root: "https://jobs.lever.co/" },
  ashby: { site: ["jobs.ashbyhq.com"], root: "https://jobs.ashbyhq.com/" },
  workable: { site: ["apply.workable.com"], root: "https://apply.workable.com/" },
};
const SITES = `(${Object.values(BOARD_SITES).flatMap((b) => b!.site.map((s) => `site:${s}`)).join(" OR ")})`;

type Hit = { url: string; title: string };
// One Brave search: its results, or why Brave refused (its limit, the key, or no answer).
async function brave(key: string, q: string): Promise<{ hits: Hit[] } | { refused: string }> {
  let res: Response;
  try {
    res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20`, { headers: { accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(BRAVE_TIMEOUT_MS) });
  } catch {
    return { refused: "Brave Search didn’t answer" };
  }
  if (res.status === 429 || res.status === 402) return { refused: "your Brave Search key reached its limit" };
  if (res.status === 401 || res.status === 403) return { refused: "Brave Search didn’t accept your key" };
  if (!res.ok) return { refused: `Brave Search returned ${res.status}` };
  const body = (await res.json().catch(() => null)) as { web?: { results?: { url?: unknown; title?: unknown }[] } } | null;
  return { hits: (body?.web?.results ?? []).flatMap((r) => (typeof r.url === "string" ? [{ url: r.url, title: typeof r.title === "string" ? r.title : "" }] : [])) };
}

// The company's name from a board result's title, where the title names it (each board titles its pages its own way);
// null when it doesn't.
export function nameFromHit(title: string, b: Board): string | null {
  const t = title.replace(/\s*[|-]\s*(Lever|Ashby|Greenhouse|Workable)\s*$/i, "");
  const m = t.match(/Job Application for .+? at (.+)$/i) ?? t.match(/@ (.+)$/) ?? t.match(/^(.+?) is (?:looking|hiring) for/i) ?? (b.provider === "lever" ? t.match(/^(.+?) - /) : null) ?? (b.provider === "workable" ? t.match(/ - ([^-]+)$/) : null) ?? t.match(/\| (.+)$/);
  return trustedName(m?.[1]?.replace(/\s*\|.*$/, "").replace(/\s*\(.*$/, ""));
}

// A company's website from its job board: an outside link on the board's page (or the posting's) whose name shares a
// word with the company's name or the board's slug.
export async function siteOf(b: Board, posting: string, name: string): Promise<string | null> {
  const words = normName(name).split(" ").filter((w) => w.length > 2);
  const slug = b.slug.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const url of [`${BOARD_SITES[b.provider]!.root}${b.slug}`, posting]) {
    const page = await get(url);
    const html = page ? await page.text().catch(() => "") : "";
    for (const m of html.matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi)) {
      const domain = toDomain(m[0]);
      if (!domain || NOT_A_SITE.test(domain)) continue;
      const base = domain.split(".").slice(-2, -1)[0] ?? "";
      if (base.length > 2 && (words.some((w) => base.includes(w)) || base.includes(slug) || slug.includes(base))) return domain;
    }
  }
  return null;
}

// Job boards with a role of the direction's titles, as companies: the company's name from the result and its website
// from its board; a board whose name or website can't be found is left out. A board Brave refuses stops the search
// there, keeping what it found.
async function jobBoards(key: string, d: DirectionIn, area: WorkArea | null): Promise<BoardsFound> {
  const where = [area?.remoteOk ? "remote" : "", area?.countries?.length ? countryName(area.countries[0]) : ""].filter(Boolean).join(" ");
  const boards: { board: Board; hit: Hit }[] = [];
  let queries = 0;
  let refused: string | undefined;
  for (const title of d.criteria.titles.slice(0, BOARD_QUERIES)) {
    const got = await brave(key, `"${title}"${where ? ` ${where}` : ""} ${SITES}`);
    queries++;
    if ("refused" in got) {
      refused = got.refused;
      break;
    }
    for (const hit of got.hits) {
      const board = boardsIn(hit.url)[0];
      if (!board || NOT_READ[board.provider] || !BOARD_SITES[board.provider] || boards.some((x) => x.board.provider === board.provider && x.board.slug === board.slug)) continue;
      if (boards.length < WEB_CAP) boards.push({ board, hit });
    }
  }
  const candidates: Candidate[] = [];
  let leftOut = 0;
  for (let i = 0; i < boards.length; i += 8)
    for (const r of await Promise.all(boards.slice(i, i + 8).map(async ({ board, hit }) => {
      const name = nameFromHit(hit.title, board);
      return { name, hit, domain: name ? await siteOf(board, hit.url, name) : null };
    })))
      if (r.name && r.domain) candidates.push({ name: r.name, domain: r.domain, source: "jobBoards", evidence: r.hit.url });
      else leftOut++;
  return { candidates, queries, leftOut, ...(refused ? { refused } : {}) };
}

// Each company once by website, first come first kept, up to the cap.
function distinct(lists: Candidate[][], keep: (c: Candidate) => boolean): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length && keep(l[i]) && !out.some((c) => c.domain === l[i].domain) && out.length < WEB_CAP) out.push(l[i]);
  return out;
}

type Report = { direction: string; relevant: { found: number; added: number }; hiringNow: { found: number; added: number; fromJobBoards: number } };
export type WebResult = { report: Report[]; named: { found: number; added: number; missing: string[] } | null; notes: string[]; boardQueries: number; costUsd: number };

// The web search for every direction. `named`: the companies they named are added too (when Apollo isn't looking them
// up). A run that stops part-way picks up after the last finished search, like Apollo's (discovery.runDiscover).
export async function runWeb(ctx: ActionCtx, job: Doc<"jobs">, { named }: { named: boolean }): Promise<WebResult> {
  const ws = job.workspaceId;
  // A cancelled run stops before its next step; the one it was on is dropped (jobs.checkpoint, saveCompanies refuse it).
  const finished = new Map((job.done ?? []).map((d) => [d.step, d.result]));
  const once = async <T,>(step: string, run: () => Promise<T>): Promise<T> => {
    if (finished.has(step)) return finished.get(step) as T;
    await stopIfCancelled(ctx, job._id);
    const r = await run();
    await ctx.runMutation(internal.jobs.checkpoint, { jobId: job._id, step, result: r });
    finished.set(step, r);
    return r;
  };
  const inp = await ctx.runQuery(internal.discovery.inputs, { workspaceId: ws });
  const more = await ctx.runQuery(internal.webDiscovery.inputs, { workspaceId: ws });
  const excluded = new Set(inp.exclude.map(normName));
  const turnedDown = { domains: new Set(inp.turnedDown.flatMap((c) => c.domain ?? [])), names: new Set(inp.turnedDown.map((c) => normName(c.name))) };
  const keep = (c: Candidate) => !excluded.has(normName(c.name)) && !turnedDown.names.has(normName(c.name)) && !turnedDown.domains.has(c.domain);
  const braveKey = await braveKeyFor(ctx, ws);
  const notes: string[] = [];
  let costUsd = 0;
  let boardQueries = 0;
  let leftOut = 0;
  let refused: string | null = null;
  let refusedAt = -1;

  // The companies they named, by website (AI only; with Apollo, Apollo looks them up): one already found keeps its row;
  // a new one takes its name from its own site, and one whose name can't be found there is reported, not saved.
  let namedResult: WebResult["named"] = null;
  if (named && inp.named.length)
    namedResult = await once(`web:named:${inp.named.join(",")}`, async () => {
      const known = new Set(await ctx.runQuery(internal.webDiscovery.known, { workspaceId: ws, domains: inp.named }));
      const looked = await Promise.all(inp.named.map(async (domain) => ({ domain, name: known.has(domain) ? null : await siteName(domain) })));
      const companies = looked.flatMap((x) => (known.has(x.domain) ? [{ name: x.domain, domain: x.domain }] : x.name ? [{ name: x.name, domain: x.domain }] : []));
      return {
        found: companies.length,
        added: await ctx.runMutation(internal.webDiscovery.saveCompanies, { workspaceId: ws, runId: job._id, via: "hand", companies }),
        missing: looked.filter((x) => !known.has(x.domain) && !x.name).map((x) => x.domain),
      };
    });

  const report: Report[] = [];
  for (const [i, d] of inp.directions.entries()) {
    // The lens, as Apollo's search reads it (goalIndustries.searchIndustries).
    const industries = searchIndustries(inp.goals, d.name, d.criteria.industries);
    const c: Context = { industries, positioning: more.positioning[d.id] ?? "", limits: more.limits };
    const [relevant, hiring, boards]: [Searched, Searched | null, BoardsFound | null] = await Promise.all([
      once(`web:relevant:${d.id}`, () => webSearch(ctx, ws, "relevant companies", relevantPrompt(d, c), RELEVANT_SCHEMA)),
      d.criteria.titles.length ? once(`web:hiring:${d.id}`, () => webSearch(ctx, ws, "companies hiring now", hiringPrompt(d, c), HIRING_SCHEMA)) : null,
      // Once Brave refuses, the rest of the run goes without it.
      braveKey && d.criteria.titles.length && !refused ? once(`web:boards:${d.id}`, () => jobBoards(braveKey, d, more.area)) : null,
    ]);
    costUsd += relevant.costUsd + (hiring?.costUsd ?? 0);
    if (boards) {
      boardQueries += boards.queries;
      leftOut += boards.leftOut;
      if (boards.refused && !refused) {
        refused = boards.refused;
        refusedAt = i;
      }
    }
    const rel = distinct([relevant.candidates], keep);
    const now = distinct([hiring?.candidates ?? [], boards?.candidates ?? []], keep);
    const saved = await once(`web:saved:${d.id}`, async () => ({
      relevant: await ctx.runMutation(internal.webDiscovery.saveCompanies, { workspaceId: ws, runId: job._id, directionId: d.id, via: "relevant", companies: rel }),
      hiringNow: await ctx.runMutation(internal.webDiscovery.saveCompanies, { workspaceId: ws, runId: job._id, directionId: d.id, via: "hiringNow", companies: now }),
    }));
    report.push({ direction: d.name, relevant: { found: rel.length, added: saved.relevant }, hiringNow: { found: now.length, added: saved.hiringNow, fromJobBoards: now.filter((x) => x.source === "jobBoards").length } });
  }
  if (refused) notes.push(`Job boards weren’t searched${refusedAt > 0 ? " for every direction" : ""}: ${refused}. Hiring now comes from web search alone.`);
  if (leftOut) notes.push(`${leftOut} ${leftOut === 1 ? "company" : "companies"} from job boards ${leftOut === 1 ? "was" : "were"} left out: no name or website to be found.`);
  await stopIfCancelled(ctx, job._id);
  const screened = await screenCompanies(ctx, ws);
  await stopIfCancelled(ctx, job._id);
  await ctx.runMutation(internal.webDiscovery.lookUp, { workspaceId: ws, ...(job.origin ? { origin: job.origin } : {}) });
  return { report, named: namedResult, notes, boardQueries, costUsd: costUsd + screened.costUsd };
}
