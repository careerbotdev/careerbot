import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as adminPeople from "./adminPeople";
import { monthStart } from "./budgets";
import { NOT_OPERATOR } from "./operators";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const NOW = new Date("2026-10-13T12:00:00Z").getTime();
type T = TestConvex<typeof schema>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  delete process.env.CAREERBOT_MODE;
  process.env.PLATFORM_OPENROUTER_API_KEY = "sk-platform";
  process.env.PLATFORM_AI_LIMIT_USD = "100";
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.PLATFORM_OPENROUTER_API_KEY;
  delete process.env.PLATFORM_AI_LIMIT_USD;
  delete process.env.CAREERBOT_MODE;
});

const PRIVATE = ["SECRET-STORY", "SECRET-FACT", "SECRET-RESUME", "SECRET-GOAL", "SECRET-JOB"];

// An operator, a person with a workspace holding private things to keep out of admin reads, and a stranger.
async function setup(t: T) {
  return t.run(async (ctx) => {
    const op = await ctx.db.insert("users", { name: "Olive Operator", email: "olive@example.com" });
    await ensureWorkspace(ctx, op);
    await ctx.db.insert("operators", { userId: op, role: "owner" });
    const priya = await ctx.db.insert("users", { name: "Priya Raman", email: "priya@example.com", lastSignInAt: NOW - 3_600_000 });
    const w = await ensureWorkspace(ctx, priya);
    await ctx.db.insert("narratives", { workspaceId: w, kind: "career", title: "SECRET-STORY", body: "SECRET-STORY body", version: 1, updatedAt: 0 });
    await ctx.db.insert("narratives", { workspaceId: w, kind: "goals", title: "Goals", body: "SECRET-GOAL", version: 1, updatedAt: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text: "SECRET-FACT" }, sources: [], at: 0 });
    await ctx.db.insert("jobs", { workspaceId: w, kind: "extract", args: { note: "SECRET-JOB" }, status: "done" });
    const month = monthStart(NOW);
    const spend = (task: string, usd: number) => ctx.db.insert("spendTotals", { workspaceId: w, month, service: "openrouter", task, shard: 0, usd, credits: 0, calls: 1 });
    await spend("read a story", 0.3);
    await spend("write a resume", 0.2);
    const stranger = await ctx.db.insert("users", { name: "Sam", email: "sam@example.com" });
    await ensureWorkspace(ctx, stranger);
    return { op, priya, w, stranger };
  });
}

const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|s` });
type Caller = Pick<T, "query" | "mutation">;

// Every admin function, called with arguments it would accept. A new one without a line here fails the first test.
function calls(target: Id<"users">): Record<string, (c: Caller) => Promise<unknown>> {
  return {
    people: (c) => c.query(api.adminPeople.people, {}),
    costByStep: (c) => c.query(api.adminPeople.costByStep, {}),
    log: (c) => c.query(api.adminPeople.log, {}),
    invite: (c) => c.mutation(api.adminPeople.invite, { email: "new@example.com" }),
    resendInvite: (c) => c.mutation(api.adminPeople.resendInvite, { email: "new@example.com" }),
    revokeInvite: (c) => c.mutation(api.adminPeople.revokeInvite, { email: "new@example.com" }),
    setAllowance: (c) => c.mutation(api.adminPeople.setAllowance, { userId: target, allowanceUsd: 50 }),
    suspend: (c) => c.mutation(api.adminPeople.suspend, { userId: target }),
    restore: (c) => c.mutation(api.adminPeople.restore, { userId: target }),
  };
}

// What a call was refused with, or "allowed".
async function refusal(run: Promise<unknown>) {
  try {
    await run;
    return "allowed";
  } catch (e) {
    if (e instanceof ConvexError) return String(e.data);
    throw e;
  }
}

test("every admin function refuses anyone who isn't an operator, signed in or not, and refuses operators on a self-hosted copy", async () => {
  const t = convexTest(schema, modules);
  const { op, priya, stranger } = await setup(t);
  const all = calls(priya);
  const registered = Object.entries(adminPeople)
    .filter(([, f]) => typeof f === "function" && ("isQuery" in f || "isMutation" in f || "isAction" in f))
    .map(([name]) => name);
  expect(registered.sort()).toEqual(Object.keys(all).sort());
  for (const [name, call] of Object.entries(all)) {
    expect([name, await refusal(call(as(t, stranger)))]).toEqual([name, NOT_OPERATOR]);
    expect([name, await refusal(call(t))]).toEqual([name, NOT_OPERATOR]);
  }
  process.env.CAREERBOT_MODE = "self-hosted";
  expect(await refusal(as(t, op).query(api.adminPeople.people, {}))).toBe(NOT_OPERATOR);
  // Nothing was changed by the refused calls.
  await t.run(async (ctx) => {
    expect(await ctx.db.query("invites").collect()).toEqual([]);
    expect(await ctx.db.query("suspensions").collect()).toEqual([]);
    expect(await ctx.db.query("adminLog").collect()).toEqual([]);
  });
});

test("admin reads show who someone is, their status, activity and AI cost, and nothing from their workspace", async () => {
  const t = convexTest(schema, modules);
  const { op } = await setup(t);
  const asOp = as(t, op);
  await asOp.mutation(api.adminPeople.invite, { email: "tom@example.com" });
  const people = await asOp.query(api.adminPeople.people, {});
  const costs = await asOp.query(api.adminPeople.costByStep, {});
  const log = await asOp.query(api.adminPeople.log, {});
  const everything = JSON.stringify([people, costs, log]);
  for (const secret of PRIVATE) expect(everything).not.toContain(secret);
  const priya = people.find((p) => p.email === "priya@example.com")!;
  expect(priya).toMatchObject({ name: "Priya Raman", status: "active", spentUsd: expect.any(Number), plan: { source: "platform", allowanceUsd: 5 } });
  expect(priya.lastActive).toBeGreaterThanOrEqual(NOW - 3_600_000);
  expect(people.find((p) => p.email === "tom@example.com")).toMatchObject({ status: "invited", userId: null, expiresAt: NOW + 14 * 86_400_000, link: expect.stringMatching(/^\/invite\//) });
  expect(costs.person).toMatchObject({ people: 1 });
  expect(costs.person.totalUsd).toBeCloseTo(0.5);
  expect(costs.steps.map((s) => [s.step, s.people])).toEqual([
    ["read a story", 1],
    ["write a resume", 1],
  ]);
});

test("invite, resend and revoke, set an allowance, suspend and restore: each works and is logged", async () => {
  const t = convexTest(schema, modules);
  const { op, priya } = await setup(t);
  const asOp = as(t, op);
  const { link } = await asOp.mutation(api.adminPeople.invite, { email: "Tom@Example.com" });
  const { link: again } = await asOp.mutation(api.adminPeople.resendInvite, { email: "tom@example.com" });
  expect(again).not.toBe(link);
  expect((await t.query(api.invites.lookup, { token: link.slice("/invite/".length) })).state).toBe("unknown");
  await asOp.mutation(api.adminPeople.revokeInvite, { email: "tom@example.com" });
  expect((await t.query(api.invites.lookup, { token: again.slice("/invite/".length) })).state).toBe("revoked");
  expect(await refusal(asOp.mutation(api.adminPeople.invite, { email: "priya@example.com" }))).toContain("already has an account");

  await asOp.mutation(api.adminPeople.setAllowance, { userId: priya, allowanceUsd: 8 });
  expect((await asOp.query(api.adminPeople.people, {})).find((p) => p.userId === priya)?.plan).toMatchObject({ allowanceUsd: 8, override: true });
  expect(await refusal(asOp.mutation(api.adminPeople.setAllowance, { userId: priya, allowanceUsd: -1 }))).toContain("0 or more");

  await t.run(async (ctx) => {
    await ctx.db.insert("authSessions", { userId: priya, expirationTime: NOW + 86_400_000 });
  });
  await asOp.mutation(api.adminPeople.suspend, { userId: priya });
  expect(await refusal(asOp.mutation(api.adminPeople.suspend, { userId: op }))).toContain("suspend yourself");
  await t.run(async (ctx) => {
    expect(await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", priya)).collect()).toEqual([]);
  });
  const after = (await asOp.query(api.adminPeople.people, {})).find((p) => p.userId === priya);
  expect(after).toMatchObject({ status: "suspended", plan: { allowanceUsd: 0 } });
  await asOp.mutation(api.adminPeople.restore, { userId: priya });
  expect((await asOp.query(api.adminPeople.people, {})).find((p) => p.userId === priya)).toMatchObject({ status: "active", plan: { allowanceUsd: 8, override: true } });

  const log = await asOp.query(api.adminPeople.log, {});
  expect(log.map((e) => [e.action, e.email, e.by])).toEqual([
    ["restored", "priya@example.com", "Olive Operator"],
    ["suspended", "priya@example.com", "Olive Operator"],
    ["allowanceSet", "priya@example.com", "Olive Operator"],
    ["inviteRevoked", "tom@example.com", "Olive Operator"],
    ["inviteResent", "tom@example.com", "Olive Operator"],
    ["invited", "tom@example.com", "Olive Operator"],
  ]);
  expect(log[2].amountUsd).toBe(8);
});

test("percentile is the nearest rank", () => {
  expect(adminPeople.percentile([], 0.5)).toBe(0);
  expect(adminPeople.percentile([1, 2, 3, 4], 0.5)).toBe(2);
  expect(adminPeople.percentile([1, 2, 3, 4], 0.95)).toBe(4);
  expect(adminPeople.percentile([7], 0.95)).toBe(7);
});
