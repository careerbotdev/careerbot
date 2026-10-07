import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { budgetStatus, monthStart } from "./budgets";
import { itemsOf } from "./itemShapes";
import { CONTACT_GROUPS, type ContactGroup, groupOf } from "./contactGroups";
import { CLOSED_REASONS, type ClosedReason, outcomeSuggestions, PATHS, type Path, pathOf, reachedOf, wentOut } from "./pursuitSteps";
import { addSpend, DAY_MS, dayOf, type Metric, STANDING, tally, talliedSince } from "./tallies";
import { requireWorkspace } from "./workspaces";

// Reports: what's been spent and how the search is going, this month, this quarter (both UTC, like budgets), or since
// the workspace began. Figures come from running totals (tallies.ts) and reads bounded by an index, so a report stays
// inside Convex's limits however large a workspace grows. Spending counts settled calls. Calls still running or waiting
// on the daily check (metering.reconcile) are "not settled", and calls the providers couldn't settle are "unresolved",
// each with what's known of them. Calls from before who started them was kept count as "unknown".

const period = v.union(v.literal("month"), v.literal("quarter"), v.literal("all"));
type Period = Infer<typeof period>;

// When a period starts: the 1st of this month or of this quarter (UTC), or the day the workspace began.
export function periodStart(p: Period, now: number, began: number) {
  const d = new Date(now);
  const m = d.getUTCMonth();
  if (p === "month") return Date.UTC(d.getUTCFullYear(), m, 1);
  if (p === "quarter") return Date.UTC(d.getUTCFullYear(), m - (m % 3), 1);
  return dayOf(began);
}

// The Monday (UTC) of the week a time falls in. Day 0 of Unix time was a Thursday.
export function weekOf(at: number) {
  const day = Math.floor(at / DAY_MS);
  return (day - ((day + 3) % 7)) * DAY_MS;
}

function weeksBetween(from: number, to: number) {
  const out: number[] = [];
  for (let w = weekOf(from); w <= to; w += 7 * DAY_MS) out.push(w);
  return out;
}

function monthsBetween(from: number, to: number) {
  const out: number[] = [];
  for (let m = monthStart(from); m <= to; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) out.push(m);
  return out;
}

async function scopeOf(ctx: QueryCtx, p: Period) {
  const { workspaceId } = await requireWorkspace(ctx);
  const workspace = (await ctx.db.get(workspaceId))!;
  const began = workspace.began ?? workspace._creationTime;
  const now = workspace.asOf ?? Date.now();
  return { workspaceId, began, now, from: periodStart(p, now, began) };
}

const sumN = (rows: { n: number }[]) => rows.reduce((t, r) => t + r.n, 0);

// Where each task's spending shows: the area of CareerBot it's for. Anything else (a test call, comparing models,
// operator runs) is "Other".
export const AREAS = ["Record", "Goals", "Companies", "Pursuits", "Resumes", "Other"] as const;
type Area = (typeof AREAS)[number];
const AREA_OF: Record<string, Area> = {
  extract: "Record", rework: "Record", revision: "Record", check: "Record", insights: "Record", followups: "Record", duplicates: "Record", project: "Record", "same work": "Record", skills: "Record",
  goals: "Goals", "limit rule": "Goals", "suggest directions": "Goals", "direction detail": "Goals",
  "find seed companies": "Companies", "companies you named": "Companies", "find companies": "Companies", "large companies": "Companies", "hiring now": "Companies", "lookalike companies": "Companies",
  "company summaries": "Companies", "company summaries (general knowledge)": "Companies", "company fit": "Companies", "screen companies": "Companies", "job postings": "Companies", "role sort": "Companies", "role fit": "Companies",
  "ask about this role": "Pursuits", "cover letter": "Pursuits", outreach: "Pursuits", "follow-up": "Pursuits", "find people": "Pursuits", "reveal an email": "Pursuits",
  resume: "Resumes", "direction resume": "Resumes", "tailored resume": "Resumes", "resume lines": "Resumes", "line check": "Resumes",
};

type Spend = { aiUsd: number; apolloCredits: number; calls: number };
const noSpend = (): Spend => ({ aiUsd: 0, apolloCredits: 0, calls: 0 });
function addTo(s: Spend, r: Doc<"spendTotals">) {
  s.aiUsd += r.usd;
  s.apolloCredits += r.credits;
  s.calls += r.calls;
  return s;
}

const spendSince = (ctx: QueryCtx, workspaceId: Id<"workspaces">, from: number) =>
  ctx.db.query("spendTotals").withIndex("by_key", (q) => q.eq("workspaceId", workspaceId).gte("month", monthStart(from))).collect();

// Calls read per state for "not settled" and "unresolved": far more than a healthy workspace ever has waiting.
const UNSETTLED_CAP = 1000;

// Calls since `from` that aren't in the settled totals: still running or waiting on the daily check (notSettled), and
// ones the providers couldn't settle (unresolved). AI: what's known of their cost; Apollo: the most they could cost.
async function unsettledSince(ctx: QueryCtx, workspaceId: Id<"workspaces">, from: number) {
  const inState = (state: "reserved" | "indeterminate" | "unresolved") =>
    ctx.db.query("usage").withIndex("by_workspace_state", (q) => q.eq("workspaceId", workspaceId).eq("state", state).gte("at", from)).take(UNSETTLED_CAP);
  const sum = (rows: Doc<"usage">[]) => {
    const ai = rows.filter((r) => r.service === "openrouter");
    const apollo = rows.filter((r) => r.service === "apollo");
    return { aiCalls: ai.length, aiKnownUsd: ai.reduce((n, r) => n + (r.costUsd ?? 0), 0), apolloCalls: apollo.length, apolloCreditsAtMost: apollo.reduce((n, r) => n + (r.credits ?? 0), 0) };
  };
  return { notSettled: sum([...(await inState("reserved")), ...(await inState("indeterminate"))]), unresolved: sum(await inState("unresolved")) };
}

// When someone at the company first replied: a contact marked replied (the pursuit's first reply), or its first move to
// In conversation, Interviewing or Offer, or to Closed as rejected or declined. null when no one has.
function firstReplyAt(p: Doc<"pursuits">) {
  const moved = p.timeline.find(
    (e) => e.event === "status" && (e.status === "inConversation" || e.status === "interviewing" || e.status === "offer" || (e.status === "closed" && (e.reason === "rejected" || e.reason === "declined"))),
  )?.at;
  const at = Math.min(p.repliedAt ?? Infinity, moved ?? Infinity);
  return at === Infinity ? null : at;
}

// When they first reached out or applied (the earlier of the first outreach message and the application), the moment
// the wait for a reply starts. null before either.
function reachedOutAt(p: Doc<"pursuits">) {
  const at = Math.min(p.contactedAt ?? Infinity, p.appliedAt ?? Infinity);
  return at === Infinity ? null : at;
}

// Pursuits active since `from` (the index is by last activity), so any started, applied or answered since then.
const pursuitsSince = (ctx: QueryCtx, workspaceId: Id<"workspaces">, from: number) =>
  ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).gte("changedAt", from)).collect();

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// This month's spending against the budgets, and the period's progress beside everything since the workspace began.
export const overview = query({
  args: { period },
  handler: async (ctx, { period: p }) => {
    const { workspaceId, began, now, from } = await scopeOf(ctx, p);
    const spend = await spendSince(ctx, workspaceId, began);
    const pursuits = await pursuitsSince(ctx, workspaceId, dayOf(began));
    const tallied = async (metric: Metric) => {
      const rows = await talliedSince(ctx, workspaceId, metric, dayOf(began));
      return { inPeriod: sumN(rows.filter((r) => r.day >= from)), sinceBegan: sumN(rows) };
    };
    const progress = (since: number) => {
      const s = spend.filter((r) => r.month >= monthStart(since)).reduce(addTo, noSpend());
      return {
        aiUsd: s.aiUsd,
        apolloCredits: s.apolloCredits,
        pursuitsStarted: pursuits.filter((x) => x.at >= since).length,
        // By the day of the first outreach message, the application, and the earlier of the two.
        contacted: pursuits.filter((x) => (x.contactedAt ?? -1) >= since).length,
        applied: pursuits.filter((x) => (x.appliedAt ?? -1) >= since).length,
        contactedOrApplied: pursuits.filter((x) => (reachedOutAt(x) ?? -1) >= since).length,
        replies: pursuits.filter((x) => (firstReplyAt(x) ?? -1) >= since).length,
      };
    };
    const [strongRoles, factsApproved, companiesFound] = [await tallied("strongRoles"), await tallied("factsApproved"), await tallied("companies")];
    return {
      period: p,
      from,
      to: now,
      began,
      budget: await budgetStatus(ctx, workspaceId, now),
      inPeriod: { ...progress(from), strongRoles: strongRoles.inPeriod, factsApproved: factsApproved.inPeriod, companiesFound: companiesFound.inPeriod, ...(await unsettledSince(ctx, workspaceId, from)) },
      sinceBegan: { ...progress(began), strongRoles: strongRoles.sinceBegan, factsApproved: factsApproved.sinceBegan, companiesFound: companiesFound.sinceBegan },
    };
  },
});

// AI dollars and Apollo credits over the period: by month, task, area, who started the work, and pursuit.
export const spending = query({
  args: { period },
  handler: async (ctx, { period: p }) => {
    const { workspaceId, now, from } = await scopeOf(ctx, p);
    const rows = await spendSince(ctx, workspaceId, from);
    const months = monthsBetween(from, now).map((month) => ({ month, ...rows.filter((r) => r.month === month).reduce(addTo, noSpend()) }));
    const tasks = new Map<string, Spend & { task: string; area: Area }>();
    const areas = new Map<Area, Spend>(AREAS.map((a) => [a, noSpend()]));
    const origins = { you: noSpend(), automatic: noSpend(), unknown: noSpend() };
    const byPursuit = new Map<Id<"pursuits">, Spend>();
    for (const r of rows) {
      const area = AREA_OF[r.task] ?? "Other";
      const t = tasks.get(r.task) ?? { task: r.task, area, ...noSpend() };
      tasks.set(r.task, addTo(t, r) as typeof t);
      addTo(areas.get(area)!, r);
      addTo(origins[r.origin ?? "unknown"], r);
      if (r.pursuitId) byPursuit.set(r.pursuitId, addTo(byPursuit.get(r.pursuitId) ?? noSpend(), r));
    }
    const pursuits = [];
    for (const [pursuitId, s] of byPursuit) {
      const pursuit = await ctx.db.get(pursuitId);
      pursuits.push({ pursuitId, title: pursuit?.title ?? null, company: pursuit?.company ?? null, ...s });
    }
    const budget = await budgetStatus(ctx, workspaceId, now);
    return {
      period: p,
      from,
      to: now,
      budget: { aiMonthlyUsd: budget.aiMonthlyUsd, apolloMonthlyCredits: budget.apolloMonthlyCredits },
      months,
      tasks: [...tasks.values()].sort((a, b) => b.aiUsd - a.aiUsd || b.apolloCredits - a.apolloCredits),
      areas: [...areas].map(([area, s]) => ({ area, ...s })),
      origins,
      pursuits: pursuits.sort((a, b) => b.aiUsd - a.aiUsd || b.apolloCredits - a.apolloCredits),
      ...(await unsettledSince(ctx, workspaceId, from)),
    };
  },
});

const BUCKETS = ["strong", "some", "weak", "none", "against", "sortedOut"] as const;
type Bucket = (typeof BUCKETS)[number];

// Companies found and targets by week (targets: how many there were at the week's end), listed roles by fit for each
// direction (now), the pursuits started in the period by direction and how far they got, and how long companies took
// to answer. targets: how many there are now.
export const search = query({
  args: { period },
  handler: async (ctx, { period: p }) => {
    const { workspaceId, began, now, from } = await scopeOf(ctx, p);
    const found = await talliedSince(ctx, workspaceId, "companies", from);
    const targets = await talliedSince(ctx, workspaceId, "targets", dayOf(began));
    const weeks = weeksBetween(from, now).map((week) => {
      const end = week + 7 * DAY_MS;
      return { week, companiesFound: sumN(found.filter((r) => r.day >= Math.max(week, from) && r.day < end)), targets: sumN(targets.filter((r) => r.day < end)) };
    });

    const directions = await itemsOf(ctx, workspaceId, "direction", "approved");
    const ranked = new Map(directions.map((d) => [String(d._id), Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>]));
    for (const r of await talliedSince(ctx, workspaceId, "roles", STANDING)) {
      const [directionId, bucket] = (r.key ?? "").split("|");
      const counts = ranked.get(directionId);
      if (counts && bucket in counts) counts[bucket as Bucket] += r.n;
    }

    const active = await pursuitsSince(ctx, workspaceId, from);
    const started = active.filter((x) => x.at >= from);
    type Step = { directionId: Id<"items"> | null; direction: string | null; started: number; contacted: number; applied: number; contactedOrApplied: number; interviewing: number; offer: number; open: number; closed: Record<ClosedReason, number> };
    const funnel = new Map<string, Step>();
    for (const x of started) {
      const key = x.directionId ?? "";
      const f = funnel.get(key) ?? { directionId: x.directionId ?? null, direction: x.direction ?? null, started: 0, contacted: 0, applied: 0, contactedOrApplied: 0, interviewing: 0, offer: 0, open: 0, closed: Object.fromEntries(CLOSED_REASONS.map((c) => [c, 0])) as Record<ClosedReason, number> };
      const reached = reachedOf(x.timeline);
      const went = wentOut(x);
      f.started += 1;
      if (went.contacted) f.contacted += 1;
      if (went.applied) f.applied += 1;
      if (went.contactedOrApplied) f.contactedOrApplied += 1;
      if (reached === "interviewing" || reached === "offer") f.interviewing += 1;
      if (reached === "offer") f.offer += 1;
      if (x.status === "closed" && x.closedReason) f.closed[x.closedReason] += 1;
      else f.open += 1;
      funnel.set(key, f);
    }

    // Days from reaching out or applying to the first reply, for replies that came in the period.
    const waits = active.flatMap((x) => {
      const reply = firstReplyAt(x);
      const start = reachedOutAt(x);
      return reply !== null && reply >= from && start !== null && reply >= start ? [(reply - start) / DAY_MS] : [];
    });

    return {
      period: p,
      from,
      to: now,
      weeks,
      companiesFound: sumN(found),
      targets: sumN(targets),
      roles: directions.map((d) => ({ directionId: d._id, direction: d.data.name, ...ranked.get(String(d._id))! })),
      funnel: [...funnel.values()].sort((a, b) => b.started - a.started),
      replies: { count: waits.length, medianDays: median(waits) },
    };
  },
});

type Outcome = { contacted: number; applied: number; contactedOrApplied: number; interviewed: number; offers: number; open: number; closed: Record<ClosedReason, number> };
const noOutcome = (): Outcome => ({ contacted: 0, applied: 0, contactedOrApplied: 0, interviewed: 0, offers: 0, open: 0, closed: Object.fromEntries(CLOSED_REASONS.map((c) => [c, 0])) as Record<ClosedReason, number> });

// What a pursuit went on to do and how far it got (at any time, whatever it is now; wentOut, reachedOf), and how it
// closed, added to `o`.
function addOutcome(o: Outcome, p: Doc<"pursuits">) {
  const reached = reachedOf(p.timeline);
  const went = wentOut(p);
  if (went.contacted) o.contacted += 1;
  if (went.applied) o.applied += 1;
  if (went.contactedOrApplied) o.contactedOrApplied += 1;
  if (reached === "interviewing" || reached === "offer") o.interviewed += 1;
  if (reached === "offer") o.offers += 1;
  if (p.status === "closed" && p.closedReason) o.closed[p.closedReason] += 1;
  else o.open += 1;
}

// Outcomes of the pursuits started in the period: for each direction (the one it was started for, named as it was
// then), how many started, were contacted, applied, either, got as far as Interviewing and an Offer, are open, and
// closed for each reason; the same for the applications (pursuits set to Applied) by the resume version they were
// sent with; for each path (pursuitSteps.pathOf; a pursuit with no path yet isn't counted), how many started, got a
// reply from someone there (firstReplyAt), got to an interview or an offer, and the median days to the first reply from
// the first outreach message or the application; for each contact group, how many people were written to and how many
// replied; and suggestions worked out from those counts (pursuitSteps.outcomeSuggestions). Nothing here changes
// anything. A resume version is the direction resume current when the tailored resume sent was written, the one
// tailoring started from (current: still the direction's current one). Applications sent without a tailored resume kept
// count under none (versionId and direction null).
export const outcomes = query({
  args: { period },
  handler: async (ctx, { period: p }) => {
    const { workspaceId, now, from } = await scopeOf(ctx, p);
    const started = (await pursuitsSince(ctx, workspaceId, from)).filter((x) => x.at >= from);

    type Version = { directionId: Id<"items"> | null; direction: string | null; versionId: Id<"resumes"> | null; versionAt: number | null; current: boolean };
    const currentOf = new Map<string, Id<"resumes">>();
    // The direction resume current when a tailored one was written, and whether it's current now.
    const versionOf = async (resumeId: Id<"resumes"> | undefined, direction: string | null): Promise<Version> => {
      const tailored = resumeId ? await ctx.db.get(resumeId) : null;
      const directionId = tailored?.workspaceId === workspaceId ? tailored.directionId : undefined;
      if (!tailored || !directionId) return { directionId: null, direction: null, versionId: null, versionAt: null, current: false };
      let version: Doc<"resumes"> | null = null;
      // Newest first: the first kept version is the current one; the first kept by the time it was written, its version.
      for await (const r of ctx.db.query("resumes").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId)).order("desc")) {
        if (r.posting !== undefined || r.toReview) continue;
        if (!currentOf.has(directionId)) currentOf.set(directionId, r._id);
        if (r.at <= tailored.at) {
          version = r;
          break;
        }
      }
      const item = await ctx.db.get(directionId);
      const name = item?.kind === "direction" ? item.data.name : direction;
      return { directionId, direction: name, versionId: version?._id ?? null, versionAt: version?.at ?? null, current: !!version && currentOf.get(directionId) === version._id };
    };

    const directions = new Map<string, Outcome & { directionId: Id<"items"> | null; direction: string | null; started: number }>();
    const versions = new Map<string, Outcome & Version>();
    const paths = new Map<Path, { started: number; replied: number; interviewed: number; offers: number; waits: number[] }>();
    const groups = Object.fromEntries(CONTACT_GROUPS.map((g) => [g, { written: 0, replied: 0 }])) as Record<ContactGroup, { written: number; replied: number }>;
    for (const x of started) {
      const d = directions.get(x.directionId ?? "") ?? { directionId: x.directionId ?? null, direction: x.direction ?? null, started: 0, ...noOutcome() };
      d.started += 1;
      addOutcome(d, x);
      directions.set(x.directionId ?? "", d);

      const path = pathOf(x);
      if (path) {
        const reached = reachedOf(x.timeline);
        const reply = firstReplyAt(x);
        const start = reachedOutAt(x);
        const c = paths.get(path) ?? { started: 0, replied: 0, interviewed: 0, offers: 0, waits: [] };
        c.started += 1;
        if (reply !== null) c.replied += 1;
        if (reached === "interviewing" || reached === "offer") c.interviewed += 1;
        if (reached === "offer") c.offers += 1;
        if (reply !== null && start !== null && reply >= start) c.waits.push((reply - start) / DAY_MS);
        paths.set(path, c);
      }
      for (const contact of await ctx.db.query("contacts").withIndex("by_pursuit", (q) => q.eq("pursuitId", x._id)).collect()) {
        if (!contact.sent?.length) continue;
        const g = groups[contact.group ?? groupOf(x.title, contact.title)];
        g.written += 1;
        if (contact.repliedAt !== undefined) g.replied += 1;
      }

      if (!wentOut(x).applied) continue;
      const version = await versionOf(x.sent?.resumeId, x.direction ?? null);
      const key = `${version.directionId ?? ""}|${version.versionId ?? ""}`;
      const v = versions.get(key) ?? { ...version, ...noOutcome() };
      addOutcome(v, x);
      versions.set(key, v);
    }

    const byDirection = [...directions.values()].sort((a, b) => b.contactedOrApplied - a.contactedOrApplied || b.started - a.started);
    // Each direction's versions together, newest first; applications sent without a tailored resume last.
    const byVersion = [...versions.values()].sort((a, b) => (a.direction === null ? 1 : 0) - (b.direction === null ? 1 : 0) || (a.direction ?? "").localeCompare(b.direction ?? "") || (b.versionAt ?? 0) - (a.versionAt ?? 0));
    const dayName = (at: number) => new Date(at).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
    const byPath = PATHS.flatMap((path) => {
      const c = paths.get(path);
      return c ? [{ path, started: c.started, replied: c.replied, interviewed: c.interviewed, offers: c.offers, replyDays: median(c.waits) }] : [];
    });
    const suggestions = outcomeSuggestions(
      byDirection.flatMap((d) => (d.direction ? [{ ...d, name: d.direction }] : [])),
      byVersion.flatMap((v) => (v.direction && v.versionAt !== null ? [{ ...v, direction: v.direction, name: `${dayName(v.versionAt)} ${v.direction}` }] : [])),
      byPath,
    );
    return { period: p, from, to: now, directions: byDirection, versions: byVersion, paths: byPath, groups: CONTACT_GROUPS.map((group) => ({ group, ...groups[group] })), suggestions };
  },
});

// How the record grew: stories written, facts and insights approved, resume versions kept (and of those, written from
// Resume updates), and tailored resumes written, by week.
export const record = query({
  args: { period },
  handler: async (ctx, { period: p }) => {
    const { workspaceId, began, now, from } = await scopeOf(ctx, p);
    const metrics = ["factsApproved", "insightsApproved", "resumeKept", "resumeUpdated", "tailored"] as const;
    const all = Object.fromEntries(await Promise.all(metrics.map(async (m) => [m, await talliedSince(ctx, workspaceId, m, dayOf(began))] as const))) as Record<(typeof metrics)[number], Doc<"tallies">[]>;
    const stories = await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    const weeks = weeksBetween(from, now).map((week) => {
      const inWeek = (at: number) => at >= Math.max(week, from) && at < week + 7 * DAY_MS;
      const count = (m: (typeof metrics)[number]) => sumN(all[m].filter((r) => inWeek(r.day)));
      return {
        week,
        stories: stories.filter((s) => inWeek(s._creationTime)).length,
        factsApproved: count("factsApproved"),
        insightsApproved: count("insightsApproved"),
        resumeKept: count("resumeKept"),
        resumeUpdated: count("resumeUpdated"),
        tailored: count("tailored"),
      };
    });
    const total = (m: (typeof metrics)[number]) => sumN(all[m]);
    return {
      period: p,
      from,
      to: now,
      weeks,
      // Everything since the workspace began: what the record holds now.
      totals: {
        stories: stories.length,
        factsApproved: total("factsApproved"),
        insightsApproved: total("insightsApproved"),
        resumeKept: total("resumeKept"),
        resumeUpdated: total("resumeUpdated"),
        tailored: total("tailored"),
      },
    };
  },
});

// Background work done and failed, by kind, per week.
export const activity = query({
  args: { period },
  handler: async (ctx, { period: p }) => {
    const { workspaceId, now, from } = await scopeOf(ctx, p);
    const done = await talliedSince(ctx, workspaceId, "jobDone", from);
    const failed = await talliedSince(ctx, workspaceId, "jobFailed", from);
    const byKind = (rows: Doc<"tallies">[]) => {
      const out: Record<string, number> = {};
      for (const r of rows) if (r.key) out[r.key] = (out[r.key] ?? 0) + r.n;
      return out;
    };
    return {
      period: p,
      from,
      to: now,
      weeks: weeksBetween(from, now).map((week) => {
        const inWeek = (r: Doc<"tallies">) => r.day >= Math.max(week, from) && r.day < week + 7 * DAY_MS;
        return { week, done: byKind(done.filter(inWeek)), failed: byKind(failed.filter(inWeek)) };
      }),
      done: byKind(done),
      failed: byKind(failed),
    };
  },
});

// ---- Starting the totals from what's already there ----

// Run after deploying the running totals, for every workspace: `npx convex run reports:backfillAll`. It adds what
// isn't in the totals yet: each settled call not marked inTotals, and each row not marked `tallied` (companies found
// and targets, approved facts and insights, resume versions, finished jobs, listed roles and strong ones), marking it,
// so it's counted once however often it runs, even while another run or the changes it's catching up with are going.
// Rows from before are dated by when they were made (an approval isn't dated, so a fact counts on the day it was last
// worded; a strong role on the day it was listed).
const STEPS = ["spend", "companies", "items", "resumes", "jobs", "roles"] as const;
type Step = (typeof STEPS)[number];
const BACKFILL_PAGE = 100;

export const backfillAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const w of await ctx.db.query("workspaces").collect()) await ctx.scheduler.runAfter(0, internal.reports.backfill, { workspaceId: w._id, step: "spend", cursor: null });
  },
});

export const backfill = internalMutation({
  args: { workspaceId: v.id("workspaces"), step: v.union(...STEPS.map((s) => v.literal(s))), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { workspaceId, step, cursor }) => {
    const page = await backfillPage(ctx, workspaceId, step, cursor);
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.reports.backfill, { workspaceId, step, cursor: page.continueCursor });
    else if (next) await ctx.scheduler.runAfter(0, internal.reports.backfill, { workspaceId, step: next, cursor: null });
  },
});

async function backfillPage(ctx: MutationCtx, workspaceId: Id<"workspaces">, step: Step, cursor: string | null) {
  const opts = { cursor, numItems: BACKFILL_PAGE };
  const count = (metric: Metric, at: number, key?: string) => tally(ctx, workspaceId, metric, metric === "roles" ? STANDING : dayOf(at), 1, key);
  switch (step) {
    case "spend": {
      const page = await ctx.db.query("usage").withIndex("by_workspace_state", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const r of page.page) await addSpend(ctx, r);
      return page;
    }
    case "companies": {
      const page = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const c of page.page) {
        const target = c.rating?.value === "excited" && !c.talliedTarget;
        if (c.talliedFound && !target) continue;
        if (!c.talliedFound) await count("companies", c.at);
        if (target) await count("targets", c.rating!.at);
        await ctx.db.patch(c._id, { talliedFound: true, ...(target ? { talliedTarget: true } : {}) });
      }
      return page;
    }
    case "items": {
      const page = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const i of page.page) {
        if (i.tallied || i.status !== "approved" || !(i.kind === "fact" || i.kind === "insight")) continue;
        await count(i.kind === "fact" ? "factsApproved" : "insightsApproved", Math.max(i.at, ...(i.data.history ?? []).map((h) => h.at)));
        await ctx.db.patch(i._id, { tallied: true });
      }
      return page;
    }
    case "resumes": {
      const page = await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const r of page.page) {
        if (r.tallied || (r.posting === undefined && r.toReview)) continue;
        if (r.posting !== undefined) await count("tailored", r.at);
        else {
          await count("resumeKept", r.at);
          if (r.writtenAt !== undefined) await count("resumeUpdated", r.at);
        }
        await ctx.db.patch(r._id, { tallied: true });
      }
      return page;
    }
    case "jobs": {
      const page = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const j of page.page) {
        if (j.tallied || !(j.status === "done" || j.status === "failed")) continue;
        await count(j.status === "done" ? "jobDone" : "jobFailed", j.startedAt ?? j._creationTime, j.kind);
        await ctx.db.patch(j._id, { tallied: true });
      }
      return page;
    }
    case "roles": {
      const page = await ctx.db.query("roleRanks").withIndex("by_ranked", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const r of page.page) {
        if (r.tallied) continue;
        if (r.directionId) await count("roles", 0, `${r.directionId}|${r.state === "judged" ? r.level : r.state}`);
        else if (r.state === "judged" && r.level === "strong") await count("strongRoles", r._creationTime);
        else continue;
        await ctx.db.patch(r._id, { tallied: true });
      }
      return page;
    }
  }
}
