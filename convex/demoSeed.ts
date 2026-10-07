import { v } from "convex/values";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { thisSchema } from "./workspaceCopy";
import { pageOf, tablesOf as tablesOfIds, workspaceTable } from "./workspaceRows";

// The demo's rows, moved in and out whole by the demo script (scripts/demo.ts, `pnpm demo`): read a workspace's rows a
// page at a time for the snapshot, put a snapshot's rows into a new workspace, and wipe the demo workspace before it's
// seeded again. Internal only: the script calls them with the deployment's own key; no client ever can. Ids are
// remapped by the script with the same rules as the app's own import (workspaceCopy.ts), holding the old and new ids;
// here rows are only read, inserted, patched and deleted.

// The deployment's schema as plain data, for the script to find references with: the script can't load the schema
// itself, and the deployment's is what its rows are checked against.
export const shape = internalQuery({
  args: {},
  handler: () => thisSchema(),
});

type Row = { _id: string; workspaceId?: string } & Record<string, unknown>;

export const read = internalQuery({
  args: { table: v.string(), workspaceId: v.id("workspaces"), cursor: v.union(v.string(), v.null()) },
  handler: (ctx, { table, workspaceId, cursor }) => pageOf(ctx, table, workspaceId, cursor),
});

export const workspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: (ctx, { workspaceId }) => ctx.db.get(workspaceId),
});

// Which table each id belongs to on this deployment (null: not an id here), so the snapshot can name the ids its rows
// point to that it doesn't carry (a job still running, a user).
export const tablesOf = internalQuery({
  args: { ids: v.array(v.string()) },
  handler: (ctx, { ids }) => tablesOfIds(ctx, ids),
});

export const demoWorkspaces = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("workspaces").withIndex("by_demo", (q) => q.eq("demo", true)).collect()).map((w) => w._id),
});

// A new workspace for a snapshot, with its one user and membership: the demo (demo: true, the shared user visitors are
// signed in as) or an ordinary one (the working copy the script carries on through the app's own functions). began:
// when the copied search began, so Reports count what it holds. asOf: the demo is held at the moment of its snapshot
// (workspaces.clockOf), so it reads the same whatever day it's opened.
export const create = internalMutation({
  args: {
    name: v.string(),
    userName: v.string(),
    demo: v.boolean(),
    began: v.number(),
    asOf: v.optional(v.number()),
    setupHidden: v.optional(v.boolean()),
    setupSkipped: v.optional(v.array(v.union(v.literal("drive"), v.literal("people")))),
    toursOffered: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { name, userName, demo, ...fields }) => {
    const workspaceId = await ctx.db.insert("workspaces", { name, ...fields, ...(demo ? { demo: true } : {}) });
    const userId = await ctx.db.insert("users", { name: userName });
    await ctx.db.insert("memberships", { workspaceId, userId });
    return { workspaceId, userId };
  },
});

export const insert = internalMutation({
  args: { workspaceId: v.id("workspaces"), table: v.string(), docs: v.array(v.any()) },
  handler: async (ctx, { workspaceId, table, docs }) => {
    workspaceTable(table);
    const ids: string[] = [];
    for (const doc of docs) ids.push(await ctx.db.insert(table as TableNames, { ...doc, workspaceId } as never));
    return ids;
  },
});

// The second pass: references to rows inserted after the row that holds them, set once every row has its new id.
export const patch = internalMutation({
  args: { workspaceId: v.id("workspaces"), table: v.string(), patches: v.array(v.object({ id: v.string(), set: v.any() })) },
  handler: async (ctx, { workspaceId, table, patches }) => {
    workspaceTable(table);
    for (const { id, set } of patches) {
      const doc = (await ctx.db.get(id as Id<TableNames>)) as Row | null;
      if (!doc || doc.workspaceId !== workspaceId) throw new Error(`${table} ${id} isn't in the workspace.`);
      await ctx.db.patch(id as Id<TableNames>, set);
    }
  },
});

// Only a demo workspace is ever wiped here, whatever the script asks.
async function demoOnly(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const w = await ctx.db.get(workspaceId);
  if (!w?.demo) throw new Error(`${workspaceId} isn't the demo workspace.`);
}

// Wipe one page of a demo workspace's rows in a table; the script calls it until it's done.
export const clear = internalMutation({
  args: { table: v.string(), workspaceId: v.id("workspaces"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { table, workspaceId, cursor }) => {
    await demoOnly(ctx, workspaceId);
    const p = await pageOf(ctx, table, workspaceId, cursor);
    for (const r of p.rows) await ctx.db.delete(r._id as Id<TableNames>);
    return { deleted: p.rows.length, cursor: p.cursor, done: p.done };
  },
});

// The demo's user goes with it: its sign-ins (sessions, their refresh tokens and verifiers), accounts (and their codes),
// membership and the user itself. A user who also belongs to another workspace is never the demo's and stops the wipe.
async function removeUser(ctx: MutationCtx, userId: Id<"users">) {
  const memberships = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  for (const m of memberships) await ctx.db.delete(m._id);
  for (const s of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect()) {
    for (const t of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect()) await ctx.db.delete(t._id);
    for (const x of (await ctx.db.query("authVerifiers").collect()).filter((x) => x.sessionId === s._id)) await ctx.db.delete(x._id);
    await ctx.db.delete(s._id);
  }
  for (const a of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect()) {
    for (const c of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", a._id)).collect()) await ctx.db.delete(c._id);
    await ctx.db.delete(a._id);
  }
  await ctx.db.delete(userId);
}

export const unlink = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await demoOnly(ctx, workspaceId);
    const members = await ctx.db.query("memberships").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    for (const m of members) {
      const elsewhere = (await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", m.userId)).collect()).some((x) => x.workspaceId !== workspaceId);
      if (elsewhere) throw new Error(`User ${m.userId} belongs to another workspace too, so it isn't the demo's.`);
    }
    for (const m of members) await removeUser(ctx, m.userId);
    return members.length;
  },
});

// Last, once every table is empty for it: the workspace row.
export const drop = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await demoOnly(ctx, workspaceId);
    await ctx.db.delete(workspaceId);
  },
});
