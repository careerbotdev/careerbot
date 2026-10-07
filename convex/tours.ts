import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { requireWorkspace } from "./workspaces";

// Guided tours of the screens (src/app/tours): which screens' tours were offered once already, kept for the workspace
// so a phone and a laptop agree. A tour is always there to take from ⌘K and the screen's ⋯ menu; only the first-visit
// offer is remembered.

export const offered = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    return (await ctx.db.get(workspaceId))?.toursOffered ?? [];
  },
});

export const markOffered = mutation({
  args: { tour: v.string() },
  handler: async (ctx, { tour }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const w = await ctx.db.get(workspaceId);
    const seen = w?.toursOffered ?? [];
    if (!seen.includes(tour)) await ctx.db.patch(workspaceId, { toursOffered: [...seen, tour].slice(-50) });
  },
});
