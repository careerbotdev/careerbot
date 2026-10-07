import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import { remindersOf } from "./pursuitSteps";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const ON = { followUp: true, prepare: true, stale: true };

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

// Two workspaces; A applied to a role at Beta, with Dana (revealed, likely hiring manager) found for it.
async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("key");
  const [a, b] = await t.run(async (ctx) => {
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "-key", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "onRequest" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "followUp", model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const w = a.w;
  const postingId = await t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "acme", sources: [], at: 0, data: { employer: "Acme", title: "Head of CS" } });
    await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text: "Cut churn by 20%." }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "proposed", roleKey: "acme", data: { text: "Doubled revenue." }, sources: [], at: 0 });
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", found: [], at: 0 });
    return ctx.db.insert("postings", { workspaceId: w, companyId: c, provider: "lever", externalId: "1", url: "u", title: "Head of Customer Success", remote: false, firstSeen: 0, lastSeen: 0 });
  });
  const pursuitId = await asA.mutation(api.pursuits.start, { postingId });
  await asA.mutation(api.pursuits.setStatus, { id: pursuitId, status: "applied" });
  const dana = await t.run((ctx) =>
    ctx.db.insert("contacts", { workspaceId: w, pursuitId, apolloId: "p2", name: "Dana Lee", title: "VP, Customer Success", hiringManager: true, email: "dana@beta.com", revealedAt: 0, at: 0 }),
  );
  return { t, asA, asB, pursuitId, dana };
}

// OpenRouter answering every call with `reply`, citing the approved fact it finds in the prompt; every call recorded.
function stubModel(reply: { subject: string; text: string }) {
  const f = vi.fn(async (_input: string, init?: { body?: string }) => {
    const body = JSON.parse(init!.body!) as { messages: { content: string }[] };
    const factId = /"id":"([^"]+)","roleKey":"acme","text":"Cut churn/.exec(body.messages[1].content)?.[1];
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...reply, factIds: [factId, "made-up"] }) } }], usage: { cost: 0.001 } });
  });
  vi.stubGlobal("fetch", f);
  return f;
}

async function write(s: Awaited<ReturnType<typeof setup>>, contactId?: Id<"contacts">) {
  await s.asA.mutation(api.followUpEmails.write, { pursuitId: s.pursuitId, ...(contactId ? { contactId } : {}) });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
}

// The follow-up reminders due for the pursuit now, from its row in the list.
async function followUpDue(s: Awaited<ReturnType<typeof setup>>) {
  const { pursuits } = await s.asA.query(api.pursuits.list, {});
  return remindersOf(pursuits[0], Date.now(), ON).some((r) => r.rule === "followUp");
}

test("a follow-up rests on the approved record, the role and where it stands, and cites only approved facts", async () => {
  const s = await setup();
  const model = stubModel({ subject: "Checking in", text: "Hi Dana, checking in." });
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  await write(s);
  const prompt = (model.mock.calls[0] as unknown as [string, { body: string }])[1].body;
  expect(prompt).toContain("Cut churn by 20%.");
  expect(prompt).not.toContain("Doubled revenue.");
  expect(prompt).toContain("Dana Lee");
  expect(prompt).toContain("2026-09-01");
  const shown = await s.asA.query(api.followUpEmails.forPursuit, { pursuitId: s.pursuitId });
  expect(shown.to?.name).toBe("Dana Lee");
  expect(shown.draft?.factIds).toHaveLength(1);
  expect(Object.values(shown.facts)).toEqual(["Cut churn by 20%."]);
  expect([shown.writing, shown.failed, shown.rewrite]).toEqual([false, null, null]);
});

test("a follow-up marked sent is kept exactly as sent; a later draft never changes it; undo brings the reminder back", async () => {
  const s = await setup();
  stubModel({ subject: "Checking in", text: "Hi Dana, checking in." });
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  expect(await followUpDue(s)).toBe(true);
  await expect(s.asA.mutation(api.followUpEmails.markSent, { pursuitId: s.pursuitId })).rejects.toThrow("Write the follow-up first.");
  await write(s);
  const sentAt = new Date("2026-09-10T15:00:00Z").getTime();
  vi.setSystemTime(sentAt);
  const id = await s.asA.mutation(api.followUpEmails.markSent, { pursuitId: s.pursuitId });
  // The same draft marked again is still one send.
  expect(await s.asA.mutation(api.followUpEmails.markSent, { pursuitId: s.pursuitId })).toBeNull();
  const first = { id, subject: "Checking in", text: "Hi Dana, checking in.", to: "Dana Lee <dana@beta.com>", at: sentAt };
  expect((await s.asA.query(api.followUpEmails.forPursuit, { pursuitId: s.pursuitId })).sent).toEqual([first]);
  expect(await followUpDue(s)).toBe(false);
  expect((await s.asA.query(api.pursuits.get, { id: s.pursuitId })).timeline[0]).toMatchObject({ event: "followedUp", text: "Dana Lee: Checking in", at: sentAt });

  // Their own wording, then a rewrite kept: the draft changes, what was sent doesn't.
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  await s.asA.mutation(api.followUpEmails.edit, { pursuitId: s.pursuitId, subject: "Checking in", text: "Hi Dana, my own words." });
  let shown = await s.asA.query(api.followUpEmails.forPursuit, { pursuitId: s.pursuitId });
  expect([shown.draft?.text, shown.draft?.edited, shown.draft?.factIds, shown.sent]).toEqual(["Hi Dana, my own words.", true, [], [first]]);
  await expect(s.asA.mutation(api.followUpEmails.edit, { pursuitId: s.pursuitId, subject: "x", text: "  " })).rejects.toThrow("Write the message first.");
  stubModel({ subject: "Following up", text: "Hi Dana, following up again." });
  await write(s);
  shown = await s.asA.query(api.followUpEmails.forPursuit, { pursuitId: s.pursuitId });
  expect([shown.draft?.text, shown.rewrite?.text]).toEqual(["Hi Dana, my own words.", "Hi Dana, following up again."]);
  await s.asA.mutation(api.followUpEmails.keep, { pursuitId: s.pursuitId });
  shown = await s.asA.query(api.followUpEmails.forPursuit, { pursuitId: s.pursuitId });
  expect([shown.draft?.text, shown.draft?.edited, shown.rewrite, shown.sent]).toEqual(["Hi Dana, following up again.", false, null, [first]]);

  // Undo: the snapshot and its timeline entry go, and the reminder is due again.
  await s.asA.mutation(api.followUpEmails.undoSent, { id: id! });
  expect((await s.asA.query(api.followUpEmails.forPursuit, { pursuitId: s.pursuitId })).sent).toEqual([]);
  expect((await s.asA.query(api.pursuits.get, { id: s.pursuitId })).timeline.some((e) => e.event === "followedUp")).toBe(false);
  expect(await followUpDue(s)).toBe(true);
});

test("after an outreach message goes quiet, the follow-up goes to the last person written to and says what it follows; then the next contact", async () => {
  const s = await setup();
  const sentAt = new Date("2026-09-01T12:00:00Z").getTime();
  const sam = await s.t.run(async (ctx) => {
    const p = (await ctx.db.get(s.pursuitId))!;
    await ctx.db.patch(s.pursuitId, { status: "contacted", appliedAt: undefined, contactedAt: sentAt, timeline: p.timeline.filter((e) => e.event !== "status") });
    return ctx.db.insert("contacts", { workspaceId: p.workspaceId, pursuitId: s.pursuitId, name: "Sam Ortiz", title: "Talent Partner", group: "recruiting", email: "sam@beta.com", revealedAt: 0, sent: [{ subject: "Hello", text: "Hi Sam", to: "Sam Ortiz <sam@beta.com>", at: sentAt }], at: 1 });
  });
  const due = async () => {
    const { pursuits, rules } = await s.asA.query(api.pursuits.list, {});
    return remindersOf(pursuits[0], Date.now(), rules).find((r) => r.rule === "followUp");
  };
  vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  expect(await due()).toBeUndefined();
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  expect(await due()).toMatchObject({ tag: "Follow up", contact: { id: sam, name: "Sam Ortiz" } });

  const model = stubModel({ subject: "Following up", text: "Hi Sam, following up." });
  await write(s);
  const prompt = (model.mock.calls[0] as unknown as [string, { body: string }])[1].body;
  expect(prompt).toContain("their outreach message to this person (they haven't applied through the posting)");
  expect(prompt).toContain("Writing to: Sam Ortiz");
  expect((await s.asA.query(api.followUpEmails.forPursuit, { pursuitId: s.pursuitId })).to?.name).toBe("Sam Ortiz");
  await s.asA.mutation(api.followUpEmails.markSent, { pursuitId: s.pursuitId });
  expect(await due()).toBeUndefined();

  // A week after the follow-up, the next contact in group order: Dana.
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  expect(await due()).toMatchObject({ step: "nextContact", contact: { name: "Dana Lee" } });
});

test("another workspace can't read, write, change, send or undo a pursuit's follow-up", async () => {
  const s = await setup();
  stubModel({ subject: "Checking in", text: "Hi Dana, checking in." });
  await write(s);
  const id = await s.asA.mutation(api.followUpEmails.markSent, { pursuitId: s.pursuitId });
  const { pursuitId } = s;
  for (const attempt of [
    s.asB.query(api.followUpEmails.forPursuit, { pursuitId }),
    s.asB.mutation(api.followUpEmails.write, { pursuitId }),
    s.asB.mutation(api.followUpEmails.edit, { pursuitId, subject: "x", text: "y" }),
    s.asB.mutation(api.followUpEmails.keep, { pursuitId }),
    s.asB.mutation(api.followUpEmails.markSent, { pursuitId }),
    s.asB.mutation(api.followUpEmails.undoSent, { id: id! }),
  ])
    await expect(attempt).rejects.toThrow("Not found.");
  expect((await s.asA.query(api.followUpEmails.forPursuit, { pursuitId })).sent).toHaveLength(1);
});
