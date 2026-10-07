import { type Infer, v } from "convex/values";

// A resume is structured, not a text blob: a summary block, experience entries and projects with bullets that each carry
// the approved facts they rest on, and skill groups. Pages render it; plain text, Markdown, HTML, RTF, PDF and Word are
// generated from it. How it shows is a separate layer the person chooses. Folds, career breaks and which projects show
// are set on the record, for every resume; titles are set on the base resume, for every resume below it. All live in the
// workspace's resume settings, and each resume (base included for folds, breaks and projects) can override them in its
// own `layout`. `present` applies the layers, and the page and every export go through it, so they never disagree. A
// project linked to a role (its roleKey) shows inside that role's entry, as a "Project: Name" line with its bullets.
// Pure module, shared with the browser.

// edited: their own words in place of CareerBot's (`original`), on this resume only; it still rests on the same facts.
const bullet = v.object({ text: v.string(), factIds: v.array(v.string()), unsourced: v.optional(v.boolean()), edited: v.optional(v.boolean()), original: v.optional(v.string()) });
const entry = v.object({
  employer: v.string(),
  title: v.string(),
  location: v.optional(v.string()),
  start: v.optional(v.string()),
  end: v.optional(v.string()),
  roleKey: v.optional(v.string()),
  // A career break from the record: no employer; one line, with their own reason only if they choose to show it.
  break: v.optional(v.boolean()),
  reason: v.optional(v.string()),
  bullets: v.array(bullet),
});
const project = v.object({ projectKey: v.string(), name: v.string(), url: v.optional(v.string()), start: v.optional(v.string()), end: v.optional(v.string()), roleKey: v.optional(v.string()), bullets: v.array(bullet) });
export const resumeDoc = v.object({
  summary: v.string(),
  experience: v.array(entry),
  // Projects from the record (their repositories): name, link and dates from the approved project, bullets citing
  // that project's approved facts, and the role it's linked to (roleKey, set again from the record as it's shown).
  // Resumes from before projects have none.
  projects: v.optional(v.array(project)),
  // Skill groups: names as the approved skill, tool and certification items give them, and their item ids (`keys`, in
  // the same order) so each can be shown or left out. Resumes from before skills were reviewed have names only.
  skills: v.array(v.object({ group: v.string(), items: v.array(v.string()), keys: v.optional(v.array(v.string())) })),
});
// A resume as shown (`present`): its entries carry the projects linked to them. What a pursuit keeps as sent.
export const shownDoc = v.object({ ...resumeDoc.fields, experience: v.array(v.object({ ...entry.fields, projects: v.optional(v.array(project)) })) });

export type Bullet = { text: string; factIds: string[]; unsourced?: boolean; edited?: boolean; original?: string };
export type Entry = {
  employer: string;
  title: string;
  location?: string;
  start?: string;
  end?: string;
  roleKey?: string;
  break?: boolean;
  reason?: string;
  bullets: Bullet[];
  // As shown only (never written): the projects linked to this role, inside it.
  projects?: ProjectEntry[];
};
export type ProjectEntry = { projectKey: string; name: string; url?: string; start?: string; end?: string; roleKey?: string; bullets: Bullet[] };
export type SkillGroup = { group: string; items: string[]; keys?: string[] };
export type ResumeDoc = { summary: string; experience: Entry[]; projects?: ProjectEntry[]; skills: SkillGroup[] };

// How one entry shows, chosen by the person. The written resume never changes.
// title: official (default), translated, or both ("Translated (official: Official)"); source: where the translated
// title came from (the direction's, the one suggested for the posting, or their own). fold: the entry is left out and
// the role before it in time ("previous") or after it ("next") widens its dates to cover it, taking its bullets or not;
// null: not folded (an override of a fold set for every resume). hidden: left out, dates and all. showReason: a career
// break shows the person's reason. In an override layer, a field that's set wins; one that isn't comes from below.
export const foldChoice = v.object({ into: v.union(v.literal("previous"), v.literal("next")), bullets: v.union(v.literal("move"), v.literal("drop")) });
export const layoutRole = v.object({
  roleKey: v.string(),
  title: v.optional(v.union(v.literal("official"), v.literal("translated"), v.literal("both"))),
  translated: v.optional(v.string()),
  source: v.optional(v.union(v.literal("direction"), v.literal("tailored"), v.literal("you"))),
  fold: v.optional(v.union(v.null(), foldChoice)),
  hidden: v.optional(v.boolean()),
  showReason: v.optional(v.boolean()),
});
// A project is shown or left out: set on the record for every resume (resumeSettings), overridden per resume (layout).
export const layoutProject = v.object({ projectKey: v.string(), hidden: v.optional(v.boolean()) });
// A skill (an approved skill, tool or certification, by its item id) is shown or left out the same way.
export const layoutSkill = v.object({ key: v.string(), hidden: v.optional(v.boolean()) });
// A bullet, by its words, pinned (always shown, even when its role folds and leaves its bullets out) or hidden (never
// shown). Only ever one resume's choice.
export const layoutBullet = v.object({ text: v.string(), state: v.union(v.literal("pinned"), v.literal("hidden")) });
// Check against facts, on a line or summary in their own words (lineCheck.ts): whether it says only what its facts
// support, and its words that go beyond them, with the facts it was checked against as they read then (facts, each a
// fact id and a mark of its words). Kept with the words it checked; editing them again clears it. It shows only while
// those facts all still count and read the same (resume.ts, currentChecks); a check kept before facts were held never
// shows.
export const lineCheck = v.object({ supported: v.boolean(), beyond: v.array(v.string()), facts: v.optional(v.array(v.object({ id: v.string(), mark: v.string() }))), at: v.number() });
export type LineCheck = Infer<typeof lineCheck>;
// A line in their own words: CareerBot's words (`text`, what pins and hides go by) and theirs (`to`), with its check
// against facts once they ask for one, and the facts it rests on as they read when they wrote the words (marks, each a
// fact id and a mark of its words: factChanges.ts flags the line once a fact changes since). Only ever one resume's
// choice, like the summary in their words.
export const layoutWords = v.object({ text: v.string(), to: v.string(), check: v.optional(lineCheck), marks: v.optional(v.array(v.object({ id: v.string(), mark: v.string() }))) });
export const resumeLayout = v.object({
  roles: v.array(layoutRole),
  projects: v.optional(v.array(layoutProject)),
  skills: v.optional(v.array(layoutSkill)),
  bullets: v.optional(v.array(layoutBullet)),
  words: v.optional(v.array(layoutWords)),
  summary: v.optional(v.string()),
  summaryCheck: v.optional(lineCheck),
});
export type LayoutRole = Infer<typeof layoutRole>;
export type LayoutProject = Infer<typeof layoutProject>;
export type LayoutSkill = Infer<typeof layoutSkill>;
export type LayoutBullet = Infer<typeof layoutBullet>;
export type ResumeLayout = Infer<typeof resumeLayout>;
type Layer = ResumeLayout | null | undefined;

// How long a resume is written: a target the writer gets, set on the record for every resume and per base or direction
// resume (a tailored one follows its direction's). Two pages unless they choose.
export const LENGTHS = { one: "One page", two: "Two pages", full: "Full" } as const;
export type ResumeLength = keyof typeof LENGTHS;
export const resumeLength = v.union(v.literal("one"), v.literal("two"), v.literal("full"));

// The two parts of a choice: how the role is placed (set on the record) and how its title reads (set on the base
// resume). `part` keeps one part of an entry, with its roleKey.
export const PLACEMENT = ["fold", "hidden", "showReason"] as const;
export const TITLE = ["title", "translated", "source"] as const;
export const part = (r: LayoutRole | undefined, keys: readonly (keyof LayoutRole)[], roleKey = r?.roleKey ?? ""): LayoutRole =>
  Object.fromEntries([["roleKey", roleKey], ...keys.flatMap((k) => (r?.[k] !== undefined ? [[k, r[k]]] : []))]) as LayoutRole;

// The title a role goes on resumes under: its official title, or, until they give one, the first of its other titles
// (what they call it, or what the market calls the work). `official`: whether it's the official one, so the record
// and Review can say when it isn't. Null when the role has no title at all; such a role isn't on resumes.
export function resumeTitle(role: { title?: string | null; alternateTitles?: (string | null)[] | null }): { text: string; official: boolean } | null {
  const official = role.title?.trim();
  if (official) return { text: official, official: true };
  const other = role.alternateTitles?.map((t) => t?.trim()).find((t): t is string => !!t);
  return other ? { text: other, official: false } : null;
}

// The approved record as a resume without bullets, most recent first: what folds on the record page are judged
// against, by the same rules as `present`.
export function recordDoc(roles: { roleKey?: string; employer?: string | null; title?: string | null; alternateTitles?: string[] | null; start?: string | null; end?: string | null; break?: boolean; reason?: string }[]): ResumeDoc {
  const experience: Entry[] = roles
    .filter((r) => r.roleKey && (r.break || resumeTitle(r)))
    .map((r) => ({
      employer: r.break ? "" : (r.employer ?? ""),
      title: r.break ? r.title || "Career break" : resumeTitle(r)!.text,
      roleKey: r.roleKey,
      ...(r.start ? { start: r.start } : {}),
      ...(r.end ? { end: r.end } : {}),
      ...(r.break ? { break: true, ...(r.reason ? { reason: r.reason } : {}) } : {}),
      bullets: [],
    }))
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));
  return { summary: "", experience, skills: [] };
}

// Layers merged per role, project and skill, later layers winning field by field: the resume settings, then one
// resume's overrides.
export function mergeLayout(...layers: Layer[]): ResumeLayout {
  const by = new Map<string, LayoutRole>();
  const projects = new Map<string, LayoutProject>();
  const skills = new Map<string, LayoutSkill>();
  const bullets = new Map<string, LayoutBullet>();
  const words = new Map<string, string>();
  let summary: string | undefined;
  for (const layer of layers) {
    for (const r of layer?.roles ?? []) {
      const set = Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined));
      by.set(r.roleKey, { ...by.get(r.roleKey), ...set, roleKey: r.roleKey });
    }
    for (const p of layer?.projects ?? []) if (p.hidden !== undefined) projects.set(p.projectKey, { projectKey: p.projectKey, hidden: p.hidden });
    for (const k of layer?.skills ?? []) if (k.hidden !== undefined) skills.set(k.key, { key: k.key, hidden: k.hidden });
    for (const b of layer?.bullets ?? []) bullets.set(b.text, b);
    for (const w of layer?.words ?? []) words.set(w.text, w.to);
    if (layer?.summary !== undefined) summary = layer.summary;
  }
  return {
    roles: [...by.values()],
    ...(projects.size ? { projects: [...projects.values()] } : {}),
    ...(skills.size ? { skills: [...skills.values()] } : {}),
    ...(bullets.size ? { bullets: [...bullets.values()] } : {}),
    ...(words.size ? { words: [...words].map(([text, to]) => ({ text, to })) } : {}),
    ...(summary !== undefined ? { summary } : {}),
  };
}

export function shownTitle(official: string, l?: Pick<LayoutRole, "title" | "translated">) {
  const t = l?.translated?.trim();
  if (!t || !l?.title || l.title === "official" || t === official) return official;
  return l.title === "translated" ? t : `${t} (official: ${official})`;
}

// The resume as shown under a layout, plus where each fold went and which folds were refused. Experience is most
// recent first, so a role's previous role is the entry after it and its next role the entry before it. A fold goes to
// the nearest shown role on that side that isn't folded itself (never into a career break); with none there, the fold
// is refused and the entry stays as it is. A project or skill left out is dropped (a skill group left empty with it).
// A hidden bullet is never shown; a pinned one always is, even when its role folds and leaves its bullets out.
// A project linked to a role shown here sits inside that role's entry (and goes where its bullets go when it folds);
// with its role not shown, it stays under Projects. `placed`: each project inside a role (shown or left out), by the
// roleKey of the entry it's in.
export function arrange(doc: ResumeDoc, ...layers: Layer[]) {
  const merged = mergeLayout(...layers);
  const bulletState = new Map((merged.bullets ?? []).map((b) => [b.text, b.state]));
  const theirs = new Map((merged.words ?? []).map((w) => [w.text, w.to]));
  // Hidden goes by CareerBot's words; a line they reworded shows in theirs, with CareerBot's kept as `original`.
  const visible = (bullets: Bullet[]) =>
    bullets.filter((b) => bulletState.get(b.text) !== "hidden").map((b) => (theirs.has(b.text) ? { ...b, text: theirs.get(b.text)!, edited: true, original: b.text } : b));
  const skillsOut = new Set((merged.skills ?? []).filter((k) => k.hidden).map((k) => k.key));
  const skills = doc.skills
    .map((g) => {
      const keep = g.items.map((_, i) => !(g.keys?.[i] && skillsOut.has(g.keys[i])));
      return { ...g, items: g.items.filter((_, i) => keep[i]), ...(g.keys ? { keys: g.keys.filter((_, i) => keep[i]) } : {}) };
    })
    .filter((g) => g.items.length);
  const by = new Map(merged.roles.map((r) => [r.roleKey, r]));
  const out = new Set((merged.projects ?? []).filter((p) => p.hidden).map((p) => p.projectKey));
  const of = (e: Entry) => (e.roleKey ? by.get(e.roleKey) : undefined);
  const shown = doc.experience.filter((e) => !of(e)?.hidden);
  const list: Entry[] = shown.map(({ reason, ...e }) => {
    const l = of(e);
    return { ...e, title: e.break ? e.title : shownTitle(e.title, l), ...(e.break && reason && l?.showReason ? { reason } : {}), bullets: visible(e.bullets) };
  });
  const fold = shown.map((e) => of(e)?.fold);
  const folded = new Set(list.flatMap((_, i) => (fold[i] ? [i] : [])));
  const target = (i: number) => {
    const step = fold[i]!.into === "previous" ? 1 : -1;
    for (let j = i + step; j >= 0 && j < list.length; j += step) if (!folded.has(j) && !list[j].break) return j;
    return -1;
  };
  const refused = [...folded].filter((i) => target(i) < 0);
  for (const i of refused) folded.delete(i);
  const inside = new Map<string, number>();
  for (const p of doc.projects ?? []) {
    const i = p.roleKey ? list.findIndex((e) => !e.break && e.roleKey === p.roleKey) : -1;
    if (i < 0) continue;
    inside.set(p.projectKey, i);
    if (!out.has(p.projectKey)) list[i].projects = [...(list[i].projects ?? []), { ...p, bullets: visible(p.bullets) }];
  }
  const pinned = (b: Bullet) => bulletState.get(b.original ?? b.text) === "pinned";
  const folds: { roleKey: string; into: Entry }[] = [];
  for (const i of folded) {
    const f = list[i];
    const t = list[target(i)];
    const start = [t.start, f.start].filter((x): x is string => !!x).sort()[0];
    // A role still running (a start, no end) keeps the widened one running.
    const end = (t.start && !t.end) || (f.start && !f.end) ? undefined : [t.end, f.end].filter((x): x is string => !!x).sort().pop();
    delete t.start;
    delete t.end;
    Object.assign(t, start ? { start } : {}, end ? { end } : {});
    const move = fold[i]!.bullets === "move";
    t.bullets.push(...(move ? f.bullets : f.bullets.filter(pinned)));
    const projects = (f.projects ?? []).map((p) => (move ? p : { ...p, bullets: p.bullets.filter(pinned) })).filter((p) => move || p.bullets.length);
    if (projects.length) t.projects = [...(t.projects ?? []), ...projects];
    folds.push({ roleKey: f.roleKey!, into: t });
  }
  const placed: Record<string, string> = {};
  for (const [key, i] of inside) placed[key] = list[folded.has(i) ? target(i) : i].roleKey!;
  const experience = list.filter((_, i) => !folded.has(i));
  const projects = doc.projects?.filter((p) => !out.has(p.projectKey) && !inside.has(p.projectKey)).map((p) => ({ ...p, bullets: visible(p.bullets) }));
  return {
    doc: { ...doc, ...(merged.summary !== undefined ? { summary: merged.summary } : {}), experience, ...(projects ? { projects } : {}), skills },
    summaryEdited: merged.summary !== undefined,
    folds,
    refused: refused.map((i) => list[i].roleKey!),
    placed,
  };
}

export const present = (doc: ResumeDoc, ...layers: Layer[]): ResumeDoc => arrange(doc, ...layers).doc;

// Every bullet's words in a resume as written: what a pinned or hidden choice is kept by.
export const bulletTexts = (doc: ResumeDoc) => new Set([...doc.experience.flatMap((e) => e.bullets), ...(doc.projects ?? []).flatMap((p) => p.bullets)].map((b) => b.text));

// A translated title to offer for a role; never invented. On a direction resume, the direction's title map when it
// translates the title the resume uses (resumeTitle); otherwise the market title the record already has for the role.
export type TitleSuggestion = { text: string; from: "direction" | "record" };
export function suggestTitle(
  role: { title?: string | null; employer?: string | null; marketTitle?: string | null; alternateTitles?: string[] | null },
  titleMap?: { from: string; to: string }[] | null,
): TitleSuggestion | null {
  const official = resumeTitle(role)?.text;
  if (!official) return null;
  const norm = (a: string) => a.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const same = (a: string, b: string) => norm(a) === norm(b);
  // Maps often read "Title (Employer)"; the note must name this role's employer (a prefix is enough: "Kettle & Crane" for Kettle & Crane Brewing).
  const matches = (from: string) => {
    const m = from.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (!m) return same(from, official);
    const emp = norm(role.employer ?? "");
    return same(m[1], official) && (!emp || emp.startsWith(norm(m[2])) || norm(m[2]).startsWith(emp));
  };
  const mapped = titleMap?.find((m) => matches(m.from) && m.to.trim() && !same(m.to, official));
  // "A or B" offers the first; the person can edit it.
  if (mapped) return { text: mapped.to.split(/\s+or\s+/i)[0].trim(), from: "direction" };
  // Older roles kept one market title; alternate titles replaced it.
  const market = [role.marketTitle, ...(role.alternateTitles ?? [])].find((t): t is string => !!t?.trim() && !same(t, official));
  return market ? { text: market.trim(), from: "record" } : null;
}

// Stretches of three or more months between approved roles, newest first. Offered as possible career breaks, never
// assumed. A year alone counts from January as a start and to December as an end; a role with no end runs to now.
export const monthOf = (d: string | null | undefined, edge: "start" | "end") => {
  const m = d?.match(/^(\d{4})(?:-(\d{2}))?/);
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : edge === "start" ? 0 : 11) : null;
};
const yearMonth = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
export function gaps(roles: { start?: string | null; end?: string | null }[], months = 3) {
  const spans = roles
    .flatMap((r) => {
      const s = monthOf(r.start, "start");
      return s === null ? [] : [[s, r.end ? (monthOf(r.end, "end") ?? s) : Infinity] as const];
    })
    .sort((a, b) => a[0] - b[0]);
  const out: { start: string; end: string }[] = [];
  let covered = -Infinity;
  for (const [s, e] of spans) {
    if (covered > -Infinity && s - covered - 1 >= months) out.push({ start: yearMonth(covered + 1), end: yearMonth(s - 1) });
    covered = Math.max(covered, e);
  }
  return out.reverse();
}

// Years of work in their approved roles, from their dates, to one decimal: months inside at least one role, so
// overlapping roles count once. Career breaks and roles with no start don't count; a role with no end runs to `now`.
export function yearsWorked(roles: { start?: string | null; end?: string | null; break?: boolean }[], now: number) {
  const today = new Date(now);
  const current = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const spans = roles
    .flatMap((r) => {
      const s = r.break ? null : monthOf(r.start, "start");
      return s === null ? [] : [[s, Math.min(current, r.end ? (monthOf(r.end, "end") ?? s) : current)] as const];
    })
    .sort((a, b) => a[0] - b[0]);
  let months = 0;
  let covered = -Infinity;
  for (const [s, e] of spans) {
    months += Math.max(0, e - Math.max(s, covered + 1) + 1);
    covered = Math.max(covered, e);
  }
  return Math.round((months / 12) * 10) / 10;
}

export const DOC_SPEC = `Reply with JSON only, in this shape:
{"summary": "two or three sentences",
 "experience": [{"employer": "...", "title": "...", "location": "...", "start": "YYYY-MM", "end": "YYYY-MM or empty if current", "roleKey": "the record's role key", "bullets": [{"text": "one line", "factIds": ["the approved fact ids this line rests on"]}]}],
 "projects": [{"projectKey": "the record's project key", "bullets": [{"text": "one line", "factIds": ["that project's approved fact ids"]}]}],
 "skills": [{"group": "e.g. Tools", "items": ["approved skill ids"]}]}
Experience is most recent first; one entry per role (a promotion at the same employer is its own entry). Every bullet cites the approved facts it rests on.
A career break in the record (a role with "break": true) is an entry of its own, with its roleKey, placed by its dates; its bullets come only from its own approved facts, and it has none when it has none.
Projects in the record (their own repositories) go under "projects", most recent first, one entry per project, with bullets citing only that project's approved facts (a project's facts never go under a role). A project with a roleKey was part of that role and shows inside it on the resume, so its bullets and the role's read together: never tell the same work in both. Leave "projects" empty when the record has none.
A fact with "sameWork" is one piece of work the record tells twice, once in a project and once in its role: write one line for it, from that fact, citing it, with "sameWork" as context only.
Skills come only from the record's approved skills, tools and certifications ("skills" in the record, each with an id, kind, name and group): the strongest 12 to 20 for this resume, by id, strongest and most relevant first, under plain group names (Skills, Tools, Certifications, or the record's own groups when they read better); their names are printed as the record has them.
Applicant tracking systems read it before people do: use the standard wording postings use (spelled-out terms alongside acronyms once) and no symbols, emoji or decorative characters.`;

const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
// The most skills a resume lists: its strongest, the writer aims for 12 to 20.
export const SKILL_CAP = 20;
// A skill's name as a key, so a resume and gathering (skills.ts) match names alike: case, spacing and punctuation other
// than + # . don't matter ("salesforce crm" and "Salesforce  CRM").
export const skillKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\.$/, "").trim();

// A reply reduced to the resume shape. Bullets keep only approved fact ids; a bullet with none is kept and flagged.
// Roles come from the approved record: an entry's employer, title and dates are taken from its role, never from the
// reply; its title is the one resumes use (resumeTitle), so a role whose official title they never gave still shows.
// A bullet counts a fact only if it's an approved fact of that same role; one with none left is flagged.
// A career break needs no employer or bullets, and every approved break is kept: whether it shows is the person's
// choice on the resume (its layout), not the model's. Projects likewise: name, link, dates and the role it's linked
// to from the approved project, bullets counting only that project's approved facts (projectFacts: fact id to its
// project); a role with a linked project written is kept for it, bullets or not. Skills are only approved skills, tools
// and certifications (skills: item id to name), each once, printed with the record's name, and only the strongest
// SKILL_CAP (the reply lists them strongest first); one named instead of cited is matched by its name, and anything
// else is dropped.
export type ApprovedRole = { roleKey?: string; employer?: string; title?: string; alternateTitles?: string[]; start?: string | null; end?: string | null; location?: string | null; break?: boolean; reason?: string };
export type ApprovedProject = { projectKey: string; name: string; url?: string; start?: string | null; end?: string | null; roleKey?: string };
export function cleanDoc(
  raw: unknown,
  approvedFacts: Map<string, string | undefined>,
  roles: ApprovedRole[],
  projects: ApprovedProject[] = [],
  projectFacts = new Map<string, string>(),
  approvedSkills = new Map<string, string>(),
): ResumeDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const entry = (role: ApprovedRole, bullets: Entry["bullets"]): Entry | null => {
    const opt = (k: "location" | "start" | "end" | "reason", x: string | null | undefined) => (x ? { [k]: x } : {});
    if (role.break) return { employer: "", title: role.title || "Career break", roleKey: role.roleKey, ...opt("start", role.start), ...opt("end", role.end), break: true, ...opt("reason", role.reason), bullets };
    const title = resumeTitle(role)?.text;
    if (!role.employer || !title) return null;
    return { employer: role.employer, title, roleKey: role.roleKey, ...opt("location", role.location), ...opt("start", role.start), ...opt("end", role.end), bullets };
  };
  const bulletsOf = (x: Record<string, unknown>, owns: (id: string) => boolean): Bullet[] =>
    (Array.isArray(x?.bullets) ? x.bullets : [])
      .map((b: Record<string, unknown>) => {
        const text = str(typeof b === "string" ? b : b?.text);
        const factIds = (Array.isArray(b?.factIds) ? b.factIds : []).map(String).filter(owns);
        return { text, factIds, ...(factIds.length ? {} : { unsourced: true }) };
      })
      .filter((b) => b.text);
  const shownProjects = (Array.isArray(r.projects) ? r.projects : []).flatMap((x: Record<string, unknown>, i: number, all: Record<string, unknown>[]): ProjectEntry[] => {
    const p = projects.find((q) => q.projectKey === str(x?.projectKey));
    if (!p || all.findIndex((y) => str(y?.projectKey) === p.projectKey) !== i) return [];
    const bullets = bulletsOf(x, (id) => projectFacts.get(id) === p.projectKey);
    const opt = (k: "url" | "start" | "end" | "roleKey", v: string | null | undefined) => (v ? { [k]: v } : {});
    return bullets.length ? [{ projectKey: p.projectKey, name: p.name, ...opt("url", p.url), ...opt("start", p.start), ...opt("end", p.end), ...opt("roleKey", p.roleKey), bullets }] : [];
  });
  const linked = new Set(shownProjects.flatMap((p) => (p.roleKey ? [p.roleKey] : [])));
  const experience = (Array.isArray(r.experience) ? r.experience : [])
    .map((e: Record<string, unknown>) => {
      const bullets = bulletsOf(e, (id) => approvedFacts.has(id) && approvedFacts.get(id) === str(e?.roleKey));
      const role = roles.find((r) => r.roleKey && r.roleKey === str(e?.roleKey));
      return role ? entry(role, bullets) : null;
    })
    .filter((e): e is Entry => !!e && (e.bullets.length > 0 || !!e.break || linked.has(e.roleKey ?? "")));
  const byName = new Map([...approvedSkills].map(([id, name]) => [skillKey(name), id]));
  const used = new Set<string>();
  const skills = (Array.isArray(r.skills) ? r.skills : [])
    .map((g: Record<string, unknown>) => {
      const keys = (Array.isArray(g?.items) ? g.items : []).flatMap((x: unknown) => {
        const id = approvedSkills.has(str(x)) ? str(x) : byName.get(skillKey(str(x)));
        if (!id || used.has(id) || used.size >= SKILL_CAP) return [];
        used.add(id);
        return [id];
      });
      return { group: str(g?.group), items: keys.map((k) => approvedSkills.get(k)!), keys };
    })
    .filter((g) => g.group && g.items.length);
  const summary = str(r.summary);
  if (!summary && !experience.length) return null;
  // Every approved break, and every role a written project is linked to, has its entry, placed by its dates.
  for (const b of roles.filter((x) => x.roleKey && (x.break || linked.has(x.roleKey)) && !experience.some((e) => e.roleKey === x.roleKey))) {
    const e = entry(b, []);
    if (!e) continue;
    const at = experience.findIndex((x) => (x.start ?? "") < (b.start ?? ""));
    experience.splice(at < 0 ? experience.length : at, 0, e);
  }
  return { summary, experience, ...(shownProjects.length ? { projects: shownProjects } : {}), skills };
}

// The person's name and contact line from their profile, at the top of every format.
export type Contact = { name: string; email?: string; phone?: string; location?: string; links: string[] };
export const contactLine = (c: Contact) => [c.location, c.email, c.phone, ...c.links].filter(Boolean).join("  ·  ");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dateLabel = (d?: string) => {
  const m = d?.match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (d ?? "");
};
export const dates = (e: { start?: string; end?: string }) => [dateLabel(e.start), e.end ? dateLabel(e.end) : e.start ? "Present" : ""].filter(Boolean).join(" – ");
// A career break is one line: "Career break · dates", and their reason when they chose to show it.
export const breakLine = (e: Entry) => [e.title, dates(e), e.reason].filter(Boolean).join(" · ");
// A project's link as printed: without the scheme.
export const shortUrl = (url?: string) => url?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "";
// A project inside its role reads "Project: Name · link", then its bullets.
export const projectLine = (p: ProjectEntry) => [`Project: ${p.name}`, shortUrl(p.url)].filter(Boolean).join(" · ");
const projectsOf = (doc: ResumeDoc) => doc.projects ?? [];

export function toPlain(doc: ResumeDoc, contact?: Contact | null) {
  const out = [...(contact ? [contact.name, contactLine(contact), ""].filter((x, i) => x || i === 2) : []), "SUMMARY", doc.summary, "", "EXPERIENCE"];
  for (const e of doc.experience) {
    out.push("", ...(e.break ? [breakLine(e)] : [`${e.title}, ${e.employer}${e.location ? ` · ${e.location}` : ""}`, dates(e)]), ...e.bullets.map((b) => `- ${b.text}`));
    for (const p of e.projects ?? []) out.push(projectLine(p), ...p.bullets.map((b) => `- ${b.text}`));
  }
  if (projectsOf(doc).length) out.push("", "PROJECTS");
  for (const p of projectsOf(doc)) out.push("", [p.name, shortUrl(p.url)].filter(Boolean).join(" · "), dates(p), ...p.bullets.map((b) => `- ${b.text}`));
  if (doc.skills.length) out.push("", "SKILLS", ...doc.skills.map((g) => `${g.group}: ${g.items.join(", ")}`));
  return out.join("\n");
}

export function toMarkdown(doc: ResumeDoc, contact?: Contact | null) {
  const out = [...(contact ? [`# ${contact.name}`, "", ...(contactLine(contact) ? [contactLine(contact), ""] : [])] : []), "## Summary", "", doc.summary, "", "## Experience"];
  for (const e of doc.experience) {
    if (e.break) out.push("", `### ${breakLine(e)}`, ...(e.bullets.length ? ["", ...e.bullets.map((b) => `- ${b.text}`)] : []));
    else out.push("", `### ${e.title}, ${e.employer}`, `*${[dates(e), e.location].filter(Boolean).join(" · ")}*`, "", ...e.bullets.map((b) => `- ${b.text}`));
    for (const p of e.projects ?? [])
      out.push("", [`**Project: ${p.name}**`, p.url ? `[${shortUrl(p.url)}](${p.url})` : ""].filter(Boolean).join(" · "), "", ...p.bullets.map((b) => `- ${b.text}`));
  }
  if (projectsOf(doc).length) out.push("", "## Projects");
  for (const p of projectsOf(doc)) out.push("", `### ${p.name}`, `*${[dates(p), p.url ? `[${shortUrl(p.url)}](${p.url})` : ""].filter(Boolean).join(" · ")}*`, "", ...p.bullets.map((b) => `- ${b.text}`));
  if (doc.skills.length) out.push("", "## Skills", "", ...doc.skills.map((g) => `- **${g.group}:** ${g.items.join(", ")}`));
  return out.join("\n");
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// HTML and RTF follow the PDF's layout and sizes (exportFiles.ts, docxFiles.ts): name 21pt bold, contact line muted,
// section names in capitals over a rule, employer 10.5pt bold, title bold with its dates at the right, 9.75pt text.
// Pasted into Google Docs or Word, HTML can't hold a right tab stop, so its dates follow the title there.
const INK = "#15171A";
const MUTED = "#5E6164";
const S = {
  body: `font-family:Arial,Helvetica,sans-serif;font-size:9.75pt;line-height:1.45;color:${INK}`,
  name: "margin:0 0 4.5pt;font-size:21pt;font-weight:700;line-height:1.2",
  contact: `margin:0;font-size:9pt;color:${MUTED}`,
  heading: "margin:16.5pt 0 7.5pt;padding-bottom:3pt;border-bottom:0.5pt solid #8C8E90;font-size:9pt;font-weight:700;letter-spacing:0.02em",
  employer: "margin:12pt 0 1.5pt;font-size:10.5pt;font-weight:700",
  title: "margin:0 0 4.5pt;font-weight:700",
  dates: "float:right;font-weight:400",
  p: "margin:0",
  ul: "margin:0 0 0 10.5pt;padding:0",
  li: "margin:0 0 2.25pt",
  link: `font-size:9pt;color:${MUTED}`,
};
export function toHtml(doc: ResumeDoc, contact?: Contact | null) {
  const titled = (title: string, when: string, style = S.title) => `<p style="${style}">${esc(title)}${when ? `<span style="${S.dates}">&ensp;${esc(when)}</span>` : ""}</p>`;
  const ul = (bullets: Bullet[]) => (bullets.length ? [`<ul style="${S.ul}">${bullets.map((b) => `<li style="${S.li}">${esc(b.text)}</li>`).join("")}</ul>`] : []);
  const heading = (t: string) => `<h2 style="${S.heading}">${esc(t.toUpperCase())}</h2>`;
  const out = [
    `<div style="${S.body}">`,
    ...(contact ? [`<h1 style="${S.name}">${esc(contact.name)}</h1>`, ...(contactLine(contact) ? [`<p style="${S.contact}">${esc(contactLine(contact))}</p>`] : [])] : []),
    ...(doc.summary ? [heading("Summary"), `<p style="${S.p}">${esc(doc.summary)}</p>`] : []),
    heading("Experience"),
  ];
  let prev = "";
  doc.experience.forEach((e, i) => {
    const employer = !e.break && e.employer !== prev;
    if (employer) out.push(`<p style="${i === 0 ? S.employer.replace("12pt", "0") : S.employer}">${esc(e.employer)}</p>`);
    prev = e.break ? "" : e.employer;
    out.push(titled(e.break ? [e.title, e.reason].filter(Boolean).join(" · ") : e.title, dates(e), employer || i === 0 ? S.title : `margin:${e.break ? 12 : 7.5}pt 0 4.5pt;font-weight:700`), ...ul(e.bullets));
    for (const p of e.projects ?? [])
      out.push(`<p style="margin:4.5pt 0 2.25pt;font-weight:700">Project: ${esc(p.name)}${p.url ? ` · <a href="${esc(p.url)}" style="color:inherit">${esc(shortUrl(p.url))}</a>` : ""}</p>`, ...ul(p.bullets));
  });
  if (projectsOf(doc).length) out.push(heading("Projects"));
  projectsOf(doc).forEach((p, i) =>
    out.push(
      titled(p.name, dates(p), i > 0 ? `margin:12pt 0 ${p.url ? 0 : 4.5}pt;font-weight:700` : `margin:0 0 ${p.url ? 0 : 4.5}pt;font-weight:700`),
      ...(p.url ? [`<p style="margin:0 0 4.5pt"><a href="${esc(p.url)}" style="${S.link}">${esc(shortUrl(p.url))}</a></p>`] : []),
      ...ul(p.bullets),
    ),
  );
  if (doc.skills.length) out.push(heading("Skills"), ...doc.skills.map((g) => `<p style="${S.li}"><b>${esc(g.group)}:</b> ${esc(g.items.join(", "))}</p>`));
  out.push("</div>");
  return out.join("\n");
}

// RTF: plain ASCII with \uN escapes for anything else. Arial; dates on a right tab stop at the margin (7in).
const rtfEsc = (t: string) =>
  t.replace(/[\\{}]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0) > 32767 ? c.charCodeAt(0) - 65536 : c.charCodeAt(0)}?`);
export function toRtf(doc: ResumeDoc, contact?: Contact | null) {
  // Sizes in half-points; spacing in twips (the PDF's px × 15).
  const p = (t: string, o: { b?: boolean; fs?: number; cf?: number; sb?: number; sa?: number } = {}) =>
    `{\\pard\\sb${o.sb ?? 0}\\sa${o.sa ?? 0}${o.cf ? `\\cf${o.cf}` : ""}\\fs${o.fs ?? 20}${o.b ? "\\b" : ""} ${rtfEsc(t)}\\par}`;
  const titled = (t: string, when: string, sb: number, sa = 90) => `{\\pard\\sb${sb}\\sa${sa}\\tqr\\tx10080\\fs20{\\b ${rtfEsc(t)}}\\tab ${rtfEsc(when)}\\par}`;
  const bullet = (t: string) => `{\\pard\\fi-210\\li210\\sa45\\fs20 \\u8226?\\tab ${rtfEsc(t)}\\par}`;
  const heading = (t: string) => `{\\pard\\sb330\\sa150\\brdrb\\brdrs\\brdrw10\\brsp60\\brdrcf2\\fs18\\b ${rtfEsc(t.toUpperCase())}\\par}`;
  const out = ["{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red94\\green97\\blue100;\\red140\\green142\\blue144;}\\paperw12240\\paperh15840\\margl1080\\margr1080\\margt1080\\margb1080\\f0\\fs20"];
  if (contact) out.push(p(contact.name, { b: true, fs: 42, sa: 90 }), ...(contactLine(contact) ? [p(contactLine(contact), { fs: 18, cf: 1 })] : []));
  if (doc.summary) out.push(heading("Summary"), p(doc.summary));
  out.push(heading("Experience"));
  let prev = "";
  doc.experience.forEach((e, i) => {
    const employer = !e.break && e.employer !== prev;
    if (employer) out.push(p(e.employer, { b: true, fs: 21, sb: i > 0 ? 240 : 0, sa: 30 }));
    prev = e.break ? "" : e.employer;
    out.push(titled(e.break ? [e.title, e.reason].filter(Boolean).join(" · ") : e.title, dates(e), employer || i === 0 ? 0 : e.break ? 240 : 150), ...e.bullets.map((b) => bullet(b.text)));
    for (const x of e.projects ?? []) out.push(p(projectLine(x), { b: true, sb: 90, sa: 45 }), ...x.bullets.map((b) => bullet(b.text)));
  });
  if (projectsOf(doc).length) out.push(heading("Projects"));
  projectsOf(doc).forEach((x, i) => {
    out.push(titled(x.name, dates(x), i > 0 ? 240 : 0, x.url ? 0 : 90));
    if (x.url) out.push(p(shortUrl(x.url), { fs: 18, cf: 1, sa: 90 }));
    out.push(...x.bullets.map((b) => bullet(b.text)));
  });
  if (doc.skills.length) out.push(heading("Skills"), ...doc.skills.map((g) => `{\\pard\\sa45\\fs20{\\b ${rtfEsc(`${g.group}:`)}} ${rtfEsc(g.items.join(", "))}\\par}`));
  out.push("}");
  return out.join("\n");
}
