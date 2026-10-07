import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { LayoutRole, ResumeDoc, ResumeLayout } from "../../../convex/resumeDoc";
import { answer, type Answers } from "../storyConvex";
import type { Overview, ResumeData } from "./words";

// Fixture data for the Resumes stories: the base resume (a pinned line, a hidden one, the Three Rivers Pantry Network
// folded into Brightwater Provisions), Supply Chain Product changed since it was written, Solutions Consulting with a
// new version waiting, four direction resumes not written yet (one waiting for its positioning) and three tailored
// resumes. `checked`: two base resume lines and the summary in their own words, one line checked Supported, one found
// going beyond its facts, the summary not checked yet. Mutations change the fixtures as the real ones change the data.

type History = FunctionReturnType<typeof api.resume.history>;
type VersionOne = FunctionReturnType<typeof api.resume.version>;
type Note = FunctionReturnType<typeof api.notes.list>[number];

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 29, 16);
const at = (days: number, hours = 0) => NOW - days * DAY - hours * 3_600_000;
const rid = (s: string) => s as Id<"resumes">;
const dir = {
  product: "dir-product" as Id<"items">,
  solutions: "dir-solutions" as Id<"items">,
  planning: "dir-planning" as Id<"items">,
  logistics: "dir-logistics" as Id<"items">,
  consulting: "dir-consulting" as Id<"items">,
  plant: "dir-plant" as Id<"items">,
};

const FACTS: Record<string, string> = {
  f1: "Lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods.",
  f2: "Took finished-goods inventory from 41 to 29 days of supply without lowering service, freeing about $9 million in working capital.",
  f3: "Contained a supplier’s allergen recall in 36 hours by tracing every affected lot through both plants and the co-packers and rebuilding the production schedule around it.",
  f4: "Named Brightwater’s Operator of the Year for 2025 after moving production out of a closing plant without missing a retail order.",
  f5: "Rebuilt the monthly sales and operations planning meeting so finance, sales and both plants commit to a single demand number.",
  f6: "Ran quarterly scorecard reviews with the network’s 30 largest carriers and used on-time and claims data to reset rates each spring.",
  f7: "Led the move to a new transportation management system for about 180 dispatchers and planners at four terminals.",
  f8: "Designed weekend delivery routes for 14 partner pantries, driven by about 60 volunteers.",
  f9: "Planned capacity for a second brewhouse that took annual output from 38,000 to 70,000 barrels.",
  f10: "Built Palletwise end to end: a SvelteKit app that packs mixed pallets into a 53-foot trailer and draws the load plan in 3D with Three.js.",
  f11: "Built Brewlog, a fermentation monitor that reads gravity and temperature from Raspberry Pi sensors every five minutes.",
  f12: "Wrote the co-packer onboarding guide: forecast sharing, minimum runs, quality holds and how schedule changes get approved.",
  f13: "Replaced a 40-tab spreadsheet forecast with a Python model the demand team reruns every Monday, raising forecast accuracy from 61% to 74%.",
};

const baseDoc = (): ResumeDoc => ({
  summary:
    "Supply planning leader with fifteen years in food manufacturing, freight and brewing. Plans 640 SKUs across two plants and two co-packers, about $210 million a year in cost of goods, and freed about $9 million in working capital by taking inventory from 41 to 29 days of supply.",
  experience: [
    {
      employer: "Brightwater Provisions",
      title: "Senior Supply Planning Manager",
      location: "Pittsburgh, Pennsylvania",
      start: "2023-04",
      roleKey: "bw",
      bullets: [
        { text: "Lead supply planning for 640 SKUs made at two plants and two co-packers, about $210 million a year in cost of goods, from the weekly production schedule to the annual capacity plan.", factIds: ["f1"] },
        { text: "Took finished-goods inventory from 41 to 29 days of supply without lowering service, freeing about $9 million in working capital for the business.", factIds: ["f2"] },
        { text: "Contained a supplier’s allergen recall in 36 hours by tracing every affected lot through both plants and the co-packers.", factIds: ["f3"] },
        { text: "Named Operator of the Year for 2025 after moving production out of a closing plant without missing a retail order.", factIds: ["f4"] },
        { text: "Rebuilt the monthly sales and operations planning meeting so finance, sales and both plants commit to one demand number.", factIds: ["f5"] },
      ],
    },
    { employer: "Three Rivers Pantry Network", title: "Volunteer Logistics Lead", start: "2021-09", end: "2023-03", roleKey: "pantry", bullets: [{ text: "Designed the weekend delivery routes for 14 partner pantries and scheduled the roughly 60 volunteer drivers who run them.", factIds: ["f8"] }] },
    {
      employer: "Ironbridge Logistics",
      title: "Network Operations Manager",
      start: "2020-02",
      end: "2023-04",
      roleKey: "ib",
      bullets: [
        { text: "Ran quarterly scorecard reviews with the network’s 30 largest carriers and reset rates each spring from on-time and claims data.", factIds: ["f6"] },
        { text: "Led about 180 dispatchers and planners at four terminals onto a new transportation management system.", factIds: ["f7"] },
      ],
    },
    { employer: "Kettle & Crane Brewing", title: "Production Planning Lead", location: "Milwaukee, Wisconsin", start: "2017-03", end: "2020-01", roleKey: "kcPlan", bullets: [{ text: "Planned capacity for a second brewhouse that took annual output from 38,000 to 70,000 barrels.", factIds: ["f9"] }] },
    { employer: "Kettle & Crane Brewing", title: "Packaging Line Supervisor", location: "Milwaukee, Wisconsin", start: "2015-06", end: "2017-03", roleKey: "kcLine", bullets: [] },
    { employer: "", title: "Career break", start: "2015-01", end: "2015-06", roleKey: "break", break: true, reason: "Walked the Ice Age Trail", bullets: [] },
  ],
  projects: [
    { projectKey: "palletwise", name: "Palletwise", url: "https://github.com/wrencastellano/palletwise", start: "2025-02", end: "2026-01", roleKey: "bw", bullets: [{ text: "Built a SvelteKit load planner that packs mixed pallets into a 53-foot trailer and draws the plan in 3D with Three.js.", factIds: ["f10"] }] },
  ],
  skills: [
    { group: "Supply planning", items: ["Demand forecasting", "Sales and operations planning", "Inventory optimization", "Capacity planning"], keys: ["s1", "s2", "s3", "s4"] },
    { group: "Tools", items: ["NetSuite", "SAP IBP", "Power BI", "Python"], keys: ["s5", "s6", "s7", "s8"] },
  ],
});

const directionDoc = (): ResumeDoc => {
  const d = baseDoc();
  return {
    ...d,
    summary: "Planner who writes the tools the plan runs on and wants to build them for other planners. Replaced a spreadsheet forecast with a Python model that lifted accuracy from 61% to 74%, and built the load planner both Brightwater plants ship with.",
    experience: d.experience.map((e) =>
      e.roleKey === "bw" ? { ...e, bullets: [{ text: "Replaced a 40-tab spreadsheet forecast with a Python model the demand team reruns every Monday, lifting forecast accuracy from 61% to 74%.", factIds: ["f13"] }] } : e.roleKey === "kcPlan" ? { ...e, bullets: [{ text: "Grew the brewery’s output by more than 80% without adding a shift.", factIds: [], unsourced: true }] } : e,
    ),
    projects: [],
  };
};

const SETTINGS: ResumeData["settings"] = {
  roles: [
    { roleKey: "pantry", fold: { into: "previous", bullets: "move" } },
    { roleKey: "bw", title: "translated", translated: "Supply Chain Planning and S&OP Leadership" },
    { roleKey: "ib", title: "translated", translated: "Transportation Operations Manager" },
  ],
  projects: [],
  skills: [],
};

const TITLES: ResumeData["titles"] = {
  suggested: {
    bw: { text: "Supply Chain Planning and S&OP Leadership", from: "record" },
    ib: { text: "Transportation Operations Manager", from: "record" },
    kcPlan: { text: "Materials Planning Manager", from: "record" },
  },
  direction: {},
};

export function resumesFixtures({ additions = false, empty = false, noContact = false, checked = false }: { additions?: boolean; empty?: boolean; noContact?: boolean; checked?: boolean } = {}): Answers {
  let contact: { name: string; email: string | undefined; phone: string | undefined; location: string | undefined; links: string[] } | null = noContact ? null : { name: "Wren Castellano", email: "wren@example.com", phone: "(412) 555-0137", location: "Pittsburgh, Pennsylvania", links: [] };
  const bw = baseDoc().experience[0].bullets;
  const layouts: Record<string, ResumeLayout> = {
    "v-base-3": {
      roles: [],
      bullets: [{ text: bw[1].text, state: "pinned" }, { text: bw[4].text, state: "hidden" }],
      ...(checked
        ? {
            words: [
              { text: bw[0].text, to: "Run supply planning for 640 SKUs across two plants and two co-packers, about $210 million a year in cost of goods.", check: { supported: true, beyond: [], at: at(0, 2) } },
              { text: bw[2].text, to: "Designed Brightwater’s recall program and used it to contain a supplier’s allergen recall in 36 hours across every plant in the region.", check: { supported: false, beyond: ["Designed Brightwater’s recall program", "across every plant in the region"], at: at(0, 1) } },
            ],
            summary: "Supply planning leader who runs a $210 million product line and handed $9 million of working capital back to the business.",
          }
        : {}),
    },
    "v-product-1": { roles: [{ roleKey: "bw", title: "translated", translated: "Supply Planning Product Lead", source: "direction" }] },
  };
  let checking: { lines: string[]; summary: boolean } = { lines: [], summary: false };
  const docs: Record<string, ResumeDoc> = {
    "v-base-3": baseDoc(),
    "v-base-2": { ...baseDoc(), experience: baseDoc().experience.map((e) => (e.roleKey === "bw" ? { ...e, bullets: [...e.bullets.slice(0, 1), { text: "Never missed a retail delivery window since joining Brightwater.", factIds: ["f-old"] }, e.bullets[3]] } : e)) },
    "v-product-1": directionDoc(),
    "v-solutions-1": directionDoc(),
    "v-solutions-2": { ...directionDoc(), projects: [{ projectKey: "brewlog", name: "Brewlog", url: "https://github.com/wrencastellano/brewlog", start: "2026-03", end: "2026-07", bullets: [{ text: "Built a fermentation monitor that reads gravity and temperature from Raspberry Pi sensors every five minutes and flags a stalled batch.", factIds: ["f11"] }] }] },
    "t-meridian": directionDoc(),
    "t-loadstar-2": directionDoc(),
    "t-loadstar-1": directionDoc(),
  };
  const counts = { roles: 7, facts: 99, insights: 10 };
  let state = {
    product: { state: "changed" as const, summary: "3 new facts at Brightwater Provisions, 1 new project (Brewlog), 1 reworded fact at Ironbridge Logistics", additions: additions ? [
      { text: "Wrote the co-packer onboarding guide covering forecast sharing, minimum runs, quality holds and schedule-change approvals.", factIds: ["f12"], roleKey: "bw", state: null as "added" | "skipped" | null, reason: null as string | null },
      { text: "Traced every lot of a supplier’s recalled ingredient through both plants and the co-packers in a day and a half.", factIds: ["f3"], roleKey: "bw", state: "skipped" as "added" | "skipped" | null, reason: "Already covered" as string | null },
      { text: "Built a load planner that packs mixed pallets into a trailer and draws the plan in 3D for the shipping docks.", factIds: ["f10"], roleKey: "bw", state: null as "added" | "skipped" | null, reason: null as string | null },
    ] : null },
    solutions: { waiting: true },
    notes: [{ id: "n1", text: "Lead with the $9M working-capital result when sending this for product roles.", at: at(3), editedAt: null }] as Note[],
  };
  const row = (key: string, name: string, directionId: Id<"items"> | null, s: Overview["base"]["state"], atMs: number | null, extra: Partial<Overview["base"]> = {}): Overview["base"] => ({ key, directionId, name, at: atMs, state: s, summary: null, versionId: null, writing: false, blocked: null, ...extra });
  const overview = (): Overview => {
    if (empty) return { base: row("base", "Base resume", null, "notWritten", null), directions: [], tailored: [], writing: false, toUpdate: 0 };
    const base = row("base", "Base resume", null, "upToDate", at(1));
    const directions = [
      row(dir.product, "Supply Chain Product", dir.product, state.product.additions ? "changed" : state.product.state, at(5), { summary: state.product.summary }),
      row(dir.solutions, "Solutions Consulting", dir.solutions, state.solutions.waiting ? "review" : "upToDate", at(1), state.solutions.waiting ? { versionId: rid("v-solutions-2"), summary: "1 new project (Brewlog), 1 removed fact at Brightwater Provisions" } : {}),
      row(dir.planning, "Supply Planning", dir.planning, "notWritten", null),
      row(dir.logistics, "Logistics Operations", dir.logistics, "notWritten", null),
      row(dir.consulting, "Independent Consulting", dir.consulting, "notWritten", null),
      row(dir.plant, "Plant Operations", dir.plant, "notWritten", null, { blocked: "Approve this direction's positioning first." }),
    ];
    return {
      base,
      directions,
      tailored: [
        { id: rid("t-meridian"), title: "Product Manager, Cold Chain Planning", company: "Meridian Coldchain", directionId: dir.product, direction: "Supply Chain Product", at: at(2) },
        { id: rid("t-loadstar-2"), title: "Senior Product Manager", company: "Loadstar Systems", directionId: dir.product, direction: "Supply Chain Product", at: at(5, 2) },
        { id: rid("t-loadstar-1"), title: "Senior Product Manager", company: "Loadstar Systems", directionId: dir.product, direction: "Supply Chain Product", at: at(5, 3) },
      ],
      writing: false,
      toUpdate: [base, ...directions].filter((r) => r.state === "changed" || r.state === "review" || r.state === "unknown").length,
    };
  };
  const version = (id: string, atMs: number, current: boolean, extra: Partial<ResumeData["versions"][number]> = {}): ResumeData["versions"][number] => ({
    id: rid(id),
    doc: docs[id] ?? null,
    layout: layouts[id] ?? { roles: [] },
    text: docs[id] ? "" : "Plain text resume",
    counts: docs[id] ? counts : null,
    model: "anthropic/claude",
    at: atMs,
    restoredFrom: null,
    additions: null,
    ...extra,
    ...(current ? {} : { additions: null }),
  });
  const REQS = [
    { requirement: "Turn planners’ daily problems into product requirements and a roadmap", strength: "strong" as const, factIds: ["f1", "f13", "f10", "f6"] },
    { requirement: "Explain inventory and service trade-offs to engineers and customers with real operating data", strength: "strong" as const, factIds: ["f2"] },
    { requirement: "8+ years of product management for supply chain or logistics software", strength: "partial" as const, factIds: ["f9"], note: "About 15 years running supply chain operations; the software you built was for your own teams." },
    { requirement: "Experience selling to pharmaceutical shippers", strength: "thin" as const, factIds: [], note: "Nothing in your record speaks to this yet." },
  ];
  const tailored = (): ResumeData["tailored"] => [
    { id: rid("t-meridian"), doc: docs["t-meridian"], layout: null, postingTitles: { bw: "Supply Planning Lead" }, posting: "Product Manager, Cold Chain Planning at Meridian Coldchain\n\n…", role: { id: "post-meridian" as Id<"postings">, title: "Product Manager, Cold Chain Planning", company: "Meridian Coldchain", url: "https://jobs.example.com/meridian-coldchain/4417" }, requirements: REQS, at: at(2) },
    { id: rid("t-loadstar-2"), doc: docs["t-loadstar-2"], layout: null, postingTitles: {}, posting: "Senior Product Manager at Loadstar Systems\n\nLoadstar Systems is looking for a Senior Product Manager to own load planning in its transportation management software.", role: null, requirements: REQS.slice(0, 3), at: at(5, 2) },
    { id: rid("t-loadstar-1"), doc: docs["t-loadstar-1"], layout: null, postingTitles: {}, posting: "Senior Product Manager at Loadstar Systems\n\n…", role: null, requirements: REQS.slice(0, 2), at: at(5, 3) },
  ];
  const list = (directionId?: Id<"items">): ResumeData => {
    const common = { facts: FACTS, last: null, lines: null, settings: SETTINGS, length: { own: null, record: "full" as const }, tailored: [] };
    if (empty || (directionId && ![dir.product, dir.solutions].includes(directionId))) return { ...common, titles: TITLES, versions: [], tailored: [] };
    if (!directionId)
      return { ...common, titles: TITLES, versions: [version("v-base-3", at(1), true), version("v-base-2", at(4, 5), false), version("v-base-1", at(5, 8), false)] };
    if (directionId === dir.product)
      return {
        ...common,
        titles: { ...TITLES, direction: { bw: "Supply Planning Product Lead" } },
        versions: [version("v-product-1", at(5), true, { additions: state.product.additions ? { at: NOW, lines: state.product.additions } : null })],
        tailored: tailored(),
      };
    return { ...common, titles: TITLES, versions: [version("v-solutions-1", at(5), true)], tailored: [] };
  };
  const HISTORY: History = {
    versions: [
      { id: rid("v-base-3"), at: at(1), current: true, plain: false, facts: 99, restoredFrom: null, changes: [
        { kind: "added", text: "Palletwise", where: null, factIds: ["f10"], note: null },
        { kind: "changed", text: "Brightwater Provisions title to Supply Chain Planning and S&OP Leadership", where: "Brightwater Provisions", factIds: [], note: null },
        { kind: "dropped", text: "Never missed a retail delivery window since joining Brightwater.", where: "Brightwater Provisions", factIds: ["f-old"], note: "fact rejected" },
      ] },
      { id: rid("v-base-2"), at: at(4, 5), current: false, plain: false, facts: 99, restoredFrom: null, changes: [] },
      { id: rid("v-base-1"), at: at(5, 8), current: false, plain: true, facts: null, restoredFrom: null, changes: [] },
    ],
  };
  const one = (id: Id<"resumes">): VersionOne => ({
    id,
    at: id === "v-base-2" ? at(4, 5) : id === "v-solutions-2" ? at(1) : at(5),
    directionId: id.startsWith("v-solutions") ? dir.solutions : id.startsWith("v-product") ? dir.product : null,
    current: id === "v-base-3" || id === "v-solutions-1",
    waiting: id === "v-solutions-2",
    doc: docs[id] ?? null,
    written: docs[id] ?? null,
    layout: layouts[id] ?? { roles: [] },
    flags: id === "v-base-2" ? { "Never missed a retail delivery window since joining Brightwater.": "rejected" } : {},
    text: "",
  });
  const setLayout = (id: string, f: (l: ResumeLayout) => ResumeLayout) => {
    layouts[id] = f(layouts[id] ?? { roles: [] });
  };
  return {
    ...answer(api.resume.overview, overview),
    ...answer(api.resume.list, ({ directionId }) => list(directionId)),
    ...answer(api.resume.history, () => HISTORY),
    ...answer(api.resume.version, ({ id }) => one(id)),
    ...answer(api.resume.compare, ({ to }) => ({
      changes:
        to === "v-solutions-2"
          ? [
              { kind: "added" as const, text: "Brewlog", where: null, factIds: ["f11"], note: null },
              { kind: "dropped" as const, text: "Contained a supplier’s allergen recall in 36 hours by tracing every affected lot through both plants and the co-packers.", where: "Brightwater Provisions", factIds: ["f3"], note: null },
            ]
          : HISTORY.versions[0].changes,
    })),
    ...answer(api.profile.get, () => contact),
    ...answer(api.profile.save, (a) => {
      contact = { name: a.name, email: a.email || undefined, phone: a.phone || undefined, location: a.location || undefined, links: a.links.map((l) => l.trim()).filter(Boolean) };
    }),
    ...answer(api.estimates.costs, () => ({ followUp: 0.01, outreach: 0.01, letter: 0.02, ask: 0.01, tailor: 0.04, rankPerRole: 0.0001, read: 0.05, readRevision: 0.03, rewrite: 0.01, disagreements: 0.02, duplicates: 0.02, sameWork: 0.02, skills: 0.03, insights: 0.05, repository: 0.02, resume: 0.04, directionResume: 0.04, resumeLines: 0.01, goals: 0.03, limitRule: 0.01, directionDetail: 0.02, suggestDirections: 0.03, lineCheck: 0.002, lineUpdate: 0.01 })),
    ...answer(api.lineCheck.checking, () => checking),
    ...answer(api.lineCheck.check, ({ line }) => {
      checking = line === undefined ? { ...checking, summary: true } : { ...checking, lines: [...checking.lines, line] };
      return "job-check" as Id<"jobs">;
    }),
    ...answer(api.notes.list, ({ subject }) => (subject.kind === "resume" && subject.id === "v-base-1" ? state.notes : [])),
    ...answer(api.notes.add, ({ text }) => {
      state.notes = [...state.notes, { id: `n${state.notes.length + 1}` as Id<"notes">, text, at: NOW, editedAt: null }];
    }),
    ...answer(api.resume.setBullet, ({ id, text, state: s }) => setLayout(id, (l) => ({ ...l, bullets: [...(l.bullets ?? []).filter((b) => b.text !== text), ...(s ? [{ text, state: s }] : [])] }))),
    ...answer(api.resume.setWords, ({ id, text, to }) => setLayout(id, (l) => ({ ...l, words: [...(l.words ?? []).filter((w) => w.text !== text), ...(to && to !== text ? [{ text, to }] : [])] }))),
    ...answer(api.resume.setSummary, ({ id, text }) =>
      setLayout(id, (l) => {
        const rest = { ...l };
        delete rest.summary;
        delete rest.summaryCheck;
        return text ? { ...rest, summary: text } : rest;
      }),
    ),
    ...answer(api.resume.setRole, ({ id, role }) => setLayout(id, (l) => ({ ...l, roles: [...l.roles.filter((r) => r.roleKey !== role.roleKey), role as LayoutRole] }))),
    ...answer(api.resume.setProject, ({ id, projectKey, hidden }) => setLayout(id, (l) => ({ ...l, projects: [...(l.projects ?? []).filter((p) => p.projectKey !== projectKey), ...(hidden === null ? [] : [{ projectKey, hidden }])] }))),
    ...answer(api.resume.setSkill, ({ id, key, hidden }) => setLayout(id, (l) => ({ ...l, skills: [...(l.skills ?? []).filter((k) => k.key !== key), ...(hidden === null ? [] : [{ key, hidden }])] }))),
    ...answer(api.resume.keep, () => {
      state.solutions = { waiting: false };
    }),
    ...answer(api.resume.discard, () => {
      state.solutions = { waiting: false };
    }),
    ...answer(api.resume.reopen, () => {
      state.solutions = { waiting: true };
    }),
    ...answer(api.resume.whatsNew, () => {
      state = { ...state, product: { ...state.product, additions: [{ text: "Wrote the co-packer onboarding guide covering forecast sharing, minimum runs, quality holds and schedule-change approvals.", factIds: ["f12"], roleKey: "bw", state: null, reason: null }] } };
      return "job-lines" as Id<"jobs">;
    }),
    ...answer(api.resume.setLine, ({ index, state: s, reason }) => {
      state.product.additions = state.product.additions!.map((l, i) => (i === index ? { ...l, state: s, reason: reason ?? null } : l));
    }),
    ...answer(api.resume.addAll, () => {
      state.product.additions = state.product.additions!.map((l) => (l.state === null ? { ...l, state: "added" } : l));
    }),
    ...answer(api.resume.closeAdditions, () => {
      state.product = { ...state.product, state: "changed", additions: null };
    }),
    ...answer(api.resume.rewrite, () => "job-1" as Id<"jobs">),
    ...answer(api.resume.start, () => "job-2" as Id<"jobs">),
    ...answer(api.resume.updateAll, () => 1),
    ...answer(api.resume.restore, () => rid("v-base-4")),
    // Google Drive connected: each resume's Doc is in the CareerBot folder, synced an hour ago.
    ...answer(api.drive.fileFor, ({ id }) => ({
      broken: false,
      url: `https://docs.google.com/document/d/${id}/edit`,
      syncedAt: Date.now() - 60 * 60 * 1000,
      error: null,
      frozen: false,
      holdsThis: true,
      tailored: String(id).startsWith("t-"),
      syncing: false,
    })),
    ...answer(api.drive.syncNow, () => "job-3" as Id<"jobs">),
  };
}
