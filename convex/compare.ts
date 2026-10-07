import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { type ModelChoice, type Reasoning, reasoningLevel } from "./aiTasks";
import { BUDGET_REACHED } from "./budgets";
import { draftExtract } from "./extract";
import { draftInsights } from "./insights";
import type { ChatReply } from "./metering";
import { counted } from "./recordContext";
import { UnreadableReply } from "./replyJson";
import { draftBaseResume } from "./resume";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Run the same task with up to four models side by side: reading one story (extract), writing the base resume
// (resume), or finding insights across the approved record (insights). Each run is metered and budgeted like any other
// AI call; its output is kept on the comparison for judging and never enters the record or resumes.

const compareTask = v.union(v.literal("extract"), v.literal("resume"), v.literal("insights"));
type CompareTask = "extract" | "resume" | "insights";
const MAX_CONTENDERS = 4;

// What a task needs before it's worth paying for: a career story to read, approved facts to write from, or at least two
// to connect.
async function subjectOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, task: CompareTask, narrativeId?: Id<"narratives">) {
  if (task === "extract") {
    const n = narrativeId ? await getInWorkspace(ctx, workspaceId, narrativeId) : null;
    if (!n || n.kind === "goals") throw new ConvexError("Choose a story to read.");
    return { narrativeId: n._id, narrativeTitle: n.title, narrativeVersion: n.version };
  }
  const facts = (await counted(ctx, workspaceId, "fact")).length;
  if (task === "resume" && facts < 1) throw new ConvexError("Approve some facts first; the resume is written only from your approved record.");
  if (task === "insights" && facts < 2) throw new ConvexError("Approve at least two facts first; insights connect facts across your record.");
  return {};
}

export const start = mutation({
  args: { task: compareTask, narrativeId: v.optional(v.id("narratives")), contenders: v.array(v.object({ model: v.string(), reasoning: v.optional(reasoningLevel) })) },
  handler: async (ctx, { task, narrativeId, contenders }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const picked = contenders.filter((c) => c.model.trim());
    if (picked.length === 0) throw new ConvexError("Choose at least one model.");
    if (picked.length > MAX_CONTENDERS) throw new ConvexError(`Compare up to ${MAX_CONTENDERS} models at a time.`);
    const subject = await subjectOf(ctx, workspaceId, task, narrativeId);
    const comparisonId = await ctx.db.insert("comparisons", {
      workspaceId,
      task,
      ...subject,
      contenders: picked.map((c) => ({ model: c.model.trim(), reasoning: c.reasoning, status: "running" as const })),
      at: Date.now(),
    });
    for (let index = 0; index < picked.length; index++) {
      const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "compare", args: { comparisonId, index }, status: "queued", origin: "you" });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    }
    return comparisonId;
  },
});

export const saveResult = internalMutation({
  args: { comparisonId: v.id("comparisons"), index: v.number(), result: v.any() },
  handler: async (ctx, { comparisonId, index, result }) => {
    const c = await ctx.db.get(comparisonId);
    if (!c) return;
    const contenders = c.contenders.map((x, i) => (i === index ? { ...x, ...result } : x));
    await ctx.db.patch(comparisonId, { contenders });
  },
});

// One model's run of the comparison's task: its output, and the reply it came from.
async function draft(ctx: ActionCtx, workspaceId: Id<"workspaces">, c: Doc<"comparisons">, choice: ModelChoice): Promise<{ output: unknown; reply: ChatReply }> {
  if (c.task === "resume") {
    const { doc, reply } = await draftBaseResume(ctx, workspaceId, choice, "compare");
    return { output: { doc }, reply };
  }
  if (c.task === "insights") {
    const { insights, reply } = await draftInsights(ctx, workspaceId, choice, "compare");
    return { output: { insights }, reply };
  }
  if (!c.narrativeId) throw new Error("This comparison has no story to read.");
  const { extracted, reply } = await draftExtract(ctx, { workspaceId, narrativeId: c.narrativeId, fresh: true, choice, purpose: "compare" });
  return { output: extracted, reply };
}

export async function runCompare(ctx: ActionCtx, job: Doc<"jobs">) {
  const { comparisonId, index } = job.args as { comparisonId: Id<"comparisons">; index: number };
  const c = await ctx.runQuery(internal.compare.get_, { comparisonId });
  const contender = c?.contenders[index];
  if (!c || !contender) return null;
  await ctx.runMutation(internal.compare.saveResult, { comparisonId, index, result: { status: "running", error: undefined } });
  const started = Date.now();
  try {
    const { output, reply } = await draft(ctx, job.workspaceId, c, { model: contender.model, reasoning: contender.reasoning as Reasoning | undefined });
    const result = {
      status: "done",
      output,
      costUsd: reply.costUsd,
      resolvedModel: reply.model,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
    };
    await ctx.runMutation(internal.compare.saveResult, { comparisonId, index, result });
    return { costUsd: reply.costUsd };
  } catch (e) {
    const paused = e instanceof ConvexError && (e.data as { code?: string })?.code === BUDGET_REACHED;
    const message = paused ? (e as ConvexError<{ message: string }>).data.message : e instanceof Error ? e.message : String(e);
    // Keep the start of an unreadable reply so it can be looked at; the call was still paid for.
    const raw = e instanceof UnreadableReply ? e.raw.slice(0, 4000) : undefined;
    await ctx.runMutation(internal.compare.saveResult, { comparisonId, index, result: { status: paused ? "paused" : "failed", error: message, ...(raw ? { output: { raw } } : {}) } });
    throw e;
  }
}

export const get_ = internalQuery({
  args: { comparisonId: v.id("comparisons") },
  handler: (ctx, { comparisonId }) => ctx.db.get(comparisonId),
});

// The last 20 comparisons, newest first: the task, the story read (for a read), when, and the models.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db.query("comparisons").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(20);
    return rows.map((c) => ({ id: c._id, task: c.task, narrativeTitle: c.narrativeTitle ?? null, at: c.at, models: c.contenders.map((x) => x.model), running: c.contenders.some((x) => x.status === "running") }));
  },
});

export const get = query({
  args: { id: v.id("comparisons") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await getInWorkspace(ctx, workspaceId, id);
    return c && { id: c._id, task: c.task, narrativeTitle: c.narrativeTitle ?? null, narrativeVersion: c.narrativeVersion ?? null, at: c.at, contenders: c.contenders };
  },
});

// Calls averaged for an estimate.
const LAST = 20;
// The usage purpose of each task's own runs.
const PURPOSE: Record<CompareTask, string> = { extract: "extract", resume: "resume", insights: "insights" };

// About how many tokens one model reads and writes for a task, for the estimate before comparing (priced per model on
// the screen): from the last comparison of the same task (for a read, of the same story as it is now), else the
// workspace's own recent runs of that task. Null before either.
export const estimate = query({
  args: { task: compareTask, narrativeId: v.optional(v.id("narratives")) },
  handler: async (ctx, { task, narrativeId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = task === "extract" && narrativeId ? await getInWorkspace(ctx, workspaceId, narrativeId) : null;
    const past = await ctx.db.query("comparisons").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(50);
    const same = past.find((c) => c.task === task && (task !== "extract" || (n && c.narrativeId === n._id && c.narrativeVersion === n.version)) && c.contenders.some(counts));
    const calls = same
      ? same.contenders.filter(counts)
      : (await ctx.db.query("usage").withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", workspaceId).eq("service", "openrouter")).order("desc").take(1000))
          .filter((u) => u.purpose === PURPOSE[task] && u.ok && counts(u))
          .slice(0, LAST);
    if (!calls.length) return null;
    const mean = (pick: (x: { inputTokens?: number; outputTokens?: number }) => number | undefined) => Math.round(calls.reduce((sum, x) => sum + (pick(x) ?? 0), 0) / calls.length);
    return { inputTokens: mean((x) => x.inputTokens), outputTokens: mean((x) => x.outputTokens) };
  },
});

const counts = (x: { inputTokens?: number; outputTokens?: number; status?: string }) => (x.status === undefined || x.status === "done") && typeof x.inputTokens === "number" && typeof x.outputTokens === "number";
