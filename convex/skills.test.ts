import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "88".repeat(32);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

// Acme (approved) lists a skill and two tools; Beta (still proposed) lists a tool; Trail is an approved project with a
// fact; "Excel" was rejected.
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
      for (const task of ["skills", "resume"] as const) await ctx.db.insert("aiSettings", { workspaceId: w, task, model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const w = a.w;
  const ids = await t.run(async (ctx) => {
    const base = { workspaceId: w, sources: [], at: 0 };
    await ctx.db.insert("items", { ...base, kind: "role", status: "approved", roleKey: "acme", data: { employer: "Acme", title: "Head of CS", start: "2021-01", skills: ["Onboarding"], tools: ["SFDC", "Dashboards"] } });
    await ctx.db.insert("items", { ...base, kind: "role", status: "proposed", roleKey: "beta", data: { employer: "Beta", title: "CSM", start: "2018-01", end: "2020-12", tools: ["Figma"] } });
    await ctx.db.insert("items", { ...base, kind: "project", status: "approved", projectKey: "github:octo/trail", data: { name: "Trail", repo: "octo/trail", url: "https://github.com/octo/trail", stack: ["TypeScript"] } });
    const roleFact = await ctx.db.insert("items", { ...base, kind: "fact", status: "approved", roleKey: "acme", data: { text: "Cut churn by 20%." } });
    const trailFact = await ctx.db.insert("items", { ...base, kind: "fact", status: "approved", projectKey: "github:octo/trail", data: { text: "Built Trail in TypeScript." } });
    const excel = await ctx.db.insert("items", { ...base, kind: "tool", status: "rejected", data: { name: "Excel", from: { roles: ["acme"], projects: [], facts: [] }, rejectedBecause: "Everyone has it" } });
    return { roleFact, trailFact, excel };
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  // Runs what's scheduled with the model replying `content`; returns what the model was sent.
  const run = async (content: unknown) => {
    const f = vi.fn(async () => reply(content));
    vi.stubGlobal("fetch", f);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).messages[1].content as string);
  };
  const list = async () => (await asA.query(api.skills.list, {})).items;
  const byName = async (name: string) => (await list()).find((i) => i.name === name)!;
  return { t, asA, asB, w, run, list, byName, ...ids };
}

test("a role's skills and tools become proposed items once, one per name, from approved roles only", async () => {
  const { t, w, list } = await setup();
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "globex", data: { employer: "Globex", title: "Analyst", tools: ["sfdc ", "Excel"] }, sources: [], at: 0 }));
  expect(await t.mutation(internal.skills.migrate, {})).toEqual({ added: 3 });
  const rows = (await list()).map((i) => [i.kind, i.name, i.status, i.sources.map((s) => `${s.title}, ${s.employer}`)]);
  expect(rows).toEqual([
    ["tool", "Excel", "rejected", ["Head of CS, Acme"]],
    ["skill", "Onboarding", "proposed", ["Head of CS, Acme"]],
    ["tool", "SFDC", "proposed", ["Head of CS, Acme", "Analyst, Globex"]],
    ["tool", "Dashboards", "proposed", ["Head of CS, Acme"]],
  ]);
  // Again: nothing new.
  expect(await t.mutation(internal.skills.migrate, {})).toEqual({ added: 0 });
});

test("gathering names each skill once with where the record shows it, flags vague ones and near-duplicates, and never brings back a rejected one", async () => {
  const { t, asA, asB, run, list, byName, roleFact, trailFact, excel } = await setup();
  await t.mutation(internal.skills.migrate, {});
  const onboarding = await byName("Onboarding");
  await asA.mutation(api.extract.review, { id: onboarding.id, status: "approved" });
  const sfdc = await byName("SFDC");
  await expect(asB.mutation(api.skills.start, {})).resolves.not.toBeNull();
  await asA.mutation(api.skills.start, {});
  const [sent] = await run({
    items: [
      { id: sfdc.id, kind: "tool", name: "Salesforce", group: "CRM", from: { roles: ["acme"] } },
      { kind: "tool", name: "dashboards", group: "Analytics", lowValue: "Too vague to stand out.", from: { roles: ["acme"] } },
      { name: "TypeScript", group: "Languages", from: { projects: ["github:octo/trail"], facts: [trailFact] } },
      { kind: "tool", name: "excel", from: { roles: ["acme"] } },
      { id: excel, kind: "tool", name: "MS Excel", from: { roles: ["acme"] } },
      { kind: "skill", name: "Customer onboarding", group: "Customer success", from: { roles: ["acme"] }, sameAs: onboarding.id },
      { kind: "tool", name: "Figma", from: { roles: ["beta"] } },
      { kind: "skill", name: "Invented", from: { roles: ["ghost"], facts: ["nope"] } },
      { id: onboarding.id, kind: "skill", name: "Onboarding at scale", from: { facts: [roleFact] } },
    ],
  });
  // It read the approved record only (not the proposed role), with what's settled, waiting and rejected.
  expect(sent).toContain("TypeScript");
  expect(sent).not.toContain("Figma");
  expect(sent).toContain("Everyone has it");
  const rows = (await list()).filter((i) => i.status !== "rejected").map((i) => [i.kind, i.name, i.status, i.group, i.lowValue, i.sameAs?.name ?? null, i.sources.map((s) => [s.title, s.facts]), i.facts.map((f) => f.text)]);
  expect(rows).toEqual([
    ["skill", "Onboarding", "approved", null, null, null, [["Head of CS", 1]], ["Cut churn by 20%."]],
    ["tool", "Salesforce", "proposed", "CRM", null, null, [["Head of CS", 0]], []],
    ["tool", "dashboards", "proposed", "Analytics", "Too vague to stand out.", null, [["Head of CS", 0]], []],
    ["tool", "TypeScript", "proposed", "Languages", null, null, [["Trail", 1]], ["Built Trail in TypeScript."]],
    ["skill", "Customer onboarding", "proposed", "Customer success", null, "Onboarding", [["Head of CS", 0]], []],
  ]);
  expect((await list()).filter((i) => i.status === "rejected").map((i) => i.name)).toEqual(["Excel"]);
  // The other workspace's run saw nothing of this one's.
  expect((await asB.query(api.skills.list, {})).items).toEqual([]);

  // Merge keeps one name, approved, with where both were found; the other is gone from the list.
  const customer = await byName("Customer onboarding");
  await expect(asB.mutation(api.skills.merge, { id: customer.id, keep: "other" })).rejects.toThrow("Not found");
  await asA.mutation(api.skills.merge, { id: customer.id, keep: "other" });
  expect((await list()).map((i) => i.name)).not.toContain("Customer onboarding");
  expect(await byName("Onboarding")).toMatchObject({ status: "approved", sources: [{ title: "Head of CS" }], merged: [{ id: customer.id, name: "Customer onboarding" }] });
  // Undo from the kept one's merged list: both are back as they were, the flag too.
  await asA.mutation(api.skills.unmerge, { id: customer.id });
  expect((await byName("Customer onboarding")).sameAs?.name).toBe("Onboarding");
  expect((await byName("Onboarding")).merged).toEqual([]);
  await asA.mutation(api.skills.merge, { id: customer.id, keep: "other" });

  // A rename is approved as given; a rejection is never proposed again, in any spelling.
  await asA.mutation(api.skills.edit, { id: (await byName("TypeScript")).id, name: "TypeScript", group: "Languages", kind: "tool" });
  await asA.mutation(api.extract.review, { id: (await byName("dashboards")).id, status: "rejected", note: "Says nothing" });
  await asA.mutation(api.skills.start, {});
  const [again] = await run({ items: [{ kind: "tool", name: "Dashboards ", from: { roles: ["acme"] } }, { kind: "tool", name: "Salesforce", sameAs: "TypeScript", from: { roles: ["acme"] } }] });
  expect(again).toContain("Says nothing");
  const after = await list();
  expect(after.filter((i) => i.name.toLowerCase().startsWith("dashboards")).map((i) => i.status)).toEqual(["rejected"]);
  expect(after.find((i) => i.name === "TypeScript")).toMatchObject({ status: "approved", edited: true });
  expect(after.find((i) => i.name === "Salesforce")!.sameAs?.name).toBe("TypeScript");
  // Keep both: never offered as the same again.
  const salesforce = await byName("Salesforce");
  await asA.mutation(api.skills.keepApart, { id: salesforce.id, reason: "Different things" });
  expect((await byName("TypeScript")).apart).toEqual([{ id: salesforce.id, name: "Salesforce", reason: "Different things" }]);
  await asA.mutation(api.skills.start, {});
  await run({ items: [{ kind: "tool", name: "Salesforce", sameAs: "TypeScript", from: { roles: ["acme"] } }] });
  expect((await byName("Salesforce")).sameAs).toBeNull();
});

test("a certification says who issued it and when it was earned; filing one under a group or kind decides nothing", async () => {
  const { t, asA, asB, run, byName } = await setup();
  await t.mutation(internal.skills.migrate, {});
  await asA.mutation(api.skills.start, {});
  await run({
    items: [
      { kind: "certification", name: "PMP", issuer: "PMI", earned: "2019-04", from: { roles: ["acme"] } },
      { kind: "certification", name: "CSM cert", issuer: "Scrum Alliance", earned: "last year", from: { roles: ["acme"] } },
      { kind: "skill", name: "Onboarding customers", from: { roles: ["acme"] }, sameAs: "Onboarding", sameWhy: "Both are bringing customers on." },
      { kind: "tool", name: "Zendesk", issuer: "Zendesk Inc", from: { roles: ["acme"] } },
    ],
  });
  expect(await byName("PMP")).toMatchObject({ kind: "certification", issuer: "PMI", earned: "2019-04" });
  // A month that isn't one is left out; a tool has no issuer.
  expect(await byName("CSM cert")).toMatchObject({ issuer: "Scrum Alliance", earned: null });
  expect(await byName("Zendesk")).toMatchObject({ issuer: null });
  expect((await byName("Onboarding customers")).sameAs).toMatchObject({ name: "Onboarding", why: "Both are bringing customers on." });

  const cert = await byName("CSM cert");
  await expect(asA.mutation(api.skills.edit, { id: cert.id, name: "CSM", kind: "certification", earned: "2020" })).rejects.toThrow("YYYY-MM");
  await asA.mutation(api.skills.edit, { id: cert.id, name: "Certified ScrumMaster", group: "Agile", kind: "certification", earned: "2020-06" });
  expect(await byName("Certified ScrumMaster")).toMatchObject({ status: "approved", issuer: "Scrum Alliance", earned: "2020-06", group: "Agile" });
  await asA.mutation(api.skills.edit, { id: cert.id, name: "Certified ScrumMaster", kind: "certification", issuer: " ", earned: "" });
  expect(await byName("Certified ScrumMaster")).toMatchObject({ issuer: null, earned: null });

  // Filing: the group and kind change, the decision doesn't; leaving certifications drops issuer and date.
  const [pmp, sfdc] = [await byName("PMP"), await byName("SFDC")];
  await expect(asB.mutation(api.skills.classify, { ids: [pmp.id], group: "X" })).rejects.toThrow("Not found");
  await asA.mutation(api.skills.classify, { ids: [pmp.id, sfdc.id], group: " Delivery " });
  expect([await byName("PMP"), await byName("SFDC")].map((i) => [i.status, i.group, i.kind])).toEqual([
    ["proposed", "Delivery", "certification"],
    ["proposed", "Delivery", "tool"],
  ]);
  await asA.mutation(api.skills.classify, { ids: [pmp.id], kind: "skill" });
  expect(await byName("PMP")).toMatchObject({ kind: "skill", group: "Delivery", issuer: null, earned: null, status: "proposed" });
  await asA.mutation(api.skills.classify, { ids: [pmp.id], group: "" });
  expect((await byName("PMP")).group).toBeNull();
});

test("each one says how many resumes show it, which ones, and what it waits on while its sources are rejected", async () => {
  const { t, asA, asB, w, run, byName, roleFact } = await setup();
  await t.mutation(internal.skills.migrate, {});
  const sfdc = await byName("SFDC");
  await asA.mutation(api.extract.review, { id: sfdc.id, status: "approved" });
  expect(await asA.query(api.skills.onResumes, { id: sfdc.id })).toEqual([]);
  await asA.mutation(api.resume.start, {});
  await run({ summary: "S", experience: [{ roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [roleFact] }] }], skills: [{ group: "Tools", items: [sfdc.id] }] });
  expect((await byName("SFDC")).resumes).toBe(1);
  const [base] = await asA.query(api.skills.onResumes, { id: sfdc.id });
  expect(base).toMatchObject({ key: "base", kind: "base", name: "Base resume", state: "upToDate", shown: true, skills: [{ group: "Tools", items: [{ text: "SFDC", key: sfdc.id }] }] });
  await expect(asB.query(api.skills.onResumes, { id: sfdc.id })).resolves.toEqual([]);

  // Left out on the record: still listed there, not shown, not counted.
  await asA.mutation(api.resume.setSkillPresentation, { key: sfdc.id, hidden: true });
  expect((await byName("SFDC")).resumes).toBe(0);
  expect((await asA.query(api.skills.onResumes, { id: sfdc.id }))[0]).toMatchObject({ shown: false });

  // Its only role rejected: it no longer counts, and says what it waits on.
  expect((await byName("SFDC")).blockedBy).toEqual([]);
  await t.run(async (ctx) => {
    const acme = (await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", w).eq("kind", "role").eq("status", "approved")).collect()).find((r) => r.roleKey === "acme")!;
    await ctx.db.patch(acme._id, { status: "rejected" });
  });
  expect(await byName("SFDC")).toMatchObject({ counts: false, blockedBy: ["Head of CS"] });
});

test("resumes list only approved skills, each shown or left out on the record and per resume", async () => {
  const { t, asA, asB, w, run, byName, roleFact } = await setup();
  await t.mutation(internal.skills.migrate, {});
  for (const name of ["Onboarding", "SFDC"]) await asA.mutation(api.extract.review, { id: (await byName(name)).id, status: "approved" });
  const [onboarding, sfdc, dashboards] = [await byName("Onboarding"), await byName("SFDC"), await byName("Dashboards")];
  await asA.mutation(api.resume.start, {});
  const [sent] = await run({
    summary: "S",
    experience: [{ roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [roleFact] }] }],
    skills: [{ group: "Skills", items: [onboarding.id, "sfdc", dashboards.id, "Made up"] }],
  });
  // The writer gets approved skills only; the roles' own lists don't go in.
  expect(sent).toContain('"name":"SFDC"');
  expect(sent).not.toContain("Dashboards");
  const version = async () => (await asA.query(api.resume.list, {})).versions[0];
  const v1 = await version();
  expect(v1.doc!.skills).toEqual([{ group: "Skills", items: ["Onboarding", "SFDC"], keys: [onboarding.id, sfdc.id] }]);

  // Left out on the record: gone from every resume's text; one resume can show it anyway, then follow the record again.
  await expect(asB.mutation(api.resume.setSkillPresentation, { key: sfdc.id, hidden: true })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.resume.setSkillPresentation, { key: dashboards.id, hidden: true })).rejects.toThrow("Not found");
  await asA.mutation(api.resume.setSkillPresentation, { key: sfdc.id, hidden: true });
  expect((await version()).text).toContain("Skills: Onboarding");
  expect((await version()).text).not.toContain("SFDC");
  await expect(asB.mutation(api.resume.setSkill, { id: v1.id, key: sfdc.id, hidden: false })).rejects.toThrow("Not found");
  await asA.mutation(api.resume.setSkill, { id: v1.id, key: sfdc.id, hidden: false });
  expect((await version()).text).toContain("Skills: Onboarding, SFDC");
  await asA.mutation(api.resume.setSkill, { id: v1.id, key: sfdc.id, hidden: null });
  expect((await version()).layout.skills).toBeUndefined();
  expect((await version()).text).not.toContain("SFDC");

  // A skill approved since shows as a change under the resume.
  await asA.mutation(api.extract.review, { id: dashboards.id, status: "approved" });
  expect((await asA.query(api.resume.updates, {})).map((u) => u.summary)).toEqual(["1 new skill (Dashboards)"]);
  expect(await t.run(async (ctx) => (await ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", w)).unique())?.skills)).toEqual([{ key: sfdc.id, hidden: true }]);
});

test("merging moves a resume's skill line and left-out choices to the kept item", async () => {
  const { t, asA, w, run, byName, roleFact } = await setup();
  await t.mutation(internal.skills.migrate, {});
  const sfdc = await byName("SFDC");
  await asA.mutation(api.extract.review, { id: sfdc.id, status: "approved" });
  await asA.mutation(api.resume.start, {});
  await run({ summary: "S", experience: [{ roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [roleFact] }] }], skills: [{ group: "Tools", items: [sfdc.id] }] });
  const v1 = (await asA.query(api.resume.list, {})).versions[0];
  await asA.mutation(api.resume.setSkillPresentation, { key: sfdc.id, hidden: true });
  await asA.mutation(api.skills.start, {});
  await run({ items: [{ kind: "tool", name: "Salesforce", group: "CRM", from: { roles: ["acme"] }, sameAs: sfdc.id }] });
  const salesforce = await byName("Salesforce");
  await asA.mutation(api.skills.merge, { id: salesforce.id, keep: "this" });
  const resume = await t.run((ctx) => ctx.db.get(v1.id as Id<"resumes">));
  expect(resume!.doc!.skills).toEqual([{ group: "Tools", items: ["SFDC"], keys: [salesforce.id] }]);
  expect(await t.run(async (ctx) => (await ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", w)).unique())?.skills)).toEqual([{ key: salesforce.id, hidden: true }]);
});
