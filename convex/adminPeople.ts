import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { aiSpentThisMonth, monthStart } from "./budgets";
import { mutation } from "./functions";
import { inviteFor, normalEmail, openInvite, stateOf } from "./invites";
import { requireOperator } from "./operators";
import { allowanceOf, setAllowance as savePlanAllowance } from "./plan";
import { suspended } from "./suspensions";

// The admin screen's functions (/admin), careerbot.dev's operators only: every one starts with requireOperator, and
// every change is written to the log (adminLog). They read who someone is, their invite, when they were last active
// and what their AI cost, never what's in their workspace: no record, stories, goals or resumes.

export type PersonStatus = "active" | "invited" | "expired" | "revoked" | "suspended";

// A person's workspace (each person has one).
async function workspaceOf(ctx: QueryCtx, userId: Id<"users">) {
  return (await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).first())?.workspaceId ?? null;
}

// The people with a workspace, less the demo's made-up one.
async function members(ctx: QueryCtx) {
  const found: { user: Doc<"users">; workspaceId: Id<"workspaces"> }[] = [];
  for (const user of await ctx.db.query("users").collect()) {
    const workspaceId = await workspaceOf(ctx, user._id);
    if (workspaceId && !(await ctx.db.get(workspaceId))?.demo) found.push({ user, workspaceId });
  }
  return found;
}

// Last active: their last sign-in, or the newest work their workspace started, whichever is later.
async function lastActive(ctx: QueryCtx, user: Doc<"users">, workspaceId: Id<"workspaces">) {
  const job = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").first();
  return Math.max(user.lastSignInAt ?? 0, job?._creationTime ?? 0) || null;
}

// Everyone with a workspace or an invite: who they are, where their invite stands (with its link while it's open),
// when they were last active, and their AI spent this month against their allowance.
export const people = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);
    const now = Date.now();
    const seen = new Set<string>();
    const rows = [];
    for (const { user, workspaceId } of await members(ctx)) {
      const invite = user.email ? await inviteFor(ctx, user.email) : null;
      if (user.email) seen.add(normalEmail(user.email));
      rows.push({
        key: user._id as string,
        userId: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        status: ((await suspended(ctx, user._id)) ? "suspended" : "active") as PersonStatus,
        invitedAt: invite?._creationTime ?? null,
        expiresAt: null,
        link: null,
        lastActive: await lastActive(ctx, user, workspaceId),
        spentUsd: await aiSpentThisMonth(ctx, workspaceId),
        plan: await allowanceOf(ctx, workspaceId),
      });
    }
    for (const invite of await ctx.db.query("invites").collect()) {
      if (seen.has(invite.email)) continue;
      const state = stateOf(invite, now);
      // A used invite whose person has gone (deleted their account) is history, not someone to list.
      if (state === "accepted") continue;
      rows.push({
        key: invite._id as string,
        userId: null,
        name: null,
        email: invite.email,
        status: (state === "open" ? "invited" : state) as PersonStatus,
        invitedAt: invite._creationTime,
        expiresAt: invite.expiresAt,
        link: state === "open" ? `/invite/${invite.token}` : null,
        lastActive: null,
        spentUsd: null,
        plan: null,
      });
    }
    return rows.sort((a, b) => (b.lastActive ?? b.invitedAt ?? 0) - (a.lastActive ?? a.invitedAt ?? 0));
  },
});

// The value at fraction p of sorted numbers (nearest rank): 0.5 the median, 0.95 the 95th percentile.
export function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

// This month's AI cost by step, across people: for each step (a task in spendTotals), how many people's AI it ran,
// the median and 95th percentile of what it cost each of them, and the total; and the same for each person's whole
// month. Only people who spent anything count.
export const costByStep = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);
    const month = monthStart();
    const perStep: Record<string, number[]> = {};
    const perPerson: number[] = [];
    for (const { workspaceId } of await members(ctx)) {
      const byTask: Record<string, number> = {};
      const totals = await ctx.db.query("spendTotals").withIndex("by_key", (q) => q.eq("workspaceId", workspaceId).eq("month", month)).collect();
      for (const t of totals) if (t.service === "openrouter") byTask[t.task] = (byTask[t.task] ?? 0) + t.usd;
      const spent = Object.values(byTask).reduce((n, usd) => n + usd, 0);
      if (spent <= 0) continue;
      perPerson.push(spent);
      for (const [task, usd] of Object.entries(byTask)) if (usd > 0) (perStep[task] ??= []).push(usd);
    }
    const summary = (costs: number[]) => {
      const sorted = [...costs].sort((a, b) => a - b);
      return { people: sorted.length, medianUsd: percentile(sorted, 0.5), p95Usd: percentile(sorted, 0.95), totalUsd: sorted.reduce((n, x) => n + x, 0) };
    };
    return {
      month,
      person: summary(perPerson),
      steps: Object.entries(perStep)
        .map(([step, costs]) => ({ step, ...summary(costs) }))
        .sort((a, b) => b.totalUsd - a.totalUsd),
    };
  },
});

// The log of operator actions, newest first, with who did each.
export const log = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);
    const rows = await ctx.db.query("adminLog").withIndex("by_at").order("desc").take(200);
    const names: Record<string, string | null> = {};
    for (const r of rows) if (r.by && !(r.by in names)) names[r.by] = (await ctx.db.get(r.by))?.name ?? null;
    return rows.map((r) => ({ id: r._id, at: r.at, action: r.action, email: r.email, amountUsd: r.amountUsd ?? null, by: r.by ? (names[r.by] ?? "An operator") : null }));
  },
});

type Action = Doc<"adminLog">["action"];
const record = (ctx: MutationCtx, by: Id<"users">, action: Action, email: string, extra: { userId?: Id<"users">; amountUsd?: number | null } = {}) =>
  ctx.db.insert("adminLog", { at: Date.now(), by, action, email, ...extra });

// Invites an email: a link good for 14 days, to send them. Inviting an email again (not used yet) sends a new link.
export const invite = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const { userId } = await requireOperator(ctx);
    const address = normalEmail(email);
    const member = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", address)).first();
    if (member && (await workspaceOf(ctx, member._id))) throw new ConvexError(`${address} already has an account.`);
    const { token, again } = await openInvite(ctx, address, userId);
    await record(ctx, userId, again ? "inviteResent" : "invited", address);
    return { link: `/invite/${token}` };
  },
});

async function openInviteOf(ctx: QueryCtx, email: string) {
  const found = await inviteFor(ctx, email);
  if (!found) throw new ConvexError("No invite for that email.");
  if (found.status === "accepted") throw new ConvexError("That invite was already used.");
  return found;
}

// A new link for an invite not used yet (open, expired or withdrawn), good for 14 more days; the old link stops working.
export const resendInvite = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const { userId } = await requireOperator(ctx);
    const found = await openInviteOf(ctx, email);
    const { token } = await openInvite(ctx, found.email, found.invitedBy ?? userId);
    await record(ctx, userId, "inviteResent", found.email);
    return { link: `/invite/${token}` };
  },
});

// Withdraws an invite not used yet: its link no longer lets anyone sign up.
export const revokeInvite = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const { userId } = await requireOperator(ctx);
    const found = await openInviteOf(ctx, email);
    await ctx.db.patch(found._id, { status: "revoked" });
    await record(ctx, userId, "inviteRevoked", found.email);
  },
});

async function personOf(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  const workspaceId = user && (await workspaceOf(ctx, userId));
  if (!user || !workspaceId) throw new ConvexError("No such person.");
  return { user, workspaceId, email: user.email ?? user.name ?? "" };
}

// Sets a person's monthly AI allowance on CareerBot's AI, or puts it back to the default (null).
export const setAllowance = mutation({
  args: { userId: v.id("users"), allowanceUsd: v.union(v.number(), v.null()) },
  handler: async (ctx, { userId: person, allowanceUsd }) => {
    const { userId } = await requireOperator(ctx);
    if (allowanceUsd !== null && !(Number.isFinite(allowanceUsd) && allowanceUsd >= 0)) throw new ConvexError("An allowance is a dollar amount, 0 or more.");
    const { workspaceId, email } = await personOf(ctx, person);
    await savePlanAllowance(ctx, workspaceId, allowanceUsd);
    await record(ctx, userId, "allowanceSet", email, { userId: person, amountUsd: allowanceUsd });
  },
});

// Suspends someone: they're signed out everywhere, can't sign in until restored, and their allowance on CareerBot's AI
// is 0 meanwhile, so background work stops spending too. Their workspace is kept as it is.
export const suspend = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: person }) => {
    const { userId } = await requireOperator(ctx);
    if (person === userId) throw new ConvexError("You can’t suspend yourself.");
    const { workspaceId, email } = await personOf(ctx, person);
    if (await suspended(ctx, person)) return;
    const plan = await allowanceOf(ctx, workspaceId);
    await ctx.db.insert("suspensions", { userId: person, at: Date.now(), by: userId, allowanceBefore: plan?.override ? plan.allowanceUsd : null });
    if (plan) await savePlanAllowance(ctx, workspaceId, 0);
    // Signed out everywhere: their sessions go, with the refresh tokens that would renew them.
    for (const session of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", person)).collect()) {
      for (const token of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).collect()) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    await record(ctx, userId, "suspended", email, { userId: person });
  },
});

// Lets a suspended person sign in again, with the allowance they had.
export const restore = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: person }) => {
    const { userId } = await requireOperator(ctx);
    const { workspaceId, email } = await personOf(ctx, person);
    const rows = await ctx.db.query("suspensions").withIndex("by_user", (q) => q.eq("userId", person)).collect();
    if (!rows.length) return;
    for (const r of rows) await ctx.db.delete(r._id);
    if (await allowanceOf(ctx, workspaceId)) await savePlanAllowance(ctx, workspaceId, rows[0].allowanceBefore);
    await record(ctx, userId, "restored", email, { userId: person });
  },
});
