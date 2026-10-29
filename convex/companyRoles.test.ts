import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

// Every open role at a company, whatever it was ranked; a pursuit started for any direction they choose; a role's title
// added to a direction's titles, with Undo; and none of it reaching another workspace.

const modules = import.meta.glob("./**/*.ts");
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-28T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

type Posting = Omit<Doc<"postings">, "_id" | "_creationTime" | "workspaceId" | "companyId">;
const posting = (externalId: string, title: string, more: Partial<Posting> = {}): Posting => ({
  provider: "greenhouse", externalId, url: `https://boards.greenhouse.io/acme/jobs/${externalId}`, title, location: "New York, NY", remote: false, firstSeen: 0, lastSeen: 0, ...more,
});

// A fictional workspace with two approved directions (Sales with approved criteria, Go-to-Market Lead with none), a
// US-only Location limit, a Target (Acme) with roles in every state, and a company that isn't watched (Brightwell).
async function setup() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    const sales = await ctx.db.insert("items", {
      workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0,
      data: { name: "Sales", criteria: { industries: [], sizes: [], stages: [], titles: ["Account Executive"], keywords: [] }, criteriaStatus: "approved", changedAt: 5 },
    });
    const gtm = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Go-to-Market Lead" }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "location", label: "Location", value: "US", rule: { countries: ["US"] } }, sources: [], at: 0 });
    const acme = await ctx.db.insert("companies", {
      workspaceId: w, name: "Acme", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 }, at: 0,
      details: { board: { provider: "greenhouse", slug: "acme", url: "https://boards.greenhouse.io/acme" }, sources: [], at: 0 },
      roles: { at: 1, read: 5 },
    });
    const brightwell = await ctx.db.insert("companies", {
      workspaceId: w, name: "Brightwell", found: [{ via: "hand", at: 0 }], at: 0,
      details: { board: { provider: "workday", slug: "brightwell", url: "https://brightwell.wd5.myworkdayjobs.com" }, sources: [], at: 0 },
    });
    const add = (p: Posting, companyId = acme) => ctx.db.insert("postings", { workspaceId: w, companyId, ...p });
    const sort = (to: Id<"items">[]) => ({ directionIds: to, against: [{ directionId: sales, directionAt: 5 }, { directionId: gtm, directionAt: 0 }], method: "model" as const, at: 1 });
    const fit = (directionId: Id<"items">, score: number) => [{ directionId, level: "strong" as const, score, reason: "Sells software.", method: "model" as const, directionAt: 5 }];
    const p = {
      strong: await add(posting("1", "Account Executive", { sort: sort([sales]), fit: fit(sales, 88), fitAt: 1 })),
      weaker: await add(posting("2", "Senior Account Executive", { sort: sort([sales]), fit: fit(sales, 61), fitAt: 1 })),
      abroad: await add(posting("3", "Account Executive, EMEA", { location: "London, UK" })),
      other: await add(posting("4", "Member of Go-to-Market Staff", { sort: sort([]) })),
      waiting: await add(posting("5", "Staff Engineer")),
      closed: await add(posting("6", "Account Executive, Closed", { closedAt: 1 })),
    };
    return { u, w, sales, gtm, acme, brightwell, p };
  });
  // Another workspace, which must reach none of it.
  const other = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "b@example.com" });
    await ensureWorkspace(ctx, u);
    return u;
  });
  return { t, ...ids, as: t.withIdentity({ subject: `${ids.u}|s` }), asOther: t.withIdentity({ subject: `${other}|s` }) };
}

test("a company's page lists every open role, each where it stands, a page at a time", async () => {
  const { as, acme, p } = await setup();
  const all = await as.query(api.roles.atCompany, { companyId: acme, paginationOpts: { numItems: 50, cursor: null } });
  const by = new Map(all.page.map((r) => [r.id, r]));
  expect(all.page).toHaveLength(5);
  expect(by.has(p.closed)).toBe(false);
  expect(by.get(p.strong)).toMatchObject({ group: "fit", score: 88, place: "New York, NY" });
  expect(by.get(p.weaker)).toMatchObject({ group: "fit", score: 61 });
  expect(by.get(p.abroad)).toMatchObject({ group: "against", problems: ["Outside where you’ll work"] });
  expect(by.get(p.other)).toMatchObject({ group: "other", score: null });
  expect(by.get(p.waiting)).toMatchObject({ group: "waiting", score: null });

  // Two a page: three pages, every role once.
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let pages = 0; ; pages++) {
    const page: { page: { id: string }[]; isDone: boolean; continueCursor: string } = await as.query(api.roles.atCompany, { companyId: acme, paginationOpts: { numItems: 2, cursor } });
    seen.push(...page.page.map((r) => r.id));
    if (page.isDone) {
      expect(pages).toBeGreaterThanOrEqual(2);
      break;
    }
    cursor = page.continueCursor;
  }
  expect(new Set(seen)).toEqual(new Set(all.page.map((r) => r.id)));
});

test("a company's roles can be searched by title", async () => {
  const { as, acme, p } = await setup();
  const found = await as.query(api.roles.atCompany, { companyId: acme, search: "staff", paginationOpts: { numItems: 50, cursor: null } });
  expect(found.page.map((r) => r.id).sort()).toEqual([p.other, p.waiting].sort());
});

test("a company that isn't a Target or Maybe can have its roles checked once, and says how its board was read", async () => {
  const { t, as, brightwell } = await setup();
  expect(await as.query(api.roles.companyCoverage, { companyId: brightwell })).toMatchObject({ watched: false, lastRead: null, read: 0 });
  await as.mutation(api.roles.checkCompany, { companyId: brightwell });
  expect((await t.run((ctx) => ctx.db.get(brightwell)))?.rolesCheckAt).toBeDefined();
  await t.run((ctx) => ctx.db.patch(brightwell, { roles: { at: 2, read: 40, total: 3048, searched: true } }));
  expect(await as.query(api.roles.companyCoverage, { companyId: brightwell })).toMatchObject({ read: 40, boardTotal: 3048, searched: true, complete: false });
});

test("a pursuit started for a direction the role wasn't matched to keeps that direction", async () => {
  const { as, gtm, sales, p } = await setup();
  const id = await as.mutation(api.pursuits.start, { postingId: p.other, directionId: gtm });
  const got = await as.query(api.pursuits.get, { id });
  expect(got.direction).toMatchObject({ id: gtm, name: "Go-to-Market Lead", matched: false, titled: false, criteriaApproved: false });
  expect(got.score).toBeNull();
  // Without a choice, its best fit, as before; with one, any approved direction, even one it scored lower for.
  const best = await as.query(api.pursuits.get, { id: await as.mutation(api.pursuits.start, { postingId: p.strong }) });
  expect(best.direction).toMatchObject({ id: sales, matched: true });
  expect(best.score).toBe(88);
  const chosen = await as.query(api.pursuits.get, { id: await as.mutation(api.pursuits.start, { postingId: p.weaker, directionId: gtm }) });
  expect(chosen.direction?.id).toBe(gtm);
  expect(chosen.score).toBeNull();
});

test("adding a role's title to a direction's titles follows the edit rule, and Undo puts it back", async () => {
  const { t, as, sales, gtm } = await setup();
  const was = await as.mutation(api.directions.addTitle, { id: sales, title: "Member of Go-to-Market Staff" });
  expect(was).toEqual({ approved: true, created: false, changedAt: 5 });
  const after = await t.run(async (ctx) => (await ctx.db.get(sales)) as Doc<"items"> & { kind: "direction" });
  expect(after.data.criteria?.titles).toEqual(["Account Executive", "Member of Go-to-Market Staff"]);
  expect(after.data.criteriaStatus).toBe("approved");
  expect(after.data.changedAt).toBe(Date.now());
  // Already there, whatever its case: nothing changes.
  expect(await as.mutation(api.directions.addTitle, { id: sales, title: "member of go-to-market staff" })).toBeNull();
  await as.mutation(api.directions.removeTitle, { id: sales, title: "Member of Go-to-Market Staff", created: was!.created, changedAt: was!.changedAt });
  const undone = await t.run(async (ctx) => (await ctx.db.get(sales)) as Doc<"items"> & { kind: "direction" });
  expect(undone.data.criteria?.titles).toEqual(["Account Executive"]);
  expect(undone.data.changedAt).toBe(5);

  // A direction with no criteria gets them, waiting for review; Undo takes them away again.
  const made = await as.mutation(api.directions.addTitle, { id: gtm, title: "Member of Go-to-Market Staff" });
  const proposed = await t.run(async (ctx) => (await ctx.db.get(gtm)) as Doc<"items"> & { kind: "direction" });
  expect(proposed.data).toMatchObject({ criteriaStatus: "proposed", criteria: { titles: ["Member of Go-to-Market Staff"] } });
  expect(proposed.data.changedAt).toBeUndefined();
  await as.mutation(api.directions.removeTitle, { id: gtm, title: "Member of Go-to-Market Staff", created: made!.created, changedAt: made!.changedAt });
  const gone = await t.run(async (ctx) => (await ctx.db.get(gtm)) as Doc<"items"> & { kind: "direction" });
  expect(gone.data.criteria).toBeUndefined();
  expect(gone.data.criteriaStatus).toBeUndefined();
});

test("scoring a role for a chosen direction is one job, refused for directions that aren't theirs", async () => {
  const { t, as, gtm, p } = await setup();
  const jobId = await as.mutation(api.roles.score, { postingId: p.other, directionId: gtm });
  expect(await as.mutation(api.roles.score, { postingId: p.other, directionId: gtm })).toBe(jobId);
  expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ kind: "roleFit", args: { postingId: p.other, directionId: gtm } });
});

test("another workspace reaches none of it", async () => {
  const { asOther, acme, brightwell, sales, gtm, p } = await setup();
  await expect(asOther.query(api.roles.atCompany, { companyId: acme, paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("Not found");
  await expect(asOther.query(api.roles.companyCoverage, { companyId: acme })).rejects.toThrow("Not found");
  await expect(asOther.mutation(api.roles.checkCompany, { companyId: brightwell })).rejects.toThrow("Not found");
  await expect(asOther.mutation(api.pursuits.start, { postingId: p.other, directionId: gtm })).rejects.toThrow("Not found");
  await expect(asOther.mutation(api.roles.score, { postingId: p.other, directionId: gtm })).rejects.toThrow("Not found");
  await expect(asOther.mutation(api.directions.addTitle, { id: sales, title: "Recruiter" })).rejects.toThrow("Not found");
  await expect(asOther.mutation(api.directions.removeTitle, { id: sales, title: "Account Executive", created: false, changedAt: null })).rejects.toThrow("Not found");
});
