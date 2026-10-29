import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

// A company's open roles and matching roles follow each roles pass's read of its board, for free; when its matching
// roles change, its fit is judged again in the next fill-in batch, through their AI budget.

const modules = import.meta.glob("./**/*.ts");
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-28T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

type GhJob = { id: number; title: string; location: string };
const NYC_AE = { title: "Account Executive", url: "https://boards.greenhouse.io/acme/jobs/1", location: "New York, NY", direction: "Sales" };

// A workspace with an AI budget (aiUsd), a Sales direction looking for Account Executives, a US-only Location limit, and
// a fictional Target, Acme, filled in from its Greenhouse board with one matching role and its fit judged.
async function setup(opts: { aiUsd?: number; board?: Doc<"companies">["details"] } = {}) {
  const t = convexTest({ schema, modules });
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const { u, w, company, direction } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: opts.aiUsd ?? 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
    await ctx.db.insert("aiSettings", { workspaceId: w, task: "companies", model: "test/model" });
    const direction = await ctx.db.insert("items", {
      workspaceId: w, kind: "direction", status: "approved", data: { name: "Sales", criteria: { industries: [], sizes: [], stages: [], titles: ["Account Executive"], keywords: [] }, criteriaStatus: "approved" }, sources: [], at: 0,
    });
    await ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "location", label: "Location", value: "US, remote is fine", rule: { countries: ["US"], modes: ["remote", "onsite"] } }, sources: [], at: 0 });
    const company = await ctx.db.insert("companies", {
      workspaceId: w, name: "Acme", domain: "acme.com", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 }, screened: { employer: true, kind: "employer", by: "ai", at: 0 }, at: 0,
      details: opts.board ?? {
        summary: "Sells freight software to shippers.",
        board: { provider: "greenhouse", slug: "acme", url: "https://boards.greenhouse.io/acme" },
        jobs: { open: 1, remote: 0, matching: [NYC_AE] },
        sources: [], at: 1,
      },
      fit: [{ directionId: direction, level: "strong", reason: "Hiring account executives." }], fitAt: 1,
    });
    return { u, w, company, direction };
  });
  return { t, w, company, direction, as: t.withIdentity({ subject: `${u}|s` }), get: () => t.run(async (ctx) => (await ctx.db.get(company))!) };
}

// Acme's Greenhouse board serving `board.jobs`, and a model judging company fit: every company asked about fits Sales
// "some", and fits their goals. `fitCalls`: the companies each fit call was asked about.
function stubWorld(board: { jobs: GhJob[] }) {
  const fitCalls: string[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "openrouter.ai") {
        const user = JSON.parse(String(init!.body)).messages[1].content as string;
        const directions = JSON.parse(user.split("Directions:\n")[1].split("\n\n")[0]) as { id: string }[];
        const companies = JSON.parse(user.split("Companies:\n")[1]) as { id: string }[];
        fitCalls.push(companies.map((c) => c.id));
        const out = { companies: companies.map((c) => ({ id: c.id, fit: directions.map((d) => ({ directionId: d.id, level: "some", reason: "Hiring again, outside your area." })), goals: { level: "fits", reason: "Freight software." } })) };
        return Response.json({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { cost: 0.001 } });
      }
      if (url.pathname === "/v1/boards/acme/jobs") return Response.json({ jobs: board.jobs.map((j) => ({ id: j.id, title: j.title, absolute_url: `https://boards.greenhouse.io/acme/jobs/${j.id}`, location: { name: j.location } })) });
      return new Response("", { status: 404 });
    }),
  );
  return { fitCalls };
}

// One read of Acme's board as the roles pass saves it: its roles, then the end of the read.
async function read(s: Awaited<ReturnType<typeof setup>>, jobs: { id: number; title: string; location: string; remote?: boolean }[], end: { complete: boolean; total?: number }) {
  const at = Date.now();
  const touched = await s.t.mutation(internal.roles.saveJobs, {
    workspaceId: s.w, companyId: s.company, provider: "greenhouse", touched: [], at,
    jobs: jobs.map((j) => ({ externalId: String(j.id), title: j.title, url: `https://boards.greenhouse.io/acme/jobs/${j.id}`, location: j.location, remote: j.remote ?? false })),
  });
  await s.t.mutation(internal.roles.finishRead, { workspaceId: s.w, companyId: s.company, touched, complete: end.complete, read: touched.length, ...(end.total !== undefined ? { total: end.total } : {}), at });
}

const usage = (s: Awaited<ReturnType<typeof setup>>) => s.t.run((ctx) => ctx.db.query("usage").collect());
const enrichJobs = (s: Awaited<ReturnType<typeof setup>>) => s.t.run(async (ctx) => (await ctx.db.query("jobs").collect()).filter((j) => j.kind === "enrich"));

test("a complete read brings a company's open roles and matching roles up to date for free, and unchanged matching leaves its fit as it is", async () => {
  const s = await setup();
  await read(s, [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 2, title: "Product Designer", location: "Remote, US", remote: true }, { id: 3, title: "Account Executive", location: "London, UK" }, { id: 4, title: "Sales Engineer", location: "Austin, TX" }], { complete: true });
  const c = await s.get();
  // Four open, one remote; the London role is outside their area, so only New York matches, as before.
  expect(c.details!.jobs).toEqual({ open: 4, remote: 1, matching: [NYC_AE] });
  expect(c.fitStale).toBeUndefined();
  expect(c.fitAt).toBe(1);
  expect(await s.t.mutation(internal.enrich.refreshFit, { workspaceId: s.w })).toBeNull();
  expect(await enrichJobs(s)).toEqual([]);
  expect(await usage(s)).toEqual([]);
  // A role closing that doesn't match changes the counts only.
  await read(s, [{ id: 1, title: "Account Executive", location: "New York, NY" }], { complete: true });
  expect((await s.get()).details!.jobs).toEqual({ open: 1, remote: 0, matching: [NYC_AE] });
  expect((await s.get()).fitStale).toBeUndefined();
});

test("a roles pass that finds a company's matching roles changed has its fit judged again once, in a fill-in batch through the AI budget, named in Activity", async () => {
  const s = await setup();
  // The New York role is gone; the only Account Executive left is in London, outside their area.
  const { fitCalls } = stubWorld({ jobs: [{ id: 3, title: "Account Executive", location: "London, UK" }] });
  await s.as.mutation(api.roles.start, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const c = await s.get();
  expect(c.details!.jobs).toEqual({ open: 1, remote: 0, matching: [] });
  // Judged again once, and no longer waiting to be.
  expect(fitCalls).toEqual([[s.company]]);
  expect(c.fit).toEqual([{ directionId: s.direction, level: "some", reason: "Hiring again, outside your area." }]);
  expect(c.fitAt).toBe(Date.now());
  expect(c.fitStale).toBeUndefined();
  // The call went through their AI budget as automatic work, in the pass that updated fit.
  const [refit] = await enrichJobs(s);
  expect(refit).toMatchObject({ args: { refit: 1 }, origin: "automatic", status: "done" });
  expect((await usage(s)).map((x) => [x.purpose, x.jobId, x.origin, x.state])).toEqual([["company fit", refit._id, "automatic", "settled"]]);
  expect((await s.as.query(api.activity.list, {})).find((x) => x.kind === "enrich")).toMatchObject({ label: "Updated company fit for 1 company", state: "done" });
  // The next pass finds nothing new: nothing is judged again.
  await s.as.mutation(api.roles.start, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fitCalls).toHaveLength(1);
  expect(await enrichJobs(s)).toHaveLength(1);
});

test("a matching role that appears marks the company's fit to judge again", async () => {
  const s = await setup();
  await read(s, [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 5, title: "Senior Account Executive", location: "Chicago, IL" }], { complete: true });
  const c = await s.get();
  expect(c.details!.jobs!.matching.map((m) => m.title)).toEqual(["Account Executive", "Senior Account Executive"]);
  expect(c.fitStale).toBe(Date.now());
  expect(await s.t.query(internal.enrich.todo, { workspaceId: s.w })).toMatchObject({ batch: [], fit: { companies: [{ id: s.company, matchingRoles: ["Account Executive", "Senior Account Executive"] }], fitLeft: 1 } });
});

test("a partial read takes the board's total and adds the matches it finds, and never marks fit stale for titles it didn't see", async () => {
  const s = await setup({ board: { board: { provider: "workday", slug: "acme/External", url: "https://acme.wd5.myworkdayjobs.com/External" }, jobs: { open: 30, remote: 2, matching: [NYC_AE] }, sources: [], at: 1 } });
  // Searched by title: the New York role wasn't among what came back.
  await read(s, [{ id: 7, title: "Product Designer", location: "Remote, US", remote: true }], { complete: false, total: 42 });
  const c = await s.get();
  expect(c.details!.jobs).toEqual({ open: 42, remote: 2, matching: [NYC_AE] });
  expect(c.fitStale).toBeUndefined();
  expect(await s.t.mutation(internal.enrich.refreshFit, { workspaceId: s.w })).toBeNull();
});

test("with Update fit as roles change off, a company whose matching roles changed keeps its fit", async () => {
  const s = await setup();
  await s.as.mutation(api.discovery.setFitRefresh, { on: false });
  expect((await s.as.query(api.discovery.list, {})).fitRefresh).toBe(false);
  await read(s, [{ id: 2, title: "Product Designer", location: "Remote, US", remote: true }], { complete: true });
  const c = await s.get();
  expect(c.details!.jobs).toEqual({ open: 1, remote: 1, matching: [] });
  expect(c.fitStale).toBeUndefined();
  expect(await s.t.mutation(internal.enrich.refreshFit, { workspaceId: s.w })).toBeNull();
});

test("with the AI budget used up, updating fit pauses for the budget and judges nothing", async () => {
  const s = await setup({ aiUsd: 0 });
  const { fitCalls } = stubWorld({ jobs: [] });
  await read(s, [{ id: 2, title: "Product Designer", location: "Remote, US", remote: true }], { complete: true });
  expect((await s.get()).fitStale).toBe(Date.now());
  await s.t.mutation(internal.enrich.refreshFit, { workspaceId: s.w });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fitCalls).toEqual([]);
  expect(await enrichJobs(s)).toMatchObject([{ args: { refit: 1 }, status: "paused", pausedFor: "openrouter" }]);
  const c = await s.get();
  expect(c.fitStale).toBe(Date.now());
  expect(c.fitAt).toBe(1);
  // A paused pass picks it up when it resumes: no second pass is started meanwhile.
  expect(await s.t.mutation(internal.enrich.refreshFit, { workspaceId: s.w })).toBeNull();
});
