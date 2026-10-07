import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// A change Google Drive may need to follow (a resume version kept, restored or written, a letter, answers, a pursuit's
// status): with Drive connected, CareerBot looks for what changed a little later (drive.check) and syncs only when
// something did. Several changes in a row lead to one look. Its own module so resumes and pursuits can call it without
// importing drive.ts, which reads them.
export const SOON_MS = 10_000;

export async function syncSoon(ctx: MutationCtx, workspaceId: Id<"workspaces">, delayMs = SOON_MS) {
  const conn = await ctx.db.query("driveConnections").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  if (!conn || conn.broken) return;
  const at = Date.now() + delayMs;
  if (conn.checkAt !== undefined && conn.checkAt > Date.now() && conn.checkAt <= at) return;
  await ctx.db.patch(conn._id, { checkAt: at });
  await ctx.scheduler.runAfter(delayMs, internal.drive.check, { workspaceId });
}
