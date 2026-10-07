import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "a@example.com" });
    const b = await ctx.db.insert("users", { email: "b@example.com" });
    await ensureWorkspace(ctx, a);
    await ensureWorkspace(ctx, b);
    return [a, b];
  });
  return { t, asA: t.withIdentity({ subject: `${a}|s` }), asB: t.withIdentity({ subject: `${b}|s` }) };
}

test("narratives can be created in any order and edited, keeping every version", async () => {
  const { asA } = await setup();
  const later = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme (2021–now)", body: "v1" });
  await asA.mutation(api.narratives.create, { kind: "career", title: "First job", body: "early" });
  await asA.mutation(api.narratives.save, { id: later, title: "Acme (2021–now)", body: "v2" });
  const n = await asA.query(api.narratives.get, { id: later });
  expect(n).toMatchObject({ body: "v2", version: 2 });
  expect(n?.versions.map((x) => x.body)).toEqual(["v2", "v1"]);
  expect(await asA.query(api.narratives.list, {})).toHaveLength(2);
});

test("saving without changes doesn't add a version", async () => {
  const { asA } = await setup();
  const id = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "same" });
  await asA.mutation(api.narratives.save, { id, title: "Acme", body: "same" });
  expect((await asA.query(api.narratives.get, { id }))?.versions).toHaveLength(1);
});

test("restoring an old version adds it as the newest, without losing history", async () => {
  const { asA } = await setup();
  const id = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "original" });
  await asA.mutation(api.narratives.save, { id, title: "Acme", body: "rewrite" });
  await asA.mutation(api.narratives.restore, { id, version: 1 });
  const n = await asA.query(api.narratives.get, { id });
  expect(n).toMatchObject({ body: "original", version: 3 });
  expect(n?.versions.map((x) => x.body)).toEqual(["original", "rewrite", "original"]);
});

test("there is only ever one goals narrative", async () => {
  const { asA, asB } = await setup();
  await asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "sales" });
  await expect(asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "again" })).rejects.toThrow("already a goals");
  await expect(asB.mutation(api.narratives.create, { kind: "goals", title: "", body: "mine" })).resolves.toBeDefined();
});

test("another workspace can't read, edit or restore a narrative", async () => {
  const { asA, asB } = await setup();
  const id = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "private" });
  expect(await asB.query(api.narratives.get, { id })).toBeNull();
  expect(await asB.query(api.narratives.list, {})).toHaveLength(0);
  await expect(asB.mutation(api.narratives.save, { id, title: "x", body: "x" })).rejects.toThrow("not found");
  await expect(asB.mutation(api.narratives.restore, { id, version: 1 })).rejects.toThrow("not found");
});

test("an empty first version isn't listed", async () => {
  const { asA } = await setup();
  const id = await asA.mutation(api.narratives.create, { kind: "career", title: "", body: "" });
  await asA.mutation(api.narratives.save, { id, title: "Acme", body: "wrote something" });
  expect((await asA.query(api.narratives.get, { id }))?.versions.map((x) => x.version)).toEqual([2]);
});

test("deleting a narrative keeps its facts, flagged, and only works in your workspace", async () => {
  const { t, asA, asB } = await setup();
  const id = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "x" });
  const factId = await t.run(async (ctx) => {
    const w = (await ctx.db.query("narratives").first())!.workspaceId;
    await ctx.db.insert("items", { workspaceId: w, kind: "context", status: "approved", data: { text: "bg" }, sources: [{ narrativeId: id, version: 1, quotes: [] }], at: 0 });
    const f = await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", data: { text: "Did it" }, sources: [{ narrativeId: id, version: 1, quotes: [] }], at: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "context", status: "approved", data: { text: "my note", factId: f }, sources: [{ narrativeId: id, version: 1, quotes: [] }], at: 0 });
    return f;
  });
  await expect(asB.mutation(api.narratives.remove, { id })).rejects.toThrow("not found");
  await asA.mutation(api.notes.add, { subject: { kind: "narrative", id }, text: "Ask Dana" });
  await asA.mutation(api.narratives.remove, { id });
  expect(await asA.query(api.narratives.list, {})).toHaveLength(0);
  // Its notes go with it.
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toEqual([]);
  const items = await t.run((ctx) => ctx.db.query("items").collect());
  expect(items.map((i) => (i.kind === "fact" || i.kind === "context" ? i.data.text : i.kind)).sort()).toEqual(["Did it", "my note"]);
  expect(items.find((i) => i._id === factId)).toMatchObject({ status: "approved", data: { sourceDeleted: "Acme" } });
});

test("deleting a story takes its passages out of every item; what the person approved stays, unreviewed facts wait flagged", async () => {
  const { t, asA } = await setup();
  const acme = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "At Acme I rebuilt onboarding and cut churn." });
  const beta = await asA.mutation(api.narratives.create, { kind: "career", title: "Beta", body: "I rebuilt onboarding at Acme." });
  const said = (narrativeId: typeof acme, quote: string) => ({ narrativeId, version: 1, quotes: [quote] });
  const ids = await t.run(async (ctx) => {
    const workspaceId = (await ctx.db.get(acme))!.workspaceId;
    const add = (status: "approved" | "proposed" | "rejected", text: string, sources: Doc<"items">["sources"]) =>
      ctx.db.insert("items", { workspaceId, kind: "fact", status, roleKey: "acme", data: { text }, sources, at: 0 });
    const both = await add("approved", "Rebuilt onboarding.", [said(acme, "rebuilt onboarding"), said(beta, "rebuilt onboarding at Acme")]);
    const approved = await add("approved", "Cut churn.", [said(acme, "cut churn")]);
    const proposed = await add("proposed", "Ran Acme.", [said(acme, "At Acme")]);
    const rejected = await add("rejected", "Owned churn.", [said(acme, "cut churn")]);
    // Derivatives carry their facts' sources: an insight and a question.
    const insight = await ctx.db.insert("items", { workspaceId, kind: "insight", status: "approved", data: { text: "You fix onboarding.", factIds: [both] }, sources: [said(acme, "rebuilt onboarding")], at: 0 });
    const question = await ctx.db.insert("items", { workspaceId, kind: "followup", status: "proposed", data: { question: "How much churn?", why: "A number", factId: approved }, sources: [said(acme, "cut churn")], at: 0 });
    const output = { facts: [{ roleKey: "acme", text: "Cut churn.", quotes: ["cut churn"] }] };
    const contender = { model: "test/model", status: "done" as const, output };
    await ctx.db.insert("comparisons", { workspaceId, task: "extract", narrativeId: acme, narrativeTitle: "Acme", narrativeVersion: 1, contenders: [contender], at: 0 });
    const kept = await ctx.db.insert("comparisons", { workspaceId, task: "extract", narrativeId: beta, narrativeTitle: "Beta", narrativeVersion: 1, contenders: [contender], at: 0 });
    return { both, approved, proposed, rejected, insight, question, kept };
  });
  await asA.mutation(api.narratives.remove, { id: acme });
  const items = await t.run((ctx) => ctx.db.query("items").collect());
  // No item still cites the story or holds its words.
  expect(items.flatMap((i) => i.sources).filter((s) => s.narrativeId === acme)).toEqual([]);
  expect(items.flatMap((i) => i.sources.flatMap((s) => s.quotes))).toEqual(["rebuilt onboarding at Acme"]);
  const get = (id: string) => items.find((i) => i._id === id)!;
  expect(get(ids.both)).toMatchObject({ status: "approved", sources: [said(beta, "rebuilt onboarding at Acme")], data: { sourceDeleted: "Acme" } });
  // A fact the story alone stood behind stays as the person left it, flagged so they decide; approved, it still counts.
  expect(get(ids.approved)).toMatchObject({ status: "approved", sources: [], data: { sourceDeleted: "Acme" } });
  expect(get(ids.proposed)).toMatchObject({ status: "proposed", sources: [], data: { sourceDeleted: "Acme" } });
  expect(get(ids.rejected)).toMatchObject({ status: "rejected", sources: [] });
  expect((await asA.query(api.extract.items, {})).find((i) => i.id === ids.approved)?.counts).toBe(true);
  expect(get(ids.insight)).toMatchObject({ status: "approved", sources: [] });
  expect(get(ids.question)).toMatchObject({ status: "proposed", sources: [] });
  // A comparison that read the story goes with it; one that read another story stays.
  expect((await t.run((ctx) => ctx.db.query("comparisons").collect())).map((c) => c._id)).toEqual([ids.kept]);
});

test("a story links to a role in the record, or to none; only in your workspace", async () => {
  const { t, asA, asB } = await setup();
  const id = await asA.mutation(api.narratives.create, { kind: "note", title: "One more thing", body: "x" });
  await t.run(async (ctx) => {
    const w = (await ctx.db.query("narratives").first())!.workspaceId;
    await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "bw", data: { key: "bw", title: "Supply Planning Manager", employer: "Brightwater" }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "rejected", roleKey: "gone", data: { key: "gone", title: "Intern" }, sources: [], at: 0 });
  });
  await asA.mutation(api.narratives.link, { id, roleKey: "bw" });
  expect(await asA.query(api.narratives.get, { id })).toMatchObject({ roleKey: "bw" });
  expect((await asA.query(api.narratives.list, {}))[0]).toMatchObject({ roleKey: "bw", words: 1 });
  await expect(asA.mutation(api.narratives.link, { id, roleKey: "gone" })).rejects.toThrow("isn’t in your record");
  await expect(asB.mutation(api.narratives.link, { id, roleKey: "bw" })).rejects.toThrow("Not found");
  await asA.mutation(api.narratives.link, { id, roleKey: null });
  expect(await asA.query(api.narratives.get, { id })).toMatchObject({ roleKey: null });
});
