import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { itemsOf } from "./itemShapes";
import { resumeOf } from "./pursuits";
import { PATH_LABELS, type Path, pathOf } from "./pursuitSteps";
import { rolesOf } from "./roles";
import { clockOf, requireWorkspace } from "./workspaces";

// What Today puts together on the server: new strong roles to decide on, and the steps of Getting started.

const DAY_MS = 86_400_000;
// How long a strong role counts as new on Today once ranked.
export const NEW_ROLE_DAYS = 7;
// Strong roles looked at for Today, best score first; more than a morning's worth.
const NEW_ROLES_READ = 60;

// Strong fits ranked in the last week that they haven't rated or started yet, best score first, at the direction each
// fits best. Rated Interested or Not for me, or started, a role leaves Today.
export const roles = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const since = (await clockOf(ctx, workspaceId)) - NEW_ROLE_DAYS * DAY_MS;
    const rows = await ctx.db
      .query("roleRanks")
      .withIndex("by_score", (q) => q.eq("workspaceId", workspaceId).eq("directionId", undefined).eq("state", "judged"))
      .order("desc")
      .filter((q) => q.and(q.eq(q.field("level"), "strong"), q.eq(q.field("rating"), undefined)))
      .take(NEW_ROLES_READ);
    const fresh = [];
    for (const r of rows) {
      const p = await ctx.db.get(r.postingId);
      if (p && (p.fitAt ?? 0) >= since) fresh.push(r);
    }
    const names = new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.name]));
    return (await rolesOf(ctx, workspaceId, fresh, names)).filter((r) => !r.pursuit);
  },
});

// One step of Getting started: done or not, the line a done step shows, and a day where the line is a date (the
// browser words it in their calendar).
export type SetupStep = { done: boolean; detail: string | null; at: number | null };
const step = (done: boolean, detail: string | null = null, at: number | null = null): SetupStep => ({ done, detail, at });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The first pursuit: the pursuit it follows, its path (pursuitSteps.pathOf) and each of its steps. pursuit.at: the day it
// started. message.at: the day the first outreach message was marked sent. applied.at: the day it was marked Applied.
// followUp.at: the day they followed up, or until then the day it's due (a week after the first outreach message or
// the application, whichever came first).
export type FirstPursuit = {
  pursuitId: Id<"pursuits">;
  // Null for a pursuit with no open role.
  postingId: Id<"postings"> | null;
  title: string;
  company: string;
  direction: string | null;
  path: Path | null;
  // Where they apply: the posting's application page, else the posting.
  applyUrl: string | null;
  steps: Record<"pursuit" | "tailor" | "path" | "contacts" | "message" | "letter" | "applied" | "followUp", SetupStep>;
};

// A follow-up is due once an application or an outreach message has been quiet this long (pursuitSteps.remindersOf).
const FOLLOW_UP_DAYS = 7;
// Pursuits looked at for the first pursuit, most recently active first.
const PURSUITS_READ = 50;

// The first pursuit's steps for one pursuit, worked out from what it holds: its tailored resume (and how many of the
// posting's requirements it covers strongly; with no open role, its direction's resume), the path chosen, contacts
// found or added, the first outreach message marked sent, its cover letter and kept answers, when it was marked
// Applied, and when they followed up.
async function pursuitOf(ctx: QueryCtx, p: Doc<"pursuits">): Promise<FirstPursuit> {
  const resumeId = await resumeOf(ctx, p);
  const resume = resumeId ? await ctx.db.get(resumeId) : null;
  const requirements = resume?.requirements ?? [];
  const strong = requirements.filter((r) => r.strength === "strong").length;
  const letter = await ctx.db.query("letters").withIndex("by_pursuit", (q) => q.eq("pursuitId", p._id)).first();
  const answers = p.answers?.length ?? 0;
  const contacts = await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", p._id)).collect();
  const firstSent = contacts
    .flatMap((c) => (c.sent ?? []).map((s) => ({ name: c.name, at: s.at })))
    .sort((x, y) => x.at - y.at)[0];
  const path = pathOf(p);
  // Applied while it's kept as sent (back to Preparing lets it go): the day it was first marked Applied.
  const appliedAt = p.sent ? (p.appliedAt ?? p.sent.at) : null;
  const contactedAt = p.contactedAt ?? null;
  const reachedAt = Math.min(appliedAt ?? Infinity, contactedAt ?? Infinity);
  const followedUp = reachedAt === Infinity ? undefined : p.timeline.find((e) => e.event === "followedUp" && e.at >= reachedAt);
  const posting = p.postingId ? await ctx.db.get(p.postingId) : null;
  return {
    pursuitId: p._id,
    postingId: p.postingId ?? null,
    title: p.title,
    company: p.company,
    direction: p.direction ?? null,
    path,
    applyUrl: posting ? (posting.applyUrl ?? posting.url) : null,
    steps: {
      pursuit: step(true, null, p.at),
      tailor: !p.postingId
        ? step(true, p.direction ? `Your ${p.direction} resume` : "Your direction’s resume")
        : step(!!resume, resume ? (requirements.length ? `Tailored · covers ${strong} of ${requirements.length} requirements` : "Tailored") : null),
      path: step(path !== null, path ? PATH_LABELS[path] : null),
      contacts: step(contacts.length > 0, contacts.length ? plural(contacts.length, "contact", "contacts") : null),
      message: step(contactedAt !== null, firstSent ? `Sent to ${firstSent.name}` : null, contactedAt),
      letter: step(!!letter || answers > 0, [letter && "Letter written", answers > 0 && `${plural(answers, "answer", "answers")} kept`].filter(Boolean).join(" · ") || null),
      applied: step(appliedAt !== null, null, appliedAt),
      followUp: step(!!followedUp, null, followedUp?.at ?? (reachedAt === Infinity ? null : reachedAt + FOLLOW_UP_DAYS * DAY_MS)),
    },
  };
}

// The first pursuit: of their pursuits, the one furthest through its steps, the earliest started among equals. Null
// before they start one.
async function firstPursuit(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const pursuits = await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(PURSUITS_READ);
  let best: { first: FirstPursuit; done: number; at: number } | null = null;
  for (const p of pursuits) {
    const first = await pursuitOf(ctx, p);
    const done = Object.values(first.steps).filter((s) => s.done).length;
    if (!best || done > best.done || (done === best.done && p.at < best.at)) best = { first, done, at: p.at };
  }
  return best?.first ?? null;
}

// Getting started: Setup (signed in; an OpenRouter key and an AI budget; a first story; a fact approved from it; a
// direction or limit approved; a base resume; an Apollo key; a target company or ranked roles; Google Drive connected
// or skipped), then the first pursuit. Each step done or not, worked out from what the workspace already holds,
// with the line a done step shows; whether they put it away until later; and what reading a story has cost them per
// word so far (null before their first), for the estimate beside Done, read it.
export const setup = query({
  args: {},
  handler: async (ctx) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    const workspace = await ctx.db.get(workspaceId);
    const skipped = workspace?.setupSkipped ?? [];
    const user = await ctx.db.get(userId);
    const key = await ctx.db.query("apiKeys").withIndex("by_workspace_service", (q) => q.eq("workspaceId", workspaceId).eq("service", "openrouter")).unique();
    const apollo = await ctx.db.query("apiKeys").withIndex("by_workspace_service", (q) => q.eq("workspaceId", workspaceId).eq("service", "apollo")).unique();
    const budget = await ctx.db.query("budgets").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    const drive = await ctx.db.query("driveConnections").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    const stories = (await ctx.db.query("narratives").withIndex("by_workspace_kind", (q) => q.eq("workspaceId", workspaceId).eq("kind", "career")).collect()).filter((n) => n.rejectedAt === undefined);
    const facts = (await itemsOf(ctx, workspaceId, "fact", "approved")).length;
    const directions = (await itemsOf(ctx, workspaceId, "direction", "approved")).length;
    const limits = (await itemsOf(ctx, workspaceId, "limit", "approved")).length;
    const base = await ctx.db
      .query("resumes")
      .withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", undefined))
      .filter((q) => q.and(q.eq(q.field("posting"), undefined), q.neq(q.field("toReview"), true)))
      .first();
    const targets = (await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).filter((c) => c.rating?.value === "excited").length;
    const ranked = await ctx.db.query("roleRanks").withIndex("by_newest", (q) => q.eq("workspaceId", workspaceId).eq("directionId", undefined).eq("state", "judged")).first();

    // Reading so far: what each story read cost, over the words it held.
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(200);
    let usd = 0;
    let words = 0;
    for (const j of jobs) {
      if (j.kind !== "extract" || j.status !== "done" || typeof j.result?.costUsd !== "number") continue;
      const n = stories.find((s) => s._id === j.args.narrativeId);
      if (!n) continue;
      usd += j.result.costUsd;
      words += n.body.split(/\s+/).filter(Boolean).length;
    }
    const credits = budget?.apolloMonthlyCredits ?? 0;

    return {
      // Keys what this browser keeps for them (a story draft) to their workspace.
      workspaceId: workspaceId as string,
      hidden: workspace?.setupHidden ?? false,
      storyUsdPerWord: words > 0 ? usd / words : null,
      firstStory: stories[0] ? { id: stories[0]._id, title: stories[0].title } : null,
      // The optional steps they left out (Skip).
      skipped,
      steps: {
        // Always done here: they're signed in. The email they signed in with. (A self-hosted copy's owner account, made
        // with a username and password on first run, shows its username and "owner of this copy" instead once password
        // sign-in lands.)
        signIn: step(true, user?.email ?? null),
        key: step(!!key && (budget?.aiMonthlyUsd ?? 0) > 0, key ? `Key added${budget?.aiMonthlyUsd ? ` · $${budget.aiMonthlyUsd} a month` : ""}` : null),
        story: step(stories.length > 0, stories.length ? stories.map((s) => s.title).join(", ") : null),
        // Done once anything from their story is approved; what's still waiting is Review's, not setup's.
        review: step(facts > 0, facts ? `${plural(facts, "fact", "facts")} approved` : null),
        goals: step(directions + limits > 0, directions + limits ? [directions && plural(directions, "direction", "directions"), limits && plural(limits, "limit", "limits")].filter(Boolean).join(" · ") : null),
        resume: step(!!base, base ? "Written" : null),
        apollo: step(!!apollo, apollo ? `Key added${credits > 0 ? ` · ${credits.toLocaleString("en-US")} credits a month` : ""}` : null),
        companies: step(targets > 0 || !!ranked, targets ? `${targets} target ${targets === 1 ? "company" : "companies"}` : ranked ? "Roles ranked" : null),
        // Optional: connected, or left out with Skip.
        drive: step(!!drive || skipped.includes("drive"), drive ? `Connected · ${drive.account}` : skipped.includes("drive") ? "Skipped" : null),
      },
      firstPursuit: await firstPursuit(ctx, workspaceId),
    };
  },
});

// Put Getting started away until later, or bring it back; kept for the workspace.
export const hideSetup = mutation({
  args: { hidden: v.boolean() },
  handler: async (ctx, { hidden }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await ctx.db.patch(workspaceId, { setupHidden: hidden || undefined });
  },
});

// Leave Google Drive out of Getting started, or bring it back (Undo).
export const skipStep = mutation({
  args: { step: v.literal("drive"), skipped: v.boolean() },
  handler: async (ctx, { step: name, skipped }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const workspace = await ctx.db.get(workspaceId);
    const rest = (workspace?.setupSkipped ?? []).filter((s) => s !== name);
    const next = skipped ? [...rest, name] : rest;
    await ctx.db.patch(workspaceId, { setupSkipped: next.length ? next : undefined });
  },
});
