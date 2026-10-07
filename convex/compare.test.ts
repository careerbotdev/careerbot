import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (content: unknown) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.002 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

// Two workspaces with keys and budgets; A has a story and an approved record of two roles with a fact each.
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
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const narrativeId = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "I ran customer success at Acme and cut churn by a fifth." });
  const facts = await t.run(async (ctx) => {
    for (const [roleKey, employer] of [["acme", "Acme"], ["globex", "Globex"]])
      await ctx.db.insert("items", { workspaceId: a.w, kind: "role", status: "approved", roleKey, data: { employer, title: "Lead", start: "2020-01" }, sources: [], at: 0 });
    return [
      await ctx.db.insert("items", { workspaceId: a.w, kind: "fact", status: "approved", roleKey: "acme", data: { text: "Cut churn by 20%." }, sources: [], at: 0 }),
      await ctx.db.insert("items", { workspaceId: a.w, kind: "fact", status: "approved", roleKey: "globex", data: { text: "Ran 40 implementations." }, sources: [], at: 0 }),
    ];
  });
  // Everything a comparison could touch in the record and resumes.
  const stored = () => t.run(async (ctx) => ({ items: await ctx.db.query("items").collect(), resumes: await ctx.db.query("resumes").collect() }));
  // Runs what's scheduled with every model replying `content`; returns the models asked.
  const settle = async (content: unknown) => {
    const f = vi.fn(async () => reply(content));
    vi.stubGlobal("fetch", f);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body)).map((body) => [body.model, body.reasoning?.effort]);
  };
  return { t, asA, asB, narrativeId, facts, stored, settle };
}

test("a comparison of any task runs each model and keeps its output, cost and time on the comparison, never in the record or resumes", async () => {
  const { t, asA, narrativeId, facts, stored, settle } = await setup();
  const before = await stored();
  const contenders = [{ model: "vendor/one" }, { model: "vendor/two", reasoning: "low" as const }];

  const read = await asA.mutation(api.compare.start, { task: "extract", narrativeId, contenders });
  expect((await settle({ facts: [{ roleKey: "x", text: "Did a thing" }] })).sort()).toEqual([["vendor/one", undefined], ["vendor/two", "low"]]);
  const resume = await asA.mutation(api.compare.start, { task: "resume", contenders });
  await settle({ summary: "Operator.", experience: [{ roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [facts[0]] }] }], skills: [] });
  const insights = await asA.mutation(api.compare.start, { task: "insights", contenders });
  await settle({ insights: [{ text: "You keep customers.", factIds: [facts[0], facts[1]] }, { text: "Rests on nothing approved.", factIds: ["nope"] }] });

  expect((await asA.query(api.compare.get, { id: read }))?.contenders).toMatchObject([
    { model: "vendor/one", status: "done", costUsd: 0.002, inputTokens: 1200, outputTokens: 300, output: { facts: [{ text: "Did a thing" }] } },
    { model: "vendor/two", reasoning: "low", status: "done" },
  ]);
  expect((await asA.query(api.compare.get, { id: resume }))?.contenders[0]).toMatchObject({ status: "done", output: { doc: { summary: "Operator.", experience: [{ employer: "Acme", bullets: [{ text: "Cut churn by 20%." }] }] } } });
  // An insight resting on no approved fact is dropped, as when insights are saved.
  expect((await asA.query(api.compare.get, { id: insights }))?.contenders[1]).toMatchObject({
    status: "done",
    output: { insights: [{ text: "You keep customers.", facts: ["Cut churn by 20%.", "Ran 40 implementations."] }] },
  });
  expect((await asA.query(api.compare.list, {})).map((c) => c.task)).toEqual(["insights", "resume", "extract"]);

  expect(await stored()).toEqual(before);
  const usage = await t.run((ctx) => ctx.db.query("usage").collect());
  expect(usage.map((u) => u.purpose)).toEqual(Array(6).fill("compare"));
  // The next estimate goes by what these runs read and wrote.
  expect(await asA.query(api.compare.estimate, { task: "resume" })).toEqual({ inputTokens: 1200, outputTokens: 300 });
});

test("comparisons belong to one workspace: another can't see, run on or estimate from them", async () => {
  const { asA, asB, narrativeId, settle } = await setup();
  const id = await asA.mutation(api.compare.start, { task: "extract", narrativeId, contenders: [{ model: "vendor/one" }] });
  await settle({ facts: [] });
  expect(await asB.query(api.compare.get, { id })).toBeNull();
  expect(await asB.query(api.compare.list, {})).toEqual([]);
  expect(await asB.query(api.compare.estimate, { task: "extract", narrativeId })).toBeNull();
  await expect(asB.mutation(api.compare.start, { task: "extract", narrativeId, contenders: [{ model: "vendor/one" }] })).rejects.toThrow("Choose a story to read");
  // A's approved record doesn't count for B, so B has nothing to write a resume from or connect.
  await expect(asB.mutation(api.compare.start, { task: "resume", contenders: [{ model: "vendor/one" }] })).rejects.toThrow("Approve some facts first");
  await expect(asB.mutation(api.compare.start, { task: "insights", contenders: [{ model: "vendor/one" }] })).rejects.toThrow("Approve at least two facts");
  expect(await asB.query(api.compare.list, {})).toEqual([]);
});

test("a comparison takes one to four models", async () => {
  const { asA } = await setup();
  await expect(asA.mutation(api.compare.start, { task: "resume", contenders: [{ model: " " }] })).rejects.toThrow("Choose at least one model");
  await expect(asA.mutation(api.compare.start, { task: "resume", contenders: ["a", "b", "c", "d", "e"].map((m) => ({ model: `vendor/${m}` })) })).rejects.toThrow("up to 4");
  expect(await asA.query(api.compare.list, {})).toEqual([]);
});
