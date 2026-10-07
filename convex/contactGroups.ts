// Contacts at a pursuit's company, in three groups, all first-class: the hiring manager (the person you'd report to),
// the team (close to the work; often quicker to reply, and can pass your name on), and recruiting (recruiters and
// talent; can put you in the process). Worked out from titles only, so a person can move someone to another group and
// their choice wins. Pure module, shared with the browser.

export const CONTACT_GROUPS = ["hiringManager", "team", "recruiting"] as const;
export type ContactGroup = (typeof CONTACT_GROUPS)[number];
export const GROUP_LABELS: Record<ContactGroup, { title: string; line: string }> = {
  hiringManager: { title: "Hiring manager", line: "The person you’d report to" },
  team: { title: "Team", line: "Close to the work; quick to reply and can pass your name on" },
  recruiting: { title: "Recruiting", line: "Runs hiring and can put you in the process" },
};

// The titles a recruiting search asks Apollo for (it matches similar titles too).
export const RECRUITING_TITLES = ["recruiter", "talent", "sourcer", "people partner"];
const RECRUITING = /\b(recruit\w*|talent|sourc\w*|people partner)\b/i;
// Titles that lead work: these go to Hiring manager. A manager or lead counts only when the role is neither a manager
// nor a lead itself, so a product manager's peers, and a head of customer success's managers, stay on the team.
const LEADS = /\b(head|director|vp|vice president|chief|ceo|coo|cto|cro|cpo|founder|owner|president|partner)\b/i;
const MANAGES = /\b(manager|lead)\b/i;

// Words that say a level, not the work.
const LEVEL_WORDS = new Set(["head", "vp", "vice", "president", "director", "manager", "senior", "sr", "lead", "chief", "principal", "staff", "global", "associate", "of", "and", "the", "for", "to", "in", "i", "ii", "iii"]);
const workWords = (title: string) => new Set(title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1 && !LEVEL_WORDS.has(w)));
// How likely a lead of the role's work: head or director first, then VP, then manager, then the rest.
const leadRank = (title: string) => (/\b(head|director)\b/i.test(title) ? 0 : /\b(vp|vice president)\b/i.test(title) ? 1 : /\b(manager|lead)\b/i.test(title) ? 2 : 3);

// The group a title puts someone in, for a role.
export function groupOf(roleTitle: string, title: string | undefined): ContactGroup {
  const t = title ?? "";
  if (RECRUITING.test(t)) return "recruiting";
  if (LEADS.test(t) || (MANAGES.test(t) && !LEADS.test(roleTitle) && !MANAGES.test(roleTitle))) return "hiringManager";
  return "team";
}

// The title a team search asks Apollo for: the role's own work, without its level ("Senior Product Manager, Load
// Planning" asks for "Product Manager"; "Head of Customer Success" for "Customer Success"; "Director, Supply Planning"
// for "Supply Planning").
export function teamTitle(roleTitle: string) {
  const level = /^\s*((senior|sr|junior|jr|lead|principal|staff|head of|head|director of|director|vp of|vp|vice president of|vice president|chief)\b\.?\s*)+/i;
  const parts = roleTitle.split(/,| - | – |\(/).map((x) => x.replace(level, "").trim());
  return parts.find(Boolean) ?? roleTitle.trim();
}

// People in the order to look at them for a role: those whose title names the same work first (the more words in
// common, the earlier), and among them those who'd lead it. The first, when it names the same work, is the likely
// hiring manager.
export function hiringOrder<T extends { title?: string }>(roleTitle: string, people: T[]): (T & { hiringManager: boolean })[] {
  const role = workWords(roleTitle);
  const shared = (p: T) => [...workWords(p.title ?? "")].filter((w) => role.has(w)).length;
  const sorted = [...people].sort((a, b) => shared(b) - shared(a) || leadRank(a.title ?? "") - leadRank(b.title ?? ""));
  return sorted.map((p, i) => ({ ...p, hiringManager: i === 0 && shared(p) > 0 }));
}

// Found people in groups, each group in hiring order; only the first of the Hiring manager group can be the likely
// hiring manager.
export function grouped<T extends { title?: string }>(roleTitle: string, people: T[]): (T & { hiringManager: boolean })[] {
  return CONTACT_GROUPS.flatMap((g) => {
    const ordered = hiringOrder(roleTitle, people.filter((p) => groupOf(roleTitle, p.title) === g));
    return g === "hiringManager" ? ordered : ordered.map((p) => ({ ...p, hiringManager: false }));
  });
}

// Contacts in display order: by group (their choice, else from the title), then the order found.
export function inOrder<T extends { group?: ContactGroup; title?: string; at: number }>(roleTitle: string, rows: T[]): T[] {
  const rank = (c: T) => CONTACT_GROUPS.indexOf(c.group ?? groupOf(roleTitle, c.title));
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.at - b.at);
}
