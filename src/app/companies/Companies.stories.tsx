import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState, useSyncExternalStore } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { CompanySort } from "../../../convex/companySets";
import type { Id } from "../../../convex/_generated/dataModel";
import { BottomBar } from "@/components/BottomBar";
import type { Note } from "@/components/NoteBlock";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { Companies } from "./Companies";
import { type Act, type CompaniesData, type CompaniesEnv, CompaniesEnvContext, type Company, type CompanyCoverage, type CompanyRole, type Coverage, type Lookup, type Person, type Tab } from "./env";
import type { FindSetup } from "./findPlan";

// The Companies screen with fixture data. Rating, keeping, restoring, editing a website or board and notes change the
// fixtures as the real mutations would. Resize the window for medium and the phone.

const DAY = 86_400_000;
const now = Date.now();
const cid = (s: string) => s as Id<"companies">;
const did = (s: string) => s as Id<"items">;
const product = did("d-product");
const solutions = did("d-solutions");
const startupOps = did("d-startup-ops");
const planning = did("d-planning");

type Seed = Partial<Company> & { name: string };
function company(key: string, s: Seed): Company {
  return {
    id: cid(key),
    domain: `${key}.example.com`,
    websiteUrl: `https://${key}.example.com`,
    linkedinUrl: undefined,
    screened: { employer: true, kind: "employer", by: "ai", at: now - 20 * DAY },
    details: null,
    fit: [],
    rating: null,
    ratingReason: null,
    goals: null,
    named: false,
    evidence: [],
    ways: [],
    boardUrl: null,
    checking: false,
    found: ["Supply Chain Product (criteria)"],
    foundAt: now - 25 * DAY,
    ranked: !!s.details,
    rolesAt: s.details?.board ? now - 3 * DAY : null,
    fitAt: s.details ? now - 3 * DAY : null,
    archived: null,
    ...s,
  };
}
const details = (summary: string, board: string | null, jobs?: { open: number; remote: number; matching: string[] }) => ({
  summary,
  board: board ? { provider: "greenhouse" as const, slug: board, url: `https://boards.greenhouse.io/${board}`, foundBy: "its careers page" } : undefined,
  jobs: jobs && { open: jobs.open, remote: jobs.remote, matching: jobs.matching.map((title, i) => ({ title, url: `https://boards.greenhouse.io/x/jobs/${i}`, direction: "Solutions Consulting" })) },
  sources: ["website"],
  at: now - 3 * DAY,
});
const fit = (directionId: Id<"items">, level: "strong" | "some" | "weak" | "none", reason: string) => ({
  directionId,
  level,
  reason,
  direction: directionId === solutions ? "Solutions Consulting" : directionId === product ? "Supply Chain Product" : directionId === planning ? "Supply Planning" : "Startup Operations",
});
const goals = (level: "fits" | "partly" | "doesnt" | "unknown", reason: string) => ({ level, reason, at: now - 3 * DAY });

const companies: Company[] = [
  company("loadstar", {
    name: "Loadstar Systems",
    rating: "excited",
    details: details("Transportation management software for shippers and their carriers: load planning, tendering and freight audit, sold to mid-size manufacturers and distributors.", "loadstar"),
    goals: goals("fits", "Builds the software freight runs on."),
    fit: [fit(product, "strong", "Its load-planning product is what you built in Palletwise, and the product team wants shipper experience."), fit(solutions, "strong", "Deals turn on a pilot run with the shipper’s own lanes and loads.")],
    found: ["Supply Chain Product (criteria)"],
    foundAt: now - 26 * DAY,
  }),
  company("meridian", { name: "Meridian Coldchain", rating: "excited", details: details("Software that tracks temperature and plans routes for refrigerated freight, sold to food makers and grocers.", "meridian"), fit: [fit(product, "some", "Product roles sit in Chicago and lean on sensor hardware.")] }),
  company("lumenplan", { name: "Lumen Planning", rating: "excited", details: details("An AI supply-planning tool for mid-size manufacturers.", "lumenplanning"), fit: [fit(solutions, "strong", "Hiring solutions engineers who have run a plan themselves.")] }),
  company("parcelpoint", {
    name: "Parcelpoint",
    rating: "excited",
    named: true,
    found: ["your list"],
    details: details("Last-mile delivery for regional grocers and pharmacies, run from four Philadelphia hubs.", null),
    goals: goals("partly", "Offer is $140k base plus equity, but the job is in Philadelphia, not Pittsburgh."),
    fit: [fit(startupOps, "strong", "You’ve dispatched couriers and opened a cross-dock, the two jobs it needs one person to do.")],
  }),
  company("kestrel", { name: "Kestrel Freight", rating: "maybe", details: details("A digital freight marketplace that matches shippers’ loads with carriers.", "kestrel"), fit: [fit(product, "some", "Its product roles serve carriers; your experience is on the shipper side.")] }),
  company("northgate", { name: "Northgate Grocers", rating: "maybe", details: details("A regional grocery chain with 180 stores in Ohio and Pennsylvania.", "northgate"), fit: [fit(product, "some", "One small team builds the stores’ replenishment system.")] }),
  company("orchard", {
    name: "Orchard Forecasting",
    details: details("Demand-planning software for food and beverage brands, sold to their planning teams.", "orchardforecasting", { open: 12, remote: 9, matching: ["Solutions Consultant, Demand Planning", "Implementation Consultant", "Senior Solutions Consultant", "Solutions Consultant, Beverage"] }),
    goals: goals("fits", "Builds planning software for food brands."),
    fit: [fit(solutions, "strong", "Deals turn on a pilot forecast built from the customer’s own sales history."), fit(product, "some", "Product roles exist, but the whole team is four people.")],
    found: ["Solutions Consulting (like companies you like)"],
  }),
  company("copperline", { name: "Copperline Robotics", details: details("Warehouse picking robots, leased to distribution centers.", "copperline"), fit: [fit(solutions, "strong", "Hiring deployment consultants for new sites.")], goals: goals("unknown", "Its site doesn’t say who buys its robots.") }),
  company("fernhill", { name: "Fernhill Foods", details: details("Packaged soups, sauces and snacks sold nationwide.", "fernhill"), fit: [fit(planning, "strong", "Plans the same kinds of products you plan now.")], goals: goals("fits", "Makes packaged food.") }),
  company("tidewell", { name: "Tidewell Medical Supply", details: details("Distributes medical and surgical supplies to hospitals.", "tidewell"), fit: [fit(product, "some", "A small internal supply chain systems team.")] }),
  company("ashgrove", { name: "Ashgrove Manufacturing", details: details("Industrial pumps and valves made in three Ohio plants.", "ashgrove"), fit: [fit(planning, "some", "Planning roles, but for engineered-to-order parts.")] }),
  company("bramblewood", { name: "Bramblewood Home", details: details("Direct-to-consumer furniture shipped from two warehouses.", "bramblewood"), fit: [fit(startupOps, "weak", "Its operations team mostly handles customer returns.")] }),
  company("halberd", { name: "Halberd Warehousing", rating: "no", ratingReason: "Night shifts only", details: details("Contract warehousing for retailers.", "halberd") }),
  company("silverline", { name: "Silverline Casinos", rating: "no", ratingReason: "Industry", details: details("A regional casino operator.", null) }),
  company("hollisleaf", {
    name: "Hollis Leaf Tobacco",
    details: details("Cigars and pipe tobacco made in two Virginia plants.", "hollisleaf"),
    goals: goals("doesnt", "Almost all of its revenue comes from tobacco. Your goals say to skip tobacco companies."),
    fit: [fit(planning, "strong", "Runs a large supply planning team across both plants."), fit(product, "some", "An internal planning-systems team of three.")],
  }),
  company("larder", { name: "Larder & Co.", details: details("A recipe and meal-planning app for home cooks.", "larder"), goals: goals("doesnt", "A consumer app; it doesn’t make, move or plan food.") }),
  // Found by the web search, not filled in yet: their rows say how.
  company("brinewell", {
    name: "Brinewell",
    details: null,
    found: ["Supply Chain Product (fits, web search)"],
    ways: ["fits, web search"],
    evidence: ["https://news.example.com/brinewell-raises-series-b"],
    foundAt: now - 2 * DAY,
  }),
  company("tallyroute", {
    name: "Tallyroute",
    details: null,
    found: ["Solutions Consulting (hiring now, job boards)"],
    ways: ["hiring now, job boards"],
    evidence: ["https://jobs.lever.co/tallyroute/4f1c"],
    foundAt: now - 2 * DAY,
  }),
  company("keelstaffing", { name: "Keel Staffing Partners", screened: { employer: false, kind: "staffing or recruiting", by: "rule", at: now - 20 * DAY } }),
  company("haulhire", { name: "HaulHire", screened: { employer: false, kind: "job board", by: "you", at: now - 10 * DAY } }),
];

// Kestrel's board is too large to read whole: it was searched by their titles, 40 of its 3,048 roles read.
const coverage: Record<string, Coverage> = Object.fromEntries(
  companies
    .filter((c) => c.rating === "excited" || c.rating === "maybe")
    .map((c, i) => {
      const searched = c.id === "kestrel";
      const read = searched ? 40 : c.details?.board ? [214, 9, 6, 0, 4, 11][i] : 2;
      return [
        c.id,
        {
          id: c.id,
          name: c.name,
          rating: c.rating as "excited" | "maybe",
          board: c.details?.board ? { provider: searched ? ("workday" as const) : ("greenhouse" as const), url: c.details.board.url } : null,
          searched,
          read,
          boardTotal: searched ? 3048 : null,
          complete: !searched && !!c.details?.board,
          lastRead: c.details?.board ? now - (i % 3) * DAY : null,
          lastFailed: null,
          stale: false,
          checking: false,
        },
      ];
    }),
);
// Every company's own coverage, Target or Maybe or not: Orchard (Found) had its roles checked once, today; the other
// companies that aren't Targets or Maybe never had theirs read.
const companyCoverage = (c: Company): CompanyCoverage => {
  const watched = coverage[c.id];
  if (watched) return { ...watched, watched: true };
  const board = c.details?.board ? { provider: "greenhouse" as const, url: c.details.board.url } : null;
  const read = c.id === "orchard";
  return { id: c.id, name: c.name, board, searched: false, read: read ? 12 : 0, boardTotal: null, complete: read, lastRead: read ? now : null, lastFailed: null, stale: !read, checking: false, watched: false };
};

// Open roles (roles.atCompany): Loadstar's in every group, more than a search field's worth; Kestrel's searched board;
// Orchard's read once and never scored.
const role = (id: string, title: string, group: CompanyRole["group"], s: Partial<CompanyRole> = {}): CompanyRole => ({
  id: id as Id<"postings">,
  title,
  group,
  directionId: null,
  level: null,
  score: null,
  problems: [],
  place: "Remote, US",
  postedAt: now - 3 * DAY,
  firstSeen: now - 3 * DAY,
  rating: null,
  pursuit: null,
  ...s,
});
const OTHER_TITLES = ["Staff Software Engineer, Routing", "Senior Data Engineer", "Account Executive, Carriers", "Product Designer", "Customer Support Specialist", "Payroll Manager", "Recruiter", "Security Engineer", "Technical Writer", "Office Manager", "Controller", "Senior Backend Engineer", "Mobile Engineer, Driver App", "Sales Development Representative", "Data Analyst, Freight Audit", "IT Support Specialist"];
const roles: Record<string, CompanyRole[]> = {
  loadstar: [
    role("p1", "Senior Product Manager, Load Planning", "fit", { directionId: product, level: "strong", score: 91, pursuit: { id: "u1" as Id<"pursuits">, status: "preparing" } }),
    role("p2", "Solutions Consultant, Shippers", "fit", { directionId: solutions, level: "strong", score: 86, place: "Columbus or remote", postedAt: now - DAY }),
    role("p3", "Product Manager, Tendering", "fit", { directionId: product, level: "some", score: 72, place: "Columbus, OH", rating: "interested" }),
    role("p4", "Carrier Success Manager", "fit", { directionId: solutions, level: "weak", score: 58, place: "Columbus, OH" }),
    role("p5", "Director of Product, Freight Audit", "against", { directionId: product, level: "strong", score: 84, place: "Toronto, Canada", problems: ["Outside where you’ll work"] }),
    ...OTHER_TITLES.map((t, i) => role(`o${i}`, t, "other", { place: i % 3 ? "Columbus, OH" : "Remote, US", postedAt: now - (i + 2) * DAY })),
    role("w1", "Implementation Manager, Shippers", "waiting", { postedAt: now }),
    role("w2", "Member of the Planning Staff", "waiting", { place: "Pittsburgh, PA", postedAt: null, firstSeen: now }),
  ],
  kestrel: [
    role("k1", "Senior Product Manager, Shipper Experience", "fit", { directionId: product, level: "some", score: 77, place: "Chicago, IL" }),
    role("k2", "Group Product Manager, Carrier App", "fit", { directionId: product, level: "some", score: 63, place: "Remote, US" }),
    role("k3", "Solutions Engineer, Enterprise", "other", { place: "Chicago, IL" }),
  ],
  orchard: [
    role("r1", "Solutions Consultant, Demand Planning", "waiting", { place: "Denver, CO" }),
    role("r2", "Implementation Consultant", "waiting", { postedAt: now - DAY }),
    role("r3", "Senior Solutions Consultant", "waiting", { place: "Chicago, IL" }),
    role("r4", "Head of Partnerships", "waiting"),
  ],
};

const people: Record<string, Person[]> = {
  loadstar: [
    { name: "Rafael Duarte", title: "Head of Product", hiringManager: true, group: "hiringManager" as const, pursuitId: "u1" as Id<"pursuits"> },
    { name: "Nadia Brooks", title: "Senior Recruiter", hiringManager: false, group: "recruiting" as const, pursuitId: "u1" as Id<"pursuits"> },
  ],
};

const base: CompaniesData = {
  apolloJobs: true,
  lens: { industries: "steer", judge: "hide" },
  learn: true,
  fitRefresh: true,
  filledIn: 112,
  companyGoals: [
    { id: did("g1"), text: "Works on food, freight or the software behind them" },
    { id: did("g2"), text: "Skip tobacco companies" },
  ],
  // Companies you like: one in Apollo, one typed website not in Apollo, and one not used to find more like it (added
  // only, as 0.14.0's Add to my companies alone comes forward).
  likes: [
    { domain: "lumenplan.example.com", name: "Lumen Planning", like: true, lookup: { apolloId: "a1", name: "Lumen Planning", domain: "lumenplan.example.com" } },
    { domain: "orchard.example.com", name: null, like: true, lookup: { apolloId: null, domain: "orchard.example.com" } },
    { domain: "parcelpoint.example.com", name: "Parcelpoint", like: false, lookup: null },
  ],
  searchable: [
    { id: product, name: "Supply Chain Product", ownSeeds: null, hasTitles: true, boardQueries: 2, targets: ["Loadstar Systems", "Meridian Coldchain"] },
    { id: solutions, name: "Solutions Consulting", ownSeeds: [{ domain: "kestrelfreight.example.com", name: "Kestrel Freight" }], hasTitles: true, boardQueries: 2, targets: ["Loadstar Systems"] },
    { id: startupOps, name: "Startup Operations", ownSeeds: null, hasTitles: false, boardQueries: 0, targets: ["Parcelpoint"] },
  ],
  needCriteria: { filling: null, rows: [{ id: planning, name: "Supply Planning", state: "review" as const }] },
  last: {
    status: "done",
    error: undefined,
    result: {
      report: [
        { direction: "Supply Chain Product", criteria: { found: 40, added: 12, total: 1840 }, hiring: { found: 18, added: 5, total: 220 }, lookalikes: [{ seeds: ["Lumen Planning", "Orchard Forecasting"], found: 20, added: 6 }] },
        { direction: "Solutions Consulting", criteria: { found: 36, added: 9, total: 950 }, hiring: null, lookalikes: [] },
      ],
      named: { found: 1, added: 0, missing: [] },
      seedsNotInApollo: [],
    },
  },
  enriching: null,
  companies,
};

// Fit being judged: three found companies wait in Not ranked yet while a pass runs.
const rankingData: CompaniesData = {
  ...base,
  enriching: { status: "running", error: undefined, remaining: 3 },
  companies: companies.map((c) => (["ashgrove", "bramblewood", "tidewell"].includes(c.id) ? { ...c, ranked: false, fitAt: null, fit: [] } : c)),
};
// Four found companies archived on the same day.
const archivedData: CompaniesData = {
  ...base,
  companies: companies.map((c) => (["copperline", "tidewell", "ashgrove", "bramblewood"].includes(c.id) ? { ...c, archived: { at: now - DAY } } : c)),
};

type Params = { tab: Tab | null; company: string | null; settings: boolean; sort: CompanySort };
function createStore(initial: CompaniesData, initialParams: Params) {
  let data = initial;
  let params = initialParams;
  let notes: Record<string, Note[]> = { loadstar: [{ id: "n1", text: "Rafael built a carrier app before joining. Ask how shipper requests make it onto the roadmap.", at: now - DAY }] };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const patch = (id: string, change: (c: Company) => Company) => {
    data = { ...data, companies: data.companies.map((c) => (c.id === id ? change(c) : c)) };
    emit();
  };
  const done = async () => null;
  const act = {
    rate: async ({ id, value, reason }: { id: string; value: Company["rating"]; reason?: string }) => patch(id, (c) => ({ ...c, rating: value, ratingReason: value === "no" ? (reason ?? null) : null })) ?? null,
    archive: async ({ ids, archived }: { ids: string[]; archived: boolean }) => {
      for (const id of ids) patch(id, (c) => ({ ...c, archived: archived ? { at: Date.now() } : null }));
      return null;
    },
    keepAnyway: async ({ id, keep }: { id: string; keep: boolean }) => patch(id, (c) => ({ ...c, goals: c.goals && { ...c.goals, keep } })) ?? null,
    setEmployer: async ({ id, employer }: { id: string; employer: boolean }) => patch(id, (c) => ({ ...c, screened: { employer, kind: employer ? "employer" : "other non-employer", by: "you", at: Date.now() } })) ?? null,
    recheck: async ({ ids }: { ids: string[] }) => ({ skipped: ids.filter((id) => !data.companies.find((c) => c.id === id)?.domain).length }),
    setWebsite: async ({ id, website }: { id: string; website: string }) => patch(id, (c) => ({ ...c, domain: website, websiteUrl: `https://${website}` })) ?? null,
    setBoard: async ({ id, url }: { id: string; url: string }) => patch(id, (c) => ({ ...c, boardUrl: url || null })) ?? null,
    addNote: async ({ subject, text }: { subject: { id: string }; text: string }) => {
      notes = { ...notes, [subject.id]: [...(notes[subject.id] ?? []), { id: `n${Date.now()}`, text, at: Date.now() }] };
      emit();
      return "n" as Id<"notes">;
    },
    editNote: async ({ id, text }: { id: string; text: string }) => {
      notes = Object.fromEntries(Object.entries(notes).map(([k, list]) => [k, list.map((n) => (n.id === id ? { ...n, text } : n))]));
      emit();
      return null;
    },
    removeNote: async ({ id }: { id: string }) => {
      notes = Object.fromEntries(Object.entries(notes).map(([k, list]) => [k, list.filter((n) => n.id !== id)]));
      emit();
      return null;
    },
    setLens: async (lens: CompaniesData["lens"]) => {
      data = { ...data, lens };
      emit();
      return null;
    },
    fillIn: done,
    rejudge: done,
    checkRoles: done,
    find: done,
    fillInDirections: async () => "job-fill" as Id<"jobs">,
    startOutreach: async () => "pur-outreach",
    setLikes: async ({ likes }: { likes: { domain: string; name?: string; like: boolean }[] }) => {
      data = { ...data, likes: likes.map((l) => ({ domain: l.domain, name: l.name ?? null, like: l.like, lookup: data.likes.find((x) => x.domain === l.domain)?.lookup ?? null })) };
      emit();
      return null;
    },
    setLearn: async ({ on }: { on: boolean }) => {
      data = { ...data, learn: on };
      emit();
      return null;
    },
    setFitRefresh: async ({ on }: { on: boolean }) => {
      data = { ...data, fitRefresh: on };
      emit();
      return null;
    },
  } as unknown as Act;
  return {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    data: () => data,
    notes: () => notes,
    params: () => params,
    setParams: (next: { tab?: Tab | null; company?: string | null; settings?: "search" | null; sort?: CompanySort | null }) => {
      params = {
        tab: next.tab === undefined ? params.tab : next.tab,
        company: next.company === undefined ? params.company : next.company,
        settings: next.settings === undefined ? params.settings : next.settings === "search",
        sort: next.sort === undefined ? params.sort : (next.sort ?? "best"),
      };
      emit();
    },
    act,
  };
}

const apolloSetup: FindSetup = { finding: "apollo", braveKey: true, relevantUsd: 0.028, hiringNowUsd: 0.014, aiLeft: { left: 18.6, monthly: 25 } };

// Free lookups (fictional): "Northw" and "Kestrel" bring companies (one of them already theirs), "Quill" none; a typed
// website reads its name; a pasted list resolves line by line. `lookups` counts what was asked, so a play can check
// typing waits for two characters and a pause.
let lookups: string[] = [];
const KNOWN = [
  { name: "Northwind Logistics", domain: "northwind.example.com", yours: true },
  { name: "Northwind Health", domain: "northwindhealth.example.com" },
  { name: "Northwind Studio", domain: "northwind.example.net" },
  { name: "Kestrel Freight", domain: "kestrelfreight.example.com" },
  { name: "Kestrel Analytics", domain: "kestrel-analytics.example.com" },
  { name: "Tidewell Systems", domain: "tidewell.example.com" },
  { name: "Meridian Coldchain", domain: "meridian.example.com" },
];
const named = (q: string) => KNOWN.filter((k) => k.name.toLowerCase().startsWith(q.trim().toLowerCase().slice(0, 4)) && !/quill/i.test(q)).map((k) => ({ ...k, yours: !!k.yours }));
const lookup: Lookup = {
  suggest: async (q) => {
    lookups.push(q);
    return named(q);
  },
  resolve: async (lines) =>
    lines.map((line) => {
      if (/\./.test(line)) return { line, match: { domain: line.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase(), name: /harborline/i.test(line) ? "Harborline" : null }, check: false };
      const found = named(line);
      const exact = found.find((f) => f.name.toLowerCase() === line.toLowerCase());
      return exact ? { line, match: { domain: exact.domain, name: exact.name }, check: false } : found[0] ? { line, match: { domain: found[0].domain, name: found[0].name }, check: true } : { line, match: null, check: false };
    }),
  website: async (site) => ({ domain: site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase(), name: /harborline/i.test(site) ? "Harborline" : null }),
};

// The last search on the web: Apollo + AI adds to Apollo's report; AI only has the web search's alone. Brave refused
// partway, so job boards weren't searched for every direction.
const webReport = [
  { direction: "Supply Chain Product", relevant: { found: 15, added: 9 }, hiringNow: { found: 7, added: 4, fromJobBoards: 3 } },
  { direction: "Solutions Consulting", relevant: { found: 14, added: 6 }, hiringNow: { found: 5, added: 3, fromJobBoards: 0 } },
];
const braveNote = "Job boards weren’t searched for every direction: your Brave Search key reached its limit. Hiring now comes from web search alone.";
const apolloWebLast: CompaniesData["last"] = {
  status: "done",
  error: undefined,
  result: { ...(base.last?.result as object), finding: "apolloWeb", web: { report: webReport, named: null, notes: [braveNote], boardQueries: 4, costUsd: 0.09 } },
};
const webLast: CompaniesData["last"] = {
  status: "done",
  error: undefined,
  result: { finding: "web", report: [], named: { found: 1, added: 1, missing: ["harborline.example.com"] }, web: { report: webReport, named: { found: 1, added: 1, missing: ["harborline.example.com"] }, notes: [braveNote], boardQueries: 4, costUsd: 0.09 } },
};

function Fixture({ data = base, tab = null, company = null, settings = false, sort = "best", setup = apolloSetup }: { data?: CompaniesData; tab?: Tab | null; company?: string | null; settings?: boolean; sort?: CompanySort; setup?: FindSetup }) {
  const [store] = useState(() => createStore(data, { tab, company, settings, sort }));
  const env = useMemo((): CompaniesEnv => {
    const useData = () => useSyncExternalStore(store.subscribe, store.data, store.data);
    return {
      useData,
      useCoverage: (id, watched) => (watched ? (coverage[id] ?? null) : null),
      useCompanyCoverage: (id) => {
        const c = useData()?.companies.find((x) => x.id === id);
        return c && companyCoverage(c);
      },
      useCompanyRoles: (id, search) => ({ rows: (roles[id] ?? []).filter((r) => r.title.toLowerCase().includes(search.toLowerCase())), status: "Exhausted", loadMore: () => {} }),
      useNotes: (id) => useSyncExternalStore(store.subscribe, store.notes, store.notes)[id] ?? [],
      usePeople: (id) => people[id] ?? [],
      useParams: () => ({ ...useSyncExternalStore(store.subscribe, store.params, store.params), set: store.setParams }),
      useAct: () => store.act,
      useBalance: () => async () => ({ left: 312, limit: 500, consumed: 188 }),
      useDemo: () => false,
      useFindSetup: () => setup,
      useLookup: () => lookup,
    };
  }, [store, setup]);
  return (
    <ShellProvider>
      <CompaniesEnvContext.Provider value={env}>
        <div className="-m-6 flex h-screen flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            <Companies />
          </div>
          <Bar />
        </div>
      </CompaniesEnvContext.Provider>
    </ShellProvider>
  );
}

// The phone's bottom bar, as the shell shows it.
function Bar() {
  const small = useScreenSize() === "small";
  const { bar } = useShellState();
  return small && bar ? <BottomBar mode={bar} /> : null;
}

const meta = { title: "Screens/Companies", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Target: Story = { render: () => <Fixture tab="targets" company="loadstar" /> };
export const Found: Story = { render: () => <Fixture tab="found" company="orchard" /> };
// Not for me with a note, from a row's right-click menu, asks why under the row (R alone sets it aside at once).
export const FoundNotForMe: Story = {
  name: "Found, Not for me with a note",
  render: () => <Fixture tab="found" company="orchard" />,
  play: async ({ canvasElement }) => {
    const row = await within(canvasElement).findByRole("button", { name: /^Tidewell/ });
    await userEvent.pointer({ keys: "[MouseRight]", target: row });
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: /^Not for me with a note/ }));
  },
};
export const SetAside: Story = { render: () => <Fixture tab="aside" company="hollisleaf" /> };
export const EditingTheJobBoard: Story = {
  name: "Editing the job board",
  render: () => <Fixture tab="targets" company="parcelpoint" />,
  play: async () => {
    await userEvent.keyboard("e");
  },
};
// In Storybook's "both" view the screen renders twice (light, then dark): plays act on the first one.
const firstPane = (canvas: HTMLElement) => canvas.querySelector<HTMLElement>("[data-theme]") ?? canvas;

export const FindCompanies: Story = {
  name: "Find companies",
  render: () => <Fixture tab="targets" company="loadstar" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: /Find companies/ }));
  },
};
export const FindCompaniesNotLearning: Story = {
  name: "Find companies, not learning from ratings",
  render: () => <Fixture data={{ ...base, learn: false, searchable: base.searchable.map((d) => ({ ...d, targets: [] })) }} tab="targets" company="loadstar" />,
  play: FindCompanies.play,
};
export const FindCompaniesApolloAndAi: Story = {
  name: "Find companies, Apollo + AI",
  render: () => <Fixture data={{ ...base, last: apolloWebLast }} setup={{ ...apolloSetup, finding: "apolloWeb" }} tab="targets" company="loadstar" />,
  play: FindCompanies.play,
};
export const FindCompaniesAiOnly: Story = {
  name: "Find companies, AI only",
  render: () => <Fixture data={{ ...base, last: webLast }} setup={{ ...apolloSetup, finding: "web" }} tab="targets" company="loadstar" />,
  play: FindCompanies.play,
};
export const FindCompaniesAiOnlyNoBrave: Story = {
  name: "Find companies, AI only, no Brave key, before the first search",
  render: () => <Fixture data={{ ...base, last: null }} setup={{ finding: "web", braveKey: false, relevantUsd: null, hiringNowUsd: null, aiLeft: null }} tab="targets" company="loadstar" />,
  play: FindCompanies.play,
};
export const FoundByWebSearch: Story = { name: "Found by web search", render: () => <Fixture tab="found" company="brinewell" /> };
// Every open role, grouped: Other roles opened from its fold.
export const TargetOtherRoles: Story = {
  name: "Target, other roles",
  render: () => <Fixture tab="targets" company="loadstar" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: /^Other roles/ }));
  },
};
// A board too large to read whole: what a search by their titles found, and the job board for the rest.
export const SearchedBoard: Story = { name: "Maybe, board searched by your titles", render: () => <Fixture tab="maybe" company="kestrel" /> };
// Not a Target or Maybe and never read: its roles aren't read every day; Check its roles now reads them once.
export const FoundRolesNotRead: Story = { name: "Found, roles not read", render: () => <Fixture tab="found" company="fernhill" /> };
export const SearchSettings: Story = {
  name: "Search settings",
  render: () => <Fixture tab="targets" company="loadstar" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: /Search settings/ }));
  },
};
// ⋯ > Search settings: a menu beside the button, a sheet of buttons on a phone.
const openSettings = async (canvasElement: HTMLElement) => {
  await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
  const body = within(document.body);
  await waitFor(() => expect(body.queryByRole("menuitem", { name: /Search settings/ }) ?? body.queryByRole("button", { name: /^Search settings/ })).toBeTruthy());
  await userEvent.click(body.queryByRole("menuitem", { name: /Search settings/ }) ?? body.getByRole("button", { name: /^Search settings/ }));
};
const likesBox = () => within(document.body).findByRole("combobox", { name: "Add a company you like" });
// As a name is typed: nothing under two characters, then the companies it may mean a moment after typing stops, their
// own first. Nothing about cost: looking up is free.
export const FindAsYouType: Story = {
  name: "Search settings, companies you like, typing",
  render: () => <Fixture tab="targets" />,
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    const box = await likesBox();
    lookups = [];
    await userEvent.type(box, "N");
    expect(lookups).toEqual([]);
    await userEvent.type(box, "orthw");
    const list = await within(document.body).findByRole("listbox", { name: "Companies for Northw" });
    // "In your companies" beside its name; on a phone, after its website.
    await within(list).findByText(/in your companies/i);
    expect(lookups).toEqual(["Northw"]);
    // The box keeps focus as the menu that opened Search settings finishes closing.
    expect(box).toHaveFocus();
    expect(within(document.body).queryByRole("button", { name: "Find" })).toBeNull();
  },
};
// No company by that name: type its website instead.
export const FindByNameNone: Story = {
  name: "Search settings, companies you like, not found",
  render: () => <Fixture tab="targets" />,
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await userEvent.type(await likesBox(), "Quillfeather");
    await within(document.body).findByText("No company named Quillfeather found.");
  },
};
// A typed website: added as it is, its name from its own site.
export const AddByWebsite: Story = {
  name: "Search settings, companies you like, a typed website",
  render: () => <Fixture tab="targets" />,
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await userEvent.type(await likesBox(), "harborline.example.com");
    await within(document.body).findByRole("option", { name: "Add harborline.example.com" });
  },
};
// A row's ⋯: Don't use to find more like it, and Remove. Parcelpoint's is off, so its row says so.
export const LikeMenu: Story = {
  name: "Search settings, companies you like, a row’s ⋯",
  render: () => <Fixture tab="targets" />,
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await within(document.body).findByText("Not used to find more like it");
    await userEvent.click(await within(document.body).findByRole("button", { name: "More for Lumen Planning" }));
  },
};
// The list's ⋯: Paste a list and Copy list.
export const LikesListMenu: Story = {
  name: "Search settings, companies you like, the list’s ⋯",
  render: () => <Fixture tab="targets" />,
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await userEvent.click(await within(document.body).findByRole("button", { name: "More for Companies you like" }));
  },
};
// Paste a list: names and websites, looked up for free, each line to check, fix or remove before adding.
export const PasteAList: Story = {
  name: "Search settings, companies you like, paste a list",
  render: () => <Fixture tab="targets" />,
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await userEvent.click(await within(document.body).findByRole("button", { name: "Paste a list" }));
    const area = await within(document.body).findByRole("textbox", { name: "Companies to add" });
    await userEvent.click(area);
    await userEvent.paste("Kestrel Freight\ntidewell\nharborline.example.com, Quillfeather Co\nlumenplan.example.com\nhttps://www.meridian.example.com/about");
    await userEvent.click(within(document.body).getByRole("button", { name: "Look them up" }));
    const lines = await within(document.body).findByRole("list", { name: "Companies from your list" });
    await within(lines).findByText("Check this");
    await within(lines).findByText("Already in your list");
    await within(document.body).findByRole("button", { name: "Add 4 companies" });
  },
};
// None yet: the search, Paste a list, and what to do.
export const SearchSettingsEmpty: Story = {
  name: "Search settings, no companies you like yet",
  render: () => <Fixture data={{ ...base, likes: [], searchable: base.searchable.map((d) => ({ ...d, ownSeeds: null })) }} tab="targets" />,
  play: ({ canvasElement }) => openSettings(canvasElement),
};
// On a phone: full screen, with Back to Companies.
export const SearchSettingsPhone: Story = {
  name: "Search settings, phone",
  globals: { viewport: { value: "mobile2" } },
  render: () => <Fixture tab="targets" settings />,
};
export const Empty: Story = { render: () => <Fixture data={{ ...base, companies: [], last: null }} /> };
// Nothing chosen: on a phone, the list; beside it, the first company opens.
export const FoundList: Story = { name: "Found, list", render: () => <Fixture tab="found" /> };

const rowIn = (canvas: HTMLElement, name: string) => within(firstPane(canvas)).findByRole("button", { name: new RegExp(`^${name}`) });

// The list's ⋯, Sort by: one order for Targets, Maybe, Found and Archived (?sort=).
export const SortBy: Story = {
  name: "Sort by",
  render: () => <Fixture tab="found" company="orchard" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: /Sort by/ }));
  },
};
export const SortByPhone: Story = {
  name: "Sort by, phone",
  globals: { viewport: { value: "mobile2" } },
  render: () => <Fixture tab="found" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
    await userEvent.click(await within(document.body).findByRole("button", { name: /^Sort by/ }));
  },
};
// Has a job board first: the ones with a board, best fit within each.
export const SortedByJobBoard: Story = { name: "Found, sorted by job board", render: () => <Fixture tab="found" sort="board" /> };
// Fit being judged: the unranked wait in Not ranked yet, muted, and the filter bar counts them in.
export const Ranking: Story = { render: () => <Fixture data={rankingData} tab="found" company="orchard" /> };
export const RankingPhone: Story = { name: "Ranking, phone", globals: { viewport: { value: "mobile2" } }, render: () => <Fixture data={rankingData} tab="found" /> };
// Select, check Copperline, then Shift-click Tidewell: every row between them (Ashgrove too) is checked.
export const RangeSelected: Story = {
  name: "Range selected",
  render: () => <Fixture tab="found" company="orchard" />,
  play: async ({ canvasElement }) => {
    const user = userEvent.setup();
    await user.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
    await user.click(await within(document.body).findByRole("menuitem", { name: /^Select$/ }));
    await user.click(await rowIn(canvasElement, "Copperline"));
    await user.keyboard("{Shift>}");
    await user.click(await rowIn(canvasElement, "Tidewell"));
    await user.keyboard("{/Shift}");
    await expect(within(firstPane(canvasElement)).getByRole("group", { name: "Selected rows" })).toHaveTextContent(/3 selected/);
  },
};
// On a phone: a long press checks a row and starts selecting; the bar offers Archive and Target.
export const SelectingPhone: Story = {
  name: "Selecting, phone",
  globals: { viewport: { value: "mobile2" } },
  render: () => <Fixture tab="found" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
    // On a phone the menu is a sheet of buttons.
    await userEvent.click(await within(document.body).findByRole("button", { name: "Select" }));
    await userEvent.click(await rowIn(canvasElement, "Fernhill"));
    await userEvent.click(await rowIn(canvasElement, "Tidewell"));
  },
};
// The open company's ⋯: Archive (A), kept apart from Not a place to work.
export const ArchiveFromMenu: Story = {
  name: "Archive from ⋯",
  render: () => <Fixture tab="found" company="orchard" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Orchard Forecasting" }));
    await userEvent.hover(await within(document.body).findByRole("menuitem", { name: /^Archive/ }));
  },
};
// A archives the open company: it leaves Found for Archived, and the next one opens in its place.
export const ArchivedWithUndo: Story = {
  name: "Archived, with Undo",
  render: () => <Fixture tab="found" company="copperline" />,
  play: async ({ canvasElement }) => {
    await rowIn(canvasElement, "Copperline");
    await userEvent.keyboard("a");
    const pane = within(firstPane(canvasElement));
    await waitFor(() => expect(pane.queryByRole("button", { name: /^Copperline/ })).toBeNull());
    await expect(await pane.findByRole("tab", { name: /Found/ })).toHaveTextContent(/Found\s*7/);
  },
};
export const Archived: Story = { render: () => <Fixture data={archivedData} tab="archived" company="tidewell" /> };
export const ArchivedPhone: Story = {
  name: "Archived, phone",
  globals: { viewport: { value: "mobile2" } },
  render: () => <Fixture data={archivedData} tab="archived" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(firstPane(canvasElement)).findByRole("button", { name: "More for Companies" }));
    await userEvent.click(await within(document.body).findByRole("button", { name: "Select" }));
    await userEvent.click(await rowIn(canvasElement, "Ashgrove"));
  },
};
