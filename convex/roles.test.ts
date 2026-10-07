import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PROBLEM_LABELS } from "./limitBuckets";
import { seedModelPrices } from "./modelPrices.testing";
import type { RoleFilters } from "./roles";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-20T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

type GhJob = { id: number; title: string; location: string };

// Two workspaces; A has a Target on a Greenhouse board, approved directions (Sales, and Design when asked for), and a
// US-only Location limit.
// bytesRead: the most one function may read, enforced as a deployment would (default: no limit).
async function setup(opts: { design?: boolean; bytesRead?: number } = {}) {
  const t = convexTest({ schema, modules, ...(opts.bytesRead ? { transactionLimits: { bytesRead: opts.bytesRead } } : {}) });
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const [a, b] = await t.run(async (ctx) => {
    const ids = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "companies", model: "test/model" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "roleSort", model: "test/sorter" });
      ids.push({ u, w });
    }
    return ids;
  });
  const { company, direction, design } = await t.run(async (ctx) => {
    const direction = await ctx.db.insert("items", { workspaceId: a.w, kind: "direction", status: "approved", data: { name: "Sales" }, sources: [], at: 0 });
    const design = opts.design ? await ctx.db.insert("items", { workspaceId: a.w, kind: "direction", status: "approved", data: { name: "Design" }, sources: [], at: 0 }) : null;
    await ctx.db.insert("items", { workspaceId: a.w, kind: "limit", status: "approved", data: { kind: "location", label: "Location", value: "US, remote is fine", rule: { countries: ["US"], modes: ["remote", "onsite"] } }, sources: [], at: 0 });
    const company = await ctx.db.insert("companies", {
      workspaceId: a.w, name: "Acme", domain: "acme.com", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 },
      details: { board: { provider: "greenhouse", slug: "acme", url: "https://boards.greenhouse.io/acme" }, sources: [], at: 0 }, at: 0,
    });
    return { company, direction, design };
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  return {
    t, a, b, company, direction, design: design!, asA, asB: t.withIdentity({ subject: `${b.u}|s` }),
    postings: () => t.run((ctx) => ctx.db.query("postings").collect()),
    // One whole roles pass, started at the given time.
    pass: async (at: string) => {
      vi.setSystemTime(Date.parse(at));
      await asA.mutation(api.roles.start, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    },
  };
}

// A Greenhouse board serving `board.jobs` (or failing when `board.down`), with each job's description from
// `board.detail` (by default one short line), and two models. The sort sends each posting to the directions
// `sortTo` names (by default every one); judging rates every posting "strong" (score 90) for every direction it's
// asked about, reads it as remote and senior with a pay range, and writes its brief. `sorted` records each posting
// title sent to the sort with the direction names it was sorted against; `judged` each posting sent for judging with
// the direction ids named on it, its description and what its board states; `prompts` each judging call's user message.
function stubWorld(board: { jobs: GhJob[]; down?: boolean; detail?: (id: string) => string }, sortTo?: (title: string, directions: string[]) => string[]) {
  const sorted: { title: string; directions: string[] }[] = [];
  const judged: { id: string; directionIds: string[]; description: string | null; board?: unknown }[] = [];
  const prompts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "openrouter.ai") {
        const user = JSON.parse(String(init!.body)).messages[1].content as string;
        const listed: unknown = JSON.parse(user.split("Postings:\n")[1]);
        let out: unknown;
        if (!Array.isArray(listed)) {
          // The sort: directions keyed d1, d2, ...; postings keyed r1, r2, ...
          const dirs = JSON.parse(user.split("Directions:\n")[1].split("\n\nPostings:")[0]) as Record<string, { name: string }>;
          const names = Object.values(dirs).map((d) => d.name);
          out = Object.fromEntries(
            Object.entries(listed as Record<string, { title: string }>).map(([key, p]) => {
              sorted.push({ title: p.title, directions: names });
              const to = sortTo ? sortTo(p.title, names) : names;
              return [key, Object.keys(dirs).filter((k) => to.includes(dirs[k].name))];
            }),
          );
        } else {
          prompts.push(user);
          const postings = listed as { id: string; directionIds: string[]; description: string | null; board?: unknown }[];
          judged.push(...postings.map((p) => ({ id: p.id, directionIds: p.directionIds, description: p.description, ...(p.board ? { board: p.board } : {}) })));
          out = {
            postings: postings.map((p) => ({
              id: p.id,
              fit: p.directionIds.map((d) => ({ directionId: d, level: "strong", score: 90, reason: "Enterprise selling." })),
              details: { pay: { min: 150000, max: 190000, currency: "USD", period: "year" }, setup: "remote", seniority: "individual", yearsAsked: 5 },
              brief: { job: "Sells to large companies.", forYou: "Your enterprise deals fit." },
            })),
          };
        }
        return Response.json({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { cost: 0.001 } });
      }
      if (url.pathname === "/v1/boards/acme/jobs")
        return board.down ? new Response("", { status: 503 }) : Response.json({ jobs: board.jobs.map((j) => ({ id: j.id, title: j.title, absolute_url: `https://boards.greenhouse.io/acme/jobs/${j.id}`, location: { name: j.location } })) });
      const one = url.pathname.match(/^\/v1\/boards\/acme\/jobs\/(\d+)$/);
      if (one) return Response.json({ content: board.detail?.(one[1]) ?? "&lt;p&gt;Sell to large companies.&lt;/p&gt;", first_published: "2026-09-01T00:00:00Z" });
      return new Response("", { status: 404 });
    }),
  );
  return { sorted, judged, prompts };
}

type Role = FunctionReturnType<typeof api.roles.list>["page"][number];
// Every page of a paginated Roles query, `numItems` at a time.
async function pages(read: (cursor: string | null) => Promise<{ page: Role[]; continueCursor: string; isDone: boolean }>) {
  const out: Role[] = [];
  for (let cursor: string | null = null, done = false; !done; ) {
    const page = await read(cursor);
    out.push(...page.page);
    ({ continueCursor: cursor, isDone: done } = page);
  }
  return out;
}

// A direction's Roles page (or all directions') as A sees it: the judged roles that pass `filters`, best first, read
// `numItems` at a time, with their count; the ones sorted out; the ones they said Not for me to; and the overview's
// stale flag and whether any role was ranked.
async function view(s: Awaited<ReturnType<typeof setup>>, directionId?: Id<"items">, numItems = 100, filters: RoleFilters = {}) {
  const scope = directionId ? { directionId } : {};
  const ranked = await pages((cursor) => s.asA.query(api.roles.list, { ...scope, filters, paginationOpts: { cursor, numItems } }));
  const no = await pages((cursor) => s.asA.query(api.roles.list, { ...scope, filters: { rating: "no" }, paginationOpts: { cursor, numItems } }));
  const sortedOut = await pages((cursor) => s.asA.query(api.roles.sortedOut, { ...scope, paginationOpts: { cursor, numItems } }));
  const count = await s.asA.query(api.roles.count, { ...scope, filters });
  const o = await s.asA.query(api.roles.overview, scope);
  return { ranked, no, sortedOut, count, sortedOutCount: o.sortedOut, anyRanked: o.ranked, stale: o.stale };
}

// Postings written straight into the table: bring the Roles page's rows in step with them.
async function refresh(s: Awaited<ReturnType<typeof setup>>) {
  await s.t.mutation(internal.roles.refreshRanks, { workspaceId: s.a.w });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
}

test("a role listed twice is one row, a closed role is closed only by a complete read, and never by a failed one", async () => {
  const s = await setup();
  const board = { jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 2, title: "Account Executive ", location: "New York, NY" }, { id: 3, title: "Solutions Engineer", location: "Austin, TX" }] };
  stubWorld(board);
  await s.pass("2026-09-20T09:00:00Z");
  let rows = await s.postings();
  expect(rows.map((p) => p.externalId).sort()).toEqual(["1", "3"]);
  expect(rows.every((p) => !p.closedAt && p.hasDescription && p.postedAt === Date.parse("2026-09-01T00:00:00Z"))).toBe(true);
  const text = await s.t.run((ctx) => ctx.db.query("postingTexts").collect());
  expect(text.map((x) => x.text)).toEqual(["Sell to large companies.", "Sell to large companies."]);

  // The board can't be read: nothing closes, and the failure is recorded.
  board.jobs = [];
  (board as { down?: boolean }).down = true;
  await s.pass("2026-09-21T09:00:00Z");
  rows = await s.postings();
  expect(rows.every((p) => !p.closedAt)).toBe(true);
  const c = await s.t.run((ctx) => ctx.db.get(s.company));
  expect(c?.roles).toMatchObject({ at: Date.parse("2026-09-20T09:00:00Z"), failedAt: Date.parse("2026-09-21T09:00:00Z"), read: 2 });

  // Read in full without the Solutions Engineer role: it closes; the other stays, re-listed under a new id.
  (board as { down?: boolean }).down = false;
  board.jobs = [{ id: 9, title: "Account Executive", location: "New York, NY" }];
  await s.pass("2026-09-22T09:00:00Z");
  rows = await s.postings();
  expect(rows).toHaveLength(2);
  const ae = rows.find((p) => p.title === "Account Executive")!;
  expect(ae).toMatchObject({ externalId: "9", lastSeen: Date.parse("2026-09-22T09:00:00Z"), firstSeen: Date.parse("2026-09-20T09:00:00Z") });
  expect(ae.closedAt).toBeUndefined();
  expect(rows.find((p) => p.title === "Solutions Engineer")!.closedAt).toBe(Date.parse("2026-09-22T09:00:00Z"));
  // A closed role leaves the Roles page.
  expect((await view(s, s.direction)).ranked.map((r) => r.title)).toEqual(["Account Executive"]);

  // It comes back: open again, same row, listed again with its verdict.
  board.jobs.push({ id: 3, title: "Solutions Engineer", location: "Austin, TX" });
  await s.pass("2026-09-23T09:00:00Z");
  rows = await s.postings();
  expect(rows).toHaveLength(2);
  expect(rows.every((p) => !p.closedAt)).toBe(true);
  expect((await view(s, s.direction)).ranked.map((r) => r.title).sort()).toEqual(["Account Executive", "Solutions Engineer"]);
});

test("judging records each verdict with its score, what the description says and a brief; only roles in their work area are judged", async () => {
  const s = await setup();
  const { judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 2, title: "Account Executive", location: "London, UK" }] });
  await s.pass("2026-09-20T09:00:00Z");
  const rows = await s.postings();
  const us = rows.find((p) => p.externalId === "1")!;
  const uk = rows.find((p) => p.externalId === "2")!;
  expect(judged.map((j) => j.id)).toEqual([us._id]);
  expect(us.fit).toEqual([{ directionId: s.direction, level: "strong", score: 90, reason: "Enterprise selling.", method: "model", sortedBy: "model", directionAt: 0, rubric: "v2" }]);
  expect(us.details).toMatchObject({ pay: { min: 150000, max: 190000, currency: "USD", period: "year" }, setup: "remote", seniority: "individual", yearsAsked: 5 });
  expect(us.brief).toMatchObject({ job: "Sells to large companies.", forYou: "Your enterprise deals fit." });
  expect(uk.fitAt).toBeUndefined();
  // Out of their area, it isn't listed, and its description wasn't fetched.
  expect(uk.descriptionAt).toBeUndefined();
  expect((await view(s, s.direction)).ranked.map((r) => r.id)).toEqual([us._id]);
});

// Postings straight into the table: open, in their area, described, at the given step of a pass.
async function queued(s: Awaited<ReturnType<typeof setup>>, rows: { title: string; queue?: "text" | "sort" | "judge"; sorted?: boolean }[]) {
  return s.t.run(async (ctx) => {
    const ids: Id<"postings">[] = [];
    for (const r of rows) {
      const id = await ctx.db.insert("postings", {
        workspaceId: s.a.w, companyId: s.company, provider: "greenhouse", externalId: r.title, url: `https://x/${r.title}`, title: r.title, location: "Remote, US", remote: true, firstSeen: 0, lastSeen: 0,
        ...(r.queue === "text" ? {} : { descriptionAt: 1, hasDescription: false }),
        ...(r.sorted ? { sort: { directionIds: [s.direction], against: [{ directionId: s.direction, directionAt: 0 }], method: "model" as const, at: 0 } } : {}),
        ...(r.queue ? { queue: r.queue } : {}),
      });
      ids.push(id);
    }
    return ids;
  });
}

test("workers never hold the same role: descriptions first, sorting only once they're all in, and a claim lasts until saved or 10 minutes", async () => {
  const s = await setup();
  const [text] = await queued(s, [{ title: "text", queue: "text" }]);
  const toSort = await queued(s, [{ title: "s1", queue: "sort" }, { title: "s2", queue: "sort" }]);
  const toJudge = await queued(s, Array.from({ length: 7 }, (_, i) => ({ title: `j${i}`, queue: "judge" as const, sorted: true })));
  const since = Date.now();
  const claim = async (worker: string) => (await s.t.mutation(internal.roles.claim, { workspaceId: s.a.w, since, worker })) as { step: string; ids: Id<"postings">[] } | { wait: true } | null;
  const ids = (c: Awaited<ReturnType<typeof claim>>) => (c && "ids" in c ? [...c.ids].sort() : []);

  const w0 = await claim("w0");
  expect(w0).toEqual({ step: "text", ids: [text] });
  // A description is still out, so the sort waits; judging goes ahead, five roles a claim, never the same one twice.
  const w1 = await claim("w1");
  const w2 = await claim("w2");
  expect([w1, w2].map((c) => c && "step" in c && c.step)).toEqual(["judge", "judge"]);
  expect([ids(w1).length, ids(w2).length]).toEqual([5, 2]);
  expect([...ids(w1), ...ids(w2)].sort()).toEqual([...toJudge].sort());
  expect(await claim("w3")).toEqual({ wait: true });

  // The description is in: that role and the other two go to the sort together.
  await s.t.mutation(internal.roles.saveTexts, { workspaceId: s.a.w, worker: "w0", texts: [{ id: text, text: "" }], at: Date.now() });
  const w3 = await claim("w3");
  expect(ids(w3)).toEqual([text, ...toSort].sort());
  await s.t.mutation(internal.roles.saveSort, { workspaceId: s.a.w, worker: "w3", method: "model", directions: [{ id: s.direction, changedAt: 0 }], results: ids(w3).map((id) => ({ id, against: [s.direction], directionIds: [] })) });

  // w1 is cut off. Ten minutes on, its roles are free again and w4 takes them; w2 saves in time.
  vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
  const save = (worker: string, list: Id<"postings">[]) =>
    s.t.mutation(internal.roles.saveFit, { workspaceId: s.a.w, worker, rubric: "v2", directions: [{ id: s.direction, changedAt: 0 }], results: list.map((id) => ({ id, judged: [s.direction], fit: [{ directionId: s.direction, level: "some" as const, reason: worker }], stretch: [] })) });
  await save("w2", ids(w2));
  expect(ids(await claim("w4"))).toEqual(ids(w1));
  // w1's late answer is dropped; w4's stands.
  await save("w1", ids(w1));
  await save("w4", ids(w1));
  const rows = new Map((await s.postings()).map((p) => [p._id, p]));
  expect(toJudge.map((id) => rows.get(id)!.fit![0].reason)).toEqual(toJudge.map((id) => (ids(w2).includes(id) ? "w2" : "w4")));
  expect(toJudge.every((id) => rows.get(id)!.queue === undefined && rows.get(id)!.claimedBy === undefined)).toBe(true);
});

test("a pass sorts each role to the directions it could be, judges it only for those from its description without the company's repeated text, and lists sorted-out roles apart", async () => {
  const s = await setup({ design: true });
  const pitch = "About Acme: we build the rockets that carry satellites to orbit, and we are growing fast.";
  const work = (what: string) => `${what} ${"with the team, day to day, for customers who depend on it. ".repeat(6)}`;
  const { sorted, judged } = stubWorld(
    { jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 2, title: "Barista", location: "New York, NY" }], detail: (id) => `&lt;p&gt;${pitch}&lt;/p&gt;&lt;p&gt;${work(id === "1" ? "Sell rockets" : "Make coffee")}&lt;/p&gt;` },
    (title, names) => (title === "Account Executive" ? names.filter((n) => n === "Sales") : []),
  );
  await s.pass("2026-09-20T09:00:00Z");
  const rows = await s.postings();
  const ae = rows.find((p) => p.title === "Account Executive")!;
  const barista = rows.find((p) => p.title === "Barista")!;
  expect(sorted.map((x) => x.title).sort()).toEqual(["Account Executive", "Barista"]);
  expect(sorted.every((x) => x.directions.length === 2)).toBe(true);
  // Only the Account Executive is judged, only for Sales, from its own text.
  expect(judged).toEqual([{ id: ae._id, directionIds: [s.direction], description: work("Sell rockets").trim() }]);
  expect(ae.fit).toEqual([expect.objectContaining({ directionId: s.direction, level: "strong", sortedBy: "model" })]);
  expect(ae.sort).toMatchObject({ directionIds: [s.direction], method: "model" });
  expect(barista.sort).toMatchObject({ directionIds: [], against: [{ directionId: s.direction, directionAt: 0 }, { directionId: s.design, directionAt: 0 }] });
  expect(barista.fitAt).toBeUndefined();
  // The raw description is kept as read.
  const texts = await s.t.run((ctx) => ctx.db.query("postingTexts").collect());
  expect(texts.find((x) => x.postingId === ae._id)).toMatchObject({ text: `${pitch}\n${work("Sell rockets").trim()}`, clean: work("Sell rockets").trim() });

  const sales = await view(s, s.direction);
  const design = await view(s, s.design);
  expect(sales.ranked.map((r) => [r.title, r.level])).toEqual([["Account Executive", "strong"]]);
  expect(sales.sortedOut.map((r) => [r.title, r.sortedBy])).toEqual([["Barista", "model"]]);
  expect([sales.count, sales.sortedOutCount]).toEqual([{ count: 1, more: false }, { count: 1, more: false }]);
  expect(design.ranked).toEqual([]);
  expect(design.sortedOut.map((r) => r.title).sort()).toEqual(["Account Executive", "Barista"]);
  expect([sales.stale, design.stale]).toEqual([false, false]);
  // All directions together: each role once, at its best direction; sorted out only when sorted out of every one.
  const all = await view(s);
  expect(all.ranked.map((r) => [r.title, r.direction?.name, r.level, r.score])).toEqual([["Account Executive", "Sales", "strong", 90]]);
  expect(all.sortedOut.map((r) => r.title)).toEqual(["Barista"]);

  // Nothing left: the next pass sorts and judges nothing.
  await s.pass("2026-09-21T09:00:00Z");
  expect([sorted.length, judged.length]).toEqual([2, 1]);
});

test("a direction changed after its roles were ranked is marked, never ranked again by itself, and rankAgain ranks only that direction", async () => {
  const s = await setup({ design: true });
  const { sorted, judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] }, (_, names) => names.filter((n) => n === "Sales"));
  await s.pass("2026-09-20T09:00:00Z");
  const stale = async () => ({ Sales: (await view(s, s.direction)).stale, Design: (await view(s, s.design)).stale });
  expect(await stale()).toEqual({ Sales: false, Design: false });

  vi.setSystemTime(Date.parse("2026-09-20T12:00:00Z"));
  await s.asA.mutation(api.goals.edit, { id: s.direction, fields: { summary: "New business with large companies." } });
  expect(await stale()).toEqual({ Sales: true, Design: false });
  // The next pass doesn't rank anything again by itself.
  await s.pass("2026-09-21T09:00:00Z");
  expect([sorted.length, judged.length]).toEqual([1, 1]);
  expect(await stale()).toEqual({ Sales: true, Design: false });

  vi.setSystemTime(Date.parse("2026-09-21T12:00:00Z"));
  await s.asA.mutation(api.roles.rankAgain, { directionId: s.direction });
  // Waiting for the pass: nothing ranked for Sales, nothing stale.
  let sales = await view(s, s.direction);
  expect([sales.ranked, sales.sortedOut, sales.anyRanked, sales.stale]).toEqual([[], [], false, false]);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sorted.slice(1)).toEqual([{ title: "Account Executive", directions: ["Sales"] }]);
  expect(judged.slice(1).map((j) => j.directionIds)).toEqual([[s.direction]]);
  expect(await stale()).toEqual({ Sales: false, Design: false });
  sales = await view(s, s.direction);
  expect(sales.ranked.map((r) => r.level)).toEqual(["strong"]);
  const ae = (await s.postings())[0];
  expect(ae.fit).toEqual([expect.objectContaining({ directionId: s.direction, directionAt: Date.parse("2026-09-20T12:00:00Z") })]);
  // Design's sort is untouched: still sorted out.
  expect((await view(s, s.design)).sortedOut.map((r) => r.title)).toEqual(["Account Executive"]);
});

test("roles judged before sorting existed keep their verdicts, aren't ranked again by a pass, and rankAgain ranks one direction", async () => {
  const s = await setup({ design: true });
  // The board still lists it, so the pass keeps it open.
  const { sorted, judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] }, () => []);
  const id: Id<"postings"> = await s.t.run((ctx) =>
    ctx.db.insert("postings", {
      workspaceId: s.a.w, companyId: s.company, provider: "greenhouse", externalId: "1", url: "https://x/1", title: "Account Executive", location: "New York, NY", remote: false, firstSeen: 0, lastSeen: 0,
      descriptionAt: 1, hasDescription: false, fit: [{ directionId: s.direction, level: "strong", reason: "Sells.", method: "model" }], fitAt: 1,
    }),
  );
  const levels = async () => {
    const [sales, design] = [await view(s, s.direction), await view(s, s.design)];
    return { Sales: [sales.ranked.map((r) => r.level), sales.sortedOut.length, sales.stale], Design: [design.ranked.map((r) => r.level), design.sortedOut.length, design.stale] };
  };
  await refresh(s);
  expect(await levels()).toEqual({ Sales: [["strong"], 0, false], Design: [["none"], 0, false] });
  await s.pass("2026-09-20T09:00:00Z");
  expect([sorted.length, judged.length]).toEqual([0, 0]);

  await s.asA.mutation(api.roles.rankAgain, { directionId: s.design });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  // Sorted for Design alone, and sorted out; Sales keeps its verdict.
  expect(sorted).toEqual([{ title: "Account Executive", directions: ["Design"] }]);
  expect(judged).toEqual([]);
  expect(await levels()).toEqual({ Sales: [["strong"], 0, false], Design: [[], 1, false] });
  const p = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(p.fit).toEqual([{ directionId: s.direction, level: "strong", reason: "Sells.", method: "model", directionAt: 1 }]);
  expect(p.rerank).toBeUndefined();
});

test("two directions ranked again back to back, before the pass runs, are both sorted and judged afresh", async () => {
  const s = await setup({ design: true });
  const { sorted, judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] }, (_, names) => names.filter((n) => n === "Sales"));
  const id: Id<"postings"> = await s.t.run((ctx) =>
    ctx.db.insert("postings", {
      workspaceId: s.a.w, companyId: s.company, provider: "greenhouse", externalId: "1", url: "https://x/1", title: "Account Executive", location: "New York, NY", remote: false, firstSeen: 0, lastSeen: 0,
      descriptionAt: 1, hasDescription: false, fit: [{ directionId: s.direction, level: "some", reason: "Sells.", method: "model" }], fitAt: 1,
    }),
  );
  await s.asA.mutation(api.roles.rankAgain, { directionId: s.design });
  await s.asA.mutation(api.roles.rankAgain, { directionId: s.direction });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sorted).toEqual([{ title: "Account Executive", directions: ["Sales", "Design"] }]);
  expect(judged.map((j) => j.directionIds)).toEqual([[s.direction]]);
  const p = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(p.fit).toEqual([expect.objectContaining({ directionId: s.direction, level: "strong", reason: "Enterprise selling.", directionAt: 0 })]);
  const design = await view(s, s.design);
  expect([design.ranked, design.sortedOut.map((r) => r.id)]).toEqual([[], [id]]);
});

test("roles list best score first, newest first within a score, a page at a time; Not for me left out unless asked for, and restorable; a company no longer watched leaves; coverage shows staleness", async () => {
  const s = await setup();
  const add = (title: string, postedAt: number, level?: "strong" | "some" | "weak" | "none", score?: number) =>
    s.t.run((ctx) =>
      ctx.db.insert("postings", {
        workspaceId: s.a.w, companyId: s.company, provider: "greenhouse", externalId: title, url: `https://x/${title}`, title, location: "Remote, US", remote: true, postedAt, firstSeen: 0, lastSeen: 0,
        ...(level ? { fit: [{ directionId: s.direction, level, ...(score !== undefined ? { score } : {}), reason: `${level} fit`, method: "model" as const }], fitAt: 1 } : {}),
      }),
    );
  await add("strong-old", 1, "strong", 88);
  await add("some", 5, "some", 60);
  // Judged before scores existed: after every scored role.
  await add("strong-unscored", 8, "strong");
  await add("unjudged", 9);
  await add("strong-new", 3, "strong", 88);
  const noneId = await add("none", 7, "none", 10);
  await refresh(s);
  await s.asA.mutation(api.roles.rate, { id: noneId, value: "no" });
  // One role a page: the order holds across pages. A role not ranked yet isn't listed.
  let sales = await view(s, s.direction, 1);
  expect(sales.ranked.map((r) => r.title)).toEqual(["strong-new", "strong-old", "some", "strong-unscored"]);
  expect(sales.count).toEqual({ count: 4, more: false });
  expect(sales.no).toEqual([expect.objectContaining({ id: noneId, rating: "no", level: "none", score: 10, reason: "none fit", company: { id: s.company, name: "Acme" } })]);
  await s.asA.mutation(api.roles.rate, { id: noneId, value: null });
  sales = await view(s, s.direction);
  expect([sales.ranked.map((r) => [r.title, r.rating]).at(-2), sales.no]).toEqual([["none", null], []]);
  const overview = await s.asA.query(api.roles.overview, {});
  expect(overview.coverage).toEqual([expect.objectContaining({ name: "Acme", read: 0, lastRead: null, stale: true })]);

  await s.t.run((ctx) => ctx.db.patch(s.company, { roles: { at: Date.now() - 2 * 86400000, read: 40, total: 55 } }));
  expect((await s.asA.query(api.roles.overview, {})).coverage[0]).toMatchObject({ read: 40, boardTotal: 55, stale: false });
  await s.t.run((ctx) => ctx.db.patch(s.company, { roles: { at: Date.now() - 4 * 86400000, read: 40 } }));
  expect((await s.asA.query(api.roles.overview, {})).coverage[0].stale).toBe(true);

  // Rated Not for me on Companies: its roles leave the page, and come back when it's a Target again.
  await s.asA.mutation(api.enrich.rate, { id: s.company, value: "no" });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  sales = await view(s, s.direction);
  expect([sales.ranked, sales.count, sales.anyRanked]).toEqual([[], { count: 0, more: false }, false]);
  await s.asA.mutation(api.enrich.rate, { id: s.company, value: "excited" });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await view(s, s.direction)).ranked.map((r) => r.title)).toEqual(["strong-new", "strong-old", "some", "none", "strong-unscored"]);
});

test("every filter keeps the roles that pass it, and the roles that don't say only when asked; the board's details win over what the AI read", async () => {
  const s = await setup();
  const DAY = 86400000;
  const { beta, pass, fail, unknown } = await s.t.run(async (ctx) => {
    const beta = await ctx.db.insert("companies", { workspaceId: s.a.w, name: "Beta", domain: "beta.com", found: [{ via: "hand", at: 0 }], rating: { value: "maybe", at: 0 }, at: 0 });
    const base = { workspaceId: s.a.w, provider: "greenhouse" as const, remote: false, firstSeen: 0, lastSeen: 0, fitAt: 1 };
    const fit = (score?: number) => [{ directionId: s.direction, level: "some" as const, ...(score !== undefined ? { score } : {}), method: "model" as const }];
    return {
      beta,
      // The board states everything; the AI read a lower pay, which loses.
      pass: await ctx.db.insert("postings", {
        ...base, companyId: s.company, externalId: "pass", url: "https://x/pass", title: "Pass", postedAt: Date.now() - 3 * DAY, fit: fit(80),
        boardDetails: { pay: { min: 160000, currency: "USD", period: "year" }, setup: "hybrid", locations: ["Austin, TX"], seniority: "manager", yearsAsked: 3, employmentType: "full-time", travel: 10, clearance: "secret", visa: true },
        details: { pay: { min: 90000, currency: "USD", period: "year" }, at: 1 },
      }),
      // What the AI read, all of it failing: $40 an hour is $83,200 a year.
      fail: await ctx.db.insert("postings", {
        ...base, companyId: beta, externalId: "fail", url: "https://x/fail", title: "Fail", postedAt: Date.now() - 40 * DAY, fit: fit(40),
        details: { pay: { min: 40, max: 55, currency: "USD", period: "hour" }, setup: "onsite", locations: ["Chicago, IL"], seniority: "director", yearsAsked: 10, employmentType: "contract", travel: 50, clearance: "ts/sci", visa: false, at: 1 },
      }),
      // Says nothing, and was judged before scores.
      unknown: await ctx.db.insert("postings", { ...base, companyId: s.company, externalId: "unknown", url: "https://x/unknown", title: "Unknown", fit: fit() }),
    };
  });
  await refresh(s);
  const ids = async (filters: RoleFilters, numItems = 100) => (await view(s, s.direction, numItems, filters)).ranked.map((r) => r.id).sort();
  const cases: [string, (unknown: boolean) => RoleFilters][] = [
    ["score", (u) => ({ minScore: { value: 50, unknown: u } })],
    ["pay", (u) => ({ minPay: { value: 100000, unknown: u } })],
    ["place", (u) => ({ locations: { value: ["austin"], unknown: u } })],
    ["setup", (u) => ({ setups: { value: ["hybrid", "remote"], unknown: u } })],
    ["posted", (u) => ({ postedWithinDays: { value: 30, unknown: u } })],
    ["seniority", (u) => ({ seniority: { value: ["manager", "senior manager"], unknown: u } })],
    ["years", (u) => ({ maxYears: { value: 5, unknown: u } })],
    ["type", (u) => ({ employmentTypes: { value: ["full-time"], unknown: u } })],
    ["travel", (u) => ({ maxTravel: { value: 25, unknown: u } })],
    ["clearance", (u) => ({ clearance: { value: "top secret", unknown: u } })],
    ["visa", (u) => ({ visa: { unknown: u } })],
  ];
  for (const [name, filter] of cases) {
    expect([name, await ids(filter(false))]).toEqual([name, [pass]]);
    expect([name, await ids(filter(true))]).toEqual([name, [pass, unknown].sort()]);
    // A page at a time gives the same roles.
    expect([name, await ids(filter(true), 1)]).toEqual([name, [pass, unknown].sort()]);
    expect([name, (await s.asA.query(api.roles.count, { directionId: s.direction, filters: filter(true) })).count]).toEqual([name, 2]);
  }
  // A country by name or code matches every place in it.
  expect(await ids({ locations: { value: ["United States"], unknown: false } })).toEqual([pass, fail].sort());
  // Targets, Maybes, or chosen companies.
  expect(await ids({ companies: "targets" })).toEqual([pass, unknown].sort());
  expect(await ids({ companies: "maybes" })).toEqual([fail]);
  expect(await ids({ companies: [beta] })).toEqual([fail]);
  // Rated Interested, not rated, or Not for me (left out otherwise).
  await s.asA.mutation(api.roles.rate, { id: pass, value: "interested" });
  await s.asA.mutation(api.roles.rate, { id: fail, value: "no" });
  expect(await ids({})).toEqual([pass, unknown].sort());
  expect(await ids({ rating: "interested" })).toEqual([pass]);
  expect(await ids({ rating: "unrated" })).toEqual([unknown]);
  expect(await ids({ rating: "no" })).toEqual([fail]);
  // A remote role isn't held to a place.
  await s.t.run((ctx) => ctx.db.patch(unknown, { remote: true, location: "Remote, US" }));
  await refresh(s);
  expect(await ids({ locations: { value: ["austin"], unknown: false } })).toEqual([pass, unknown].sort());

  // Each detail says where it came from: the board's pay, not the AI's.
  const role = await s.asA.query(api.roles.get, { id: pass });
  expect(role.details.pay).toEqual({ value: { min: 160000, currency: "USD", period: "year" }, source: "board" });
  expect((await s.asA.query(api.roles.get, { id: fail })).details.pay).toEqual({ value: { min: 40, max: 55, currency: "USD", period: "hour" }, source: "ai" });
});

test("an eligibility limit applies to roles already judged: firm sets apart those it rules out, a preference ranks them last, a role that doesn't say is kept, and the filters start from it", async () => {
  const s = await setup();
  const ids = await s.t.run(async (ctx) => {
    const base = { workspaceId: s.a.w, companyId: s.company, provider: "greenhouse" as const, remote: false, firstSeen: 0, lastSeen: 0, fitAt: 1 };
    const role = (title: string, score: number, details: { clearance?: "secret" | "top secret"; visa?: boolean }) =>
      ctx.db.insert("postings", { ...base, externalId: title, url: `https://x/${title}`, title, fit: [{ directionId: s.direction, level: "strong", score, method: "model" }], details: { ...details, at: 1 } });
    return { ts: await role("TS", 90, { clearance: "top secret" }), noVisa: await role("NoVisa", 85, { visa: false }), secret: await role("Secret", 70, { clearance: "secret", visa: true }), silent: await role("Silent", 60, {}) };
  });
  const titles = async (directionId?: Id<"items">) => (await pages((cursor) => s.asA.query(api.roles.list, { ...(directionId ? { directionId } : {}), filters: {}, paginationOpts: { cursor, numItems: 1 } }))).map((r) => [r.title, r.problems]);
  const against = async (directionId?: Id<"items">) => (await pages((cursor) => s.asA.query(api.roles.against, { ...(directionId ? { directionId } : {}), paginationOpts: { cursor, numItems: 1 } }))).map((r) => [r.title, r.problems]);
  await refresh(s);
  expect(await titles(s.direction)).toEqual([["TS", []], ["NoVisa", []], ["Secret", []], ["Silent", []]]);

  // Firm: roles needing more than Secret, or not sponsoring, are set apart with why; the rest keep their order.
  await s.asA.mutation(api.goals.addLimit, { kind: "eligibility", value: "", firm: true, rule: { clearance: "secret", sponsorshipNeeded: true } });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  for (const dir of [s.direction, undefined]) {
    expect(await titles(dir)).toEqual([["Secret", []], ["Silent", []]]);
    expect(await against(dir)).toEqual([["TS", [PROBLEM_LABELS.clearance]], ["NoVisa", [PROBLEM_LABELS.visa]]]);
    const o = await s.asA.query(api.roles.overview, dir ? { directionId: dir } : {});
    expect([o.against, o.fromLimits]).toEqual([{ count: 2, more: false }, { clearance: "secret", visa: true }]);
    expect((await s.asA.query(api.roles.count, { ...(dir ? { directionId: dir } : {}), filters: {} })).count).toBe(2);
  }
  expect((await s.asA.query(api.roles.get, { id: ids.ts })).fit.map((f) => f.problems)).toEqual([[PROBLEM_LABELS.clearance]]);

  // A preference: nothing set apart, those it rules out rank after the rest, still saying why; no filter starts from it.
  const limit = (await s.asA.query(api.goals.items, {})).find((i) => i.kind === "limit" && i.data.kind === "eligibility");
  if (limit?.kind !== "limit") throw new Error("no eligibility limit");
  await s.asA.mutation(api.goals.updateLimit, { id: limit.id, value: limit.data.value, firm: false, rule: { clearance: "secret", sponsorshipNeeded: true }, appliesTo: [], when: [] });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await titles(s.direction)).toEqual([["Secret", []], ["Silent", []], ["TS", [PROBLEM_LABELS.clearance]], ["NoVisa", [PROBLEM_LABELS.visa]]]);
  expect(await against(s.direction)).toEqual([]);
  expect((await s.asA.query(api.roles.overview, { directionId: s.direction })).fromLimits).toEqual({ clearance: null, visa: false });

  // Rejected: every role back in its place.
  await s.asA.mutation(api.extract.review, { id: limit.id, status: "rejected" });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await titles(s.direction)).toEqual([["TS", []], ["NoVisa", []], ["Secret", []], ["Silent", []]]);
});

test("a firm location limit sets apart a role done somewhere they won't work, saying why; remote in their country, their place, a role that doesn't say, and a preference never are", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const base = { workspaceId: s.a.w, companyId: s.company, provider: "greenhouse" as const, remote: false, firstSeen: 0, lastSeen: 0, fitAt: 1 };
    const role = (title: string, score: number, extra: { remote?: boolean; location?: string; details?: { setup?: "onsite" | "hybrid"; locations?: string[] } }) =>
      ctx.db.insert("postings", { ...base, ...extra, externalId: title, url: `https://x/${title}`, title, fit: [{ directionId: s.direction, level: "strong", score, method: "model" }], details: { ...extra.details, at: 1 } });
    await role("SF", 90, { details: { setup: "onsite", locations: ["San Francisco, CA"] } });
    await role("RemoteUS", 85, { remote: true, location: "Remote, US" });
    await role("Denver", 80, { details: { setup: "hybrid", locations: ["Denver, CO"] } });
    await role("Silent", 70, { location: "San Francisco, CA" });
  });
  const titles = async (directionId?: Id<"items">) => (await pages((cursor) => s.asA.query(api.roles.list, { ...(directionId ? { directionId } : {}), filters: {}, paginationOpts: { cursor, numItems: 1 } }))).map((r) => [r.title, r.problems]);
  const against = async (directionId?: Id<"items">) => (await pages((cursor) => s.asA.query(api.roles.against, { ...(directionId ? { directionId } : {}), paginationOpts: { cursor, numItems: 1 } }))).map((r) => [r.title, r.problems]);
  await refresh(s);
  const limit = (await s.asA.query(api.goals.items, {})).find((i) => i.kind === "limit" && i.data.kind === "location");
  if (limit?.kind !== "limit") throw new Error("no location limit");
  const renata = { value: "You work hybrid in Denver or remote anywhere in the US; you won’t relocate.", rule: { modes: ["hybrid", "remote"], countries: ["US"], places: [{ place: "Denver, CO", lat: 39.74, lng: -104.99 }] }, appliesTo: [], when: [] };

  await s.asA.mutation(api.goals.updateLimit, { id: limit.id, ...renata, firm: true });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const why = "On-site in San Francisco; you work hybrid from Denver or remote";
  for (const dir of [s.direction, undefined]) {
    expect(await titles(dir)).toEqual([["RemoteUS", []], ["Denver", []], ["Silent", []]]);
    expect(await against(dir)).toEqual([["SF", [why]]]);
    expect((await s.asA.query(api.roles.overview, dir ? { directionId: dir } : {})).against).toEqual({ count: 1, more: false });
  }
  const sf = (await s.postings()).find((p) => p.title === "SF")!;
  expect((await s.asA.query(api.roles.get, { id: sf._id })).fit.map((f) => f.problems)).toEqual([[why]]);

  // A preference sets nothing apart and leaves the order as judged.
  await s.asA.mutation(api.goals.updateLimit, { id: limit.id, ...renata, firm: false });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await titles(s.direction)).toEqual([["SF", []], ["RemoteUS", []], ["Denver", []], ["Silent", []]]);
  expect(await against(s.direction)).toEqual([]);
});

test("a firm pay limit sets apart a role whose stated pay tops out below the floor, saying which limit; a role that doesn't say pay or its most, and a preference, never are", async () => {
  const s = await setup();
  const limitId = await s.t.run(async (ctx) => {
    const base = { workspaceId: s.a.w, companyId: s.company, provider: "greenhouse" as const, remote: true, location: "Remote, US", firstSeen: 0, lastSeen: 0, fitAt: 1 };
    const role = (title: string, score: number, pay?: { min?: number; max?: number; currency: string; period: "year" | "hour" }) =>
      ctx.db.insert("postings", { ...base, externalId: title, url: `https://x/${title}`, title, fit: [{ directionId: s.direction, level: "strong", score, method: "model" }], details: { ...(pay ? { pay } : {}), at: 1 } });
    await role("Low", 90, { min: 90000, max: 120000, currency: "USD", period: "year" });
    await role("Range", 85, { min: 120000, max: 160000, currency: "USD", period: "year" });
    await role("Hourly", 80, { max: 50, currency: "USD", period: "hour" });
    await role("From", 75, { min: 120000, currency: "USD", period: "year" });
    await role("Silent", 70);
    return ctx.db.insert("items", { workspaceId: s.a.w, kind: "limit", status: "approved", data: { kind: "pay", label: "Pay", value: "At least $150k", rule: { min: 150000, currency: "USD", period: "year" } }, sources: [], at: 0 });
  });
  const titles = async () => (await pages((cursor) => s.asA.query(api.roles.list, { directionId: s.direction, filters: {}, paginationOpts: { cursor, numItems: 1 } }))).map((r) => [r.title, r.problems]);
  const against = async () => (await pages((cursor) => s.asA.query(api.roles.against, { directionId: s.direction, paginationOpts: { cursor, numItems: 1 } }))).map((r) => [r.title, r.problems]);
  const pay = { value: "At least $150k", rule: { min: 150000, currency: "USD", period: "year" }, appliesTo: [], when: [] };

  await s.asA.mutation(api.goals.updateLimit, { id: limitId, ...pay, firm: true });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await titles()).toEqual([["Range", []], ["From", []], ["Silent", []]]);
  expect(await against()).toEqual([
    ["Low", ["Pays at most $120,000 a year, below your $150,000 floor"]],
    ["Hourly", ["Pays at most $104,000 a year, below your $150,000 floor"]],
  ]);

  await s.asA.mutation(api.goals.updateLimit, { id: limitId, ...pay, firm: false });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await against()).toEqual([]);
  expect((await titles()).map(([t]) => t)).toEqual(["Low", "Range", "Hourly", "From", "Silent"]);
});

test("the board's own details are kept from every read and sent to judging; the brief reads their approved record only", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: s.a.w, kind: "role", status: "approved", roleKey: "r1", data: { employer: "Globex", title: "Account Manager", start: "2020-01" }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: s.a.w, kind: "fact", status: "approved", roleKey: "r1", data: { text: "Closed a $2M enterprise deal." }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: s.a.w, kind: "fact", status: "proposed", roleKey: "r1", data: { text: "Ran the support desk." }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: s.a.w, kind: "fact", status: "rejected", roleKey: "r1", data: { text: "Led a team of fifty." }, sources: [], at: 0 });
  });
  const { judged, prompts } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  // The board lists its pay (in cents) and employment type.
  const inner = globalThis.fetch as (input: string | URL, init?: RequestInit) => Promise<Response>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/boards/acme/jobs")
        return Response.json({
          jobs: [{ id: 1, title: "Account Executive", absolute_url: "https://boards.greenhouse.io/acme/jobs/1", location: { name: "New York, NY" }, pay_input_ranges: [{ min_cents: 12000000, max_cents: 14000000, currency_type: "USD", title: "US Salary Range" }], metadata: [{ name: "Employment Type", value: "Full-time" }] }],
        });
      return inner(input, init);
    }),
  );
  await s.pass("2026-09-20T09:00:00Z");
  const [p] = await s.postings();
  expect(p.boardDetails).toMatchObject({ pay: { min: 120000, max: 140000, currency: "USD", period: "year" }, employmentType: "full-time" });
  expect(judged.map((j) => j.board)).toEqual([p.boardDetails]);
  expect(prompts[0]).toContain("Closed a $2M enterprise deal.");
  expect(prompts[0]).not.toContain("Ran the support desk.");
  expect(prompts[0]).not.toContain("Led a team of fifty.");
  // The board's pay wins over the AI's (the stub reads $150k–$190k); the rest the board doesn't state is the AI's.
  const [row] = (await view(s, s.direction)).ranked;
  expect(row.details).toMatchObject({ pay: { value: { min: 120000, max: 140000 }, source: "board" }, employmentType: { source: "board" }, seniority: { value: "individual", source: "ai" } });
  expect((await view(s, s.direction, 100, { minPay: { value: 130000, unknown: false } })).ranked).toEqual([]);
});

test("rankAgain with no direction ranks every open role again for every approved direction, in one sort", async () => {
  const s = await setup({ design: true });
  const { sorted, judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  await s.pass("2026-09-20T09:00:00Z");
  expect([sorted.length, judged.length]).toEqual([1, 1]);
  await s.t.run(async (ctx) => {
    const [p] = await ctx.db.query("postings").collect();
    await ctx.db.patch(p._id, { brief: undefined, details: undefined });
  });
  vi.setSystemTime(Date.parse("2026-09-21T09:00:00Z"));
  await s.asA.mutation(api.roles.rankAgain, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sorted.slice(1)).toEqual([{ title: "Account Executive", directions: ["Sales", "Design"] }]);
  expect(judged.slice(1).map((j) => [...j.directionIds].sort())).toEqual([[s.direction, s.design].sort()]);
  const [p] = await s.postings();
  expect([p.rerank, p.brief?.job, p.fit?.map((f) => f.score)]).toEqual([undefined, "Sells to large companies.", [90, 90]]);
});

// Judging calls answered by `answer` (by call number, with the titles sent) instead of the stub's model; everything
// else as stubWorld.
function judgeAnswers(answer: (n: number, titles: string[]) => Response | null) {
  const inner = globalThis.fetch as (input: string | URL, init?: RequestInit) => Promise<Response>;
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const user = new URL(String(input)).hostname === "openrouter.ai" ? (JSON.parse(String(init!.body)).messages[1].content as string) : "";
      const listed: unknown = user ? JSON.parse(user.split("Postings:\n")[1]) : null;
      return (Array.isArray(listed) && answer(++n, (listed as { title: string }[]).map((x) => x.title))) || inner(input, init);
    }),
  );
}

test("judging OpenRouter turns away as busy is tried again", async () => {
  const s = await setup();
  const { judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  judgeAnswers((n) => (n <= 2 ? Response.json({ error: { message: "Rate limited." } }, { status: 429, headers: { "retry-after": "3" } }) : null));
  await s.pass("2026-09-20T09:00:00Z");
  expect(judged).toHaveLength(1);
  expect((await s.postings())[0].fit).toEqual([expect.objectContaining({ level: "strong" })]);
});

test("roles failing together are tried alone: only the one whose own input keeps failing is set aside, with why", async () => {
  const s = await setup();
  const { judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 2, title: "Garbled", location: "New York, NY" }] });
  // Any judging call that includes the garbled role gets a reply that can't be read.
  judgeAnswers((_, titles) => (titles.includes("Garbled") ? Response.json({ choices: [{ message: { content: "I can't." } }], usage: { cost: 0 } }) : null));
  await s.pass("2026-09-20T09:00:00Z");
  const rows = await s.postings();
  expect(rows.find((p) => p.title === "Account Executive")!.fit).toEqual([expect.objectContaining({ level: "strong" })]);
  expect(rows.find((p) => p.title === "Garbled")).toMatchObject({ failed: { count: 3, error: "The model's reply wasn't readable. Try again." } });
  expect(rows.find((p) => p.title === "Garbled")!.queue).toBeUndefined();
  expect(judged.length).toBeGreaterThan(0);
  const job = await s.t.run(async (ctx) => (await ctx.db.query("jobs").order("desc").first())!);
  expect(job).toMatchObject({ status: "done", result: { setAside: 1, judged: 1 } });
});

test("a failure that isn't about any role sets none aside; when it keeps happening the pass stops and fails with it", async () => {
  const s = await setup();
  stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 2, title: "Sales Engineer", location: "New York, NY" }] });
  judgeAnswers(() => Response.json({ error: { message: "No such model." } }, { status: 400 }));
  await s.pass("2026-09-20T09:00:00Z");
  expect((await s.postings()).map((p) => [p.failed, p.fitAt, p.queue])).toEqual([[undefined, undefined, "judge"], [undefined, undefined, "judge"]]);
  const job = await s.t.run(async (ctx) => (await ctx.db.query("jobs").order("desc").first())!);
  expect(job.status).toBe("failed");
  expect(job.error).toMatch(/^Roles stopped after \d+ failures: No such model\.$/);

  // The operator clears what was recorded; the next pass judges both.
  await s.t.mutation(internal.admin.clearRoleFailures, { workspaceId: s.a.w });
  stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }, { id: 2, title: "Sales Engineer", location: "New York, NY" }] });
  await s.pass("2026-09-21T09:00:00Z");
  expect((await s.postings()).every((p) => p.fitAt && !p.failed)).toBe(true);
});

test("the operator can clear roles set aside, and the next pass takes them up again", async () => {
  const s = await setup();
  stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  await s.pass("2026-09-20T09:00:00Z");
  const p = (await s.postings())[0];
  await s.t.run((ctx) => ctx.db.patch(p._id, { fit: undefined, fitAt: undefined, sort: undefined, failed: { count: 3, at: Date.now(), error: "x" }, queue: undefined }));
  await s.t.mutation(internal.admin.clearRoleFailures, { workspaceId: s.a.w });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await s.postings())[0].failed).toBeUndefined();
  await s.pass("2026-09-21T09:00:00Z");
  expect((await s.postings())[0].fitAt).toBeDefined();
});

test("with the AI budget used up, a pass pauses and keeps its roles queued", async () => {
  const s = await setup();
  stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  await s.t.run(async (ctx) => {
    const b = (await ctx.db.query("budgets").collect()).find((x) => x.workspaceId === s.a.w)!;
    await ctx.db.patch(b._id, { aiMonthlyUsd: 0.001 });
    await ctx.db.insert("usage", { workspaceId: s.a.w, service: "openrouter", purpose: "role fit", costUsd: 0.002, ok: true, state: "settled", at: Date.now() });
  });
  await s.pass("2026-09-20T09:00:00Z");
  const job = await s.t.run(async (ctx) => (await ctx.db.query("jobs").order("desc").first())!);
  expect(job).toMatchObject({ status: "paused", pausedFor: "openrouter" });
  expect(await s.postings()).toEqual([expect.objectContaining({ queue: "sort", descriptionAt: expect.any(Number) })]);
  expect((await s.postings())[0].failed).toBeUndefined();
});

test("a pass for some companies reads, describes, sorts and judges only their roles; the next full pass picks up the rest", async () => {
  const s = await setup();
  const { sorted, judged } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  const waiting = await s.t.run(async (ctx) => {
    const beta = await ctx.db.insert("companies", {
      workspaceId: s.a.w, name: "Beta", domain: "beta.com", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 },
      details: { board: { provider: "greenhouse", slug: "beta", url: "https://boards.greenhouse.io/beta" }, sources: [], at: 0 }, at: 0,
    });
    // A Beta role waiting for its description, and one waiting to be sorted.
    const base = { workspaceId: s.a.w, companyId: beta, provider: "greenhouse" as const, location: "Remote, US", remote: true, firstSeen: 0, lastSeen: 0 };
    return [
      await ctx.db.insert("postings", { ...base, externalId: "7", url: "https://x/7", title: "Sales Lead" }),
      await ctx.db.insert("postings", { ...base, externalId: "8", url: "https://x/8", title: "Sales Director", descriptionAt: 1, hasDescription: false, queue: "sort" as const }),
    ];
  });
  const boardsRead = () => vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u)).pathname).filter((p) => p.startsWith("/v1/boards/"));

  await s.t.mutation(internal.admin.startJob, { workspaceId: s.a.w, kind: "roles", args: { since: Date.now(), only: [s.company] } });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(boardsRead().every((p) => p.startsWith("/v1/boards/acme/"))).toBe(true);
  const job = await s.t.run(async (ctx) => (await ctx.db.query("jobs").order("desc").first())!);
  expect(job).toMatchObject({ status: "done", args: { only: [s.company] }, result: { sorted: 1, judged: 1 } });
  expect(sorted.map((x) => x.title)).toEqual(["Account Executive"]);
  expect(judged).toHaveLength(1);
  let rows = await s.t.run((ctx) => Promise.all(waiting.map((id) => ctx.db.get(id))));
  expect(rows.map((p) => [p!.descriptionAt, p!.sort, p!.queue])).toEqual([[undefined, undefined, undefined], [1, undefined, undefined]]);

  await s.pass("2026-09-21T09:00:00Z");
  expect(boardsRead().some((p) => p.startsWith("/v1/boards/beta/"))).toBe(true);
  rows = await s.t.run((ctx) => Promise.all(waiting.map((id) => ctx.db.get(id))));
  expect(rows.every((p) => p!.sort && p!.fitAt)).toBe(true);
});

test("a company asked to be checked again while a pass ranks its roles is read again before the pass is done", async () => {
  const s = await setup();
  stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  const world = globalThis.fetch;
  let reads = 0;
  let askedAt = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/boards/acme/jobs") reads++;
    // The boards are read and the role is being ranked: they ask for Acme to be checked again.
    if (url.hostname === "openrouter.ai" && !askedAt) {
      askedAt = Date.now();
      await s.asA.mutation(api.roles.checkCompany, { companyId: s.company });
    }
    return world(input, init);
  });
  await s.pass("2026-09-20T09:00:00Z");
  expect(askedAt).toBeGreaterThan(0);
  expect(reads).toBe(2);
  const c = await s.t.run((ctx) => ctx.db.get(s.company));
  expect(c!.roles!.at).toBeGreaterThanOrEqual(askedAt);
  expect((await s.asA.query(api.roles.overview, {})).coverage.find((x) => x.id === s.company)?.checking).toBe(false);
  const jobs = await s.t.run((ctx) => ctx.db.query("jobs").collect());
  expect(jobs.every((j) => j.status === "done")).toBe(true);
});

test("the daily check starts a pass for a workspace whose only watched companies are Maybe", async () => {
  const s = await setup();
  stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  await s.t.run((ctx) => ctx.db.patch(s.company, { rating: { value: "maybe", at: 0 } }));
  await s.t.mutation(internal.roles.startAll, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await s.postings()).map((p) => p.title)).toEqual(["Account Executive"]);
});

test("the operator can switch how a workspace's roles are sorted", async () => {
  const s = await setup();
  await s.t.mutation(internal.admin.setRoleSort, { workspaceId: s.a.w, method: "jev" });
  expect((await s.t.run((ctx) => ctx.db.query("discovery").collect())).find((d) => d.workspaceId === s.a.w)?.roleSort).toBe("jev");
});

test("a company with 2,500 roles is cleaned, sorted and listed a page at a time, within what one function may read", async () => {
  // One function may read 2.5 MB here, less than the company's descriptions.
  const s = await setup({ bytesRead: 2_500_000 });
  const { sorted, judged } = stubWorld({ jobs: [] }, (title, names) => (title === "Role 7" ? names : []));
  const pitch = ["About Big: we build rockets that carry satellites to orbit, and we are growing fast every year.", "Benefits", "- Medical, dental and vision for you and your family.", "- Unlimited paid time off.", "Big is an equal opportunity employer. All qualified applicants will receive consideration."];
  const own = (i: number) => Array.from({ length: 12 }, (_, k) => `- Role ${i}, duty ${k}: work on part ${i * 100 + k} of the launch system with the team every day.`);
  const big = await s.t.run((ctx) =>
    ctx.db.insert("companies", { workspaceId: s.a.w, name: "Big", domain: "big.com", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 }, details: { sources: [], at: 0 }, at: 0 }),
  );
  for (let start = 0; start < 2500; start += 250)
    await s.t.run(async (ctx) => {
      for (let i = start; i < start + 250; i++) {
        const id = await ctx.db.insert("postings", {
          workspaceId: s.a.w, companyId: big, provider: "greenhouse", externalId: String(i), url: `https://x/${i}`, title: `Role ${i}`, location: "Remote, US", remote: true, firstSeen: 0, lastSeen: 0, descriptionAt: 1, hasDescription: true,
        });
        await ctx.db.insert("postingTexts", { workspaceId: s.a.w, postingId: id, text: [...pitch.slice(0, 1), ...own(i), ...pitch.slice(1)].join("\n") });
      }
    });
  // Reading every description at once is more than one function may read.
  await expect(s.t.run((ctx) => ctx.db.query("postingTexts").collect())).rejects.toThrow("Read too much data");

  await s.pass("2026-09-20T09:00:00Z");
  const job = await s.t.run(async (ctx) => (await ctx.db.query("jobs").order("desc").first())!);
  expect(job).toMatchObject({ status: "done", result: { sorted: 2500, sortedOut: 2499, judged: 1 } });
  expect(job.result.setAside).toBeUndefined();
  expect(sorted).toHaveLength(2500);
  expect(judged.map((j) => j.description)).toEqual([own(7).join("\n")]);
  // Every description was cleaned once, and the raw text kept.
  const sample = await s.t.run(async (ctx) => (await ctx.db.query("postingTexts").take(50)).map((x) => [x.text.includes(pitch[0]), x.clean?.includes(pitch[0])]));
  expect(sample.every(([raw, clean]) => raw && clean === false)).toBe(true);
  expect((await s.t.run((ctx) => ctx.db.get(big)))?.textsCleaning).toBeUndefined();

  // Listed a page at a time, each within the same limit.
  const sales = await view(s, s.direction);
  expect([sales.ranked.map((r) => r.title), sales.sortedOut.length, sales.count, sales.sortedOutCount]).toEqual([["Role 7"], 2499, { count: 1, more: false }, { count: 2000, more: true }]);
  // What this checks is the read limit, not speed: 2,500 roles through every step takes about 40s locally and over 60s
  // on CI's runners.
}, 180_000);

test("another workspace can't see, rate or check a workspace's roles", async () => {
  const s = await setup();
  const id: Id<"postings"> = await s.t.run((ctx) =>
    ctx.db.insert("postings", {
      workspaceId: s.a.w, companyId: s.company, provider: "greenhouse", externalId: "1", url: "https://x/1", title: "AE", location: "Remote, US", remote: true, firstSeen: 0, lastSeen: 0,
      fit: [{ directionId: s.direction, level: "strong", score: 80, method: "model" }], fitAt: 1,
    }),
  );
  await refresh(s);
  expect((await view(s)).ranked.map((r) => r.id)).toEqual([id]);
  await expect(s.asB.mutation(api.roles.rate, { id, value: "interested" })).rejects.toThrow("Not found");
  await expect(s.asB.query(api.roles.get, { id })).rejects.toThrow("Not found");
  await expect(s.asB.query(api.roles.list, { directionId: s.direction, filters: {}, paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("Not found");
  await expect(s.asB.query(api.roles.count, { directionId: s.direction, filters: {} })).rejects.toThrow("Not found");
  await expect(s.asB.query(api.roles.sortedOut, { directionId: s.direction, paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("Not found");
  await expect(s.asB.query(api.roles.overview, { directionId: s.direction })).rejects.toThrow("Not found");
  await expect(s.asB.mutation(api.roles.checkCompany, { companyId: s.company })).rejects.toThrow("Not found");
  await expect(s.asB.mutation(api.roles.rankAgain, { directionId: s.direction })).rejects.toThrow("Not found");
  // All directions: none of A's roles.
  expect((await s.asB.query(api.roles.list, { filters: {}, paginationOpts: { cursor: null, numItems: 10 } })).page).toEqual([]);
  expect(await s.asB.query(api.roles.count, { filters: {} })).toEqual({ count: 0, more: false });
  expect(await s.asB.query(api.roles.overview, {})).toMatchObject({ directions: [], ranked: false, companies: [], coverage: [] });
  expect((await s.t.run((ctx) => ctx.db.get(id)))?.rating).toBeUndefined();
});

// Judging replies from stubWorld's model, each posting's reshaped by `reshape`; `systems` records each judging call's
// system prompt.
type Judged = { id: string; fit: { level: string; score: number }[] };
function reshapeJudging(reshape: (posting: Judged) => object) {
  const inner = globalThis.fetch as (input: string | URL, init?: RequestInit) => Promise<Response>;
  const systems: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const res = await inner(input, init);
      if (new URL(String(input)).hostname !== "openrouter.ai") return res;
      const out: { postings?: Judged[] } = JSON.parse((await res.json()).choices[0].message.content);
      if (out.postings) {
        systems.push(JSON.parse(String(init!.body)).messages[0].content);
        out.postings = out.postings.map((p) => ({ ...p, ...reshape(p) }));
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { cost: 0.001 } });
    }),
  );
  return systems;
}

// Approved roles: 2016 to 2020, one overlapping it into May 2021, a career break, then one from February 2022 to now
// (September 2026): 121 months of work.
async function career(s: Awaited<ReturnType<typeof setup>>) {
  await s.t.run(async (ctx) => {
    const role = (roleKey: string, data: Record<string, unknown>) => ctx.db.insert("items", { workspaceId: s.a.w, kind: "role", status: "approved", roleKey, data, sources: [], at: 0 });
    await role("r1", { employer: "Globex", title: "Account Manager", start: "2016-01", end: "2020-12" });
    await role("r2", { employer: "Initech", title: "Advisor", start: "2019-06", end: "2021-05" });
    await role("r3", { title: "Career break", break: true, start: "2021-06", end: "2022-01" });
    await role("r4", { employer: "Hooli", title: "Account Director", start: "2022-02" });
  });
}

test("counting the stretch is on unless turned off: judging sends their years of work and saves each verdict with its rubric and the role's stretch, shown on the role's page", async () => {
  const s = await setup();
  await career(s);
  const { prompts } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  const systems = reshapeJudging((p) => ({ fit: p.fit.map((f) => ({ ...f, score: 70 })), stretch: [" asks for 15+ years of enterprise sales ", 7, "", "director level"] }));
  expect((await s.asA.query(api.roles.overview, {})).stretch).toBe(true);
  await s.pass("2026-09-20T09:00:00Z");
  expect(systems[0]).toContain('"stretch"');
  expect(prompts[0]).toContain("Their years of work, from their approved roles' dates: 10.1");
  const [p] = await s.postings();
  const stretch = ["asks for 15+ years of enterprise sales", "director level"];
  // A stretch may take a strong role below its band; the level stays.
  expect(p.fit).toEqual([expect.objectContaining({ level: "strong", score: 70, rubric: "v2", stretch })]);
  expect((await s.asA.query(api.roles.get, { id: p._id })).fit).toEqual([expect.objectContaining({ level: "strong", score: 70, stretch })]);
});

test("with counting the stretch off, judging uses rubric v1: no stretch asked for or kept, and no years sent", async () => {
  const s = await setup();
  await career(s);
  const { prompts } = stubWorld({ jobs: [{ id: 1, title: "Account Executive", location: "New York, NY" }] });
  const systems = reshapeJudging(() => ({ stretch: ["director level"] }));
  await s.asA.mutation(api.roles.setStretch, { on: false });
  expect((await s.asA.query(api.roles.overview, {})).stretch).toBe(false);
  await s.pass("2026-09-20T09:00:00Z");
  expect(systems[0]).toContain("gaps in their background are handled when tailoring, so they never lower a level or a score");
  expect(systems[0]).not.toContain('"stretch"');
  expect(prompts[0]).not.toContain("years of work");
  const [p] = await s.postings();
  expect(p.fit).toEqual([expect.objectContaining({ level: "strong", score: 90, rubric: "v1" })]);
  expect(p.fit![0].stretch).toBeUndefined();
});

test("a comparison judges the roles they rated, the best per direction and some at random under a rubric, beside their live verdicts, and never touches those", async () => {
  const s = await setup();
  stubWorld({ jobs: [{ id: 1, title: "Field CTO", location: "New York, NY" }, { id: 2, title: "Account Executive", location: "Austin, TX" }, { id: 3, title: "Sales Engineer", location: "Remote, US" }] });
  await s.asA.mutation(api.roles.setStretch, { on: false });
  await s.pass("2026-09-20T09:00:00Z");
  const cto = (await s.postings()).find((p) => p.title === "Field CTO")!;
  await s.asA.mutation(api.roles.rate, { id: cto._id, value: "no" });
  const live = () => s.t.run(async (ctx) => ({ postings: await ctx.db.query("postings").collect(), ranks: await ctx.db.query("roleRanks").collect() }));
  const before = await live();

  // Under v2, the Field CTO drops to 45 with its stretch; the others to 80.
  reshapeJudging((p) => (p.id === cto._id ? { fit: p.fit.map((f) => ({ ...f, score: 45 })), stretch: ["asks for 15+ years of technical leadership"] } : { fit: p.fit.map((f) => ({ ...f, score: 80 })), stretch: [] }));
  const runId = await s.t.action(internal.roles.compareRubric, { workspaceId: s.a.w, rubric: "v2", sample: 2 });
  expect(await live()).toEqual(before);

  const run = await s.t.query(internal.roles.rubricRun, { workspaceId: s.a.w, runId });
  // Rated (Field CTO), the best two for Sales, and two more at random: every role here.
  expect(run).toMatchObject({ rubric: "v2", status: "done", sample: 2, failed: 0, roles: 3 });
  expect(run.all).toEqual({ rows: 3, scored: 3, up: 0, down: 3, same: 0, meanChange: -21.7, levelUp: 0, levelDown: 0 });
  expect(run.notForMe).toMatchObject({ rows: 1, down: 1, meanChange: -45 });
  expect(run.rated).toEqual([
    expect.objectContaining({ title: "Field CTO", company: "Acme", rating: "no", direction: "Sales", oldLevel: "strong", oldScore: 90, newLevel: "strong", newScore: 45, change: -45, stretch: ["asks for 15+ years of technical leadership"] }),
  ]);
  expect(run.drops.map((r) => r.title)[0]).toBe("Field CTO");
  expect(run.rises).toEqual([]);
});
