import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import { CONDITION_LABELS, CONDITIONS, LIMIT_BUCKETS, LEVELS, type LimitBucket, RULE_FIELDS, type RuleField, cap, ruleRows } from "../../../../convex/limitBuckets";

// Limits in words: the item types, what a limit's rule does to roles, where it applies, and which other limit it
// clashes with.

export type Item = FunctionReturnType<typeof api.goals.items>[number];
export type Limit = Extract<Item, { kind: "limit" }>;
export type Effects = FunctionReturnType<typeof api.goals.effects>;

export const kindName = (kind: string) => LIMIT_BUCKETS[kind as LimitBucket] ?? kind;
export const conditionsOf = (l: Pick<Limit["data"], "when">) => CONDITIONS.filter((c) => l.when?.[c]);
export const scopeWords = (appliesTo: readonly string[] | undefined) => (appliesTo?.length ? appliesTo.join(", ") : "Every direction");
export const whenWords = (l: Pick<Limit["data"], "when">) => conditionsOf(l).map((c) => CONDITION_LABELS[c]).join(", ") || "Always";
export const roles = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "role" : "roles"}`;
// Where and when a limit holds, for the line under its kind: "2 directions · when changing industry" on a row (short),
// "Supply Planning, Logistics Operations · when changing industry" under the head.
const whenLower = (d: Pick<Limit["data"], "when">) => conditionsOf(d).map((c) => CONDITION_LABELS[c].toLowerCase());
export const rowScope = (d: Pick<Limit["data"], "appliesTo" | "when">) => {
  const n = d.appliesTo?.length ?? 0;
  return [n ? `${n} ${n === 1 ? "direction" : "directions"}` : "", ...whenLower(d)].filter(Boolean).join(" · ");
};
export const headScope = (d: Pick<Limit["data"], "appliesTo" | "when">) => [scopeWords(d.appliesTo), ...whenLower(d)].join(" · ");

// What a limit does to roles, as a row's trailing words: "Hides 14", "Ranks 7 lower".
export const effectShort = (firm: boolean, fails: number) => (firm ? `Hides ${fails.toLocaleString("en-US")}` : `Ranks ${fails.toLocaleString("en-US")} lower`);
export const effectLong = (firm: boolean, fails: number) => (firm ? `Hides ${roles(fails)}` : `Ranks ${roles(fails)} lower`);
// Every limit together: "Hides 38 roles · Shows 12", counted over the newest roles when there are many.
export const allWords = (e: Pick<Effects, "total" | "hidden" | "capped">) => `Hides ${roles(e.hidden)} · Shows ${(e.total - e.hidden).toLocaleString("en-US")}${e.capped ? " of the newest" : ""}`;

const money = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
const or = (xs: string[]) => (xs.length <= 2 ? xs.join(" or ") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);

// Which roles a limit's rule catches, after "Hides 14 roles": "paying under $135,000 a year". Empty when the rule
// says nothing a phrase can carry.
export function catches(kind: string, rule: Record<string, unknown> | null | undefined): string {
  const r = rule ?? {};
  const strs = (k: string) => (Array.isArray(r[k]) ? (r[k] as string[]) : []);
  const parts: string[] = [];
  switch (kind) {
    case "pay": {
      const per = r.period === "hour" ? "an hour" : "a year";
      const currency = typeof r.currency === "string" ? r.currency : "USD";
      if (typeof r.min === "number") parts.push(`paying under ${money(r.min, currency)} ${per}`);
      if (typeof r.max === "number") parts.push(`paying over ${money(r.max, currency)} ${per}`);
      break;
    }
    case "eligibility":
      if (typeof r.clearance === "string") parts.push(r.clearance === "none" ? "that need a clearance" : `that need more than ${cap(r.clearance)} clearance`);
      if (r.sponsorshipNeeded === true) parts.push("that don’t sponsor a visa");
      if (strs("citizenship").length) parts.push("open only to other citizens");
      break;
    case "companies":
      if (strs("exclude").length) parts.push("at employers you ruled out");
      if (strs("industriesAvoid").length) parts.push(`in ${or(strs("industriesAvoid").map((i) => cap(i).toLowerCase()))}`);
      if (strs("industriesWant").length) parts.push("outside the industries you want");
      if (strs("sizes").length) parts.push("at other company sizes");
      break;
    case "seniority": {
      const include = strs("include").map((l) => LEVELS.indexOf(l as (typeof LEVELS)[number])).filter((i) => i >= 0);
      const exclude = strs("exclude");
      if (exclude.length) parts.push(`at ${or(exclude.map((l) => (l === "individual" ? "individual contributor" : cap(l).toLowerCase())))} level`);
      else if (include.length) parts.push("at other levels");
      break;
    }
    case "work":
      if (strs("avoid").length) parts.push(`with ${or(strs("avoid"))}`);
      if (strs("want").length) parts.push("without the work you want");
      break;
    case "travel":
      if (typeof r.maxPercent === "number") parts.push(`with more than ${r.maxPercent}% travel`);
      if (typeof r.minPercent === "number") parts.push(`with under ${r.minPercent}% travel`);
      break;
    case "schedule":
      if (typeof r.hoursPerWeekMax === "number") parts.push(`over ${r.hoursPerWeekMax} hours a week`);
      if (r.fullTime === true) parts.push("that aren’t full-time");
      if (r.fullTime === false) parts.push("that are full-time");
      break;
    case "location":
      if (strs("modes").length || Array.isArray(r.places)) parts.push("in other places or ways of working");
      else if (strs("countries").length) parts.push("in other countries");
      break;
  }
  return parts.join(", ");
}

// A limit's rule as labelled rows, each with the field it comes from (for editing that field).
export function ruleFieldRows(kind: string, rule: Record<string, unknown> | null | undefined): { key: string; label: string; value: string }[] {
  const fields = RULE_FIELDS[kind as LimitBucket] ?? [];
  return ruleRows(kind, rule).map((row) => ({ ...row, key: fields.find((f: RuleField) => f.label.replace(/ \(.*\)$/, "") === row.label)?.key ?? row.label }));
}

// Another approved limit a limit would clash with: the same kind and condition, over the same directions (a limit for
// some directions replaces an every-direction one there, so those don't clash).
export function clashWith(limits: readonly Limit[], draft: { id?: string; kind: string; appliesTo: readonly string[]; when: readonly string[] }) {
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  for (const l of limits) {
    if (l.id === draft.id || l.status !== "approved" || l.data.kind !== draft.kind || !same(conditionsOf(l.data), draft.when)) continue;
    const theirs = l.data.appliesTo ?? [];
    const shared = theirs.filter((d) => draft.appliesTo.includes(d));
    if ((!theirs.length && !draft.appliesTo.length) || shared.length) return { limit: l, shared };
  }
  return null;
}

// Where a limit came from: its goals version, or none when they added it.
export const versionOf = (l: Limit) => (l.sources.length ? Math.max(...l.sources.map((s) => s.version)) : null);

// Add a limit, from the list's + button, its empty state and its ⋯ menu.
export const ADD_LIMIT_WORDS = { detail: "Adds a limit of your own: its kind, your sentence and its rule. It’s approved as you save it.", note: "Free" };
