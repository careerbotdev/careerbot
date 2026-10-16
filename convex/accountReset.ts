import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { accountName, anyLeft, ORDER, purgePage } from "./accountDelete";
import { mutation } from "./functions";
import { inWorkspace, pageOf } from "./workspaceRows";
import { requireWorkspace } from "./workspaces";

// Resetting an account (content/docs/using/your-data.mdx): the person, from Settings, Your data, after typing their
// account's name, clears everything in their workspace so they can start over, and stays signed in. It runs in the
// background a page at a time, each step safe to run again, its progress here and in the activity list:
//   1. counting: the rows it will clear, for the progress bar.
//   2. clearing: every workspace table but the KEPT ones (accountDelete's order and page purge, jobs first so no work
//      carries on), with the stored files the rows name; seed companies and the resume layout's choices about the
//      cleared record are taken out of the settings that hold them, and Getting started starts again. Once through, it
//      checks no cleared table has rows again and goes round once more if one does.
//   3. done: the row stays, so the screen can say how much went; the next reset starts it again.
// The demo refuses it like every change (functions.ts).

// What a reset keeps, and why. Every other workspace table is cleared, new ones included. apiKeys go too when the
// person ticks Also remove my keys.
export const KEPT: Record<string, string> = {
  memberships: "who can use the workspace: the sign-in stays",
  plans: "the operator's allowance for the workspace",
  usage: "spending: this month's budget and the platform allowance count it",
  spendTotals: "spending: Reports show what was paid",
  aiSpend: "spending: this month's AI budget counts it",
  aiDefaults: "a setting",
  aiSettings: "a setting",
  budgets: "a setting",
  profiles: "a setting: contact details",
  reminderSettings: "a setting",
  resumeSettings: "a setting; its choices about cleared roles, projects, skills and directions are taken out",
  discovery: "a setting; its seed companies are cleared",
  apiKeys: "the keys, unless Also remove my keys is ticked",
  driveConnections: "the Google Drive connection",
  driveLinks: "a Google Drive connection being made",
  githubInstalls: "the GitHub connection",
  githubLinks: "a GitHub connection being made",
  pendingConnections: "a connection being made",
};

// The tables a reset clears, in accountDelete's order (jobs first).
export const clearedTables = (keys: boolean) => ORDER.filter((t) => !(t in KEPT) || (keys && t === "apiKeys"));

// How far the dialog counts each group before it shows the number as "or more".
const CAP = 5000;
// Record kinds that are neither a direction nor a limit.
const GOAL_KINDS = ["direction", "limit"];

type Reset = Doc<"accountResets">;
const resetOf = (ctx: QueryCtx, workspace: Id<"workspaces">) => ctx.db.query("accountResets").withIndex("by_workspace", (q) => q.eq("workspace", workspace)).unique();

// A reset that hasn't shown a sign of life for this long was cut off, and Reset picks it up again.
export const STALLED_MS = 2 * 60_000;

// Rows of a workspace table, counted up to CAP.
async function countOf(ctx: QueryCtx, table: TableNames, workspaceId: Id<"workspaces">, keep: (doc: Record<string, unknown>) => boolean = () => true) {
  let n = 0;
  for await (const doc of inWorkspace(ctx, table, workspaceId)) {
    if (keep(doc as Record<string, unknown>)) n++;
    if (n >= CAP) break;
  }
  return n;
}

// ─── What Settings, Your data shows and starts ──────────────────────────────────────────────────────────────────────

// The reset under way or last finished in this workspace, and the name to type.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const member = userId && (await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).first());
    if (!member) return null;
    const user = await ctx.db.get(member.userId);
    const row = await resetOf(ctx, member.workspaceId);
    return {
      name: user ? accountName(user) : null,
      reset: row && { step: row.step, cleared: row.cleared, total: Math.max(row.total, row.cleared), beat: row.beat },
    };
  },
});

// What a reset would clear, by the groups the dialog lists, each counted up to CAP (capped: true when one reached it).
export const counts = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const items = { record: 0, review: 0, goals: 0 };
    for await (const item of inWorkspace(ctx, "items", workspaceId)) {
      const doc = item as Doc<"items">;
      if (doc.status === "proposed") items.review++;
      else if (doc.status === "approved") items[GOAL_KINDS.includes(doc.kind) ? "goals" : "record"]++;
      if (items.record + items.review + items.goals >= CAP) break;
    }
    const discovery = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    const groups = {
      stories: await countOf(ctx, "narratives", workspaceId, (d) => d.kind !== "goals"),
      record: items.record,
      review: items.review,
      goals: items.goals + (await countOf(ctx, "narratives", workspaceId, (d) => d.kind === "goals")),
      companies: (await countOf(ctx, "companies", workspaceId)) + (await countOf(ctx, "postings", workspaceId)),
      seeds: (discovery?.seeds.length ?? 0) + (discovery?.named?.length ?? 0),
      pursuits: await countOf(ctx, "pursuits", workspaceId),
      resumes: await countOf(ctx, "resumes", workspaceId),
      notes: await countOf(ctx, "notes", workspaceId),
      activity: await countOf(ctx, "jobs", workspaceId),
      exports: await countOf(ctx, "exports", workspaceId),
    };
    return { groups, capped: Object.values(groups).some((n) => n >= CAP) };
  },
});

// Reset my account: once they've typed its name. Running it again picks a stalled reset up; once done, starts anew.
export const start = mutation({
  args: { confirm: v.string(), keys: v.boolean() },
  handler: async (ctx, { confirm, keys }) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("Sign in to continue.");
    const name = accountName(user);
    if (confirm.trim().toLowerCase() !== name.trim().toLowerCase()) throw new ConvexError(`Type ${name} to confirm.`);
    if ((await ctx.db.get(workspaceId))?.demo) throw new ConvexError("The demo can’t be reset.");
    const existing = await resetOf(ctx, workspaceId);
    if (existing && existing.step !== "done") {
      if (Date.now() - existing.beat > STALLED_MS) await ctx.scheduler.runAfter(0, internal.accountReset.step, { id: existing._id });
      return;
    }
    const fresh = { workspace: workspaceId, userId, keys, step: "counting" as const, table: 0, cursor: undefined, total: 0, cleared: 0, beat: Date.now() };
    const id = existing ? (await ctx.db.replace(existing._id, fresh), existing._id) : await ctx.db.insert("accountResets", fresh);
    await ctx.scheduler.runAfter(0, internal.accountReset.step, { id });
  },
});

// ─── The background steps ───────────────────────────────────────────────────────────────────────────────────────────

// Settings that name what's cleared: seed companies go, and the resume layout forgets cleared roles, projects, skills
// and directions (its default length stays). Getting started shows again from its first step.
async function clearSettings(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const discovery = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  if (discovery) await ctx.db.patch(discovery._id, { seeds: [], named: undefined, resolved: [], rolesProblems: undefined, rolesBudget: undefined });
  const layout = await ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  if (layout) await ctx.db.patch(layout._id, { roles: [], projects: undefined, skills: undefined, lengths: layout.lengths?.filter((l) => !l.directionId) });
  await ctx.db.patch(workspaceId, { setupHidden: undefined, setupSkipped: undefined });
}

// One step: a page counted or cleared, then the next scheduled.
export const step = internalMutation({
  args: { id: v.id("accountResets") },
  handler: async (ctx, { id }) => {
    const row: Reset | null = await ctx.db.get(id);
    if (!row || row.step === "done") return;
    const tables = clearedTables(row.keys);
    const next = () => ctx.scheduler.runAfter(0, internal.accountReset.step, { id });
    if (row.step === "counting") {
      if (row.table >= tables.length) {
        await clearSettings(ctx, row.workspace);
        await ctx.db.patch(id, { step: "clearing", table: 0, cursor: undefined, beat: Date.now() });
        return void (await next());
      }
      const page = await pageOf(ctx, tables[row.table], row.workspace, row.cursor ?? null);
      await ctx.db.patch(id, { total: row.total + page.rows.length, beat: Date.now(), ...(page.done ? { table: row.table + 1, cursor: undefined } : { cursor: page.cursor }) });
      return void (await next());
    }
    if (row.table >= tables.length) {
      // Once through: anything written meanwhile sends it round again from that table.
      for (const [i, table] of tables.entries()) {
        if (await anyLeft(ctx, table, row.workspace)) {
          await ctx.db.patch(id, { table: i, cursor: undefined, beat: Date.now() });
          return void (await next());
        }
      }
      await clearSettings(ctx, row.workspace);
      await ctx.db.patch(id, { step: "done", beat: Date.now() });
      return;
    }
    const page = await purgePage(ctx, tables[row.table], row.workspace, row.cursor);
    await ctx.db.patch(id, { cleared: row.cleared + page.deleted, beat: Date.now(), ...(page.done ? { table: row.table + 1, cursor: undefined } : { cursor: page.cursor }) });
    await next();
  },
});
