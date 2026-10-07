import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ClosedReason, Stage } from "./pursuitSteps";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const BEGAN = Date.parse("2026-01-10T15:00:00Z");
const NOW = Date.parse("2026-09-29T12:00:00Z");
const SEP = (day: number) => Date.UTC(2026, 8, day, 12);
type T = TestConvex<typeof schema>;

async function setup() {
  const t = convexTest(schema, modules);
  vi.setSystemTime(BEGAN);
  const make = (email: string) =>
    t.run(async (ctx) => {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      const direction = (name: string) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0, data: { name } });
      return { u, w, sales: await direction("Sales"), eng: await direction("Engineering") };
    });
  const a = await make("a@example.com");
  const b = await make("b@example.com");
  vi.setSystemTime(NOW);
  return { t, a: { ...a, as: t.withIdentity({ subject: `${a.u}|s` }) }, b: { ...b, as: t.withIdentity({ subject: `${b.u}|s` }) } };
}

// A direction resume version (kept, or waiting to be kept) or a resume tailored from the direction's, written at `at`.
const resume = (t: T, w: Id<"workspaces">, directionId: Id<"items">, at: number, kind: "kept" | "waiting" | "tailored" = "kept") =>
  t.run((ctx) => ctx.db.insert("resumes", { workspaceId: w, directionId, model: "m", at, ...(kind === "waiting" ? { toReview: true } : {}), ...(kind === "tailored" ? { posting: "Role at Acme" } : {}) }));

// A pursuit started at `at` for a direction, set to Applied, Contacted or both (`via`, Applied if not given), then to
// Interviewing and Offer up to `reached` in turn (sent with `resumeId` once applied or interviewing), then closed for
// `closed` if given.
async function pursue(
  t: T,
  w: Id<"workspaces">,
  o: { direction?: { id: Id<"items">; name: string }; reached?: "applied" | "interviewing" | "offer"; via?: "applied" | "contacted" | "both"; closed?: ClosedReason; resumeId?: Id<"resumes">; at?: number },
) {
  const at = o.at ?? SEP(15);
  const via = o.via ?? "applied";
  const first: Stage[] = via === "both" ? ["contacted", "applied"] : [via];
  const stages: Stage[] = o.reached ? [...first, ...(["interviewing", "offer"] as const).slice(0, ["applied", "interviewing", "offer"].indexOf(o.reached))] : [];
  const applied = stages.includes("applied");
  return t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { workspaceId: w, name: "Acme", found: [], at: 0 });
    const postingId = await ctx.db.insert("postings", { workspaceId: w, companyId, provider: "lever", externalId: String(Math.random()), url: "u", title: "Role", remote: false, firstSeen: 0, lastSeen: 0 });
    return ctx.db.insert("pursuits", {
      workspaceId: w,
      postingId,
      companyId,
      title: "Role",
      company: "Acme",
      ...(o.direction ? { directionId: o.direction.id, direction: o.direction.name } : {}),
      status: o.closed ? "closed" : (stages.at(-1) ?? "preparing"),
      ...(o.closed ? { closedReason: o.closed } : {}),
      ...(stages.includes("contacted") ? { contactedAt: at + 1 } : {}),
      ...(applied ? { appliedAt: at + 1 } : {}),
      ...(applied || stages.includes("interviewing") ? { sent: { at: at + 1, ...(o.resumeId ? { resumeId: o.resumeId } : {}) } } : {}),
      timeline: [
        { at, event: "started" as const },
        ...stages.map((status, i) => ({ at: at + i + 1, event: "status" as const, status })),
        ...(o.closed ? [{ at: at + 9, event: "status" as const, status: "closed" as const, reason: o.closed }] : []),
      ],
      changedAt: at + 10,
      at,
    });
  });
}

// contacted, applied, either (a pursuit can be both), interviewed, offers, open, closed.
const counts = (contacted: number, applied: number, contactedOrApplied: number, interviewed: number, offers: number, open: number, closed: Partial<Record<ClosedReason, number>> = {}) => ({
  contacted,
  applied,
  contactedOrApplied,
  interviewed,
  offers,
  open,
  closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0, ...closed },
});

test("outcomes count contacted and applied apart, interviews of either by direction, and applications by the direction resume version they were sent with", async () => {
  const { t, a, b } = await setup();
  const sales = { id: a.sales, name: "Sales" };
  const eng = { id: a.eng, name: "Engineering" };
  const v1 = await resume(t, a.w, a.sales, SEP(1));
  const v2 = await resume(t, a.w, a.sales, SEP(10));
  await resume(t, a.w, a.sales, SEP(20), "waiting");
  const fromV1 = await resume(t, a.w, a.sales, SEP(5), "tailored");
  const fromV2 = await resume(t, a.w, a.sales, SEP(12), "tailored");
  // Written after a version still waiting to be kept: tailored from the one current then.
  const alsoFromV2 = await resume(t, a.w, a.sales, SEP(21), "tailored");
  // Engineering has no direction resume version from before it.
  const engTailored = await resume(t, a.w, a.eng, SEP(6), "tailored");

  await pursue(t, a.w, { direction: sales, reached: "interviewing", resumeId: fromV1 });
  await pursue(t, a.w, { direction: sales, reached: "applied", closed: "rejected", resumeId: fromV2 });
  await pursue(t, a.w, { direction: sales, reached: "offer", resumeId: alsoFromV2 });
  await pursue(t, a.w, { direction: sales });
  await pursue(t, a.w, { direction: sales, closed: "withdrawn" });
  await pursue(t, a.w, { direction: eng, reached: "applied", resumeId: engTailored });
  // Outreach alone, to an interview: contacted, not an application, so no resume version.
  await pursue(t, a.w, { direction: eng, reached: "interviewing", via: "contacted" });
  // Both paths: counted once in either, and as an application.
  await pursue(t, a.w, { direction: eng, reached: "applied", via: "both", resumeId: engTailored });
  await pursue(t, a.w, { reached: "applied" });
  // Started last month: in all time only.
  await pursue(t, a.w, { direction: sales, reached: "applied", resumeId: fromV1, at: Date.UTC(2026, 7, 20) });
  await pursue(t, b.w, { direction: { id: b.sales, name: "Sales" }, reached: "offer" });

  const month = await a.as.query(api.reports.outcomes, { period: "month" });
  expect(month.directions).toEqual([
    { directionId: a.sales, direction: "Sales", started: 5, ...counts(0, 3, 3, 2, 1, 3, { rejected: 1, withdrawn: 1 }) },
    { directionId: a.eng, direction: "Engineering", started: 3, ...counts(2, 2, 3, 1, 0, 3) },
    { directionId: null, direction: null, started: 1, ...counts(0, 1, 1, 0, 0, 1) },
  ]);
  expect(month.versions).toEqual([
    { directionId: a.eng, direction: "Engineering", versionId: null, versionAt: null, current: false, ...counts(1, 2, 2, 0, 0, 2) },
    { directionId: a.sales, direction: "Sales", versionId: v2, versionAt: SEP(10), current: true, ...counts(0, 2, 2, 1, 1, 1, { rejected: 1 }) },
    { directionId: a.sales, direction: "Sales", versionId: v1, versionAt: SEP(1), current: false, ...counts(0, 1, 1, 1, 0, 1) },
    { directionId: null, direction: null, versionId: null, versionAt: null, current: false, ...counts(0, 1, 1, 0, 0, 1) },
  ]);
  expect(month.suggestions).toEqual([]);

  const all = await a.as.query(api.reports.outcomes, { period: "all" });
  expect(all.directions[0]).toMatchObject({ direction: "Sales", started: 6, applied: 4 });
  expect(all.versions.find((v) => v.versionId === v1)).toMatchObject({ applied: 2, interviewed: 1 });

  const other = await b.as.query(api.reports.outcomes, { period: "all" });
  expect(other.directions).toEqual([{ directionId: b.sales, direction: "Sales", started: 1, ...counts(0, 1, 1, 1, 1, 1) }]);
});

test("Overview and Search count pursuits contacted, applied and either the way Outcomes does", async () => {
  const { t, a } = await setup();
  const sales = { id: a.sales, name: "Sales" };
  await pursue(t, a.w, { direction: sales, reached: "applied" });
  await pursue(t, a.w, { direction: sales, reached: "interviewing", via: "contacted" });
  await pursue(t, a.w, { direction: sales, reached: "applied", via: "both" });
  await pursue(t, a.w, { direction: sales });

  const overview = await a.as.query(api.reports.overview, { period: "month" });
  expect(overview.inPeriod).toMatchObject({ pursuitsStarted: 4, contacted: 2, applied: 2, contactedOrApplied: 3 });
  const search = await a.as.query(api.reports.search, { period: "month" });
  expect(search.funnel).toEqual([
    { directionId: a.sales, direction: "Sales", started: 4, contacted: 2, applied: 2, contactedOrApplied: 3, interviewing: 1, offer: 0, open: 4, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
  ]);
  const outcomes = await a.as.query(api.reports.outcomes, { period: "month" });
  expect(outcomes.directions).toEqual([{ directionId: a.sales, direction: "Sales", started: 4, ...counts(2, 2, 3, 1, 0, 4) }]);
});

test("suggestions need enough pursuits contacted or applied to compare, and a clear lead", async () => {
  const { t, a } = await setup();
  const sales = { id: a.sales, name: "Sales" };
  const eng = { id: a.eng, name: "Engineering" };
  const suggestions = async () => (await a.as.query(api.reports.outcomes, { period: "all" })).suggestions.map((s) => `${s.text}. ${s.detail}`);
  const lead = "Interviews come from Sales. 2 of 4 pursuits contacted or applied got to an interview, against 0 of 4 for your other directions.";

  // 3 applications for Sales, 2 of them to an interview: too few to compare.
  for (const reached of ["interviewing", "interviewing", "applied"] as const) await pursue(t, a.w, { direction: sales, reached });
  for (let i = 0; i < 4; i++) await pursue(t, a.w, { direction: eng, reached: "applied" });
  expect(await suggestions()).toEqual([]);

  // The 4th, an outreach message: enough, and twice the share.
  await pursue(t, a.w, { direction: sales, reached: "applied", via: "contacted" });
  expect(await suggestions()).toEqual([lead]);

  // No interviews from 5 isn't yet worth saying; from 6 it is.
  await pursue(t, a.w, { direction: eng, reached: "applied" });
  expect(await suggestions()).toEqual([lead.replace("0 of 4", "0 of 5")]);
  await pursue(t, a.w, { direction: eng, reached: "applied", closed: "noResponse" });
  expect(await suggestions()).toEqual([lead.replace("0 of 4", "0 of 6"), "No interviews yet from Engineering. None of the 6 pursuits contacted or applied got to an interview."]);

  // Exactly half Sales's share (2 of 8 against 2 of 4) still leads; more than half doesn't.
  await pursue(t, a.w, { direction: eng, reached: "interviewing" });
  await pursue(t, a.w, { direction: eng, reached: "interviewing" });
  expect(await suggestions()).toEqual([lead.replace("0 of 4", "2 of 8")]);
  await pursue(t, a.w, { direction: eng, reached: "interviewing" });
  expect(await suggestions()).toEqual([]);
});

test("suggestions compare one direction's resume versions and say where offers come from", async () => {
  const { t, a } = await setup();
  const sales = { id: a.sales, name: "Sales" };
  await resume(t, a.w, a.sales, SEP(1));
  await resume(t, a.w, a.sales, SEP(10));
  const fromV1 = await resume(t, a.w, a.sales, SEP(5), "tailored");
  const fromV2 = await resume(t, a.w, a.sales, SEP(12), "tailored");
  const suggestions = async () => (await a.as.query(api.reports.outcomes, { period: "all" })).suggestions.map((s) => `${s.text}. ${s.detail}`);

  for (const reached of ["interviewing", "interviewing", "applied", "applied"] as const) await pursue(t, a.w, { direction: sales, reached, resumeId: fromV2 });
  for (let i = 0; i < 3; i++) await pursue(t, a.w, { direction: sales, reached: "applied", resumeId: fromV1 });
  await pursue(t, a.w, { direction: { id: a.eng, name: "Engineering" }, reached: "applied" });
  expect(await suggestions()).toEqual([]);

  await pursue(t, a.w, { direction: sales, reached: "applied", closed: "rejected", resumeId: fromV1 });
  const versions = "The Sep 10 Sales resume gets more interviews. 2 of 4 applications sent with it got to an interview, against 0 of 4 with other Sales versions.";
  expect(await suggestions()).toEqual([versions]);

  // One offer isn't a pattern; two, both for Sales, are.
  await pursue(t, a.w, { direction: sales, reached: "offer", resumeId: fromV2 });
  expect(await suggestions()).toEqual([versions.replace("2 of 4", "3 of 5")]);
  await pursue(t, a.w, { direction: sales, reached: "offer", resumeId: fromV2 });
  expect(await suggestions()).toEqual(["Offers come from Sales. Both offers were for this direction.", versions.replace("2 of 4", "4 of 6")]);
});

const DAY = 86_400_000;

// A pursuit started on Sep 15 on a path: an outreach message marked sent a day later (outreach), an application a day
// later (apply), or both; `reply`: days after that until someone replied (a contact marked replied), or a move to a
// status (`moved`) that many days after. contacts: the people written to (sent) or not, by title, and whether they
// replied.
async function onPath(
  t: T,
  w: Id<"workspaces">,
  o: { path?: "apply" | "outreach" | "both"; replied?: number; moved?: { days: number; status: "inConversation" | "interviewing" | "offer" | "closed"; reason?: ClosedReason }; contacts?: { title: string; group?: "hiringManager" | "team" | "recruiting"; sent: boolean; replied?: boolean }[] },
) {
  const at = SEP(15);
  const out = at + DAY;
  return t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { workspaceId: w, name: "Acme", found: [], at: 0 });
    const pursuitId = await ctx.db.insert("pursuits", {
      workspaceId: w,
      companyId,
      title: "Product Manager",
      company: "Acme",
      status: o.moved?.status ?? (o.path === "outreach" ? "contacted" : o.path ? "applied" : "preparing"),
      ...(o.moved?.reason ? { closedReason: o.moved.reason } : {}),
      ...(o.path ? { path: o.path } : {}),
      ...(o.path === "outreach" || o.path === "both" ? { contactedAt: out } : {}),
      ...(o.path === "apply" || o.path === "both" ? { appliedAt: out } : {}),
      ...(o.replied !== undefined ? { repliedAt: out + o.replied * DAY } : {}),
      timeline: [{ at, event: "started" as const }, ...(o.moved ? [{ at: out + o.moved.days * DAY, event: "status" as const, status: o.moved.status, ...(o.moved.reason ? { reason: o.moved.reason } : {}) }] : [])],
      changedAt: out + 10 * DAY,
      at,
    });
    for (const c of o.contacts ?? [])
      await ctx.db.insert("contacts", {
        workspaceId: w,
        pursuitId,
        name: c.title,
        title: c.title,
        ...(c.group ? { group: c.group } : {}),
        ...(c.sent ? { sent: [{ subject: "Hello", text: "Hi", to: "x@acme.example", at: out }] } : {}),
        ...(c.replied ? { repliedAt: out + DAY } : {}),
        at,
      });
  });
}

test("outcomes count replies by path, from the first outreach message or the application, and by contact group", async () => {
  const { t, a, b } = await setup();
  // Outreach: a reply after 2 days from the hiring manager, the team member written to didn't; and one with no reply,
  // to a recruiter (grouped by title).
  await onPath(t, a.w, {
    path: "outreach",
    replied: 2,
    moved: { days: 2, status: "inConversation" },
    contacts: [
      { title: "Director of Product", group: "hiringManager", sent: true, replied: true },
      { title: "Product Manager", group: "team", sent: true },
    ],
  });
  await onPath(t, a.w, { path: "outreach", contacts: [{ title: "Technical Recruiter", sent: true }] });
  // Apply: an interview 4 days after applying (a reply), and one closed with no response (not a reply).
  await onPath(t, a.w, { path: "apply", moved: { days: 4, status: "interviewing" } });
  await onPath(t, a.w, { path: "apply", moved: { days: 20, status: "closed", reason: "noResponse" } });
  // Both: rejected 6 days after the earlier of the two, a reply.
  await onPath(t, a.w, { path: "both", moved: { days: 6, status: "closed", reason: "rejected" } });
  // No path yet, and someone found but not written to: neither counts.
  await onPath(t, a.w, { contacts: [{ title: "VP Product", sent: false }] });
  await onPath(t, b.w, { path: "outreach", replied: 1 });

  const month = await a.as.query(api.reports.outcomes, { period: "month" });
  expect(month.paths).toEqual([
    { path: "apply", started: 2, replied: 1, interviewed: 1, offers: 0, replyDays: 4 },
    { path: "outreach", started: 2, replied: 1, interviewed: 0, offers: 0, replyDays: 2 },
    { path: "both", started: 1, replied: 1, interviewed: 0, offers: 0, replyDays: 6 },
  ]);
  expect(month.groups).toEqual([
    { group: "hiringManager", written: 1, replied: 1 },
    { group: "team", written: 1, replied: 0 },
    { group: "recruiting", written: 1, replied: 0 },
  ]);
  expect((await a.as.query(api.reports.search, { period: "month" })).replies).toEqual({ count: 3, medianDays: 4 });
  expect((await b.as.query(api.reports.outcomes, { period: "month" })).paths).toEqual([{ path: "outreach", started: 1, replied: 1, interviewed: 0, offers: 0, replyDays: 1 }]);
});

test("a suggestion says which path replies come from, once both have enough pursuits and one clearly leads", async () => {
  const { t, a } = await setup();
  const suggestions = async () => (await a.as.query(api.reports.outcomes, { period: "all" })).suggestions.map((s) => `${s.text}. ${s.detail}`);
  for (const replied of [1, 2, undefined]) await onPath(t, a.w, { path: "outreach", replied });
  for (let i = 0; i < 4; i++) await onPath(t, a.w, { path: "apply" });
  // 3 on Outreach: too few to compare.
  expect(await suggestions()).toEqual([]);
  await onPath(t, a.w, { path: "outreach" });
  expect(await suggestions()).toEqual(["Replies come from Outreach. 2 of 4 pursuits on Outreach got a reply, against 0 of 4 on Apply."]);
  // Apply catches up past half Outreach's share: no clear lead.
  for (let i = 0; i < 2; i++) await onPath(t, a.w, { path: "apply", moved: { days: 3, status: "interviewing" } });
  expect(await suggestions()).toEqual([]);
});
