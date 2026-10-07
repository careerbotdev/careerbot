import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { type ItemOf, itemsOf, STATUSES } from "./itemShapes";
import { chatJson } from "./metering";
import { replyOf, string } from "./replyJson";
import { counted, sourceCheck } from "./recordContext";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Same work: a project linked to a role often tells some of the same work as that role's facts (the repository and the
// narrative each describe it). When a project is linked, and on request, the project's approved facts and the role's
// approved facts are read for pairs that describe the same work, suggested under the project. Connect links the two
// facts (their text is never touched): resumes then write one line for them, from the richer one, with the other as
// context. Keep separate means that pair is never suggested again.

const SYSTEM = `You compare the facts of one software project with the facts of the job it was part of, from someone's career record. Find pairs where a project fact and a role fact describe the same piece of work: the same thing built, launched or achieved, told once from the repository and once from the job.

Pair only facts about the same work. Facts about related but different work, or about different results of the same work, are not a pair. When unsure, leave it out. Each fact is in at most one pair. Never pair facts they said are separate.

For each pair, "richer" is the id of the fact that says more (results, numbers, scope, who it was for): the one a resume line should be written from.

Reply with JSON only: {"pairs":[{"projectFactId":"...","roleFactId":"...","richer":"..."}]}.`;

type Fact = ItemOf<"fact">;
type Out = { pairs?: { projectFactId?: unknown; roleFactId?: unknown; richer?: unknown }[] };
export const SAME_WORK_SCHEMA = replyOf("same_work", "pairs", { projectFactId: string, roleFactId: string, richer: string });
export type Connection = { other: string; lead: string };

// Connected pairs that hold, by fact id (both facts): the other fact and the lead. A pair holds while both facts are
// approved and count (the facts passed in), the project's fact is in an approved project (passed in) linked to the
// role the other fact is in, and each points at the other.
export function connections(facts: Fact[], projects: ItemOf<"project">[]) {
  const byId = new Map(facts.map((f) => [String(f._id), f]));
  const roleOf = new Map(projects.map((p) => [p.projectKey, p.roleKey]));
  const out = new Map<string, Connection>();
  for (const f of facts) {
    const c = f.data.sameWork;
    if (!c || !f.projectKey) continue;
    const o = byId.get(String(c.factId));
    if (!o || o.projectKey || !o.roleKey || o.data.sameWork?.factId !== f._id || roleOf.get(f.projectKey) !== o.roleKey) continue;
    if (c.lead !== f._id && c.lead !== o._id) continue;
    out.set(String(f._id), { other: String(o._id), lead: String(c.lead) });
    out.set(String(o._id), { other: String(f._id), lead: String(c.lead) });
  }
  return out;
}

// What a search reads: an approved, linked project and its role, and the approved facts of each that count, less those
// already connected. Null when the project isn't approved and linked to an approved role.
async function sides(ctx: QueryCtx, workspaceId: Id<"workspaces">, projectKey: string) {
  const check = await sourceCheck(ctx, workspaceId);
  const projects = await counted(ctx, workspaceId, "project", check);
  const project = projects.find((p) => p.projectKey === projectKey);
  const role = project?.roleKey ? (await counted(ctx, workspaceId, "role", check)).find((r) => r.roleKey === project.roleKey && !r.data.break) : undefined;
  if (!project || !role) return null;
  const facts = await counted(ctx, workspaceId, "fact", check);
  const connected = connections(facts, projects);
  const open = facts.filter((f) => !connected.has(String(f._id)));
  return { project, role, projectFacts: open.filter((f) => f.projectKey === projectKey), roleFacts: open.filter((f) => !f.projectKey && f.roleKey === role.roleKey) };
}

// Queue a search for one project, unless one is already waiting or going. Called when a project is linked (automatic),
// and by start (theirs).
export async function queueSameWork(ctx: MutationCtx, workspaceId: Id<"workspaces">, projectKey: string, origin: "you" | "automatic") {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  if (jobs.some((j) => j.kind === "sameWork" && j.args.projectKey === projectKey && (j.status === "queued" || j.status === "running"))) return null;
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "sameWork", args: { projectKey }, status: "queued", origin });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  return jobId;
}

// Suggestions waiting on a project's facts go when it's unlinked or linked to another role.
export async function clearSuggestions(ctx: MutationCtx, workspaceId: Id<"workspaces">, projectKey: string) {
  for (const status of STATUSES)
    for (const f of await itemsOf(ctx, workspaceId, "fact", status))
      if (f.projectKey === projectKey && f.data.sameWorkAs) await ctx.db.patch(f._id, { data: without(f.data, "sameWorkAs") });
}

function without(data: Fact["data"], key: "sameWorkAs" | "sameWork") {
  const rest = { ...data };
  delete rest[key];
  return rest;
}

// Find same work for one project, on request.
export const start = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const project = await getInWorkspace(ctx, workspaceId, id);
    if (!project || project.kind !== "project" || !project.projectKey) throw new Error("Not found.");
    if (project.status !== "approved" || !project.roleKey) throw new ConvexError("Link this project to a role first.");
    return queueSameWork(ctx, workspaceId, project.projectKey, "you");
  },
});

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), projectKey: v.string() },
  handler: async (ctx, { workspaceId, projectKey }) => {
    const s = await sides(ctx, workspaceId, projectKey);
    if (!s) return null;
    const roleIds = new Set(s.roleFacts.map((f) => String(f._id)));
    return {
      project: { name: s.project.data.name, summary: s.project.data.summary, stack: s.project.data.stack },
      role: { title: s.role.data.title, employer: s.role.data.employer, start: s.role.data.start, end: s.role.data.end },
      projectFacts: s.projectFacts.map((f) => ({ id: f._id, text: f.data.text })),
      roleFacts: s.roleFacts.map((f) => ({ id: f._id, text: f.data.text })),
      separate: s.projectFacts.flatMap((f) => (f.data.keptSeparate ?? []).filter((r) => roleIds.has(r)).map((r) => [f._id, r])),
    };
  },
});

// A search's pairs replace the project's waiting suggestions. A pair is kept only between an approved fact of this
// project and an approved fact of its role, neither already connected nor already paired in this reply, and never a
// pair they kept separate. The lead is the reply's richer fact, else the longer one.
export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), projectKey: v.string(), out: v.any() },
  handler: async (ctx, { workspaceId, projectKey, out }) => {
    await clearSuggestions(ctx, workspaceId, projectKey);
    const s = await sides(ctx, workspaceId, projectKey);
    if (!s) return { pairs: 0 };
    const used = new Set<string>();
    let pairs = 0;
    for (const x of (out as Out).pairs ?? []) {
      const pf = s.projectFacts.find((f) => f._id === String(x?.projectFactId));
      const rf = s.roleFacts.find((f) => f._id === String(x?.roleFactId));
      if (!pf || !rf || used.has(pf._id) || used.has(rf._id) || pf.data.keptSeparate?.includes(rf._id)) continue;
      used.add(pf._id).add(rf._id);
      const lead = x.richer === pf._id || x.richer === rf._id ? (x.richer as Id<"items">) : pf.data.text.length >= rf.data.text.length ? pf._id : rf._id;
      await ctx.db.patch(pf._id, { data: { ...pf.data, sameWorkAs: { factId: rf._id, lead } } });
      pairs++;
    }
    return { pairs };
  },
});

export async function runSameWork(ctx: ActionCtx, job: Doc<"jobs">) {
  const { projectKey } = job.args as { projectKey: string };
  const input = await ctx.runQuery(internal.sameWork.inputs, { workspaceId: job.workspaceId, projectKey });
  // Nothing to compare: clear what was waiting.
  if (!input || !input.projectFacts.length || !input.roleFacts.length) return ctx.runMutation(internal.sameWork.save, { workspaceId: job.workspaceId, projectKey, out: { pairs: [] } });
  const choice = await modelFor(ctx, job.workspaceId, "sameWork");
  const reply = await chatJson<Out>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "same work",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: SAME_WORK_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `The project and the job it was part of, each with its approved facts, and the pairs (project fact id, role fact id) they said are separate:\n${JSON.stringify(input)}` },
    ],
  });
  const saved = await ctx.runMutation(internal.sameWork.save, { workspaceId: job.workspaceId, projectKey, out: reply.out });
  return { ...saved, costUsd: reply.costUsd, model: reply.model };
}

// The latest search for each project, by projectKey.
export const last = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(200);
    const out: Record<string, { status: Doc<"jobs">["status"]; error: string | null }> = {};
    for (const j of jobs) if (j.kind === "sameWork" && !out[j.args.projectKey]) out[j.args.projectKey] = { status: j.status, error: j.error ?? null };
    return out;
  },
});

// A waiting suggestion on a project's fact and the role fact it names, both in the caller's workspace, both approved,
// the project still linked to that fact's role.
async function suggested(ctx: QueryCtx, workspaceId: Id<"workspaces">, id: Id<"items">) {
  const fact = await getInWorkspace(ctx, workspaceId, id);
  if (!fact || fact.kind !== "fact" || !fact.projectKey) throw new Error("Not found.");
  const pair = fact.data.sameWorkAs;
  const other = pair && (await getInWorkspace(ctx, workspaceId, pair.factId));
  const project = (await itemsOf(ctx, workspaceId, "project", "approved")).find((p) => p.projectKey === fact.projectKey);
  if (!pair || !other || other.kind !== "fact" || other.projectKey || fact.status !== "approved" || other.status !== "approved" || !project || project.roleKey !== other.roleKey)
    throw new Error("Not a suggestion.");
  return { fact, other, lead: pair.lead };
}

// They're the same work: link the two facts (text untouched). Other suggestions naming either fact go.
export const connect = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { fact, other, lead } = await suggested(ctx, workspaceId, id);
    await ctx.db.patch(fact._id, { data: { ...without(fact.data, "sameWorkAs"), sameWork: { factId: other._id, lead } } });
    await ctx.db.patch(other._id, { data: { ...without(other.data, "sameWorkAs"), sameWork: { factId: fact._id, lead } } });
    for (const status of STATUSES)
      for (const f of await itemsOf(ctx, workspaceId, "fact", status))
        if (f._id !== fact._id && f.data.sameWorkAs?.factId === other._id) await ctx.db.patch(f._id, { data: without(f.data, "sameWorkAs") });
  },
});

// They're separate work: the suggestion goes and the pair is never suggested again. `reason`: why, when they said, kept
// on the project's fact.
export const keepSeparate = mutation({
  args: { id: v.id("items"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { fact, other } = await suggested(ctx, workspaceId, id);
    const why = reason?.trim();
    const apartBecause = why ? [...(fact.data.apartBecause ?? []).filter((a) => a.id !== other._id), { id: String(other._id), reason: why }] : fact.data.apartBecause;
    await ctx.db.patch(fact._id, { data: { ...without(fact.data, "sameWorkAs"), keptSeparate: [...new Set([...(fact.data.keptSeparate ?? []), String(other._id)])], apartBecause } });
  },
});

// Undo Connect or Keep separate, from the project's fact: the pair waits as a suggestion again, unlinked and no longer
// remembered as separate. `lead`: the richer fact the suggestion named.
export const reopen = mutation({
  args: { id: v.id("items"), other: v.id("items"), lead: v.id("items") },
  handler: async (ctx, { id, other: otherId, lead }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const fact = await getInWorkspace(ctx, workspaceId, id);
    const other = await getInWorkspace(ctx, workspaceId, otherId);
    if (fact?.kind !== "fact" || other?.kind !== "fact" || !fact.projectKey || (lead !== id && lead !== otherId)) throw new Error("Not found.");
    const linked = fact.data.sameWork?.factId === otherId;
    if (!linked && !fact.data.keptSeparate?.includes(otherId)) throw new Error("Not found.");
    if (other.data.sameWork?.factId === id) await ctx.db.patch(other._id, { data: without(other.data, "sameWork") });
    const data = without(fact.data, "sameWork");
    await ctx.db.patch(fact._id, {
      data: { ...data, sameWorkAs: { factId: otherId, lead }, keptSeparate: fact.data.keptSeparate?.filter((x) => x !== otherId), apartBecause: fact.data.apartBecause?.filter((a) => a.id !== otherId) },
    });
  },
});

// They're not the same work after all: the pair is unlinked on both facts (text untouched) and remembered as separate,
// so it isn't suggested again. Resumes show the two lines apart again as they're shown; nothing is rewritten.
export const disconnect = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const fact = await getInWorkspace(ctx, workspaceId, id);
    if (!fact || fact.kind !== "fact") throw new Error("Not found.");
    const other = fact.data.sameWork && (await getInWorkspace(ctx, workspaceId, fact.data.sameWork.factId));
    if (!other || other.kind !== "fact" || other.data.sameWork?.factId !== fact._id) throw new Error("Not connected.");
    const [project, role] = fact.projectKey ? [fact, other] : [other, fact];
    await ctx.db.patch(role._id, { data: without(role.data, "sameWork") });
    await ctx.db.patch(project._id, { data: { ...without(project.data, "sameWork"), keptSeparate: [...new Set([...(project.data.keptSeparate ?? []), String(role._id)])] } });
  },
});
