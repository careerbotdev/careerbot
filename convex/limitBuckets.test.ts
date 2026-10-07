import { expect, test } from "vitest";
import { checkLimit, eligibilityProblems, firmProblems, judgeJob, type LimitLike, problemText } from "./limitBuckets";

const L = (kind: string, rule: Record<string, unknown>, extra: Partial<LimitLike> = {}): LimitLike => ({ kind, rule, firm: true, ...extra });

test("pay: a job's range must reach the floor, per year, converting hourly; no pay stated is unknown", () => {
  const pay = L("pay", { min: 180000, currency: "USD", period: "year" });
  expect(checkLimit(pay, { pay: { min: 150000, max: 190000, currency: "USD", period: "year" } })).toBe("pass");
  expect(checkLimit(pay, { pay: { min: 120000, max: 160000, currency: "USD" } })).toBe("fail");
  expect(checkLimit(pay, { pay: { max: 90, period: "hour", currency: "USD" } })).toBe("pass");
  expect(checkLimit(pay, { pay: { max: 200000, currency: "EUR" } })).toBe("unknown");
  expect(checkLimit(pay, {})).toBe("unknown");
});

test("seniority: include and exclude are sets on the fixed scale", () => {
  const s = L("seniority", { include: ["director", "senior director", "vp"], exclude: ["c-level"] });
  expect(checkLimit(s, { level: "director" })).toBe("pass");
  expect(checkLimit(s, { level: "manager" })).toBe("fail");
  expect(checkLimit(L("seniority", { exclude: ["individual"] }), { level: "c-level" })).toBe("pass");
  expect(checkLimit(s, {})).toBe("unknown");
});

test("location and travel: modes, countries, distance for non-remote work, and a travel range", () => {
  const loc = L("location", { modes: ["remote", "hybrid"], countries: ["US"], places: [{ place: "Austin, TX", lat: 30.27, lng: -97.74, miles: 30 }] });
  expect(checkLimit(loc, { modes: ["remote"], country: "US" })).toBe("pass");
  expect(checkLimit(loc, { modes: ["hybrid"], country: "US", places: [{ place: "Round Rock, TX", lat: 30.51, lng: -97.68 }] })).toBe("pass");
  expect(checkLimit(loc, { modes: ["hybrid"], country: "US", places: [{ place: "Dallas, TX", lat: 32.78, lng: -96.8 }] })).toBe("fail");
  expect(checkLimit(loc, { modes: ["onsite"], country: "US" })).toBe("fail");
  const travel = L("travel", { minPercent: 10, maxPercent: 50 });
  expect(checkLimit(travel, { travelPercent: 25 })).toBe("pass");
  expect(checkLimit(travel, { travelPercent: 0 })).toBe("fail");
});

test("companies, work and eligibility use the shared lists", () => {
  expect(checkLimit(L("companies", { exclude: ["Parcelpoint.io"] }), { employer: "parcelpoint.io" })).toBe("fail");
  expect(checkLimit(L("companies", { industriesAvoid: ["staffing"] }), { industry: "ai" })).toBe("pass");
  expect(checkLimit(L("work", { avoid: ["cold calling"] }), { activities: ["closing deals", "cold calling"] })).toBe("fail");
  expect(checkLimit(L("eligibility", { citizenship: ["US"], sponsorshipNeeded: false }), { citizenshipRequired: ["US"], clearanceRequired: "secret" })).toBe("unknown");
  expect(checkLimit(L("eligibility", { citizenship: ["US"], clearance: "top secret" }), { citizenshipRequired: ["US"], clearanceRequired: "secret" })).toBe("pass");
});

test("eligibility problems: a clearance above the one held, or no sponsorship when it's needed; firm or preference; a role that doesn't say is never one", () => {
  const held = L("eligibility", { clearance: "secret", sponsorshipNeeded: true });
  expect(eligibilityProblems([held], { clearanceRequired: "top secret", sponsors: false })).toEqual([{ what: "clearance", firm: true }, { what: "visa", firm: true }]);
  expect(eligibilityProblems([held], { clearanceRequired: "secret", sponsors: true })).toEqual([]);
  expect(eligibilityProblems([held], { clearanceRequired: "none" })).toEqual([]);
  expect(eligibilityProblems([held], {})).toEqual([]);
  expect(eligibilityProblems([{ ...held, firm: false }], { clearanceRequired: "ts/sci" })).toEqual([{ what: "clearance", firm: false }]);
  // No clearance held rules out even Public Trust; not needing sponsorship never rules anything out.
  expect(eligibilityProblems([L("eligibility", { clearance: "none", sponsorshipNeeded: false })], { clearanceRequired: "public trust", sponsors: false })).toEqual([{ what: "clearance", firm: true }]);
  // A limit for one direction holds only there; other kinds of limit are not these problems.
  const scoped = [L("eligibility", { clearance: "none" }, { appliesTo: ["Federal Sales"] }), L("travel", { maxPercent: 10 })];
  expect(eligibilityProblems(scoped, { direction: "Federal Sales", clearanceRequired: "secret" })).toEqual([{ what: "clearance", firm: true }]);
  expect(eligibilityProblems(scoped, { direction: "Design", clearanceRequired: "secret" })).toEqual([]);
});

test("a pivot exception loosens the general limit only when it holds; direction limits replace every-direction ones; preferences never drop a job", () => {
  const limits = [
    L("seniority", { include: ["manager", "director"] }),
    L("seniority", { include: ["individual", "lead"] }, { when: { industryChange: true } }),
    L("seniority", { include: ["director"] }, { appliesTo: ["Customer Success"] }),
    L("travel", { maxPercent: 10 }, { firm: false }),
  ];
  expect(judgeJob(limits, { level: "lead", travelPercent: 40 }).keep).toBe(false);
  expect(judgeJob(limits, { level: "lead", industryChange: true, travelPercent: 40 }).keep).toBe(true);
  expect(judgeJob(limits, { level: "manager", industryChange: true }).keep).toBe(true);
  expect(judgeJob(limits, { level: "manager", direction: "Customer Success" }).keep).toBe(false);
  expect(judgeJob(limits, { level: "director", direction: "Customer Success" }).results.map((r) => r.verdict)).toEqual(["pass", "unknown"]);
});

test("countries normalise to ISO codes; unknown names are dropped", async () => {
  const { cleanRule } = await import("./limitBuckets");
  expect(cleanRule("location", { countries: ["United States", "canada", "USA", "Narnia", "gb"] })).toEqual({ countries: ["US", "CA", "GB"] });
  expect(cleanRule("travel", { travel: { maxPercent: 50 } })).toEqual({ maxPercent: 50 });
});

test("a condition with several parts holds when any of them does", () => {
  const limits = [L("seniority", { include: ["manager"] }), L("seniority", { include: ["individual"] }, { when: { industryChange: true, functionChange: true } })];
  expect(judgeJob(limits, { level: "individual", functionChange: true }).keep).toBe(true);
  expect(judgeJob(limits, { level: "individual" }).keep).toBe(false);
});

test("a director-level pivot still passes: the exception adds levels, it doesn't narrow the general limit", () => {
  const limits = [L("seniority", { include: ["manager", "director", "vp"] }), L("seniority", { include: ["individual", "lead"] }, { when: { functionChange: true } })];
  expect(judgeJob(limits, { level: "director", functionChange: true }).keep).toBe(true);
  expect(judgeJob(limits, { level: "individual", functionChange: true }).keep).toBe(true);
});

test("a hybrid-near-Austin limit isn't passed by a distant job just because the posting also offers remote, unless remote works for them", () => {
  const austin = { place: "Austin, TX", lat: 30.27, lng: -97.74, miles: 30 };
  const dallas = [{ place: "Dallas, TX", lat: 32.78, lng: -96.8 }];
  expect(checkLimit(L("location", { modes: ["hybrid"], places: [austin] }), { modes: ["remote", "hybrid"], places: dallas })).toBe("fail");
  expect(checkLimit(L("location", { modes: ["remote", "hybrid"], places: [austin] }), { modes: ["remote", "hybrid"], places: dallas })).toBe("pass");
  expect(checkLimit(L("location", { modes: ["remote", "hybrid"], places: [austin] }), { modes: ["hybrid"], places: dallas })).toBe("fail");
});

test("a conditional limit with nothing to loosen is checked on its own, and only while its condition holds", () => {
  const limits = [L("travel", { maxPercent: 10 }, { when: { industryChange: true } })];
  expect(judgeJob(limits, { travelPercent: 40, industryChange: true }).keep).toBe(false);
  expect(judgeJob(limits, { travelPercent: 40 }).keep).toBe(true);
});

test("a direction's conditional limit doesn't replace the general limit, and loosens it only on a pivot", () => {
  const limits = [L("seniority", { include: ["director", "vp"] }), L("seniority", { include: ["manager"] }, { appliesTo: ["Customer Success"], when: { functionChange: true } })];
  expect(judgeJob(limits, { level: "manager", direction: "Customer Success" }).keep).toBe(false);
  expect(judgeJob(limits, { level: "director", direction: "Customer Success" }).keep).toBe(true);
  expect(judgeJob(limits, { level: "manager", direction: "Customer Success", functionChange: true }).keep).toBe(true);
});

test("a direction's firm bar survives an every-direction pivot exception", () => {
  const limits = [
    L("seniority", { include: ["lead", "manager", "director"] }),
    L("seniority", { include: ["individual"] }, { when: { functionChange: true, industryChange: true } }),
    L("seniority", { include: ["director", "vp"] }, { appliesTo: ["Implementation"] }),
  ];
  expect(judgeJob(limits, { level: "manager", direction: "Implementation", industryChange: true }).keep).toBe(false);
  expect(judgeJob(limits, { level: "individual", direction: "Supply Chain Product", functionChange: true }).keep).toBe(true);
});

test("firm limits a role's details can be checked against set it apart, saying which limit; preferences, conditional limits and roles that don't say never do", () => {
  const firm = (kind: string, rule: Record<string, unknown>, extra: Partial<LimitLike> = {}): LimitLike => ({ kind, firm: true, rule, ...extra });
  const texts = (limits: LimitLike[], job: Parameters<typeof firmProblems>[1]) => firmProblems(limits, job).map(problemText);
  const limits = [
    firm("pay", { min: 150000, currency: "USD", period: "year", basis: "base" }),
    firm("seniority", { include: ["manager", "director"] }),
    firm("travel", { maxPercent: 20 }),
    firm("schedule", { fullTime: true }),
    firm("companies", { exclude: ["Initech"], industriesAvoid: ["staffing"] }),
  ];
  expect(texts(limits, { payTop: 140000, level: "individual", travel: 50, employmentType: "part-time", employer: "initech" })).toEqual([
    "Pays at most $140,000 a year, below your $150,000 floor",
    "Individual contributor level, outside the levels you set",
    "Up to 50% travel, more than your 20%",
    "Part-time; you set full-time",
    "An employer you ruled out",
  ]);
  expect(texts(limits, { payTop: 150000, level: "director", travel: 20, employmentType: "full-time", employer: "Globex" })).toEqual([]);
  expect(texts(limits, { employmentType: "contract" })).toEqual([]);
  expect(texts([firm("pay", { min: 60, currency: "USD", period: "hour", basis: "base" })], { payTop: 104000 })).toEqual(["Pays at most $104,000 a year, below your $60 an hour floor"]);
  expect(texts([firm("pay", { min: 100000, currency: "EUR", basis: "base" })], { payTop: 50000 })).toEqual([]);
  // Only a sound comparison sets a role apart: a total-comp floor against a posted range (base, or unsaid) isn't one;
  // a total-comp floor against pay stated as total compensation is, and a floor that doesn't say counts as base.
  expect(texts([firm("pay", { min: 200000, basis: "total" })], { payTop: 150000 })).toEqual([]);
  expect(texts([firm("pay", { min: 200000, basis: "total" })], { payTop: 150000, payBasis: "base" })).toEqual([]);
  expect(texts([firm("pay", { min: 200000, basis: "total" })], { payTop: 150000, payBasis: "total" })).toEqual(["Pays at most $150,000 a year, below your $200,000 floor"]);
  expect(texts([firm("pay", { min: 200000 })], { payTop: 150000 })).toEqual(["Pays at most $150,000 a year, below your $200,000 floor"]);
  expect(texts([firm("pay", { min: 200000, basis: "base" })], { payTop: 150000, payBasis: "total" })).toEqual(["Pays at most $150,000 a year, below your $200,000 floor"]);
  expect(texts(limits.map((l) => ({ ...l, firm: false })), { payTop: 1, level: "individual" })).toEqual([]);
  expect(texts([firm("pay", { min: 150000 }, { when: { industryChange: true } })], { payTop: 1 })).toEqual([]);
  expect(texts([firm("pay", { min: 150000 }, { appliesTo: ["Design"] })], { direction: "Sales", payTop: 1 })).toEqual([]);
});
