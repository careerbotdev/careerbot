import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, query } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { orNull, replyOf, string } from "./replyJson";
import { addNarrative } from "./narratives";
import { approvedRecord, backgroundNarratives, counted, itemsOf, sourceCheck } from "./recordContext";
import type { ItemOf } from "./itemShapes";
import { rejectNarrative } from "./sources";
import { PLAIN_LANGUAGE } from "./writingGuides";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Opt-in questions, gathered in one place, where an answer would really improve the record: a missing number, the scope
// of something they led, what came of a project. Only on request. An answer about one fact becomes a rewrite suggestion
// on that fact; any other answer becomes a quick note that's read like any narrative. "Not now" is never asked again.

const SYSTEM = `You are a great career coach who has read someone's whole career record. Suggest follow-up questions where their answer would really improve the record: a missing number or result, a number they only estimated (ask whether they can check it, so the line can state it plainly), the scope of something they led, what came of a project, a role with thin facts compared with what the narratives suggest they did.

Rules:
- Only questions whose answer would change or add a line on their resume. No questions about feelings, preferences or goals.
- Each question is specific, answerable in a sentence or two, and asked in the second person.
- "factId": the id of the one approved fact the answer would sharpen, or null. "roleKey": the role it's about.
- "why": one short line on what the answer would add.
- Never repeat a question already asked, answered or set aside, in any wording.
- A handful of the most useful questions, not everything you could ask.

${PLAIN_LANGUAGE}

Reply with JSON only: {"questions":[{"question": "...", "why": "...", "roleKey": "...", "factId": "..." | null}]}.`;

type Out = { questions?: { question?: string; why?: string; roleKey?: string; factId?: string | null }[] };
export const FOLLOWUPS_SCHEMA = replyOf("followups", "questions", { question: string, why: string, roleKey: string, factId: orNull("string") });

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    if (jobs.some((j) => j.kind === "followups" && (j.status === "queued" || j.status === "running"))) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "followups", args: {}, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const asked = [];
    for (const status of ["proposed", "approved", "skipped"] as const) asked.push(...(await itemsOf(ctx, workspaceId, "followup", status)).map((q) => q.data.question));
    return { record: await approvedRecord(ctx, workspaceId), background: await backgroundNarratives(ctx, workspaceId), asked };
  },
});

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), runId: v.id("jobs"), out: v.any() },
  handler: async (ctx, { workspaceId, runId, out }) => {
    // A retried run (after an interruption) that already saved its results saves nothing twice.
    if (await ctx.db.query("items").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return { alreadySaved: true } as never;
    const stands = await sourceCheck(ctx, workspaceId);
    const facts = new Map((await counted(ctx, workspaceId, "fact", stands)).map((f) => [String(f._id), f]));
    const roles = new Set((await counted(ctx, workspaceId, "role", stands)).map((r) => r.roleKey));
    const seen = new Set<string>();
    for (const status of ["proposed", "approved", "skipped"] as const) for (const q of await itemsOf(ctx, workspaceId, "followup", status)) seen.add(norm(q.data.question ?? ""));
    let added = 0;
    for (const raw of (out as Out).questions ?? []) {
      const question = typeof raw?.question === "string" ? raw.question.trim() : "";
      if (!question || seen.has(norm(question))) continue;
      const fact = raw.factId ? facts.get(String(raw.factId)) : undefined;
      const roleKey = fact?.roleKey ?? (raw.roleKey && roles.has(raw.roleKey) ? raw.roleKey : undefined);
      seen.add(norm(question));
      await ctx.db.insert("items", {
        workspaceId,
        kind: "followup",
        status: "proposed",
        roleKey,
        data: { question, why: typeof raw.why === "string" ? raw.why.trim() : "", factId: fact?._id ?? null },
        sources: fact ? fact.sources.slice(0, 1) : [],
        runId,
        at: Date.now(),
      });
      added++;
    }
    return { questions: added };
  },
});

export async function runFollowups(ctx: ActionCtx, job: Doc<"jobs">) {
  const { record, background, asked } = await ctx.runQuery(internal.followups.inputs, { workspaceId: job.workspaceId });
  if (!record.facts.length) return { questions: 0 };
  const choice = await modelFor(ctx, job.workspaceId, "followups");
  const reply = await chatJson<Out>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "followups",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: FOLLOWUPS_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Approved record:\n${JSON.stringify({ roles: record.roles, projects: record.projects, facts: record.facts, context: record.context })}\n\nTheir directions:\n${JSON.stringify(record.directions)}\n\nAlready asked, answered or set aside (never repeat):\n${JSON.stringify(asked)}\n\nTheir narratives, as background:\n${JSON.stringify(background)}`,
      },
    ],
  });
  const saved = await ctx.runMutation(internal.followups.save, { workspaceId: job.workspaceId, runId: job._id, out: reply.out });
  return { ...saved, costUsd: reply.costUsd, model: reply.model };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const roles = new Map((await itemsOf(ctx, workspaceId, "role", "approved")).map((r) => [r.roleKey, r]));
    const open = await itemsOf(ctx, workspaceId, "followup", "proposed");
    const answered = await itemsOf(ctx, workspaceId, "followup", "approved");
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "followups");
    const row = (q: ItemOf<"followup">) => {
      const r = q.roleKey ? roles.get(q.roleKey) : undefined;
      return { id: q._id, status: q.status, data: q.data, role: r ? [r.data.title, r.data.employer].filter(Boolean).join(", ") : null };
    };
    return {
      last: last ? { status: last.status, error: last.error, added: last.result?.questions ?? null } : null,
      open: open.map(row),
      answered: answered.sort((a, b) => b._creationTime - a._creationTime).map(row),
    };
  },
});

// Their answer goes where it helps: onto the fact as a rewrite suggestion, or into a note that's read into the record.
export const answer = mutation({
  args: { id: v.id("items"), answer: v.string() },
  handler: async (ctx, { id, answer }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const q = await getInWorkspace(ctx, workspaceId, id);
    const text = answer.trim();
    if (!q || q.kind !== "followup") throw new Error("Not found.");
    if (!text) throw new Error("Write an answer, or choose Not now.");
    const fact = q.data.factId ? await getInWorkspace(ctx, workspaceId, q.data.factId as Id<"items">) : null;
    let result: { factId: Id<"items"> } | { narrativeId: Id<"narratives"> };
    if (fact && fact.kind === "fact" && fact.status !== "rejected") {
      const note = `${q.data.question} ${text}`;
      await ctx.db.patch(fact._id, { data: { ...fact.data, suggestion: { pending: true, note, at: Date.now() } } });
      const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "rework", args: { itemId: fact._id, note }, status: "queued", origin: "you" });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
      result = { factId: fact._id };
    } else {
      const role = q.roleKey ? (await itemsOf(ctx, workspaceId, "role", "approved")).find((r) => r.roleKey === q.roleKey) : undefined;
      const where = role ? [role.data.title, role.data.employer].filter(Boolean).join(" at ") : "my career";
      const narrativeId = await addNarrative(ctx, workspaceId, "note", `Follow-up: ${where}`, `About ${where}.\n\nQ: ${q.data.question}\nA: ${text}`);
      const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "extract", args: { narrativeId, version: 1, again: false }, status: "queued", origin: "you" });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
      result = { narrativeId };
    }
    await ctx.db.patch(id, { status: "approved", data: { ...q.data, answer: text, answeredAt: Date.now(), ...result } });
  },
});

// Not now: never asked again. `reason`: why, when they said, kept with the question.
export const notNow = mutation({
  args: { id: v.id("items"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const q = await getInWorkspace(ctx, workspaceId, id);
    if (!q || q.kind !== "followup") throw new Error("Not found.");
    await ctx.db.patch(id, { status: "skipped", data: { ...q.data, skippedBecause: reason?.trim() || undefined } });
  },
});

// Undo Not now or an answer: the question is open again. What an answer started goes with it: the rewrite it asked for
// on the fact (while it's still that one), or the note it wrote, set aside as a source with what it proposed.
export const reopen = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const q = await getInWorkspace(ctx, workspaceId, id);
    if (!q || q.kind !== "followup" || q.status === "proposed") throw new Error("Not found.");
    const { question, why, factId, answer, narrativeId } = q.data;
    if (answer && factId) {
      const fact = await getInWorkspace(ctx, workspaceId, factId as Id<"items">);
      if (fact?.kind === "fact" && fact.data.suggestion?.note === `${question} ${answer}`) await ctx.db.patch(fact._id, { data: { ...fact.data, suggestion: null } });
    }
    const note = narrativeId && (await getInWorkspace(ctx, workspaceId, narrativeId));
    if (note && note.rejectedAt === undefined) await rejectNarrative(ctx, note);
    await ctx.db.patch(id, { status: "proposed", data: { question, why, factId } });
  },
});
