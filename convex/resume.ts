import type { FunctionReturnType } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import type { ModelChoice } from "./aiTasks";
import { type ChatReply, chatJson, LONG_REPLY_TOKENS } from "./metering";
import { listOf, type ReplySchema, replyOf, string, strictObject, strings } from "./replyJson";
import { isSkill, type ItemOf, itemsOf } from "./itemShapes";
import { type CountedRecord, counted, countedRecord, recordOf, sourceCheck } from "./recordContext";
import { type Basis, basisOf, type Changes, changesSince, describeChanges, hasChanges, type Labels, markOf, resumeBasis } from "./resumeBasis";
import { type FactStatus, lineFlags, versionChanges } from "./resumeHistory";
import {
  arrange,
  type Bullet,
  type Entry,
  bulletTexts,
  cleanDoc,
  DOC_SPEC,
  foldChoice,
  type LayoutRole,
  type LineCheck,
  layoutRole,
  mergeLayout,
  PLACEMENT,
  part,
  present,
  recordDoc,
  type ResumeDoc,
  resumeDoc,
  type ResumeLayout,
  type ResumeLength,
  resumeLength,
  resumeTitle,
  suggestTitle,
  TITLE,
  toPlain,
} from "./resumeDoc";
import { connections } from "./sameWork";
import { dayOf, tally } from "./tallies";
import { FACT_STYLE, PLAIN_LANGUAGE } from "./writingGuides";
import { syncSoon } from "./driveSoon";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Resumes at three levels, all structured (resumeDoc.ts) and written only from the approved record: the base resume
// (neutral), a direction resume (aimed at one direction), and a tailored resume (one posting, with a requirements map).
// Nothing unreviewed, rejected or taken straight from a narrative goes in. Every version is kept.
// How each version shows is the person's choice, never a rewrite: folds, career breaks and projects left out set once on
// the record, titles on the base resume (all in resumeSettings), and overridden per resume (layout).

const SYSTEM = `You write a strong base resume for someone from their approved career record. It should read like them on a good day: specific, confident, honest.

Use only what the record gives: roles, projects, approved facts, approved insights and context. Never add a claim, number, tool or title the record doesn't have. Ownership follows the facts: full strength for what they did, nothing credited to them that the facts give to a product, team or company.

Shape:
- A short summary at the top: who they are and their one or two strongest proofs, readable in ten seconds (two or three sentences, no first-person pronouns). The rest of the resume carries the detail.
- Experience, most recent first: title, employer, dates, location when known; then the most important facts for that role as bullets, strongest first. Promotions and title changes at one employer read as a path.
- Projects: their own repositories from the record, each with its strongest facts as bullets.
- Skills: the approved skills, tools and certifications in the record, grouped plainly.
It's a resume a hiring manager takes in within about two minutes, not the whole record: each result appears once, lines that say the same thing are merged, and routine duties give way to results. This is their base resume: a neutral account of their career, not aimed at any one direction (each direction gets its own resume later). Order bullets by strength and scope.

${FACT_STYLE}
${PLAIN_LANGUAGE}

${DOC_SPEC}`;

// A direction resume: the same record, aimed at one kind of work.
const DIRECTION = `You write a strong resume for someone aimed at one direction, from their approved career record and the approved positioning for that direction.

Use only what the record gives; never add a claim, number, tool or title it doesn't have. Ownership follows the facts. Choose, order and frame the stories that serve this direction: lead with what carries over, tell the reframed stories the way the positioning says, and use the direction's vocabulary where it's true to the record. Past titles stay as they were; where the title map translates one, the bullets can show the equivalent scope, but the title line itself is never changed. Two direction resumes can read like two different people, and both must be true.

Shape: a summary aimed at this direction (two or three sentences, no first-person pronouns); experience, most recent first, with the bullets that matter for this direction, strongest first; projects, with what serves this direction; the approved skills, tools and certifications that this market values. A hiring manager takes it in within about two minutes: each result once, no padding.

${FACT_STYLE}
${PLAIN_LANGUAGE}

${DOC_SPEC}`;

// A tailored resume: starts from a direction resume and bends it toward one posting, with an honest requirements map.
const TAILOR = `You tailor a resume to one job posting. You get their direction resume (the starting point), their approved record, and the posting.

Bend the direction resume toward this posting: lead with what the posting cares about most, use the posting's own terms where they are true to the record, and cut what doesn't serve it. Use only what the approved record supports; never add a claim, number, tool or title it doesn't have, and never stretch a fact to match a requirement. Past titles stay as they were. Gaps are handled by emphasis, not invention.

A tailored resume is shorter than the direction resume: keep what serves this posting, and let older or unrelated roles shrink to a line or two.

Also map the posting's requirements honestly: each requirement it states, with "strength" "strong" (the record shows it clearly), "partial" (related experience) or "thin" (little or nothing in the record), "factIds" (the approved facts it rests on, empty when thin), and a short "note" when partial or thin saying what's there or missing.

And suggest a title per role (not career breaks) for this posting: a title the facts support, in the posting's wording. It names the work that role's approved facts show, at the level they show, in the terms this posting uses. Leave a role out when its facts support nothing closer to the posting than its official title. These are only offered to the person, to show beside or instead of the official title; the resume's own title lines stay as they are.

${FACT_STYLE}
${PLAIN_LANGUAGE}

Reply with JSON only: {"resume": <the resume in the shape below>, "requirements": [{"requirement": "...", "strength": "...", "factIds": [...], "note": "..."}], "titles": [{"roleKey": "...", "title": "..."}]}.
${DOC_SPEC.replace("Reply with JSON only, in this shape:", "Resume shape:")}`;

// DOC_SPEC's shape as a schema (structured output, metering.chat), and a tailored reply's around it.
const bullets = listOf({ text: string, factIds: strings });
const DOC_SCHEMA = strictObject({
  summary: string,
  experience: listOf({ employer: string, title: string, location: string, start: string, end: string, roleKey: string, bullets }),
  projects: listOf({ projectKey: string, bullets }),
  skills: listOf({ group: string, items: strings }),
});
const RESUME_SCHEMA: ReplySchema = { name: "resume", schema: DOC_SCHEMA };
const TAILORED_SCHEMA: ReplySchema = {
  name: "tailored_resume",
  schema: strictObject({
    resume: DOC_SCHEMA,
    requirements: listOf({ requirement: string, strength: { type: "string", enum: ["strong", "partial", "thin"] }, factIds: strings, note: string }),
    titles: listOf({ roleKey: string, title: string }),
  }),
};

// Write a resume: the base one (no direction), a direction's, or one tailored to a posting from a direction's. The
// posting is pasted (posting) or a role from the Roles page (postingId: its title, company, place and description).
// With no direction resume yet, tailoring writes it first, in the same run.
export const start = mutation({
  args: { directionId: v.optional(v.id("items")), posting: v.optional(v.string()), postingId: v.optional(v.id("postings")) },
  handler: async (ctx, { directionId, posting, postingId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (postingId) {
      const p = await ctx.db.get(postingId);
      if (!p || p.workspaceId !== workspaceId) throw new Error("Not found.");
      const text = (await ctx.db.query("postingTexts").withIndex("by_posting", (q) => q.eq("postingId", postingId)).first())?.text;
      if (!text) throw new ConvexError(p.descriptionAt !== undefined ? "The job board has no description for this role." : "This role’s description hasn’t been read yet.");
      const company = (await ctx.db.get(p.companyId))?.name;
      posting = `${p.title}${company ? ` at ${company}` : ""}${p.location ? ` · ${p.location}` : ""}\n\n${text}`;
    }
    if (posting !== undefined && !posting.trim()) throw new ConvexError("Paste the job posting first.");
    if (posting !== undefined && !directionId) throw new ConvexError("Choose the direction to start from.");
    if (directionId) await checkDirection(ctx, workspaceId, directionId);
    if ((await writing(ctx, workspaceId)).length) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "resume", args: { directionId, posting: posting?.trim(), postingId }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// A direction can have resumes while it's approved with approved positioning.
async function checkDirection(ctx: QueryCtx, workspaceId: Id<"workspaces">, directionId: Id<"items">) {
  const d = await getInWorkspace(ctx, workspaceId, directionId);
  if (!d || d.kind !== "direction" || d.status !== "approved") throw new Error("Not found.");
  if (d.data.detailStatus !== "approved") throw new ConvexError("Approve this direction's positioning first.");
}

// The resume runs queued or running.
async function writing(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  return jobs.filter((j) => j.kind === "resume" && (j.status === "queued" || j.status === "running"));
}
// Whether a run writes the base resume (no direction) or this direction's resume; a tailoring run writes a tailored one,
// and an Add what's new run only new lines.
const writes = (job: Doc<"jobs">, directionId: Id<"items"> | undefined) => job.args.posting === undefined && !job.args.lines && job.args.directionId === directionId;

// A version written from Resume updates: queued like any run, and saved to be kept or discarded.
async function queueRewrite(ctx: MutationCtx, workspaceId: Id<"workspaces">, directionId: Id<"items"> | undefined, delayMs: number) {
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "resume", args: { directionId, review: true }, status: "queued", origin: "you" });
  await ctx.scheduler.runAfter(delayMs, internal.jobs.run, { jobId });
  return jobId;
}

// A base or direction resume's current version (its newest kept one) and a version from Resume updates waiting to be
// kept or discarded. The waiting one is never the resume (not shown, downloaded, tailored from, inherited from or
// compared with) until it's kept.
export async function versionsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, directionId: Id<"items"> | undefined) {
  const rows = (await ctx.db.query("resumes").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId)).order("desc").collect()).filter(
    (r) => r.posting === undefined,
  );
  return { current: rows.find((r) => !r.toReview), waiting: rows.find((r) => r.toReview && !r.discarded) };
}

// What a run writes from: the approved record that counts and, for a direction resume, the direction with its approved
// positioning. The basis is taken from the same items, so it says exactly what this version was written from. Pairs of
// facts connected as the same work (sameWork.ts) are written as one line: `sameWork` maps each pair's other fact to its
// lead.
export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), directionId: v.optional(v.id("items")) },
  handler: async (ctx, { workspaceId, directionId }) => {
    const items = await countedRecord(ctx, workspaceId);
    const d = directionId ? items.directions.find((x) => x._id === directionId && x.data.detailStatus === "approved") : undefined;
    const direction = d ? { name: d.data.name, includes: d.data.includes, summary: d.data.summary, detail: d.data.detail } : null;
    // Tailoring starts from the direction's current resume, never one still waiting to be kept.
    const from = directionId ? (await versionsOf(ctx, workspaceId, directionId)).current : undefined;
    // A tailored resume is written to its direction's length (and shorter than its direction resume).
    const { length } = lengthOf(await settingsOf(ctx, workspaceId), directionId);
    const sameWork = Object.fromEntries([...connections(items.facts, items.projects)].flatMap(([id, c]) => (c.lead === id ? [] : [[id, c.lead] as const])));
    return {
      record: recordOf(items),
      sameWork,
      direction,
      length,
      writtenFrom: basisOf(items, d, length),
      directionResume: (from?.doc as ResumeDoc | undefined) ?? (from?.text ? { text: from.text } : null),
    };
  },
});

// What a run has saved already: its direction (or base) resume, its tailored one.
export const savedBy = internalQuery({
  args: { runId: v.id("jobs") },
  handler: async (ctx, { runId }) => {
    const saved = await ctx.db.query("resumes").withIndex("by_run", (q) => q.eq("runId", runId)).collect();
    return { plain: saved.some((r) => r.posting === undefined), tailored: saved.some((r) => r.posting !== undefined) };
  },
});

export const save = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    runId: v.id("jobs"),
    doc: resumeDoc,
    writtenFrom: v.optional(resumeBasis),
    toReview: v.optional(v.literal(true)),
    model: v.string(),
    directionId: v.optional(v.id("items")),
    posting: v.optional(v.string()),
    postingId: v.optional(v.id("postings")),
    requirements: v.optional(v.any()),
    postingTitles: v.optional(v.array(v.object({ roleKey: v.string(), title: v.string() }))),
  },
  handler: async (ctx, args) => {
    // A retried run that already saved its version saves nothing twice.
    if ((await ctx.db.query("resumes").withIndex("by_run", (q) => q.eq("runId", args.runId)).collect()).some((r) => (r.posting === undefined) === (args.posting === undefined))) return null;
    // A resume starts with the overrides of the one it's made from (a tailored one: its direction resume; otherwise the
    // current version at its level), for the roles it still has. A base resume overrides folds and breaks only; its
    // titles are the resume settings.
    const from = (await versionsOf(ctx, args.workspaceId, args.directionId)).current;
    const keys = new Set(args.doc.experience.map((e) => e.roleKey));
    const roles = overrides(from?.layout, !args.directionId).filter((r) => keys.has(r.roleKey));
    const projectKeys = new Set((args.doc.projects ?? []).map((p) => p.projectKey));
    const projects = (from?.layout?.projects ?? []).filter((p) => projectKeys.has(p.projectKey));
    const skillKeys = new Set(args.doc.skills.flatMap((g) => g.keys ?? []));
    const skills = (from?.layout?.skills ?? []).filter((k) => skillKeys.has(k.key));
    // A bullet pinned, hidden or put in their own words stays so where the new version has the same line (without its
    // check against facts: the new version's line may rest on other facts). A summary in their words doesn't carry: a
    // new version is written with its own.
    const lines = bulletTexts(args.doc);
    const bullets = (from?.layout?.bullets ?? []).filter((b) => lines.has(b.text));
    const count = new Map<string, number>();
    for (const b of [...args.doc.experience.flatMap((e) => e.bullets), ...(args.doc.projects ?? []).flatMap((p) => p.bullets)]) count.set(b.text, (count.get(b.text) ?? 0) + 1);
    const words = (from?.layout?.words ?? []).filter((w) => count.get(w.text) === 1).map(({ text, to }) => ({ text, to }));
    const layout = withPart(undefined, { roles, projects, skills, bullets, words });
    // Lines skipped from Add what's new stay skipped for the next version of the same resume.
    const skipped = args.posting === undefined && from?.skipped?.length ? { skipped: from.skipped } : {};
    // Record growth: a tailored resume written, or a version kept at once (one from Resume updates waits to be kept).
    const counted = args.posting !== undefined || !args.toReview;
    const id = await ctx.db.insert("resumes", { ...args, ...(roles.length || projects.length || skills.length || bullets.length || words.length ? { layout } : {}), ...skipped, ...(counted ? { tallied: true } : {}), at: Date.now() });
    if (counted) await tally(ctx, args.workspaceId, args.posting !== undefined ? "tailored" : "resumeKept", dayOf(Date.now()), 1);
    if (!args.toReview) await syncSoon(ctx, args.workspaceId);
    return id;
  },
});

const settingsOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();

// The length a base resume (no directionId) or a direction's resume is written to: its own, else the record's, else two
// pages.
function lengthOf(settings: Doc<"resumeSettings"> | null, directionId: Id<"items"> | undefined) {
  const record: ResumeLength = settings?.length ?? "two";
  const own = settings?.lengths?.find((l) => l.directionId === directionId)?.length ?? null;
  return { own, record, length: own ?? record };
}

// What the writer is asked for at each length. Bullets are counted across experience and projects.
const LENGTH_TARGET: Record<ResumeLength, string> = {
  one: "One page: about 12 to 15 bullets in all, projects included. The most recent roles get 4 to 6 bullets, older ones 1 or 2, and the oldest are condensed to a line with no bullets.",
  two: "Two pages: about 20 to 25 bullets in all, projects included. Recent roles get 4 to 6 bullets, older ones 1 or 2, and the oldest are condensed to a line or a single bullet.",
  full: "Full: every result that earns its place, each told once. Recent roles get the most bullets (4 to 6 or more), older ones fewer, and the oldest are condensed.",
};

// A resume's own overrides. A base resume's are folds and breaks only (older base versions may carry titles; its titles
// are the resume settings).
const overrides = (layout: { roles: LayoutRole[] } | undefined | null, base: boolean) =>
  (layout?.roles ?? []).map((r) => (base ? part(r, PLACEMENT) : r)).filter((r) => Object.keys(r).length > 1);
// A resume's layout with one part replaced (a list part left out when empty), the rest kept.
function withPart(layout: ResumeLayout | undefined, part: Partial<ResumeLayout>): ResumeLayout {
  const { roles, projects, skills, bullets, words, summary, summaryCheck } = { roles: layout?.roles ?? [], projects: layout?.projects ?? [], skills: layout?.skills ?? [], bullets: layout?.bullets ?? [], words: layout?.words ?? [], summary: layout?.summary, summaryCheck: layout?.summaryCheck, ...part };
  return {
    roles,
    ...(projects.length ? { projects } : {}),
    ...(skills.length ? { skills } : {}),
    ...(bullets.length ? { bullets } : {}),
    ...(words.length ? { words } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(summary !== undefined && summaryCheck ? { summaryCheck } : {}),
  };
}
// A resume's own layout as it shows over the settings: its role overrides (overrides), and its projects, skills and
// bullets left out or pinned.
const ownLayout = (layout: ResumeLayout | undefined, base: boolean): ResumeLayout => withPart(layout, { roles: overrides(layout, base) });
// A layout as it shows: a check against facts (lineCheck.ts) only while every fact it was checked against still counts
// and reads the same (`facts`: the facts that count now, by id, shownWith); otherwise it's left out and the line or
// summary can be checked again.
function currentChecks(layout: ResumeLayout, facts: Record<string, string>): ResumeLayout {
  const holds = (c: LineCheck) => !!c.facts && c.facts.every((f) => facts[f.id] !== undefined && markOf(facts[f.id]) === f.mark);
  const { summaryCheck, ...rest } = layout;
  return {
    ...rest,
    ...(summaryCheck && holds(summaryCheck) ? { summaryCheck } : {}),
    ...(layout.words ? { words: layout.words.map(({ check, ...w }) => (check && holds(check) ? { ...w, check } : w)) } : {}),
  };
}
// `roles` with one role's entry replaced (left out when nothing but its roleKey is left).
const replace = (roles: LayoutRole[], next: LayoutRole) => [...roles.filter((r) => r.roleKey !== next.roleKey), ...(Object.keys(next).length > 1 ? [next] : [])];

async function writeSettings(ctx: MutationCtx, workspaceId: Id<"workspaces">, roles: LayoutRole[]) {
  const settings = await settingsOf(ctx, workspaceId);
  if (settings) await ctx.db.patch(settings._id, { roles });
  else await ctx.db.insert("resumeSettings", { workspaceId, roles });
}

// How one entry shows on one resume. Folds and breaks are this resume's override of the record's setting. Titles on
// a base resume are the setting for every resume; on a direction or tailored resume, this resume's override. `role`
// replaces what was chosen for that role at this level, so leaving a part out goes back to the level below.
// The written resume isn't touched.
export const setRole = mutation({
  args: { id: v.id("resumes"), role: layoutRole },
  handler: async (ctx, { id, role: { translated, ...role } }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const resume = await getInWorkspace(ctx, workspaceId, id);
    const entry = resume?.doc?.experience.find((e) => e.roleKey === role.roleKey);
    if (!resume?.doc || !entry) throw new Error("Not found.");
    const next: LayoutRole = { ...role, ...(translated?.trim() ? { translated: translated.trim() } : {}) };
    const base = resume.directionId === undefined;
    const settings = (await settingsOf(ctx, workspaceId))?.roles ?? [];
    const kept = settings.find((r) => r.roleKey === role.roleKey);
    const below = base ? replace(settings, { ...part(kept, PLACEMENT), ...part(next, TITLE) }) : settings;
    const roles = replace(overrides(resume.layout, base), base ? part(next, PLACEMENT) : next);
    const shown = mergeLayout({ roles: below }, { roles }).roles.find((r) => r.roleKey === role.roleKey);
    if (!entry.break && shown?.title && shown.title !== "official" && !shown.translated) throw new ConvexError(`Type the title to show for ${entry.title}.`);
    if (arrange(resume.doc, { roles: below }, { roles }).refused.includes(role.roleKey)) throw new ConvexError(`${entry.title} has no role on that side to fold into.`);
    await ctx.db.patch(id, { layout: { ...resume.layout, roles } });
    if (base) await writeSettings(ctx, workspaceId, below);
  },
});

// How the record is presented on every resume: a role folded into the one before or after it (by date, among approved
// roles and career breaks that count, by the same rules as a resume), or a career break shown, shown with its reason,
// or left out. Each resume can still override it. Only the role's placement changes; its title choices stay.
export const setPresentation = mutation({
  args: { roleKey: v.string(), fold: v.optional(foldChoice), hidden: v.optional(v.boolean()), showReason: v.optional(v.boolean()) },
  handler: async (ctx, { roleKey, fold, hidden, showReason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const roles = await counted(ctx, workspaceId, "role");
    const role = roles.find((r) => r.roleKey === roleKey);
    if (!role) throw new Error("Not found.");
    const settings = (await settingsOf(ctx, workspaceId))?.roles ?? [];
    const next = replace(settings, { ...part(settings.find((r) => r.roleKey === roleKey), TITLE, roleKey), ...(fold ? { fold } : {}), ...(hidden ? { hidden } : {}), ...(showReason ? { showReason } : {}) });
    const record = recordDoc(roles.map((r) => ({ ...r.data, roleKey: r.roleKey })));
    if (arrange(record, { roles: next.map((r) => part(r, PLACEMENT)) }).refused.includes(roleKey)) throw new ConvexError(`${role.data.title ?? "This role"} has no role on that side to fold into.`);
    await writeSettings(ctx, workspaceId, next);
  },
});

// Whether a project shows on every resume, set on the record. Each resume can still override it (setProject).
export const setProjectPresentation = mutation({
  args: { projectKey: v.string(), hidden: v.boolean() },
  handler: async (ctx, { projectKey, hidden }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!(await itemsOf(ctx, workspaceId, "project", "approved")).some((p) => p.projectKey === projectKey)) throw new Error("Not found.");
    const settings = await settingsOf(ctx, workspaceId);
    const projects = [...(settings?.projects ?? []).filter((p) => p.projectKey !== projectKey), ...(hidden ? [{ projectKey, hidden }] : [])];
    if (settings) await ctx.db.patch(settings._id, { projects });
    else await ctx.db.insert("resumeSettings", { workspaceId, roles: [], projects });
  },
});

// Whether a project shows on one resume: shown or left out here, overriding the record's setting, or null to follow it.
// Choosing what the record already says follows it too. The written resume isn't touched.
export const setProject = mutation({
  args: { id: v.id("resumes"), projectKey: v.string(), hidden: v.union(v.boolean(), v.null()) },
  handler: async (ctx, { id, projectKey, hidden }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const resume = await getInWorkspace(ctx, workspaceId, id);
    if (!resume?.doc?.projects?.some((p) => p.projectKey === projectKey)) throw new Error("Not found.");
    const onRecord = !!(await settingsOf(ctx, workspaceId))?.projects?.some((p) => p.projectKey === projectKey && p.hidden);
    const projects = [...(resume.layout?.projects ?? []).filter((p) => p.projectKey !== projectKey), ...(hidden === null || hidden === onRecord ? [] : [{ projectKey, hidden }])];
    await ctx.db.patch(id, { layout: withPart(resume.layout, { projects }) });
  },
});

// Whether an approved skill, tool or certification shows on every resume, set on the record. Each resume can still
// override it (setSkill).
export const setSkillPresentation = mutation({
  args: { key: v.id("items"), hidden: v.boolean() },
  handler: async (ctx, { key, hidden }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, key);
    if (!item || !isSkill(item) || item.status !== "approved") throw new Error("Not found.");
    const settings = await settingsOf(ctx, workspaceId);
    const skills = [...(settings?.skills ?? []).filter((k) => k.key !== key), ...(hidden ? [{ key, hidden }] : [])];
    if (settings) await ctx.db.patch(settings._id, { skills });
    else await ctx.db.insert("resumeSettings", { workspaceId, roles: [], skills });
  },
});

// Whether a skill shows on one resume: shown or left out here, overriding the record's setting, or null to follow it.
// Choosing what the record already says follows it too. The written resume isn't touched.
export const setSkill = mutation({
  args: { id: v.id("resumes"), key: v.string(), hidden: v.union(v.boolean(), v.null()) },
  handler: async (ctx, { id, key, hidden }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const resume = await getInWorkspace(ctx, workspaceId, id);
    if (!resume?.doc?.skills.some((g) => g.keys?.includes(key))) throw new Error("Not found.");
    const onRecord = !!(await settingsOf(ctx, workspaceId))?.skills?.some((k) => k.key === key && k.hidden);
    const skills = [...(resume.layout?.skills ?? []).filter((k) => k.key !== key), ...(hidden === null || hidden === onRecord ? [] : [{ key, hidden }])];
    await ctx.db.patch(id, { layout: withPart(resume.layout, { skills }) });
  },
});

// The record's settings for every resume (folds, career breaks, projects and skills left out, and length), for the
// record page.
export const presentation = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const settings = await settingsOf(ctx, workspaceId);
    return {
      roles: (settings?.roles ?? []).map((r) => part(r, PLACEMENT)).filter((r) => Object.keys(r).length > 1),
      projects: settings?.projects ?? [],
      skills: settings?.skills ?? [],
      length: lengthOf(settings, undefined).record,
    };
  },
});

// How long every resume is written, set on the record. A resume with its own length keeps it.
export const setRecordLength = mutation({
  args: { length: resumeLength },
  handler: async (ctx, { length }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const settings = await settingsOf(ctx, workspaceId);
    if (settings) await ctx.db.patch(settings._id, { length });
    else await ctx.db.insert("resumeSettings", { workspaceId, roles: [], length });
  },
});

// How long the base resume (no direction) or a direction's resume is written, or null to follow the record. Choosing
// what the record already says follows it too. It's the target for the next version; the current one isn't touched.
export const setLength = mutation({
  args: { directionId: v.optional(v.id("items")), length: v.union(resumeLength, v.null()) },
  handler: async (ctx, { directionId, length }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (directionId) await checkDirection(ctx, workspaceId, directionId);
    const settings = await settingsOf(ctx, workspaceId);
    const own = length !== null && length !== lengthOf(settings, directionId).record ? [{ ...(directionId ? { directionId } : {}), length }] : [];
    const lengths = [...(settings?.lengths ?? []).filter((l) => l.directionId !== directionId), ...own];
    if (settings) await ctx.db.patch(settings._id, { lengths });
    else await ctx.db.insert("resumeSettings", { workspaceId, roles: [], lengths });
  },
});

// Pin a bullet on one resume (always shown), hide it (never shown), or null to show it as written. The written resume
// isn't touched.
export const setBullet = mutation({
  args: { id: v.id("resumes"), text: v.string(), state: v.union(v.literal("pinned"), v.literal("hidden"), v.null()) },
  handler: async (ctx, { id, text, state }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const resume = await getInWorkspace(ctx, workspaceId, id);
    if (!resume?.doc || !bulletTexts(resume.doc).has(text)) throw new Error("Not found.");
    const bullets = [...(resume.layout?.bullets ?? []).filter((b) => b.text !== text), ...(state ? [{ text, state }] : [])];
    await ctx.db.patch(id, { layout: withPart(resume.layout, { bullets }) });
  },
});

// The resume open to put in their own words: a tailored one, or a base or direction resume's current version (an older
// one in History stays as it was).
export async function editable(ctx: MutationCtx, workspaceId: Id<"workspaces">, id: Id<"resumes">) {
  const resume = await getInWorkspace(ctx, workspaceId, id);
  if (!resume?.doc) throw new Error("Not found.");
  if (resume.posting === undefined && (await versionsOf(ctx, workspaceId, resume.directionId)).current?._id !== id) throw new ConvexError("Only the current version can be edited. Restore this one first.");
  return { ...resume, doc: resume.doc };
}

// A line in their own words, on this resume only: `text` is CareerBot's words, `to` theirs (null, or CareerBot's words
// again, puts CareerBot's back). It keeps the facts it rests on; the page marks it as theirs. New words clear its check
// against facts (lineCheck.ts) and hold its facts as they read now (marks), so a line flagged for a fact changed since
// (factChanges.ts) is taken as brought up to date. A line the resume has twice word for word is refused: which one they
// meant can't be told.
export const setWords = mutation({
  args: { id: v.id("resumes"), text: v.string(), to: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, text, to }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const resume = await editable(ctx, workspaceId, id);
    const all = [...resume.doc.experience.flatMap((e) => e.bullets), ...(resume.doc.projects ?? []).flatMap((p) => p.bullets)].filter((b) => b.text === text);
    if (!all.length) throw new Error("Not found.");
    if (all.length > 1 && to !== null) throw new ConvexError("This line is on the resume twice, word for word, so which one to change can’t be told. Hide it, or write the resume again.");
    const next = to?.replace(/\s+/g, " ").trim() ?? null;
    if (next === "") throw new ConvexError("Write the line, or hide it instead.");
    const was = resume.layout?.words?.find((w) => w.text === text);
    const same = !!was && was.to === next;
    const cited = new Set(all[0].factIds);
    const marks = same ? was.marks : (await counted(ctx, workspaceId, "fact")).filter((f) => cited.has(String(f._id))).map((f) => ({ id: String(f._id), mark: markOf(f.data.text) }));
    const kept = { ...(same && was.check ? { check: was.check } : {}), ...(marks ? { marks } : {}) };
    const words = [...(resume.layout?.words ?? []).filter((w) => w.text !== text), ...(next && next !== text ? [{ text, to: next, ...kept }] : [])];
    await ctx.db.patch(id, { layout: withPart(resume.layout, { words }) });
    await syncSoon(ctx, workspaceId);
  },
});

// The summary in their own words, on this resume only (null puts CareerBot's back). New words clear its check.
export const setSummary = mutation({
  args: { id: v.id("resumes"), text: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, text }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const resume = await editable(ctx, workspaceId, id);
    const next = text?.trim() ?? null;
    if (next === "") throw new ConvexError("Write the summary, or put CareerBot’s back.");
    const rest = withPart(resume.layout, {});
    const check = rest.summaryCheck && rest.summary === next ? { summaryCheck: rest.summaryCheck } : {};
    delete rest.summary;
    delete rest.summaryCheck;
    await ctx.db.patch(id, { layout: next && next !== resume.doc.summary ? { ...rest, summary: next, ...check } : rest });
    await syncSoon(ctx, workspaceId);
  },
});

type Req = { requirement: string; strength: "strong" | "partial" | "thin"; factIds: string[]; note?: string };

// review: written from Resume updates, so the version waits to be kept or discarded. lines: Add what's new, new lines
// for the current version (writeLines).
type ResumeArgs = { directionId?: Id<"items">; posting?: string; postingId?: Id<"postings">; review?: boolean; lines?: boolean };

export async function runResume(ctx: ActionCtx, job: Doc<"jobs">) {
  const args = job.args as ResumeArgs;
  if (args.lines) return writeLines(ctx, job, args.directionId);
  const saved = await ctx.runQuery(internal.resume.savedBy, { runId: job._id });
  if (args.posting ? saved.tailored : saved.plain) return { alreadySaved: true };
  return writeResume(ctx, job, args);
}

async function writeResume(ctx: ActionCtx, job: Doc<"jobs">, { directionId, posting, postingId, review }: ResumeArgs): Promise<{ roles: number; facts: number; insights: number; costUsd: number; model: string }> {
  const inputs: ResumeInputs = await ctx.runQuery(internal.resume.inputs, { workspaceId: job.workspaceId, directionId });
  const { record, direction, writtenFrom, directionResume } = inputs;
  if (!record.facts.length) throw new Error(NO_FACTS);
  if (directionId && !direction) throw new Error("Approve this direction's positioning first.");
  // Tailoring starts from the direction's resume: with none yet, it's written first.
  if (posting && !directionResume) {
    const first = await writeResume(ctx, job, { directionId });
    const tailored = await writeResume(ctx, job, { directionId, posting, postingId });
    return { ...tailored, costUsd: first.costUsd + tailored.costUsd };
  }
  const choice = await modelFor(ctx, job.workspaceId, "resume");
  const { doc, requirements, postingTitles, reply } = await draftResume(ctx, job.workspaceId, inputs, { directionId, posting }, choice);
  // A base or direction resume keeps what it was written from; a tailored one is frozen.
  const kept = posting ? {} : { writtenFrom, ...(review ? { toReview: true as const } : {}) };
  await ctx.runMutation(internal.resume.save, { workspaceId: job.workspaceId, runId: job._id, doc, ...kept, model: reply.model ?? choice.model, directionId, posting, postingId, requirements, postingTitles });
  return { roles: record.roles.length, facts: record.facts.length, insights: record.insights.length, costUsd: reply.costUsd, model: reply.model };
}

const NO_FACTS = "Approve some facts first; the resume is written only from your approved record.";

type ResumeInputs = FunctionReturnType<typeof internal.resume.inputs>;
// A resume as one call wrote it, read into a structured doc (with, for a posting, the requirements map and titles).
export type ResumeDraft = { doc: ResumeDoc; requirements?: Req[]; postingTitles?: { roleKey: string; title: string }[]; reply: ChatReply };

// The base resume as one model writes it, saved nowhere: a comparison (compare.ts) shows it beside other models'.
export async function draftBaseResume(ctx: ActionCtx, workspaceId: Id<"workspaces">, choice: ModelChoice, purpose: string): Promise<ResumeDraft> {
  const inputs: ResumeInputs = await ctx.runQuery(internal.resume.inputs, { workspaceId });
  if (!inputs.record.facts.length) throw new Error(NO_FACTS);
  return draftResume(ctx, workspaceId, inputs, {}, choice, purpose);
}

// One call writing a resume at its level. Saves nothing.
async function draftResume(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  { record, sameWork, direction, length, directionResume }: ResumeInputs,
  { directionId, posting }: { directionId?: Id<"items">; posting?: string },
  choice: ModelChoice,
  purpose?: string,
): Promise<ResumeDraft> {
  // Same work told twice (sameWork.ts) is one fact to the writer: the lead, with the other's words as context.
  const text = new Map(record.facts.map((f) => [String(f.id), f.text]));
  const otherOf = new Map(Object.entries(sameWork).map(([other, lead]) => [lead, other]));
  const facts = record.facts
    .filter((f) => !sameWork[String(f.id)])
    .map(({ id, roleKey, projectKey, text: t }) => ({ id, roleKey, projectKey, text: t, ...(otherOf.has(String(id)) ? { sameWork: text.get(otherOf.get(String(id))!) } : {}) }));
  // Skills come only from the approved skill items, never from a role's own list.
  const roles = record.roles.map((r) => ({ ...r, skills: undefined, tools: undefined }));
  const recordText = JSON.stringify({ roles, projects: record.projects, facts, skills: record.skills, insights: record.insights.map((i) => i.text), context: record.context });
  const reply = await chatJson<{ resume?: unknown; requirements?: Partial<Req>[]; titles?: unknown } & Record<string, unknown>>(ctx, {
    workspaceId,
    purpose: purpose ?? (posting ? "tailored resume" : directionId ? "direction resume" : "resume"),
    model: choice.model,
    reasoning: choice.reasoning,
    maxTokens: LONG_REPLY_TOKENS,
    schema: posting ? TAILORED_SCHEMA : RESUME_SCHEMA,
    messages: [
      { role: "system", content: `${posting ? TAILOR : directionId ? DIRECTION : SYSTEM}\n\nLength${posting ? " (at most, since it's shorter than the direction resume)" : ""}: ${LENGTH_TARGET[length]} Skills: the strongest 12 to 20 approved ones.` },
      {
        role: "user",
        content: posting
          ? `Their direction resume (start from this):\n${JSON.stringify(directionResume)}\n\nThe direction:\n${JSON.stringify(direction)}\n\nTheir approved record (cite facts by id):\n${recordText}\n\nThe job posting:\n${posting}`
          : directionId
            ? `The direction and its approved positioning:\n${JSON.stringify(direction)}\n\nTheir approved record (cite facts by id):\n${recordText}`
            : `Their approved record (cite facts by id):\n${recordText}`,
      },
    ],
  });
  const approved = new Set(record.facts.map((f) => String(f.id)));
  const factRoles = new Map(record.facts.filter((f) => !f.projectKey).map((f) => [String(f.id), f.roleKey]));
  const projectFacts = new Map(record.facts.flatMap((f) => (f.projectKey ? [[String(f.id), f.projectKey] as const] : [])));
  const out = reply.out;
  // Every level is saved structured. The resume is read from {"resume": ...} or, when a model skips the wrapper, from
  // the reply itself (a tailored reply's requirements and titles sit beside it either way).
  const skills = new Map(record.skills.map((k) => [String(k.id), k.name]));
  const cleaned = cleanDoc(out.resume && typeof out.resume === "object" ? out.resume : out, factRoles, record.roles, record.projects, projectFacts, skills);
  if (!cleaned) {
    // Only the reply's shape, never its words, so a failure can be traced without logging the person's record.
    const shape = Object.fromEntries(Object.entries(out).map(([k, x]) => [k, Array.isArray(x) ? `array(${x.length})` : typeof x]));
    console.error(`${purpose ?? "resume"}: reply wasn't a resume`, JSON.stringify({ model: choice.model, length: reply.text.length, shape }));
    throw new Error("The model's reply wasn't a resume. Try again.");
  }
  // A line from a connected pair's lead rests on both facts.
  const both = (b: Bullet): Bullet => ({ ...b, factIds: [...b.factIds, ...b.factIds.flatMap((id) => (otherOf.has(id) && !b.factIds.includes(otherOf.get(id)!) ? [otherOf.get(id)!] : []))] });
  const doc = { ...cleaned, experience: cleaned.experience.map((e) => ({ ...e, bullets: e.bullets.map(both) })), ...(cleaned.projects ? { projects: cleaned.projects.map((p) => ({ ...p, bullets: p.bullets.map(both) })) } : {}) };
  const requirements: Req[] | undefined = posting
    ? (out.requirements ?? [])
        .filter((r) => typeof r?.requirement === "string" && r.requirement.trim() && ["strong", "partial", "thin"].includes(r.strength ?? ""))
        .map((r) => {
          const factIds = (r.factIds ?? []).map(String).filter((id) => approved.has(id));
          // A requirement called strong with no approved fact behind it is at most partial.
          const strength = r.strength === "strong" && !factIds.length ? "partial" : (r.strength as Req["strength"]);
          return { requirement: r.requirement!.trim(), strength, factIds, ...(typeof r.note === "string" && r.note.trim() ? { note: r.note.trim() } : {}) };
        })
    : undefined;
  // Titles for this posting: one per role in the record (not breaks), different from its official title.
  const postingTitles = posting
    ? (Array.isArray(out.titles) ? (out.titles as Record<string, unknown>[]) : []).flatMap((x, i, all) => {
        const roleKey = typeof x?.roleKey === "string" ? x.roleKey : "";
        const title = typeof x?.title === "string" ? x.title.trim() : "";
        const role = record.roles.find((r) => r.roleKey === roleKey && !r.break);
        const first = all.findIndex((y) => y?.roleKey === roleKey) === i;
        return role && first && title && title.toLowerCase() !== resumeTitle(role)?.text.toLowerCase() ? [{ roleKey, title }] : [];
      })
    : undefined;
  return { doc, requirements, postingTitles, reply };
}

// What showing resumes reads: the approved facts behind every bullet, so each line can show what it's built on, and the
// resume settings (folds and breaks set on the record, titles on the base resume; each resume's layout overrides them).
// Saved versions are checked again as they're shown: a bullet counts only approved facts of its own role that still
// count (recordContext.sourceCheck), so an older version (or one whose fact was since rejected, moved or left without
// a source) shows the line as unsupported. A project takes the role it's linked to now (so it shows inside that role).
// Same work (sameWork.ts): a line resting on a connected pair's lead also rests on the other fact, and a line resting
// only on a pair's other fact isn't shown when another line rests on its lead (a version from before they connected
// them), so the work shows once.
export async function shownWith(ctx: QueryCtx, workspaceId: Id<"workspaces">, check: (i: Doc<"items">) => boolean) {
  const approvedFacts = await counted(ctx, workspaceId, "fact", check);
  const projects = await counted(ctx, workspaceId, "project", check);
  const linkedTo = new Map(projects.map((p) => [p.projectKey, p.roleKey]));
  const pairs = connections(approvedFacts, projects);
  const roleOf = new Map(approvedFacts.map((f) => [String(f._id), f.roleKey]));
  const projectOf = new Map(approvedFacts.map((f) => [String(f._id), f.projectKey]));
  const settings = await settingsOf(ctx, workspaceId);
  const checked = (bullets: Bullet[], counts: (id: string) => boolean) =>
    bullets.map((b) => {
      const own = b.factIds.filter(counts);
      const factIds = [...new Set([...own, ...own.flatMap((id) => (pairs.get(id)?.lead === id ? [pairs.get(id)!.other] : []))])];
      return { text: b.text, factIds, ...(factIds.length ? {} : { unsourced: true }) };
    });
  const recheck = (doc: ResumeDoc | undefined): ResumeDoc | undefined => {
    if (!doc) return doc;
    const experience = doc.experience.map((e) => ({ ...e, bullets: checked(e.bullets, (id) => roleOf.has(id) && (!e.roleKey || roleOf.get(id) === e.roleKey)) }));
    const shownProjects = doc.projects?.map((p) => {
      const rest = { ...p, bullets: checked(p.bullets, (id) => projectOf.get(id) === p.projectKey) };
      delete rest.roleKey;
      const roleKey = linkedTo.get(p.projectKey);
      return roleKey ? { ...rest, roleKey } : rest;
    });
    const cited = new Set([...experience, ...(shownProjects ?? [])].flatMap((x) => x.bullets.flatMap((b) => b.factIds)));
    const once = (bullets: Bullet[]) =>
      bullets.filter((b) => !(b.factIds.length && b.factIds.every((id) => pairs.get(id) && pairs.get(id)!.lead !== id && cited.has(pairs.get(id)!.lead))));
    return {
      ...doc,
      experience: experience.map((e) => ({ ...e, bullets: once(e.bullets) })),
      ...(shownProjects ? { projects: shownProjects.map((p) => ({ ...p, bullets: once(p.bullets) })) } : {}),
    };
  };
  return {
    facts: Object.fromEntries(approvedFacts.map((f) => [String(f._id), f.data.text])),
    settings: { roles: settings?.roles ?? [], projects: settings?.projects ?? [], skills: settings?.skills ?? [] },
    recheck,
  };
}

// Translated titles to offer per role: the direction's title map, else the record's own market title; never invented.
// A direction's resumes also offer its direction resume's titles (a tailored one, also those suggested for its posting).
async function titlesFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, directionId: Id<"items"> | undefined, check: (i: Doc<"items">) => boolean) {
  const d = directionId ? await getInWorkspace(ctx, workspaceId, directionId) : null;
  const titleMap = d?.kind === "direction" && d.data.detailStatus === "approved" ? d.data.detail?.titleMap : undefined;
  const suggested = Object.fromEntries(
    (await counted(ctx, workspaceId, "role", check)).flatMap((r) => {
      const s = r.roleKey && !r.data.break ? suggestTitle(r.data, titleMap) : null;
      return s ? [[r.roleKey!, s] as const] : [];
    }),
  );
  if (!directionId) return { suggested, direction: {} };
  const directionResume = (await versionsOf(ctx, workspaceId, directionId)).current;
  return {
    suggested,
    direction: {
      ...Object.fromEntries(Object.entries(suggested).map(([k, s]) => [k, s.text])),
      ...Object.fromEntries((directionResume?.layout?.roles ?? []).flatMap((l) => (l.translated && l.source !== "tailored" ? [[l.roleKey, l.translated] as const] : []))),
    },
  };
}

// A tailored resume as shown (its doc checked again, shownWith), with the role it was tailored to when it came from the
// Roles page (and is still there).
async function tailoredOf(ctx: QueryCtx, r: Doc<"resumes">, doc: ResumeDoc | undefined, facts: Record<string, string>) {
  const p = r.postingId ? await ctx.db.get(r.postingId) : null;
  return {
    id: r._id,
    doc: doc ?? null,
    layout: r.layout ? currentChecks(r.layout, facts) : null,
    postingTitles: Object.fromEntries((r.postingTitles ?? []).map((t) => [t.roleKey, t.title])),
    posting: r.posting!,
    role: p ? { id: p._id, title: p.title, company: (await ctx.db.get(p.companyId))?.name ?? "", url: p.url } : null,
    requirements: r.requirements ?? [],
    at: r.at,
  };
}

// A tailored resume exactly as it shows now (checked again, arranged by the resume settings and its own layout): what a
// pursuit keeps as sent. Null when it isn't a tailored resume of this workspace with a structured doc.
export async function shownResume(ctx: QueryCtx, workspaceId: Id<"workspaces">, id: Id<"resumes">) {
  const r = await getInWorkspace(ctx, workspaceId, id);
  if (!r?.doc || r.posting === undefined) return null;
  return (await resumeShower(ctx, workspaceId)).shown(r);
}

// Resumes as they show now, reading what showing needs once for many: a version (checked again and arranged, like
// list's; null for a plain-text one), and a base (no direction) or direction resume's current version. What Google
// Drive keeps (drive.ts).
export async function resumeShower(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const { settings, recheck } = await shownWith(ctx, workspaceId, await sourceCheck(ctx, workspaceId));
  const shown = (r: Doc<"resumes">) => (r.doc ? present(recheck(r.doc)!, settings, ownLayout(r.layout, r.posting === undefined && !r.directionId)) : null);
  return {
    shown,
    current: async (directionId: Id<"items"> | undefined) => {
      const { current } = await versionsOf(ctx, workspaceId, directionId);
      const doc = current ? shown(current) : null;
      return current && doc ? { id: current._id, doc } : null;
    },
  };
}

// Base resumes (no direction), or one direction's resumes and the ones tailored from them. Versions waiting in Resume
// updates aren't among them until kept. `last` is the last run writing one, `lines` the last Add what's new run.
export const list = query({
  args: { directionId: v.optional(v.id("items")) },
  handler: async (ctx, { directionId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db.query("resumes").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId)).order("desc").collect();
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "resume" && j.args.directionId === directionId && !j.args.lines);
    const lines = jobs.find((j) => j.kind === "resume" && j.args.directionId === directionId && j.args.lines === true);
    const check = await sourceCheck(ctx, workspaceId);
    const { facts, settings, recheck } = await shownWith(ctx, workspaceId, check);
    const { own, record } = lengthOf(await settingsOf(ctx, workspaceId), directionId);
    return {
      facts,
      last: last ? { status: last.status, error: last.error } : null,
      lines: lines ? { status: lines.status, error: lines.error } : null,
      titles: await titlesFor(ctx, workspaceId, directionId, check),
      settings,
      // How long its next version is written: its own length, or the record's.
      length: { own, record },
      versions: rows.filter((r) => r.posting === undefined && !r.toReview).map((r, i) => ({
        id: r._id,
        doc: recheck(r.doc) ?? null,
        layout: currentChecks(ownLayout(r.layout, !directionId), facts),
        text: r.text ?? (r.doc ? toPlain(present(recheck(r.doc)!, settings, ownLayout(r.layout, !directionId))) : ""),
        // How much it was written from; unknown for versions from before that was kept.
        counts: r.writtenFrom ? { roles: r.writtenFrom.roles.length, facts: r.writtenFrom.facts.length, insights: r.writtenFrom.insights.length } : null,
        model: r.model,
        at: r.at,
        // A version restored from History: when the version it copies was written.
        restoredFrom: r.restoredFrom ? (rows.find((x) => x._id === r.restoredFrom)?.at ?? null) : null,
        // Add what's new, on the current version while they go through it: each line added, skipped or not yet (null).
        additions:
          i === 0 && r.additions
            ? { at: r.additions.at, lines: r.additions.lines.map(({ state, reason, ...l }) => ({ ...l, state: state ?? null, reason: reason ?? null })) }
            : null,
      })),
      tailored: await Promise.all(rows.filter((r) => r.posting !== undefined).map((r) => tailoredOf(ctx, r, recheck(r.doc), facts))),
    };
  },
});

// The resumes tailored to one role from the Roles page, newest first, each with its direction and the titles it
// offers; and the last resume run for it.
export const forPosting = query({
  args: { postingId: v.id("postings") },
  handler: async (ctx, { postingId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db.query("resumes").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", postingId)).order("desc").collect();
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "resume" && j.args.postingId === postingId);
    const check = await sourceCheck(ctx, workspaceId);
    const { facts, settings, recheck } = await shownWith(ctx, workspaceId, check);
    const byDirection = new Map(
      await Promise.all(
        [...new Set(rows.flatMap((r) => r.directionId ?? []))].map(async (id) => {
          const d = await getInWorkspace(ctx, workspaceId, id);
          return [String(id), { name: d?.kind === "direction" ? d.data.name : "", titles: await titlesFor(ctx, workspaceId, id, check) }] as const;
        }),
      ),
    );
    return {
      facts,
      last: last ? { status: last.status, error: last.error, directionId: (last.args.directionId as Id<"items"> | undefined) ?? null } : null,
      settings,
      tailored: await Promise.all(
        rows.map(async (r) => {
          const d = byDirection.get(String(r.directionId));
          return { ...(await tailoredOf(ctx, r, recheck(r.doc), facts)), direction: { id: r.directionId!, name: d?.name ?? "" }, titles: { suggested: d?.titles.suggested ?? {}, direction: d?.titles.direction ?? {}, posting: Object.fromEntries((r.postingTitles ?? []).map((t) => [t.roleKey, t.title])) } };
        }),
      ),
    };
  },
});

// Resume updates: every base and direction resume with a version waiting to be kept or discarded (review, with a
// preview), or whose current version was written before what it was written from was kept (unknown), or from a record
// that has changed since (changed). A direction's resume is listed while the direction counts with approved positioning.
// Tailored resumes are frozen, never listed.
type Target = { directionId?: Id<"items">; name: string; href: string };
type Pending = { target: Target; state: "review" | "unknown" | "changed"; versionId?: Id<"resumes">; preview?: string; changes: Changes | null; writing: boolean };

async function pending(ctx: QueryCtx, workspaceId: Id<"workspaces">, items: CountedRecord): Promise<Pending[]> {
  const settings = await settingsOf(ctx, workspaceId);
  const targets: { target: Target; now: Basis }[] = [
    { target: { name: "Base resume", href: "/resumes?resume=base" }, now: basisOf(items, null, lengthOf(settings, undefined).length) },
    ...items.directions
      .filter((d) => d.data.detailStatus === "approved")
      .map((d) => ({ target: { directionId: d._id, name: d.data.name, href: `/resumes?resume=${d._id}` }, now: basisOf(items, d, lengthOf(settings, d._id).length) })),
  ];
  const running = await writing(ctx, workspaceId);
  const out: Pending[] = [];
  for (const { target, now } of targets) {
    const { current, waiting } = await versionsOf(ctx, workspaceId, target.directionId);
    const entry = { target, writing: running.some((j) => writes(j, target.directionId)) };
    if (waiting) {
      // What the waiting version picked up since the current one, and how it reads.
      const preview = waiting.doc ? toPlain(present(waiting.doc, { roles: settings?.roles ?? [], projects: settings?.projects ?? [], skills: settings?.skills ?? [] }, ownLayout(waiting.layout, !target.directionId))) : (waiting.text ?? "");
      const changes = current?.writtenFrom && waiting.writtenFrom ? changesSince(current.writtenFrom, waiting.writtenFrom) : null;
      out.push({ ...entry, state: "review", versionId: waiting._id, preview, changes });
    } else if (!current) continue;
    else if (!current.writtenFrom) out.push({ ...entry, state: "unknown", changes: null });
    else {
      const changes = changesSince(current.writtenFrom, now);
      if (hasChanges(changes)) out.push({ ...entry, state: "changed", changes });
    }
  }
  return out;
}

// Names for the items a list of changes mentions. Items no longer in the record are read as they are now: a fact's
// project (by projectKey) or its role's employer (by roleKey), whatever their status.
async function labelsFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, items: CountedRecord, ids: Id<"items">[]): Promise<Labels> {
  const known = new Map<string, Doc<"items">>([...items.roles, ...items.projects, ...items.facts, ...items.skills].map((i) => [String(i._id), i]));
  for (const id of ids) {
    if (known.has(String(id))) continue;
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (item) known.set(String(id), item);
  }
  const all = (kind: "role" | "project") => ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind)).collect();
  const roleName = (r: Doc<"items"> | undefined) => (r?.kind !== "role" ? undefined : r.data.break ? "career break" : (r.data.employer ?? r.data.title));
  // Counted items last, so they win over other versions with the same key.
  const roleByKey = new Map([...(await all("role")), ...items.roles].flatMap((r) => (r.roleKey ? [[r.roleKey, roleName(r)] as const] : [])));
  const projectByKey = new Map([...(await all("project")), ...items.projects].flatMap((p) => (p.kind === "project" && p.projectKey ? [[p.projectKey, p.data.name] as const] : [])));
  return {
    fact: (id) => {
      const f = known.get(String(id));
      const project = f?.projectKey ? projectByKey.get(f.projectKey) : undefined;
      return project ? { project } : { role: f?.roleKey ? roleByKey.get(f.roleKey) : undefined };
    },
    project: (id) => {
      const p = known.get(String(id));
      return p?.kind === "project" ? p.data.name : "";
    },
    role: (id) => roleName(known.get(String(id))) ?? "",
    skill: (id) => {
      const k = known.get(String(id));
      return k && isSkill(k) ? k.data.name : "";
    },
  };
}

// Resume updates with each one's changes in words; Review lists the waiting versions from here too. Pass the counted
// record when it's read already.
export async function updatesOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, record?: CountedRecord) {
  const items = record ?? (await countedRecord(ctx, workspaceId));
  const found = await pending(ctx, workspaceId, items);
  const ids = found.flatMap(({ changes: c }) => (c ? [c.facts, c.projects, c.roles, c.skills].flatMap((group) => Object.values(group).flat()) : []));
  const labels = await labelsFor(ctx, workspaceId, items, ids);
  return found.map(({ changes, ...entry }) => ({ ...entry, summary: changes && hasChanges(changes) ? describeChanges(changes, labels) : null }));
}

export const updates = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    return updatesOf(ctx, workspaceId);
  },
});

// The Resumes list: the base resume and one per approved direction, each with how it stands against the record now
// (Resume updates' state, else up to date, or not written yet), and every tailored resume, newest first. A direction
// resume can't be written until its positioning is approved (blocked). toUpdate counts the ones to look at.
type OverviewState = Pending["state"] | "upToDate" | "notWritten";
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const items = await countedRecord(ctx, workspaceId);
    const updates = await updatesOf(ctx, workspaceId, items);
    const running = await writing(ctx, workspaceId);
    const row = async (d: ItemOf<"direction"> | null) => {
      const directionId = d?._id;
      const { current } = await versionsOf(ctx, workspaceId, directionId);
      const u = updates.find((x) => x.target.directionId === directionId);
      const state: OverviewState = u?.state ?? (current ? "upToDate" : "notWritten");
      return {
        key: d ? String(d._id) : "base",
        directionId: directionId ?? null,
        name: d ? d.data.name : "Base resume",
        at: current?.at ?? null,
        state,
        summary: u?.summary ?? null,
        versionId: u?.state === "review" ? (u.versionId ?? null) : null,
        writing: running.some((j) => writes(j, directionId)),
        blocked: d && d.data.detailStatus !== "approved" ? "Approve this direction's positioning first." : null,
      };
    };
    const base = await row(null);
    const directions = await Promise.all(items.directions.map(row));
    const names = new Map(items.directions.map((d) => [String(d._id), d.data.name]));
    const rows = (await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect()).filter((r) => r.posting !== undefined);
    const tailored = await Promise.all(
      rows.map(async (r) => {
        const d = names.has(String(r.directionId)) ? null : await getInWorkspace(ctx, workspaceId, r.directionId!);
        return {
          id: r._id,
          ...(await postingName(ctx, workspaceId, r)),
          directionId: r.directionId!,
          direction: names.get(String(r.directionId)) ?? (d?.kind === "direction" ? d.data.name : ""),
          at: r.at,
        };
      }),
    );
    return {
      base,
      directions,
      tailored,
      writing: running.length > 0,
      toUpdate: [base, ...directions].filter((x) => x.state === "changed" || x.state === "review" || x.state === "unknown").length,
    };
  },
});

// The base and direction resumes whose current version has a line resting on this fact, for the fact's page. None for
// a fact not in their workspace.
export const showsFact = query({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!(await getInWorkspace(ctx, workspaceId, id))) return [];
    const targets = [null, ...(await counted(ctx, workspaceId, "direction"))];
    const out: { key: string; directionId: Id<"items"> | null; name: string }[] = [];
    for (const d of targets) {
      const doc = (await versionsOf(ctx, workspaceId, d?._id)).current?.doc;
      if (![...(doc?.experience ?? []), ...(doc?.projects ?? [])].some((x) => x.bullets.some((b) => b.factIds.includes(String(id))))) continue;
      out.push({ key: d ? String(d._id) : "base", directionId: d?._id ?? null, name: d ? d.data.name : "Base resume" });
    }
    return out;
  },
});

// What a tailored resume is for: the role's title and company when it came from the Roles page (and the role is still
// there), else the pasted posting's first line, "Title at Company" when it reads so.
export async function postingName(ctx: QueryCtx, workspaceId: Id<"workspaces">, r: Doc<"resumes">): Promise<{ title: string; company: string | null }> {
  const p = r.postingId ? await getInWorkspace(ctx, workspaceId, r.postingId) : null;
  if (p) return { title: p.title, company: (await ctx.db.get(p.companyId))?.name ?? null };
  return pastedName(r.posting ?? "");
}

// Section headings postings open with, which name no role.
const HEADINGS = /^(who we are|about\b.{0,40}|the (role|team|opportunity|company)|overview|company (overview|description)|job (description|summary|overview)|role (description|summary|overview)|position (summary|overview)|summary|description|what you('|’)ll do|responsibilities|requirements|qualifications|our (mission|story|company)|why join us)\s*:?$/i;

// A pasted posting's role and company, from its first lines: "Title at Company" wins; then a line that says the title
// ("Title: …", "Role: …", "Position: …", "Job title: …"), with a "Company: …" line; then the first short line that isn't
// a section heading or a sentence. "Pasted role" when none is found.
export function pastedName(posting: string): { title: string; company: string | null } {
  const lines = posting
    .split("\n")
    .map((l) => l.replace(/^[#*\s-]+|[*\s]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 15);
  for (const l of lines) {
    const at = l.indexOf(" at ");
    if (at > 0 && l.length <= 120 && !HEADINGS.test(l) && !/[.!?]$/.test(l)) return { title: l.slice(0, at).trim(), company: l.slice(at + 4).split(" · ")[0].trim() || null };
  }
  const labelled = (label: RegExp) => lines.map((l) => l.match(label)?.[1]?.trim()).find((x) => !!x) ?? null;
  const said = labelled(/^(?:job title|title|role|position)\s*[:\-–]\s*(.+)$/i);
  const company = labelled(/^(?:company|employer|organi[sz]ation)\s*[:\-–]\s*(.+)$/i);
  if (said) return { title: said.slice(0, 80), company };
  const first = lines.find((l) => l.length <= 80 && !HEADINGS.test(l) && !/[.!?]$/.test(l));
  return { title: first ?? "Pasted role", company };
}

// Write a new version of the base resume (no direction) or a direction's, to keep or discard. One waits at a time.
export const rewrite = mutation({
  args: { directionId: v.optional(v.id("items")) },
  handler: async (ctx, { directionId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (directionId) await checkDirection(ctx, workspaceId, directionId);
    if ((await writing(ctx, workspaceId)).some((j) => writes(j, directionId))) throw new ConvexError("This resume is already being written.");
    if ((await versionsOf(ctx, workspaceId, directionId)).waiting) throw new ConvexError("A new version is waiting. Keep or discard it first.");
    return queueRewrite(ctx, workspaceId, directionId, 0);
  },
});

const STAGGER_MS = 5000;
// Rewrite every resume the record has changed under (or that was written before changes were listed), a few seconds
// apart. Returns how many were started.
export const updateAll = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const due = (await pending(ctx, workspaceId, await countedRecord(ctx, workspaceId))).filter((u) => u.state !== "review" && !u.writing);
    for (const [n, u] of due.entries()) await queueRewrite(ctx, workspaceId, u.target.directionId, n * STAGGER_MS);
    return due.length;
  },
});

// Keep a version written from Resume updates: it becomes the resume's current version. When it was written is kept,
// so Undo can put it back to wait (reopen).
export const keep = mutation({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const r = await getInWorkspace(ctx, workspaceId, id);
    if (!r?.toReview || r.discarded) throw new Error("Not found.");
    await ctx.db.patch(id, { toReview: undefined, writtenAt: r.at, at: Date.now(), tallied: true });
    if (!r.tallied) {
      await tally(ctx, workspaceId, "resumeKept", dayOf(Date.now()), 1);
      await tally(ctx, workspaceId, "resumeUpdated", dayOf(Date.now()), 1);
    }
    await syncSoon(ctx, workspaceId);
  },
});

// Discard a version written from Resume updates. Only a version waiting for review goes; the ones before it stay. It's
// kept aside, never the resume, with `reason` (why, when they said), so Undo can bring it back and the reason shows.
export const discard = mutation({
  args: { id: v.id("resumes"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const r = await getInWorkspace(ctx, workspaceId, id);
    if (!r?.toReview || r.discarded) throw new Error("Not found.");
    await ctx.db.patch(id, { discarded: { at: Date.now(), reason: reason?.trim() || undefined } });
  },
});

// Undo Keep or Discard: the version waits to be kept or discarded again, as long as nothing else waits for that resume
// and, after a Keep, it's still the resume's current version.
export const reopen = mutation({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const r = await getInWorkspace(ctx, workspaceId, id);
    if (!r || r.posting !== undefined) throw new Error("Not found.");
    const { current, waiting } = await versionsOf(ctx, workspaceId, r.directionId);
    if (waiting) throw new ConvexError("A new version is waiting. Keep or discard it first.");
    if (r.toReview && r.discarded) await ctx.db.patch(id, { discarded: undefined });
    else if (!r.toReview && r.writtenAt !== undefined && current?._id === id) {
      await ctx.db.patch(id, { toReview: true, at: r.writtenAt, writtenAt: undefined, tallied: undefined });
      if (r.tallied) {
        await tally(ctx, workspaceId, "resumeKept", dayOf(Date.now()), -1);
        await tally(ctx, workspaceId, "resumeUpdated", dayOf(Date.now()), -1);
      }
    } else throw new Error("Nothing to undo.");
    await syncSoon(ctx, workspaceId);
  },
});

// ---- History ----

// The approved facts that count now, by id, with their words: what a version's facts are checked against.
const factTexts = async (ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<Record<string, string>> =>
  Object.fromEntries((await counted(ctx, workspaceId, "fact")).map((f) => [String(f._id), f.data.text]));

// How a fact a version cites stands now (resumeHistory.ts): rejected when it no longer counts, edited when its words
// changed since the version was written (known only for versions that kept what they were written from), else ok.
function statusOf(facts: Record<string, string>, writtenFrom: Basis | undefined) {
  const marks = new Map((writtenFrom?.facts ?? []).map((f) => [String(f.id), f.mark]));
  return (id: string): FactStatus => (facts[id] === undefined ? "rejected" : marks.has(id) && marks.get(id) !== markOf(facts[id]) ? "edited" : "ok");
}

// A base or direction resume's history: its kept versions, newest first (the current one, then every one before it;
// never one waiting, discarded or tailored), each with what it changed from the kept version before it that has a
// structured doc.
export const history = query({
  args: { directionId: v.optional(v.id("items")) },
  handler: async (ctx, { directionId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (directionId && (await getInWorkspace(ctx, workspaceId, directionId))?.kind !== "direction") throw new Error("Not found.");
    const kept = (await ctx.db.query("resumes").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId)).order("desc").collect()).filter(
      (r) => r.posting === undefined && !r.toReview,
    );
    const facts = await factTexts(ctx, workspaceId);
    return {
      versions: kept.map((r, i) => {
        const older = kept.slice(i + 1).find((x) => x.doc);
        return {
          id: r._id,
          at: r.at,
          current: i === 0,
          plain: !r.doc,
          facts: r.writtenFrom?.facts.length ?? null,
          restoredFrom: r.restoredFrom ? (kept.find((x) => x._id === r.restoredFrom)?.at ?? null) : null,
          changes: r.doc && older?.doc ? versionChanges(older.doc, r.doc, statusOf(facts, older.writtenFrom)) : [],
        };
      }),
    };
  },
});

// One version of a base, direction or tailored resume, to view or compare side by side: as shown (checked again and
// arranged, like list's), as written (checked again, not arranged), and its lines resting on a fact rejected or edited
// since. A version waiting in Resume updates can be viewed; a discarded one can't.
export const version = query({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const r = await getInWorkspace(ctx, workspaceId, id);
    if (!r || r.discarded) throw new Error("Not found.");
    const { facts, settings, recheck } = await shownWith(ctx, workspaceId, await sourceCheck(ctx, workspaceId));
    const layout = ownLayout(r.layout, r.directionId === undefined);
    const written = recheck(r.doc) ?? null;
    const doc = written ? present(written, settings, layout) : null;
    return {
      id: r._id,
      at: r.at,
      directionId: r.directionId ?? null,
      // A tailored resume has one version: itself.
      current: r.posting !== undefined || (await versionsOf(ctx, workspaceId, r.directionId)).current?._id === id,
      waiting: !!r.toReview,
      doc,
      written,
      layout,
      flags: r.doc ? lineFlags(r.doc, statusOf(facts, r.writtenFrom)) : {},
      text: r.text ?? (doc ? toPlain(doc) : ""),
    };
  },
});

// What changed from one version of a base or direction resume to another (`from` the older), in substance, each read
// with the lines and summary they put in their own words. Nothing to compare when either is plain text.
export const compare = query({
  args: { from: v.id("resumes"), to: v.id("resumes") },
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const a = await getInWorkspace(ctx, workspaceId, from);
    const b = await getInWorkspace(ctx, workspaceId, to);
    if (!a || !b || a.posting !== undefined || b.posting !== undefined || a.directionId !== b.directionId || a.discarded || b.discarded) throw new Error("Not found.");
    if (!a.doc || !b.doc) return { changes: [] };
    const theirs = (r: Doc<"resumes">) => present(r.doc!, { roles: [], ...(r.layout?.words ? { words: r.layout.words } : {}), ...(r.layout?.summary !== undefined ? { summary: r.layout.summary } : {}) });
    return { changes: versionChanges(theirs(a), theirs(b), statusOf(await factTexts(ctx, workspaceId), a.writtenFrom)) };
  },
});

// Restore an older kept version from History: a copy of it becomes the current version, without the lines resting on
// a fact rejected or edited since (and their pinned or hidden choices). Everything else is as it was: layout, what it
// was written from, model. Lines skipped from Add what's new stay skipped. Undo deletes the copy (undoRestore).
export const restore = mutation({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const r = await getInWorkspace(ctx, workspaceId, id);
    if (!r || r.posting !== undefined || r.toReview) throw new Error("Not found.");
    const { current } = await versionsOf(ctx, workspaceId, r.directionId);
    if (current?._id === id) throw new ConvexError("This is already the current version.");
    if (!r.doc) throw new ConvexError("Write it again to use titles and folding.");
    const flags = lineFlags(r.doc, statusOf(await factTexts(ctx, workspaceId), r.writtenFrom));
    const keep = (bullets: Bullet[]) => bullets.filter((b) => !flags[b.text]);
    const doc: ResumeDoc = {
      ...r.doc,
      experience: r.doc.experience.map((e) => ({ ...e, bullets: keep(e.bullets) })),
      ...(r.doc.projects ? { projects: r.doc.projects.map((p) => ({ ...p, bullets: keep(p.bullets) })).filter((p) => p.bullets.length) } : {}),
    };
    await tally(ctx, workspaceId, "resumeKept", dayOf(Date.now()), 1);
    await syncSoon(ctx, workspaceId);
    return ctx.db.insert("resumes", {
      workspaceId,
      doc,
      ...(r.layout ? { layout: withPart(r.layout, { bullets: (r.layout.bullets ?? []).filter((b) => !flags[b.text]) }) } : {}),
      ...(r.writtenFrom ? { writtenFrom: r.writtenFrom } : {}),
      model: r.model,
      ...(r.directionId ? { directionId: r.directionId } : {}),
      ...(current?.skipped?.length ? { skipped: current.skipped } : {}),
      restoredFrom: id,
      tallied: true,
      at: Date.now(),
    });
  },
});

// Undo a restore: the copy goes, while it's still the current version.
export const undoRestore = mutation({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const r = await getInWorkspace(ctx, workspaceId, id);
    if (!r?.restoredFrom || (await versionsOf(ctx, workspaceId, r.directionId)).current?._id !== id) throw new ConvexError("Nothing to undo.");
    await ctx.db.delete(id);
    if (r.tallied) await tally(ctx, workspaceId, "resumeKept", dayOf(Date.now()), -1);
    await syncSoon(ctx, workspaceId);
  },
});

// ---- Add what's new ----

const LINES = `You add new lines to someone's resume from facts newly approved in their career record. You get the resume as it stands (each experience entry with its roleKey, each project with its projectKey) and the new or reworded approved facts, each with the role or project it belongs to.

Write one bullet per new result, in the resume's own voice, for the entry its facts belong to. Use only what the facts say; never add a claim, number, tool or title they don't have. Never repeat what the resume already says: a fact that only restates a line already there gets no line.

${FACT_STYLE}
${PLAIN_LANGUAGE}

Reply with JSON only: {"lines": [{"text": "...", "factIds": ["..."], "roleKey": "..."}]}, with "projectKey" instead of "roleKey" for a project's line.`;
// The reply's shape (structured output, metering.chat): a line's roleKey or projectKey, the other empty.
export const LINES_SCHEMA = replyOf("resume_lines", "lines", { text: string, factIds: strings, roleKey: string, projectKey: string });

// What's new since a base or direction resume's current version was written: approved facts added or reworded since,
// and the facts of projects added or edited since, less those the version already cites as they read now and those
// whose line they skipped (while the fact reads the same). Null without a current version that kept what it was
// written from.
async function whatsNewFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, directionId: Id<"items"> | undefined) {
  const { current } = await versionsOf(ctx, workspaceId, directionId);
  if (!current?.doc || !current.writtenFrom) return null;
  const items = await countedRecord(ctx, workspaceId);
  const direction = directionId ? (items.directions.find((d) => d._id === directionId) ?? null) : null;
  const now = basisOf(items, direction, lengthOf(await settingsOf(ctx, workspaceId), directionId).length);
  const c = changesSince(current.writtenFrom, now);
  const projects = new Set(items.projects.filter((p) => [...c.projects.added, ...c.projects.edited].includes(p._id)).map((p) => p.projectKey));
  const candidates = new Set([...c.facts.added, ...c.facts.reworded, ...items.facts.filter((f) => f.projectKey && projects.has(f.projectKey)).map((f) => f._id)].map(String));
  const mark = new Map(now.facts.map((f) => [String(f.id), f.mark]));
  const was = new Map(current.writtenFrom.facts.map((f) => [String(f.id), f.mark]));
  const cited = new Set([...current.doc.experience, ...(current.doc.projects ?? [])].flatMap((x) => x.bullets.flatMap((b) => b.factIds)));
  const skipped = new Set((current.skipped ?? []).flatMap((s) => s.factIds.map((id, i) => `${id}:${s.marks[i]}`)));
  const facts = items.facts.filter((f) => {
    const id = String(f._id);
    return candidates.has(id) && !(cited.has(id) && was.get(id) === mark.get(id)) && !skipped.has(`${id}:${mark.get(id)}`);
  });
  return { current, doc: current.doc, items, direction, now, facts };
}

// Add what's new: write new lines for the current version of the base resume (no direction) or a direction's, from
// what's new in the record since it was written, for them to add or skip one by one. Like any resume run, it waits
// for none to be running.
export const whatsNew = mutation({
  args: { directionId: v.optional(v.id("items")) },
  handler: async (ctx, { directionId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (directionId) await checkDirection(ctx, workspaceId, directionId);
    const found = await whatsNewFor(ctx, workspaceId, directionId);
    if (!found) throw new ConvexError("Write this resume again to add what's new.");
    if (!found.facts.length) throw new ConvexError("Nothing new to add.");
    if ((await writing(ctx, workspaceId)).length) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "resume", args: { directionId, lines: true }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

type Offered = { id: string; text: string; roleKey?: string; role?: { employer?: string; title?: string }; projectKey?: string; project?: string };

// What a run writing new lines reads: the current version, what's new (each fact with the approved role or project it
// belongs to; one with neither has nowhere to go) and the record's basis now.
export const linesInputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), directionId: v.optional(v.id("items")) },
  handler: async (ctx, { workspaceId, directionId }) => {
    const found = await whatsNewFor(ctx, workspaceId, directionId);
    if (!found) return null;
    const roles = new Map(found.items.roles.filter((r) => r.roleKey && !r.data.break).map((r) => [r.roleKey!, r]));
    const projects = new Map(found.items.projects.map((p) => [p.projectKey!, p]));
    const facts = found.facts.flatMap((f): Offered[] => {
      const project = f.projectKey ? projects.get(f.projectKey) : undefined;
      const role = f.roleKey ? roles.get(f.roleKey) : undefined;
      if (project) return [{ id: String(f._id), text: f.data.text, projectKey: project.projectKey!, project: project.data.name }];
      if (role) return [{ id: String(f._id), text: f.data.text, roleKey: role.roleKey!, role: { employer: role.data.employer, title: role.data.title } }];
      return [];
    });
    return { versionId: found.current._id, doc: found.doc, direction: found.direction?.data.name ?? null, basis: found.now, facts };
  },
});

// Add what's new: one line per new result, in the resume's voice, each resting only on facts offered and placed where
// its facts belong (a project's line on its project, a role's on its approved role). Saved on the version (saveLines).
async function writeLines(ctx: ActionCtx, job: Doc<"jobs">, directionId: Id<"items"> | undefined) {
  const input = await ctx.runQuery(internal.resume.linesInputs, { workspaceId: job.workspaceId, directionId });
  if (!input?.facts.length) throw new Error("Nothing new to add.");
  const choice = await modelFor(ctx, job.workspaceId, "resume");
  const entries = {
    experience: input.doc.experience.filter((e) => !e.break).map((e) => ({ roleKey: e.roleKey, employer: e.employer, title: e.title })),
    projects: (input.doc.projects ?? []).map((p) => ({ projectKey: p.projectKey, name: p.name })),
  };
  const reply = await chatJson<{ lines?: unknown }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "resume lines",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: LINES_SCHEMA,
    messages: [
      { role: "system", content: LINES },
      {
        role: "user",
        content: `${input.direction ? `This resume is aimed at: ${input.direction}\n\n` : ""}The resume as it stands:\n${toPlain(input.doc)}\n\nIts entries:\n${JSON.stringify(entries)}\n\nThe new or reworded approved facts (cite them by id):\n${JSON.stringify(input.facts)}`,
      },
    ],
  });
  const offered = new Map(input.facts.map((f) => [f.id, f]));
  const out = reply.out;
  const seen = new Set<string>();
  const lines = (Array.isArray(out.lines) ? (out.lines as Record<string, unknown>[]) : []).flatMap((x) => {
    const text = typeof x?.text === "string" ? x.text.trim() : "";
    const ids = (Array.isArray(x?.factIds) ? x.factIds : []).map(String).filter((id) => offered.has(id));
    // Where the line goes: the project or role it names, else its first fact's; it keeps only the facts that are there.
    const named = (k: "roleKey" | "projectKey") => (typeof x?.[k] === "string" && x[k] ? (x[k] as string) : undefined);
    const first = offered.get(ids[0]);
    const projectKey = named("projectKey") ?? (named("roleKey") ? undefined : first?.projectKey);
    const roleKey = projectKey ? undefined : (named("roleKey") ?? first?.roleKey);
    const factIds = [...new Set(ids.filter((id) => (projectKey ? offered.get(id)!.projectKey === projectKey : !!roleKey && offered.get(id)!.roleKey === roleKey)))];
    if (!text || !factIds.length || seen.has(text)) return [];
    seen.add(text);
    return [{ text, factIds, ...(projectKey ? { projectKey } : { roleKey }) }];
  });
  if (!lines.length) throw new Error("The model's reply had no new lines. Try again.");
  await ctx.runMutation(internal.resume.saveLines, { runId: job._id, versionId: input.versionId, basis: input.basis, lines });
  return { lines: lines.length, costUsd: reply.costUsd, model: reply.model };
}

const line = v.object({ text: v.string(), factIds: v.array(v.string()), roleKey: v.optional(v.string()), projectKey: v.optional(v.string()) });

// New lines saved on the version they were written for, while it's still the current one, with the version as it is
// (to go back to) and the record's basis they were written from. A retried run saves nothing twice.
export const saveLines = internalMutation({
  args: { runId: v.id("jobs"), versionId: v.id("resumes"), basis: resumeBasis, lines: v.array(line) },
  handler: async (ctx, { runId, versionId, basis, lines }) => {
    const r = await ctx.db.get(versionId);
    if (!r?.doc || r.additions?.runId === runId) return;
    if ((await versionsOf(ctx, r.workspaceId, r.directionId)).current?._id !== versionId) throw new Error("This resume has a new version since. Try again.");
    await ctx.db.patch(versionId, { additions: { at: Date.now(), runId, before: { doc: r.doc, ...(r.writtenFrom ? { writtenFrom: r.writtenFrom } : {}) }, basis, lines } });
  },
});

type Additions = NonNullable<Doc<"resumes">["additions"]>;

// The current version of one of their base or direction resumes, with lines from Add what's new to go through.
async function withAdditions(ctx: MutationCtx, id: Id<"resumes">) {
  const { workspaceId } = await requireWorkspace(ctx);
  const r = await getInWorkspace(ctx, workspaceId, id);
  if (!r?.additions || r.posting !== undefined || r.toReview || (await versionsOf(ctx, workspaceId, r.directionId)).current?._id !== id) throw new Error("Not found.");
  return { workspaceId, r, additions: r.additions };
}

// The version with its added lines in it, worked out again from how it was before they were proposed: each added line
// at the end of its role's or project's bullets (a role or project not on it yet gets its entry from the approved
// record, placed by date), and what it was written from taking those lines' facts as they read when proposed.
async function applyLines(ctx: MutationCtx, workspaceId: Id<"workspaces">, id: Id<"resumes">, additions: Additions, lines: Additions["lines"], skipped: Doc<"resumes">["skipped"]) {
  const added = lines.filter((l) => l.state === "added");
  const bullet = (l: Additions["lines"][number]): Bullet => ({ text: l.text, factIds: l.factIds });
  const check = await sourceCheck(ctx, workspaceId);
  const { doc: before, writtenFrom } = additions.before;
  const experience: Entry[] = before.experience.map((e) => ({ ...e, bullets: [...e.bullets, ...added.filter((l) => l.roleKey && l.roleKey === e.roleKey).map(bullet)] }));
  const newRoles = new Set(added.flatMap((l) => (l.roleKey && !experience.some((e) => e.roleKey === l.roleKey) ? [l.roleKey] : [])));
  for (const role of (await counted(ctx, workspaceId, "role", check)).filter((r) => r.roleKey && newRoles.has(r.roleKey) && !r.data.break)) {
    const d = role.data;
    const title = resumeTitle(d)?.text;
    if (!d.employer || !title) continue;
    const entry: Entry = {
      employer: d.employer,
      title,
      roleKey: role.roleKey,
      ...(d.location ? { location: d.location } : {}),
      ...(d.start ? { start: d.start } : {}),
      ...(d.end ? { end: d.end } : {}),
      bullets: added.filter((l) => l.roleKey === role.roleKey).map(bullet),
    };
    const at = experience.findIndex((x) => (x.start ?? "") < (d.start ?? ""));
    experience.splice(at < 0 ? experience.length : at, 0, entry);
  }
  const projects = (before.projects ?? []).map((p) => ({ ...p, bullets: [...p.bullets, ...added.filter((l) => l.projectKey === p.projectKey).map(bullet)] }));
  const newProjects = new Set(added.flatMap((l) => (l.projectKey && !projects.some((p) => p.projectKey === l.projectKey) ? [l.projectKey] : [])));
  for (const p of (await counted(ctx, workspaceId, "project", check)).filter((x) => x.projectKey && newProjects.has(x.projectKey))) {
    const d = p.data;
    projects.push({
      projectKey: p.projectKey!,
      name: d.name,
      ...(d.url ? { url: d.url } : {}),
      ...(d.start ? { start: d.start } : {}),
      ...(d.end ? { end: d.end } : {}),
      ...(p.roleKey ? { roleKey: p.roleKey } : {}),
      bullets: added.filter((l) => l.projectKey === p.projectKey).map(bullet),
    });
  }
  const ids = new Set(added.flatMap((l) => l.factIds));
  await syncSoon(ctx, workspaceId);
  await ctx.db.patch(id, {
    additions: { ...additions, lines },
    doc: { ...before, experience, ...(projects.length ? { projects } : {}) },
    ...(writtenFrom ? { writtenFrom: { ...writtenFrom, facts: [...writtenFrom.facts.filter((f) => !ids.has(String(f.id))), ...additions.basis.facts.filter((f) => ids.has(String(f.id)))] } } : {}),
    skipped,
  });
}

// Add or skip one proposed line (with their reason, when they give one), or null to decide again. A skipped line's
// facts, as they read now, aren't proposed again for this resume.
export const setLine = mutation({
  args: { id: v.id("resumes"), index: v.number(), state: v.union(v.literal("added"), v.literal("skipped"), v.null()), reason: v.optional(v.string()) },
  handler: async (ctx, { id, index, state, reason }) => {
    const { workspaceId, r, additions } = await withAdditions(ctx, id);
    const target = additions.lines[index];
    if (!target) throw new Error("Not found.");
    const why = state === "skipped" && reason?.trim() ? reason.trim() : undefined;
    const lines = additions.lines.map((l, i) => (i === index ? { text: l.text, factIds: l.factIds, roleKey: l.roleKey, projectKey: l.projectKey, ...(state ? { state } : {}), ...(why ? { reason: why } : {}) } : l));
    const marks = new Map(additions.basis.facts.map((f) => [String(f.id), f.mark]));
    const same = (s: { text: string; factIds: string[] }) => s.text === target.text && s.factIds.join() === target.factIds.join();
    const skipped = [
      ...(r.skipped ?? []).filter((s) => !same(s)),
      ...(state === "skipped" ? [{ text: target.text, factIds: target.factIds, marks: target.factIds.map((f) => marks.get(f) ?? ""), ...(why ? { reason: why } : {}), at: Date.now() }] : []),
    ];
    await applyLines(ctx, workspaceId, id, additions, lines, skipped);
  },
});

// Add every proposed line not yet added or skipped.
export const addAll = mutation({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId, r, additions } = await withAdditions(ctx, id);
    await applyLines(ctx, workspaceId, id, additions, additions.lines.map((l) => (l.state ? l : { ...l, state: "added" as const })), r.skipped);
  },
});

// Done with Add what's new: the proposed lines go; the ones added stay in the version.
export const closeAdditions = mutation({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    await withAdditions(ctx, id);
    await ctx.db.patch(id, { additions: undefined });
  },
});
