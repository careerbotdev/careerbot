import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

// What the Reports screen says: the views, the periods, and the names of the work and spending it counts.

export type Period = "month" | "quarter" | "all";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "all", label: "All time" },
];

export type View = "overview" | "spending" | "search" | "outcomes" | "record" | "activity";
export const VIEWS: { key: View; title: string; icon: "overview" | "spending" | "trend" | "pursuits" | "record" | "activity" }[] = [
  { key: "overview", title: "Overview", icon: "overview" },
  { key: "spending", title: "Spending", icon: "spending" },
  { key: "search", title: "Search", icon: "trend" },
  { key: "outcomes", title: "Outcomes", icon: "pursuits" },
  { key: "record", title: "Record", icon: "record" },
  { key: "activity", title: "Activity", icon: "activity" },
];

export type Overview = FunctionReturnType<typeof api.reports.overview>;
export type Spending = FunctionReturnType<typeof api.reports.spending>;
export type Search = FunctionReturnType<typeof api.reports.search>;
export type OutcomesReport = FunctionReturnType<typeof api.reports.outcomes>;
export type RecordReport = FunctionReturnType<typeof api.reports.record>;
export type ActivityReport = FunctionReturnType<typeof api.reports.activity>;
export type Unsettled = Spending["notSettled"];

// Periods are UTC, like budgets, so their dates are too.
const day = (at: number, parts: Intl.DateTimeFormatOptions) => new Date(at).toLocaleDateString("en-US", { timeZone: "UTC", ...parts });
export const monthDay = (at: number) => day(at, { month: "short", day: "numeric" });
export const monthName = (at: number) => day(at, { month: "short" });
export const monthLong = (at: number) => day(at, { month: "long" });

// "Sep 1–29", or "Jul 1 to Sep 29" across months.
export function range(from: number, to: number) {
  const a = new Date(from);
  const b = new Date(to);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return `${monthDay(from)}–${b.getUTCDate()}`;
  return `${monthDay(from)} to ${monthDay(to)}`;
}

// The period in a sentence: "this month", "this quarter", "since Jun 2".
export const periodWords = (p: Period, from: number) => (p === "month" ? "this month" : p === "quarter" ? "this quarter" : `since ${monthDay(from)}`);

export const usd = (n: number) => `$${n.toFixed(2)}`;
// A budget, in whole dollars when it is whole ("$25").
export const budgetUsd = (n: number) => (Number.isInteger(n) ? `$${n}` : usd(n));
export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// A running total from counts per week or month ("found so far").
export const runningTotal = (xs: number[]) => xs.reduce<number[]>((out, x) => [...out, (out.at(-1) ?? 0) + x], []);
export const num = (n: number) => n.toLocaleString("en-US");

// What each kind of paid call was for, by the task it's counted under.
const TASKS: Record<string, string> = {
  extract: "Reading stories",
  rework: "Rewriting facts",
  revision: "Reading story changes",
  check: "Checking for conflicts",
  insights: "Finding insights",
  followups: "Follow-up questions",
  duplicates: "Finding duplicates",
  project: "Reading projects",
  "same work": "Finding the same work",
  skills: "Gathering skills",
  goals: "Reading your goals",
  "limit rule": "Reading limits",
  "suggest directions": "Suggesting directions",
  "direction detail": "Writing positioning",
  "find seed companies": "Finding companies",
  "companies you named": "Looking up companies you named",
  "find companies": "Finding companies",
  "large companies": "Finding companies",
  "hiring now": "Finding companies hiring now",
  "lookalike companies": "Finding similar companies",
  "company summaries": "Summarizing companies",
  "company summaries (general knowledge)": "Summarizing companies",
  "company fit": "Screening companies",
  "screen companies": "Screening companies",
  "job postings": "Reading job postings",
  "role sort": "Sorting roles",
  "role fit": "Rating role fit",
  "ask about this role": "Ask about this role",
  "cover letter": "Writing cover letters",
  outreach: "Writing outreach",
  "follow-up": "Writing follow-ups",
  "find people": "Finding people",
  "reveal an email": "Revealing emails",
  resume: "Writing resumes",
  "direction resume": "Writing resumes",
  "tailored resume": "Tailoring resumes",
  "resume lines": "Writing resume lines",
  "line check": "Checking edited lines",
  "first call": "Test calls",
  test: "Test calls",
  compare: "Comparing models",
};
export const taskName = (task: string) => TASKS[task] ?? task.charAt(0).toUpperCase() + task.slice(1);

// What each area's spending covers.
export const AREA_LINES: Record<string, string> = {
  Record: "Stories, facts, insights",
  Goals: "Directions and limits",
  Companies: "Companies and roles",
  Pursuits: "Letters, outreach, people",
  Resumes: "Resumes and tailoring",
  Other: "Tests and comparisons",
};

// Background work by kind, as the person would name it.
const KINDS: Record<string, string> = {
  firstCall: "Test calls",
  extract: "Reading stories",
  rework: "Rewriting facts",
  compare: "Comparing models",
  goals: "Reading your goals",
  check: "Checking for conflicts",
  limitRule: "Reading limits",
  insights: "Finding insights",
  followups: "Follow-up questions",
  resume: "Writing resumes",
  directions: "Directions",
  duplicates: "Finding duplicates",
  discover: "Finding companies",
  enrich: "Looking up companies",
  roles: "Finding roles",
  project: "Reading projects",
  skills: "Gathering skills",
  sameWork: "Finding the same work",
  letter: "Writing cover letters",
  ask: "Answering questions",
  outreach: "Writing outreach",
  followUp: "Writing follow-ups",
  driveSync: "Syncing Google Drive",
  lineCheck: "Checking edited lines",
  lineUpdate: "Updating lines for changed facts",
};
export const kindName = (kind: string) => KINDS[kind] ?? kind;

// Calls not in the settled totals, in words: "3 calls, $0.12 so far" and "1 Apollo call, up to 2 credits".
export function unsettledWords(u: Unsettled) {
  const parts = [];
  if (u.aiCalls) parts.push(`${count(u.aiCalls, "AI call")}${u.aiKnownUsd > 0 ? `, ${usd(u.aiKnownUsd)} known` : ""}`);
  if (u.apolloCalls) parts.push(`${count(u.apolloCalls, "Apollo call")}, up to ${count(u.apolloCreditsAtMost, "credit")}`);
  return parts.join(" · ");
}
