import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

test("a run cut off mid-way is started again, and one interrupted three times fails with a plain message", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const now = Date.now();
  const [stuck, fresh, tired] = await t.run(async (ctx) => {
    const w = await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "a@example.com" }));
    const job = (startedAt: number, attempts: number) => ctx.db.insert("jobs", { workspaceId: w, kind: "resume", args: {}, status: "running", startedAt, attempts });
    return [await job(now - 20 * 60_000, 1), await job(now - 60_000, 1), await job(now - 20 * 60_000, 3)];
  });
  await t.mutation(internal.jobs.recoverStuck, {});
  const get = (id: typeof stuck) => t.run((ctx) => ctx.db.get(id));
  expect((await get(stuck))!.status).toBe("queued");
  expect((await get(fresh))!.status).toBe("running");
  expect(await get(tired)).toMatchObject({ status: "failed", error: "This kept getting interrupted. Try again." });
  vi.useRealTimers();
});

// A workspace with an Apollo key and one direction whose criteria are approved, so finding companies makes its paid
// searches one step at a time.
async function withSearch() {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-24T12:00:00Z"));
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("apollo-key");
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "apollo", sealed, last4: "-key", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 1, apolloMonthlyCredits: 0, apolloMode: "onRequest" });
    await ctx.db.insert("items", {
      workspaceId: w,
      kind: "direction",
      status: "approved",
      data: { name: "Supply Chain Product", criteria: { industries: ["logistics"], sizes: [], stages: [], titles: ["Product Manager"], keywords: [] }, criteriaStatus: "approved" },
      sources: [],
      at: 0,
    });
    return { u, w };
  });
  // Apollo: a credit balance, and every search finding one company. `onSearch` runs as each search is made.
  const searches: string[] = [];
  const stub = (onSearch: () => Promise<void> = async () => {}) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith("credit_usage_stats"))
          return Response.json({ credit_usage_stats: { lead_credit: { limit: 2500, consumed: 0, left_over: 2500 } }, current_credit_cycle: { start_date: "2026-09-05", end_date: "2026-10-05" } });
        if (url.hostname === "api.apollo.io") {
          searches.push(url.pathname);
          await onSearch();
          return Response.json({ organizations: [{ id: `O${searches.length}`, name: `Company ${searches.length}` }], pagination: { total_entries: 1 } });
        }
        return new Response("", { status: 404 });
      }),
    );
  return { t, w, as: t.withIdentity({ subject: `${u}|s` }), searches, stub };
}

test("cancelling running work stops it at the step it's on: that step is paid but not kept, steps before it stay, nothing after runs", async () => {
  const { t, as, searches, stub } = await withSearch();
  // Cancel is pressed while the second search is on its way.
  stub(async () => {
    if (searches.length !== 2) return;
    const job = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "discover")!);
    await as.mutation(api.jobs.cancel, { jobId: job._id });
  });
  await as.mutation(api.discovery.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
  const job = jobs.find((j) => j.kind === "discover")!;
  expect(job.status).toBe("cancelled");
  expect(searches).toHaveLength(2);
  // Both searches are paid for; only the first one's companies and step are kept. Nothing more was reserved, and no
  // next pass queued.
  const usage = await t.run((ctx) => ctx.db.query("usage").collect());
  expect(usage.filter((u) => u.service === "apollo")).toMatchObject([
    { credits: 1, ok: true, state: "settled" },
    { credits: 1, ok: true, state: "settled" },
  ]);
  expect(job.done!.map((d) => d.step.split(":")[0])).toEqual(["criteria"]);
  expect((await t.run((ctx) => ctx.db.query("companies").collect())).map((c) => c.name)).toEqual(["Company 1"]);
  expect(jobs.some((j) => j.kind === "enrich")).toBe(false);
  const [row] = await as.query(api.activity.list, {});
  expect(row).toMatchObject({ state: "cancelled", label: "Finding companies", detail: "Cancelled after 1 step", retry: { fn: "discovery.start", args: {} } });
});

test("a cancelled job's step results are refused where they'd be saved: its checkpoint, its skills, its roles workers' saves", async () => {
  const { t, w } = await withSearch();
  const jobId = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: w, kind: "skills", args: {}, status: "cancelled", tallied: true }));
  await expect(t.mutation(internal.jobs.checkpoint, { jobId, step: "x", result: 1 })).rejects.toThrow();
  await expect(t.mutation(internal.skills.save, { workspaceId: w, jobId, out: { items: [] } })).rejects.toThrow();
  await expect(t.mutation(internal.roles.saveTexts, { workspaceId: w, worker: `${jobId}:0`, texts: [], at: 0 })).rejects.toThrow();
  expect((await t.run((ctx) => ctx.db.get(jobId)))!.done).toBeUndefined();
});

test("cancelling work waiting to start takes it off before it runs: nothing is searched or charged", async () => {
  const { t, as, searches, stub } = await withSearch();
  stub();
  const jobId = await as.mutation(api.discovery.start, {});
  await as.mutation(api.jobs.cancel, { jobId: jobId! });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get(jobId!))).toMatchObject({ status: "cancelled" });
  expect((await t.run((ctx) => ctx.db.get(jobId!)))!.startedAt).toBeUndefined();
  expect(searches).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toHaveLength(0);
  expect((await as.query(api.activity.list, {}))[0]).toMatchObject({ state: "cancelled", detail: "Cancelled before it started" });
});

test("work paused for a budget can be cancelled, and doesn't start again when the budget allows", async () => {
  const { t, w, as } = await withSearch();
  const jobId = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: w, kind: "discover", args: {}, status: "paused", pausedFor: "apollo", error: "Apollo work is paused." }));
  await as.mutation(api.jobs.cancel, { jobId });
  await t.mutation(internal.jobs.resumePaused, { workspaceId: w });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const paused = await t.run((ctx) => ctx.db.get(jobId));
  expect([paused!.status, paused!.pausedFor, paused!.error]).toEqual(["cancelled", undefined, undefined]);
  // Finished work isn't cancelled, and another workspace's isn't found.
  const done = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: w, kind: "insights", args: {}, status: "done" }));
  await as.mutation(api.jobs.cancel, { jobId: done });
  expect((await t.run((ctx) => ctx.db.get(done)))!.status).toBe("done");
  const theirs = await t.run(async (ctx) => ctx.db.insert("jobs", { workspaceId: await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "b@example.com" })), kind: "insights", args: {}, status: "queued" }));
  await expect(as.mutation(api.jobs.cancel, { jobId: theirs })).rejects.toThrow("Not found");
});

test("a run that ends after it was cancelled stays cancelled", async () => {
  const t = convexTest(schema, modules);
  const jobId = await t.run(async (ctx) => {
    const w = await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "a@example.com" }));
    return ctx.db.insert("jobs", { workspaceId: w, kind: "insights", args: {}, status: "cancelled", tallied: true });
  });
  await t.mutation(internal.jobs.setState, { jobId, status: "done", result: { costUsd: 0.01 } });
  await t.mutation(internal.jobs.setState, { jobId, status: "failed", error: "x" });
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect([job!.status, job!.result, job!.error]).toEqual(["cancelled", undefined, undefined]);
  expect(await t.mutation(internal.jobs.markStarted, { jobId })).toBe(false);
});
