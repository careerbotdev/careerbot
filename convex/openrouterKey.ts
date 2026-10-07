import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { action, mutation } from "./functions";
import { openrouterHeaders } from "./openrouterApp";
import { open, seal } from "./secretBox";
import { requireWorkspace } from "./workspaces";

// The only module that handles a workspace's OpenRouter key. The key is never returned to a client.

async function stored(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("apiKeys")
    .withIndex("by_workspace_service", (q) => q.eq("workspaceId", workspaceId).eq("service", "openrouter"))
    .unique();
}

// What the settings screen may know: whether a key is set, and its last four characters.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await stored(ctx, workspaceId);
    return row ? { set: true as const, last4: row.last4, setAt: row.setAt } : { set: false as const };
  },
});

// Check the key with OpenRouter, then store it encrypted.
export const save = action({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const trimmed = key.trim();
    if (!trimmed) return { ok: false, message: "Paste your OpenRouter key." };
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: openrouterHeaders({ Authorization: `Bearer ${trimmed}` }) });
    if (!res.ok) return { ok: false, message: "OpenRouter didn't accept that key." };
    await ctx.runMutation(internal.openrouterKey.store, { sealed: await seal(trimmed), last4: trimmed.slice(-4) });
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
    else await ctx.db.insert("apiKeys", { workspaceId, service: "openrouter", ...fields });
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

// For server-side AI calls only (the metering wrapper). Returns null when the workspace has no key.
export async function openrouterKeyFor(
  ctx: { runQuery: (ref: typeof internal.openrouterKey.sealedFor, args: { workspaceId: Id<"workspaces"> }) => Promise<string | null> },
  workspaceId: Id<"workspaces">,
) {
  const sealed = await ctx.runQuery(internal.openrouterKey.sealedFor, { workspaceId });
  return sealed ? open(sealed) : null;
}
