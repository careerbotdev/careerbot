import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (o: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
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
  const [a, b] = await t.run(async (ctx) => {
    const ids = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "duplicates", model: "test/model" });
      ids.push({ u, w });
    }
    return ids;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const n1 = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "I rebuilt onboarding." });
  const n2 = await asA.mutation(api.narratives.create, { kind: "note", title: "", body: "Rebuilt the onboarding flow at Acme." });
  const add = (text: string, opts: { status?: "approved" | "proposed"; roleKey?: string; nid?: Id<"narratives">; workspace?: "a" | "b" } = {}) =>
    t.run((ctx) =>
      ctx.db.insert("items", {
        workspaceId: opts.workspace === "b" ? b.w : a.w,
        kind: "fact",
        status: opts.status ?? "approved",
        roleKey: opts.roleKey ?? "acme",
        data: { text },
        sources: [{ narrativeId: opts.nid ?? n1, version: 1, quotes: [text] }],
        at: 0,
      }),
    );
  const find = (groups: string[][]) => {
    const f = vi.fn(async () => reply({ groups: groups.map((ids) => ({ ids })) }));
    vi.stubGlobal("fetch", f);
    return asA.mutation(api.duplicates.start, {}).then(() => t.finishAllScheduledFunctions(vi.runAllTimers)).then(() => f);
  };
  const get = (id: Id<"items">) =>
    t.run(async (ctx) => {
      const i = await ctx.db.get(id);
      if (!i) throw new Error("Gone.");
      return i;
    });
  const flag = async (id: Id<"items">) => {
    const f = await get(id);
    return f.kind === "fact" ? f.data.duplicateOf : undefined;
  };
  return { t, asA, asB, n1, n2, add, find, get, flag };
}

test("only facts in the same role and the same workspace are flagged, the newer one pointing at the approved one", async () => {
  const { add, find, flag } = await setup();
  const a1 = await add("Rebuilt onboarding.");
  const a2 = await add("Rebuilt the onboarding flow.", { status: "proposed" });
  const beta = await add("Rebuilt onboarding at Beta.", { roleKey: "beta" });
  const elsewhere = await add("Rebuilt onboarding.", { workspace: "b" });
  await find([[a2, a1, beta, elsewhere]]);
  expect(await flag(a2)).toBe(a1);
  expect(await flag(a1)).toBeUndefined();
  expect(await flag(beta)).toBeUndefined();
  expect(await flag(elsewhere)).toBeUndefined();
});

test("keep both clears the flag, and a later search never flags that pair again", async () => {
  const { asA, add, find, get, flag } = await setup();
  const a1 = await add("Rebuilt onboarding.");
  const a2 = await add("Rebuilt the onboarding flow.", { status: "proposed" });
  await find([[a1, a2]]);
  await asA.mutation(api.duplicates.keepBoth, { id: a2 });
  expect(await flag(a2)).toBeUndefined();
  expect(await get(a1)).toMatchObject({ data: { keptApart: [a2] } });
  expect(await get(a2)).toMatchObject({ data: { keptApart: [a1] } });
  const f = await find([[a1, a2]]);
  expect(f).toHaveBeenCalledTimes(1);
  expect(await flag(a1)).toBeUndefined();
  expect(await flag(a2)).toBeUndefined();
});

test("merging keeps the chosen wording approved, gathers the other's sources, history and notes, and supersedes it", async () => {
  const { t, asA, asB, n2, add, find, get, flag } = await setup();
  const a1 = await add("Rebuilt onboarding.");
  const a2 = await add("Rebuilt the onboarding flow and cut churn 20%.", { status: "proposed", nid: n2 });
  const a3 = await add("Redid onboarding.", { status: "proposed" });
  await find([[a1, a2, a3]]);
  expect(await flag(a2)).toBe(a1);
  expect(await flag(a3)).toBe(a1);
  const note = await t.run(async (ctx) => {
    const f = await ctx.db.get(a1);
    return ctx.db.insert("items", { workspaceId: f!.workspaceId, kind: "context", status: "approved", roleKey: "acme", data: { text: "Team of three.", factId: a1 }, sources: [], at: 0 });
  });

  await expect(asB.mutation(api.duplicates.merge, { id: a2, keep: "this" })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.duplicates.keepBoth, { id: a2 })).rejects.toThrow("Not found");
  expect(await flag(a2)).toBe(a1);

  // Keep a2's wording: a2 stays (approved), a1 is merged into it.
  await asA.mutation(api.duplicates.merge, { id: a2, keep: "this" });
  const kept = await get(a2);
  const removed = await get(a1);
  expect(kept.status).toBe("approved");
  expect(kept.data).toMatchObject({ text: "Rebuilt the onboarding flow and cut churn 20%." });
  expect(kept.kind === "fact" && kept.data.duplicateOf).toBeFalsy();
  expect(kept.sources.map((s) => s.quotes[0])).toEqual(["Rebuilt the onboarding flow and cut churn 20%.", "Rebuilt onboarding."]);
  expect(kept.kind === "fact" && kept.data.history?.map((h) => [h.how, h.text])).toEqual([
    ["read", "Rebuilt the onboarding flow and cut churn 20%."],
    ["read", "Rebuilt onboarding."],
    ["merged", "Rebuilt the onboarding flow and cut churn 20%."],
  ]);
  expect(removed).toMatchObject({ status: "superseded", data: { mergedInto: a2 } });
  expect(await get(note)).toMatchObject({ data: { factId: a2 } });
  // A fact flagged against the removed one now points at the one kept.
  expect(await flag(a3)).toBe(a2);
  expect((await asA.query(api.extract.items, {})).map((i) => i.id)).not.toContain(a1);
});

test("merging rebinds insights, follow-ups and saved resumes to the kept fact", async () => {
  const t = convexTest(schema, modules);
  const r = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "m@example.com" });
    const w = await ensureWorkspace(ctx, u);
    const fact = (text: string) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text }, sources: [], at: 0 });
    const keep = await fact("Cut churn by 20%.");
    const dupe = await fact("Reduced churn 20%.");
    await ctx.db.patch(dupe, { data: { text: "Reduced churn 20%.", duplicateOf: keep } });
    const insight = await ctx.db.insert("items", { workspaceId: w, kind: "insight", status: "approved", data: { text: "You fix retention.", factIds: [dupe, keep] }, sources: [], at: 0 });
    const followup = await ctx.db.insert("items", { workspaceId: w, kind: "followup", status: "proposed", data: { question: "How?", why: "", factId: dupe }, sources: [], at: 0 });
    const resume = await ctx.db.insert("resumes", { workspaceId: w, basedOn: { roles: 1, facts: 2, insights: 1 }, model: "m", at: 0, doc: { summary: "S", experience: [{ employer: "Acme", title: "Head", roleKey: "acme", bullets: [{ text: "Churn", factIds: [dupe] }] }], skills: [] } });
    return { u, keep, dupe, insight, followup, resume };
  });
  const as = t.withIdentity({ subject: `${r.u}|s` });
  await as.mutation(api.duplicates.merge, { id: r.dupe, keep: "other" });
  await t.run(async (ctx) => {
    const i = (await ctx.db.get(r.insight))!;
    const q = (await ctx.db.get(r.followup))!;
    const res = (await ctx.db.get(r.resume))!;
    expect(i.kind === "insight" && i.data.factIds).toEqual([r.keep]);
    expect(q.kind === "followup" && q.data.factId).toBe(r.keep);
    expect(res.doc!.experience[0].bullets[0].factIds).toEqual([r.keep]);
  });
});
