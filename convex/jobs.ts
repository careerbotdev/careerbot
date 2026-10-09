import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { mutation } from "./functions";
import { aiHeld, BUDGET_REACHED, type BudgetReached, isHeldReason } from "./budgets";
import { runExtract, runRework } from "./extract";
import { chat, spendingFor } from "./metering";
import { dayOf, tally } from "./tallies";
import { modelFor } from "./aiSettings";
import { runCompare } from "./compare";
import { runGoals, runLimitRule } from "./goals";
import { runCheck } from "./conflicts";
import { runInsights } from "./insights";
import { runFollowups } from "./followups";
import { runResume } from "./resume";
import { runDirections } from "./directions";
import { runDiscover } from "./discovery";
import { runEnrich } from "./enrich";
import { runRoles } from "./roles";
import { runDuplicates } from "./duplicates";
import { runProject } from "./projects";
import { runSkills } from "./skills";
import { runSameWork } from "./sameWork";
import { runLetter } from "./letters";
import { runAsk } from "./ask";
import { runOutreach } from "./people";
import { runFollowUp } from "./followUpEmails";
import { runDriveSync } from "./drive";
import { runLineCheck } from "./lineCheck";
import { runLineUpdate } from "./factChanges";
import { UnreadableReply } from "./replyJson";
import { requireWorkspace } from "./workspaces";

// What each kind of job does. Add a kind here and to the schema's `kind` union.
const handlers: Record<Doc<"jobs">["kind"], (ctx: ActionCtx, job: Doc<"jobs">) => Promise<unknown>> = {
  // The test call, with how long the answer took (ms).
  firstCall: async (ctx, job) => {
    const { model, reasoning } = await modelFor(ctx, job.workspaceId, "firstCall");
    const started = Date.now();
    const reply = await chat(ctx, { workspaceId: job.workspaceId, purpose: "first call", model, reasoning, messages: [{ role: "user", content: job.args.prompt }] });
    return { ...reply, ms: Date.now() - started };
  },
  extract: runExtract,
  rework: runRework,
  compare: runCompare,
  goals: runGoals,
  check: runCheck,
  limitRule: runLimitRule,
  insights: runInsights,
  followups: runFollowups,
  resume: runResume,
  directions: runDirections,
  discover: runDiscover,
  enrich: runEnrich,
  roles: runRoles,
  duplicates: runDuplicates,
  project: runProject,
  skills: runSkills,
  sameWork: runSameWork,
  letter: runLetter,
  ask: runAsk,
  outreach: runOutreach,
  followUp: runFollowUp,
  lineCheck: runLineCheck,
  lineUpdate: runLineUpdate,
  // Google Drive: no AI, no cost.
  driveSync: runDriveSync,
};

export const start = mutation({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobId = await ctx.db.insert("jobs", {
      workspaceId,
      kind: "firstCall",
      args: { prompt },
      status: "queued",
      origin: "you",
    });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const job = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").first();
    return job && { status: job.status, result: job.result, error: job.error, pausedFor: job.pausedFor };
  },
});

// The newest test call (Settings, AI, Try it), among the workspace's last 100 jobs.
export const latestTestCall = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const recent = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const job = recent.find((j) => j.kind === "firstCall");
    return job ? { status: job.status, result: job.result, error: job.error, pausedFor: job.pausedFor } : null;
  },
});

export const get = internalQuery({ args: { jobId: v.id("jobs") }, handler: (ctx, { jobId }) => ctx.db.get(jobId) });

export const setState = internalMutation({
  args: {
    jobId: v.id("jobs"),
    status: v.union(v.literal("running"), v.literal("paused"), v.literal("done"), v.literal("failed")),
    pausedFor: v.optional(v.union(v.literal("openrouter"), v.literal("apollo"))),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, ...patch }) => {
    const job = await ctx.db.get(jobId);
    // Waiting on calls that have all settled since it was refused: it starts again instead (budgets.aiHeld).
    if (job && patch.status === "paused" && isHeldReason(patch.error) && !(await aiHeld(ctx, job.workspaceId))) {
      await ctx.db.patch(jobId, { status: "queued" });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
      return;
    }
    // Its end is counted once (jobDone or jobFailed, by kind).
    const ends = !!job && !job.tallied && (patch.status === "done" || patch.status === "failed");
    await ctx.db.patch(jobId, { pausedFor: undefined, error: undefined, ...patch, ...(ends ? { tallied: true } : {}) });
    if (ends && job) await tally(ctx, job.workspaceId, patch.status === "done" ? "jobDone" : "jobFailed", dayOf(Date.now()), 1, job.kind);
  },
});

// The pursuit a job's role was started as, for a job that names a role but not its pursuit (a tailored resume).
export const pursuitOf = internalQuery({
  args: { workspaceId: v.id("workspaces"), postingId: v.id("postings") },
  handler: async (ctx, { workspaceId, postingId }) =>
    (await ctx.db.query("pursuits").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", postingId)).first())?._id ?? null,
});

export const run = internalAction({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.jobs.get, { jobId });
    if (!job || job.status === "done" || job.status === "running") return;
    await ctx.runMutation(internal.jobs.markStarted, { jobId });
    try {
      // Every paid call the job makes is spent on it, for whoever started it, and for its pursuit when it has one.
      const pursuitId: Id<"pursuits"> | undefined =
        job.args?.pursuitId ?? (job.args?.postingId ? await ctx.runQuery(internal.jobs.pursuitOf, { workspaceId: job.workspaceId, postingId: job.args.postingId }) : null) ?? undefined;
      const result = await handlers[job.kind](spendingFor(ctx, { jobId, origin: job.origin, pursuitId }), job);
      await ctx.runMutation(internal.jobs.setState, { jobId, status: "done", result });
    } catch (e) {
      if (e instanceof ConvexError && (e.data as BudgetReached)?.code === BUDGET_REACHED) {
        const reached = e.data as BudgetReached;
        await ctx.runMutation(internal.jobs.setState, { jobId, status: "paused", pausedFor: reached.service, error: reached.message });
      } else {
        // An unreadable reply was still paid for; keep its start so it can be looked at.
        const raw = e instanceof UnreadableReply ? e.raw.slice(0, 8000) : undefined;
        await ctx.runMutation(internal.jobs.setState, { jobId, status: "failed", error: e instanceof Error ? e.message : String(e), ...(raw ? { result: { raw } } : {}) });
      }
    }
  },
});

export const markStarted = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    await ctx.db.patch(jobId, { status: "running", pausedFor: undefined, error: undefined, startedAt: Date.now(), attempts: (job?.attempts ?? 0) + 1 });
  },
});

// A run can be cut off (a deploy, a crash) and leave its job "running" forever. Convex actions stop after 10 minutes,
// so anything running for 15 is dead: start it again quietly, up to three tries, then fail it with a plain message.
// Only the jobs table changes here; a reserved AI cost from the lost run is settled by metering's daily check (reconcile).
export const STALE_MS = 15 * 60 * 1000;
export const recoverStuck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const job of await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "running")).collect()) {
      if (now - (job.startedAt ?? job._creationTime) < STALE_MS) continue;
      if ((job.attempts ?? 1) >= 3) {
        await ctx.db.patch(job._id, { status: "failed", error: "This kept getting interrupted. Try again.", tallied: true });
        if (!job.tallied) await tally(ctx, job.workspaceId, "jobFailed", dayOf(now), 1, job.kind);
        continue;
      }
      await ctx.db.patch(job._id, { status: "queued" });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: job._id });
    }
  },
});

export const checkpoint = internalMutation({
  args: { jobId: v.id("jobs"), step: v.string(), result: v.any() },
  handler: async (ctx, { jobId, step, result }) => {
    const job = await ctx.db.get(jobId);
    if (!job || (job.done ?? []).some((d) => d.step === step)) return;
    await ctx.db.patch(jobId, { done: [...(job.done ?? []), { step, result }] });
  },
});

// Called when a budget is raised, and on the 1st of each month for every workspace.
export const resumePaused = internalMutation({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { workspaceId }) => {
    const paused = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "paused")).collect();
    for (const job of paused) {
      if (workspaceId && job.workspaceId !== workspaceId) continue;
      await ctx.db.patch(job._id, { status: "queued" });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: job._id });
    }
  },
});
