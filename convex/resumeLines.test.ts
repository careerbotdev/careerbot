import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { arrange, factUse, keptOf, lengthLine, pagesFor, roomNote, shownLines, type ResumeDoc } from "./resumeDoc";
import { carryOver } from "./resume";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

// A resume's lines: Add a line (as written, free; or written for the resume, paid), how many approved facts it uses,
// pins, hides and the order of lines carried into a new version by the facts they rest on, and its length in lines
// and pages.

const modules = import.meta.glob("./**/*.ts");
const reply = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "77".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

// A workspace with Acme (three approved facts) and Globex (one), and a base resume citing two of Acme's and Globex's.
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
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "resume", model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const w = a.w;
  const f = await t.run(async (ctx) => {
    const role = (roleKey: string, data: { employer: string; title: string; start: string; end?: string }) => ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey, data, sources: [], at: 0 });
    await role("acme", { employer: "Acme", title: "Head of CS", start: "2021-01" });
    await role("globex", { employer: "Globex", title: "Implementation Manager", start: "2016-01", end: "2019-05" });
    const fact = (roleKey: string, text: string) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey, data: { text }, sources: [], at: 0 });
    return { churn: await fact("acme", "Cut churn by 20%."), team: await fact("acme", "Hired a team of 6."), playbook: await fact("acme", "Wrote the onboarding playbook."), impl: await fact("globex", "Ran 40 implementations.") };
  });
  const doc = (summary: string, acme: { text: string; factIds: string[] }[]) => ({
    summary,
    experience: [
      { roleKey: "acme", bullets: acme },
      { roleKey: "globex", bullets: [{ text: "Ran 40 implementations.", factIds: [f.impl] }] },
    ],
    skills: [],
  });
  const first = doc("v1", [
    { text: "Cut churn by 20%.", factIds: [f.churn] },
    { text: "Hired a team of 6.", factIds: [f.team] },
  ]);
  // Runs what's scheduled with the model replying `content`; returns what it was sent.
  const settle = async (content: unknown) => {
    const fetch = vi.fn(async () => reply(content));
    vi.stubGlobal("fetch", fetch);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body) as { messages: { content: string }[] });
  };
  await asA.mutation(api.resume.start, {});
  await settle(first);
  const current = async () => (await asA.query(api.resume.list, {})).versions[0];
  return { t, asA, asB, w, f, doc, settle, current };
}

test("Add as written puts an unused approved fact on the resume as it reads, marked added; Undo takes it off; used facts and others' resumes are refused", async () => {
  const { t, asA, asB, f, current } = await setup();
  const v = await current();
  await expect(asB.mutation(api.resume.addLine, { id: v.id, factId: f.playbook })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.resume.addLine, { id: v.id, factId: f.churn })).rejects.toThrow("already rests on this fact");
  const text = await asA.mutation(api.resume.addLine, { id: v.id, factId: f.playbook });
  expect(text).toBe("Wrote the onboarding playbook.");
  const after = await current();
  expect(after.doc!.experience[0].bullets.at(-1)).toEqual({ text, factIds: [f.playbook], added: true });
  // What it was written from takes the fact as it reads now.
  expect((await t.run((ctx) => ctx.db.get(v.id)))!.writtenFrom!.facts.some((x) => x.id === f.playbook)).toBe(true);
  await expect(asA.mutation(api.resume.addLine, { id: v.id, factId: f.playbook })).rejects.toThrow("already rests on this fact");
  // A hidden line's fact can be put on again.
  await asA.mutation(api.resume.setBullet, { id: v.id, text: "Cut churn by 20%.", state: "hidden" });
  await expect(asA.mutation(api.resume.addLine, { id: v.id, factId: f.churn })).rejects.toThrow("already has that line");
  await asA.mutation(api.resume.removeLine, { id: v.id, text });
  expect((await current()).doc!.experience[0].bullets.map((b) => b.text)).toEqual(["Cut churn by 20%.", "Hired a team of 6."]);
  await expect(asA.mutation(api.resume.removeLine, { id: v.id, text: "Cut churn by 20%." })).rejects.toThrow("Nothing to undo");
});

test("Write it for this resume runs one paid call with the fact and the resume, and the line lands at the end of its role", async () => {
  const { t, asA, f, settle, current } = await setup();
  const v = await current();
  const jobId = await asA.mutation(api.resume.writeLine, { id: v.id, factId: f.playbook });
  expect(jobId).not.toBeNull();
  // Asked twice while it's writing, it starts once; it shows as being written for this resume.
  expect(await asA.mutation(api.resume.writeLine, { id: v.id, factId: f.playbook })).toBeNull();
  expect((await asA.query(api.resume.list, {})).writingLines).toEqual([{ resumeId: v.id, factId: f.playbook }]);
  // It never holds up a whole resume run.
  expect((await asA.query(api.resume.overview, {})).writing).toBe(false);
  const sent = await settle({ text: "Wrote the playbook every new customer is onboarded with." });
  expect(sent).toHaveLength(1);
  expect(sent[0].messages[1].content).toContain("Wrote the onboarding playbook.");
  expect(sent[0].messages[1].content).toContain("Head of CS at Acme");
  const after = await current();
  expect(after.id).toBe(v.id);
  expect(after.doc!.experience[0].bullets.at(-1)).toEqual({ text: "Wrote the playbook every new customer is onboarded with.", factIds: [f.playbook], added: true });
  const job = await t.run((ctx) => ctx.db.get(jobId!));
  expect(job).toMatchObject({ status: "done" });
  const usage = await t.run((ctx) => ctx.db.query("usage").collect());
  expect(usage.some((u) => u.purpose === "resume line")).toBe(true);
  expect((await asA.query(api.resume.list, {})).writingLines).toEqual([]);
});

test("counts what a resume uses: approved facts cited by a shown line, of all on a role or project, and the unused ones by role", async () => {
  const { asA, f, current } = await setup();
  const v = await current();
  const { places } = await asA.query(api.resume.list, {});
  expect(factUse(v.doc!, v.layout, places)).toEqual({ used: 3, of: 4, unused: { "role:acme": [f.playbook] } });
  // A hidden line's fact isn't used.
  await asA.mutation(api.resume.setBullet, { id: v.id, text: "Hired a team of 6.", state: "hidden" });
  const hidden = await current();
  expect(factUse(hidden.doc!, hidden.layout, places)).toEqual({ used: 2, of: 4, unused: { "role:acme": [f.team, f.playbook] } });
});

test("a new version keeps pins, hides and the order of lines by the facts they rest on, even when its words change, and the writer is told the pinned facts", async () => {
  const { t, asA, f, doc, settle, current } = await setup();
  const v1 = await current();
  await asA.mutation(api.resume.addLine, { id: v1.id, factId: f.playbook });
  await asA.mutation(api.resume.setBullet, { id: v1.id, text: "Cut churn by 20%.", state: "pinned" });
  await asA.mutation(api.resume.setBullet, { id: v1.id, text: "Hired a team of 6.", state: "hidden" });
  // The playbook line first: moved up twice (Undo puts it back by where it was).
  expect(await asA.mutation(api.resume.moveLine, { id: v1.id, text: "Wrote the onboarding playbook.", to: 0 })).toBe(2);
  const moved = await current();
  expect(arrange(moved.doc!, moved.layout).doc.experience[0].bullets.map((b) => b.text)).toEqual(["Wrote the onboarding playbook.", "Cut churn by 20%."]);
  await expect(asA.mutation(api.resume.moveLine, { id: v1.id, text: "Not a line", to: 0 })).rejects.toThrow("Not found");

  await asA.mutation(api.resume.rewrite, {});
  // The new version words every line differently.
  const sent = await settle(
    doc("v2", [
      { text: "Reduced churn 20% in a year.", factIds: [f.churn] },
      { text: "Built a team of six.", factIds: [f.team] },
      { text: "Authored the onboarding playbook.", factIds: [f.playbook] },
    ]),
  );
  expect(sent[0].messages[1].content).toContain(`Lines they pinned on this resume`);
  expect(sent[0].messages[1].content).toContain(JSON.stringify([[f.churn]]));
  const [waiting] = await asA.query(api.resume.updates, {});
  const v2 = (await t.run((ctx) => ctx.db.get(waiting.versionId!)))!;
  expect(v2.layout!.bullets).toEqual([
    { text: "Reduced churn 20% in a year.", state: "pinned", roleKey: "acme", factIds: [f.churn], kept: true },
    { text: "Built a team of six.", state: "hidden", roleKey: "acme", factIds: [f.team], kept: true },
  ]);
  expect(keptOf(v2.layout)).toEqual({ pins: 1, hidden: 1, order: true });
  // Its own order: the playbook line first, then the others as before.
  expect(arrange(v2.doc!, v2.layout).doc.experience[0].bullets.map((b) => b.text)).toEqual(["Authored the onboarding playbook.", "Reduced churn 20% in a year."]);
  await asA.mutation(api.resume.keep, { id: v2._id });
  // History says what it kept.
  expect((await asA.query(api.resume.history, {})).versions[0].kept).toEqual({ pins: 1, hidden: 1, order: true });
  // And the order carries again into the version after.
  await asA.mutation(api.resume.rewrite, {});
  await settle(
    doc("v3", [
      { text: "Churn down a fifth.", factIds: [f.churn] },
      { text: "Playbook for onboarding.", factIds: [f.playbook] },
    ]),
  );
  const [again] = await asA.query(api.resume.updates, {});
  const v3 = (await t.run((ctx) => ctx.db.get(again.versionId!)))!;
  expect(arrange(v3.doc!, v3.layout).doc.experience[0].bullets.map((b) => b.text)).toEqual(["Playbook for onboarding.", "Churn down a fifth."]);
});

test("carryOver matches the same words first, then the line sharing the most facts, one choice per line", () => {
  const from: ResumeDoc = { summary: "", experience: [{ employer: "A", title: "T", roleKey: "a", bullets: [{ text: "x", factIds: ["1", "2"] }] }], skills: [] };
  const to: ResumeDoc = {
    summary: "",
    experience: [{ employer: "A", title: "T", roleKey: "a", bullets: [{ text: "y", factIds: ["1"] }, { text: "z", factIds: ["1", "2"] }, { text: "x2", factIds: ["3"] }] }],
    skills: [],
  };
  // A pin from before facts were kept with it goes by its line's facts in the version it was set on.
  expect(carryOver(from, { roles: [], bullets: [{ text: "x", state: "pinned" }] }, to).bullets).toEqual([{ text: "z", state: "pinned", roleKey: "a", factIds: ["1", "2"], kept: true }]);
  // Nothing shares its facts: the choice goes.
  expect(carryOver(from, { roles: [], bullets: [{ text: "q", state: "hidden", factIds: ["9"] }] }, to).bullets).toEqual([]);
  // An order for a role the new version doesn't have goes.
  expect(carryOver(from, { roles: [], order: [{ roleKey: "gone", lines: [{ text: "x", factIds: ["1"] }] }] }, to).order).toEqual([]);
});

test("two roles with the same line keep their own pin, hide and order, on their own role, after Write again", async () => {
  const { t, asA, f, settle, current } = await setup();
  const same = "Led the weekly customer review.";
  const twoRoles = (summary: string) => ({
    summary,
    experience: [
      { roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [f.churn] }, { text: same, factIds: [f.team] }] },
      { roleKey: "globex", bullets: [{ text: same, factIds: [f.impl] }] },
    ],
    skills: [],
  });
  await asA.mutation(api.resume.rewrite, {});
  await settle(twoRoles("v2"));
  await asA.mutation(api.resume.keep, { id: (await asA.query(api.resume.updates, {}))[0].versionId! });
  const v = await current();
  await asA.mutation(api.resume.setBullet, { id: v.id, text: same, state: "pinned", roleKey: "acme" });
  await asA.mutation(api.resume.setBullet, { id: v.id, text: same, state: "hidden", roleKey: "globex" });
  await asA.mutation(api.resume.moveLine, { id: v.id, text: same, to: 0, roleKey: "acme" });
  const lines = (doc: ResumeDoc, layout: Parameters<typeof arrange>[1]) => arrange(doc, layout).doc.experience.map((e) => [e.roleKey, e.bullets.map((b) => b.text)]);
  const shownNow = await current();
  expect(lines(shownNow.doc!, shownNow.layout)).toEqual([
    ["acme", [same, "Cut churn by 20%."]],
    ["globex", []],
  ]);
  // The new version has the same line in both roles: each choice stays in its own role.
  await asA.mutation(api.resume.rewrite, {});
  await settle(twoRoles("v3"));
  const id = (await asA.query(api.resume.updates, {}))[0].versionId!;
  const v3 = (await t.run((ctx) => ctx.db.get(id)))!;
  expect(v3.layout!.bullets).toEqual([
    { text: same, state: "pinned", roleKey: "acme", factIds: [f.team], kept: true },
    { text: same, state: "hidden", roleKey: "globex", factIds: [f.impl], kept: true },
  ]);
  expect(v3.layout!.order).toEqual([{ roleKey: "acme", lines: [{ text: same, factIds: [f.team] }, { text: "Cut churn by 20%.", factIds: [f.churn] }], kept: true }]);
  expect(lines(v3.doc!, v3.layout)).toEqual([
    ["acme", [same, "Cut churn by 20%."]],
    ["globex", []],
  ]);
  // A choice never moves to another role by shared words or facts: with its own role's line gone, it goes.
  const without = { ...v3.doc!, experience: [v3.doc!.experience[0], { ...v3.doc!.experience[1], bullets: [] }] };
  expect(carryOver(v3.doc!, { roles: [], bullets: [{ text: same, state: "hidden", roleKey: "globex", factIds: [f.impl, f.team] }] }, without).bullets).toEqual([]);
});

test("length: lines shown and pages, past the chosen length, and the note before adding a line", () => {
  expect([1, 14, 15, 16, 17, 20, 25, 26, 35].map(pagesFor)).toEqual([1, 1, 1, 1.25, 1.25, 1.5, 2, 2.25, 3]);
  expect(lengthLine(14, "one")).toEqual({ text: "14 lines · about 1 page", over: false });
  expect(lengthLine(15, "one")).toEqual({ text: "15 lines · about 1 page", over: false });
  expect(lengthLine(17, "one")).toEqual({ text: "17 lines · about 1¼ pages, past one page", over: true });
  expect(lengthLine(25, "two")).toEqual({ text: "25 lines · about 2 pages", over: false });
  expect(lengthLine(26, "two")).toEqual({ text: "26 lines · about 2¼ pages, past two pages", over: true });
  expect(lengthLine(41, "full")).toEqual({ text: "41 lines · about 3¾ pages", over: false });
  expect(roomNote(12, "one")).toBeNull();
  expect(roomNote(13, "one")).toBe("One page fits about 15 lines and this resume has 13. Adding more than two runs past a page.");
  expect(roomNote(14, "one")).toBe("One page fits about 15 lines and this resume has 14. Adding more than one runs past a page.");
  expect(roomNote(15, "one")).toBe("One page fits about 15 lines and this resume has 15. Adding a line runs past a page.");
  expect(roomNote(17, "one")).toBe("One page fits about 15 lines and this resume has 17. It already runs past a page.");
  expect(roomNote(24, "two")).toBe("Two pages fit about 25 lines and this resume has 24. Adding more than one runs past two pages.");
  expect(roomNote(40, "full")).toBeNull();
  // Lines shown: hidden ones and a folded role's dropped lines don't count; projects' do.
  const doc: ResumeDoc = {
    summary: "",
    experience: [
      { employer: "A", title: "T", roleKey: "a", bullets: [{ text: "1", factIds: [] }, { text: "2", factIds: [] }] },
      { employer: "B", title: "U", roleKey: "b", start: "2010", bullets: [{ text: "3", factIds: [] }] },
    ],
    projects: [{ projectKey: "p", name: "P", bullets: [{ text: "4", factIds: [] }] }],
    skills: [],
  };
  expect(shownLines(arrange(doc, { roles: [{ roleKey: "b", fold: { into: "next", bullets: "drop" } }], bullets: [{ text: "1", state: "hidden" }] }).doc)).toBe(2);
});
