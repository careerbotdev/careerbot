import Ajv from "ajv";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ASK_SCHEMA } from "./ask";
import { CONFLICTS_SCHEMA } from "./conflicts";
import { DETAIL_SCHEMA, SUGGEST_SCHEMA } from "./directions";
import { DUPLICATES_SCHEMA } from "./duplicates";
import { companyFitSchema, KNOWN_SUMMARY_SCHEMA, SUMMARY_SCHEMA } from "./enrich";
import { EXTRACT_SCHEMA, REVISION_SCHEMA, REWORK_SCHEMA } from "./extract";
import { LINE_UPDATE_SCHEMA } from "./factChanges";
import { FOLLOW_UP_SCHEMA } from "./followUpEmails";
import { FOLLOWUPS_SCHEMA } from "./followups";
import { GOALS_SCHEMA, limitRuleSchema } from "./goals";
import { INSIGHTS_SCHEMA } from "./insights";
import { LINE_CHECK_SCHEMA } from "./lineCheck";
import { chatJson } from "./metering";
import { TEST_PRICE } from "./modelPrices.testing";
import { OUTREACH_SCHEMA } from "./people";
import { PROJECT_FINAL_SCHEMA, PROJECT_SCHEMA } from "./projects";
import type { ReplySchema } from "./replyJson";
import { LINES_SCHEMA } from "./resume";
import { sortSchema } from "./roleSort";
import { roleFitSchema } from "./roles";
import { SAME_WORK_SCHEMA } from "./sameWork";
import schema from "./schema";
import { SCREEN_SCHEMA } from "./screening";
import { seal } from "./secretBox";
import { SKILLS_SCHEMA } from "./skills";
import { ensureWorkspace } from "./workspaces";

// Every AI step that reads JSON sends its reply's schema (structured output). Each schema takes a reply the step reads
// today and refuses one the step couldn't use; and each stays within what providers accept.

const role = { key: "brightline-cs-lead", employer: "Brightline Health", title: "Customer Success Lead", alternateTitles: ["Customer Success Manager"], change: "", location: "Austin, TX", start: "2019-03", end: "2023-06", team: ["Customer Success"], projects: [], tools: ["Salesforce"], skills: ["Onboarding"], break: false, reason: "", quotes: ["I led customer success"] };
const careerBreak = { ...role, key: "break-2023-07", employer: "", title: "", alternateTitles: [], break: true, reason: "Finishing my degree", start: "2023-07", end: "2024-05" };
const fact = { roleKey: "brightline-cs-lead", text: "Cut onboarding from 90 to 30 days for 40 clinics.", quotes: ["cut onboarding to a month"] };
const story = { text: "Ran onboarding for 40 clinics.", factIds: ["f1"] };
const detail = {
  positioning: "You run onboarding at scale.",
  targetTitles: ["Implementation Manager"],
  vocabulary: ["time to value"],
  carriesOver: [story],
  reframe: [{ ...story, how: "Tell it as implementation." }],
  titleMap: [{ from: "Customer Success Lead", to: "Implementation Lead" }],
  criteria: { industries: ["healthcare"], sizes: ["201-1000"], stages: [], titles: ["Implementation Manager"], keywords: ["onboarding"] },
};
const payRule = { min: 120000, max: null, currency: "USD", period: "year", basis: null, variableOk: null };
// A goals reply's rule carries every bucket's fields, those it doesn't give null or empty.
const noRule = {
  min: null, max: null, currency: null, period: null, basis: null, variableOk: null, modes: [], countries: [], places: [], minPercent: null, maxPercent: null, hoursPerWeekMax: null,
  fullTime: null, include: [], exclude: [], industriesWant: [], industriesAvoid: [], sizes: [], want: [], avoid: [], citizenship: [], clearance: null, sponsorshipNeeded: null,
};
const anyRule = (given: object) => ({ ...noRule, ...given });
const limit = { kind: "pay", value: "You want at least $120,000 a year.", firm: true, appliesTo: [], when: { industryChange: false, functionChange: false }, rule: anyRule(payRule), note: "", quotes: ["at least 120k"] };
const details = {
  pay: { min: 95000, max: 120000, currency: "USD", period: "year" },
  setup: "hybrid",
  locations: ["Austin, TX"],
  seniority: "manager",
  yearsAsked: 5,
  employmentType: "full-time",
  travel: null,
  clearance: "",
  visa: null,
};
const posting = { id: "p1", fit: [{ directionId: "d1", level: "strong", score: 82, reason: "Runs onboarding for clinics." }], details, brief: { job: "Leads onboarding.", forYou: "You led onboarding at Brightline." } };
const skill = { id: "", kind: "tool", name: "Salesforce", group: "CRM", from: { roles: ["brightline-cs-lead"], projects: [], facts: ["f1"] }, lowValue: "", issuer: "", earned: "", sameAs: "", sameWhy: "" };

type Case = { step: string; schema: ReplySchema; reads: unknown; refuses: unknown };
const cases: Case[] = [
  { step: "extract", schema: EXTRACT_SCHEMA, reads: { roles: [role, careerBreak], facts: [fact], context: [{ ...fact, text: "You left to move to Texas." }] }, refuses: { roles: [{ ...role, team: "Customer Success" }], facts: [], context: [] } },
  { step: "rework", schema: REWORK_SCHEMA, reads: { text: "Cut onboarding to 30 days.", quotes: [], keptAsContext: ["40 clinics"] }, refuses: { text: "Cut onboarding to 30 days.", quotes: [] } },
  { step: "revision", schema: REVISION_SCHEMA, reads: { facts: [fact], updates: [{ factId: "f1", text: "Cut onboarding to 25 days.", why: "New number." }], retired: [{ factId: "f2", why: "No longer said." }], context: [] }, refuses: { facts: [fact], updates: [{ factId: "f1", text: "x", why: "y", note: "z" }], retired: [], context: [] } },
  { step: "insights", schema: INSIGHTS_SCHEMA, reads: { insights: [{ text: "You turn messy onboarding into a process.", factIds: ["f1", "f2"] }] }, refuses: { insights: [{ text: "x", factIds: "f1" }] } },
  { step: "project", schema: PROJECT_SCHEMA, reads: { summary: "A scheduling app for clinics.", stack: ["TypeScript"], facts: [{ text: "Built it alone.", files: ["README.md"] }] }, refuses: { summary: null, stack: [], facts: [] } },
  { step: "project final", schema: PROJECT_FINAL_SCHEMA, reads: { facts: [{ text: "Built it alone.", files: [] }] }, refuses: { facts: [{ text: "Built it alone." }] } },
  {
    step: "check",
    schema: CONFLICTS_SCHEMA,
    reads: { conflicts: [{ roleKey: "brightline-cs-lead", field: "start", recordSays: "Started March 2019", narrativeSays: "Started May 2019", narrativeValue: "2019-05", narrativeId: "n1", quote: "in May 2019", question: "Did you start in March or May 2019?" }, { roleKey: null, field: null, recordSays: "40 clinics", narrativeSays: "50 clinics", narrativeValue: null, narrativeId: "n1", quote: "50 clinics", question: "Was it 40 or 50 clinics?" }] },
    refuses: { conflicts: [{ roleKey: null, field: null, recordSays: "a", narrativeSays: "b", narrativeValue: null, narrativeId: "n1", question: "?" }] },
  },
  { step: "follow-up", schema: FOLLOW_UP_SCHEMA, reads: { subject: "Following up", text: "Hi Dana, ...", factIds: ["f1"] }, refuses: { subject: "Following up", text: ["Hi Dana"], factIds: [] } },
  {
    step: "outreach",
    schema: OUTREACH_SCHEMA,
    reads: { subject: "Implementation Manager", text: "Hi Dana, ...", factIds: [], parts: { who: "A planner.", why: "Your team.", fit: "The forecast.", ask: "A short call." } },
    refuses: { text: "Hi Dana", factIds: [] },
  },
  { step: "line update", schema: LINE_UPDATE_SCHEMA, reads: { lines: [{ index: 0, text: "Cut onboarding to 30 days.", factIds: ["f1"] }] }, refuses: { lines: [{ index: "0", text: "x", factIds: [] }] } },
  { step: "followups", schema: FOLLOWUPS_SCHEMA, reads: { questions: [{ question: "How many clinics?", why: "A number.", roleKey: "brightline-cs-lead", factId: null }] }, refuses: { questions: [{ question: "How many?", why: "", roleKey: "", factId: 7 }] } },
  { step: "screen companies", schema: SCREEN_SCHEMA, reads: { companies: [{ id: "c1", kind: "staffing or recruiting" }] }, refuses: { companies: [{ id: "c1" }] } },
  { step: "direction detail", schema: DETAIL_SCHEMA, reads: { directions: [{ id: "d1", ...detail }] }, refuses: { directions: [{ id: "d1", ...detail, criteria: { industries: [] } }] } },
  { step: "suggest directions", schema: SUGGEST_SCHEMA, reads: { directions: [{ name: "Implementation", includes: ["Onboarding Manager"], summary: "Your onboarding work.", path: "adjacent", factIds: ["f1"], ...detail }] }, refuses: { directions: [{ id: "d1", ...detail }] } },
  { step: "ask about this role", schema: ASK_SCHEMA, reads: { answer: "Lead with the clinic onboarding.", factIds: ["f1"], learned: [] }, refuses: { answer: "Lead with it.", factIds: [], learned: false } },
  {
    step: "goals",
    schema: GOALS_SCHEMA,
    reads: {
      directions: [{ name: "Implementation", includes: [], summary: "Onboarding work.", path: "adjacent", quotes: [] }],
      limits: [limit, { ...limit, kind: "seniority", value: "Manager and up.", rule: anyRule({ include: ["manager", "director"] }) }, { ...limit, kind: "location", rule: anyRule({ modes: ["remote"], countries: ["US"], places: [{ place: "Austin, TX", lat: 30.27, lng: -97.74, miles: null }] }) }],
    },
    refuses: { directions: [], limits: [{ ...limit, rule: payRule }] },
  },
  { step: "limit rule", schema: limitRuleSchema("pay"), reads: { rule: payRule }, refuses: { rule: { min: 120000 } } },
  { step: "role sort", schema: sortSchema(3), reads: { r1: ["d2"], r2: [], r3: ["d1", "d3"] }, refuses: { r1: ["d2"], r2: [] } },
  { step: "line check", schema: LINE_CHECK_SCHEMA, reads: { supported: false, beyond: ["40 clinics"] }, refuses: { supported: "no", beyond: [] } },
  { step: "company summaries", schema: SUMMARY_SCHEMA, reads: { companies: [{ id: "c1", summary: "Builds scheduling software for clinics." }] }, refuses: { companies: [{ id: "c1", summary: null }] } },
  { step: "company summaries (general knowledge)", schema: KNOWN_SUMMARY_SCHEMA, reads: { companies: [{ id: "c1", summary: null }, { id: "c2", summary: "Sells payroll software." }] }, refuses: { companies: [{ id: "c1" }] } },
  { step: "company fit", schema: companyFitSchema(false), reads: { companies: [{ id: "c1", fit: [{ directionId: "d1", level: "some", reason: "Hiring for onboarding." }] }] }, refuses: { companies: [{ id: "c1", fit: [], goals: { level: "fits", reason: "x" } }] } },
  { step: "company fit with goals", schema: companyFitSchema(true), reads: { companies: [{ id: "c1", fit: [], goals: { level: "fits", reason: "A clinic software company." } }] }, refuses: { companies: [{ id: "c1", fit: [] }] } },
  { step: "role fit (v1)", schema: roleFitSchema("v1"), reads: { postings: [posting] }, refuses: { postings: [{ ...posting, stretch: [] }] } },
  { step: "role fit (v2)", schema: roleFitSchema("v2"), reads: { postings: [{ ...posting, stretch: ["asks for 8+ years"] }] }, refuses: { postings: [posting] } },
  { step: "skills", schema: SKILLS_SCHEMA, reads: { items: [skill, { ...skill, kind: "certification", name: "PMP", group: "Certifications", issuer: "PMI", earned: "2021-04" }] }, refuses: { items: [{ ...skill, from: ["brightline-cs-lead"] }] } },
  { step: "same work", schema: SAME_WORK_SCHEMA, reads: { pairs: [{ projectFactId: "f1", roleFactId: "f2", richer: "f2" }] }, refuses: { pairs: [{ projectFactId: "f1", roleFactId: "f2" }] } },
  { step: "resume lines", schema: LINES_SCHEMA, reads: { lines: [{ text: "Cut onboarding to 30 days.", factIds: ["f1"], roleKey: "brightline-cs-lead", projectKey: "" }] }, refuses: { lines: [{ text: "x", factIds: ["f1"], roleKey: "brightline-cs-lead" }] } },
  { step: "duplicates", schema: DUPLICATES_SCHEMA, reads: { groups: [{ ids: ["f1", "f2"] }] }, refuses: { groups: [["f1", "f2"]] } },
];

const ajv = new Ajv({ allowUnionTypes: true });

test.each(cases)("$step: its schema takes a reply the step reads and refuses one it couldn't use", ({ schema: s, reads, refuses }) => {
  const valid = ajv.compile(s.schema);
  expect(valid(reads), JSON.stringify(valid.errors)).toBe(true);
  expect(valid(refuses)).toBe(false);
});

// Strict structured output: every object lists all its properties as required and allows no others; a name of
// letters, digits, _ and -. Claude refuses a schema with more than 16 fields that are a union (a type list or anyOf).
test.each(cases)("$step: its schema is one providers take as strict", ({ schema: s }) => {
  expect(s.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  let unions = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.type) || n.anyOf) unions++;
    if (n.type === "object") {
      expect(n.additionalProperties).toBe(false);
      expect(n.required).toEqual(Object.keys(n.properties as object));
    }
    Object.values(n).forEach(walk);
  };
  walk(s.schema);
  expect(unions).toBeLessThanOrEqual(16);
});

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "22".repeat(32);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

test("each step's schema goes out as strict structured output, and the reply it allows is read", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const sealed = await seal("sk-or-test");
  const workspaceId = await t.run(async (ctx) => {
    await ctx.db.insert("modelPrices", { model: "vendor/strict", ...TEST_PRICE, structured: true, at: Number.MAX_SAFE_INTEGER });
    const w = await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "a@example.com" }));
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 10, apolloMode: "on" });
    return w;
  });
  for (const { step, schema: s, reads } of cases) {
    let sent: { response_format?: unknown; provider?: unknown } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        return Response.json({ model: "vendor/strict", choices: [{ message: { content: JSON.stringify(reads) }, finish_reason: "stop" }], usage: { cost: 0.001 } });
      }),
    );
    const reply = await t.action(async (ctx) => chatJson(ctx, { workspaceId, purpose: step, model: "vendor/strict", messages: [{ role: "user", content: "hello" }], schema: s }));
    expect(sent.response_format).toEqual({ type: "json_schema", json_schema: { ...s, strict: true } });
    expect(sent.provider).toEqual({ require_parameters: true });
    expect(reply.out).toEqual(reads);
  }
});
