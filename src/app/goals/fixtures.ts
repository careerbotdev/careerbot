import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { answer, type Answers } from "../storyConvex";

// Fixture data for the Goals stories: the fixture persona's goals story at version 3 (two earlier versions), and what
// reading it produced: eight limits (one Companies limit), seven directions (five with positioning and criteria waiting
// in Review), and one rejected limit. Mutations change the fixtures as the real ones change the data.

type Item = FunctionReturnType<typeof api.goals.items>[number];
type Story = NonNullable<FunctionReturnType<typeof api.narratives.get>>;
type LastRead = FunctionReturnType<typeof api.goals.lastRead>;

const STORY_ID = "goals-story" as Id<"narratives">;
const at = (iso: string) => new Date(iso).getTime();

const P = [
  "I’ve spent fifteen years moving food and freight: dispatching couriers, buying produce for a co-op, running a canning line, planning a brewery, running a freight network, and now supply planning for a soup and frozen-meal maker. Nearly every one of those jobs ran on a spreadsheet somebody built at midnight.",
  "I like a hard constraint.",
  "What keeps pulling at me is the software side. I’ve planned in NetSuite, SAP IBP and MercuryGate, and I can tell you exactly where each one breaks on a real plant floor. I’d like to help build the tools planners use, as a product manager on a supply chain product, not only use them. I write Python on weekends, and my load planner already runs on two shipping docks.",
  "The other way I can see it is solutions consulting: sitting with a planning team that’s about to buy software, learning how their week really goes, and showing them where the tool fits. I’m good at translating between the people on the floor and the people who write the code.",
  "I also love the puzzle work: the analysis that finds where the money is sitting in a network, or the supplier negotiation where my numbers beat theirs. And I still miss the plant floor.",
  "Someday I’d like to consult on my own for mid-size food makers who can’t afford a big firm. Not this year, but it’s on the list.",
  "My current job is good, and I’m good at it. What wears on me is absorbing every late truck and short shipment at 6 a.m. I’d rather fix the system that made the truck late.",
  "Pay has to be at least $135,000 base; a bonus is nice, but I won’t count on it. I’m in Pittsburgh and happy to be hybrid here, or remote anywhere in the US. Travel up to about 25% is fine, since plants and warehouses are where the problems are.",
  "I’m authorized to work in the US and don’t need sponsorship. Manager is my floor, and when I’m changing industry or the kind of work, I want senior manager or above so the move doesn’t cost me ground.",
  "If I stay in planning or logistics leadership, it has to be director-level scope: a team, a budget and a network to run, not the same desk with a bigger title.",
  "I want companies that make physical goods move better: supply chain and planning software, logistics, food and grocery, warehouse robotics, medical supply. I won’t work for tobacco companies, I’d skip staffing agencies, and I won’t go back to Ironbridge or Northline.",
];
const BODY = P.join("\n\n");

const src = (...quotes: string[]) => [{ narrativeId: STORY_ID, version: 3, quotes }];
let n = 0;
const limit = (status: Item["status"], data: Record<string, unknown>, quotes: string[]): Item =>
  ({ id: `limit-${++n}` as Id<"items">, kind: "limit", status, data, sources: src(...quotes) }) as Item;
const direction = (status: Item["status"], data: Record<string, unknown>, quotes: string[]): Item =>
  ({ id: `dir-${++n}` as Id<"items">, kind: "direction", status, data, sources: src(...quotes) }) as Item;

function items(): Item[] {
  n = 0;
  return [
    limit("approved", { kind: "eligibility", label: "Eligibility", value: "You are authorized to work in the US and do not need sponsorship.", firm: true, rule: { clearance: "none", sponsorshipNeeded: false } }, ["I’m authorized to work in the US and don’t need sponsorship"]),
    limit(
      "approved",
      {
        kind: "companies",
        label: "Companies",
        value: "You want companies that make physical goods move better. You avoid staffing agencies, tobacco companies and two of your past employers.",
        firm: true,
        rule: {
          exclude: ["Ironbridge Logistics", "Northline Couriers"],
          industriesAvoid: ["staffing"],
          industriesWant: ["industrial", "robotics", "ai", "data infrastructure", "ecommerce", "healthcare"],
        },
      },
      ["I want companies that make physical goods move better", "I won’t go back to Ironbridge or Northline"],
    ),
    limit(
      "approved",
      {
        kind: "seniority",
        label: "Seniority (Supply Planning, Logistics Operations)",
        value: "In supply planning or logistics leadership, you want director-level scope, so you are looking for senior manager or above, not a lead or manager role.",
        firm: true,
        appliesTo: ["Supply Planning", "Logistics Operations"],
        rule: { exclude: ["individual", "lead", "manager"], include: ["senior manager", "director", "senior director", "vp", "svp", "c-level"] },
      },
      ["it has to be director-level scope"],
    ),
    limit(
      "approved",
      { kind: "pay", label: "Pay", value: "You want at least $135,000 a year in base pay; a bonus is welcome but doesn’t count toward it.", firm: true, rule: { basis: "base", currency: "USD", min: 135000, period: "year", variableOk: true } },
      ["Pay has to be at least $135,000 base", "a bonus is nice, but I won’t count on it"],
    ),
    limit(
      "approved",
      { kind: "work", label: "Work", value: "You want work that fixes the system: supply planning, process design and internal tooling. You avoid overnight on-call and phone dispatch.", firm: false, rule: { avoid: ["overnight on-call", "phone dispatch"], want: ["supply planning", "process design", "internal tooling"] } },
      ["I’d rather fix the system that made the truck late"],
    ),
    limit(
      "approved",
      {
        kind: "seniority",
        label: "Seniority (Procurement, Operations Analytics)",
        value: "In procurement and operations analytics, you want at least a manager role, not an individual contributor or lead role.",
        firm: false,
        appliesTo: ["Procurement", "Operations Analytics"],
        rule: { exclude: ["individual", "lead"], include: ["manager", "senior manager", "director", "senior director", "vp", "svp", "c-level"] },
      },
      ["Manager is my floor"],
    ),
    limit("approved", { kind: "travel", label: "Travel", value: "You are open to up to 25% travel.", firm: false, rule: { maxPercent: 25 } }, ["Travel up to about 25% is fine"]),
    limit(
      "approved",
      { kind: "location", label: "Location", value: "You want hybrid work around Pittsburgh, Pennsylvania, or remote work anywhere in the US.", firm: false, rule: { countries: ["US"], modes: ["hybrid", "remote"], places: [{ place: "Pittsburgh, PA" }] } },
      ["I’m in Pittsburgh and happy to be hybrid here, or remote anywhere in the US"],
    ),
    limit(
      "rejected",
      { kind: "seniority", label: "Seniority · when changing industry", value: "When a role moves you into a new industry, a lead role is fine if it gets you in.", firm: false, rejectedBecause: "The other way round: changing industry is when I need the bigger title." },
      ["when I’m changing industry or the kind of work"],
    ),
    direction("approved", { name: "Supply Chain Product", path: "adjacent", includes: ["Planning Software"], detailStatus: "approved", criteriaStatus: "approved" }, ["I’d like to help build the tools planners use"]),
    direction("approved", { name: "Solutions Consulting", path: "adjacent", detailStatus: "approved", criteriaStatus: "approved" }, ["sitting with a planning team that’s about to buy software"]),
    direction("approved", { name: "Supply Planning", path: "continue", detailStatus: "proposed", criteriaStatus: "proposed" }, ["If I stay in planning or logistics leadership"]),
    direction("approved", { name: "Logistics Operations", path: "continue", detailStatus: "proposed", criteriaStatus: "proposed" }, ["planning or logistics leadership"]),
    direction("approved", { name: "Procurement", path: "adjacent", detailStatus: "proposed", criteriaStatus: "proposed" }, ["the supplier negotiation where my numbers beat theirs"]),
    direction("approved", { name: "Operations Analytics", path: "adjacent", detailStatus: "proposed", criteriaStatus: "proposed" }, ["the analysis that finds where the money is sitting in a network"]),
    direction("approved", { name: "Independent Consulting", path: "stretch", detailStatus: "proposed", criteriaStatus: "proposed" }, ["Someday I’d like to consult on my own for mid-size food makers", "Not this year, but it’s on the list"]),
  ];
}

function story(version: number, versions: Story["versions"]): Story {
  const current = versions[0];
  return { id: STORY_ID, kind: "goals", title: "Goals", body: current?.body ?? "", version, rejected: false, rejectedBecause: null, roleKey: null, versions };
}

// empty: no goals story yet. reading: a read under way.
export function goalsFixtures({ empty = false, reading = false }: { empty?: boolean; reading?: boolean } = {}): Answers {
  const data = {
    versions: empty
      ? []
      : [
          { version: 3, title: "Goals", body: BODY, at: at("2026-09-23T23:55:00") },
          { version: 2, title: "Goals", body: P.slice(0, 9).join("\n\n"), at: at("2026-09-23T15:12:00") },
          { version: 1, title: "Goals", body: P.slice(0, 7).join("\n\n"), at: at("2026-09-23T11:28:00") },
        ],
    items: empty ? [] : items(),
    created: !empty,
    last: (empty ? null : reading ? { status: "running", version: 3, at: at("2026-09-29T09:00:00"), error: null, result: null } : { status: "done", version: 3, at: at("2026-09-23T23:58:00"), error: null, result: null }) as LastRead,
  };
  const version = () => data.versions[0]?.version ?? 0;
  const add = (body: string) => data.versions.unshift({ version: version() + 1, title: "Goals", body, at: Date.now() });
  return {
    ...answer(api.narratives.list, () =>
      !data.created
        ? []
        : [{ id: STORY_ID, kind: "goals" as const, title: "Goals", version: version(), updatedAt: data.versions[0]?.at ?? Date.now(), rejected: false, rejectedBecause: null, words: (data.versions[0]?.body ?? "").split(/\s+/).filter(Boolean).length, roleKey: null }],
    ),
    ...answer(api.narratives.get, () => story(version(), data.versions)),
    ...answer(api.goals.items, () => data.items),
    ...answer(api.goals.lastRead, () => data.last),
    ...answer(api.estimates.costs, () => ({ goals: 0.031 }) as FunctionReturnType<typeof api.estimates.costs>),
    ...answer(api.narratives.create, () => {
      data.created = true;
      return STORY_ID;
    }),
    ...answer(api.narratives.save, ({ body }) => {
      add(body);
      return version();
    }),
    ...answer(api.narratives.restore, ({ version: v }) => {
      add(data.versions.find((x) => x.version === v)!.body);
      return version();
    }),
    ...answer(api.goals.start, () => {
      data.last = { status: "running", version: version(), at: Date.now(), error: null, result: null } as LastRead;
      return "job" as Id<"jobs">;
    }),
  };
}
