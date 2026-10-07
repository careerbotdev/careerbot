import { ConvexError, v } from "convex/values";
import { mutation } from "./functions";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Career breaks: time without a role, added by the person (often from a gap the record page points out; a gap is never
// turned into a break on its own). A break is a role item with `break` set, so resumes place, fold or leave it out like
// any role, and facts can belong to it. Their own entry is approved as given; Remove and Restore are the usual review.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const fields = { start: v.string(), end: v.optional(v.string()), reason: v.optional(v.string()) };

function clean({ start, end, reason }: { start: string; end?: string; reason?: string }) {
  const s = start.trim();
  const e = end?.trim() || null;
  if (!MONTH.test(s) || (e && !MONTH.test(e))) throw new ConvexError("Give dates as YYYY-MM.");
  if (e && e < s) throw new ConvexError("The end comes before the start.");
  return { start: s, end: e, ...(reason?.trim() ? { reason: reason.trim() } : {}) };
}

export const add = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const data = clean(args);
    const roles = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "role")).collect();
    const taken = new Set(roles.map((r) => r.roleKey));
    let roleKey = `break-${data.start}`;
    for (let n = 2; taken.has(roleKey); n++) roleKey = `break-${data.start}-${n}`;
    return ctx.db.insert("items", { workspaceId, kind: "role", status: "approved", roleKey, data: { key: roleKey, title: "Career break", break: true, ...data }, sources: [], at: Date.now() });
  },
});

export const edit = mutation({
  args: { id: v.id("items"), ...fields },
  handler: async (ctx, { id, ...args }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || item.kind !== "role" || !item.data.break) throw new Error("Not found.");
    const data = { ...item.data, ...clean(args) };
    if (!args.reason?.trim()) delete data.reason;
    await ctx.db.patch(id, { data });
  },
});
