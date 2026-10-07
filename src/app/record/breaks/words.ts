import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import { dateLabel, gaps } from "../../../../convex/resumeDoc";

// Career breaks in words: their months as a short span, their length, the roles either side, and the gaps between
// approved roles that the record points out (never turned into breaks on their own).

export type Row = FunctionReturnType<typeof api.extract.items>[number];
export type Role = Extract<Row, { kind: "role" }>;
export type Fact = Extract<Row, { kind: "fact" }>;

export const isRole = (r: Row): r is Role => r.kind === "role";
export const isBreak = (r: Row): r is Role => r.kind === "role" && !!r.data.break;

// Add a break, the same wherever it's offered: the list's ⋯ menu, its + and bottom line, and the empty page.
export const ADD_BREAK = { detail: "Adds the months you were away from work to your record.", note: "Free" } as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const parts = (d?: string | null) => {
  const m = d?.match(/^(\d{4})-(\d{2})/);
  return m ? { y: Number(m[1]), m: Number(m[2]) } : null;
};
const index = (d?: string | null) => {
  const p = parts(d);
  return p ? p.y * 12 + p.m - 1 : null;
};
const thisMonth = (now: number) => {
  const d = new Date(now);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

// "Jan – Feb 2016", "Dec 2015 – Feb 2016", "Jan 2016 – now"; "Dates not set yet" without a start.
export function span(start?: string | null, end?: string | null) {
  const s = parts(start);
  if (!s) return "Dates not set yet";
  const e = parts(end);
  if (!e) return `${MONTHS[s.m - 1]} ${s.y} – now`;
  if (s.y !== e.y) return `${MONTHS[s.m - 1]} ${s.y} – ${MONTHS[e.m - 1]} ${e.y}`;
  return s.m === e.m ? `${MONTHS[s.m - 1]} ${s.y}` : `${MONTHS[s.m - 1]} – ${MONTHS[e.m - 1]} ${s.y}`;
}

// "Jan 2016 – Feb 2016", as Details shows the dates.
export const fullSpan = (start?: string | null, end?: string | null) => (start ? `${dateLabel(start)} – ${end ? dateLabel(end) : "now"}` : "Not set");

// A resume's years: "2016 – 2018", "2024 – Present".
export const years = (start?: string, end?: string) => [start?.slice(0, 4), end ? end.slice(0, 4) : start ? "Present" : ""].filter(Boolean).join(" – ");

// Whole months, both ends counted (Jan to Feb is two); a break still going runs to this month.
export function lengthOf(start?: string | null, end?: string | null, now = Date.now()) {
  const s = index(start);
  if (s === null) return null;
  const e = end ? index(end) : thisMonth(now);
  if (e === null || e < s) return null;
  const n = e - s + 1;
  const y = Math.floor(n / 12);
  const m = n % 12;
  const words = [y ? `${y} ${y === 1 ? "year" : "years"}` : "", m ? `${m} ${m === 1 ? "month" : "months"}` : ""].filter(Boolean).join(" ");
  return end ? words : `${words} so far`;
}

// What a role is called beside a break: its employer.
export const employerName = (r: Role) => r.data.employer || r.data.title || "A role";

// The approved roles (not breaks) that count, earliest first.
export const jobsOf = (rows: Row[]) =>
  rows.filter((r): r is Role => isRole(r) && !r.data.break && r.status === "approved" && r.counts && !!r.data.start).sort((a, b) => String(a.data.start).localeCompare(String(b.data.start)));

// The roles either side of a span: the last one starting before it and the first starting at or after it.
export function neighbours(jobs: Role[], start?: string | null) {
  if (!start) return { before: null, after: null };
  const before = jobs.filter((r) => String(r.data.start) < start).at(-1) ?? null;
  const after = jobs.find((r) => String(r.data.start) >= start && r !== before) ?? null;
  return { before, after };
}

export type Gap = { start: string; end: string; length: string; between: string };

// Gaps of three months or more between approved roles and breaks that count, newest first, as the record page always
// found them. With none: how far the roles run back to back.
export function gapsOf(rows: Row[], now = Date.now()): { gaps: Gap[]; runs: string | null } {
  const counted = rows.filter((r): r is Role => isRole(r) && r.status === "approved" && r.counts);
  const jobs = jobsOf(rows);
  const found = gaps(counted.map((r) => r.data)).map((g) => {
    const before = jobs.filter((r) => r.data.end && String(r.data.end) <= g.start).at(-1);
    const after = jobs.find((r) => String(r.data.start) >= g.end);
    const between = before && after ? `${employerName(before)} to ${employerName(after)}` : before ? `After ${employerName(before)}` : after ? `Before ${employerName(after)}` : "";
    return { ...g, length: lengthOf(g.start, g.end, now) ?? "", between };
  });
  if (!jobs.length) return { gaps: found, runs: null };
  const first = jobs[0].data.start!;
  const last = jobs.some((r) => !r.data.end) ? "now" : dateLabel(jobs.map((r) => String(r.data.end)).sort().at(-1));
  return { gaps: found, runs: `Your roles run back to back from ${dateLabel(first)} to ${last}.` };
}
