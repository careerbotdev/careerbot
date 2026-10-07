import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { action, mutation } from "./functions";
import { open, seal } from "./secretBox";
import { requireWorkspace } from "./workspaces";

// The only module that handles a workspace's Apollo key. The key is never returned to a client.

async function stored(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db.query("apiKeys").withIndex("by_workspace_service", (q) => q.eq("workspaceId", workspaceId).eq("service", "apollo")).unique();
}

export type ApolloBalance = { left: number; limit: number; consumed: number; cycleStart?: number; cycleEnd?: number };

// The account's own credit balance for this billing cycle (costs 0 credits). On unified plans lead_credit is the shared
// pool that search and enrichment draw from. null when the key can't read it.
export async function apolloBalance(key: string): Promise<ApolloBalance | null> {
  const res = await fetch("https://api.apollo.io/api/v1/usage_stats/credit_usage_stats", { method: "POST", headers: { "x-api-key": key, "Content-Type": "application/json" } }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { credit_usage_stats?: Record<string, { limit?: number; consumed?: number; left_over?: number }>; current_credit_cycle?: Record<string, unknown> } | null;
  const pool = body?.credit_usage_stats?.lead_credit;
  if (!pool || typeof pool.left_over !== "number") return null;
  const date = (want: RegExp) => {
    const entry = Object.entries(body?.current_credit_cycle ?? {}).find(([k]) => want.test(k));
    const t = entry && typeof entry[1] === "string" ? Date.parse(entry[1]) : NaN;
    return Number.isFinite(t) ? t : undefined;
  };
  return { left: pool.left_over, limit: pool.limit ?? 0, consumed: pool.consumed ?? 0, cycleStart: date(/start/i), cycleEnd: date(/end/i) };
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await stored(ctx, workspaceId);
    return row ? { set: true as const, last4: row.last4, setAt: row.setAt } : { set: false as const };
  },
});

// Live balance for the settings screen.
export const balance = action({
  args: {},
  handler: async (ctx): Promise<ApolloBalance | null> => {
    const ws = await ctx.runQuery(internal.apolloKey.myWorkspace, {});
    const key = ws && (await apolloKeyFor(ctx, ws));
    return key ? apolloBalance(key) : null;
  },
});

export const myWorkspace = internalQuery({
  args: {},
  handler: async (ctx) => (await requireWorkspace(ctx)).workspaceId,
});

// Check the key can read the account's credit balance (so every spend can be kept inside it), then store it encrypted.
export const save = action({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const trimmed = key.trim();
    if (!trimmed) return { ok: false, message: "Paste your Apollo key." };
    const b = await apolloBalance(trimmed);
    if (!b) return { ok: false, message: "Apollo didn't accept that key, or it can't read your credit usage. Use a master key, or give the key access to credit usage stats, company search and organization enrichment." };
    await ctx.runMutation(internal.apolloKey.store, { sealed: await seal(trimmed), last4: trimmed.slice(-4) });
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
    else await ctx.db.insert("apiKeys", { workspaceId, service: "apollo", ...fields });
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

export async function apolloKeyFor(
  ctx: { runQuery: (ref: typeof internal.apolloKey.sealedFor, args: { workspaceId: Id<"workspaces"> }) => Promise<string | null> },
  workspaceId: Id<"workspaces">,
) {
  const sealed = await ctx.runQuery(internal.apolloKey.sealedFor, { workspaceId });
  return sealed ? open(sealed) : null;
}
