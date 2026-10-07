import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import { periodStart } from "./reports";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "77".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

const BEGAN = Date.parse("2026-01-10T15:00:00Z");
const NOW = Date.parse("2026-09-29T12:00:00Z");

async function setup() {
  const t = convexTest(schema, modules);
  const sealed = await seal("sk-or-test");
  vi.setSystemTime(BEGAN);
  await seedModelPrices(t);
  const make = (email: string) =>
    t.run(async (ctx) => {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 50, apolloMonthlyCredits: 0, apolloMode: "on" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "firstCall", model: "m/x" });
      return { u, w };
    });
  const a = await make("a@example.com");
  const b = await make("b@example.com");
  return { t, a: { ...a, as: t.withIdentity({ subject: `${a.u}|s` }) }, b: { ...b, as: t.withIdentity({ subject: `${b.u}|s` }) } };
}
type T = TestConvex<typeof schema>;

// An AI call made at `at` and settled the way metering settles it.
async function paid(t: T, workspaceId: Id<"workspaces">, at: number, usd: number, purpose = "find companies: Sales") {
  vi.setSystemTime(at);
  const usageId = await t.run((ctx) => ctx.db.insert("usage", { workspaceId, service: "openrouter", purpose, costUsd: 0, ok: false, state: "reserved", at }));
  await t.mutation(internal.metering.settle, { usageId, ok: true, costUsd: usd });
}

test("a period starts on the 1st of the month or quarter (UTC), or the day the workspace began", () => {
  expect(new Date(periodStart("month", NOW, BEGAN)).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  expect(new Date(periodStart("quarter", NOW, BEGAN)).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  expect(new Date(periodStart("all", NOW, BEGAN)).toISOString()).toBe("2026-01-10T00:00:00.000Z");
  const firstOfQuarter = Date.parse("2026-10-01T00:00:00Z");
  expect(periodStart("month", firstOfQuarter, BEGAN)).toBe(firstOfQuarter);
  expect(periodStart("quarter", firstOfQuarter, BEGAN)).toBe(firstOfQuarter);
});

test("spending counts in the period it was made in, by month, up to the boundary's millisecond", async () => {
  const { t, a } = await setup();
  await paid(t, a.w, Date.parse("2026-06-30T23:59:59.999Z"), 1);
  await paid(t, a.w, Date.parse("2026-07-01T00:00:00Z"), 2);
  await paid(t, a.w, Date.parse("2026-08-31T23:59:59.999Z"), 4);
  await paid(t, a.w, Date.parse("2026-09-01T00:00:00Z"), 8);
  vi.setSystemTime(NOW);
  const spent = async (period: "month" | "quarter" | "all") => (await a.as.query(api.reports.overview, { period })).inPeriod.aiUsd;
  expect([await spent("month"), await spent("quarter"), await spent("all")]).toEqual([8, 14, 15]);
  const quarter = await a.as.query(api.reports.spending, { period: "quarter" });
  expect(quarter.months.map((m) => [new Date(m.month).toISOString().slice(0, 7), m.aiUsd])).toEqual([["2026-07", 2], ["2026-08", 4], ["2026-09", 8]]);
  expect((await a.as.query(api.reports.overview, { period: "month" })).sinceBegan.aiUsd).toBe(15);
});

test("each workspace's reports show only its own spending and progress", async () => {
  const { t, a, b } = await setup();
  await paid(t, b.w, NOW - 1000, 3);
  vi.setSystemTime(NOW);
  const company = await t.run((ctx) => ctx.db.insert("companies", { workspaceId: b.w, name: "Beta", found: [], at: NOW }));
  await b.as.mutation(api.enrich.rate, { id: company, value: "excited" });
  await b.as.mutation(api.jobs.start, { prompt: "hi" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: "ok" } }], usage: { cost: 0.5 } })));
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [spendA, spendB] = [await a.as.query(api.reports.spending, { period: "all" }), await b.as.query(api.reports.spending, { period: "all" })];
  expect(spendA.tasks).toEqual([]);
  expect(spendB.tasks.map((x) => [x.task, x.aiUsd])).toEqual([["find companies", 3], ["first call", 0.5]]);
  expect((await a.as.query(api.reports.search, { period: "all" })).targets).toBe(0);
  expect((await b.as.query(api.reports.search, { period: "all" })).targets).toBe(1);
  expect((await a.as.query(api.reports.activity, { period: "all" })).done).toEqual({});
  expect((await b.as.query(api.reports.activity, { period: "all" })).done).toEqual({ firstCall: 1 });
});

test("spending splits by who started the work, with calls from before it was kept as unknown, and by pursuit", async () => {
  const { t, a } = await setup();
  vi.setSystemTime(NOW);
  const pursuitId = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { workspaceId: a.w, name: "Beta", found: [], at: 0 });
    const postingId = await ctx.db.insert("postings", { workspaceId: a.w, companyId, provider: "lever", externalId: "1", url: "u", title: "Onboarding Manager", remote: false, firstSeen: 0, lastSeen: 0 });
    return ctx.db.insert("pursuits", { workspaceId: a.w, postingId, companyId, title: "Onboarding Manager", company: "Beta", status: "preparing", timeline: [{ at: NOW, event: "started" }], changedAt: NOW, at: NOW });
  });
  const costs = [0.01, 0.02];
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: "ok" } }], usage: { cost: costs.shift() } })));
  // Theirs (a button), and CareerBot's own for their pursuit.
  await a.as.mutation(api.jobs.start, { prompt: "mine" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const auto = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: a.w, kind: "firstCall", args: { prompt: "auto", pursuitId }, status: "queued", origin: "automatic" }));
  await t.action(internal.jobs.run, { jobId: auto });
  await paid(t, a.w, NOW, 0.04, "insights");

  const s = await a.as.query(api.reports.spending, { period: "month" });
  expect(s.origins).toEqual({ you: { aiUsd: 0.01, apolloCredits: 0, calls: 1 }, automatic: { aiUsd: 0.02, apolloCredits: 0, calls: 1 }, unknown: { aiUsd: 0.04, apolloCredits: 0, calls: 1 } });
  expect(s.pursuits).toEqual([{ pursuitId, title: "Onboarding Manager", company: "Beta", aiUsd: 0.02, apolloCredits: 0, calls: 1 }]);
  expect(s.areas.find((x) => x.area === "Record")?.aiUsd).toBe(0.04);
  expect(await t.run(async (ctx) => (await ctx.db.query("usage").collect()).map((r) => r.jobId ?? null))).toEqual([expect.any(String), auto, null]);
});

test("calls not yet settled and calls that couldn't be settled are reported apart from what was spent", async () => {
  const { t, a } = await setup();
  vi.setSystemTime(NOW);
  await paid(t, a.w, NOW, 0.5);
  await t.run(async (ctx) => {
    await ctx.db.insert("usage", { workspaceId: a.w, service: "openrouter", purpose: "role fit", costUsd: 0.1, ok: true, state: "indeterminate", lookup: ["gen-1"], at: NOW });
    await ctx.db.insert("usage", { workspaceId: a.w, service: "apollo", purpose: "find people", credits: 1, ok: false, state: "indeterminate", at: NOW });
    await ctx.db.insert("usage", { workspaceId: a.w, service: "openrouter", purpose: "role sort", costUsd: 0.2, ok: false, state: "unresolved", at: NOW });
  });
  const s = await a.as.query(api.reports.spending, { period: "month" });
  expect(s.months.at(-1)?.aiUsd).toBe(0.5);
  expect(s.notSettled).toEqual({ aiCalls: 1, aiKnownUsd: 0.1, apolloCalls: 1, apolloCreditsAtMost: 1 });
  expect(s.unresolved).toEqual({ aiCalls: 1, aiKnownUsd: 0.2, apolloCalls: 0, apolloCreditsAtMost: 0 });
});

test("counting what was there before adds each thing once: runs at once, runs again, and changes made around them", async () => {
  const { t, a } = await setup();
  vi.setSystemTime(NOW);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("usage", { workspaceId: a.w, service: "openrouter", purpose: "insights", costUsd: 0.3, ok: true, state: "settled", at: NOW - 1000 });
    await ctx.db.insert("usage", { workspaceId: a.w, service: "openrouter", purpose: "insights", costUsd: 0.2, ok: true, at: NOW - 2000 });
    const target = await ctx.db.insert("companies", { workspaceId: a.w, name: "Beta", found: [], rating: { value: "excited", at: NOW }, at: NOW });
    const other = await ctx.db.insert("companies", { workspaceId: a.w, name: "Gamma", found: [], at: NOW });
    const fact = (text: string) => ctx.db.insert("items", { workspaceId: a.w, kind: "fact", status: "approved", data: { text }, sources: [], at: NOW });
    await fact("Cut churn by 20%.");
    const undone = await fact("Grew revenue 30%.");
    await ctx.db.insert("jobs", { workspaceId: a.w, kind: "insights", args: {}, status: "done", startedAt: NOW });
    const direction = await ctx.db.insert("items", { workspaceId: a.w, kind: "direction", status: "approved", data: { name: "Sales" }, sources: [], at: 0 });
    const postingId = await ctx.db.insert("postings", { workspaceId: a.w, companyId: other, provider: "lever", externalId: "1", url: "u", title: "AE", remote: false, firstSeen: NOW, lastSeen: NOW });
    const row = { workspaceId: a.w, postingId, companyId: other, companyRating: "maybe" as const, state: "judged" as const, level: "strong" as const, newest: NOW, at: 0 };
    await ctx.db.insert("roleRanks", { ...row, directionId: direction });
    await ctx.db.insert("roleRanks", { ...row, best: direction });
    return { target, undone, direction };
  });
  // Undone before anything counted it: it's never taken off.
  await a.as.mutation(api.extract.review, { id: ids.undone, status: "proposed" });
  // Two runs at once, then changes (no longer a target; the fact approved again), then another run.
  await t.mutation(internal.reports.backfillAll, {});
  await t.mutation(internal.reports.backfillAll, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await a.as.mutation(api.enrich.rate, { id: ids.target, value: "maybe" });
  await a.as.mutation(api.extract.review, { id: ids.undone, status: "approved" });
  await t.mutation(internal.reports.backfillAll, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const o = await a.as.query(api.reports.overview, { period: "month" });
  expect([o.inPeriod.aiUsd, o.inPeriod.companiesFound, o.inPeriod.factsApproved, o.inPeriod.strongRoles]).toEqual([0.5, 2, 2, 1]);
  const s = await a.as.query(api.reports.search, { period: "month" });
  expect(s.targets).toBe(0);
  expect(s.roles).toEqual([{ directionId: ids.direction, direction: "Sales", strong: 1, some: 0, weak: 0, none: 0, against: 0, sortedOut: 0 }]);
  expect((await a.as.query(api.reports.activity, { period: "month" })).done).toEqual({ insights: 1 });
});
