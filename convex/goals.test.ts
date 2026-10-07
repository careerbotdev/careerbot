import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { activeLimits } from "./itemShapes";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (o: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const [a, b] = await t.run(async (ctx) => {
    const ids = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "extract", model: "test/model" });
      ids.push(u);
    }
    return ids;
  });
  const asA = t.withIdentity({ subject: `${a}|s` });
  const asB = t.withIdentity({ subject: `${b}|s` });
  const goalsId = await asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "I want supply chain product, remote, at least $135k." });
  const read = async (o: unknown) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(o)));
    await asA.mutation(api.goals.start, { narrativeId: goalsId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  // The one limit in A's workspace, typed as a limit.
  const limit = async () => {
    const l = (await asA.query(api.goals.items, {})).find((i) => i.kind === "limit");
    if (l?.kind !== "limit") throw new Error("no limit");
    return l;
  };
  // A's workspace (from one of its items), given an approved direction "Sales" and a Targets company "Acme".
  const world = (itemId: Id<"items">) =>
    t.run(async (ctx) => {
      const w = (await ctx.db.get(itemId))!.workspaceId;
      const direction = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Sales" }, sources: [], at: 0 });
      const company = await ctx.db.insert("companies", { workspaceId: w, name: "Acme", domain: "acme.com", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 }, at: 0 });
      return { w, direction, company };
    });
  return { t, asA, asB, goalsId, read, limit, world };
}

test("reading goals proposes directions and limits tied to the goals narrative", async () => {
  const { asA, goalsId, read } = await setup();
  await read({
    directions: [{ name: "Supply chain product", summary: "Building planning software", path: "adjacent", quotes: ["supply chain product"] }],
    limits: [{ kind: "pay", label: "Pay floor", value: "$135,000", firm: true, quotes: ["at least $135k"] }],
  });
  const items = await asA.query(api.goals.items, {});
  expect(items.map((i) => [i.kind, i.status, i.kind === "direction" ? i.data.name : i.data.value])).toEqual([["direction", "proposed", "Supply chain product"], ["limit", "proposed", "$135,000"]]);
  expect(items[1].sources).toEqual([{ narrativeId: goalsId, version: 1, quotes: ["at least $135k"] }]);
  expect(await asA.query(api.extract.items, {})).toHaveLength(0);
  expect(await asA.query(api.goals.lastRead, {})).toMatchObject({ status: "done", version: 1, error: null });
});

test("reading again replaces unreviewed proposals but keeps what they approved or corrected", async () => {
  const { asA, read } = await setup();
  await read({ directions: [{ name: "Supply chain product" }, { name: "Chief of staff" }], limits: [{ kind: "pay", value: "$135,000" }] });
  const [sales, , pay] = await asA.query(api.goals.items, {});
  await asA.mutation(api.extract.review, { id: sales.id, status: "approved" });
  await asA.mutation(api.goals.updateLimit, { id: pay.id, value: "$140,000 base", firm: true, rule: null, appliesTo: [], when: [] });
  await read({ directions: [{ name: "Solutions consulting" }], limits: [] });
  const items = await asA.query(api.goals.items, {});
  expect(items.map((i) => [i.kind === "direction" ? i.data.name : i.data.value, i.status])).toEqual([["Supply chain product", "approved"], ["$140,000 base", "approved"], ["Solutions consulting", "proposed"]]);
});

test("two overlapping reads: the older finishing last doesn't replace the newer one's proposals", async () => {
  const { t, asA, goalsId } = await setup();
  const older = await asA.mutation(api.goals.start, { narrativeId: goalsId });
  const newer = await asA.mutation(api.goals.start, { narrativeId: goalsId });
  const workspaceId = await t.run(async (ctx) => (await ctx.db.get(goalsId))!.workspaceId);
  const save = (runId: Id<"jobs">, name: string) => t.mutation(internal.goals.save, { workspaceId, runId, narrativeId: goalsId, version: 1, out: { directions: [{ name }], limits: [] } });
  await save(newer, "Product Operations");
  await save(older, "Supply chain product");
  expect((await asA.query(api.goals.items, {})).filter((i) => i.status === "proposed").map((i) => (i.kind === "direction" ? i.data.name : null))).toEqual(["Product Operations"]);
});

test("editing the goals story while a read is in flight: the read saves nothing, finishes, and no new read starts", async () => {
  const { t, asA, goalsId } = await setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await asA.mutation(api.narratives.save, { id: goalsId, title: "", body: "Actually, solutions consulting." });
      return reply({ directions: [{ name: "Supply chain product" }], limits: [] });
    }),
  );
  const jobId = await asA.mutation(api.goals.start, { narrativeId: goalsId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await asA.query(api.goals.items, {})).toEqual([]);
  const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
  expect(jobs.filter((j) => j.kind === "goals").map((j) => [j._id, j.status])).toEqual([[jobId, "done"]]);
});

test("two overlapping reads: the older finishing first while the newer is pending saves nothing; the newer saves", async () => {
  const { t, asA, goalsId } = await setup();
  const older = await asA.mutation(api.goals.start, { narrativeId: goalsId });
  const newer = await asA.mutation(api.goals.start, { narrativeId: goalsId });
  const workspaceId = await t.run(async (ctx) => (await ctx.db.get(goalsId))!.workspaceId);
  const save = (runId: Id<"jobs">, name: string) => t.mutation(internal.goals.save, { workspaceId, runId, narrativeId: goalsId, version: 1, out: { directions: [{ name }], limits: [] } });
  expect(await save(older, "Supply chain product")).toEqual({ directions: 0, limits: 0 });
  await save(newer, "Product Operations");
  expect((await asA.query(api.goals.items, {})).filter((i) => i.status === "proposed").map((i) => (i.kind === "direction" ? i.data.name : null))).toEqual(["Product Operations"]);
});

test("only the goals narrative can be read this way, and only by its workspace", async () => {
  const { asA, asB, goalsId } = await setup();
  const career = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "x" });
  await expect(asA.mutation(api.goals.start, { narrativeId: career })).rejects.toThrow("isn't your goals");
  await expect(asB.mutation(api.goals.start, { narrativeId: goalsId })).rejects.toThrow("isn't your goals");
  await expect(asA.mutation(api.extract.start, { narrativeId: goalsId })).rejects.toThrow("Read my goals");
});

test("a limit can be added by hand, for some directions only or under a condition", async () => {
  const { asA, limit } = await setup();
  const id = await asA.mutation(api.goals.addLimit, { kind: "travel", value: "Up to 25%", firm: false });
  expect(await asA.query(api.goals.items, {})).toMatchObject([{ id, kind: "limit", status: "approved", data: { label: "Travel", value: "Up to 25%", firm: false } }]);
  await asA.mutation(api.goals.removeLimit, { id });
  await expect(asA.mutation(api.goals.addLimit, { kind: "seniority", value: "Manager is fine", firm: true, when: ["someday"] })).rejects.toThrow("condition");
  await asA.mutation(api.goals.addLimit, { kind: "seniority", value: "Manager is fine", firm: true, rule: { include: ["manager"] }, appliesTo: [" Sales ", "Sales", ""], when: ["industryChange"] });
  expect((await limit()).data).toMatchObject({ label: "Seniority (Sales) · when changing industry", appliesTo: ["Sales"], when: { industryChange: true } });
});

test("an eligibility limit given as its fields is kept exactly as given, worded from them, and never read again; invalid fields are refused", async () => {
  const { t, asA } = await setup();
  const fetch = vi.fn(async () => reply({ rule: { clearance: "ts/sci" } }));
  vi.stubGlobal("fetch", fetch);
  await expect(asA.mutation(api.goals.addLimit, { kind: "eligibility", value: "", firm: true, rule: { clearance: "cosmic" } })).rejects.toThrow("Security clearance you hold");
  await expect(asA.mutation(api.goals.addLimit, { kind: "eligibility", value: "", firm: true, rule: {} })).rejects.toThrow("Set at least one field");
  await asA.mutation(api.goals.addLimit, { kind: "eligibility", value: "", firm: false, rule: { clearance: "none", sponsorshipNeeded: true } });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fetch).not.toHaveBeenCalled();
  expect(await asA.query(api.goals.items, {})).toMatchObject([
    { kind: "limit", status: "approved", data: { label: "Eligibility", value: "Security clearance you hold: None. You need visa sponsorship: Yes", firm: false, rule: { clearance: "none", sponsorshipNeeded: true }, ruleStale: false } },
  ]);
});

test("a direction's banner title and what rolls up under it can be corrected", async () => {
  const { asA, read } = await setup();
  await read({ directions: [{ name: "Supply Chain Product", includes: ["Product Operations"] }], limits: [] });
  const [d] = await asA.query(api.goals.items, {});
  expect(d.data).toMatchObject({ name: "Supply Chain Product", includes: ["Product Operations"] });
  await asA.mutation(api.goals.edit, { id: d.id, fields: { name: "Supply Chain Product", includes: ["Product Operations", "Planning Software"] } });
  expect((await asA.query(api.goals.items, {}))[0]).toMatchObject({ status: "approved", data: { includes: ["Product Operations", "Planning Software"] } });
});

test("merging a direction folds its title and includes into the other, and only within the workspace", async () => {
  const { asA, asB, read } = await setup();
  await read({ directions: [{ name: "Supply Chain Product", includes: ["Product Management"] }, { name: "Product Operations", includes: ["Product Analytics"] }], limits: [] });
  const [sales, partners] = await asA.query(api.goals.items, {});
  await expect(asB.mutation(api.goals.merge, { id: partners.id, into: sales.id })).rejects.toThrow("Not found");
  await asA.mutation(api.goals.merge, { id: partners.id, into: sales.id });
  const items = await asA.query(api.goals.items, {});
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ status: "approved", data: { name: "Supply Chain Product", includes: ["Product Management", "Product Operations", "Product Analytics"] } });
});

test("after a merge, a reread doesn't bring back either banner", async () => {
  const { asA, read } = await setup();
  await read({ directions: [{ name: "Supply Chain Product" }, { name: "Product Operations" }], limits: [] });
  const [sales, partners] = await asA.query(api.goals.items, {});
  await asA.mutation(api.goals.merge, { id: partners.id, into: sales.id });
  await read({ directions: [{ name: "Supply Chain Product" }, { name: "product operations" }, { name: "Logistics Operations" }], limits: [] });
  expect((await asA.query(api.goals.items, {})).map((i) => (i.kind === "direction" ? i.data.name : i.data.label))).toEqual(["Supply Chain Product", "Logistics Operations"]);
});

test("a reread offers new titles for an approved banner as an addition, not a second banner", async () => {
  const { asA, read } = await setup();
  await read({ directions: [{ name: "Supply Chain Product", includes: ["Product Management"] }], limits: [] });
  const [sales] = await asA.query(api.goals.items, {});
  await asA.mutation(api.goals.edit, { id: sales.id, fields: { name: "Supply Chain Product" } });
  await read({ directions: [{ name: "Supply Chain Product", includes: ["Product Management", "Planning Software"] }], limits: [] });
  const items = await asA.query(api.goals.items, {});
  expect(items).toHaveLength(2);
  const add = items.find((i) => i.status === "proposed")!;
  expect(add.data).toMatchObject({ name: "Supply Chain Product", includes: ["Planning Software"], addsTo: sales.id });
  await asA.mutation(api.goals.merge, { id: add.id, into: sales.id });
  const after = await asA.query(api.goals.items, {});
  expect(after).toHaveLength(1);
  expect(after.find((i) => i.kind === "direction")?.data.includes).toEqual(["Product Management", "Planning Software"]);
});

test("rewording a limit keeps its rule until they update it from the new wording or keep it, and a reread changes neither", async () => {
  const { t, asA, read, limit } = await setup();
  const pay135 = { kind: "pay", value: "At least $135,000 base", rule: { min: 135000, currency: "USD", period: "year", basis: "base" } };
  await read({ directions: [], limits: [pay135] });
  const { id } = await limit();
  const ruleJobs = async () => (await t.run((ctx) => ctx.db.query("jobs").collect())).filter((j) => j.kind === "limitRule");
  const reword = (value: string) => asA.mutation(api.goals.updateLimit, { id, value, firm: true, rule: pay135.rule, appliesTo: [], when: [] });
  await reword("At least $200,000 base");
  expect(await ruleJobs()).toHaveLength(0);
  expect((await limit()).data).toMatchObject({ value: "At least $200,000 base", rule: { min: 135000 }, sentenceChanged: true });
  // Another save that leaves the wording and rule alone still says so; Keep the rule clears it.
  await asA.mutation(api.goals.updateLimit, { id, value: "At least $200,000 base", firm: false, rule: pay135.rule, appliesTo: [], when: [] });
  expect((await limit()).data.sentenceChanged).toBe(true);
  await asA.mutation(api.goals.keepRule, { id });
  expect((await limit()).data).toMatchObject({ rule: { min: 135000 } });
  expect((await limit()).data.sentenceChanged).toBeUndefined();
  // Update the rule reads it again from the wording.
  await reword("At least $210,000 base");
  vi.stubGlobal("fetch", vi.fn(async () => reply({ rule: { min: 210000, currency: "USD", period: "year", basis: "base" } })));
  await asA.mutation(api.goals.updateRule, { id });
  expect(await ruleJobs()).toHaveLength(1);
  expect((await limit()).data.sentenceChanged).toBeUndefined();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await limit()).data).toMatchObject({ rule: { min: 210000 }, ruleStale: false });
  await read({ directions: [], limits: [pay135] });
  const limits = (await asA.query(api.goals.items, {})).filter((i) => i.kind === "limit");
  expect(limits).toHaveLength(1);
  expect(limits[0].data).toMatchObject({ value: "At least $210,000 base", rule: { min: 210000 } });
});

test("limits sort into the fixed buckets: labels come from the bucket, invented kinds are dropped, scope shows in the label", async () => {
  const { asA, read } = await setup();
  await read({
    directions: [],
    limits: [
      { kind: "seniority", label: "Leadership bar", value: "Director or above", appliesTo: ["Customer Success"], rule: { min: "director" } },
      { kind: "prospecting", label: "Prospecting", value: "Strategic outbound only" },
    ],
  });
  const limits = (await asA.query(api.goals.items, {})).filter((i) => i.kind === "limit");
  expect(limits.map((l) => l.data.label)).toEqual(["Seniority (Customer Success)"]);
});


test("malformed rules are reduced to the bucket's typed fields and fixed lists before they're stored", async () => {
  const { asA, read } = await setup();
  await read({
    directions: [],
    limits: [
      { kind: "pay", value: "At least $135k", rule: { min: "135k", currency: "USD", period: "annually", bonus: true } },
      { kind: "seniority", value: "A step up", rule: { include: ["director", "senior-ish", "vp"], exclude: ["vp", "individual"] } },
      { kind: "travel", value: "Lots", rule: { minPercent: 60, maxPercent: 20 } },
      { kind: "work", value: "No cold calls", rule: { avoid: ["cold calling", "eating the sins of the company"] } },
    ],
  });
  const rules = Object.fromEntries((await asA.query(api.goals.items, {})).filter((i) => i.kind === "limit").map((i) => [i.data.kind, i.data.rule]));
  expect(rules).toEqual({
    pay: { currency: "USD" },
    seniority: { include: ["director", "vp"], exclude: ["individual"] },
    travel: { minPercent: 60 },
    work: { avoid: ["cold calling"] },
  });
});

test("filters, scope and condition set by hand are validated and relabel the limit; a reread doesn't duplicate it", async () => {
  const { asA, asB, read } = await setup();
  const seniority = { kind: "seniority", value: "A big step up", rule: { include: ["manager"] } };
  await read({ directions: [], limits: [seniority] });
  const [l] = await asA.query(api.goals.items, {});
  const change = { value: "A big step up", firm: true, rule: { include: ["director"] }, appliesTo: ["Customer Success"], when: ["industryChange"] };
  await expect(asB.mutation(api.goals.updateLimit, { id: l.id, ...change })).rejects.toThrow("Not found");
  await asA.mutation(api.goals.updateLimit, { id: l.id, ...change });
  await read({ directions: [], limits: [seniority] });
  const limits = await asA.query(api.goals.items, {});
  expect(limits).toHaveLength(1);
  expect(limits[0]).toMatchObject({
    status: "approved",
    data: { label: "Seniority (Customer Success) · when changing industry", rule: { include: ["director"] }, when: { industryChange: true } },
  });
});

test("filters set by hand aren't overwritten by an older rewording job that finishes later", async () => {
  const { t, asA, read } = await setup();
  await read({ directions: [], limits: [{ kind: "pay", value: "At least $135,000", rule: { min: 135000 } }] });
  const [l] = await asA.query(api.goals.items, {});
  vi.stubGlobal("fetch", vi.fn(async () => reply({ rule: { min: 150000 } })));
  await asA.mutation(api.goals.updateLimit, { id: l.id, value: "At least $200,000", firm: true, rule: { min: 135000 }, appliesTo: [], when: [] });
  await asA.mutation(api.goals.updateLimit, { id: l.id, value: "At least $200,000", firm: true, rule: { min: 200000, currency: "USD" }, appliesTo: [], when: [] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = (await asA.query(api.goals.items, {})).find((i) => i.kind === "limit");
  expect(after?.data.rule).toEqual({ min: 200000, currency: "USD" });
});

test("two limits for the same bucket and scope in one read are both kept and marked as clashing", async () => {
  const { asA, read } = await setup();
  await read({ directions: [], limits: [{ kind: "travel", value: "Up to 50%", rule: { maxPercent: 50 } }, { kind: "travel", value: "Up to 20%", rule: { maxPercent: 20 } }] });
  expect((await asA.query(api.goals.items, {})).map((i) => (i.kind === "limit" ? i.data.clash : undefined))).toEqual([true, true]);
});

test("filters typed by hand are rejected when invalid, and the valid rule already saved is kept", async () => {
  const { asA, read } = await setup();
  await read({ directions: [], limits: [{ kind: "seniority", value: "Director or above", rule: { include: ["director", "vp"] } }] });
  const [l] = await asA.query(api.goals.items, {});
  const base = { value: "Director or above", firm: true, appliesTo: [], when: [] };
  await expect(asA.mutation(api.goals.updateLimit, { id: l.id, ...base, rule: { include: ["director", "boss"] } })).rejects.toThrow("Levels");
  await expect(asA.mutation(api.goals.updateLimit, { id: l.id, ...base, rule: { include: ["vp"], exclude: ["vp"] } })).rejects.toThrow("both allowed and ruled out");
  await expect(asA.mutation(api.goals.updateLimit, { id: l.id, ...base, rule: {}, when: ["someday"] })).rejects.toThrow("condition");
  expect((await asA.query(api.goals.items, {})).find((i) => i.kind === "limit")?.data.rule).toEqual({ include: ["director", "vp"] });
});

test("a rejected limit isn't proposed again under another name, and reads are told what was rejected", async () => {
  const { t, asA, read } = await setup();
  const quote = "I'm okay with lower roles if that helps me pivot";
  await read({ directions: [], limits: [{ kind: "seniority", value: "Lower roles are fine for a pivot", quotes: [quote] }] });
  const [l] = await asA.query(api.goals.items, {});
  await asA.mutation(api.extract.review, { id: l.id, status: "rejected" });
  const fetch = vi.fn(async () => reply({ directions: [], limits: [
    { kind: "seniority", value: "Less senior is fine when changing industry", when: { industryChange: true }, quotes: [quote] },
    { kind: "travel", value: "Up to 50%", rule: { maxPercent: 50 }, quotes: ["up to 50% travel"] },
  ] }));
  vi.stubGlobal("fetch", fetch);
  await asA.mutation(api.goals.start, { narrativeId: (await asA.query(api.narratives.list, {})).find((n) => n.kind === "goals")!.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body).messages[1].content as string;
  expect(sent).toContain("What they rejected");
  expect(sent).toContain("Lower roles are fine for a pivot");
  const proposed = (await asA.query(api.goals.items, {})).filter((i) => i.status === "proposed");
  expect(proposed.map((i) => (i.kind === "limit" ? i.data.kind : i.kind))).toEqual(["travel"]);
});

test("a direction's fit can be changed to one of the three, and nothing else", async () => {
  const { asA, read } = await setup();
  await read({ directions: [{ name: "Logistics Operations", path: "continue" }], limits: [] });
  const [d] = await asA.query(api.goals.items, {});
  await expect(asA.mutation(api.goals.edit, { id: d.id, fields: { path: "sideways" } })).rejects.toThrow("Current, Adjacent or Stretch");
  await asA.mutation(api.goals.edit, { id: d.id, fields: { path: "adjacent" } });
  expect((await asA.query(api.goals.items, {})).find((i) => i.kind === "direction")?.data.path).toBe("adjacent");
});

test("only a limit they added themselves can be deleted, with its notes", async () => {
  const { t, asA, asB, read, limit } = await setup();
  await read({ directions: [], limits: [{ kind: "travel", value: "Up to 50%", rule: { maxPercent: 50 } }] });
  const readOne = await limit();
  await expect(asA.mutation(api.goals.removeLimit, { id: readOne.id })).rejects.toThrow("yourself");
  await asA.mutation(api.extract.review, { id: readOne.id, status: "rejected" });
  const id = await asA.mutation(api.goals.addLimit, { kind: "pay", value: "At least $135,000", firm: true, rule: { min: 135000 } });
  await asA.mutation(api.notes.add, { subject: { kind: "item", id }, text: "Base only." });
  await expect(asB.mutation(api.goals.removeLimit, { id })).rejects.toThrow("Not found");
  await asA.mutation(api.goals.removeLimit, { id });
  expect((await asA.query(api.goals.items, {})).map((i) => i.id)).toEqual([readOne.id]);
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toEqual([]);
});

test("a limit switched off stops filtering: it leaves the active limits, and roles it set apart come back", async () => {
  const { t, asA, world } = await setup();
  const id = await asA.mutation(api.goals.addLimit, { kind: "eligibility", value: "", firm: true, rule: { clearance: "secret" } });
  const { w, direction, company } = await world(id);
  await t.run((ctx) =>
    ctx.db.insert("postings", {
      workspaceId: w, companyId: company, provider: "greenhouse", externalId: "ts", url: "https://x/ts", title: "TS", remote: false, firstSeen: 0, lastSeen: 0, fitAt: 1,
      fit: [{ directionId: direction, level: "strong", score: 90, method: "model" }], details: { clearance: "top secret", at: 1 },
    }),
  );
  const states = async () => {
    await t.mutation(internal.roles.refreshRanks, { workspaceId: w });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return (await t.run((ctx) => ctx.db.query("roleRanks").collect())).map((r) => r.state);
  };
  expect(await states()).toEqual(["against", "against"]);
  await asA.mutation(api.goals.setLimitOn, { id, on: false });
  expect(await t.run((ctx) => activeLimits(ctx, w))).toEqual([]);
  expect(await states()).toEqual(["judged", "judged"]);
  await asA.mutation(api.goals.setLimitOn, { id, on: true });
  expect((await t.run((ctx) => activeLimits(ctx, w))).map((l) => l._id)).toEqual([id]);
  expect(await states()).toEqual(["against", "against"]);
});

test("what limits do to the listed roles: a firm pay floor hides a role under it, a range reaching it passes, a preference only ranks, a draft changes the count, an off limit hides nothing", async () => {
  const { t, asA, world } = await setup();
  const pay = await asA.mutation(api.goals.addLimit, { kind: "pay", value: "At least $135,000", firm: true, rule: { min: 135000, currency: "USD" } });
  const travel = await asA.mutation(api.goals.addLimit, { kind: "travel", value: "Little travel", firm: false, rule: { maxPercent: 20 } });
  const { w, direction, company } = await world(pay);
  const role = (title: string, row: { payMin?: number; travel?: number }, stated: { min: number; max?: number } | null, newest: number) =>
    t.run(async (ctx) => {
      const postingId = await ctx.db.insert("postings", {
        workspaceId: w, companyId: company, provider: "greenhouse", externalId: title, url: `https://x/${title}`, title, remote: false, firstSeen: 0, lastSeen: 0,
        ...(stated ? { boardDetails: { pay: { ...stated, currency: "USD", period: "year" as const } } } : {}),
      });
      await ctx.db.insert("roleRanks", { workspaceId: w, best: direction, postingId, companyId: company, companyRating: "excited", state: "judged", level: "strong", newest, at: 0, ...row });
      return postingId;
    });
  const low = await role("Low", { payMin: 110000 }, { min: 110000, max: 120000 }, 4);
  await role("Range", { payMin: 110000 }, { min: 110000, max: 200000 }, 3);
  await role("High", { payMin: 200000, travel: 50 }, { min: 200000 }, 2);
  await role("Silent", {}, null, 1);

  expect(await asA.query(api.goals.effects, {})).toEqual({ total: 4, hidden: 1, limits: [{ id: pay, fails: 1 }, { id: travel, fails: 1 }], draft: null, capped: false });
  expect(await asA.query(api.goals.hiddenBy, { id: pay })).toEqual([{ postingId: low, directionId: direction, title: "Low", company: "Acme" }]);

  // A higher floor, being edited: the range no longer reaches it, nor does the role stating only $200,000.
  const draft = { id: pay, kind: "pay", firm: true, rule: { min: 210000, currency: "USD" }, appliesTo: [], when: [] };
  expect(await asA.query(api.goals.effects, { draft })).toMatchObject({ hidden: 1, draft: { fails: 3, hidden: 3 } });
  expect((await asA.query(api.goals.hiddenBy, { id: pay, draft })).map((r) => r.title)).toEqual(["Low", "Range", "High"]);
  // The same floor as a preference ranks them lower but hides none.
  expect((await asA.query(api.goals.effects, { draft: { ...draft, firm: false } })).draft).toEqual({ fails: 3, hidden: 0 });

  // Switched off, it hides nothing, and still says what it would do.
  await asA.mutation(api.goals.setLimitOn, { id: pay, on: false });
  expect(await asA.query(api.goals.effects, {})).toMatchObject({ total: 4, hidden: 0, limits: [{ id: pay, fails: 1 }, { id: travel, fails: 1 }] });
});
