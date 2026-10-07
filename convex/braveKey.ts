import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { action, mutation } from "./functions";
import { open, seal } from "./secretBox";
import { requireWorkspace } from "./workspaces";

// The workspace's own Brave Search key, used to find a company's job board when its website doesn't link one.
// Never returned to a client. Brave bills the key's owner directly.

async function stored(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db.query("apiKeys").withIndex("by_workspace_service", (q) => q.eq("workspaceId", workspaceId).eq("service", "brave")).unique();
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await stored(ctx, workspaceId);
    return row ? { set: true as const, last4: row.last4 } : { set: false as const };
  },
});

export const save = action({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const k = key.trim();
    if (!k) return { ok: false, message: "Paste your Brave Search key." };
    const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=careerbot&count=1", { headers: { accept: "application/json", "X-Subscription-Token": k } }).catch(() => null);
    if (!res?.ok) return { ok: false, message: "Brave didn't accept that key." };
    await ctx.runMutation(internal.braveKey.store, { sealed: await seal(k), last4: k.slice(-4) });
    return { ok: true };
  },
});

export const store = internalMutation({
  args: { sealed: v.string(), last4: v.string() },
  handler: async (ctx, { sealed, last4 }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await stored(ctx, workspaceId);
    const fields = { sealed, last4, setAt: Date.now() };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("apiKeys", { workspaceId, service: "brave", ...fields });
  },
});

export const remove = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await stored(ctx, workspaceId);
    if (row) await ctx.db.delete(row._id);
  },
});

export const sealedFor = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => (await stored(ctx, workspaceId))?.sealed ?? null,
});

export async function braveKeyFor(
  ctx: { runQuery: (ref: typeof internal.braveKey.sealedFor, args: { workspaceId: Id<"workspaces"> }) => Promise<string | null> },
  workspaceId: Id<"workspaces">,
) {
  const sealed = await ctx.runQuery(internal.braveKey.sealedFor, { workspaceId });
  return sealed ? open(sealed) : null;
}
