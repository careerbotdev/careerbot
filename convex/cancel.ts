import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx } from "./_generated/server";

// A job cancelled from Activity (jobs.cancel) stops at its next step, and the step it was on is paid but not kept:
// budgets.reserve refuses every paid call for it, a call that comes back after it was cancelled throws away its answer
// (metering), loops check between steps here, and the mutations that save a step's result refuse it (refuseCancelled).
// Convex can't stop an action midway, so the step under way still runs to its end; only what it found is dropped. Steps
// finished before stay. The run's own end then leaves the job cancelled (jobs.setState).
export const CANCELLED = "CANCELLED";
export type Cancelled = { code: typeof CANCELLED };

export function cancelledError() {
  return new ConvexError<Cancelled>({ code: CANCELLED });
}

export function wasCancelled(e: unknown) {
  return e instanceof ConvexError && (e.data as Cancelled | undefined)?.code === CANCELLED;
}

// Stop here when the job was cancelled since it started.
export async function stopIfCancelled(ctx: ActionCtx, jobId: Id<"jobs"> | undefined) {
  if (jobId && (await ctx.runQuery(internal.jobs.get, { jobId }))?.status === "cancelled") throw cancelledError();
}

// In a mutation that saves a step's result: nothing is saved for a cancelled job.
export async function refuseCancelled(ctx: QueryCtx, jobId: Id<"jobs"> | null | undefined) {
  if (jobId && (await ctx.db.get(jobId))?.status === "cancelled") throw cancelledError();
}
