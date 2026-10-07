import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { type ReplySchema, strictObject, string, strings } from "./replyJson";
import { dayText, statusText } from "./pursuitSteps";
import { change, own } from "./pursuits";
import { OUTREACH_STYLE, PLAIN_LANGUAGE } from "./writingGuides";
import { requireWorkspace } from "./workspaces";

// Follow-ups: when an application or an outreach message goes quiet, or after an interview, a short email to the
// pursuit's contact, written from the approved record, the role and where the pursuit stands. They send it from their
// own email and mark it sent: kept exactly as it was, and on the pursuit's timeline as Followed up, so the quiet starts
// over. Writing again keeps the draft until they keep the new version.

type State = Doc<"followUps">["state"];

// A pursuit's one draft, or its one rewrite waiting to be kept.
const rowOf = (ctx: QueryCtx, pursuitId: Id<"pursuits">, state: Exclude<State, "sent">) =>
  ctx.db.query("followUps").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId).eq("state", state)).order("desc").first();

// What was sent, newest first.
const sentOf = (ctx: QueryCtx, pursuitId: Id<"pursuits">) =>
  ctx.db.query("followUps").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId).eq("state", "sent")).order("desc").collect();

const contactsOf = (ctx: QueryCtx, pursuitId: Id<"pursuits">) => ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId)).collect();

const lastSent = (c: Doc<"contacts">) => Math.max(-1, ...(c.sent ?? []).map((s) => s.at));

// Who a follow-up goes to when they haven't chosen: the person they last sent an outreach message to, else the likely
// hiring manager, else the first with an email. Only people whose email they revealed.
function defaultContact(contacts: Doc<"contacts">[]) {
  const revealed = contacts.filter((c) => c.revealedAt !== undefined);
  const wrote = revealed.filter((c) => lastSent(c) >= 0).sort((a, b) => lastSent(b) - lastSent(a))[0];
  return wrote ?? revealed.find((c) => c.hiringManager) ?? revealed.find((c) => c.email) ?? null;
}

// Who a new follow-up is written to when they don't choose: whoever the draft is to, unless they've written to
// someone newer since it was written (one contact at a time, so it goes to the last one); else the default.
function toOf(contacts: Doc<"contacts">[], draft: Doc<"followUps"> | null) {
  const last = defaultContact(contacts);
  const chosen = draft?.contactId ? contacts.find((c) => c._id === draft.contactId) : undefined;
  return chosen && !(last && lastSent(last) > draft!.at) ? chosen : last;
}

const person = (c: Doc<"contacts">) => ({ id: c._id, name: c.name, title: c.title ?? null, email: c.email ?? null });

// Follow-up work for this pursuit, newest first: the last one tells whether it's writing or failed.
async function lastRun(ctx: QueryCtx, workspaceId: Id<"workspaces">, pursuitId: Id<"pursuits">) {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  return jobs.find((j) => j.kind === "followUp" && j.args.pursuitId === pursuitId) ?? null;
}

// A pursuit's follow-up for its page and Today: who it's to (and who else they could write to), the draft, a newer
// version waiting to be kept, what was sent (newest first), the approved facts they cite, and the last run.
export const forPursuit = query({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await own(ctx, workspaceId, pursuitId);
    const contacts = await contactsOf(ctx, pursuitId);
    const draft = await rowOf(ctx, pursuitId, "draft");
    const rewrite = await rowOf(ctx, pursuitId, "rewrite");
    const sent = await sentOf(ctx, pursuitId);
    const chosen = draft?.contactId ? contacts.find((c) => c._id === draft.contactId) : undefined;
    const to = chosen ?? defaultContact(contacts);
    const facts: Record<string, string> = {};
    for (const id of new Set([draft, rewrite, ...sent].flatMap((x) => x?.factIds ?? []))) {
      const f = await ctx.db.get(id as Id<"items">);
      if (f?.kind === "fact" && f.status === "approved" && f.workspaceId === workspaceId) facts[id] = f.data.text;
    }
    const last = await lastRun(ctx, workspaceId, pursuitId);
    return {
      to: to ? person(to) : null,
      contacts: contacts.filter((c) => c.revealedAt !== undefined).map(person),
      draft: draft ? { subject: draft.subject, text: draft.text, factIds: draft.factIds, edited: !!draft.edited, at: draft.at } : null,
      rewrite: rewrite ? { subject: rewrite.subject, text: rewrite.text, factIds: rewrite.factIds, at: rewrite.at } : null,
      sent: sent.map((s) => ({ id: s._id, subject: s.subject, text: s.text, to: s.to ?? null, at: s.at })),
      facts,
      writing: last?.status === "queued" || last?.status === "running",
      failed: last?.status === "failed" ? (last.error ?? "") : null,
    };
  },
});

// Write the follow-up: to the person they chose, else whoever the draft is to, else the default. With a draft already
// there, the new version waits to be kept. Refused on a closed pursuit; nothing new while one is being written.
export const write = mutation({
  args: { pursuitId: v.id("pursuits"), contactId: v.optional(v.id("contacts")) },
  handler: async (ctx, { pursuitId, contactId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, pursuitId);
    if (p.status === "closed") throw new ConvexError("It's closed.");
    if (contactId) {
      const c = await ctx.db.get(contactId);
      if (!c || c.workspaceId !== workspaceId || c.pursuitId !== pursuitId) throw new ConvexError("Not found.");
    }
    const last = await lastRun(ctx, workspaceId, pursuitId);
    if (last?.status === "queued" || last?.status === "running") return null;
    const to = contactId ?? toOf(await contactsOf(ctx, pursuitId), await rowOf(ctx, pursuitId, "draft"))?._id;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "followUp", args: { pursuitId, ...(to ? { contactId: to } : {}) }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

async function ownPursuit(ctx: MutationCtx, pursuitId: Id<"pursuits">) {
  const { workspaceId } = await requireWorkspace(ctx);
  return own(ctx, workspaceId, pursuitId);
}

// Keep the newer version: it becomes the draft, in place of the old one.
export const keep = mutation({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    await ownPursuit(ctx, pursuitId);
    const rewrite = await rowOf(ctx, pursuitId, "rewrite");
    if (!rewrite) return;
    const draft = await rowOf(ctx, pursuitId, "draft");
    if (draft) await ctx.db.delete(draft._id);
    // Kept now, so a send before this never counts as sending it.
    await ctx.db.patch(rewrite._id, { state: "draft", at: Date.now() });
  },
});

// Let the newer version go; the draft stays.
export const discard = mutation({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    await ownPursuit(ctx, pursuitId);
    const rewrite = await rowOf(ctx, pursuitId, "rewrite");
    if (rewrite) await ctx.db.delete(rewrite._id);
  },
});

// Their own wording on the draft. The facts it rests on stay only while the message itself is unchanged.
export const edit = mutation({
  args: { pursuitId: v.id("pursuits"), subject: v.string(), text: v.string() },
  handler: async (ctx, { pursuitId, subject, text }) => {
    const p = await ownPursuit(ctx, pursuitId);
    const body = text.trim();
    if (!body) throw new ConvexError("Write the message first.");
    const draft = await rowOf(ctx, pursuitId, "draft");
    const mine = { subject: subject.trim(), text: body, edited: true, at: Date.now() };
    if (draft) await ctx.db.patch(draft._id, { ...mine, factIds: draft.text === body ? draft.factIds : [] });
    else {
      const to = defaultContact(await contactsOf(ctx, pursuitId));
      await ctx.db.insert("followUps", { workspaceId: p.workspaceId, pursuitId, state: "draft", ...(to ? { contactId: to._id } : {}), ...mine, factIds: [] });
    }
  },
});

// They sent the draft from their own email: kept exactly as it was (subject, text, to whom, when), and on the
// timeline as Followed up, which marks the follow-up reminder done and starts the quiet over. Marking the same draft
// again changes nothing.
export const markSent = mutation({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const p = await ownPursuit(ctx, pursuitId);
    const draft = await rowOf(ctx, pursuitId, "draft");
    if (!draft) throw new ConvexError("Write the follow-up first.");
    if ((await sentOf(ctx, pursuitId)).some((s) => s.at >= draft.at)) return null;
    const c = draft.contactId ? await ctx.db.get(draft.contactId) : null;
    const to = c ? (c.email ? `${c.name} <${c.email}>` : c.name) : undefined;
    const id = await ctx.db.insert("followUps", {
      workspaceId: p.workspaceId,
      pursuitId,
      state: "sent",
      ...(draft.contactId ? { contactId: draft.contactId } : {}),
      ...(to ? { to } : {}),
      subject: draft.subject,
      text: draft.text,
      factIds: draft.factIds,
      ...(draft.edited ? { edited: true } : {}),
      at: Date.now(),
    });
    // The same moment as the snapshot, so undoing it finds its entry.
    await change(ctx, p, {}, { event: "followedUp", text: `${c?.name ?? "the hiring team"}: ${draft.subject}` });
    return id;
  },
});

// Undo marking one sent: the snapshot and its timeline entry go, and the pursuit's last activity goes back to what it
// was before, so the follow-up reminder shows again.
export const undoSent = mutation({
  args: { id: v.id("followUps") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.workspaceId !== workspaceId || row.state !== "sent") throw new ConvexError("Not found.");
    const p = await own(ctx, workspaceId, row.pursuitId);
    await ctx.db.delete(id);
    const entry = p.timeline.findLastIndex((e) => e.event === "followedUp" && e.at === row.at);
    const timeline = entry < 0 ? p.timeline : p.timeline.filter((_, i) => i !== entry);
    const lastActivity = timeline.findLast((e) => e.event !== "snoozed");
    await ctx.db.patch(p._id, { timeline, changedAt: lastActivity?.at ?? p.at });
  },
});

const SYSTEM = `You write a short follow-up email from someone about a role, to a person at the company, when an application or an outreach message has gone quiet, or after an interview. You get their approved career record (the only source of claims about them), the role, what the follow-up follows (an application through the posting, an outreach message to this person, or both), where the pursuit stands (its status, when they applied, the interview, its timeline, with dates), what they already sent, and who they are writing to (when no one in particular, write to the hiring team).

Write it the way a considerate person follows up: a subject line, then a few sentences. Say what it follows and when (after an interview, thank them for it and say when it was). Add one thing from the record that matters to this role and that they haven't already said in what they sent. Make one small, clear ask, such as where things stand or what the next step is; after an outreach message, a short call, or if that isn't possible, who the right person to talk to would be. Stay polite and brief: never pushy, never a complaint about the wait. Never add a claim, number, tool or title the record doesn't have, and never say something happened that the timeline doesn't show. First person; sign off with their name when it's given.

List the ids of the approved facts it rests on ("factIds").

${OUTREACH_STYLE}
${PLAIN_LANGUAGE}

Reply with JSON only: {"subject": "...", "text": "...", "factIds": ["..."]}.`;
export const FOLLOW_UP_SCHEMA: ReplySchema = { name: "follow_up", schema: strictObject({ subject: string, text: string, factIds: strings }) };

// One timeline entry in words, for the prompt; null for entries that say nothing about the application.
function entryText(e: Doc<"pursuits">["timeline"][number]): string | null {
  switch (e.event) {
    case "started":
      return "Started going after the role";
    case "status":
      return e.status ? `Status set to ${statusText(e.status, e.reason ?? null)}` : null;
    case "interview":
      return e.text ? `Interview set for ${e.text}` : "Interview date cleared";
    case "prepared":
      return "Prepared for the interview";
    case "letter":
      return e.text === "written" || e.text === "edited" ? "Cover letter written" : null;
    case "outreach":
      return e.text ? `Sent a message to ${e.text}` : "Sent a message";
    case "followedUp":
      return e.text ? `Followed up with ${e.text}` : "Followed up";
    default:
      return null;
  }
}

// What a follow-up rests on besides the record and the role: what it follows (an application, an outreach message to
// this person, or both), where the pursuit stands, what was already sent (earlier follow-ups, and outreach to this
// person), and who it's to.
export const standing = internalQuery({
  args: { pursuitId: v.id("pursuits"), contactId: v.optional(v.id("contacts")) },
  handler: async (ctx, { pursuitId, contactId }) => {
    const p = await ctx.db.get(pursuitId);
    if (!p) return null;
    const c = contactId ? await ctx.db.get(contactId) : null;
    const contact = c && c.pursuitId === pursuitId ? c : null;
    const sent = await sentOf(ctx, pursuitId);
    const wrote = (contact?.sent?.length ?? 0) > 0;
    return {
      follows: (wrote && p.appliedAt !== undefined ? "both" : wrote ? "outreach" : "application") as "both" | "outreach" | "application",
      status: statusText(p.status, p.closedReason ?? null),
      appliedAt: p.appliedAt !== undefined ? dayText(p.appliedAt) : null,
      interviewAt: p.interviewAt ?? null,
      timeline: p.timeline.flatMap((e) => {
        const words = entryText(e);
        return words ? [`${dayText(e.at)}: ${words}`] : [];
      }),
      followUps: [...sent].reverse().map((s) => ({ on: dayText(s.at), to: s.to ?? "the hiring team", subject: s.subject, text: s.text })),
      outreach: (contact?.sent ?? []).map((s) => ({ on: dayText(s.at), subject: s.subject, text: s.text })),
      contact: contact ? { name: contact.name, title: contact.title ?? null, hiringManager: !!contact.hiringManager } : null,
    };
  },
});

// A written follow-up: the draft, or with a draft already there, the newer version waiting to be kept (in place of an
// older one). Not a change on the timeline: writing isn't following up, so the reminder stays. A retried run saves
// nothing twice.
export const save = internalMutation({
  args: { runId: v.id("jobs"), pursuitId: v.id("pursuits"), contactId: v.optional(v.id("contacts")), subject: v.string(), text: v.string(), factIds: v.array(v.string()) },
  handler: async (ctx, { runId, pursuitId, contactId, ...message }) => {
    if (await ctx.db.query("followUps").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return;
    const p = await ctx.db.get(pursuitId);
    if (!p) return;
    const draft = await rowOf(ctx, pursuitId, "draft");
    if (draft) {
      const older = await rowOf(ctx, pursuitId, "rewrite");
      if (older) await ctx.db.delete(older._id);
    }
    await ctx.db.insert("followUps", { workspaceId: p.workspaceId, pursuitId, state: draft ? "rewrite" : "draft", ...(contactId ? { contactId } : {}), ...message, runId, at: Date.now() });
  },
});

export async function runFollowUp(ctx: ActionCtx, job: Doc<"jobs">) {
  const { pursuitId, contactId } = job.args as { pursuitId: Id<"pursuits">; contactId?: Id<"contacts"> };
  const g = await ctx.runQuery(internal.pursuits.grounding, { pursuitId });
  const s = await ctx.runQuery(internal.followUpEmails.standing, { pursuitId, ...(contactId ? { contactId } : {}) });
  if (!g || !s) return null;
  if (!g.record.facts.length) throw new Error("Approve some facts first; messages are written only from your approved record.");
  const choice = await modelFor(ctx, job.workspaceId, "followUp");
  const to = s.contact ? `${s.contact.name}${s.contact.title ? `, ${s.contact.title}` : ""}${s.contact.hiringManager ? " (likely the hiring manager for this role)" : ""}` : "No one in particular: the hiring team";
  const reply = await chatJson<{ subject?: unknown; text?: unknown; factIds?: unknown }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "follow-up",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: FOLLOW_UP_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          `Their name: ${g.name ?? "(not given)"}`,
          `Their approved record (cite facts by id):\n${JSON.stringify(g.record)}`,
          g.role.open
            ? `The role: ${g.role.title} at ${g.role.company}${g.role.companySummary ? `\nAbout the company: ${g.role.companySummary}` : ""}\n\n${g.role.description ?? "(no description)"}`
            : `No open role: they're after ${g.role.title} work at ${g.role.company}${g.role.companySummary ? `\nAbout the company: ${g.role.companySummary}` : ""}`,
          `What it follows: ${{ application: "their application through the posting", outreach: "their outreach message to this person (they haven't applied through the posting)", both: "their application through the posting and their outreach message to this person" }[s.follows]}.`,
          `Where it stands: ${s.status}. Applied: ${s.appliedAt ?? "(not applied)"}. Interview: ${s.interviewAt ?? "(none set)"}. Today: ${dayText(Date.now())}.`,
          `Its timeline, oldest first:\n${s.timeline.join("\n") || "(nothing yet)"}`,
          `Follow-ups already sent:\n${s.followUps.length ? JSON.stringify(s.followUps) : "(none)"}`,
          `Messages already sent to this person:\n${s.outreach.length ? JSON.stringify(s.outreach) : "(none)"}`,
          `Writing to: ${to}`,
        ].join("\n\n"),
      },
    ],
  });
  const approved = new Set(g.record.facts.map((f) => String(f.id)));
  const out = reply.out;
  const text = typeof out.text === "string" ? out.text.trim() : "";
  if (!text) throw new Error("The reply wasn't a message. Try again.");
  const subject = typeof out.subject === "string" && out.subject.trim() ? out.subject.trim() : `Following up: ${g.role.title}`;
  const factIds = [...new Set((Array.isArray(out.factIds) ? out.factIds : []).map(String).filter((id) => approved.has(id)))];
  await ctx.runMutation(internal.followUpEmails.save, { runId: job._id, pursuitId, ...(contactId ? { contactId } : {}), subject, text, factIds });
  return { costUsd: reply.costUsd, model: reply.model };
}
