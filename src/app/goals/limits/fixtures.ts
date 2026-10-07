import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { cleanRule, limitLabel, sameRule } from "../../../../convex/limitBuckets";
import { answer, type Answers } from "../../storyConvex";
import type { Item, Limit } from "./words";

// Fixture data for the Limits stories, from the fixture persona's record: their eight approved limits (Eligibility,
// Companies with its sentence changed after the rule was set, Seniority twice, Pay, Work, Travel switched off,
// Location), the rejected pivot trade-off and one proposed Seniority limit that clashes, with what the screen's queries
// return for them. Mutations change the fixtures as the real ones change the data.

type Costs = FunctionReturnType<typeof api.estimates.costs>;
type Draft = { id?: Id<"items">; kind: string; firm: boolean; rule?: unknown; appliesTo: string[]; when: string[] };

const GOALS = "narr-goals" as Id<"narratives">;
const id = (key: string) => `lim-${key}` as Id<"items">;
const from = (...quotes: string[]) => [{ narrativeId: GOALS, version: 3, quotes }];
const APPROVED_DIRECTIONS = ["Plant Operations", "Operations Analytics", "Independent Consulting", "Procurement", "Solutions Consulting", "Logistics Operations", "Supply Planning", "Supply Chain Product"];
const MANAGER_UP = ["manager", "senior manager", "director", "senior director", "vp", "svp", "c-level"];

function limit(key: string, status: Limit["status"], data: Omit<Limit["data"], "label"> & { when?: Record<string, boolean> | null }, sources: Limit["sources"]): Limit {
  return { id: id(key), kind: "limit", status, data: { ...data, label: limitLabel(data.kind, data.appliesTo, data.when) }, sources } as Limit;
}

function items(): Item[] {
  const directions = APPROVED_DIRECTIONS.map((name, i) => ({ id: `dir-${i}` as Id<"items">, kind: "direction", status: "approved", data: { name }, sources: from() }) as Item);
  return [
    ...directions,
    limit("eligibility", "approved", { kind: "eligibility", value: "You are authorized to work in the US and do not need sponsorship.", firm: true, rule: { clearance: "none", sponsorshipNeeded: false } }, from("I’m authorized to work in the US and don’t need sponsorship.")),
    limit(
      "companies",
      "approved",
      {
        kind: "companies",
        value:
          "You want companies that make physical goods move better: supply chain and planning software, logistics, food and grocery, warehouse robotics, medical supply and industrial manufacturing. You avoid staffing agencies, tobacco companies, freight brokers that are only a phone bank, and two of your past employers.",
        firm: true,
        edited: true,
        sentenceChanged: true,
        rule: {
          exclude: ["Ironbridge Logistics", "Northline Couriers"],
          industriesAvoid: ["staffing"],
          industriesWant: ["industrial", "robotics", "ai", "data infrastructure", "ecommerce", "healthcare"],
        },
        note: "You care that the product touches real pallets and trucks, and that the team includes people who have worked a plant or warehouse floor.",
      },
      from("I want companies that make physical goods move better: supply chain and planning software, logistics, food and grocery, warehouse robotics, medical supply.", "I won’t work for tobacco companies, I’d skip staffing agencies, and I won’t go back to Ironbridge or Northline."),
    ),
    limit(
      "seniority-planning",
      "approved",
      {
        kind: "seniority",
        value: "In supply planning or logistics leadership, you want director-level scope, so you are looking for senior manager or above, not a lead or manager role.",
        firm: true,
        appliesTo: ["Supply Planning", "Logistics Operations"],
        rule: { exclude: ["individual", "lead", "manager"], include: MANAGER_UP.slice(1) },
        note: "You said staying in planning or logistics only makes sense with a team, a budget and a network to run, not the same desk with a bigger title.",
      },
      from("If I stay in planning or logistics leadership, it has to be director-level scope: a team, a budget and a network to run, not the same desk with a bigger title."),
    ),
    limit(
      "pay",
      "approved",
      {
        kind: "pay",
        value: "You want at least $135,000 a year in base pay; a bonus is welcome but doesn’t count toward it.",
        firm: true,
        rule: { basis: "base", currency: "USD", min: 135000, period: "year", variableOk: true },
        note: "You set $135,000 base as the floor and said you won’t count on a bonus to reach it.",
      },
      from("Pay has to be at least $135,000 base", "a bonus is nice, but I won’t count on it"),
    ),
    limit(
      "work",
      "approved",
      {
        kind: "work",
        value:
          "You want work that includes supply planning, S&OP, forecasting, network design, process design, internal tooling, analytics, product discovery, customer workshops, software rollouts, vendor negotiation and people management. You avoid overnight on-call and phone dispatch.",
        firm: false,
        rule: {
          avoid: ["overnight on-call", "phone dispatch"],
          want: ["supply planning", "S&OP", "forecasting", "network design", "process design", "internal tooling", "analytics", "product discovery", "customer workshops", "software rollouts", "vendor negotiation", "people management"],
        },
        note: "You would rather fix the system behind a late truck than be the person who absorbs it at 6 a.m.",
      },
      from("What wears on me is absorbing every late truck and short shipment at 6 a.m. I’d rather fix the system that made the truck late."),
    ),
    limit(
      "seniority-analytics",
      "approved",
      {
        kind: "seniority",
        value: "In procurement and operations analytics, you want at least a manager role, not an individual contributor or lead role.",
        firm: false,
        appliesTo: ["Procurement", "Operations Analytics"],
        rule: { exclude: ["individual", "lead"], include: MANAGER_UP },
      },
      from("Manager is my floor"),
    ),
    limit("travel", "approved", { kind: "travel", value: "You are open to up to 25% travel.", firm: false, off: true, rule: { maxPercent: 25 } }, from("Travel up to about 25% is fine, since plants and warehouses are where the problems are.")),
    limit(
      "location",
      "approved",
      {
        kind: "location",
        value: "You want hybrid work around Pittsburgh, Pennsylvania, or remote work anywhere in the US.",
        firm: false,
        rule: { countries: ["US"], modes: ["hybrid", "remote"], places: [{ lat: 40.4406, lng: -79.9959, place: "Pittsburgh, PA" }] },
        note: "Hybrid in Pittsburgh and fully remote work equally well for you.",
      },
      from("I’m in Pittsburgh and happy to be hybrid here, or remote anywhere in the US."),
    ),
    limit(
      "proposed",
      "proposed",
      { kind: "seniority", value: "In supply planning, you are looking for something more senior than your current senior manager role.", firm: false, appliesTo: ["Supply Planning"], rule: { exclude: ["individual", "lead"] }, clash: true },
      from("it has to be director-level scope"),
    ),
    limit(
      "pivot",
      "rejected",
      {
        kind: "seniority",
        value: "When a role moves you into a new industry or a new kind of work, a lead role is fine if it gets you in.",
        firm: false,
        when: { industryChange: true, functionChange: true },
        rule: { include: ["individual", "lead"] },
        rejectedBecause: "The other way round: changing industry is when I need the bigger title.",
      },
      from("when I’m changing industry or the kind of work, I want senior manager or above"),
    ),
  ];
}

// What each limit does to the 50 listed roles, as the board has it.
const FAILS: Record<string, number> = { eligibility: 2, companies: 17, "seniority-planning": 6, pay: 14, work: 7, "seniority-analytics": 3, travel: 2, location: 11 };
const KIND_FAILS: Record<string, number> = { pay: 14, companies: 17, seniority: 5, work: 7, travel: 2, location: 11, eligibility: 2, schedule: 4 };
const HIDDEN = [
  { postingId: "post-se-lumen" as Id<"postings">, directionId: "dir-4" as Id<"items">, title: "Solutions Engineer, Manufacturing", company: "Lumen Planning" },
  { postingId: "post-sc-demand" as Id<"postings">, directionId: "dir-4" as Id<"items">, title: "Solutions Consultant, Demand Planning", company: "Orchard Forecasting" },
  { postingId: "post-planning-dir" as Id<"postings">, directionId: "dir-6" as Id<"items">, title: "Director, Supply Planning", company: "Fernhill Foods" },
  { postingId: "post-planning-mgr" as Id<"postings">, directionId: "dir-6" as Id<"items">, title: "Supply Planning Manager", company: "Ashgrove Manufacturing" },
];

export function limitsFixtures(): Answers {
  let state = items();
  const notes: Record<string, { id: Id<"notes">; text: string; at: number; editedAt: number | null }[]> = {};
  const limits = () => state.filter((i): i is Limit => i.kind === "limit");
  const patch = (key: Id<"items">, change: (l: Limit) => Limit) => {
    state = state.map((i) => (i.id === key && i.kind === "limit" ? change(i) : i));
  };
  // A draft's count: the saved limit's, three more for each direction added (the board's 6 → 9), else its kind's.
  const draftFails = (d: Draft) => {
    const saved = d.id ? limits().find((l) => l.id === d.id) : undefined;
    if (!saved) return KIND_FAILS[d.kind] ?? 4;
    const base = FAILS[saved.id.replace("lim-", "")] ?? 4;
    return base + 3 * Math.max(0, d.appliesTo.length - (saved.data.appliesTo?.length ?? 0));
  };
  const costs: Costs = {
    followUp: null,
    outreach: null,
    letter: null,
    ask: null,
    tailor: null,
    rankPerRole: null,
    read: null,
    readRevision: null,
    rewrite: null,
    disagreements: null,
    duplicates: null,
    sameWork: null,
    skills: null,
    insights: null,
    repository: null,
    resume: null,
    directionResume: null,
    resumeLines: null,
    goals: 0.03,
    limitRule: 0.004,
    directionDetail: null,
    suggestDirections: null,
    lineCheck: null,
    lineUpdate: null,
  };
  return {
    ...answer(api.goals.items, () => state),
    ...answer(api.goals.effects, ({ draft }) => ({
      total: 50,
      hidden: 38,
      limits: limits()
        .filter((l) => l.status === "approved")
        .map((l) => ({ id: l.id, fails: FAILS[l.id.replace("lim-", "")] ?? KIND_FAILS[l.data.kind] ?? 4 })),
      draft: draft ? { fails: draftFails(draft), hidden: 38 + (draft.firm ? 3 : 0) } : null,
      capped: false,
    })),
    ...answer(api.goals.hiddenBy, () => HIDDEN),
    ...answer(api.estimates.costs, () => costs),
    ...answer(api.notes.list, ({ subject }) => notes[subject.id] ?? []),
    ...answer(api.notes.add, ({ subject, text }) => {
      notes[subject.id] = [...(notes[subject.id] ?? []), { id: `n-${Date.now()}` as Id<"notes">, text, at: Date.now(), editedAt: null }];
      return notes[subject.id].at(-1)!.id;
    }),
    ...answer(api.notes.edit, ({ id: noteId, text }) => {
      for (const k of Object.keys(notes)) notes[k] = notes[k].map((n) => (n.id === noteId ? { ...n, text, editedAt: Date.now() } : n));
    }),
    ...answer(api.notes.remove, ({ id: noteId }) => {
      for (const k of Object.keys(notes)) notes[k] = notes[k].filter((n) => n.id !== noteId);
    }),
    // What the stories change.
    ...answer(api.extract.review, ({ id: key, status, note }) =>
      patch(key, (l) => ({ ...l, status: status === "skipped" ? l.status : status, data: { ...l.data, rejectedBecause: status === "rejected" ? (note ?? null) : null } })),
    ),
    ...answer(api.goals.setLimitOn, ({ id: key, on }) => patch(key, (l) => ({ ...l, data: { ...l.data, off: on ? undefined : true } }))),
    ...answer(api.goals.keepRule, ({ id: key }) => patch(key, (l) => ({ ...l, data: { ...l.data, sentenceChanged: undefined } }))),
    ...answer(api.goals.updateRule, ({ id: key }) => patch(key, (l) => ({ ...l, data: { ...l.data, sentenceChanged: undefined } }))),
    ...answer(api.goals.updateLimit, ({ id: key, value, firm, rule, appliesTo, when }) =>
      patch(key, (l) => {
        const cond = when.length ? Object.fromEntries(when.map((c) => [c, true])) : null;
        const clean = cleanRule(l.data.kind, rule);
        // Reworded with the rule as it was: the rule still reads the old sentence.
        const reworded = value.trim() !== l.data.value;
        const sentenceChanged = reworded ? (sameRule(clean, l.data.rule) ? true : undefined) : l.data.sentenceChanged;
        return { ...l, status: "approved", data: { ...l.data, value: value.trim(), firm, rule: clean, appliesTo, when: cond, label: limitLabel(l.data.kind, appliesTo, cond), edited: true, sentenceChanged } };
      }),
    ),
    ...answer(api.goals.addLimit, ({ kind, value, firm, rule, appliesTo = [], when = [] }) => {
      const key = id(`new-${state.length}`);
      const cond = when.length ? Object.fromEntries(when.map((c) => [c, true])) : null;
      const clean = rule === undefined ? null : cleanRule(kind, rule);
      state = [...state, { id: key, kind: "limit", status: "approved", data: { kind, value: value || "Your own limit", firm, rule: clean, appliesTo, when: cond, label: limitLabel(kind, appliesTo, cond), edited: true }, sources: [] } as Limit];
      return key;
    }),
    ...answer(api.goals.removeLimit, ({ id: key }) => {
      state = state.filter((i) => i.id !== key);
    }),
  };
}
