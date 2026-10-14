import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { selfHosted } from "./allowlist";
import { revokeDrive } from "./drive";
import { mutation } from "./functions";
import { appFor, appJwt, githubFetch } from "./githubApp";
import schema from "./schema";
import { linksIn, shapeOf, WORKSPACE_TABLES } from "./workspaceCopy";

// Deleting an account (content/docs/using/your-data.mdx): the person themselves, from Settings, Your data, after typing
// their account's name; or, on a self-hosted copy, its owner removing someone (account.removePerson). It runs in the
// background, a step at a time, each safe to run again:
//   1. revoking: Google revokes CareerBot's Drive tokens, and CareerBot's GitHub App is uninstalled where only this
//      workspace used the installation. Best effort: an unreachable service doesn't stop the deletion.
//   2. deleting: every row of the workspace, a page of one table at a time, with the stored files the rows name. The
//      tables are every one with a workspaceId, found from the schema (workspaceCopy.WORKSPACE_TABLES; each is also
//      carried or left out on purpose by a copy, workspaceCopy.classify), work in progress first so nothing runs on.
//      Once through, it checks no table has rows again and goes round once more if one does.
//   3. signingOut: only the account is left; the person's screens see it and sign out (a moment's grace).
//   4. done: the workspace, membership, sign-in accounts, sessions, rows naming the person (PERSON_TABLES), any
//      waitlist entry and careerbot.dev invite for their email, and the person. The row itself goes an hour later.
// The demo refuses it like every change (functions.ts); a self-hosted copy's owner can't delete their own account
// while anyone else can sign in to it.

// Tables outside a workspace whose rows name a person (a field holding a users id): what deleting the account does with
// them, deleted by an index on that field, or kept and why. Every such table is listed (accountDelete.test.ts).
export const PERSON_TABLES: Record<string, { index: string; field: string } | { kept: string }> = {
  accountDeletions: { kept: "the deletion's own progress, forgotten an hour after it's done" },
  invites: { index: "by_accepted_user", field: "acceptedUserId" },
  operators: { index: "by_user", field: "userId" },
  suspensions: { index: "by_user", field: "userId" },
  adminLog: { kept: "operator audit log" },
};

// The workspace's tables in the order they're deleted: jobs first, so no work carries on writing.
export const ORDER = ["jobs", ...Object.keys(WORKSPACE_TABLES).filter((t) => t !== "jobs").sort()];
const SHAPES = Object.fromEntries(ORDER.map((t) => [t, shapeOf(schema.tables[t as keyof typeof schema.tables].validator)]));

// Rows deleted per run of a page.
const PAGE = 100;
// The person's screens get this long to sign out before the account goes.
const GRACE_MS = 10_000;
// If the revoking action never reports back, the deletion carries on anyway after this.
const REVOKE_WAIT_MS = 2 * 60_000;
// How long a finished deletion's row stays, so a screen still open learns it's done.
const KEEP_MS = 60 * 60_000;

type Deletion = Doc<"accountDeletions">;

const deletionOf = (ctx: QueryCtx, userId: Id<"users">) => ctx.db.query("accountDeletions").withIndex("by_user", (q) => q.eq("userId", userId)).unique();

// The name a person types to confirm: their username on a self-hosted copy, else the email they sign in with.
export const accountName = (user: Doc<"users">) => user.username ?? user.email ?? user.name ?? "delete my account";

// An index range on one field of a table named at run time. Convex types each table's index builder separately, which
// a table name taken from the schema can't select, so it's handed over untyped.
type FieldRange = { eq: (field: string, value: unknown) => FieldRange };
const fieldIs = (field: string, value: unknown) => ((q: FieldRange) => q.eq(field, value)) as never;

// Why this person can't delete their own account, or null: a self-hosted copy's owner, while others can sign in.
async function blockedFor(ctx: QueryCtx, user: Doc<"users">) {
  if (!selfHosted() || !user.owner) return null;
  const others =
    (await ctx.db.query("memberships").collect()).some((m) => m.userId !== user._id) ||
    (await ctx.db.query("authAccounts").collect()).some((a) => a.provider === "password" && a.userId !== user._id);
  return others ? "You’re this copy’s owner, so remove the other people in Account first." : null;
}

// Sign-in accounts go: no one can sign in as the person again. Their sessions are ended separately.
async function forgetAccounts(ctx: MutationCtx, userId: Id<"users">) {
  for (const account of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect()) {
    for (const limit of await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", account._id)).collect()) await ctx.db.delete(limit._id);
    for (const code of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", account._id)).collect()) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }
}

// Starts deleting a person's account, or picks a stalled deletion up again. The workspace goes with it when only they
// use it.
async function begin(ctx: MutationCtx, userId: Id<"users">, by: Deletion["by"]) {
  const existing = await deletionOf(ctx, userId);
  if (existing) {
    if (existing.step !== "done" && Date.now() - existing.beat > REVOKE_WAIT_MS) await ctx.scheduler.runAfter(0, internal.accountDelete.resume, { id: existing._id });
    return;
  }
  const member = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).first();
  const sharers = member ? await ctx.db.query("memberships").withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId)).take(2) : [];
  const workspace = member && sharers.length === 1 ? member.workspaceId : undefined;
  if (workspace && (await ctx.db.get(workspace))?.demo) throw new ConvexError("The demo’s account can’t be deleted.");
  const id = await ctx.db.insert("accountDeletions", { userId, workspace, by, step: workspace ? "revoking" : "signingOut", table: 0, deleted: 0, beat: Date.now() });
  if (workspace) {
    await ctx.scheduler.runAfter(0, internal.accountDelete.revoke, { id });
    await ctx.scheduler.runAfter(REVOKE_WAIT_MS, internal.accountDelete.revoked, { id });
  } else await ctx.scheduler.runAfter(by === "self" ? GRACE_MS : 0, internal.accountDelete.finish, { id });
}

// ─── What Settings, Your data shows and starts ──────────────────────────────────────────────────────────────────────

// The signed-in person's account: the name to type, why they can't delete it (or null), and the deletion under way.
// It answers from the session alone, so a screen still open once the person is gone learns the deletion is done.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const row = await deletionOf(ctx, userId);
    return {
      name: user ? accountName(user) : null,
      blocked: user ? await blockedFor(ctx, user) : null,
      deletion: row && { step: row.step, deleted: row.deleted, tables: ORDER.length, table: Math.min(row.table, ORDER.length), beat: row.beat },
    };
  },
});

// Delete my account: their own, once they've typed its name. Running it again picks a stalled deletion up.
export const start = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, { confirm }) => {
    const userId = await getAuthUserId(ctx);
    const user = userId && (await ctx.db.get(userId));
    if (!user) throw new ConvexError("Sign in to continue.");
    const name = accountName(user);
    if (confirm.trim().toLowerCase() !== name.trim().toLowerCase()) throw new ConvexError(`Type ${name} to confirm.`);
    const blocked = await blockedFor(ctx, user);
    if (blocked) throw new ConvexError(blocked);
    await begin(ctx, user._id, "self");
  },
});

// A self-hosted copy's owner removing someone (account.removePerson, which has checked who's asking and ended their
// sessions): they can't sign in again from now, and the rest follows in the background.
export const remove = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await forgetAccounts(ctx, userId);
    await begin(ctx, userId, "owner");
  },
});

// ─── The background steps ───────────────────────────────────────────────────────────────────────────────────────────

export const resume = internalMutation({
  args: { id: v.id("accountDeletions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || row.step === "done") return;
    await ctx.db.patch(id, { beat: Date.now() });
    if (row.step === "revoking") await ctx.scheduler.runAfter(0, internal.accountDelete.revoke, { id });
    if (row.step === "revoking") await ctx.scheduler.runAfter(REVOKE_WAIT_MS, internal.accountDelete.revoked, { id });
    if (row.step === "deleting") await ctx.scheduler.runAfter(0, internal.accountDelete.purge, { id });
    if (row.step === "signingOut") await ctx.scheduler.runAfter(0, internal.accountDelete.finish, { id });
  },
});

// The connections to revoke: the Drive connection's sealed refresh token, and the GitHub installations no other
// workspace uses.
export const connections = internalQuery({
  args: { id: v.id("accountDeletions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.step !== "revoking" || !row.workspace) return null;
    const workspaceId = row.workspace;
    const drive = await ctx.db.query("driveConnections").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first();
    const github: number[] = [];
    for (const install of await ctx.db.query("githubInstalls").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
      const users = await ctx.db.query("githubInstalls").withIndex("by_installation", (q) => q.eq("installationId", install.installationId)).collect();
      if (users.every((u) => u.workspaceId === workspaceId)) github.push(install.installationId);
    }
    return { drive: drive?.sealedRefresh ?? null, github };
  },
});

export const revoke = internalAction({
  args: { id: v.id("accountDeletions") },
  handler: async (ctx, { id }) => {
    const found = await ctx.runQuery(internal.accountDelete.connections, { id });
    if (!found) return;
    if (found.drive) await revokeDrive(found.drive).catch(() => null);
    const app = found.github.length ? await appFor(ctx).catch(() => null) : null;
    if (app) {
      for (const installationId of found.github) {
        await appJwt(app)
          .then((token) => githubFetch(`/app/installations/${installationId}`, { method: "DELETE", token }))
          .catch(() => null);
      }
    }
    await ctx.runMutation(internal.accountDelete.revoked, { id });
  },
});

// Revoking is done (or took too long): on to the rows.
export const revoked = internalMutation({
  args: { id: v.id("accountDeletions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.step !== "revoking") return;
    await ctx.db.patch(id, { step: "deleting", beat: Date.now() });
    await ctx.scheduler.runAfter(0, internal.accountDelete.purge, { id });
  },
});

// The rows of one table that belong to a workspace, a page at a time (by its workspace index, or read whole and
// filtered where it has none).
async function pageOf(ctx: QueryCtx, table: string, workspaceId: Id<"workspaces">, cursor: string | undefined) {
  const index = WORKSPACE_TABLES[table].index;
  const t = table as TableNames;
  if (index) {
    const page = await ctx.db.query(t).withIndex(index as never, fieldIs("workspaceId", workspaceId)).take(PAGE);
    return { rows: page, done: page.length < PAGE, cursor: undefined };
  }
  const page = await ctx.db.query(t).paginate({ cursor: cursor ?? null, numItems: PAGE });
  return { rows: page.page.filter((d) => "workspaceId" in d && d.workspaceId === workspaceId), done: page.isDone, cursor: page.continueCursor };
}

// Deletes a page of the table it's at, with the stored files its rows name, then schedules the next.
export const purge = internalMutation({
  args: { id: v.id("accountDeletions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.step !== "deleting" || !row.workspace) return;
    const workspaceId = row.workspace;
    if (row.table >= ORDER.length) {
      // Once through: anything written meanwhile sends it round again from that table.
      for (const [i, table] of ORDER.entries()) {
        if (!WORKSPACE_TABLES[table].index) continue;
        if ((await pageOf(ctx, table, workspaceId, undefined)).rows.length) {
          await ctx.db.patch(id, { table: i, cursor: undefined, beat: Date.now() });
          await ctx.scheduler.runAfter(0, internal.accountDelete.purge, { id });
          return;
        }
      }
      await ctx.db.patch(id, { step: "signingOut", beat: Date.now() });
      await ctx.scheduler.runAfter(row.by === "self" ? GRACE_MS : 0, internal.accountDelete.finish, { id });
      return;
    }
    const table = ORDER[row.table];
    const page = await pageOf(ctx, table, workspaceId, row.cursor);
    for (const doc of page.rows) {
      for (const file of linksIn(SHAPES[table], doc, "_storage")) {
        if (await ctx.db.system.get(file as Id<"_storage">)) await ctx.storage.delete(file as Id<"_storage">);
      }
      await ctx.db.delete(doc._id);
    }
    await ctx.db.patch(id, { deleted: row.deleted + page.rows.length, beat: Date.now(), ...(page.done ? { table: row.table + 1, cursor: undefined } : { cursor: page.cursor }) });
    await ctx.scheduler.runAfter(0, internal.accountDelete.purge, { id });
  },
});

// The last step: the workspace row, the person's membership, sign-in accounts and sessions, rows naming them, a waitlist
// entry and an invite for their email (so they can be invited again), and the person.
export const finish = internalMutation({
  args: { id: v.id("accountDeletions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.step !== "signingOut") return;
    const { userId } = row;
    for (const member of await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) await ctx.db.delete(member._id);
    if (row.workspace && (await ctx.db.get(row.workspace))) await ctx.db.delete(row.workspace);
    await forgetAccounts(ctx, userId);
    for (const session of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect()) {
      for (const token of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).collect()) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    for (const [table, how] of Object.entries(PERSON_TABLES)) {
      if (!("index" in how)) continue;
      const rows = await ctx.db
        .query(table as TableNames)
        .withIndex(how.index as never, fieldIs(how.field, userId))
        .collect();
      for (const doc of rows) await ctx.db.delete(doc._id);
    }
    const user = await ctx.db.get(userId);
    const email = user?.email?.trim().toLowerCase();
    if (email) {
      for (const entry of await ctx.db.query("waitlist").withIndex("by_email", (q) => q.eq("email", email)).collect()) await ctx.db.delete(entry._id);
      for (const invite of await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).collect()) await ctx.db.delete(invite._id);
    }
    if (user) await ctx.db.delete(userId);
    await ctx.db.patch(id, { step: "done", beat: Date.now() });
    await ctx.scheduler.runAfter(KEEP_MS, internal.accountDelete.forget, { id });
  },
});

export const forget = internalMutation({
  args: { id: v.id("accountDeletions") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
