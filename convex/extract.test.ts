import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const modelReply = (content: string) =>
  Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "44".repeat(32);
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
      for (const task of ["extract", "rework"] as const) await ctx.db.insert("aiSettings", { workspaceId: w, task, model: "test/model" });
      ids.push(u);
    }
    return ids;
  });
  const asA = t.withIdentity({ subject: `${a}|s` });
  const asB = t.withIdentity({ subject: `${b}|s` });
  const narrativeId = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "I rebuilt onboarding at Acme." });
  const run = async () => {
    await asA.mutation(api.extract.start, { narrativeId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return asA.query(api.jobs.latest, {});
  };
  return { t, asA, asB, narrativeId, run };
}

test("extraction stores roles and facts as proposals, context as background, each tied to its narrative version", async () => {
  const { asA, narrativeId, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({
    roles: [{ key: "acme-cs", employer: "Acme", title: "Head of CS", quotes: ["at Acme"] }],
    facts: [{ roleKey: "acme-cs", text: "Rebuilt customer onboarding", quotes: ["rebuilt onboarding"] }],
    context: [{ roleKey: "acme-cs", text: "Onboarding had no owner", quotes: [] }],
  }))));
  expect(await run()).toMatchObject({ status: "done", result: { roles: 1, facts: 1, context: 1 } });
  const items = await asA.query(api.extract.items, {});
  expect(items.map((i) => [i.kind, i.status]).sort()).toEqual([["context", "approved"], ["fact", "proposed"], ["role", "proposed"]]);
  expect(items.find((i) => i.kind === "fact")?.sources).toEqual([{ narrativeId, version: 1, quotes: ["rebuilt onboarding"] }]);
});

test("an unreadable model reply fails the job without storing anything", async () => {
  const { asA, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply("not json")));
  expect(await run()).toMatchObject({ status: "failed" });
  expect(await asA.query(api.extract.items, {})).toHaveLength(0);
});

test("proposals are private to their workspace and can only be reviewed there", async () => {
  const { asA, asB, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  const [fact] = await asA.query(api.extract.items, {});
  expect(await asB.query(api.extract.items, {})).toHaveLength(0);
  await expect(asB.mutation(api.extract.review, { id: fact.id, status: "approved" })).rejects.toThrow("Not found");
  await asA.mutation(api.extract.review, { id: fact.id, status: "approved" });
  expect((await asA.query(api.extract.items, {}))[0].status).toBe("approved");
});

test("another workspace can't start extraction on your narrative", async () => {
  const { asB, narrativeId } = await setup();
  await expect(asB.mutation(api.extract.start, { narrativeId })).rejects.toThrow("not found");
});

test("reading the same version twice is refused; a new version can be read", async () => {
  const { asA, narrativeId, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  await expect(asA.mutation(api.extract.start, { narrativeId })).rejects.toThrow("already been read");
  await asA.mutation(api.narratives.save, { id: narrativeId, title: "Acme", body: "more detail" });
  expect(await run()).toMatchObject({ status: "done" });
});

test("goals narratives aren't read as career narratives", async () => {
  const { asA } = await setup();
  const goals = await asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "sales" });
  await expect(asA.mutation(api.extract.start, { narrativeId: goals })).rejects.toThrow("Read my goals");
});

test("an edit is approved as written", async () => {
  const { asA, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  const [fact] = await asA.query(api.extract.items, {});
  await asA.mutation(api.extract.edit, { id: fact.id, text: "Cut churn 18% by rebuilding onboarding" });
  expect((await asA.query(api.extract.items, {}))[0]).toMatchObject({ status: "approved", data: { text: "Cut churn 18% by rebuilding onboarding" } });
});

test("a rewrite waits on the same fact as a suggestion; accepting it keeps one fact with its history", async () => {
  const { t, asA, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  const [fact] = await asA.query(api.extract.items, {});
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ text: "Led a team of three to do the thing", quotes: [], keptAsContext: ["Cut setup time 83%"] }))));
  await asA.mutation(api.extract.rework, { id: fact.id, note: "team of three, I led it" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const kept = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "context");
  expect(kept.map((c) => [c.data.from, c.data.text, c.data.factId]).sort()).toEqual([
    ["left out of the line", "Cut setup time 83%", fact.id],
    ["your note", "team of three, I led it", fact.id],
  ]);
  let items = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact");
  expect(items).toHaveLength(1);
  expect(items[0].data).toMatchObject({ text: "Did a thing", suggestion: { text: "Led a team of three to do the thing", note: "team of three, I led it" } });
  await asA.mutation(api.extract.acceptSuggestion, { id: fact.id });
  items = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact");
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ status: "approved", data: { text: "Led a team of three to do the thing", suggestion: null } });
  expect(items[0].data.history?.map((h) => [h.how, h.text])).toEqual([["read", "Did a thing"], ["rewrite", "Led a team of three to do the thing"]]);
});

test("dismissing a suggestion leaves the fact as it was", async () => {
  const { t, asA, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  const [fact] = await asA.query(api.extract.items, {});
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ text: "Worse", quotes: [] }))));
  await asA.mutation(api.extract.rework, { id: fact.id, note: "" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await asA.mutation(api.extract.dismissSuggestion, { id: fact.id });
  const kept = (await asA.query(api.extract.items, {})).find((i) => i.kind === "fact")!;
  expect(kept.data).toMatchObject({ text: "Did a thing", suggestion: null });
  expect(kept.data.history?.map((h) => [h.how, h.text])).toEqual([["read", "Did a thing"], ["dismissed", "Worse"]]);
});
test("two narratives can be read at the same time", async () => {
  const { t, asA, narrativeId } = await setup();
  const other = await asA.mutation(api.narratives.create, { kind: "career", title: "Globex", body: "Ran sales at Globex." });
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await asA.mutation(api.extract.start, { narrativeId });
  await asA.mutation(api.extract.start, { narrativeId: other });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await asA.query(api.extract.runFor, { narrativeId })).toMatchObject({ status: "done" });
  expect(await asA.query(api.extract.runFor, { narrativeId: other })).toMatchObject({ status: "done" });
});

test("role corrections are approved as given and stay in their workspace", async () => {
  const { asA, asB, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ roles: [{ key: "acme", employer: "Acme", title: "Manager (formal: Vendor Mgr)" }] }))));
  await run();
  const [role] = await asA.query(api.extract.items, {});
  await expect(asB.mutation(api.extract.editRole, { id: role.id, title: "x" })).rejects.toThrow("Not found");
  await asA.mutation(api.extract.editRole, { id: role.id, title: "Vendor and Marketing Manager", alternateTitles: [" Marketing Operations Manager ", ""], end: "" });
  expect((await asA.query(api.extract.items, {}))[0]).toMatchObject({
    status: "approved",
    data: { employer: "Acme", title: "Vendor and Marketing Manager", alternateTitles: ["Marketing Operations Manager"], end: null },
  });
});

test("a role's promotion label can be corrected or cleared", async () => {
  const { asA, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ roles: [{ key: "acme2", employer: "Acme", title: "Director", change: "transition" }] }))));
  await run();
  const [role] = await asA.query(api.extract.items, {});
  await asA.mutation(api.extract.editRole, { id: role.id, change: "promotion" });
  expect((await asA.query(api.extract.items, {})).find((i) => i.kind === "role")?.data.change).toBe("promotion");
  await asA.mutation(api.extract.editRole, { id: role.id, change: "none" });
  expect((await asA.query(api.extract.items, {})).find((i) => i.kind === "role")?.data.change).toBeNull();
});

test("accepting a rewrite doesn't move the fact among its siblings", async () => {
  const { t, asA, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: ["one", "two", "three"].map((text) => ({ roleKey: "x", text })) }))));
  await run();
  const order = async () => (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact").map((i) => i.id);
  const before = await order();
  await asA.mutation(api.extract.review, { id: before[2], status: "approved" });
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ text: "two, better", quotes: [] }))));
  await asA.mutation(api.extract.rework, { id: before[1], note: "" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await asA.mutation(api.extract.acceptSuggestion, { id: before[1] });
  expect(await order()).toEqual(before);
});

test("reading again passes what to look for, leaves reviewed facts alone and skips exact repeats", async () => {
  const { t, asA, narrativeId, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  const [first] = await asA.query(api.extract.items, {});
  await asA.mutation(api.extract.edit, { id: first.id, text: "Did a thing, my way" });
  const fetchMock = vi.fn(async () =>
    modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing, my way" }, { roleKey: "x", text: "Sold to enterprise prospects" }] })),
  );
  vi.stubGlobal("fetch", fetchMock);
  await asA.mutation(api.sources.readAgain, { source: { narrativeId }, includingRejected: false, lookFor: "my sales work" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.messages[1].content).toContain("my sales work");
  const facts = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact");
  expect(facts.map((f) => [f.data.text, f.status])).toEqual([["Did a thing, my way", "approved"], ["Sold to enterprise prospects", "proposed"]]);
});

test("a fact can move to another role in the record, with its kept notes", async () => {
  const { t, asA, asB, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({
    roles: [{ key: "early", employer: "Acme", title: "Analyst" }, { key: "later", employer: "Acme", title: "Manager" }],
    facts: [{ roleKey: "early", text: "Ran the team" }],
  }))));
  await run();
  const fact = (await asA.query(api.extract.items, {})).find((i) => i.kind === "fact")!;
  await t.run(async (ctx) => {
    const w = (await ctx.db.get(fact.id))!.workspaceId;
    await ctx.db.insert("items", { workspaceId: w, kind: "context", status: "approved", roleKey: "early", data: { text: "note", factId: fact.id }, sources: [], at: 0 });
  });
  await expect(asA.mutation(api.extract.moveFact, { id: fact.id, roleKey: "nowhere" })).rejects.toThrow("isn't in your record");
  await expect(asB.mutation(api.extract.moveFact, { id: fact.id, roleKey: "later" })).rejects.toThrow("Not found");
  await asA.mutation(api.extract.moveFact, { id: fact.id, roleKey: "later" });
  const items = await asA.query(api.extract.items, {});
  expect(items.filter((i) => i.kind !== "role").map((i) => [i.kind, i.roleKey])).toEqual([["fact", "later"], ["context", "later"]]);
});

test("a reject reason is kept and later reads are told about it", async () => {
  const { t, asA, narrativeId, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  const [fact] = await asA.query(api.extract.items, {});
  await asA.mutation(api.extract.review, { id: fact.id, status: "rejected", note: "repeats a stronger point" });
  expect((await asA.query(api.extract.items, {}))[0]).toMatchObject({ status: "rejected", data: { rejectedBecause: "repeats a stronger point" } });
  await asA.mutation(api.extract.review, { id: fact.id, status: "proposed" });
  const reopened = (await asA.query(api.extract.items, {})).find((i) => i.kind === "fact")!;
  expect(reopened.data.history?.map((h) => [h.how, h.note])).toEqual([["read", undefined], ["rejected", "repeats a stronger point"]]);
  await asA.mutation(api.extract.review, { id: fact.id, status: "rejected", note: "repeats a stronger point" });
  const fetchMock = vi.fn(async () => modelReply(JSON.stringify({ facts: [] })));
  vi.stubGlobal("fetch", fetchMock);
  await asA.mutation(api.sources.readAgain, { source: { narrativeId }, includingRejected: false });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.messages[1].content).toContain("repeats a stronger point");
});

test("extraction is guided only by approved goals: the goals narrative and rejected limits never reach it", async () => {
  const { t, asA, run } = await setup();
  await asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "I'm okay with lower roles if that helps me pivot." });
  const w = await t.run(async (ctx) => (await ctx.db.query("workspaces").first())!._id);
  await t.run(async (ctx) => {
    const base = { workspaceId: w, sources: [], at: 0 };
    await ctx.db.insert("items", { ...base, kind: "limit", status: "rejected", data: { kind: "seniority", label: "Pivot trade-off", value: "Lower roles are fine for a pivot" } });
    await ctx.db.insert("items", { ...base, kind: "direction", status: "approved", data: { name: "Supply Chain Product" } });
    await ctx.db.insert("items", { ...base, kind: "direction", status: "proposed", data: { name: "Unreviewed Direction" } });
  });
  const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ roles: [], facts: [], context: [] }) } }], usage: { cost: 0.001 } }));
  vi.stubGlobal("fetch", fetch);
  await run();
  const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body).messages[1].content as string;
  expect(sent).toContain("Supply Chain Product");
  expect(sent).not.toContain("pivot");
  expect(sent).not.toContain("Unreviewed Direction");
});

test("other narratives arrive as labelled background, proposals only as not-yet-confirmed, and the goals narrative not at all", async () => {
  const { t, asA, run } = await setup();
  const beta = await asA.mutation(api.narratives.create, { kind: "career", title: "Beta", body: "At Beta I later ran the whole implementation team." });
  await asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "Secret goals text." });
  const reply = (o: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { cost: 0.001 } });
  vi.stubGlobal("fetch", vi.fn(async () => reply({ roles: [], facts: [{ roleKey: "acme", text: "Rebuilt onboarding at Acme.", quotes: ["rebuilt onboarding"] }], context: [] })));
  await run();
  const fetch = vi.fn(async () => reply({ roles: [], facts: [], context: [] }));
  vi.stubGlobal("fetch", fetch);
  await asA.mutation(api.extract.start, { narrativeId: beta });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body).messages[1].content as string;
  const pending = sent.slice(sent.indexOf("awaiting their review"), sent.indexOf("background only"));
  const record = sent.slice(sent.indexOf("confirmed record"), sent.indexOf("awaiting their review"));
  expect(pending).toContain("Rebuilt onboarding at Acme.");
  expect(record).not.toContain("Rebuilt onboarding at Acme.");
  expect(sent.slice(sent.indexOf("background only"), sent.indexOf("Facts they rejected"))).toContain("I rebuilt onboarding at Acme.");
  expect(sent).not.toContain("Secret goals text");
});

test("a fact whose quotes aren't in the narrative it was read from is flagged; loose matching tolerates tidied quotes", async () => {
  const { asA, run } = await setup();
  const reply = (o: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { cost: 0.001 } });
  vi.stubGlobal("fetch", vi.fn(async () => reply({ roles: [], context: [], facts: [
    { roleKey: "acme", text: "Rebuilt onboarding at Acme.", quotes: ["I  REBUILT onboarding, at Acme"] },
    { roleKey: "acme", text: "Ran the whole implementation team.", quotes: ["ran the whole implementation team"] },
    { roleKey: "acme", text: "Cut churn by 40%.", quotes: [] },
  ] })));
  await run();
  const facts = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact");
  expect(Object.fromEntries(facts.map((f) => [f.data.text, !!f.data.evidenceMissing]))).toEqual({
    "Rebuilt onboarding at Acme.": false,
    "Ran the whole implementation team.": true,
    "Cut churn by 40%.": true,
  });
});

test("undoing an approval puts the item back to review, logs it, and stops it counting downstream", async () => {
  const { t, asA, asB, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ roles: [{ key: "x", employer: "Acme", title: "Head of CS" }], facts: [{ roleKey: "x", text: "Did a thing" }] }))));
  await run();
  const items = await asA.query(api.extract.items, {});
  const role = items.find((i) => i.kind === "role")!;
  const fact = items.find((i) => i.kind === "fact")!;
  for (const i of [role, fact]) await asA.mutation(api.extract.review, { id: i.id, status: "approved" });
  const w = await t.run(async (ctx) => (await ctx.db.get(fact.id))!.workspaceId);
  const record = async () => (await t.query(internal.resume.inputs, { workspaceId: w })).record;
  expect((await record()).facts.map((f) => f.text)).toEqual(["Did a thing"]);
  await expect(asB.mutation(api.extract.review, { id: fact.id, status: "proposed" })).rejects.toThrow("Not found");
  for (const i of [role, fact]) await asA.mutation(api.extract.review, { id: i.id, status: "proposed" });
  expect(await record()).toMatchObject({ roles: [], facts: [] });
  const after = (await asA.query(api.extract.items, {})).find((i) => i.kind === "fact")!;
  expect(after.status).toBe("proposed");
  expect(after.data.history?.map((h) => [h.how, h.text])).toEqual([["read", "Did a thing"], ["unapproved", "Did a thing"]]);
  expect(after.undone).toHaveLength(1);
  expect((await asA.query(api.extract.items, {})).find((i) => i.kind === "role")!.undone).toHaveLength(1);
});

test("undoing a direction part's approval takes it out of what resumes read, and is logged", async () => {
  const { t, asA, asB } = await setup();
  const w = await t.run(async (ctx) => (await ctx.db.query("workspaces").first())!._id);
  const id = await t.run((ctx) =>
    ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0, data: { name: "Sales", detailStatus: "approved", detail: { positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [] } } }),
  );
  expect((await t.query(internal.resume.inputs, { workspaceId: w, directionId: id })).direction).not.toBeNull();
  await expect(asB.mutation(api.directions.unapprovePart, { id, part: "detail" })).rejects.toThrow("Not found");
  await asA.mutation(api.directions.unapprovePart, { id, part: "detail" });
  expect((await t.query(internal.resume.inputs, { workspaceId: w, directionId: id })).direction).toBeNull();
  const d = await t.run((ctx) => ctx.db.get(id));
  expect([d!.kind === "direction" && d!.data.detailStatus, d!.undone?.map((u) => u.part)]).toEqual(["proposed", ["detail"]]);
});

test("a role they add is approved as given, under a key of its own", async () => {
  const { asA, asB } = await setup();
  await expect(asA.mutation(api.extract.addRole, { employer: " ", title: "Analyst" })).rejects.toThrow("Give the employer");
  const first = await asA.mutation(api.extract.addRole, { employer: "Acme Co.", title: "Analyst", start: "2019-03", end: "" });
  await asA.mutation(api.extract.addRole, { employer: "Acme Co.", title: "Analyst" });
  const roles = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "role");
  expect(roles.map((r) => [r.roleKey, r.status])).toEqual([["acme-co-analyst", "approved"], ["acme-co-analyst-2", "approved"]]);
  expect(roles[0]).toMatchObject({ id: first, sources: [], data: { employer: "Acme Co.", title: "Analyst", start: "2019-03", end: null } });
  expect(await asB.query(api.extract.items, {})).toEqual([]);
});

test("deleting a role takes its facts, context, questions and notes, keeps rejections and unlinks its project", async () => {
  const { t, asA, asB, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({
    roles: [{ key: "acme", employer: "Acme", title: "Analyst" }, { key: "other", employer: "Beta", title: "Lead" }],
    facts: [{ roleKey: "acme", text: "Ran the team" }, { roleKey: "acme", text: "Typed fast" }, { roleKey: "other", text: "Led it" }],
    context: [{ roleKey: "acme", text: "Small team" }],
  }))));
  await run();
  const items = await asA.query(api.extract.items, {});
  const role = items.find((i) => i.kind === "role" && i.roleKey === "acme")!;
  const [kept, rejected] = items.filter((i) => i.kind === "fact" && i.roleKey === "acme");
  await asA.mutation(api.extract.review, { id: rejected.id, status: "rejected", note: "trivial" });
  const project = await t.run(async (ctx) => {
    const w = (await ctx.db.get(role.id))!.workspaceId;
    await ctx.db.insert("items", { workspaceId: w, kind: "conflict", status: "proposed", roleKey: "acme", data: { field: "end", recordSays: "a", narrativeSays: "b", question: "q" }, sources: [], at: 0 });
    await ctx.db.insert("notes", { workspaceId: w, subject: { kind: "item", id: kept.id }, text: "mine", at: 0 });
    return ctx.db.insert("items", { workspaceId: w, kind: "project", status: "approved", projectKey: "github:a/b", roleKey: "acme", data: { name: "B", repo: "a/b", url: "u" }, sources: [], at: 0 });
  });
  await expect(asB.mutation(api.extract.removeRole, { id: role.id })).rejects.toThrow("Not found");
  expect(await asA.mutation(api.extract.removeRole, { id: role.id })).toEqual({ facts: 1 });
  const left = await asA.query(api.extract.items, {});
  expect(left.map((i) => [i.kind, i.roleKey ?? null, i.status])).toEqual([["role", "other", "proposed"], ["fact", "acme", "rejected"], ["fact", "other", "proposed"], ["project", null, "approved"]]);
  expect(left.find((i) => i.id === project)?.roleKey).toBeUndefined();
  expect(await asA.query(api.conflicts.list, {})).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toEqual([]);
});

test("context they add is kept on the role, about one of its facts if they say so", async () => {
  const { asA, asB, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ roles: [{ key: "acme", employer: "Acme", title: "Analyst" }], facts: [{ roleKey: "acme", text: "Ran the team" }] }))));
  await run();
  const fact = (await asA.query(api.extract.items, {})).find((i) => i.kind === "fact")!;
  await expect(asA.mutation(api.extract.addContext, { roleKey: "nowhere", text: "x" })).rejects.toThrow("isn't in your record");
  await expect(asB.mutation(api.extract.addContext, { roleKey: "acme", text: "x", factId: fact.id })).rejects.toThrow();
  await asA.mutation(api.extract.addContext, { roleKey: "acme", text: " Team of three ", factId: fact.id });
  const context = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "context");
  expect(context.map((c) => [c.roleKey, c.status, c.data])).toEqual([["acme", "approved", { text: "Team of three", from: "your note", factId: fact.id }]]);
});

test("a fact they add is approved in their words on a role in their record, and Undo takes it away", async () => {
  const { asA, asB, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({ roles: [{ key: "acme", employer: "Acme", title: "Analyst" }], facts: [{ roleKey: "acme", text: "Ran the team" }] }))));
  await run();
  await expect(asA.mutation(api.extract.addFact, { roleKey: "nowhere", text: "x" })).rejects.toThrow("isn't in your record");
  await expect(asB.mutation(api.extract.addFact, { roleKey: "acme", text: "x" })).rejects.toThrow("isn't in your record");
  await expect(asA.mutation(api.extract.addFact, { roleKey: "acme", text: "  " })).rejects.toThrow();
  const id = await asA.mutation(api.extract.addFact, { roleKey: "acme", text: " Hired four analysts " });
  const added = (await asA.query(api.extract.items, {})).find((i) => i.id === id);
  if (added?.kind !== "fact") throw new Error("The added fact isn't in the record.");
  expect([added.roleKey, added.status, added.data.text, added.data.edited, added.counts]).toEqual(["acme", "approved", "Hired four analysts", true, true]);
  const read = (await asA.query(api.extract.items, {})).find((i) => i.kind === "fact" && i.id !== id)!;
  await expect(asA.mutation(api.extract.removeAddedFact, { id: read.id })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.extract.removeAddedFact, { id })).rejects.toThrow("Not found");
  await asA.mutation(api.extract.removeAddedFact, { id });
  expect((await asA.query(api.extract.items, {})).some((i) => i.id === id)).toBe(false);
});

test("time away from work told in a story is proposed as a career break, never an employer, with its side projects and facts on it", async () => {
  const { asA, run } = await setup();
  vi.stubGlobal("fetch", vi.fn(async () => modelReply(JSON.stringify({
    roles: [{ key: "caregiving", break: true, employer: "Open Source", title: "Maintainer", start: "2023-04", end: "2025-12", reason: "Caring for my father", projects: ["pgledger"], quotes: ["the gap"] }],
    facts: [{ roleKey: "caregiving", text: "Wrote pgledger, a double-entry ledger library in Go", quotes: ["I started writing pgledger"] }],
    context: [{ roleKey: "caregiving", text: "You moved back to Atlanta", quotes: [] }],
  }))));
  await run();
  const items = await asA.query(api.extract.items, {});
  const role = items.find((i) => i.kind === "role");
  expect(role).toMatchObject({ status: "proposed", roleKey: "break-2023-04", data: { break: true, title: "Career break", start: "2023-04", end: "2025-12", reason: "Caring for my father", projects: ["pgledger"] } });
  expect(role?.data).not.toHaveProperty("employer");
  expect(items.filter((i) => i.kind !== "role").map((i) => [i.kind, i.roleKey]).sort()).toEqual([["context", "break-2023-04"], ["fact", "break-2023-04"]]);
});
