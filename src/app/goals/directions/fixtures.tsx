import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ResumeDoc } from "../../../../convex/resumeDoc";
import { answer, type Answers } from "../../storyConvex";
import type { Direction, GoalsItem } from "./words";

// Fixture data for the Directions stories, from the fixture persona's record: eight approved directions (Supply Chain
// Product and Solutions Consulting fully approved, the rest with positioning and criteria to review) and nine suggested
// ones, with Supply Chain Product's resume and the three resumes tailored from it. Mutations change the fixtures as the
// real ones change the data.

type ResumeList = FunctionReturnType<typeof api.resume.list>;
type Overview = FunctionReturnType<typeof api.resume.overview>;
type Note = FunctionReturnType<typeof api.notes.list>[number];
type Data = Direction["data"];

const at = (iso: string) => new Date(iso).getTime();
const NARRATIVE = "narr-goals" as Id<"narratives">;

const FACTS = {
  skus: "Lead supply planning for 640 SKUs across two company plants and two co-packers, roughly $210 million a year in cost of goods, covering the demand forecast, production schedule, inventory targets and monthly S&OP.",
  fill: "Held the case fill rate above 98% for eight consecutive quarters for grocery customers that charge a penalty on every short shipment.",
  inventory: "Reduced finished-goods inventory from 41 to 29 days of supply with no loss of service, releasing approximately $9 million in working capital.",
  recall: "Contained a supplier’s allergen recall within 36 hours by tracing every affected lot across both plants and both co-packers and rebuilding the production schedule around the held stock.",
  award: "Named Brightwater Provisions’ Operator of the Year for 2025 for moving production out of a closing plant without missing a retail order.",
  sop: "Rebuilt the monthly sales and operations planning process so finance, sales and both plants commit to a single demand number.",
  python: "Replaced a 40-tab spreadsheet forecast with a Python model the demand team reruns every Monday, raising forecast accuracy from 61% to 74%.",
  palletwise: "Built a load-planning calculator, now used on the shipping docks at both plants, that fits more cases onto every outbound truck.",
  tms: "Led the rollout of a new transportation management system to about 180 dispatchers and planners at four terminals, including the cheat sheets for a one-weekend cutover.",
  empty: "Cut empty miles by 11% by matching backhauls between terminals that had been planning them separately.",
  carriers: "Ran quarterly scorecard reviews with the network’s 30 largest carriers and used on-time and claims data to reset rates each spring.",
  crossdock: "Opened the Ohio Valley cross-dock and planned its first 40 lanes.",
  claims: "Traced rising damage claims to a single pallet supplier and replaced it, lowering claims costs by about $380,000 a year.",
  dash: "Built the Power BI terminal scorecard every site manager reviews on Monday morning, fed by a team of six analysts producing weekly cost-per-mile reporting.",
  mrp: "Implemented the brewery’s first MRP in NetSuite, linking brew schedules to malt, hop and can purchasing.",
  cans: "Negotiated a two-year aluminum can contract that held its price through the 2018 tariff increases.",
  brewhouse: "Planned capacity for a second brewhouse that grew annual output from 38,000 to 70,000 barrels.",
  distributors: "Introduced a weekly forecast shared with 22 distributors, ending recurring summer stockouts of the flagship lager.",
  writeOffs: "Cut raw-material write-offs by 35% with first-expired, first-out rules and monthly cycle counts.",
  oee: "Raised canning line efficiency from 58% to 81% by standardizing changeovers between can sizes.",
  crew: "Hired and trained a 12-person packaging crew across two shifts and went 700 days without a recordable injury on the packaging floor.",
  shrink: "Lowered produce shrink from 9% to 5% by ordering against daily sales rather than weekly estimates.",
  routes: "Designed weekend delivery routes for 14 partner pantries run by about 60 volunteer drivers, and secured a donated refrigerated truck so the network could accept fresh produce.",
};
type FactKey = keyof typeof FACTS;
const story = (text: string, keys: FactKey[], how?: string) => ({ text, factIds: keys as string[], ...(how ? { how } : {}) });

const map = (pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));

type Spec = {
  id: string;
  status: "approved" | "proposed" | "rejected";
  data: Data;
  quotes?: string[];
  evidence?: FactKey[];
};

const PRODUCT_VOCAB = ["product discovery", "roadmap", "user research", "planner workflows", "demand forecasting", "S&OP", "supply planning", "inventory optimization", "MRP", "TMS", "requirements", "beta programs", "adoption", "data models"];

const SPECS: Spec[] = [
  {
    id: "dir-planning",
    status: "approved",
    quotes: ["planning or logistics leadership", "If I stay in planning or logistics leadership, it has to be director-level scope"],
    data: {
      name: "Supply Planning",
      path: "continue",
      summary:
        "You run supply planning for 640 SKUs across two plants and two co-packers, about $210 million a year in cost of goods, and the case fill rate has held above 98% for eight straight quarters. If you stay in planning, the next job has to come with a bigger network and a team, not another senior manager seat.",
      detail: {
        positioning:
          "You lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods, covering the forecast, the production schedule, inventory targets and S&OP. The case fill rate has held above 98% for eight straight quarters while inventory fell from 41 to 29 days of supply, and Brightwater named you Operator of the Year for 2025.",
        targetTitles: ["Director of Supply Planning", "Senior Manager, Supply Planning", "Supply Planning Manager", "Head of Supply Chain Planning"],
        vocabulary: ["S&OP", "fill rate", "days of supply", "co-manufacturing", "production scheduling", "MRP"],
        carriesOver: [story("Kept the case fill rate above 98% for eight straight quarters and was named Brightwater’s Operator of the Year for 2025.", ["fill", "award"]), story("Took finished goods from 41 to 29 days of supply, freeing about $9 million in working capital.", ["inventory"])],
        reframe: [],
        titleMap: map([
          ["Senior Supply Planning Manager (Brightwater Provisions)", "Director of Supply Planning"],
          ["Network Operations Manager (Ironbridge Logistics)", "Supply Chain Planning Manager"],
          ["Production Planning Lead (Kettle & Crane Brewing)", "Senior Production Planner or Materials Planning Manager"],
          ["Purchasing Coordinator (Harbor Mill Food Co-op)", "Inventory Planner"],
          ["Packaging Line Supervisor (Kettle & Crane Brewing)", "Production Supervisor"],
          ["Volunteer Logistics Lead (Three Rivers Pantry Network)", "Logistics Coordinator"],
        ]),
      },
      detailStatus: "proposed",
      criteria: {
        titles: ["Supply Planning Manager", "Senior Manager, Supply Planning", "Supply Planning Lead", "Director of Supply Planning", "Director of Supply Chain Planning", "S&OP Director", "Head of Planning", "Integrated Business Planning Manager"],
        industries: ["industrial", "ecommerce", "healthcare", "robotics", "other"],
        sizes: ["201-1000", "1001-5000", "5001+"],
        stages: ["series c+", "public", "private equity"],
        keywords: ["supply planning", "S&OP", "integrated business planning", "demand planning", "inventory optimization", "fill rate", "production scheduling", "co-manufacturing", "MRP", "capacity planning", "days of supply", "service level", "SAP IBP"],
      },
      criteriaStatus: "proposed",
    },
  },
  {
    id: "dir-logistics",
    status: "approved",
    quotes: ["planning or logistics leadership"],
    data: {
      name: "Logistics Operations",
      path: "continue",
      summary: "You run freight networks: carriers, terminals, lanes and the systems that tie them together. At Ironbridge you opened the Ohio Valley cross-dock, cut empty miles by 11% and lowered damage claims by about $380,000 a year.",
      detail: {
        positioning: "You ran network operations for Ironbridge Logistics’ Pittsburgh terminals, opened the Ohio Valley cross-dock with its first 40 lanes, and managed the six analysts behind the weekly cost-per-mile report. Matching backhauls between terminals cut empty miles by 11%, and replacing one pallet supplier lowered damage claims by about $380,000 a year.",
        targetTitles: ["Director of Logistics", "Transportation Manager", "Distribution Operations Manager"],
        vocabulary: ["lane planning", "carrier management", "cost per mile", "cross-docking"],
        carriesOver: [story("Cut empty miles by 11% by matching backhauls between terminals that had planned them separately.", ["empty"])],
        reframe: [],
        titleMap: map([
          ["Network Operations Manager (Ironbridge Logistics)", "Logistics Manager or Transportation Manager"],
          ["Dispatch Supervisor (Northline Couriers)", "Fleet Operations Manager"],
          ["Volunteer Logistics Lead (Three Rivers Pantry Network)", "Distribution Coordinator or Logistics Lead"],
        ]),
      },
      detailStatus: "proposed",
      criteria: {
        titles: ["Senior Manager, Logistics", "Logistics Lead", "Director of Logistics", "Transportation Manager", "Director of Transportation", "Head of Distribution", "Senior Manager, Network Operations", "VP of Logistics", "Freight Operations Manager"],
        industries: ["ecommerce", "industrial", "healthcare", "robotics", "other", "consulting"],
        sizes: ["201-1000", "1001-5000", "5001+"],
        stages: ["series b", "series c+", "public", "private equity"],
        keywords: [],
      },
      criteriaStatus: "proposed",
    },
  },
  {
    id: "dir-product",
    status: "approved",
    quotes: ["I’d like to help build the tools planners use", "as a product manager on a supply chain product, not only use them"],
    data: {
      name: "Supply Chain Product",
      path: "adjacent",
      includes: ["Planning Software", "Logistics Software", "Technical Product Manager", "Product Owner"],
      summary:
        "You want to build the software planners use instead of working around it. You have planned in NetSuite, SAP IBP and MercuryGate, written your own Python forecast and load planner where they fell short, and moved 180 dispatchers onto a new TMS, so you know where these tools break on a real plant floor.",
      detail: {
        positioning:
          "You have spent fifteen years on the user’s side of planning software and built your own tools where it stopped: a Python forecast that lifted accuracy from 61% to 74%, and a load-planning calculator both Brightwater plants use on their docks. You also took 180 dispatchers and planners onto a new transportation system, so you know what makes planners adopt a tool or quietly go back to the spreadsheet.",
        targetTitles: ["Product Manager, Supply Chain", "Senior Product Manager", "Product Manager, Planning", "Product Manager, Transportation", "Technical Product Manager", "Group Product Manager", "Product Lead, Supply Chain", "Senior Product Manager, Forecasting"],
        vocabulary: PRODUCT_VOCAB,
        carriesOver: [
          story("Built a load-planning calculator that the shipping docks at both Brightwater plants use on every outbound truck.", ["palletwise"]),
          story("Replaced a 40-tab spreadsheet with a Python forecast that raised accuracy from 61% to 74%.", ["python"]),
          story("Set up Kettle & Crane’s first MRP in NetSuite, tying brew schedules to malt, hop and can orders.", ["mrp"]),
          story("Moved about 180 dispatchers and planners at four terminals onto a new transportation management system.", ["tms"]),
          story("Rebuilt Brightwater’s S&OP so finance, sales and both plants plan from one demand number.", ["sop"]),
        ],
        reframe: [
          story(
            "Your planning job is product work in disguise: every week you find what the software can’t do and build the workaround, from the forecast model to the load calculator, for a 640-SKU operation.",
            ["python", "palletwise", "skus"],
            "Describe the tools you built as products with users, adoption and results, not as side projects.",
          ),
          story(
            "The TMS rollout was a product launch: you learned how 180 dispatchers actually worked, wrote their guides for the cutover and measured adoption on the terminal scorecard.",
            ["tms", "dash"],
            "Lead with what you learned about users during the rollout, not the project schedule.",
          ),
        ],
        titleMap: map([
          ["Senior Supply Planning Manager (Brightwater Provisions)", "Product Manager, Supply Planning"],
          ["Network Operations Manager (Ironbridge Logistics)", "Product Manager, Transportation"],
          ["Production Planning Lead (Kettle & Crane Brewing)", "Product Specialist, Manufacturing Planning"],
          ["Packaging Line Supervisor (Kettle & Crane Brewing)", "Manufacturing Domain Expert"],
          ["Purchasing Coordinator (Harbor Mill Food Co-op)", "Procurement Product Analyst"],
          ["Volunteer Logistics Lead (Three Rivers Pantry Network)", "Logistics Program Lead"],
        ]),
      },
      detailStatus: "approved",
      criteria: {
        titles: ["Product Manager, Supply Chain", "Senior Product Manager", "Product Manager, Planning", "Product Manager, Transportation", "Technical Product Manager", "Group Product Manager", "Product Lead, Supply Chain", "Senior Product Manager, Forecasting"],
        industries: ["data infrastructure", "ai", "robotics", "industrial", "ecommerce"],
        sizes: ["11-50", "51-200", "201-1000", "1001-5000"],
        stages: ["seed", "series a", "series b", "series c+", "public", "private equity"],
        keywords: ["supply chain software", "supply planning", "demand forecasting", "S&OP", "inventory optimization", "transportation management", "TMS", "MRP", "planner workflows", "product discovery", "roadmap", "user research", "manufacturing", "logistics"],
      },
      criteriaStatus: "approved",
    },
  },
  {
    id: "dir-solutions",
    status: "approved",
    quotes: ["solutions consulting: sitting with a planning team that’s about to buy software"],
    data: {
      name: "Solutions Consulting",
      path: "adjacent",
      summary:
        "You sit between a planning team and the software it is about to buy: learn how their week really runs, show where the tool fits, and prove it pays. You moved 180 dispatchers onto a new TMS, set up a brewery’s first MRP, and built a Power BI scorecard and a Python forecast that turned planning data into decisions.",
      detail: {
        positioning:
          "You translate between the floor and the code: you set up Kettle & Crane’s first MRP in NetSuite, led a transportation system rollout for 180 dispatchers and planners at four terminals, and built the Power BI scorecard every Ironbridge terminal manager opens on Monday. You can sit in a buyer’s S&OP meeting and tell which of their problems the software actually solves.",
        targetTitles: ["Solutions Consultant", "Solutions Engineer"],
        vocabulary: ["discovery", "demos", "proof of value", "implementation"],
        carriesOver: [story("Led a transportation management system rollout for about 180 dispatchers and planners at four terminals.", ["tms"]), story("Set up a brewery’s first MRP in NetSuite, tying production schedules to purchasing.", ["mrp"])],
        reframe: [],
        titleMap: map([
          ["Network Operations Manager (Ironbridge Logistics)", "Solutions Consultant or Implementation Consultant"],
          ["Senior Supply Planning Manager (Brightwater Provisions)", "Principal Solutions Consultant, Supply Planning"],
          ["Production Planning Lead (Kettle & Crane Brewing)", "Solutions Engineer, Manufacturing"],
        ]),
      },
      detailStatus: "approved",
      criteria: {
        titles: ["Solutions Consultant", "Solutions Engineer", "Sales Engineer", "Solutions Architect", "Value Engineer", "Presales Consultant", "Supply Chain Solutions Consultant", "Principal Solutions Consultant"],
        industries: ["data infrastructure", "ai", "robotics", "industrial", "ecommerce", "consulting"],
        sizes: ["11-50", "51-200", "201-1000", "1001-5000"],
        stages: ["seed", "series a", "series b", "series c+"],
        keywords: [],
      },
      criteriaStatus: "approved",
    },
  },
  ...(
    [
      [
        "dir-procurement",
        "Procurement",
        "adjacent",
        "the supplier negotiation where my numbers beat theirs",
        "You negotiate with suppliers and carriers using your own data. You locked a two-year can contract that held its price through the 2018 tariffs, reset carrier rates each spring from quarterly scorecards, and grew a co-op’s local-farm program from 9 to 31 suppliers.",
        "You buy with your own numbers: at Kettle & Crane you negotiated an aluminum can contract that held its price through the 2018 tariffs, and at Ironbridge you reset rates with the 30 largest carriers from on-time and claims data.",
        ["Procurement Manager", "Strategic Sourcing Manager", "Category Manager, Packaging", "Director of Procurement"],
        ["industrial", "ecommerce", "healthcare", "robotics", "other"],
        ["201-1000", "1001-5000", "5001+"],
        ["series c+", "public", "private equity"],
        [story("Negotiated a two-year can contract that held its price through the 2018 tariff increases.", ["cans"]), story("Reset carrier rates each spring from quarterly scorecards with the 30 largest carriers.", ["carriers"])],
      ],
      [
        "dir-analytics",
        "Operations Analytics",
        "adjacent",
        "the analysis that finds where the money is sitting in a network",
        "You find where money is hiding in an operation and prove it with data. You traced a year of rising damage claims to one pallet supplier, saving about $380,000 a year, and replaced a spreadsheet forecast with a Python model that lifted accuracy from 61% to 74%.",
        "You turn operating data into decisions people act on: at Ironbridge you managed six analysts and built the Power BI scorecard every terminal manager opens on Monday, and you traced rising damage claims to one pallet supplier, cutting about $380,000 a year.",
        ["Operations Analytics Manager", "Supply Chain Analytics Manager", "Analytics Lead, Supply Chain", "Director of Operations Analytics"],
        ["data infrastructure", "ai", "ecommerce", "industrial", "robotics", "healthcare"],
        ["51-200", "201-1000", "1001-5000", "5001+"],
        ["series b", "series c+", "public", "private equity"],
        [story("Built the Power BI terminal scorecard that every Ironbridge site manager reviews each Monday.", ["dash"]), story("Traced rising damage claims to one pallet supplier, lowering claims costs about $380,000 a year.", ["claims"])],
      ],
      [
        "dir-plant",
        "Plant Operations",
        "adjacent",
        "I still miss the plant floor",
        "You learned operations on a packaging line and still think in changeovers and crew schedules. At Kettle & Crane you raised canning line efficiency from 58% to 81%, trained a 12-person crew, and later planned the second brewhouse that nearly doubled output.",
        "Present yourself as an operations leader who came up on the line and then planned the whole plant. Lead with the canning line you took from 58% to 81% efficiency and the second brewhouse that took output from 38,000 to 70,000 barrels.",
        ["Plant Manager", "Operations Manager", "Production Manager", "Director of Manufacturing Operations"],
        ["industrial", "robotics", "healthcare", "hardware and semiconductors", "energy", "other"],
        ["201-1000", "1001-5000", "5001+"],
        ["series c+", "public", "private equity"],
        [story("Raised canning line efficiency from 58% to 81% by standardizing changeovers between can sizes.", ["oee"])],
      ],
      [
        "dir-consulting",
        "Independent Consulting",
        "stretch",
        "Someday I’d like to consult on my own for mid-size food makers who can’t afford a big firm.",
        "You want to work for yourself eventually, helping mid-size food makers fix their planning without hiring a large firm, and you already carry the toolkit: S&OP, inventory targets and the software you built along the way.",
        "You have already fixed the problems mid-size food makers bring to consultants: at Brightwater you rebuilt S&OP around a single demand number and took twelve days of supply out of inventory, freeing about $9 million.",
        ["Independent Consultant", "Supply Chain Consultant", "Principal Consultant", "Fractional Head of Supply Chain"],
        ["consulting", "industrial", "ecommerce"],
        ["1-10", "11-50"],
        ["bootstrapped", "seed", "series a"],
        [],
      ],
    ] as const
  ).map(
    ([id, name, path, quote, summary, positioning, titles, industries, sizes, stages, carriesOver]): Spec => ({
      id,
      status: "approved",
      quotes: [quote],
      data: {
        name,
        path,
        summary,
        detail: { positioning, targetTitles: [...titles], vocabulary: [], carriesOver: [...carriesOver], reframe: [], titleMap: [] },
        detailStatus: "proposed",
        criteria: { titles: [...titles], industries: [...industries], sizes: [...sizes], stages: [...stages], keywords: [] },
        criteriaStatus: "proposed",
      },
    }),
  ),
  {
    id: "dir-network",
    status: "proposed",
    evidence: ["crossdock", "empty"],
    data: {
      name: "Network Design",
      path: "adjacent",
      suggested: true,
      addsTo: "dir-logistics" as Id<"items">,
      includes: ["Network Design", "Network Strategy", "Supply Chain Modeling"],
      summary:
        "You opened the Ohio Valley cross-dock and planned its first 40 lanes, cut empty miles by 11% by matching backhauls between terminals, and built Lanebook, a lane-by-lane freight rate benchmark, on your own time. Shippers redrawing their networks need people who can model lanes and facilities and then run what they modeled.",
      detail: {
        positioning: "Present yourself as a network designer who has opened a facility and run its lanes afterward, so your models account for what happens on the dock.",
        targetTitles: ["Network Design Manager", "Network Strategy Manager"],
        vocabulary: [],
        carriesOver: [],
        reframe: [],
        titleMap: map([
          ["Network Operations Manager", "Network Design Manager"],
          ["Senior Supply Planning Manager", "Network Strategy Manager"],
          ["Production Planning Lead", "Supply Chain Modeling Analyst"],
        ]),
      },
      detailStatus: "proposed",
      criteria: {
        titles: ["Network Design Manager", "Network Strategy Manager", "Supply Chain Modeling Manager", "Distribution Network Planner", "Supply Chain Strategy Manager", "Network Optimization Lead"],
        industries: ["ecommerce", "industrial", "robotics", "healthcare", "data infrastructure", "consulting", "ai", "other"],
        sizes: ["11-50", "51-200", "201-1000", "1001-5000", "5001+"],
        stages: ["seed", "series a", "series b", "series c+", "public"],
        keywords: [],
      },
      criteriaStatus: "proposed",
    },
  },
  ...(
    [
      ["dir-demand", "Demand Planning", ["Demand Planning Manager", "Forecasting"], "You replaced a 40-tab spreadsheet with a Python forecast that lifted accuracy from 61% to 74%, and at Kettle & Crane you started a weekly forecast shared with 22 distributors that ended the summer stockouts.", ["python", "distributors"]],
      ["dir-coldchain", "Cold Chain Operations", ["Cold Chain Operations Manager", "Temperature-Controlled Logistics"], "You plan frozen and refrigerated food every day at Brightwater, and at the pantry network you set up the temperature logs that let a donated refrigerated truck carry fresh produce.", ["skus", "routes"]],
      ["dir-dc", "Distribution Center Management", ["Distribution Center Manager", "Warehouse Operations"], "You opened the Ohio Valley cross-dock and planned its first 40 lanes, and your load-planning calculator runs on the shipping docks at both Brightwater plants.", ["crossdock", "palletwise"]],
      ["dir-foodsafety", "Food Safety Operations", ["Food Safety Manager", "Quality Operations"], "You contained a supplier’s allergen recall in 36 hours by tracing every affected lot through two plants and two co-packers. Food makers and grocers hire people who can run a recall without losing a customer.", ["recall"]],
      ["dir-transport", "Transportation Management", ["Transportation Manager", "Carrier Relations"], "You ran quarterly scorecards with the 30 largest carriers in the Ironbridge network and matched backhauls to cut empty miles by 11%.", ["carriers", "empty"]],
      ["dir-startup-ops", "Startup Operations", ["Head of Operations", "Founding Operations"], "You have built operations from very little: a volunteer delivery network for 14 pantries, a brewery’s first MRP and a cross-dock’s first lanes.", ["routes", "mrp"]],
      ["dir-ci", "Continuous Improvement", ["Continuous Improvement Manager", "Lean Operations"], "You raised line efficiency, cut write-offs and lowered produce shrink by changing how the work is done rather than adding people.", ["oee", "shrink"]],
      ["dir-materials", "Materials Management", ["Materials Manager", "Inventory Control"], "You cut raw-material write-offs by 35% with first-expired, first-out rules and monthly cycle counts, and took finished goods from 41 to 29 days of supply.", ["writeOffs", "inventory"]],
    ] as const
  ).map(
    ([id, name, titles, summary, evidence]): Spec => ({
      id,
      status: "proposed",
      evidence: [...evidence],
      data: { name, path: "adjacent", suggested: true, summary, criteria: { titles: [...titles], industries: ["industrial", "ecommerce", "robotics"], sizes: [], stages: [], keywords: [] }, criteriaStatus: "proposed" },
    }),
  ),
];

const DOC: ResumeDoc = {
  summary:
    "Supply chain operator moving into product: fifteen years on the user’s side of planning and logistics software, building the tools it was missing. Raised forecast accuracy from 61% to 74% with a Python model and held a 98% case fill rate across 640 SKUs.",
  experience: [
    {
      employer: "Brightwater Provisions",
      title: "Senior Supply Planning Manager",
      start: "2023-04",
      roleKey: "brightwater-provisions-senior-supply-planning-manager",
      bullets: [
        { text: "Replaced a 40-tab spreadsheet forecast with a Python model rerun every Monday, raising forecast accuracy from 61% to 74%.", factIds: ["python"] },
        { text: "Built a load-planning calculator now used on the shipping docks at both plants to fit more cases on every outbound truck.", factIds: ["palletwise"] },
      ],
    },
    { employer: "Ironbridge Logistics", title: "Network Operations Manager", start: "2020-02", end: "2023-04", roleKey: "ironbridge-logistics-network-operations-manager", bullets: [{ text: "Led the move to a new transportation management system for about 180 dispatchers and planners at four terminals.", factIds: ["tms"] }] },
    { employer: "Kettle & Crane Brewing", title: "Production Planning Lead", start: "2017-03", end: "2020-01", roleKey: "kettle-and-crane-brewing-production-planning-lead", bullets: [{ text: "Set up the brewery’s first MRP in NetSuite, tying brew schedules to malt, hop and can orders.", factIds: ["mrp"] }] },
  ],
  skills: [],
};

const LOADSTAR = "Who we are\n\nAbout Loadstar Systems\n\nLoadstar Systems builds transportation management software for mid-size shippers.";
const MERIDIAN = "Senior Product Manager, Planning at Meridian Coldchain · Chicago\n\nABOUT THE TEAM\n\nMeridian Coldchain’s planning team builds the tools that keep temperature-controlled freight on schedule. You will own the forecasting and capacity-planning surfaces, from discovery with shippers and carriers through launch and adoption…";

export function directionsFixtures(): Answers {
  const withFacts = (s: { text: string; factIds: string[]; how?: string }) => ({ ...s, facts: s.factIds.map((k) => FACTS[k as FactKey]) });
  let rows: { spec: Spec; status: Spec["status"]; data: Data; mergedInto?: string }[] = SPECS.map((spec) => ({ spec, status: spec.status, data: spec.data }));
  const notes: Record<string, Note[]> = {
    "dir-planning": [{ id: "note-planning" as Id<"notes">, text: "Director scope or a bigger network than Brightwater’s. Another senior manager seat at a smaller plant isn’t worth the move.", at: at("2026-09-26T10:00:00"), editedAt: null }],
    "dir-product": [{ id: "note-product" as Id<"notes">, text: "Most interested in forecasting and S&OP products; less in pure TMS.", at: at("2026-09-25T09:30:00"), editedAt: null }],
  };
  const versions: Record<string, ResumeList["versions"]> = {
    "dir-product": [{ id: "res-product" as Id<"resumes">, doc: DOC, layout: { roles: [] }, text: "", counts: { roles: 7, facts: 24, insights: 4 }, model: "", at: at("2026-09-24T15:00:00"), restoredFrom: null, additions: null }],
    "dir-solutions": [{ id: "res-solutions" as Id<"resumes">, doc: DOC, layout: { roles: [] }, text: "", counts: null, model: "", at: at("2026-09-24T14:00:00"), restoredFrom: null, additions: null }],
  };
  const tailored: Record<string, ResumeList["tailored"]> = {
    "dir-product": [
      { id: "tr-meridian" as Id<"resumes">, doc: DOC, layout: null, postingTitles: {}, posting: MERIDIAN, role: null, requirements: [], at: at("2026-09-27T16:22:00") },
      { id: "tr-loadstar-2" as Id<"resumes">, doc: DOC, layout: null, postingTitles: {}, posting: LOADSTAR, role: null, requirements: [], at: at("2026-09-24T16:25:00") },
      { id: "tr-loadstar-1" as Id<"resumes">, doc: DOC, layout: null, postingTitles: {}, posting: LOADSTAR, role: null, requirements: [], at: at("2026-09-24T16:10:00") },
    ],
  };
  const FIT: Record<string, [number, number]> = { "dir-planning": [1, 1], "dir-logistics": [0, 1], "dir-product": [3, 4], "dir-solutions": [2, 3], "dir-procurement": [1, 2], "dir-analytics": [0, 1], "dir-plant": [0, 0], "dir-consulting": [0, 0] };
  let last: FunctionReturnType<typeof api.directions.list>["last"] = { status: "done", error: undefined, mode: "suggest", result: { suggested: 9 } };
  const find = (id: string) => rows.find((r) => r.spec.id === id)!;

  const list = (): FunctionReturnType<typeof api.directions.list> => ({
    last,
    directions: rows
      .filter((r) => !r.mergedInto)
      .map(({ spec, status, data }) => ({
        id: spec.id as Id<"items">,
        status,
        data,
        sources: spec.quotes ? [{ narrativeId: NARRATIVE, version: 3, quotes: spec.quotes }] : [],
        carriesOver: (data.detail?.carriesOver ?? []).map(withFacts),
        reframe: (data.detail?.reframe ?? []).map(withFacts),
        evidence: (spec.evidence ?? []).map((k) => FACTS[k]),
        avoided: [],
      })),
  });

  return {
    ...answer(api.directions.list, list),
    ...answer(api.directions.fit, () =>
      rows.filter((r) => r.status === "approved" && FIT[r.spec.id]).map((r) => ({ directionId: r.spec.id as Id<"items">, count: FIT[r.spec.id][0] + FIT[r.spec.id][1], strong: FIT[r.spec.id][0], some: FIT[r.spec.id][1], more: false })),
    ),
    ...answer(api.estimates.costs, () => ({
      followUp: 0.01, outreach: 0.01, letter: 0.02, ask: 0.01, tailor: 0.04, rankPerRole: 0.0001, read: null, readRevision: null, rewrite: null, disagreements: null, duplicates: null, sameWork: null, skills: null, insights: null, repository: null,
      resume: 0.03, directionResume: 0.03, resumeLines: null, goals: 0.05, limitRule: 0.01, directionDetail: 0.02, suggestDirections: 0.05, lineCheck: null, lineUpdate: null,
    })),
    ...answer(api.resume.list, ({ directionId }): ResumeList => ({
      facts: FACTS,
      last: null,
      lines: null,
      titles: { suggested: {}, direction: {} },
      settings: { roles: [], projects: [], skills: [] },
      length: { own: null, record: "two" },
      versions: versions[directionId ?? ""] ?? [],
      tailored: tailored[directionId ?? ""] ?? [],
    })),
    ...answer(api.resume.overview, (): Overview => ({
      base: { key: "base", directionId: null, name: "Base resume", at: at("2026-09-28T12:00:00"), state: "upToDate", summary: null, versionId: null, writing: false, blocked: null },
      directions: rows
        .filter((r) => r.status === "approved")
        .map((r) => ({
          key: r.spec.id,
          directionId: r.spec.id as Id<"items">,
          name: r.data.name,
          at: versions[r.spec.id]?.[0]?.at ?? null,
          state: versions[r.spec.id] ? ("upToDate" as const) : ("notWritten" as const),
          summary: null,
          versionId: null,
          writing: false,
          blocked: r.data.detailStatus === "approved" ? null : "Approve this direction's positioning first.",
        })),
      tailored: [],
      writing: false,
      toUpdate: 0,
    })),
    ...answer(api.profile.get, () => ({ name: "Wren Castellano", email: "wren@example.com", phone: "(412) 555-0137", location: "Pittsburgh, Pennsylvania", links: [] })),
    // Their two approved Seniority limits: the firm one rules out lead and manager roles in Supply Planning and Logistics
    // Operations.
    ...answer(api.goals.items, (): GoalsItem[] => [
      {
        id: "lim-seniority-planning" as Id<"items">,
        kind: "limit",
        status: "approved",
        sources: [{ narrativeId: NARRATIVE, version: 3, quotes: ["If I stay in planning or logistics leadership, it has to be director-level scope"] }],
        data: {
          kind: "seniority",
          label: "Seniority (Supply Planning, Logistics Operations)",
          value: "In supply planning or logistics leadership, you want director-level scope, so you are looking for senior manager or above, not a lead or manager role.",
          firm: true,
          appliesTo: ["Supply Planning", "Logistics Operations"],
          rule: { exclude: ["individual", "lead", "manager"], include: ["senior manager", "director", "senior director", "vp", "svp", "c-level"] },
        },
      } as GoalsItem,
      {
        id: "lim-seniority-analytics" as Id<"items">,
        kind: "limit",
        status: "approved",
        sources: [],
        data: {
          kind: "seniority",
          label: "Seniority (Procurement, Operations Analytics)",
          value: "In procurement and operations analytics, you want at least a manager role, not an individual contributor or lead role.",
          firm: false,
          appliesTo: ["Procurement", "Operations Analytics"],
          rule: { exclude: ["individual", "lead"], include: ["manager", "senior manager", "director", "senior director", "vp", "svp", "c-level"] },
        },
      } as GoalsItem,
    ]),
    ...answer(api.notes.list, ({ subject }) => notes[subject.id] ?? []),
    // What the stories change.
    ...answer(api.extract.review, ({ id, status, note }) => {
      const r = find(id);
      r.status = status === "skipped" ? r.status : status;
      r.data = { ...r.data, rejectedBecause: status === "rejected" ? (note ?? null) : null };
    }),
    ...answer(api.directions.approvePart, ({ id, part }) => {
      const r = find(id);
      r.data = { ...r.data, [part === "detail" ? "detailStatus" : "criteriaStatus"]: "approved" };
    }),
    ...answer(api.directions.unapprovePart, ({ id, part }) => {
      const r = find(id);
      r.data = { ...r.data, [part === "detail" ? "detailStatus" : "criteriaStatus"]: "proposed" };
    }),
    ...answer(api.directions.editCriteria, ({ id, seeds, ...c }) => {
      const r = find(id);
      r.data = { ...r.data, criteria: { ...c, ...(seeds?.length ? { seeds } : {}) }, criteriaStatus: "approved" };
    }),
    ...answer(api.directions.editDetail, ({ id, positioning, targetTitles, vocabulary }) => {
      const r = find(id);
      r.data = { ...r.data, detail: { ...r.data.detail!, positioning, targetTitles, vocabulary }, detailStatus: "approved" };
    }),
    ...answer(api.directions.detail, () => {
      last = { status: "running", error: undefined, mode: "detail", result: null };
      return "job-detail" as Id<"jobs">;
    }),
    ...answer(api.directions.suggest, () => {
      last = { status: "running", error: undefined, mode: "suggest", result: null };
      return "job-suggest" as Id<"jobs">;
    }),
    ...answer(api.goals.edit, ({ id, fields: { path, ...fields } }) => {
      const r = find(id);
      r.data = { ...r.data, ...fields, ...(path ? { path: path as Data["path"] } : {}), edited: true };
      r.status = "approved";
    }),
    ...answer(api.goals.merge, ({ id, into }) => {
      const from = find(id);
      const to = find(into);
      from.mergedInto = to.data.name;
      to.data = { ...to.data, includes: [...(to.data.includes ?? []), from.data.name] };
    }),
    ...answer(api.goals.unmerge, ({ id }) => {
      const from = find(id);
      rows = rows.map((r) => (r.data.includes?.includes(from.data.name) ? { ...r, data: { ...r.data, includes: r.data.includes.filter((n) => n !== from.data.name) } } : r));
      find(id).mergedInto = undefined;
    }),
    ...answer(api.resume.start, () => "job-resume" as Id<"jobs">),
    ...answer(api.notes.add, ({ subject, text }) => {
      notes[subject.id] = [...(notes[subject.id] ?? []), { id: `note-${Date.now()}` as Id<"notes">, text, at: Date.now(), editedAt: null }];
      return notes[subject.id].at(-1)!.id;
    }),
    ...answer(api.notes.edit, ({ id, text }) => {
      for (const k of Object.keys(notes)) notes[k] = notes[k].map((n) => (n.id === id ? { ...n, text, editedAt: Date.now() } : n));
    }),
    ...answer(api.notes.remove, ({ id }) => {
      for (const k of Object.keys(notes)) notes[k] = notes[k].filter((n) => n.id !== id);
    }),
  };
}
