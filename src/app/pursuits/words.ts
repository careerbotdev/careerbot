import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { payText, valuesOf, whereText } from "../../../convex/roleDetails";
import { dayOf, type Reminder, STATUS_LABELS, takesOutreach } from "../../../convex/pursuitSteps";
import { day } from "./dates";

// How Pursuits says things: a pursuit row's second word, a role's when (a timeline entry: pursuitSteps.timelineWords).

export type PursuitRow = FunctionReturnType<typeof api.pursuits.list>["pursuits"][number];
export type Pursuit = FunctionReturnType<typeof api.pursuits.get>;
export type Role = FunctionReturnType<typeof api.roles.get>;
export type RoleRow = FunctionReturnType<typeof api.roles.list>["page"][number];

const weekday = (date: string) => new Date(dayOf(date)).toLocaleDateString("en-US", { weekday: "short" });

// Under a pursuit's status: the reminder due (in caution), else what's next for it.
export function pursuitMeta(p: PursuitRow, due: Reminder | undefined): { text: string; caution: boolean } {
  if (due) return { text: due.step ? due.tag : due.rule === "followUp" ? "Follow up today" : due.rule === "prepare" ? "Prepare today" : "Check in", caution: true };
  if (p.status === "closed") return { text: day(p.changedAt), caution: false };
  if (p.interviewAt && p.status === "interviewing") return { text: `Interview ${weekday(p.interviewAt)}`, caution: false };
  if (p.status === "preparing")
    return { text: !p.hasResume && p.postingId ? "Resume to tailor" : !p.path ? "Choose a path" : takesOutreach(p.path) ? "Message to send" : !p.hasLetter ? "Letter to write" : "Ready to apply", caution: false };
  if (p.status === "offer") return { text: "Decide", caution: false };
  if (p.status === "contacted" && p.contactedAt) return { text: `Contacted ${day(p.contactedAt)}`, caution: false };
  return { text: p.appliedAt ? `Sent ${day(p.appliedAt)}` : p.contactedAt ? `Contacted ${day(p.contactedAt)}` : STATUS_LABELS[p.status], caution: false };
}

// The next step a reminder asks for, as the Overview and People say it. canApply: it has an open role and isn't
// applied yet. `to`: who the follow-up draft is to, when there is one.
export function reminderTitle(due: Reminder, p: { company: string; canApply: boolean }, to?: string | null) {
  if (due.rule === "prepare") return "Prepare for the interview";
  if (due.rule === "stale") return "Check it’s still on";
  if (due.step === "nextContact") return due.contact ? `Next contact: ${due.contact.name}` : "Next contact: find or add someone";
  if (due.step === "noReply") return p.canApply ? "Apply, or close it as No response" : "Close it as No response";
  return `Follow up with ${due.contact?.name ?? to ?? p.company}`;
}

// When a role was posted, or first seen when the board doesn't say.
export function postedWord(r: { postedAt: number | null; firstSeen: number }) {
  const at = r.postedAt ?? r.firstSeen;
  const d = day(at);
  if (d === "today") return r.postedAt ? "Posted today" : "New today";
  return `Posted ${d}`;
}

// A role's second line: where it is and what it pays (the company leads it, as a link, where it's shown).
export const placeAndPay = (role: Role) => [whereText(valuesOf(role.details), role.location), role.details.pay ? payText(role.details.pay.value) : null].filter(Boolean).join(" · ");

// A file name for a resume sent for a role.
export const resumeFile = (company: string, title: string) => `resume-${`${company} ${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

// Actions offered in several places (beside the title, the ⋯ menus, a row's menu, the phone's bar, the bulk bar), the
// same words wherever they are.
export const INTERESTED = { detail: "Keeps this role on your Interested list until you start it.", note: "Free · Undo with U" } as const;
export const NOT_INTERESTED = { detail: "Takes it off your Interested list.", note: "Free" } as const;
export const NOT_FOR_ME = { detail: "Sets this role aside, with why if you like.", note: "Free · Undo with U" } as const;
export const RESTORE_ROLE = { detail: "Puts the role back in your lists.", note: "Free" } as const;
export const INTERESTED_ALL = { detail: "Keeps these roles on your Interested list until you start them.", note: "Free · Undo with U" } as const;
export const NOT_FOR_ME_ALL = { detail: "Sets these roles aside.", note: "Free · Undo with U" } as const;
export const OPEN_POSTING = { detail: "Opens the posting in a new tab.", note: "Free" } as const;
export const RESUME_BESIDE = { detail: "Shows the tailored resume in a pane beside this one.", note: "Free" } as const;
export const ASK_BESIDE = { detail: "Opens a pane to ask anything about the role, or paste an application question.", note: "Free to open" } as const;
