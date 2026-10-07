import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

// A workspace with Setup done but for Google Drive, and two roles at one company to pursue.
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "sam@example.com" });
    const w = await ensureWorkspace(ctx, u);
    const other = await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "b@example.com" }));
    for (const service of ["openrouter", "apollo"] as const) await ctx.db.insert("apiKeys", { workspaceId: w, service, sealed: "x", last4: "test", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 25, apolloMonthlyCredits: 400, apolloMode: "on" });
    await ctx.db.insert("narratives", { workspaceId: w, kind: "career", title: "Keyway, 2021–2023", body: "I ran partnerships.", version: 1, updatedAt: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "k", data: { text: "Closed 40 deals." }, sources: [], at: 0 });
    const direction = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0, data: { name: "Sales Engineering" } });
    await ctx.db.insert("resumes", { workspaceId: w, text: "Base", model: "m", at: 0 });
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Anduril", found: [], at: 0, rating: { value: "excited", at: 0 } });
    const posting = (n: string) =>
      ctx.db.insert("postings", { workspaceId: w, companyId: c, provider: "lever", externalId: n, url: `https://jobs.example.com/${n}`, title: `Sales Engineer ${n}`, remote: true, firstSeen: 0, lastSeen: 0, fit: [{ directionId: direction, level: "strong", score: 86, method: "model" }] });
    return { u, w, other, direction, a: await posting("a"), b: await posting("b") };
  });
  const as = t.withIdentity({ subject: `${ids.u}|s` });
  return { t, as, ...ids };
}

test("Setup counts the Apollo key and leaves Google Drive to be connected or skipped, with Undo; the first pursuit waits for one to start", async () => {
  const { t, as, other } = await setup();
  let s = await as.query(api.today.setup, {});
  expect(Object.entries(s.steps).filter(([, x]) => !x.done).map(([k]) => k)).toEqual(["drive"]);
  expect(s.steps.apollo).toMatchObject({ done: true, detail: "Key added · 400 credits a month" });
  expect(s.firstPursuit).toBeNull();

  await as.mutation(api.today.skipStep, { step: "drive", skipped: true });
  s = await as.query(api.today.setup, {});
  expect(s.steps.drive).toMatchObject({ done: true, detail: "Skipped" });
  expect(s.skipped).toEqual(["drive"]);
  expect(await t.run(async (ctx) => (await ctx.db.get(other))?.setupSkipped ?? null)).toBeNull();

  await as.mutation(api.today.skipStep, { step: "drive", skipped: false });
  expect((await as.query(api.today.setup, {})).steps.drive.done).toBe(false);
});

test("The first pursuit ticks off from the pursuit: tailored resume, path, contacts, the outreach message sent, letter and answers, Applied (undone by going back to Preparing), then following up", async () => {
  const { t, as, w, a, direction } = await setup();
  const id = await as.mutation(api.pursuits.start, { postingId: a, directionId: direction });
  const first = async () => (await as.query(api.today.setup, {})).firstPursuit!;
  let p = await first();
  expect(p).toMatchObject({ pursuitId: id, company: "Anduril", direction: "Sales Engineering", path: null, applyUrl: "https://jobs.example.com/a" });
  expect(Object.fromEntries(Object.entries(p.steps).map(([k, x]) => [k, x.done]))).toEqual({ pursuit: true, tailor: false, path: false, contacts: false, message: false, letter: false, applied: false, followUp: false });

  await t.run(async (ctx) => {
    const req = (strength: "strong" | "partial") => ({ requirement: "r", strength, factIds: [] });
    await ctx.db.insert("resumes", { workspaceId: w, text: "Tailored", model: "m", directionId: direction, posting: "SE", postingId: a, requirements: [req("strong"), req("strong"), req("partial")], at: 1 });
    await ctx.db.insert("letters", { workspaceId: w, pursuitId: id, paragraphs: [{ text: "Dear Anduril", factIds: [] }], at: 1 });
    await ctx.db.patch(id, { answers: [{ question: "Why us?", answer: "Because.", factIds: [], at: 1 }] });
    await ctx.db.insert("contacts", { workspaceId: w, pursuitId: id, apolloId: "p1", name: "Maya Chen", hiringManager: true, draft: { subject: "Hi", text: "Hello", factIds: [], at: 1 }, at: 1 });
  });
  p = await first();
  expect(p.steps.tailor).toMatchObject({ done: true, detail: "Tailored · covers 2 of 3 requirements" });
  expect(p.steps.letter).toMatchObject({ done: true, detail: "Letter written · 1 answer kept" });
  expect(p.steps.contacts).toMatchObject({ done: true, detail: "1 contact" });
  expect(p.steps.message.done).toBe(false);

  await as.mutation(api.pursuits.setPath, { id, path: "outreach" });
  expect((await first()).steps.path).toMatchObject({ done: true, detail: "Outreach" });
  const contactId = await t.run(async (ctx) => (await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", id)).first())!._id);
  await as.mutation(api.people.markSent, { contactId });
  p = await first();
  expect(p.steps.message).toMatchObject({ done: true, detail: "Sent to Maya Chen", at: Date.now() });
  // A follow-up is due a week after the first outreach message, even once they apply as well.
  expect(p.steps.followUp).toMatchObject({ done: false, at: Date.now() + 7 * DAY });
  const sentAt = Date.now();

  vi.setSystemTime(Date.now() + DAY);
  await as.mutation(api.pursuits.setStatus, { id, status: "applied" });
  p = await first();
  expect(p.path).toBe("both");
  expect(p.steps.applied).toMatchObject({ done: true, at: Date.now() });
  expect(p.steps.followUp).toMatchObject({ done: false, at: sentAt + 7 * DAY });

  await as.mutation(api.pursuits.setStatus, { id, status: "preparing" });
  expect((await first()).steps.applied.done).toBe(false);

  vi.setSystemTime(Date.now() + 8 * DAY);
  await as.mutation(api.pursuits.done, { id, rule: "followUp" });
  expect((await first()).steps.followUp).toMatchObject({ done: true, at: Date.now() });
});

test("The first pursuit follows the pursuit furthest along", async () => {
  const { t, as, w, a, b } = await setup();
  await as.mutation(api.pursuits.start, { postingId: a });
  vi.setSystemTime(Date.now() + DAY);
  const second = await as.mutation(api.pursuits.start, { postingId: b });
  await t.run(async (ctx) => {
    await ctx.db.insert("letters", { workspaceId: w, pursuitId: second, paragraphs: [{ text: "Dear Anduril", factIds: [] }], at: 1 });
  });
  expect((await as.query(api.today.setup, {})).firstPursuit?.pursuitId).toBe(second);
});
