import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ALLOWANCE_USED_UP, monthStart } from "./budgets";
import { chat } from "./metering";
import { seedModelPrices } from "./modelPrices.testing";
import { allowanceOf, HELD_BY_PLATFORM, NOT_ON_PLATFORM, platformMonth, setAllowance } from "./plan";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
// The first recommended model: what a workspace on CareerBot's AI uses until it chooses another.
const MODEL = "deepseek/deepseek-v4.1-flash";
const reply = (cost = 0.5) => Response.json({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost } });
const ENV = ["MASTER_KEY_V1", "PLATFORM_OPENROUTER_API_KEY", "PLATFORM_AI_LIMIT_USD", "PLATFORM_AI_ALLOWANCE_USD", "CAREERBOT_MODE"];

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "3a".repeat(32);
  process.env.PLATFORM_OPENROUTER_API_KEY = "sk-or-platform";
  process.env.PLATFORM_AI_LIMIT_USD = "100";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => reply()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of ENV) delete process.env[key];
});

type T = TestConvex<typeof schema>;

async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t, [MODEL, "test/model"]);
  return { t };
}

// A person and their workspace, with their own OpenRouter key when `ownKey` is given.
async function person(t: T, email: string, ownKey?: string) {
  const sealed = ownKey ? await seal(ownKey) : null;
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email });
    const w = await ensureWorkspace(ctx, u);
    if (sealed) await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    return { u, w };
  });
  const as = t.withIdentity({ subject: `${u}|s` });
  const runJob = async () => {
    await as.mutation(api.jobs.start, { prompt: "hi" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return as.query(api.jobs.latest, {});
  };
  return { w, as, runJob };
}

const keyUsed = (call: Parameters<typeof fetch>) => new Headers(call[1]?.headers).get("Authorization");
const refusal = (e: unknown) => (e instanceof ConvexError && e.data && typeof e.data === "object" && "message" in e.data ? e.data.message : undefined);
const usage = (t: T, w: Id<"workspaces">) => t.run((ctx) => ctx.db.query("usage").withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", w).eq("service", "openrouter")).collect());
const platformSpent = (t: T) => t.run((ctx) => platformMonth(ctx, monthStart()));
const budget = (aiMonthlyUsd: number) => ({ aiMonthlyUsd, apolloMonthlyCredits: 0, apolloMode: "paused" as const });

test("CareerBot's key is used only by a workspace with no key of its own", async () => {
  const { t } = await setup();
  const platform = await person(t, "a@example.com");
  const own = await person(t, "b@example.com", "sk-or-own");
  await own.as.mutation(api.budgets.set, budget(10));
  await own.as.mutation(api.aiSettings.setDefault, { model: "test/model" });

  // No budget set: the allowance is theirs to use, on the first recommended model.
  expect(await platform.runJob()).toMatchObject({ status: "done", result: { text: "ok" } });
  expect(keyUsed(vi.mocked(fetch).mock.calls[0])).toBe("Bearer sk-or-platform");
  expect((await usage(t, platform.w)).map((u) => [u.platform, u.model, u.costUsd])).toEqual([[true, MODEL, 0.5]]);

  // Their own key: any model, paid by them, not counted on CareerBot's key.
  expect(await own.runJob()).toMatchObject({ status: "done" });
  expect(keyUsed(vi.mocked(fetch).mock.calls[1])).toBe("Bearer sk-or-own");
  expect((await usage(t, own.w)).map((u) => u.platform)).toEqual([undefined]);
  expect(await platformSpent(t)).toMatchObject({ spentUsd: 0.5, heldUsd: 0, limitUsd: 100 });
  expect(await platform.as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 5, aiOwnUsd: null, aiSpentUsd: 0.5, plan: { source: "platform", allowanceUsd: 5 } });
  expect(await own.as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 10, plan: { source: "own key" } });
});

test("a self-hosted copy, a deployment without the platform's limit, and the demo never use CareerBot's key", async () => {
  const { t } = await setup();
  const { w } = await person(t, "a@example.com");
  const call = () => t.action((ctx) => chat(ctx, { workspaceId: w, purpose: "x", model: MODEL, messages: [{ role: "user", content: "hi" }] }));

  process.env.CAREERBOT_MODE = "self-hosted";
  await expect(call()).rejects.toThrow("Add your OpenRouter key in settings first.");
  delete process.env.CAREERBOT_MODE;
  delete process.env.PLATFORM_AI_LIMIT_USD;
  await expect(call()).rejects.toThrow("Add your OpenRouter key in settings first.");
  process.env.PLATFORM_AI_LIMIT_USD = "100";
  await t.run((ctx) => ctx.db.patch(w, { demo: true }));
  await expect(call()).rejects.toThrow("Add your OpenRouter key in settings first.");
  expect(await t.run((ctx) => allowanceOf(ctx, w))).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("on CareerBot's key only the recommended models can be used", async () => {
  const { t } = await setup();
  const { w, as } = await person(t, "a@example.com");
  await expect(as.mutation(api.aiSettings.setDefault, { model: "test/model" })).rejects.toThrow(NOT_ON_PLATFORM);
  await expect(as.mutation(api.aiSettings.set, { task: "resume", model: "test/model" })).rejects.toThrow(NOT_ON_PLATFORM);
  await as.mutation(api.aiSettings.setDefault, { model: "anthropic/claude-sonnet-5.5" });
  // A choice made before (with a key of their own) isn't sent on CareerBot's key.
  await t.run((ctx) => ctx.db.insert("aiSettings", { workspaceId: w, task: "firstCall", model: "test/model" }));
  await expect(t.action((ctx) => chat(ctx, { workspaceId: w, purpose: "x", model: "test/model", messages: [{ role: "user", content: "hi" }] }))).rejects.toThrow(NOT_ON_PLATFORM);
  expect(fetch).not.toHaveBeenCalled();
});

test("the person can't raise the allowance; their own budget only lowers it, and an operator can raise it", async () => {
  const { t } = await setup();
  const { w, as } = await person(t, "a@example.com");
  await expect(as.mutation(api.budgets.set, budget(6))).rejects.toThrow("Your AI allowance is $5 a month");
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 5, aiOwnUsd: null });
  await as.mutation(api.budgets.set, budget(2));
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 2, aiOwnUsd: 2 });
  // A budget set higher before (with their own key, since removed) doesn't raise it either.
  await t.run(async (ctx) => {
    const row = (await ctx.db.query("budgets").withIndex("by_workspace", (q) => q.eq("workspaceId", w)).unique())!;
    await ctx.db.patch(row._id, { aiMonthlyUsd: 50 });
  });
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 5, aiOwnUsd: 50 });
  await expect(t.mutation(internal.budgets.reserve, { workspaceId: w, service: "openrouter", automated: true, amount: 5.01, purpose: "x", platform: true })).rejects.toThrow(
    "This call could cost more than what's left of this month's AI allowance.",
  );

  // The operator's allowance; a budget at the old allowance follows it up, a lower one stays.
  await as.mutation(api.budgets.set, budget(5));
  await t.run((ctx) => setAllowance(ctx, w, 20));
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 20, plan: { allowanceUsd: 20 } });
  await as.mutation(api.budgets.set, budget(8));
  await t.run((ctx) => setAllowance(ctx, w, 30));
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 8, plan: { allowanceUsd: 30 } });
  await t.run((ctx) => setAllowance(ctx, w, null));
  expect(await t.run((ctx) => allowanceOf(ctx, w))).toEqual({ source: "platform", allowanceUsd: 5, override: false });
  await expect(t.run((ctx) => setAllowance(ctx, w, -1))).rejects.toThrow();
});

test("work pauses at the allowance, and an operator raising it picks it up", async () => {
  process.env.PLATFORM_AI_ALLOWANCE_USD = "1";
  const { t } = await setup();
  const { w, as, runJob } = await person(t, "a@example.com");
  expect(await runJob()).toMatchObject({ status: "done" });
  expect(await runJob()).toMatchObject({ status: "done" });
  // $0.50 + $0.50: the allowance is used up.
  expect(await runJob()).toMatchObject({ status: "paused", pausedFor: "openrouter", error: ALLOWANCE_USED_UP });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 1, aiSpentUsd: 1, plan: { source: "platform", allowanceUsd: 1 } });
  await t.run((ctx) => setAllowance(ctx, w, 2));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await as.query(api.jobs.latest, {})).toMatchObject({ status: "done" });
});

test("adding their own key takes the allowance away: their own budget applies, on their key", async () => {
  process.env.PLATFORM_AI_ALLOWANCE_USD = "0.5";
  const { t } = await setup();
  const { w, as, runJob } = await person(t, "a@example.com");
  expect(await runJob()).toMatchObject({ status: "done" });
  expect(await runJob()).toMatchObject({ status: "paused", error: ALLOWANCE_USED_UP });

  await as.mutation(internal.openrouterKey.store, { sealed: await seal("sk-or-own"), last4: "-own" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  // No budget of their own yet, so it waits for one; the allowance no longer counts.
  expect(await as.query(api.jobs.latest, {})).toMatchObject({ status: "paused", error: "Set a monthly AI budget to continue." });
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 0, plan: { source: "own key" } });
  await as.mutation(api.budgets.set, budget(10));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await as.query(api.jobs.latest, {})).toMatchObject({ status: "done" });
  expect(keyUsed(vi.mocked(fetch).mock.calls.at(-1)!)).toBe("Bearer sk-or-own");
  expect((await usage(t, w)).map((u) => u.platform)).toEqual([true, undefined]);
  expect(await platformSpent(t)).toMatchObject({ spentUsd: 0.5 });

  // Removing it again brings the allowance back, used up for this month.
  await as.mutation(api.openrouterKey.remove, {});
  expect(await as.query(api.budgets.status, {})).toMatchObject({ aiMonthlyUsd: 0.5, plan: { source: "platform" } });
  expect(await runJob()).toMatchObject({ status: "paused", error: ALLOWANCE_USED_UP });
});

test("workspaces calling at once can't jointly spend past the platform's limit", async () => {
  // Each call holds about $0.08 (32,000 reply tokens at $2 per million, with a margin): one fits the platform's $0.10,
  // two don't, though each workspace's own allowance has room for many.
  process.env.PLATFORM_AI_LIMIT_USD = "0.1";
  const { t } = await setup();
  const a = await person(t, "a@example.com");
  const b = await person(t, "b@example.com");
  let answerRunning!: () => void;
  const fetchMock = vi.fn(async () => reply(0.01));
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answerRunning = () => resolve(reply(0.01)))));
  vi.stubGlobal("fetch", fetchMock);
  const running = t.action((ctx) => chat(ctx, { workspaceId: a.w, purpose: "running", model: MODEL, messages: [{ role: "user", content: "hi" }] }));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

  // B's call would fit B's allowance, but A's running call holds what's left of the platform's limit.
  expect(await b.runJob()).toMatchObject({ status: "paused", pausedFor: "openrouter", error: HELD_BY_PLATFORM });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await platformSpent(t)).heldUsd).toBeGreaterThan(0.05);

  // A's call settles and gives back what it didn't spend: B's work picks up.
  answerRunning();
  await running;
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await b.as.query(api.jobs.latest, {})).toMatchObject({ status: "done" });
  expect(await platformSpent(t)).toMatchObject({ spentUsd: 0.02, heldUsd: 0 });
  // Each workspace's spending stays its own.
  expect((await a.as.query(api.budgets.status, {})).aiSpentUsd).toBeCloseTo(0.01);
  expect((await b.as.query(api.budgets.status, {})).aiSpentUsd).toBeCloseTo(0.01);
});

test("reservations from many workspaces at once are summed against the platform's limit", async () => {
  process.env.PLATFORM_AI_LIMIT_USD = "1";
  const { t } = await setup();
  const people = await Promise.all(Array.from({ length: 6 }, (_, i) => person(t, `p${i}@example.com`)));
  const tries = await Promise.allSettled(
    people.map(({ w }) => t.mutation(internal.budgets.reserve, { workspaceId: w, service: "openrouter", automated: true, amount: 0.3, purpose: "x", platform: true })),
  );
  // $0.30 each: three fit $1, the rest are told to wait.
  expect(tries.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  expect(tries.flatMap((r) => (r.status === "rejected" ? [refusal(r.reason)] : []))).toEqual(Array(3).fill(HELD_BY_PLATFORM));
  expect((await platformSpent(t)).heldUsd).toBeCloseTo(0.9);
  // Once the platform's limit is spent, it's used up for the month for everyone.
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("platformAiSpend").collect()) await ctx.db.patch(row._id, { usd: row.held, held: 0 });
    await ctx.db.insert("platformAiSpend", { month: monthStart(), shard: 99, usd: 0.1, held: 0 });
  });
  await expect(people[5].runJob()).resolves.toMatchObject({ status: "paused", error: "CareerBot's AI has reached its limit for this month." });
});

test("Getting started counts CareerBot's AI as the key and budget step", async () => {
  const { t } = await setup();
  const onPlatform = await person(t, "a@example.com");
  expect((await onPlatform.as.query(api.today.setup, {})).steps.key).toMatchObject({ done: true, detail: "CareerBot’s AI · $5 a month" });
  // Their own key without a budget isn't done, as on a self-hosted copy.
  const own = await person(t, "b@example.com", "sk-or-own");
  expect((await own.as.query(api.today.setup, {})).steps.key).toMatchObject({ done: false });
});
