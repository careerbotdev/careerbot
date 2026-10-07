import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState, useSyncExternalStore } from "react";
import { userEvent, within } from "storybook/test";
import type { Id } from "../../../convex/_generated/dataModel";
import { BottomBar } from "@/components/BottomBar";
import type { Note } from "@/components/NoteBlock";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { Companies } from "./Companies";
import { type Act, type CompaniesData, type CompaniesEnv, CompaniesEnvContext, type Company, type Coverage, type OpenRoles, type Person, type Tab } from "./env";

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
    foundedYear: undefined,
    screened: { employer: true, kind: "employer", by: "ai", at: now - 20 * DAY },
    details: null,
    fit: [],
    rating: null,
    ratingReason: null,
    goals: null,
    named: false,
    boardUrl: null,
    checking: false,
    found: ["Supply Chain Product (criteria)"],
    foundAt: now - 25 * DAY,
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
    foundedYear: 2016,
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
    foundedYear: 2021,
    details: details("Demand-planning software for food and beverage brands, sold to their planning teams.", "orchardforecasting", { open: 12, remote: 9, matching: ["Solutions Consultant, Demand Planning", "Implementation Consultant", "Senior Solutions Consultant", "Solutions Consultant, Beverage"] }),
    goals: goals("fits", "Builds planning software for food brands."),
    fit: [fit(solutions, "strong", "Deals turn on a pilot forecast built from the customer’s own sales history."), fit(product, "some", "Product roles exist, but the whole team is four people.")],
    found: ["Solutions Consulting (like your seeds)"],
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
  company("keelstaffing", { name: "Keel Staffing Partners", screened: { employer: false, kind: "staffing or recruiting", by: "rule", at: now - 20 * DAY } }),
  company("haulhire", { name: "HaulHire", screened: { employer: false, kind: "job board", by: "you", at: now - 10 * DAY } }),
];

const coverage: Record<string, Coverage> = Object.fromEntries(
  companies
    .filter((c) => c.rating === "excited" || c.rating === "maybe")
    .map((c, i) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        rating: c.rating as "excited" | "maybe",
        board: c.details?.board ? { provider: "greenhouse" as const, url: c.details.board.url } : null,
        searched: false,
        read: c.details?.board ? [214, 9, 6, 0, 4, 11][i] : 2,
        boardTotal: null,
        lastRead: c.details?.board ? now - (i % 3) * DAY : null,
        lastFailed: null,
        stale: false,
        checking: false,
      },
    ]),
);

const roles: Record<string, OpenRoles> = {
  loadstar: {
    count: 6,
    more: false,
    top: [
      { id: "p1" as Id<"postings">, title: "Senior Product Manager, Load Planning", score: 91, level: "strong", place: "Remote, US" },
      { id: "p2" as Id<"postings">, title: "Solutions Consultant, Shippers", score: 86, level: "strong", place: "Columbus or remote" },
      { id: "p3" as Id<"postings">, title: "Carrier Success Manager", score: 58, level: "weak", place: "Columbus, OH" },
    ],
  },
  parcelpoint: {
    count: 2,
    more: false,
    top: [
      { id: "p4" as Id<"postings">, title: "Head of Operations", score: 64, level: "some", place: "Philadelphia or remote" },
      { id: "p5" as Id<"postings">, title: "Hub Supervisor", score: 55, level: "weak", place: "Philadelphia" },
    ],
  },
};

const people: Record<string, Person[]> = {
  loadstar: [
    { name: "Rafael Duarte", title: "Head of Product", hiringManager: true, group: "hiringManager" as const, pursuitId: "u1" as Id<"pursuits"> },
    { name: "Nadia Brooks", title: "Senior Recruiter", hiringManager: false, group: "recruiting" as const, pursuitId: "u1" as Id<"pursuits"> },
  ],
};

const base: CompaniesData = {
  named: ["parcelpoint.example.com"],
  apolloJobs: true,
  lens: { industries: "steer", judge: "hide" },
  learn: true,
  companyGoals: [
    { id: did("g1"), text: "Works on food, freight or the software behind them" },
    { id: did("g2"), text: "Skip tobacco companies" },
  ],
  seeds: [
    { domain: "lumenplan.example.com", lookup: { apolloId: "a1", name: "Lumen Planning", domain: "lumenplan.example.com" } },
    { domain: "orchard.example.com", lookup: null },
  ],
  searchable: [
    { id: product, name: "Supply Chain Product", ownSeeds: null, hasTitles: true, targets: ["Loadstar Systems", "Meridian Coldchain"] },
    { id: solutions, name: "Solutions Consulting", ownSeeds: null, hasTitles: true, targets: ["Loadstar Systems"] },
    { id: startupOps, name: "Startup Operations", ownSeeds: null, hasTitles: false, targets: ["Parcelpoint"] },
  ],
  needCriteria: [{ id: planning, name: "Supply Planning" }],
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

function createStore(initial: CompaniesData, initialParams: { tab: Tab | null; company: string | null }) {
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
    startOutreach: async () => "pur-outreach",
    setNamed: async ({ named }: { named: string[] }) => {
      data = { ...data, named: named.map((s) => s.trim()).filter(Boolean) };
      emit();
      return null;
    },
    setSeeds: async ({ seeds }: { seeds: string[] }) => {
      data = { ...data, seeds: seeds.map((s) => s.trim()).filter(Boolean).map((domain) => ({ domain, lookup: null })) };
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
    setParams: (next: { tab?: Tab | null; company?: string | null }) => {
      params = { tab: next.tab === undefined ? params.tab : next.tab, company: next.company === undefined ? params.company : next.company };
      emit();
    },
    act,
  };
}

function Fixture({ data = base, tab = null, company = null }: { data?: CompaniesData; tab?: Tab | null; company?: string | null }) {
  const [store] = useState(() => createStore(data, { tab, company }));
  const env = useMemo((): CompaniesEnv => {
    const useData = () => useSyncExternalStore(store.subscribe, store.data, store.data);
    return {
      useData,
      useCoverage: (id, watched) => (watched ? (coverage[id] ?? null) : null),
      useOpenRoles: (id, watched) => (watched ? (roles[id] ?? { top: [], count: 0, more: false }) : undefined),
      useNotes: (id) => useSyncExternalStore(store.subscribe, store.notes, store.notes)[id] ?? [],
      usePeople: (id) => people[id] ?? [],
      useParams: () => ({ ...useSyncExternalStore(store.subscribe, store.params, store.params), set: store.setParams }),
      useAct: () => store.act,
      useBalance: () => async () => ({ left: 312, limit: 500, consumed: 188 }),
      useDemo: () => false,
    };
  }, [store]);
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
// R on a row asks why, under the row.
export const FoundNotForMe: Story = {
  name: "Found, Not for me",
  render: () => <Fixture tab="found" company="orchard" />,
  play: async ({ canvasElement }) => {
    const row = await within(canvasElement).findByRole("button", { name: /^Tidewell/ });
    row.focus();
    await userEvent.keyboard("r");
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
export const FindCompanies: Story = {
  name: "Find companies",
  render: () => <Fixture tab="targets" company="loadstar" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "More for Companies" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: /Find companies/ }));
  },
};
export const FindCompaniesNotLearning: Story = {
  name: "Find companies, not learning from ratings",
  render: () => <Fixture data={{ ...base, learn: false, searchable: base.searchable.map((d) => ({ ...d, targets: [] })) }} tab="targets" company="loadstar" />,
  play: FindCompanies.play,
};
export const LensSettings: Story = {
  name: "Lens settings",
  render: () => <Fixture tab="targets" company="loadstar" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "More for Companies" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: /Lens settings/ }));
  },
};
export const Empty: Story = { render: () => <Fixture data={{ ...base, companies: [], last: null }} /> };
// Nothing chosen: on a phone, the list; beside it, the first company opens.
export const FoundList: Story = { name: "Found, list", render: () => <Fixture tab="found" /> };
