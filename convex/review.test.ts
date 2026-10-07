import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { companiesToRate, companyScore, openCompanies, type Rateable } from "./companySets";
import { duplicatePairs, sameWorkSuggestions } from "./factPairs";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => {
    const ids = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      ids.push({ u, w: await ensureWorkspace(ctx, u) });
    }
    return ids;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const story = await asA.mutation(api.narratives.create, { kind: "career", title: "Brightwater", body: "We grew from 40 to 120 teams." });
  const sources = [{ narrativeId: story, version: 1, quotes: ["We grew from 40 to 120 teams."] }];
  // A row of any kind; the schema checks its data matches its kind when it's written.
  type NewItem = { kind: Doc<"items">["kind"]; status: Doc<"items">["status"]; data: Record<string, unknown>; roleKey?: string; projectKey?: string; sources?: Doc<"items">["sources"] };
  const add = (item: NewItem) => t.run((ctx) => ctx.db.insert("items", { workspaceId: a.w, sources, at: 0, ...item } as never));
  const get = (id: Id<"items">) => t.run((ctx) => ctx.db.get(id));
  return { t, a, asA, asB, add, get };
}

test("the summary counts each group's decisions, in review order, for the signed-in workspace only", async () => {
  const { t, a, asA, asB, add } = await setup();
  await add({ kind: "direction", status: "proposed", data: { name: "Supply Chain Product" } });
  await add({ kind: "limit", status: "proposed", data: { kind: "pay", label: "Base pay", value: "At least $180k" } });
  const criteria = { industries: ["Software"], sizes: ["201-500"], stages: [], titles: ["AE"], keywords: [] };
  const detail = { positioning: "Lead with the planning work.", targetTitles: ["AE"], vocabulary: [], carriesOver: [], reframe: [], titleMap: [] };
  await add({ kind: "direction", status: "approved", data: { name: "Supply Chain Product", criteria, criteriaStatus: "proposed", detail, detailStatus: "proposed" } });
  await add({ kind: "direction", status: "approved", data: { name: "Done", criteria, criteriaStatus: "approved", detail, detailStatus: "approved" } });

  // Companies: an unrated employer, a misfit kept anyway (so just unrated) and a misfit wait; a target, one passed on
  // and one screened out don't.
  await t.run(async (ctx) => {
    await ctx.db.insert("discovery", { workspaceId: a.w, seeds: [], resolved: [], lens: { industries: "steer", judge: "hide" } });
    const company = (name: string, extra: Partial<Doc<"companies">> = {}) => ctx.db.insert("companies", { workspaceId: a.w, name, found: [], at: 0, ...extra });
    await company("Loadstar Systems");
    await company("Meridian Coldchain", { rating: { value: "excited", at: 0 } });
    await company("Bramblewood Home", { rating: { value: "no", at: 0 } });
    await company("A job board", { screened: { employer: false, kind: "job board", by: "rule", at: 0 } });
    await company("Tobacco wholesaler", { goals: { level: "doesnt", reason: "", at: 0 } });
    await company("Kept", { goals: { level: "doesnt", reason: "", keep: true, at: 0 } });
  });

  // Facts: a proposed role, a proposed fact and an approved fact no longer said; an approved fact with a rewrite
  // waiting goes to Rewrites instead.
  await add({ kind: "role", status: "proposed", roleKey: "bw", data: { employer: "Brightwater", title: "Supply Planning Manager" } });
  const f1 = await add({ kind: "fact", status: "proposed", roleKey: "bw", data: { text: "Added two co-packers" } });
  await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Ran the carrier bids", noLongerSaid: "Not in the new version" } });
  await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Advised co-packers", suggestion: { text: "Advised 10 co-packers", at: 0 } } });
  await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Pending rewrite", suggestion: { pending: true, at: 0 } } });
  // A duplicate pair, flagged on both sides: one decision.
  const d1 = await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Tripled co-packer capacity" } });
  const d2 = await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Grew co-packer capacity 3x", duplicateOf: d1 } });
  await t.run((ctx) => ctx.db.patch(d1, { data: { text: "Tripled co-packer capacity", duplicateOf: d2 } }));

  await add({ kind: "conflict", status: "proposed", data: { field: "start", recordSays: "2020", narrativeSays: "2019", question: "When did you start?" } });
  await add({ kind: "followup", status: "proposed", data: { question: "How many teams?", why: "A number", factId: f1 } });
  await add({ kind: "insight", status: "proposed", data: { text: "You rebuild routing", factIds: [f1] } });
  const from = { roles: [], projects: [], facts: [] };
  await add({ kind: "skill", status: "proposed", data: { name: "Forecasting", from } });
  const crm = await add({ kind: "tool", status: "approved", data: { name: "Salesforce", from } });
  await add({ kind: "tool", status: "proposed", data: { name: "SFDC", from, sameAs: crm } });
  await t.run((ctx) => ctx.db.insert("resumes", { workspaceId: a.w, text: "New version", model: "m", toReview: true, at: 1 }));

  const s = await asA.query(api.review.summary, {});
  expect(s.groups.map((g) => [g.kind, g.count, g.unlocks])).toEqual([
    ["directions", 1, true],
    ["limits", 1, true],
    ["criteria", 1, true],
    ["positioning", 1, true],
    ["companies", 3, false],
    ["facts", 3, false],
    ["rewrites", 1, false],
    ["questions", 2, false],
    ["insights", 1, false],
    ["skills", 3, false],
    ["sameWork", 1, false],
    ["resume", 1, false],
  ]);
  expect(s.total).toBe(19);
  // Each group's cards are the ones counted.
  for (const g of s.groups) expect((await asA.query(api.review.items, { kind: g.kind })).cards).toHaveLength(g.count);
  expect(await asB.query(api.review.summary, {})).toEqual({ total: 0, groups: [] });
});

test("a negative decision stores its reason in the same call, and the group lists it", async () => {
  const { t, a, asA, add, get } = await setup();
  const d = await add({ kind: "direction", status: "proposed", data: { name: "Solutions Consulting" } });
  await asA.mutation(api.extract.review, { id: d, status: "rejected", note: "Not technical enough" });
  expect((await get(d))?.data).toMatchObject({ rejectedBecause: "Not technical enough" });

  const q = await add({ kind: "followup", status: "proposed", data: { question: "How many?", why: "", factId: null } });
  await asA.mutation(api.followups.notNow, { id: q, reason: "Don’t remember" });
  expect(await get(q)).toMatchObject({ status: "skipped", data: { skippedBecause: "Don’t remember" } });
  expect((await asA.query(api.review.items, { kind: "questions" })).declined.map((x) => [x.key, x.reason])).toEqual([[q, "Don’t remember"]]);

  const c = await t.run((ctx) => ctx.db.insert("companies", { workspaceId: a.w, name: "Bramblewood Home", found: [], at: 0 }));
  await asA.mutation(api.enrich.rate, { id: c, value: "no", reason: "Sells tobacco" });
  expect((await t.run((ctx) => ctx.db.get(c)))?.rating).toMatchObject({ value: "no", reason: "Sells tobacco" });
  expect((await asA.query(api.review.items, { kind: "companies" })).declined.map((x) => [x.key, x.reason])).toEqual([[c, "Sells tobacco"]]);

  const f1 = await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Tripled co-packer capacity" } });
  const f2 = await add({ kind: "fact", status: "proposed", roleKey: "bw", data: { text: "Grew co-packer capacity 3x", duplicateOf: f1 } });
  await asA.mutation(api.duplicates.keepBoth, { id: f2, reason: "Different years" });
  expect((await get(f2))?.data).toMatchObject({ keptApart: [f1], apartBecause: [{ id: f1, reason: "Different years" }] });

  const r = await t.run((ctx) => ctx.db.insert("resumes", { workspaceId: a.w, text: "New", model: "m", toReview: true, at: 1 }));
  await asA.mutation(api.resume.discard, { id: r, reason: "Too long" });
  expect((await t.run((ctx) => ctx.db.get(r)))?.discarded).toMatchObject({ reason: "Too long" });
  expect((await asA.query(api.review.summary, {})).groups.find((g) => g.kind === "resume")).toBeUndefined();

  const s = await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Advised", suggestion: { text: "Advised 10", at: 0 } } });
  await asA.mutation(api.extract.dismissSuggestion, { id: s, reason: "Not 10" });
  expect((await get(s))?.data).toMatchObject({ suggestion: null, history: [{ how: "read" }, { how: "dismissed", text: "Advised 10", reason: "Not 10" }] });
});

test("undo puts each decision back as it was", async () => {
  const { t, a, asA, add, get } = await setup();
  // An item's status, data and sources; `clean` leaves out what's unset or emptied, which reads the same.
  const snapshot = async (...ids: Id<"items">[]) =>
    Promise.all(
      ids.map(async (id) => {
        const i = await get(id);
        return { status: i!.status, data: i!.data as Record<string, unknown>, sources: i!.sources };
      }),
    );
  const clean = (x: Awaited<ReturnType<typeof snapshot>>[number]) => ({ ...x, data: Object.fromEntries(Object.entries(x.data).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) });

  // Rating a company, then rating it back.
  const c = await t.run((ctx) => ctx.db.insert("companies", { workspaceId: a.w, name: "Loadstar Systems", found: [], at: 0, rating: { value: "maybe", at: 0 } }));
  await asA.mutation(api.enrich.rate, { id: c, value: "no", reason: "Too big" });
  await asA.mutation(api.enrich.rate, { id: c, value: "maybe" });
  expect((await t.run((ctx) => ctx.db.get(c)))?.rating).toMatchObject({ value: "maybe" });

  // Duplicates: Keep both, then reopen; merge, then unmerge.
  const f1 = await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Tripled co-packer capacity" } });
  const f2 = await add({ kind: "fact", status: "proposed", roleKey: "bw", data: { text: "Grew co-packer capacity 3x", duplicateOf: f1 } });
  const before = await snapshot(f1, f2);
  await asA.mutation(api.duplicates.keepBoth, { id: f2, reason: "Different" });
  await asA.mutation(api.duplicates.reopen, { id: f2, other: f1 });
  expect((await snapshot(f1, f2)).map(clean)).toEqual(before.map(clean));
  await asA.mutation(api.duplicates.merge, { id: f2, keep: "other" });
  expect((await get(f2))?.status).toBe("superseded");
  await asA.mutation(api.duplicates.unmerge, { id: f2 });
  expect((await snapshot(f1, f2)).map(clean)).toEqual(before.map(clean));

  // A rewrite used, then taken back: the old wording, the rewrite waiting and the status it had.
  const w = await add({ kind: "fact", status: "proposed", roleKey: "bw", data: { text: "Advised", suggestion: { text: "Advised 10", note: "add the number", at: 5 } } });
  await asA.mutation(api.extract.acceptSuggestion, { id: w });
  expect(await get(w)).toMatchObject({ status: "approved", data: { text: "Advised 10" } });
  await asA.mutation(api.extract.revertWording, { id: w });
  expect(await get(w)).toMatchObject({ status: "proposed", data: { text: "Advised", suggestion: { text: "Advised 10", note: "add the number" } } });
  expect((await get(w))?.data).not.toHaveProperty("history");

  // A follow-up set aside, then open again without its reason.
  const q = await add({ kind: "followup", status: "proposed", data: { question: "How many?", why: "", factId: null } });
  await asA.mutation(api.followups.notNow, { id: q, reason: "Later" });
  await asA.mutation(api.followups.reopen, { id: q });
  expect(await get(q)).toMatchObject({ status: "proposed", data: { question: "How many?", why: "", factId: null } });
  expect((await get(q))?.data).not.toHaveProperty("skippedBecause");

  // A conflict answered from the narrative, then reopened: the role's field is back.
  const role = await add({ kind: "role", status: "approved", roleKey: "bw", data: { employer: "Brightwater", start: "2020-01" } });
  const cf = await add({ kind: "conflict", status: "proposed", roleKey: "bw", data: { field: "start", recordSays: "2020", narrativeSays: "2019", narrativeValue: "2019-03", question: "When?" } });
  await asA.mutation(api.conflicts.answer, { id: cf, pick: "narrative", reason: "Offer letter" });
  expect((await get(role))?.data).toMatchObject({ start: "2019-03" });
  await asA.mutation(api.conflicts.reopen, { id: cf });
  expect(await get(role)).toMatchObject({ data: { start: "2020-01", history: [] } });
  expect(await get(cf)).toMatchObject({ status: "proposed" });

  // Skills: kept apart and merged, each undone.
  const from = { roles: ["bw"], projects: [], facts: [] };
  const sf = await add({ kind: "tool", status: "approved", data: { name: "Salesforce", from } });
  const sfdc = await add({ kind: "tool", status: "proposed", data: { name: "SFDC", from: { roles: ["acme"], projects: [], facts: [] }, sameAs: sf } });
  const skillsBefore = await snapshot(sf, sfdc);
  await asA.mutation(api.skills.keepApart, { id: sfdc, reason: "Different" });
  await asA.mutation(api.skills.reopenPair, { id: sfdc, other: sf });
  await asA.mutation(api.skills.merge, { id: sfdc, keep: "other" });
  await asA.mutation(api.skills.unmerge, { id: sfdc });
  expect((await snapshot(sf, sfdc)).map(clean)).toEqual(skillsBefore.map(clean));

  // A direction addition merged, then unmerged.
  const into = await add({ kind: "direction", status: "approved", data: { name: "Sales", includes: ["AE"] } });
  const addition = await add({ kind: "direction", status: "proposed", data: { name: "Supply Chain Product", addsTo: into } });
  const goalsBefore = await snapshot(into, addition);
  await asA.mutation(api.goals.merge, { id: addition, into });
  await asA.mutation(api.goals.unmerge, { id: addition });
  expect((await snapshot(into, addition)).map(clean)).toEqual(goalsBefore.map(clean));

  // A resume version kept, then back to waiting; discarded, then back.
  const r = await t.run((ctx) => ctx.db.insert("resumes", { workspaceId: a.w, text: "New", model: "m", toReview: true, at: 1 }));
  await asA.mutation(api.resume.keep, { id: r });
  await asA.mutation(api.resume.reopen, { id: r });
  expect(await t.run((ctx) => ctx.db.get(r))).toMatchObject({ toReview: true, at: 1 });
  await asA.mutation(api.resume.discard, { id: r });
  await asA.mutation(api.resume.reopen, { id: r });
  expect((await t.run((ctx) => ctx.db.get(r)))?.discarded).toBeUndefined();
  expect((await asA.query(api.review.summary, {})).groups.find((g) => g.kind === "resume")?.count).toBe(1);
});

test("same work: Keep separate and Connect are both undone by reopening the suggestion", async () => {
  const { asA, add, get } = await setup();
  await add({ kind: "role", status: "approved", roleKey: "bw", data: { employer: "Brightwater", title: "Engineer" } });
  await add({ kind: "project", status: "approved", roleKey: "bw", projectKey: "github:me/app", data: { name: "App", repo: "me/app", url: "https://github.com/me/app" } });
  const roleFact = await add({ kind: "fact", status: "approved", roleKey: "bw", data: { text: "Built routing" } });
  const projectFact = await add({ kind: "fact", status: "approved", projectKey: "github:me/app", sources: [], data: { text: "Routing engine", sameWorkAs: { factId: roleFact, lead: roleFact } } });
  const before = await get(projectFact);
  expect((await asA.query(api.review.items, { kind: "sameWork" })).cards).toHaveLength(1);
  await asA.mutation(api.sameWork.keepSeparate, { id: projectFact, reason: "Different project" });
  expect((await asA.query(api.review.items, { kind: "sameWork" })).declined.map((d) => d.reason)).toEqual(["Different project"]);
  await asA.mutation(api.sameWork.reopen, { id: projectFact, other: roleFact, lead: roleFact });
  expect((await get(projectFact))?.data).toEqual({ ...before!.data, keptSeparate: [], apartBecause: [] });
  await asA.mutation(api.sameWork.connect, { id: projectFact });
  await asA.mutation(api.sameWork.reopen, { id: projectFact, other: roleFact, lead: roleFact });
  expect((await get(roleFact))?.data).not.toHaveProperty("sameWork");
  expect((await asA.query(api.review.items, { kind: "sameWork" })).cards).toHaveLength(1);
});

// The Companies page's sets before they moved into companySets, kept here as the reference.
function formerCompanySets(companies: (Rateable & { id: number })[], judge: "off" | "rank" | "hide") {
  const goalRank = (c: Rateable) => (judge === "off" || !c.goals ? 1 : { fits: 3, partly: 2, unknown: 1, doesnt: 0 }[c.goals.level]);
  const score = (c: Rateable) => goalRank(c) * 10 + Math.max(-1, ...c.fit.map((f) => ({ strong: 3, some: 2, weak: 1, none: 0 })[f.level]));
  const misfit = (c: Rateable) => judge === "hide" && c.goals?.level === "doesnt" && !c.goals.keep && !c.named;
  const open = companies.filter((c) => c.screened?.employer !== false && c.rating !== "excited" && c.rating !== "no");
  return { employers: open.filter((c) => !misfit(c)).sort((a, b) => score(b) - score(a)), misfits: open.filter(misfit) };
}

test("the shared company sets are the Companies page's sets", () => {
  const companies: (Rateable & { id: number })[] = [];
  let id = 0;
  for (const screened of [null, { employer: true }, { employer: false }])
    for (const rating of [null, "excited", "maybe", "no"] as const)
      for (const goals of [null, { level: "fits" as const }, { level: "doesnt" as const }, { level: "doesnt" as const, keep: true }, { level: "partly" as const }])
        for (const named of [false, true])
          for (const fit of [[], [{ level: "weak" as const }], [{ level: "strong" as const }, { level: "none" as const }]]) companies.push({ id: id++, screened, rating, goals, named, fit });
  for (const judge of ["off", "rank", "hide"] as const) {
    const ids = (xs: { id: number }[]) => xs.map((c) => c.id);
    const now = openCompanies(companies, judge);
    const was = formerCompanySets(companies, judge);
    expect([ids(now.employers), ids(now.misfits)]).toEqual([ids(was.employers), ids(was.misfits)]);
    expect(now.employers.map((c) => companyScore(c, judge))).toEqual(was.employers.map((c) => companyScore(c, judge)));
    expect(ids(companiesToRate(companies, judge).map((x) => x.company))).toEqual([...ids(was.employers.filter((c) => c.rating === null)), ...ids(was.misfits)]);
  }
});

test("the shared fact pairs are the Record page's pairs", () => {
  type F = Parameters<typeof duplicatePairs>[0][number];
  const facts: F[] = [
    { id: "a", status: "approved", roleKey: "r", data: {} },
    { id: "b", status: "proposed", roleKey: "r", data: { duplicateOf: "a" } },
    { id: "c", status: "rejected", roleKey: "r", data: { duplicateOf: "a" } },
    { id: "d", status: "approved", roleKey: "other", data: { duplicateOf: "a" } },
    { id: "e", status: "approved", roleKey: "r", data: { duplicateOf: "c" } },
    { id: "f", status: "superseded", roleKey: "r", data: {} },
    { id: "g", status: "approved", roleKey: "r", data: { duplicateOf: "f" } },
    // Same work: a project fact on an approved project linked to an approved role, pointing at that role's fact.
    { id: "p1", status: "approved", projectKey: "p", data: { sameWorkAs: { factId: "a", lead: "a" } } },
    { id: "p2", status: "proposed", projectKey: "p", data: { sameWorkAs: { factId: "a", lead: "a" } } },
    { id: "p3", status: "approved", projectKey: "p", data: { sameWorkAs: { factId: "d", lead: "d" } } },
    { id: "q1", status: "approved", projectKey: "q", data: { sameWorkAs: { factId: "a", lead: "a" } } },
  ];
  // The Record page's twins: flagged, both not rejected (merged ones never reach it), same role.
  expect([...duplicatePairs(facts).entries()].map(([k, v]) => [k, v.id])).toEqual([["b", "a"]]);
  const projects = [
    { id: "P", status: "approved" as const, projectKey: "p", roleKey: "r" },
    { id: "Q", status: "proposed" as const, projectKey: "q", roleKey: "r" },
  ];
  const roles = [{ id: "R", status: "approved" as const, roleKey: "r", data: {} }];
  expect(sameWorkSuggestions(facts, projects, roles).map((s) => [s.fact.id, s.other.id])).toEqual([["p1", "a"]]);
  expect(sameWorkSuggestions(facts, projects, [{ ...roles[0], data: { break: true } }])).toEqual([]);
});
