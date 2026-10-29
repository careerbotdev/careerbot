import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { HELD_BY_RUNNING, HELD_BY_UNSETTLED } from "./budgets";
import { chat } from "./metering";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = () => Response.json({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.5 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "33".repeat(32);
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => reply()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

// `documentsRead`: the most documents one transaction may read (convex-test enforces it like a deployment would).
async function setup(documentsRead?: number) {
  const t = convexTest({ schema, modules, ...(documentsRead ? { transactionLimits: { documentsRead } } : {}) });
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("aiSettings", { workspaceId: w, task: "firstCall", model: "test/model" });
    return { u, w };
  });
  const as = t.withIdentity({ subject: `${u}|s` });
  const runJob = async () => {
    await as.mutation(api.jobs.start, { prompt: "hi" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return as.query(api.jobs.latest, {});
  };
  return { t, w, as, runJob };
}

const setBudget = (usd: number, apolloMode: "on" | "onRequest" | "paused" = "on") => ({ aiMonthlyUsd: usd, apolloMonthlyCredits: 10, apolloMode });

test("many AI calls at once in one workspace all run and are all counted, and none reads every call of the month", async () => {
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  // One transaction may read 250 documents: more than this month's 200 earlier calls, fewer than there are once these
  // 64 are added. A budget check that reads every call of the month fails here, as calls running at once collided.
  const { t, w, as } = await setup(250);
  await as.mutation(api.budgets.set, setBudget(100));
  await t.run(async (ctx) => {
    for (let i = 0; i < 200; i++) await ctx.db.insert("usage", { workspaceId: w, service: "openrouter", purpose: "earlier", costUsd: 0.01, ok: true, state: "settled", at: Date.now() - 1000 });
  });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: "ok" } }], usage: { cost: 0.02 } })));
  const started = Date.now();
  for (let i = 0; i < 64; i++) await as.mutation(api.jobs.start, { prompt: `hi ${i}` });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run((ctx) => ctx.db.query("jobs").collect())).map((j) => j.status)).toEqual(Array(64).fill("done"));
  const calls = await t.run((ctx) => ctx.db.query("usage").withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", w).eq("service", "openrouter").gte("at", started)).collect());
  expect(calls.map((u) => [u.state, u.costUsd])).toEqual(Array(64).fill(["settled", 0.02]));
  expect((await as.query(api.budgets.status, {})).aiSpentUsd).toBeCloseTo(2 + 64 * 0.02);
});

test("with no AI budget set, work pauses instead of spending", async () => {
  const { t, runJob } = await setup();
  expect(await runJob()).toMatchObject({ status: "paused", pausedFor: "openrouter" });
  expect(fetch).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toHaveLength(0);
});

test("work runs inside the budget and pauses once it's used up", async () => {
  const { as, runJob } = await setup();
  await as.mutation(api.budgets.set, setBudget(1));
  expect(await runJob()).toMatchObject({ status: "done" });
  expect(await runJob()).toMatchObject({ status: "done" });
  // $0.50 + $0.50 = $1.00 spent; the next call would go over.
  expect(await runJob()).toMatchObject({ status: "paused", error: "This month's AI budget is used up." });
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 1, aiSpentUsd: 1 });
});

test("raising the budget resumes paused work where it left off", async () => {
  const { t, as, runJob } = await setup();
  expect(await runJob()).toMatchObject({ status: "paused" });
  await as.mutation(api.budgets.set, setBudget(5));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await as.query(api.jobs.latest, {})).toMatchObject({ status: "done", result: { text: "ok" } });
});

test("work waits while calls already running hold the rest of the budget, and starts once they settle", async () => {
  const { t, w, as, runJob } = await setup();
  // A call holds about $0.064 (32,000 reply tokens at $2 per million): one fits $0.10, two don't.
  await as.mutation(api.budgets.set, setBudget(0.1));
  let answerRunning!: () => void;
  const fetchMock = vi.fn(async () => reply());
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answerRunning = () => resolve(Response.json({ choices: [{ message: { content: "ok" } }], usage: { cost: 0.01 } })))));
  vi.stubGlobal("fetch", fetchMock);
  const running = t.action(async (ctx) => chat(ctx, { workspaceId: w, purpose: "running", model: "test/model", messages: [{ role: "user", content: "hi" }] }));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(await runJob()).toMatchObject({ status: "paused", pausedFor: "openrouter", error: HELD_BY_RUNNING });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  answerRunning();
  await running;
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await as.query(api.jobs.latest, {})).toMatchObject({ status: "done", result: { text: "ok" } });
});

test("work pausing for running calls that have all settled since starts again at once", async () => {
  const { t, w, as } = await setup();
  await as.mutation(api.budgets.set, setBudget(5));
  const jobId = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: w, kind: "firstCall", args: { prompt: "hi" }, status: "running" }));
  await t.mutation(internal.jobs.setState, { jobId, status: "paused", pausedFor: "openrouter", error: HELD_BY_RUNNING });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await as.query(api.jobs.latest, {})).toMatchObject({ status: "done", result: { text: "ok" } });
});

test("a new month resets spending, and the monthly run resumes paused work", async () => {
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  const { t, as, runJob } = await setup();
  await as.mutation(api.budgets.set, setBudget(0.5));
  expect(await runJob()).toMatchObject({ status: "done" });
  expect(await runJob()).toMatchObject({ status: "paused" });
  vi.setSystemTime(new Date("2026-10-01T00:05:00Z"));
  await t.mutation(internal.jobs.resumePaused, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await as.query(api.jobs.latest, {})).toMatchObject({ status: "done" });
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiSpentUsd: 0.5 });
});

test("Apollo modes: on-request blocks automated calls only; paused blocks everything", async () => {
  const { t, w, as } = await setup();
  const reserve = (automated: boolean) =>
    t.mutation(internal.budgets.reserve, { workspaceId: w, service: "apollo", automated, amount: 1, purpose: "search", accountLeft: 100 });
  await as.mutation(api.budgets.set, setBudget(1, "onRequest"));
  await expect(reserve(true)).rejects.toThrow();
  await expect(reserve(false)).resolves.toBeDefined();
  await as.mutation(api.budgets.set, setBudget(1, "paused"));
  await expect(reserve(false)).rejects.toThrow();
});

test("one workspace's budget doesn't cover another's work", async () => {
  const { t, as } = await setup();
  await as.mutation(api.budgets.set, setBudget(5));
  const other = await t.run(async (ctx) => ensureWorkspace(ctx, await ctx.db.insert("users", { email: "b@example.com" })));
  await expect(
    t.mutation(internal.budgets.reserve, { workspaceId: other, service: "openrouter", automated: true, amount: 0, purpose: "x" }),
  ).rejects.toThrow();
});

// The month's settled and held AI spending, from its running total.
const monthTotal = (t: Awaited<ReturnType<typeof setup>>["t"], w: Id<"workspaces">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("aiSpend").withIndex("by_workspace_month", (q) => q.eq("workspaceId", w)).collect();
    return { settled: rows.reduce((n, r) => n + r.usd, 0), held: rows.reduce((n, r) => n + (r.held ?? 0), 0) };
  });

test("a worker's calls take what they hold from its lease and settle into it without touching the month's total, and the budget is never held past", async () => {
  const { t, w, as } = await setup();
  await as.mutation(api.budgets.set, setBudget(1));
  const reserve = (holder: string, amount: number) => t.mutation(internal.budgets.reserve, { workspaceId: w, service: "openrouter", automated: true, amount, purpose: "role fit", holder });
  const leaseOf = (holder: string) => t.run((ctx) => ctx.db.query("aiLeases").withIndex("by_workspace_holder", (q) => q.eq("workspaceId", w).eq("holder", holder)).unique());
  const shards = () => t.run((ctx) => ctx.db.query("aiSpend").collect());

  // The first call holds itself and three more like it.
  const calls = [await reserve("w0", 0.1)];
  expect((await monthTotal(t, w)).held).toBeCloseTo(0.4, 10);
  expect((await leaseOf("w0"))?.left).toBeCloseTo(0.3, 10);
  // The next three take theirs from the lease: the month's total isn't read or written.
  let total = await shards();
  for (let i = 0; i < 3; i++) calls.push(await reserve("w0", 0.1));
  expect(await shards()).toEqual(total);
  expect((await leaseOf("w0"))?.left).toBeCloseTo(0, 10);
  // With the lease used up, the next call starts a new one.
  calls.push(await reserve("w0", 0.1));
  expect((await monthTotal(t, w)).held).toBeCloseTo(0.8, 10);
  // Each settles into the lease: what it cost is spent there, what it didn't is the lease's again, and the month's
  // total still holds all of it. The budget's meter counts what was spent.
  total = await shards();
  for (const usageId of calls) await t.mutation(internal.metering.settle, { usageId, holder: "w0", ok: true, costUsd: 0.05 });
  expect(await shards()).toEqual(total);
  expect(await leaseOf("w0")).toMatchObject({ left: expect.closeTo(0.55, 10), spent: expect.closeTo(0.25, 10) });
  expect((await as.query(api.budgets.status, {})).aiSpentUsd).toBeCloseTo(0.25, 10);

  // What the lease holds counts as held by work running now: another worker's call that doesn't fit beside it waits.
  await expect(reserve("w1", 0.5)).rejects.toMatchObject({ data: { message: HELD_BY_RUNNING } });
  // Given back, what it spent is settled in the month's total and nothing is held.
  await t.mutation(internal.budgets.giveBack, { workspaceId: w, holder: "w0" });
  expect(await leaseOf("w0")).toBeNull();
  expect(await monthTotal(t, w)).toEqual({ settled: expect.closeTo(0.25, 10), held: expect.closeTo(0, 10) });
  // Now it fits, but four like it don't: it's held alone, with no lease, and settles into the month's total.
  const alone = await reserve("w1", 0.5);
  expect(await leaseOf("w1")).toBeNull();
  await t.mutation(internal.metering.settle, { usageId: alone, holder: "w1", ok: true, costUsd: 0.5 });
  expect(await monthTotal(t, w)).toEqual({ settled: expect.closeTo(0.75, 10), held: expect.closeTo(0, 10) });
  expect((await as.query(api.budgets.status, {})).aiSpentUsd).toBeCloseTo(0.75, 10);
  // Activity and Reports count each call, as without a lease.
  expect((await t.run((ctx) => ctx.db.query("usage").collect())).map((u) => [u.purpose, u.state, u.costUsd])).toEqual([...Array(5).fill(["role fit", "settled", 0.05]), ["role fit", "settled", 0.5]]);
});

test("the daily check gives back a lease whose worker was cut off, and work paused for it picks up", async () => {
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  const { t, w, as } = await setup();
  await as.mutation(api.budgets.set, setBudget(1));
  const usageId = await t.mutation(internal.budgets.reserve, { workspaceId: w, service: "openrouter", automated: true, amount: 0.1, purpose: "role fit", holder: "gone" });
  await t.mutation(internal.metering.settle, { usageId, holder: "gone", ok: true, costUsd: 0.1 });
  expect(await monthTotal(t, w)).toEqual({ settled: 0, held: expect.closeTo(0.4, 10) });
  // Still within an action's 10 minutes: its worker may be running.
  await t.mutation(internal.budgets.expireLeases, { workspaceId: w });
  expect((await monthTotal(t, w)).held).toBeCloseTo(0.4, 10);
  const jobId = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: w, kind: "firstCall", args: { prompt: "hi" }, status: "paused", pausedFor: "openrouter", error: HELD_BY_UNSETTLED }));
  vi.setSystemTime(new Date("2026-09-20T12:11:00Z"));
  await t.mutation(internal.budgets.expireLeases, { workspaceId: w });
  expect(await monthTotal(t, w)).toEqual({ settled: expect.closeTo(0.1, 10), held: expect.closeTo(0, 10) });
  expect(await t.run((ctx) => ctx.db.query("aiLeases").collect())).toEqual([]);
  expect((await t.run((ctx) => ctx.db.get(jobId)))?.status).toBe("queued");
});
