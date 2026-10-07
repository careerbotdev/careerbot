import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { DEMO_BUSY, NO_DEMO, type DemoSignInRefusal } from "./demoRefusal";

// The demo: one workspace marked demo (seeded whole by demoSeed.ts), whose one member is a shared, made-up person that
// every visitor is signed in as (auth.ts, provider "demo"). Nothing in it can be changed (functions.ts). This file is
// what the demo needs beyond that: who's in the demo, the sign-in's limit, and clearing old visitors' sessions.

// Whether the signed-in person's workspace is the demo. Signed out, or without a workspace yet: no.
export async function callerInDemo(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const workspace = membership && (await ctx.db.get(membership.workspaceId));
  return workspace?.demo === true;
}

// For actions, which can't read the database themselves (functions.ts).
export const callerIsDemo = internalQuery({ args: {}, handler: (ctx) => callerInDemo(ctx) });

// The demo's shared person: the member of the workspace marked demo, or null on a deployment with no demo.
async function demoUser(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_demo", (q) => q.eq("demo", true))
    .first();
  if (!workspace) return null;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .first();
  return membership?.userId ?? null;
}

// Demo sign-ins across the whole deployment are capped, so a script can't pile up sessions: at most this many a minute.
export const SIGN_INS_PER_MINUTE = 60;

// Who the demo sign-in signs a visitor in as, or why it can't: no demo here, or the minute's sign-ins are used up (the
// 60th newest session is under a minute old). Each sign-in makes one session, so the sessions are the count.
export const signInUser = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ userId: Id<"users"> } | DemoSignInRefusal> => {
    const userId = await demoUser(ctx);
    if (!userId) return { kind: "demoSignIn", reason: "none", message: NO_DEMO };
    const newest = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(SIGN_INS_PER_MINUTE);
    const oldest = newest[SIGN_INS_PER_MINUTE - 1];
    if (oldest && Date.now() - oldest._creationTime < 60_000) return { kind: "demoSignIn", reason: "busy", message: DEMO_BUSY };
    return { userId };
  },
});

// A demo visitor's session lasts a day on the server: after that it and its refresh tokens are deleted (hourly cron),
// so the shared person doesn't collect sessions forever. Visitors just open the demo again.
const SESSION_MS = 24 * 60 * 60 * 1000;
// Sessions deleted per run; a full batch runs again at once until the old ones are gone.
const BATCH = 100;

export const dropOldSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const userId = await demoUser(ctx);
    if (!userId) return;
    const cutoff = Date.now() - SESSION_MS;
    // Oldest first, so the batch is all old sessions until there are none left.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(BATCH);
    const old = sessions.filter((s) => s._creationTime < cutoff);
    for (const session of old) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    if (old.length === BATCH) await ctx.scheduler.runAfter(0, internal.demo.dropOldSessions, {});
  },
});
