import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { dayOf, STANDING, tally, talliedSince } from "./tallies";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-08T12:00:00Z");
const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    return { u, w: await ensureWorkspace(ctx, u) };
  });
  return { t, w, as: t.withIdentity({ subject: `${u}|s` }) };
}

// Every row of the table, as [metric, day, key, n, folded].
const rows = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) => (await ctx.db.query("tallies").collect()).map((r) => [r.metric, r.day, r.key ?? null, r.n, !!r.folded]));
// A count's sum as a report adds it up.
const sum = (t: TestConvex<typeof schema>, w: Id<"workspaces">, metric: "roles" | "jobDone", key?: string) =>
  t.run(async (ctx) => (await talliedSince(ctx, w, metric, STANDING)).filter((r) => key === undefined || r.key === key).reduce((n, r) => n + r.n, 0));

test("jobs finishing all at once are each counted once, the same before and after the counts are folded", async () => {
  const { t, w, as } = await setup();
  const kinds = ["roles", "enrich", "discover"] as const;
  const jobs = await t.run((ctx) => Promise.all(Array.from({ length: 60 }, (_, i) => ctx.db.insert("jobs", { workspaceId: w, kind: kinds[i % 3], args: {}, status: "running" }))));
  // Every job ends at once; a third of them are reported twice (done again), which counts once.
  await Promise.all([
    ...jobs.map((jobId, i) => t.mutation(internal.jobs.setState, { jobId, status: i % 4 ? "done" : "failed" })),
    ...jobs.filter((_, i) => i % 3 === 0).map((jobId) => t.mutation(internal.jobs.setState, { jobId, status: "done" })),
  ]);
  const want = { done: { roles: 15, enrich: 15, discover: 15 }, failed: { roles: 5, enrich: 5, discover: 5 } };
  const report = async () => {
    const a = await as.query(api.reports.activity, { period: "month" });
    return { done: a.done, failed: a.failed };
  };
  expect(await report()).toEqual(want);

  // Not folded until they're a minute old; then one row per count, and the same report.
  expect(await t.mutation(internal.tallies.fold, {})).toBe(0);
  vi.setSystemTime(NOW + MINUTE + 1);
  expect(await t.mutation(internal.tallies.fold, {})).toBe(60);
  expect(await report()).toEqual(want);
  expect((await rows(t)).sort()).toEqual(
    [["jobDone", dayOf(NOW), "discover", 15, true], ["jobDone", dayOf(NOW), "enrich", 15, true], ["jobDone", dayOf(NOW), "roles", 15, true],
      ["jobFailed", dayOf(NOW), "discover", 5, true], ["jobFailed", dayOf(NOW), "enrich", 5, true], ["jobFailed", dayOf(NOW), "roles", 5, true]].sort(),
  );
});

test("a write that changes counts never reads one, so writes at once can't collide over a count; its changes to a count are one row", async () => {
  const { t, w } = await setup();
  // Every table a write reads, through ctx.db.
  const read: string[] = [];
  const watching = (ctx: MutationCtx): MutationCtx => ({
    ...ctx,
    db: new Proxy(ctx.db, {
      get(db, prop) {
        if (prop === "query") return (table: string) => (read.push(table), db.query(table as "tallies"));
        if (prop === "get") return (id: string) => (read.push(id), db.get(id as Id<"tallies">));
        const f = Reflect.get(db, prop);
        return typeof f === "function" ? f.bind(db) : f;
      },
    }),
  });
  // Forty writes at once (a roles pass ranking many roles), each moving roles between levels many times.
  await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      t.run(async (ctx) => {
        const c = watching(ctx);
        for (let j = 0; j < 25; j++) {
          await tally(c, w, "roles", STANDING, 1, "d|strong");
          await tally(c, w, "roles", STANDING, -1, "d|some");
        }
        if (i % 2) await tally(c, w, "roles", STANDING, -25, "d|strong");
      }),
    ),
  );
  expect(read).toEqual([]);
  expect(await sum(t, w, "roles", "d|strong")).toBe(20 * 25);
  expect(await sum(t, w, "roles", "d|some")).toBe(-40 * 25);
  expect((await rows(t)).length).toBe(80);
});

test("folding keeps every sum: rows from before (shards) fold in, a count back to nothing goes, and a backlog past a page is folded by runs that follow", async () => {
  const { t, w } = await setup();
  await t.run(async (ctx) => {
    // As written before: one count spread over shards, and one that came back to nothing.
    for (let shard = 0; shard < 8; shard++) await ctx.db.insert("tallies", { workspaceId: w, metric: "roles", day: STANDING, key: "d|strong", shard, n: shard + 1 });
    await ctx.db.insert("tallies", { workspaceId: w, metric: "roles", day: STANDING, key: "d|weak", shard: 0, n: 3 });
    await ctx.db.insert("tallies", { workspaceId: w, metric: "roles", day: STANDING, key: "d|weak", shard: 5, n: -3 });
  });
  // Changes past one fold's page, each a write of its own.
  for (let i = 0; i < 520; i++) await t.run((ctx) => tally(ctx, w, "roles", STANDING, 1, i % 2 ? "d|strong" : "d|some"));
  vi.setSystemTime(NOW + MINUTE + 1);
  // One written just now waits for the next fold.
  await t.run((ctx) => tally(ctx, w, "roles", STANDING, 1, "d|some"));
  const before = { strong: await sum(t, w, "roles", "d|strong"), some: await sum(t, w, "roles", "d|some"), weak: await sum(t, w, "roles", "d|weak") };
  expect(before).toEqual({ strong: 36 + 260, some: 261, weak: 0 });

  await t.mutation(internal.tallies.fold, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect({ strong: await sum(t, w, "roles", "d|strong"), some: await sum(t, w, "roles", "d|some"), weak: await sum(t, w, "roles", "d|weak") }).toEqual(before);
  expect((await rows(t)).sort()).toEqual([["roles", STANDING, "d|some", 1, false], ["roles", STANDING, "d|some", 260, true], ["roles", STANDING, "d|strong", 296, true]]);
});
