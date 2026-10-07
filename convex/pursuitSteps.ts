// A pursuit's statuses, its path, the reasons one closes, and the step it suggests next. Pure module, shared with the
// browser.

// Stages: Preparing, then Contacted or Applied (one step; a pursuit can be both, each with its own date), In
// conversation, Interviewing, Offer; Closed from any stage. The status shows the latest one they set.
export const PURSUIT_STATUSES = ["preparing", "contacted", "applied", "inConversation", "interviewing", "offer", "closed"] as const;
export type PursuitStatus = (typeof PURSUIT_STATUSES)[number];
export const STATUS_LABELS: Record<PursuitStatus, string> = {
  preparing: "Preparing",
  contacted: "Contacted",
  applied: "Applied",
  inConversation: "In conversation",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

export const CLOSED_REASONS = ["rejected", "withdrawn", "noResponse", "declined"] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];
export const REASON_LABELS: Record<ClosedReason, string> = {
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  noResponse: "No response",
  declined: "Declined",
};

// Two paths into a role, with equal weight: Apply through the posting, and Outreach to the people who hire. A pursuit
// can take both.
export const PATHS = ["apply", "outreach", "both"] as const;
export type Path = (typeof PATHS)[number];
export const PATH_LABELS: Record<Path, string> = { apply: "Apply", outreach: "Outreach", both: "Apply and Outreach" };
// The path a pursuit is on: the one they chose, joined with what they did (an outreach message marked sent, Applied).
// Null until they choose or act.
export function pathOf(p: { path?: Path | null; appliedAt?: number | null; contactedAt?: number | null }): Path | null {
  const apply = p.path === "apply" || p.path === "both" || p.appliedAt != null;
  const outreach = p.path === "outreach" || p.path === "both" || p.contactedAt != null;
  return apply && outreach ? "both" : apply ? "apply" : outreach ? "outreach" : null;
}
export const takesApply = (path: Path | null) => path === "apply" || path === "both";
export const takesOutreach = (path: Path | null) => path === "outreach" || path === "both";

// Applied, Interviewing or Offer means the package went out: its resume, cover letter and answers are kept as sent.
// Contacted and In conversation keep nothing.
export const isSent = (s: PursuitStatus) => s === "applied" || s === "interviewing" || s === "offer";
// Before In conversation: a reply moves a pursuit this far along.
export const beforeConversation = (s: PursuitStatus) => s === "preparing" || s === "contacted" || s === "applied";

export const statusText = (s: PursuitStatus, reason?: ClosedReason | null) => (s === "closed" && reason ? `Closed · ${REASON_LABELS[reason]}` : STATUS_LABELS[s]);

// Where a pursuit opens on Pursuits: its role, or, for one with no open role (Start outreach), the pursuit itself.
export const pursuitHref = (p: { id: string; postingId?: string | null }) => (p.postingId ? `/pursuits?role=${p.postingId}` : `/pursuits?pursuit=${p.id}`);

// What a pursuit knows about itself for its suggested next step. path: pathOf. contacted, applied: whether an outreach
// message was marked sent, and whether it was marked Applied. to: the contact its outreach message is for, when one
// was found.
export type StepFacts = { status: PursuitStatus; hasResume: boolean; hasLetter?: boolean; path: Path | null; contacted: boolean; applied: boolean; hasContacts: boolean; to?: string | null };

// The step a pursuit suggests when they haven't written their own: what's left on its path at its status. Before they
// choose a path (and once the resume is tailored), choosing one.
export function suggestedStep(p: StepFacts): string | null {
  switch (p.status) {
    case "preparing":
    case "contacted":
    case "applied": {
      if (p.status === "preparing" && !p.hasResume) return "Tailor your resume";
      if (!p.path) return "Choose a path";
      if (takesOutreach(p.path) && !p.contacted) return !p.hasContacts ? "Find contacts" : `Send your outreach message${p.to ? ` to ${p.to}` : ""}`;
      if (takesApply(p.path) && !p.applied) return p.hasLetter === false ? "Write your cover letter" : "Apply, then mark it Applied";
      return "Wait for a reply";
    }
    case "inConversation":
      return "Agree the next step with them";
    case "interviewing":
      return "Prepare for the interview";
    case "offer":
      return "Decide on the offer";
    case "closed":
      return null;
  }
}

// In-app reminders, each switchable in settings. They're worked out from a pursuit's dates as it's shown, in the
// person's own calendar days, and surface as its next step.
export const REMINDER_RULES = ["followUp", "prepare", "stale"] as const;
export type ReminderRule = (typeof REMINDER_RULES)[number];
export const RULE_LABELS: Record<ReminderRule, { title: string; line: string }> = {
  followUp: { title: "Follow up when an application or outreach goes quiet", line: "A reminder after 7 days without a reply; for outreach, then the next contact." },
  prepare: { title: "Prepare before an interview", line: "A reminder the day before." },
  stale: { title: "Check on a pursuit that hasn’t moved", line: "After 3 weeks with no change, asks whether it’s still on." },
};
// What marks a reminder done: its timeline event, and the button that logs it.
export const DONE: Record<ReminderRule, { event: "followedUp" | "prepared" | "checkedIn"; label: string }> = {
  followUp: { event: "followedUp", label: "Followed up" },
  prepare: { event: "prepared", label: "Prepared" },
  stale: { event: "checkedIn", label: "Still on" },
};

export type ReminderFacts = {
  status: PursuitStatus;
  appliedAt: number | null;
  // YYYY-MM-DD, a day in their calendar.
  interviewAt: string | null;
  changedAt: number;
  timeline: { at: number; event: string }[];
  // A reminder snoozed until a day (YYYY-MM-DD, their calendar).
  snoozed?: { rule: ReminderRule; until: string } | null;
  // Its contacts in group order (contactGroups.inOrder): when the last outreach message to each was marked sent, and
  // when each replied.
  contacts?: { id: string; name: string; sentAt: number | null; repliedAt: number | null }[];
  // The first reply from a person there.
  repliedAt?: number | null;
};
// step: what an outreach reminder asks for besides a follow-up: writing to the next contact, or deciding after three
// went unanswered. contact: who the follow-up or the next message is for.
export type Reminder = { rule: ReminderRule; tag: string; text: string; step?: "nextContact" | "noReply"; contact?: { id: string; name: string } };

const DAY_MS = 86_400_000;
const startOfDay = (ms: number) => new Date(new Date(ms).getFullYear(), new Date(ms).getMonth(), new Date(ms).getDate()).getTime();
// Whole calendar days from `from` to `to` (local time).
const daysBetween = (from: number, to: number) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
export const dayOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};
const shortDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// A moment's day in their calendar, as YYYY-MM-DD.
export const dayText = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// One timeline entry in words. day: how a date reads where it's shown (Pursuits says "Oct 3", an export's readable
// files 2026-10-03).
export type TimelineEntry = { event: string; status?: PursuitStatus; reason?: ClosedReason; text?: string };
export function timelineWords(e: TimelineEntry, day: (ms: number) => string): string {
  switch (e.event) {
    case "started":
      return "Started";
    case "status":
      return e.status === "preparing" ? "Back to Preparing" : e.status ? statusText(e.status, e.reason) : "Status changed";
    case "nextStep":
      return e.text ? `Next step: ${e.text}` : "Next step cleared";
    case "notes":
      return "Note added";
    case "resume":
      return "Chose the resume to use";
    case "letter":
      return e.text === "edited" ? "Cover letter edited" : e.text === "updated" ? "Cover letter updated for changed facts" : "Cover letter written";
    case "answer":
      return `Answer saved: ${e.text}`;
    case "interview":
      return e.text ? `Interview date: ${day(dayOf(e.text))}` : "Interview date cleared";
    case "followedUp":
      return e.text ? `Followed up with ${e.text}` : "Followed up";
    case "prepared":
      return "Prepared for the interview";
    case "checkedIn":
      return "Still on";
    case "people":
      return `Found ${e.text} people`;
    case "revealed":
      return `Revealed the email of ${e.text}`;
    case "outreach":
      return `Outreach message sent to ${e.text}`;
    case "snoozed":
      return e.text ? `Reminder snoozed until ${day(dayOf(e.text))}` : "Reminder snoozed";
    case "path":
      return e.text ? `Path: ${PATH_LABELS[e.text as Path]}` : "Path cleared";
    case "replied":
      return `${e.text} replied`;
    case "added":
      return `Added ${e.text} as a contact`;
    default:
      return e.event;
  }
}

// Snooze's quick choices: the day a reminder comes back, that many days from today.
export const SNOOZE_CHOICES = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
] as const;
export const snoozeDay = (now: number, days: number) => dayText(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() + days).getTime());

// Outreach goes to one contact at a time, at most three per pursuit, with one follow-up each.
export const MAX_CONTACTS = 3;
const QUIET_DAYS = 7;

// The outreach reminder due, if any, until someone there replies: 7 days after the last outreach message with no
// reply, follow up with that contact; 7 days after the follow-up, write to the next contact in group order; once three
// went unanswered, apply (if they haven't since) or close it as No response.
function outreachReminder(p: ReminderFacts, now: number): Reminder | null {
  const contacts = p.contacts ?? [];
  if (p.repliedAt || contacts.some((c) => c.repliedAt !== null) || !beforeConversation(p.status)) return null;
  const written = contacts.filter((c) => c.sentAt !== null).sort((a, b) => b.sentAt! - a.sentAt!);
  const last = written[0];
  if (!last) return null;
  const followed = Math.max(-1, ...p.timeline.filter((e) => e.event === "followedUp" && e.at >= last.sentAt!).map((e) => e.at));
  if (followed < 0) {
    const days = daysBetween(last.sentAt!, now);
    return days >= QUIET_DAYS ? { rule: "followUp", tag: "Follow up", text: `No reply from ${last.name} for ${days} days`, contact: { id: last.id, name: last.name } } : null;
  }
  if (daysBetween(followed, now) < QUIET_DAYS) return null;
  if (written.length >= MAX_CONTACTS) {
    if (p.appliedAt !== null && p.appliedAt > followed) return null;
    return { rule: "followUp", step: "noReply", tag: "No reply", text: `No reply from ${written.length} contacts` };
  }
  const next = contacts.find((c) => c.sentAt === null);
  return { rule: "followUp", step: "nextContact", tag: "Next contact", text: `No reply from ${last.name} after a follow-up`, ...(next ? { contact: { id: next.id, name: next.name } } : {}) };
}

// The reminders due for a pursuit now, most pressing first, for the rules that are on.
// - Follow up: outreach that went quiet (outreachReminder); else Applied, and nothing has changed for 7 days; again once
//   it's 14 days since applying and quiet for 7 more. Two at most; each Followed up is a change, so the quiet starts
//   over.
// - Prepare: from the day before its interview date through the day itself, until they mark it Prepared.
// - Check in: open (not Closed) with no change for 21 days; Still on is a change.
// A snoozed reminder doesn't show before its day; from that day it's worked out as usual, so it comes back as it was.
export function remindersOf(p: ReminderFacts, now: number, on: Record<ReminderRule, boolean>): Reminder[] {
  const out: Reminder[] = [];
  if (p.status === "closed") return out;
  const asleep = p.snoozed && daysBetween(now, dayOf(p.snoozed.until)) > 0 ? p.snoozed.rule : null;
  const quiet = daysBetween(p.changedAt, now);
  if (on.prepare && p.interviewAt) {
    const day = dayOf(p.interviewAt);
    const until = daysBetween(now, day);
    const prepared = p.timeline.some((e) => e.event === "prepared" && e.at >= day - DAY_MS);
    if ((until === 0 || until === 1) && !prepared) out.push({ rule: "prepare", tag: "Prepare", text: until === 0 ? "Interview today" : `Interview tomorrow, ${shortDay(day)}` });
  }
  const outreach = on.followUp ? outreachReminder(p, now) : null;
  if (outreach) out.push(outreach);
  else if (on.followUp && p.status === "applied" && p.appliedAt !== null) {
    const followUps = p.timeline.filter((e) => e.event === "followedUp" && e.at >= p.appliedAt!).length;
    const since = daysBetween(p.appliedAt, now);
    if (quiet >= 7 && (followUps === 0 || (followUps === 1 && since >= 14))) out.push({ rule: "followUp", tag: "Follow up", text: `No news for ${quiet} days` });
  }
  if (on.stale && quiet >= 21) out.push({ rule: "stale", tag: "Check in", text: `No change for ${Math.floor(quiet / 7)} weeks. Still going?` });
  return out.filter((r) => r.rule !== asleep);
}

// Outcomes: how far a pursuit got, from its timeline (the furthest stage it was ever set to), whatever its status is
// now.
const STAGES = ["contacted", "applied", "inConversation", "interviewing", "offer"] as const;
export type Stage = (typeof STAGES)[number];
export function reachedOf(timeline: { event: string; status?: PursuitStatus }[]): Stage | null {
  let best = -1;
  for (const e of timeline) if (e.event === "status" && e.status) best = Math.max(best, STAGES.indexOf(e.status as Stage));
  return best < 0 ? null : STAGES[best];
}

// What a pursuit went on to do, at any time, whatever it is now. contacted: an outreach message marked sent or set to
// Contacted, or taken past Preparing without applying (someone there was in touch). applied: set to Applied. A pursuit
// can be both; contactedOrApplied is either, which is any pursuit past Preparing.
export function wentOut(p: { contactedAt?: number | null; appliedAt?: number | null; timeline: { event: string; status?: PursuitStatus }[] }) {
  const ever = (s: PursuitStatus) => p.timeline.some((e) => e.event === "status" && e.status === s);
  const applied = p.appliedAt != null || ever("applied");
  const contacted = p.contactedAt != null || ever("contacted") || (!applied && reachedOf(p.timeline) !== null);
  return { contacted, applied, contactedOrApplied: contacted || applied };
}

// Suggestions from outcomes, worked out from the counts alone; they change nothing. A direction is compared only once
// it has OUTCOME_MIN pursuits contacted or applied, a resume version once it has OUTCOME_MIN applications, and a path
// once it has OUTCOME_MIN pursuits, so a handful of pursuits suggests nothing:
// - Interviews come from X: of two or more directions with enough pursuits contacted or applied, the one where at least
//   twice the share got to an interview as in each other, with 2 interviews or more.
// - The same between the resume versions sent for one direction, by applications.
// - Offers come from X: 2 offers or more, all for one direction, with pursuits contacted or applied for others too.
// - No interviews yet from X: QUIET_MIN pursuits contacted or applied or more and none got to an interview.
// - Replies come from Outreach (or Apply): both paths with enough pursuits, and one with at least twice the other's
//   share of pursuits that got a reply, with 2 replies or more.
export const OUTCOME_MIN = 4;
export const QUIET_MIN = 6;
// A direction's pursuits contacted or applied (wentOut), and how many got to an interview and an offer.
export type OutcomeGroup = { name: string; contactedOrApplied: number; interviewed: number; offers: number };
// A resume version's applications, and how many got to an interview.
export type VersionGroup = { name: string; direction: string; applied: number; interviewed: number };
// A path's pursuits and how many got a reply from a person there.
export type PathGroup = { path: Path; started: number; replied: number };
export type Suggestion = { text: string; detail: string };

const applications = (n: number) => `${n} ${n === 1 ? "application" : "applications"}`;
const contactedOrApplied = (n: number) => `${n} ${n === 1 ? "pursuit" : "pursuits"} contacted or applied`;

// Of groups with `size` OUTCOME_MIN or more (two at least), the one with the largest share of `hits`, when it has 2 or
// more and at least twice the share of each other.
function leader<G>(groups: G[], size: (g: G) => number, hits: (g: G) => number) {
  const share = (g: G) => hits(g) / size(g);
  const enough = groups.filter((g) => size(g) >= OUTCOME_MIN);
  if (enough.length < 2) return null;
  const [best, ...rest] = [...enough].sort((a, b) => share(b) - share(a));
  if (hits(best) < 2 || rest.some((g) => share(best) < 2 * share(g))) return null;
  return { best, others: { size: rest.reduce((n, g) => n + size(g), 0), hits: rest.reduce((n, g) => n + hits(g), 0) } };
}

// directions: each direction's counts, named. versions: each resume version's, named ("Sep 3 Supply Chain Product"), with
// the direction it's for. paths: each path's pursuits and replies.
export function outcomeSuggestions(directions: OutcomeGroup[], versions: VersionGroup[] = [], paths: PathGroup[] = []): Suggestion[] {
  const out: Suggestion[] = [];
  const lead = leader(directions, (g) => g.contactedOrApplied, (g) => g.interviewed);
  if (lead)
    out.push({
      text: `Interviews come from ${lead.best.name}`,
      detail: `${lead.best.interviewed} of ${contactedOrApplied(lead.best.contactedOrApplied)} got to an interview, against ${lead.others.hits} of ${lead.others.size} for your other directions.`,
    });
  const offered = directions.filter((g) => g.offers > 0);
  const offers = offered.reduce((n, g) => n + g.offers, 0);
  if (offers >= 2 && offered.length === 1 && directions.some((g) => g !== offered[0] && g.contactedOrApplied > 0))
    out.push({ text: `Offers come from ${offered[0].name}`, detail: `${offers === 2 ? "Both" : `All ${offers}`} offers were for this direction.` });
  for (const direction of [...new Set(versions.map((v) => v.direction))]) {
    const best = leader(
      versions.filter((v) => v.direction === direction),
      (g) => g.applied,
      (g) => g.interviewed,
    );
    if (best)
      out.push({
        text: `The ${best.best.name} resume gets more interviews`,
        detail: `${best.best.interviewed} of ${applications(best.best.applied)} sent with it got to an interview, against ${best.others.hits} of ${best.others.size} with other ${direction} versions.`,
      });
  }
  for (const g of directions)
    if (g.contactedOrApplied >= QUIET_MIN && g.interviewed === 0) out.push({ text: `No interviews yet from ${g.name}`, detail: `None of the ${contactedOrApplied(g.contactedOrApplied)} got to an interview.` });
  const replies = leader(
    paths.filter((p) => p.path !== "both"),
    (p) => p.started,
    (p) => p.replied,
  );
  if (replies) {
    const [best, other] = replies.best.path === "outreach" ? ["Outreach", "Apply"] : ["Apply", "Outreach"];
    out.push({ text: `Replies come from ${best}`, detail: `${replies.best.replied} of ${replies.best.started} pursuits on ${best} got a reply, against ${replies.others.hits} of ${replies.others.size} on ${other}.` });
  }
  return out;
}
