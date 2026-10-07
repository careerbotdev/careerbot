// Limits: the fixed, typed shape every person's limits take, so search and other features can rely on them.
// One definition drives validation, the prompt, the cards, the edit form and the job check.
//
// Rule of the schema: a field exists only if it can be compared with a field of a job posting (JobFacts below).
// Anything else is nuance and goes in the limit's note, which ranks and explains but never filters.

export const LIMIT_BUCKETS = {
  pay: "Pay",
  location: "Location",
  travel: "Travel",
  schedule: "Schedule",
  seniority: "Seniority",
  companies: "Companies",
  work: "Work",
  eligibility: "Eligibility",
} as const;
export type LimitBucket = keyof typeof LIMIT_BUCKETS;

// ---- Vocabularies (fixed lists; the same values are used on job postings) ----

export const LEVELS = ["individual", "lead", "manager", "senior manager", "director", "senior director", "vp", "svp", "c-level", "founder"] as const;
export const MODES = ["remote", "hybrid", "onsite"] as const;
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export const PERIODS = ["year", "hour"] as const;
export const BASES = ["base", "total"] as const;
export const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1001-5000", "5001+"] as const;
export const INDUSTRIES = [
  "ai", "aerospace and defense", "robotics", "hardware and semiconductors", "energy", "industrial", "developer tools", "data infrastructure",
  "security", "fintech", "healthcare", "real estate", "proptech", "ecommerce", "media", "education", "government", "consulting", "staffing", "other",
] as const;
export const ACTIVITIES = [
  "cold calling", "outbound prospecting", "account management", "closing deals", "quota carrying", "people management", "customer support",
  "implementation", "onboarding", "solution design", "product demos", "partnerships", "process design", "internal tooling", "analytics", "writing", "on-call",
] as const;
export const CLEARANCES = ["none", "public trust", "secret", "top secret", "ts/sci"] as const;
export const CONDITIONS = ["industryChange", "functionChange"] as const;
export const CONDITION_LABELS: Record<(typeof CONDITIONS)[number], string> = {
  industryChange: "When changing industry",
  functionChange: "When changing kind of work",
};

// ---- Field definitions ----

type Base = { key: string; label: string; hint?: string };
export type RuleField =
  | (Base & { type: "number"; min?: number; max?: number })
  | (Base & { type: "bool" })
  | (Base & { type: "enum"; options: readonly string[] })
  | (Base & { type: "set"; options: readonly string[] })
  | (Base & { type: "names" })
  | (Base & { type: "countries" })
  | (Base & { type: "places" });

export const RULE_FIELDS: Record<LimitBucket, RuleField[]> = {
  pay: [
    { key: "min", label: "Minimum", type: "number", min: 0 },
    { key: "max", label: "Maximum", type: "number", min: 0 },
    { key: "currency", label: "Currency", type: "enum", options: CURRENCIES },
    { key: "period", label: "Per", type: "enum", options: PERIODS },
    { key: "basis", label: "Counts", type: "enum", options: BASES, hint: "base = salary only; total = base + bonus + commission" },
    { key: "variableOk", label: "Bonus or commission fine", type: "bool" },
  ],
  location: [
    { key: "modes", label: "Ways of working", type: "set", options: MODES },
    { key: "countries", label: "Countries", type: "countries" },
    { key: "places", label: "Near", type: "places", hint: "for hybrid or onsite" },
  ],
  travel: [
    { key: "minPercent", label: "Least travel (%)", type: "number", min: 0, max: 100 },
    { key: "maxPercent", label: "Most travel (%)", type: "number", min: 0, max: 100 },
  ],
  schedule: [
    { key: "hoursPerWeekMax", label: "Most hours a week", type: "number", min: 0, max: 168 },
    { key: "fullTime", label: "Full-time", type: "bool" },
  ],
  seniority: [
    { key: "include", label: "Levels", type: "set", options: LEVELS },
    { key: "exclude", label: "Never these levels", type: "set", options: LEVELS },
  ],
  companies: [
    { key: "exclude", label: "Never these employers", type: "names" },
    { key: "industriesWant", label: "Industries wanted", type: "set", options: INDUSTRIES },
    { key: "industriesAvoid", label: "Industries avoided", type: "set", options: INDUSTRIES },
    { key: "sizes", label: "Company sizes (people)", type: "set", options: SIZES },
  ],
  work: [
    { key: "want", label: "Wanted", type: "set", options: ACTIVITIES },
    { key: "avoid", label: "Avoided", type: "set", options: ACTIVITIES },
  ],
  eligibility: [
    { key: "citizenship", label: "Citizenship", type: "countries" },
    { key: "clearance", label: "Security clearance you hold", type: "enum", options: CLEARANCES },
    { key: "sponsorshipNeeded", label: "You need visa sponsorship", type: "bool" },
  ],
};

// ---- Validation ----

type Place = { place: string; lat?: number; lng?: number; miles?: number };
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const clean = (x: unknown) => (typeof x === "string" ? x.trim() : "");

// Countries are stored as ISO 3166 two-letter codes; English names and common short forms are accepted.
const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
// Codes the names know that aren't current countries' (UK, FX, SU, EU, UN...): without skipping them, "United Kingdom"
// would be UK rather than GB, "France" FX, "Russia" SU.
const NOT_COUNTRY_CODES = new Set(["AN", "BU", "CS", "DD", "EU", "EZ", "FX", "QO", "SU", "TP", "UK", "UN", "XA", "XB", "YU", "ZR", "ZZ"]);
const COUNTRY_CODES: Record<string, string> = (() => {
  const out: Record<string, string> = { usa: "US", "united states of america": "US", america: "US", uk: "GB", "great britain": "GB", england: "GB" };
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = COUNTRY_NAMES.of(code);
      if (name && name !== code && !NOT_COUNTRY_CODES.has(code)) out[name.toLowerCase()] = code;
    }
  return out;
})();
export const countryCode = (x: string): string | undefined => {
  const t = x.trim();
  if (/^[A-Za-z]{2}$/.test(t) && !NOT_COUNTRY_CODES.has(t.toUpperCase()) && COUNTRY_NAMES.of(t.toUpperCase()) !== t.toUpperCase()) return t.toUpperCase();
  return COUNTRY_CODES[t.toLowerCase().replace(/^the /, "")];
};
export const countryName = (code: string) => COUNTRY_NAMES.of(code) ?? code;
// Every country's English name and code, for spotting countries in free text such as a job's location.
export const countryNameList = (): [string, string][] => Object.entries(COUNTRY_CODES);

function cleanField(f: RuleField, x: unknown): unknown {
  switch (f.type) {
    case "countries": {
      if (!Array.isArray(x)) return undefined;
      const out = [...new Set(x.map((c) => (typeof c === "string" ? countryCode(c) : undefined)).filter((c): c is string => !!c))];
      return out.length ? out : undefined;
    }
    case "number":
      return isNum(x) && x >= (f.min ?? -Infinity) && x <= (f.max ?? Infinity) ? x : undefined;
    case "bool":
      return typeof x === "boolean" ? x : undefined;
    case "enum":
      return typeof x === "string" && f.options.includes(x) ? x : undefined;
    case "set": {
      if (!Array.isArray(x)) return undefined;
      const out = [...new Set(x.filter((i): i is string => typeof i === "string" && f.options.includes(i)))];
      return out.length ? out : undefined;
    }
    case "names": {
      if (!Array.isArray(x)) return undefined;
      const out = [...new Set(x.map(clean).filter(Boolean))];
      return out.length ? out : undefined;
    }
    case "places": {
      if (!Array.isArray(x)) return undefined;
      const out: Place[] = [];
      for (const p of x) {
        if (!p || typeof p !== "object") continue;
        const r = p as Record<string, unknown>;
        const place = clean(r.place);
        if (!place) continue;
        const lat = isNum(r.lat) && Math.abs(r.lat) <= 90 ? r.lat : undefined;
        const lng = isNum(r.lng) && Math.abs(r.lng) <= 180 ? r.lng : undefined;
        const miles = isNum(r.miles) && r.miles > 0 ? r.miles : undefined;
        out.push({ place, ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}), ...(miles ? { miles } : {}) });
      }
      return out.length ? out : undefined;
    }
  }
}

// A rule reduced to the fields its bucket defines, with valid values. null if nothing usable is left.
export function cleanRule(kind: string, rule: unknown): Record<string, unknown> | null {
  const fields = RULE_FIELDS[kind as LimitBucket];
  if (!fields || !rule || typeof rule !== "object" || Array.isArray(rule)) return null;
  let r = rule as Record<string, unknown>;
  // Tolerate the rule wrapped in its bucket name ({"pay": {...}}), a common misreading of the spec.
  const keys = Object.keys(r);
  if (keys.length === 1 && keys[0] === kind && r[kind] && typeof r[kind] === "object") r = r[kind] as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = cleanField(f, r[f.key]);
    if (v !== undefined) out[f.key] = v;
  }
  // A zero minimum says nothing; ranges that contradict themselves are dropped rather than guessed at.
  for (const k of ["minPercent"]) if (out[k] === 0) delete out[k];
  for (const [lo, hi] of [["min", "max"], ["minPercent", "maxPercent"]])
    if (isNum(out[lo]) && isNum(out[hi]) && (out[lo] as number) > (out[hi] as number)) delete out[hi];
  if (Array.isArray(out.include) && Array.isArray(out.exclude)) out.exclude = (out.exclude as string[]).filter((l) => !(out.include as string[]).includes(l));
  return Object.keys(out).length ? out : null;
}

// Fields of a hand-entered rule that aren't valid as given, by label. Empty when the rule is fine.
export function invalidFields(kind: string, rule: unknown): string[] {
  const fields = RULE_FIELDS[kind as LimitBucket];
  if (!fields) return ["the kind of limit"];
  if (rule === null || rule === undefined) return [];
  if (typeof rule !== "object" || Array.isArray(rule)) return ["the filters"];
  const r = rule as Record<string, unknown>;
  const known = new Set(fields.map((f) => f.key));
  const bad = Object.keys(r).filter((k) => !known.has(k) && r[k] !== undefined);
  for (const f of fields) {
    const x = r[f.key];
    if (x === undefined || x === null || (Array.isArray(x) && x.length === 0)) continue;
    if (!sameRule(cleanField(f, x), x)) bad.push(f.label);
  }
  for (const [lo, hi] of [["min", "max"], ["minPercent", "maxPercent"]])
    if (isNum(r[lo]) && isNum(r[hi]) && r[lo] > r[hi]) bad.push(fields.find((f) => f.key === hi)!.label);
  if (Array.isArray(r.include) && Array.isArray(r.exclude) && (r.exclude as string[]).some((l) => (r.include as string[]).includes(l))) bad.push("levels both allowed and ruled out");
  return [...new Set(bad)];
}

export function cleanWhen(when: unknown): Partial<Record<(typeof CONDITIONS)[number], true>> | null {
  if (!when || typeof when !== "object") return null;
  const out = Object.fromEntries(CONDITIONS.filter((c) => (when as Record<string, unknown>)[c] === true).map((c) => [c, true as const]));
  return Object.keys(out).length ? out : null;
}

// ---- Labels and identity ----

export const limitLabel = (kind: string, appliesTo?: string[], when?: Record<string, unknown> | null) =>
  (LIMIT_BUCKETS[kind as LimitBucket] ?? kind) +
  (appliesTo?.length ? ` (${appliesTo.join(", ")})` : "") +
  (when ? ` · ${CONDITIONS.filter((c) => when[c]).map((c) => CONDITION_LABELS[c].toLowerCase()).join(", ")}` : "");

// ---- Prompt text, generated from the same definitions so the model and validation can't drift ----

function fieldSpec(f: RuleField) {
  switch (f.type) {
    case "number":
      return `"${f.key}": number`;
    case "bool":
      return `"${f.key}": true|false`;
    case "enum":
      return `"${f.key}": one of ${f.options.map((o) => `"${o}"`).join("|")}`;
    case "set":
      return `"${f.key}": list from [${f.options.map((o) => `"${o}"`).join(", ")}]`;
    case "names":
      return `"${f.key}": list of strings`;
    case "countries":
      return `"${f.key}": list of ISO 3166 two-letter codes, e.g. ["US"]`;
    case "places":
      return `"${f.key}": [{"place": "City, ST", "lat": number, "lng": number, "miles": number}]`;
  }
}
export const RULE_SPEC = (Object.keys(RULE_FIELDS) as LimitBucket[])
  .map((k) => `- ${k}: {${RULE_FIELDS[k].map(fieldSpec).join(", ")}}`)
  .join("\n");

// ---- Display ----

const money = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
const SHOUT: Record<string, string> = { vp: "VP", svp: "SVP", "c-level": "C-level", individual: "Individual contributor", ai: "AI", "public trust": "Public Trust", "top secret": "Top Secret", "ts/sci": "TS/SCI", ecommerce: "E-commerce" };
export const cap = (s: string) => SHOUT[s] ?? s[0].toUpperCase() + s.slice(1);

export function ruleRows(kind: string, rule: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  const fields = RULE_FIELDS[kind as LimitBucket] ?? [];
  const r = rule ?? {};
  return fields.flatMap((f) => {
    const x = r[f.key];
    if (x === undefined || x === null) return [];
    let value: string;
    if (kind === "pay" && (f.key === "min" || f.key === "max")) value = `${money(x as number, (r.currency as string) ?? "USD")} per ${(r.period as string) ?? "year"}`;
    else if (f.type === "bool") value = x ? "Yes" : "No";
    else if (f.type === "countries") value = (x as string[]).map(countryName).join(", ");
    else if (f.type === "places") value = (x as Place[]).map((p) => (p.miles ? `${p.place} (within ${p.miles} mi)` : p.place)).join(", ");
    else if (Array.isArray(x)) value = x.map((i) => cap(String(i))).join(", ");
    else if (f.type === "number" && f.key.toLowerCase().includes("percent")) value = `${x}%`;
    else value = cap(String(x));
    if (kind === "pay" && (f.key === "currency" || f.key === "period")) return [];
    return [{ label: f.label.replace(/ \(.*\)$/, ""), value }];
  });
}

// ---- Checking a job ----

// What a job posting tells us, in the same vocabularies. Missing fields mean "not stated".
export type JobFacts = {
  employer?: string;
  pay?: { min?: number; max?: number; currency?: string; period?: string; basis?: string; variable?: boolean };
  modes?: string[];
  country?: string;
  places?: { place: string; lat?: number; lng?: number }[];
  travelPercent?: number;
  hoursPerWeek?: number;
  fullTime?: boolean;
  level?: string;
  // The candidate's direction this job falls under (a direction name), and whether it's a change of industry or kind of work for them.
  direction?: string;
  industry?: string;
  size?: string;
  activities?: string[];
  citizenshipRequired?: string[];
  clearanceRequired?: string;
  sponsors?: boolean;
  industryChange?: boolean;
  functionChange?: boolean;
};
export type Verdict = "pass" | "fail" | "unknown";
export type LimitLike = { kind: string; firm?: boolean; appliesTo?: string[]; when?: Record<string, unknown> | null; rule?: Record<string, unknown> | null };

const HOURS_PER_YEAR = 2080;
const CLEAR_RANK = Object.fromEntries(CLEARANCES.map((c, i) => [c, i]));
const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180, R = 3958.8;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const all = (vs: Verdict[]): Verdict => (vs.includes("fail") ? "fail" : vs.includes("unknown") ? "unknown" : "pass");

// One limit against one job: pass, fail, or unknown when the job doesn't say.
export function checkLimit(limit: LimitLike, job: JobFacts): Verdict {
  const r = limit.rule ?? {};
  const v: Verdict[] = [];
  const has = (k: string) => r[k] !== undefined;
  switch (limit.kind) {
    case "pay": {
      if (!has("min") && !has("max")) break;
      const p = job.pay;
      const top = p?.max ?? p?.min;
      if (!p || top === undefined) return "unknown";
      if (p.currency && r.currency && p.currency !== r.currency) return "unknown";
      if (r.basis === "base" && p.basis === "total") return "unknown";
      const toYear = (n: number, period?: string) => (period === "hour" ? n * HOURS_PER_YEAR : n);
      const want = (n: number) => toYear(n, r.period as string);
      if (has("min")) v.push(toYear(top, p.period) >= want(r.min as number) ? "pass" : "fail");
      if (has("max") && p.min !== undefined) v.push(toYear(p.min, p.period) <= want(r.max as number) ? "pass" : "fail");
      if (r.variableOk === false) v.push(p.variable === undefined ? "unknown" : p.variable ? "fail" : "pass");
      break;
    }
    case "location": {
      if (has("modes")) v.push(!job.modes?.length ? "unknown" : job.modes.some((m) => (r.modes as string[]).includes(m)) ? "pass" : "fail");
      if (has("countries")) v.push(!job.country ? "unknown" : (r.countries as string[]).includes(job.country) ? "pass" : "fail");
      // Distance matters unless the job can be done remotely and remote works for them.
      const remoteOk = !!job.modes?.includes("remote") && (!has("modes") || (r.modes as string[]).includes("remote"));
      if (has("places") && job.modes?.length && !remoteOk) {
        const near = (r.places as Place[]).filter((p) => p.miles && p.lat !== undefined);
        const jp = (job.places ?? []).filter((p) => p.lat !== undefined);
        if (near.length && jp.length)
          v.push(near.some((n) => jp.some((j) => miles(n as { lat: number; lng: number }, j as { lat: number; lng: number }) <= n.miles!)) ? "pass" : "fail");
        else v.push("unknown");
      }
      break;
    }
    case "travel":
      if (!has("minPercent") && !has("maxPercent")) break;
      if (job.travelPercent === undefined) return "unknown";
      if (has("minPercent")) v.push(job.travelPercent >= (r.minPercent as number) ? "pass" : "fail");
      if (has("maxPercent")) v.push(job.travelPercent <= (r.maxPercent as number) ? "pass" : "fail");
      break;
    case "schedule":
      if (has("hoursPerWeekMax")) v.push(job.hoursPerWeek === undefined ? "unknown" : job.hoursPerWeek <= (r.hoursPerWeekMax as number) ? "pass" : "fail");
      if (has("fullTime")) v.push(job.fullTime === undefined ? "unknown" : job.fullTime === r.fullTime ? "pass" : "fail");
      break;
    case "seniority":
      if (!has("include") && !has("exclude")) break;
      if (!job.level) return "unknown";
      if (has("include")) v.push((r.include as string[]).includes(job.level) ? "pass" : "fail");
      if (has("exclude")) v.push((r.exclude as string[]).includes(job.level) ? "fail" : "pass");
      break;
    case "companies":
      if (has("exclude")) v.push(!job.employer ? "unknown" : (r.exclude as string[]).some((e) => e.toLowerCase() === job.employer!.toLowerCase()) ? "fail" : "pass");
      if (has("industriesWant")) v.push(!job.industry ? "unknown" : (r.industriesWant as string[]).includes(job.industry) ? "pass" : "fail");
      if (has("industriesAvoid")) v.push(!job.industry ? "unknown" : (r.industriesAvoid as string[]).includes(job.industry) ? "fail" : "pass");
      if (has("sizes")) v.push(!job.size ? "unknown" : (r.sizes as string[]).includes(job.size) ? "pass" : "fail");
      break;
    case "work":
      if (has("avoid")) v.push(!job.activities ? "unknown" : job.activities.some((a) => (r.avoid as string[]).includes(a)) ? "fail" : "pass");
      if (has("want")) v.push(!job.activities ? "unknown" : job.activities.some((a) => (r.want as string[]).includes(a)) ? "pass" : "fail");
      break;
    case "eligibility":
      if (job.citizenshipRequired?.length) v.push(!has("citizenship") ? "unknown" : job.citizenshipRequired.some((c) => (r.citizenship as string[]).includes(c)) ? "pass" : "fail");
      if (job.clearanceRequired && job.clearanceRequired !== "none") v.push(!has("clearance") ? "unknown" : CLEAR_RANK[r.clearance as string] >= CLEAR_RANK[job.clearanceRequired] ? "pass" : "fail");
      if (r.sponsorshipNeeded === true) v.push(job.sponsors === undefined ? "unknown" : job.sponsors ? "pass" : "fail");
      break;
  }
  return all(v);
}

// A condition holds if any of its parts does ("changing industry or kind of work").
const holds = (l: LimitLike, job: JobFacts) => CONDITIONS.some((c) => l.when?.[c] && job[c] === true);
const RANK: Record<Verdict, number> = { fail: 0, unknown: 1, pass: 2 };

// Which limits hold for this job. A limit applies if it's for every direction or for the job's direction, and a
// conditional one only while its condition holds. An unconditional direction limit replaces the every-direction
// limit of that bucket; a conditional one never replaces anything.
export function limitsFor<L extends LimitLike>(limits: L[], job: JobFacts): L[] {
  const scoped = limits.filter((l) => (!l.appliesTo?.length || (job.direction !== undefined && l.appliesTo.includes(job.direction))) && (!l.when || holds(l, job)));
  const specific = new Set(scoped.filter((l) => l.appliesTo?.length && !l.when).map((l) => l.kind));
  return scoped.filter((l) => l.when || l.appliesTo?.length || !specific.has(l.kind));
}

// A conditional limit is an exception that loosens: while it holds, the general limit of that bucket passes if either it
// or the exception passes. An every-direction exception doesn't loosen a direction's own limit (the specific one wins).
// An exception with no limit of its bucket to loosen is checked on its own.
// Firm limits filter (a job is dropped only on a firm fail); preferences and unknowns are for ranking.
export function judgeJob<L extends LimitLike>(limits: L[], job: JobFacts) {
  const active = limitsFor(limits, job);
  const general = active.filter((l) => !l.when);
  const exceptions = active.filter((l) => l.when);
  const results = general.map((limit) => {
    let verdict = checkLimit(limit, job);
    // A more specific limit wins: an every-direction exception never loosens a direction's own bar.
    for (const e of exceptions.filter((x) => x.kind === limit.kind && (x.appliesTo?.length || !limit.appliesTo?.length))) {
      const ev = checkLimit(e, job);
      if (RANK[ev] > RANK[verdict]) verdict = ev;
    }
    return { limit, verdict };
  });
  for (const e of exceptions) if (!general.some((g) => g.kind === e.kind)) results.push({ limit: e, verdict: checkLimit(e, job) });
  return { keep: !results.some((r) => r.limit.firm !== false && r.verdict === "fail"), results };
}

// Limits a role is checked against from what it states once it's judged, on the Roles page, so a new or changed one
// applies to roles already judged without judging them again: eligibility and the firm limits in firmProblems here,
// location in places.ts. Not checked here, since a role's details don't state them: industries and company sizes,
// work wanted or avoided, most hours a week, citizenship, bonus or commission; judging weighs those.
export const ROLE_CHECKED: readonly string[] = ["eligibility", "location", "pay", "seniority", "travel", "schedule", "companies"];
// Clearance and visa problems are PROBLEM_LABELS; the others say why in their words, since that depends on the role and the limit.
export type Problem = { what: "clearance" | "visa"; firm: boolean } | { what: "location" | "pay" | "seniority" | "travel" | "schedule" | "employer"; firm: boolean; text: string };
// What a role states that their eligibility limits rule out: a clearance above the one they hold, or no visa
// sponsorship when they need it. firm: a firm limit rules it out (else a preference does). A role that doesn't say is
// never against them.
export function eligibilityProblems<L extends LimitLike>(limits: L[], job: Pick<JobFacts, "direction" | "clearanceRequired" | "sponsors">): Problem[] {
  const eligibility = limits.filter((l) => l.kind === "eligibility");
  const checks: [keyof typeof PROBLEM_LABELS, JobFacts][] = [
    ["clearance", { direction: job.direction, clearanceRequired: job.clearanceRequired }],
    ["visa", { direction: job.direction, sponsors: job.sponsors }],
  ];
  return checks.flatMap(([what, facts]) => {
    const failed = judgeJob(eligibility, facts).results.filter((r) => r.verdict === "fail");
    return failed.length ? [{ what, firm: failed.some((r) => r.limit.firm !== false) }] : [];
  });
}
export const PROBLEM_LABELS: Record<"clearance" | "visa", string> = { clearance: "Needs a clearance you don’t hold", visa: "Doesn’t sponsor a visa" };

// What a role states, for its firm limits: payTop is its stated most pay as yearly US dollars (none when the posting
// gives only a starting figure); payBasis, whether that
// pay is base or total compensation, when the posting says (a plain posted range doesn't).
export type RoleFacts = { direction?: string; employer?: string; payTop?: number; payBasis?: "base" | "total"; level?: string; travel?: number; employmentType?: string };
const FULL_TIME: Record<string, boolean> = { "full-time": true, "part-time": false };
// What a role states that their firm pay, seniority, travel, schedule and employer limits rule out, with which limit.
// Preferences rule nothing out here (judging weighs them), nor does a conditional limit, since a role doesn't say
// whether it's a change of industry or kind of work. A role that doesn't say is never against them.
export function firmProblems<L extends LimitLike>(limits: L[], job: RoleFacts): Problem[] {
  const held = limitsFor(limits, { direction: job.direction }).filter((l) => l.firm === true && !l.when);
  const out: Problem[] = [];
  const fails = (l: LimitLike, facts: JobFacts) => checkLimit(l, facts) === "fail";
  for (const l of held) {
    const r = l.rule ?? {};
    // A floor that doesn't say counts as base pay. A base-pay floor is sound against any posted pay (total pay below it
    // means base is too); a total-comp floor only against pay stated as total compensation.
    const comparable = r.basis !== "total" || job.payBasis === "total";
    if (l.kind === "pay" && comparable && job.payTop !== undefined && r.min !== undefined && fails({ ...l, rule: { min: r.min, currency: r.currency, period: r.period, basis: r.basis } }, { pay: { max: job.payTop, currency: "USD", period: "year" } }))
      out.push({ what: "pay", firm: true, text: `Pays at most ${money(job.payTop)} a year, below your ${money(r.min as number, (r.currency as string) ?? "USD")}${r.period === "hour" ? " an hour" : ""} floor` });
    if (l.kind === "seniority" && job.level && fails(l, { level: job.level })) out.push({ what: "seniority", firm: true, text: `${cap(job.level)} level, outside the levels you set` });
    if (l.kind === "travel" && job.travel !== undefined && fails(l, { travelPercent: job.travel }))
      out.push({ what: "travel", firm: true, text: r.maxPercent !== undefined && job.travel > (r.maxPercent as number) ? `Up to ${job.travel}% travel, more than your ${r.maxPercent}%` : `Up to ${job.travel}% travel, less than your ${r.minPercent}%` });
    if (l.kind === "schedule" && r.fullTime !== undefined && job.employmentType && fails({ ...l, rule: { fullTime: r.fullTime } }, { fullTime: FULL_TIME[job.employmentType] }))
      out.push({ what: "schedule", firm: true, text: r.fullTime ? "Part-time; you set full-time" : "Full-time; you set part-time" });
    if (l.kind === "companies" && job.employer && fails({ ...l, rule: { exclude: r.exclude } }, { employer: job.employer })) out.push({ what: "employer", firm: true, text: "An employer you ruled out" });
  }
  return out;
}
// What a problem says to them.
export const problemText = (p: Problem) => ("text" in p ? p.text : PROBLEM_LABELS[p.what]);

// Two rules are the same if they hold the same values, whatever the key order.
export function sameRule(a: unknown, b: unknown): boolean {
  const canon = (x: unknown): unknown =>
    Array.isArray(x) ? (x.length ? x.map(canon) : undefined)
    : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])]).filter(([, v]) => v !== undefined && v !== null))
    : x;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
