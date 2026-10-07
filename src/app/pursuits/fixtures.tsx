import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CONTACT_GROUPS, type ContactGroup } from "../../../convex/contactGroups";
import { type ClosedReason, type Path, pathOf, type PursuitStatus } from "../../../convex/pursuitSteps";
import type { ResumeDoc } from "../../../convex/resumeDoc";
import { answer, type Answers } from "../storyConvex";

// Fixture data for the Pursuits stories: Orchard Forecasting's demand-planning role not started, eight pursuits under
// way (Meridian Coldchain's follow-up due, Loadstar's panel, Parcelpoint's offer, Lumen Planning's answers, Kestrel,
// Northgate, Bramblewood's outreach follow-up due, Fernhill Minneapolis's next contact due) and three closed, with what
// the screen's queries return for them. Mutations change the fixtures as the real ones change the data.

type Overview = FunctionReturnType<typeof api.roles.overview>;
type Role = FunctionReturnType<typeof api.roles.get>;
type RoleRow = FunctionReturnType<typeof api.roles.list>["page"][number];
type Pursuit = FunctionReturnType<typeof api.pursuits.get>;
type ListRow = FunctionReturnType<typeof api.pursuits.list>["pursuits"][number];

const DAY = 86_400_000;
const ago = (days: number, now: number) => now - days * DAY;
const dir = { solutions: "dir-solutions" as Id<"items">, product: "dir-product" as Id<"items">, planning: "dir-planning" as Id<"items">, startupOps: "dir-startup-ops" as Id<"items"> };
const DIRECTIONS = [
  { id: dir.product, name: "Supply Chain Product" },
  { id: dir.solutions, name: "Solutions Consulting" },
  { id: dir.startupOps, name: "Startup Operations" },
  { id: dir.planning, name: "Supply Planning" },
];
const nameOf = (d: Id<"items">) => DIRECTIONS.find((x) => x.id === d)!.name;

const FACTS: Record<string, string> = {
  f1: "Led the move to a new transportation management system for about 180 dispatchers and planners at four terminals.",
  f2: "Built a load-planning calculator that the shipping docks at both plants use to fit more cases on every outbound truck.",
  f3: "Replaced a 40-tab spreadsheet forecast with a Python model the demand team reruns every Monday, raising forecast accuracy from 61% to 74%.",
  f4: "Kept the case fill rate above 98% for eight straight quarters.",
};

const DOC: ResumeDoc = {
  summary: "Supply planning manager who builds the tools planners and shippers use, from forecast models to load planners.",
  experience: [
    {
      employer: "Brightwater Provisions",
      title: "Senior Supply Planning Manager",
      start: "2023-04",
      roleKey: "bw",
      bullets: [
        { text: FACTS.f4, factIds: ["f4"] },
        { text: FACTS.f2, factIds: ["f2"] },
        { text: "Moved production out of a closing plant into the second plant and two co-packers over one summer.", factIds: [] },
      ],
    },
    { employer: "Ironbridge Logistics", title: "Network Operations Manager", start: "2020-02", end: "2023-04", roleKey: "ib", bullets: [{ text: FACTS.f1, factIds: ["f1"] }] },
  ],
  skills: [{ group: "Planning", items: ["Sales and operations planning", "Demand forecasting", "Python"] }],
};

type Company = { id: Id<"companies">; name: string; domain: string; rating: "excited" | "maybe"; summary?: string };
const COMPANIES: Company[] = [
  { id: "co-loadstar" as Id<"companies">, name: "Loadstar Systems", domain: "loadstar.example.com", rating: "excited" },
  { id: "co-meridian" as Id<"companies">, name: "Meridian Coldchain", domain: "meridian.example.com", rating: "excited" },
  { id: "co-lumen" as Id<"companies">, name: "Lumen Planning", domain: "lumenplan.example.com", rating: "excited" },
  { id: "co-parcelpoint" as Id<"companies">, name: "Parcelpoint", domain: "parcelpoint.example.com", rating: "maybe" },
  { id: "co-kestrel" as Id<"companies">, name: "Kestrel Freight", domain: "kestrel.example.com", rating: "maybe" },
  { id: "co-northgate" as Id<"companies">, name: "Northgate Grocers", domain: "northgate.example.com", rating: "excited" },
  {
    id: "co-copperline" as Id<"companies">,
    name: "Copperline Robotics",
    domain: "copperline.example.com",
    rating: "maybe",
    summary: "Copperline builds autonomous mobile robots and the fulfillment software that routes them, for mid-size warehouses and third-party logistics providers.",
  },
  { id: "co-fernhill" as Id<"companies">, name: "Fernhill Foods", domain: "fernhill.example.com", rating: "maybe" },
  { id: "co-bramblewood" as Id<"companies">, name: "Bramblewood Home", domain: "bramblewood.example.com", rating: "maybe" },
  { id: "co-tidewell" as Id<"companies">, name: "Tidewell Medical Supply", domain: "tidewell.example.com", rating: "maybe" },
  { id: "co-ashgrove" as Id<"companies">, name: "Ashgrove Manufacturing", domain: "ashgrove.example.com", rating: "maybe" },
  { id: "co-orchard" as Id<"companies">, name: "Orchard Forecasting", domain: "orchard.example.com", rating: "excited" },
];
const company = (name: string) => COMPANIES.find((c) => c.name === name)!;

type Seed = {
  key: string;
  title: string;
  company: string;
  place: string;
  pay?: [number, number];
  score: number;
  level: "strong" | "some" | "weak";
  direction: Id<"items">;
  postedDaysAgo: number;
  rating?: "interested" | "no";
  // A pursuit started from a company's details with no open role (Start outreach): no posting, never listed as a role.
  noRole?: boolean;
  // Started: its pursuit. outreach: its contacts, each with when an outreach message to them was sent; followedUpDaysAgo:
  // a follow-up to the last of them.
  pursuit?: {
    status: PursuitStatus;
    closedReason?: ClosedReason;
    path?: Path;
    appliedDaysAgo?: number;
    contactedDaysAgo?: number;
    changedDaysAgo: number;
    interviewInDays?: number;
    nextStep?: string;
    hasLetter?: boolean;
    outreach?: { name: string; title: string; group: ContactGroup; sentDaysAgo?: number }[];
    followedUpDaysAgo?: number;
  };
};

const SEEDS: Seed[] = [
  { key: "pm-load", title: "Senior Product Manager, Load Planning", company: "Loadstar Systems", place: "Remote, US", pay: [165000, 205000], score: 91, level: "strong", direction: dir.product, postedDaysAgo: 30, pursuit: { status: "interviewing", appliedDaysAgo: 14, contactedDaysAgo: 16, changedDaysAgo: 2, interviewInDays: 3 } },
  { key: "sc-coldchain", title: "Solutions Consultant, Food & Beverage", company: "Meridian Coldchain", place: "Chicago, IL", pay: [140000, 175000], score: 88, level: "strong", direction: dir.solutions, postedDaysAgo: 20, pursuit: { status: "applied", appliedDaysAgo: 7, changedDaysAgo: 7 } },
  { key: "sc-demand", title: "Solutions Consultant, Demand Planning", company: "Orchard Forecasting", place: "Pittsburgh or remote", pay: [145000, 180000], score: 86, level: "strong", direction: dir.solutions, postedDaysAgo: 0 },
  { key: "se-lumen", title: "Solutions Engineer, Manufacturing", company: "Lumen Planning", place: "Remote, US", pay: [140000, 170000], score: 84, level: "strong", direction: dir.solutions, postedDaysAgo: 12, pursuit: { status: "preparing", changedDaysAgo: 1, hasLetter: true } },
  { key: "pm-robotics", title: "Product Manager, Fulfillment Software", company: "Copperline Robotics", place: "Pittsburgh, PA", score: 82, level: "strong", direction: dir.product, postedDaysAgo: 3, rating: "interested" },
  { key: "sc-enterprise", title: "Senior Solutions Consultant, Enterprise", company: "Lumen Planning", place: "Remote, US", score: 81, level: "strong", direction: dir.solutions, postedDaysAgo: 0 },
  { key: "pm-carriers", title: "Product Manager, Carrier Network", company: "Kestrel Freight", place: "Chicago, IL", score: 79, level: "some", direction: dir.product, postedDaysAgo: 9, pursuit: { status: "preparing", changedDaysAgo: 4, hasLetter: false } },
  { key: "planning-dir", title: "Director, Supply Planning", company: "Fernhill Foods", place: "Remote, US", score: 77, level: "some", direction: dir.planning, postedDaysAgo: 4, pursuit: { status: "contacted", path: "outreach", contactedDaysAgo: 3, changedDaysAgo: 3 } },
  {
    key: "outreach-copperline",
    title: "Supply Chain Product",
    company: "Copperline Robotics",
    place: "",
    score: 0,
    level: "some",
    direction: dir.product,
    postedDaysAgo: 0,
    noRole: true,
    pursuit: {
      status: "preparing",
      path: "outreach",
      changedDaysAgo: 0,
      outreach: [
        { name: "Dmitri Volkov", title: "VP Product", group: "hiringManager" },
        { name: "Ama Boateng", title: "Product Manager, Warehouse Software", group: "team" },
      ],
    },
  },
  {
    key: "planning-dir-2",
    title: "Director, Supply Planning",
    company: "Fernhill Foods",
    place: "Minneapolis, MN",
    score: 77,
    level: "some",
    direction: dir.planning,
    postedDaysAgo: 24,
    pursuit: {
      status: "contacted",
      path: "outreach",
      contactedDaysAgo: 20,
      changedDaysAgo: 12,
      followedUpDaysAgo: 12,
      outreach: [
        { name: "Helen Okoro", title: "VP Supply Chain", group: "hiringManager", sentDaysAgo: 20 },
        { name: "Marcus Bell", title: "Supply Planning Manager", group: "team" },
        { name: "Tess Arnaud", title: "Talent Partner, Operations", group: "recruiting" },
      ],
    },
  },
  { key: "planning-dir-3", title: "Director, Supply Planning", company: "Fernhill Foods", place: "Columbus, OH", score: 76, level: "some", direction: dir.planning, postedDaysAgo: 5 },
  {
    key: "fulfillment-head",
    title: "Head of Fulfillment Operations",
    company: "Bramblewood Home",
    place: "Brooklyn or remote",
    score: 74,
    level: "some",
    direction: dir.startupOps,
    postedDaysAgo: 15,
    pursuit: {
      status: "contacted",
      path: "outreach",
      contactedDaysAgo: 9,
      changedDaysAgo: 9,
      outreach: [
        { name: "Marisol Vega", title: "Chief Operating Officer", group: "hiringManager", sentDaysAgo: 9 },
        { name: "Jonah Pike", title: "Fulfillment Operations Manager", group: "team" },
      ],
    },
  },
  { key: "pm-replenish", title: "Senior Product Manager, Replenishment", company: "Northgate Grocers", place: "Cleveland or remote", score: 72, level: "some", direction: dir.product, postedDaysAgo: 25, pursuit: { status: "inConversation", appliedDaysAgo: 10, changedDaysAgo: 2 } },
  { key: "head-ops", title: "Head of Operations", company: "Parcelpoint", place: "Philadelphia or remote", score: 64, level: "some", direction: dir.startupOps, postedDaysAgo: 40, pursuit: { status: "offer", appliedDaysAgo: 30, changedDaysAgo: 1 } },
  { key: "systems-dir", title: "Director, Supply Chain Systems", company: "Tidewell Medical Supply", place: "Baltimore or remote", pay: [170000, 210000], score: 76, level: "some", direction: dir.product, postedDaysAgo: 60, pursuit: { status: "closed", closedReason: "rejected", appliedDaysAgo: 43, changedDaysAgo: 16 } },
  { key: "product-shippers", title: "Director of Product, Shipper Tools", company: "Kestrel Freight", place: "Chicago or remote", score: 81, level: "strong", direction: dir.product, postedDaysAgo: 70, pursuit: { status: "closed", closedReason: "withdrawn", appliedDaysAgo: 40, changedDaysAgo: 37 } },
  { key: "planning-mgr", title: "Supply Planning Manager", company: "Ashgrove Manufacturing", place: "Akron, OH", score: 69, level: "some", direction: dir.planning, postedDaysAgo: 80, pursuit: { status: "closed", closedReason: "noResponse", appliedDaysAgo: 50, changedDaysAgo: 29 } },
];

const postingId = (key: string) => `post-${key}` as Id<"postings">;
const pursuitId = (key: string) => `pur-${key}` as Id<"pursuits">;

// The store behind the answers: what the stories change as they're used.
export function pursuitsFixtures({ now = Date.now(), empty = false }: { now?: number; empty?: boolean } = {}): Answers {
  const seeds = empty ? [] : SEEDS.map((s) => ({ ...s, pursuit: s.pursuit && { ...s.pursuit } }));
  const notes: Record<string, { id: Id<"notes">; text: string; at: number; editedAt: number | null }[]> = {
    [pursuitId("systems-dir")]: [
      { id: "n1" as Id<"notes">, text: "The final round with their COO was mostly about backorders at hospital accounts. I had no clear order for moving 40 branches onto one replenishment system; sketch that before any similar panel.", at: ago(16, now), editedAt: null },
      { id: "n2" as Id<"notes">, text: "Their talent team will send me the inventory analytics lead posting when it opens in March.", at: ago(15, now), editedAt: null },
    ],
  };
  const answers: Record<string, Pursuit["answers"]> = {
    [pursuitId("se-lumen")]: [
      { question: "Tell us about a software rollout you owned end to end.", answer: "At Ironbridge Logistics I led our move to a new transportation management system. I chose the vendor with the terminal managers, migrated rates and lanes terminal by terminal, and trained about 180 dispatchers and planners. We switched one terminal at a time, so freight never stopped moving.", factIds: ["f1", "f2", "f3"], at: ago(1, now) },
      { question: "Why Lumen Planning?", answer: "I’ve run supply planning on spreadsheets and know where they break. At Brightwater I replaced a 40-tab forecast with a Python model and accuracy rose from 61% to 74%. I want manufacturers to get that jump in their first quarter without writing the code themselves.", factIds: ["f3", "f4"], at: ago(2, now) },
    ],
  };
  let followUp: { draft: { subject: string; text: string; factIds: string[]; edited: boolean; at: number } | null; sent: { id: Id<"followUps">; subject: string; text: string; to: string | null; at: number }[] } = {
    draft: {
      subject: "One more thing on my application",
      text: "Hi Ines, last week I applied for the Solutions Consultant role on your food and beverage team. One part my resume undersells: at Brightwater Provisions I plan 640 frozen and shelf-stable SKUs and have kept case fill above 98% for eight straight quarters, and at Ironbridge I moved 180 dispatchers onto a new TMS. Meridian’s food customers live with both problems.\n\nCould we find 20 minutes this week?\n\nWren",
      factIds: ["f4", "f1", "f3"],
      edited: false,
      at: ago(0, now),
    },
    sent: [],
  };
  const revealed = new Set(["c-rafael", "c-nadia"]);
  type People = FunctionReturnType<typeof api.people.list>;
  const replied: Record<string, number> = { "c-nadia": ago(2, now) };
  const added: People["people"] = [];
  const groups: Record<string, ContactGroup> = { "c-rafael": "hiringManager", "c-nadia": "recruiting", "c-lucia": "team", "c-gabe": "team" };

  const find = (key: string | undefined) => seeds.find((s) => postingId(s.key) === key || pursuitId(s.key) === key);

  const roleOf = (s: Seed): Role => ({
    id: postingId(s.key),
    title: s.title,
    company: { id: company(s.company).id, name: s.company, website: `https://${company(s.company).domain}` },
    url: `https://jobs.example.com/${s.company.toLowerCase().replace(/[^a-z]+/g, "-")}/${s.key}`,
    applyUrl: null,
    location: s.place,
    remote: s.place.includes("remote"),
    postedAt: ago(s.postedDaysAgo, now),
    firstSeen: ago(s.postedDaysAgo, now),
    closedAt: null,
    description:
      "About the role\n\nYou’ll take food and beverage manufacturers from signed contract to a live plan: connect their ERP data, configure forecasting and replenishment, and train their planners, working alongside account executives across the Midwest.\n\nWhat you’ll bring\n\n5+ years in supply planning or logistics operations. Comfort with SQL and spreadsheets. Patience with messy ERP exports.",
    hasDescription: true,
    details: {
      ...(s.pay ? { pay: { value: { min: s.pay[0], max: s.pay[1], currency: "USD", period: "year" as const }, source: "board" as const } } : {}),
      seniority: { value: "lead" as const, source: "ai" as const },
      yearsAsked: { value: 5, source: "ai" as const },
      employmentType: { value: "full-time" as const, source: "board" as const },
      travel: { value: 30, source: "ai" as const },
      clearance: { value: "none" as const, source: "ai" as const },
      visa: { value: true, source: "ai" as const },
    } as Role["details"],
    brief: {
      job: "Bring manufacturers onto the platform: connect their ERP data, configure forecasts and replenishment, and stay until their planners run the weekly plan in it, alongside account executives across the Midwest.",
      forYou: "You’ve planned 640 SKUs and moved 180 dispatchers onto a new TMS, and you build your own tools, from a Python forecast to the Palletwise load planner.",
    },
    sort: null,
    fit: [
      { directionId: s.direction, name: nameOf(s.direction), level: s.level, score: s.score, reason: "Palletwise and your Python forecast show you can build what planners use; you led a TMS rollout for 180 dispatchers and planners.", problems: [], stretch: ["it asks for five years at a software vendor; your software work sits inside operations roles"] },
      ...(s.direction !== dir.product ? [{ directionId: dir.product, name: nameOf(dir.product), level: "some" as const, score: s.score - 15, reason: "You’d configure the product for customers rather than decide what gets built next.", problems: [], stretch: [] }] : []),
      { directionId: dir.planning, name: nameOf(dir.planning), level: "weak" as const, score: 52, reason: "Running a plan yourself is a small part of this role.", problems: [], stretch: [] },
    ],
    rating: s.rating ?? null,
    ratingReason: null,
  });

  const rowOf = (s: Seed): RoleRow => {
    const r = roleOf(s);
    return {
      id: r.id,
      title: s.title,
      company: { id: company(s.company).id, name: s.company },
      direction: { id: s.direction, name: nameOf(s.direction) },
      level: s.level,
      score: s.score,
      reason: null,
      sortedBy: "model",
      details: r.details,
      problems: [],
      brief: r.brief?.job ?? null,
      location: s.place,
      remote: r.remote,
      postedAt: r.postedAt,
      firstSeen: r.firstSeen,
      url: r.url,
      rating: s.rating ?? null,
      ratingReason: null,
      pursuit: s.pursuit ? { id: pursuitId(s.key), status: s.pursuit.status, closedReason: s.pursuit.closedReason ?? null } : null,
    };
  };

  const timelineOf = (s: Seed): Pursuit["timeline"] => {
    const p = s.pursuit!;
    const t: Pursuit["timeline"] = [{ at: ago(Math.max(p.appliedDaysAgo ?? p.changedDaysAgo, p.contactedDaysAgo ?? 0) + 2, now), event: "started" }];
    if (p.contactedDaysAgo !== undefined) t.push({ at: ago(p.contactedDaysAgo, now), event: "status", status: "contacted" });
    if (p.appliedDaysAgo !== undefined) t.push({ at: ago(p.appliedDaysAgo, now), event: "status", status: "applied" });
    if (p.status === "inConversation") t.push({ at: ago(p.changedDaysAgo, now), event: "status", status: "inConversation" });
    if (p.status === "interviewing" || p.status === "offer" || s.key === "systems-dir") t.push({ at: ago(p.changedDaysAgo + 1, now), event: "status", status: "interviewing" });
    if (p.status === "offer") t.push({ at: ago(p.changedDaysAgo, now), event: "status", status: "offer" });
    if (p.status === "closed") t.push({ at: ago(p.changedDaysAgo, now), event: "status", status: "closed", reason: p.closedReason });
    if (s.key === "sc-coldchain") for (const x of followUp.sent) t.push({ at: x.at, event: "followedUp", text: `Ines Okafor: ${x.subject}` });
    for (const c of p.outreach ?? []) if (c.sentDaysAgo !== undefined) t.push({ at: ago(c.sentDaysAgo, now), event: "outreach", text: `${c.name}: About the ${s.title} role` });
    if (p.followedUpDaysAgo !== undefined) t.push({ at: ago(p.followedUpDaysAgo, now), event: "followedUp", text: `${p.outreach?.find((c) => c.sentDaysAgo !== undefined)?.name}: Following up` });
    return t.sort((a, b) => b.at - a.at);
  };

  const listRowOf = (s: Seed): ListRow => {
    const p = s.pursuit!;
    const timeline = timelineOf(s);
    const changedAt = Math.max(ago(p.changedDaysAgo, now), ...timeline.filter((e) => e.event === "followedUp").map((e) => e.at));
    return {
      id: pursuitId(s.key),
      postingId: s.noRole ? null : postingId(s.key),
      title: s.title,
      company: s.company,
      directionId: s.direction,
      direction: nameOf(s.direction),
      score: s.noRole ? null : s.score,
      level: s.noRole ? null : s.level,
      status: p.status,
      path: pathOf({ path: p.path, appliedAt: p.appliedDaysAgo, contactedAt: p.contactedDaysAgo }),
      contactedAt: p.contactedDaysAgo !== undefined ? ago(p.contactedDaysAgo, now) : null,
      repliedAt: p.status === "inConversation" ? ago(p.changedDaysAgo, now) : null,
      contacts: people(pursuitId(s.key)).people.map((c) => ({ id: c.id, name: c.name, sentAt: c.sent[0]?.at ?? null, repliedAt: c.repliedAt })),
      closedReason: p.closedReason ?? null,
      nextStep: p.nextStep ?? null,
      hasResume: p.status !== "preparing" || s.key === "se-lumen" || !!s.noRole,
      hasLetter: p.hasLetter ?? true,
      appliedAt: p.appliedDaysAgo !== undefined ? ago(p.appliedDaysAgo, now) : null,
      interviewAt: p.interviewInDays !== undefined ? new Date(now + p.interviewInDays * DAY).toISOString().slice(0, 10) : null,
      snoozed: null,
      changedAt,
      timeline: timeline.filter((e) => e.event === "followedUp" || e.event === "prepared").map((e) => ({ at: e.at, event: e.event })),
    };
  };

  const pursuitOf = (s: Seed): Pursuit => {
    const l = listRowOf(s);
    const p = s.pursuit!;
    const sent = p.status !== "preparing" && p.appliedDaysAgo !== undefined;
    return {
      id: l.id,
      postingId: l.postingId,
      companyId: company(s.company).id,
      title: s.title,
      company: s.company,
      url: s.noRole ? null : roleOf(s).url,
      applyUrl: null,
      closed: false,
      brief: s.noRole ? null : roleOf(s).brief,
      direction: { id: s.direction, name: nameOf(s.direction) },
      companySummary: s.noRole ? (company(s.company).summary ?? null) : null,
      directionSummary: s.noRole ? "Build the planning and logistics software you used to work around, as a product manager who has run it on a real plant floor." : null,
      score: l.score,
      level: l.level,
      status: p.status,
      path: l.path,
      chosenPath: p.path ?? null,
      contactedAt: l.contactedAt,
      repliedAt: l.repliedAt,
      outreach: p.outreach
        ? { hasContacts: true, to: p.outreach.find((c) => c.sentDaysAgo === undefined)?.name ?? null }
        : { hasContacts: s.key === "pm-load" || s.key === "sc-coldchain", to: s.key === "pm-load" || s.key === "sc-coldchain" ? "Rafael Duarte" : null },
      contacts: l.contacts,
      closedReason: p.closedReason ?? null,
      nextStep: l.nextStep,
      appliedAt: l.appliedAt,
      interviewAt: l.interviewAt,
      snoozed: null,
      rules: { followUp: true, prepare: true, stale: true },
      reached:
        s.key === "systems-dir"
          ? "interviewing"
          : p.status === "offer" || p.status === "interviewing" || p.status === "inConversation"
            ? p.status
            : p.appliedDaysAgo !== undefined
              ? "applied"
              : p.contactedDaysAgo !== undefined
                ? "contacted"
                : null,
      resumeId: l.hasResume ? (`res-${s.key}` as Id<"resumes">) : null,
      resume: s.noRole ? DOC : null,
      hasLetter: l.hasLetter,
      answers: answers[l.id] ?? [],
      facts: FACTS,
      sent: sent ? { at: ago(p.appliedDaysAgo!, now), resumeId: `res-${s.key}` as Id<"resumes">, resume: DOC, letter: "Dear hiring team,\n\nI’d bring fifteen years of running supply plans and freight networks, and the habit of building my own tools where the software stops.\n\nWren" } : null,
      timeline: timelineOf(s),
      changedAt: l.changedAt,
      at: ago(40, now),
    };
  };

  // Contacts of a seed with outreach: revealed, each with the message sent to them.
  const outreachPeople = (s: Seed): People["people"] =>
    s.pursuit!.outreach!.map((c, i) => {
      const id = `c-${s.key}-${i}` as Id<"contacts">;
      const email = `${c.name.split(" ")[0].toLowerCase()}@${company(s.company).domain}`;
      const sent = c.sentDaysAgo !== undefined ? [{ subject: `About the ${s.title} role`, text: `Hi ${c.name.split(" ")[0]}…`, to: `${c.name} <${email}>`, at: ago(c.sentDaysAgo, now) }] : [];
      return { id, name: c.name, title: c.title, hiringManager: c.group === "hiringManager", group: groups[id] ?? c.group, revealed: true, added: false, repliedAt: replied[id] ?? null, email, linkedinUrl: null, draft: null, sent, draftSent: false, writing: false, failed: null };
    });

  const people = (key: string): People => {
    const s = find(key);
    if (s?.pursuit?.outreach) return { facts: FACTS, people: outreachPeople(s) };
    return key === pursuitId("pm-load") || key === pursuitId("sc-coldchain")
      ? {
          facts: FACTS,
          people: [
            {
              id: "c-rafael" as Id<"contacts">,
              name: "Rafael Duarte",
              title: "Head of Product",
              hiringManager: true,
              group: groups["c-rafael"],
              revealed: revealed.has("c-rafael"),
              added: false,
              repliedAt: replied["c-rafael"] ?? null,
              email: revealed.has("c-rafael") ? "rafael@loadstar.example.com" : null,
              linkedinUrl: null,
              draft: {
                subject: "Ahead of Thursday’s interview",
                text: "Hi Rafael, I’m meeting your panel Thursday for the Load Planning product role and wanted to introduce myself first.\n\nAt Brightwater I built a load-planning calculator that the docks at both our plants now use on every outbound truck, and at Ironbridge I took 180 dispatchers and planners onto a new TMS. I’ve been the shipper your product serves, and I’ve built a small version of it myself.\n\nSee you Thursday. Wren",
                factIds: ["f2", "f1", "f4", "f3"],
                parts: { who: "Wren, meeting the panel Thursday", why: "I’ve been the shipper the product serves", fit: "Load-planning calculator; 180 dispatchers onto a new TMS", ask: "None; a hello before the interview" },
                at: ago(1, now),
              },
              sent: [],
              draftSent: false,
              writing: false,
              failed: null,
            },
            { id: "c-nadia" as Id<"contacts">, group: groups["c-nadia"], added: false, repliedAt: replied["c-nadia"] ?? null, name: "Nadia Brooks", title: "Senior Recruiter, Product", hiringManager: false, revealed: true, email: "nadia.brooks@loadstar.example.com", linkedinUrl: null, draft: null, sent: [{ subject: "Interest in the Load Planning PM role", text: "Hi Nadia…", to: "Nadia Brooks <nadia.brooks@loadstar.example.com>", at: ago(4, now) }], draftSent: false, writing: false, failed: null },
            { id: "c-lucia" as Id<"contacts">, group: groups["c-lucia"], added: false, repliedAt: replied["c-lucia"] ?? null, name: "Lucía Ferrer", title: "Director, Shipper Experience", hiringManager: false, revealed: revealed.has("c-lucia"), email: revealed.has("c-lucia") ? "lucia@loadstar.example.com" : null, linkedinUrl: null, draft: null, sent: [], draftSent: false, writing: false, failed: null },
            { id: "c-gabe" as Id<"contacts">, group: groups["c-gabe"], added: false, repliedAt: replied["c-gabe"] ?? null, name: "Gabe Whitlock", title: "Senior Product Manager, Routing", hiringManager: false, revealed: false, email: null, linkedinUrl: null, draft: null, sent: [], draftSent: false, writing: false, failed: null },
            ...added,
          ].sort((a, b) => CONTACT_GROUPS.indexOf(a.group) - CONTACT_GROUPS.indexOf(b.group)),
        }
      : { facts: {}, people: [] };
  };

  const overview = (directionId?: Id<"items">): Overview => ({
    directions: empty ? [] : DIRECTIONS,
    ranked: !empty,
    stale: directionId === dir.solutions,
    stretch: true,
    sortedOut: { count: 212, more: false },
    against: { count: 14, more: false },
    fromLimits: { clearance: null, visa: false },
    companies: COMPANIES.map((c) => ({ id: c.id, name: c.name, rating: c.rating })),
    pass: null,
    coverage: [
      ...COMPANIES.filter((c) => c.name !== "Parcelpoint" && c.name !== "Northgate Grocers").map((c) => ({ id: c.id, name: c.name, rating: c.rating, board: { provider: "greenhouse", url: "https://boards.greenhouse.io/x" }, searched: false, read: 40, boardTotal: 40, lastRead: ago(0, now), lastFailed: null, stale: false, checking: false })),
      { id: company("Parcelpoint").id, name: "Parcelpoint", rating: "maybe" as const, board: null, searched: false, read: 0, boardTotal: null, lastRead: null, lastFailed: null, stale: true, checking: false },
      { id: company("Northgate Grocers").id, name: "Northgate Grocers", rating: "excited" as const, board: { provider: "apollo", url: "" }, searched: false, read: 12, boardTotal: null, lastRead: ago(4, now), lastFailed: null, stale: false, checking: false },
    ] as Overview["coverage"],
  });

  const listed = (filters: { rating?: string; minScore?: { value: number } }, directionId?: Id<"items">) =>
    seeds
      .filter((s) => !s.noRole)
      .filter((s) => (filters.rating === "interested" ? s.rating === "interested" : filters.rating === "no" ? s.rating === "no" : s.rating !== "no"))
      .filter((s) => !filters.minScore || s.score >= filters.minScore.value)
      .filter((s) => !directionId || s.direction === directionId)
      .sort((a, b) => b.score - a.score);

  const page = <T,>(rows: T[]) => ({ page: rows, isDone: true, continueCursor: "", splitCursor: null, pageStatus: null });

  const setRating = ({ id: postId, value }: { id: string; value: "interested" | "no" | null }) => {
    const s = find(postId);
    if (s) s.rating = value ?? undefined;
  };

  return {
    ...answer(api.pursuits.list, () => ({ rules: { followUp: true, prepare: true, stale: true }, pursuits: seeds.filter((s) => s.pursuit).map(listRowOf).sort((a, b) => b.changedAt - a.changedAt) })),
    ...answer(api.pursuits.get, ({ id: pid }) => {
      const s = find(pid);
      return s?.pursuit ? pursuitOf(s) : undefined;
    }),
    ...answer(api.pursuits.forPosting, ({ postingId: post }) => {
      const s = find(post);
      return s?.pursuit ? { id: pursuitId(s.key), status: s.pursuit.status, closedReason: s.pursuit.closedReason ?? null } : null;
    }),
    ...answer(api.pursuits.byDirection, () => [
      { direction: "Supply Chain Product", started: 5, contacted: 3, applied: 3, contactedOrApplied: 4, interviewed: 2, offers: 0, open: 3, closed: { rejected: 1, withdrawn: 1, noResponse: 0, declined: 0 } },
      { direction: "Solutions Consulting", started: 2, contacted: 0, applied: 1, contactedOrApplied: 1, interviewed: 0, offers: 0, open: 2, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
      { direction: "Startup Operations", started: 1, contacted: 1, applied: 0, contactedOrApplied: 1, interviewed: 1, offers: 1, open: 1, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
      { direction: "Supply Planning", started: 1, contacted: 1, applied: 1, contactedOrApplied: 1, interviewed: 0, offers: 0, open: 0, closed: { rejected: 0, withdrawn: 0, noResponse: 1, declined: 0 } },
    ]),
    ...answer(api.roles.overview, ({ directionId }) => overview(directionId)),
    ...answer(api.roles.list, ({ filters, directionId }) => page(listed(filters, directionId).map(rowOf))),
    ...answer(api.roles.count, ({ filters, directionId }) => ({ count: Object.keys(filters).length ? listed(filters, directionId).length : 412, more: false })),
    ...answer(api.roles.against, () =>
      page(seeds.filter((s) => s.key === "sc-coldchain" || s.key === "planning-dir-3").map((s) => ({ ...rowOf(s), problems: [`On-site in ${s.place.split(",")[0]}; you work hybrid from Pittsburgh or remote`] }))),
    ),
    ...answer(api.roles.sortedOut, () => page(seeds.slice(7, 9).map(rowOf))),
    ...answer(api.roles.places, () => [{ value: "Remote", label: "Remote" }, { value: "Pittsburgh, PA", label: "Pittsburgh, PA" }, { value: "Chicago, IL", label: "Chicago, IL" }]),
    ...answer(api.roles.get, ({ id: post }) => {
      const s = find(post);
      return s ? roleOf(s) : undefined;
    }),
    ...answer(api.resume.forPosting, ({ postingId: post }) => {
      const s = find(post);
      const has = s && (s.pursuit ? s.pursuit.status !== "preparing" || s.key === "se-lumen" : s.key === "sc-demand");
      return {
        facts: FACTS,
        last: null,
        settings: { roles: [], projects: [], skills: [] },
        tailored: has
          ? [
              {
                id: `res-${s.key}` as Id<"resumes">,
                doc: DOC,
                layout: null,
                postingTitles: {},
                posting: s.title,
                role: { id: postingId(s.key), title: s.title, company: s.company, url: roleOf(s).url },
                requirements: [
                  { requirement: "Rolling out planning or logistics software to operations teams", strength: "strong" as const, factIds: ["f1"] },
                  { requirement: "Building tools that planners and shippers use", strength: "strong" as const, factIds: ["f2"] },
                  { requirement: "Experience at a software vendor", strength: "partial" as const, factIds: [] },
                ],
                at: ago(3, now),
                direction: { id: s.direction, name: nameOf(s.direction) },
                titles: { suggested: {}, direction: {}, posting: {} },
              },
            ]
          : [],
      };
    }),
    ...answer(api.letters.forPursuit, ({ pursuitId: pid }) => ({
      versions:
        pid === pursuitId("se-lumen")
          ? [{ id: "l1" as Id<"letters">, paragraphs: [{ text: "For fifteen years I’ve run the plans your software is built for, from a brewery’s brew schedule to 640 SKUs of soups and frozen meals.", factIds: ["f4"] }, { text: "At Brightwater I replaced a 40-tab spreadsheet forecast with a Python model and raised accuracy from 61% to 74%.", factIds: ["f3"] }], edited: false, at: ago(1, now) }]
          : [],
      facts: FACTS,
      last: null,
    })),
    ...answer(api.ask.conversation, ({ pursuitId: pid }) =>
      pid === pursuitId("se-lumen")
        ? {
            facts: FACTS,
            last: null,
            messages: [
              { id: "m1" as Id<"pursuitMessages">, from: "you" as const, text: "Application question: “How would you get a new manufacturing customer to their first live plan?” 150 words.", factIds: [], kept: false, learned: false, at: ago(1, now) },
              {
                id: "m2" as Id<"pursuitMessages">,
                from: "careerbot" as const,
                text: "Week one: sit with their planners and pull a year of orders, shipments and production history out of the ERP. Find the ten SKUs behind most of the expediting.\n\nBy day 30, those SKUs forecast in Lumen next to the old spreadsheet so planners can compare. By day 90, the weekly plan runs in Lumen, the spreadsheet is retired, and one planner on their side owns it. It’s how I moved four terminals onto a new TMS at Ironbridge.",
                factIds: ["f1", "f2", "f3"],
                kept: true,
                learned: false,
                at: ago(1, now),
              },
              { id: "m3" as Id<"pursuitMessages">, from: "you" as const, text: "The Python forecast at Brightwater was my own code, written on weekends.", factIds: [], kept: false, learned: true, at: ago(1, now) },
            ],
          }
        : { facts: {}, last: null, messages: [] },
    ),
    ...answer(api.people.list, ({ pursuitId: pid }) => people(pid)),
    ...answer(api.notes.list, ({ subject }) => notes[subject.id] ?? []),
    ...answer(api.profile.get, () => ({ name: "Wren Castellano", email: "wren@example.com", phone: "", location: "Pittsburgh, Pennsylvania", links: [] })),
    ...answer(api.estimates.costs, () => ({ followUp: 0.01, outreach: 0.01, letter: 0.02, ask: 0.01, tailor: 0.04, rankPerRole: 0.0001, read: null, readRevision: null, rewrite: null, disagreements: null, duplicates: null, sameWork: null, skills: null, insights: null, repository: null, resume: null, directionResume: null, resumeLines: null, goals: null, limitRule: null, directionDetail: null, suggestDirections: null, lineCheck: null, lineUpdate: 0.01 })),
    ...answer(api.followUpEmails.forPursuit, ({ pursuitId: pid }) =>
      pid === pursuitId("sc-coldchain")
        ? {
            to: { id: "c-ines" as Id<"contacts">, name: "Ines Okafor", title: "Senior Recruiter", email: "ines.okafor@meridian.example.com" },
            contacts: [{ id: "c-ines" as Id<"contacts">, name: "Ines Okafor", title: "Senior Recruiter", email: "ines.okafor@meridian.example.com" }],
            draft: followUp.draft,
            rewrite: null,
            sent: followUp.sent,
            facts: FACTS,
            writing: false,
            failed: null,
          }
        : find(pid)?.pursuit?.outreach
          ? (() => {
              const wrote = people(pid).people.filter((c) => c.sent.length > 0);
              const to = wrote.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email }));
              return { to: to.at(-1) ?? null, contacts: to, draft: null, rewrite: null, sent: [], facts: {}, writing: false, failed: null };
            })()
          : { to: null, contacts: [], draft: null, rewrite: null, sent: [], facts: {}, writing: false, failed: null },
    ),
    // What the stories change.
    ...answer(api.roles.rate, (args) => setRating(args)),
    ...answer(api.pursuits.start, ({ postingId: post }) => {
      const s = find(post)!;
      s.pursuit = { status: "preparing", changedDaysAgo: 0, hasLetter: false };
      return pursuitId(s.key);
    }),
    ...answer(api.pursuits.setStatus, ({ id: pid, status, reason }) => {
      const s = find(pid)!;
      s.pursuit = { ...s.pursuit!, status, closedReason: reason, changedDaysAgo: 0, ...(status === "contacted" && s.pursuit!.contactedDaysAgo === undefined ? { contactedDaysAgo: 0 } : {}) };
    }),
    ...answer(api.pursuits.setPath, ({ id: pid, path }) => {
      const s = find(pid)!;
      s.pursuit = { ...s.pursuit!, path: path ?? undefined };
    }),
    ...answer(api.followUpEmails.markSent, () => {
      if (!followUp.draft) return null;
      const sent = { id: `fu-${followUp.sent.length}` as Id<"followUps">, subject: followUp.draft.subject, text: followUp.draft.text, to: "Ines Okafor <ines.okafor@meridian.example.com>", at: Date.now() };
      followUp = { ...followUp, sent: [sent, ...followUp.sent] };
      return sent.id;
    }),
    ...answer(api.followUpEmails.undoSent, ({ id: sentId }) => {
      followUp = { ...followUp, sent: followUp.sent.filter((x) => x.id !== sentId) };
    }),
    ...answer(api.followUpEmails.edit, ({ subject, text }) => {
      followUp = { ...followUp, draft: { ...followUp.draft!, subject, text, edited: true, factIds: text === followUp.draft!.text ? followUp.draft!.factIds : [], at: Date.now() } };
    }),
    ...answer(api.notes.add, ({ subject, text }) => {
      notes[subject.id] = [...(notes[subject.id] ?? []), { id: `n-${Date.now()}` as Id<"notes">, text, at: Date.now(), editedAt: null }];
      return notes[subject.id].at(-1)!.id;
    }),
    ...answer(api.notes.remove, ({ id: noteId }) => {
      for (const k of Object.keys(notes)) notes[k] = notes[k].filter((n) => n.id !== noteId);
    }),
    ...answer(api.pursuits.saveAnswer, ({ id: pid, question, answer: a, at }) => {
      const list = answers[pid] ?? [];
      answers[pid] = at === undefined ? [{ question, answer: a, factIds: [], at: Date.now() }, ...list] : list.map((x) => (x.at === at ? { ...x, question, answer: a } : x));
    }),
    ...answer(api.people.reveal, ({ contactId }) => {
      revealed.add(contactId);
      return `${contactId}@example.com`;
    }),
    ...answer(api.people.add, ({ name, title, email, group }) => {
      const id = `c-added-${added.length}` as Id<"contacts">;
      added.push({ id, name, title: title || null, hiringManager: false, group, revealed: true, added: true, repliedAt: null, email: email || null, linkedinUrl: null, draft: null, sent: [], draftSent: false, writing: false, failed: null });
      return id;
    }),
    ...answer(api.people.markReplied, ({ contactId }) => {
      replied[contactId] = Date.now();
      return "contacted" as const;
    }),
    ...answer(api.people.unmarkReplied, ({ contactId }) => {
      delete replied[contactId];
    }),
    ...answer(api.people.setGroup, ({ contactId, group }) => {
      groups[contactId] = group;
    }),
    ...answer(api.apolloKey.balance, () => ({ left: 188, limit: 200, consumed: 12 })),
    ...answer(api.roles.setStretch, () => undefined),
  };
}
