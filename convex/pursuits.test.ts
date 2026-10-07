import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { remindersOf, snoozeDay } from "./pursuitSteps";
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

const doc = (line: string) => ({ summary: "S", experience: [{ roleKey: "acme", employer: "Acme", title: "Head of CS", bullets: [{ text: line, factIds: [] as string[] }] }], skills: [] });

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
      for (const task of ["letter", "ask", "extract"] as const) await ctx.db.insert("aiSettings", { workspaceId: w, task, model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const w = a.w;
  const ids = await t.run(async (ctx) => {
    const direction = (name: string) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0, data: { name } });
    const cs = await direction("Customer Success");
    const se = await direction("Solutions Consulting");
    await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "acme", sources: [], at: 0, data: { employer: "Acme", title: "Head of CS", start: "2021-01" } });
    const fact = (text: string, status: "approved" | "proposed" | "rejected") => ctx.db.insert("items", { workspaceId: w, kind: "fact", status, roleKey: "acme", data: { text }, sources: [], at: 0 });
    const approvedFact = await fact("Cut churn by 20%.", "approved");
    const proposedFact = await fact("Doubled revenue.", "proposed");
    await fact("Ran a marathon.", "rejected");
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", found: [], at: 0 });
    const postingId = await ctx.db.insert("postings", {
      workspaceId: w, companyId: c, provider: "lever", externalId: "1", url: "https://jobs.lever.co/beta/1", title: "Onboarding Manager", remote: false, firstSeen: 0, lastSeen: 0,
      fit: [{ directionId: cs, level: "strong", score: 82, method: "model" }, { directionId: se, level: "some", score: 55, method: "model" }],
    });
    await ctx.db.insert("postingTexts", { workspaceId: w, postingId, text: "Run onboarding for mid-market customers." });
    const resumeId = await ctx.db.insert("resumes", { workspaceId: w, doc: doc("Ran onboarding."), model: "m", directionId: cs, posting: "Onboarding Manager", postingId, at: 1 });
    return { cs, se, postingId, resumeId, approvedFact, proposedFact };
  });
  // Runs what's scheduled with the model replying `content`; returns what was sent to it.
  const run = async (content: unknown) => {
    const f = vi.fn(async () => reply(content));
    vi.stubGlobal("fetch", f);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body) as { messages: { role: string; content: string }[] });
  };
  return { t, asA, asB, w, run, ...ids };
}

test("Start makes one pursuit per role, for the direction it was opened from (else its best), keeping its score; other workspaces can't see or touch it", async () => {
  const { asA, asB, postingId, se } = await setup();
  await expect(asB.mutation(api.pursuits.start, { postingId })).rejects.toThrow("Not found");
  const id = await asA.mutation(api.pursuits.start, { postingId, directionId: se });
  expect(await asA.mutation(api.pursuits.start, { postingId })).toBe(id);
  const p = await asA.query(api.pursuits.get, { id });
  expect(p).toMatchObject({ title: "Onboarding Manager", company: "Beta", status: "preparing", direction: { id: se, name: "Solutions Consulting" }, score: 55, level: "some", sent: null });
  expect(p.timeline.map((e) => e.event)).toEqual(["started"]);
  expect(await asA.query(api.pursuits.forPosting, { postingId })).toMatchObject({ id, status: "preparing" });

  await expect(asB.query(api.pursuits.get, { id })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.pursuits.setStatus, { id, status: "applied" })).rejects.toThrow("Not found");
  expect(await asB.query(api.pursuits.forPosting, { postingId })).toBeNull();

  // Without a direction asked for, its best fit.
  const { asA: other, postingId: p2 } = await setup();
  const best = await other.query(api.pursuits.get, { id: await other.mutation(api.pursuits.start, { postingId: p2 }) });
  expect([best.direction?.name, best.score]).toEqual(["Customer Success", 82]);
});

test("status changes go on the dated timeline; Closed needs a reason; Applied keeps its first date", async () => {
  const { asA, postingId } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await expect(asA.mutation(api.pursuits.setStatus, { id, status: "closed" })).rejects.toThrow("why it closed");
  vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  const appliedAt = new Date("2026-09-03T12:00:00Z").getTime();
  // Setting the same status again changes nothing.
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  await asA.mutation(api.pursuits.setStatus, { id, status: "interviewing" });
  await asA.mutation(api.pursuits.setNextStep, { id, text: "  Send the case study  " });
  await asA.mutation(api.pursuits.setStatus, { id, status: "closed", reason: "rejected" });
  const p = await asA.query(api.pursuits.get, { id });
  expect(p).toMatchObject({ status: "closed", closedReason: "rejected", appliedAt, nextStep: "Send the case study", changedAt: new Date("2026-09-10T12:00:00Z").getTime() });
  expect([...p.timeline].reverse().map((e) => [e.event, e.status ?? e.text ?? null, e.reason ?? null])).toEqual([
    ["started", null, null],
    ["status", "applied", null],
    ["status", "interviewing", null],
    ["nextStep", "Send the case study", null],
    ["status", "closed", "rejected"],
  ]);
  // Reopened as Applied: the first date stays.
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  expect((await asA.query(api.pursuits.get, { id })).appliedAt).toBe(appliedAt);
});

test("a pursuit can be both Contacted and Applied, each keeping its first date; its path joins the choice with what was done; Contacted keeps nothing as sent", async () => {
  const { asA, asB, postingId } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  expect((await asA.query(api.pursuits.get, { id })).path).toBeNull();
  await expect(asB.mutation(api.pursuits.setPath, { id, path: "outreach" })).rejects.toThrow("Not found");
  await asA.mutation(api.pursuits.setPath, { id, path: "outreach" });
  expect(await asA.query(api.pursuits.get, { id })).toMatchObject({ path: "outreach", chosenPath: "outreach" });
  vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
  await asA.mutation(api.pursuits.setStatus, { id, status: "contacted" });
  expect((await asA.query(api.pursuits.get, { id })).sent).toBeNull();
  vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  await asA.mutation(api.pursuits.setStatus, { id, status: "contacted" });
  const p = await asA.query(api.pursuits.get, { id });
  expect(p).toMatchObject({ status: "contacted", contactedAt: new Date("2026-09-03T12:00:00Z").getTime(), appliedAt: new Date("2026-09-05T12:00:00Z").getTime(), path: "both", chosenPath: "outreach", reached: "applied" });
  expect(p.sent).not.toBeNull();
  // Clearing the choice leaves what was done.
  await asA.mutation(api.pursuits.setPath, { id, path: null });
  expect(await asA.query(api.pursuits.get, { id })).toMatchObject({ path: "both", chosenPath: null });
  expect(p.timeline.filter((e) => e.event === "path").map((e) => e.text)).toEqual(["outreach"]);
});

test("marking Applied keeps the resume exactly as it showed; later changes to it, or newer versions, don't touch what was sent", async () => {
  const { t, w, asA, postingId, resumeId, cs } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  const sent = (await asA.query(api.pursuits.get, { id })).sent!;
  expect(sent.resumeId).toBe(resumeId);
  expect(sent.resume?.experience[0].bullets.map((b) => b.text)).toEqual(["Ran onboarding."]);

  // Hiding the line on the resume, and a newer tailored version, leave the sent one as it was.
  await asA.mutation(api.resume.setBullet, { id: resumeId, text: "Ran onboarding.", state: "hidden" });
  await t.run((ctx) => ctx.db.insert("resumes", { workspaceId: w, doc: doc("Newer line."), model: "m", directionId: cs, posting: "Onboarding Manager", postingId, at: 2 }));
  await asA.mutation(api.pursuits.setStatus, { id, status: "interviewing" });
  const after = await asA.query(api.pursuits.get, { id });
  expect(after.sent).toEqual(sent);
  await expect(asA.mutation(api.pursuits.setResume, { id, resumeId })).rejects.toThrow("sent");

  // Back to Preparing lets it go; Applied again keeps the resume as it shows then.
  await asA.mutation(api.pursuits.setStatus, { id, status: "preparing" });
  expect((await asA.query(api.pursuits.get, { id })).sent).toBeNull();
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  expect((await asA.query(api.pursuits.get, { id })).sent?.resume?.experience[0].bullets.map((b) => b.text)).toEqual(["Newer line."]);
});

test("the inbox lists a workspace's own pursuits, last activity first, with whether a resume is tailored to the role", async () => {
  const { t, w, asA, asB, postingId } = await setup();
  const other = await t.run(async (ctx) => {
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Gamma", found: [], at: 0 });
    return ctx.db.insert("postings", { workspaceId: w, companyId: c, provider: "lever", externalId: "2", url: "u", title: "CS Lead", remote: false, firstSeen: 0, lastSeen: 0 });
  });
  const first = await asA.mutation(api.pursuits.start, { postingId });
  vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
  await asA.mutation(api.pursuits.start, { postingId: other });
  vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
  await asA.mutation(api.notes.add, { subject: { kind: "pursuit", id: first }, text: "Call Dana" });
  expect((await asA.query(api.pursuits.list, {})).pursuits.map((p) => [p.title, p.hasResume])).toEqual([["Onboarding Manager", true], ["CS Lead", false]]);
  expect((await asB.query(api.pursuits.list, {})).pursuits).toEqual([]);
});

test("a cover letter rests only on the approved record: proposed and rejected facts never reach the writer, citations of anything else are dropped", async () => {
  const { asA, asB, run, postingId, approvedFact, proposedFact } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await expect(asB.mutation(api.letters.write, { pursuitId: id })).rejects.toThrow("Not found");
  await asA.mutation(api.letters.write, { pursuitId: id });
  const sent = await run({ paragraphs: [{ text: "I cut churn by 20% at Acme.", factIds: [approvedFact, proposedFact, "made-up"] }, { text: "Thanks, Sam", factIds: [] }] });
  const prompt = sent[0].messages[1].content;
  expect(prompt).toContain("Cut churn by 20%.");
  expect(prompt).toContain("Run onboarding for mid-market customers.");
  expect(prompt).toContain("Ran onboarding.");
  expect(prompt).not.toContain("Doubled revenue.");
  expect(prompt).not.toContain("Ran a marathon.");
  const letters = await asA.query(api.letters.forPursuit, { pursuitId: id });
  expect(letters.versions[0].paragraphs).toEqual([{ text: "I cut churn by 20% at Acme.", factIds: [approvedFact] }, { text: "Thanks, Sam", factIds: [] }]);
  expect(letters.facts).toEqual({ [approvedFact]: "Cut churn by 20%." });

  // Their edit is a new version; a paragraph kept word for word keeps its facts.
  await asA.mutation(api.letters.edit, { pursuitId: id, text: "I cut churn by 20% at Acme.\n\nBest,\nSam" });
  expect((await asA.query(api.letters.forPursuit, { pursuitId: id })).versions.map((l) => [l.edited, l.paragraphs.map((x) => x.factIds.length)])).toEqual([[true, [1, 0]], [false, [1, 0]]]);
  expect((await asA.query(api.pursuits.get, { id })).timeline.filter((e) => e.event === "letter").map((e) => e.text)).toEqual(["edited", "written"]);
});

test("marking Applied keeps the cover letter as sent; it can't be rewritten or edited after", async () => {
  const { asA, run, postingId } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await asA.mutation(api.letters.write, { pursuitId: id });
  await run({ paragraphs: [{ text: "Dear team,", factIds: [] }, { text: "Hire me.", factIds: [] }] });
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  expect((await asA.query(api.pursuits.get, { id })).sent?.letter).toBe("Dear team,\n\nHire me.");
  await expect(asA.mutation(api.letters.write, { pursuitId: id })).rejects.toThrow("sent");
  await expect(asA.mutation(api.letters.edit, { pursuitId: id, text: "Changed" })).rejects.toThrow("sent");
});

test("saved answers: added, changed (losing the facts they rested on only when the answer changes) and removed, workspace-checked", async () => {
  const { asA, asB, postingId } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await expect(asA.mutation(api.pursuits.saveAnswer, { id, question: " ", answer: "x" })).rejects.toThrow("question");
  await asA.mutation(api.pursuits.saveAnswer, { id, question: "Why us?", answer: "Your onboarding problem is mine." });
  await expect(asB.mutation(api.pursuits.saveAnswer, { id, question: "Why us?", answer: "x" })).rejects.toThrow("Not found");
  const [a] = (await asA.query(api.pursuits.get, { id })).answers;
  await asA.mutation(api.pursuits.saveAnswer, { id, at: a.at, question: "Why Beta?", answer: "Your onboarding problem is mine." });
  expect((await asA.query(api.pursuits.get, { id })).answers.map((x) => x.question)).toEqual(["Why Beta?"]);
  await asA.mutation(api.pursuits.removeAnswer, { id, at: a.at });
  expect((await asA.query(api.pursuits.get, { id })).answers).toEqual([]);
});

test("Ask about this role answers from the approved record only, cites approved facts, and Keep saves the answer under its question", async () => {
  const { asA, asB, run, postingId, approvedFact, proposedFact } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await expect(asB.mutation(api.ask.ask, { pursuitId: id, text: "Why us?" })).rejects.toThrow("Not found");
  await asA.mutation(api.ask.ask, { pursuitId: id, text: "Why do you want to work here?" });
  await expect(asA.mutation(api.ask.ask, { pursuitId: id, text: "And?" })).rejects.toThrow("Wait");
  const sent = await run({ answer: "Your onboarding is where I cut churn by 20%.", factIds: [approvedFact, proposedFact], learned: [] });
  expect(sent[0].messages[1].content).toContain("Cut churn by 20%.");
  expect(sent[0].messages[1].content).not.toContain("Doubled revenue.");
  expect(sent[0].messages[1].content).not.toContain("Ran a marathon.");
  const convo = await asA.query(api.ask.conversation, { pursuitId: id });
  expect(convo.messages.map((m) => [m.from, m.factIds, m.learned])).toEqual([["you", [], false], ["careerbot", [approvedFact], false]]);
  await expect(asB.query(api.ask.conversation, { pursuitId: id })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.ask.keep, { messageId: convo.messages[1].id })).rejects.toThrow("Not found");
  await asA.mutation(api.ask.keep, { messageId: convo.messages[1].id });
  await asA.mutation(api.ask.keep, { messageId: convo.messages[1].id });
  expect((await asA.query(api.pursuits.get, { id })).answers.map((a) => [a.question, a.answer, a.factIds])).toEqual([["Why do you want to work here?", "Your onboarding is where I cut churn by 20%.", [approvedFact]]]);

  // The earlier turns go with the next question.
  await asA.mutation(api.ask.ask, { pursuitId: id, text: "Shorter?" });
  const next = await run({ answer: "I cut churn 20%.", factIds: [], learned: [] });
  expect(next[0].messages[1].content).toContain("Why do you want to work here?");
});

test("a message that says something new about them becomes a note read into the record as a proposed fact to review, never used as approved", async () => {
  const { t, w, asA, postingId } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  const said = "Do I mention that I also ran the Zendesk migration at Acme?";
  await asA.mutation(api.ask.ask, { pursuitId: id, text: said });
  // The answer's run, then the note's reading, each with its own reply.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { messages: { content: string }[] };
      return body.messages[0].content.includes("You help someone applying")
        ? reply({ answer: "Yes, once it's in your record.", factIds: [], learned: ["ran the Zendesk migration at Acme"] })
        : reply({ roles: [], facts: [{ roleKey: "acme", text: "Ran the Zendesk migration.", quotes: ["ran the Zendesk migration at Acme"] }], context: [] });
    }),
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await asA.query(api.ask.conversation, { pursuitId: id })).messages[0].learned).toBe(true);
  const [note, facts] = await t.run(async (ctx) => [
    (await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", w)).collect()).map((n) => [n.kind, n.body]),
    (await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", w).eq("kind", "fact")).collect()).map((f) => [f.status, f.kind === "fact" ? f.data.text : ""]),
  ]);
  expect(note).toEqual([["note", said]]);
  expect(facts).toContainEqual(["proposed", "Ran the Zendesk migration."]);
  expect(facts.filter(([s]) => s === "approved").map(([, x]) => x)).toEqual(["Cut churn by 20%."]);
});

test("reminders: the interview day and each done go on the timeline; the rules are the workspace's own, all on until switched off", async () => {
  const { asA, asB, postingId } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await expect(asA.mutation(api.pursuits.setInterview, { id, date: "Oct 3" })).rejects.toThrow("date like");
  await asA.mutation(api.pursuits.setInterview, { id, date: "2026-10-03" });
  await expect(asB.mutation(api.pursuits.done, { id, rule: "prepare" })).rejects.toThrow("Not found");
  await asA.mutation(api.pursuits.done, { id, rule: "prepare" });
  const p = await asA.query(api.pursuits.get, { id });
  expect([p.interviewAt, p.timeline.slice(0, 2).map((e) => e.event)]).toEqual(["2026-10-03", ["prepared", "interview"]]);
  expect(await asA.query(api.pursuits.reminderRules, {})).toEqual({ followUp: true, prepare: true, stale: true });
  await asA.mutation(api.pursuits.setReminderRule, { rule: "stale", on: false });
  expect(await asA.query(api.pursuits.reminderRules, {})).toEqual({ followUp: true, prepare: true, stale: false });
  expect(await asB.query(api.pursuits.reminderRules, {})).toEqual({ followUp: true, prepare: true, stale: true });
});

test("a snoozed reminder stays off Today until its day, then comes back with the same step; the timeline records it and undo brings it back at once", async () => {
  const { asA, asB, postingId } = await setup();
  const id = await asA.mutation(api.pursuits.start, { postingId });
  await asA.mutation(api.pursuits.setStatus, { id, status: "applied" });
  const due = async (day: number) => {
    const now = new Date(2026, 8, day, 9).getTime();
    vi.setSystemTime(now);
    const { pursuits, rules } = await asA.query(api.pursuits.list, {});
    return remindersOf(pursuits[0], now, rules).map((r) => r.text);
  };
  expect(await due(10)).toEqual(["No news for 9 days"]);
  await expect(asB.mutation(api.pursuits.snooze, { id, rule: "followUp", until: "2026-09-13" })).rejects.toThrow("Not found");
  await asA.mutation(api.pursuits.snooze, { id, rule: "followUp", until: snoozeDay(Date.now(), 3) });
  expect(await due(10)).toEqual([]);
  expect(await due(12)).toEqual([]);
  // Snoozing isn't activity: on its day the quiet still counts from the last change.
  expect(await due(13)).toEqual(["No news for 12 days"]);
  expect((await asA.query(api.pursuits.get, { id })).timeline[0]).toMatchObject({ event: "snoozed", text: "2026-09-13" });

  await due(10);
  await asA.mutation(api.pursuits.snooze, { id, rule: "followUp", until: snoozeDay(Date.now(), 7) });
  expect(await due(10)).toEqual([]);
  await asA.mutation(api.pursuits.unsnooze, { id });
  expect(await due(10)).toEqual(["No news for 9 days"]);
  expect((await asA.query(api.pursuits.get, { id })).timeline.filter((e) => e.event === "snoozed")).toHaveLength(1);
});

test("outcomes by direction count contacted and applied apart, how far each pursuit got, whatever it is now, and how each closed", async () => {
  const { t, w, asA, asB, postingId } = await setup();
  const more = await t.run(async (ctx) => {
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Gamma", found: [], at: 0 });
    const posting = (externalId: string) => ctx.db.insert("postings", { workspaceId: w, companyId: c, provider: "lever", externalId, url: "u", title: `Role ${externalId}`, remote: false, firstSeen: 0, lastSeen: 0 });
    return [await posting("2"), await posting("3")];
  });
  const a = await asA.mutation(api.pursuits.start, { postingId });
  await asA.mutation(api.pursuits.setStatus, { id: a, status: "applied" });
  await asA.mutation(api.pursuits.setStatus, { id: a, status: "interviewing" });
  await asA.mutation(api.pursuits.setStatus, { id: a, status: "closed", reason: "rejected" });
  const b = await asA.mutation(api.pursuits.start, { postingId: more[0] });
  await asA.mutation(api.pursuits.setStatus, { id: b, status: "closed", reason: "withdrawn" });
  // Contacted only: not counted as applied.
  const c = await asA.mutation(api.pursuits.start, { postingId: more[1] });
  await asA.mutation(api.pursuits.setStatus, { id: c, status: "contacted" });
  expect(await asA.query(api.pursuits.byDirection, {})).toEqual([
    { direction: null, started: 2, contacted: 1, applied: 0, contactedOrApplied: 1, interviewed: 0, offers: 0, open: 1, closed: { rejected: 0, withdrawn: 1, noResponse: 0, declined: 0 } },
    { direction: "Customer Success", started: 1, contacted: 0, applied: 1, contactedOrApplied: 1, interviewed: 1, offers: 0, open: 0, closed: { rejected: 1, withdrawn: 0, noResponse: 0, declined: 0 } },
  ]);
  expect((await asA.query(api.pursuits.get, { id: a })).reached).toBe("interviewing");
  expect(await asB.query(api.pursuits.byDirection, {})).toEqual([]);
});

test("Start outreach makes a pursuit with no open role, on the Outreach path, using the direction's resume; no letter or tailoring; once per company and direction", async () => {
  const { t, asA, asB, w, cs, se, postingId } = await setup();
  const { companyId, directionResume } = await t.run(async (ctx) => ({
    companyId: (await ctx.db.get(postingId))!.companyId,
    directionResume: await ctx.db.insert("resumes", { workspaceId: w, doc: doc("Led customer success."), model: "m", directionId: se, at: 2 }),
  }));
  await expect(asB.mutation(api.pursuits.startAtCompany, { companyId })).rejects.toThrow("Not found");
  const id = await asA.mutation(api.pursuits.startAtCompany, { companyId, directionId: se });
  expect(await asA.mutation(api.pursuits.startAtCompany, { companyId, directionId: se })).toBe(id);
  expect(await asA.mutation(api.pursuits.startAtCompany, { companyId })).not.toBe(id);

  const p = await asA.query(api.pursuits.get, { id });
  expect([p.postingId, p.title, p.company, p.path, p.status, p.url, p.brief, p.resumeId]).toEqual([null, "Solutions Consulting", "Beta", "outreach", "preparing", null, null, directionResume]);
  expect(p.resume?.experience[0].bullets[0].text).toBe("Led customer success.");
  const row = (await asA.query(api.pursuits.list, {})).pursuits.find((x) => x.id === id)!;
  expect([row.postingId, row.hasResume, row.direction]).toEqual([null, true, "Solutions Consulting"]);
  await expect(asA.mutation(api.letters.write, { pursuitId: id })).rejects.toThrow("no open role");
  const tailored = await t.run(async (ctx) => (await ctx.db.query("resumes").withIndex("by_posting", (q) => q.eq("workspaceId", w).eq("postingId", postingId)).first())!._id);
  await expect(asA.mutation(api.pursuits.setResume, { id, resumeId: tailored })).rejects.toThrow("Not found");
  // Starting a role at the same company is its own pursuit; the no-role one is untouched.
  expect(await asA.mutation(api.pursuits.start, { postingId, directionId: cs })).not.toBe(id);
});
