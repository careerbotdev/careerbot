import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CONTACT_GROUPS } from "../../../convex/contactGroups";
import { answer, type Answers } from "../storyConvex";
import type { ActivityReport, OutcomesReport, Overview, Period, RecordReport, Search, Spending } from "./words";

// Fixture data for the Reports stories, in step with the Reports boards: a workspace begun Jun 2, today Sep 29 (UTC).
// This month: $9.14 of a $25 AI budget ($5.02 automatic, $4.12 asked for), 64 of 200 Apollo credits, 6 pursuits
// started, 6 contacted or applied (3 contacted, 3 applied), 3 replies, 23 new strong roles, 38 facts approved, 87
// pieces of work done and 3 failed. Two AI calls are still waiting for their price and one Apollo call couldn't be
// priced. `empty` answers a workspace with nothing yet; `loading` never answers.

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 29, 15);
const BEGAN = Date.UTC(2026, 5, 2, 10);
const START: Record<Period, number> = { month: Date.UTC(2026, 8, 1), quarter: Date.UTC(2026, 6, 1), all: Date.UTC(2026, 5, 2) };
const MONTHS = [Date.UTC(2026, 5, 1), Date.UTC(2026, 6, 1), Date.UTC(2026, 7, 1), Date.UTC(2026, 8, 1)];

const weekOf = (at: number) => {
  const day = Math.floor(at / DAY);
  return (day - ((day + 3) % 7)) * DAY;
};
const weeksFrom = (from: number) => {
  const out: number[] = [];
  for (let w = weekOf(from); w <= NOW; w += 7 * DAY) out.push(w);
  return out;
};
// Spread a total over n weeks, leaning toward the latest.
const spread = (totalN: number, n: number) => {
  const weights = Array.from({ length: n }, (_, i) => i + 2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((w * totalN) / sum));
  out[n - 1] += totalN - out.reduce((a, b) => a + b, 0);
  return out;
};

const none = { aiCalls: 0, aiKnownUsd: 0, apolloCalls: 0, apolloCreditsAtMost: 0 };
const NOT_SETTLED = { aiCalls: 2, aiKnownUsd: 0.04, apolloCalls: 0, apolloCreditsAtMost: 0 };
const UNRESOLVED = { aiCalls: 0, aiKnownUsd: 0, apolloCalls: 1, apolloCreditsAtMost: 1 };
const BUDGET = { aiMonthlyUsd: 25, aiSpentUsd: 9.14, apolloMonthlyCredits: 200, apolloSpentCredits: 64, apolloMode: "on" as const };

// By month: AI dollars, Apollo credits, calls.
const BY_MONTH: [number, number, number][] = [
  [3.8, 48, 210],
  [6.25, 131, 402],
  [7.04, 200, 455],
  [9.14, 64, 528],
];
const monthsIn = (p: Period) =>
  BY_MONTH.map(([aiUsd, apolloCredits, calls], i) => ({ month: MONTHS[i], aiUsd, apolloCredits, calls })).filter((m) => m.month >= Date.UTC(2026, new Date(START[p]).getUTCMonth(), 1));
// How much of the whole period's spending each figure below is: this month's are the board's own.
const scale = (p: Period) => monthsIn(p).reduce((t, m) => t + m.aiUsd, 0) / 9.14;

const PROGRESS: Record<Period, Omit<Overview["inPeriod"], "notSettled" | "unresolved">> = {
  month: { aiUsd: 9.14, apolloCredits: 64, pursuitsStarted: 6, contacted: 3, applied: 3, contactedOrApplied: 6, replies: 3, strongRoles: 23, factsApproved: 38, companiesFound: 34 },
  quarter: { aiUsd: 22.43, apolloCredits: 395, pursuitsStarted: 9, contacted: 5, applied: 5, contactedOrApplied: 8, replies: 4, strongRoles: 38, factsApproved: 128, companiesFound: 98 },
  all: { aiUsd: 26.23, apolloCredits: 443, pursuitsStarted: 9, contacted: 5, applied: 5, contactedOrApplied: 8, replies: 4, strongRoles: 42, factsApproved: 212, companiesFound: 146 },
};

function overview(p: Period): Overview {
  return {
    period: p,
    from: START[p],
    to: NOW,
    began: BEGAN,
    budget: BUDGET,
    inPeriod: { ...PROGRESS[p], notSettled: NOT_SETTLED, unresolved: UNRESOLVED },
    sinceBegan: PROGRESS.all,
  };
}

const TASKS: [string, string, number, number, number][] = [
  ["role sort", "Companies", 2.86, 0, 212],
  ["resume", "Resumes", 1.64, 0, 14],
  ["company fit", "Companies", 1.42, 0, 96],
  ["extract", "Record", 1.18, 0, 9],
  ["cover letter", "Pursuits", 0.71, 0, 6],
  ["outreach", "Pursuits", 0.38, 0, 5],
  ["insights", "Record", 0.32, 0, 4],
  ["goals", "Goals", 0.12, 0, 2],
  ["rework", "Record", 0.28, 0, 11],
  ["follow-up", "Pursuits", 0.12, 0, 3],
  ["duplicates", "Record", 0.11, 0, 3],
  ["find companies", "Companies", 0, 38, 12],
  ["job postings", "Companies", 0, 19, 19],
  ["reveal an email", "Pursuits", 0, 7, 7],
];

const PURSUITS: [string, string, number, number][] = [
  ["Senior Product Manager, Load Planning", "Loadstar Systems", 0.78, 2],
  ["Solutions Consultant, Food & Beverage", "Meridian Coldchain", 0.61, 1],
  ["Head of Operations", "Parcelpoint", 0.52, 2],
  ["Product Manager, Carrier Network", "Kestrel Freight", 0.44, 1],
  ["Solutions Engineer, Manufacturing", "Lumen Planning", 0.35, 0],
  ["Senior Product Manager, Replenishment", "Northgate Grocers", 0.26, 1],
];

function spending(p: Period): Spending {
  const k = scale(p);
  const s = (n: number) => Math.round(n * k * 100) / 100;
  const tasks = TASKS.map(([task, area, usd, credits, calls]) => ({ task, area: area as Spending["tasks"][number]["area"], aiUsd: s(usd), apolloCredits: Math.round(credits * k), calls: Math.round(calls * k) }));
  const areas = (["Record", "Goals", "Companies", "Pursuits", "Resumes", "Other"] as const).map((area) => {
    const of = tasks.filter((t) => t.area === area);
    return { area, aiUsd: of.reduce((n, t) => n + t.aiUsd, 0), apolloCredits: of.reduce((n, t) => n + t.apolloCredits, 0), calls: of.reduce((n, t) => n + t.calls, 0) };
  });
  const months = monthsIn(p);
  const ai = months.reduce((n, m) => n + m.aiUsd, 0);
  return {
    period: p,
    from: START[p],
    to: NOW,
    budget: { aiMonthlyUsd: BUDGET.aiMonthlyUsd, apolloMonthlyCredits: BUDGET.apolloMonthlyCredits },
    months,
    tasks,
    areas,
    origins: {
      automatic: { aiUsd: Math.round(ai * 0.55 * 100) / 100, apolloCredits: 0, calls: 1200 },
      you: { aiUsd: Math.round(ai * 0.45 * 100) / 100, apolloCredits: 0, calls: 300 },
      unknown: { aiUsd: p === "month" ? 0 : 1.1, apolloCredits: 0, calls: p === "month" ? 0 : 60 },
    },
    pursuits: PURSUITS.map(([title, company, usd, credits], i) => ({ pursuitId: `p${i}` as Id<"pursuits">, title, company, aiUsd: s(usd), apolloCredits: Math.round(credits * k), calls: 4 })),
    notSettled: NOT_SETTLED,
    unresolved: UNRESOLVED,
  };
}

const DIRECTIONS: [string, number, number, number, number, number, number][] = [
  ["Supply Chain Product", 14, 38, 60, 6, 3, 9],
  ["Solutions Consulting", 9, 27, 44, 4, 2, 5],
  ["Supply Planning", 6, 22, 40, 3, 1, 4],
  ["Logistics Operations", 4, 15, 30, 3, 0, 2],
  ["Procurement", 3, 11, 22, 3, 2, 1],
  ["Startup Operations", 5, 8, 12, 1, 0, 0],
  ["Operations Analytics", 1, 4, 8, 1, 1, 3],
  ["Independent Consulting", 0, 2, 5, 1, 0, 1],
];

function search(p: Period): Search {
  const weeks = weeksFrom(START[p]);
  const found = spread(PROGRESS[p].companiesFound, weeks.length);
  const before = PROGRESS.all.companiesFound - PROGRESS[p].companiesFound;
  let running = before;
  const all = p === "all";
  return {
    period: p,
    from: START[p],
    to: NOW,
    weeks: weeks.map((week, i) => {
      running += found[i];
      return { week, companiesFound: found[i], targets: Math.round((running * 32) / 146) };
    }),
    companiesFound: PROGRESS[p].companiesFound,
    targets: 32,
    roles: DIRECTIONS.map(([direction, strong, some, weak, none, against, sortedOut], i) => ({ directionId: `dir-${i}` as Id<"items">, direction, strong, some, weak, none, against, sortedOut })),
    funnel:
      p === "month"
        ? [
            { directionId: "dir-0" as Id<"items">, direction: "Supply Chain Product", started: 3, contacted: 2, applied: 1, contactedOrApplied: 3, interviewing: 1, offer: 0, open: 3, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
            { directionId: "dir-1" as Id<"items">, direction: "Solutions Consulting", started: 2, contacted: 0, applied: 2, contactedOrApplied: 2, interviewing: 0, offer: 0, open: 2, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
            { directionId: "dir-5" as Id<"items">, direction: "Startup Operations", started: 1, contacted: 1, applied: 0, contactedOrApplied: 1, interviewing: 1, offer: 1, open: 1, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
          ]
        : [
            { directionId: "dir-0" as Id<"items">, direction: "Supply Chain Product", started: 5, contacted: 3, applied: 3, contactedOrApplied: 5, interviewing: 2, offer: 0, open: 3, closed: { rejected: 1, withdrawn: 1, noResponse: 0, declined: 0 } },
            { directionId: "dir-1" as Id<"items">, direction: "Solutions Consulting", started: 2, contacted: 0, applied: 1, contactedOrApplied: 1, interviewing: 0, offer: 0, open: 1, closed: { rejected: 0, withdrawn: 0, noResponse: 1, declined: 0 } },
            { directionId: "dir-5" as Id<"items">, direction: "Startup Operations", started: 1, contacted: 1, applied: 0, contactedOrApplied: 1, interviewing: 1, offer: 1, open: 1, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
            { directionId: "dir-2" as Id<"items">, direction: "Supply Planning", started: 1, contacted: 1, applied: 1, contactedOrApplied: 1, interviewing: 0, offer: 0, open: 1, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
          ],
    replies: { count: all ? 4 : PROGRESS[p].replies, medianDays: 4 },
  };
}

// Outcomes: this month's in step with Search's pursuits (too few on any path to show); this quarter and all time, a
// longer run where every kind of suggestion shows.
const closedAs = (rejected = 0, withdrawn = 0, noResponse = 0, declined = 0) => ({ rejected, withdrawn, noResponse, declined });
const PRODUCT = "dir-0" as Id<"items">;
const SOLUTIONS = "dir-1" as Id<"items">;
const STARTUP = "dir-5" as Id<"items">;
const version = (directionId: Id<"items"> | null, direction: string | null, at: number | null, current: boolean) => ({ directionId, direction, versionId: at ? (`resume-${direction}-${at}` as Id<"resumes">) : null, versionAt: at, current });

function outcomes(p: Period): OutcomesReport {
  if (p === "month")
    return {
      period: p,
      from: START[p],
      to: NOW,
      directions: [
        { directionId: PRODUCT, direction: "Supply Chain Product", started: 3, contacted: 2, applied: 1, contactedOrApplied: 3, interviewed: 1, offers: 0, open: 3, closed: closedAs() },
        { directionId: STARTUP, direction: "Startup Operations", started: 1, contacted: 1, applied: 0, contactedOrApplied: 1, interviewed: 1, offers: 1, open: 1, closed: closedAs() },
        { directionId: SOLUTIONS, direction: "Solutions Consulting", started: 2, contacted: 0, applied: 2, contactedOrApplied: 2, interviewed: 0, offers: 0, open: 2, closed: closedAs() },
      ],
      versions: [
        { ...version(SOLUTIONS, "Solutions Consulting", Date.UTC(2026, 8, 2), true), contacted: 0, applied: 2, contactedOrApplied: 2, interviewed: 0, offers: 0, open: 2, closed: closedAs() },
        { ...version(PRODUCT, "Supply Chain Product", Date.UTC(2026, 8, 10), true), contacted: 1, applied: 1, contactedOrApplied: 1, interviewed: 0, offers: 0, open: 1, closed: closedAs() },
      ],
      paths: [
        { path: "apply", started: 2, replied: 1, interviewed: 1, offers: 0, replyDays: 5 },
        { path: "outreach", started: 3, replied: 2, interviewed: 1, offers: 1, replyDays: 3 },
        { path: "both", started: 1, replied: 0, interviewed: 0, offers: 0, replyDays: null },
      ],
      groups: [
        { group: "hiringManager", written: 2, replied: 1 },
        { group: "team", written: 2, replied: 1 },
        { group: "recruiting", written: 1, replied: 0 },
      ],
      suggestions: [],
    };
  return {
    period: p,
    from: START[p],
    to: NOW,
    directions: [
      { directionId: PRODUCT, direction: "Supply Chain Product", started: 12, contacted: 6, applied: 10, contactedOrApplied: 10, interviewed: 5, offers: 2, open: 4, closed: closedAs(4, 1, 3) },
      { directionId: SOLUTIONS, direction: "Solutions Consulting", started: 8, contacted: 2, applied: 7, contactedOrApplied: 7, interviewed: 0, offers: 0, open: 3, closed: closedAs(2, 0, 3) },
      { directionId: STARTUP, direction: "Startup Operations", started: 3, contacted: 2, applied: 2, contactedOrApplied: 2, interviewed: 1, offers: 0, open: 2, closed: closedAs(0, 1) },
      { directionId: null, direction: null, started: 1, contacted: 0, applied: 1, contactedOrApplied: 1, interviewed: 0, offers: 0, open: 1, closed: closedAs() },
    ],
    versions: [
      { ...version(STARTUP, "Startup Operations", Date.UTC(2026, 8, 15), true), contacted: 2, applied: 2, contactedOrApplied: 2, interviewed: 1, offers: 0, open: 2, closed: closedAs() },
      { ...version(SOLUTIONS, "Solutions Consulting", Date.UTC(2026, 8, 2), true), contacted: 2, applied: 7, contactedOrApplied: 7, interviewed: 0, offers: 0, open: 2, closed: closedAs(2, 0, 3) },
      { ...version(PRODUCT, "Supply Chain Product", Date.UTC(2026, 8, 10), true), contacted: 4, applied: 6, contactedOrApplied: 6, interviewed: 4, offers: 2, open: 3, closed: closedAs(2, 0, 1) },
      { ...version(PRODUCT, "Supply Chain Product", Date.UTC(2026, 7, 12), false), contacted: 2, applied: 4, contactedOrApplied: 4, interviewed: 1, offers: 0, open: 0, closed: closedAs(2, 0, 2) },
      { ...version(null, null, null, false), contacted: 0, applied: 1, contactedOrApplied: 1, interviewed: 0, offers: 0, open: 1, closed: closedAs() },
    ],
    paths: [
      { path: "apply", started: 11, replied: 3, interviewed: 2, offers: 0, replyDays: 9 },
      { path: "outreach", started: 9, replied: 6, interviewed: 3, offers: 1, replyDays: 4 },
      { path: "both", started: 4, replied: 2, interviewed: 1, offers: 1, replyDays: 3.5 },
    ],
    groups: [
      { group: "hiringManager", written: 7, replied: 3 },
      { group: "team", written: 9, replied: 5 },
      { group: "recruiting", written: 5, replied: 1 },
    ],
    suggestions: [
      { text: "Interviews come from Supply Chain Product", detail: "5 of 10 pursuits contacted or applied got to an interview, against 0 of 7 for your other directions." },
      { text: "Offers come from Supply Chain Product", detail: "Both offers were for this direction." },
      { text: "The Sep 10 Supply Chain Product resume gets more interviews", detail: "4 of 6 applications sent with it got to an interview, against 1 of 4 with other Supply Chain Product versions." },
      { text: "No interviews yet from Solutions Consulting", detail: "None of the 7 pursuits contacted or applied got to an interview." },
      { text: "Replies come from Outreach", detail: "6 of 9 pursuits on Outreach got a reply, against 3 of 11 on Apply." },
    ],
  };
}

function record(p: Period): RecordReport {
  const weeks = weeksFrom(START[p]);
  const facts = spread(PROGRESS[p].factsApproved, weeks.length);
  const insights = spread(p === "month" ? 9 : p === "quarter" ? 21 : 26, weeks.length);
  const kept = spread(p === "month" ? 14 : 22, weeks.length);
  const stories = spread(p === "month" ? 1 : 6, weeks.length);
  return {
    period: p,
    from: START[p],
    to: NOW,
    weeks: weeks.map((week, i) => ({ week, stories: stories[i], factsApproved: facts[i], insightsApproved: insights[i], resumeKept: kept[i], resumeUpdated: Math.floor(kept[i] / 3), tailored: i % 2 })),
    totals: { stories: 6, factsApproved: 212, insightsApproved: 26, resumeKept: 22, resumeUpdated: 7, tailored: 4 },
  };
}

const DONE = { roles: 30, discover: 12, enrich: 10, resume: 9, outreach: 7, extract: 6, letter: 5, duplicates: 4, insights: 3, firstCall: 1 };
const FAILED = { roles: 1, extract: 1, letter: 1 };

function activity(p: Period): ActivityReport {
  const k = p === "month" ? 1 : p === "quarter" ? 2.8 : 3.9;
  const scaled = (by: Record<string, number>) => Object.fromEntries(Object.entries(by).map(([key, n]) => [key, Math.round(n * k)]));
  const weeks = weeksFrom(START[p]);
  const done = scaled(DONE);
  const failed = p === "month" ? FAILED : scaled({ ...FAILED, enrich: 1 });
  return {
    period: p,
    from: START[p],
    to: NOW,
    weeks: weeks.map((week, i) => ({
      week,
      done: Object.fromEntries(Object.entries(done).map(([key, n]) => [key, spread(n, weeks.length)[i]])),
      failed: (i === weeks.length - 1 ? { roles: 1 } : i === weeks.length - 3 ? { letter: 1, extract: 1 } : {}) as Record<string, number>,
    })),
    done,
    failed,
  };
}

function nothing(p: Period) {
  const weeks = weeksFrom(START.month);
  return {
    overview: { ...overview(p), from: START.month, began: START.month, inPeriod: { ...PROGRESS.month, ...Object.fromEntries(Object.keys(PROGRESS.month).map((key) => [key, 0])), notSettled: none, unresolved: none }, sinceBegan: Object.fromEntries(Object.keys(PROGRESS.month).map((key) => [key, 0])) } as Overview,
    spending: { ...spending(p), from: START.month, months: [{ month: MONTHS[3], aiUsd: 0, apolloCredits: 0, calls: 0 }], tasks: [], areas: [], origins: { automatic: { aiUsd: 0, apolloCredits: 0, calls: 0 }, you: { aiUsd: 0, apolloCredits: 0, calls: 0 }, unknown: { aiUsd: 0, apolloCredits: 0, calls: 0 } }, pursuits: [], notSettled: none, unresolved: none },
    search: { ...search(p), from: START.month, weeks: weeks.map((week) => ({ week, companiesFound: 0, targets: 0 })), companiesFound: 0, targets: 0, roles: [], funnel: [], replies: { count: 0, medianDays: null } },
    record: { ...record(p), from: START.month, weeks: weeks.map((week) => ({ week, stories: 0, factsApproved: 0, insightsApproved: 0, resumeKept: 0, resumeUpdated: 0, tailored: 0 })), totals: { stories: 0, factsApproved: 0, insightsApproved: 0, resumeKept: 0, resumeUpdated: 0, tailored: 0 } },
    activity: { ...activity(p), from: START.month, weeks: weeks.map((week) => ({ week, done: {}, failed: {} })), done: {}, failed: {} },
    outcomes: { ...outcomes(p), from: START.month, directions: [], versions: [], paths: [], groups: CONTACT_GROUPS.map((group) => ({ group, written: 0, replied: 0 })), suggestions: [] },
  };
}

export function reportsFixtures(state: "full" | "empty" | "loading" = "full"): Answers {
  if (state === "loading") return {};
  const empty = state === "empty";
  return {
    ...answer(api.reports.overview, ({ period }) => (empty ? nothing(period).overview : overview(period))),
    ...answer(api.reports.spending, ({ period }) => (empty ? nothing(period).spending : spending(period))),
    ...answer(api.reports.search, ({ period }) => (empty ? nothing(period).search : search(period))),
    ...answer(api.reports.record, ({ period }) => (empty ? nothing(period).record : record(period))),
    ...answer(api.reports.activity, ({ period }) => (empty ? nothing(period).activity : activity(period))),
    ...answer(api.reports.outcomes, ({ period }) => (empty ? nothing(period).outcomes : outcomes(period))),
  };
}
