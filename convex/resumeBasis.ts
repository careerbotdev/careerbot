import { type Infer, v } from "convex/values";
import { LENGTHS, type ResumeLength } from "./resumeDoc";

// What a base or direction resume was written from, and what has changed in the approved record since. A resume run
// stores its basis (resume.ts); Resume updates compares it with the record as it is now. Each entry is an approved
// item's id and a mark of the content a resume uses from it, so a fact reworded in place shows even when every count
// stays the same. Pure: no database access.

const entry = v.object({ id: v.id("items"), mark: v.string() });
export const resumeBasis = v.object({
  roles: v.array(entry),
  facts: v.array(entry),
  projects: v.array(entry),
  insights: v.array(entry),
  // Approved skills, tools and certifications (unset on versions written before they were reviewed items).
  skills: v.optional(v.array(entry)),
  // A direction resume's direction: its name, what it includes, summary and approved positioning.
  direction: v.optional(entry),
  // The length it was written to (resumeDoc.LENGTHS); unset on versions from before there was one: two pages.
  length: v.optional(v.string()),
});

export type Basis = Infer<typeof resumeBasis>;

// The facts a document's lines cite, each with a mark of its words as the lines now reflect them (factChanges.ts),
// once a line update has been applied to it. Before that, what it was written from or the facts' history says.
export const factMarks = v.array(v.object({ id: v.string(), mark: v.string() }));
export type FactMarks = Infer<typeof factMarks>;
type Entry = Basis["facts"][number];
type ItemId = Entry["id"];

// A short, stable fingerprint of some content (cyrb53). Not for security; two different contents sharing one is
// vanishingly unlikely at this scale.
export function markOf(content: unknown): string {
  const s = JSON.stringify(content ?? null);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

type RoleIn = {
  _id: ItemId;
  data: {
    employer?: string;
    title?: string;
    alternateTitles?: string[];
    start?: string | null;
    end?: string | null;
    location?: string | null;
    skills?: string[];
    tools?: string[];
    break?: boolean;
    reason?: string;
  };
};
type ProjectIn = { _id: ItemId; roleKey?: string; data: { name: string; url: string; summary?: string; stack?: string[]; start?: string | null; end?: string | null } };
type TextIn = { _id: ItemId; data: { text: string } };
type DirectionIn = { _id: ItemId; data: { name: string; includes?: string[]; summary?: string; detail?: unknown } };
type SkillIn = { _id: ItemId; kind: string; data: { name: string; group?: string } };

// The basis of a resume written from these approved items (the ones that count, recordContext.countedRecord) and,
// for a direction resume, its direction. Marks cover what the resume run reads from each: a project's commit count
// is left out, since it moves with every read of the repository.
export function basisOf(items: { roles: RoleIn[]; facts: TextIn[]; projects: ProjectIn[]; insights: TextIn[]; skills?: SkillIn[] }, direction?: DirectionIn | null, length?: ResumeLength): Basis {
  return {
    ...(length ? { length } : {}),
    roles: items.roles.map((r) => {
      const d = r.data;
      return { id: r._id, mark: markOf([d.employer, d.title, d.alternateTitles, d.start, d.end, d.location, d.skills, d.tools, d.break, d.reason]) };
    }),
    facts: items.facts.map((f) => ({ id: f._id, mark: markOf(f.data.text) })),
    projects: items.projects.map((p) => ({ id: p._id, mark: markOf([p.data.name, p.data.url, p.data.summary, p.data.stack, p.data.start, p.data.end, p.roleKey]) })),
    insights: items.insights.map((i) => ({ id: i._id, mark: markOf(i.data.text) })),
    skills: (items.skills ?? []).map((k) => ({ id: k._id, mark: markOf([k.kind, k.data.name, k.data.group]) })),
    ...(direction ? { direction: { id: direction._id, mark: directionMark(direction.data) } } : {}),
  };
}

// A direction's mark: what a direction resume reads from it. Its detail names facts by id, so a copy of the record with
// new ids (the demo seed, scripts/demo.ts) has a new mark for the same direction.
export function directionMark(d: { name?: unknown; includes?: unknown; summary?: unknown; detail?: unknown }) {
  return markOf([d.name, d.includes, d.summary, d.detail]);
}

export type Changes = {
  facts: { added: ItemId[]; removed: ItemId[]; reworded: ItemId[] };
  projects: { added: ItemId[]; removed: ItemId[]; edited: ItemId[] };
  roles: { added: ItemId[]; removed: ItemId[]; edited: ItemId[] };
  insights: { added: ItemId[]; removed: ItemId[]; reworded: ItemId[] };
  skills: { added: ItemId[]; removed: ItemId[]; edited: ItemId[] };
  direction: boolean;
  // The length it's set to now, when that isn't the one it was written to.
  length: ResumeLength | null;
};

function compare(before: Entry[], now: Entry[]) {
  const was = new Map(before.map((e) => [String(e.id), e.mark]));
  const is = new Set(now.map((e) => String(e.id)));
  return {
    added: now.filter((e) => !was.has(String(e.id))).map((e) => e.id),
    removed: before.filter((e) => !is.has(String(e.id))).map((e) => e.id),
    changed: now.filter((e) => was.has(String(e.id)) && was.get(String(e.id)) !== e.mark).map((e) => e.id),
  };
}

// What changed between the basis a resume was written from and the record now.
export function changesSince(before: Basis, now: Basis): Changes {
  const facts = compare(before.facts, now.facts);
  const projects = compare(before.projects, now.projects);
  const roles = compare(before.roles, now.roles);
  const insights = compare(before.insights, now.insights);
  // A version from before skills were reviewed items was written from none: every approved one is new to it.
  const skills = compare(before.skills ?? [], now.skills ?? []);
  return {
    facts: { added: facts.added, removed: facts.removed, reworded: facts.changed },
    projects: { added: projects.added, removed: projects.removed, edited: projects.changed },
    roles: { added: roles.added, removed: roles.removed, edited: roles.changed },
    insights: { added: insights.added, removed: insights.removed, reworded: insights.changed },
    skills: { added: skills.added, removed: skills.removed, edited: skills.changed },
    direction: (before.direction?.mark ?? null) !== (now.direction?.mark ?? null),
    length: (now.length ?? "two") !== (before.length ?? "two") ? ((now.length ?? "two") as ResumeLength) : null,
  };
}

export const hasChanges = (c: Changes) =>
  c.direction || !!c.length || [c.facts, c.projects, c.roles, c.insights, c.skills].some((group) => Object.values(group).some((ids) => ids.length > 0));

// Names for the items a summary mentions: a fact's project or the employer of its role; a project's, role's or skill's
// name.
export type Labels = { fact: (id: ItemId) => { project?: string; role?: string }; project: (id: ItemId) => string; role: (id: ItemId) => string; skill: (id: ItemId) => string };

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

// A plain summary of the changes, such as "2 new project facts (Palletwise, Lanebook), 1 reworded fact at Brightwater".
export function describeChanges(c: Changes, labels: Labels): string {
  const parts: string[] = [];
  const facts = (ids: ItemId[], how: string) => {
    const where = ids.map(labels.fact);
    const project = where.filter((w) => w.project);
    const role = where.filter((w) => !w.project);
    if (project.length) parts.push(`${count(project.length, `${how} project fact`)} (${names(project.map((w) => w.project)).join(", ")})`);
    if (role.length) {
      const at = names(role.map((w) => w.role));
      parts.push(`${count(role.length, `${how} fact`)}${at.length ? ` at ${at.join(", ")}` : ""}`);
    }
  };
  const named = (ids: ItemId[], one: string, label: (id: ItemId) => string) => {
    const known = names(ids.map(label));
    if (ids.length) parts.push(`${count(ids.length, one)}${known.length ? ` (${known.join(", ")})` : ""}`);
  };
  facts(c.facts.added, "new");
  facts(c.facts.reworded, "reworded");
  facts(c.facts.removed, "removed");
  named(c.projects.added, "new project", labels.project);
  named(c.projects.edited, "edited project", labels.project);
  named(c.projects.removed, "removed project", labels.project);
  named(c.roles.added, "new role", labels.role);
  named(c.roles.edited, "edited role", labels.role);
  named(c.roles.removed, "removed role", labels.role);
  if (c.insights.added.length) parts.push(count(c.insights.added.length, "new insight"));
  if (c.insights.reworded.length) parts.push(count(c.insights.reworded.length, "reworded insight"));
  if (c.insights.removed.length) parts.push(count(c.insights.removed.length, "removed insight"));
  named(c.skills.added, "new skill", labels.skill);
  named(c.skills.edited, "edited skill", labels.skill);
  named(c.skills.removed, "removed skill", labels.skill);
  if (c.direction) parts.push("changed positioning");
  if (c.length) parts.push(`length changed to ${LENGTHS[c.length]}`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
