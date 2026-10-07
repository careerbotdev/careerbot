import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import { PATHS } from "../../../../convex/directionPaths";
import { cap, LEVELS } from "../../../../convex/limitBuckets";

// What the Directions screen shows about a direction, in words: its rows' lines, its path, its sizes and where it came
// from.

export type DirectionsData = FunctionReturnType<typeof api.directions.list>;
export type Direction = DirectionsData["directions"][number];
export type Fit = FunctionReturnType<typeof api.directions.fit>[number];
export type GoalsItem = FunctionReturnType<typeof api.goals.items>[number];
type Limit = Extract<GoalsItem, { kind: "limit" }>;
type Level = (typeof LEVELS)[number];
export type Part = "detail" | "criteria";
export type Path = keyof typeof PATHS;
export type ListTab = "approved" | "proposed";
export type ItemTab = "overview" | "criteria" | "titles" | "resumes" | "notes";
export type Pane = "resume" | "tailor";

export const PATH_ORDER: Path[] = ["continue", "adjacent", "stretch"];
export const pathOf = (d: Direction): Path => d.data.path ?? "adjacent";
export const pathWord = (d: Direction) => PATHS[pathOf(d)];

// The row's second line: the titles it looks for, else what it includes.
export const lineOf = (d: Direction) => (d.data.detail?.targetTitles.length ? d.data.detail.targetTitles : d.data.criteria?.titles.length ? d.data.criteria.titles : (d.data.includes ?? [])).join(" · ");

// Parts of an approved direction still to review: its positioning and its criteria, in that order.
export const proposedParts = (d: Direction): Part[] => [...(d.data.detail && d.data.detailStatus !== "approved" ? ["detail" as const] : []), ...(d.data.criteria && d.data.criteriaStatus !== "approved" ? ["criteria" as const] : [])];
export const PART_WORDS: Record<Part, string> = { detail: "Positioning", criteria: "Criteria" };

// "11–50", "201–1,000", "5,001+".
export const sizeLabel = (s: string) => s.replace(/\d+/g, (n) => Number(n).toLocaleString("en-US")).replace("-", "–");
// "Series A", "Private equity".
export const stageLabel = (s: string) => cap(s).replace(/^Series (\S)/, (_, c: string) => `Series ${c.toUpperCase()}`);
export const capAll = (xs: readonly string[]) => xs.map(cap);

export const rolesWord = (n: number) => (n ? `${n.toLocaleString("en-US")} ${n === 1 ? "role" : "roles"}` : "No roles");

// Where a direction came from: "Suggested from your record", or the goals version it was read from.
export const fromOf = (d: Direction) => {
  const version = d.sources.length ? Math.max(...d.sources.map((s) => s.version)) : null;
  return d.data.suggested || version === null ? { label: "Suggested from your record", href: null } : { label: `Goals · version ${version}`, href: `/goals?version=${version}` };
};

// The facts a direction's positioning rests on: every fact behind what carries over and what to reframe, once each.
export const positioningFacts = (d: Direction) => [...new Set([...d.carriesOver, ...d.reframe].flatMap((s) => s.facts))];

export const REJECT_PICKS = ["Not the work I want", "Pays too little", "Covered by another direction"];

// Explainers for the actions a direction offers in several places (its pane, its ⋯ menu, its list row).
export const APPROVE_WORDS = { detail: "Adds it to your directions: roles are ranked for it and its positioning can be filled in.", note: "Free · Undo with U" };
export const REJECT_WORDS = { detail: "Rejects it, with why if you like, so it isn’t proposed again.", note: "Free · Undo with U" };
export const COPY_LINK_WORDS = { detail: "Copies a link to this direction.", note: "Free" };
// Filling in proposes a direction's positioning, titles and criteria; what's approved stays, what's still proposed is
// replaced. `cost` is the estimate, when there is one.
export const fillInWords = (again: boolean, cost: string | null) =>
  again
    ? { detail: "Proposes the positioning, titles and criteria again, for the parts you haven’t approved.", note: `${cost ?? "Uses your AI budget"} · Replaces what’s still proposed` }
    : { detail: "Proposes the positioning, titles and criteria for this direction, from your approved record.", note: `${cost ?? "Uses your AI budget"} · Nothing changes until you approve it` };

// A resume version's name in a list: the direction and the day it was written.
export const versionName = (name: string, at: number) => `${name} · ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

// A tailored resume's posting: the role's title and company, else the pasted posting's first line ("Title at Company"),
// or its first two lines when the first doesn't name the role.
export function postingName(t: { posting: string; role: { title: string; company: string } | null }) {
  if (t.role) return { title: t.role.title, company: t.role.company, place: null as string | null };
  const lines = t.posting.split("\n").map((l) => l.trim()).filter(Boolean);
  const [head, place = null] = (lines[0] ?? "").split(" · ");
  const at = head.indexOf(" at ");
  if (at > 0) return { title: head.slice(0, at).trim(), company: head.slice(at + 4).trim() || null, place };
  return { title: lines.slice(0, 2).join(" · ").slice(0, 80), company: null, place };
}

// The level a title names, by its words, most specific first ("Supply Planning Lead": lead). An individual contributor
// has no title word.
const LEVEL_WORDS: [Level, RegExp][] = [
  ["founder", /\b(co-?)?founder\b/i],
  ["c-level", /\b(chief|c-level)\b/i],
  ["svp", /\b(svp|senior vice president)\b/i],
  ["vp", /\b(vp|vice president)\b/i],
  ["senior director", /\bsenior director\b/i],
  ["director", /\bdirector\b/i],
  ["senior manager", /\bsenior manager\b/i],
  ["manager", /\bmanager\b/i],
  ["lead", /\blead\b/i],
];
const levelWord = (l: string) => (l === "vp" || l === "svp" ? l.toUpperCase() : l === "c-level" ? "C-level" : l);
const and = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// The direction's titles a Seniority limit rules out: its approved limits that are on and hold for this direction,
// each with the levels it excludes (listed as excluded, or left out of what it includes) that the titles name.
export function seniorityClashes(name: string, titles: string[], items: GoalsItem[]) {
  return items
    .filter((i): i is Limit => i.kind === "limit" && i.status === "approved" && i.data.kind === "seniority" && i.data.off !== true && (!i.data.appliesTo?.length || i.data.appliesTo.includes(name)))
    .flatMap((l) => {
      const rule = l.data.rule ?? {};
      const include = Array.isArray(rule.include) ? (rule.include as string[]) : [];
      const out = new Set<string>([...(Array.isArray(rule.exclude) ? (rule.exclude as string[]) : []), ...(include.length ? LEVELS.filter((x) => !include.includes(x)) : [])]);
      const hits = titles.flatMap((t) => {
        const level = LEVEL_WORDS.find(([, words]) => words.test(t))?.[0];
        return level && out.has(level) ? [{ title: t, level }] : [];
      });
      if (!hits.length) return [];
      return [
        {
          id: l.id,
          title: `Your Seniority limit excludes ${and([...new Set(hits.map((h) => levelWord(h.level)))])} roles in ${name}`,
          line: `${and(hits.map((h) => h.title))} won’t show roles while that limit is on.`,
        },
      ];
    });
}
