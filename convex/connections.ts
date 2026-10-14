import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { keepConnection } from "./drive";
import { mutation } from "./functions";
import { keepInstall } from "./github";
import { newToken } from "./githubApp";
import schema from "./schema";
import { requireWorkspace } from "./workspaces";

// Connecting GitHub or Google Drive ends on GitHub's or Google's side, in a browser that may not be the one that
// started it: a link someone else started, finished by you, would put your GitHub or Drive into their workspace. So the
// connection that comes back is only held (hold), under a token sent back to the screen connecting began on, and kept
// when the signed-in app there finishes it (finish): only for the same person and workspace that started it, within a
// few minutes, once. Anything else drops it, and Drive's tokens are revoked.

const HELD_MS = 10 * 60 * 1000;
export const STARTED_ELSEWHERE = "This connection was started from another account. Start it again here.";
export const TOO_LATE = "This connection took too long to finish. Start it again here.";

export const hold = internalMutation({
  args: { workspaceId: v.id("workspaces"), userId: v.id("users"), connection: schema.tables.pendingConnections.validator.fields.connection },
  handler: async (ctx, held) => {
    const token = newToken();
    await ctx.db.insert("pendingConnections", { token, ...held, expiresAt: Date.now() + HELD_MS });
    await ctx.scheduler.runAfter(HELD_MS, internal.connections.expire, { token });
    return token;
  },
});

// A held connection that won't be kept: gone, and Drive's tokens with it.
async function drop(ctx: MutationCtx, row: Doc<"pendingConnections">) {
  await ctx.db.delete(row._id);
  if (row.connection.kind === "drive") await ctx.scheduler.runAfter(0, internal.drive.revoke, { sealedRefresh: row.connection.sealedRefresh });
}

// Back on the screen connecting began on: keep the connection. Null when kept; else why not, to show. Refusing returns
// instead of throwing, so the dropped connection stays dropped.
export const finish = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<string | null> => {
    const { workspaceId, userId } = await requireWorkspace(ctx);
    const row = token ? await ctx.db.query("pendingConnections").withIndex("by_token", (q) => q.eq("token", token)).unique() : null;
    if (!row) return TOO_LATE;
    if (row.workspaceId !== workspaceId || row.userId !== userId) {
      await drop(ctx, row);
      return STARTED_ELSEWHERE;
    }
    if (row.expiresAt <= Date.now()) {
      await drop(ctx, row);
      return TOO_LATE;
    }
    await ctx.db.delete(row._id);
    const c = row.connection;
    if (c.kind === "github") await keepInstall(ctx, workspaceId, { installationId: c.installationId, account: c.account, selection: c.selection, settingsUrl: c.settingsUrl });
    else await keepConnection(ctx, workspaceId, { account: c.account, sealedRefresh: c.sealedRefresh, sealedAccess: c.sealedAccess, accessExpiresAt: c.accessExpiresAt });
    return null;
  },
});

export const expire = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db.query("pendingConnections").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (row) await drop(ctx, row);
  },
});
