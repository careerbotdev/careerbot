import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import { resumeTitle } from "../../../../convex/resumeDoc";
import { clockNow } from "../../clock";

// The record's rows as the Projects screen reads them (extract.items).
export type Row = FunctionReturnType<typeof api.extract.items>[number];
export type Project = Extract<Row, { kind: "project" }>;
export type Role = Extract<Row, { kind: "role" }>;
export type Fact = Extract<Row, { kind: "fact" }>;

// What each action on a project does, in the same words wherever it's offered: its header, its ⋯ menu, its row's menu.
export const APPROVES = "Adds the project to your record. Its facts are reviewed one by one.";
export const REJECTS = "Rejects the project, with why if you like, and sets its unreviewed facts aside.";
export const RESTORES = "Puts the project back in your record, with the facts set aside with it, for review.";
export const EDITS = "Corrects its name, summary and dates. Saving approves it.";
// Said wherever a repository read starts.
export const SENDS_FILES = "File contents are sent to the AI model you chose.";
export const READS_AGAIN = `Reads the repository again. Only new facts are added; what you rejected stays rejected. ${SENDS_FILES}`;
export const OPENS_REPO = "Opens the repository on GitHub.";
export const CHOOSES_REPOS = "Opens GitHub to choose which repositories CareerBot can see.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (at: string) => {
  const [y, m] = at.split("-");
  return { year: y, month: m ? MONTHS[Number(m) - 1] : undefined };
};
const month = (at: string) => {
  const p = parts(at);
  return p.month ? `${p.month} ${p.year}` : p.year;
};

// When it ran, from its first and last month (YYYY-MM or YYYY): "Sep 2026", "Jun – Jul 2026", "Sep 2025 – May 2026",
// "Sep 2024 – now". `short`: across years, the years alone ("2025 – 2026"), for a list row.
export function span(start: string | null | undefined, end: string | null | undefined, { short = false, open = false } = {}) {
  if (!start && !end) return "";
  if (!start) return month(end!);
  if (!end) return open ? `${month(start)} – now` : month(start);
  if (start === end) return month(start);
  const a = parts(start);
  const b = parts(end);
  if (a.year === b.year) return a.month && b.month ? `${a.month} – ${b.month} ${b.year}` : b.year;
  return short ? `${a.year} – ${b.year}` : `${month(start)} – ${month(end)}`;
}

// Newest work first: by when it ended, then by when it started.
export const byRecent = (a: Project, b: Project) => (b.data.end ?? b.data.start ?? "").localeCompare(a.data.end ?? a.data.start ?? "") || (b.data.start ?? "").localeCompare(a.data.start ?? "");

export const commits = (n: number | undefined) => (n === undefined ? "" : `${n.toLocaleString("en-US")} ${n === 1 ? "commit" : "commits"}`);

// A role's name where a project links to it: "Senior Supply Planning Manager · Brightwater Provisions".
export const roleName = (r: Role) => [resumeTitle(r.data)?.text ?? "Untitled role", r.data.employer].filter(Boolean).join(" · ");

// The jobs a project can be linked to: approved roles that aren't breaks, newest first.
export const jobsOf = (rows: Row[]) =>
  rows
    .filter((r): r is Role => r.kind === "role" && r.status === "approved" && !r.data.break && !!r.roleKey)
    .sort((a, b) => (b.data.start ?? "").localeCompare(a.data.start ?? ""));

// "Today, 10:06", "Sep 19".
export function when(ms: number) {
  const d = new Date(ms);
  const now = new Date(clockNow());
  const today = now.toDateString() === d.toDateString();
  if (today) return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
