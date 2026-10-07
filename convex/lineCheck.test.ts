import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { markOf } from "./resumeBasis";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (content: unknown, cost = 0.001) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost } });
const LINE = "Cut churn by 20%.";
const FACT = "Cut churn by 20% in 2023.";

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "77".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

// Two workspaces; A has a base resume with one line on one approved fact. Checking lines follows A's default model.
async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const [a, b] = await t.run(async (ctx) => {
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "resume", model: "test/writer" });
      await ctx.db.insert("aiDefaults", { workspaceId: w, model: "test/cheap" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const w = a.w;
  const fact = await t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "acme", data: { employer: "Acme", title: "Head of CS", start: "2021-01" }, sources: [], at: 0 });
    return ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text: FACT }, sources: [], at: 0 });
  });
  vi.stubGlobal("fetch", vi.fn(async () => reply({ summary: "Customer success lead.", experience: [{ roleKey: "acme", bullets: [{ text: LINE, factIds: [fact] }] }], skills: [] })));
  await asA.mutation(api.resume.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const id = (await asA.query(api.resume.list, {})).versions[0].id;
  // Runs what's scheduled with the model answering `content`; returns what each call sent.
  const settle = async (content: unknown, cost?: number) => {
    const f = vi.fn(async () => reply(content, cost));
    vi.stubGlobal("fetch", f);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body) as { model: string; messages: { content: string }[] });
  };
  const layout = async () => (await asA.query(api.resume.list, {})).versions[0].layout;
  return { t, asA, asB, w, id, fact, settle, layout };
}

test("a line or summary in their own words is checked only on their ask, against its facts, and the answer is kept until they edit it again", async () => {
  const { asA, asB, id, fact, settle, layout } = await setup();
  // Only their own words are checked.
  await expect(asA.mutation(api.lineCheck.check, { id, line: LINE })).rejects.toThrow("Only a line in your own words");
  await expect(asA.mutation(api.lineCheck.check, { id })).rejects.toThrow("Only a summary in your own words");
  await asA.mutation(api.resume.setWords, { id, text: LINE, to: "Cut churn by 20% across 300 accounts." });
  await expect(asB.mutation(api.lineCheck.check, { id, line: LINE })).rejects.toThrow("Not found");
  // Nothing runs by itself: editing starts no check.
  expect(await settle({ supported: true, beyond: [] })).toEqual([]);
  expect(await asA.query(api.estimates.costs, {})).toMatchObject({ lineCheck: null });

  expect(await asA.mutation(api.lineCheck.check, { id, line: LINE })).not.toBeNull();
  // Asked twice while it runs: one check.
  expect(await asA.mutation(api.lineCheck.check, { id, line: LINE })).toBeNull();
  expect(await asA.query(api.lineCheck.checking, { id })).toEqual({ lines: [LINE], summary: false });
  const calls = await settle({ supported: false, beyond: ["across 300 accounts", " "] }, 0.004);
  // One metered call with the workspace's default model, reading their words and the fact the line rests on.
  expect(calls).toHaveLength(1);
  expect(calls[0].model).toBe("test/cheap");
  expect(calls[0].messages[1].content).toContain("Cut churn by 20% across 300 accounts.");
  expect(calls[0].messages[1].content).toContain("Cut churn by 20% in 2023.");
  expect(await asA.query(api.estimates.costs, {})).toMatchObject({ lineCheck: 0.004 });
  expect(await asA.query(api.lineCheck.checking, { id })).toEqual({ lines: [], summary: false });
  expect((await layout()).words).toEqual([{ text: LINE, to: "Cut churn by 20% across 300 accounts.", check: { supported: false, beyond: ["across 300 accounts"], facts: [{ id: fact, mark: markOf(FACT) }], at: expect.any(Number) }, marks: expect.any(Array) }]);

  // Saving the same words keeps the answer; new words clear it.
  await asA.mutation(api.resume.setWords, { id, text: LINE, to: "Cut churn by 20% across 300 accounts." });
  expect((await layout()).words![0].check).toMatchObject({ supported: false });
  await asA.mutation(api.resume.setWords, { id, text: LINE, to: "Cut churn by a fifth." });
  expect((await layout()).words).toEqual([{ text: LINE, to: "Cut churn by a fifth.", marks: expect.any(Array) }]);

  // The summary, against the facts the resume rests on.
  await asA.mutation(api.resume.setSummary, { id, text: "Leader who cut churn by a fifth." });
  await asA.mutation(api.lineCheck.check, { id });
  const summaryCalls = await settle({ supported: true, beyond: [] });
  expect(summaryCalls[0].messages[1].content).toContain("Cut churn by 20% in 2023.");
  expect((await layout()).summaryCheck).toEqual({ supported: true, beyond: [], facts: [{ id: fact, mark: markOf(FACT) }], at: expect.any(Number) });
  await asA.mutation(api.resume.setSummary, { id, text: "Leader who cut churn." });
  expect((await layout()).summaryCheck).toBeUndefined();
});

test("a line resting on no approved facts isn't checked", async () => {
  const { t, asA, id, fact } = await setup();
  await asA.mutation(api.resume.setWords, { id, text: LINE, to: "Cut churn by a fifth." });
  await t.run((ctx) => ctx.db.patch(fact, { status: "rejected" }));
  await expect(asA.mutation(api.lineCheck.check, { id, line: LINE })).rejects.toThrow("no approved facts");
});

test("a fact edited while the check runs: the answer isn't kept", async () => {
  const { t, asA, id, fact, layout } = await setup();
  await asA.mutation(api.resume.setWords, { id, text: LINE, to: "Cut churn by a fifth." });
  await asA.mutation(api.lineCheck.check, { id, line: LINE });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await asA.mutation(api.extract.edit, { id: fact, text: "Cut churn by 10% in 2023." });
      return reply({ supported: true, beyond: [] });
    }),
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const job = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "lineCheck"));
  expect(job).toMatchObject({ status: "done", result: { saved: false } });
  expect((await layout()).words![0].check).toBeUndefined();
});

test("a kept check shows only while the facts it was checked against read the same", async () => {
  const { asA, id, fact, settle, layout } = await setup();
  await asA.mutation(api.resume.setWords, { id, text: LINE, to: "Cut churn by a fifth." });
  await asA.mutation(api.resume.setSummary, { id, text: "Leader who cut churn by a fifth." });
  await asA.mutation(api.lineCheck.check, { id, line: LINE });
  await asA.mutation(api.lineCheck.check, { id });
  await settle({ supported: true, beyond: [] });
  expect((await layout()).words![0].check).toMatchObject({ supported: true });
  expect((await layout()).summaryCheck).toMatchObject({ supported: true });
  // Edited since: neither shows as Supported.
  await asA.mutation(api.extract.edit, { id: fact, text: "Cut churn by 10% in 2023." });
  expect((await layout()).words![0].check).toBeUndefined();
  expect((await layout()).summaryCheck).toBeUndefined();
  // Back as it read when checked: the check shows again.
  await asA.mutation(api.extract.revertWording, { id: fact });
  expect((await layout()).words![0].check).toMatchObject({ supported: true });
});

test("a check goes through the AI budget: with none left it waits, spends nothing and keeps no answer", async () => {
  const { t, asA, w, id, settle, layout } = await setup();
  await asA.mutation(api.resume.setWords, { id, text: LINE, to: "Cut churn by a fifth." });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("budgets").withIndex("by_workspace", (q) => q.eq("workspaceId", w)).unique();
    await ctx.db.delete(row!._id);
  });
  await asA.mutation(api.lineCheck.check, { id, line: LINE });
  expect(await settle({ supported: true, beyond: [] })).toEqual([]);
  const job = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "lineCheck"));
  expect(job).toMatchObject({ status: "paused", pausedFor: "openrouter" });
  expect((await layout()).words![0].check).toBeUndefined();
  expect(await asA.query(api.lineCheck.checking, { id })).toEqual({ lines: [LINE], summary: false });
});
