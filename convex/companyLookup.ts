import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { WEB_SEARCH_MODEL } from "./aiSettings";
import { get, publicHost } from "./boards";
import { braveKeyFor } from "./braveKey";
import { toDomain } from "./discovery";
import { action } from "./functions";
import { apollo, chatJson, withBackoff } from "./metering";
import { replyOf, string } from "./replyJson";
import { brave, NOT_A_SITE, nameInPage, trustedName } from "./webDiscovery";

// Companies you like (Search settings, a direction's Criteria): finding a company by its name, so they pick the one
// they mean instead of typing its website. Nothing is looked up as they type; only Find runs a search, on the way
// companies are found (findCompanies.ts): Apollo's search by name (1 credit), else the web: a Brave search on their own
// key when they have one, or a small web-search call from their AI budget. Each result is a name, its website and one
// line on what it does. A company Apollo returns is remembered with its Apollo id (discovery.resolved), so finding more
// like it needs no second lookup. A typed website needs no search: its name is read from its own site, for free.

export const RESULTS = 5;
// Pages about a company that aren't its own website.
const NOT_ITS_SITE = /(^|\.)(wikipedia\.org|crunchbase\.com|bloomberg\.com|zoominfo\.com|pitchbook\.com|dnb\.com|yelp\.com|bbb\.org|apollo\.io|owler\.com|cbinsights\.com|reddit\.com|medium\.com|tracxn\.com|craft\.co|forbes\.com|yahoo\.com)$/;

export type Found = { name: string; domain: string; line: string | null };
export type FindResult = { source: "apollo" | "brave" | "ai"; companies: Found[]; costUsd: number };
export type SiteName = { domain: string; name: string | null };

const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&#x27;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

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

// One line on what a company does, from its own homepage's description; null when it has none.
export async function siteLine(domain: string): Promise<string | null> {
  const html = await homepage(domain);
  const meta = (key: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, "i"))?.[1];
  const line = clean(meta("description") ?? meta("og:description") ?? "");
  return line ? (line.length > 140 ? `${line.slice(0, 139).trimEnd()}…` : line) : null;
}

// Results by website, first one kept, job sites and directories left out.
function distinct(found: Found[]): Found[] {
  const seen = new Set<string>();
  return found.filter((f) => {
    if (seen.has(f.domain) || NOT_A_SITE.test(f.domain) || NOT_ITS_SITE.test(f.domain)) return false;
    seen.add(f.domain);
    return true;
  });
}

async function byApollo(ctx: ActionCtx, workspaceId: Id<"workspaces">, name: string): Promise<Found[]> {
  const body = (await apollo(ctx, { workspaceId, purpose: "find a company by name", endpoint: "mixed_companies/search", automated: false, params: { q_organization_name: name, per_page: RESULTS, page: 1 } })) as {
    organizations?: { id?: string; name?: string; primary_domain?: string; website_url?: string }[];
  } | null;
  const orgs = (body?.organizations ?? []).flatMap((o) => {
    const domain = toDomain(o.primary_domain ?? o.website_url ?? "");
    const title = trustedName(o.name);
    return o.id && domain && title ? [{ apolloId: o.id, name: title, domain }] : [];
  });
  await ctx.runMutation(internal.discovery.saveSeeds, { workspaceId, resolved: orgs.map((o) => ({ domain: o.domain, apolloId: o.apolloId, name: o.name })) });
  const found = distinct(orgs.map((o) => ({ name: o.name, domain: o.domain, line: null })));
  return Promise.all(found.map(async (f) => ({ ...f, line: await siteLine(f.domain) })));
}

async function byBrave(key: string, name: string): Promise<Found[]> {
  const got = await brave(key, `${name} company official website`, 10);
  if ("refused" in got) throw new ConvexError(`Couldn’t search: ${got.refused}.`);
  return distinct(
    got.hits.flatMap((h) => {
      const domain = toDomain(h.url);
      const title = trustedName(clean(h.title).split(/\s+[|–—:·-]\s+/)[0]);
      return domain && title ? [{ name: title, domain, line: clean(h.description) || null }] : [];
    }),
  ).slice(0, RESULTS);
}

const NAMED_SCHEMA = replyOf("companies_named", "companies", { name: string, website: string, line: string });

async function byAi(ctx: ActionCtx, workspaceId: Id<"workspaces">, name: string): Promise<{ found: Found[]; costUsd: number }> {
  const reply = await withBackoff(() =>
    chatJson<{ companies?: { name?: string; website?: string; line?: string }[] }>(ctx, {
      workspaceId,
      purpose: "find a company by name",
      model: WEB_SEARCH_MODEL,
      maxTokens: 800,
      schema: NAMED_SCHEMA,
      messages: [
        { role: "system", content: "You find real companies by name, using web search. Never invent a company or a website. Reply with JSON only." },
        {
          role: "user",
          content: `Companies named "${name}" (or very close to it), most likely first, at most ${RESULTS}. For each give: "name"; "website" (the company's own homepage URL); "line" (what the company does, in under 12 words).\nReply with JSON only: {"companies":[{"name":"","website":"","line":""}]}`,
        },
      ],
    }),
  );
  const found = (Array.isArray(reply.out.companies) ? reply.out.companies : []).flatMap((c) => {
    const domain = typeof c.website === "string" ? toDomain(c.website) : null;
    const title = trustedName(typeof c.name === "string" ? c.name : null);
    return domain && title ? [{ name: title, domain, line: typeof c.line === "string" && c.line.trim() ? clean(c.line) : null }] : [];
  });
  return { found: distinct(found).slice(0, RESULTS), costUsd: reply.costUsd };
}

// Find: companies with this name, by the way companies are found.
export const find = action({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<FindResult> => {
    const workspaceId = await ctx.runQuery(internal.workspaces.callerWorkspace, {});
    const q = name.trim();
    if (!q) throw new ConvexError("Type a company’s name first.");
    const finding = await ctx.runQuery(internal.findCompanies.finding, { workspaceId });
    if (finding !== "web") return { source: "apollo", companies: await byApollo(ctx, workspaceId, q), costUsd: 0 };
    const key = await braveKeyFor(ctx, workspaceId);
    if (key) return { source: "brave", companies: await byBrave(key, q), costUsd: 0 };
    const { found, costUsd } = await byAi(ctx, workspaceId, q);
    return { source: "ai", companies: found, costUsd };
  },
});

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
