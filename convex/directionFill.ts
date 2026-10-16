import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { type ItemOf, itemsOf } from "./itemShapes";

// Filling in directions: one pass (a "directions" job in mode "detail") fills in the directions asked for, one call each
// (directions.runDirections). Asking while a pass is underway adds the directions to it, so directions approved one
// after another are filled in by one pass; a pass that has found nothing left to fill (closed) takes none, and a new one
// starts. Each direction remembers its pass (fillJob), which is how its state is told: being filled in, filled in
// (positioning and criteria to review), or a fill-in that failed (its pass ended without filling it).

export const recentJobs = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
// Waiting to start, running, or paused for the budget.
export const underway = (j: Doc<"jobs">) => j.status === "queued" || j.status === "running" || j.status === "paused";
const isFillPass = (j: Doc<"jobs">) => j.kind === "directions" && j.args.mode === "detail";
// The directions a pass is asked to fill, and those it has filled (or passed over) so far: its steps.
export const passIds = (j: Doc<"jobs">): Id<"items">[] => j.args.ids ?? [];
export const passDone = (j: Doc<"jobs">) => new Set((j.done ?? []).map((s) => s.step));

// A merge (goals.merge) or its Undo (goals.unmerge) still moving records, between the directions named (either one;
// none named: any): its two directions' names and whether it's the Undo, else null.
export async function mergeUnderway(ctx: QueryCtx, workspaceId: Id<"workspaces">, ids?: Id<"items">[]) {
  const job = (await recentJobs(ctx, workspaceId)).find((j) => (j.kind === "merge" || j.kind === "unmerge") && underway(j) && (!ids || ids.includes(j.args.id) || ids.includes(j.args.into)));
  return job ? { from: job.args.from as string, to: job.args.to as string, undoing: job.kind === "unmerge" } : null;
}

// Refuses what would clash with a merge or its Undo still moving records (merging, ranking, filling in or setting aside
// either direction), with why.
export async function refuseWhileMerging(ctx: QueryCtx, workspaceId: Id<"workspaces">, ids?: Id<"items">[]) {
  const m = await mergeUnderway(ctx, workspaceId, ids);
  if (m) throw new ConvexError(m.undoing ? `The merge of ${m.from} into ${m.to} is still being undone. Try again when it’s done.` : `${m.from} is still being merged into ${m.to}. Try again when it’s done.`);
}

// Ask for directions to be filled in, by them or on its own (origin). Returns the pass, or null with nothing to fill.
export async function fillIn(ctx: MutationCtx, workspaceId: Id<"workspaces">, ids: Id<"items">[], origin: "you" | "automatic") {
  if (!ids.length) return null;
  const pass = (await recentJobs(ctx, workspaceId)).find((j) => isFillPass(j) && underway(j) && !j.args.closed);
  // A direction this pass has filled already is filled again by a pass of its own.
  const joining = pass ? ids.filter((id) => !passDone(pass).has(id)) : [];
  if (pass && joining.length) await ctx.db.patch(pass._id, { args: { ...pass.args, ids: [...new Set([...passIds(pass), ...joining])] } });
  const rest = ids.filter((id) => !joining.includes(id));
  const fresh = rest.length ? await ctx.db.insert("jobs", { workspaceId, kind: "directions", args: { mode: "detail", ids: rest }, status: "queued", origin }) : null;
  if (fresh) await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: fresh });
  for (const id of ids) {
    const d = await ctx.db.get(id);
    const jobId = joining.includes(id) ? pass?._id : fresh;
    if (d?.kind === "direction" && jobId) await ctx.db.patch(id, { data: { ...d.data, fillJob: jobId } });
  }
  return fresh ?? pass?._id ?? null;
}

// A direction just approved (from review, an edit or a merge) with nothing filled in yet is filled in on its own: its
// positioning, titles and criteria, proposed for review. It's paid AI work started automatically, so it runs within the
// AI budget (paused, not failed, when that's reached) and shows in Activity.
export async function fillWhenApproved(ctx: MutationCtx, d: Doc<"items">) {
  if (d.kind !== "direction" || d.data.detail) return;
  await fillIn(ctx, d.workspaceId, [d._id], "automatic");
}

// Whether a direction's pass is underway and hasn't got to it yet.
export async function fillingNow(ctx: QueryCtx, jobs: Doc<"jobs">[], d: ItemOf<"direction">) {
  const f = d.data.fillJob;
  const job = f ? (jobs.find((j) => j._id === f) ?? (await ctx.db.get(f))) : null;
  return !!job && underway(job) && !passDone(job).has(d._id);
}

// How far the pass underway has got: directions done of those asked for. Null with none underway.
export function fillProgress(jobs: Doc<"jobs">[]) {
  const pass = jobs.find((j) => isFillPass(j) && underway(j));
  return pass ? { done: passDone(pass).size, total: passIds(pass).length } : null;
}

// Where each approved direction stands for search while its criteria aren't approved: being filled in, filled in with
// criteria to review, never filled in, or its fill-in failed (its pass ended without filling it). Beside them, how far
// the pass underway has got.
export async function searchReadiness(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const jobs = await recentJobs(ctx, workspaceId);
  const rows = [];
  for (const d of await itemsOf(ctx, workspaceId, "direction", "approved")) {
    if (d.data.criteriaStatus === "approved") continue;
    const state: "filling" | "review" | "fillIn" | "failed" = (await fillingNow(ctx, jobs, d)) ? "filling" : d.data.criteria ? "review" : d.data.fillJob ? "failed" : "fillIn";
    rows.push({ id: d._id, name: d.data.name, state });
  }
  return { filling: fillProgress(jobs), rows };
}
