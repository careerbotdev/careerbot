import { cap, LEVELS } from "../../../convex/limitBuckets";

// A limit's rule in a few words, for a list row or a line under a heading ("At least $135,000 a year, base",
// "Manager or above", "8 industries · 6 employers excluded"). Falls back to their own wording when the rule is empty.

type Place = { place: string; miles?: number };
const money = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" or ") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);
const counted = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function limitSummary(kind: string, rule: Record<string, unknown> | null | undefined, value: string): string {
  const r = rule ?? {};
  const strs = (k: string) => (Array.isArray(r[k]) ? (r[k] as string[]) : []);
  const parts: string[] = [];
  switch (kind) {
    case "pay": {
      const per = r.period === "hour" ? "an hour" : "a year";
      const currency = typeof r.currency === "string" ? r.currency : "USD";
      if (typeof r.min === "number") parts.push(`At least ${money(r.min, currency)} ${per}${r.basis === "total" ? ", total" : r.basis === "base" ? ", base" : ""}`);
      if (typeof r.max === "number") parts.push(`up to ${money(r.max, currency)} ${per}`);
      break;
    }
    case "eligibility": {
      // Codes read shorter than names here ("US citizen").
      const citizen = strs("citizenship");
      if (citizen.length) parts.push(`${citizen.join(", ")} citizen`);
      if (typeof r.clearance === "string") parts.push(r.clearance === "none" ? "no clearance" : `${cap(r.clearance)} clearance`);
      if (typeof r.sponsorshipNeeded === "boolean") parts.push(r.sponsorshipNeeded ? "needs sponsorship" : "no sponsorship");
      break;
    }
    case "companies": {
      const want = strs("industriesWant").length;
      const avoid = strs("industriesAvoid");
      const exclude = strs("exclude").length;
      if (want) parts.push(counted(want, "industry", "industries"));
      if (avoid.length) parts.push(avoid.length <= 2 ? `no ${avoid.map((a) => cap(a).toLowerCase()).join(" or ")}` : `avoid ${avoid.length}`);
      if (exclude) parts.push(`${counted(exclude, "employer")} excluded`);
      if (strs("sizes").length) parts.push(counted(strs("sizes").length, "size"));
      break;
    }
    case "seniority": {
      const include = strs("include");
      const at = include.map((l) => LEVELS.indexOf(l as (typeof LEVELS)[number])).filter((i) => i >= 0).sort((a, b) => a - b);
      // A run from one level to the top of the scale (founder aside) reads as "or above".
      const top = LEVELS.indexOf("c-level");
      const toTop = at.length > 1 && at.at(-1)! >= top && at.every((x, i) => i === 0 || x === at[i - 1] + 1);
      const name = (l: string) => (l === "individual" ? "Individual contributor" : cap(l));
      if (toTop) parts.push(`${name(LEVELS[at[0]])} or above`);
      else if (include.length) parts.push(list(include.map(name)));
      // Levels ruled out below an "or above" run go without saying.
      const exclude = strs("exclude").filter((l) => !toTop || LEVELS.indexOf(l as (typeof LEVELS)[number]) > at[0]);
      if (exclude.length) parts.push(`not ${list(exclude.map((l) => name(l).toLowerCase()))}`);
      break;
    }
    case "work": {
      const want = strs("want");
      const avoid = strs("avoid");
      if (want.length) parts.push(want.length <= 2 ? `Want ${want.join(", ")}` : `Want ${want.length} kinds of work`);
      if (avoid.length) parts.push(avoid.length <= 2 ? `no ${avoid.join(" or ")}` : `avoid ${avoid.length}`);
      break;
    }
    case "travel":
      if (typeof r.maxPercent === "number") parts.push(r.maxPercent === 0 ? "No travel" : `Up to ${r.maxPercent}%`);
      if (typeof r.minPercent === "number") parts.push(`at least ${r.minPercent}%`);
      break;
    case "schedule":
      if (typeof r.hoursPerWeekMax === "number") parts.push(`Up to ${r.hoursPerWeekMax} hours a week`);
      if (typeof r.fullTime === "boolean") parts.push(r.fullTime ? "full-time" : "not full-time");
      break;
    case "location": {
      const modes = strs("modes").map((m) => cap(m).toLowerCase());
      const places = (Array.isArray(r.places) ? (r.places as Place[]) : []).map((p) => (p.miles ? `${p.place} (${p.miles} mi)` : p.place));
      const words = [modes.length ? list(modes) : "", places.length ? `near ${places.join(", ")}` : ""].filter(Boolean).join(" ");
      if (words) parts.push(words[0].toUpperCase() + words.slice(1));
      const countries = strs("countries");
      if (countries.length) parts.push(countries.join(", "));
      break;
    }
  }
  if (!parts.length) return value;
  const line = parts.join(" · ");
  return line[0].toUpperCase() + line.slice(1);
}
