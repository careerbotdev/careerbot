import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { present, toPlain } from "./resumeDoc";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (o: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "88".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

// Acme (Head of CS) with two approved facts; Trail, an approved project not yet linked, with two approved facts and one
// awaiting review. Workspace b has its own role and fact.
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
      for (const task of ["sameWork", "resume"] as const) await ctx.db.insert("aiSettings", { workspaceId: w, task, model: "test/model" });
      await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "acme", data: { employer: "Acme", title: "Head of CS", start: "2021-01" }, sources: [], at: 0 });
      ids.push({ u, w });
    }
    return ids;
  });
  const fact = (w: Id<"workspaces">, text: string, where: { roleKey?: string; projectKey?: string }, status: "approved" | "proposed" = "approved") =>
    t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status, ...where, data: { text }, sources: [], at: 0 }));
  const project = await t.run((ctx) =>
    ctx.db.insert("items", { workspaceId: a.w, kind: "project", status: "approved", projectKey: "github:octo/trail", data: { name: "Trail", repo: "octo/trail", url: "https://github.com/octo/trail" }, sources: [], at: 0 }),
  );
  const trail = { projectKey: "github:octo/trail" };
  const f = {
    r1: await fact(a.w, "Led the search rebuild at Acme, cutting search time by half.", { roleKey: "acme" }),
    r2: await fact(a.w, "Launched the self-serve portal to 300 accounts.", { roleKey: "acme" }),
    p1: await fact(a.w, "Built trail search for 3,000 trailheads.", trail),
    p2: await fact(a.w, "Shipped the first release to 300 hikers.", trail),
    p3: await fact(a.w, "Wrote the contributor guide.", trail, "proposed"),
    other: await fact(b.w, "Ran the B team.", { roleKey: "acme" }),
  };
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  // Runs what's scheduled; a same-work search replies `pairs`, a resume run `resume`. Returns what each was sent.
  const run = async (replies: { pairs?: unknown[]; resume?: unknown }) => {
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { messages: { content: string }[] };
        const user = body.messages[1].content;
        sent.push(user);
        return reply(body.messages[0].content.includes("facts of one software project") ? { pairs: replies.pairs ?? [] } : replies.resume);
      }),
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return sent;
  };
  const get = (id: Id<"items">) =>
    t.run(async (ctx) => {
      const i = await ctx.db.get(id);
      if (!i || i.kind !== "fact") throw new Error("Gone.");
      return i.data;
    });
  return { t, asA, asB, project, f, run, get };
}

test("linking a project suggests pairs of its approved facts and its role's, only within the workspace; Connect and Keep separate settle them", async () => {
  const { asA, asB, project, f, run, get } = await setup();
  await asA.mutation(api.projects.link, { id: project, roleKey: "acme" });
  const sent = await run({
    pairs: [
      { projectFactId: f.p1, roleFactId: f.r1, richer: f.r1 },
      { projectFactId: f.p2, roleFactId: f.r2, richer: "made up" },
      // A fact awaiting review, a fact used twice and another workspace's fact are never paired.
      { projectFactId: f.p3, roleFactId: f.r2 },
      { projectFactId: f.p1, roleFactId: f.r2 },
      { projectFactId: f.p2, roleFactId: f.other },
    ],
  });
  // It reads only approved facts of this project and its role.
  expect(sent).toHaveLength(1);
  for (const id of [f.p1, f.p2, f.r1, f.r2]) expect(sent[0]).toContain(id);
  for (const id of [f.p3, f.other]) expect(sent[0]).not.toContain(id);
  expect((await get(f.p1)).sameWorkAs).toEqual({ factId: f.r1, lead: f.r1 });
  // With no richer fact named, the longer one leads.
  expect((await get(f.p2)).sameWorkAs).toEqual({ factId: f.r2, lead: f.r2 });
  expect((await get(f.p3)).sameWorkAs).toBeUndefined();

  // Another workspace can't settle or start them.
  await expect(asB.mutation(api.sameWork.connect, { id: f.p1 })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.sameWork.keepSeparate, { id: f.p1 })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.sameWork.start, { id: project })).rejects.toThrow("Not found");
  expect(await asB.query(api.sameWork.last, {})).toEqual({});

  // Connect links both facts; their text is untouched.
  await asA.mutation(api.sameWork.connect, { id: f.p1 });
  expect(await get(f.p1)).toEqual({ text: "Built trail search for 3,000 trailheads.", sameWork: { factId: f.r1, lead: f.r1 } });
  expect(await get(f.r1)).toEqual({ text: "Led the search rebuild at Acme, cutting search time by half.", sameWork: { factId: f.p1, lead: f.r1 } });
  await expect(asA.mutation(api.sameWork.connect, { id: f.p1 })).rejects.toThrow("Not a suggestion");

  // Keep separate: the suggestion goes and a later search never suggests that pair again.
  await asA.mutation(api.sameWork.keepSeparate, { id: f.p2 });
  expect(await get(f.p2)).toEqual({ text: "Shipped the first release to 300 hikers.", keptSeparate: [f.r2] });
  await asA.mutation(api.sameWork.start, { id: project });
  const again = await run({ pairs: [{ projectFactId: f.p2, roleFactId: f.r2 }, { projectFactId: f.p1, roleFactId: f.r2 }] });
  // Connected facts aren't offered again; the separate pair is named as separate.
  expect(again[0]).not.toContain(f.p1);
  expect(again[0]).not.toContain(f.r1);
  expect(again[0]).toContain(`["${f.p2}","${f.r2}"]`);
  expect((await get(f.p2)).sameWorkAs).toBeUndefined();
  expect((await get(f.p1)).sameWork).toEqual({ factId: f.r1, lead: f.r1 });
  expect(await asA.query(api.sameWork.last, {})).toEqual({ "github:octo/trail": { status: "done", error: null } });
});

test("relinking or unlinking drops waiting suggestions; a project must be approved and linked to look", async () => {
  const { t, asA, project, f, run, get } = await setup();
  await asA.mutation(api.projects.link, { id: project, roleKey: "acme" });
  await run({ pairs: [{ projectFactId: f.p1, roleFactId: f.r1 }] });
  expect((await get(f.p1)).sameWorkAs).toEqual({ factId: f.r1, lead: f.r1 });
  await asA.mutation(api.projects.link, { id: project, roleKey: null });
  expect((await get(f.p1)).sameWorkAs).toBeUndefined();
  await expect(asA.mutation(api.sameWork.start, { id: project })).rejects.toThrow("Link this project to a role first");
  await t.run((ctx) => ctx.db.patch(project, { status: "proposed" }));
  expect(await run({})).toEqual([]);
  await asA.mutation(api.projects.link, { id: project, roleKey: "acme" });
  // Not approved: linking looks for nothing.
  expect(await run({})).toEqual([]);
});

test("resumes write a connected pair once, from the lead, resting on both; the project shows inside its role", async () => {
  const { asA, project, f, run } = await setup();
  await asA.mutation(api.projects.link, { id: project, roleKey: "acme" });
  await run({ pairs: [{ projectFactId: f.p1, roleFactId: f.r1, richer: f.r1 }] });
  await asA.mutation(api.sameWork.connect, { id: f.p1 });
  await asA.mutation(api.resume.start, {});
  const sent = await run({
    resume: {
      summary: "S",
      experience: [{ roleKey: "acme", bullets: [{ text: "Rebuilt search, halving search time.", factIds: [f.r1] }, { text: "Launched the portal.", factIds: [f.r2] }] }],
      // The model tells the connected work again under the project anyway.
      projects: [{ projectKey: "github:octo/trail", bullets: [{ text: "Built map search.", factIds: [f.p1] }, { text: "Shipped to 300 hikers.", factIds: [f.p2] }] }],
      skills: [],
    },
  });
  // The writer gets the lead with the other's words as context, and not the other on its own.
  const record = JSON.parse(sent[0].slice(sent[0].indexOf("{"))) as { facts: { id: string; text: string; sameWork?: string }[]; projects: { roleKey?: string }[] };
  expect(record.facts.find((x) => x.id === f.r1)?.sameWork).toBe("Built trail search for 3,000 trailheads.");
  expect(record.facts.some((x) => x.id === f.p1)).toBe(false);
  expect(record.projects).toMatchObject([{ roleKey: "acme" }]);

  const data = await asA.query(api.resume.list, {});
  const v1 = data.versions[0];
  expect(v1.doc!.experience[0].bullets[0]).toEqual({ text: "Rebuilt search, halving search time.", factIds: [f.r1, f.p1] });
  const shown = present(v1.doc!, data.settings, v1.layout);
  expect(shown.experience.map((e) => [e.roleKey, e.bullets.map((b) => b.text), (e.projects ?? []).map((p) => [p.name, p.bullets.map((b) => b.text)])])).toEqual([
    ["acme", ["Rebuilt search, halving search time.", "Launched the portal."], [["Trail", ["Shipped to 300 hikers."]]]],
  ]);
  expect(shown.projects).toEqual([]);
  expect(toPlain(shown)).toContain("- Launched the portal.\nProject: Trail · github.com/octo/trail\n- Shipped to 300 hikers.");

  // Unlinked, the project moves to Projects on the same version, and the pair no longer holds.
  await asA.mutation(api.projects.link, { id: project, roleKey: null });
  const after = await asA.query(api.resume.list, {});
  const unlinked = present(after.versions[0].doc!, after.settings, after.versions[0].layout);
  expect(unlinked.experience[0].projects).toBeUndefined();
  expect(unlinked.projects!.map((p) => [p.name, p.bullets.map((b) => b.text)])).toEqual([["Trail", ["Built map search.", "Shipped to 300 hikers."]]]);
  expect(after.versions[0].doc!.experience[0].bullets[0].factIds).toEqual([f.r1]);
});

test("Disconnect unlinks the pair on both facts, keeps it separate, and resumes show both lines again without a rewrite", async () => {
  const { asA, asB, project, f, run, get } = await setup();
  await asA.mutation(api.projects.link, { id: project, roleKey: "acme" });
  await run({ pairs: [] });
  // A version written before they connected anything: the work told in the role and in the project.
  await asA.mutation(api.resume.start, {});
  await run({
    resume: {
      summary: "S",
      experience: [{ roleKey: "acme", bullets: [{ text: "Rebuilt search.", factIds: [f.r1] }] }],
      projects: [{ projectKey: "github:octo/trail", bullets: [{ text: "Built map search.", factIds: [f.p1] }] }],
      skills: [],
    },
  });
  const lines = async () => {
    const d = await asA.query(api.resume.list, {});
    const shown = present(d.versions[0].doc!, d.settings, d.versions[0].layout);
    return shown.experience.flatMap((e) => [...e.bullets, ...(e.projects ?? []).flatMap((p) => p.bullets)]).map((b) => [b.text, b.factIds]);
  };
  await asA.mutation(api.sameWork.start, { id: project });
  await run({ pairs: [{ projectFactId: f.p1, roleFactId: f.r1, richer: f.r1 }] });
  await asA.mutation(api.sameWork.connect, { id: f.p1 });
  // Connected, the work shows once: the lead's line, resting on both.
  expect(await lines()).toEqual([["Rebuilt search.", [f.r1, f.p1]]]);

  // Another workspace can't; either side disconnects.
  await expect(asB.mutation(api.sameWork.disconnect, { id: f.r1 })).rejects.toThrow("Not found");
  await asA.mutation(api.sameWork.disconnect, { id: f.r1 });
  expect(await get(f.r1)).toEqual({ text: "Led the search rebuild at Acme, cutting search time by half." });
  expect(await get(f.p1)).toEqual({ text: "Built trail search for 3,000 trailheads.", keptSeparate: [f.r1] });
  await expect(asA.mutation(api.sameWork.disconnect, { id: f.p1 })).rejects.toThrow("Not connected");
  expect(await lines()).toEqual([
    ["Rebuilt search.", [f.r1]],
    ["Built map search.", [f.p1]],
  ]);
  // Never suggested again.
  await asA.mutation(api.sameWork.start, { id: project });
  await run({ pairs: [{ projectFactId: f.p1, roleFactId: f.r1 }] });
  expect((await get(f.p1)).sameWorkAs).toBeUndefined();
});
