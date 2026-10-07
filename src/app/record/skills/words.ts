import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import type { IconName } from "@/components/icons";

// Words and shapes shared by the Skills, Tools and Certifications screens.

export type Data = FunctionReturnType<typeof api.skills.list>;
export type Skill = Data["items"][number];
export type Kind = Skill["kind"];
export type Tab = "proposed" | "approved" | "rejected";
export type OnResume = FunctionReturnType<typeof api.skills.onResumes>[number];

export const KINDS: Record<Kind, { route: string; many: string; one: string; lower: string; lowerMany: string; icon: IconName }> = {
  skill: { route: "/record/skills", many: "Skills", one: "Skill", lower: "skill", lowerMany: "skills", icon: "skills" },
  tool: { route: "/record/tools", many: "Tools", one: "Tool", lower: "tool", lowerMany: "tools", icon: "tools" },
  certification: { route: "/record/certifications", many: "Certifications", one: "Certification", lower: "certification", lowerMany: "certifications", icon: "certifications" },
};
export const KIND_OPTIONS = (["skill", "tool", "certification"] as const).map((k) => ({ value: k, label: KINDS[k].one }));
export const TAB_LABELS: Record<Tab, string> = { proposed: "Proposed", approved: "Approved", rejected: "Rejected" };

// Quick reasons, the same as Review's.
export const REJECT_PICKS = ["Too vague", "Not mine", "Out of date"];
export const APART_PICKS = ["Different things", "Different work", "Different results"];

export const FREE_UNDO = "Free · Undo with U";
export const WHY = "Free · Undo with U · Why is optional and steers what’s proposed next";

// What each decision does, in the same words wherever it's offered: review card, row, ⋯ menu, bottom bar, bulk bar.
const them = (n: number) => (n === 1 ? "it" : "them");
export const APPROVES = (k: Kind, n = 1) => `Adds ${them(n)} to your ${KINDS[k].lowerMany}, for resumes and matching roles.`;
export const REJECTS = (k: Kind, n = 1) => `Leaves ${them(n)} out of your ${KINDS[k].lowerMany}. ${n === 1 ? "It isn’t" : "They aren’t"} proposed again.`;
export const UNAPPROVES = (k: Kind, n = 1) => `Moves ${them(n)} back to Proposed, out of your ${KINDS[k].lowerMany} until you approve ${them(n)} again.`;
export const REOPENS = "Puts it back in Proposed, to review again.";
export const LEAVES_OUT = (n = 1) => `Keeps ${them(n)} in your record but off your resumes.`;
export const SHOWS = (n = 1) => `Lists ${them(n)} on your resumes again.`;
export const KEEPS_BOTH = "They’re different; the pair isn’t offered again.";
export const EDITS = "Changes its name, group or kind.";
export const GATHERS_AGAIN = "Reads your approved roles, projects and facts again for skills, tools and certifications.";

// The group a row sits under; items without one sit under "No group".
export const NO_GROUP = "No group";
export const groupOf = (s: Skill) => s.group ?? NO_GROUP;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (ym: string) => ({ y: ym.slice(0, 4), m: MONTHS[Number(ym.slice(5, 7)) - 1] });
// "2024-09" as "Sep 2024" (a year alone when that's all it says).
export const month = (ym: string) => {
  const { y, m } = parts(ym);
  return m ? `${m} ${y}` : y;
};

// A role's span: from the month while it runs ("Sep 2024 – now"), else by years ("2012 – 2016"); in one year by months.
export function roleSpan(start: string | null, end: string | null) {
  if (!start) return end ? month(end) : "";
  if (!end) return `${month(start)} – now`;
  const [a, b] = [parts(start), parts(end)];
  if (a.y !== b.y) return `${a.y} – ${b.y}`;
  return a.m && b.m && a.m !== b.m ? `${a.m} – ${b.m} ${a.y}` : month(start);
}

// A project's span by months: "May – Jul 2026", "Jan 2026", "Dec 2025 – Jan 2026".
export function monthSpan(start: string | null, end: string | null) {
  if (!start) return end ? month(end) : "";
  if (!end || end === start) return month(start);
  const [a, b] = [parts(start), parts(end)];
  return a.y === b.y && a.m && b.m ? `${a.m} – ${b.m} ${a.y}` : `${month(start)} – ${month(end)}`;
}

// A source's second line: its employer and dates for a role, its dates and facts for a project.
export function sourceLine(s: Skill["sources"][number]) {
  const facts = s.facts ? plural(s.facts, "fact") : "";
  if (s.kind === "role") return [s.employer, roleSpan(s.start, s.end), facts].filter(Boolean).join(" · ");
  return [monthSpan(s.start, s.end), facts].filter(Boolean).join(" · ");
}

// Where it shows, short, for its row: employers and projects, three at most ("Brewlog · Shelfspan · 2 more").
export function whereShort(s: Skill) {
  const names = [...new Set(s.sources.map((x) => x.employer ?? x.title))];
  return names.length <= 3 ? names.join(" · ") : `${names.slice(0, 2).join(" · ")} · ${names.length - 2} more`;
}

// "Left out while Quotewell is rejected".
export function leftOutWhile(s: Skill) {
  const names = s.blockedBy;
  if (!names.length) return "Left out while nothing it came from is in your record";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Left out while ${list} ${names.length === 1 ? "is" : "are"} rejected`;
}

// A certification's row line: who issued it and when ("ASCM · no date yet").
export const certLine = (s: Skill) => [s.issuer, s.earned ? month(s.earned) : "no date yet"].filter(Boolean).join(" · ");

export const day = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const RESUME_STATE: Record<NonNullable<OnResume["state"]>, string> = {
  upToDate: "Up to date",
  changed: "Record changed since",
  review: "New version to review",
  unknown: "Written before changes were tracked",
};
