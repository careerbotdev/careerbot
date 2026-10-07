import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import { markOf } from "./resumeBasis";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "77".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

const CHURN = "Cut churn by 20%.";
const DEMOS = "Ran 30 demos a month.";
const HIRED = "Hired 4 CSMs.";

// A workspace whose documents cite three approved facts: the base resume (current and an older version), a direction
// resume, a pursuit being prepared (its tailored resume, cover letter and answers) and a pursuit already sent.
async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
    for (const task of ["resume", "letter"] as const) await ctx.db.insert("aiSettings", { workspaceId: w, task, model: "test/model" });
    return { u, w };
  });
  const asA = t.withIdentity({ subject: `${u}|s` });
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "acme", sources: [], at: 0, data: { employer: "Acme", title: "Head of CS", start: "2021-01" } });
    const fact = (text: string) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text }, sources: [], at: 0 });
    const churn = await fact(CHURN);
    const demos = await fact(DEMOS);
    const hired = await fact(HIRED);
    const cs = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0, data: { name: "Customer Success" } });
    const doc = (bullets: { text: string; factIds: string[] }[]) => ({ summary: "S", experience: [{ roleKey: "acme", employer: "Acme", title: "Head of CS", bullets }], skills: [] });
    const all = [
      { text: "Cut churn 20% across the book.", factIds: [churn] },
      { text: "Ran 30 demos a month.", factIds: [demos] },
      { text: "Hired four CSMs.", factIds: [hired] },
    ];
    const writtenFrom = { roles: [], facts: [churn, demos, hired].map((id, i) => ({ id, mark: markOf([CHURN, DEMOS, HIRED][i]) })), projects: [], insights: [] };
    await ctx.db.insert("resumes", { workspaceId: w, doc: doc(all.slice(0, 1)), writtenFrom, model: "m", at: 0 });
    const base = await ctx.db.insert("resumes", { workspaceId: w, doc: doc(all), writtenFrom, model: "m", at: 1 });
    const direction = await ctx.db.insert("resumes", { workspaceId: w, doc: doc(all.slice(1, 2)), directionId: cs, model: "m", at: 1 });
    const company = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", found: [], at: 0 });
    const posting = (externalId: string, title: string) =>
      ctx.db.insert("postings", { workspaceId: w, companyId: company, provider: "lever", externalId, url: `https://jobs.lever.co/beta/${externalId}`, title, remote: false, firstSeen: 0, lastSeen: 0 });
    const pursuit = (postingId: Id<"postings">, title: string) =>
      ctx.db.insert("pursuits", {
        workspaceId: w,
        postingId,
        companyId: company,
        title,
        company: "Beta",
        status: "preparing",
        answers: [{ question: "Why you?", answer: "I cut churn by a fifth.", factIds: [churn], at: 1 }],
        timeline: [{ at: 1, event: "started" }],
        changedAt: 1,
        at: 1,
      });
    const letter = (pursuitId: Id<"pursuits">) =>
      ctx.db.insert("letters", { workspaceId: w, pursuitId, paragraphs: [{ text: "Dear Beta,", factIds: [] }, { text: "At Acme I cut churn by 20%.", factIds: [churn] }], at: 1 });
    const open = await posting("1", "Onboarding Manager");
    const openPursuit = await pursuit(open, "Onboarding Manager");
    const tailored = await ctx.db.insert("resumes", { workspaceId: w, doc: doc(all.slice(0, 2)), directionId: cs, posting: "Onboarding Manager", postingId: open, model: "m", at: 1 });
    const openLetter = await letter(openPursuit);
    const sentPosting = await posting("2", "CS Lead");
    const sentPursuit = await pursuit(sentPosting, "CS Lead");
    const sentResume = await ctx.db.insert("resumes", { workspaceId: w, doc: doc(all.slice(0, 1)), directionId: cs, posting: "CS Lead", postingId: sentPosting, model: "m", at: 1 });
    const sentLetter = await letter(sentPursuit);
    return { churn, demos, cs, base, direction, tailored, openPursuit, openLetter, sentPursuit, sentResume, sentLetter };
  });
  await asA.mutation(api.pursuits.setStatus, { id: ids.sentPursuit, status: "applied" });
  vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
  // Runs what's scheduled with the model replying `content`.
  const run = async (content: unknown) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(content)));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  const listed = async () => (await asA.query(api.factChanges.documents, {})).map((d) => [d.target.kind, d.target.id, d.lines, d.rejected]);
  return { t, asA, run, listed, ...ids };
}

test("Editing a cited fact marks exactly the documents in use that cite it, never one sent", async () => {
  const s = await setup();
  expect(await s.listed()).toEqual([]);
  await s.asA.mutation(api.extract.edit, { id: s.churn, text: "Cut churn by 25%." });
  expect(await s.listed()).toEqual([
    ["resume", s.base, 1, false],
    ["resume", s.tailored, 1, false],
    ["letter", s.openLetter, 1, false],
    ["answers", s.openPursuit, 1, false],
  ]);
  const base = await s.asA.query(api.factChanges.forDocument, { target: { kind: "resume", id: s.base } });
  expect(base?.stale).toEqual([
    { index: 0, text: "Cut churn 20% across the book.", theirs: null, factIds: [s.churn], change: "edited", facts: [{ id: s.churn, now: "Cut churn by 25%.", was: CHURN }] },
  ]);
  // Sent as it is: nothing offered, and nothing to start.
  expect(await s.asA.query(api.factChanges.forDocument, { target: { kind: "resume", id: s.sentResume } })).toBeNull();
  expect(await s.asA.query(api.factChanges.forDocument, { target: { kind: "letter", id: s.sentLetter } })).toBeNull();
  await expect(s.asA.mutation(api.factChanges.update, { target: { kind: "letter", id: s.sentLetter } })).rejects.toThrow("sent as it is");
  // Undoing the edit puts the fact back as the documents have it.
  await s.asA.mutation(api.extract.revertWording, { id: s.churn });
  expect(await s.listed()).toEqual([]);
});

test("Rejecting a cited fact marks exactly the documents that cite it", async () => {
  const s = await setup();
  await s.asA.mutation(api.extract.review, { id: s.demos, status: "rejected", note: "Not true any more" });
  expect(await s.listed()).toEqual([
    ["resume", s.base, 1, true],
    ["resume", s.direction, 1, true],
    ["resume", s.tailored, 1, true],
  ]);
  const direction = await s.asA.query(api.factChanges.forDocument, { target: { kind: "resume", id: s.direction } });
  expect(direction?.stale.map((x) => [x.text, x.change, x.facts])).toEqual([["Ran 30 demos a month.", "rejected", [{ id: s.demos, now: null, was: DEMOS }]]]);
});

test("Applying an update changes only the affected lines, keeps their own words unless chosen, and leaves what was sent alone", async () => {
  const s = await setup();
  const sentBefore = await s.t.run(async (ctx) => ({ pursuit: (await ctx.db.get(s.sentPursuit))!.sent, resume: (await ctx.db.get(s.sentResume))!.doc, letters: (await ctx.db.query("letters").collect()).length }));
  // A line of the tailored resume in their own words from before the fact changed (written before words kept marks).
  await s.t.run((ctx) => ctx.db.patch(s.tailored, { layout: { roles: [], words: [{ text: "Cut churn 20% across the book.", to: "Brought churn down by a fifth." }] } }));
  await s.asA.mutation(api.extract.edit, { id: s.churn, text: "Cut churn by 25%." });
  await s.asA.mutation(api.extract.review, { id: s.demos, status: "rejected" });

  // The base resume: the edited fact's line reworded, the rejected fact's line gone, the rest as it was.
  const base = { kind: "resume" as const, id: s.base };
  expect(await s.asA.mutation(api.factChanges.update, { target: base })).not.toBeNull();
  await s.run({ lines: [{ index: 0, text: "Cut churn 25% across the book.", factIds: [s.churn] }, { index: 1, text: "", factIds: [] }] });
  const offered = await s.asA.query(api.factChanges.forDocument, { target: base });
  expect(offered?.update?.lines.map((l) => [l.before, l.text, l.change, l.use])).toEqual([
    ["Cut churn 20% across the book.", "Cut churn 25% across the book.", "edited", true],
    ["Ran 30 demos a month.", "", "rejected", true],
  ]);
  await s.asA.mutation(api.factChanges.apply, { target: base });
  const after = await s.t.run(async (ctx) => (await ctx.db.get(s.base))!);
  expect(after.doc!.experience[0].bullets).toEqual([
    { text: "Cut churn 25% across the book.", factIds: [s.churn] },
    { text: "Hired four CSMs.", factIds: [expect.any(String)] },
  ]);
  expect(after.writtenFrom!.facts.map((f) => [f.id, f.mark])).toEqual([
    [s.churn, markOf("Cut churn by 25%.")],
    [expect.any(String), markOf(HIRED)],
  ]);
  expect((await s.asA.query(api.factChanges.forDocument, { target: base }))?.stale).toEqual([]);

  // The tailored resume: their own words stay unless they choose the new line, and a line they keep stays flagged, on
  // the fact as it read when they wrote it, until they edit their words.
  const tailored = { kind: "resume" as const, id: s.tailored };
  await s.asA.mutation(api.factChanges.update, { target: tailored });
  await s.run({ lines: [{ index: 0, text: "Cut churn 25% across the book.", factIds: [s.churn] }, { index: 1, text: "", factIds: [] }] });
  expect((await s.asA.query(api.factChanges.forDocument, { target: tailored }))?.update?.lines.map((l) => [l.theirs, l.use])).toEqual([
    ["Brought churn down by a fifth.", false],
    [null, true],
  ]);
  await s.asA.mutation(api.factChanges.apply, { target: tailored });
  const t = await s.t.run(async (ctx) => (await ctx.db.get(s.tailored))!);
  expect(t.doc!.experience[0].bullets).toEqual([{ text: "Cut churn 20% across the book.", factIds: [s.churn] }]);
  expect(t.layout?.words?.map((w) => [w.text, w.to])).toEqual([["Cut churn 20% across the book.", "Brought churn down by a fifth."]]);
  const kept = (await s.asA.query(api.factChanges.forDocument, { target: tailored }))!;
  expect([kept.update, kept.stale.map((x) => [x.theirs, x.change, x.facts])]).toEqual([null, [["Brought churn down by a fifth.", "edited", [{ id: s.churn, now: "Cut churn by 25%.", was: CHURN }]]]]);
  // Their words edited to match: the line reads the fact as it is now.
  await s.asA.mutation(api.resume.setWords, { id: s.tailored, text: "Cut churn 20% across the book.", to: "Brought churn down by a quarter." });
  expect((await s.asA.query(api.factChanges.forDocument, { target: tailored }))?.stale).toEqual([]);

  // The cover letter: a new version with only the paragraph on the edited fact changed.
  const letter = { kind: "letter" as const, id: s.openLetter };
  await s.asA.mutation(api.factChanges.update, { target: letter });
  await s.run({ lines: [{ index: 0, text: "At Acme I cut churn by 25%.", factIds: [s.churn] }] });
  await s.asA.mutation(api.factChanges.apply, { target: letter });
  const versions = await s.asA.query(api.letters.forPursuit, { pursuitId: s.openPursuit });
  expect(versions.versions.map((v) => v.paragraphs.map((p) => p.text))).toEqual([
    ["Dear Beta,", "At Acme I cut churn by 25%."],
    ["Dear Beta,", "At Acme I cut churn by 20%."],
  ]);
  expect(await s.listed()).toEqual([
    ["resume", s.direction, 1, true],
    ["answers", s.openPursuit, 1, false],
  ]);

  // What was sent is exactly as it was.
  const sentAfter = await s.t.run(async (ctx) => ({ pursuit: (await ctx.db.get(s.sentPursuit))!.sent, resume: (await ctx.db.get(s.sentResume))!.doc, letters: (await ctx.db.query("letters").collect()).length }));
  expect(sentAfter).toEqual({ ...sentBefore, letters: sentBefore.letters + 1 });
});

test("A fact edited or rejected after the lines were written: applying is refused and changes nothing", async () => {
  const s = await setup();
  const base = { kind: "resume" as const, id: s.base };
  const read = () => s.t.run(async (ctx) => (await ctx.db.get(s.base))!);
  await s.asA.mutation(api.extract.edit, { id: s.churn, text: "Cut churn by 25%." });
  await s.asA.mutation(api.factChanges.update, { target: base });
  await s.run({ lines: [{ index: 0, text: "Cut churn 25% across the book.", factIds: [s.churn] }] });
  const before = await read();

  // Edited again before Apply.
  await s.asA.mutation(api.extract.edit, { id: s.churn, text: "Cut churn by 30%." });
  await expect(s.asA.mutation(api.factChanges.apply, { target: base })).rejects.toThrow("A fact changed since these lines were written. Update them again.");
  expect(await read()).toEqual(before);

  // Written again, then the fact rejected before Apply.
  await s.asA.mutation(api.factChanges.update, { target: base });
  await s.run({ lines: [{ index: 0, text: "Cut churn 30% across the book.", factIds: [s.churn] }] });
  expect((await s.asA.query(api.factChanges.forDocument, { target: base }))?.update?.lines.map((l) => l.text)).toEqual(["Cut churn 30% across the book."]);
  await s.asA.mutation(api.extract.review, { id: s.churn, status: "rejected" });
  await expect(s.asA.mutation(api.factChanges.apply, { target: base })).rejects.toThrow("A fact changed since these lines were written. Update them again.");
  expect(await read()).toEqual(before);
});

test("A fact rejected when the lines were written and approved again before Apply: applying is refused and changes nothing", async () => {
  const s = await setup();
  const base = { kind: "resume" as const, id: s.base };
  const read = () => s.t.run(async (ctx) => (await ctx.db.get(s.base))!);
  await s.asA.mutation(api.extract.review, { id: s.demos, status: "rejected" });
  await s.asA.mutation(api.factChanges.update, { target: base });
  await s.run({ lines: [{ index: 0, text: "", factIds: [] }] });
  expect((await s.asA.query(api.factChanges.forDocument, { target: base }))?.update?.lines.map((l) => [l.before, l.text])).toEqual([["Ran 30 demos a month.", ""]]);
  const before = await read();
  await s.asA.mutation(api.extract.review, { id: s.demos, status: "approved" });
  await expect(s.asA.mutation(api.factChanges.apply, { target: base })).rejects.toThrow("A fact changed since these lines were written. Update them again.");
  expect(await read()).toEqual(before);
});
