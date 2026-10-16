import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalQuery, type QueryCtx, query } from "./_generated/server";
import { mutation } from "./functions";
import { runDiscover } from "./discovery";
import { runWeb } from "./webDiscovery";
import { requireWorkspace } from "./workspaces";

// How companies are found, chosen per workspace (Settings, Companies, Finding companies): Apollo's search
// (discovery.runDiscover, unchanged), Apollo's search and then the web search (webDiscovery.ts) for companies hiring
// now and ones that fit that Apollo missed, or the web search alone. Apollo runs first, so the web search adds to the
// companies it found by website instead of making second rows. Without an Apollo key it's always the web search alone,
// and so is finding people at a company (people.ts): only by hand.

export type Finding = "apollo" | "apolloWeb" | "web";
export const FINDING = v.union(v.literal("apollo"), v.literal("apolloWeb"), v.literal("web"));
export const NEEDS_APOLLO = "Add your Apollo key in Settings, Connections first.";
export const PEOPLE_BY_HAND = "Companies are found with AI only, so add people at a company by hand. Add your Apollo key in Settings, Connections to find them.";

async function choiceOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  const keys = await ctx.db.query("apiKeys").withIndex("by_workspace_service", (q) => q.eq("workspaceId", workspaceId)).collect();
  const apolloKey = keys.some((k) => k.service === "apollo");
  // Their choice where it can run; unset, Apollo when they have a key.
  const finding: Finding = !apolloKey ? "web" : (row?.finding ?? "apollo");
  return { row, choice: row?.finding ?? null, finding, apolloKey, braveKey: keys.some((k) => k.service === "brave") };
}

// The way companies are found now, and what they chose (null: the default).
export const settings = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { choice, finding, apolloKey, braveKey } = await choiceOf(ctx, workspaceId);
    return { choice, finding, apolloKey, braveKey };
  },
});

export const finding = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => (await choiceOf(ctx, workspaceId)).finding,
});

// Takes effect from the next search. An Apollo way needs their Apollo key.
export const set = mutation({
  args: { finding: FINDING },
  handler: async (ctx, { finding }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { row, apolloKey } = await choiceOf(ctx, workspaceId);
    if (finding !== "web" && !apolloKey) throw new ConvexError(NEEDS_APOLLO);
    if (row) await ctx.db.patch(row._id, { finding });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], finding });
  },
});

// A search for companies (the "discover" job): the chosen way, with what it found and what it cost.
export async function runFind(ctx: ActionCtx, job: Doc<"jobs">) {
  const finding = await ctx.runQuery(internal.findCompanies.finding, { workspaceId: job.workspaceId });
  if (finding === "apollo") return { finding, ...(await runDiscover(ctx, job)) };
  if (finding === "web") {
    const web = await runWeb(ctx, job, { named: true });
    return { finding, report: [], named: web.named, web, costUsd: web.costUsd };
  }
  const apollo = await runDiscover(ctx, job);
  const web = await runWeb(ctx, job, { named: false });
  return { finding, ...apollo, web, costUsd: apollo.costUsd + web.costUsd };
}
