import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

// The Apollo search, run end to end on a fixed workspace: every call it makes to Apollo (in order, with its filters),
// the companies it saves and how each was found, what it spends and what it reports, compared with the record of the
// same run taken before the other ways of finding companies were added (testdata/discovery/apollo-run.json).

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function world() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("apollo-key");
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "apollo", sealed, last4: "-key", setAt: 0 });
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 1, apolloMonthlyCredits: 0, apolloMode: "onRequest" });
    await ctx.db.insert("aiSettings", { workspaceId: w, task: "companies", model: "test/model" });
    const criteria = { industries: [], sizes: [], stages: [], titles: [], keywords: [] };
    const dir = (name: string, c: Record<string, unknown>) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name, criteria: { ...criteria, ...c }, criteriaStatus: "approved" }, sources: [], at: 0 });
    const product = await dir("Supply Chain Product", { industries: ["logistics", "consulting"], sizes: ["51-200", "5001+"], titles: ["Product Manager", "Group Product Manager"] });
    await dir("Solutions Consulting", { industries: ["software"], seeds: ["loadstar.io"] });
    await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Not yet", criteria, criteriaStatus: "proposed" }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "companies", label: "Companies", value: "x", rule: { exclude: ["Parcelpoint.io"], industriesAvoid: ["consulting"], industriesWant: ["supply chain"] } }, sources: [], at: 0 });
    await ctx.db.insert("discovery", { workspaceId: w, seeds: ["copperline.io", "notreal.example"], named: ["nvidia.com", "nope.example"], resolved: [] });
    // A target that fits the first direction seeds it; a turned-down company never comes back.
    await ctx.db.insert("companies", { workspaceId: w, name: "Meridian Coldchain", apolloId: "T1", domain: "meridian.io", found: [{ via: "criteria", at: 0 }], rating: { value: "excited", at: 0 }, details: { sources: [], at: 1 }, fit: [{ directionId: product, level: "strong", reason: "x" }], fitAt: 1, at: 0 });
    await ctx.db.insert("companies", { workspaceId: w, name: "Bramblewood Home", apolloId: "Z1", found: [{ via: "criteria", at: 0 }], rating: { value: "no", at: 0 }, at: 0 });
    return { u, w };
  });
  return { t, w, as: t.withIdentity({ subject: `${u}|s` }) };
}

// What Apollo answers, by the kind of search asked.
function answer(q: URLSearchParams) {
  const domains = q.getAll("q_organization_domains_list[]");
  if (domains.includes("nvidia.com")) return { organizations: [{ id: "N1", name: "NVIDIA", primary_domain: "nvidia.com", website_url: "http://www.nvidia.com", founded_year: 1993 }] };
  if (domains.length)
    return { organizations: [{ id: "A1", name: "Copperline Robotics", primary_domain: "copperline.io" }, { id: "V1", name: "Loadstar Systems", primary_domain: "loadstar.io" }] };
  const lookalike = q.getAll("lookalike_organization_ids[]");
  if (lookalike.includes("V1")) return { organizations: [] };
  if (lookalike.includes("T1")) return { organizations: [{ id: "K1", name: "Kestrel Freight", primary_domain: "kestrelfreight.com", linkedin_url: "http://www.linkedin.com/company/kestrel" }] };
  if (lookalike.length) return { organizations: [{ id: "X1", name: "Ashgrove Manufacturing", primary_domain: "ashgrove.com" }, { id: "Z1", name: "Bramblewood Home" }] };
  if (q.getAll("q_organization_job_titles[]").length) return { organizations: [{ id: "H1", name: "Hiring Co", primary_domain: "www.hiring.co", website_url: "https://hiring.co" }, { id: "R1", name: "Rivertown Recruitment" }], pagination: { total_entries: 2 } };
  if (q.getAll("organization_num_employees_ranges[]").includes("1001,5000") && !q.getAll("organization_num_employees_ranges[]").includes("51,200"))
    return { organizations: [{ id: "L1", name: "Bigco Logistics", primary_domain: "bigco.com", founded_year: 1950 }] };
  return { organizations: [{ id: "P1", name: "Parcelpoint.io, Inc." }, { id: "G1", name: "Fernhill Foods", primary_domain: "fernhill.io", website_url: "http://fernhill.io", linkedin_url: "http://linkedin.com/company/fernhill", founded_year: 2011 }, { id: "Z2", name: "Bramblewood Home" }], pagination: { total_entries: 3 } };
}

test("the Apollo search makes the same calls and saves the same companies as before", async () => {
  const { t, as } = await world();
  const calls: { path: string; params: [string, string[]][] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.hostname === "openrouter.ai") return Response.json({ choices: [{ message: { content: JSON.stringify({ companies: [] }) } }], usage: { cost: 0.001 } });
      if (url.hostname !== "api.apollo.io") return new Response("", { status: 404 });
      if (url.pathname.endsWith("credit_usage_stats")) return Response.json({ credit_usage_stats: { lead_credit: { limit: 2500, consumed: 0, left_over: 2500 } }, current_credit_cycle: { start_date: "2026-09-05", end_date: "2026-10-05" } });
      const keys = [...new Set(url.searchParams.keys())].sort();
      calls.push({ path: url.pathname, params: keys.map((k) => [k, url.searchParams.getAll(k)]) });
      return Response.json(answer(url.searchParams));
    }),
  );
  await as.mutation(api.discovery.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const { job, companies, usage, directions } = await t.run(async (ctx) => ({
    job: (await ctx.db.query("jobs").collect()).find((j) => j.kind === "discover")!,
    companies: await ctx.db.query("companies").collect(),
    usage: (await ctx.db.query("usage").collect()).filter((u) => u.service === "apollo"),
    directions: await ctx.db.query("items").collect(),
  }));
  expect(job.status).toBe("done");
  const dirName = new Map(directions.map((d) => [String(d._id), "name" in d.data ? String(d.data.name) : ""]));
  const saved = (c: Doc<"companies">) => ({
    name: c.name,
    apolloId: c.apolloId ?? null,
    domain: c.domain ?? null,
    websiteUrl: c.websiteUrl ?? null,
    linkedinUrl: c.linkedinUrl ?? null,
    foundedYear: c.foundedYear ?? null,
    found: c.found.map((f) => `${f.directionId ? dirName.get(String(f.directionId)) : "-"}: ${f.via}${f.runId ? " (this run)" : ""}`).sort(),
    screened: c.screened ? `${c.screened.kind} by ${c.screened.by}` : null,
  });
  const record = {
    calls,
    companies: companies.map(saved).sort((a, b) => a.name.localeCompare(b.name)),
    spent: usage.map((u) => `${u.purpose}: ${u.credits} (${u.endpoint})`).sort(),
    result: { report: job.result.report, named: job.result.named, seedsNotInApollo: job.result.seedsNotInApollo },
  };
  await expect(JSON.stringify(record, null, 1)).toMatchFileSnapshot("../testdata/discovery/apollo-run.json");
});
