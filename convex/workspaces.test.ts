import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { ensureWorkspace, getInWorkspace, requireWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

async function twoPeople() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "a@example.com", name: "Ada" });
    const b = await ctx.db.insert("users", { email: "b@example.com", name: "Bo" });
    return { a, b, wa: await ensureWorkspace(ctx, a), wb: await ensureWorkspace(ctx, b) };
  });
  // Convex Auth identities carry "userId|sessionId" as the subject.
  const as = (userId: string) => t.withIdentity({ subject: `${userId}|session` });
  return { t, ...ids, as };
}

test("first sign-in creates one workspace, and signing in again reuses it", async () => {
  const { t, a, wa } = await twoPeople();
  await t.run(async (ctx) => {
    expect(await ensureWorkspace(ctx, a)).toBe(wa);
    const memberships = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", a)).collect();
    expect(memberships).toHaveLength(1);
  });
});

test("each person sees only their own workspace", async () => {
  const { a, b, wa, wb, as } = await twoPeople();
  expect(wa).not.toBe(wb);
  expect((await as(a).query(api.workspaces.current, {}))?.id).toBe(wa);
  expect((await as(b).query(api.workspaces.current, {}))?.id).toBe(wb);
});

test("signed-out requests are refused by the access helper, and see no workspace", async () => {
  const { t } = await twoPeople();
  await expect(t.run((ctx) => requireWorkspace(ctx))).rejects.toThrow("Sign in");
  expect(await t.query(api.workspaces.current, {})).toBeNull();
});

test("a signed-in person without a workspace yet is refused by the access helper", async () => {
  const t = convexTest(schema, modules);
  const c = await t.run((ctx) => ctx.db.insert("users", { email: "c@example.com" }));
  const asC = t.withIdentity({ subject: `${c}|session` });
  await expect(asC.run((ctx) => requireWorkspace(ctx))).rejects.toThrow("No workspace");
  expect(await asC.query(api.workspaces.current, {})).toBeNull();
});

test("a record from another workspace can't be read by id", async () => {
  const { t, a, b, wa, wb } = await twoPeople();
  await t.run(async (ctx) => {
    const [bMembership] = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", b)).collect();
    const [aMembership] = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", a)).collect();
    expect(await getInWorkspace(ctx, wa, bMembership._id)).toBeNull();
    expect((await getInWorkspace(ctx, wa, aMembership._id))?._id).toBe(aMembership._id);
    expect((await getInWorkspace(ctx, wb, bMembership._id))?._id).toBe(bMembership._id);
  });
});
