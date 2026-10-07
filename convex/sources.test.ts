import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const modelReply = (o: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "55".repeat(32);
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
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "extract", model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const acme = await asA.mutation(api.narratives.create, { kind: "career", title: "Acme", body: "At Acme I rebuilt onboarding, cut churn and ran the night shift." });
  const beta = await asA.mutation(api.narratives.create, { kind: "career", title: "Beta", body: "Beta retold: I rebuilt onboarding at Acme." });
  // Every model call is kept; each read replies with `next`.
  const sent: string[] = [];
  let next: unknown = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)).messages[1].content);
      return modelReply(next);
    }),
  );
  const read = async (narrativeId: Id<"narratives">, reply: unknown) => {
    next = reply;
    await asA.mutation(api.extract.start, { narrativeId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  const readAgain = async (narrativeId: Id<"narratives">, reply: unknown, includingRejected = false) => {
    next = reply;
    await asA.mutation(api.sources.readAgain, { source: { narrativeId }, includingRejected });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return sent[sent.length - 1];
  };
  const items = async () => asA.query(api.extract.items, {});
  const fact = async (text: string) => (await items()).find((i) => i.kind === "fact" && i.data.text === text)!;
  const all = () => t.run(async (ctx) => ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", a.w)).collect());
  const statusOf = async (text: string) => (await all()).find((i) => i.kind === "fact" && i.data.text === text)?.status;
  // What every reader of the approved record gets: the resume's inputs and the questions check's.
  const counted = async () => (await t.query(internal.resume.inputs, { workspaceId: a.w })).record.facts.map((f) => f.text).sort();
  return { t, a, asA, asB, acme, beta, read, readAgain, items, fact, statusOf, counted, sent };
}

const reply = (...facts: string[]) => ({ roles: [], context: [], facts: facts.map((text) => ({ roleKey: "acme", text, quotes: [] })) });

test("a fact both narratives say keeps counting while either of them does", async () => {
  const { asA, acme, beta, read, fact, statusOf, counted } = await setup();
  await read(acme, reply("Rebuilt onboarding.", "Cut churn by 20%."));
  // The same fact read from a second narrative cites both, rather than being proposed twice.
  await read(beta, reply("Rebuilt onboarding."));
  expect((await fact("Rebuilt onboarding.")).sources.map((s) => s.narrativeId)).toEqual([acme, beta]);
  await asA.mutation(api.extract.review, { id: (await fact("Rebuilt onboarding.")).id, status: "approved" });
  await asA.mutation(api.extract.review, { id: (await fact("Cut churn by 20%.")).id, status: "approved" });
  await asA.mutation(api.sources.reject, { source: { narrativeId: acme } });
  expect(await counted()).toEqual(["Rebuilt onboarding."]);
  await asA.mutation(api.sources.reject, { source: { narrativeId: beta } });
  expect(await counted()).toEqual([]);
  // Approved facts stay approved: a rejected source is not a decision about them. The record says it's left out.
  expect(await statusOf("Rebuilt onboarding.")).toBe("approved");
  expect((await fact("Rebuilt onboarding.")).counts).toBe(false);
  await asA.mutation(api.sources.restore, { source: { narrativeId: beta } });
  expect(await counted()).toEqual(["Rebuilt onboarding."]);
});

test("the same words at two employers stay two facts, each with its own story; within one role they're one fact", async () => {
  const { asA, acme, beta, read, items } = await setup();
  const at = (roleKey: string, ...texts: string[]) => ({ roles: [], context: [], facts: texts.map((text) => ({ roleKey, text, quotes: [] })) });
  await read(acme, at("acme", "Rebuilt onboarding.", "Ran the night shift."));
  const nightShift = (await items()).find((i) => i.kind === "fact" && i.data.text === "Ran the night shift.")!;
  await asA.mutation(api.extract.review, { id: nightShift.id, status: "rejected", note: "Not at Acme" });
  await read(beta, at("beta", "Rebuilt onboarding.", "Ran the night shift.", "rebuilt onboarding."));
  const facts = (await items()).filter((i) => i.kind === "fact").map((f) => [f.roleKey, f.data.text, f.status, f.sources.map((s) => s.narrativeId)]);
  expect(facts).toEqual([
    ["acme", "Rebuilt onboarding.", "proposed", [acme]],
    ["acme", "Ran the night shift.", "rejected", [acme]],
    ["beta", "Rebuilt onboarding.", "proposed", [beta]],
    // A rejection at Acme is about Acme; the same line at Beta is proposed.
    ["beta", "Ran the night shift.", "proposed", [beta]],
  ]);
});

test("rejecting a narrative sets aside what's unreviewed, never as a rejection; restoring brings back only that", async () => {
  const { asA, acme, read, readAgain, fact, statusOf, counted, items } = await setup();
  await read(acme, { roles: [{ key: "acme", employer: "Acme", title: "Head of CS", quotes: [] }], context: [], facts: reply("Rebuilt onboarding.", "Cut churn by 20%.", "Ran the night shift.").facts });
  await asA.mutation(api.extract.review, { id: (await fact("Rebuilt onboarding.")).id, status: "approved" });
  await asA.mutation(api.extract.review, { id: (await fact("Ran the night shift.")).id, status: "rejected", note: "Not mine" });
  await asA.mutation(api.sources.reject, { source: { narrativeId: acme } });
  expect([await statusOf("Rebuilt onboarding."), await statusOf("Cut churn by 20%."), await statusOf("Ran the night shift.")]).toEqual(["approved", "setAside", "rejected"]);
  // Set-aside items leave the review list, and the role it proposed goes with them.
  expect((await items()).map((i) => [i.kind, i.status]).sort()).toEqual([["fact", "approved"], ["fact", "rejected"]]);
  expect(await counted()).toEqual([]);
  expect((await asA.query(api.sources.list, {})).narratives.find((n) => n.id === acme)).toMatchObject({ rejected: true, setAside: 2, approved: 1 });
  await expect(asA.mutation(api.extract.start, { narrativeId: acme })).rejects.toThrow("Restore it");
  await expect(asA.mutation(api.sources.readAgain, { source: { narrativeId: acme }, includingRejected: false })).rejects.toThrow("Restore it");
  await asA.mutation(api.sources.restore, { source: { narrativeId: acme } });
  expect([await statusOf("Rebuilt onboarding."), await statusOf("Cut churn by 20%."), await statusOf("Ran the night shift.")]).toEqual(["approved", "proposed", "rejected"]);
  expect((await items()).filter((i) => i.kind === "role").map((r) => r.status)).toEqual(["proposed"]);
  expect(await counted()).toEqual(["Rebuilt onboarding."]);
  // A later read learns only from the fact they rejected themselves.
  const prompt = await readAgain(acme, reply());
  const rejected = prompt.slice(prompt.indexOf("Facts they rejected"), prompt.indexOf("Narrative (career)"));
  expect(rejected).toContain("Not mine");
  expect(rejected).not.toContain("Cut churn by 20%.");
});

test("while a narrative is rejected, what was set aside isn't taken as a rejection by other reads", async () => {
  const { asA, acme, beta, read, statusOf, sent } = await setup();
  await read(acme, reply("Rebuilt onboarding."));
  await asA.mutation(api.sources.reject, { source: { narrativeId: acme } });
  await read(beta, reply("Rebuilt onboarding."));
  const prompt = sent[sent.length - 1];
  expect(prompt.slice(prompt.indexOf("Facts they rejected"))).not.toContain("Rebuilt onboarding.");
  // The rejected narrative isn't background either.
  expect(prompt).not.toContain("cut churn and ran the night shift");
  // Said again by a narrative that stands, the set-aside fact comes back for review with that source.
  expect(await statusOf("Rebuilt onboarding.")).toBe("proposed");
});

test("Read again repeats nothing already there and respects rejections, unless this run includes this narrative's own", async () => {
  const { asA, acme, beta, read, readAgain, fact, items } = await setup();
  await read(acme, reply("Rebuilt onboarding.", "Ran the night shift."));
  await read(beta, reply("Led the Beta launch."));
  await asA.mutation(api.extract.review, { id: (await fact("Ran the night shift.")).id, status: "rejected", note: "Not mine" });
  await asA.mutation(api.extract.review, { id: (await fact("Led the Beta launch.")).id, status: "rejected", note: "Beta was a side project" });
  const texts = async () => (await items()).filter((i) => i.kind === "fact").map((f) => [f.data.text, f.status]);
  let prompt = await readAgain(acme, reply("Rebuilt onboarding.", "Ran the night shift.", "Led the Beta launch.", "Trained the team."));
  expect(prompt).toContain("Not mine");
  expect(await texts()).toEqual([
    ["Rebuilt onboarding.", "proposed"],
    ["Ran the night shift.", "rejected"],
    ["Led the Beta launch.", "rejected"],
    ["Trained the team.", "proposed"],
  ]);
  prompt = await readAgain(acme, reply("Ran the night shift.", "Led the Beta launch."), true);
  // This narrative's rejection is looked past for this run; another narrative's still holds.
  expect(prompt).not.toContain("Not mine");
  expect(prompt).toContain("Beta was a side project");
  expect(await texts()).toEqual([
    ["Rebuilt onboarding.", "proposed"],
    ["Ran the night shift.", "rejected"],
    ["Led the Beta launch.", "rejected"],
    ["Trained the team.", "proposed"],
    ["Ran the night shift.", "proposed"],
  ]);
  // Only for that run: the next one respects it again.
  prompt = await readAgain(acme, reply());
  expect(prompt).toContain("Not mine");
});

test("sources belong to one workspace", async () => {
  const { asA, asB, acme, read } = await setup();
  await read(acme, reply("Rebuilt onboarding."));
  const [f] = await asA.query(api.extract.items, {});
  for (const act of [api.sources.reject, api.sources.restore] as const) await expect(asB.mutation(act, { source: { narrativeId: acme } })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.sources.readAgain, { source: { narrativeId: acme }, includingRejected: true })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.sources.reject, { source: { projectId: f.id } })).rejects.toThrow("Not found");
  expect(await asB.query(api.sources.list, {})).toEqual({ narratives: [], projects: {} });
  expect((await asA.query(api.sources.list, {})).narratives.map((n) => n.title)).toEqual(["Beta", "Acme"]);
  // The goals narrative isn't a source here.
  const goals = await asA.mutation(api.narratives.create, { kind: "goals", title: "", body: "Sales" });
  await expect(asA.mutation(api.sources.reject, { source: { narrativeId: goals } })).rejects.toThrow("Not found");
});

test("an insight resting only on a rejected narrative's facts is set aside with it and comes back on restore; another live fact keeps it", async () => {
  const { t, a, asA, acme, beta, read, fact } = await setup();
  await read(acme, reply("Cut churn by 20%."));
  await read(beta, reply("Led the Beta launch."));
  for (const text of ["Cut churn by 20%.", "Led the Beta launch."]) await asA.mutation(api.extract.review, { id: (await fact(text)).id, status: "approved" });
  const [churn, launch] = [(await fact("Cut churn by 20%.")).id, (await fact("Led the Beta launch.")).id];
  const [onlyAcme, both] = await t.run(async (ctx) => {
    const insight = (text: string, factIds: string[]) => ctx.db.insert("items", { workspaceId: a.w, kind: "insight", status: "proposed", data: { text, factIds }, sources: [], at: 0 });
    return [await insight("Keeps customers.", [churn]), await insight("Grows and keeps.", [churn, launch])];
  });
  const statuses = async () => (await asA.query(api.insights.list, {})).insights.map((i) => [i.id, i.status]);
  await asA.mutation(api.sources.reject, { source: { narrativeId: acme } });
  const inDb = (id: typeof onlyAcme) => t.run(async (ctx) => (await ctx.db.get(id))!.status);
  expect([await inDb(onlyAcme), await inDb(both)]).toEqual(["setAside", "proposed"]);
  expect(await statuses()).toEqual([[both, "proposed"]]);
  // Its own rejection history isn't touched: set aside, not rejected.
  await asA.mutation(api.sources.restore, { source: { narrativeId: acme } });
  expect([await inDb(onlyAcme), await inDb(both)]).toEqual(["proposed", "proposed"]);
});

test("a rejection keeps its reason, for a narrative or a project, and restoring clears it", async () => {
  const { t, a, asA, acme } = await setup();
  await asA.mutation(api.sources.reject, { source: { narrativeId: acme }, reason: "  Pasted from LinkedIn  " });
  expect(await asA.query(api.narratives.get, { id: acme })).toMatchObject({ rejected: true, rejectedBecause: "Pasted from LinkedIn" });
  expect((await asA.query(api.narratives.list, {})).find((n) => n.id === acme)).toMatchObject({ rejectedBecause: "Pasted from LinkedIn" });
  expect((await asA.query(api.sources.list, {})).narratives.find((n) => n.id === acme)).toMatchObject({ rejected: true, rejectedBecause: "Pasted from LinkedIn" });
  await asA.mutation(api.sources.restore, { source: { narrativeId: acme } });
  expect(await asA.query(api.narratives.get, { id: acme })).toMatchObject({ rejected: false, rejectedBecause: null });
  // Without a reason, none is kept.
  await asA.mutation(api.sources.reject, { source: { narrativeId: acme } });
  expect(await asA.query(api.narratives.get, { id: acme })).toMatchObject({ rejected: true, rejectedBecause: null });

  const projectId = await t.run((ctx) => ctx.db.insert("items", { workspaceId: a.w, kind: "project", status: "approved", projectKey: "github:a/b", data: { name: "B", repo: "a/b", url: "u" }, sources: [], at: 0 }));
  await asA.mutation(api.sources.reject, { source: { projectId }, reason: "Still building it" });
  expect(await t.run((ctx) => ctx.db.get(projectId))).toMatchObject({ status: "rejected", data: { rejectedBecause: "Still building it" } });
});
