import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { type ItemOf, itemsOf, STATUSES } from "./itemShapes";
import { counted } from "./recordContext";
import { chatJson } from "./metering";
import { replyOf, strings } from "./replyJson";
import { tallyApproval } from "./tallies";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Finds facts within one role that say the same thing (often once from each of two narratives) and flags them, on request
// only. Nothing changes until the person merges them (keeping one wording, with both facts' sources, history and notes)
// or keeps both, after which that pair is never flagged again.

const SYSTEM = `You read someone's career record role by role and find facts within the same role that say the same thing: the same piece of work or the same result, told twice (for example once briefly and once in detail, or once in each of two narratives).

Facts about different work, or about different results of the same work, are not duplicates. A fact that adds a new result or number to another is not a duplicate of it. When unsure, leave them out. Never group facts from different roles, and never group a pair they said is different.

Each group lists the "ids" of facts, all from one role, that say the same thing.

Reply with JSON only: {"groups":[{"ids":["..."]}]}.`;

type Fact = ItemOf<"fact">;
type Out = { groups?: { ids?: unknown }[] };
export const DUPLICATES_SCHEMA = replyOf("duplicates", "groups", { ids: strings });

const apart = (a: Fact, b: Fact) => !!a.data.keptApart?.includes(b._id) || !!b.data.keptApart?.includes(a._id);
function withoutFlag(data: Fact["data"]) {
  const rest = { ...data };
  delete rest.duplicateOf;
  return rest;
}
// A fact never edited has no history yet; its first wording counts as read.
const history = (f: Fact) => (f.data.history?.length ? f.data.history : [{ text: f.data.text, how: "read" as const, at: 0 }]);

// Approved (those that count) and awaiting review, oldest first with approved facts ahead, so a newer or unreviewed
// fact is the one flagged.
async function activeFacts(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const facts: Fact[] = [...(await counted(ctx, workspaceId, "fact")), ...(await itemsOf(ctx, workspaceId, "fact", "proposed"))];
  return facts.sort((a, b) => (a.status === b.status ? a._creationTime - b._creationTime : a.status === "approved" ? -1 : 1));
}

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    // One at a time: a run already waiting or going will see the record as it is.
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    if (jobs.some((j) => j.kind === "duplicates" && (j.status === "queued" || j.status === "running"))) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "duplicates", args: {}, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const titles = new Map((await itemsOf(ctx, workspaceId, "role", "approved")).map((r) => [r.roleKey, [r.data.title, r.data.employer].filter(Boolean).join(", ")]));
    const byRole = new Map<string, Fact[]>();
    for (const f of await activeFacts(ctx, workspaceId)) if (f.roleKey) byRole.set(f.roleKey, [...(byRole.get(f.roleKey) ?? []), f]);
    return [...byRole]
      .filter(([, facts]) => facts.length > 1)
      .map(([roleKey, facts]) => ({
        roleKey,
        role: titles.get(roleKey) ?? roleKey,
        facts: facts.map((f) => ({ id: f._id, text: f.data.text })),
        keptApart: facts.flatMap((a) => facts.filter((b) => a._id < b._id && apart(a, b)).map((b) => [a._id, b._id])),
      }));
  },
});

// A run's flags replace the last run's, so a retried run sets the same flags again rather than adding any.
export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), out: v.any() },
  handler: async (ctx, { workspaceId, out }) => {
    const facts = await activeFacts(ctx, workspaceId);
    const flags = new Map<Id<"items">, Id<"items">>();
    for (const group of (out as Out).groups ?? []) {
      const ids = new Set(Array.isArray(group?.ids) ? group.ids.map(String) : []);
      // Only facts in this workspace, still approved or awaiting review, in order.
      const found = facts.filter((f) => ids.has(f._id));
      for (const [i, f] of found.entries()) {
        if (flags.has(f._id)) continue;
        // An earlier fact in the same role that they haven't kept apart from this one.
        const of = found.slice(0, i).find((o) => f.roleKey && o.roleKey === f.roleKey && !apart(f, o));
        if (of) flags.set(f._id, of._id);
      }
    }
    for (const f of facts) {
      const next = flags.get(f._id);
      if (f.data.duplicateOf === next) continue;
      await ctx.db.patch(f._id, { data: next ? { ...f.data, duplicateOf: next } : withoutFlag(f.data) });
    }
    return { duplicates: flags.size };
  },
});

export async function runDuplicates(ctx: ActionCtx, job: Doc<"jobs">) {
  const roles = await ctx.runQuery(internal.duplicates.inputs, { workspaceId: job.workspaceId });
  // Nothing to compare: clear any flags left from facts that have since been rejected or moved.
  if (!roles.length) return ctx.runMutation(internal.duplicates.save, { workspaceId: job.workspaceId, out: { groups: [] } });
  const choice = await modelFor(ctx, job.workspaceId, "duplicates");
  const reply = await chatJson<Out>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "duplicates",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: DUPLICATES_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Roles, each with its facts (approved and awaiting review) and the pairs of fact ids they said are different:\n${JSON.stringify(roles)}`,
      },
    ],
  });
  const out = reply.out;
  const saved = await ctx.runMutation(internal.duplicates.save, { workspaceId: job.workspaceId, out });
  return { ...saved, costUsd: reply.costUsd, model: reply.model };
}

export const last = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(50);
    const j = jobs.find((x) => x.kind === "duplicates");
    return j ? { status: j.status, error: j.error } : null;
  },
});

// A flagged fact and the fact it looks like, both in the caller's workspace, in the same role and still in the record.
async function flaggedPair(ctx: QueryCtx, workspaceId: Id<"workspaces">, id: Id<"items">) {
  const fact = await getInWorkspace(ctx, workspaceId, id);
  if (!fact || fact.kind !== "fact") throw new Error("Not found.");
  const other = fact.data.duplicateOf && (await getInWorkspace(ctx, workspaceId, fact.data.duplicateOf));
  const settled = [fact, other].some((f) => f && f.status !== "approved" && f.status !== "proposed");
  if (!other || other.kind !== "fact" || other.roleKey !== fact.roleKey || settled) throw new Error("Not a duplicate.");
  return { fact, other };
}

// Keep one wording, approved. The other fact's sources and history join it, its notes move to it, and it's superseded.
export const merge = mutation({
  args: { id: v.id("items"), keep: v.union(v.literal("this"), v.literal("other")) },
  handler: async (ctx, { id, keep }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { fact, other } = await flaggedPair(ctx, workspaceId, id);
    const [kept, removed] = keep === "this" ? [fact, other] : [other, fact];
    const keptData = kept.data.duplicateOf === removed._id ? withoutFlag(kept.data) : kept.data;
    const merged = { text: kept.data.text, how: "merged" as const, note: removed.data.text, at: Date.now() };
    await ctx.db.patch(kept._id, {
      status: "approved",
      sources: [...kept.sources, ...removed.sources],
      data: { ...keptData, history: [...history(kept), ...history(removed), merged] },
    });
    const undoMerge = { status: removed.status, flagged: fact._id === kept._id ? ("kept" as const) : ("removed" as const), keptStatus: kept.status, keptSources: kept.sources.length, keptHistory: kept.data.history?.length ?? 0 };
    await ctx.db.patch(removed._id, { status: "superseded", data: { ...withoutFlag(removed.data), mergedInto: kept._id, undoMerge } });
    await tallyApproval(ctx, kept, "approved");
    await tallyApproval(ctx, removed, "superseded");
    await rebindFact(ctx, workspaceId, String(removed._id), String(kept._id));
    for (const status of STATUSES)
      for (const c of await itemsOf(ctx, workspaceId, "context", status))
        if (c.data.factId === removed._id) await ctx.db.patch(c._id, { data: { ...c.data, factId: kept._id } });
    // Facts flagged as duplicates of the removed one now point at the one kept.
    for (const f of await activeFacts(ctx, workspaceId)) {
      if (f.data.duplicateOf !== removed._id) continue;
      const stays = f._id !== kept._id && !apart(f, kept);
      await ctx.db.patch(f._id, { data: stays ? { ...f.data, duplicateOf: kept._id } : withoutFlag(f.data) });
    }
  },
});

// They're different: clear the flag and remember the pair, so no later run flags it again. `reason`: why, when they
// said, kept on the flagged fact.
export const keepBoth = mutation({
  args: { id: v.id("items"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { fact, other } = await flaggedPair(ctx, workspaceId, id);
    const add = (list: string[] | undefined, x: Id<"items">) => [...new Set([...(list ?? []), x])];
    const why = reason?.trim();
    const apartBecause = why ? [...(fact.data.apartBecause ?? []).filter((a) => a.id !== other._id), { id: String(other._id), reason: why }] : fact.data.apartBecause;
    await ctx.db.patch(fact._id, { data: { ...withoutFlag(fact.data), keptApart: add(fact.data.keptApart, other._id), apartBecause } });
    const otherData = other.data.duplicateOf === fact._id ? withoutFlag(other.data) : other.data;
    await ctx.db.patch(other._id, { data: { ...otherData, keptApart: add(other.data.keptApart, fact._id) } });
  },
});

// Undo Keep both: the pair is flagged again, as it was, and forgotten as different.
export const reopen = mutation({
  args: { id: v.id("items"), other: v.id("items") },
  handler: async (ctx, { id, other: otherId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const fact = await getInWorkspace(ctx, workspaceId, id);
    const other = await getInWorkspace(ctx, workspaceId, otherId);
    if (fact?.kind !== "fact" || other?.kind !== "fact" || !fact.data.keptApart?.includes(otherId)) throw new Error("Not found.");
    const drop = (list: string[] | undefined, x: string) => list?.filter((y) => y !== x);
    await ctx.db.patch(fact._id, { data: { ...fact.data, duplicateOf: other._id, keptApart: drop(fact.data.keptApart, other._id), apartBecause: fact.data.apartBecause?.filter((a) => a.id !== other._id) } });
    await ctx.db.patch(other._id, { data: { ...other.data, keptApart: drop(other.data.keptApart, fact._id) } });
  },
});

// Undo a merge, from the fact merged away: both facts are as they were before, flag and all. The kept fact loses the
// sources and history the merge gave it; what was pointed at the kept fact stays with it.
export const unmerge = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const removed = await getInWorkspace(ctx, workspaceId, id);
    if (removed?.kind !== "fact" || removed.status !== "superseded" || !removed.data.undoMerge || !removed.data.mergedInto) throw new Error("Not found.");
    const kept = await getInWorkspace(ctx, workspaceId, removed.data.mergedInto);
    if (kept?.kind !== "fact") throw new Error("Not found.");
    const u = removed.data.undoMerge;
    const data = { ...removed.data, undoMerge: undefined, mergedInto: undefined };
    const keptHistory = kept.data.history?.slice(0, u.keptHistory);
    await ctx.db.patch(kept._id, {
      status: u.keptStatus,
      sources: kept.sources.slice(0, u.keptSources),
      data: { ...kept.data, history: keptHistory?.length ? keptHistory : undefined, ...(u.flagged === "kept" ? { duplicateOf: removed._id } : {}) },
    });
    await ctx.db.patch(removed._id, { status: u.status, data: { ...data, ...(u.flagged === "removed" ? { duplicateOf: kept._id } : {}) } });
    await tallyApproval(ctx, kept, u.keptStatus);
    await tallyApproval(ctx, removed, u.status);
  },
});

// Everything that cited the merged-away fact now cites the kept one: insights, follow-ups, direction stories and
// evidence, and saved resume bullets and requirements. Nothing is left pointing at a retired fact.
async function rebindFact(ctx: MutationCtx, workspaceId: Id<"workspaces">, from: string, to: string) {
  const swap = (ids: string[]) => [...new Set(ids.map((x) => (x === from ? to : x)))];
  const has = (ids?: string[]) => !!ids?.includes(from);
  for (const status of ["proposed", "approved", "rejected"] as const) {
    for (const i of await itemsOf(ctx, workspaceId, "insight", status))
      if (has(i.data.factIds)) await ctx.db.patch(i._id, { data: { ...i.data, factIds: swap(i.data.factIds) } });
    for (const q of await itemsOf(ctx, workspaceId, "followup", status))
      if (q.data.factId === from) await ctx.db.patch(q._id, { data: { ...q.data, factId: to as Id<"items"> } });
    for (const d of await itemsOf(ctx, workspaceId, "direction", status)) {
      const t = d.data.detail;
      const touched = has(d.data.evidence) || !!t?.carriesOver.some((x) => has(x.factIds)) || !!t?.reframe.some((x) => has(x.factIds));
      if (!touched) continue;
      const st = (xs: { text: string; factIds: string[]; how?: string }[]) => xs.map((x) => ({ ...x, factIds: swap(x.factIds) }));
      await ctx.db.patch(d._id, {
        data: { ...d.data, ...(d.data.evidence ? { evidence: swap(d.data.evidence) } : {}), ...(t ? { detail: { ...t, carriesOver: st(t.carriesOver), reframe: st(t.reframe) } } : {}) },
      });
    }
  }
  for (const r of await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
    const inDoc = !!r.doc?.experience.some((e) => e.bullets.some((b) => has(b.factIds)));
    const inReq = !!r.requirements?.some((x) => has(x.factIds));
    if (!inDoc && !inReq) continue;
    await ctx.db.patch(r._id, {
      ...(r.doc && inDoc ? { doc: { ...r.doc, experience: r.doc.experience.map((e) => ({ ...e, bullets: e.bullets.map((b) => ({ ...b, factIds: swap(b.factIds) })) })) } } : {}),
      ...(r.requirements && inReq ? { requirements: r.requirements.map((x) => ({ ...x, factIds: swap(x.factIds) })) } : {}),
    });
  }
}
