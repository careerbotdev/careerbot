import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { mutation } from "./functions";
import { type ChatReply, chatJson } from "./metering";
import { boolean, listOf, type ReplySchema, strictObject, string, strings } from "./replyJson";
import { modelFor } from "./aiSettings";
import { type ModelChoice, reasoningLevel } from "./aiTasks";
import { checkOverlaps } from "./conflicts";
import { afterReview } from "./insights";
import { activeLimits, isKind, isSkill, type ItemOf, type ItemStatus, itemsOf, pickRole } from "./itemShapes";
import { ROLE_CHECKED } from "./limitBuckets";
import { backgroundNarratives, counted, quotedIn, sourceCheck } from "./recordContext";
import { rejectProject, restoreProject } from "./sources";
import { tallyApproval } from "./tallies";
import { FACT_STYLE, PLAIN_LANGUAGE } from "./writingGuides";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Reads one narrative against everything already known and proposes record entries and career facts.
// Quality is judged by reading real output, not by tests; tests cover the plumbing.

const SYSTEM = `You are a great career coach and editor helping someone rebuild their career story from their own rough account.

You receive one narrative to read (about an employer, a project, or quick notes), their confirmed record, facts already proposed from other narratives and awaiting review, their other narratives as background, and the goals they've confirmed. The background narratives are for understanding who they are and how their career played out, so you can see what matters in this narrative and name things consistently; never take facts from them. Every fact, role and piece of context you produce comes from the narrative you're reading, with quotes from it; a detail known only from another narrative stays out. The goals tell you which parts of their experience matter most to them, so capture that work fully, with its numbers and scope. Never slant, stretch or invent anything toward the goals; a fact is only what the account supports.

Produce three things:

1. roles: the structured record for each employer/role this narrative covers. Fields: employer, title, location, start, end (YYYY or YYYY-MM when you can tell; dates mentioned in passing count), team, projects (list), tools (list), skills (list). Use a stable "key" per role such as "acme-head-of-cs". Reuse an existing role key when it is the same role. "title" is the official title exactly as the employer gave it, nothing else: no parentheses, no second title. If the account doesn't say what the role was officially called, leave "title" empty rather than guessing; they'll be asked. Other names for the same job go in "alternateTitles" (a list): what they call it themselves, and what the market calls the work when the official title undersells it. Always give at least one, the plainest honest name for the job first: until they give the official title, resumes use the first one. A promotion or a real change of job at the same employer is a separate role with its own key, title and dates, with the same "employer" spelled identically, and "change" on the later role: "promotion" only when the account says it was one, otherwise "transition" (the first role at an employer has no "change").

An employer is an organization that employed them or hired them on contract, never an activity. Time away from paid work (caring for family, a move, study, health, a layoff, travel) is a career break: a role with "break": true, "start" and "end", no employer and no title, a short plain "reason" in their words ("Finishing my degree"), and key "break-" plus its start (e.g. "break-2019-09"). Side projects, open-source work or volunteering they did during it don't make it a job: name them in the break's "projects", and their facts go on the break. Never invent an employer named after what they did ("Open Source", "Side projects", "Caregiving", "Freelance").

2. facts: clear statements of what they did in a role: what they owned, what they did, how big it was, and what came of it. A fact is your understanding of their account, not a quote.
${FACT_STYLE}

${PLAIN_LANGUAGE} Combine things said minutes apart into one line. Ownership follows the account, logically and honestly, in both directions:
- What they did and drove is theirs, stated plainly and at full strength. Tie results to their work directly ("drove the sales work behind growth from $2M to $9M in revenue"), never hedged with "helped", "supported", "contributed to", "as the company grew" or "was part of". When they were central to a company result through their own work, say so.
- What a product, feature, team or company did is not theirs. "The app had offline sync" means the app had it; their part is what they did with it (sold it, demoed it, used it to win deals). Only say they built something when the account says they built it. Capture work they did outside their title too (selling while in an implementation role, for example). Be generous and complete: most people undersell themselves. Keep the scope that places their part in a bigger effort ("one of about 30 regional leads", "one of five engineers on the migration"): it's what lets the rest be said at full strength. Never invent a customer, number, result or skill with nothing behind it. Each fact has "roleKey", "text", and "quotes" (1-3 short verbatim snippets from the narrative it rests on). Don't repeat facts already in the record.

3. context: things that matter but aren't facts about what they did (a customer's size, the state the team was in, why they left). Write each as a plain note about the situation or about them in the second person ("You left in January 2016 to move to Texas"), never "the narrator" or "the account". Each has "roleKey", "text", "quotes".

Reply with JSON only: {"roles":[...],"facts":[...],"context":[...]}. Each role also carries "quotes".`;

export type Extracted = {
  roles?: { key: string; quotes?: string[]; [k: string]: unknown }[];
  facts?: { roleKey?: string; text: string; quotes?: string[] }[];
  context?: { roleKey?: string; text: string; quotes?: string[] }[];
};

// The reply's shape (structured output, metering.chat), as saveProposals reads it: a role's fields as pickRole takes
// them, a career break's too.
const quoted = { roleKey: string, text: string, quotes: strings };
const ROLE = { key: string, employer: string, title: string, alternateTitles: strings, change: string, location: string, start: string, end: string, team: strings, projects: strings, tools: strings, skills: strings, break: boolean, reason: string, quotes: strings };
export const EXTRACT_SCHEMA: ReplySchema = { name: "extract", schema: strictObject({ roles: listOf(ROLE), facts: listOf(quoted), context: listOf(quoted) }) };

// Read a narrative for the first time, or a newer version of one already read (only what changed). Reading it again
// against the record as it is now is sources.readAgain.
export const start = mutation({
  args: { narrativeId: v.id("narratives") },
  handler: async (ctx, { narrativeId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await getInWorkspace(ctx, workspaceId, narrativeId);
    if (!n) throw new Error("Narrative not found.");
    if (n.kind === "goals") throw new Error("Use “Read my goals” for the goals narrative.");
    if (n.rejectedAt !== undefined) throw new Error("You rejected this narrative. Restore it in Record to read it.");
    // A plain first read of the same version twice would only duplicate proposals; reading again is explicit.
    const done = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    if (done.some((j) => j.kind === "extract" && j.args.narrativeId === narrativeId && j.args.version === n.version && j.status !== "failed"))
      throw new Error("This version has already been read. Use Read again in Record to find what was missed.");
    // A newer version of a narrative that was read before: read only what changed.
    const readVersions = done.filter((j) => j.kind === "extract" && j.args.narrativeId === narrativeId && j.status === "done").map((j) => j.args.version as number);
    const fromVersion = readVersions.length ? Math.max(...readVersions) : undefined;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "extract", args: { narrativeId, version: n.version, again: false, fromVersion }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// `ignoreRejected`: a Read again that sets aside this narrative's own earlier rejections for this one run.
export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), narrativeId: v.id("narratives"), ignoreRejected: v.optional(v.boolean()) },
  handler: async (ctx, { workspaceId, narrativeId, ignoreRejected }) => {
    const narrative = await getInWorkspace(ctx, workspaceId, narrativeId);
    const rejected = (await itemsOf(ctx, workspaceId, "fact", "rejected"))
      .filter((i) => !(ignoreRejected && i.sources.some((s) => s.narrativeId === narrativeId)))
      .map((i) => ({ text: i.data.text, because: i.data.rejectedBecause ?? "no reason given" }));
    const slim = (i: Doc<"items">) => ({ kind: i.kind, roleKey: i.roleKey, data: i.kind === "fact" ? { text: i.data.text } : i.data });
    // The record is what they approved (and still counts). Proposals awaiting review are shown only so they aren't repeated.
    const stands = await sourceCheck(ctx, workspaceId);
    const record = [...(await counted(ctx, workspaceId, "role", stands)), ...(await counted(ctx, workspaceId, "fact", stands))].map(slim);
    const pending = [...(await itemsOf(ctx, workspaceId, "role", "proposed")), ...(await itemsOf(ctx, workspaceId, "fact", "proposed"))].map(slim);
    // Their other narratives, whole, as background: their own retelling, for understanding, never a source of facts.
    const background = await backgroundNarratives(ctx, workspaceId, narrativeId);
    // Only goals they approved guide extraction; unreviewed or rejected ones (and the raw goals narrative) never do.
    const goals = {
      directions: (await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => ({ name: d.data.name, includes: d.data.includes, summary: d.data.summary })),
      limits: (await activeLimits(ctx, workspaceId)).map((l) => ({ label: l.data.label, value: l.data.value })),
    };
    return { narrative, rejected, goals, record, pending, background };
  },
});

// A fact already in the record in the same words, in the same role (or project), isn't proposed twice: this narrative is
// added to its sources instead (a fact set aside with a rejected source comes back for review), and one they rejected
// isn't proposed again unless this run ignores this narrative's rejections. The same words at two employers are two
// facts. A role this narrative already proposed isn't proposed again either.
export const saveProposals = internalMutation({
  args: { workspaceId: v.id("workspaces"), runId: v.id("jobs"), narrativeId: v.id("narratives"), version: v.number(), extracted: v.any(), ignoreRejected: v.optional(v.boolean()) },
  handler: async (ctx, { workspaceId, runId, narrativeId, version, extracted, ignoreRejected }) => {
    // A retried run (after an interruption) that already saved its results saves nothing twice.
    if (await ctx.db.query("items").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return { alreadySaved: true } as never;
    const read = extracted as Extracted;
    // A career break is keyed by its start, like one they add themselves (breaks.ts); its facts and context go with it.
    const rekey = new Map<string, string>();
    for (const r of read.roles ?? []) {
      const start = typeof r?.start === "string" ? r.start.trim() : "";
      if (r?.key && r.break === true && /^\d{4}(-\d{2})?$/.test(start)) rekey.set(r.key, `break-${start}`);
    }
    const keyFor = (k?: string) => (k && rekey.get(k)) || k;
    const e: Extracted = {
      roles: read.roles?.map((r) => r && { ...r, key: keyFor(r.key)! }),
      facts: read.facts?.map((f) => f && { ...f, roleKey: keyFor(f.roleKey) }),
      context: read.context?.map((c) => c && { ...c, roleKey: keyFor(c.roleKey) }),
    };
    const at = Date.now();
    const src = (quotes?: string[]) => [{ narrativeId, version, quotes: (quotes ?? []).filter((q) => typeof q === "string") }];
    const fromHere = (i: Doc<"items">) => i.sources.some((s) => s.narrativeId === narrativeId);
    // Rejections this run looks past: this narrative's own, when they asked to include what they rejected.
    const ignored = (i: Doc<"items">) => !!ignoreRejected && i.status === "rejected" && fromHere(i);
    const all = (kind: "role" | "fact") => ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind)).collect();
    const roles = (await all("role")).filter((r) => fromHere(r) && !ignored(r));
    for (const r of e.roles ?? []) {
      if (!r?.key || roles.some((x) => x.roleKey === r.key)) continue;
      await ctx.db.insert("items", { workspaceId, kind: "role", status: "proposed", data: pickRole(r), roleKey: r.key, sources: src(r.quotes), runId, at });
    }
    // The same words only make the same fact within one role or project.
    const keyOf = (f: { roleKey?: string; projectKey?: string }, t: string) => JSON.stringify([f.roleKey ?? "", f.projectKey ?? "", t.trim().toLowerCase()]);
    const known = new Map<string, ItemOf<"fact">>();
    // A live fact in the same words wins over a rejected one.
    const facts = (await all("fact")).filter(isKind("fact")).filter((f) => !ignored(f));
    for (const f of [...facts.filter((f) => f.status === "rejected"), ...facts.filter((f) => f.status !== "rejected")]) known.set(keyOf(f, f.data.text), f);
    // Provenance, not truth: a fact whose quotes can't be found in the narrative it was read from is flagged for review.
    const narrative = await ctx.db.get(narrativeId);
    const found = (quotes?: string[]) => quotedIn(narrative?.body ?? "", quotes);
    for (const f of e.facts ?? []) {
      if (!f?.text) continue;
      const twin = known.get(keyOf(f, f.text));
      if (twin) {
        if ((twin.status === "proposed" || twin.status === "approved" || twin.status === "setAside") && !fromHere(twin))
          await ctx.db.patch(twin._id, { sources: [...twin.sources, ...src(f.quotes)], ...(twin.status === "setAside" ? { status: "proposed" as const } : {}) });
        continue;
      }
      const data = found(f.quotes) ? { text: f.text } : { text: f.text, evidenceMissing: true };
      const id = await ctx.db.insert("items", { workspaceId, kind: "fact", status: "proposed", data, roleKey: f.roleKey, sources: src(f.quotes), runId, at });
      known.set(keyOf(f, f.text), (await ctx.db.get(id)) as ItemOf<"fact">);
    }
    // Context isn't reviewed; it's kept to sharpen later facts.
    for (const c of e.context ?? []) {
      if (!c?.text) continue;
      await ctx.db.insert("items", { workspaceId, kind: "context", status: "approved", data: { text: c.text }, roleKey: c.roleKey, sources: src(c.quotes), runId, at });
    }
    return { roles: e.roles?.length ?? 0, facts: e.facts?.length ?? 0, context: e.context?.length ?? 0 };
  },
});

// Reads one narrative without saving anything. `choice` overrides the workspace's model (comparisons use this).
// `again`: a Read again, optionally pointed at something and looking past this narrative's own rejections.
export async function draftExtract(
  ctx: ActionCtx,
  opts: { workspaceId: Id<"workspaces">; narrativeId: Id<"narratives">; fresh?: boolean; again?: { lookFor?: string; ignoreRejected?: boolean }; choice?: ModelChoice; purpose?: string },
) {
  const { workspaceId, narrativeId, fresh, again } = opts;
  const choice = opts.choice ?? (await modelFor(ctx, workspaceId, "extract"));
  const inputs = await ctx.runQuery(internal.extract.inputs, { workspaceId, narrativeId, ignoreRejected: again?.ignoreRejected });
  const { narrative, goals } = inputs;
  const record = fresh ? [] : inputs.record;
  const pending = fresh ? [] : inputs.pending;
  const background = fresh ? [] : inputs.background;
  if (!narrative) throw new Error("Narrative not found.");
  const reply = await chatJson<Extracted>(ctx, {
    workspaceId,
    purpose: opts.purpose ?? "extract",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: EXTRACT_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Their confirmed goals, for what matters to them:\n${goals.directions.length || goals.limits.length ? JSON.stringify(goals) : "(none confirmed yet)"}\n\nTheir confirmed record:\n${JSON.stringify(record)}\n\nAlready proposed from their narratives, awaiting their review (don't repeat these; they aren't confirmed, so don't treat them as true or build on their wording):\n${JSON.stringify(pending)}\n\nTheir other narratives, as background only (for understanding; take no facts from these):\n${JSON.stringify(background)}\n\nFacts they rejected, and why (don't propose these again, and learn from the reasons):\n${JSON.stringify(fresh ? [] : inputs.rejected)}\n\nNarrative (${narrative.kind}) "${narrative.title}":\n${narrative.body}${
          again
            ? `\n\nThis narrative has been read before. Look again for what the record is missing: work, results, numbers and roles that aren't captured yet. Return only new items; the record above stays as it is.${again.lookFor ? ` They asked you to look especially for: ${again.lookFor}` : ""}`
            : ""
        }`,
      },
    ],
  });
  const extracted = reply.out;
  return { narrative, reply, extracted };
}

// Job handler, registered in jobs.ts.
export async function runExtract(ctx: ActionCtx, job: Doc<"jobs">) {
  const { narrativeId, again, lookFor, ignoreRejected, fromVersion } = job.args as { narrativeId: Id<"narratives">; again?: boolean; lookFor?: string; ignoreRejected?: boolean; fromVersion?: number };
  if (fromVersion !== undefined) return runRevision(ctx, job, narrativeId, fromVersion);
  const { narrative, reply, extracted } = await draftExtract(ctx, { workspaceId: job.workspaceId, narrativeId, again: again ? { lookFor, ignoreRejected } : undefined });
  const counts = await ctx.runMutation(internal.extract.saveProposals, {
    workspaceId: job.workspaceId,
    runId: job._id,
    narrativeId,
    version: narrative.version,
    extracted,
    ignoreRejected: again && ignoreRejected ? true : undefined,
  });
  return { ...counts, costUsd: reply.costUsd, model: reply.model };
}

// Operator-only: read a narrative without saving, to judge prompt changes on real data.
export const tryExtract = internalAction({
  args: { workspaceId: v.id("workspaces"), narrativeId: v.id("narratives"), fresh: v.optional(v.boolean()), model: v.optional(v.string()), reasoning: v.optional(reasoningLevel) },
  handler: async (ctx, { workspaceId, narrativeId, fresh, model, reasoning }): Promise<{ extracted: Extracted; costUsd: number }> => {
    const { extracted, reply } = await draftExtract(ctx, { workspaceId, narrativeId, fresh, choice: model ? { model, reasoning } : undefined });
    return { extracted, costUsd: reply.costUsd };
  },
});

// Plain review view: roles, facts, context and projects, proposed, approved or rejected, in the order they appeared.
// `counts`: whether it rests on a source they haven't rejected (recordContext.sourceCheck).
export const items = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await Promise.all(
      (["role", "fact", "context", "project"] as const).flatMap((kind) =>
        (["proposed", "approved", "rejected"] as const).map((status) =>
          ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("status", status)).collect(),
        ),
      ),
    );
    const stands = await sourceCheck(ctx, workspaceId);
    // Stable order: when each item first appeared, regardless of review status, so approving never moves it.
    // Destructured rather than picked so each row keeps its kind tied to its data.
    return rows
      .flat()
      .sort((a, b) => a._creationTime - b._creationTime)
      .map((doc) => {
        const { _id, _creationTime, workspaceId: _w, runId, at, ...row } = doc;
        return { id: _id, ...row, counts: stands(doc) };
      });
  },
});

// A fact is one item for its whole life. Its wording changes are kept in data.history, newest last:
// { text, how: "read" | "edit" | "rewrite", note?, at }. A rewrite waits in data.suggestion until accepted or dismissed.
// A merge adds the other fact's history, then a "merged" entry with the kept wording (duplicates.ts).
type Version = { text: string; how: "read" | "edit" | "rewrite" | "dismissed" | "rejected" | "merged" | "unapproved"; note?: string; reason?: string; was?: ItemStatus; at: number };
const withHistory = (data: ItemOf<"fact" | "insight">["data"], text: string, how: Version["how"], extra: Pick<Version, "note" | "was"> = {}) => {
  const history: Version[] = data.history?.length ? data.history : [{ text: data.text, how: "read", at: 0 }];
  return { ...data, text, history: [...history, { text, how, ...extra, at: Date.now() }], suggestion: null };
};

export const review = mutation({
  args: { id: v.id("items"), status: v.union(v.literal("approved"), v.literal("rejected"), v.literal("skipped"), v.literal("proposed")), note: v.optional(v.string()) },
  handler: async (ctx, { id, status, note }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item) throw new Error("Not found.");
    // A project is a source: rejecting it sets aside what it proposed, and reopening it brings that back (sources.ts).
    if (item.kind === "project" && status === "rejected") return rejectProject(ctx, item, note?.trim() || undefined);
    if (item.kind === "project" && item.status === "rejected" && status === "proposed") return restoreProject(ctx, item);
    // Undo approval: back to review, logged on the item (and in a fact's or insight's history). What approving fed stops
    // counting at once: every reader of the record reads approved items only.
    if (item.status === "approved" && status === "proposed") {
      const at = Date.now();
      const undone = [...(item.undone ?? []), { at }];
      if (item.kind === "fact" || item.kind === "insight") {
        const history: Version[] = item.data.history?.length ? item.data.history : [{ text: item.data.text, how: "read", at: 0 }];
        await ctx.db.patch(id, { status, undone, data: { ...item.data, history: [...history, { text: item.data.text, how: "unapproved", at }] } });
      } else await ctx.db.patch(id, { status, undone });
      await tallyApproval(ctx, item, status);
      if (item.kind === "limit" && ROLE_CHECKED.includes(item.data.kind)) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
      if (item.kind === "role") await checkOverlaps(ctx, workspaceId);
      return;
    }
    // A reason for rejecting is optional; it stays with the item and later reads see it.
    const reason = status === "rejected" ? note?.trim() || undefined : undefined;
    // Rejections are logged in the fact's history, so reopening never loses why it was rejected.
    if (item.kind === "fact" || item.kind === "insight") {
      const history: Version[] = item.data.history?.length ? item.data.history : [{ text: item.data.text, how: "read", at: 0 }];
      const log: Version[] = status === "rejected" ? [{ text: item.data.text, how: "rejected", note: reason, at: Date.now() }] : [];
      await ctx.db.patch(id, { status, data: { ...item.data, history: [...history, ...log], rejectedBecause: reason ?? null } });
    } else if (isSkill(item) || item.kind === "role" || item.kind === "project" || item.kind === "direction" || item.kind === "limit")
      await ctx.db.patch(id, { status, data: { ...item.data, rejectedBecause: reason ?? null } } as Partial<Doc<"items">>);
    else await ctx.db.patch(id, { status });
    await tallyApproval(ctx, item, status);
    if (status === "approved" || status === "rejected") await afterReview(ctx, { ...item, status });
    if (item.kind === "limit" && ROLE_CHECKED.includes(item.data.kind) && (status === "approved" || item.status === "approved"))
      await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
    if (item.kind === "role") await checkOverlaps(ctx, workspaceId);
  },
});

// The person's own wording wins outright: an edit is approved as written.
export const edit = mutation({
  args: { id: v.id("items"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || !(item.kind === "fact" || item.kind === "insight") || !text.trim()) throw new Error("Not found.");
    await ctx.db.patch(id, { data: { ...withHistory(item.data, text.trim(), "edit", { was: item.status }), edited: true }, status: "approved" });
    await tallyApproval(ctx, item, "approved");
    await afterReview(ctx, { ...item, status: "approved" });
  },
});

// "Add context" and "Ask for a rewrite" both come back as a suggestion on the same fact.
export const rework = mutation({
  args: { id: v.id("items"), note: v.string() },
  handler: async (ctx, { id, note }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || item.kind !== "fact") throw new Error("Not found.");
    await ctx.db.patch(id, { data: { ...item.data, suggestion: { pending: true, note, at: Date.now() } } });
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "rework", args: { itemId: id, note }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  },
});

export const acceptSuggestion = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || !(item.kind === "fact" || item.kind === "insight")) throw new Error("Not found.");
    const sug = item.data.suggestion;
    if (!sug?.text) throw new Error("Not found.");
    await ctx.db.patch(id, { data: withHistory(item.data, sug.text, "rewrite", { note: sug.note, was: item.status }), status: "approved" });
    await tallyApproval(ctx, item, "approved");
    await afterReview(ctx, { ...item, status: "approved" });
  },
});

// Keep the current wording. `reason`: why, kept with the dismissed rewrite in the history.
export const dismissSuggestion = mutation({
  args: { id: v.id("items"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || !(item.kind === "fact" || item.kind === "insight")) throw new Error("Not found.");
    const sug = item.data.suggestion;
    // A dismissed rewrite stays in the fact's history (it doesn't change the current wording).
    const history: Version[] = item.data.history?.length ? item.data.history : [{ text: item.data.text, how: "read", at: 0 }];
    const entry: Version[] = sug?.text ? [{ text: sug.text, how: "dismissed", note: sug.note, reason: reason?.trim() || undefined, at: Date.now() }] : [];
    await ctx.db.patch(id, { data: { ...item.data, history: [...history, ...entry], suggestion: null } });
  },
});

// Undo the last change of wording: an edit goes back to the wording before it, a used rewrite or a dismissed one is
// waiting again as it was; an edit or a used rewrite also puts back the status it had.
export const revertWording = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || !(item.kind === "fact" || item.kind === "insight")) throw new Error("Not found.");
    const history: Version[] = item.data.history ?? [];
    const last = history[history.length - 1];
    if (!last || !(last.how === "edit" || last.how === "rewrite" || last.how === "dismissed")) throw new Error("Nothing to undo.");
    const rest = history.slice(0, -1);
    const suggestion = last.how === "edit" ? null : { text: last.text, note: last.note, at: last.at };
    // The wording before: the latest entry that was the fact's own (a dismissed rewrite never was).
    const before = rest.findLast((h) => h.how !== "dismissed")?.text ?? item.data.text;
    const text = last.how === "dismissed" ? item.data.text : before;
    const edited = last.how === "edit" ? rest.some((h) => h.how === "edit") || undefined : item.data.edited;
    // A history that was only the first reading goes back to none, as it was.
    const untouched = rest.length === 1 && rest[0].how === "read" && rest[0].at === 0;
    await ctx.db.patch(id, { status: last.how === "dismissed" ? item.status : (last.was ?? item.status), data: { ...item.data, text, history: untouched ? undefined : rest, suggestion, edited } });
  },
});

export const reworkInputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), itemId: v.id("items") },
  handler: async (ctx, { workspaceId, itemId }) => {
    const found = await getInWorkspace(ctx, workspaceId, itemId);
    const item = found?.kind === "fact" ? found : null;
    const narrative = item?.sources[0] && (await getInWorkspace(ctx, workspaceId, item.sources[0].narrativeId));
    const context = item?.roleKey
      ? (await itemsOf(ctx, workspaceId, "context", "approved"))
          .filter((c) => c.roleKey === item.roleKey)
          .map((c) => (c.data.factId === itemId ? `(about this fact) ${c.data.text}` : c.data.text))
      : [];
    return { item, narrative, context };
  },
});

export const saveRework = internalMutation({
  args: { workspaceId: v.id("workspaces"), itemId: v.id("items"), text: v.string(), quotes: v.array(v.string()), note: v.string(), keptAsContext: v.array(v.string()) },
  handler: async (ctx, { workspaceId, itemId, text, quotes, note, keptAsContext }) => {
    const item = await getInWorkspace(ctx, workspaceId, itemId);
    if (!item || item.kind !== "fact") return;
    // What they told us and the details that didn't fit the line stay with the fact, for interview prep and later rewrites.
    const at = Date.now();
    const keep = async (t: string, from: "your note" | "left out of the line") =>
      ctx.db.insert("items", { workspaceId, kind: "context", status: "approved", roleKey: item.roleKey, projectKey: item.projectKey, data: { text: t, factId: itemId, from }, sources: item.sources, at });
    if (note.trim()) await keep(note.trim(), "your note");
    for (const c of keptAsContext) if (c.trim()) await keep(c.trim(), "left out of the line");
    // A project's fact has no narrative to quote.
    await ctx.db.patch(itemId, {
      data: { ...item.data, suggestion: { text, note, at: Date.now() } },
      ...(item.sources[0] ? { sources: [{ ...item.sources[0], quotes: [...new Set([...item.sources[0].quotes, ...quotes])] }] } : {}),
    });
  },
});

type Rework = { text?: string; quotes?: string[]; keptAsContext?: string[] };
export const REWORK_SCHEMA: ReplySchema = { name: "rework", schema: strictObject({ text: string, quotes: strings, keptAsContext: strings }) };
async function draftRework(ctx: ActionCtx, workspaceId: Id<"workspaces">, itemId: Id<"items">, note: string): Promise<ChatReply & { out: Rework }> {
  const { item, narrative, context } = await ctx.runQuery(internal.extract.reworkInputs, { workspaceId, itemId });
  if (!item) throw new Error("Not found.");
  const choice = await modelFor(ctx, workspaceId, "rework");
  const reply = await chatJson<Rework>(ctx, {
    workspaceId, purpose: "rework", model: choice.model, reasoning: choice.reasoning, schema: REWORK_SCHEMA,
    messages: [
      { role: "system", content: `${SYSTEM}\n\nNow rewrite one fact. The person has given more context or direction. What they said is the most important input: it's true, it corrects the narrative and earlier wordings wherever they differ, and the new line must reflect it, including any names, terms or emphasis they asked for. Follow the fact style above; details from their note that don't fit the line go in keptAsContext rather than being dropped. Keep every number and result already in the current fact or its earlier wordings unless what they said corrects it; new numbers are added alongside, not swapped in. Reply with JSON only: {"text": "...", "quotes": ["short verbatim snippets from the narrative, if any"], "keptAsContext": ["each number, result or explanation from what they said or earlier wordings that is true and useful but not in the new line, one per entry, so they can speak to it later"]}.` },
      { role: "user", content: `Narrative "${narrative?.title ?? ""}":\n${narrative?.body ?? ""}\n\nBackground on this role:\n${context.join("\n")}\n\nEarlier wordings:\n${(item.data.history ?? []).map((h) => h.text).join("\n")}\n\nCurrent fact: ${item.data.text}\n\nWhat they said: ${note || "Rewrite it stronger."}` },
    ],
  });
  return reply;
}

// Operator-only: draft a rewrite without saving it, to judge prompt changes on real data.
export const tryRework = internalAction({
  args: { workspaceId: v.id("workspaces"), itemId: v.id("items"), note: v.string() },
  handler: async (ctx, { workspaceId, itemId, note }) => (await draftRework(ctx, workspaceId, itemId, note)).text,
});

export async function runRework(ctx: ActionCtx, job: Doc<"jobs">) {
  const { itemId, note } = job.args as { itemId: Id<"items">; note: string };
  const reply = await draftRework(ctx, job.workspaceId, itemId, note);
  const out = reply.out;
  if (!out.text) throw new Error("The model's reply wasn't readable. Try again.");
  await ctx.runMutation(internal.extract.saveRework, { workspaceId: job.workspaceId, itemId, text: out.text, quotes: (out.quotes ?? []).filter((q) => typeof q === "string"), note, keptAsContext: (out.keptAsContext ?? []).filter((c) => typeof c === "string") });
  return { costUsd: reply.costUsd };
}

const roleFields = { employer: v.optional(v.string()), title: v.optional(v.string()), alternateTitles: v.optional(v.array(v.string())), change: v.optional(v.string()), location: v.optional(v.string()), start: v.optional(v.string()), end: v.optional(v.string()) };

// Correct a role's details. The person's corrections are approved as given.
export const editRole = mutation({
  args: { id: v.id("items"), ...roleFields },
  handler: async (ctx, { id, ...fields }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || item.kind !== "role") throw new Error("Not found.");
    const data = { ...item.data, marketTitle: null, edited: true };
    for (const k of ["employer", "title"] as const) {
      const x = fields[k];
      if (x !== undefined) data[k] = x.trim() || undefined;
    }
    for (const k of ["change", "location", "start", "end"] as const) {
      const x = fields[k];
      if (x !== undefined) data[k] = x.trim() || null;
    }
    if (fields.alternateTitles) data.alternateTitles = fields.alternateTitles.map((t) => t.trim()).filter(Boolean);
    if (data.change === "none") data.change = null;
    // Older roles kept one "marketTitle"; alternate titles replace it once edited.
    await ctx.db.patch(id, { data, status: "approved" });
    await checkOverlaps(ctx, workspaceId);
  },
});

// A role the person adds themselves: approved as given, with no story behind it. Its key comes from the employer and
// title, made unique among their roles.
export const addRole = mutation({
  args: { employer: v.string(), title: v.string(), alternateTitles: v.optional(v.array(v.string())), location: v.optional(v.string()), start: v.optional(v.string()), end: v.optional(v.string()) },
  handler: async (ctx, { employer, title, alternateTitles, location, start, end }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!employer.trim() || !title.trim()) throw new ConvexError("Give the employer and the title.");
    const taken = new Set((await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "role")).collect()).map((r) => r.roleKey));
    const base = `${employer}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "role";
    let roleKey = base;
    for (let n = 2; taken.has(roleKey); n++) roleKey = `${base}-${n}`;
    const data = {
      key: roleKey,
      employer: employer.trim(),
      title: title.trim(),
      alternateTitles: (alternateTitles ?? []).map((t) => t.trim()).filter(Boolean),
      location: location?.trim() || null,
      start: start?.trim() || null,
      end: end?.trim() || null,
      edited: true,
    };
    const id = await ctx.db.insert("items", { workspaceId, kind: "role", status: "approved", roleKey, data, sources: [], at: Date.now() });
    await checkOverlaps(ctx, workspaceId);
    return id;
  },
});

// Deleting a role removes it with everything filed under it: its facts, its context, its open questions and the notes on
// it and on those facts. Facts they rejected stay (as rejections, so the same lines aren't proposed again), a linked
// project stays unlinked, and its stories stay as they are. Returns how many facts went with it.
export const removeRole = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const role = await getInWorkspace(ctx, workspaceId, id);
    if (!role || role.kind !== "role" || !role.roleKey) throw new Error("Not found.");
    const roleKey = role.roleKey;
    // Another role with the same key (the same role read twice) keeps what's filed under it.
    const twins = (await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "role")).collect()).filter((r) => r._id !== id && r.roleKey === roleKey);
    const gone: Id<"items">[] = [id];
    let facts = 0;
    if (!twins.length) {
      const all = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId)).collect();
      for (const i of all) {
        if (i.kind === "project" && i.roleKey === roleKey) await ctx.db.patch(i._id, { roleKey: undefined });
        if (i.roleKey !== roleKey || i.projectKey) continue;
        if (i.kind === "fact" && i.status !== "rejected") facts++;
        if ((i.kind === "fact" && i.status !== "rejected") || i.kind === "context" || i.kind === "conflict") {
          gone.push(i._id);
          await tallyApproval(ctx, i, null);
        }
      }
    }
    for (const itemId of gone) {
      const notes = await ctx.db.query("notes").withIndex("by_subject", (q) => q.eq("workspaceId", workspaceId).eq("subject.kind", "item").eq("subject.id", itemId)).collect();
      for (const n of notes) await ctx.db.delete(n._id);
      await ctx.db.delete(itemId);
    }
    await checkOverlaps(ctx, workspaceId);
    return { facts };
  },
});

// Context they add to a role in their own words, optionally about one of its facts. Kept to sharpen later rewrites.
export const addContext = mutation({
  args: { roleKey: v.string(), text: v.string(), factId: v.optional(v.id("items")) },
  handler: async (ctx, { roleKey, text, factId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!text.trim()) throw new ConvexError("Write the context first.");
    const roles = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "role")).collect();
    if (!roles.some((r) => r.roleKey === roleKey && r.status !== "rejected")) throw new Error("That role isn't in your record.");
    const fact = factId && (await getInWorkspace(ctx, workspaceId, factId));
    if (factId && (!fact || fact.kind !== "fact" || fact.roleKey !== roleKey)) throw new Error("Not found.");
    return ctx.db.insert("items", { workspaceId, kind: "context", status: "approved", roleKey, data: { text: text.trim(), from: "your note", ...(factId ? { factId } : {}) }, sources: [], at: Date.now() });
  },
});

// Status of the latest read of one narrative, so several narratives can be read at once. `at`: when that read started;
// `lastReadAt`: when the newest version read (`lastRead`) was read.
export const runFor = query({
  args: { narrativeId: v.id("narratives") },
  handler: async (ctx, { narrativeId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect();
    const job = jobs.find((j) => (j.kind === "extract" || j.kind === "goals") && j.args.narrativeId === narrativeId);
    const read = jobs.filter((j) => j.kind === "extract" && j.args.narrativeId === narrativeId && j.status === "done");
    const last = read.reduce<(typeof read)[number] | null>((best, j) => (!best || (j.args.version as number) > (best.args.version as number) ? j : best), null);
    return job
      ? {
          status: job.status,
          result: job.result,
          error: job.error,
          version: job.args.version as number,
          at: job.startedAt ?? job._creationTime,
          lastRead: last ? (last.args.version as number) : null,
          lastReadAt: last ? (last.startedAt ?? last._creationTime) : null,
        }
      : null;
  },
});

// Move a fact to another role, for narratives that cover several roles.
export const moveFact = mutation({
  args: { id: v.id("items"), roleKey: v.string() },
  handler: async (ctx, { id, roleKey }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || item.kind !== "fact") throw new Error("Not found.");
    const roles = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "role")).collect();
    if (!roles.some((r) => r.roleKey === roleKey && r.status !== "rejected")) throw new Error("That role isn't in your record.");
    await ctx.db.patch(id, { roleKey });
    // Notes kept for this fact move with it.
    const kept = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "context")).collect();
    for (const c of kept) if (c.kind === "context" && c.data.factId === id) await ctx.db.patch(c._id, { roleKey });
  },
});

// A flagged fact whose narrative was deleted: keep it as it is.
export const keepOrphan = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || item.kind !== "fact") throw new Error("Not found.");
    await ctx.db.patch(id, { data: { ...item.data, sourceDeleted: null, noLongerSaid: null } });
  },
});

// Undo Keep it: the flags it cleared come back as they were.
export const flagOrphan = mutation({
  args: { id: v.id("items"), noLongerSaid: v.union(v.string(), v.null()), sourceDeleted: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, noLongerSaid, sourceDeleted }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || item.kind !== "fact") throw new Error("Not found.");
    await ctx.db.patch(id, { data: { ...item.data, noLongerSaid, sourceDeleted } });
  },
});

// A fact in their own words, on a role (or career break) or a project in the record: approved as written, like an edit.
export const addFact = mutation({
  args: { roleKey: v.optional(v.string()), projectKey: v.optional(v.string()), text: v.string() },
  handler: async (ctx, { roleKey, projectKey, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const words = text.trim();
    if (!words || !roleKey === !projectKey) throw new Error("Not found.");
    const kind = roleKey ? "role" : "project";
    const owners = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind)).collect();
    if (!owners.some((o) => o.status !== "rejected" && (roleKey ? o.roleKey === roleKey : o.projectKey === projectKey))) throw new Error("That isn't in your record.");
    const history = [{ text: words, how: "edit" as const, at: Date.now() }];
    const id = await ctx.db.insert("items", { workspaceId, kind: "fact", status: "approved", data: { text: words, edited: true, history }, ...(roleKey ? { roleKey } : { projectKey }), sources: [], at: Date.now() });
    await tallyApproval(ctx, (await ctx.db.get(id))!, "approved");
    return id;
  },
});

// Undo Add a fact: the fact goes, while it's still only as they added it (no sources, no later wording).
export const removeAddedFact = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    const added = item?.kind === "fact" && item.sources.length === 0 && item.data.history?.length === 1 && item.data.history[0].how === "edit";
    if (!added || !item) throw new Error("Not found.");
    await ctx.db.delete(id);
    await tallyApproval(ctx, item, null);
  },
});

// ---- Revisions: a narrative changed after it was read. Propose only the difference. ----

const REVISION = `This narrative was revised after it was read. You get the version that was read, the revised version, and the facts already taken from this narrative (with ids and whether they approved them). Propose only what the revision changes:
- "facts": new facts that only the revised text supports, with quotes from the revised text.
- "updates": facts the revision changes (a corrected number, date, scope or claim): {"factId", "text" (the fact as it should now read, same style), "why" (one short line naming what changed)}. Keep everything in the fact the revision didn't change.
- "retired": facts the revised narrative no longer supports at all: {"factId", "why"}.
- "context": new background only.
Leave every fact the revision doesn't touch out of all three lists, even if you'd word it differently. A reworded passage that says the same thing changes nothing.

Reply with JSON only: {"facts":[...],"updates":[...],"retired":[...],"context":[...]}.`;

type Revision = Extracted & { updates?: { factId?: string; text?: string; why?: string }[]; retired?: { factId?: string; why?: string }[] };
export const REVISION_SCHEMA: ReplySchema = {
  name: "revision",
  schema: strictObject({ facts: listOf(quoted), updates: listOf({ factId: string, text: string, why: string }), retired: listOf({ factId: string, why: string }), context: listOf(quoted) }),
};

export const revisionInputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), narrativeId: v.id("narratives"), fromVersion: v.number() },
  handler: async (ctx, { workspaceId, narrativeId, fromVersion }) => {
    const before = await ctx.db.query("narrativeVersions").withIndex("by_narrative", (q) => q.eq("narrativeId", narrativeId).eq("version", fromVersion)).unique();
    const facts = [];
    for (const status of ["approved", "proposed"] as const)
      for (const f of await itemsOf(ctx, workspaceId, "fact", status))
        if (f.sources.some((s) => s.narrativeId === narrativeId)) facts.push({ id: f._id, roleKey: f.roleKey, text: f.data.text, status });
    return { before: before?.body ?? null, facts };
  },
});

async function runRevision(ctx: ActionCtx, job: Doc<"jobs">, narrativeId: Id<"narratives">, fromVersion: number) {
  const workspaceId = job.workspaceId;
  const inputs = await ctx.runQuery(internal.extract.inputs, { workspaceId, narrativeId });
  const rev = await ctx.runQuery(internal.extract.revisionInputs, { workspaceId, narrativeId, fromVersion });
  const narrative = inputs.narrative;
  if (!narrative) throw new Error("Narrative not found.");
  if (rev.before === null) throw new Error("The version that was read is missing.");
  const choice = await modelFor(ctx, workspaceId, "extract");
  const reply = await chatJson<Revision>(ctx, {
    workspaceId,
    purpose: "revision",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: REVISION_SCHEMA,
    messages: [
      { role: "system", content: `${SYSTEM}\n\n${REVISION}` },
      {
        role: "user",
        content: `Their confirmed record:\n${JSON.stringify(inputs.record)}\n\nTheir other narratives, as background only:\n${JSON.stringify(inputs.background)}\n\nFacts they rejected, and why (don't propose these again):\n${JSON.stringify(inputs.rejected)}\n\nFacts already taken from this narrative:\n${JSON.stringify(rev.facts)}\n\nVersion that was read (${fromVersion}):\n${rev.before}\n\nRevised version (${narrative.version}) "${narrative.title}":\n${narrative.body}`,
      },
    ],
  });
  const out = reply.out;
  const counts = await ctx.runMutation(internal.extract.saveProposals, { workspaceId, runId: job._id, narrativeId, version: narrative.version, extracted: { facts: out.facts, context: out.context } });
  const changed = await ctx.runMutation(internal.extract.saveRevision, { workspaceId, narrativeId, updates: out.updates ?? [], retired: out.retired ?? [] });
  return { ...counts, ...changed, costUsd: reply.costUsd, model: reply.model };
}

// Changes to existing facts arrive as suggestions or flags on those facts, never as silent rewrites,
// and only for facts this narrative is one of the sources of, wherever it sits among them.
export const saveRevision = internalMutation({
  args: { workspaceId: v.id("workspaces"), narrativeId: v.id("narratives"), updates: v.any(), retired: v.any() },
  handler: async (ctx, { workspaceId, narrativeId, updates, retired }) => {
    const mine = async (id: unknown) => {
      const nid = typeof id === "string" ? ctx.db.normalizeId("items", id) : null;
      const f = nid && (await getInWorkspace(ctx, workspaceId, nid));
      return f && f.kind === "fact" && f.status !== "rejected" && f.sources.some((s) => s.narrativeId === narrativeId) ? f : null;
    };
    let updated = 0;
    let retiredCount = 0;
    for (const u of (updates as Revision["updates"]) ?? []) {
      const f = await mine(u?.factId);
      const text = typeof u?.text === "string" ? u.text.trim() : "";
      if (!f || !text || text === f.data.text) continue;
      await ctx.db.patch(f._id, { data: { ...f.data, suggestion: { text, note: u?.why ?? "", from: "revision", at: Date.now() } } });
      updated++;
    }
    for (const r of (retired as Revision["retired"]) ?? []) {
      const f = await mine(r?.factId);
      if (!f) continue;
      await ctx.db.patch(f._id, { data: { ...f.data, noLongerSaid: typeof r?.why === "string" && r.why.trim() ? r.why.trim() : "" } });
      retiredCount++;
    }
    return { updated, retired: retiredCount };
  },
});
