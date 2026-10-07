import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type QueryCtx, query } from "./_generated/server";
import { mutation } from "./functions";
import { activeLimits, itemsOf } from "./itemShapes";
import { apollo } from "./metering";
import { DEFAULT_LENS } from "./lens";
import { screenCompanies } from "./screening";
import { dayOf, tally } from "./tallies";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Finds companies with Apollo for each direction whose search criteria are approved: one search from the criteria, and
// lookalike searches from seed companies (the workspace's default seeds, or the direction's own when set). Seeds are
// websites; Apollo's lookalike filter needs its own ids, so seeds are looked up first. Past employers never come back.
// Learning from their ratings (on unless they turn it off): their targets seed lookalike searches too, for each
// direction the target fits, and companies they turned down are never found again.

const LOOKALIKE_MAX = 5;

// A website, URL or email reduced to its domain; null if it doesn't look like one.
export function toDomain(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/^mailto:/, "").replace(/^.*@/, "");
  const host = t.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

// "51-200" -> "51,200"; "5001+" -> "5001,1000000".
const sizeRange = (s: string) => (s.endsWith("+") ? `${s.slice(0, -1)},1000000` : s.replace("-", ","));
const normName = (n: string) => n.toLowerCase().replace(/\b(llc|inc|corp|corporation|co|ltd|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function settings(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
}

// Learn from your ratings: on unless they turned it off.
export const learns = (row: Doc<"discovery"> | null) => row?.learn !== false;

// Targets that seed lookalike searches: places to work Apollo knows, each for the directions it fits (strong or some).
function targetSeeds(companies: Doc<"companies">[]) {
  return companies
    .filter((c) => c.rating?.value === "excited" && c.apolloId && c.screened?.employer !== false)
    .map((c) => ({ apolloId: c.apolloId!, name: c.name, directionIds: (c.fit ?? []).filter((f) => f.level === "strong" || f.level === "some").map((f) => f.directionId) }))
    .filter((t) => t.directionIds.length);
}

export const setSeeds = mutation({
  args: { seeds: v.array(v.string()) },
  handler: async (ctx, { seeds }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const bad = seeds.filter((s) => s.trim() && !toDomain(s));
    if (bad.length) throw new ConvexError(`Use each company's website, like acme.com: ${bad.join(", ")}`);
    const domains = [...new Set(seeds.map(toDomain).filter((d): d is string => !!d))];
    const row = await settings(ctx, workspaceId);
    if (row) await ctx.db.patch(row._id, { seeds: domains });
    else await ctx.db.insert("discovery", { workspaceId, seeds: domains, resolved: [] });
  },
});

// A direction's own seeds, replacing the default. An empty list goes back to the default.
export const setNamed = mutation({
  args: { named: v.array(v.string()) },
  handler: async (ctx, { named }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const bad = named.filter((s) => s.trim() && !toDomain(s));
    if (bad.length) throw new ConvexError(`Use each company's website, like nvidia.com: ${bad.join(", ")}`);
    const domains = [...new Set(named.map(toDomain).filter((d): d is string => !!d))];
    const row = await settings(ctx, workspaceId);
    if (row) await ctx.db.patch(row._id, { named: domains });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], named: domains, resolved: [] });
  },
});

export const setDirectionSeeds = mutation({
  args: { id: v.id("items"), seeds: v.array(v.string()) },
  handler: async (ctx, { id, seeds }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const d = await getInWorkspace(ctx, workspaceId, id);
    if (!d || d.kind !== "direction" || !d.data.criteria) throw new Error("Not found.");
    const bad = seeds.filter((s) => s.trim() && !toDomain(s));
    if (bad.length) throw new ConvexError(`Use each company's website, like acme.com: ${bad.join(", ")}`);
    const domains = [...new Set(seeds.map(toDomain).filter((x): x is string => !!x))];
    const { seeds: _old, ...rest } = d.data.criteria;
    await ctx.db.patch(id, { data: { ...d.data, criteria: domains.length ? { ...rest, seeds: domains } : rest } });
  },
});

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const targets = (await itemsOf(ctx, workspaceId, "direction", "approved")).filter((d) => d.data.criteriaStatus === "approved");
    if (!targets.length) throw new ConvexError("Approve a direction's search criteria first.");
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    if (jobs.some((j) => j.kind === "discover" && (j.status === "queued" || j.status === "running"))) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "discover", args: {}, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const directions = (await itemsOf(ctx, workspaceId, "direction", "approved")).filter((d) => d.data.criteriaStatus === "approved" && d.data.criteria);
    const avoid = new Set<string>();
    const want = new Set<string>();
    const exclude: string[] = [];
    for (const l of await activeLimits(ctx, workspaceId))
      if (l.data.kind === "companies") {
        for (const i of (l.data.rule?.industriesAvoid as string[] | undefined) ?? []) avoid.add(i);
        for (const i of (l.data.rule?.industriesWant as string[] | undefined) ?? []) want.add(i);
        exclude.push(...((l.data.rule?.exclude as string[] | undefined) ?? []));
      }
    const row = await settings(ctx, workspaceId);
    const learn = learns(row);
    const companies = learn ? await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect() : [];
    return {
      directions: directions.map((d) => ({ id: d._id, name: d.data.name, criteria: d.data.criteria! })),
      avoid: [...avoid],
      want: [...want],
      lens: row?.lens ?? DEFAULT_LENS,
      exclude,
      seeds: row?.seeds ?? [],
      named: row?.named ?? [],
      resolved: row?.resolved ?? [],
      targets: targetSeeds(companies),
      turnedDown: companies.filter((c) => c.rating?.value === "no").map((c) => ({ name: c.name, ...(c.apolloId ? { apolloId: c.apolloId } : {}), ...(c.domain ? { domain: c.domain } : {}) })),
    };
  },
});

type Org = { id?: string; name?: string; primary_domain?: string; website_url?: string; linkedin_url?: string; founded_year?: number };
const orgsOf = (body: unknown): Org[] => {
  const b = body as { organizations?: Org[]; accounts?: Org[] } | null;
  return [...(b?.organizations ?? []), ...(b?.accounts ?? [])];
};
const totalOf = (body: unknown) => (body as { pagination?: { total_entries?: number } } | null)?.pagination?.total_entries ?? null;

export const saveSeeds = internalMutation({
  args: { workspaceId: v.id("workspaces"), resolved: v.array(v.object({ domain: v.string(), apolloId: v.union(v.string(), v.null()), name: v.optional(v.string()) })) },
  handler: async (ctx, { workspaceId, resolved }) => {
    const row = await settings(ctx, workspaceId);
    const merged = [...(row?.resolved ?? []).filter((r) => !resolved.some((x) => x.domain === r.domain)), ...resolved];
    if (row) await ctx.db.patch(row._id, { resolved: merged });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: merged });
  },
});

export const saveCompanies = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    runId: v.id("jobs"),
    directionId: v.optional(v.id("items")),
    via: v.union(v.literal("criteria"), v.literal("lookalike"), v.literal("hiring"), v.literal("large"), v.literal("hand")),
    orgs: v.array(v.object({ apolloId: v.string(), name: v.string(), domain: v.optional(v.string()), websiteUrl: v.optional(v.string()), linkedinUrl: v.optional(v.string()), foundedYear: v.optional(v.number()) })),
  },
  handler: async (ctx, { workspaceId, runId, directionId, via, orgs }) => {
    let added = 0;
    const at = Date.now();
    for (const o of orgs) {
      const row = await ctx.db.query("companies").withIndex("by_workspace_apollo", (q) => q.eq("workspaceId", workspaceId).eq("apolloId", o.apolloId)).unique();
      const seen = { directionId, via, runId, at };
      if (!row) {
        await ctx.db.insert("companies", { workspaceId, ...o, found: [seen], talliedFound: true, at });
        added++;
      } else if (!row.found.some((f) => f.runId === runId && f.directionId === directionId && f.via === via)) {
        await ctx.db.patch(row._id, { found: [...row.found, seen] });
      }
    }
    await tally(ctx, workspaceId, "companies", dayOf(at), added);
    return added;
  },
});

export async function runDiscover(ctx: ActionCtx, job: Doc<"jobs">) {
  const ws = job.workspaceId;
  // A paused or interrupted run picks up after the last finished search instead of paying for it again.
  const finished = new Map((job.done ?? []).map((d) => [d.step, d.result]));
  const once = async <T,>(step: string, run: () => Promise<T>): Promise<T> => {
    if (finished.has(step)) return finished.get(step) as T;
    const r = await run();
    await ctx.runMutation(internal.jobs.checkpoint, { jobId: job._id, step, result: r });
    finished.set(step, r);
    return r;
  };
  const inp = await ctx.runQuery(internal.discovery.inputs, { workspaceId: ws });
  const excluded = new Set(inp.exclude.map(normName));
  // Companies they turned down (learning from their ratings) are never found again, under any Apollo id or name.
  const turnedDown = { ids: new Set(inp.turnedDown.flatMap((c) => c.apolloId ?? [])), domains: new Set(inp.turnedDown.flatMap((c) => c.domain ?? [])), names: new Set(inp.turnedDown.map((c) => normName(c.name))) };
  const clean = (orgs: Org[]) =>
    orgs
      .filter((o) => o.id && o.name && !excluded.has(normName(o.name)))
      .filter((o) => !turnedDown.ids.has(o.id!) && !turnedDown.names.has(normName(o.name!)) && !(o.primary_domain && turnedDown.domains.has(toDomain(o.primary_domain) ?? "")))
      .map((o) => ({
        apolloId: o.id!,
        name: o.name!,
        ...(o.primary_domain && toDomain(o.primary_domain) ? { domain: toDomain(o.primary_domain)! } : {}),
        ...(o.website_url ? { websiteUrl: o.website_url } : {}),
        ...(o.linkedin_url ? { linkedinUrl: o.linkedin_url } : {}),
        ...(typeof o.founded_year === "number" ? { foundedYear: o.founded_year } : {}),
      }));

  // Look up any seed websites Apollo hasn't been asked about yet: one search covers up to 100.
  const wanted = [...new Set([...inp.seeds, ...inp.directions.flatMap((d) => d.criteria.seeds ?? [])])];
  const known = new Map(inp.resolved.map((r) => [r.domain, r]));
  const unknown = wanted.filter((d) => !known.has(d));
  if (unknown.length) {
    const resolved = await once(`seeds:${unknown.join(",")}`, async () => {
      const body = await apollo(ctx, { workspaceId: ws, purpose: "find seed companies", endpoint: "mixed_companies/search", automated: false, params: { "q_organization_domains_list": unknown, per_page: 100, page: 1 } });
      const found = orgsOf(body);
      const r = unknown.map((domain) => {
        const o = found.find((x) => (x.primary_domain ?? "").replace(/^www\./, "") === domain);
        return { domain, apolloId: o?.id ?? null, ...(o?.name ? { name: o.name } : {}) };
      });
      await ctx.runMutation(internal.discovery.saveSeeds, { workspaceId: ws, resolved: r });
      return r;
    });
    for (const r of resolved) known.set(r.domain, r);
  }

  // Companies they named: one lookup (up to 100 per page), added for every direction's list.
  let named: { found: number; added: number; missing: string[] } | null = null;
  if (inp.named.length) {
    named = await once(`named:${inp.named.join(",")}`, async () => {
      const found: Org[] = [];
      for (let i = 0; i < inp.named.length; i += 100) {
        const body = await apollo(ctx, { workspaceId: ws, purpose: "companies you named", endpoint: "mixed_companies/search", automated: false, params: { q_organization_domains_list: inp.named.slice(i, i + 100), per_page: 100, page: 1 } });
        found.push(...orgsOf(body));
      }
      const orgs = clean(found);
      const added = await ctx.runMutation(internal.discovery.saveCompanies, { workspaceId: ws, runId: job._id, via: "hand", orgs });
      const got = new Set(found.map((o) => (o.primary_domain ?? "").replace(/^www\./, "")));
      return { found: orgs.length, added, missing: inp.named.filter((d) => !got.has(d)) };
    });
  }

  const report = [];
  for (const d of inp.directions) {
    const c = d.criteria;
    // The lens: steer adds their wanted industries to the direction's; only searches wanted industries alone; ignore uses none.
    const lens = inp.lens;
    const pick = (xs: string[]) => [...new Set(xs)].filter((i) => !inp.avoid.includes(i));
    const industries = lens.industries === "ignore" ? [] : lens.industries === "only" ? pick(inp.want) : pick([...inp.want, ...c.industries]);
    // Hiring now is steered into wanted industries unless industry is ignored, so it can't pull in any company that hires the title.
    const hiringIndustries = lens.industries === "ignore" ? [] : pick(inp.want.length ? inp.want : c.industries);
    const params: Record<string, string | number | string[]> = { per_page: 100, page: 1 };
    if (industries.length) params["q_organization_keyword_tags"] = industries;
    if (c.sizes.length) params["organization_num_employees_ranges"] = c.sizes.map(sizeRange);
    const crit = await once(`criteria:${d.id}`, async () => {
      const body = await apollo(ctx, { workspaceId: ws, purpose: `find companies: ${d.name}`, endpoint: "mixed_companies/search", automated: false, params });
      const orgs = clean(orgsOf(body));
      const added = await ctx.runMutation(internal.discovery.saveCompanies, { workspaceId: ws, runId: job._id, directionId: d.id, via: "criteria", orgs });
      return { found: orgs.length, added, total: totalOf(body) };
    });

    // Large companies: the same criteria, limited to 1,001+ people, so big players aren't lost in the first page.
    const large = await once(`large:${d.id}`, async () => {
      const body = await apollo(ctx, { workspaceId: ws, purpose: `large companies: ${d.name}`, endpoint: "mixed_companies/search", automated: false, params: { ...(industries.length ? { q_organization_keyword_tags: industries } : {}), organization_num_employees_ranges: ["1001,5000", "5001,1000000"], per_page: 100, page: 1 } });
      const orgs = clean(orgsOf(body));
      const added = await ctx.runMutation(internal.discovery.saveCompanies, { workspaceId: ws, runId: job._id, directionId: d.id, via: "large", orgs });
      return { found: orgs.length, added };
    });

    // Hiring now: companies with open postings for this direction's titles. Added alongside, never narrowing the wide net.
    const hiring = c.titles.length
      ? await once(`hiring:${d.id}`, async () => {
          const body = await apollo(ctx, { workspaceId: ws, purpose: `hiring now: ${d.name}`, endpoint: "mixed_companies/search", automated: false, params: { q_organization_job_titles: c.titles.slice(0, 10), ...(hiringIndustries.length ? { q_organization_keyword_tags: hiringIndustries } : {}), per_page: 100, page: 1 } });
          const orgs = clean(orgsOf(body));
          const added = await ctx.runMutation(internal.discovery.saveCompanies, { workspaceId: ws, runId: job._id, directionId: d.id, via: "hiring", orgs });
          return { found: orgs.length, added, total: totalOf(body) };
        })
      : null;

    const seedDomains = c.seeds?.length ? c.seeds : inp.seeds;
    const ids = seedDomains.map((s) => known.get(s)?.apolloId).filter((x): x is string => !!x);
    // Targets that fit this direction, searched in batches of their own so the seeds' batches stay shared.
    const targets = inp.targets.filter((t) => t.directionIds.includes(d.id) && !ids.includes(t.apolloId));
    const batches: string[][] = [];
    for (const set of [ids, targets.map((t) => t.apolloId)]) for (let i = 0; i < set.length; i += LOOKALIKE_MAX) batches.push(set.slice(i, i + LOOKALIKE_MAX));
    const lookalikes = [];
    for (const batch of batches) {
      // The same seeds give the same companies, so each batch is searched once per run and shared across directions.
      const lo = await once(`lookalike:${lens.industries === "only" ? industries.join("+") + ":" : ""}${batch.join(",")}`, async () => {
        const lb = await apollo(ctx, { workspaceId: ws, purpose: `lookalike companies: ${d.name}`, endpoint: "mixed_companies/search", automated: false, params: { lookalike_organization_ids: batch, ...(lens.industries === "only" && industries.length ? { q_organization_keyword_tags: industries } : {}), per_page: 100, page: 1 } });
        return clean(orgsOf(lb));
      });
      const ladded = await once(`lookalike-saved:${d.id}:${batch.join(",")}`, () =>
        ctx.runMutation(internal.discovery.saveCompanies, { workspaceId: ws, runId: job._id, directionId: d.id, via: "lookalike", orgs: lo }),
      );
      const r = { found: lo.length, added: ladded };
      // Zero back means Apollo has no lookalike data for these seeds, not that no such companies exist.
      lookalikes.push({ seeds: batch.map((id) => targets.find((t) => t.apolloId === id)?.name ?? [...known.values()].find((k) => k.apolloId === id)?.name ?? id), ...r });
    }
    report.push({ direction: d.name, criteria: crit, large, hiring, lookalikes, ownSeeds: !!c.seeds?.length });
  }
  const missing = wanted.filter((dm) => known.get(dm)?.apolloId === null);
  const screened = await screenCompanies(ctx, ws);
  await ctx.runMutation(internal.enrich.next, { workspaceId: ws, origin: job.origin });
  return { report, named, seedsNotInApollo: missing, screened, costUsd: screened.costUsd };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await settings(ctx, workspaceId);
    const directions = await itemsOf(ctx, workspaceId, "direction", "approved");
    const names = new Map(directions.map((d) => [String(d._id), d.data.name]));
    // What the goals judgment weighs companies against: their approved company goals.
    const companyGoals = (await activeLimits(ctx, workspaceId)).filter((l) => l.data.kind === "companies").map((l) => ({ id: l._id, text: l.data.value }));
    const companies = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect();
    const learn = learns(row);
    const targets = learn ? targetSeeds(companies) : [];
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "discover");
    const lastEnrich = jobs.find((j) => j.kind === "enrich");
    return {
      named: row?.named ?? [],
      apolloJobs: !!row?.apolloJobs,
      lens: row?.lens ?? DEFAULT_LENS,
      // Learn from your ratings; when on, each direction lists the targets that seed its lookalike searches.
      learn,
      companyGoals,
      seeds: (row?.seeds ?? []).map((domain) => ({ domain, lookup: row?.resolved.find((r) => r.domain === domain) ?? null })),
      // A target that's already one of the direction's seeds isn't searched twice.
      searchable: directions
        .filter((d) => d.data.criteriaStatus === "approved")
        .map((d) => {
          const seedIds = (d.data.criteria?.seeds?.length ? d.data.criteria.seeds : (row?.seeds ?? [])).map((s) => row?.resolved.find((r) => r.domain === s)?.apolloId);
          const seeding = targets.filter((t) => t.directionIds.includes(d._id) && !seedIds.includes(t.apolloId)).map((t) => t.name);
          return { id: d._id, name: d.data.name, ownSeeds: d.data.criteria?.seeds ?? null, hasTitles: (d.data.criteria?.titles.length ?? 0) > 0, targets: seeding };
        }),
      // Approved directions whose search criteria aren't approved yet: not searched until they are.
      needCriteria: directions.filter((d) => d.data.criteriaStatus !== "approved").map((d) => ({ id: d._id, name: d.data.name })),
      last: last ? { status: last.status, error: last.error, result: last.result } : null,
      enriching: lastEnrich ? { status: lastEnrich.status, error: lastEnrich.error, remaining: lastEnrich.result?.remaining ?? null } : null,
      companies: companies.map((c) => ({
        id: c._id,
        name: c.name,
        domain: c.domain,
        websiteUrl: c.websiteUrl,
        linkedinUrl: c.linkedinUrl,
        foundedYear: c.foundedYear,
        screened: c.screened ?? null,
        details: c.details ?? null,
        fit: (c.fit ?? []).map((f) => ({ ...f, direction: names.get(String(f.directionId)) ?? "a direction" })),
        rating: c.rating?.value ?? null,
        ratingReason: c.rating?.reason ?? null,
        goals: c.goals ?? null,
        named: c.found.some((f) => f.via === "hand"),
        // Only while a pass is actually running; a failed pass leaves it free to try again.
        boardUrl: c.boardUrl ?? null,
        checking: !!c.recheckAt && (lastEnrich?.status === "queued" || lastEnrich?.status === "running"),
        found: [...new Set(c.found.map((f) => (f.via === "hand" ? "your list" : `${f.directionId ? names.get(String(f.directionId)) ?? "a direction" : "a search"} (${f.via === "lookalike" ? "like your seeds" : f.via === "criteria" ? "criteria" : f.via === "hiring" ? "hiring now" : "large companies"})`)))],
        // When it was first found.
        foundAt: Math.min(...c.found.map((f) => f.at), c.at),
      })),
    };
  },
});

// Settings, Companies: the lens, whether Apollo is asked for job postings, whether they learn from ratings, and how
// many companies are filled in (what Check all again goes over).
export const companySettings = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await settings(ctx, workspaceId);
    const companies = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    return { lens: row?.lens ?? DEFAULT_LENS, apolloJobs: !!row?.apolloJobs, learn: learns(row), filledIn: companies.filter((c) => c.fitAt !== undefined).length };
  },
});

export const setLens = mutation({
  args: { industries: v.union(v.literal("steer"), v.literal("only"), v.literal("ignore")), judge: v.union(v.literal("off"), v.literal("rank"), v.literal("hide")) },
  handler: async (ctx, lens) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await settings(ctx, workspaceId);
    if (row) await ctx.db.patch(row._id, { lens });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], lens });
  },
});

// Learn from your ratings, on or off. Takes effect from the next search and the next fit or ranking judgment.
export const setLearn = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await settings(ctx, workspaceId);
    if (row) await ctx.db.patch(row._id, { learn: on });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], learn: on });
  },
});
