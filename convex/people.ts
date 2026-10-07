import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, query } from "./_generated/server";
import { action, mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { BUDGET_REACHED, type BudgetReached } from "./budgets";
import { CONTACT_GROUPS, type ContactGroup, grouped, groupOf, inOrder, RECRUITING_TITLES, teamTitle } from "./contactGroups";
import { apollo, chatJson, spendingFor } from "./metering";
import { type ReplySchema, strictObject, string, strings } from "./replyJson";
import { change, own } from "./pursuits";
import { beforeConversation, PURSUIT_STATUSES } from "./pursuitSteps";
import { OUTREACH_STYLE, PLAIN_LANGUAGE } from "./writingGuides";
import { requireWorkspace } from "./workspaces";

// Contacts at a pursuit's company, only when they ask. Finding them is free Apollo searches, for all three groups
// (contactGroups.ts); an email is revealed only for the person they choose (1 credit), through metering, so it never
// goes past the Apollo balance or their own cap and nothing is spent when the balance can't be read. An outreach
// message is written from the approved record; they send it from their own email and mark it sent. Each step goes on
// the pursuit's timeline.

// The leaders search: who could be the hiring manager.
const SENIORITIES = ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager"];
const contactGroup = v.union(...CONTACT_GROUPS.map((g) => v.literal(g)));

// A budget stop, as words they can act on.
function plain(e: unknown): never {
  if (e instanceof ConvexError && (e.data as BudgetReached)?.code === BUDGET_REACHED) throw new ConvexError((e.data as BudgetReached).message);
  throw e instanceof Error ? new ConvexError(e.message) : e;
}

export const target = internalQuery({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, pursuitId);
    const c = await ctx.db.get(p.companyId);
    return { workspaceId, title: p.title, company: { name: p.company, apolloId: c?.apolloId ?? null, domain: c?.domain ?? null } };
  },
});

// Find contacts at the company: three free Apollo searches, one per group (leaders, the role's own work at every level,
// and recruiting titles), each person once, in groups. Found again replaces the list, keeping anyone whose email was
// revealed and the group they moved anyone to.
export const find = action({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }): Promise<number> => {
    const t = await ctx.runQuery(internal.people.target, { pursuitId });
    if (!t.company.apolloId && !t.company.domain) throw new ConvexError("Apollo can't look up this company: it has no website on file. Add a contact you know instead.");
    const org: Record<string, string[]> = t.company.apolloId ? { organization_ids: [t.company.apolloId] } : { q_organization_domains_list: [t.company.domain!] };
    const searches: Record<string, string[]>[] = [{ person_seniorities: SENIORITIES }, { person_titles: [teamTitle(t.title)] }, { person_titles: RECRUITING_TITLES }];
    const seen = new Map<string, { apolloId: string; name: string; title?: string }>();
    for (const filter of searches) {
      const body = (await apollo(spendingFor(ctx, { origin: "you", pursuitId }), { workspaceId: t.workspaceId, purpose: "find people", endpoint: "mixed_people/api_search", automated: false, params: { ...org, ...filter, per_page: 25, page: 1 } }).catch(plain)) as {
        people?: { id?: string; first_name?: string; last_name_obfuscated?: string; last_name?: string; title?: string }[];
      };
      for (const x of body.people ?? [])
        if (x.id && x.first_name && !seen.has(x.id)) seen.set(x.id, { apolloId: x.id, name: [x.first_name, x.last_name ?? x.last_name_obfuscated].filter(Boolean).join(" "), ...(x.title ? { title: x.title } : {}) });
    }
    await ctx.runMutation(internal.people.saveFound, { pursuitId, people: grouped(t.title, [...seen.values()]) });
    return seen.size;
  },
});

export const saveFound = internalMutation({
  args: { pursuitId: v.id("pursuits"), people: v.array(v.object({ apolloId: v.string(), name: v.string(), title: v.optional(v.string()), hiringManager: v.boolean() })) },
  handler: async (ctx, { pursuitId, people }) => {
    const p = await ctx.db.get(pursuitId);
    if (!p) return;
    const old = await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId)).collect();
    const kept = new Set(old.flatMap((c) => (c.revealedAt !== undefined && c.apolloId ? [c.apolloId] : [])));
    const moved = new Map(old.flatMap((c) => (c.group && c.apolloId ? [[c.apolloId, c.group] as const] : [])));
    // Anyone revealed, and anyone they added by hand, stays.
    for (const c of old) if (c.revealedAt === undefined && c.apolloId) await ctx.db.delete(c._id);
    const at = Date.now();
    for (const [i, x] of people.entries()) {
      const group = moved.get(x.apolloId);
      if (!kept.has(x.apolloId)) await ctx.db.insert("contacts", { workspaceId: p.workspaceId, pursuitId, ...x, ...(group ? { group } : {}), at: at + i });
    }
    await change(ctx, p, {}, { event: "people", text: String(people.length) });
  },
});

export const contact = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(contactId);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    return c;
  },
});

// Reveal the email of the person they chose: 1 Apollo credit, within the balance and their cap. Once revealed, never
// paid for again, here or on another pursuit: the same Apollo person revealed anywhere in the workspace is copied.
export const reveal = action({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }): Promise<string | null> => {
    const c = await ctx.runQuery(internal.people.contact, { contactId });
    if (c.revealedAt !== undefined || !c.apolloId) return c.email ?? null;
    const earlier = await ctx.runQuery(internal.people.revealedBefore, { workspaceId: c.workspaceId, apolloId: c.apolloId });
    if (earlier) {
      await ctx.runMutation(internal.people.saveRevealed, { contactId, name: earlier.name, ...(earlier.email ? { email: earlier.email } : {}), ...(earlier.linkedinUrl ? { linkedinUrl: earlier.linkedinUrl } : {}) });
      return earlier.email ?? null;
    }
    const body = (await apollo(spendingFor(ctx, { origin: "you", pursuitId: c.pursuitId }), { workspaceId: c.workspaceId, purpose: "reveal an email", endpoint: "people/match", automated: false, params: { id: c.apolloId, reveal_personal_emails: "false" } }).catch(plain)) as {
      person?: { name?: string; email?: string; linkedin_url?: string; title?: string };
    };
    const person = body.person ?? {};
    await ctx.runMutation(internal.people.saveRevealed, {
      contactId,
      ...(person.name ? { name: person.name } : {}),
      ...(person.email ? { email: person.email } : {}),
      ...(person.linkedin_url ? { linkedinUrl: person.linkedin_url } : {}),
    });
    return person.email ?? null;
  },
});

// The same Apollo person, already revealed for another pursuit in the workspace.
export const revealedBefore = internalQuery({
  args: { workspaceId: v.id("workspaces"), apolloId: v.string() },
  handler: async (ctx, { workspaceId, apolloId }) => {
    const rows = await ctx.db.query("contacts").withIndex("by_apollo", (q) => q.eq("workspaceId", workspaceId).eq("apolloId", apolloId)).collect();
    return rows.find((c) => c.revealedAt !== undefined) ?? null;
  },
});

export const saveRevealed = internalMutation({
  args: { contactId: v.id("contacts"), name: v.optional(v.string()), email: v.optional(v.string()), linkedinUrl: v.optional(v.string()) },
  handler: async (ctx, { contactId, ...found }) => {
    const c = await ctx.db.get(contactId);
    const p = c && (await ctx.db.get(c.pursuitId));
    if (!c || !p) return;
    await ctx.db.patch(contactId, { ...found, revealedAt: Date.now() });
    await change(ctx, p, {}, { event: "revealed", text: found.name ?? c.name });
  },
});

// Add someone they know at the company, with the email they typed, in the group they choose: no Apollo, no credit.
export const add = mutation({
  args: { pursuitId: v.id("pursuits"), name: v.string(), title: v.string(), email: v.string(), group: contactGroup },
  handler: async (ctx, { pursuitId, group, ...typed }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, pursuitId);
    const name = typed.name.trim();
    const title = typed.title.trim();
    const email = typed.email.trim();
    if (!name) throw new ConvexError("Write their name.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("That email doesn't look right.");
    const at = Date.now();
    const id = await ctx.db.insert("contacts", { workspaceId, pursuitId, name, ...(title ? { title } : {}), group, ...(email ? { email } : {}), revealedAt: at, at });
    await change(ctx, p, {}, { event: "added", text: name });
    return id;
  },
});

// Move someone to another group. Their choice wins over the one worked out from the title, and stays when they find
// again.
export const setGroup = mutation({
  args: { contactId: v.id("contacts"), group: contactGroup },
  handler: async (ctx, { contactId, group }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(contactId);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    await ctx.db.patch(contactId, { group });
  },
});

// The contacts found for a pursuit, in their groups (Hiring manager, Team, Recruiting) and the order found, with the
// approved facts their drafts cite.
export const list = query({
  args: { pursuitId: v.id("pursuits") },
  handler: async (ctx, { pursuitId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await own(ctx, workspaceId, pursuitId);
    const rows = inOrder(p.title, await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", pursuitId)).collect());
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const facts: Record<string, string> = {};
    for (const id of new Set(rows.flatMap((c) => c.draft?.factIds ?? []))) {
      const f = await ctx.db.get(id as Id<"items">);
      if (f?.kind === "fact" && f.status === "approved" && f.workspaceId === workspaceId) facts[id] = f.data.text;
    }
    return {
      facts,
      people: rows.map((c) => {
        const last = jobs.find((j) => j.kind === "outreach" && j.args.contactId === c._id);
        return {
          id: c._id,
          name: c.name,
          title: c.title ?? null,
          hiringManager: !!c.hiringManager,
          group: c.group ?? groupOf(p.title, c.title),
          revealed: c.revealedAt !== undefined,
          added: !c.apolloId,
          repliedAt: c.repliedAt ?? null,
          email: c.email ?? null,
          linkedinUrl: c.linkedinUrl ?? null,
          draft: c.draft ?? null,
          // Sent messages, newest first; whether the current draft is among them.
          sent: [...(c.sent ?? [])].reverse(),
          draftSent: !!c.draft && (c.sent ?? []).some((x) => x.at >= c.draft!.at),
          writing: last?.status === "queued" || last?.status === "running",
          failed: last?.status === "failed" ? (last.error ?? "") : null,
        };
      }),
    };
  },
});

// Everyone found at a company across their pursuits there, each once, in their groups: for the company's details.
// Names and titles only; emails stay with the pursuit they were revealed for.
export const atCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(companyId);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const pursuits = (await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).filter((p) => p.companyId === companyId);
    const seen = new Set<string>();
    const people: { name: string; title: string | null; hiringManager: boolean; group: ContactGroup; pursuitId: Id<"pursuits"> }[] = [];
    for (const p of pursuits)
      for (const x of await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", p._id)).collect()) {
        const key = x.apolloId ?? `${x.name}|${x.email ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        people.push({ name: x.name, title: x.title ?? null, hiringManager: !!x.hiringManager, group: x.group ?? groupOf(p.title, x.title), pursuitId: p._id });
      }
    return people.sort((a, b) => CONTACT_GROUPS.indexOf(a.group) - CONTACT_GROUPS.indexOf(b.group) || Number(b.hiringManager) - Number(a.hiringManager));
  },
});

// Write an outreach message to one person they found.
export const draft = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(contactId);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    if (jobs.some((j) => j.kind === "outreach" && j.args.contactId === contactId && (j.status === "queued" || j.status === "running"))) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "outreach", args: { contactId, pursuitId: c.pursuitId }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// They sent the current draft from their own email: kept exactly as it was (subject, text, to whom, when) on the
// person, and on the pursuit's timeline. The first one sent dates the pursuit's Contacted, and moves it there from
// Preparing. Marking the same draft sent again changes nothing; a later draft never touches what was sent.
export const markSent = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(contactId);
    if (!c || c.workspaceId !== workspaceId || !c.draft) throw new ConvexError("Not found.");
    const p = await own(ctx, workspaceId, c.pursuitId);
    if ((c.sent ?? []).some((x) => x.at >= c.draft!.at)) return;
    const at = Date.now();
    const to = c.email ? `${c.name} <${c.email}>` : c.name;
    await ctx.db.patch(contactId, { sent: [...(c.sent ?? []), { subject: c.draft.subject, text: c.draft.text, to, at }] });
    await change(ctx, p, { ...(p.contactedAt === undefined ? { contactedAt: at } : {}) }, { event: "outreach", text: `${c.name}: ${c.draft.subject}` });
    if (p.status === "preparing") {
      const moved = await ctx.db.get(p._id);
      if (moved) await change(ctx, moved, { status: "contacted" }, { event: "status", status: "contacted" });
    }
  },
});

// A contact answered: anything from a person there, "not now" included. Kept on the contact and, the first time, on
// the pursuit; on the timeline; and a pursuit still at Preparing, Contacted or Applied moves to In conversation. Their
// reminders stop. Returns the status it had, for Undo.
export const markReplied = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(contactId);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const p = await own(ctx, workspaceId, c.pursuitId);
    if (c.repliedAt !== undefined) return p.status;
    const at = Date.now();
    await ctx.db.patch(contactId, { repliedAt: at });
    await change(ctx, p, { ...(p.repliedAt === undefined ? { repliedAt: at } : {}) }, { event: "replied", text: c.name });
    if (beforeConversation(p.status)) {
      const moved = await ctx.db.get(p._id);
      if (moved) await change(ctx, moved, { status: "inConversation" }, { event: "status", status: "inConversation" });
    }
    return p.status;
  },
});

// Undo a reply: it goes from the contact, the pursuit (whose first reply is then the earliest left) and the timeline;
// `status`, when given, is the one the pursuit goes back to.
export const unmarkReplied = mutation({
  args: { contactId: v.id("contacts"), status: v.optional(v.union(...PURSUIT_STATUSES.map((s) => v.literal(s)))) },
  handler: async (ctx, { contactId, status }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(contactId);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const p = await own(ctx, workspaceId, c.pursuitId);
    const at = c.repliedAt;
    if (at === undefined) return;
    await ctx.db.patch(contactId, { repliedAt: undefined });
    const others = (await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", p._id)).collect()).flatMap((x) => (x._id !== contactId && x.repliedAt !== undefined ? [x.repliedAt] : []));
    const timeline = p.timeline.filter((e) => !(e.at === at && (e.event === "replied" || (e.event === "status" && e.status === "inConversation"))));
    const back = status && p.status === "inConversation" ? { status } : {};
    await ctx.db.patch(p._id, { ...back, repliedAt: others.length ? Math.min(...others) : undefined, timeline });
  },
});

const SYSTEM = `You write an outreach message: a short first email from someone to one person at a company, about a role there or, when there's no open role, about the kind of work they're after. You get their approved career record (the only source of claims about them), the role (or what they're after), and who they are writing to.

It has four parts, in a few sentences, short enough to read on a phone:
1. Who they are: one line, the strongest true framing for this role.
2. Why this role: why this company and team, from the posting and what the company does.
3. Why they fit: the one or two things from the record that matter most here.
4. One small ask that suits the person: of a hiring manager, a short call; of someone on the team, what the team needs or whether they'd pass the name on; of a recruiter, a place in the process or who the hiring manager is.

When they already wrote to someone else there, this is a new message, not a copy; it may say so, never that the other person didn't answer. When they applied, say so in a clause; when they haven't, it may offer to. When there's no open role, "why this role" is why this company and team, and the ask is a short conversation about the team and roles to come.

Give it a subject line. Never add a claim, number, tool or title the record doesn't have. First person; sign off with their name when it's given.

List the ids of the approved facts it rests on ("factIds"), and say in a few words what each part says ("parts").

${OUTREACH_STYLE}
${PLAIN_LANGUAGE}

Reply with JSON only: {"subject": "...", "text": "...", "factIds": ["..."], "parts": {"who": "...", "why": "...", "fit": "...", "ask": "..."}}.`;
export const OUTREACH_SCHEMA: ReplySchema = {
  name: "outreach",
  schema: strictObject({ subject: string, text: string, factIds: strings, parts: strictObject({ who: string, why: string, fit: string, ask: string }) }),
};

// Who an outreach message is for: the contact, their group, whether the pursuit was applied to (and when), and the
// others they already wrote to there.
export const outreachTarget = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const c = await ctx.db.get(contactId);
    const p = c && (await ctx.db.get(c.pursuitId));
    if (!c || !p) return null;
    const others = (await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", p._id)).collect()).filter((x) => x._id !== contactId && (x.sent?.length ?? 0) > 0);
    return {
      name: c.name,
      title: c.title ?? null,
      group: c.group ?? groupOf(p.title, c.title),
      hiringManager: !!c.hiringManager,
      appliedAt: p.appliedAt ?? null,
      wroteTo: others.map((x) => ({ name: x.name, title: x.title ?? null, group: x.group ?? groupOf(p.title, x.title) })),
    };
  },
});

const parts = v.object({ who: v.string(), why: v.string(), fit: v.string(), ask: v.string() });

export const saveDraft = internalMutation({
  args: { contactId: v.id("contacts"), subject: v.string(), text: v.string(), factIds: v.array(v.string()), parts: v.optional(parts) },
  handler: async (ctx, { contactId, ...d }) => {
    await ctx.db.patch(contactId, { draft: { ...d, at: Date.now() } });
  },
});

const PART_KEYS = ["who", "why", "fit", "ask"] as const;

export async function runOutreach(ctx: ActionCtx, job: Doc<"jobs">) {
  const { contactId, pursuitId } = job.args as { contactId: Id<"contacts">; pursuitId: Id<"pursuits"> };
  const c = await ctx.runQuery(internal.people.outreachTarget, { contactId });
  const g = await ctx.runQuery(internal.pursuits.grounding, { pursuitId });
  if (!c || !g) return null;
  if (!g.record.facts.length) throw new Error("Approve some facts first; messages are written only from your approved record.");
  const choice = await modelFor(ctx, job.workspaceId, "outreach");
  const who = `${c.name}${c.title ? `, ${c.title}` : ""}`;
  const group = { hiringManager: c.hiringManager ? "likely the hiring manager for this role" : "a possible hiring manager for this role", team: "on the team, close to the work", recruiting: "in recruiting" }[c.group];
  const wrote = c.wroteTo.length ? `\n\nThey already wrote to: ${c.wroteTo.map((x) => `${x.name}${x.title ? `, ${x.title}` : ""}`).join("; ")}` : "";
  const applied = !g.role.open ? "" : c.appliedAt ? `\n\nThey applied through the posting on ${new Date(c.appliedAt).toISOString().slice(0, 10)}.` : "\n\nThey haven't applied through the posting.";
  const role = g.role.open
    ? `The role: ${g.role.title} at ${g.role.company}${g.role.companySummary ? `\nAbout the company: ${g.role.companySummary}` : ""}\n\n${g.role.description ?? "(no description)"}`
    : `No open role: they're after ${g.role.title} work at ${g.role.company}${g.role.companySummary ? `\nAbout the company: ${g.role.companySummary}` : ""}`;
  const reply = await chatJson<{ subject?: unknown; text?: unknown; factIds?: unknown; parts?: Record<string, unknown> }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "outreach",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: OUTREACH_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Their name: ${g.name ?? "(not given)"}\n\nTheir approved record (cite facts by id):\n${JSON.stringify(g.record)}\n\n${role}\n\nWriting to: ${who} (${group})${wrote}${applied}`,
      },
    ],
  });
  const approved = new Set(g.record.facts.map((f) => String(f.id)));
  const out = reply.out;
  const text = typeof out.text === "string" ? out.text.trim() : "";
  if (!text) throw new Error("The reply wasn't a message. Try again.");
  const subject = typeof out.subject === "string" && out.subject.trim() ? out.subject.trim() : `${g.role.title}`;
  const factIds = [...new Set((Array.isArray(out.factIds) ? out.factIds : []).map(String).filter((id) => approved.has(id)))];
  const said = PART_KEYS.map((k) => (typeof out.parts?.[k] === "string" ? (out.parts[k] as string).trim() : ""));
  await ctx.runMutation(internal.people.saveDraft, { contactId, subject, text, factIds, ...(said.every(Boolean) ? { parts: { who: said[0], why: said[1], fit: said[2], ask: said[3] } } : {}) });
  return { costUsd: reply.costUsd, model: reply.model };
}
