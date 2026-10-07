import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { syncSoon } from "./driveSoon";
import { type ItemOf, itemsOf } from "./itemShapes";
import { chatJson } from "./metering";
import { number, replyOf, string, strings } from "./replyJson";
import { change, letterOf, letterText } from "./pursuits";
import { pursuitHref } from "./pursuitSteps";
import { counted } from "./recordContext";
import { postingName } from "./resume";
import { type Basis, type FactMarks, factMarks, markOf } from "./resumeBasis";
import { type Bullet, type ResumeDoc, toPlain } from "./resumeDoc";
import { FACT_STYLE, OUTREACH_STYLE, PLAIN_LANGUAGE } from "./writingGuides";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Fact changes flow to documents. An approved fact edited or rejected since a resume, cover letter or set of answers
// was written leaves the lines citing it out of date. Those lines are found (a line's facts as it reflects them: the
// marks kept once a line update was applied, else what a base or direction resume was written from, else the fact's
// wording at the time from its history) and offered a line-level update, never a rewrite: on their ask, one paid call
// rewrites only those lines from the facts as they read now, and the result waits to be applied or discarded. A line in
// their own words stays theirs unless they choose the new one. Documents frozen as sent (a pursuit past Preparing keeps
// its resume, letter and answers as sent) are left alone; applying syncs Google Drive like any change.

export const target = v.union(
  v.object({ kind: v.literal("resume"), id: v.id("resumes") }),
  v.object({ kind: v.literal("letter"), id: v.id("letters") }),
  v.object({ kind: v.literal("answers"), id: v.id("pursuits") }),
);
export type Target = Infer<typeof target>;
const keyOf = (t: Target) => `${t.kind}:${t.id}`;

type Fact = ItemOf<"fact">;
type FactData = Fact["data"];
export type LineChange = "edited" | "rejected";

// A document's line: its words (CareerBot's), the facts it cites, their own words for it, and when it was written with
// the marks it holds for its facts once updated.
type Line = { text: string; factIds: string[]; theirs?: string; at: number; cites?: FactMarks };
// slot: a base or direction resume's place ("base" or its direction), where Resume updates lists it too.
type Loaded = { target: Target; workspaceId: Id<"workspaces">; lines: Line[]; basis?: Basis; name: string; href: string; slot?: string; context: string; resume?: Doc<"resumes">; letter?: Doc<"letters">; pursuit?: Doc<"pursuits"> };

// ---- Which lines a fact change leaves out of date (pure) ----

// A fact's words at a moment, from its history (each wording with when it was set; a dismissed rewrite never was its
// wording). A fact never reworded has its words now.
export function textAt(data: Pick<FactData, "text" | "history">, at: number) {
  const set = (data.history ?? []).filter((h) => h.how !== "dismissed");
  return (set.filter((h) => h.at <= at).at(-1) ?? set[0])?.text ?? data.text;
}

type Cited = { id: string; now: string | null; was: string | null };
export type Stale = { index: number; text: string; theirs: string | null; factIds: string[]; change: LineChange; facts: Cited[] };

// The lines resting on a fact rejected (no longer counting) or edited since the line reflected it; rejected wins.
// `facts`: every cited fact that counts now; `gone`: the words of cited facts that no longer count.
export function staleLines(lines: Line[], facts: Map<string, Fact>, gone: Map<string, string>, basis?: Basis): Stale[] {
  const written = new Map((basis?.facts ?? []).map((f) => [String(f.id), f.mark]));
  return lines.flatMap((l, index) => {
    const held = new Map((l.cites ?? []).map((c) => [c.id, c.mark]));
    let rejected = false;
    let edited = false;
    const cited = l.factIds.map((id): Cited => {
      const f = facts.get(id);
      if (!f) {
        rejected = true;
        return { id, now: null, was: gone.get(id) ?? null };
      }
      const then = textAt(f.data, l.at);
      const mark = held.get(id) ?? written.get(id) ?? markOf(then);
      if (mark === markOf(f.data.text)) return { id, now: f.data.text, was: null };
      edited = true;
      return { id, now: f.data.text, was: markOf(then) === mark ? then : null };
    });
    if (!rejected && !edited) return [];
    return [{ index, text: l.text, theirs: l.theirs ?? null, factIds: l.factIds, change: rejected ? ("rejected" as const) : ("edited" as const), facts: cited }];
  });
}

// ---- Documents ----

const bulletsOf = (doc: ResumeDoc) => [...doc.experience.flatMap((e) => e.bullets), ...(doc.projects ?? []).flatMap((p) => p.bullets)];

// The current version of a base resume (no direction) or a direction's: the newest not waiting in Resume updates.
async function currentOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, directionId: Id<"items"> | undefined) {
  return (await ctx.db.query("resumes").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId)).order("desc").collect()).find(
    (r) => r.posting === undefined && !r.toReview,
  );
}

const pursuitOfPosting = (ctx: QueryCtx, workspaceId: Id<"workspaces">, postingId: Id<"postings">) =>
  ctx.db.query("pursuits").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", postingId)).first();

// A document that can take a line update, with its lines; null when it's gone, not the one in use (an older resume
// version, a letter with a newer version) or frozen as sent.
async function load(ctx: QueryCtx, workspaceId: Id<"workspaces">, t: Target): Promise<Loaded | null> {
  if (t.kind === "resume") {
    const r = await getInWorkspace(ctx, workspaceId, t.id);
    if (!r?.doc || r.discarded || r.toReview) return null;
    let name: string;
    let href: string;
    if (r.posting === undefined) {
      if ((await currentOf(ctx, workspaceId, r.directionId))?._id !== r._id) return null;
      const d = r.directionId ? await getInWorkspace(ctx, workspaceId, r.directionId) : null;
      name = d?.kind === "direction" ? `${d.data.name} resume` : "Base resume";
      href = `/resumes?resume=${r.directionId ?? "base"}`;
    } else {
      const p = r.postingId ? await pursuitOfPosting(ctx, workspaceId, r.postingId) : null;
      if (p?.sent?.resumeId === r._id) return null;
      const n = await postingName(ctx, workspaceId, r);
      name = `${n.company ? `${n.title}, ${n.company}` : n.title} resume`;
      href = `/resumes?resume=${r._id}`;
    }
    const words = new Map((r.layout?.words ?? []).map((w) => [w.text, w]));
    const at = r.writtenAt ?? r.at;
    // A line in their own words holds its facts as they read when they wrote the words, once that's known.
    const lines = bulletsOf(r.doc).map((b) => {
      const w = words.get(b.text);
      const cites = [...(r.cites ?? []), ...(w?.marks ?? [])];
      return { text: b.text, factIds: b.factIds, ...(w ? { theirs: w.to } : {}), at, ...(cites.length ? { cites } : {}) };
    });
    const slot = r.posting === undefined ? (r.directionId ?? "base") : undefined;
    return { target: t, workspaceId, lines, ...(r.writtenFrom ? { basis: r.writtenFrom } : {}), name, href, ...(slot ? { slot } : {}), context: toPlain(r.doc), resume: r };
  }
  if (t.kind === "letter") {
    const l = await getInWorkspace(ctx, workspaceId, t.id);
    const p = l && (await getInWorkspace(ctx, workspaceId, l.pursuitId));
    if (!l || !p || p.sent || (await letterOf(ctx, p._id))?._id !== l._id) return null;
    const lines = l.paragraphs.map((x) => ({ text: x.text, factIds: x.factIds, at: l.at, ...(l.cites ? { cites: l.cites } : {}) }));
    return { target: t, workspaceId, lines, name: `Cover letter for ${p.title}, ${p.company}`, href: pursuitHref({ id: p._id, postingId: p.postingId }), context: letterText(l), letter: l, pursuit: p };
  }
  const p = await getInWorkspace(ctx, workspaceId, t.id);
  if (!p || p.sent) return null;
  const answers = p.answers ?? [];
  const lines = answers.map((a) => ({ text: a.answer, factIds: a.factIds, at: a.at, ...(a.cites ? { cites: a.cites } : {}) }));
  return { target: t, workspaceId, lines, name: `Answers for ${p.title}, ${p.company}`, href: pursuitHref({ id: p._id, postingId: p.postingId }), context: answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n"), pursuit: p };
}

// The facts that count now, by id, and the words of any cited fact that doesn't (rejected, merged away, or its source
// rejected), for lines citing them.
async function factsFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, docs: (Loaded | null)[]) {
  const facts = new Map((await counted(ctx, workspaceId, "fact")).map((f) => [String(f._id), f]));
  const gone = new Map<string, string>();
  for (const id of new Set(docs.flatMap((d) => d?.lines.flatMap((l) => l.factIds) ?? []))) {
    if (facts.has(id)) continue;
    const norm = ctx.db.normalizeId("items", id);
    const f = norm ? await ctx.db.get(norm) : null;
    if (f?.workspaceId === workspaceId && f.kind === "fact") gone.set(id, f.data.text);
  }
  return { facts, gone };
}

const updateOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">, t: Target) =>
  ctx.db.query("lineUpdates").withIndex("by_target", (q) => q.eq("workspaceId", workspaceId).eq("target", keyOf(t))).unique();

const writing = (j: Doc<"jobs">) => j.kind === "lineUpdate" && (j.status === "queued" || j.status === "running" || j.status === "paused");
async function runsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return (await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100)).filter((j) => j.kind === "lineUpdate");
}
const runFor = (runs: Doc<"jobs">[], t: Target) => runs.find((j) => j.args?.target && keyOf(j.args.target as Target) === keyOf(t));

// A document's lines resting on changed facts, the update waiting to be applied, and its last run. Null when the
// document can't take one (gone, not the one in use, or sent).
export const forDocument = query({
  args: { target },
  handler: async (ctx, { target: t }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const doc = await load(ctx, workspaceId, t);
    if (!doc) return null;
    const { facts, gone } = await factsFor(ctx, workspaceId, [doc]);
    const update = await updateOf(ctx, workspaceId, t);
    const run = runFor(await runsOf(ctx, workspaceId), t);
    return {
      stale: staleLines(doc.lines, facts, gone, doc.basis),
      update: update ? { at: update.at, lines: update.lines.map(({ before, theirs, change, text, use }) => ({ before, theirs: theirs ?? null, change, text, use })) } : null,
      run: run ? { status: run.status, error: run.error ?? null } : null,
    };
  },
});

// Every document in use resting on a changed fact, for Today: the base resume and each approved direction's, the
// tailored resume, cover letter and answers of each pursuit still being prepared. Each with how many lines, and
// whether an update waits or is being written.
export const documents = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const targets: Target[] = [];
    const directions = await itemsOf(ctx, workspaceId, "direction", "approved");
    for (const directionId of [undefined, ...directions.map((d) => d._id)]) {
      const r = await currentOf(ctx, workspaceId, directionId);
      if (r?.doc) targets.push({ kind: "resume", id: r._id });
    }
    const pursuits = await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    for (const p of pursuits.filter((x) => x.status !== "closed" && !x.sent)) {
      // With no open role it uses its direction's resume, already among the resumes above.
      const r = p.postingId ? (p.resumeId ?? (await ctx.db.query("resumes").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", p.postingId)).order("desc").first())?._id) : undefined;
      if (r) targets.push({ kind: "resume", id: r });
      const l = await letterOf(ctx, p._id);
      if (l) targets.push({ kind: "letter", id: l._id });
      if (p.answers?.length) targets.push({ kind: "answers", id: p._id });
    }
    const docs = await Promise.all(targets.map((t) => load(ctx, workspaceId, t)));
    const { facts, gone } = await factsFor(ctx, workspaceId, docs);
    const runs = await runsOf(ctx, workspaceId);
    const out = [];
    for (const d of docs) {
      if (!d) continue;
      const stale = staleLines(d.lines, facts, gone, d.basis);
      if (!stale.length) continue;
      const run = runFor(runs, d.target);
      out.push({
        target: d.target,
        slot: d.slot ?? null,
        name: d.name,
        href: d.href,
        lines: stale.length,
        rejected: stale.some((s) => s.change === "rejected"),
        waiting: !!(await updateOf(ctx, workspaceId, d.target)),
        writing: !!run && writing(run),
      });
    }
    return out;
  },
});

// Update lines: one paid call rewrites the lines resting on changed facts (runLineUpdate), to apply or discard. One at a
// time per document.
export const update = mutation({
  args: { target },
  handler: async (ctx, { target: t }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const doc = await load(ctx, workspaceId, t);
    if (!doc) throw new ConvexError(t.kind === "resume" ? "Only the resume in use can be updated, before it's sent." : "It was sent as it is.");
    const { facts, gone } = await factsFor(ctx, workspaceId, [doc]);
    if (!staleLines(doc.lines, facts, gone, doc.basis).length) throw new ConvexError("No line rests on a changed fact.");
    if ((await runsOf(ctx, workspaceId)).some((j) => writing(j) && keyOf(j.args.target as Target) === keyOf(t))) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "lineUpdate", args: { target: t }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// What a run reads: the document as it stands (for its voice) and its lines resting on changed facts, with the marks of
// the facts they cite that count now and the ids of those that don't (gone).
export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), target },
  handler: async (ctx, { workspaceId, target: t }) => {
    const doc = await load(ctx, workspaceId, t);
    if (!doc) return null;
    const { facts, gone } = await factsFor(ctx, workspaceId, [doc]);
    const stale = staleLines(doc.lines, facts, gone, doc.basis);
    const ids = new Set(stale.flatMap((s) => s.factIds));
    const marks = [...facts.values()].filter((f) => ids.has(String(f._id))).map((f) => ({ id: String(f._id), mark: markOf(f.data.text) }));
    return { name: doc.name, context: doc.context, stale, marks, gone: [...ids].filter((id) => !facts.has(id)) };
  },
});

const PROMPT = (kind: Target["kind"]) => `You update lines of someone's ${kind === "resume" ? "resume" : kind === "letter" ? "cover letter" : "answers to application questions"} after approved facts they rest on changed in their career record. Each line comes with its facts: what each says now and, when known, what it said when the line was written; or that it was rejected and is no longer part of their record.

Rewrite each line so it says only what its remaining facts say now, changing as few words as you can and keeping its voice and length. Take out anything that rested on a rejected fact or on words a fact no longer has; never add a claim, number, tool or title the facts don't have. A line that still reads true gets its words back unchanged. ${kind === "answers" ? "An answer always keeps an answer: rewrite it without what no longer stands rather than leaving it empty." : "When nothing is left for the line to say, reply with an empty text: the line goes."}

${kind === "resume" ? FACT_STYLE : OUTREACH_STYLE}
${PLAIN_LANGUAGE}

Reply with JSON only: {"lines": [{"index": 0, "text": "...", "factIds": ["..."]}]}, one for each line by its index, citing only that line's facts that still stand.`;
export const LINE_UPDATE_SCHEMA = replyOf("line_update", "lines", { index: number, text: string, factIds: strings });

// One call through the metered chat path, with the model for writing resumes (a resume) or cover letters (a letter,
// answers). Every line comes back resting only on its own facts that still count; a resume line left resting on none
// goes. Saves the update to apply or discard (save).
export async function runLineUpdate(ctx: ActionCtx, job: Doc<"jobs">) {
  const { target: t } = job.args as { target: Target };
  const input = await ctx.runQuery(internal.factChanges.inputs, { workspaceId: job.workspaceId, target: t });
  if (!input) throw new Error("It was sent or has a new version since.");
  if (!input.stale.length) throw new Error("No line rests on a changed fact.");
  const choice = await modelFor(ctx, job.workspaceId, t.kind === "resume" ? "resume" : "letter");
  const lines = input.stale.map((s, index) => ({
    index,
    text: s.text,
    facts: s.facts.map((f) => (f.now === null ? { id: f.id, rejected: true, said: f.was } : { id: f.id, now: f.now, ...(f.was !== null ? { was: f.was } : {}) })),
  }));
  const reply = await chatJson<{ lines?: unknown }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "line update",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: LINE_UPDATE_SCHEMA,
    messages: [
      { role: "system", content: PROMPT(t.kind) },
      { role: "user", content: `${input.name} as it stands:\n${input.context}\n\nThe lines to update (cite facts by id):\n${JSON.stringify(lines)}` },
    ],
  });
  const out = reply.out;
  const byIndex = new Map<number, { text: string; factIds: string[] }>();
  for (const x of Array.isArray(out.lines) ? (out.lines as Record<string, unknown>[]) : []) {
    if (typeof x?.index !== "number" || typeof x.text !== "string") continue;
    byIndex.set(x.index, { text: x.text.trim(), factIds: (Array.isArray(x.factIds) ? x.factIds : []).map(String) });
  }
  if (!byIndex.size) throw new Error("The reply had no lines. Try again.");
  const updated = input.stale.map((s, i) => {
    const standing = s.facts.filter((f) => f.now !== null).map((f) => f.id);
    const got = byIndex.get(i);
    const cited = got ? got.factIds.filter((id) => standing.includes(id)) : [];
    const factIds = cited.length ? cited : standing;
    let text = got ? got.text : s.text;
    if (t.kind === "resume" && !factIds.length) text = "";
    if (t.kind === "answers" && !text) text = s.text;
    return { before: s.text, cited: s.factIds, ...(s.theirs !== null ? { theirs: s.theirs } : {}), change: s.change, text, factIds: text ? factIds : [], use: s.theirs === null };
  });
  await ctx.runMutation(internal.factChanges.save, { runId: job._id, workspaceId: job.workspaceId, target: t, lines: updated, marks: input.marks, gone: input.gone });
  return { lines: updated.length, costUsd: reply.costUsd, model: reply.model };
}

const updatedLine = v.object({
  before: v.string(),
  cited: v.array(v.string()),
  theirs: v.optional(v.string()),
  change: v.union(v.literal("edited"), v.literal("rejected")),
  text: v.string(),
  factIds: v.array(v.string()),
  use: v.boolean(),
});

// The update, replacing any earlier one waiting for the same document. A retried run saves nothing twice.
export const save = internalMutation({
  args: { runId: v.id("jobs"), workspaceId: v.id("workspaces"), target, lines: v.array(updatedLine), marks: factMarks, gone: v.array(v.string()) },
  handler: async (ctx, { runId, workspaceId, target: t, lines, marks, gone }) => {
    const old = await updateOf(ctx, workspaceId, t);
    if (old?.runId === runId) return;
    if (old) await ctx.db.delete(old._id);
    await ctx.db.insert("lineUpdates", { workspaceId, target: keyOf(t), runId, lines, marks, gone, at: Date.now() });
  },
});

async function waitingFor(ctx: MutationCtx, t: Target) {
  const { workspaceId } = await requireWorkspace(ctx);
  const u = await updateOf(ctx, workspaceId, t);
  if (!u) throw new ConvexError("Nothing waits to be applied.");
  return { workspaceId, u };
}

// Use the new line for one in their own words (true), or keep their words (false).
export const setUse = mutation({
  args: { target, index: v.number(), use: v.boolean() },
  handler: async (ctx, { target: t, index, use }) => {
    const { u } = await waitingFor(ctx, t);
    if (!u.lines[index]) throw new Error("Not found.");
    await ctx.db.patch(u._id, { lines: u.lines.map((l, i) => (i === index ? { ...l, use } : l)) });
  },
});

// Discard the update: the lines stay as they are, still offered an update.
export const discard = mutation({
  args: { target },
  handler: async (ctx, { target: t }) => {
    const { u } = await waitingFor(ctx, t);
    await ctx.db.delete(u._id);
  },
});

type Updated = Doc<"lineUpdates">["lines"][number];
const sameLine = (l: { text: string; factIds: string[] }, u: Updated) => l.text === u.before && l.factIds.join() === u.cited.join();

// What a line becomes: the new words, or (a line in their own words they keep) exactly as it is, still resting on the
// same facts so it stays flagged until they edit their words; null when it goes.
function nextOf(l: { text: string; factIds: string[] }, u: Updated) {
  if (u.theirs !== undefined && !u.use) return { text: l.text, factIds: l.factIds };
  return u.text ? { text: u.text, factIds: u.factIds } : null;
}

// Apply the update: only the lines it rewrote change (a line in their own words only when they chose the new one),
// each document in its own way: a resume in place (its pins, hides and own words follow the line), a cover letter as a
// new version, answers in place. The facts of the lines it changed are then held as they read when the new lines were
// written, so those lines aren't offered again until a fact changes again. A line in their own words they kept holds
// its facts as it did before, so it stays flagged until they edit their words (resume.setWords marks them afresh).
// Refused, changing nothing, when a fact the new lines were written from was edited or stopped counting since, or one
// they cite that didn't count then counts again.
// Google Drive syncs soon after.
export const apply = mutation({
  args: { target },
  handler: async (ctx, { target: t }) => {
    const { workspaceId, u } = await waitingFor(ctx, t);
    const doc = await load(ctx, workspaceId, t);
    if (!doc) throw new ConvexError("It was sent or has a new version since. Update its lines again.");
    const { facts, gone } = await factsFor(ctx, workspaceId, [doc]);
    const changed = u.marks.some((m) => !facts.has(m.id) || markOf(facts.get(m.id)!.data.text) !== m.mark) || (u.gone ?? []).some((id) => facts.has(id));
    if (changed) throw new ConvexError("A fact changed since these lines were written. Update them again.");
    const counts = (id: string) => facts.has(id);
    const updated = new Map(u.marks.map((m) => [m.id, m.mark]));
    // The marks a line holds: the update's for its facts (fresh), else what the line held before.
    const held = (line: Line, factIds: string[], fresh = true): FactMarks => {
      const before = new Map([...(doc.basis?.facts ?? []).map((f) => [String(f.id), f.mark] as const), ...(line.cites ?? []).map((c) => [c.id, c.mark] as const)]);
      return factIds.flatMap((id) => {
        const mark = (fresh ? updated.get(id) : undefined) ?? before.get(id) ?? (facts.has(id) ? markOf(textAt(facts.get(id)!.data, line.at)) : undefined);
        return mark ? [{ id, mark }] : [];
      });
    };
    const find = (l: { text: string; factIds: string[] }) => u.lines.find((x) => sameLine(l, x));

    if (t.kind === "resume") {
      const r = doc.resume!;
      const rDoc = r.doc!;
      // CareerBot's words that changed (null: the line went), lines whose own words give way to the new line, and lines
      // in their own words they kept, with the marks they held before (kept on their words, so the flag stays).
      const renamed = new Map<string, string | null>();
      const theirsGo = new Set<string>();
      const keptTheirs = new Map<string, FactMarks>();
      const each = (bullets: Bullet[]) =>
        bullets.flatMap((b) => {
          const x = find(b);
          if (!x) return [b];
          const next = nextOf(b, x);
          if (next?.text !== b.text) renamed.set(b.text, next?.text ?? null);
          if (x.theirs !== undefined && x.use) theirsGo.add(b.text);
          if (x.theirs !== undefined && !x.use) keptTheirs.set(b.text, held(doc.lines.find((l) => l.text === b.text) ?? { ...b, at: r.writtenAt ?? r.at }, b.factIds, false));
          return next ? [{ ...b, ...next }] : [];
        });
      const next: ResumeDoc = {
        ...rDoc,
        experience: rDoc.experience.map((e) => ({ ...e, bullets: each(e.bullets) })),
        ...(rDoc.projects ? { projects: rDoc.projects.map((p) => ({ ...p, bullets: each(p.bullets) })).filter((p) => p.bullets.length) } : {}),
      };
      const layout = r.layout && {
        ...r.layout,
        ...(r.layout.bullets ? { bullets: r.layout.bullets.flatMap((b) => (!renamed.has(b.text) ? [b] : renamed.get(b.text) ? [{ ...b, text: renamed.get(b.text)! }] : [])) } : {}),
        ...(r.layout.words
          ? { words: r.layout.words.filter((w) => !theirsGo.has(w.text) && !renamed.has(w.text)).map((w) => (keptTheirs.has(w.text) && !w.marks ? { ...w, marks: keptTheirs.get(w.text)! } : w)) }
          : {}),
      };
      // A base or direction resume holds its facts in what it was written from: the updated facts as they read now (one
      // cited but not listed there is added), and a fact no longer counting leaves it. Any other resume keeps marks.
      let hold: { writtenFrom: Basis } | { cites: FactMarks };
      if (r.writtenFrom) {
        const listed = new Set(r.writtenFrom.facts.map((f) => String(f.id)));
        const stays = r.writtenFrom.facts.flatMap((f) => {
          const id = String(f.id);
          if (gone.has(id)) return [];
          return [updated.has(id) ? { id: f.id, mark: updated.get(id)! } : f];
        });
        const added = [...updated].filter(([id]) => !listed.has(id)).map(([id, mark]) => ({ id: facts.get(id)!._id, mark }));
        hold = { writtenFrom: { ...r.writtenFrom, facts: [...stays, ...added] } };
      } else hold = { cites: held({ text: "", factIds: [], at: r.writtenAt ?? r.at, ...(r.cites ? { cites: r.cites } : {}) }, [...new Set(bulletsOf(next).flatMap((b) => b.factIds))]) };
      await ctx.db.patch(r._id, { doc: next, ...(layout ? { layout } : {}), ...hold });
      await syncSoon(ctx, workspaceId);
    } else if (t.kind === "letter") {
      const l = doc.letter!;
      const kept = l.paragraphs.flatMap((x) => {
        const upd = find(x);
        const next = upd ? nextOf(x, upd) : x;
        return next ? [{ next, cites: held({ ...x, at: l.at, ...(l.cites ? { cites: l.cites } : {}) }, next.factIds) }] : [];
      });
      if (!kept.length) throw new ConvexError("Nothing would be left of the letter. Write it again instead.");
      await ctx.db.insert("letters", {
        workspaceId,
        pursuitId: l.pursuitId,
        paragraphs: kept.map((k) => k.next),
        ...(l.edited ? { edited: true } : {}),
        ...(l.resumeId ? { resumeId: l.resumeId } : {}),
        ...(l.model ? { model: l.model } : {}),
        cites: [...new Map(kept.flatMap((k) => k.cites).map((c) => [c.id, c])).values()],
        at: Date.now(),
      });
      await change(ctx, doc.pursuit!, {}, { event: "letter", text: "updated" });
    } else {
      const p = doc.pursuit!;
      const questions: string[] = [];
      const answers = (p.answers ?? []).map((a) => {
        const x = { text: a.answer, factIds: a.factIds };
        const upd = find(x);
        if (!upd) return a;
        const next = nextOf(x, upd) ?? { text: a.answer, factIds: a.factIds.filter(counts) };
        if (next.text !== a.answer) questions.push(a.question);
        return { ...a, answer: next.text, factIds: next.factIds, cites: held({ ...x, at: a.at, ...(a.cites ? { cites: a.cites } : {}) }, next.factIds) };
      });
      if (questions.length) await change(ctx, p, { answers }, { event: "answer", text: questions.join("; ") });
      else {
        await ctx.db.patch(p._id, { answers });
        await syncSoon(ctx, workspaceId);
      }
    }
    await ctx.db.delete(u._id);
  },
});
