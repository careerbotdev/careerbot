import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, query } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { listOf, string, strictObject, strings } from "./replyJson";
import { change, letterOf, own } from "./pursuits";
import { OUTREACH_STYLE, PLAIN_LANGUAGE } from "./writingGuides";
import { requireWorkspace } from "./workspaces";

// Cover letters for a pursuit, written from the approved record, the role and the resume tailored to it. Every
// version is kept; the newest is the one in use, and the one sent is kept on the pursuit when it leaves Preparing.
// Nothing about the person that the record doesn't support goes in.

const SYSTEM = `You write a cover letter for one job, for the person applying. You get their approved career record (the only source of claims about them), the resume they are sending with it, and the job posting.

Write a short letter that makes one clear case: why this person, for this role, at this company. Open with what they would bring, not with who they are or where they saw the posting. Pick the two or three things from the record that matter most to this posting and show them with specifics and numbers the record gives. Close with a plain line about talking further. Use the posting's own words where they are true to the record. Never add a claim, number, tool, title or employer the record doesn't have, and never stretch a fact to meet a requirement; handle a gap by leaving it out. Sound like them on a good day, in the first person.

Each paragraph lists the ids of the approved facts it rests on ("factIds"); a greeting, a closing or a paragraph about the company alone rests on none. Sign off with their name when it's given.

${OUTREACH_STYLE}
${PLAIN_LANGUAGE}

Reply with JSON only: {"paragraphs": [{"text": "...", "factIds": ["..."]}]}.`;

// Write a new version. Refused once the pursuit was sent, while one is being written, with no open role, and before a
// resume is tailored to its role.
export const write = mutation({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, pursuitId);
    if (p.sent) throw new ConvexError("It was sent with the cover letter it has.");
    if (!p.postingId) throw new ConvexError("There’s no open role to write a cover letter for.");
    if (!(await ctx.db.query("resumes").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", p.postingId)).first()))
      throw new ConvexError("Tailor your resume to this role first.");
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    if (jobs.some((j) => j.kind === "letter" && j.args.pursuitId === pursuitId && (j.status === "queued" || j.status === "running"))) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "letter", args: { pursuitId }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// Their own wording, saved as a new version. A paragraph kept word for word keeps the facts it rests on.
export const edit = mutation({
  args: { pursuitId: v.id("pursuits"), text: v.string() },
  handler: async (ctx, { pursuitId, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, pursuitId);
    if (p.sent) throw new ConvexError("It was sent with the cover letter it has.");
    const current = await letterOf(ctx, pursuitId);
    const cited = new Map((current?.paragraphs ?? []).map((x) => [x.text, x.factIds]));
    const paragraphs = text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => ({ text: x, factIds: cited.get(x) ?? [] }));
    if (!paragraphs.length) throw new ConvexError("Write the letter first.");
    await ctx.db.insert("letters", { workspaceId, pursuitId, paragraphs, edited: true, ...(current?.resumeId ? { resumeId: current.resumeId } : {}), at: Date.now() });
    await change(ctx, p, {}, { event: "letter", text: "edited" });
  },
});

// Its cover letter versions, newest first, the approved facts they cite (as they read now) and the last run.
export const forPursuit = query({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await own(ctx, workspaceId, pursuitId);
    const versions = await ctx.db.query("letters").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId)).order("desc").collect();
    const ids = [...new Set(versions.flatMap((l) => l.paragraphs.flatMap((x) => x.factIds)))];
    const facts: Record<string, string> = {};
    for (const id of ids) {
      const f = await ctx.db.get(id as Id<"items">);
      if (f?.kind === "fact" && f.status === "approved" && f.workspaceId === workspaceId) facts[id] = f.data.text;
    }
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "letter" && j.args.pursuitId === pursuitId);
    return {
      versions: versions.map((l) => ({ id: l._id, paragraphs: l.paragraphs, edited: !!l.edited, at: l.at })),
      facts,
      last: last ? { status: last.status, error: last.error ?? null } : null,
    };
  },
});

export const save = internalMutation({
  args: { runId: v.id("jobs"), pursuitId: v.id("pursuits"), paragraphs: v.array(v.object({ text: v.string(), factIds: v.array(v.string()) })), resumeId: v.optional(v.id("resumes")), model: v.string() },
  handler: async (ctx, { runId, pursuitId, ...rest }) => {
    // A retried run saves nothing twice.
    if (await ctx.db.query("letters").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return;
    const p = await ctx.db.get(pursuitId);
    if (!p) return;
    await ctx.db.insert("letters", { workspaceId: p.workspaceId, pursuitId, runId, ...rest, at: Date.now() });
    await change(ctx, p, {}, { event: "letter", text: "written" });
  },
});

export async function runLetter(ctx: ActionCtx, job: Doc<"jobs">) {
  const { pursuitId } = job.args as { pursuitId: Id<"pursuits"> };
  const g = await ctx.runQuery(internal.pursuits.grounding, { pursuitId });
  if (!g) return null;
  if (!g.record.facts.length) throw new Error("Approve some facts first; the letter is written only from your approved record.");
  if (!g.resume) throw new Error("Tailor your resume to this role first.");
  const choice = await modelFor(ctx, job.workspaceId, "letter");
  const reply = await chatJson<{ paragraphs?: { text?: unknown; factIds?: unknown }[] }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "cover letter",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: { name: "cover_letter", schema: strictObject({ paragraphs: listOf({ text: string, factIds: strings }) }) },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Their name: ${g.name ?? "(not given)"}\n\nTheir approved record (cite facts by id):\n${JSON.stringify(g.record)}\n\nThe resume they are sending:\n${JSON.stringify(g.resume)}\n\nThe job posting: ${g.role.title} at ${g.role.company}${g.role.location ? ` · ${g.role.location}` : ""}${g.role.companySummary ? `\nAbout the company: ${g.role.companySummary}` : ""}\n\n${g.role.description ?? "(no description)"}`,
      },
    ],
  });
  const approved = new Set(g.record.facts.map((f) => String(f.id)));
  const out = reply.out;
  const paragraphs = (Array.isArray(out.paragraphs) ? out.paragraphs : []).flatMap((x) =>
    typeof x?.text === "string" && x.text.trim() ? [{ text: x.text.trim(), factIds: (Array.isArray(x.factIds) ? x.factIds : []).map(String).filter((id) => approved.has(id)) }] : [],
  );
  if (!paragraphs.length) throw new Error("The reply wasn't a cover letter. Try again.");
  await ctx.runMutation(internal.letters.save, { runId: job._id, pursuitId, paragraphs, ...(g.resumeId ? { resumeId: g.resumeId } : {}), model: reply.model ?? choice.model });
  return { paragraphs: paragraphs.length, costUsd: reply.costUsd, model: reply.model };
}
