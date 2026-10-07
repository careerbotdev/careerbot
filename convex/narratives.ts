import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
import { mutation } from "./functions";
import { getInWorkspace, requireWorkspace } from "./workspaces";

const kind = v.union(v.literal("career"), v.literal("goals"), v.literal("note"));

// Adds a narrative (and its first version) from server code, e.g. an answered follow-up question.
export async function addNarrative(ctx: MutationCtx, workspaceId: Id<"workspaces">, kind: "career" | "note", title: string, body: string) {
  const id = await ctx.db.insert("narratives", { workspaceId, kind, title, body, version: 1, updatedAt: Date.now() });
  await snapshot(ctx, workspaceId, id, 1, title, body);
  return id;
}

async function snapshot(ctx: MutationCtx, workspaceId: Id<"workspaces">, narrativeId: Id<"narratives">, version: number, title: string, body: string) {
  await ctx.db.insert("narrativeVersions", { workspaceId, narrativeId, version, title, body, at: Date.now() });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect();
    return rows.map((n) => ({
      id: n._id,
      kind: n.kind,
      title: n.title,
      version: n.version,
      updatedAt: n.updatedAt,
      rejected: n.rejectedAt !== undefined,
      rejectedBecause: n.rejectedBecause ?? null,
      // Words in it, as the Record's list shows them.
      words: n.body.trim() ? n.body.trim().split(/\s+/).length : 0,
      roleKey: n.roleKey ?? null,
    }));
  },
});

export const get = query({
  args: { id: v.id("narratives") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await getInWorkspace(ctx, workspaceId, id);
    if (!n) return null;
    const versions = await ctx.db.query("narrativeVersions").withIndex("by_narrative", (q) => q.eq("narrativeId", id)).order("desc").collect();
    return {
      id: n._id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      version: n.version,
      rejected: n.rejectedAt !== undefined,
      rejectedBecause: n.rejectedBecause ?? null,
      roleKey: n.roleKey ?? null,
      // Empty versions (a narrative as first created, before anything was written) aren't worth showing.
      versions: versions.filter((x) => x.body.trim()).map((x) => ({ version: x.version, title: x.title, body: x.body, at: x.at })),
    };
  },
});

export const create = mutation({
  args: { kind, title: v.string(), body: v.string() },
  handler: async (ctx, { kind, title, body }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (kind === "goals") {
      const existing = await ctx.db.query("narratives").withIndex("by_workspace_kind", (q) => q.eq("workspaceId", workspaceId).eq("kind", "goals")).first();
      if (existing) throw new Error("There's already a goals narrative. Edit that one.");
    }
    const t = title.trim() || (kind === "goals" ? "Goals" : "Untitled");
    const id = await ctx.db.insert("narratives", { workspaceId, kind, title: t, body, version: 1, updatedAt: Date.now() });
    await snapshot(ctx, workspaceId, id, 1, t, body);
    return id;
  },
});

// Saving keeps a new version only when something changed.
export const save = mutation({
  args: { id: v.id("narratives"), title: v.string(), body: v.string() },
  handler: async (ctx, { id, title, body }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await getInWorkspace(ctx, workspaceId, id);
    if (!n) throw new Error("Narrative not found.");
    const t = title.trim() || n.title;
    if (t === n.title && body === n.body) return n.version;
    const version = n.version + 1;
    await ctx.db.patch(id, { title: t, body, version, updatedAt: Date.now() });
    await snapshot(ctx, workspaceId, id, version, t, body);
    return version;
  },
});

// Restoring an old version saves it as the newest version; history is never rewritten.
export const restore = mutation({
  args: { id: v.id("narratives"), version: v.number() },
  handler: async (ctx, { id, version }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await getInWorkspace(ctx, workspaceId, id);
    if (!n) throw new Error("Narrative not found.");
    const old = await ctx.db.query("narrativeVersions").withIndex("by_narrative", (q) => q.eq("narrativeId", id).eq("version", version)).unique();
    if (!old) throw new Error("That version doesn't exist.");
    const next = n.version + 1;
    await ctx.db.patch(id, { title: old.title, body: old.body, version: next, updatedAt: Date.now() });
    await snapshot(ctx, workspaceId, id, next, old.title, old.body);
    return next;
  },
});

// Link a story or note to the role it's about (a role in their record), or unlink it (null).
export const link = mutation({
  args: { id: v.id("narratives"), roleKey: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, roleKey }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await getInWorkspace(ctx, workspaceId, id);
    if (!n || n.kind === "goals") throw new ConvexError("Not found.");
    if (roleKey !== null) {
      const roles = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "role")).collect();
      if (!roles.some((r) => r.roleKey === roleKey && r.status !== "rejected")) throw new ConvexError("That role isn’t in your record.");
    }
    await ctx.db.patch(id, { roleKey: roleKey ?? undefined });
  },
});

// Deleting a narrative removes it and its versions. Facts that came from it stay, flagged, so the person decides;
// they may have moved that story into another narrative. What was set aside with it alone (it was rejected) goes with it.
// Its passages go from every item that quoted it (insights and questions carry their facts' sources), and so do the
// comparisons that read it. An item it leaves with no source counts as one added by hand (recordContext.sourceCheck).
export const remove = mutation({
  args: { id: v.id("narratives") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await getInWorkspace(ctx, workspaceId, id);
    if (!n) throw new Error("Narrative not found.");
    for (const x of await ctx.db.query("narrativeVersions").withIndex("by_narrative", (q) => q.eq("narrativeId", id)).collect()) await ctx.db.delete(x._id);
    const items = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId)).collect();
    for (const i of items) {
      if (!i.sources.some((src) => src.narrativeId === id)) continue;
      // Background from the narrative goes with it; notes kept for a fact stay with that fact. Facts are flagged.
      if ((i.status === "setAside" && i.sources.every((src) => src.narrativeId === id)) || (i.kind === "context" && !i.data.factId)) {
        await ctx.db.delete(i._id);
        continue;
      }
      const sources = i.sources.filter((src) => src.narrativeId !== id);
      if (i.kind === "fact") await ctx.db.patch(i._id, { sources, data: { ...i.data, sourceDeleted: n.title } });
      else await ctx.db.patch(i._id, { sources });
    }
    for (const c of await ctx.db.query("comparisons").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) if (c.narrativeId === id) await ctx.db.delete(c._id);
    for (const x of await ctx.db.query("notes").withIndex("by_subject", (q) => q.eq("workspaceId", workspaceId).eq("subject.kind", "narrative").eq("subject.id", id)).collect()) await ctx.db.delete(x._id);
    await ctx.db.delete(id);
  },
});
