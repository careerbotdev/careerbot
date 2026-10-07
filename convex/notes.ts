import { ConvexError, type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { change } from "./pursuits";
import { noteSubject } from "./schema";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Notes in their own words on anything: a pursuit, a company, a role posting, an item of the record, a story. Dated,
// kept with the item, and never evidence: no prompt, resume or letter reads them. A note added to a pursuit goes on its
// timeline.

type Subject = Infer<typeof noteSubject>;

// The thing a note is on, if it's in their workspace.
async function subjectIn(ctx: QueryCtx, workspaceId: Id<"workspaces">, subject: Subject) {
  switch (subject.kind) {
    case "pursuit":
      return getInWorkspace(ctx, workspaceId, subject.id);
    case "company":
      return getInWorkspace(ctx, workspaceId, subject.id);
    case "posting":
      return getInWorkspace(ctx, workspaceId, subject.id);
    case "item":
      return getInWorkspace(ctx, workspaceId, subject.id);
    case "resume":
      return getInWorkspace(ctx, workspaceId, subject.id);
    case "narrative":
      return getInWorkspace(ctx, workspaceId, subject.id);
  }
}

async function requireSubject(ctx: QueryCtx, workspaceId: Id<"workspaces">, subject: Subject) {
  if (!(await subjectIn(ctx, workspaceId, subject))) throw new ConvexError("Not found.");
}

// A note of theirs, on something still in their workspace.
async function ownNote(ctx: QueryCtx, workspaceId: Id<"workspaces">, id: Id<"notes">) {
  const n = await getInWorkspace(ctx, workspaceId, id);
  if (!n) throw new ConvexError("Not found.");
  await requireSubject(ctx, workspaceId, n.subject);
  return n;
}

function textOf(text: string) {
  const t = text.trim();
  if (!t) throw new ConvexError("Write the note first.");
  return t;
}

// Its notes, oldest first.
export const list = query({
  args: { subject: noteSubject },
  handler: async (ctx, { subject }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await requireSubject(ctx, workspaceId, subject);
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_subject", (q) => q.eq("workspaceId", workspaceId).eq("subject.kind", subject.kind).eq("subject.id", subject.id))
      .collect();
    return rows.map((n) => ({ id: n._id, text: n.text, at: n.at, editedAt: n.editedAt ?? null }));
  },
});

export const add = mutation({
  args: { subject: noteSubject, text: v.string() },
  handler: async (ctx, { subject, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await requireSubject(ctx, workspaceId, subject);
    const id = await ctx.db.insert("notes", { workspaceId, subject, text: textOf(text), at: Date.now() });
    const p = subject.kind === "pursuit" ? await ctx.db.get(subject.id) : null;
    if (p) await change(ctx, p, {}, { event: "notes" });
    return id;
  },
});

export const edit = mutation({
  args: { id: v.id("notes"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await ownNote(ctx, workspaceId, id);
    const next = textOf(text);
    if (next === n.text) return;
    await ctx.db.patch(id, { text: next, editedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await ownNote(ctx, workspaceId, id);
    await ctx.db.delete(id);
  },
});
