import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { monthStart } from "./budgets";

// Running totals the reports read (reports.ts), kept up where things happen, so a report reads a few rows per day or
// month instead of every job, company, fact, resume or paid call a workspace ever had. Each change adds to one of a few
// shards, picked at random, so changes made at once (roles being ranked by several workers, calls settling together)
// rarely write the same row. A report adds the shards up. Each row a count is about says whether it's in it (usage
// inTotals, the others `tallied`): it's added once, and taken back only if it was added, so counting what was there
// before (reports.backfill) can run at any time, as often as needed, alongside the changes.

const SHARDS = 8;
export const DAY_MS = 86_400_000;
// The UTC day a time falls on.
export const dayOf = (at: number) => at - (at % DAY_MS);
// For counts that stand for now rather than for a day ("roles").
export const STANDING = 0;

export type Metric = Doc<"tallies">["metric"];

// Add n (negative to take away) to a workspace's count for a day (dayOf), split by key when the count is.
export async function tally(ctx: MutationCtx, workspaceId: Id<"workspaces">, metric: Metric, day: number, n: number, key?: string) {
  if (!n) return;
  const s = Math.floor(Math.random() * SHARDS);
  const row = await ctx.db
    .query("tallies")
    .withIndex("by_metric", (q) => q.eq("workspaceId", workspaceId).eq("metric", metric).eq("day", day).eq("key", key).eq("shard", s))
    .unique();
  if (row) await ctx.db.patch(row._id, { n: row.n + n });
  else await ctx.db.insert("tallies", { workspaceId, metric, day, key, shard: s, n });
}

// A count's rows from a day on (every shard, every key), for the report to add up.
export const talliedSince = (ctx: QueryCtx, workspaceId: Id<"workspaces">, metric: Metric, fromDay: number) =>
  ctx.db.query("tallies").withIndex("by_metric", (q) => q.eq("workspaceId", workspaceId).eq("metric", metric).gte("day", fromDay)).collect();

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
