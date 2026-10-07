import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";
import { mutation } from "./functions";
import { type ItemOf, projectKeyOf } from "./itemShapes";
import { sourceCheck } from "./recordContext";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Their narratives (career and notes) and projects are the sources of the record, and the Record page acts on each one
// in one place. Rejecting a source sets aside what it proposed that wasn't reviewed yet (status "setAside": not a
// rejection, so no later read learns from it), and what they approved from it stops counting everywhere while none of
// its sources still stands (recordContext.sourceCheck). Restoring brings back the source and only what was set aside
// with it; what they rejected one by one stays rejected. Read again reads the source against the record as it is now:
// nothing already there is proposed again, and what they rejected isn't either, unless they include it for that run.

const source = v.union(v.object({ narrativeId: v.id("narratives") }), v.object({ projectId: v.id("items") }));

const itemsIn = (ctx: MutationCtx, workspaceId: Doc<"narratives">["workspaceId"]) =>
  ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId)).collect();
const cites = (i: Doc<"items">, narrativeId: Doc<"narratives">["_id"]) => i.sources.some((s) => s.narrativeId === narrativeId);

// An insight rests on the facts it cites, not on a narrative or project of its own. When a source is rejected, a
// proposed insight citing one of its facts is set aside too once none of its cited facts still counts (another live
// fact keeps it); restoring the source brings back the insights set aside that cite one of its facts.
const citesFrom = (insight: Doc<"items">, items: Doc<"items">[], fromSource: (fact: Doc<"items">) => boolean) =>
  insight.kind === "insight" && items.some((f) => f.kind === "fact" && insight.data.factIds.includes(String(f._id)) && fromSource(f));
async function setAsideInsights(ctx: MutationCtx, items: Doc<"items">[], fromSource: (fact: Doc<"items">) => boolean, stands: (i: Doc<"items">) => boolean) {
  for (const i of items) if (i.status === "proposed" && citesFrom(i, items, fromSource) && !stands(i)) await ctx.db.patch(i._id, { status: "setAside" });
}
async function restoreInsights(ctx: MutationCtx, items: Doc<"items">[], fromSource: (fact: Doc<"items">) => boolean) {
  for (const i of items) if (i.status === "setAside" && citesFrom(i, items, fromSource)) await ctx.db.patch(i._id, { status: "proposed" });
}

// `reason`: why, when they said.
export async function rejectNarrative(ctx: MutationCtx, n: Doc<"narratives">, reason?: string) {
  await ctx.db.patch(n._id, { rejectedAt: Date.now(), rejectedBecause: reason?.trim() || undefined });
  const stands = await sourceCheck(ctx, n.workspaceId);
  const items = await itemsIn(ctx, n.workspaceId);
  for (const i of items) if (i.kind !== "insight" && i.status === "proposed" && cites(i, n._id) && !stands(i)) await ctx.db.patch(i._id, { status: "setAside" });
  await setAsideInsights(ctx, items, (f) => cites(f, n._id), stands);
}

async function restoreNarrative(ctx: MutationCtx, n: Doc<"narratives">) {
  await ctx.db.patch(n._id, { rejectedAt: undefined, rejectedBecause: undefined });
  const items = await itemsIn(ctx, n.workspaceId);
  for (const i of items) if (i.kind !== "insight" && i.status === "setAside" && cites(i, n._id)) await ctx.db.patch(i._id, { status: "proposed" });
  await restoreInsights(ctx, items, (f) => cites(f, n._id));
}

// Also how extract.review rejects or reopens a project, so every way of doing it does the same. `reason`: why, when
// they said (Review's Why?).
export async function rejectProject(ctx: MutationCtx, p: ItemOf<"project">, reason?: string) {
  await ctx.db.patch(p._id, { status: "rejected", data: { ...p.data, rejectedBecause: reason ?? null } });
  const stands = await sourceCheck(ctx, p.workspaceId);
  const items = await itemsIn(ctx, p.workspaceId);
  for (const i of items) if (i.kind !== "insight" && i.status === "proposed" && i.projectKey === p.projectKey && !stands(i)) await ctx.db.patch(i._id, { status: "setAside" });
  await setAsideInsights(ctx, items, (f) => f.projectKey === p.projectKey, stands);
}

export async function restoreProject(ctx: MutationCtx, p: ItemOf<"project">) {
  await ctx.db.patch(p._id, { status: "proposed", data: { ...p.data, rejectedBecause: null } });
  const items = await itemsIn(ctx, p.workspaceId);
  for (const i of items) if (i.kind !== "insight" && i.status === "setAside" && i.projectKey === p.projectKey) await ctx.db.patch(i._id, { status: "proposed" });
  await restoreInsights(ctx, items, (f) => f.projectKey === p.projectKey);
}

// The narrative or project a request names, in their workspace.
async function sourceOf(ctx: MutationCtx, arg: { narrativeId: Doc<"narratives">["_id"] } | { projectId: Doc<"items">["_id"] }) {
  const { workspaceId } = await requireWorkspace(ctx);
  if ("narrativeId" in arg) {
    const n = await getInWorkspace(ctx, workspaceId, arg.narrativeId);
    if (!n || n.kind === "goals") throw new Error("Not found.");
    return { workspaceId, narrative: n };
  }
  const p = await getInWorkspace(ctx, workspaceId, arg.projectId);
  if (!p || p.kind !== "project") throw new Error("Not found.");
  return { workspaceId, project: p };
}

// `reason`: why they rejected it, when they said; saved with the decision.
export const reject = mutation({
  args: { source, reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await sourceOf(ctx, args.source);
    if (s.narrative && s.narrative.rejectedAt === undefined) await rejectNarrative(ctx, s.narrative, args.reason);
    if (s.project && s.project.status !== "rejected") await rejectProject(ctx, s.project, args.reason?.trim() || undefined);
  },
});

export const restore = mutation({
  args: { source },
  handler: async (ctx, args) => {
    const s = await sourceOf(ctx, args.source);
    if (s.narrative && s.narrative.rejectedAt !== undefined) await restoreNarrative(ctx, s.narrative);
    if (s.project?.status === "rejected") await restoreProject(ctx, s.project);
  },
});

// Read a source again. `includingRejected`: look past this source's own earlier rejections for this run only.
// `lookFor`: for a narrative, what they think was missed.
export const readAgain = mutation({
  args: { source, includingRejected: v.boolean(), lookFor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await sourceOf(ctx, args.source);
    const ignoreRejected = args.includingRejected || undefined;
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", s.workspaceId)).order("desc").take(300);
    const busy = (j: Doc<"jobs">) => j.status === "queued" || j.status === "running";
    if (s.narrative) {
      const n = s.narrative;
      if (n.rejectedAt !== undefined) throw new ConvexError("Restore it before reading it again.");
      if (!n.body.trim()) throw new ConvexError("This narrative is empty.");
      if (jobs.some((j) => j.kind === "extract" && j.args.narrativeId === n._id && busy(j))) throw new ConvexError("It’s being read now.");
      const jobId = await ctx.db.insert("jobs", {
        workspaceId: s.workspaceId,
        kind: "extract",
        args: { narrativeId: n._id, version: n.version, again: true, lookFor: args.lookFor?.trim() || undefined, ignoreRejected },
        status: "queued",
        origin: "you",
      });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
      return jobId;
    }
    const p = s.project!;
    if (p.status === "rejected") throw new ConvexError("Restore it before reading it again.");
    const install = await ctx.db.query("githubInstalls").withIndex("by_workspace", (q) => q.eq("workspaceId", s.workspaceId)).first();
    if (!install) throw new ConvexError("Connect GitHub in Projects first.");
    if (jobs.some((j) => j.kind === "project" && String(j.args.repo).toLowerCase() === p.data.repo.toLowerCase() && busy(j))) throw new ConvexError("It’s being read now.");
    const jobId = await ctx.db.insert("jobs", { workspaceId: s.workspaceId, kind: "project", args: { repo: p.data.repo, ignoreRejected }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

type Run = { status: Doc<"jobs">["status"]; error: string | null };

// Their narratives as sources, newest first (the goals narrative is reviewed in Goals): whether they rejected it, how
// many of its roles and facts are approved or waiting for review, how much is set aside with it, and its latest read.
// For each project, how much is set aside with it and its latest read.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const narratives = (await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect()).filter((n) => n.kind !== "goals");
    const items = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId)).collect();
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(300);
    const latest = new Map<string, Run>();
    for (const j of jobs) {
      const key = j.kind === "extract" ? String(j.args.narrativeId) : j.kind === "project" ? projectKeyOf(String(j.args.repo)) : null;
      if (key && !latest.has(key)) latest.set(key, { status: j.status, error: j.error ?? null });
    }
    // What rests on each source: an item's narratives and project; an insight's, those of the facts it cites.
    const facts = new Map(items.filter((f) => f.kind === "fact").map((f) => [String(f._id), f]));
    const keysOf = (i: Doc<"items">) => [...i.sources.map((s) => String(s.narrativeId)), ...(i.projectKey ? [i.projectKey] : [])];
    const setAside = new Map<string, number>();
    for (const i of items) {
      if (i.status !== "setAside") continue;
      const keys = i.kind === "insight" ? i.data.factIds.flatMap((id) => (facts.has(id) ? keysOf(facts.get(id)!) : [])) : keysOf(i);
      for (const key of new Set(keys)) setAside.set(key, (setAside.get(key) ?? 0) + 1);
    }
    return {
      narratives: narratives.map((n) => {
        const mine = items.filter((i) => (i.kind === "role" || i.kind === "fact") && cites(i, n._id));
        return {
          id: n._id,
          title: n.title,
          kind: n.kind,
          version: n.version,
          rejected: n.rejectedAt !== undefined,
          rejectedBecause: n.rejectedBecause ?? null,
          approved: mine.filter((i) => i.status === "approved").length,
          proposed: mine.filter((i) => i.status === "proposed").length,
          setAside: setAside.get(String(n._id)) ?? 0,
          run: latest.get(String(n._id)) ?? null,
        };
      }),
      projects: Object.fromEntries(
        items.flatMap((p) => (p.kind === "project" && p.projectKey ? [[p.projectKey, { setAside: setAside.get(p.projectKey) ?? 0, run: latest.get(p.projectKey) ?? null }] as const] : [])),
      ),
    };
  },
});
