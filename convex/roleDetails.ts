// A role's details: pay, where and how it's done, level, what it asks for. Read from the job board where the board
// states them, else by the AI from the description; the board wins. Pure, so the Roles pages use it too.
// Vocabularies are the ones limits use (limitBuckets.ts), so a role's details compare with the person's limits.
import { v } from "convex/values";
import { CLEARANCES, cap, LEVELS, MODES } from "./limitBuckets";

export const SETUPS = MODES;
export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "temporary", "internship"] as const;
export const PAY_PERIODS = ["year", "month", "week", "day", "hour"] as const;
export { CLEARANCES, LEVELS };

export type Setup = (typeof SETUPS)[number];
export type Seniority = (typeof LEVELS)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type Clearance = (typeof CLEARANCES)[number];
export type PayPeriod = (typeof PAY_PERIODS)[number];
export type Pay = { min?: number; max?: number; currency: string; period: PayPeriod };

// Missing fields mean the role doesn't say. travel: the most travel it expects, in percent of time (0: none).
// clearance: the clearance it requires ("none": says none is needed). visa: whether it sponsors a visa.
export type Details = {
  pay?: Pay;
  setup?: Setup;
  locations?: string[];
  seniority?: Seniority;
  yearsAsked?: number;
  employmentType?: EmploymentType;
  travel?: number;
  clearance?: Clearance;
  visa?: boolean;
};
export const DETAIL_KEYS = ["pay", "setup", "locations", "seniority", "yearsAsked", "employmentType", "travel", "clearance", "visa"] as const;
export type Source = "board" | "ai";
export type SourcedDetails = { [K in keyof Details]?: { value: NonNullable<Details[K]>; source: Source } };

const literals = <T extends string>(list: readonly T[]) => v.union(...list.map((x) => v.literal(x)));
// Details as stored: what a board states, or what the AI read from the description.
export const detailsValidator = v.object({
  pay: v.optional(v.object({ min: v.optional(v.number()), max: v.optional(v.number()), currency: v.string(), period: literals(PAY_PERIODS) })),
  setup: v.optional(literals(SETUPS)),
  locations: v.optional(v.array(v.string())),
  seniority: v.optional(literals(LEVELS)),
  yearsAsked: v.optional(v.number()),
  employmentType: v.optional(literals(EMPLOYMENT_TYPES)),
  travel: v.optional(v.number()),
  clearance: v.optional(literals(CLEARANCES)),
  visa: v.optional(v.boolean()),
});

// What the board says, then what the AI read for the rest; each field says where it came from.
export function mergeDetails(board?: Details | null, ai?: Details | null): SourcedDetails {
  const out: Record<string, { value: unknown; source: Source }> = {};
  for (const k of DETAIL_KEYS) {
    if (board?.[k] !== undefined) out[k] = { value: board[k], source: "board" };
    else if (ai?.[k] !== undefined) out[k] = { value: ai[k], source: "ai" };
  }
  return out as SourcedDetails;
}

// Just the values of merged details.
export function valuesOf(d: SourcedDetails): Details {
  return Object.fromEntries(Object.entries(d).map(([k, x]) => [k, x.value])) as Details;
}

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() && Number.isFinite(Number(x)) ? Number(x) : undefined);
const oneOf = <T extends string>(list: readonly T[], x: unknown) => (typeof x === "string" && (list as readonly string[]).includes(x.toLowerCase()) ? (x.toLowerCase() as T) : undefined);

// A pay range as given, or undefined when it has no usable amount. A range given high to low is turned round.
export function cleanPay(x: unknown): Pay | undefined {
  if (!x || typeof x !== "object") return undefined;
  const r = x as Record<string, unknown>;
  let min = num(r.min);
  let max = num(r.max);
  if (min !== undefined && min <= 0) min = undefined;
  if (max !== undefined && max <= 0) max = undefined;
  if (min === undefined && max === undefined) return undefined;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const currency = typeof r.currency === "string" && /^[A-Za-z]{3}$/.test(r.currency.trim()) ? r.currency.trim().toUpperCase() : undefined;
  const period = oneOf(PAY_PERIODS, r.period);
  if (!currency || !period) return undefined;
  return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), currency, period };
}

// Details reduced to known fields with valid values (an AI reply or a board's own fields).
export function cleanDetails(x: unknown): Details {
  if (!x || typeof x !== "object") return {};
  const r = x as Record<string, unknown>;
  const out: Details = {};
  const pay = cleanPay(r.pay);
  if (pay) out.pay = pay;
  const setup = oneOf(SETUPS, r.setup);
  if (setup) out.setup = setup;
  if (Array.isArray(r.locations)) {
    const locations = [...new Set(r.locations.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean))];
    if (locations.length) out.locations = locations;
  }
  const seniority = oneOf(LEVELS, r.seniority);
  if (seniority) out.seniority = seniority;
  const years = num(r.yearsAsked);
  if (years !== undefined && years >= 0 && years <= 50) out.yearsAsked = years;
  const employment = oneOf(EMPLOYMENT_TYPES, r.employmentType);
  if (employment) out.employmentType = employment;
  const travel = num(r.travel);
  if (travel !== undefined && travel >= 0 && travel <= 100) out.travel = travel;
  const clearance = oneOf(CLEARANCES, r.clearance);
  if (clearance) out.clearance = clearance;
  if (typeof r.visa === "boolean") out.visa = r.visa;
  return out;
}

// ---- Pay compared across roles: yearly, in US dollars ----

const PER_YEAR: Record<PayPeriod, number> = { year: 1, month: 12, week: 52, day: 260, hour: 2080 };

// The low end of a pay range (or its top, or its only end) as yearly US dollars; undefined when it isn't in dollars.
export function yearlyUsd(pay?: Pay, end: "low" | "top" = "low"): number | undefined {
  const n = end === "top" ? (pay?.max ?? pay?.min) : (pay?.min ?? pay?.max);
  if (!pay || n === undefined || pay.currency !== "USD") return undefined;
  return Math.round(n * PER_YEAR[pay.period]);
}

// ---- Words ----

const symbolOf = (currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? `${currency} `;
  } catch {
    return `${currency} `;
  }
};
// $170k, $5.3k, $45.
const amount = (n: number, currency: string) => {
  const s = symbolOf(currency);
  if (n >= 1000) {
    const k = n / 1000;
    return `${s}${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return `${s}${Math.round(n * 100) / 100}`;
};
const PERIOD_WORDS: Record<PayPeriod, string> = { year: "a year", month: "a month", week: "a week", day: "a day", hour: "an hour" };

// "$170k–$220k", "from $150k", "up to $220k"; with its period ("a year") when `period` or when it isn't yearly.
export function payText(pay: Pay, period = false) {
  const range =
    pay.min !== undefined && pay.max !== undefined && pay.min !== pay.max
      ? `${amount(pay.min, pay.currency)}–${amount(pay.max, pay.currency)}`
      : pay.min !== undefined
        ? pay.max === pay.min
          ? amount(pay.min, pay.currency)
          : `from ${amount(pay.min, pay.currency)}`
        : `up to ${amount(pay.max!, pay.currency)}`;
  return period || pay.period !== "year" ? `${range} ${PERIOD_WORDS[pay.period]}` : range;
}

export const SETUP_LABELS: Record<Setup, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = { "full-time": "Full-time", "part-time": "Part-time", contract: "Contract", temporary: "Temporary", internship: "Internship" };
export const seniorityLabel = (s: Seniority) => (s === "individual" ? "Individual contributor" : cap(s));
export const clearanceLabel = (c: Clearance) => (c === "none" ? "None" : cap(c));
export const travelText = (t: number) => (t === 0 ? "None" : `Up to ${t}%`);
export const yearsText = (n: number) => `${n}+ years`;
export const visaText = (v: boolean) => (v ? "Sponsors" : "Doesn’t sponsor");

// Where a role is done: "Remote, US", "London, hybrid", "Austin, TX, on-site", "Remote". Several places show the first
// and how many more. `location` is the board's own location line, used when no places were read.
export function whereText(d: Details, location?: string | null) {
  const places = d.locations?.length ? d.locations : location ? [location] : [];
  const place = places.length > 1 ? `${places[0]} +${places.length - 1}` : places[0];
  if (d.setup === "remote") return place ? (/remote/i.test(place) ? place : `Remote, ${place}`) : "Remote";
  if (!place) return d.setup ? SETUP_LABELS[d.setup] : null;
  return d.setup && !new RegExp(SETUP_LABELS[d.setup].replace("-", "[- ]?"), "i").test(place) ? `${place}, ${SETUP_LABELS[d.setup].toLowerCase()}` : place;
}
