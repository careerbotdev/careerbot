import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import { JEV_NONE, JEV_PICK, JEV_WORK, type SortMethod, sortRoles, type SortPosting } from "./roleSort";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "77".repeat(32);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const ws = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
    await ctx.db.insert("aiSettings", { workspaceId: w, task: "roleSort", model: "test/sorter" });
    await ctx.db.insert("aiSettings", { workspaceId: w, task: "roleSortJev", model: "typesafe/jev-1.13" });
    return w;
  });
  // sortRoles run in an action, with its results as a plain object (an action can't return a Map).
  const sort = (method: SortMethod, postings: SortPosting[]) =>
    t.action(async (ctx) => {
      const r = await sortRoles(ctx, ws, method, postings, directions);
      return { results: Object.fromEntries(r.results), costUsd: r.costUsd };
    });
  return { t, ws, sort };
}

const directions = [
  { id: "dir-sales", name: "Sales", titles: ["Account Executive"] },
  { id: "dir-ops", name: "Operations", positioning: "Runs the business side.", titles: [] },
];
const posting = (id: string, title: string): SortPosting => ({ id, title, company: "Acme", text: `${title} at Acme.` });

// A chat model that sorts each posting by its title: `answer(title)` gives the direction keys, or undefined to leave the
// posting out of the reply.
function stubModel(answer: (title: string) => string[] | undefined) {
  const sent: { postings: Record<string, { title: string }> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const user = JSON.parse(String(init.body)).messages[1].content as string;
      const postings = JSON.parse(user.split("Postings:\n")[1]) as Record<string, { title: string }>;
      sent.push({ postings });
      const out = Object.fromEntries(
        Object.entries(postings).flatMap(([k, p]) => {
          const named = answer(p.title);
          return named ? [[k, named] as const] : [];
        }),
      );
      return Response.json({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { cost: 0.001 } });
    }),
  );
  return sent;
}

test("the model sort gives each posting the directions named for it, in every batch, and never drops a posting the reply skipped", async () => {
  const { t, sort } = await setup();
  const sent = stubModel((title) => (title.startsWith("Skipped") ? undefined : title.startsWith("Chef") ? [] : title.startsWith("Odd") ? ["d9", "d2"] : ["d1"]));
  const postings = [...Array.from({ length: 10 }, (_, i) => posting(`p${i}`, `Account Executive ${i}`)), posting("chef", "Chef"), posting("odd", "Odd one"), posting("skip", "Skipped")];
  const out = await sort("model", postings);
  expect(sent).toHaveLength(2);
  for (let i = 0; i < 10; i++) expect(out.results[`p${i}`]).toEqual(["dir-sales"]);
  expect(out.results.chef).toEqual([]);
  expect(out.results.odd).toEqual(["dir-ops"]);
  expect(out.results.skip).toEqual(["dir-sales", "dir-ops"]);
  expect(out.costUsd).toBeCloseTo(0.002);
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toMatchObject([
    { purpose: "role sort", model: "test/sorter" },
    { purpose: "role sort", model: "test/sorter" },
  ]);
});

test("the Jev sort sorts out a role Jev is nearly sure fits no direction, and sends the rest to each direction it gave a chance", async () => {
  const { t, sort } = await setup();
  // Per title: yes to "is its work d1's / d2's", and the pick among d1, d2 and none.
  const answers: Record<string, { work: [number, number]; pick: { d1: number; d2: number; none: number } }> = {
    "Account Executive": { work: [0.9, 0.1], pick: { d1: 0.99, d2: 0, none: 0.01 } },
    Chef: { work: [0.05, 0.9], pick: { d1: 0, d2: 1 - JEV_NONE, none: JEV_NONE } },
    Gardener: { work: [0.01, JEV_WORK], pick: { d1: JEV_PICK, d2: 0, none: 0.5 } },
    Clerk: { work: [0.1, 0.1], pick: { d1: 0.01, d2: 0.01, none: 0.9 } },
  };
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body: { state: { posting: { title: string } }; questions: Record<string, { type: string; criteria?: Record<string, unknown> }> } = JSON.parse(String(init.body));
    expect(Object.entries(body.questions).map(([id, q]) => [id, q.type])).toEqual([["work_d1", "noul"], ["work_d2", "noul"], ["pick", "choice"]]);
    expect(Object.keys(body.questions.pick.criteria!)).toEqual(["d1", "d2", "none"]);
    const a = answers[body.state.posting.title];
    return Response.json({
      answers: { work_d1: { type: "noul", noul: a.work[0] }, work_d2: { type: "noul", noul: a.work[1] }, pick: { type: "choice", choice: "d1", confidence: 0.5, probabilities: a.pick } },
      usage: { cost: 0.00001 },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const out = await sort("jev", Object.keys(answers).map((title) => posting(title, title)));
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(Array(4).fill("https://openrouter.ai/api/alpha/decisions"));
  expect(out.results).toEqual({ "Account Executive": ["dir-sales"], Chef: [], Gardener: ["dir-sales", "dir-ops"], Clerk: [] });
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toMatchObject([{ purpose: "role sort", model: "typesafe/jev-1.13", ok: true }]);
});

// Three roles judged by the first ranking (Account Executive fits Sales, Revenue Operations fits Operations, Chef fits
// nothing) and one judged later, which isn't a label.
async function seedLabelled(t: TestConvex<typeof schema>, ws: Id<"workspaces">) {
  await t.run(async (ctx) => {
    const sales = await ctx.db.insert("items", { workspaceId: ws, kind: "direction", status: "approved", data: { name: "Sales" }, sources: [], at: 0 });
    const ops = await ctx.db.insert("items", { workspaceId: ws, kind: "direction", status: "approved", data: { name: "Operations" }, sources: [], at: 0 });
    const company = await ctx.db.insert("companies", { workspaceId: ws, name: "Acme", domain: "acme.com", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 }, at: 0 });
    const add = async (title: string, fitAt: number, fit: { directionId: Id<"items">; level: "strong" | "some" | "weak" | "none" }[]) => {
      const id = await ctx.db.insert("postings", {
        workspaceId: ws, companyId: company, provider: "greenhouse", externalId: title, url: `https://acme.com/${title}`, title, remote: false, firstSeen: 0, lastSeen: 0,
        descriptionAt: 1, hasDescription: true, fitAt, fit: fit.map((f) => ({ ...f, reason: `${title} reason.`, method: "model" as const })),
      });
      await ctx.db.insert("postingTexts", { workspaceId: ws, postingId: id, text: `${title} does the work.` });
    };
    await add("Account Executive", 1790000000000, [{ directionId: sales, level: "strong" }]);
    await add("Revenue Operations", 1790000000000, [{ directionId: ops, level: "some" }, { directionId: sales, level: "weak" }]);
    await add("Chef", 1790000000000, []);
    // Judged after the first ranking: not a label.
    await add("Later", 1790500000000, [{ directionId: sales, level: "strong" }]);
  });
}

test("the backtest scores the sort against the first ranking's strong and some verdicts, and changes no verdicts", async () => {
  const { t, ws } = await setup();
  await seedLabelled(t, ws);
  const sent = stubModel((title) => (title === "Account Executive" ? ["d1"] : title === "Chef" ? ["d1"] : []));
  const before = await t.run((ctx) => ctx.db.query("postings").collect());
  const out = await t.action(internal.roleSort.backtest, { workspaceId: ws, method: "model", model: "test/other" });
  expect(Object.values(sent[0].postings).map((p) => p.title).sort()).toEqual(["Account Executive", "Chef", "Revenue Operations"]);
  expect(out).toMatchObject({
    method: "model",
    model: "test/other",
    roles: 3,
    fitPairs: 2,
    recall: 0.5,
    recallStrong: 1,
    passed: 0.667,
    roleRecall: 0.5,
    directionsPerPassed: 1,
    passedWithoutFit: 1,
    missCount: 1,
    misses: [{ title: "Revenue Operations", company: "Acme", direction: "Operations", level: "some", sortedTo: [] }],
  });
  expect(await t.run((ctx) => ctx.db.query("postings").collect())).toEqual(before);
});

test("a backtest batch the model refuses is counted and left out of the scores, and the rest are still reported", async () => {
  const { t, ws } = await setup();
  await seedLabelled(t, ws);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "Model not found" } }, { status: 400 })));
  const out = await t.action(internal.roleSort.backtest, { workspaceId: ws, method: "model", model: "test/model" });
  expect(out).toMatchObject({ roles: 3, sorted: 0, failedBatches: 1, errors: ["Model not found"], recall: null, passed: null });
});
