import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { answer, type Answers } from "../storyConvex";

// Fixture data for the Record stories: the record of Wren Castellano, a fictional person, as of Sep 28, 2026 (seven roles
// and a career break, their facts, seven GitHub projects with Palletwise linked to Brightwater and Quotewell rejected,
// skills, tools and a certification, insights, stories and quick notes with their versions, notes), and what the
// record's queries return for it. Mutations change `state` as the real ones change the data; after each, every query
// shown is asked again. A screen adds answers for anything else in its own stories: { ...fixture.answers, ...answer(api.x.y, …) }.

type Item = Doc<"items">;
type Of<K extends Item["kind"]> = Extract<Item, { kind: K }>;
type Job = { kind: Doc<"jobs">["kind"]; args: Record<string, unknown>; status: Doc<"jobs">["status"]; error?: string; result?: Record<string, unknown> };
type Note = Doc<"notes">;
type Narrative = Doc<"narratives">;
type Version = Doc<"narrativeVersions">;

export type RecordState = {
  items: Item[];
  narratives: Narrative[];
  versions: Version[];
  notes: Note[];
  // Newest first, as the queries read them.
  jobs: Job[];
  github: { ready: boolean; connected: { account: string; selection: "all" | "selected"; settingsUrl: string; at: number } | null };
  presentation: Omit<FunctionReturnType<typeof api.resume.presentation>, "length">;
};

const DAY = 86_400_000;
export const NOW = Date.parse("2026-09-28T15:00:00Z");
const WS = "ws-owner" as Id<"workspaces">;
const at = (daysAgo: number, hours = 0) => NOW - daysAgo * DAY - hours * 3_600_000;

// Stable ids and keys, for a story's starting address (?role=, ?fact=, ?story=…).
export const ROLE = {
  bw: "brightwater-provisions-senior-supply-planning-manager",
  pantry: "three-rivers-pantry-network-volunteer-logistics-lead",
  ib: "ironbridge-logistics-network-operations-manager",
  kcPlan: "kettle-and-crane-brewing-production-planning-lead",
  kcLine: "kettle-and-crane-brewing-packaging-line-supervisor",
  harbor: "harbor-mill-food-co-op-purchasing-coordinator",
  courier: "northline-couriers-dispatch-supervisor",
  break2015: "break-2015-01",
} as const;
export const PROJECT = {
  palletwise: "github:wrencastellano/palletwise",
  brewlog: "github:wrencastellano/brewlog",
  lanebook: "github:wrencastellano/lanebook",
  shelfspan: "github:wrencastellano/shelfspan",
  stoopsale: "github:wrencastellano/stoopsale",
  ridgeline: "github:wrencastellano/ridgeline",
  quotewell: "github:wrencastellano/quotewell",
} as const;
export const itemId = (key: string) => `i-${key}` as Id<"items">;
export const storyId = (key: string) => `n-${key}` as Id<"narratives">;
export const IDS = {
  // A Brightwater fact with a rewrite waiting, a Kettle & Crane one with a rewrite being written, and one still proposed.
  rewrite: itemId("f-bw-fill"),
  writing: itemId("f-kcLine-changeover"),
  proposedFact: itemId("f-bw-guide"),
  // Palletwise's fact that looks like the same work as a Brightwater fact.
  sameWork: itemId("f-palletwise-load"),
  sameWorkRole: itemId("f-bw-palletwise"),
  // Two Ironbridge facts that look like duplicates.
  duplicate: itemId("f-ib-team-2"),
  // A fact the revised Kettle & Crane story no longer says.
  noLongerSaid: itemId("f-kcLine-qa"),
  // The rejected role and the rejected project.
  rejectedRole: itemId("role-courier-dispatcher"),
  // The disagreement about when they left Ironbridge.
  conflict: itemId("q-ib-end"),
} as const;

let n = 0;
const created = () => at(8) + n++ * 1000;
const base = (id: string, status: Item["status"]) => ({ _id: itemId(id), _creationTime: created(), workspaceId: WS, status, at: at(8) });
const src = (story: string, version: number, ...quotes: string[]) => [{ narrativeId: storyId(story), version, quotes }];

function role(id: string, roleKey: string, status: Item["status"], data: Of<"role">["data"], story?: [string, number, ...string[]]): Of<"role"> {
  return { ...base(id, status), kind: "role", roleKey, data: { key: roleKey, ...data }, sources: story ? src(...story) : [] };
}
// A project's fact rests on the project; a role's on its story (the quote given, else the fact's opening words).
function fact(id: string, owner: { roleKey?: string; projectKey?: string }, text: string, opts: { status?: Item["status"]; story?: [string, number, ...string[]]; data?: Partial<Of<"fact">["data"]> } = {}): Of<"fact"> {
  const sources = owner.projectKey ? [] : src(...(opts.story ?? [storyOf[owner.roleKey!], 2, text.split(/[,;:]/)[0]]));
  return { ...base(id, opts.status ?? "approved"), kind: "fact", ...owner, data: { text, ...opts.data }, sources };
}
function project(id: string, key: string, status: Item["status"], data: Of<"project">["data"], roleKey?: string): Of<"project"> {
  return { ...base(id, status), kind: "project", projectKey: key, ...(roleKey ? { roleKey } : {}), data, sources: [] };
}
function skill(kind: "skill" | "tool" | "certification", id: string, status: Item["status"], name: string, group: string, from: { roles?: string[]; projects?: string[] } = {}, data: Partial<Of<"skill">["data"]> = {}): Item {
  return { ...base(id, status), kind, data: { name, group, from: { roles: from.roles ?? [], projects: from.projects ?? [], facts: [] }, ...data }, sources: [] } as Item;
}

// The story each role's facts were read from.
const storyOf: Record<string, string> = {
  [ROLE.bw]: "bw",
  [ROLE.pantry]: "pantry",
  [ROLE.ib]: "ib",
  [ROLE.kcPlan]: "kc",
  [ROLE.kcLine]: "kc",
  [ROLE.harbor]: "harbor",
  [ROLE.courier]: "courier",
};

const edited = (was: string, text: string): Partial<Of<"fact">["data"]> => ({ edited: true, history: [{ text: was, how: "read", at: at(6) }, { text, how: "edit", was: "proposed", at: at(5) }] });

function items(): Item[] {
  const R = ROLE;
  const roles: Item[] = [
    role("role-bw", R.bw, "approved", { employer: "Brightwater Provisions", title: "Senior Supply Planning Manager", start: "2023-04", end: null, location: "Pittsburgh, Pennsylvania", team: ["Supply Planning"], marketTitle: "Supply Chain Planning and S&OP Leadership" }, ["bw", 3, "I started at Brightwater Provisions in April 2023 as Senior Supply Planning Manager, reporting to the VP of Operations."]),
    role("role-pantry", R.pantry, "approved", { employer: "Three Rivers Pantry Network", title: "Volunteer Logistics Lead", start: "2021-09", end: "2023-03", change: "first", marketTitle: "Logistics Lead, Nonprofit Food Distribution" }, ["pantry", 2, "In September 2021 Teodora Mills asked me to run logistics for the Three Rivers Pantry Network."]),
    role("role-ib", R.ib, "approved", { employer: "Ironbridge Logistics", title: "Network Operations Manager", alternateTitles: ["Transportation Operations Manager", "Logistics Analytics Manager", "Regional Operations Manager", "Freight Network Manager"], start: "2020-02", end: "2023-04" }, ["ib", 2, "I joined Ironbridge Logistics in February 2020 to run network operations for its Pittsburgh terminals."]),
    role("role-kcPlan", R.kcPlan, "approved", { employer: "Kettle & Crane Brewing", title: "Production Planning Lead", alternateTitles: ["Production Planner", "Materials Planning Manager", "Supply Planner"], start: "2017-03", end: "2020-01", location: "Milwaukee, Wisconsin", change: "change" }, ["kc", 2, "In March 2017 I moved into production planning."]),
    role("role-kcLine", R.kcLine, "approved", { employer: "Kettle & Crane Brewing", title: "Packaging Line Supervisor", alternateTitles: ["Production Supervisor", "Packaging Manager", "Manufacturing Shift Lead"], start: "2015-06", end: "2017-03", location: "Milwaukee, Wisconsin", change: "first" }, ["kc", 2, "I came to Kettle & Crane in June 2015 to supervise the packaging line."]),
    role("role-harbor", R.harbor, "approved", { employer: "Harbor Mill Food Co-op", title: "Purchasing Coordinator", alternateTitles: ["Buyer", "Grocery Buyer", "Inventory Coordinator"], start: "2012-08", end: "2015-01", location: "Milwaukee, Wisconsin" }, ["harbor", 2, "I was the purchasing coordinator at Harbor Mill Food Co-op from 2012."]),
    role("role-break", R.break2015, "approved", { title: "Career break", break: true, start: "2015-01", end: "2015-06", reason: "Walked the Ice Age Trail" }),
    role("role-courier", R.courier, "approved", { employer: "Northline Couriers", title: "Dispatch Supervisor", start: "2009-06", end: "2012-08", location: "Milwaukee, Wisconsin", marketTitle: "Dispatch Supervisor" }, ["courier", 2, "I was running the dispatch desk within a year."]),
    role("role-courier-dispatcher", "northline-couriers-dispatcher", "rejected", { employer: "Northline Couriers", title: "Dispatcher", start: "2009-06", end: "2012-08", rejectedBecause: "Same job as Dispatch Supervisor" }, ["courier", 2, "My first job out of school was dispatching at Northline Couriers."]),
  ];

  const f = (key: string, roleKey: string, text: string, opts?: Parameters<typeof fact>[3]) => fact(`f-${key}`, { roleKey }, text, opts);
  const facts: Item[] = [
    f("bw-skus", R.bw, "Lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods.", { story: ["bw", 3, "I lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods."] }),
    f("bw-award", R.bw, "Named Brightwater’s Operator of the Year for 2025 after moving production out of a closing plant without missing a retail order."),
    f("bw-fill", R.bw, "Kept the case fill rate above 98% for eight straight quarters.", {
      data: { suggestion: { text: "Kept the case fill rate above 98% for eight straight quarters while the product line grew by a third, the longest run in Brightwater’s history.", note: "No planner before me held it that long.", at: at(0, 3) } },
    }),
    f("bw-inventory", R.bw, "Took finished-goods inventory from 41 to 29 days of supply without lowering service, freeing about $9 million in working capital."),
    f("bw-recall", R.bw, "Contained a supplier’s allergen recall in 36 hours by tracing every affected lot through both plants and the co-packers and rebuilding the production schedule around it.", {
      data: edited("Helped handle a supplier recall.", "Contained a supplier’s allergen recall in 36 hours by tracing every affected lot through both plants and the co-packers and rebuilding the production schedule around it."),
    }),
    f("bw-sop", R.bw, "Rebuilt the monthly sales and operations planning meeting so finance, sales and both plants commit to a single demand number."),
    f("bw-palletwise", R.bw, "Built a load-planning calculator that the shipping docks at both plants use to fit more cases on every outbound truck."),
    f("bw-guide", R.bw, "Wrote the co-packer onboarding guide: forecast sharing, minimum runs, quality holds and how schedule changes get approved.", { status: "proposed" }),
    f("bw-python", R.bw, "Replaced a 40-tab spreadsheet forecast with a Python model the demand team reruns every Monday, raising forecast accuracy from 61% to 74%."),
    f("pantry-routes", R.pantry, "Designed weekend delivery routes for 14 partner pantries, driven by about 60 volunteers."),
    f("pantry-truck", R.pantry, "Secured a donated refrigerated box truck and set up the temperature logs that let the network accept fresh produce."),
    f("pantry-intake", R.pantry, "Moved donation intake from paper sign-in sheets to a shared tracker that shows what each pantry is short on."),
    f("pantry-joined", R.pantry, "Joined the network’s volunteer board in 2021 at the invitation of its director, Teodora Mills."),
    f("ib-carriers", R.ib, "Ran quarterly scorecard reviews with the network’s 30 largest carriers and used on-time and claims data to reset rates each spring."),
    f("ib-crossdock", R.ib, "Opened the Ohio Valley cross-dock and planned its first 40 lanes."),
    f("ib-tms", R.ib, "Led the move to a new transportation management system for about 180 dispatchers and planners at four terminals."),
    f("ib-team", R.ib, "Managed six analysts who produced the weekly cost-per-mile report for every terminal."),
    f("ib-team-2", R.ib, "Supervised a team of six operations analysts building weekly cost-per-mile reporting for terminal managers.", { status: "proposed", data: { duplicateOf: itemId("f-ib-team") } }),
    f("ib-empty", R.ib, "Cut empty miles by 11% by matching backhauls between terminals that had been planning them separately."),
    f("ib-dash", R.ib, "Built the Power BI terminal scorecard that every site manager opens on Monday morning."),
    f("ib-claims", R.ib, "Traced a rise in damage claims to one pallet supplier and replaced it, lowering claims costs about $380,000 a year."),
    f("kcPlan-mrp", R.kcPlan, "Set up the brewery’s first MRP in NetSuite, tying brew schedules to malt, hop and can orders."),
    f("kcPlan-cans", R.kcPlan, "Negotiated a two-year aluminum can contract that held its price through the 2018 tariff increases."),
    f("kcPlan-brewhouse", R.kcPlan, "Planned capacity for a second brewhouse that took annual output from 38,000 to 70,000 barrels."),
    f("kcPlan-distributors", R.kcPlan, "Started a weekly forecast shared with 22 distributors, ending the summer stockouts of the flagship lager."),
    f("kcPlan-waste", R.kcPlan, "Cut raw-material write-offs by 35% with first-expired, first-out rules and monthly cycle counts.", { data: edited("Reduced waste in the warehouse.", "Cut raw-material write-offs by 35% with first-expired, first-out rules and monthly cycle counts.") }),
    f("kcPlan-seasonals", R.kcPlan, "Scheduled nine seasonal releases a year around tank space without delaying the year-round beers."),
    f("kcLine-oee", R.kcLine, "Raised canning line efficiency from 58% to 81% by standardizing changeovers between can sizes."),
    f("kcLine-crew", R.kcLine, "Hired and trained a 12-person packaging crew across two shifts.", { data: edited("Supervised the packaging crew.", "Hired and trained a 12-person packaging crew across two shifts.") }),
    f("kcLine-safety", R.kcLine, "Went 700 days without a recordable injury on the packaging floor."),
    f("kcLine-changeover", R.kcLine, "Wrote changeover checklists for every can size and label so any shift could run any beer.", {
      data: { suggestion: { pending: true, note: "Say how long a changeover took before and after.", at: at(0, 1) } },
    }),
    f("kcLine-qa", R.kcLine, "Ran the daily fill-level and seam checks on every canning run.", { data: { noLongerSaid: "Your revised Kettle & Crane story says quality checks moved to the lab team in 2016." } }),
    f("harbor-farms", R.harbor, "Grew the local-farm produce program from 9 to 31 suppliers."),
    f("harbor-team", R.harbor, "Led a purchasing team of two buyers and a receiver."),
    f("harbor-shrink", R.harbor, "Brought produce shrink down from 9% to 5% by ordering against daily sales instead of weekly estimates."),
    f("harbor-bulk", R.harbor, "Launched a bulk-foods aisle that became the store’s highest-margin department."),
    f("harbor-reorder", R.harbor, "Moved supplier ordering off phone and fax and onto reorder reports from the register system."),
    f("courier-dispatch", R.courier, "Dispatched up to 45 bike and van couriers a day across downtown Milwaukee."),
    f("courier-zones", R.courier, "Redrew delivery zones around the river bridges, cutting the average delivery by 12 minutes."),
    f("courier-accounts", R.courier, "Won the company’s first law-firm and hospital accounts by guaranteeing two-hour delivery."),
    f("courier-texts", R.courier, "Replaced radio dispatch with a text-message system riders could use from any phone."),
    f("courier-bikes", R.courier, "Repaired the couriers’ bikes.", { status: "rejected", data: { rejectedBecause: "A mechanic did that; I only booked the repairs" } }),
  ];

  const p = (key: string, text: string, projectKey: string, data: Partial<Of<"fact">["data"]> = {}) => fact(`f-${key}`, { projectKey }, text, { data: { files: ["README.md", "src/main.ts"], ...data } });
  const projectFacts: Item[] = [
    p("palletwise-load", "Built Palletwise end to end: a SvelteKit app that packs mixed pallets into a 53-foot trailer and draws the load plan in 3D with Three.js.", PROJECT.palletwise, { sameWorkAs: { factId: itemId("f-bw-palletwise"), lead: itemId("f-palletwise-load") } }),
    p("palletwise-sqlite", "Kept carton sizes and stacking rules in SQLite so a full-trailer plan computes in under a second.", PROJECT.palletwise),
    p("brewlog-sensors", "Built Brewlog, a fermentation monitor that reads gravity and temperature from Raspberry Pi sensors every five minutes.", PROJECT.brewlog),
    p("brewlog-alerts", "Added alerts that spot a stalled fermentation in the gravity curve before the brewer would notice it.", PROJECT.brewlog),
    p("brewlog-beta", "Recruited 40 homebrewers from three brewing clubs for a beta.", PROJECT.brewlog),
    p("shelfspan-volunteers", "Built the volunteer side end to end: shift sign-up, expiry alerts by text and a weekly waste report.", PROJECT.shelfspan),
    p("lanebook-start", "Built the benchmark from nothing: a data pipeline, a rate model and a public dashboard that refreshes every week.", PROJECT.lanebook),
    p("stoopsale-map", "Built the map, seller sign-up and a route planner that orders sales by opening time.", PROJECT.stoopsale),
    p("ridgeline-app", "Built an Android app that picks the best hiking window from hourly forecasts and sunset times.", PROJECT.ridgeline),
    { ...p("quotewell-parse", "Built a parser that pulls rates out of carrier quote emails.", PROJECT.quotewell), status: "setAside" },
  ];

  const projects: Item[] = [
    project("p-palletwise", PROJECT.palletwise, "approved", { name: "Palletwise", repo: "wrencastellano/palletwise", url: "https://github.com/wrencastellano/palletwise", summary: "A load planner that fits mixed pallets into a trailer and shows the load in 3D.", stack: ["TypeScript", "SvelteKit", "Three.js", "SQLite", "Fly.io"], start: "2025-02", end: "2026-01", commits: 86, readAt: at(9) }, ROLE.bw),
    project("p-brewlog", PROJECT.brewlog, "approved", { name: "Brewlog", repo: "wrencastellano/brewlog", url: "https://github.com/wrencastellano/brewlog", private: true, summary: "Fermentation monitor for homebrewers: sensors log gravity and temperature to a dashboard with alerts.", stack: ["Python", "MicroPython", "FastAPI", "InfluxDB", "Grafana", "Raspberry Pi"], start: "2026-03", end: "2026-07", commits: 214, readAt: at(9) }),
    project("p-lanebook", PROJECT.lanebook, "approved", { name: "Lanebook", repo: "wrencastellano/lanebook", url: "https://github.com/wrencastellano/lanebook", private: true, summary: "A lane-by-lane freight rate benchmark built from public tender data.", stack: ["Python", "DuckDB", "Polars", "Streamlit", "GitHub Actions"], start: "2026-08", end: "2026-09", commits: 58, readAt: at(9) }),
    project("p-shelfspan", PROJECT.shelfspan, "approved", { name: "Shelfspan", repo: "wrencastellano/shelfspan", url: "https://github.com/wrencastellano/shelfspan", private: true, summary: "An expiry-date tracker for food pantries that texts volunteers before donated stock goes bad.", stack: ["Python", "Django", "HTMX", "PostgreSQL", "Twilio", "Docker"], start: "2025-09", end: "2025-12", commits: 131, readAt: at(9) }),
    project("p-stoopsale", PROJECT.stoopsale, "approved", { name: "Stoopsale", repo: "wrencastellano/stoopsale", url: "https://github.com/wrencastellano/stoopsale", summary: "A neighborhood yard-sale map with a route planner for Saturday mornings.", stack: ["TypeScript", "Remix", "Mapbox GL JS", "PostgreSQL", "PostGIS"], start: "2026-04", end: "2026-05", commits: 23, readAt: at(9) }),
    project("p-ridgeline", PROJECT.ridgeline, "approved", { name: "Ridgeline", repo: "wrencastellano/ridgeline", url: "https://github.com/wrencastellano/ridgeline", summary: "An Android app for planning day hikes around weather windows and daylight.", stack: ["Kotlin", "Jetpack Compose", "Room", "Open-Meteo API"], start: "2025-10", end: "2025-11", commits: 14, readAt: at(9) }),
    project("p-quotewell", PROJECT.quotewell, "rejected", { name: "Quotewell", repo: "wrencastellano/quotewell", url: "https://github.com/wrencastellano/quotewell", summary: "Reads carrier quote emails and lines the rates up in one comparison table.", stack: ["Go", "SQLite", "Postmark", "htmx"], start: "2026-09", end: "2026-09", commits: 41, readAt: at(9), rejectedBecause: "Not finished yet" }),
  ];

  const context: Item[] = [
    { ...base("c-bw-team", "approved"), kind: "context", roleKey: ROLE.bw, data: { text: "Brightwater makes soups, broths and frozen meals for grocery chains, about half of it under the stores’ own labels.", factId: itemId("f-bw-skus") }, sources: src("bw", 3, "Brightwater makes soups, broths and frozen meals for grocery chains, about half of it under the stores’ own labels.") },
    { ...base("c-bw-note", "approved"), kind: "context", roleKey: ROLE.bw, data: { text: "No planner before me held it that long.", factId: itemId("f-bw-fill"), from: "your note" }, sources: [] },
    { ...base("c-bw-left", "approved"), kind: "context", roleKey: ROLE.bw, data: { text: "Retail customers charge a penalty for every short shipment.", factId: itemId("f-bw-inventory"), from: "left out of the line" }, sources: src("bw", 3, "our retail customers charge a penalty for every short shipment") },
  ];

  const conflicts: Item[] = [
    {
      ...base("q-ib-end", "proposed"),
      kind: "conflict",
      roleKey: ROLE.ib,
      data: { field: "end", recordSays: "Network Operations Manager at Ironbridge Logistics ended April 2023.", narrativeSays: "The Ironbridge story says you stayed through the terminal handover in August 2023.", narrativeValue: "2023-08", question: "Did you leave Ironbridge in April 2023 or August 2023?" },
      sources: src("ib", 2, "I stayed on through the terminal handover in August 2023."),
    },
  ];

  const S = (id: string, status: Item["status"], name: string, group: string, from?: { roles?: string[]; projects?: string[] }, data?: Partial<Of<"skill">["data"]>) => skill("skill", `s-${id}`, status, name, group, from, data);
  const T = (id: string, status: Item["status"], name: string, group: string, from?: { roles?: string[]; projects?: string[] }, data?: Partial<Of<"skill">["data"]>) => skill("tool", `t-${id}`, status, name, group, from, data);
  const skills: Item[] = [
    S("postgres", "approved", "PostgreSQL", "Database", { projects: [PROJECT.shelfspan, PROJECT.stoopsale] }),
    S("python", "approved", "Python", "Programming", { projects: [PROJECT.brewlog, PROJECT.lanebook] }),
    S("forecasting", "approved", "Demand forecasting", "Planning", { roles: [ROLE.bw, ROLE.kcPlan] }),
    S("sop", "approved", "Sales and operations planning", "Planning", { roles: [ROLE.bw] }),
    S("transport", "proposed", "Transportation planning", "Logistics", { roles: [ROLE.ib], projects: [PROJECT.palletwise, PROJECT.lanebook] }),
    S("negotiation", "proposed", "Supplier negotiation", "Procurement", { roles: [ROLE.kcPlan, ROLE.harbor] }),
    S("negotiation-2", "proposed", "Supplier and carrier contract negotiation", "Procurement", { roles: [ROLE.ib] }, { sameAs: itemId("s-negotiation") }),
    S("routing", "proposed", "Route design", "Logistics", { roles: [ROLE.courier] }),
    S("inventory", "proposed", "Inventory optimization", "Planning", { roles: [ROLE.bw, ROLE.harbor], projects: [PROJECT.shelfspan] }),
    S("capacity", "proposed", "Capacity planning", "Manufacturing", { roles: [ROLE.kcPlan, ROLE.bw] }),
    S("lean", "proposed", "Lean manufacturing", "Manufacturing", { roles: [ROLE.kcLine, ROLE.kcPlan] }),
    S("recall", "proposed", "Lot traceability and recalls", "Quality", { roles: [ROLE.bw] }),
    S("crews", "proposed", "Hiring and training crews", "Leadership", { roles: [ROLE.kcLine, ROLE.harbor] }),
    S("problems", "proposed", "Problem solving", "Leadership", { roles: [ROLE.bw, ROLE.ib] }, { lowValue: "Every posting asks for it; name the problem you solved instead." }),
    S("sql", "proposed", "SQL", "Data", { roles: [ROLE.ib] }),
    S("threejs", "proposed", "Three.js", "Graphics", { projects: [PROJECT.palletwise] }),
    S("tenkey", "rejected", "Ten-key data entry", "Office", { roles: [ROLE.harbor] }, { rejectedBecause: "Too basic to list" }),
    T("excel", "approved", "Excel", "Spreadsheets", { roles: [ROLE.harbor, ROLE.kcPlan] }),
    T("netsuite", "approved", "NetSuite", "ERP", { roles: [ROLE.kcPlan, ROLE.bw] }),
    T("ibp", "proposed", "SAP IBP", "Planning", { roles: [ROLE.bw] }),
    T("powerbi", "proposed", "Power BI", "Analytics", { roles: [ROLE.ib] }),
    T("tms", "proposed", "MercuryGate TMS", "Transportation", { roles: [ROLE.ib] }),
    T("tableau", "proposed", "Tableau", "Analytics", { roles: [ROLE.bw] }),
    T("pos", "proposed", "Square for Retail", "Point of sale", { roles: [ROLE.harbor] }),
    T("planhub", "proposed", "Brightwater Plan Hub", "Internal tools", { roles: [ROLE.bw] }),
    T("erp", "proposed", "ERP system", "ERP", { roles: [ROLE.kcPlan] }, { lowValue: "Name the ERP instead; a posting asks for it by name." }),
    T("postmark", "proposed", "Postmark", "Email", { projects: [PROJECT.quotewell] }),
    skill("certification", "cert-cpim", "proposed", "ASCM CPIM Certification", "Certifications", { roles: [ROLE.kcPlan] }),
  ];

  const insight = (id: string, status: Item["status"], text: string, factIds: string[], data: Partial<Of<"insight">["data"]> = {}): Item => ({ ...base(`ins-${id}`, status), kind: "insight", data: { text, factIds: factIds.map((k) => itemId(`f-${k}`)), ...data }, sources: [] });
  const insights: Item[] = [
    insight("cash", "approved", "You find cash sitting on warehouse shelves and hand it back to the business. At Brightwater you took twelve days of supply out of inventory and freed about $9 million, and at Kettle & Crane you cut raw-material write-offs by a third.", ["bw-inventory", "kcPlan-waste", "harbor-shrink", "bw-skus"]),
    insight("tools", "approved", "Where the planning software stops, you write your own. Your load-planning calculator runs at both Brightwater docks, and your Python forecast replaced a spreadsheet nobody trusted.", ["bw-palletwise", "bw-python", "ib-dash"]),
    insight("trace", "approved", "When something goes wrong in the chain, you trace it back to the one link that caused it, like the pallet supplier behind a year of damage claims or the lots caught up in an allergen recall.", ["ib-claims", "bw-recall", "ib-empty"]),
    insight("one-number", "approved", "You get groups that don’t report to each other to plan from one number: finance, sales, the plants, distributors and carriers.", ["bw-sop", "kcPlan-distributors", "ib-carriers", "pantry-intake"], {
      edited: true,
      history: [{ text: "You are good at running planning meetings.", how: "read", at: at(4) }, { text: "You get groups that don’t report to each other to plan from one number: finance, sales, the plants, distributors and carriers.", how: "edit", was: "proposed", at: at(4, -1) }],
    }),
    insight("rollout", "approved", "You move a whole operation onto new software and stay with it until nobody asks for the old way.", ["ib-tms", "kcPlan-mrp", "harbor-reorder"]),
    insight("floor", "approved", "You learn a process on the floor before you plan it from a desk.", ["kcLine-oee", "kcLine-changeover", "kcPlan-brewhouse"]),
    insight("growth", "approved", "You plan growth the building can actually hold.", ["kcPlan-brewhouse", "kcPlan-seasonals", "bw-skus", "ib-crossdock"]),
    insight("crews", "approved", "You build crews that keep running when you’re off shift.", ["kcLine-crew", "kcLine-changeover", "pantry-routes", "harbor-team"]),
    insight("suppliers", "approved", "You bargain with suppliers using your own numbers, not theirs.", ["kcPlan-cans", "ib-carriers", "harbor-farms", "ib-claims"]),
    insight("visible", "approved", "You make the state of the operation visible to everyone who runs it.", ["ib-dash", "pantry-intake", "ib-team"]),
    insight("service", "proposed", "Your service level holds even while the product line grows under you.", ["bw-fill", "bw-award"]),
    insight("cause", "proposed", "You can show with data whether a miss came from the forecast or from the floor.", ["bw-python", "ib-team"]),
    insight("between", "proposed", "You could sit between planners and the engineers who build planning software.", ["bw-palletwise", "bw-python", "kcPlan-mrp"]),
    insight("volunteer", "rejected", "Your free time goes to logistics problems too.", ["pantry-routes", "pantry-truck"], { rejectedBecause: "That’s volunteering, not a pattern" }),
  ];

  return [...roles, ...facts, ...projects, ...projectFacts, ...context, ...conflicts, ...skills, ...insights];
}

const STORY_TEXT: Record<string, { title: string; kind: Narrative["kind"]; versions: string[]; rejected?: boolean; days: number }> = {
  bw: {
    title: "Brightwater Provisions",
    kind: "career",
    days: 0,
    versions: [
      "I started at Brightwater Provisions in April 2023 as Senior Supply Planning Manager, reporting to the VP of Operations.\n\nI lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods.",
      "I started at Brightwater Provisions in April 2023 as Senior Supply Planning Manager, reporting to the VP of Operations. The title says planning, but most weeks it means deciding what the plants make and what we can promise customers.\n\nI lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods.",
      "I started at Brightwater Provisions in April 2023 as Senior Supply Planning Manager, reporting to the VP of Operations. The title says planning, but most weeks it means deciding what the plants make and what we can promise customers.\n\nBrightwater makes soups, broths and frozen meals for grocery chains, about half of it under the stores’ own labels. Because our retail customers charge a penalty for every short shipment, the fill rate is the number everyone in the building watches.\n\nI lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods. That covers the demand forecast, the production schedule, inventory targets and the monthly S&OP meeting.\n\nThe case fill rate has stayed above 98% every quarter since I started.",
    ],
  },
  pantry: { title: "Three Rivers Pantry Network", kind: "career", days: 5, versions: ["In September 2021 Teodora Mills asked me to run logistics for the Three Rivers Pantry Network.", "In September 2021 Teodora Mills asked me to run logistics for the Three Rivers Pantry Network, as a weekend volunteer. I redrew the delivery routes and found us a refrigerated truck so the pantries could take fresh food."] },
  ib: { title: "Ironbridge Logistics", kind: "career", days: 5, versions: ["I joined Ironbridge Logistics in February 2020 to run network operations for its Pittsburgh terminals.", "I joined Ironbridge Logistics in February 2020 to run network operations for its Pittsburgh terminals, a month before grocery volume doubled. I led the switch to a new transportation management system for about 180 dispatchers and planners.\n\nI stayed on through the terminal handover in August 2023."] },
  kc: { title: "Kettle & Crane Brewing", kind: "career", days: 5, versions: ["I came to Kettle & Crane in June 2015 to supervise the packaging line.", "I came to Kettle & Crane in June 2015 to supervise the packaging line, and hired most of the crew myself. In March 2017 I moved into production planning.\n\nQuality checks moved to the lab team in 2016."] },
  harbor: { title: "Harbor Mill Food Co-op", kind: "career", days: 5, versions: ["I was the purchasing coordinator at Harbor Mill Food Co-op from 2012.", "I was the purchasing coordinator at Harbor Mill Food Co-op from 2012, buying produce and bulk goods for a store with about 4,000 member-owners."] },
  courier: { title: "Northline Couriers", kind: "career", days: 5, versions: ["My first job out of school was dispatching at Northline Couriers.", "My first job out of school was dispatching at Northline Couriers. I started on the radio, and I was running the dispatch desk within a year. I left for Harbor Mill in 2012."] },
  ibNote: { title: "One more thing about Ironbridge", kind: "note", days: 1, versions: ["The system cutover happened over one weekend; I wrote the dispatchers’ cheat sheets the week before."] },
  linkedin: { title: "LinkedIn About text", kind: "note", days: 6, rejected: true, versions: ["Supply planner who enjoys a hard constraint."] },
  goals: { title: "Goals", kind: "goals", days: 5, versions: ["I’ve worked in food and freight operations for fifteen years.", "I’ve worked in food and freight operations for fifteen years. Next I’d like to help build the software planners use.", "I’ve worked in food and freight operations for fifteen years, from a dispatch desk to running S&OP. Next I’d like to help build the software planners use, not only use it."] },
};

function stories(): { narratives: Narrative[]; versions: Version[] } {
  const narratives: Narrative[] = [];
  const versions: Version[] = [];
  let k = 0;
  for (const [key, s] of Object.entries(STORY_TEXT)) {
    const id = storyId(key);
    const updatedAt = at(s.days, k++);
    narratives.push({ _id: id, _creationTime: at(12, k), workspaceId: WS, kind: s.kind, title: s.title, body: s.versions.at(-1)!, version: s.versions.length, updatedAt, ...(s.rejected ? { rejectedAt: at(2) } : {}), ...(key === "ibNote" ? { roleKey: ROLE.ib } : {}) });
    s.versions.forEach((body, i) => versions.push({ _id: `v-${key}-${i + 1}` as Id<"narrativeVersions">, _creationTime: at(12 - i, k), workspaceId: WS, narrativeId: id, version: i + 1, title: s.title, body, at: i === s.versions.length - 1 ? updatedAt : at(12 - i * 3, k) }));
  }
  return { narratives, versions };
}

function notes(): Note[] {
  const note = (id: string, subject: Note["subject"], text: string, daysAgo: number): Note => ({ _id: `note-${id}` as Id<"notes">, _creationTime: at(daysAgo), workspaceId: WS, subject, text, at: at(daysAgo) });
  return [
    note("bw", { kind: "item", id: itemId("role-bw") }, "Ask Gemma for the 2025 fill-rate chart before the next resume.", 2),
    note("palletwise", { kind: "item", id: itemId("p-palletwise") }, "Both shipping leads still use it every day; bring the 3D view to interviews.", 3),
    note("quotewell", { kind: "item", id: itemId("p-quotewell") }, "Add it back once it reads every carrier’s format.", 1),
  ];
}

// Jobs newest first: Ironbridge's story being read, Harbor Mill's paused for budget, the last checks.
function jobs(): Job[] {
  return [
    { kind: "extract", args: { narrativeId: storyId("ib"), version: 2 }, status: "running" },
    { kind: "extract", args: { narrativeId: storyId("harbor"), version: 2 }, status: "paused" },
    { kind: "extract", args: { narrativeId: storyId("bw"), version: 3 }, status: "done", result: { facts: 5, roles: 0 } },
    { kind: "check", args: {}, status: "done", result: { conflicts: 1 } },
    { kind: "duplicates", args: {}, status: "done", result: { duplicates: 1 } },
    { kind: "sameWork", args: { projectKey: PROJECT.palletwise }, status: "done" },
    { kind: "skills", args: {}, status: "done", result: { added: 12 } },
    { kind: "insights", args: {}, status: "done", result: { insights: 3 } },
    { kind: "project", args: { repo: "wrencastellano/quotewell" }, status: "done" },
    { kind: "project", args: { repo: "wrencastellano/palletwise" }, status: "done" },
    { kind: "project", args: { repo: "wrencastellano/brewlog" }, status: "done" },
    { kind: "extract", args: { narrativeId: storyId("kc"), version: 2 }, status: "done", result: { facts: 11, roles: 2 } },
    { kind: "extract", args: { narrativeId: storyId("courier"), version: 2 }, status: "done", result: { facts: 5, roles: 2 } },
    { kind: "extract", args: { narrativeId: storyId("pantry"), version: 2 }, status: "done", result: { facts: 4, roles: 1 } },
  ];
}

// A fresh copy of the record, or a new workspace with nothing in it (`empty`).
export function recordState({ empty = false }: { empty?: boolean } = {}): RecordState {
  n = 0;
  if (empty) return { items: [], narratives: [], versions: [], notes: [], jobs: [], github: { ready: true, connected: null }, presentation: { roles: [], projects: [], skills: [] } };
  const s = stories();
  return {
    items: items(),
    ...s,
    notes: notes(),
    jobs: jobs(),
    github: { ready: true, connected: { account: "wrencastellano", selection: "selected", settingsUrl: "https://github.com/settings/installations/77", at: at(10) } },
    presentation: { roles: [{ roleKey: ROLE.pantry, fold: { into: "previous", bullets: "move" } }], projects: [{ projectKey: PROJECT.ridgeline, hidden: true }], skills: [] },
  };
}

// What rests on an approved project or a narrative they haven't rejected counts (recordContext.sourceCheck, simplified).
function counts(state: RecordState, i: Item) {
  const rejected = new Set(state.narratives.filter((x) => x.rejectedAt !== undefined).map((x) => String(x._id)));
  const approvedProjects = new Set(state.items.filter((p) => p.kind === "project" && p.status === "approved").map((p) => p.projectKey));
  if (i.kind === "project") return true;
  if (i.projectKey) return approvedProjects.has(i.projectKey);
  if (!i.sources.length) return true;
  return i.sources.some((s) => !rejected.has(String(s.narrativeId)));
}

const roleName = (state: RecordState, key: string) => {
  const r = state.items.find((i): i is Of<"role"> => i.kind === "role" && i.roleKey === key && i.status === "approved");
  return r ? [r.data.title, r.data.employer].filter(Boolean).join(", ") : key;
};
const projectName = (state: RecordState, key: string) => state.items.find((i): i is Of<"project"> => i.kind === "project" && i.projectKey === key)?.data.name ?? key;
const latestJob = (state: RecordState, match: (j: Job) => boolean) => state.jobs.find(match);
const patch = (state: RecordState, id: string, change: (i: Item) => Item) => {
  state.items = state.items.map((i) => (i._id === id ? change(i) : i));
};

// What a fact's own decisions do to `state` (adding one, duplicates, same work, where it shows), as the real mutations
// do, simplified. Part of every Record story's answers, since Roles, Projects and Breaks all show facts.
function factAnswers(state: RecordState): Answers {
  const before = new Map<string, Item[]>();
  const change = (id: string, to: (f: Of<"fact">) => Of<"fact">) => {
    state.items = state.items.map((i) => (i._id === id && i.kind === "fact" ? to(i) : i));
  };
  const find = (id: string) => state.items.find((i): i is Of<"fact"> => i._id === id && i.kind === "fact");
  const drop = <T extends object>(data: T, key: keyof T) => {
    const next = { ...data };
    delete next[key];
    return next;
  };
  return {
    ...answer(api.extract.addFact, ({ roleKey, projectKey, text }) => {
      const id = itemId(`f-added-${state.items.length}`);
      const now = Date.now();
      state.items = [...state.items, { _id: id, _creationTime: now, workspaceId: WS, status: "approved", at: now, kind: "fact", ...(roleKey ? { roleKey } : { projectKey }), data: { text, edited: true, history: [{ text, how: "edit", at: now }] }, sources: [] }];
      return id;
    }),
    ...answer(api.extract.removeAddedFact, ({ id }) => {
      state.items = state.items.filter((i) => i._id !== id);
    }),
    ...answer(api.extract.flagOrphan, ({ id, noLongerSaid, sourceDeleted }) => change(id, (f) => ({ ...f, data: { ...f.data, noLongerSaid, sourceDeleted } }))),
    ...answer(api.duplicates.merge, ({ id, keep }) => {
      const fact = find(id)!;
      const other = find(fact.data.duplicateOf!)!;
      const [kept, removed] = keep === "this" ? [fact, other] : [other, fact];
      before.set(removed._id, [fact, other]);
      change(kept._id, (f) => ({ ...f, status: "approved", sources: [...f.sources, ...removed.sources], data: drop(f.data, "duplicateOf") }));
      change(removed._id, (f) => ({ ...f, status: "superseded", data: { ...drop(f.data, "duplicateOf"), mergedInto: kept._id } }));
    }),
    ...answer(api.duplicates.unmerge, ({ id }) => {
      const was = before.get(id) ?? [];
      state.items = state.items.map((i) => was.find((w) => w._id === i._id) ?? i);
    }),
    ...answer(api.duplicates.keepBoth, ({ id, reason }) =>
      change(id, (f) => ({ ...f, data: { ...drop(f.data, "duplicateOf"), keptApart: [String(f.data.duplicateOf)], apartBecause: reason ? [{ id: String(f.data.duplicateOf), reason }] : undefined } })),
    ),
    ...answer(api.duplicates.reopen, ({ id, other }) => change(id, (f) => ({ ...f, data: { ...f.data, duplicateOf: other, keptApart: [], apartBecause: [] } }))),
    ...answer(api.sameWork.connect, ({ id }) => {
      const pair = find(id)!.data.sameWorkAs!;
      change(id, (f) => ({ ...f, data: { ...drop(f.data, "sameWorkAs"), sameWork: pair } }));
      change(pair.factId, (f) => ({ ...f, data: { ...f.data, sameWork: { factId: id, lead: pair.lead } } }));
    }),
    ...answer(api.sameWork.keepSeparate, ({ id, reason }) => {
      const pair = find(id)!.data.sameWorkAs!;
      change(id, (f) => ({ ...f, data: { ...drop(f.data, "sameWorkAs"), keptSeparate: [String(pair.factId)], apartBecause: reason ? [{ id: String(pair.factId), reason }] : undefined } }));
    }),
    ...answer(api.sameWork.reopen, ({ id, other, lead }) => {
      change(other, (f) => ({ ...f, data: drop(f.data, "sameWork") }));
      change(id, (f) => ({ ...f, data: { ...drop(f.data, "sameWork"), sameWorkAs: { factId: other, lead }, keptSeparate: [], apartBecause: [] } }));
    }),
    ...answer(api.sameWork.disconnect, ({ id }) => {
      const other = find(id)!.data.sameWork!.factId;
      const project = find(id)!.projectKey ? id : other;
      const role = project === id ? other : id;
      change(role, (f) => ({ ...f, data: drop(f.data, "sameWork") }));
      change(project, (f) => ({ ...f, data: { ...drop(f.data, "sameWork"), keptSeparate: [String(role)] } }));
    }),
    // The base resume uses every approved fact; two direction resumes the Brightwater ones too.
    ...answer(api.resume.showsFact, ({ id }) => {
      const f = find(id);
      if (!f || f.status !== "approved") return [];
      const base = { key: "base", directionId: null, name: "Base resume" };
      if (f.roleKey !== ROLE.bw) return [base];
      return [base, { key: "i-dir-product", directionId: itemId("dir-product"), name: "Supply Chain Product" }, { key: "i-dir-planning", directionId: itemId("dir-planning"), name: "Supply Planning" }];
    }),
  };
}

// The answers every Record screen's stories share. Queries read `state`; mutations change it.
export function recordAnswers(state: RecordState): Answers {
  const COSTS = { followUp: 0.01, outreach: 0.01, letter: 0.03, ask: 0.01, tailor: 0.04, rankPerRole: 0.0004, read: 0.05, readRevision: 0.03, rewrite: 0.01, disagreements: 0.02, duplicates: 0.02, sameWork: 0.01, skills: 0.02, insights: 0.05, repository: 0.03, resume: 0.04, directionResume: 0.04, resumeLines: 0.01, goals: 0.03, limitRule: 0.01, directionDetail: 0.02, suggestDirections: 0.05, lineCheck: 0.001, lineUpdate: 0.01 };
  return {
    ...answer(api.estimates.costs, () => COSTS),
    ...factAnswers(state),
    ...answer(api.extract.items, () =>
      state.items
        .filter((i) => (i.kind === "role" || i.kind === "fact" || i.kind === "context" || i.kind === "project") && (i.status === "proposed" || i.status === "approved" || i.status === "rejected"))
        .map((doc) => {
          // Destructured rather than picked so each row keeps its kind tied to its data, as extract.items does.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _id, _creationTime, workspaceId, runId, at, ...row } = doc;
          return { id: _id, ...row, counts: counts(state, doc) };
        }),
    ),
    ...answer(api.narratives.list, () =>
      [...state.narratives]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((x) => ({ id: x._id, kind: x.kind, title: x.title, version: x.version, updatedAt: x.updatedAt, rejected: x.rejectedAt !== undefined, rejectedBecause: x.rejectedBecause ?? null, words: x.body.trim() ? x.body.trim().split(/\s+/).length : 0, roleKey: x.roleKey ?? null })),
    ),
    ...answer(api.narratives.get, ({ id }) => {
      const x = state.narratives.find((y) => y._id === id);
      if (!x) return null;
      const versions = state.versions.filter((v) => v.narrativeId === id && v.body.trim()).sort((a, b) => b.version - a.version);
      return { id: x._id, kind: x.kind, title: x.title, body: x.body, version: x.version, rejected: x.rejectedAt !== undefined, rejectedBecause: x.rejectedBecause ?? null, roleKey: x.roleKey ?? null, versions: versions.map((v) => ({ version: v.version, title: v.title, body: v.body, at: v.at })) };
    }),
    ...answer(api.extract.runFor, ({ narrativeId }) => {
      const mine = state.jobs.filter((j) => (j.kind === "extract" || j.kind === "goals") && j.args.narrativeId === narrativeId);
      const job = mine[0];
      const read = mine.filter((j) => j.kind === "extract" && j.status === "done").map((j) => j.args.version as number);
      // Read an hour ago; the newest read version then too.
      return job ? { status: job.status, result: job.result, error: job.error, version: job.args.version as number, lastRead: read.length ? Math.max(...read) : null, at: NOW - 3_600_000, lastReadAt: read.length ? NOW - 3_600_000 : null } : null;
    }),
    ...answer(api.sources.list, () => {
      const run = (key: string) => {
        const j = state.jobs.find((x) => (x.kind === "extract" ? String(x.args.narrativeId) : x.kind === "project" ? `github:${String(x.args.repo).toLowerCase()}` : null) === key);
        return j ? { status: j.status, error: j.error ?? null } : null;
      };
      const cites = (i: Item, id: string) => i.sources.some((s) => s.narrativeId === id);
      return {
        narratives: [...state.narratives]
          .filter((x) => x.kind !== "goals")
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((x) => {
            const mine = state.items.filter((i) => (i.kind === "role" || i.kind === "fact") && cites(i, x._id));
            return {
              id: x._id,
              title: x.title,
              kind: x.kind,
              version: x.version,
              rejected: x.rejectedAt !== undefined,
              rejectedBecause: x.rejectedBecause ?? null,
              approved: mine.filter((i) => i.status === "approved").length,
              proposed: mine.filter((i) => i.status === "proposed").length,
              setAside: state.items.filter((i) => i.status === "setAside" && cites(i, x._id)).length,
              run: run(String(x._id)),
            };
          }),
        projects: Object.fromEntries(
          state.items.flatMap((p) => (p.kind === "project" && p.projectKey ? [[p.projectKey, { setAside: state.items.filter((i) => i.status === "setAside" && i.projectKey === p.projectKey).length, run: run(p.projectKey) }] as const] : [])),
        ),
      };
    }),
    ...answer(api.skills.list, () => {
      const job = latestJob(state, (j) => j.kind === "skills");
      const skills = state.items.filter((i) => i.kind === "skill" || i.kind === "tool" || i.kind === "certification") as Of<"skill" | "tool" | "certification">[];
      const all = skills.filter((i) => i.status !== "superseded" && i.status !== "setAside");
      const byId = new Map(all.map((i) => [String(i._id), i]));
      return {
        last: job ? { status: job.status, error: job.error ?? null, added: (job.result?.added as number | undefined) ?? null } : null,
        items: all.map((i) => {
          const found = i.data.from.facts.flatMap((id) => state.items.filter((f): f is Of<"fact"> => f._id === id && f.kind === "fact" && f.status === "approved"));
          const sources = [
            ...i.data.from.roles.map((k) => {
              const r = state.items.find((x): x is Of<"role"> => x.kind === "role" && x.roleKey === k && x.status === "approved") ?? state.items.find((x): x is Of<"role"> => x.kind === "role" && x.roleKey === k);
              return { kind: "role" as const, key: k, id: r?._id ?? null, title: r?.data.title ?? k, employer: r?.data.employer ?? null, start: r?.data.start ?? null, end: r?.data.end ?? null, facts: found.filter((f) => f.roleKey === k && !f.projectKey).length, approved: r?.status === "approved" };
            }),
            ...i.data.from.projects.map((k) => {
              const p = state.items.find((x): x is Of<"project"> => x.kind === "project" && x.projectKey === k);
              return { kind: "project" as const, key: k, id: p?._id ?? null, title: p?.data.name ?? k, employer: null, start: p?.data.start ?? null, end: p?.data.end ?? null, facts: found.filter((f) => f.projectKey === k).length, approved: p?.status === "approved" };
            }),
          ];
          const counts = sources.length === 0 || sources.some((s) => s.approved);
          const other = i.data.sameAs ? byId.get(String(i.data.sameAs)) : undefined;
          return {
            id: i._id,
            kind: i.kind,
            status: i.status,
            name: i.data.name,
            group: i.data.group ?? null,
            issuer: i.data.issuer ?? null,
            earned: i.data.earned ?? null,
            lowValue: i.data.lowValue ?? null,
            rejectedBecause: i.data.rejectedBecause ?? null,
            edited: !!i.data.edited,
            counts,
            blockedBy: counts ? [] : sources.filter((s) => !s.approved).map((s) => s.title),
            sameAs: other && other.status !== "rejected" ? { id: other._id, name: other.data.name, why: i.data.sameWhy ?? null } : null,
            sources,
            facts: found.map((f) => ({ id: f._id, text: f.data.text, source: f.projectKey ? projectName(state, f.projectKey) : f.roleKey ? roleName(state, f.roleKey).replace(", ", " · ") : "" })),
            // The record's stories have no resumes; a screen's stories count them.
            resumes: 0,
            merged: skills.filter((g) => g.status === "superseded" && g.data.mergedInto === i._id).map((g) => ({ id: g._id, name: g.data.name })),
            apart: (i.data.keptApart ?? []).flatMap((id) => {
              const o = byId.get(id);
              return o ? [{ id: o._id, name: o.data.name, reason: i.data.apartBecause?.find((a) => a.id === id)?.reason ?? o.data.apartBecause?.find((a) => a.id === String(i._id))?.reason ?? null }] : [];
            }),
          };
        }),
      };
    }),
    ...answer(api.insights.list, () => {
      const job = latestJob(state, (j) => j.kind === "insights");
      const facts = new Map(state.items.filter((i): i is Of<"fact"> => i.kind === "fact").map((f) => [String(f._id), f]));
      return {
        last: job ? { status: job.status, error: job.error, added: job.result?.insights ?? null } : null,
        insights: state.items
          .filter((i): i is Of<"insight"> => i.kind === "insight" && (i.status === "proposed" || i.status === "approved" || i.status === "rejected"))
          .map((i) => ({
            id: i._id,
            status: i.status,
            data: i.data,
            basedOn: i.data.factIds.map((id) => {
              const f = facts.get(id);
              const project = f?.projectKey ? projectName(state, f.projectKey) : undefined;
              return { id, text: f?.data.text ?? "(fact removed)", counts: !!f && f.status === "approved" && counts(state, f), project, role: project ? undefined : f?.roleKey ? roleName(state, f.roleKey) : undefined, roleKey: f?.roleKey ?? null, projectKey: f?.projectKey ?? null };
            }),
            usedIn: [],
          })),
      };
    }),
    ...answer(api.notes.list, ({ subject }) =>
      state.notes.filter((x) => x.subject.kind === subject.kind && x.subject.id === subject.id).sort((a, b) => a.at - b.at).map((x) => ({ id: x._id, text: x.text, at: x.at, editedAt: x.editedAt ?? null })),
    ),
    ...answer(api.notes.add, ({ subject, text }) => {
      const id = `note-${state.notes.length + 1}-${Date.now()}` as Id<"notes">;
      state.notes = [...state.notes, { _id: id, _creationTime: Date.now(), workspaceId: WS, subject, text: text.trim(), at: Date.now() }];
      return id;
    }),
    ...answer(api.notes.edit, ({ id, text }) => {
      state.notes = state.notes.map((x) => (x._id === id ? { ...x, text: text.trim(), editedAt: Date.now() } : x));
    }),
    ...answer(api.notes.remove, ({ id }) => {
      state.notes = state.notes.filter((x) => x._id !== id);
    }),
    ...answer(api.github.status, () => state.github),
    ...answer(api.projects.runs, () => {
      const runs: Record<string, { status: Job["status"]; error: string | null }> = {};
      for (const j of state.jobs) if (j.kind === "project" && !runs[String(j.args.repo).toLowerCase()]) runs[String(j.args.repo).toLowerCase()] = { status: j.status, error: j.error ?? null };
      return { runs, inRecord: state.items.flatMap((p) => (p.kind === "project" && p.status !== "rejected" ? [p.data.repo.toLowerCase()] : [])) };
    }),
    ...answer(api.sameWork.last, () => {
      const out: Record<string, { status: Job["status"]; error: string | null }> = {};
      for (const j of state.jobs) if (j.kind === "sameWork" && !out[String(j.args.projectKey)]) out[String(j.args.projectKey)] = { status: j.status, error: j.error ?? null };
      return out;
    }),
    ...answer(api.conflicts.list, () =>
      state.items.filter((i): i is Of<"conflict"> => i.kind === "conflict" && i.status === "proposed").map((c) => ({ id: c._id, roleKey: c.roleKey, data: c.data, sources: c.sources })),
    ),
    ...answer(api.conflicts.lastCheck, () => {
      const j = latestJob(state, (x) => x.kind === "check");
      return j ? { status: j.status, error: j.error, result: j.result } : null;
    }),
    ...answer(api.duplicates.last, () => {
      const j = latestJob(state, (x) => x.kind === "duplicates");
      return j ? { status: j.status, error: j.error } : null;
    }),
    ...answer(api.resume.presentation, () => ({ ...state.presentation, length: "two" as const })),
    ...answer(api.resume.setPresentation, ({ roleKey, ...change }) => {
      const rest = state.presentation.roles.filter((r) => r.roleKey !== roleKey);
      // The placement is replaced as given; only the role's title choices are kept.
      const was = state.presentation.roles.find((r) => r.roleKey === roleKey);
      const titles = was ? { title: was.title, translated: was.translated, source: was.source } : {};
      state.presentation = { ...state.presentation, roles: [...rest, { ...titles, roleKey, ...change }] };
    }),
    ...answer(api.resume.setProjectPresentation, ({ projectKey, hidden }) => {
      state.presentation = { ...state.presentation, projects: [...state.presentation.projects.filter((p) => p.projectKey !== projectKey), { projectKey, hidden }] };
    }),

    // Reviewing and rewording, as extract.ts does it (simplified: no history for roles and projects).
    ...answer(api.extract.review, ({ id, status, note }) =>
      patch(state, id, (i) => {
        const reason = status === "rejected" ? note?.trim() || null : null;
        if (i.kind === "fact" || i.kind === "insight") {
          const history = i.data.history?.length ? i.data.history : [{ text: i.data.text, how: "read" as const, at: 0 }];
          const log = status === "rejected" ? [{ text: i.data.text, how: "rejected" as const, note: reason ?? undefined, at: Date.now() }] : i.status === "approved" && status === "proposed" ? [{ text: i.data.text, how: "unapproved" as const, at: Date.now() }] : [];
          return { ...i, status, data: { ...i.data, history: [...history, ...log], rejectedBecause: reason } } as Item;
        }
        if ("rejectedBecause" in i.data || i.kind === "role" || i.kind === "project" || i.kind === "skill" || i.kind === "tool" || i.kind === "certification") return { ...i, status, data: { ...i.data, rejectedBecause: reason } } as Item;
        return { ...i, status } as Item;
      }),
    ),
    ...answer(api.extract.edit, ({ id, text }) =>
      patch(state, id, (i) => {
        if (i.kind !== "fact" && i.kind !== "insight") return i;
        const history = i.data.history?.length ? i.data.history : [{ text: i.data.text, how: "read" as const, at: 0 }];
        return { ...i, status: "approved", data: { ...i.data, text, edited: true, suggestion: null, history: [...history, { text, how: "edit" as const, was: i.status, at: Date.now() }] } } as Item;
      }),
    ),
    ...answer(api.extract.rework, ({ id, note }) =>
      patch(state, id, (i) => (i.kind === "fact" ? { ...i, data: { ...i.data, suggestion: { pending: true, note, at: Date.now() } } } : i)),
    ),
    ...answer(api.extract.acceptSuggestion, ({ id }) =>
      patch(state, id, (i) => {
        if ((i.kind !== "fact" && i.kind !== "insight") || !i.data.suggestion?.text) return i;
        const history = i.data.history?.length ? i.data.history : [{ text: i.data.text, how: "read" as const, at: 0 }];
        const text = i.data.suggestion.text;
        return { ...i, status: "approved", data: { ...i.data, text, suggestion: null, history: [...history, { text, how: "rewrite" as const, note: i.data.suggestion.note, was: i.status, at: Date.now() }] } } as Item;
      }),
    ),
    ...answer(api.extract.dismissSuggestion, ({ id, reason }) =>
      patch(state, id, (i) => {
        if ((i.kind !== "fact" && i.kind !== "insight") || !i.data.suggestion) return i;
        const history = i.data.history?.length ? i.data.history : [{ text: i.data.text, how: "read" as const, at: 0 }];
        const entry = i.data.suggestion.text ? [{ text: i.data.suggestion.text, how: "dismissed" as const, note: i.data.suggestion.note, reason: reason?.trim() || undefined, at: Date.now() }] : [];
        return { ...i, data: { ...i.data, suggestion: null, history: [...history, ...entry] } } as Item;
      }),
    ),
    ...answer(api.extract.revertWording, ({ id }) =>
      patch(state, id, (i) => {
        if (i.kind !== "fact" && i.kind !== "insight") return i;
        const history = i.data.history ?? [];
        const last = history.at(-1);
        if (!last || !(last.how === "edit" || last.how === "rewrite" || last.how === "dismissed")) return i;
        const rest = history.slice(0, -1);
        const text = last.how === "dismissed" ? i.data.text : (rest.findLast((h) => h.how !== "dismissed")?.text ?? i.data.text);
        const suggestion = last.how === "edit" ? null : { text: last.text, note: last.note, at: last.at };
        return { ...i, status: last.how === "dismissed" ? i.status : (last.was ?? i.status), data: { ...i.data, text, history: rest, suggestion } } as Item;
      }),
    ),
    ...answer(api.extract.moveFact, ({ id, roleKey }) => patch(state, id, (i) => ({ ...i, roleKey }) as Item)),
    ...answer(api.extract.keepOrphan, ({ id }) => patch(state, id, (i) => (i.kind === "fact" ? ({ ...i, data: { ...i.data, noLongerSaid: null, sourceDeleted: null } } as Item) : i))),
  };
}

// The record and its answers, for one story.
export function recordFixture(opts: { empty?: boolean } = {}) {
  const state = recordState(opts);
  return { state, answers: recordAnswers(state) };
}
