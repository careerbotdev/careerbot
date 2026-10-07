import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (o: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { cost: 0.001 } });

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
    const ids = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "extract", model: "test/model" });
      ids.push({ u, w });
    }
    return ids;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const goalsId = await asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "I started at Acme in September 2025." });
  const roleId = await t.run((ctx) =>
    ctx.db.insert("items", { workspaceId: a.w, kind: "role", status: "approved", roleKey: "acme", data: { employer: "Acme", title: "Director", start: "2024-09" }, sources: [], at: 0 }),
  );
  const conflict = { roleKey: "acme", field: "start", recordSays: "Started September 2024", narrativeSays: "Started September 2025", narrativeValue: "2025-09", narrativeId: goalsId, quote: "September 2025", question: "Did you start at Acme in September 2024 or September 2025?" };
  const check = async (o: unknown) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(o)));
    await asA.mutation(api.conflicts.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  const role = () =>
    t.run(async (ctx) => {
      const r = await ctx.db.get(roleId);
      if (r?.kind !== "role") throw new Error("Not a role.");
      return r.data;
    });
  return { t, a, asA, asB, check, conflict, role };
}

test("keeping the record closes the question, leaves the record alone, and a recheck doesn't ask again", async () => {
  const { asA, asB, check, conflict, role } = await setup();
  await check({ conflicts: [conflict] });
  const [q] = await asA.query(api.conflicts.list, {});
  expect(q.data.question).toContain("September 2024");
  expect(await asB.query(api.conflicts.list, {})).toEqual([]);
  await expect(asB.mutation(api.conflicts.answer, { id: q.id, pick: "record" })).rejects.toThrow("Not found");
  await asA.mutation(api.conflicts.answer, { id: q.id, pick: "record" });
  expect((await role()).start).toBe("2024-09");
  await check({ conflicts: [conflict] });
  expect(await asA.query(api.conflicts.list, {})).toEqual([]);
});

test("siding with the narrative or giving another value updates the record and logs the change", async () => {
  const { asA, check, conflict, role } = await setup();
  await check({ conflicts: [conflict] });
  const [q] = await asA.query(api.conflicts.list, {});
  await asA.mutation(api.conflicts.answer, { id: q.id, pick: "other", value: "2024-08" });
  const r = await role();
  expect(r.start).toBe("2024-08");
  expect(r.history?.at(-1)).toMatchObject({ field: "start", from: "2024-09", to: "2024-08" });
});

test("a conflict naming a narrative outside the workspace is dropped", async () => {
  const { asA, check, conflict } = await setup();
  await check({ conflicts: [{ ...conflict, narrativeId: "not-an-id" }] });
  expect(await asA.query(api.conflicts.list, {})).toEqual([]);
});

// Approved jobs: a promotion at Tallyline (written two ways) that overlaps Shiftwell by six months (Oct 2018 to Mar
// 2019), Brightwater overlapping Tallyline by one month, a career break inside Shiftwell, and Kestrel, not yet
// approved, overlapping both.
async function overlapSetup() {
  const s = await setup();
  const add = (roleKey: string, status: "approved" | "proposed", data: Record<string, unknown>) =>
    s.t.run((ctx) => ctx.db.insert("items", { workspaceId: s.a.w, kind: "role", status, roleKey, data: { key: roleKey, ...data }, sources: [], at: 0 }));
  const ids = {
    analyst: await add("tl-analyst", "approved", { employer: "Tally-Line", title: "Analyst", start: "2016-01", end: "2017-06" }),
    lead: await add("tl-lead", "approved", { employer: "Tallyline", title: "Lead", start: "2017-01", end: "2019-03" }),
    shiftwell: await add("shiftwell", "approved", { employer: "Shiftwell", title: "Manager", start: "2018-10", end: "2021-06" }),
    brightwater: await add("bw", "approved", { employer: "Brightwater", title: "Planner", start: "2013-03", end: "2016-01" }),
    pause: await add("break", "approved", { title: "Career break", break: true, start: "2019-01", end: "2019-12" }),
    kestrel: await add("kestrel", "proposed", { employer: "Kestrel", title: "Advisor", start: "2018-01", end: "2019-12" }),
  };
  const get = (id: (typeof ids)[keyof typeof ids]) =>
    s.t.run(async (ctx) => {
      const r = await ctx.db.get(id);
      if (r?.kind !== "role") throw new Error("Not a role.");
      return r.data;
    });
  const questions = async () => (await s.asA.query(api.conflicts.list, {})).map((q) => q.data.question);
  return { ...s, ids, get, questions };
}

const TALLYLINE = "Your Tallyline job ends Mar 2019 but your Shiftwell job starts Oct 2018. Which is right?";

test("two approved jobs at different employers that overlap by more than two months raise one question, kept by later checks", async () => {
  const { asA, check, questions } = await overlapSetup();
  await check({ conflicts: [] });
  expect(await questions()).toEqual([TALLYLINE]);
  const [q] = await asA.query(api.conflicts.list, {});
  expect(q.data.overlap).toEqual({ ends: { roleKey: "tl-lead", employer: "Tallyline" }, starts: { roleKey: "shiftwell", employer: "Shiftwell" } });
  // A check that finds nothing in the stories doesn't wipe it, and doesn't ask it twice.
  await check({ conflicts: [] });
  expect((await asA.query(api.conflicts.list, {})).map((x) => x.id)).toEqual([q.id]);
});

test("the check asks about overlapping jobs with no stories at all, without AI", async () => {
  const { t, check, questions } = await overlapSetup();
  await t.run(async (ctx) => {
    for (const n of await ctx.db.query("narratives").collect()) await ctx.db.delete(n._id);
  });
  await check({ conflicts: [] });
  expect(await questions()).toEqual([TALLYLINE]);
});

test("approving a role asks about the jobs it overlaps; fixing a date takes the question away", async () => {
  const { asA, ids, questions } = await overlapSetup();
  await asA.mutation(api.extract.review, { id: ids.kestrel, status: "approved" });
  expect((await questions()).sort()).toEqual(
    ["Your Kestrel job ends Dec 2019 but your Shiftwell job starts Oct 2018. Which is right?", "Your Tallyline job ends Mar 2019 but your Kestrel job starts Jan 2018. Which is right?", TALLYLINE].sort(),
  );
  await asA.mutation(api.extract.review, { id: ids.kestrel, status: "rejected" });
  await asA.mutation(api.extract.editRole, { id: ids.shiftwell, start: "2019-03" });
  expect(await questions()).toEqual([]);
});

test("Both are right settles an overlap without changing either job and it isn't asked again; Undo asks again", async () => {
  const { asA, check, ids, get, questions } = await overlapSetup();
  await check({ conflicts: [] });
  const [q] = await asA.query(api.conflicts.list, {});
  const before = [await get(ids.lead), await get(ids.shiftwell)];
  await expect(asA.mutation(api.conflicts.answer, { id: q.id, pick: "record" })).rejects.toThrow();
  await asA.mutation(api.conflicts.answer, { id: q.id, pick: "both" });
  expect([await get(ids.lead), await get(ids.shiftwell)]).toEqual(before);
  expect(await questions()).toEqual([]);
  await check({ conflicts: [] });
  await asA.mutation(api.extract.editRole, { id: ids.shiftwell, title: "Senior Manager" });
  expect(await questions()).toEqual([]);
  await asA.mutation(api.conflicts.reopen, { id: q.id });
  expect((await asA.query(api.conflicts.list, {})).map((x) => x.id)).toEqual([q.id]);
});

test("correcting one job's end or the other's start changes that job, the overlap goes, and Undo puts it back", async () => {
  const { asA, check, ids, get, questions } = await overlapSetup();
  await check({ conflicts: [] });
  const [q] = await asA.query(api.conflicts.list, {});
  await expect(asA.mutation(api.conflicts.answer, { id: q.id, pick: "other", value: "2018-09" })).rejects.toThrow();
  await asA.mutation(api.conflicts.answer, { id: q.id, pick: "other", field: "end", value: "2018-09" });
  expect(await get(ids.lead)).toMatchObject({ end: "2018-09", history: [{ field: "end", from: "2019-03", to: "2018-09", how: "answer" }] });
  expect((await get(ids.shiftwell)).start).toBe("2018-10");
  expect(await questions()).toEqual([]);
  await check({ conflicts: [] });
  expect(await questions()).toEqual([]);
  await asA.mutation(api.conflicts.reopen, { id: q.id });
  expect(await get(ids.lead)).toMatchObject({ end: "2019-03", history: [] });
  expect((await asA.query(api.conflicts.list, {})).map((x) => x.id)).toEqual([q.id]);

  await asA.mutation(api.conflicts.answer, { id: q.id, pick: "other", field: "start", value: "2019-04" });
  expect((await get(ids.shiftwell)).start).toBe("2019-04");
  expect((await get(ids.lead)).end).toBe("2019-03");
  expect(await questions()).toEqual([]);
  await asA.mutation(api.conflicts.reopen, { id: q.id });
  expect((await get(ids.shiftwell)).start).toBe("2018-10");
  expect(await questions()).toEqual([TALLYLINE]);
});
