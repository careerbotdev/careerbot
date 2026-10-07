import type { Bullet, Entry, ProjectEntry, ResumeDoc } from "./resumeDoc";

// What changed between two versions of one resume, in substance rather than wording, and which lines of a version rest
// on facts that were rejected or edited since it was written. Pure: no database access; resume.ts says how each fact
// stands now.

export type FactStatus = "ok" | "edited" | "rejected";
export type Change = { kind: "added" | "dropped" | "changed"; text: string; where: string | null; factIds: string[]; note: string | null };

// An entry's key: its role, or for entries from before roles had keys, its employer and title.
const roleKeyOf = (e: Entry) => e.roleKey ?? `${e.employer}|${e.title}`;
// An entry as one line: "Title at Employer", or a career break's title alone.
const entryLine = (e: Entry) => (e.employer ? `${e.title} at ${e.employer}` : e.title);
const factsOf = (bullets: Bullet[]) => [...new Set(bullets.flatMap((b) => b.factIds))];

// Why a line's facts no longer stand, the strongest reason first; null when they all do.
function noteOf(factIds: string[], status: (factId: string) => FactStatus) {
  const each = factIds.map(status);
  return each.includes("rejected") ? "fact rejected" : each.includes("edited") ? "fact edited since" : null;
}

// Every bullet of a doc with where it sits (employer, or a career break's title, or project name), in entries both
// versions share.
type Placed = { bullet: Bullet; where: string };
function bulletsIn(doc: ResumeDoc, roles: Set<string>, projects: Set<string>): Placed[] {
  return [
    ...doc.experience.filter((e) => roles.has(roleKeyOf(e))).flatMap((e) => e.bullets.map((bullet) => ({ bullet, where: e.employer || e.title }))),
    ...(doc.projects ?? []).filter((p) => projects.has(p.projectKey)).flatMap((p) => p.bullets.map((bullet) => ({ bullet, where: p.name }))),
  ];
}

// Whether a bullet says something the other version doesn't: none of its facts are behind any line there, or, with no
// facts, no line there has its exact words.
function newTo(b: Bullet, other: ResumeDoc) {
  const all = [...other.experience.flatMap((e) => e.bullets), ...(other.projects ?? []).flatMap((p) => p.bullets)];
  if (!b.factIds.length) return !all.some((x) => !x.factIds.length && x.text === b.text);
  const cited = new Set(all.flatMap((x) => x.factIds));
  return !b.factIds.some((id) => cited.has(id));
}

// What `newer` says that `older` didn't (added), what it says differently (changed: the summary, a role's title), and
// what it no longer says (dropped, with why when a fact behind it was rejected or edited since). A role or project that
// came or went is one row, not one per bullet. `status` is how each of the older version's facts stands now.
export function versionChanges(older: ResumeDoc, newer: ResumeDoc, status: (factId: string) => FactStatus): Change[] {
  const added: Change[] = [];
  const changed: Change[] = [];
  const dropped: Change[] = [];
  const oldRoles = new Map(older.experience.map((e) => [roleKeyOf(e), e]));
  const newRoles = new Map(newer.experience.map((e) => [roleKeyOf(e), e]));
  const oldProjects = new Map((older.projects ?? []).map((p) => [p.projectKey, p]));
  const newProjects = new Map((newer.projects ?? []).map((p) => [p.projectKey, p]));
  const shared = <T>(a: Map<string, T>, b: Map<string, T>) => new Set([...a.keys()].filter((k) => b.has(k)));
  const roles = shared(oldRoles, newRoles);
  const projects = shared(oldProjects, newProjects);

  if (older.summary !== newer.summary) changed.push({ kind: "changed", text: "Summary", where: null, factIds: [], note: null });
  const entryRow = (kind: "added" | "dropped", x: Entry | ProjectEntry, text: string): Change => {
    const factIds = factsOf(x.bullets);
    return { kind, text, where: null, factIds, note: kind === "dropped" ? noteOf(factIds, status) : null };
  };
  for (const [key, e] of newRoles) {
    if (!oldRoles.has(key)) added.push(entryRow("added", e, entryLine(e)));
    else if (oldRoles.get(key)!.title !== e.title) changed.push({ kind: "changed", text: `${e.employer || oldRoles.get(key)!.title} title to ${e.title}`, where: e.employer || null, factIds: [], note: null });
  }
  for (const [key, p] of newProjects) if (!oldProjects.has(key)) added.push(entryRow("added", p, p.name));
  for (const [key, e] of oldRoles) if (!newRoles.has(key)) dropped.push(entryRow("dropped", e, entryLine(e)));
  for (const [key, p] of oldProjects) if (!newProjects.has(key)) dropped.push(entryRow("dropped", p, p.name));

  for (const { bullet, where } of bulletsIn(newer, roles, projects)) {
    if (newTo(bullet, older)) added.push({ kind: "added", text: bullet.text, where, factIds: bullet.factIds, note: null });
  }
  for (const { bullet, where } of bulletsIn(older, roles, projects)) {
    if (newTo(bullet, newer)) dropped.push({ kind: "dropped", text: bullet.text, where, factIds: bullet.factIds, note: noteOf(bullet.factIds, status) });
  }
  // A line in their own words on either side that the other doesn't read the same way: CareerBot rewording a line
  // over the same facts isn't news, their own rewording is.
  const words = (doc: ResumeDoc) => new Set([...doc.experience.flatMap((e) => e.bullets), ...(doc.projects ?? []).flatMap((p) => p.bullets)].map((b) => b.text));
  const [oldWords, newWords] = [words(older), words(newer)];
  const reworded = new Set<string>();
  for (const [side, other] of [[newer, oldWords], [older, newWords]] as const)
    for (const { bullet, where } of bulletsIn(side, roles, projects)) {
      const at = bullet.original ?? bullet.text;
      if (!bullet.edited || other.has(bullet.text) || reworded.has(at)) continue;
      reworded.add(at);
      changed.push({ kind: "changed", text: side === newer ? `Reworded: ${bullet.text}` : `No longer in your words: ${bullet.text}`, where, factIds: bullet.factIds, note: null });
    }
  return [...added, ...changed, ...dropped];
}

// The lines of a doc (by their words) resting on a fact that's now rejected or was edited since; rejected wins.
export function lineFlags(doc: ResumeDoc, status: (factId: string) => FactStatus): Record<string, "edited" | "rejected"> {
  const flags: Record<string, "edited" | "rejected"> = {};
  for (const b of [...doc.experience.flatMap((e) => e.bullets), ...(doc.projects ?? []).flatMap((p) => p.bullets)]) {
    const note = noteOf(b.factIds, status);
    if (!note) continue;
    const flag = note === "fact rejected" ? "rejected" : "edited";
    if (flags[b.text] !== "rejected") flags[b.text] = flag;
  }
  return flags;
}
