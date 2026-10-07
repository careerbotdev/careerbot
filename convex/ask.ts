import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, query } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { type ReplySchema, strictObject, string, strings } from "./replyJson";
import { addNarrative } from "./narratives";
import { change, own } from "./pursuits";
import { PLAIN_LANGUAGE } from "./writingGuides";
import { requireWorkspace } from "./workspaces";

// Ask about this role: a conversation kept with each pursuit. Answers rest on the approved record, the role and the
// resume tailored to it, and cite the approved facts they use. Something new they say about themselves is never used
// as fact: their message becomes a note, read into the record as proposals they review like any other.

const SYSTEM = `You help someone applying for one job. You get their approved career record (the only source of claims about them), the resume they are sending, the job posting, and your conversation so far. They may paste an application question, or ask anything about the role, the company or how to present themselves for it.

Answer so they can use it. An application question gets an answer they can paste as it is, in the first person, sounding like them on a good day. Use only what the approved record supports; never claim a skill, number, tool, title or experience it doesn't show. When the record doesn't support what a question asks for, say so plainly and answer with what it does support. For the role and the company, use the posting, and say when something isn't in it rather than guessing.

List the ids of the approved facts your answer rests on ("factIds"); empty when it rests on none.

If their latest message tells you something about themselves that the approved record doesn't have (something they did, know, hold or achieved), list each such thing in "learned", in their own words. Don't use it in your answer as a claim: it goes to their record for review first, and you can say so. Leave out questions, views about the company, and anything the record already has.

${PLAIN_LANGUAGE}

Reply with JSON only: {"answer": "...", "factIds": ["..."], "learned": ["..."]}.`;
export const ASK_SCHEMA: ReplySchema = { name: "ask", schema: strictObject({ answer: string, factIds: strings, learned: strings }) };

// Ask: their message is kept and an answer is written. One at a time per pursuit.
export const ask = mutation({
  args: { pursuitId: v.id("pursuits"), text: v.string() },
  handler: async (ctx, { pursuitId, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await own(ctx, workspaceId, pursuitId);
    const message = text.trim();
    if (!message) throw new ConvexError("Write a question first.");
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    if (jobs.some((j) => j.kind === "ask" && j.args.pursuitId === pursuitId && (j.status === "queued" || j.status === "running"))) throw new ConvexError("Wait for the answer to the last one.");
    const messageId = await ctx.db.insert("pursuitMessages", { workspaceId, pursuitId, from: "you", text: message, at: Date.now() });
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "ask", args: { pursuitId, messageId }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// The conversation, oldest first, with the approved facts the answers cite (as they read now) and the last run.
export const conversation = query({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await own(ctx, workspaceId, pursuitId);
    const messages = await ctx.db.query("pursuitMessages").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId)).collect();
    const facts: Record<string, string> = {};
    for (const id of new Set(messages.flatMap((m) => m.factIds ?? []))) {
      const f = await ctx.db.get(id as Id<"items">);
      if (f?.kind === "fact" && f.status === "approved" && f.workspaceId === workspaceId) facts[id] = f.data.text;
    }
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "ask" && j.args.pursuitId === pursuitId);
    return {
      messages: messages.map((m) => ({ id: m._id, from: m.from, text: m.text, factIds: m.factIds ?? [], kept: !!m.kept, learned: !!m.learned, at: m.at })),
      facts,
      last: last ? { status: last.status, error: last.error ?? null } : null,
    };
  },
});

// Keep an answer: saved to the pursuit's answers under the message it answered, with the facts it rests on.
export const keep = mutation({
  args: { messageId: v.id("pursuitMessages") },
  handler: async (ctx, { messageId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const m = await ctx.db.get(messageId);
    if (!m || m.workspaceId !== workspaceId || m.from !== "careerbot") throw new ConvexError("Not found.");
    if (m.kept) return;
    const p = await own(ctx, workspaceId, m.pursuitId);
    const all = await ctx.db.query("pursuitMessages").withIndex("by_pursuit", (q) => q.eq("pursuitId", m.pursuitId)).collect();
    const before = all.slice(0, all.findIndex((x) => x._id === messageId)).filter((x) => x.from === "you").pop();
    const question = before?.text ?? "";
    await change(ctx, p, { answers: [...(p.answers ?? []), { question, answer: m.text, factIds: m.factIds ?? [], at: Date.now() }] }, { event: "answer", text: question });
    await ctx.db.patch(messageId, { kept: true });
  },
});

export const history = internalQuery({
  args: { pursuitId: v.id("pursuits") },
  handler: (ctx, { pursuitId }) => ctx.db.query("pursuitMessages").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId)).collect(),
});

// Save an answer, and, when their message told something new about them, that message as a note read into the
// record (proposals to review). A retried run saves nothing twice.
export const save = internalMutation({
  args: { runId: v.id("jobs"), messageId: v.id("pursuitMessages"), answer: v.string(), factIds: v.array(v.string()), learned: v.boolean() },
  handler: async (ctx, { runId, messageId, answer, factIds, learned }) => {
    if (await ctx.db.query("pursuitMessages").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return;
    const m = await ctx.db.get(messageId);
    const p = m && (await ctx.db.get(m.pursuitId));
    if (!m || !p) return;
    await ctx.db.insert("pursuitMessages", { workspaceId: m.workspaceId, pursuitId: m.pursuitId, from: "careerbot", text: answer, factIds, runId, at: Date.now() });
    if (!learned || m.learned) return;
    const narrativeId = await addNarrative(ctx, m.workspaceId, "note", `Ask about this role: ${p.title} at ${p.company}`, m.text);
    const jobId = await ctx.db.insert("jobs", { workspaceId: m.workspaceId, kind: "extract", args: { narrativeId, version: 1, again: false }, status: "queued", origin: "automatic" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    await ctx.db.patch(messageId, { learned: narrativeId });
  },
});

export async function runAsk(ctx: ActionCtx, job: Doc<"jobs">) {
  const { pursuitId, messageId } = job.args as { pursuitId: Id<"pursuits">; messageId: Id<"pursuitMessages"> };
  const g = await ctx.runQuery(internal.pursuits.grounding, { pursuitId });
  const all = await ctx.runQuery(internal.ask.history, { pursuitId });
  const latest = all.find((m) => m._id === messageId);
  if (!g || !latest) return null;
  const earlier = all.slice(0, all.indexOf(latest)).map((m) => ({ from: m.from === "you" ? "them" : "you", text: m.text }));
  const choice = await modelFor(ctx, job.workspaceId, "ask");
  const reply = await chatJson<{ answer?: unknown; factIds?: unknown; learned?: unknown }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "ask about this role",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: ASK_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Their approved record (cite facts by id):\n${JSON.stringify(g.record)}\n\nThe resume they are sending:\n${g.resume ? JSON.stringify(g.resume) : "(none tailored yet)"}\n\nThe job posting: ${g.role.title} at ${g.role.company}${g.role.location ? ` · ${g.role.location}` : ""}${g.role.companySummary ? `\nAbout the company: ${g.role.companySummary}` : ""}\n\n${g.role.description ?? "(no description)"}\n\nThe conversation so far:\n${JSON.stringify(earlier)}\n\nTheir latest message:\n${latest.text}`,
      },
    ],
  });
  const approved = new Set(g.record.facts.map((f) => String(f.id)));
  const out = reply.out;
  const answer = typeof out.answer === "string" ? out.answer.trim() : "";
  if (!answer) throw new Error("The reply had no answer. Try again.");
  const factIds = [...new Set((Array.isArray(out.factIds) ? out.factIds : []).map(String).filter((id) => approved.has(id)))];
  const learned = Array.isArray(out.learned) && out.learned.some((x) => typeof x === "string" && x.trim());
  await ctx.runMutation(internal.ask.save, { runId: job._id, messageId, answer, factIds, learned });
  return { learned, costUsd: reply.costUsd, model: reply.model };
}
