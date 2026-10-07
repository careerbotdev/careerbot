import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { apollo } from "./metering";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function setup(mode: "on" | "onRequest" | "paused" = "onRequest", cap = 0) {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("apollo-key");
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "apollo", sealed, last4: "-key", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 1, apolloMonthlyCredits: cap, apolloMode: mode });
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("aiSettings", { workspaceId: w, task: "companies", model: "test/model" });
    return { u, w };
  });
  return { t, w, as: t.withIdentity({ subject: `${u}|s` }) };
}

type Handler = (url: URL) => Response;
// Apollo stand-in: credit balance from `left`, searches answered by `search`.
function stubApollo(left: number | null, search: Handler) {
  const f = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "openrouter.ai") return Response.json({ choices: [{ message: { content: JSON.stringify({ companies: [] }) } }], usage: { cost: 0.001 } });
    if (url.pathname.endsWith("credit_usage_stats"))
      return left === null ? new Response("", { status: 403 }) : Response.json({ credit_usage_stats: { lead_credit: { limit: 2500, consumed: 2500 - left, left_over: left } }, current_credit_cycle: { start_date: "2026-09-05", end_date: "2026-10-05" } });
    return search(url);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const search = (t: Awaited<ReturnType<typeof setup>>["t"], w: Awaited<ReturnType<typeof setup>>["w"]) =>
  t.action(async (ctx) => apollo(ctx, { workspaceId: w, purpose: "search", endpoint: "mixed_companies/search", automated: false, params: { page: 1 } }));

test("an Apollo call never spends past the account's own balance, and spends nothing if the balance can't be read", async () => {
  const { t, w } = await setup();
  stubApollo(null, () => Response.json({ organizations: [] }));
  await expect(search(t, w)).rejects.toThrow("Couldn't read your Apollo credit balance");
  const f = stubApollo(0, () => Response.json({ organizations: [] }));
  await expect(search(t, w)).rejects.toThrow("doesn't have enough credits");
  expect(f.mock.calls.filter(([u]) => String(u).includes("mixed_companies"))).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toHaveLength(0);
});

test("calls still running count against the balance, so two at once can't overspend it", async () => {
  const { t, w } = await setup();
  await t.run((ctx) => ctx.db.insert("usage", { workspaceId: w, service: "apollo", purpose: "x", credits: 1, ok: false, state: "reserved", at: Date.parse("2026-09-24") }));
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  stubApollo(1, () => Response.json({ organizations: [] }));
  await expect(search(t, w)).rejects.toThrow("doesn't have enough credits");
  stubApollo(2, () => Response.json({ organizations: [] }));
  await expect(search(t, w)).resolves.toBeDefined();
});

test("a cap they set lower than the plan holds within Apollo's billing cycle; a refused call costs nothing", async () => {
  const { t, w } = await setup("onRequest", 1);
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  stubApollo(100, () => Response.json({ organizations: [] }));
  await search(t, w);
  await expect(search(t, w)).rejects.toThrow("set aside");
  const { t: t2, w: w2 } = await setup();
  stubApollo(100, () => new Response("", { status: 403 }));
  await expect(search(t2, w2)).rejects.toThrow("plan or key");
  expect(await t2.run((ctx) => ctx.db.query("usage").collect())).toMatchObject([{ credits: 0, ok: false, state: "settled" }]);
});

test("discovery searches approved-criteria directions, resolves seeds to Apollo ids, uses a direction's own seeds over the default, and drops past employers", async () => {
  const { t, w, as } = await setup();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  const dir = (name: string, criteria: Record<string, unknown> | undefined, status: "approved" | "proposed") =>
    t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name, ...(criteria ? { criteria: { industries: [], sizes: [], stages: [], titles: [], keywords: [], ...criteria }, criteriaStatus: status } : {}) }, sources: [], at: 0 }));
  await dir("Supply Chain Product", { industries: ["ai", "consulting"], sizes: ["51-200", "5001+"] }, "approved");
  await dir("Independent Consulting", {}, "proposed");
  await dir("Solutions Consulting", { seeds: ["loadstar.io"] }, "approved");
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "companies", label: "Companies", value: "x", rule: { exclude: ["Parcelpoint.io"], industriesAvoid: ["consulting"] } }, sources: [], at: 0 }));
  await as.mutation(api.discovery.setSeeds, { seeds: ["https://www.copperline.io/", "kestrelfreight.com", "notreal.example"] });
  await expect(as.mutation(api.discovery.setSeeds, { seeds: ["Copperline"] })).rejects.toThrow("website");
  const calls: URLSearchParams[] = [];
  stubApollo(500, (url) => {
    calls.push(url.searchParams);
    const q = url.searchParams;
    if (q.getAll("q_organization_domains_list[]").length)
      return Response.json({ organizations: [{ id: "A1", name: "Copperline Robotics", primary_domain: "copperline.io" }, { id: "S1", name: "Kestrel Freight", primary_domain: "kestrelfreight.com" }, { id: "V1", name: "Loadstar Systems", primary_domain: "loadstar.io" }] });
    if (q.getAll("lookalike_organization_ids[]").includes("V1")) return Response.json({ organizations: [] });
    if (q.getAll("lookalike_organization_ids[]").length) return Response.json({ organizations: [{ id: "X1", name: "Ashgrove Manufacturing" }] });
    return Response.json({ organizations: [{ id: "R1", name: "Parcelpoint.io, Inc." }, { id: "G1", name: "Fernhill Foods" }], pagination: { total_entries: 2 } });
  });
  await as.mutation(api.discovery.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const job = (await t.run((ctx) => ctx.db.query("jobs").collect())).find((j) => j.kind === "discover")!;
  expect(job.status).toBe("done");
  const criteriaCall = calls.find((q) => q.getAll("q_organization_keyword_tags[]").length)!;
  expect(criteriaCall.getAll("q_organization_keyword_tags[]")).toEqual(["ai"]);
  expect(criteriaCall.getAll("organization_num_employees_ranges[]")).toEqual(["51,200", "5001,1000000"]);
  expect(calls.find((q) => q.getAll("lookalike_organization_ids[]").includes("A1"))!.getAll("lookalike_organization_ids[]")).toEqual(["A1", "S1"]);
  expect(job.result.seedsNotInApollo).toEqual(["notreal.example"]);
  const seReport = job.result.report.find((r: { direction: string }) => r.direction === "Solutions Consulting");
  expect(seReport).toMatchObject({ ownSeeds: true, lookalikes: [{ seeds: ["Loadstar Systems"], found: 0 }] });
  const { companies } = await as.query(api.discovery.list, {});
  expect(companies.map((c) => c.name).sort()).toEqual(["Ashgrove Manufacturing", "Fernhill Foods"]);
  expect(companies.find((c) => c.name === "Fernhill Foods")!.found.sort()).toEqual(["Solutions Consulting (criteria)", "Solutions Consulting (large companies)", "Supply Chain Product (criteria)", "Supply Chain Product (large companies)"]);
});

test("seed changes are validated, and a direction's own seeds can be set and cleared", async () => {
  const { t, w, as } = await setup();
  const d = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "SE", criteria: { industries: [], sizes: [], stages: [], titles: [], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0 }));
  await as.mutation(api.discovery.setDirectionSeeds, { id: d, seeds: ["loadstar.io", "https://orchardforecasting.com/pricing"] });
  expect((await as.query(api.discovery.list, {})).searchable[0].ownSeeds).toEqual(["loadstar.io", "orchardforecasting.com"]);
  await as.mutation(api.discovery.setDirectionSeeds, { id: d, seeds: [] });
  expect((await as.query(api.discovery.list, {})).searchable[0].ownSeeds).toBeNull();
});

test("learning from ratings: targets seed the directions they fit, turned-down companies aren't found again and reach fit and ranking; off removes both", async () => {
  const { t, w, as } = await setup();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  await t.run(async (ctx) => {
    const dir = (name: string) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name, criteria: { industries: ["ai"], sizes: [], stages: [], titles: [], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0 });
    const sales = await dir("Sales");
    const ops = await dir("Ops");
    const meridian = await ctx.db.insert("companies", { workspaceId: w, name: "Meridian Coldchain", apolloId: "R1", domain: "meridian.io", found: [{ via: "criteria", at: 0 }], rating: { value: "excited", at: 0 }, details: { sources: [], at: 1 }, fit: [{ directionId: sales, level: "strong", reason: "x" }, { directionId: ops, level: "weak", reason: "x" }], fitAt: 1, at: 0 });
    await ctx.db.insert("companies", { workspaceId: w, name: "Bramblewood Home", apolloId: "Z1", found: [{ via: "criteria", at: 0 }], rating: { value: "no", reason: "Sells tobacco", at: 1 }, at: 0 });
    await ctx.db.insert("companies", { workspaceId: w, name: "Tidewell", domain: "tidewell.io", found: [{ via: "criteria", at: 0 }], rating: { value: "no", at: 2 }, at: 0 });
    await ctx.db.insert("postings", { workspaceId: w, companyId: meridian, provider: "lever", externalId: "1", url: "u", title: "Sales Associate", remote: false, firstSeen: 0, lastSeen: 0, rating: { value: "no", reason: "Too junior", at: 0 } });
  });
  const lookalikes: string[][] = [];
  stubApollo(500, (url) => {
    const ids = url.searchParams.getAll("lookalike_organization_ids[]");
    if (ids.length) {
      lookalikes.push(ids);
      return Response.json({ organizations: [{ id: "B1", name: "Northgate Grocers" }] });
    }
    if (url.pathname.includes("mixed_companies")) return Response.json({ organizations: [{ id: "Z1", name: "Bramblewood Home" }, { id: "L2", name: "Tidewell Medical Supply", primary_domain: "tidewell.io" }, { id: "G1", name: "Fernhill Foods" }] });
    return Response.json({});
  });
  const run = async () => {
    await as.mutation(api.discovery.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return as.query(api.discovery.list, {});
  };
  const zoomFound = async () => (await t.run((ctx) => ctx.db.query("companies").collect())).find((c) => c.apolloId === "Z1")!.found.length;

  // On (the default): Meridian Coldchain seeds Sales only (it fits Ops weakly); Bramblewood Home and Tidewell (under a new id, by its website) stay out.
  const on = await run();
  expect(on.learn).toBe(true);
  expect(on.searchable.map((d) => [d.name, d.targets])).toEqual([["Sales", ["Meridian Coldchain"]], ["Ops", []]]);
  expect(lookalikes).toEqual([["R1"]]);
  expect(on.companies.find((c) => c.name === "Northgate Grocers")!.found).toEqual(["Sales (like your seeds)"]);
  expect(on.companies.map((c) => c.name).sort()).toEqual(["Bramblewood Home", "Fernhill Foods", "Meridian Coldchain", "Northgate Grocers", "Tidewell"]);
  expect(await zoomFound()).toBe(1);
  const todo = await t.query(internal.enrich.todo, { workspaceId: w });
  expect(todo.fit.turnedDown).toEqual([{ name: "Tidewell" }, { name: "Bramblewood Home", why: "Sells tobacco" }]);
  expect((await t.query(internal.roles.judgeInput, { workspaceId: w, ids: [] })).turnedDown).toEqual([{ title: "Sales Associate", company: "Meridian Coldchain", why: "Too junior" }]);

  // Off: no target seeds, turned-down companies can come back, and fit and ranking don't read what was turned down.
  await as.mutation(api.discovery.setLearn, { on: false });
  lookalikes.length = 0;
  const off = await run();
  expect(off.learn).toBe(false);
  expect(off.searchable.every((d) => d.targets.length === 0)).toBe(true);
  expect(lookalikes).toEqual([]);
  expect(off.companies.map((c) => c.name)).toContain("Tidewell Medical Supply");
  expect(await zoomFound()).toBeGreaterThan(1);
  expect((await t.query(internal.enrich.todo, { workspaceId: w })).fit.turnedDown).toEqual([]);
  expect((await t.query(internal.roles.judgeInput, { workspaceId: w, ids: [] })).turnedDown).toEqual([]);
});

test("a run that stops part-way doesn't pay again for searches it finished", async () => {
  const { t, w, as } = await setup();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Sales", criteria: { industries: ["ai"], sizes: [], stages: [], titles: [], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0 }));
  await as.mutation(api.discovery.setSeeds, { seeds: ["copperline.io"] });
  let fail = true;
  const f = stubApollo(500, (url) => {
    const q = url.searchParams;
    if (q.getAll("q_organization_domains_list[]").length) return Response.json({ organizations: [{ id: "A1", name: "Copperline Robotics", primary_domain: "copperline.io" }] });
    if (q.getAll("lookalike_organization_ids[]").length) return fail ? new Response("", { status: 429 }) : Response.json({ organizations: [{ id: "X1", name: "Ashgrove Manufacturing" }] });
    return Response.json({ organizations: [{ id: "G1", name: "Fernhill Foods" }] });
  });
  await as.mutation(api.discovery.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const searches = () => f.mock.calls.filter(([u]) => String(u).includes("mixed_companies")).length;
  expect(searches()).toBe(4);
  fail = false;
  const job = (await t.run((ctx) => ctx.db.query("jobs").collect())).find((j) => j.kind === "discover")!;
  await t.run((ctx) => ctx.db.patch(job._id, { status: "queued" }));
  await t.action(internal.jobs.run, { jobId: job._id });
  expect(searches()).toBe(5);
  expect((await as.query(api.discovery.list, {})).companies.map((c) => c.name).sort()).toEqual(["Ashgrove Manufacturing", "Fernhill Foods"]);
});

test("directions with the same seeds share one lookalike search", async () => {
  const { t, w, as } = await setup();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  for (const name of ["Sales", "Solutions"])
    await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name, criteria: { industries: ["ai"], sizes: [], stages: [], titles: [], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0 }));
  await as.mutation(api.discovery.setSeeds, { seeds: ["copperline.io"] });
  const f = stubApollo(500, (url) => {
    const q = url.searchParams;
    if (q.getAll("q_organization_domains_list[]").length) return Response.json({ organizations: [{ id: "A1", name: "Copperline Robotics", primary_domain: "copperline.io" }] });
    if (q.getAll("lookalike_organization_ids[]").length) return Response.json({ organizations: [{ id: "X1", name: "Ashgrove Manufacturing" }] });
    return Response.json({ organizations: [] });
  });
  await as.mutation(api.discovery.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(f.mock.calls.filter(([u]) => String(u).includes("lookalike")).length).toBe(1);
  expect((await as.query(api.discovery.list, {})).companies[0].found.sort()).toEqual(["Sales (like your seeds)", "Solutions (like your seeds)"]);
});

test("hiring-now searches add companies hiring the direction's titles; non-employers are set aside by rule or AI and can be restored", async () => {
  const { t, w, as } = await setup();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Sales", criteria: { industries: ["ai"], sizes: [], stages: [], titles: ["Enterprise Account Executive"], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0 }));
  const f = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "openrouter.ai") return Response.json({ choices: [{ message: { content: JSON.stringify({ companies: [{ id: (await ids()).inman, kind: "media" }] }) } }], usage: { cost: 0.001 } });
    if (url.pathname.endsWith("credit_usage_stats")) return Response.json({ credit_usage_stats: { lead_credit: { limit: 2500, consumed: 0, left_over: 2500 } }, current_credit_cycle: {} });
    if (url.searchParams.getAll("q_organization_job_titles[]").length) return Response.json({ organizations: [{ id: "H1", name: "Hiring Co" }] });
    return Response.json({ organizations: [{ id: "G1", name: "Fernhill Foods" }, { id: "M1", name: "Rivertown Recruitment" }, { id: "I1", name: "Freight Weekly" }] });
  });
  const ids = async () => Object.fromEntries((await t.run((ctx) => ctx.db.query("companies").collect())).map((c) => [c.name === "Freight Weekly" ? "inman" : c.name, String(c._id)]));
  vi.stubGlobal("fetch", f);
  await as.mutation(api.discovery.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const hiringCall = f.mock.calls.map(([u]) => new URL(u)).find((u) => u.searchParams.getAll("q_organization_job_titles[]").length)!;
  expect(hiringCall.searchParams.getAll("q_organization_job_titles[]")).toEqual(["Enterprise Account Executive"]);
  const { companies } = await as.query(api.discovery.list, {});
  const byName = Object.fromEntries(companies.map((c) => [c.name, c.screened]));
  expect(byName["Rivertown Recruitment"]).toMatchObject({ employer: false, kind: "staffing or recruiting", by: "rule" });
  expect(byName["Freight Weekly"]).toMatchObject({ employer: false, kind: "media", by: "ai" });
  expect(byName["Fernhill Foods"]?.employer ?? true).toBe(true);
  expect(companies.find((c) => c.name === "Hiring Co")!.found).toEqual(["Sales (hiring now)"]);
  await as.mutation(api.screening.setEmployer, { id: companies.find((c) => c.name === "Freight Weekly")!.id, employer: true });
  expect((await as.query(api.discovery.list, {})).companies.find((c) => c.name === "Freight Weekly")!.screened).toMatchObject({ employer: true, by: "you" });
});

test("companies you name are looked up and added in one search; ones Apollo lacks are reported", async () => {
  const { t, w, as } = await setup();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Sales", criteria: { industries: [], sizes: [], stages: [], titles: [], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0 }));
  await as.mutation(api.discovery.setNamed, { named: ["nvidia.com", "https://www.spacex.com", "nope.example"] });
  await expect(as.mutation(api.discovery.setNamed, { named: ["NVIDIA"] })).rejects.toThrow("website");
  stubApollo(500, (url) =>
    url.searchParams.getAll("q_organization_domains_list[]").includes("nvidia.com")
      ? Response.json({ organizations: [{ id: "N1", name: "NVIDIA", primary_domain: "nvidia.com" }, { id: "S1", name: "SpaceX", primary_domain: "spacex.com" }] })
      : Response.json({ organizations: [] }),
  );
  await as.mutation(api.discovery.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const job = (await t.run((ctx) => ctx.db.query("jobs").collect())).find((j) => j.kind === "discover")!;
  expect(job.result.named).toEqual({ found: 2, added: 2, missing: ["nope.example"] });
  expect((await as.query(api.discovery.list, {})).companies.map((c) => [c.name, c.found])).toContainEqual(["NVIDIA", ["your list"]]);
});

test("fit is judged per approved direction after details, keeps only known directions and levels, and ratings make targets", async () => {
  const { t, w, as } = await setup();
  const d = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Sales", criteria: { industries: [], sizes: [], stages: [], titles: [], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0 }));
  const c = await t.run((ctx) => ctx.db.insert("companies", { workspaceId: w, name: "Fernhill Foods", domain: "fernhill.io", found: [{ via: "hand", at: 0 }], details: { summary: "Packaged soups and snacks.", sources: [], at: 0 }, at: 0 }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ companies: [{ id: c, fit: [{ directionId: d, level: "strong", reason: "Hiring enterprise AEs." }, { directionId: "nope", level: "strong", reason: "x" }, { directionId: d, level: "amazing", reason: "x" }] }] }) } }], usage: { cost: 0.001 } })));
  await as.mutation(api.enrich.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  let row = (await as.query(api.discovery.list, {})).companies[0];
  expect(row.fit).toEqual([{ directionId: d, level: "strong", reason: "Hiring enterprise AEs.", direction: "Sales" }]);
  await as.mutation(api.enrich.rate, { id: c, value: "excited" });
  row = (await as.query(api.discovery.list, {})).companies[0];
  expect(row.rating).toBe("excited");
});

test("checking again un-screens rule and AI calls but never yours, and a new website drops the old Apollo match", async () => {
  const { t, w, as } = await setup();
  const add = (name: string, screened?: { employer: boolean; kind: string; by: "rule" | "ai" | "you" }) =>
    t.run((ctx) => ctx.db.insert("companies", { workspaceId: w, name, domain: `${name}.com`, apolloId: "old", at: 0, found: [{ via: "criteria", at: 0 }], ...(screened ? { screened: { ...screened, at: 0 } } : {}) }));
  const byAi = await add("acmejobs", { employer: false, kind: "job board", by: "ai" });
  const byYou = await add("mine", { employer: false, kind: "other non-employer", by: "you" });
  const res = await as.mutation(api.enrich.recheck, { ids: [byAi, byYou] });
  expect(res.skipped).toBe(1);
  const [a, y] = await t.run(async (ctx) => [await ctx.db.get(byAi), await ctx.db.get(byYou)]);
  expect(a?.screened).toBeUndefined();
  expect(a?.recheckAt).toBeTypeOf("number");
  expect(y?.screened?.by).toBe("you");
  expect(y?.recheckAt).toBeUndefined();

  await as.mutation(api.enrich.setWebsite, { id: byAi, website: "https://www.acme.com/about" });
  const moved = await t.run((ctx) => ctx.db.get(byAi));
  expect(moved?.domain).toBe("acme.com");
  expect(moved?.apolloId).toBeUndefined();

  // Screened out again: nothing more to check, so it isn't left waiting.
  await t.mutation(internal.screening.mark, { workspaceId: w, marks: [{ id: byAi, kind: "job board", by: "ai" }] });
  expect((await t.run((ctx) => ctx.db.get(byAi)))?.recheckAt).toBeUndefined();
});

test("checking again skips a company with no website, so it never waits on a check that can't run", async () => {
  const { t, w, as } = await setup();
  const id = await t.run((ctx) => ctx.db.insert("companies", { workspaceId: w, name: "No Site", at: 0, found: [{ via: "criteria", at: 0 }] }));
  expect((await as.mutation(api.enrich.recheck, { ids: [id] })).skipped).toBe(1);
  expect((await t.run((ctx) => ctx.db.get(id)))?.recheckAt).toBeUndefined();
});
