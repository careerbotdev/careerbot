import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { inOrder } from "./contactGroups";
import { itemsOf } from "./itemShapes";
import { CLOSED_REASONS, type ClosedReason, DONE, isSent, PATHS, pathOf, PURSUIT_STATUSES, reachedOf, REMINDER_RULES, type ReminderRule, wentOut } from "./pursuitSteps";
import { countedRecord, recordOf } from "./recordContext";
import { resumeShower, shownResume, versionsOf } from "./resume";
import { syncSoon } from "./driveSoon";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Pursuits: roles they're going after. Start on a role makes one (one per role); Start outreach on a company makes one
// with no open role, to write to the people who hire there. They set its status themselves, and every change goes on
// its dated timeline. Reaching Applied, Interviewing or Offer keeps the resume exactly as it showed then and the cover
// letter (sent); going back to Preparing lets them go. Each has a path: Apply, Outreach, or both.

type Entry = Doc<"pursuits">["timeline"][number];

export async function own(ctx: QueryCtx, workspaceId: Id<"workspaces">, id: Id<"pursuits">) {
  const p = await getInWorkspace(ctx, workspaceId, id);
  if (!p) throw new ConvexError("Not found.");
  return p;
}

// A change and its timeline entry, saved together; the pursuit's last activity moves with it. Google Drive looks for
// what changed soon after (its letter, answers or status).
export async function change(ctx: MutationCtx, p: Doc<"pursuits">, patch: Partial<Doc<"pursuits">>, entry: Omit<Entry, "at">) {
  const at = Date.now();
  await ctx.db.patch(p._id, { ...patch, timeline: [...p.timeline, { ...entry, at }], changedAt: at });
  await syncSoon(ctx, p.workspaceId);
}

// The resume the pursuit uses: the one they chose, else the newest tailored to its role; with no role, its direction's
// resume (the base resume when it has no direction), for the PDF beside an outreach message.
export async function resumeOf(ctx: QueryCtx, p: Doc<"pursuits">) {
  if (p.resumeId) return p.resumeId;
  if (!p.postingId) return (await versionsOf(ctx, p.workspaceId, p.directionId)).current?._id ?? null;
  const newest = await ctx.db.query("resumes").withIndex("by_posting", (q) => q.eq("workspaceId", p.workspaceId).eq("postingId", p.postingId)).order("desc").first();
  return newest?._id ?? null;
}

// The resume a pursuit uses, as it shows now: tailored to its role, or with no open role its direction's.
async function shownFor(ctx: QueryCtx, p: Doc<"pursuits">, resumeId: Id<"resumes">) {
  if (p.postingId) return shownResume(ctx, p.workspaceId, resumeId);
  const r = await getInWorkspace(ctx, p.workspaceId, resumeId);
  return r ? (await resumeShower(ctx, p.workspaceId)).shown(r) : null;
}

// A pursuit's contacts in group order, and what its outreach reminders read of each: when the last outreach message to
// them was marked sent, and when they replied (pursuitSteps.remindersOf).
async function contactsOf(ctx: QueryCtx, p: Doc<"pursuits">) {
  const rows = inOrder(p.title, await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", p._id)).collect());
  return { rows, facts: rows.map((c) => ({ id: c._id as string, name: c.name, sentAt: c.sent?.at(-1)?.at ?? null, repliedAt: c.repliedAt ?? null })) };
}

// Its cover letter: the newest version.
export const letterOf = (ctx: QueryCtx, pursuitId: Id<"pursuits">) => ctx.db.query("letters").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId)).order("desc").first();
export const letterText = (l: Doc<"letters">) => l.paragraphs.map((x) => x.text).join("\n\n");

// What writing for a pursuit rests on (its cover letter, answers about its role, outreach): the approved record that
// counts, the role (title, company and its summary, place, description as the AI reads it; with no open role, none of
// the posting's), the resume it uses as it shows (the one sent, once sent), and their name.
export const grounding = internalQuery({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const p = await ctx.db.get(pursuitId);
    if (!p) return null;
    const posting = p.postingId ? await ctx.db.get(p.postingId) : null;
    const company = await ctx.db.get(p.companyId);
    const text = p.postingId ? await ctx.db.query("postingTexts").withIndex("by_posting", (q) => q.eq("postingId", p.postingId!)).first() : null;
    const resumeId = p.sent ? (p.sent.resumeId ?? null) : await resumeOf(ctx, p);
    const resume = p.sent ? (p.sent.resume ?? null) : resumeId ? await shownFor(ctx, p, resumeId) : null;
    const profile = await ctx.db.query("profiles").withIndex("by_workspace", (q) => q.eq("workspaceId", p.workspaceId)).unique();
    return {
      workspaceId: p.workspaceId,
      record: recordOf(await countedRecord(ctx, p.workspaceId)),
      role: { title: p.title, company: p.company, companySummary: company?.details?.summary ?? null, location: posting?.location ?? null, description: text?.clean ?? text?.text ?? null, open: !!p.postingId },
      direction: p.direction ?? null,
      resumeId,
      resume,
      name: profile?.name ?? null,
    };
  },
});

// Start a pursuit of a role: for the direction it was opened from (else its best fit), with the role's score for that
// direction kept. A role already started returns its pursuit.
export const start = mutation({
  args: { postingId: v.id("postings"), directionId: v.optional(v.id("items")) },
  handler: async (ctx, { postingId, directionId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const posting = await getInWorkspace(ctx, workspaceId, postingId);
    if (!posting) throw new ConvexError("Not found.");
    const existing = await ctx.db.query("pursuits").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", postingId)).first();
    if (existing) return existing._id;
    const directions = new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.name]));
    const fits = (posting.fit ?? []).filter((f) => directions.has(String(f.directionId)));
    const best = [...fits].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
    const fit = fits.find((f) => f.directionId === directionId) ?? best;
    const company = await ctx.db.get(posting.companyId);
    const at = Date.now();
    return ctx.db.insert("pursuits", {
      workspaceId,
      postingId,
      companyId: posting.companyId,
      title: posting.title,
      company: company?.name ?? "",
      ...(fit ? { directionId: fit.directionId, direction: directions.get(String(fit.directionId)), level: fit.level, ...(fit.score !== undefined ? { score: fit.score } : {}) } : {}),
      status: "preparing",
      timeline: [{ at, event: "started" }],
      changedAt: at,
      at,
    });
  },
});

// Start outreach at a company with no open role: a pursuit with no posting, titled with what they're after (the
// direction's name: the one given, else their first approved direction), on the Outreach path. One under way per
// company and direction: starting again returns it.
export const startAtCompany = mutation({
  args: { companyId: v.id("companies"), directionId: v.optional(v.id("items")) },
  handler: async (ctx, { companyId, directionId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const company = await getInWorkspace(ctx, workspaceId, companyId);
    if (!company) throw new ConvexError("Not found.");
    const directions = await itemsOf(ctx, workspaceId, "direction", "approved");
    const d = directions.find((x) => x._id === directionId) ?? (directionId ? undefined : directions[0]);
    if (!d) throw new ConvexError(directionId ? "Not found." : "Approve a direction in Goals first.");
    const existing = (await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).find(
      (p) => !p.postingId && p.companyId === companyId && p.directionId === d._id && p.status !== "closed",
    );
    if (existing) return existing._id;
    const at = Date.now();
    return ctx.db.insert("pursuits", {
      workspaceId,
      companyId,
      title: d.data.name,
      company: company.name,
      directionId: d._id,
      direction: d.data.name,
      status: "preparing",
      path: "outreach",
      timeline: [{ at, event: "started" }],
      changedAt: at,
      at,
    });
  },
});

// Set its status. Closed needs a reason. Reaching a sent status keeps the resume as it shows now, the cover letter and
// the answers; going back to Preparing lets them go. The dates it was first marked Contacted and Applied are kept.
export const setStatus = mutation({
  args: { id: v.id("pursuits"), status: v.union(...PURSUIT_STATUSES.map((s) => v.literal(s))), reason: v.optional(v.union(...CLOSED_REASONS.map((s) => v.literal(s)))) },
  handler: async (ctx, { id, status, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    if (status === "closed" && !reason) throw new ConvexError("Choose why it closed.");
    const closedReason: ClosedReason | undefined = status === "closed" ? reason : undefined;
    if (p.status === status && p.closedReason === closedReason) return;
    const patch: Partial<Doc<"pursuits">> = { status, closedReason };
    if (isSent(status) && !p.sent) {
      const resumeId = await resumeOf(ctx, p);
      const resume = resumeId ? await shownFor(ctx, p, resumeId) : null;
      const letter = await letterOf(ctx, id);
      const answers = (p.answers ?? []).map(({ question, answer }) => ({ question, answer }));
      patch.sent = { at: Date.now(), ...(resumeId && resume ? { resumeId, resume } : {}), ...(letter ? { letterId: letter._id, letter: letterText(letter) } : {}), answers };
    }
    if (status === "preparing") patch.sent = undefined;
    if (status === "applied" && p.appliedAt === undefined) patch.appliedAt = Date.now();
    if (status === "contacted" && p.contactedAt === undefined) patch.contactedAt = Date.now();
    await change(ctx, p, patch, { event: "status", status, ...(closedReason ? { reason: closedReason } : {}) });
  },
});

// Choose its path: Apply, Outreach, or both; null clears the choice. Changes only the steps it suggests: nothing is
// hidden or locked, and what they did (an outreach message sent, Applied) still counts on its path.
export const setPath = mutation({
  args: { id: v.id("pursuits"), path: v.union(...PATHS.map((s) => v.literal(s)), v.null()) },
  handler: async (ctx, { id, path }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    const next = path ?? undefined;
    if (next === p.path) return;
    await change(ctx, p, { path: next }, { event: "path", ...(next ? { text: next } : {}) });
  },
});

// Their own next step, or empty to go back to the suggested one.
export const setNextStep = mutation({
  args: { id: v.id("pursuits"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    const next = text.trim() || undefined;
    if (next === p.nextStep) return;
    await change(ctx, p, { nextStep: next }, { event: "nextStep", ...(next ? { text: next } : {}) });
  },
});

// Choose which resume tailored to its role the pursuit uses. Refused once it's sent, and with no open role.
export const setResume = mutation({
  args: { id: v.id("pursuits"), resumeId: v.id("resumes") },
  handler: async (ctx, { id, resumeId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    if (p.sent) throw new ConvexError("It was sent with the resume it has.");
    const r = await getInWorkspace(ctx, workspaceId, resumeId);
    if (!r || !p.postingId || r.postingId !== p.postingId) throw new ConvexError("Not found.");
    if (p.resumeId === resumeId) return;
    await change(ctx, p, { resumeId }, { event: "resume" });
  },
});

// The interview day (YYYY-MM-DD), or null to clear it.
export const setInterview = mutation({
  args: { id: v.id("pursuits"), date: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, date }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ConvexError("Type a date like Oct 3.");
    const interviewAt = date ?? undefined;
    if (interviewAt === p.interviewAt) return;
    await change(ctx, p, { interviewAt }, { event: "interview", ...(interviewAt ? { text: interviewAt } : {}) });
  },
});

// A reminder done: Followed up, Prepared or Still on, on the timeline (a change, so the quiet starts over).
export const done = mutation({
  args: { id: v.id("pursuits"), rule: v.union(...REMINDER_RULES.map((r) => v.literal(r))) },
  handler: async (ctx, { id, rule }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    await change(ctx, p, {}, { event: DONE[rule].event });
  },
});

async function rulesOf(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<Record<ReminderRule, boolean>> {
  const row = await ctx.db.query("reminderSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  return { followUp: row?.followUp ?? true, prepare: row?.prepare ?? true, stale: row?.stale ?? true };
}

// Which reminders are on (all, until they switch one off).
export const reminderRules = query({
  args: {},
  handler: async (ctx) => rulesOf(ctx, (await requireWorkspace(ctx)).workspaceId),
});

export const setReminderRule = mutation({
  args: { rule: v.union(...REMINDER_RULES.map((r) => v.literal(r))), on: v.boolean() },
  handler: async (ctx, { rule, on }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await ctx.db.query("reminderSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    if (row) await ctx.db.patch(row._id, { [rule]: on });
    else await ctx.db.insert("reminderSettings", { workspaceId, ...(await rulesOf(ctx, workspaceId)), [rule]: on });
  },
});

// Save an answer to an application question: a new one, or the one saved at `at` changed. Facts it rests on stay
// only while the answer is unchanged.
export const saveAnswer = mutation({
  args: { id: v.id("pursuits"), question: v.string(), answer: v.string(), at: v.optional(v.number()) },
  handler: async (ctx, { id, question, answer, at }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) throw new ConvexError("Write the question and its answer.");
    const answers = p.answers ?? [];
    const old = at === undefined ? undefined : answers.find((x) => x.at === at);
    if (at !== undefined && !old) throw new ConvexError("Not found.");
    const kept = old && old.answer === a;
    const next = { question: q, answer: a, factIds: kept ? old.factIds : [], ...(kept && old.cites ? { cites: old.cites } : {}), at: old?.at ?? Date.now() };
    await change(ctx, p, { answers: old ? answers.map((x) => (x === old ? next : x)) : [...answers, next] }, { event: "answer", text: q });
  },
});

export const removeAnswer = mutation({
  args: { id: v.id("pursuits"), at: v.number() },
  handler: async (ctx, { id, at }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    await ctx.db.patch(id, { answers: (p.answers ?? []).filter((x) => x.at !== at) });
    await syncSoon(ctx, workspaceId);
  },
});

// Put a reminder off until a day (YYYY-MM-DD, their calendar): Today and the count leave it out until then, and the
// timeline records it. Not activity: changedAt stays, so the reminder comes back with the same step.
export const snooze = mutation({
  args: { id: v.id("pursuits"), rule: v.union(...REMINDER_RULES.map((r) => v.literal(r))), until: v.string() },
  handler: async (ctx, { id, rule, until }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new ConvexError("Choose a day.");
    await ctx.db.patch(id, { snoozed: { rule, until }, timeline: [...p.timeline, { at: Date.now(), event: "snoozed", text: until }] });
  },
});

// Undo a snooze: the reminder shows again and its timeline entry goes.
export const unsnooze = mutation({
  args: { id: v.id("pursuits") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    if (!p.snoozed) return;
    const last = p.timeline.findLastIndex((e) => e.event === "snoozed");
    await ctx.db.patch(id, { snoozed: undefined, timeline: last < 0 ? p.timeline : p.timeline.filter((_, i) => i !== last) });
  },
});

// With no open role, its direction's summary for the Role tab; none with an open role.
async function directionSummaryOf(ctx: QueryCtx, p: Doc<"pursuits">) {
  if (p.postingId || !p.directionId) return null;
  const d = await ctx.db.get(p.directionId);
  return d?.kind === "direction" ? (d.data.summary ?? null) : null;
}

// One pursuit for its page: its role (its brief, and whether the posting is still open; with no open role, the
// company's and the direction's summaries instead), its company, status, path, steps, timeline (newest first), the
// resume it uses (with no open role, its direction's resume as it shows, for the PDF), saved answers (newest first)
// with the approved facts they cite, what was sent, and what its outreach step needs (whether contacts were found, and
// who the next message is for). Its notes are in notes.ts.
export const get = query({
  args: { id: v.id("pursuits") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, id);
    const posting = p.postingId ? await ctx.db.get(p.postingId) : null;
    const resumeId = await resumeOf(ctx, p);
    const { rows: contacts, facts: outreach } = await contactsOf(ctx, p);
    const next = contacts.find((c) => c.draft && !(c.sent ?? []).some((s) => s.at >= c.draft!.at)) ?? contacts.find((c) => !(c.sent ?? []).length);
    const facts: Record<string, string> = {};
    for (const factId of new Set((p.answers ?? []).flatMap((a) => a.factIds))) {
      const f = await ctx.db.get(factId as Id<"items">);
      if (f?.kind === "fact" && f.status === "approved" && f.workspaceId === workspaceId) facts[factId] = f.data.text;
    }
    return {
      id: p._id,
      postingId: p.postingId ?? null,
      companyId: p.companyId,
      title: p.title,
      company: p.company,
      url: posting?.url ?? null,
      applyUrl: posting?.applyUrl ?? null,
      closed: !!posting?.closedAt,
      brief: posting?.brief ? { job: posting.brief.job, forYou: posting.brief.forYou } : null,
      direction: p.directionId ? { id: p.directionId, name: p.direction ?? "" } : null,
      // With no open role, what the Role tab shows instead: what the company does and what the direction is.
      companySummary: p.postingId ? null : ((await ctx.db.get(p.companyId))?.details?.summary ?? null),
      directionSummary: await directionSummaryOf(ctx, p),
      score: p.score ?? null,
      level: p.level ?? null,
      status: p.status,
      path: pathOf(p),
      chosenPath: p.path ?? null,
      contactedAt: p.contactedAt ?? null,
      repliedAt: p.repliedAt ?? null,
      outreach: { hasContacts: contacts.length > 0, to: next?.name ?? null },
      contacts: outreach,
      closedReason: p.closedReason ?? null,
      nextStep: p.nextStep ?? null,
      appliedAt: p.appliedAt ?? null,
      interviewAt: p.interviewAt ?? null,
      snoozed: p.snoozed ?? null,
      rules: await rulesOf(ctx, workspaceId),
      reached: reachedOf(p.timeline),
      resumeId,
      // With no open role: its direction's resume as it shows, for the PDF beside an outreach message.
      resume: !p.postingId && resumeId && !p.sent ? await shownFor(ctx, p, resumeId) : null,
      hasLetter: (await letterOf(ctx, p._id)) !== null,
      answers: [...(p.answers ?? [])].reverse(),
      facts,
      sent: p.sent ? { at: p.sent.at, resumeId: p.sent.resumeId ?? null, resume: p.sent.resume ?? null, letter: p.sent.letter ?? null } : null,
      timeline: [...p.timeline].reverse(),
      changedAt: p.changedAt,
      at: p.at,
    };
  },
});

// Every pursuit, last activity first, for the Pursuing and Closed lists and the count on Home: its role (to open it;
// null with no open role), status, next step (their own; the page suggests one when unset), last activity, and the
// dates its reminders are worked out from (with which reminders are on).
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect();
    return {
      rules: await rulesOf(ctx, workspaceId),
      pursuits: await Promise.all(
        rows.map(async (p) => ({
          id: p._id,
          postingId: p.postingId ?? null,
          title: p.title,
          company: p.company,
          directionId: p.directionId ?? null,
          direction: p.direction ?? null,
          score: p.score ?? null,
          level: p.level ?? null,
          status: p.status,
          path: pathOf(p),
          contactedAt: p.contactedAt ?? null,
          repliedAt: p.repliedAt ?? null,
          contacts: (await contactsOf(ctx, p)).facts,
          closedReason: p.closedReason ?? null,
          nextStep: p.nextStep ?? null,
          hasResume: (await resumeOf(ctx, p)) !== null,
          hasLetter: (await letterOf(ctx, p._id)) !== null,
          appliedAt: p.appliedAt ?? null,
          interviewAt: p.interviewAt ?? null,
          snoozed: p.snoozed ?? null,
          changedAt: p.changedAt,
          // What the reminders read.
          timeline: p.timeline.filter((e) => e.event === "followedUp" || e.event === "prepared").map((e) => ({ at: e.at, event: e.event })),
        })),
      ),
    };
  },
});

// Outcomes by direction (the one each pursuit was started for; its name as it was then): how many were started, were
// contacted, applied to, either (pursuitSteps.wentOut), got as far as Interviewing and an Offer (at any time), are under
// way now, and closed for each reason.
export const byDirection = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    const out = new Map<string, { direction: string | null; started: number; contacted: number; applied: number; contactedOrApplied: number; interviewed: number; offers: number; open: number; closed: Record<ClosedReason, number> }>();
    for (const p of rows) {
      const key = p.directionId ?? "";
      const d = out.get(key) ?? { direction: p.direction ?? null, started: 0, contacted: 0, applied: 0, contactedOrApplied: 0, interviewed: 0, offers: 0, open: 0, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } };
      const reached = reachedOf(p.timeline);
      const went = wentOut(p);
      d.started += 1;
      if (went.contacted) d.contacted += 1;
      if (went.applied) d.applied += 1;
      if (went.contactedOrApplied) d.contactedOrApplied += 1;
      if (reached === "interviewing" || reached === "offer") d.interviewed += 1;
      if (reached === "offer") d.offers += 1;
      if (p.status === "closed" && p.closedReason) d.closed[p.closedReason] += 1;
      else d.open += 1;
      out.set(key, d);
    }
    return [...out.values()].sort((a, b) => b.started - a.started);
  },
});

// The pursuit of one role, if it was started: for the panel of Pursuits.
export const forPosting = query({
  args: { postingId: v.id("postings") },
  handler: async (ctx, { postingId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await ctx.db.query("pursuits").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", postingId)).first();
    return p ? { id: p._id, status: p.status, closedReason: p.closedReason ?? null } : null;
  },
});
