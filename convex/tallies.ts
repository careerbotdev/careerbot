import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { monthStart } from "./budgets";

// Running totals the reports read (reports.ts), kept up where things happen, so a report reads a few rows per day or
// month instead of every job, company, fact, resume or paid call a workspace ever had. Each row a count is about says
// whether it's in it (usage inTotals, the others `tallied`): it's added once, and taken back only if it was added, so
// counting what was there before (reports.backfill) can run at any time, as often as needed, alongside the changes.
//
// A change to a count is a row of its own, written without reading any count, so writes made at once (a roles pass
// saving ten boards and ranking many roles together, jobs finishing together) never collide over a count, and a count
// can never make the work it counts fail. Within one write, changes to the same count go onto that write's one row.
// Every few minutes `fold` adds the changes into the count's one folded row (per day and key) and deletes them, so a
// report reads a few rows per count and day: the folded ones and the changes since.

// spendTotals only: each settled call adds to one of a few, picked at random.
const SHARDS = 8;
export const DAY_MS = 86_400_000;
// The UTC day a time falls on.
export const dayOf = (at: number) => at - (at % DAY_MS);
// For counts that stand for now rather than for a day ("roles").
export const STANDING = 0;

export type Metric = Doc<"tallies">["metric"];

// This write's own change rows, by count.
const written = new WeakMap<object, Map<string, { id: Id<"tallies">; n: number }>>();
const countOf = (workspaceId: Id<"workspaces">, metric: Metric, day: number, key?: string) => JSON.stringify([workspaceId, metric, day, key ?? null]);

// Add n (negative to take away) to a workspace's count for a day (dayOf), split by key when the count is.
export async function tally(ctx: MutationCtx, workspaceId: Id<"workspaces">, metric: Metric, day: number, n: number, key?: string) {
  if (!n) return;
  let mine = written.get(ctx.db);
  if (!mine) written.set(ctx.db, (mine = new Map()));
  const count = countOf(workspaceId, metric, day, key);
  const row = mine.get(count);
  if (!row) {
    mine.set(count, { id: await ctx.db.insert("tallies", { workspaceId, metric, day, key, n }), n });
    return;
  }
  row.n += n;
  await ctx.db.patch(row.id, { n: row.n });
}

// A count's rows from a day on (folded and not yet, every key), for the report to add up.
export const talliedSince = (ctx: QueryCtx, workspaceId: Id<"workspaces">, metric: Metric, fromDay: number) =>
  ctx.db.query("tallies").withIndex("by_metric", (q) => q.eq("workspaceId", workspaceId).eq("metric", metric).gte("day", fromDay)).collect();

// Change rows folded per run; a full page runs again at once.
const FOLD_PAGE = 500;
// Changes are folded once they're this old, so folding never reads where changes are still being written.
const SETTLE_MS = 60_000;

// Every few minutes (crons.ts): adds settled change rows into their counts' folded rows and deletes them, in one write,
// so a report adds up the same before and after. Rows from before changes were rows of their own (one of eight
// shards, `shard`) are folded the same way.
export const fold = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("tallies")
      .withIndex("by_folded", (q) => q.eq("folded", undefined).lt("_creationTime", Date.now() - SETTLE_MS))
      .take(FOLD_PAGE);
    const sums = new Map<string, { of: Doc<"tallies">; n: number }>();
    for (const r of rows) {
      const count = countOf(r.workspaceId, r.metric, r.day, r.key);
      const sum = sums.get(count);
      if (sum) sum.n += r.n;
      else sums.set(count, { of: r, n: r.n });
      await ctx.db.delete(r._id);
    }
    for (const { of, n } of sums.values()) {
      const total = await ctx.db
        .query("tallies")
        .withIndex("by_metric", (q) => q.eq("workspaceId", of.workspaceId).eq("metric", of.metric).eq("day", of.day).eq("key", of.key).eq("folded", true))
        .first();
      if (!total) {
        if (n) await ctx.db.insert("tallies", { workspaceId: of.workspaceId, metric: of.metric, day: of.day, key: of.key, n, folded: true });
      } else if (total.n + n) await ctx.db.patch(total._id, { n: total.n + n });
      else await ctx.db.delete(total._id);
    }
    if (rows.length === FOLD_PAGE) await ctx.scheduler.runAfter(0, internal.tallies.fold, {});
    return rows.length;
  },
});

// A fact's or insight's approval: counted the day it becomes approved, taken back the day it stops being approved
// (undone, merged away; `next` null: deleted) when it was counted. `item`: as it was before the change.
export async function tallyApproval(ctx: MutationCtx, item: Doc<"items">, next: Doc<"items">["status"] | null) {
  const metric = item.kind === "fact" ? "factsApproved" : item.kind === "insight" ? "insightsApproved" : null;
  const counts = next === "approved";
  if (!metric || counts === !!item.tallied) return;
  await tally(ctx, item.workspaceId, metric, dayOf(Date.now()), counts ? 1 : -1);
  if (next) await ctx.db.patch(item._id, { tallied: counts || undefined });
}

// The task a call's purpose names, without its detail ("find companies: Sales" is "find companies").
export const taskOf = (purpose: string) => purpose.split(":")[0].trim();

// A settled call's cost goes onto the month (UTC) it started in, once (the row is marked inTotals).
export async function addSpend(ctx: MutationCtx, row: Doc<"usage">) {
  if (row.inTotals || !(row.state === "settled" || row.state === undefined)) return;
  const key = { workspaceId: row.workspaceId, month: monthStart(row.at), service: row.service, task: taskOf(row.purpose), origin: row.origin, pursuitId: row.pursuitId, shard: Math.floor(Math.random() * SHARDS) };
  const usd = row.service === "openrouter" ? (row.costUsd ?? 0) : 0;
  const credits = row.service === "apollo" ? (row.credits ?? 0) : 0;
  const total = await ctx.db
    .query("spendTotals")
    .withIndex("by_key", (q) =>
      q.eq("workspaceId", key.workspaceId).eq("month", key.month).eq("service", key.service).eq("task", key.task).eq("origin", key.origin).eq("pursuitId", key.pursuitId).eq("shard", key.shard),
    )
    .unique();
  if (total) await ctx.db.patch(total._id, { usd: total.usd + usd, credits: total.credits + credits, calls: total.calls + 1 });
  else await ctx.db.insert("spendTotals", { ...key, usd, credits, calls: 1 });
  await ctx.db.patch(row._id, { inTotals: true });
}
