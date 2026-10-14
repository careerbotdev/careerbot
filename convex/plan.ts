import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { selfHosted } from "./allowlist";

// CareerBot's own AI on careerbot.dev (the invite-only beta): a workspace with no OpenRouter key of its own uses
// CareerBot's key, within a monthly allowance the person can't raise. Their own AI budget can only lower it, and adding
// their own key takes the allowance away, so their budget alone applies again. Never on a self-hosted copy or the demo.
//
// Set in the Convex deployment's environment, both or neither:
//   PLATFORM_OPENROUTER_API_KEY: CareerBot's OpenRouter key.
//   PLATFORM_AI_LIMIT_USD: the most every workspace together may spend on that key in a month (UTC). Reservations are
//     checked against it in the same transaction as the workspace's own allowance, so workspaces calling at once can't
//     jointly spend past it. Set the key's own limit at OpenRouter to this or a little more, as a second cap.
//   PLATFORM_AI_ALLOWANCE_USD (optional, default 5): each workspace's monthly allowance, unless an operator set its own
//     (setAllowance).

export const DEFAULT_ALLOWANCE_USD = 5;

const envUsd = (name: string) => {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// CareerBot's own key and the most it may spend this month, or null when this deployment has no platform AI: a
// self-hosted copy, or either one isn't set (fails closed, so the key is never used without its limit).
export function platformAi(): { key: string; limitUsd: number } | null {
  if (selfHosted()) return null;
  const key = process.env.PLATFORM_OPENROUTER_API_KEY?.trim();
  const limitUsd = envUsd("PLATFORM_AI_LIMIT_USD");
  return key && limitUsd !== null ? { key, limitUsd } : null;
}

export const defaultAllowance = () => envUsd("PLATFORM_AI_ALLOWANCE_USD") ?? DEFAULT_ALLOWANCE_USD;

// CareerBot's key is used only with the recommended models (aiSettings.RECOMMENDED); other models, and the decision
// model, need the person's own key.
export const NOT_ON_PLATFORM = "Choose one of the recommended models in AI settings. Other models need your own OpenRouter key.";

const planRow = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("plans").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();

export type Plan = {
  // "platform": AI runs on CareerBot's key within allowanceUsd. "own key": the workspace has its own key, so the
  // allowance isn't in force (allowanceUsd is what would apply without it) and its own budget alone applies.
  source: "platform" | "own key";
  allowanceUsd: number;
  // An operator set this workspace's allowance; else it's the default.
  override: boolean;
};

// A workspace's plan, or null when there's no platform AI here (platformAi) or it's the demo.
export async function allowanceOf(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<Plan | null> {
  if (!platformAi()) return null;
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace || workspace.demo) return null;
  const row = await planRow(ctx, workspaceId);
  const ownKey = await ctx.db
    .query("apiKeys")
    .withIndex("by_workspace_service", (q) => q.eq("workspaceId", workspaceId).eq("service", "openrouter"))
    .unique();
  return { source: ownKey ? "own key" : "platform", allowanceUsd: row?.allowanceUsd ?? defaultAllowance(), override: !!row };
}

// Operator only (the caller checks): a workspace's own allowance, or null for the default again. A person's AI budget
// that was at the old allowance follows it, so raising the allowance raises what they can spend; a lower budget of
// their own stays. Work paused for the budget picks up and pauses again if it still doesn't fit.
export async function setAllowance(ctx: MutationCtx, workspaceId: Id<"workspaces">, allowanceUsd: number | null) {
  if (allowanceUsd !== null && !(Number.isFinite(allowanceUsd) && allowanceUsd >= 0)) throw new Error("An allowance is a dollar amount, 0 or more.");
  const before = (await allowanceOf(ctx, workspaceId))?.allowanceUsd ?? defaultAllowance();
  const row = await planRow(ctx, workspaceId);
  if (allowanceUsd === null) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) await ctx.db.patch(row._id, { allowanceUsd, setAt: Date.now() });
  else await ctx.db.insert("plans", { workspaceId, allowanceUsd, setAt: Date.now() });
  const after = allowanceUsd ?? defaultAllowance();
  const budget = await ctx.db.query("budgets").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  if (budget && budget.aiMonthlyUsd === before && after > before) await ctx.db.patch(budget._id, { aiMonthlyUsd: after });
  if (after > before) await ctx.runMutation(internal.jobs.resumePaused, { workspaceId });
}

// Whether an AI call of the workspace, which has no key of its own, goes on CareerBot's key (metering's aiKey).
export const onPlatform = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => (await allowanceOf(ctx, workspaceId))?.source === "platform",
});

// AI spending on CareerBot's key across every workspace, as a running total per month (platformAiSpend): settled cost
// (usd) and what calls not settled yet hold (held). Each call adds to one shard, picked at random, so calls settling
// at once rarely write the same row; a reservation reads them all, so reservations made at once are serialized and
// can't jointly pass the limit. What each workspace spent stays on its own usage rows (platform: true) and aiSpend.
const PLATFORM_SHARDS = 8;

export async function addPlatformSpend(ctx: MutationCtx, month: number, { usd = 0, held = 0 }: { usd?: number; held?: number }) {
  if (!usd && !held) return;
  const shard = Math.floor(Math.random() * PLATFORM_SHARDS);
  const row = await ctx.db
    .query("platformAiSpend")
    .withIndex("by_month", (q) => q.eq("month", month).eq("shard", shard))
    .unique();
  if (row) await ctx.db.patch(row._id, { usd: row.usd + usd, held: row.held + held });
  else await ctx.db.insert("platformAiSpend", { month, shard, usd, held });
}

// This month's spending on CareerBot's key, and its limit (null: no platform AI here).
export async function platformMonth(ctx: QueryCtx, month: number) {
  const rows = await ctx.db.query("platformAiSpend").withIndex("by_month", (q) => q.eq("month", month)).collect();
  const held = rows.reduce((n, r) => n + r.held, 0);
  return { spentUsd: rows.reduce((n, r) => n + r.usd, 0), heldUsd: held > 1e-9 ? held : 0, limitUsd: platformAi()?.limitUsd ?? null };
}

// Why CareerBot's key can't take a call of `amount` this month, or null when it can; when it can, the amount is held.
export const PLATFORM_USED_UP = "CareerBot's AI has reached its limit for this month.";
export const HELD_BY_PLATFORM = "Waiting for CareerBot's AI to free up from work already running.";
export async function reservePlatform(ctx: MutationCtx, month: number, amount: number) {
  const { spentUsd, heldUsd, limitUsd } = await platformMonth(ctx, month);
  if (limitUsd === null || spentUsd + amount > limitUsd) return PLATFORM_USED_UP;
  if (spentUsd + heldUsd + amount > limitUsd) return HELD_BY_PLATFORM;
  await addPlatformSpend(ctx, month, { held: amount });
  return null;
}

// A call on CareerBot's key settled and gave back what it held: work of any workspace paused waiting for the key to
// free up starts again, and pauses again if it still doesn't fit.
export async function resumePlatformHeld(ctx: MutationCtx) {
  for (const job of await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "paused")).collect()) {
    if (job.error !== HELD_BY_PLATFORM) continue;
    await ctx.db.patch(job._id, { status: "queued" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: job._id });
  }
}
