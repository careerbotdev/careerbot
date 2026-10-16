import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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
  await expect(asB.mutation(api.narratives.remove, { id, unreviewed: true, approved: false })).rejects.toThrow("not found");
  await asA.mutation(api.notes.add, { subject: { kind: "narrative", id }, text: "Ask Dana" });
  await asA.mutation(api.narratives.remove, { id, unreviewed: true, approved: false });
  expect(await asA.query(api.narratives.list, {})).toHaveLength(0);
  // Its notes go with it.
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toEqual([]);
  const items = await t.run((ctx) => ctx.db.query("items").collect());
  expect(items.map((i) => (i.kind === "fact" || i.kind === "context" ? i.data.text : i.kind)).sort()).toEqual(["Did it", "my note"]);
  expect(items.find((i) => i._id === factId)).toMatchObject({ status: "approved", data: { sourceDeleted: "Acme" } });
});

test("deleting a story takes its passages out of every item; what the person approved stays, unreviewed facts wait flagged, rejections resting on it alone go", async () => {
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
    await ctx.db.patch(rejected, { data: { text: "Owned churn.", rejectedBecause: "Not mine" } });
    await ctx.db.insert("notes", { workspaceId, subject: { kind: "item", id: rejected }, text: "why", at: 0 });
    const rejectedShared = await add("rejected", "Led onboarding.", [said(acme, "rebuilt onboarding"), said(beta, "rebuilt onboarding at Acme")]);
    // Derivatives carry their facts' sources: an insight and a question.
    const insight = await ctx.db.insert("items", { workspaceId, kind: "insight", status: "approved", data: { text: "You fix onboarding.", factIds: [both] }, sources: [said(acme, "rebuilt onboarding")], at: 0 });
    const question = await ctx.db.insert("items", { workspaceId, kind: "followup", status: "proposed", data: { question: "How much churn?", why: "A number", factId: approved }, sources: [said(acme, "cut churn")], at: 0 });
    const output = { facts: [{ roleKey: "acme", text: "Cut churn.", quotes: ["cut churn"] }] };
    const contender = { model: "test/model", status: "done" as const, output };
    await ctx.db.insert("comparisons", { workspaceId, task: "extract", narrativeId: acme, narrativeTitle: "Acme", narrativeVersion: 1, contenders: [contender], at: 0 });
    const kept = await ctx.db.insert("comparisons", { workspaceId, task: "extract", narrativeId: beta, narrativeTitle: "Beta", narrativeVersion: 1, contenders: [contender], at: 0 });
    return { workspaceId, both, approved, proposed, rejected, rejectedShared, insight, question, kept };
  });
  const guard = async () => (await t.query(internal.extract.inputs, { workspaceId: ids.workspaceId, narrativeId: beta })).rejected.map((r) => r.text);
  expect(await guard()).toEqual(["Owned churn.", "Led onboarding."]);
  // Keeping everything that came from it.
  await asA.mutation(api.narratives.remove, { id: acme, unreviewed: false, approved: false });
  const items = await t.run((ctx) => ctx.db.query("items").collect());
  // No item still cites the story or holds its words.
  expect(items.flatMap((i) => i.sources).filter((s) => s.narrativeId === acme)).toEqual([]);
  expect(items.flatMap((i) => i.sources.flatMap((s) => s.quotes))).toEqual(["rebuilt onboarding at Acme", "rebuilt onboarding at Acme"]);
  const get = (id: string) => items.find((i) => i._id === id)!;
  expect(get(ids.both)).toMatchObject({ status: "approved", sources: [said(beta, "rebuilt onboarding at Acme")], data: { sourceDeleted: "Acme" } });
  // A fact the story alone stood behind stays as the person left it, flagged so they decide; approved, it still counts.
  expect(get(ids.approved)).toMatchObject({ status: "approved", sources: [], data: { sourceDeleted: "Acme" } });
  expect(get(ids.proposed)).toMatchObject({ status: "proposed", sources: [], data: { sourceDeleted: "Acme" } });
  // A rejection it alone stood behind goes anyway, with its reason and note, so it no longer steers a read; a shared one
  // stays rejected and just loses this story's passage.
  expect(items.find((i) => i._id === ids.rejected)).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toEqual([]);
  expect(get(ids.rejectedShared)).toMatchObject({ status: "rejected", sources: [said(beta, "rebuilt onboarding at Acme")] });
  expect(await guard()).toEqual(["Led onboarding."]);
  expect((await asA.query(api.extract.items, {})).find((i) => i.id === ids.approved)?.counts).toBe(true);
  expect(get(ids.insight)).toMatchObject({ status: "approved", sources: [] });
  expect(get(ids.question)).toMatchObject({ status: "proposed", sources: [] });
  // A comparison that read the story goes with it; one that read another story stays.
  expect((await t.run((ctx) => ctx.db.query("comparisons").collect())).map((c) => c._id)).toEqual([ids.kept]);
});

// Deleting a story with what came from it: only what this story alone backs counts and goes. A fact another story or
// an approved project also backs stays and just loses this story's passages.
async function provenance() {
  const { t, asA } = await setup();
  const acme = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "a" });
  const side = await asA.mutation(api.narratives.create, { kind: "career", title: "Side", body: "b" });
  const from = (...ns: (typeof acme)[]) => ns.map((narrativeId) => ({ narrativeId, version: 1, quotes: [] }));
  const ids = await t.run(async (ctx) => {
    const workspaceId = (await ctx.db.get(acme))!.workspaceId;
    const fact = (status: "approved" | "proposed" | "rejected", text: string, sources: Doc<"items">["sources"], more: { roleKey?: string; projectKey?: string } = {}) =>
      ctx.db.insert("items", { workspaceId, kind: "fact", status, roleKey: "acme", ...more, data: { text }, sources, at: 0 });
    const role = await ctx.db.insert("items", { workspaceId, kind: "role", status: "approved", roleKey: "acme", data: { key: "acme", title: "Analyst", employer: "Acme" }, sources: from(acme), at: 0 });
    const sharedRole = await ctx.db.insert("items", { workspaceId, kind: "role", status: "approved", roleKey: "bc", data: { key: "bc", title: "Operations Lead", employer: "Brightwater Provisions" }, sources: from(acme, side), at: 0 });
    await ctx.db.insert("items", { workspaceId, kind: "project", status: "approved", projectKey: "tool", data: { name: "ZIP tool", repo: "a/tool", url: "u" }, sources: [], at: 0 });
    const waiting = await fact("proposed", "Waiting.", from(acme));
    const waitingShared = await fact("proposed", "Waiting, also Side.", from(acme, side), { roleKey: "bc" });
    const approved = await fact("approved", "Approved.", from(acme));
    const inResume = await fact("approved", "In a resume.", from(acme));
    const approvedShared = await fact("approved", "Approved, also Side.", from(acme, side), { roleKey: "bc" });
    const projectBacked = await fact("approved", "Approved, also the project.", from(acme), { roleKey: "bc", projectKey: "tool" });
    const rejected = await fact("rejected", "Rejected.", from(acme));
    const note = await ctx.db.insert("items", { workspaceId, kind: "context", status: "approved", roleKey: "acme", data: { text: "my note", factId: approved }, sources: [], at: 0 });
    const question = await ctx.db.insert("items", { workspaceId, kind: "followup", status: "proposed", data: { question: "How many?", why: "A number", factId: waiting }, sources: from(acme), at: 0 });
    const questionOnKept = await ctx.db.insert("items", { workspaceId, kind: "followup", status: "proposed", data: { question: "Which?", why: "Names", factId: approved }, sources: from(acme), at: 0 });
    const insight = await ctx.db.insert("items", { workspaceId, kind: "insight", status: "proposed", data: { text: "You wait.", factIds: [waiting] }, sources: from(acme), at: 0 });
    const bullet = { text: "Did it.", factIds: [inResume] };
    await ctx.db.insert("resumes", { workspaceId, doc: { summary: "", experience: [{ roleKey: "acme", employer: "Acme", title: "Analyst", bullets: [bullet] }], skills: [] }, model: "m", at: 1 });
    return { role, sharedRole, waiting, waitingShared, approved, inResume, approvedShared, projectBacked, rejected, note, question, questionOnKept, insight };
  });
  const left = async () => new Set((await t.run((ctx) => ctx.db.query("items").collect())).map((i) => String(i._id)));
  return { t, asA, acme, side, ids, left };
}

test("what deleting a story would take: counts only what it alone backs, and names what stays", async () => {
  const { asA, acme } = await provenance();
  expect(await asA.query(api.narratives.removal, { id: acme })).toEqual({
    versions: 1,
    notes: 0,
    unreviewed: { facts: 1, roles: 0, insights: 1, questions: 1 },
    // The question on an approved fact goes only with that fact.
    approved: { facts: 2, roles: 1, insights: 0, questions: 1 },
    inResumes: 1,
    // The rejected fact it alone backs goes whatever they tick.
    rejected: 1,
    stays: { facts: 3, roles: ["Operations Lead"], by: ["Side story"], project: true },
  });
});

test("deleting a story as offered: what's waiting goes, what's approved stays, and shared items only lose its passages", async () => {
  const { t, asA, side, acme, ids, left } = await provenance();
  expect(await asA.mutation(api.narratives.remove, { id: acme, unreviewed: true, approved: false })).toEqual({ facts: 1 });
  const kept = await left();
  for (const gone of [ids.waiting, ids.question, ids.insight, ids.rejected]) expect(kept.has(gone)).toBe(false);
  for (const stays of [ids.role, ids.sharedRole, ids.waitingShared, ids.approved, ids.inResume, ids.approvedShared, ids.projectBacked, ids.note, ids.questionOnKept]) expect(kept.has(stays)).toBe(true);
  const items = await t.run((ctx) => ctx.db.query("items").collect());
  expect(items.flatMap((i) => i.sources).every((s) => s.narrativeId === side)).toBe(true);
  expect(items.find((i) => i._id === ids.approvedShared)).toMatchObject({ status: "approved", sources: [{ narrativeId: side }] });
  expect(items.find((i) => i._id === ids.approved)).toMatchObject({ status: "approved", data: { sourceDeleted: "Acme" } });
});

test("deleting a story with its approved facts too: its own role goes once nothing rests on it; shared and project-backed ones stay", async () => {
  const { asA, acme, ids, left } = await provenance();
  expect(await asA.mutation(api.narratives.remove, { id: acme, unreviewed: true, approved: true })).toEqual({ facts: 3 });
  const kept = await left();
  for (const gone of [ids.waiting, ids.approved, ids.inResume, ids.note, ids.question, ids.questionOnKept, ids.insight, ids.role, ids.rejected]) expect(kept.has(gone)).toBe(false);
  for (const stays of [ids.sharedRole, ids.waitingShared, ids.approvedShared, ids.projectBacked]) expect(kept.has(stays)).toBe(true);
});

test("deleting a story's approved facts but keeping what's waiting keeps its role, which those still rest on", async () => {
  const { asA, acme, ids, left } = await provenance();
  expect(await asA.mutation(api.narratives.remove, { id: acme, unreviewed: false, approved: true })).toEqual({ facts: 2 });
  const kept = await left();
  for (const gone of [ids.approved, ids.inResume, ids.note]) expect(kept.has(gone)).toBe(false);
  for (const stays of [ids.role, ids.waiting, ids.question, ids.insight, ids.questionOnKept]) expect(kept.has(stays)).toBe(true);
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
