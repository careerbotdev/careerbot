import type { Reminder } from "../../../convex/pursuitSteps";
import type { FactDocument, PursuitRow, ResumeUpdate, TodayLine } from "./data";

// What each Today line is called, and its second line.

export function pursuitTitle(p: PursuitRow, reminder: Reminder | null) {
  if (reminder?.step === "nextContact") return `Write to the next contact at ${p.company}`;
  if (reminder?.step === "noReply") return `No reply from ${p.company}`;
  switch (reminder?.rule) {
    case "followUp":
      return `Follow up with ${reminder.contact ? `${reminder.contact.name} at ` : ""}${p.company}`;
    case "prepare":
      return `Prepare for the ${p.company} interview`;
    case "stale":
      return `Check in on ${p.company}`;
    default:
      return `Reply to ${p.company}’s offer`;
  }
}

export const pursuitLine = (p: PursuitRow, reminder: Reminder | null) => (reminder ? `${p.title} · ${reminder.text}` : p.title);

export const resumeTitle = (u: ResumeUpdate) => (u.target.directionId ? `${u.target.name} resume` : u.target.name);

export function resumeLine(u: ResumeUpdate) {
  if (u.writing) return "Writing a new version";
  if (u.state === "review") return "New version to keep or discard";
  if (u.state === "unknown") return "Written before changes were listed";
  return "Changed since it was written";
}

export function documentLine(d: FactDocument) {
  if (d.writing) return "Updating lines";
  if (d.waiting) return "New lines to apply or discard";
  return `${d.lines} ${d.lines === 1 ? "line rests" : "lines rest"} on changed facts`;
}

export function lineTitle(l: TodayLine) {
  switch (l.kind) {
    case "review":
      return `${l.summary.total} ${l.summary.total === 1 ? "decision" : "decisions"}`;
    case "pursuit":
      return pursuitTitle(l.p, l.reminder);
    case "role":
      return l.role.title;
    case "resume":
      return resumeTitle(l.update);
    case "document":
      return l.doc.name;
  }
}
