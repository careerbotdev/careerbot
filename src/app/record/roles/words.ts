import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import { resumeTitle } from "../../../../convex/resumeDoc";

// The record's rows as extract.items returns them, and how Roles says their dates.

export type Row = FunctionReturnType<typeof api.extract.items>[number];
export type Role = Extract<Row, { kind: "role" }>;
export type Fact = Extract<Row, { kind: "fact" }>;
export type Context = Extract<Row, { kind: "context" }>;
export type Project = Extract<Row, { kind: "project" }>;
export type Question = FunctionReturnType<typeof api.conflicts.list>[number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const parts = (d?: string | null) => {
  const m = d?.match(/^(\d{4})(?:-(\d{2}))?/);
  return m ? { year: m[1], month: m[2] ? Number(m[2]) - 1 : null } : null;
};

// "Sep 2024", or "2024" when only the year is known.
export function monthLabel(d?: string | null) {
  const p = parts(d);
  if (!p) return d ?? "";
  return p.month === null ? p.year : `${MONTHS[p.month]} ${p.year}`;
}

// A role's dates in a list row: years only ("2024 – now").
export function yearSpan(start?: string | null, end?: string | null) {
  const s = parts(start)?.year;
  if (!s) return end ? `until ${parts(end)?.year ?? end}` : "";
  return `${s} – ${end ? (parts(end)?.year ?? end) : "now"}`;
}

// A role's dates in full ("Sep 2024 – now"); within one year the year is said once ("Jan – Feb 2016").
export function monthSpan(start?: string | null, end?: string | null) {
  const s = parts(start);
  const e = parts(end);
  if (!s) return end ? `until ${monthLabel(end)}` : "";
  if (!end) return `${monthLabel(start)} – now`;
  if (e && e.year === s.year && s.month !== null && e.month !== null) return `${MONTHS[s.month]} – ${MONTHS[e.month]} ${e.year}`;
  return `${monthLabel(start)} – ${monthLabel(end)}`;
}

// What they typed for a month: "May 2021", "may 2021", "2021-05", "5/2021" or a year alone. Empty is no date.
export function readMonth(text: string): { value: string | null } | { problem: string } {
  const t = text.trim().toLowerCase();
  if (!t || t === "now" || t === "present") return { value: null };
  let m = t.match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (m) return m[2] ? month(Number(m[2]), m[1]) : { value: m[1] };
  m = t.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (m) return month(Number(m[1]), m[2]);
  m = t.match(/^([a-z]+)\.?,?\s+(\d{4})$/);
  if (m) {
    const at = LONG.findIndex((x) => x.startsWith(m![1]) && m![1].length >= 3);
    if (at >= 0) return month(at + 1, m[2]);
  }
  return { problem: "Write a month and year, like May 2021." };
}
const month = (n: number, year: string) => (n >= 1 && n <= 12 ? { value: `${year}-${String(n).padStart(2, "0")}` } : { problem: "There’s no such month." });

// Newest first: by start, a current role before a finished one that started the same month; no start goes last.
export function newestFirst<T extends { data: { start?: string | null; end?: string | null } }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const s = String(b.data.start ?? "").localeCompare(String(a.data.start ?? ""));
    if (s) return s;
    return Number(!b.data.end) - Number(!a.data.end) || String(b.data.end ?? "").localeCompare(String(a.data.end ?? ""));
  });
}

// A role's name everywhere is the title resumes print (resumeTitle): its official title, or until they give one, the
// first of its other titles.
export const roleTitle = (r: Role) => resumeTitle(r.data)?.text ?? "Untitled role";
export const roleName = (r: Role) => [roleTitle(r), r.data.employer].filter(Boolean).join(", ");

// What's missing for the role to go on resumes as the person would want it, said plainly; null when nothing is.
export function titleNote(d: { title?: string | null; alternateTitles?: string[] | null; employer?: string | null; break?: boolean | null }) {
  if (d.break) return null;
  const t = resumeTitle(d);
  if (!t) return "Not on resumes until it has a title. Edit it to give one.";
  if (!d.employer?.trim()) return "Not on resumes until it has an employer. Edit it to give one.";
  return t.official ? null : `Your story doesn’t say the official title, so resumes say “${t.text}”. Edit it to give the official title.`;
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// What the moves on a role do, the same in the item's buttons, the phone bar and the ⋯ menus.
export const EXPLAIN = {
  approve: { detail: "Adds this role to your record as it reads. Only approved roles go on resumes.", note: "Free · Undo with U" },
  reject: { detail: "Keeps it out of your record, with why if you like, so it isn’t proposed again.", note: "Free · Undo with U" },
  restore: { detail: "Puts the role back for review; nothing else changes.", note: "Free · Undo with U" },
  edit: { detail: "Corrects its details; your corrections count as approved.", note: "Free" },
  add: { detail: "Adds a role you held yourself, approved as you give it.", note: "Free" },
} as const;

// The month after a YYYY-MM (or the year after a YYYY), for where a gap starts.
export function nextMonth(d?: string | null) {
  const p = parts(d);
  if (!p || p.month === null) return undefined;
  const n = p.month + 1;
  return n === 12 ? `${Number(p.year) + 1}-01` : `${p.year}-${String(n + 1).padStart(2, "0")}`;
}
