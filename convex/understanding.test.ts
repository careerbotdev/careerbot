import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { freshLook } from "./freshLook";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (content: unknown) =>
  Response.json({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { cost: 0.001 } });

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
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      for (const task of ["extract", "rework", "insights", "directions", "followups", "resume"] as const) await ctx.db.insert("aiSettings", { workspaceId: w, task, model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const narrativeId = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "At Acme I rebuilt onboarding and cut churn by 20%." });
  const add = (kind: "fact" | "role", status: "approved" | "proposed" | "rejected", data: { text?: string; employer?: string; title?: string }, roleKey = "acme", nid: Id<"narratives"> = narrativeId) =>
    t.run((ctx) => {
      const base = { workspaceId: a.w, status, roleKey, sources: [{ narrativeId: nid, version: 1, quotes: [] }], at: 0 };
      return kind === "fact"
        ? ctx.db.insert("items", { ...base, kind, data: { text: data.text ?? "" } })
        : ctx.db.insert("items", { ...base, kind, data: { employer: data.employer, title: data.title } });
    });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const stub = (content: unknown) => {
    const f = vi.fn(async () => reply(content));
    vi.stubGlobal("fetch", f);
    return f;
  };
  const sentTo = (f: ReturnType<typeof stub>) => JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body).messages[1].content as string;
  return { t, asA, asB, w: a.w, narrativeId, add, settle, stub, sentTo };
}

test("insights must rest on approved facts, and one they rejected never comes back", async () => {
  const { asA, add, settle, stub } = await setup();
  const f1 = await add("fact", "approved", { text: "Rebuilt onboarding at Acme." });
  const f2 = await add("fact", "approved", { text: "Rebuilt onboarding at Beta." });
  const unreviewed = await add("fact", "proposed", { text: "Ran support." });
  stub({ insights: [
    { text: "You fix onboarding wherever you go.", factIds: [f1, f2] },
    { text: "You are a support person.", factIds: [unreviewed] },
  ] });
  await asA.mutation(api.insights.start, {});
  await settle();
  const [only] = (await asA.query(api.insights.list, {})).insights;
  expect((await asA.query(api.insights.list, {})).insights).toHaveLength(1);
  expect(only.data.factIds).toEqual([f1, f2]);
  await asA.mutation(api.extract.review, { id: only.id, status: "rejected", note: "Too generic" });
  const f = stub({ insights: [{ text: "You fix onboarding wherever you go.", factIds: [f1, f2] }] });
  await asA.mutation(api.insights.start, {});
  await settle();
  expect(JSON.stringify((await asA.query(api.insights.list, {})).insights.map((i) => i.status))).toBe('["rejected"]');
  expect(f.mock.calls.length).toBe(1);
});

test("an approved project's facts back insights like a role's; approving the project or its last fact takes a fresh look", async () => {
  const { t, asA, w, add, settle, stub, sentTo } = await setup();
  const trail = await t.run((ctx) =>
    ctx.db.insert("items", { workspaceId: w, kind: "project", status: "proposed", projectKey: "github:octo/trail", data: { name: "Trail", repo: "octo/trail", url: "https://github.com/octo/trail", stack: ["TypeScript"] }, sources: [], at: 0 }),
  );
  const projectFact = (status: "approved" | "proposed", text: string) =>
    t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status, projectKey: "github:octo/trail", data: { text }, sources: [], at: 0 }));
  const roleFact = await add("fact", "approved", { text: "Rebuilt onboarding at Acme." });
  await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  const built = await projectFact("approved", "Built Trail, an onboarding app for small clinics.");
  const insightJobs = async () => (await t.run((ctx) => ctx.db.query("jobs").collect())).filter((j) => j.kind === "insights").length;
  const reply = { insights: [{ text: "You build onboarding, at work and on your own.", factIds: [roleFact, built] }] };

  // While the project waits for review, its facts back nothing: the insight keeps only the role's fact.
  stub(reply);
  await asA.mutation(api.insights.start, {});
  await settle();
  expect((await asA.query(api.insights.list, {})).insights.map((i) => i.data.factIds)).toEqual([[roleFact]]);
  await t.run(async (ctx) => {
    for (const i of await ctx.db.query("items").collect()) if (i.kind === "insight") await ctx.db.delete(i._id);
  });

  // Approving it (here by correcting its details) takes a fresh look, with the project and its fact as evidence.
  const f = stub(reply);
  await asA.mutation(api.projects.edit, { id: trail, summary: "Onboarding for small clinics." });
  expect(await insightJobs()).toBe(2);
  await settle();
  expect(sentTo(f)).toContain("Built Trail, an onboarding app for small clinics.");
  expect(sentTo(f)).toContain('"name":"Trail"');
  const [insight] = (await asA.query(api.insights.list, {})).insights;
  expect(insight.data.factIds).toEqual([roleFact, built]);
  expect(insight.basedOn.map((b) => [b.text, b.project ?? null, b.counts])).toEqual([
    ["Rebuilt onboarding at Acme.", null, true],
    ["Built Trail, an onboarding app for small clinics.", "Trail", true],
  ]);

  // Approving the project's last fact waiting for review takes another look; one of a project still waiting doesn't.
  const shipped = await projectFact("proposed", "Shipped Trail to 12 clinics.");
  await asA.mutation(api.extract.review, { id: shipped, status: "approved" });
  expect(await insightJobs()).toBe(3);
  await t.run((ctx) => ctx.db.patch(trail, { status: "proposed" }));
  await settle();
  const later = await projectFact("proposed", "Added reminders to Trail.");
  await asA.mutation(api.extract.review, { id: later, status: "approved" });
  expect(await insightJobs()).toBe(3);
});

test("finishing a narrative's review queues a fresh look; an unfinished one doesn't", async () => {
  const { t, asA, add } = await setup();
  await add("fact", "approved", { text: "Earlier approved fact." });
  const a1 = await add("fact", "proposed", { text: "First." });
  const a2 = await add("fact", "proposed", { text: "Second." });
  const insightJobs = () => t.run(async (ctx) => (await ctx.db.query("jobs").collect()).filter((j) => j.kind === "insights").length);
  await asA.mutation(api.extract.review, { id: a1, status: "approved" });
  expect(await insightJobs()).toBe(0);
  await asA.mutation(api.extract.review, { id: a2, status: "approved" });
  expect(await insightJobs()).toBe(1);
});

test("finishing a narrative's review gathers skills, tools and certifications; approving one of its roles afterwards gathers again", async () => {
  const { t, asA, add, settle } = await setup();
  const first = await add("role", "proposed", { employer: "Acme", title: "Head of CS" });
  const fact = await add("fact", "proposed", { text: "Rebuilt onboarding at Acme." });
  const gathers = () => t.run(async (ctx) => (await ctx.db.query("jobs").collect()).filter((j) => j.kind === "skills").map((j) => [j.origin, j.args.why]));
  // A role approved while its narrative still has facts to review waits for them.
  await asA.mutation(api.extract.review, { id: first, status: "approved" });
  expect(await gathers()).toEqual([]);
  await asA.mutation(api.extract.review, { id: fact, status: "approved" });
  expect(await gathers()).toEqual([["automatic", "review"]]);
  await settle();
  const later = await add("role", "proposed", { employer: "Acme", title: "VP of CS" }, "acme-vp");
  await asA.mutation(api.extract.review, { id: later, status: "approved" });
  expect(await gathers()).toEqual([["automatic", "review"], ["automatic", "review"]]);
  // Rejecting a role gathers nothing.
  const gone = await add("role", "proposed", { employer: "Acme", title: "Intern" }, "acme-intern");
  await settle();
  await asA.mutation(api.extract.review, { id: gone, status: "rejected" });
  expect(await gathers()).toHaveLength(2);
});

test("what Review and Record say before a decision matches what it starts; changing an approved fact starts nothing", async () => {
  const { t, asA, narrativeId, add, settle } = await setup();
  const role = await add("role", "proposed", { employer: "Acme", title: "Head of CS" });
  const one = await add("fact", "proposed", { text: "Rebuilt onboarding at Acme." });
  const two = await add("fact", "proposed", { text: "Cut churn by 20% at Acme." });
  const three = await add("fact", "proposed", { text: "Ran the renewals desk at Acme." });
  const suggest = (id: Id<"items">, text: string, rewrite: string) => t.run((ctx) => ctx.db.patch(id, { data: { text, suggestion: { text: rewrite, at: 0 } } }));
  await suggest(three, "Ran the renewals desk at Acme.", "Ran renewals for 40 accounts at Acme.");
  const runs = async () => {
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
    return { gathers: jobs.filter((j) => j.kind === "skills").length, insights: jobs.filter((j) => j.kind === "insights").length };
  };
  const statusOf = async (id: Id<"items">) => (await t.run((ctx) => ctx.db.get(id)))!.status;
  // Each step: what the screens predict from insights.freshLookOpen, then what deciding it queued.
  const steps: [Id<"items">, "role" | "fact", "approved" | "rejected", () => Promise<unknown>, { gathers: boolean; insights: boolean }][] = [
    [role, "role", "approved", () => asA.mutation(api.extract.review, { id: role, status: "approved" }), { gathers: false, insights: false }],
    [one, "fact", "approved", () => asA.mutation(api.extract.review, { id: one, status: "approved" }), { gathers: false, insights: false }],
    [two, "fact", "rejected", () => asA.mutation(api.extract.review, { id: two, status: "rejected" }), { gathers: false, insights: false }],
    // Using the rewrite of the last fact waiting approves it and finishes the story's review.
    [three, "fact", "approved", () => asA.mutation(api.extract.acceptSuggestion, { id: three }), { gathers: true, insights: true }],
    // Changing an approved fact (an edit, a rewrite, a rejection) starts nothing.
    [one, "fact", "approved", () => asA.mutation(api.extract.edit, { id: one, text: "Rebuilt onboarding for 40 clinics at Acme." }), { gathers: false, insights: false }],
    [one, "fact", "approved", async () => (await suggest(one, "Rebuilt onboarding for 40 clinics at Acme.", "Rebuilt onboarding at 40 clinics."), await asA.mutation(api.extract.acceptSuggestion, { id: one })), { gathers: false, insights: false }],
    [one, "fact", "rejected", () => asA.mutation(api.extract.review, { id: one, status: "rejected" }), { gathers: false, insights: false }],
  ];
  for (const [id, kind, to, run, expected] of steps) {
    const open = await asA.query(api.insights.freshLookOpen, {});
    expect(freshLook([{ kind, narrativeId: String(narrativeId), was: await statusOf(id), to }], open)).toEqual(expected);
    const before = await runs();
    await run();
    const after = await runs();
    expect({ gathers: after.gathers > before.gathers, insights: after.insights > before.insights }).toEqual(expected);
    await settle();
  }
  expect(await asA.query(api.insights.freshLookOpen, {})).toEqual({ stories: {}, projects: {}, approvedFacts: 1 });
});

test("a revised narrative changes its own facts only as suggestions or flags, never silently and never another narrative's", async () => {
  const { t, asA, narrativeId, add, settle, stub, sentTo } = await setup();
  const other = await asA.mutation(api.narratives.create, { kind: "career", title: "Beta", body: "At Beta I sold." });
  const churn = await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  const gone = await add("fact", "approved", { text: "Rebuilt onboarding at Acme." });
  const foreign = await add("fact", "approved", { text: "Sold at Beta." }, "beta", other);
  // It was read once, at version 1.
  await t.run(async (ctx) => {
    const n = (await ctx.db.get(narrativeId))!;
    await ctx.db.insert("jobs", { workspaceId: n.workspaceId, kind: "extract", args: { narrativeId, version: 1 }, status: "done" });
  });
  await asA.mutation(api.narratives.save, { id: narrativeId, title: "Acme", body: "At Acme I cut churn by 30% and launched a partner program." });
  const f = stub({
    facts: [{ roleKey: "acme", text: "Launched a partner program at Acme.", quotes: ["launched a partner program"] }],
    updates: [
      { factId: churn, text: "Cut churn by 30% at Acme.", why: "Churn is now 30%" },
      { factId: foreign, text: "Sold a lot at Beta.", why: "nope" },
    ],
    retired: [{ factId: gone, why: "Onboarding isn't mentioned anymore" }],
    context: [],
  });
  await asA.mutation(api.extract.start, { narrativeId });
  await settle();
  expect(sentTo(f)).toContain("Version that was read (1)");
  const get = (id: Id<"items">) =>
    t.run(async (ctx) => {
      const i = await ctx.db.get(id);
      if (i?.kind !== "fact") throw new Error("Not a fact.");
      return i;
    });
  const c = await get(churn);
  expect(c).toMatchObject({ status: "approved", data: { text: "Cut churn by 20% at Acme.", suggestion: { text: "Cut churn by 30% at Acme.", from: "revision" } } });
  expect((await get(gone)).data).toMatchObject({ text: "Rebuilt onboarding at Acme.", noLongerSaid: "Onboarding isn't mentioned anymore" });
  expect((await get(foreign)).data.suggestion).toBeUndefined();
  const facts = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact").filter((i) => i.status === "proposed");
  expect(facts.map((x) => x.data.text)).toEqual(["Launched a partner program at Acme."]);
});

test("a revision reaches every fact its story is a source of, not only facts first read from it", async () => {
  const { t, asA, narrativeId, settle, stub, sentTo } = await setup();
  const other = await asA.mutation(api.narratives.create, { kind: "career", title: "Beta", body: "Beta retold: at Acme I cut churn by 20%." });
  const fact = (text: string, first: Id<"narratives">, second: Id<"narratives">) =>
    t.run(async (ctx) => {
      const workspaceId = (await ctx.db.get(narrativeId))!.workspaceId;
      const sources = [first, second].map((nid) => ({ narrativeId: nid, version: 1, quotes: [] }));
      return ctx.db.insert("items", { workspaceId, kind: "fact", status: "approved", roleKey: "acme", data: { text }, sources, at: 0 });
    });
  // Read from the other story first; this story said it too.
  const churn = await fact("Cut churn by 20% at Acme.", other, narrativeId);
  const gone = await fact("Rebuilt onboarding at Acme.", other, narrativeId);
  await t.run(async (ctx) => {
    const n = (await ctx.db.get(narrativeId))!;
    await ctx.db.insert("jobs", { workspaceId: n.workspaceId, kind: "extract", args: { narrativeId, version: 1 }, status: "done" });
  });
  await asA.mutation(api.narratives.save, { id: narrativeId, title: "Acme", body: "At Acme I cut churn by 30%." });
  const f = stub({ facts: [], updates: [{ factId: churn, text: "Cut churn by 30% at Acme.", why: "Churn is now 30%" }], retired: [{ factId: gone, why: "Onboarding isn't mentioned anymore" }], context: [] });
  await asA.mutation(api.extract.start, { narrativeId });
  await settle();
  expect(sentTo(f)).toContain(churn);
  const [c, g] = await t.run(async (ctx) => [await ctx.db.get(churn), await ctx.db.get(gone)]);
  expect(c).toMatchObject({ data: { text: "Cut churn by 20% at Acme.", suggestion: { text: "Cut churn by 30% at Acme.", from: "revision" } } });
  expect(g).toMatchObject({ data: { noLongerSaid: "Onboarding isn't mentioned anymore" } });
});

test("an answer about a fact becomes a rewrite suggestion on it; any other answer becomes a note that's read; Not now is never asked again", async () => {
  const { t, asA, asB, add, settle, stub, sentTo } = await setup();
  await add("role", "approved", { employer: "Acme", title: "Head of CS" });
  const fact = await add("fact", "approved", { text: "Rebuilt onboarding at Acme." });
  stub({ questions: [
    { question: "How long did onboarding take before and after?", why: "Adds a number", factId: fact },
    { question: "How big was your team at Acme?", why: "Adds scope", roleKey: "acme", factId: null },
    { question: "What did you like most?", why: "", roleKey: "acme" },
  ] });
  await asA.mutation(api.followups.start, {});
  await settle();
  const [q1, q2, q3] = (await asA.query(api.followups.list, {})).open;
  await expect(asB.mutation(api.followups.answer, { id: q1.id, answer: "x" })).rejects.toThrow("Not found");
  stub({ text: "Cut onboarding from six weeks to two at Acme.", quotes: [], keptAsContext: [] });
  await asA.mutation(api.followups.answer, { id: q1.id, answer: "From six weeks to two." });
  await settle();
  expect(await t.run(async (ctx) => {
    const i = await ctx.db.get(fact);
    return i?.kind === "fact" ? i.data.suggestion : undefined;
  })).toMatchObject({ text: "Cut onboarding from six weeks to two at Acme." });
  stub({ roles: [], facts: [], context: [] });
  await asA.mutation(api.followups.answer, { id: q2.id, answer: "A team of six." });
  await settle();
  const note = (await asA.query(api.narratives.list, {})).find((n) => n.kind === "note")!;
  expect(note.title).toBe("Follow-up: Head of CS at Acme");
  expect(await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).some((j) => j.kind === "extract" && j.args.narrativeId === note.id && j.status === "done"))).toBe(true);
  await asA.mutation(api.followups.notNow, { id: q3.id });
  const f = stub({ questions: [{ question: "What did you like most?", roleKey: "acme" }] });
  await asA.mutation(api.followups.start, {});
  await settle();
  expect(sentTo(f)).toContain("What did you like most?");
  expect((await asA.query(api.followups.list, {})).open).toEqual([]);
});

test("the resume is structured, written only from approved facts, bullets cite them, and every version is kept", async () => {
  const { asA, add, settle, stub, sentTo } = await setup();
  await add("role", "approved", { employer: "Acme", title: "Head of CS" });
  const churn = await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  await add("fact", "proposed", { text: "Unreviewed claim." });
  await add("fact", "rejected", { text: "Rejected claim." });
  const doc = (summary: string) => ({ summary, experience: [
    { employer: "Acme Inc", title: "Chief Everything Officer", roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [churn] }, { text: "Invented line.", factIds: ["nope"] }] },
    { employer: "Made Up Co", title: "CEO", roleKey: "ghost", bullets: [{ text: "Ran it all.", factIds: [churn] }] },
  ], skills: [] });
  const f = stub(doc("Leader v1"));
  await asA.mutation(api.resume.start, {});
  await settle();
  const sent = sentTo(f);
  expect(sent).toContain("Cut churn by 20% at Acme.");
  expect(sent).not.toContain("Unreviewed claim");
  expect(sent).not.toContain("Rejected claim");
  expect(sent).not.toContain("directions");
  stub(doc("Leader v2"));
  await asA.mutation(api.resume.start, {});
  await settle();
  const { versions, facts } = await asA.query(api.resume.list, {});
  expect(versions.map((v) => v.doc?.summary)).toEqual(["Leader v2", "Leader v1"]);
  // Employer and title come from the approved role; a role not in the record is dropped.
  expect(versions[0].doc!.experience.map((e) => [e.employer, e.title])).toEqual([["Acme", "Head of CS"]]);
  expect(versions[0].doc!.experience[0].bullets).toEqual([{ text: "Cut churn by 20%.", factIds: [churn] }, { text: "Invented line.", factIds: [], unsourced: true }]);
  expect(facts[churn]).toBe("Cut churn by 20% at Acme.");
});

test("a run retried after its results were saved doesn't save them twice or pay again", async () => {
  const { t, asA, add, settle, stub } = await setup();
  await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  stub({ summary: "Resume v1", experience: [], skills: [] });
  await asA.mutation(api.resume.start, {});
  await settle();
  // As if the run was cut off after saving but before it was marked done.
  const jobId = await t.run(async (ctx) => {
    const j = (await ctx.db.query("jobs").collect()).find((x) => x.kind === "resume")!;
    await ctx.db.patch(j._id, { status: "running", startedAt: 0 });
    return j._id;
  });
  const f = stub({ summary: "Resume v2", experience: [], skills: [] });
  await t.mutation(internal.jobs.recoverStuck, {});
  await settle();
  expect((await asA.query(api.resume.list, {})).versions.map((v) => v.doc?.summary)).toEqual(["Resume v1"]);
  expect(f).not.toHaveBeenCalled();
  expect((await t.run((ctx) => ctx.db.get(jobId)))!.status).toBe("done");
});

test("directions: detail cites only approved facts, approved parts are never overwritten, suggestions skip taken names", async () => {
  const { t, asA, w, add, settle, stub } = await setup();
  const fact = await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  const dir = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Customer Success", includes: ["Account Management"] }, sources: [], at: 0 }));
  const detail = (positioning: string) => ({
    directions: [{ id: dir, positioning, targetTitles: ["VP Customer Success"], vocabulary: ["NRR"], carriesOver: [{ text: "Retention", factIds: [fact] }, { text: "Made up", factIds: ["x"] }], reframe: [], titleMap: [{ from: "Business Consultant", to: "Senior CSM" }], criteria: { industries: ["ai", "cheese"], sizes: ["51-200"], stages: ["series b"], titles: ["VP CS"], keywords: ["churn"] } }],
  });
  stub(detail("First"));
  await asA.mutation(api.directions.detail, {});
  await settle();
  let d = (await asA.query(api.directions.list, {})).directions[0];
  expect(d.data.detail).toMatchObject({ positioning: "First", carriesOver: [{ text: "Retention", factIds: [fact] }] });
  expect(d.data.criteria!.industries).toEqual(["ai"]);
  // Saving the same direction twice in one pass writes nothing twice.
  expect(await t.mutation(internal.directions.saveFill, { jobId: d.data.detailRunId!, id: dir, out: detail("Replayed") })).toBe(false);
  expect((await asA.query(api.directions.list, {})).directions[0].data.detail!.positioning).toBe("First");
  await asA.mutation(api.directions.approvePart, { id: dir, part: "detail" });
  stub(detail("Second"));
  await asA.mutation(api.directions.detail, { id: dir });
  await settle();
  d = (await asA.query(api.directions.list, {})).directions[0];
  expect(d.data.detail!.positioning).toBe("First");
  await expect(asA.mutation(api.directions.editCriteria, { id: dir, industries: ["cheese"], sizes: [], stages: [], titles: [], keywords: [] })).rejects.toThrow("Not on the list");
  stub({ directions: [{ name: "account management", summary: "dupe", factIds: [fact] }, { name: "No Evidence", summary: "x", factIds: [] }, { name: "Revenue Operations", path: "continue", summary: "New", factIds: [fact], positioning: "RevOps", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [], criteria: {} }] });
  await asA.mutation(api.directions.suggest, {});
  await settle();
  const names = (await asA.query(api.directions.list, {})).directions.map((x) => [x.data.name, x.status, x.data.path]);
  expect(names).toEqual([["Customer Success", "approved", undefined], ["Revenue Operations", "proposed", "adjacent"]]);
  expect((await asA.query(api.directions.list, {})).directions[1].evidence).toEqual(["Cut churn by 20% at Acme."]);
});

test("directions: a fill-in keeps up to 20 titles, its own industries only, and the Criteria show the goals' industries above the ones from the record", async () => {
  const { t, asA, w, add, settle, stub } = await setup();
  const fact = await add("fact", "approved", { text: "Closed a $2M enterprise deal at Acme." });
  const want = ["ai", "aerospace and defense", "robotics", "hardware and semiconductors", "energy", "industrial"];
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "companies", label: "Companies", value: "x", rule: { industriesWant: want, industriesAvoid: ["staffing"] } }, sources: [], at: 0 }));
  const dir = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Enterprise Sales" }, sources: [], at: 0 }));
  const titles = Array.from({ length: 25 }, (_, i) => `Enterprise Account Executive ${i + 1}`);
  stub({ directions: [{ id: dir, positioning: "P", targetTitles: titles, vocabulary: [], carriesOver: [{ text: "Deal", factIds: [fact] }], reframe: [], titleMap: [], criteria: { industries: ["proptech", "ai", "staffing"], sizes: [], stages: [], titles, keywords: [] } }] });
  await asA.mutation(api.directions.detail, {});
  await settle();
  const d = (await asA.query(api.directions.list, {})).directions[0];
  expect(d.data.detail!.targetTitles).toHaveLength(20);
  expect(d.data.criteria!.titles).toEqual(titles.slice(0, 20));
  // The direction keeps its own picks (avoided ones dropped); the wanted ones come from the limit, not copied in.
  expect(d.data.criteria!.industries).toEqual(["proptech", "ai"]);
  expect(d).toMatchObject({ fromGoals: want, goalsScoped: false, fromRecord: ["proptech"] });
});

test("tailoring starts from the direction resume and grades requirements honestly", async () => {
  const { t, asA, w, add, settle, stub, sentTo } = await setup();
  const fact = await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  const dir = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Customer Success" }, sources: [], at: 0 }));
  await expect(asA.mutation(api.resume.start, { directionId: dir })).rejects.toThrow("positioning");
  await t.run(async (ctx) => {
    const d = (await ctx.db.get(dir))!;
    if (d.kind === "direction") await ctx.db.patch(dir, { data: { ...d.data, detail: { positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [] }, detailStatus: "approved" } });
  });
  await add("role", "approved", { employer: "Acme", title: "Head of CS" });
  stub({ summary: "Direction summary", experience: [], skills: [] });
  await asA.mutation(api.resume.start, { directionId: dir });
  await settle();
  const f = stub({ resume: { summary: "Tailored", experience: [], skills: [] }, requirements: [
    { requirement: "Reduce churn", strength: "strong", factIds: [fact] },
    { requirement: "Salesforce admin", strength: "strong", factIds: [] },
    { requirement: "Security clearance", strength: "thin", factIds: [], note: "Nothing in the record" },
  ] });
  await asA.mutation(api.resume.start, { directionId: dir, posting: "VP CS at Beta" });
  await settle();
  expect(sentTo(f)).toContain("Direction summary");
  const { tailored, versions } = await asA.query(api.resume.list, { directionId: dir });
  expect(versions.map((v) => v.doc?.summary)).toEqual(["Direction summary"]);
  expect(tailored[0].doc!.summary).toBe("Tailored");
  expect(tailored[0].requirements.map((r) => r.strength)).toEqual(["strong", "partial", "thin"]);
  expect((await asA.query(api.resume.list, {})).versions).toEqual([]);
});

// A fill-in reply for whichever direction the call asks about, by its id; positioning null for the ones named in fail.
const fillReply = (fact: Id<"items">, fail: string[] = []) =>
  vi.fn(async (_url: string, init: { body: string }) => {
    const ask = JSON.parse(init.body).messages[1].content as string;
    const [{ id, name }] = JSON.parse(ask.slice(ask.indexOf("["), ask.indexOf("]\n") + 1)) as { id: string; name: string }[];
    const positioning = fail.includes(name) ? "" : `Lead with ${name}.`;
    return reply({ directions: [{ id, positioning, targetTitles: [`${name} Lead`], vocabulary: [], carriesOver: [{ text: "Retention", factIds: [fact] }], reframe: [], titleMap: [], criteria: { industries: ["ai"], sizes: [], stages: [], titles: [`${name} Lead`], keywords: [] } }] });
  });

test("approving directions fills them in on their own: one pass for several, one call each, within the budget, in Activity", async () => {
  const { t, asA, w, add, settle } = await setup();
  const fact = await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  const proposed = (name: string, data: Record<string, unknown> = {}) => t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "proposed", data: { name, ...data }, sources: [], at: 0 }));
  const names = ["Supply Chain Product", "Solutions Consulting", "Customer Success"];
  const ids: Id<"items">[] = [];
  for (const name of names) ids.push(await proposed(name));
  const detailed = await proposed("Already Detailed", { detail: { positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [] }, detailStatus: "proposed" });
  const f = fillReply(fact);
  vi.stubGlobal("fetch", f);
  // Approved one after another: they join the pass that's waiting; one with positioning already isn't filled in.
  for (const id of [...ids, detailed]) await asA.mutation(api.extract.review, { id, status: "approved" });
  const passes = async () => (await t.run((ctx) => ctx.db.query("jobs").collect())).filter((j) => j.kind === "directions");
  expect((await passes()).map((j) => [j.origin, j.args.ids])).toEqual([["automatic", ids]]);
  expect((await asA.query(api.today.setup, {})).directions).toEqual({ filling: { done: 0, total: 3 }, rows: [...names.map((name, i) => ({ id: ids[i], name, state: "filling" })), { id: detailed, name: "Already Detailed", state: "fillIn" }] });
  await settle();
  expect(f).toHaveBeenCalledTimes(3);
  const list = (await asA.query(api.directions.list, {})).directions;
  expect(ids.map((id) => list.find((d) => d.id === id)).map((d) => [d?.data.detail?.positioning, d?.data.detailStatus, d?.data.criteriaStatus, d?.fill])).toEqual(names.map((n) => [`Lead with ${n}.`, "proposed", "proposed", null]));
  expect((await passes()).map((j) => j.status)).toEqual(["done"]);
  expect((await asA.query(api.activity.list, {})).find((r) => r.kind === "directions")).toMatchObject({ label: "Filled in your directions", state: "done" });
  // Filled in with criteria to review: Review.
  expect((await asA.query(api.today.setup, {})).directions.rows.filter((r) => ids.includes(r.id)).map((r) => r.state)).toEqual(["review", "review", "review"]);

  // With the AI budget used up, the pass waits instead of calling: paused, shown in Activity, the direction still filling.
  await t.run(async (ctx) => {
    const b = await ctx.db.query("budgets").withIndex("by_workspace", (q) => q.eq("workspaceId", w)).unique();
    await ctx.db.patch(b!._id, { aiMonthlyUsd: 0 });
  });
  const later = await proposed("Partnerships");
  const g = fillReply(fact);
  vi.stubGlobal("fetch", g);
  await asA.mutation(api.extract.review, { id: later, status: "approved" });
  await settle();
  expect(g).not.toHaveBeenCalled();
  expect((await passes()).map((j) => j.status)).toEqual(["done", "paused"]);
  expect((await asA.query(api.activity.list, {})).find((r) => r.state === "running")).toMatchObject({ label: "Filling in Partnerships", detail: expect.stringContaining("Paused until your AI budget allows") });
  expect((await asA.query(api.directions.list, {})).directions.find((d) => d.id === later)?.fill).toBe("filling");
});

test("a direction whose fill-in failed shows Fill in, isn't tried again on its own, and Fill in all fills only the empty ones", async () => {
  const { t, asA, w, add, settle } = await setup();
  const fact = await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  const approved = (name: string) => t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name }, sources: [], at: 0 }));
  // Approved before filling in started on its own: nothing fills them until asked.
  const [ops, sales, cs] = [await approved("Operations"), await approved("Sales"), await approved("Customer Success")];
  expect((await asA.query(api.today.setup, {})).directions.rows.map((r) => r.state)).toEqual(["fillIn", "fillIn", "fillIn"]);
  const f = fillReply(fact, ["Sales"]);
  vi.stubGlobal("fetch", f);
  await asA.mutation(api.directions.detail, {});
  await settle();
  expect(f).toHaveBeenCalledTimes(3);
  const rows = (await asA.query(api.today.setup, {})).directions.rows;
  expect(rows.map((r) => [r.id, r.state])).toEqual([
    [ops, "review"],
    [sales, "failed"],
    [cs, "review"],
  ]);
  expect((await asA.query(api.directions.list, {})).directions.find((d) => d.id === sales)?.fill).toBe("failed");
  // Fill in all again: only the one still empty.
  const g = fillReply(fact);
  vi.stubGlobal("fetch", g);
  await asA.mutation(api.directions.detail, {});
  await settle();
  expect(g).toHaveBeenCalledTimes(1);
  expect((await asA.query(api.directions.list, {})).directions.find((d) => d.id === sales)?.data.detail?.positioning).toBe("Lead with Sales.");
});

test("industries an approved limit avoids never become search criteria", async () => {
  const { t, asA, w, add, settle, stub } = await setup();
  const fact = await add("fact", "approved", { text: "Cut churn by 20% at Acme." });
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "companies", label: "Companies", value: "No consulting", rule: { industriesAvoid: ["consulting"] } }, sources: [], at: 0 }));
  const dir = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Customer Success" }, sources: [], at: 0 }));
  stub({ directions: [{ id: dir, positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [{ text: "x", factIds: [fact] }], reframe: [], titleMap: [], criteria: { industries: ["consulting", "ai"] } }] });
  await asA.mutation(api.directions.detail, {});
  await settle();
  expect((await asA.query(api.directions.list, {})).directions[0].data.criteria!.industries).toEqual(["ai"]);
});

test("an insight says where each of its facts lives and which current resumes were written from it", async () => {
  const { t, asA, w, add } = await setup();
  const fact = await add("fact", "approved", { text: "Rebuilt onboarding at Acme." });
  const insight = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "insight", status: "approved", data: { text: "You fix onboarding.", factIds: [fact] }, sources: [], at: 0 }));
  const dir = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Customer Success" }, sources: [], at: 0 }));
  const basis = (withIt: boolean) => ({ roles: [], facts: [], projects: [], insights: withIt ? [{ id: insight, mark: "m" }] : [] });
  await t.run(async (ctx) => {
    // The base resume's current version no longer has it (an older one did); the direction's current one does, and a
    // version still waiting for review doesn't count.
    await ctx.db.insert("resumes", { workspaceId: w, model: "m", at: 1, writtenFrom: basis(true) });
    await ctx.db.insert("resumes", { workspaceId: w, model: "m", at: 2, writtenFrom: basis(false) });
    await ctx.db.insert("resumes", { workspaceId: w, model: "m", at: 3, directionId: dir, writtenFrom: basis(true) });
    await ctx.db.insert("resumes", { workspaceId: w, model: "m", at: 4, directionId: dir, writtenFrom: basis(false), toReview: true });
  });
  const [row] = (await asA.query(api.insights.list, {})).insights;
  expect(row.basedOn.map((b) => [b.id, b.roleKey, b.projectKey])).toEqual([[fact, "acme", null]]);
  expect(row.usedIn).toEqual([{ resume: dir, name: "Customer Success", at: 3 }]);
});
