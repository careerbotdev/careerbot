import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { origin } from "./schema";
import { clockOf, requireWorkspace } from "./workspaces";

// Budgets are monthly and reset on the 1st (UTC).
export function monthStart(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function budgetRow(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db.query("budgets").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
}

// A month's calls to one service (this month's unless another is named).
async function monthCalls(ctx: QueryCtx, workspaceId: Id<"workspaces">, service: "openrouter" | "apollo", month = monthStart()) {
  const d = new Date(month);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return ctx.db
    .query("usage")
    .withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", workspaceId).eq("service", service).gte("at", month).lt("at", next))
    .collect();
}

// Settled costs in a month (Apollo: plus the credits of calls still running).
async function spent(ctx: QueryCtx, workspaceId: Id<"workspaces">, service: "openrouter" | "apollo", month = monthStart()) {
  const rows = await monthCalls(ctx, workspaceId, service, month);
  return rows.reduce((sum, r) => sum + (service === "openrouter" ? (r.costUsd ?? 0) : (r.credits ?? 0)), 0);
}

// AI spending is kept as a running total per workspace and month (aiSpend), so an AI call's budget check reads a few
// rows instead of every call of the month. Reading every call made calls running at once collide (each check read the
// rows the others were writing) until Convex gave up retrying. Shard 0 holds what was spent and held before the month's
// total started; each call adds what it holds and then what it cost to one of the other shards, picked at random, so
// calls settling at once rarely write the same row.
const AI_SHARDS = 8;

// One shard of a month's total. Read by its exact key, so a call touching one shard never collides with calls on another.
const aiSpendShard = (ctx: QueryCtx, workspaceId: Id<"workspaces">, month: number, shard: number) =>
  ctx.db.query("aiSpend").withIndex("by_workspace_month", (q) => q.eq("workspaceId", workspaceId).eq("month", month).eq("shard", shard)).unique();

// A month's settled AI spending (this month's unless another is named): the running total once the month's first call
// has started it, else summed from the usage rows.
async function aiSpent(ctx: QueryCtx, workspaceId: Id<"workspaces">, month = monthStart()) {
  const rows = await ctx.db.query("aiSpend").withIndex("by_workspace_month", (q) => q.eq("workspaceId", workspaceId).eq("month", month)).collect();
  return rows.some((r) => r.shard === 0) ? rows.reduce((n, r) => n + r.usd, 0) : spent(ctx, workspaceId, "openrouter", month);
}

// An AI call's cost (usd) and reservation (held) change the running total of the month it started in. Before that
// month's total has started they're left out: starting it sums the usage rows, this call's included.
export async function addAiSpend(ctx: MutationCtx, workspaceId: Id<"workspaces">, at: number, { usd = 0, held = 0 }: { usd?: number; held?: number }) {
  if (!usd && !held) return;
  const month = monthStart(at);
  if (!(await aiSpendShard(ctx, workspaceId, month, 0))) return;
  const shard = 1 + Math.floor(Math.random() * AI_SHARDS);
  const row = await aiSpendShard(ctx, workspaceId, month, shard);
  if (row) await ctx.db.patch(row._id, { usd: row.usd + usd, held: (row.held ?? 0) + held });
  else await ctx.db.insert("aiSpend", { workspaceId, month, shard, usd, held });
}

// Why a job paused when calls already running hold what's left of the budget; it picks up as they settle (resumeHeld).
export const HELD_BY_RUNNING = "Waiting on AI work already running, which could use the rest of this month's AI budget.";
// Why a job paused when what's left is held by calls that aren't running but weren't settled: cut off, or answered
// without saying what they cost. The nightly check settles them (metering's reconcile), and the job picks up then.
export const HELD_BY_UNSETTLED = "Waiting on earlier AI work to be settled tonight, which could use the rest of this month's AI budget.";
const HELD = [HELD_BY_RUNNING, HELD_BY_UNSETTLED];
export const isHeldReason = (message: string | undefined) => !!message && HELD.includes(message);

// What calls not settled yet hold of a month's total. Adding and taking off the same amounts can leave a rounding
// crumb, which holds nothing.
function heldOf(rows: Doc<"aiSpend">[]) {
  const held = rows.reduce((n, r) => n + (r.held ?? 0), 0);
  return held > 1e-9 ? held : 0;
}

// Whether calls not settled yet hold any of this month's budget. A job pausing for them starts again at once when none
// do: they settled between its refusal and its pause, so nothing will resume it.
export async function aiHeld(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return heldOf(await ctx.db.query("aiSpend").withIndex("by_workspace_month", (q) => q.eq("workspaceId", workspaceId).eq("month", monthStart())).collect()) > 0;
}

// Actions stop after 10 minutes, so a call reserved longer ago than that was cut off; the daily check settles it.
const RUNNING_MS = 10 * 60 * 1000;

// Whether an AI call of the workspace is on its way right now: reserved and not settled yet. Calls that settled without
// knowing what they cost (indeterminate) may still hold some of the budget, but aren't running.
export async function aiRunning(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const reserved = ctx.db.query("usage").withIndex("by_workspace_state", (q) => q.eq("workspaceId", workspaceId).eq("state", "reserved").gt("at", Date.now() - RUNNING_MS));
  return !!(await reserved.filter((q) => q.eq(q.field("service"), "openrouter")).first());
}

// A call settled and gave back what it held: work paused for what running calls held starts again, and pauses again if
// it still doesn't fit.
export async function resumeHeld(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  for (const job of await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "paused")).collect()) {
    if (job.workspaceId !== workspaceId || !isHeldReason(job.error)) continue;
    await ctx.db.patch(job._id, { status: "queued" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: job._id });
  }
}

export const BUDGET_REACHED = "BUDGET_REACHED";
export type BudgetReached = { code: typeof BUDGET_REACHED; service: "openrouter" | "apollo"; message: string };

// Why automated AI work can't start right now, or null when it can: no budget, or this month's settled spending has
// reached it. Every AI call checks this before reading its model's price (metering's chat); a pass with many calls at
// once also checks it while it runs, so it pauses as a whole.
export async function aiBudgetReached(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const b = await budgetRow(ctx, workspaceId);
  if (!b || b.aiMonthlyUsd <= 0) return "Set a monthly AI budget to continue.";
  if ((await aiSpent(ctx, workspaceId)) >= b.aiMonthlyUsd) return "This month's AI budget is used up.";
  return null;
}

export const aiCheck = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: (ctx, { workspaceId }) => aiBudgetReached(ctx, workspaceId),
});

// Records a call before it's made, holding the most it could cost, checked against the budget in the same transaction.
// Apollo: credits, against Apollo's balance and the person's own cap. AI: dollars (the call's worst case at its model's
// prices, metering.chat), against this month's budget less what's settled and what calls still running hold; the
// month's running total (a few rows) is what's read, so the check stays small. Without a budget, nothing is recorded or
// spent.
export const reserve = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    service: v.union(v.literal("openrouter"), v.literal("apollo")),
    automated: v.boolean(),
    amount: v.number(),
    purpose: v.string(),
    model: v.optional(v.string()),
    endpoint: v.optional(v.string()),
    // Apollo only: credits left on the Apollo account right now, and when its billing cycle started (Apollo's own figures).
    accountLeft: v.optional(v.number()),
    cycleStart: v.optional(v.number()),
    // What it's spent on (metering's SpentFor).
    jobId: v.optional(v.id("jobs")),
    origin: v.optional(origin),
    pursuitId: v.optional(v.id("pursuits")),
  },
  handler: async (ctx, { workspaceId, service, automated, amount, purpose, model, endpoint, accountLeft, cycleStart, jobId, origin, pursuitId }) => {
    const reached = (message: string): BudgetReached => ({ code: BUDGET_REACHED, service, message });
    if (service === "openrouter") {
      const b = await budgetRow(ctx, workspaceId);
      if (!b || b.aiMonthlyUsd <= 0) throw new ConvexError(reached("Set a monthly AI budget to continue."));
      // The month's first call starts its running total with what was spent and held so far.
      const month = monthStart();
      if (!(await aiSpendShard(ctx, workspaceId, month, 0))) {
        const calls = await monthCalls(ctx, workspaceId, "openrouter");
        const sum = (f: (r: (typeof calls)[number]) => number | undefined) => calls.reduce((n, r) => n + (f(r) ?? 0), 0);
        await ctx.db.insert("aiSpend", { workspaceId, month, shard: 0, usd: sum((r) => r.costUsd), held: sum((r) => r.reservedUsd) });
      }
      const total = await ctx.db.query("aiSpend").withIndex("by_workspace_month", (q) => q.eq("workspaceId", workspaceId).eq("month", month)).collect();
      const settled = total.reduce((n, r) => n + r.usd, 0);
      const held = heldOf(total);
      if (settled >= b.aiMonthlyUsd) throw new ConvexError(reached("This month's AI budget is used up."));
      if (settled + amount > b.aiMonthlyUsd) throw new ConvexError(reached("This call could cost more than what's left of this month's AI budget."));
      // Held by calls running now, which will settle and give back what they don't spend; or by calls that won't settle
      // until the nightly check (read in the same transaction, so a call settling meanwhile can't be missed).
      if (settled + held + amount > b.aiMonthlyUsd) throw new ConvexError(reached((await aiRunning(ctx, workspaceId)) ? HELD_BY_RUNNING : HELD_BY_UNSETTLED));
      await addAiSpend(ctx, workspaceId, Date.now(), { held: amount });
    } else {
      const b = await budgetRow(ctx, workspaceId);
      if (!b || b.apolloMode === "paused" || (automated && b.apolloMode === "onRequest"))
        throw new ConvexError(reached(b?.apolloMode === "paused" || !b ? "Apollo work is paused. Turn it on in Budgets." : "Automated Apollo work is off."));
      // Apollo's balance is the ceiling. Unknown balance: nothing is spent.
      if (accountLeft === undefined) throw new ConvexError(reached("Couldn't read your Apollo credit balance, so nothing was spent."));
      const rows = await ctx.db
        .query("usage")
        .withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", workspaceId).eq("service", "apollo").gte("at", cycleStart ?? monthStart()))
        .collect();
      // Apollo's balance already counts settled calls; calls still running aren't in it yet.
      const pending = rows.filter((r) => r.state === "reserved").reduce((n, r) => n + (r.credits ?? 0), 0);
      if (pending + amount > accountLeft) throw new ConvexError(reached("Your Apollo account doesn't have enough credits left this cycle."));
      // Their own cap within the cycle, if they set one lower than the plan.
      const used = rows.reduce((n, r) => n + (r.credits ?? 0), 0);
      if (b.apolloMonthlyCredits > 0 && used + amount > b.apolloMonthlyCredits)
        throw new ConvexError(reached("You've used the Apollo credits you set aside this cycle."));
    }
    return ctx.db.insert("usage", {
      workspaceId,
      service,
      purpose,
      model,
      endpoint,
      ...(service === "openrouter" ? { costUsd: 0, reservedUsd: amount } : { credits: amount }),
      ok: false,
      state: "reserved",
      jobId,
      origin,
      pursuitId,
      at: Date.now(),
    });
  },
});

// The month's budgets and what's been spent against them in the month of `at` (UTC; the workspace's clock, clockOf): AI,
// and Apollo credits (Apollo's own billing cycle is only known when a call is made).
export async function budgetStatus(ctx: QueryCtx, workspaceId: Id<"workspaces">, at: number) {
  const b = await budgetRow(ctx, workspaceId);
  const month = monthStart(at);
  return {
    aiMonthlyUsd: b?.aiMonthlyUsd ?? 0,
    aiSpentUsd: await aiSpent(ctx, workspaceId, month),
    apolloMonthlyCredits: b?.apolloMonthlyCredits ?? 0,
    apolloSpentCredits: await spent(ctx, workspaceId, "apollo", month),
    apolloMode: b?.apolloMode ?? ("paused" as const),
  };
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    return budgetStatus(ctx, workspaceId, await clockOf(ctx, workspaceId));
  },
});

export const set = mutation({
  args: {
    aiMonthlyUsd: v.number(),
    apolloMonthlyCredits: v.number(),
    apolloMode: v.union(v.literal("on"), v.literal("onRequest"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (args.aiMonthlyUsd < 0 || args.apolloMonthlyCredits < 0) throw new Error("Budgets can't be negative.");
    const b = await budgetRow(ctx, workspaceId);
    if (b) await ctx.db.patch(b._id, args);
    else await ctx.db.insert("budgets", { workspaceId, ...args });
    // Raising a budget picks paused work back up.
    await ctx.runMutation(internal.jobs.resumePaused, { workspaceId });
  },
});
