import type { FunctionReturnType } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import type { ModelChoice } from "./aiTasks";
import { type ChatReply, chatJson } from "./metering";
import { replyOf, string, strings } from "./replyJson";
import { approvedRecord, backgroundNarratives, counted, itemsOf, sourceCheck } from "./recordContext";
import type { ItemOf } from "./itemShapes";
import { INSIGHT_STYLE, PLAIN_LANGUAGE } from "./writingGuides";
import { requireWorkspace } from "./workspaces";

// Reads across the whole approved record like a career editor and proposes insights: things true of the person across
// roles and projects that they may never have put into words. Every insight cites the approved facts it rests on, a
// role's or a project's alike. Runs when they finish reviewing a narrative or a project and on request; queues only new
// ones; never brings back one they rejected.

const SYSTEM = `You are a great career editor reading someone's whole career record at once. Connect dots across roles, companies and their own projects, and propose insights: things that are true of them across their career that they may never have put into words, and that belong on a resume. For example, leading CRM rollouts at three different companies makes them someone who runs CRM implementations across very different businesses; rebuilding onboarding at two companies and cutting churn both times is a retention story, not a support story; building a scheduling product on their own after running scheduling for a clinic network shows they can take a problem from operations to a shipped product.

${INSIGHT_STYLE}
${PLAIN_LANGUAGE}

Rules:
- Evidence is the approved facts only. Each insight lists "factIds": the ids of the approved facts it rests on, usually from more than one role or project. A project's facts (their own repositories, each fact carrying its projectKey) are evidence exactly like a role's: what they built on their own counts as much as what they did in a job, and a pattern across work and projects is often the strongest one. The narratives are background for understanding them; never claim anything the approved facts don't support.
- Ownership follows the facts: full strength for what they did, nothing credited to them that the facts give to a product, team or company.
- Propose only what's new: nothing already approved or awaiting review, and nothing they rejected, in any wording. Learn from the reasons they gave.
- Fewer, stronger insights beat many thin ones. An insight that merely restates one fact isn't one.
- Write each "text" to them in the second person ("You run CRM rollouts…"): the claim in a sentence, plus at most one sentence with its strongest evidence. The facts it cites are shown alongside it, so don't retell them.

Reply with JSON only: {"insights":[{"text": "...", "factIds": ["..."]}]}.`;

type Out = { insights?: { text?: string; factIds?: string[] }[] };
export const INSIGHTS_SCHEMA = replyOf("insights", "insights", { text: string, factIds: strings });

async function queue(ctx: MutationCtx, workspaceId: Id<"workspaces">, why: "request" | "review") {
  // One at a time: a run already waiting or going will see everything approved so far.
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  if (jobs.some((j) => j.kind === "insights" && (j.status === "queued" || j.status === "running"))) return null;
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "insights", args: { why }, status: "queued", origin: why === "request" ? "you" : "automatic" });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  return jobId;
}

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    return queue(ctx, workspaceId, "request");
  },
});

// Called after a review action: once a narrative or a project has nothing left to review, take a fresh look (quietly, in
// the background). Approving a project counts too, since its facts only count once it's approved; a project's fact
// counts only then, so finishing its facts takes a look once the project is approved.
export async function afterReview(ctx: MutationCtx, item: Doc<"items">) {
  if (item.kind !== "fact" && !(item.kind === "project" && item.status === "approved")) return;
  const narrativeId = item.kind === "fact" ? item.sources[0]?.narrativeId : undefined;
  const projectKey = item.projectKey;
  if (!narrativeId && !projectKey) return;
  if (!narrativeId && item.kind === "fact" && !(await itemsOf(ctx, item.workspaceId, "project", "approved")).some((p) => p.projectKey === projectKey)) return;
  const open = (await itemsOf(ctx, item.workspaceId, "fact", "proposed")).some((f) => (narrativeId ? f.sources[0]?.narrativeId === narrativeId : f.projectKey === projectKey));
  if (open) return;
  const approved = await counted(ctx, item.workspaceId, "fact");
  if (approved.length < 2) return;
  await queue(ctx, item.workspaceId, "review");
}

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const record = await approvedRecord(ctx, workspaceId);
    const background = await backgroundNarratives(ctx, workspaceId);
    const pending = (await itemsOf(ctx, workspaceId, "insight", "proposed")).map((i) => i.data.text);
    const rejected = (await itemsOf(ctx, workspaceId, "insight", "rejected")).map((i) => ({ text: i.data.text, because: i.data.rejectedBecause ?? null }));
    return { record, background, pending, rejected };
  },
});

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), runId: v.id("jobs"), out: v.any() },
  handler: async (ctx, { workspaceId, runId, out }) => {
    // A retried run (after an interruption) that already saved its results saves nothing twice.
    if (await ctx.db.query("items").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return { alreadySaved: true } as never;
    const approvedFacts = new Map((await counted(ctx, workspaceId, "fact")).map((f) => [String(f._id), f]));
    const seen = new Set<string>();
    for (const status of ["proposed", "approved", "rejected"] as const) for (const i of await itemsOf(ctx, workspaceId, "insight", status)) seen.add(norm(i.data.text ?? ""));
    let added = 0;
    for (const raw of (out as Out).insights ?? []) {
      const text = typeof raw?.text === "string" ? raw.text.trim() : "";
      if (!text || seen.has(norm(text))) continue;
      // Evidence must be facts they approved; an insight with none left is dropped.
      const factIds = [...new Set((raw.factIds ?? []).map(String))].filter((id) => approvedFacts.has(id));
      if (!factIds.length) continue;
      seen.add(norm(text));
      const sources = factIds.flatMap((id) => approvedFacts.get(id)!.sources.slice(0, 1));
      await ctx.db.insert("items", { workspaceId, kind: "insight", status: "proposed", data: { text, factIds }, sources, runId, at: Date.now() });
      added++;
    }
    return { insights: added };
  },
});

export async function runInsights(ctx: ActionCtx, job: Doc<"jobs">) {
  const inputs: InsightInputs = await ctx.runQuery(internal.insights.inputs, { workspaceId: job.workspaceId });
  if (inputs.record.facts.length < 2) return { insights: 0 };
  const choice = await modelFor(ctx, job.workspaceId, "insights");
  const { out, reply } = await askForInsights(ctx, job.workspaceId, inputs, choice);
  const saved = await ctx.runMutation(internal.insights.save, { workspaceId: job.workspaceId, runId: job._id, out });
  return { ...saved, costUsd: reply.costUsd, model: reply.model };
}

type InsightInputs = FunctionReturnType<typeof internal.insights.inputs>;
// Insights as one model proposed them, each with the words of the approved facts it rests on.
export type InsightsDraft = { insights: { text: string; facts: string[] }[]; reply: ChatReply };

// Insights as one model finds them, saved nowhere: a comparison (compare.ts) shows them beside other models'. As when
// saving, an insight resting on no approved fact is dropped.
export async function draftInsights(ctx: ActionCtx, workspaceId: Id<"workspaces">, choice: ModelChoice, purpose: string): Promise<InsightsDraft> {
  const inputs: InsightInputs = await ctx.runQuery(internal.insights.inputs, { workspaceId });
  if (inputs.record.facts.length < 2) throw new Error("Approve at least two facts first; insights connect facts across your record.");
  const { out, reply } = await askForInsights(ctx, workspaceId, inputs, choice, purpose);
  const facts = new Map(inputs.record.facts.map((f) => [String(f.id), f.text]));
  const insights = (out.insights ?? []).flatMap((raw) => {
    const text = typeof raw?.text === "string" ? raw.text.trim() : "";
    const cited = [...new Set((raw?.factIds ?? []).map(String))].filter((id) => facts.has(id));
    return text && cited.length ? [{ text, facts: cited.map((id) => facts.get(id)!) }] : [];
  });
  return { insights, reply };
}

// One call reading the whole approved record for insights. Saves nothing.
async function askForInsights(ctx: ActionCtx, workspaceId: Id<"workspaces">, { record, background, pending, rejected }: InsightInputs, choice: ModelChoice, purpose = "insights"): Promise<{ out: Out; reply: ChatReply }> {
  const reply = await chatJson<Out>(ctx, {
    workspaceId,
    purpose,
    model: choice.model,
    reasoning: choice.reasoning,
    schema: INSIGHTS_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Approved record (the evidence; cite facts by id; a fact with a projectKey belongs to that project):\n${JSON.stringify({ roles: record.roles, projects: record.projects, facts: record.facts, context: record.context })}\n\nTheir directions (what they want next, for which insights matter most):\n${JSON.stringify(record.directions)}\n\nInsights already approved (don't repeat):\n${JSON.stringify(record.insights.map((i) => i.text))}\n\nInsights awaiting their review (don't repeat):\n${JSON.stringify(pending)}\n\nInsights they rejected, and why (never propose again, in any wording):\n${JSON.stringify(rejected)}\n\nTheir narratives, as background only (for understanding; claims must rest on approved facts):\n${JSON.stringify(background)}`,
      },
    ],
  });
  return { out: reply.out, reply };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const facts = new Map<string, ItemOf<"fact">>();
    for (const status of ["approved", "proposed", "rejected"] as const) for (const f of await itemsOf(ctx, workspaceId, "fact", status)) facts.set(String(f._id), f);
    const roles = new Map((await itemsOf(ctx, workspaceId, "role", "approved")).map((r) => [r.roleKey, r]));
    const projects = new Map<string | undefined, string>();
    for (const status of ["approved", "proposed", "rejected"] as const) for (const p of await itemsOf(ctx, workspaceId, "project", status)) projects.set(p.projectKey, p.data.name);
    const stands = await sourceCheck(ctx, workspaceId);
    const rows = [];
    for (const status of ["proposed", "approved", "rejected"] as const) rows.push(...(await itemsOf(ctx, workspaceId, "insight", status)));
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "insights");
    // The resumes an insight is in: the current version of the base resume and of each direction's (newest first
    // within each), when it was written from the insight.
    const current = new Map<string, Doc<"resumes">>();
    for await (const r of ctx.db.query("resumes").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId)).order("desc")) {
      const key = String(r.directionId ?? "base");
      if (r.posting === undefined && !r.toReview && !r.discarded && !current.has(key)) current.set(key, r);
    }
    const resumes = await Promise.all(
      [...current.values()].map(async (r) => ({
        resume: r.directionId ?? ("base" as const),
        name: r.directionId ? ((await ctx.db.get(r.directionId))?.data as { name?: string } | undefined)?.name ?? null : null,
        at: r.at,
        insights: new Set((r.writtenFrom?.insights ?? []).map((e) => String(e.id))),
      })),
    );
    return {
      last: last ? { status: last.status, error: last.error, added: last.result?.insights ?? null } : null,
      insights: rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((i) => ({
          id: i._id,
          status: i.status,
          data: i.data,
          basedOn: ((i.data.factIds ?? []) as string[]).map((id) => {
            const f = facts.get(id);
            const r = f?.roleKey ? roles.get(f.roleKey) : undefined;
            const project = f?.projectKey ? projects.get(f.projectKey) : undefined;
            return {
              id,
              text: f?.data.text ?? "(fact removed)",
              counts: !!f && f.status === "approved" && stands(f),
              project,
              role: project ? undefined : r ? [r.data.title, r.data.employer].filter(Boolean).join(", ") : f?.roleKey,
              // Where the fact lives, to link to it: its role's key, or its project's.
              roleKey: f?.roleKey ?? null,
              projectKey: f?.projectKey ?? null,
            };
          }),
          usedIn: resumes.filter((r) => r.insights.has(String(i._id))).map(({ resume, name, at }) => ({ resume, name, at })),
        })),
    };
  },
});
