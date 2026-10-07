import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { boolean, type ReplySchema, strictObject, strings } from "./replyJson";
import { sourceCheck } from "./recordContext";
import { editable, shownWith } from "./resume";
import { type FactMarks, factMarks, markOf } from "./resumeBasis";
import { dates, type ResumeDoc } from "./resumeDoc";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Check against facts: on their ask, one paid call reads a line (or the summary) they put in their own words beside the
// approved facts it rests on, and says whether it says only what they support, with the words that go beyond them.
// The answer is kept with the words it checked (the resume's layout), with the facts it was checked against as they
// read then, and cleared when they edit the words again (resume.setWords, setSummary). It shows only while those facts
// still count and read the same (resume.ts, currentChecks). Never runs by itself.

// `line`: the line by CareerBot's words, as pins, hides and edits go; none: the summary.
type CheckArgs = { resumeId: Id<"resumes">; line?: string; words: string };

// What a line or the summary rests on now, in a resume's version as shown (facts that still count, resume.shownWith):
// a line's own facts and where it sits; the summary's, every entry and the facts all its lines rest on. Null when the
// line isn't there.
async function basisOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, r: Doc<"resumes">, line: string | undefined) {
  const { facts, recheck } = await shownWith(ctx, workspaceId, await sourceCheck(ctx, workspaceId));
  const doc: ResumeDoc | undefined = recheck(r.doc);
  if (!doc) return null;
  const entries = [
    ...doc.experience.map((e) => ({ where: e.break ? "Career break" : `${e.title}, ${e.employer}`, when: dates(e), bullets: e.bullets })),
    ...(doc.projects ?? []).map((p) => ({ where: `Project: ${p.name}`, when: dates(p), bullets: p.bullets })),
  ];
  const cited = (ids: string[]) => [...new Set(ids)].flatMap((id) => (facts[id] ? [{ id, text: facts[id] }] : []));
  if (line === undefined) return { entries: entries.map(({ where, when }) => ({ where, ...(when ? { when } : {}) })), facts: cited(entries.flatMap((e) => e.bullets.flatMap((b) => b.factIds))) };
  const at = entries.find((e) => e.bullets.some((b) => b.text === line));
  if (!at) return null;
  return { entries: [{ where: at.where, ...(at.when ? { when: at.when } : {}) }], facts: cited(at.bullets.filter((b) => b.text === line).flatMap((b) => b.factIds)) };
}

// The marks of facts (a fact id and a mark of its words, as factChanges.ts holds them).
const marksOf = (facts: { id: string; text: string }[]): FactMarks => facts.map((f) => ({ id: f.id, mark: markOf(f.text) }));

// Their words for a line or the summary on this resume, or null when it's in CareerBot's.
const wordsOf = (r: Doc<"resumes">, line: string | undefined) => (line === undefined ? (r.layout?.summary ?? null) : (r.layout?.words?.find((w) => w.text === line)?.to ?? null));

const waiting = (j: Doc<"jobs">) => j.kind === "lineCheck" && (j.status === "queued" || j.status === "running" || j.status === "paused");

// Check a line (by CareerBot's words) or, with no line, the summary against its facts. Only words of their own on the
// current version are checked; a line with no approved facts to check against is refused. One check at a time each.
export const check = mutation({
  args: { id: v.id("resumes"), line: v.optional(v.string()) },
  handler: async (ctx, { id, line }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const r = await editable(ctx, workspaceId, id);
    const words = wordsOf(r, line);
    if (words === null) throw new ConvexError(line === undefined ? "Only a summary in your own words is checked against its facts." : "Only a line in your own words is checked against its facts.");
    const basis = await basisOf(ctx, workspaceId, r, line);
    if (!basis) throw new Error("Not found.");
    if (!basis.facts.length) throw new ConvexError(line === undefined ? "This resume rests on no approved facts to check against." : "This line rests on no approved facts to check against.");
    const recent = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    if (recent.some((j) => waiting(j) && j.args.resumeId === id && j.args.line === line)) return null;
    const args: CheckArgs = { resumeId: id, ...(line !== undefined ? { line } : {}), words };
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "lineCheck", args, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// What's being checked on a resume now: its lines (by CareerBot's words) and whether the summary is.
export const checking = query({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const recent = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const mine = recent.filter((j) => waiting(j) && j.args.resumeId === id);
    return { lines: mine.flatMap((j) => (typeof j.args.line === "string" ? [j.args.line as string] : [])), summary: mine.some((j) => j.args.line === undefined) };
  },
});

// What a check reads: the words as they are now and what they rest on. Null when the words changed since it was asked
// for, or the line is gone.
export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), resumeId: v.id("resumes"), line: v.optional(v.string()) },
  handler: async (ctx, { workspaceId, resumeId, line }) => {
    const r = await getInWorkspace(ctx, workspaceId, resumeId);
    const words = r ? wordsOf(r, line) : null;
    const basis = r && words !== null ? await basisOf(ctx, workspaceId, r, line) : null;
    return words !== null && basis ? { words, ...basis } : null;
  },
});

// The answer, kept with the words it checked and the facts it was checked against, while both still read the same.
// False when the words changed since, or a fact it was checked against was edited or stopped counting.
export const save = internalMutation({
  args: { resumeId: v.id("resumes"), line: v.optional(v.string()), words: v.string(), facts: factMarks, supported: v.boolean(), beyond: v.array(v.string()) },
  handler: async (ctx, { resumeId, line, words, facts, supported, beyond }) => {
    const r = await ctx.db.get(resumeId);
    if (!r?.layout || wordsOf(r, line) !== words) return false;
    const basis = await basisOf(ctx, r.workspaceId, r, line);
    const key = (m: FactMarks) => m.map((x) => `${x.id}:${x.mark}`).sort().join();
    if (!basis || key(marksOf(basis.facts)) !== key(facts)) return false;
    const check = { supported, beyond, facts, at: Date.now() };
    const layout = line === undefined ? { ...r.layout, summaryCheck: check } : { ...r.layout, words: r.layout.words!.map((w) => (w.text === line ? { ...w, check } : w)) };
    await ctx.db.patch(resumeId, { layout });
    return true;
  },
});

const PROMPT = `You check words a person wrote themselves on their resume against the approved facts they rest on, and say whether the words claim only what those facts support.

Fine: rewording, a different order, a plainer or stronger verb for the same thing, leaving something out, and what the facts clearly imply.
Goes beyond: a number, amount, share, scope, outcome, tool, title, team size, time span, or any claim the facts don't state or clearly imply.

Reply with JSON only: {"supported": true or false, "beyond": ["...", ...]}
- "beyond": each part that goes beyond the facts, as a short phrase copied word for word from their words. Empty when supported.`;
export const LINE_CHECK_SCHEMA: ReplySchema = { name: "line_check", schema: strictObject({ supported: boolean, beyond: strings }) };

// One call through the metered chat path, with the model chosen for checking lines. Saves the answer (save).
export async function runLineCheck(ctx: ActionCtx, job: Doc<"jobs">) {
  const { resumeId, line } = job.args as CheckArgs;
  const input = await ctx.runQuery(internal.lineCheck.inputs, { workspaceId: job.workspaceId, resumeId, ...(line !== undefined ? { line } : {}) });
  if (!input) throw new Error("The words changed since. Check them again.");
  if (!input.facts.length) throw new Error("Nothing approved to check against.");
  const choice = await modelFor(ctx, job.workspaceId, "lineCheck");
  const what = line === undefined ? "The summary at the top of their resume" : "One line of their resume";
  const reply = await chatJson<{ supported?: unknown; beyond?: unknown }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "line check",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: LINE_CHECK_SCHEMA,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: `${what}, in their own words:\n${input.words}\n\nWhere it sits:\n${JSON.stringify(input.entries)}\n\nThe approved facts it rests on:\n${JSON.stringify(input.facts.map((f) => f.text))}` },
    ],
  });
  const out = reply.out;
  if (typeof out.supported !== "boolean") throw new Error("The model's reply had no answer. Try again.");
  const beyond = [...new Set((Array.isArray(out.beyond) ? out.beyond : []).flatMap((p) => (typeof p === "string" && p.trim() ? [p.trim()] : [])))];
  const supported = out.supported && !beyond.length;
  const saved = await ctx.runMutation(internal.lineCheck.save, { resumeId, ...(line !== undefined ? { line } : {}), words: input.words, facts: marksOf(input.facts), supported, beyond });
  return { supported, beyond: beyond.length, saved, costUsd: reply.costUsd, model: reply.model };
}
