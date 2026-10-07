import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const NOW = new Date("2026-09-28T12:00:00Z").getTime();
const HOUR = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

test("activity lists work still under way however old, and finished or failed work from the last day only, for the workspace's own jobs", async () => {
  const t = convexTest(schema, modules);
  const { a, w, other } = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "a@example.com" });
    const b = await ctx.db.insert("users", { email: "b@example.com" });
    return { a, w: await ensureWorkspace(ctx, a), other: await ensureWorkspace(ctx, b) };
  });
  await t.run(async (ctx) => {
    const job = (status: "queued" | "running" | "paused" | "done" | "failed", hoursAgo: number, kind: "roles" | "discover" | "insights" = "roles", workspaceId = w) =>
      ctx.db.insert("jobs", { workspaceId, kind, args: {}, status, startedAt: NOW - hoursAgo * HOUR, ...(status === "failed" ? { error: "The page didn’t load." } : {}) });
    await job("running", 72);
    await job("paused", 48, "discover");
    await job("done", 23, "insights");
    await job("done", 25, "insights");
    await job("failed", 2, "discover");
    await job("failed", 30, "discover");
    await job("running", 1, "roles", other);
  });
  const rows = await t.withIdentity({ subject: `${a}|s` }).query(api.activity.list, {});
  expect(rows.map((r) => [r.kind, r.state])).toEqual([
    ["discover", "failed"],
    ["insights", "done"],
    ["discover", "running"],
    ["roles", "running"],
  ]);
  expect(rows[0].retry).toEqual({ fn: "discovery.start", args: {} });
});

test("a job naming another workspace's direction shows no name", async () => {
  const t = convexTest(schema, modules);
  const a = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, a);
    const other = await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "b@example.com" }));
    const mine = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Sales" }, sources: [], at: 0 });
    const theirs = await ctx.db.insert("items", { workspaceId: other, kind: "direction", status: "approved", data: { name: "Secret pivot" }, sources: [], at: 0 });
    await ctx.db.insert("jobs", { workspaceId: w, kind: "directions", args: { mode: "detail", id: theirs }, status: "running", startedAt: NOW });
    await ctx.db.insert("jobs", { workspaceId: w, kind: "directions", args: { mode: "detail", id: mine }, status: "running", startedAt: NOW - HOUR });
    return a;
  });
  const rows = await t.withIdentity({ subject: `${a}|s` }).query(api.activity.list, {});
  expect(rows.map((r) => r.label).sort()).toEqual(["Suggesting directions", "Writing positioning for Sales"]);
});
