import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { orNull, replyOf, string } from "./replyJson";
import { type ItemOf, type ItemStatus, itemsOf, pickConflict } from "./itemShapes";
import { counted, sourceCheck, squash } from "./recordContext";
import { dateLabel, monthOf } from "./resumeDoc";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Finds places where a narrative disagrees with the approved record (dates, titles, employers, numbers)
// and asks the person which is right. The record doesn't change until they answer. Jobs in the record whose dates
// overlap are asked about here too (overlaps, below), without AI.

const SYSTEM = `You compare someone's approved career record with everything they've written about their career, and find where the two disagree about a checkable fact: a start or end date, a job title, an employer, or a number.

Only real disagreements: the narrative states something the record contradicts. A narrative that adds detail, rounds, or leaves something out is not a disagreement. Don't guess which side is right.

Each conflict has "roleKey" (the record role it concerns, or null), "field" ("start", "end", "title", "employer" or null for anything else), "recordSays" and "narrativeSays" (each a short plain phrase, e.g. "Started September 2024"), "narrativeValue" (for dates, the narrative's value as YYYY-MM; for titles and employers, the text; otherwise null), "narrativeId" (the id of the narrative that disagrees), "quote" (the exact words from that narrative), and "question" (one plain question to them, in the second person, naming both versions).

Reply with JSON only: {"conflicts":[...]}.`;

type Conflict = {
  roleKey?: string | null;
  field?: "start" | "end" | "title" | "employer" | null;
  recordSays: string;
  narrativeSays: string;
  narrativeValue?: string | null;
  narrativeId: string;
  quote?: string;
  question: string;
};
// The reply's shape (structured output, metering.chat): {"conflicts": [...]}, nulls where the prompt allows them.
export const CONFLICTS_SCHEMA = replyOf("conflicts", "conflicts", {
  roleKey: orNull("string"),
  field: orNull("string"),
  recordSays: string,
  narrativeSays: string,
  narrativeValue: orNull("string"),
  narrativeId: string,
  quote: string,
  question: string,
});

const open = (ctx: QueryCtx, workspaceId: Id<"workspaces">, status: ItemStatus) => itemsOf(ctx, workspaceId, "conflict", status);

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "check", args: {}, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const stands = await sourceCheck(ctx, workspaceId);
    const roles = (await counted(ctx, workspaceId, "role", stands)).map((r) => ({ roleKey: r.roleKey, employer: r.data.employer, title: r.data.title, start: r.data.start, end: r.data.end }));
    const facts = (await counted(ctx, workspaceId, "fact", stands)).map((f) => ({ roleKey: f.roleKey, text: f.data.text }));
    // Narratives they rejected raise no questions.
    const narratives = (await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      .filter((n) => n.body.trim() && n.rejectedAt === undefined)
      .map((n) => ({ id: n._id, version: n.version, kind: n.kind, title: n.title, body: n.body }));
    // Already answered: not asked again. (Overlapping jobs are asked about without the model.)
    const answered = (await open(ctx, workspaceId, "approved")).filter((c) => !c.data.overlap).map((c) => ({ roleKey: c.roleKey ?? null, field: c.data.field ?? null, narrativeSays: c.data.narrativeSays }));
    return { roles, facts, narratives, answered };
  },
});

const key = (c: { roleKey?: string | null; field?: string | null; narrativeValue?: string | null; narrativeSays?: string }) =>
  [c.roleKey ?? "", c.field ?? "", String(c.narrativeValue ?? c.narrativeSays ?? "").trim().toLowerCase()].join("|");

// Saves what a check found, then brings the questions about overlapping jobs up to date (checkOverlaps).
export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), runId: v.id("jobs"), out: v.any() },
  handler: async (ctx, { workspaceId, runId, out }) => {
    // A retried run (after an interruption) that already saved its results saves nothing twice.
    if (await ctx.db.query("items").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return { alreadySaved: true } as never;
    const found = ((out as { conflicts?: Conflict[] }).conflicts ?? []).filter((c) => c?.question && c?.narrativeId);
    const seen = new Set((await open(ctx, workspaceId, "approved")).map((c) => key({ ...c.data, roleKey: c.roleKey })));
    // A new check replaces open questions it no longer finds; answered ones stay answered. Overlapping jobs aren't the
    // model's to find: checkOverlaps keeps those.
    for (const c of await open(ctx, workspaceId, "proposed")) if (!c.data.overlap) await ctx.db.patch(c._id, { status: "superseded" });
    let added = 0;
    for (const c of found) {
      if (seen.has(key(c))) continue;
      seen.add(key(c));
      const nid = ctx.db.normalizeId("narratives", c.narrativeId);
      const n = nid && (await getInWorkspace(ctx, workspaceId, nid));
      if (!n) continue;
      await ctx.db.insert("items", {
        workspaceId,
        kind: "conflict",
        status: "proposed",
        data: pickConflict(c),
        roleKey: c.roleKey ?? undefined,
        sources: [{ narrativeId: n._id, version: n.version, quotes: c.quote ? [c.quote] : [] }],
        runId,
        at: Date.now(),
      });
      added++;
    }
    return { conflicts: added + (await checkOverlaps(ctx, workspaceId)) };
  },
});

export async function runCheck(ctx: ActionCtx, job: Doc<"jobs">) {
  const { roles, facts, narratives, answered } = await ctx.runQuery(internal.conflicts.inputs, { workspaceId: job.workspaceId });
  // No stories to compare: only the record's own overlapping jobs are asked about.
  if (!narratives.length) return ctx.runMutation(internal.conflicts.save, { workspaceId: job.workspaceId, runId: job._id, out: { conflicts: [] } });
  const choice = await modelFor(ctx, job.workspaceId, "extract");
  const reply = await chatJson<unknown>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "check",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: CONFLICTS_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Approved record roles:\n${JSON.stringify(roles)}\n\nApproved facts:\n${JSON.stringify(facts)}\n\nAlready answered (don't raise these again):\n${JSON.stringify(answered)}\n\nNarratives:\n${JSON.stringify(narratives)}`,
      },
    ],
  });
  const out = reply.out;
  const saved = await ctx.runMutation(internal.conflicts.save, { workspaceId: job.workspaceId, runId: job._id, out });
  return { ...saved, costUsd: reply.costUsd, model: reply.model };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    return (await open(ctx, workspaceId, "proposed")).map((c) => ({ id: c._id, roleKey: c.roleKey, data: c.data, sources: c.sources }));
  },
});

export const lastCheck = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(50);
    const j = jobs.find((x) => x.kind === "check");
    return j ? { status: j.status, error: j.error, result: j.result } : null;
  },
});

// Their answer settles the question. "record": keep the record. "narrative" or "other": the record takes the given value.
// For jobs that overlap: "both", they held both and nothing changes; or "other" with `field`, the month the first job
// ended ("end") or the other started ("start"). `reason`: why, when they said, kept with the answer.
export const answer = mutation({
  args: {
    id: v.id("items"),
    pick: v.union(v.literal("record"), v.literal("narrative"), v.literal("other"), v.literal("both")),
    value: v.optional(v.string()),
    field: v.optional(v.union(v.literal("start"), v.literal("end"))),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { id, pick, value, field, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await getInWorkspace(ctx, workspaceId, id);
    if (!c || c.kind !== "conflict") throw new Error("Not found.");
    const overlap = !!c.data.overlap;
    if (overlap ? pick === "record" || pick === "narrative" || (pick === "other" && !field) : pick === "both") throw new Error("That doesn’t answer this question.");
    const next = pick === "narrative" ? c.data.narrativeValue : pick === "other" ? value?.trim() : undefined;
    if (pick === "narrative" || pick === "other") {
      if (!next) throw new Error("Give the right value.");
      if (overlap && !/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(next)) throw new ConvexError("Write a month and year, like May 2021.");
      const target = changes(c, field);
      const role = target && (await itemsOf(ctx, workspaceId, "role", "approved")).find((r) => r.roleKey === target.roleKey);
      if (overlap && !role) throw new Error("Not found.");
      if (role && target) {
        const data = { ...role.data, history: [...(role.data.history ?? []), { field: target.field, from: role.data[target.field] ?? null, to: next, how: "answer" as const, at: Date.now() }] };
        data[target.field] = next;
        await ctx.db.patch(role._id, { data });
      }
    }
    const answer = { pick, value: next ?? null, field: overlap ? field : undefined, reason: reason?.trim() || undefined, at: Date.now() };
    await ctx.db.patch(id, { status: "approved", data: { ...c.data, answer } });
    await checkOverlaps(ctx, workspaceId);
  },
});

// Undo an answer: the question is open again, and a role field the answer changed goes back to what it was (while it
// still reads as the answer left it).
export const reopen = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await getInWorkspace(ctx, workspaceId, id);
    if (!c || c.kind !== "conflict" || c.status !== "approved" || !c.data.answer) throw new Error("Not found.");
    const { answer, ...data } = c.data;
    const target = answer.pick === "narrative" || answer.pick === "other" ? changes(c, answer.field) : null;
    const role = target && (await itemsOf(ctx, workspaceId, "role", "approved")).find((r) => r.roleKey === target.roleKey);
    const history = role?.data.history ?? [];
    const change = history.findLastIndex((h) => h.field === target?.field && h.to === answer.value);
    if (role && target && change >= 0 && role.data[target.field] === answer.value) {
      const restored = { ...role.data, history: history.filter((_, i) => i !== change) };
      restored[target.field] = history[change].from ?? undefined;
      await ctx.db.patch(role._id, { data: restored });
    }
    await ctx.db.patch(id, { status: "proposed", data });
    await checkOverlaps(ctx, workspaceId);
  },
});

// The role and field an answer changes: the question's own, or for jobs that overlap, the first job's end or the
// other's start.
function changes(c: ItemOf<"conflict">, field: "start" | "end" | undefined) {
  const o = c.data.overlap;
  if (o) return field ? { roleKey: field === "end" ? o.ends.roleKey : o.starts.roleKey, field } : null;
  return c.roleKey && c.data.field ? { roleKey: c.roleKey, field: c.data.field } : null;
}

// ---- Jobs that overlap ----

// Two approved jobs at different employers whose dates overlap by more than two months: one of the dates is probably
// wrong, unless they held both at once (part-time, volunteer or freelance work). Found from the record alone, without
// AI. Two months is the leeway for a handover, a notice period or dates rounded to the month: a job that ends the month
// the next starts overlaps it by one. Months count inclusively; a year alone runs from January as a start and to
// December as an end (resumeDoc.monthOf); no end runs to now. Career breaks, roles without an employer or a readable
// start, and roles at the same employer (a promotion; names compared without case, punctuation or spaces) never count.
export const OVERLAP_LEEWAY_MONTHS = 2;
type Job = { roleKey: string; employer?: string | null; start?: string | null; end?: string | null; break?: boolean | null };
type Placed = { roleKey: string; employer: string; start: string; end: string | null };

export function overlaps(roles: Job[], now = Date.now()): { ends: Placed; starts: Placed; months: number }[] {
  const today = new Date(now).getUTCFullYear() * 12 + new Date(now).getUTCMonth();
  const spans = roles
    .flatMap((r) => {
      const employer = r.employer?.trim();
      const s = monthOf(r.start, "start");
      const e = r.end ? monthOf(r.end, "end") : today;
      if (r.break || !employer || !r.start || s === null || e === null) return [];
      return [{ job: { roleKey: r.roleKey, employer, start: r.start, end: r.end ?? null }, s, e, same: squash(employer).replaceAll(" ", "") }];
    })
    .sort((a, b) => a.s - b.s || a.e - b.e || a.job.roleKey.localeCompare(b.job.roleKey));
  const out: { ends: Placed; starts: Placed; months: number }[] = [];
  for (const [i, a] of spans.entries())
    for (const b of spans.slice(i + 1)) {
      const months = Math.min(a.e, b.e) - b.s + 1;
      if (a.same !== b.same && months > OVERLAP_LEEWAY_MONTHS) out.push({ ends: a.job, starts: b.job, months });
    }
  return out;
}

// The question about two jobs that overlap, naming both and the dates in question.
export function overlapQuestion({ ends: a, starts: b }: { ends: Placed; starts: Placed }) {
  const span = (j: Placed) => `${dateLabel(j.start)} – ${j.end ? dateLabel(j.end) : "now"}`;
  const first = a.end ? `Your ${a.employer} job ends ${dateLabel(a.end)}` : `Your ${a.employer} job has no end date`;
  return {
    field: null,
    recordSays: span(a),
    narrativeSays: span(b),
    question: `${first} but your ${b.employer} job starts ${dateLabel(b.start)}. Which is right?`,
    overlap: { ends: { roleKey: a.roleKey, employer: a.employer }, starts: { roleKey: b.roleKey, employer: b.employer } },
  };
}

const pairOf = (o: { ends: { roleKey: string }; starts: { roleKey: string } }) => [o.ends.roleKey, o.starts.roleKey].sort().join("|");

// Keeps the questions about overlapping jobs in step with the approved record: asks about each pair that overlaps,
// unless they said they held both (never asked again for that pair); brings an open question's dates up to date; and
// drops one that no longer applies. Cheap, so it runs with every check and whenever roles change. Returns how many
// it asked anew. The questions cite no story: they're about the record itself.
export async function checkOverlaps(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const roles = (await counted(ctx, workspaceId, "role")).flatMap((r) => (r.roleKey ? [{ ...r.data, roleKey: r.roleKey }] : []));
  const settled = new Set((await open(ctx, workspaceId, "approved")).flatMap((c) => (c.data.overlap && c.data.answer?.pick === "both" ? [pairOf(c.data.overlap)] : [])));
  const wanted = new Map(
    overlaps(roles)
      .map(overlapQuestion)
      .filter((q) => !settled.has(pairOf(q.overlap)))
      .map((q) => [pairOf(q.overlap), q]),
  );
  for (const c of await open(ctx, workspaceId, "proposed")) {
    if (!c.data.overlap) continue;
    const q = wanted.get(pairOf(c.data.overlap));
    if (!q) {
      await ctx.db.patch(c._id, { status: "superseded" });
      continue;
    }
    wanted.delete(pairOf(q.overlap));
    const same = c.data.question === q.question && c.data.recordSays === q.recordSays && c.data.narrativeSays === q.narrativeSays && c.roleKey === q.overlap.ends.roleKey;
    if (!same) await ctx.db.patch(c._id, { roleKey: q.overlap.ends.roleKey, data: q });
  }
  for (const q of wanted.values()) await ctx.db.insert("items", { workspaceId, kind: "conflict", status: "proposed", data: q, roleKey: q.overlap.ends.roleKey, sources: [], at: Date.now() });
  return wanted.size;
}
