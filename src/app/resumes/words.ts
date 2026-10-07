import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { StatusTone } from "@/components/StatusTag";

// What Resumes reads, and the words it uses for a resume's state and dates.

export type Overview = FunctionReturnType<typeof api.resume.overview>;
export type Row = Overview["base"];
export type TailoredRow = Overview["tailored"][number];
export type ResumeData = FunctionReturnType<typeof api.resume.list>;
export type Version = ResumeData["versions"][number];
export type Tailored = ResumeData["tailored"][number];
export type Change = FunctionReturnType<typeof api.resume.compare>["changes"][number];

// A base or direction resume's state as a tag. Tailored resumes are frozen, so they have none.
export const STATE: Record<Row["state"], { label: string; tone: StatusTone } | null> = {
  upToDate: { label: "Up to date", tone: "good" },
  changed: { label: "Changed since it was written", tone: "caution" },
  review: { label: "New version to keep or discard", tone: "info" },
  unknown: { label: "Written before changes were listed", tone: "neutral" },
  notWritten: null,
};

export const toUpdate = (r: Row) => r.state === "changed" || r.state === "review" || r.state === "unknown";

// What an action does, where it shows in more than one place (the item's header, its ⋯ menu, the list, the bottom bar).
export const EXPLAIN = {
  write: (r: Pick<Row, "directionId" | "name">) => `Writes your ${r.directionId ? `${r.name} resume` : "base resume"} from your approved record.`,
  writeAgain: "Writes a new version from your approved record. You see it beside this one, then keep or discard it.",
  updateAll: "Writes a new version of each one, to keep or discard. The ones you have stay until you keep a new one.",
  addNew: "Writes lines only for what you added or reworded since, to add one by one. The rest stays as it is.",
  tailorAgain: "Tailors a new resume to this posting from your approved record. This one stays as it was written.",
  keep: "Makes the new version this resume. The one before stays in History.",
  discard: "Leaves the resume as it is. The new version goes.",
  closeCompare: "Shows this resume on its own again.",
  layout: "Length, titles, folds, and the projects and skills on it.",
  tailoredLayout: "Titles, folds, and the projects and skills on it.",
  history: "Every version, what changed in each, and Restore.",
  posting: "The posting and how your record meets it.",
  inGoals: "Opens this direction in Goals.",
  open: "Opens this resume.",
};
export const FREE_UNDO = "Free · Undo with U";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Sep 28"; with `year`, "Sep 28, 2026".
export const day = (at: number, year = false) => {
  const d = new Date(at);
  return `${MONTH[d.getMonth()]} ${d.getDate()}${year ? `, ${d.getFullYear()}` : ""}`;
};
// "Sep 28, 10:24 AM".
export const dayTime = (at: number) => `${day(at)}, ${new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

// A tailored resume's name in the list: "Product Manager, Cold Chain Planning, Meridian Coldchain".
export const tailoredName = (t: { title: string; company: string | null }) => (t.company ? `${t.title}, ${t.company}` : t.title);

// The address of one resume: "base", a direction's id, or a tailored resume's id.
export const resumeHref = (key: string) => `/resumes?resume=${encodeURIComponent(key)}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
