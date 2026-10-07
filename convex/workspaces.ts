import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id, TableNames } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";

// The one place that decides which workspace a request may touch.
// Every public query, mutation and action that reads or writes workspace data starts with `requireWorkspace`.
export async function requireWorkspace(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to continue.");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!membership) throw new Error("No workspace for this account.");
  return { userId, workspaceId: membership.workspaceId };
}

// The time a workspace's screens count from: now, or the moment it's held at (asOf, the demo's snapshot), so what's
// new, due, recent, out of date or this month's stays as it was then.
export async function clockOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return (await ctx.db.get(workspaceId))?.asOf ?? Date.now();
}

type WorkspaceTable = {
  [T in TableNames]: DataModel[T]["document"] extends { workspaceId: Id<"workspaces"> } ? T : never;
}[TableNames];

// Load a document by id, but only if it belongs to the caller's workspace.
// Returns null for both "doesn't exist" and "belongs to someone else", so ids can't be probed.
export async function getInWorkspace<T extends WorkspaceTable>(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  id: Id<T>,
) {
  const doc = await ctx.db.get(id);
  return doc && "workspaceId" in doc && doc.workspaceId === workspaceId ? doc : null;
}

// Give a person their workspace the first time they sign in.
export async function ensureWorkspace(ctx: GenericMutationCtx<DataModel>, userId: Id<"users">) {
  const existing = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing.workspaceId;
  const user = await ctx.db.get(userId);
  const workspaceId = await ctx.db.insert("workspaces", { name: user?.name ?? user?.email ?? "My search" });
  await ctx.db.insert("memberships", { workspaceId, userId });
  return workspaceId;
}

export const current = query({
  args: {},
  // For display only: null when signed out or before the first workspace exists. demo: it's the read-only demo
  // (demo.ts), so the app can say so and not offer changes. asOf: the moment it's held at (clockOf), for the app's
  // clock (src/app/clock.ts); null: now.
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const workspace = membership && (await ctx.db.get(membership.workspaceId));
    return workspace && { id: workspace._id, name: workspace.name, demo: workspace.demo === true, asOf: workspace.asOf ?? null };
  },
});
