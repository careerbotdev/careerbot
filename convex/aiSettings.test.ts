import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { RECOMMENDED } from "./aiSettings";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = () => Response.json({ choices: [{ message: { content: JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }) } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.002 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "55".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const [[a, wa], [b, wb]] = await t.run(async (ctx) => {
    const ids = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      ids.push([u, w] as const);
    }
    return ids;
  });
  const asA = t.withIdentity({ subject: `${a}|s` });
  const asB = t.withIdentity({ subject: `${b}|s` });
  const narrativeId = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "I sold things." });
  const fetchMock = vi.fn(async () => reply());
  vi.stubGlobal("fetch", fetchMock);
  const sentModels = () => fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string)).map((b) => [b.model, b.reasoning?.effort]);
  const read = async () => {
    await asA.mutation(api.sources.readAgain, { source: { narrativeId }, includingRejected: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  return { t, asA, asB, wa, wb, narrativeId, sentModels, read };
}

test("reads use the model and effort the workspace chose, and pick up a change on the next read", async () => {
  const { asA, sentModels, read } = await setup();
  await asA.mutation(api.aiSettings.set, { task: "extract", model: "vendor/first", reasoning: "medium" });
  await read();
  await asA.mutation(api.aiSettings.set, { task: "extract", model: "vendor/second", reasoning: "high" });
  await read();
  expect(sentModels()).toEqual([["vendor/first", "medium"], ["vendor/second", "high"]]);
});

test("a task uses its own model, else the workspace default; decision tasks never use the default", async () => {
  const { t, asA, wa, sentModels, read } = await setup();
  await asA.mutation(api.aiSettings.setDefault, { model: "vendor/default", reasoning: "low" });
  expect(await t.query(internal.aiSettings.choiceFor, { workspaceId: wa, task: "roleSortJev" })).toBeNull();
  await asA.mutation(api.aiSettings.set, { task: "roleSortJev", model: "typesafe/jev-1.13" });
  await read();
  await asA.mutation(api.aiSettings.set, { task: "extract", model: "vendor/own", reasoning: "high" });
  await read();
  expect(sentModels()).toEqual([["vendor/default", "low"], ["vendor/own", "high"]]);
  expect(await asA.query(api.aiSettings.defaultChoice, {})).toEqual({ model: "vendor/default", reasoning: "low" });
  const choices = await asA.query(api.aiSettings.list, {});
  expect(choices.find((c) => c.task === "extract")).toMatchObject({ own: true, choice: { model: "vendor/own", reasoning: "high" } });
  expect(choices.find((c) => c.task === "rework")).toMatchObject({ own: false, choice: { model: "vendor/default", reasoning: "low" } });
  expect(choices.find((c) => c.task === "roleSortJev")).toMatchObject({ own: true, decision: true, choice: { model: "typesafe/jev-1.13" } });
  expect(await t.query(internal.aiSettings.choiceFor, { workspaceId: wa, task: "roleSortJev" })).toEqual({ model: "typesafe/jev-1.13" });
});

test("clearing a task's own model makes it follow the default again", async () => {
  const { asA, sentModels, read } = await setup();
  await asA.mutation(api.aiSettings.setDefault, { model: "vendor/default" });
  await asA.mutation(api.aiSettings.set, { task: "extract", model: "vendor/own" });
  await asA.mutation(api.aiSettings.clearTask, { task: "extract" });
  await read();
  expect(sentModels()).toEqual([["vendor/default", undefined]]);
  expect((await asA.query(api.aiSettings.list, {})).find((c) => c.task === "extract")).toMatchObject({ own: false, choice: { model: "vendor/default" } });
  await expect(asA.mutation(api.aiSettings.clearTask, { task: "roleSortJev" })).rejects.toThrow("needs its own model");
});

test("adopting a default takes each workspace's most used choice once, keeps every task's model, and leaves workspaces with a default alone", async () => {
  const { t, asA, asB, wa, wb } = await setup();
  await t.run(async (ctx) => {
    for (const task of ["extract", "rework", "insights"] as const) await ctx.db.insert("aiSettings", { workspaceId: wa, task, model: "vendor/most", reasoning: "high" });
    await ctx.db.insert("aiSettings", { workspaceId: wa, task: "letter", model: "vendor/most" });
    await ctx.db.insert("aiSettings", { workspaceId: wa, task: "resume", model: "vendor/writer", reasoning: "high" });
    for (const task of ["roleSort", "roleSortJev"] as const) await ctx.db.insert("aiSettings", { workspaceId: wa, task, model: "typesafe/jev-1.13" });
    await ctx.db.insert("aiDefaults", { workspaceId: wb, model: "vendor/theirs" });
    for (const task of ["extract", "rework"] as const) await ctx.db.insert("aiSettings", { workspaceId: wb, task, model: "vendor/theirs" });
  });
  const before = { a: await asA.query(api.aiSettings.list, {}), b: await asB.query(api.aiSettings.list, {}) };
  expect(await t.mutation(internal.aiSettings.adoptDefault, {})).toEqual({ adopted: 1 });
  const after = { a: await asA.query(api.aiSettings.list, {}), b: await asB.query(api.aiSettings.list, {}) };
  expect(await asA.query(api.aiSettings.defaultChoice, {})).toEqual({ model: "vendor/most", reasoning: "high" });
  // Every task that had a model keeps it; chat tasks that had none now have the default.
  expect(after.a.map((c) => c.choice)).toEqual(before.a.map((c) => c.choice ?? (c.decision ? null : { model: "vendor/most", reasoning: "high" })));
  expect(after.a.filter((c) => c.own).map((c) => c.task).sort()).toEqual(["letter", "resume", "roleSort", "roleSortJev"]);
  expect(after.b).toEqual(before.b);
  expect(await t.mutation(internal.aiSettings.adoptDefault, {})).toEqual({ adopted: 0 });
  expect(await asA.query(api.aiSettings.list, {})).toEqual(after.a);
});

test("with no model chosen, the read fails with a clear message and spends nothing", async () => {
  const { asA, narrativeId, sentModels, read } = await setup();
  await read();
  expect(sentModels()).toEqual([]);
  expect(await asA.query(api.extract.runFor, { narrativeId })).toMatchObject({ status: "failed", error: "Choose a model for reading narratives in settings." });
});

test("model choices belong to one workspace", async () => {
  const { asA, asB } = await setup();
  await asA.mutation(api.aiSettings.setDefault, { model: "vendor/default" });
  await asA.mutation(api.aiSettings.set, { task: "extract", model: "vendor/chosen" });
  const mine = await asA.query(api.aiSettings.list, {});
  const theirs = await asB.query(api.aiSettings.list, {});
  expect(mine.find((x) => x.task === "extract")?.choice).toMatchObject({ model: "vendor/chosen" });
  expect(mine.find((x) => x.task === "rework")?.choice).toMatchObject({ model: "vendor/default" });
  expect(theirs.every((x) => x.choice === null && !x.own)).toBe(true);
  expect(await asB.query(api.aiSettings.defaultChoice, {})).toBeNull();
});

test("recommended models are priced from the catalog on the workspace's own last 30 days of chat tokens", async () => {
  const { t, asA, wa, wb } = await setup();
  await asA.mutation(api.aiSettings.set, { task: "roleSortJev", model: "typesafe/jev-1.13" });
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  await t.run(async (ctx) => {
    const row = { service: "openrouter" as const, purpose: "x", ok: true, inputTokens: 1000, outputTokens: 100 };
    await ctx.db.insert("usage", { ...row, workspaceId: wa, model: "vendor/chat", at: now - day });
    await ctx.db.insert("usage", { ...row, workspaceId: wa, model: "vendor/chat", inputTokens: 500, outputTokens: 50, at: now - 29 * day });
    await ctx.db.insert("usage", { ...row, workspaceId: wa, model: "vendor/chat", at: now - 31 * day });
    await ctx.db.insert("usage", { ...row, workspaceId: wa, model: "typesafe/jev-1.13-20260917", at: now - day });
    await ctx.db.insert("usage", { ...row, workspaceId: wb, model: "vendor/chat", at: now - day });
  });
  vi.stubGlobal("fetch", async () => Response.json({ data: RECOMMENDED.map((m, i) => ({ id: m.id, name: `Model ${i}`, pricing: { prompt: String((i + 1) / 1e6), completion: String((i + 2) / 1e6) } })) }));
  const { usage, models } = await asA.action(api.aiSettings.recommended, {});
  expect(usage).toEqual({ days: 30, inputTokens: 1500, outputTokens: 150 });
  expect(models.map((m) => m.monthlyUsd)).toEqual(RECOMMENDED.map((_, i) => (1500 * (i + 1) + 150 * (i + 2)) / 1e6));
  vi.stubGlobal("fetch", async () => Response.json({ data: [] }));
  expect((await asA.action(api.aiSettings.recommended, {})).models.every((m) => m.price === null && m.monthlyUsd === null)).toBe(true);
});
