import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalQuery } from "./_generated/server";
import { get, publicHost } from "./boards";
import { normName, toDomain } from "./discovery";
import { action } from "./functions";
import { NOT_A_SITE, nameInPage, trustedName } from "./webDiscovery";

// Companies you like (Search settings, a direction's Criteria): finding a company as its name is typed, and a pasted
// list line by line. Always free: never Apollo, a web search or an AI call. Two sources, merged by website (the first
// one keeps it):
// - their own companies (the companies table, by name), first, and still there when Wikidata can't be reached;
// - Wikidata (www.wikidata.org and query.wikidata.org): its entity search, kept to organisations with an official
//   website (P856) and the marks of one (an industry, headquarters, stock exchange, legal form, revenue or staff count;
//   not a person or a place with a population), in one small SPARQL query. Its data is CC0.
// Only the typed text goes out, from the server, with CareerBot's own user agent (boards.get): no cookies, nothing about
// the person or the workspace. Wikidata's answers are kept for a few minutes (in this server's memory), so typing back
// and forth asks once.
// Not Clearbit's free autocomplete: its terms (clearbit.com/terms, 4.6) say "Non-paying users of the Services are
// expressly forbidden from caching or otherwise storing the Product Data" and forbid accessing it "in bulk", and a
// company chosen here is stored, and a pasted list looks up many at once.
// A typed website needs no search: its name is read from its own site (website), free as before.

export const MIN_CHARS = 2;
export const SUGGESTIONS = 6;
// The most lines one pasted list resolves.
export const PASTE_MAX = 100;
const SOURCE_MS = 2000;
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;
// Lines of a pasted list looked up at once.
const PASTE_AT_ONCE = 8;
// Pages about a company that aren't its own website.
const NOT_ITS_SITE = /(^|\.)(wikipedia\.org|wikidata\.org|crunchbase\.com|bloomberg\.com|zoominfo\.com|pitchbook\.com|dnb\.com|yelp\.com|bbb\.org|apollo\.io|owler\.com|cbinsights\.com|reddit\.com|medium\.com|tracxn\.com|craft\.co|forbes\.com|yahoo\.com)$/;

type Found = { name: string; domain: string };
// yours: one of their own companies.
export type Suggestion = Found & { yours: boolean };
// One line of a pasted list: the company it means, or null when nothing was found. check: a name that matched no
// company exactly, so the first suggestion stands in and they should look at it. A website line names its company
// exactly (its name null when no source knows it).
export type Resolved = { line: string; match: { domain: string; name: string | null } | null; check: boolean };
export type SiteName = { domain: string; name: string | null };

// Looks like a website (acme.com, https://www.acme.com/about), not a name.
export const looksLikeWebsite = (s: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(s.trim());

const cache = new Map<string, { at: number; found: Found[] }>();
async function cached(key: string, load: () => Promise<Found[] | null>): Promise<Found[] | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.found;
  const found = await load();
  if (found) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), found });
  }
  return found;
}
// For tests: each starts with nothing kept.
export const forgetSuggestions = () => cache.clear();

async function json(url: string, accept = "application/json"): Promise<unknown> {
  const res = await get(url, accept, SOURCE_MS);
  if (!res?.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Wikidata's organisations with an official website for a name; null when it can't be reached.
async function wikidata(q: string): Promise<Found[] | null> {
  return cached(`wikidata:${q.toLowerCase()}`, async () => {
    const search = (await json(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&language=en&uselang=en&limit=10&search=${encodeURIComponent(q)}`)) as {
      search?: { id?: string; label?: string }[];
    } | null;
    if (!search) return null;
    const hits = (search.search ?? []).filter((h): h is { id: string; label: string } => typeof h.id === "string" && /^Q\d+$/.test(h.id) && typeof h.label === "string");
    if (!hits.length) return [];
    const query = `SELECT ?item (SAMPLE(?s) AS ?site) WHERE { VALUES ?item { ${hits.map((h) => `wd:${h.id}`).join(" ")} } ?item wdt:P856 ?s . FILTER EXISTS { ?item (wdt:P452|wdt:P159|wdt:P414|wdt:P1454|wdt:P2139|wdt:P1128) ?x } FILTER NOT EXISTS { ?item wdt:P1082 ?p } FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 } } GROUP BY ?item`;
    const sites = (await json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, "application/sparql-results+json")) as {
      results?: { bindings?: { item?: { value?: string }; site?: { value?: string } }[] };
    } | null;
    if (!sites) return null;
    const siteOf = new Map((sites.results?.bindings ?? []).map((b) => [b.item?.value?.split("/").pop(), b.site?.value]));
    return hits.flatMap((h) => {
      const site = siteOf.get(h.id);
      const domain = site ? toDomain(site) : null;
      const name = trustedName(h.label);
      return domain && name ? [{ name, domain }] : [];
    });
  });
}

// Their own companies with this name, as the companies table's search finds it (by words, the last one as a prefix).
export const yours = internalQuery({
  args: { workspaceId: v.id("workspaces"), q: v.string() },
  handler: async (ctx, { workspaceId, q }): Promise<Found[]> => {
    const rows = await ctx.db
      .query("companies")
      .withSearchIndex("search_name", (s) => s.search("name", q).eq("workspaceId", workspaceId))
      .take(SUGGESTIONS);
    return rows.flatMap((c) => (c.domain ? [{ name: c.name, domain: c.domain }] : []));
  },
});

// One of their own companies by its website, for a website line's name.
export const yoursAt = internalQuery({
  args: { workspaceId: v.id("workspaces"), domain: v.string() },
  handler: async (ctx, { workspaceId, domain }) =>
    (await ctx.db.query("companies").withIndex("by_workspace_domain", (q) => q.eq("workspaceId", workspaceId).eq("domain", domain)).first())?.name ?? null,
});

async function suggestionsFor(ctx: ActionCtx, workspaceId: Id<"workspaces">, q: string): Promise<Suggestion[]> {
  const [own, web] = await Promise.all([ctx.runQuery(internal.companyLookup.yours, { workspaceId, q }), wikidata(q).then((w) => w ?? [])]);
  const seen = new Set<string>();
  return [...own.map((f) => ({ ...f, yours: true })), ...web.map((f) => ({ ...f, yours: false }))]
    .filter((f) => !NOT_A_SITE.test(f.domain) && !NOT_ITS_SITE.test(f.domain) && !seen.has(f.domain) && !!seen.add(f.domain))
    .slice(0, SUGGESTIONS);
}

// As a name is typed (from MIN_CHARS): the companies it may mean, their own first.
export const suggest = action({
  args: { q: v.string() },
  handler: async (ctx, { q }): Promise<Suggestion[]> => {
    const workspaceId = await ctx.runQuery(internal.workspaces.callerWorkspace, {});
    const text = q.trim().slice(0, 100);
    if (text.length < MIN_CHARS || looksLikeWebsite(text)) return [];
    return suggestionsFor(ctx, workspaceId, text);
  },
});

async function resolveLine(ctx: ActionCtx, workspaceId: Id<"workspaces">, line: string): Promise<Resolved> {
  if (looksLikeWebsite(line)) {
    const domain = toDomain(line);
    if (!domain || !publicHost(domain)) return { line, match: null, check: false };
    const own = await ctx.runQuery(internal.companyLookup.yoursAt, { workspaceId, domain });
    const html = own ? "" : await homepage(domain);
    return { line, match: { domain, name: own ?? (html ? nameInPage(domain, html) : null) }, check: false };
  }
  const found = await suggestionsFor(ctx, workspaceId, line.slice(0, 100));
  const exact = found.filter((f) => normName(f.name) === normName(line));
  if (exact.length === 1) return { line, match: { domain: exact[0].domain, name: exact[0].name }, check: false };
  return found[0] ? { line, match: { domain: found[0].domain, name: found[0].name }, check: true } : { line, match: null, check: false };
}

// A pasted list, already split into lines (at most PASTE_MAX): each line's company, in the same order. Nothing is
// added; Search settings shows them to check first.
export const resolve = action({
  args: { lines: v.array(v.string()) },
  handler: async (ctx, { lines }): Promise<Resolved[]> => {
    const workspaceId = await ctx.runQuery(internal.workspaces.callerWorkspace, {});
    if (lines.length > PASTE_MAX) throw new ConvexError(`Paste at most ${PASTE_MAX} companies at a time.`);
    const out: Resolved[] = [];
    for (let i = 0; i < lines.length; i += PASTE_AT_ONCE)
      out.push(...(await Promise.all(lines.slice(i, i + PASTE_AT_ONCE).map((l) => resolveLine(ctx, workspaceId, l.trim())))));
    return out;
  },
});

// A company's homepage, read safely: only https on a plain public hostname (boards.get: no IP addresses, localhost or
// internal names, and each redirect checked the same way), at most PAGE_BYTES of it, within PAGE_MS. "" when it can't
// be read.
export const PAGE_BYTES = 256_000;
const PAGE_MS = 4000;
export async function homepage(domain: string): Promise<string> {
  if (!publicHost(domain)) return "";
  const page = await get(`https://${domain}`, "text/html", PAGE_MS);
  const reader = page?.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (bytes < PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.byteLength;
    }
  } catch {
    return "";
  } finally {
    void reader.cancel().catch(() => {});
  }
  const all = new Uint8Array(Math.min(bytes, PAGE_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, all.length - at);
    all.set(part, at);
    at += part.length;
  }
  return new TextDecoder().decode(all);
}

// A typed website: its name from its own site (null when the site doesn't say it). Free.
export const website = action({
  args: { website: v.string() },
  handler: async (ctx, { website }): Promise<SiteName> => {
    await ctx.runQuery(internal.workspaces.callerWorkspace, {});
    const domain = toDomain(website);
    if (!domain || !publicHost(domain)) throw new ConvexError("Use the company’s website, like acme.com.");
    const html = await homepage(domain);
    return { domain, name: html ? nameInPage(domain, html) : null };
  },
});
