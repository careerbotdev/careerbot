import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { arrange, present, toPlain } from "./resumeDoc";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const reply = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost: 0.001 } });

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "77".repeat(32);
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
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "resume", model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const w = a.w;
  const [acmeFact, globexFact] = await t.run(async (ctx) => {
    const role = (roleKey: string, data: { employer: string; title: string; start: string; end?: string; marketTitle?: string }) =>
      ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey, data, sources: [], at: 0 });
    await role("acme", { employer: "Acme", title: "Head of CS", start: "2021-01" });
    await role("globex", { employer: "Globex", title: "Implementation Manager", start: "2016-01", end: "2019-05", marketTitle: "Onboarding Lead" });
    const fact = (roleKey: string, text: string) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey, data: { text }, sources: [], at: 0 });
    return [await fact("acme", "Cut churn by 20%."), await fact("globex", "Ran 40 implementations.")];
  });
  const resumeReply = (summary: string) => ({
    summary,
    experience: [
      { roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [acmeFact] }] },
      { roleKey: "globex", bullets: [{ text: "Ran 40 implementations.", factIds: [globexFact] }] },
    ],
    skills: [],
  });
  const write = async (content: unknown, args: { directionId?: Id<"items">; posting?: string } = {}) => {
    const f = vi.fn(async () => reply(content));
    vi.stubGlobal("fetch", f);
    await asA.mutation(api.resume.start, args);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { messages: { content: string }[] };
  };
  // Runs what's scheduled with the model replying `content`.
  const settle = async (content: unknown) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(content)));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  return { t, asA, asB, w, write, settle, resumeReply, acmeFact, globexFact };
}

test("folds and breaks are set on the record for every resume: workspace-checked, judged among approved roles by date", async () => {
  const { t, asA, asB, write, resumeReply } = await setup();
  await expect(asB.mutation(api.resume.setPresentation, { roleKey: "globex", hidden: true })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.resume.setPresentation, { roleKey: "ghost", hidden: true })).rejects.toThrow("Not found");
  // Acme is the most recent role: nothing after it to fold into.
  await expect(asA.mutation(api.resume.setPresentation, { roleKey: "acme", fold: { into: "next", bullets: "move" } })).rejects.toThrow("no role on that side");
  await asA.mutation(api.resume.setPresentation, { roleKey: "globex", fold: { into: "next", bullets: "drop" } });
  expect(await asA.query(api.resume.presentation, {})).toEqual({ roles: [{ roleKey: "globex", fold: { into: "next", bullets: "drop" } }], projects: [], skills: [], length: "two" });
  expect(await asB.query(api.resume.presentation, {})).toEqual({ roles: [], projects: [], skills: [], length: "two" });
  // A base title choice on the same role is kept when the record's placement changes, and the other way round.
  await write(resumeReply("v1"));
  const base = (await asA.query(api.resume.list, {})).versions[0];
  await asA.mutation(api.resume.setRole, { id: base.id, role: { roleKey: "globex", title: "both", translated: "Onboarding Lead" } });
  await asA.mutation(api.resume.setPresentation, { roleKey: "globex", fold: { into: "next", bullets: "move" } });
  const data = await asA.query(api.resume.list, {});
  expect(data.settings).toEqual({ roles: [{ roleKey: "globex", title: "both", translated: "Onboarding Lead", fold: { into: "next", bullets: "move" } }], projects: [], skills: [] });
  expect(data.versions[0].layout).toEqual({ roles: [] });
  expect(present(data.versions[0].doc!, data.settings, data.versions[0].layout).experience.map((e) => [e.title, e.start, e.bullets.length])).toEqual([["Head of CS", "2016-01", 2]]);
  await asA.mutation(api.resume.setPresentation, { roleKey: "globex" });
  expect(await asA.query(api.resume.presentation, {})).toEqual({ roles: [], projects: [], skills: [], length: "two" });
  // The written resume is untouched.
  expect((await t.run((ctx) => ctx.db.get(base.id)))!.doc!.experience[1].title).toBe("Implementation Manager");
});

test("a base resume overrides the record's folds in its own layout, titles go to the settings, and a new version keeps the overrides", async () => {
  const { asA, write, resumeReply } = await setup();
  await write(resumeReply("v1"));
  const first = (await asA.query(api.resume.list, {})).versions[0];
  await expect(asA.mutation(api.resume.setRole, { id: first.id, role: { roleKey: "acme", fold: { into: "next", bullets: "move" } } })).rejects.toThrow("no role on that side");
  await expect(asA.mutation(api.resume.setRole, { id: first.id, role: { roleKey: "acme", title: "translated" } })).rejects.toThrow("Type the title");
  await asA.mutation(api.resume.setPresentation, { roleKey: "globex", fold: { into: "next", bullets: "move" } });
  // This base resume unfolds Globex and gives it a title.
  await asA.mutation(api.resume.setRole, { id: first.id, role: { roleKey: "globex", fold: null, title: "translated", translated: " Onboarding Lead " } });
  let data = await asA.query(api.resume.list, {});
  expect(data.versions[0].layout).toEqual({ roles: [{ roleKey: "globex", fold: null }] });
  expect(data.settings.roles).toEqual([{ roleKey: "globex", fold: { into: "next", bullets: "move" }, title: "translated", translated: "Onboarding Lead" }]);
  expect(data.titles.suggested).toEqual({ globex: { text: "Onboarding Lead", from: "record" } });
  await write(resumeReply("v2"));
  data = await asA.query(api.resume.list, {});
  expect(data.versions.map((v) => v.layout)).toEqual([{ roles: [{ roleKey: "globex", fold: null }] }, { roles: [{ roleKey: "globex", fold: null }] }]);
  expect(present(data.versions[0].doc!, data.settings, data.versions[0].layout).experience.map((e) => e.title)).toEqual(["Head of CS", "Onboarding Lead"]);
  // Use record setting: the override goes and the record's fold applies again; the title stays.
  await asA.mutation(api.resume.setRole, { id: data.versions[0].id, role: { roleKey: "globex", title: "translated", translated: "Onboarding Lead" } });
  data = await asA.query(api.resume.list, {});
  expect(data.versions[0].layout).toEqual({ roles: [] });
  expect(present(data.versions[0].doc!, data.settings, data.versions[0].layout).experience.map((e) => [e.title, e.start])).toEqual([["Head of CS", "2016-01"]]);
});

test("direction and tailored resumes follow the record's folds (not the base resume's overrides) and the base titles, unless they override a role", async () => {
  const { t, asA, w, write, resumeReply } = await setup();
  const directionId = await t.run((ctx) =>
    ctx.db.insert("items", {
      workspaceId: w,
      kind: "direction",
      status: "approved",
      data: { name: "Customer Success", detail: { positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [{ from: "Implementation Manager", to: "Senior CSM" }] }, detailStatus: "approved" },
      sources: [],
      at: 0,
    }),
  );
  await write(resumeReply("Base"));
  const base = (await asA.query(api.resume.list, {})).versions[0];
  await asA.mutation(api.resume.setPresentation, { roleKey: "globex", fold: { into: "next", bullets: "move" } });
  // The base resume unfolds Globex and translates Acme's title.
  await asA.mutation(api.resume.setRole, { id: base.id, role: { roleKey: "globex", fold: null } });
  await asA.mutation(api.resume.setRole, { id: base.id, role: { roleKey: "acme", title: "translated", translated: "VP Customer Success" } });
  await write(resumeReply("Direction"), { directionId });
  let data = await asA.query(api.resume.list, { directionId });
  const dir = data.versions[0];
  const shown = (layout: typeof dir.layout) => present(dir.doc!, data.settings, layout).experience.map((e) => [e.title, e.start ?? null, e.bullets.length]);
  expect(data.titles.suggested.globex).toEqual({ text: "Senior CSM", from: "direction" });
  // Inherited from the record (folded) and the base titles, with nothing stored here.
  expect(dir.layout).toEqual({ roles: [] });
  expect(shown(dir.layout)).toEqual([["VP Customer Success", "2016-01", 2]]);
  // Overridden here: not folded, with the direction's title.
  await asA.mutation(api.resume.setRole, { id: dir.id, role: { roleKey: "globex", fold: null, title: "both", translated: "Senior CSM", source: "direction" } });
  data = await asA.query(api.resume.list, { directionId });
  expect(shown(data.versions[0].layout)).toEqual([
    ["VP Customer Success", "2021-01", 1],
    ["Senior CSM (official: Implementation Manager)", "2016-01", 1],
  ]);
  // A tailored resume starts with its direction resume's overrides, and gets titles for the posting the record supports.
  const sent = await write(
    {
      resume: resumeReply("Tailored"),
      requirements: [],
      titles: [
        { roleKey: "globex", title: "Customer Onboarding Manager" },
        { roleKey: "acme", title: "Head of CS" },
        { roleKey: "ghost", title: "CEO" },
      ],
    },
    { directionId, posting: "Customer Onboarding Manager at Beta" },
  );
  expect(sent.messages[0].content).toContain("a title the facts support, in the posting's wording");
  data = await asA.query(api.resume.list, { directionId });
  expect(data.tailored[0].layout).toEqual(data.versions[0].layout);
  expect(data.tailored[0].postingTitles).toEqual({ globex: "Customer Onboarding Manager" });
  expect(data.titles.direction).toEqual({ globex: "Senior CSM" });
  // Use record setting keeps the title override; Use base setting then drops it too.
  await asA.mutation(api.resume.setRole, { id: dir.id, role: { roleKey: "globex", title: "both", translated: "Senior CSM", source: "direction" } });
  data = await asA.query(api.resume.list, { directionId });
  expect(shown(data.versions[0].layout)).toEqual([["VP Customer Success", "2016-01", 2]]);
  await asA.mutation(api.resume.setRole, { id: dir.id, role: { roleKey: "globex" } });
  expect((await asA.query(api.resume.list, { directionId })).versions[0].layout).toEqual({ roles: [] });
});

test("tailoring a role from the Roles page reads its posting, writes the direction's resume first when there's none, and shows on the role and the direction", async () => {
  const { t, asA, asB, w, resumeReply } = await setup();
  const [directionId, postingId, bare] = await t.run(async (ctx) => {
    const d = await ctx.db.insert("items", {
      workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0,
      data: { name: "Customer Success", detail: { positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [] }, detailStatus: "approved" },
    });
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", found: [], at: 0 });
    const posting = (externalId: string) => ctx.db.insert("postings", { workspaceId: w, companyId: c, provider: "lever", externalId, url: `https://jobs.lever.co/beta/${externalId}`, title: "Onboarding Manager", location: "Austin, TX", remote: false, firstSeen: 0, lastSeen: 0, descriptionAt: 0, hasDescription: externalId === "1" });
    const p = await posting("1");
    await ctx.db.insert("postingTexts", { workspaceId: w, postingId: p, text: "Run onboarding for mid-market customers." });
    return [d, p, await posting("2")];
  });
  await expect(asB.mutation(api.resume.start, { directionId, postingId })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.resume.start, { directionId, postingId: bare })).rejects.toThrow("no description");
  const f = vi.fn(async () => reply({ resume: resumeReply("Tailored"), requirements: [{ requirement: "Onboarding", strength: "strong", factIds: [] }], titles: [] }));
  vi.stubGlobal("fetch", f);
  await asA.mutation(api.resume.start, { directionId, postingId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  // Two calls: the direction resume, then the tailored one from it, with the role's title, company, place and description.
  const sent = f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body) as { messages: { content: string }[] });
  expect(sent).toHaveLength(2);
  expect(sent[1].messages[1].content).toContain("Onboarding Manager at Beta · Austin, TX\n\nRun onboarding for mid-market customers.");
  const onRole = await asA.query(api.resume.forPosting, { postingId });
  expect(onRole.last?.status).toBe("done");
  expect(onRole.tailored.map((x) => [x.direction.name, x.role?.title, x.requirements.map((r) => r.strength)])).toEqual([["Customer Success", "Onboarding Manager", ["partial"]]]);
  const onDirection = await asA.query(api.resume.list, { directionId });
  expect([onDirection.versions.length, onDirection.tailored.map((x) => x.role?.id)]).toEqual([1, [postingId]]);
  expect((await asB.query(api.resume.forPosting, { postingId })).tailored).toEqual([]);
});

test("a tailored reply that skips the resume wrapper is still read as the resume, with its requirements", async () => {
  const { t, asA, w, resumeReply } = await setup();
  const [directionId, postingId] = await t.run(async (ctx) => {
    const d = await ctx.db.insert("items", {
      ...direction(w),
      data: { name: "Customer Success", detail: { positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [] }, detailStatus: "approved" },
    });
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", found: [], at: 0 });
    const p = await ctx.db.insert("postings", { workspaceId: w, companyId: c, provider: "lever", externalId: "1", url: "https://jobs.lever.co/beta/1", title: "Onboarding Manager", location: "Austin, TX", remote: false, firstSeen: 0, lastSeen: 0, descriptionAt: 0, hasDescription: true });
    await ctx.db.insert("postingTexts", { workspaceId: w, postingId: p, text: "Run onboarding for mid-market customers." });
    return [d, p];
  });
  vi.stubGlobal("fetch", vi.fn(async () => reply({ ...resumeReply("Tailored"), requirements: [{ requirement: "Onboarding", strength: "partial", factIds: [] }], titles: [] })));
  await asA.mutation(api.resume.start, { directionId, postingId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const onRole = await asA.query(api.resume.forPosting, { postingId });
  expect(onRole.last?.status).toBe("done");
  expect(onRole.tailored.map((x) => [x.doc?.summary, x.requirements.map((r) => r.requirement)])).toEqual([["Tailored", ["Onboarding"]]]);
});

test("a career break is added by the person, checked, written into the resume as its own entry, and never needs an employer", async () => {
  const { asA, asB, write, resumeReply } = await setup();
  await expect(asA.mutation(api.breaks.add, { start: "2019-6", end: "2020-12" })).rejects.toThrow("YYYY-MM");
  await expect(asA.mutation(api.breaks.add, { start: "2020-06", end: "2019-12" })).rejects.toThrow("before the start");
  const id = await asA.mutation(api.breaks.add, { start: "2019-06", end: "2020-12", reason: " Caregiving " });
  await expect(asB.mutation(api.breaks.edit, { id, start: "2019-07" })).rejects.toThrow("Not found");
  await asA.mutation(api.breaks.edit, { id, start: "2019-07", end: "2020-12", reason: "" });
  const role = (await asA.query(api.extract.items, {})).find((i) => i.id === id)!;
  expect(role).toMatchObject({ status: "approved", roleKey: "break-2019-06", data: { title: "Career break", break: true, start: "2019-07", end: "2020-12" } });
  expect(role.kind === "role" && role.data.reason).toBeUndefined();
  const sent = await write(resumeReply("With break"));
  expect(sent.messages[1].content).toContain('"break":true');
  const doc = (await asA.query(api.resume.list, {})).versions[0].doc!;
  expect(doc.experience.map((e) => [e.roleKey, e.employer, e.title])).toEqual([
    ["acme", "Acme", "Head of CS"],
    ["break-2019-06", "", "Career break"],
    ["globex", "Globex", "Implementation Manager"],
  ]);
});

test("projects show on every resume unless left out on the record; a resume can override that, and a new version keeps its override", async () => {
  const { t, asA, asB, w, write, resumeReply } = await setup();
  const [trail, notes] = await t.run(async (ctx) => {
    const project = (name: string, start: string) =>
      ctx.db.insert("items", { workspaceId: w, kind: "project", status: "approved", projectKey: `github:octo/${name.toLowerCase()}`, data: { name, repo: `octo/${name.toLowerCase()}`, url: `https://github.com/octo/${name.toLowerCase()}`, start, end: "2026-08" }, sources: [], at: 0 });
    await project("Trail", "2025-03");
    await project("Notes", "2024-01");
    const fact = (projectKey: string, text: string) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", projectKey, data: { text, files: ["README.md"] }, sources: [], at: 0 });
    return [await fact("github:octo/trail", "Built Trail."), await fact("github:octo/notes", "Built Notes.")];
  });
  const reply = (summary: string) => ({
    ...resumeReply(summary),
    projects: [
      { projectKey: "github:octo/trail", name: "Renamed", bullets: [{ text: "Built Trail.", factIds: [trail] }, { text: "Built Notes too.", factIds: [notes] }] },
      { projectKey: "github:octo/notes", bullets: [{ text: "Built Notes.", factIds: [notes] }] },
      { projectKey: "github:octo/ghost", bullets: [{ text: "Made up.", factIds: [trail] }] },
    ],
  });
  const sent = await write(reply("v1"));
  expect(sent.messages[1].content).toMatch(/"projects":\[\{[^\]]*"projectKey":"github:octo\/trail"/);
  let data = await asA.query(api.resume.list, {});
  const first = data.versions[0];
  // Name, link and dates come from the record; a bullet counts only its own project's approved facts.
  expect(first.doc!.projects).toEqual([
    { projectKey: "github:octo/trail", name: "Trail", url: "https://github.com/octo/trail", start: "2025-03", end: "2026-08", bullets: [{ text: "Built Trail.", factIds: [trail] }, { text: "Built Notes too.", factIds: [], unsourced: true }] },
    { projectKey: "github:octo/notes", name: "Notes", url: "https://github.com/octo/notes", start: "2024-01", end: "2026-08", bullets: [{ text: "Built Notes.", factIds: [notes] }] },
  ]);
  const shown = (d: typeof data, i = 0) => (present(d.versions[i].doc!, d.settings, d.versions[i].layout).projects ?? []).map((p) => p.name);
  expect(shown(data)).toEqual(["Trail", "Notes"]);
  expect(toPlain(present(first.doc!, data.settings, first.layout))).toContain("\nPROJECTS\n\nTrail · github.com/octo/trail\nMar 2025 – Aug 2026\n- Built Trail.\n");
  // Left out on the record: every resume follows.
  await expect(asB.mutation(api.resume.setProjectPresentation, { projectKey: "github:octo/notes", hidden: true })).rejects.toThrow("Not found");
  await asA.mutation(api.resume.setProjectPresentation, { projectKey: "github:octo/notes", hidden: true });
  expect((await asA.query(api.resume.presentation, {})).projects).toEqual([{ projectKey: "github:octo/notes", hidden: true }]);
  data = await asA.query(api.resume.list, {});
  expect(shown(data)).toEqual(["Trail"]);
  // This resume shows it anyway; choosing what the record says stores nothing.
  await expect(asB.mutation(api.resume.setProject, { id: first.id, projectKey: "github:octo/notes", hidden: false })).rejects.toThrow("Not found");
  await asA.mutation(api.resume.setProject, { id: first.id, projectKey: "github:octo/notes", hidden: false });
  data = await asA.query(api.resume.list, {});
  expect([data.versions[0].layout, shown(data)]).toEqual([{ roles: [], projects: [{ projectKey: "github:octo/notes", hidden: false }] }, ["Trail", "Notes"]]);
  await asA.mutation(api.resume.setProject, { id: first.id, projectKey: "github:octo/notes", hidden: true });
  expect((await asA.query(api.resume.list, {})).versions[0].layout).toEqual({ roles: [] });
  // A new version starts with the override of the one before; Use record setting (null) drops it.
  await asA.mutation(api.resume.setProject, { id: first.id, projectKey: "github:octo/notes", hidden: false });
  await write(reply("v2"));
  data = await asA.query(api.resume.list, {});
  expect([data.versions[0].doc!.summary, shown(data)]).toEqual(["v2", ["Trail", "Notes"]]);
  await asA.mutation(api.resume.setProject, { id: data.versions[0].id, projectKey: "github:octo/notes", hidden: null });
  expect(shown(await asA.query(api.resume.list, {}))).toEqual(["Trail"]);
  // A fact rejected since is no longer behind its line.
  await asA.mutation(api.extract.review, { id: trail, status: "rejected" });
  expect((await asA.query(api.resume.list, {})).versions[0].doc!.projects![0].bullets[0]).toEqual({ text: "Built Trail.", factIds: [], unsourced: true });
});

const direction = (w: Id<"workspaces">) => ({
  workspaceId: w,
  kind: "direction" as const,
  status: "approved" as const,
  data: { name: "Customer Success", detail: { positioning: "P", targetTitles: [], vocabulary: [], carriesOver: [], reframe: [], titleMap: [] }, detailStatus: "approved" as const },
  sources: [],
  at: 0,
});

test("Resume updates list what changed under each base and direction resume since it was written, and never a tailored one", async () => {
  const { t, asA, w, write, resumeReply, acmeFact } = await setup();
  const [directionId, trailFact] = await t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: w, kind: "project", status: "approved", projectKey: "github:octo/trail", data: { name: "Trail", repo: "octo/trail", url: "https://github.com/octo/trail" }, sources: [], at: 0 });
    const fact = await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", projectKey: "github:octo/trail", data: { text: "Built Trail." }, sources: [], at: 0 });
    return [await ctx.db.insert("items", direction(w)), fact];
  });
  await write(resumeReply("Base"));
  await write(resumeReply("Direction"), { directionId });
  await write({ resume: resumeReply("Tailored"), requirements: [], titles: [] }, { directionId, posting: "Customer Success Manager at Beta" });
  expect(await asA.query(api.resume.updates, {})).toEqual([]);
  const tailored = await t.run((ctx) => ctx.db.query("resumes").filter((q) => q.neq(q.field("posting"), undefined)).collect());
  expect(tailored.map((r) => [r.writtenFrom, r.toReview])).toEqual([[undefined, undefined]]);
  const summaries = async () => (await asA.query(api.resume.updates, {})).map((u) => [u.target.name, u.target.href, u.state, u.summary]);

  // Reworded in place: every count stays the same, and it's still a change.
  await t.run((ctx) => ctx.db.patch(acmeFact, { data: { text: "Cut churn by 25%." } }));
  expect(await summaries()).toEqual([
    ["Base resume", "/resumes?resume=base", "changed", "1 reworded fact at Acme"],
    ["Customer Success", `/resumes?resume=${directionId}`, "changed", "1 reworded fact at Acme"],
  ]);

  // A project fact added and one removed, a role edited, and the direction's approved positioning changed.
  await t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", projectKey: "github:octo/trail", data: { text: "Added search." }, sources: [], at: 0 });
    await ctx.db.patch(trailFact, { status: "rejected" });
    const globex = (await ctx.db.query("items").collect()).find((i) => i.roleKey === "globex" && i.kind === "role")!;
    await ctx.db.patch(globex._id, { data: { employer: "Globex", title: "Implementation Lead", start: "2016-01", end: "2019-05" } });
    await ctx.db.patch(directionId, { data: { ...direction(w).data, detail: { ...direction(w).data.detail, positioning: "Q" } } });
  });
  const everything = "1 new project fact (Trail), 1 reworded fact at Acme, 1 removed project fact (Trail), 1 edited role (Globex)";
  expect(await summaries()).toEqual([
    ["Base resume", "/resumes?resume=base", "changed", everything],
    ["Customer Success", `/resumes?resume=${directionId}`, "changed", `${everything}, changed positioning`],
  ]);

  // A direction without approved positioning has no resume to update.
  await t.run((ctx) => ctx.db.patch(directionId, { data: { ...direction(w).data, detailStatus: "proposed" } }));
  expect((await summaries()).map(([name]) => name)).toEqual(["Base resume"]);
});

test("an old resume shows as unknown; a rewrite writes a version to keep or discard, with the layout of the one before", async () => {
  const { t, asA, w, write, settle, resumeReply } = await setup();
  await write(resumeReply("v1"));
  const v1 = (await asA.query(api.resume.list, {})).versions[0];
  // Written before what it was written from was kept.
  await t.run((ctx) => ctx.db.patch(v1.id, { writtenFrom: undefined, basedOn: { roles: 2, facts: 2, insights: 0 } }));
  await asA.mutation(api.resume.setRole, { id: v1.id, role: { roleKey: "globex", fold: { into: "next", bullets: "move" } } });
  expect(await asA.query(api.resume.updates, {})).toEqual([{ target: { name: "Base resume", href: "/resumes?resume=base" }, state: "unknown", summary: null, writing: false }]);

  // Update all starts one run per resume not already being written.
  expect(await asA.mutation(api.resume.updateAll, {})).toBe(1);
  expect((await asA.query(api.resume.updates, {}))[0].writing).toBe(true);
  expect(await asA.mutation(api.resume.updateAll, {})).toBe(0);
  await expect(asA.mutation(api.resume.rewrite, {})).rejects.toThrow("already being written");
  await settle(resumeReply("v2"));
  // The new version waits: previewable in Resume updates, but not the resume (not among its versions) until kept.
  const [waiting] = await asA.query(api.resume.updates, {});
  // Nothing to compare with before it: no summary.
  expect(waiting).toMatchObject({ target: { name: "Base resume", href: "/resumes?resume=base" }, state: "review", summary: null, writing: false });
  expect(waiting.preview).toContain("v2");
  const v2 = waiting.versionId!;
  expect((await asA.query(api.resume.list, {})).versions.map((v) => v.id)).toEqual([v1.id]);
  await expect(asA.mutation(api.resume.rewrite, {})).rejects.toThrow("waiting");
  const folded = { roles: [{ roleKey: "globex", fold: { into: "next", bullets: "move" } }] };
  expect((await t.run((ctx) => ctx.db.get(v2)))!.layout).toEqual(folded);
  await asA.mutation(api.resume.keep, { id: v2 });
  expect(await asA.query(api.resume.updates, {})).toEqual([]);
  let versions = (await asA.query(api.resume.list, {})).versions;
  expect(versions.map((v) => [v.id, v.doc?.summary, v.counts])).toEqual([
    [v2, "v2", { roles: 2, facts: 2, insights: 0 }],
    [v1.id, "v1", null],
  ]);
  expect([versions[0].layout, versions[1].layout]).toEqual([folded, folded]);

  // The record changes; a rewrite says what the new version picked up, and discarding it leaves the ones before.
  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text: "Hired a team of 6." }, sources: [], at: 0 }));
  expect((await asA.query(api.resume.updates, {}))[0]).toMatchObject({ state: "changed", summary: "1 new fact at Acme" });
  await asA.mutation(api.resume.rewrite, {});
  await settle(resumeReply("v3"));
  const [v3] = await asA.query(api.resume.updates, {});
  expect(v3).toMatchObject({ target: { name: "Base resume", href: "/resumes?resume=base" }, state: "review", summary: "1 new fact at Acme", writing: false });
  await expect(asA.mutation(api.resume.discard, { id: v2 })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.resume.keep, { id: v2 })).rejects.toThrow("Not found");
  await asA.mutation(api.resume.discard, { id: v3.versionId! });
  versions = (await asA.query(api.resume.list, {})).versions;
  expect(versions.map((v) => v.id)).toEqual([v2, v1.id]);
  expect((await asA.query(api.resume.updates, {}))[0]).toMatchObject({ state: "changed", summary: "1 new fact at Acme" });
});

test("Resume updates are workspace-checked", async () => {
  const { t, asA, asB, w, write, settle, resumeReply } = await setup();
  const directionId = await t.run((ctx) => ctx.db.insert("items", direction(w)));
  await write(resumeReply("v1"));
  await asA.mutation(api.resume.rewrite, {});
  await settle(resumeReply("v2"));
  const [v1] = (await asA.query(api.resume.list, {})).versions;
  const v2 = { id: (await asA.query(api.resume.updates, {}))[0].versionId! };
  await t.run((ctx) => ctx.db.patch(v1.id, { writtenFrom: undefined }));
  expect(await asB.query(api.resume.updates, {})).toEqual([]);
  expect(await asB.mutation(api.resume.updateAll, {})).toBe(0);
  await expect(asB.mutation(api.resume.keep, { id: v2.id })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.resume.discard, { id: v2.id })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.resume.rewrite, { directionId })).rejects.toThrow("Not found");
  expect((await asA.query(api.resume.list, {})).versions.map((v) => v.id)).toEqual([v1.id]);
  expect((await asA.query(api.resume.updates, {}))[0]).toMatchObject({ state: "review", versionId: v2.id });
});

test("a fact from a rejected narrative stops backing its line, drops out of the next resume, and flags the resume as changed", async () => {
  const { t, asA, w, write, resumeReply, acmeFact } = await setup();
  const narrativeId = await t.run(async (ctx) => {
    const n = await ctx.db.insert("narratives", { workspaceId: w, kind: "career", title: "Acme", body: "Cut churn by 20%.", version: 1, updatedAt: 0 });
    await ctx.db.patch(acmeFact, { sources: [{ narrativeId: n, version: 1, quotes: [] }] });
    return n;
  });
  await write(resumeReply("v1"));
  const factsOf = async () => (await t.run((ctx) => ctx.db.query("resumes").order("desc").first()))!.writtenFrom!.facts.map((f) => f.id);
  expect(await factsOf()).toContain(acmeFact);
  await t.run((ctx) => ctx.db.patch(narrativeId, { rejectedAt: 1 }));
  // Still approved, but no longer counted.
  expect((await t.run((ctx) => ctx.db.get(acmeFact)))!.status).toBe("approved");
  expect(await asA.query(api.resume.updates, {})).toEqual([{ target: { name: "Base resume", href: "/resumes?resume=base" }, state: "changed", summary: "1 removed fact at Acme", writing: false }]);
  const data = await asA.query(api.resume.list, {});
  expect(data.facts[acmeFact]).toBeUndefined();
  expect(data.versions[0].doc!.experience[0].bullets[0]).toEqual({ text: "Cut churn by 20%.", factIds: [], unsourced: true });
  await write(resumeReply("v2"));
  expect(await factsOf()).not.toContain(acmeFact);
  expect(await asA.query(api.resume.updates, {})).toEqual([]);
});

test("tailoring while a new version waits in Resume updates starts from the kept direction resume", async () => {
  const { t, asA, w, write, settle, resumeReply } = await setup();
  const directionId = await t.run((ctx) => ctx.db.insert("items", direction(w)));
  await write(resumeReply("Kept direction resume"), { directionId });
  await asA.mutation(api.resume.rewrite, { directionId });
  await settle(resumeReply("Waiting direction resume"));
  expect((await asA.query(api.resume.updates, {})).map((u) => [u.target.directionId, u.state])).toEqual([[directionId, "review"]]);
  // The direction page shows the kept one.
  expect((await asA.query(api.resume.list, { directionId })).versions.map((v) => v.doc?.summary)).toEqual(["Kept direction resume"]);
  const sent = await write({ resume: resumeReply("Tailored"), requirements: [], titles: [] }, { directionId, posting: "Customer Success Manager at Beta" });
  const from = sent.messages[1].content.slice(0, sent.messages[1].content.indexOf("The direction:"));
  expect(from).toContain("Kept direction resume");
  expect(from).not.toContain("Waiting direction resume");
  // Once kept, it's the one tailoring starts from.
  await asA.mutation(api.resume.keep, { id: (await asA.query(api.resume.updates, {}))[0].versionId! });
  const next = await write({ resume: resumeReply("Tailored again"), requirements: [], titles: [] }, { directionId, posting: "Customer Success Manager at Beta" });
  expect(next.messages[1].content.slice(0, next.messages[1].content.indexOf("The direction:"))).toContain("Waiting direction resume");
});

test("each resume's length follows the record unless it sets its own; the writer is asked for it, and a change shows in Resume updates", async () => {
  const { asA, asB, write, resumeReply, acmeFact } = await setup();
  await expect(asB.mutation(api.resume.setBullet, { id: (await write(resumeReply("v1")), (await asA.query(api.resume.list, {})).versions[0].id), text: "Cut churn by 20%.", state: "hidden" })).rejects.toThrow("Not found");
  const v1 = (await asA.query(api.resume.list, {})).versions[0];
  expect(v1.doc!.experience[0].bullets[0].factIds).toEqual([acmeFact]);
  await expect(asA.mutation(api.resume.setBullet, { id: v1.id, text: "Not a line here", state: "pinned" })).rejects.toThrow("Not found");
  await asA.mutation(api.resume.setBullet, { id: v1.id, text: "Cut churn by 20%.", state: "hidden" });
  expect((await asA.query(api.resume.list, {})).versions[0].text).not.toContain("Cut churn");
  expect((await asA.query(api.resume.list, {})).length).toEqual({ own: null, record: "two" });
  await asA.mutation(api.resume.setRecordLength, { length: "one" });
  expect((await asA.query(api.resume.updates, {}))[0].summary).toBe("Length changed to One page");
  await asA.mutation(api.resume.setLength, { length: "full" });
  expect((await asA.query(api.resume.list, {})).length).toEqual({ own: "full", record: "one" });
  const sent = await write(resumeReply("v2"));
  expect(sent.messages[0].content).toContain("Length: Full");
  // The next version keeps the hidden line where it has the same words.
  expect((await asA.query(api.resume.list, {})).versions[0].layout.bullets).toEqual([{ text: "Cut churn by 20%.", state: "hidden" }]);
  expect(await asA.query(api.resume.updates, {})).toEqual([]);
  // Choosing what the record says follows the record.
  await asA.mutation(api.resume.setLength, { length: "one" });
  expect((await asA.query(api.resume.list, {})).length).toEqual({ own: null, record: "one" });
});

test("a line and the summary in their own words show on the resume and its exports, keep their facts, and a new version keeps the line where it's the same", async () => {
  const { t, asA, asB, write, resumeReply, acmeFact } = await setup();
  await write(resumeReply("v1"));
  const v1 = (await asA.query(api.resume.list, {})).versions[0];
  await expect(asB.mutation(api.resume.setWords, { id: v1.id, text: "Cut churn by 20%.", to: "Mine." })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.resume.setWords, { id: v1.id, text: "Cut churn by 20%.", to: "  " })).rejects.toThrow("hide it instead");
  await asA.mutation(api.resume.setWords, { id: v1.id, text: "Cut churn by 20%.", to: "Cut customer churn by a fifth." });
  await asA.mutation(api.resume.setSummary, { id: v1.id, text: "My own summary." });
  let v = (await asA.query(api.resume.list, {})).versions[0];
  expect(v.text).toContain("Cut customer churn by a fifth.");
  expect(v.text).not.toContain("Cut churn by 20%.");
  expect(v.text).toContain("My own summary.");
  const shown = arrange(v.doc!, v.layout);
  expect(shown.doc.experience[0].bullets[0]).toMatchObject({ text: "Cut customer churn by a fifth.", factIds: [acmeFact], edited: true, original: "Cut churn by 20%." });
  expect(shown.summaryEdited).toBe(true);
  // Pin and Hide still go by CareerBot's words.
  await asA.mutation(api.resume.setBullet, { id: v1.id, text: "Cut churn by 20%.", state: "hidden" });
  expect((await asA.query(api.resume.list, {})).versions[0].text).not.toContain("churn");
  await asA.mutation(api.resume.setBullet, { id: v1.id, text: "Cut churn by 20%.", state: null });
  // CareerBot's words back.
  await asA.mutation(api.resume.setSummary, { id: v1.id, text: null });
  expect((await asA.query(api.resume.list, {})).versions[0].text).not.toContain("My own summary.");
  // A new version with the same line keeps it in their words; its summary is its own.
  await asA.mutation(api.resume.setSummary, { id: v1.id, text: "My own summary." });
  await write(resumeReply("v2"));
  v = (await asA.query(api.resume.list, {})).versions[0];
  expect(v.id).not.toBe(v1.id);
  expect(v.text).toContain("Cut customer churn by a fifth.");
  expect(v.text).not.toContain("My own summary.");
  // Compare lists a line in their own words on one side only.
  await asA.mutation(api.resume.setWords, { id: v.id, text: "Cut churn by 20%.", to: null });
  const { changes } = await asA.query(api.resume.compare, { from: v1.id, to: v.id });
  expect(changes.filter((c) => c.kind === "changed").map((c) => c.text)).toContain("No longer in your words: Cut customer churn by a fifth.");
  // The older version in History stays as it was.
  await expect(asA.mutation(api.resume.setWords, { id: v1.id, text: "Cut churn by 20%.", to: "Changed later." })).rejects.toThrow("Only the current version");
  await expect(asA.mutation(api.resume.setSummary, { id: v1.id, text: "Changed later." })).rejects.toThrow("Only the current version");
  // A line on the resume twice, word for word, can't be told apart.
  await t.run((ctx) => ctx.db.patch(v.id, { doc: { ...v.doc!, experience: [{ ...v.doc!.experience[0], bullets: [...v.doc!.experience[0].bullets, v.doc!.experience[0].bullets[0]] }] } }));
  await expect(asA.mutation(api.resume.setWords, { id: v.id, text: v.doc!.experience[0].bullets[0].text, to: "Mine." })).rejects.toThrow("on the resume twice");
});

test("the Resumes list shows how each base and direction resume stands, which can't be written yet, and tailored resumes with no state", async () => {
  const { t, asA, asB, w, write, settle, resumeReply } = await setup();
  const directionId = await t.run(async (ctx) => {
    await ctx.db.insert("items", { ...direction(w), data: { ...direction(w).data, name: "Sales", detailStatus: "proposed" as const } });
    return ctx.db.insert("items", direction(w));
  });
  const rows = async () => {
    const o = await asA.query(api.resume.overview, {});
    return [o.base, ...o.directions].map((r) => [r.name, r.state, r.blocked]);
  };
  expect(await rows()).toEqual([
    ["Base resume", "notWritten", null],
    ["Sales", "notWritten", "Approve this direction's positioning first."],
    ["Customer Success", "notWritten", null],
  ]);
  await write(resumeReply("Base"));
  await write(resumeReply("Direction"), { directionId });
  await write({ resume: resumeReply("Tailored"), requirements: [], titles: [] }, { directionId, posting: "Customer Success Manager at Beta\n\nRun onboarding." });
  let o = await asA.query(api.resume.overview, {});
  expect([o.base.state, o.base.at !== null, o.directions[1].state, o.directions[1].key, o.toUpdate, o.writing]).toEqual(["upToDate", true, "upToDate", directionId, 0, false]);
  expect(o.tailored).toEqual([{ id: expect.any(String), title: "Customer Success Manager", company: "Beta", directionId, direction: "Customer Success", at: expect.any(Number) }]);

  await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text: "Hired a team of 6." }, sources: [], at: 0 }));
  o = await asA.query(api.resume.overview, {});
  expect([o.base.state, o.base.summary, o.directions[1].state, o.toUpdate]).toEqual(["changed", "1 new fact at Acme", "changed", 2]);
  await asA.mutation(api.resume.rewrite, {});
  o = await asA.query(api.resume.overview, {});
  expect([o.base.writing, o.directions[1].writing, o.writing]).toEqual([true, false, true]);
  await settle(resumeReply("v2"));
  expect((await asA.query(api.resume.overview, {})).base).toMatchObject({ state: "review", versionId: (await asA.query(api.resume.updates, {}))[0].versionId, summary: "1 new fact at Acme", writing: false });
  expect((await asB.query(api.resume.overview, {})).tailored).toEqual([]);
});

test("History lists what each kept version changed, flags lines on facts rejected or edited since, and restores an older version without them", async () => {
  const { t, asA, asB, w, write, resumeReply, acmeFact, globexFact } = await setup();
  const trained = await t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "globex", data: { text: "Trained 12 admins." }, sources: [], at: 0 }));
  await write(resumeReply("v1"));
  await write({
    summary: "v2",
    experience: [
      { roleKey: "acme", bullets: [{ text: "Cut churn by 20%.", factIds: [acmeFact] }] },
      { roleKey: "globex", bullets: [{ text: "Trained 12 admins.", factIds: [trained] }] },
    ],
    skills: [],
  });
  await asA.mutation(api.extract.review, { id: globexFact, status: "rejected" });
  await t.run((ctx) => ctx.db.patch(acmeFact, { data: { text: "Cut churn by 25%." } }));
  const [v2, v1] = (await asA.query(api.resume.history, {})).versions;
  expect([v2.current, v1.current, v2.plain, v2.facts, v2.restoredFrom]).toEqual([true, false, false, 3, null]);
  expect(v2.changes).toEqual([
    { kind: "added", text: "Trained 12 admins.", where: "Globex", factIds: [trained], note: null },
    { kind: "changed", text: "Summary", where: null, factIds: [], note: null },
    { kind: "dropped", text: "Ran 40 implementations.", where: "Globex", factIds: [globexFact], note: "fact rejected" },
  ]);
  expect(v1.changes).toEqual([]);
  expect(await asA.query(api.resume.compare, { from: v1.id, to: v2.id })).toEqual({ changes: v2.changes });
  const old = await asA.query(api.resume.version, { id: v1.id });
  expect([old.current, old.waiting, old.flags]).toEqual([false, false, { "Cut churn by 20%.": "edited", "Ran 40 implementations.": "rejected" }]);
  await expect(asB.query(api.resume.version, { id: v1.id })).rejects.toThrow("Not found");
  await expect(asB.query(api.resume.compare, { from: v1.id, to: v2.id })).rejects.toThrow("Not found");

  // Restoring copies the old version without its flagged lines; Undo deletes the copy while it's current.
  await expect(asB.mutation(api.resume.restore, { id: v1.id })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.resume.restore, { id: v2.id })).rejects.toThrow("already the current");
  const copy = await asA.mutation(api.resume.restore, { id: v1.id });
  const data = await asA.query(api.resume.list, {});
  expect(data.versions.map((v) => [v.id, v.restoredFrom])).toEqual([
    [copy, v1.at],
    [v2.id, null],
    [v1.id, null],
  ]);
  expect(data.versions[0].doc!.experience.map((e) => e.bullets.map((b) => b.text))).toEqual([[], []]);
  expect((await asA.query(api.resume.history, {})).versions[0]).toMatchObject({ id: copy, current: true, restoredFrom: v1.at });
  await expect(asA.mutation(api.resume.undoRestore, { id: v2.id })).rejects.toThrow("Nothing to undo");
  await asA.mutation(api.resume.undoRestore, { id: copy });
  expect((await asA.query(api.resume.list, {})).versions.map((v) => v.id)).toEqual([v2.id, v1.id]);

  // A plain-text version has nothing to compare and can't be restored.
  await t.run((ctx) => ctx.db.patch(v1.id, { doc: undefined, text: "Plain" }));
  expect((await asA.query(api.resume.history, {})).versions.map((v) => [v.plain, v.changes.length])).toEqual([
    [false, 0],
    [true, 0],
  ]);
  await expect(asA.mutation(api.resume.restore, { id: v1.id })).rejects.toThrow("Write it again");
});

test("Add what's new proposes lines for new facts; each added or skipped line changes the resume and what it was written from, and a skipped fact isn't offered again", async () => {
  const { t, asA, asB, w, write, settle, resumeReply } = await setup();
  const fact = (roleKey: string, text: string) => t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey, data: { text }, sources: [], at: 0 }));
  await write(resumeReply("v1"));
  await expect(asA.mutation(api.resume.whatsNew, {})).rejects.toThrow("Nothing new to add");
  const hired = await fact("acme", "Hired a team of 6.");
  const trained = await fact("globex", "Trained 12 admins.");
  await asA.mutation(api.resume.whatsNew, {});
  await settle({
    lines: [
      { text: "Hired and led a team of 6.", factIds: [hired], roleKey: "acme" },
      { text: "Trained 12 admins.", factIds: [trained, "ghost"] },
      { text: "Made up.", factIds: ["ghost"], roleKey: "acme" },
    ],
  });
  let data = await asA.query(api.resume.list, {});
  const id = data.versions[0].id;
  expect([data.last?.status, data.lines?.status]).toEqual(["done", "done"]);
  expect(data.versions[0].additions?.lines).toEqual([
    { text: "Hired and led a team of 6.", factIds: [hired], roleKey: "acme", state: null, reason: null },
    { text: "Trained 12 admins.", factIds: [trained], roleKey: "globex", state: null, reason: null },
  ]);
  expect((await asA.query(api.activity.list, {}))[0].label).toBe("Wrote new lines for your base resume");

  await expect(asB.mutation(api.resume.setLine, { id, index: 0, state: "added" })).rejects.toThrow("Not found");
  await asA.mutation(api.resume.setLine, { id, index: 0, state: "added" });
  await asA.mutation(api.resume.setLine, { id, index: 1, state: "skipped", reason: " Too old " });
  const row = async () => (await t.run((ctx) => ctx.db.get(id)))!;
  const bullets = async () => (await row()).doc!.experience.map((e) => e.bullets.map((b) => b.text));
  expect(await bullets()).toEqual([["Cut churn by 20%.", "Hired and led a team of 6."], ["Ran 40 implementations."]]);
  let r = await row();
  expect([r.writtenFrom!.facts.some((f) => f.id === hired), r.writtenFrom!.facts.some((f) => f.id === trained)]).toEqual([true, false]);
  expect(r.skipped).toEqual([{ text: "Trained 12 admins.", factIds: [trained], marks: [expect.any(String)], reason: "Too old", at: expect.any(Number) }]);
  expect((await asA.query(api.resume.list, {})).versions[0].additions?.lines.map((l) => [l.state, l.reason])).toEqual([
    ["added", null],
    ["skipped", "Too old"],
  ]);
  expect((await asA.query(api.resume.overview, {})).base).toMatchObject({ state: "changed", summary: "1 new fact at Globex" });
  await expect(asA.mutation(api.resume.whatsNew, {})).rejects.toThrow("Nothing new to add");

  // Decided again, then everything left added: up to date. Done keeps the added lines.
  await asA.mutation(api.resume.setLine, { id, index: 1, state: null });
  expect((await row()).skipped).toEqual([]);
  await asA.mutation(api.resume.addAll, { id });
  expect(await bullets()).toEqual([["Cut churn by 20%.", "Hired and led a team of 6."], ["Ran 40 implementations.", "Trained 12 admins."]]);
  expect((await asA.query(api.resume.overview, {})).base.state).toBe("upToDate");
  await asA.mutation(api.resume.closeAdditions, { id });
  data = await asA.query(api.resume.list, {});
  expect([data.versions[0].additions, data.versions[0].doc!.experience[1].bullets.length]).toEqual([null, 2]);
  await expect(asA.mutation(api.resume.setLine, { id, index: 0, state: null })).rejects.toThrow("Not found");

  // A skipped fact is offered again once it's reworded; a new version keeps what was skipped.
  const demos = await fact("acme", "Ran 30 demos.");
  await asA.mutation(api.resume.whatsNew, {});
  await settle({ lines: [{ text: "Ran 30 demos.", factIds: [demos], roleKey: "acme" }] });
  await asA.mutation(api.resume.setLine, { id, index: 0, state: "skipped" });
  await expect(asA.mutation(api.resume.whatsNew, {})).rejects.toThrow("Nothing new to add");
  await t.run((ctx) => ctx.db.patch(demos, { data: { text: "Ran 35 demos." } }));
  expect(await asA.mutation(api.resume.whatsNew, {})).not.toBeNull();
  await settle({ lines: [{ text: "Ran 35 demos.", factIds: [demos], roleKey: "acme" }] });
  r = await row();
  expect(r.additions?.lines.map((l) => l.text)).toEqual(["Ran 35 demos."]);
  await write(resumeReply("v2"));
  expect((await t.run((ctx) => ctx.db.query("resumes").order("desc").first()))!.skipped?.map((s) => s.text)).toEqual(["Ran 30 demos."]);
});

test("notes can be kept on a resume, in its own workspace only", async () => {
  const { asA, asB, write, resumeReply } = await setup();
  await write(resumeReply("v1"));
  const subject = { kind: "resume" as const, id: (await asA.query(api.resume.list, {})).versions[0].id };
  await asA.mutation(api.notes.add, { subject, text: "Sent to Beta" });
  expect((await asA.query(api.notes.list, { subject })).map((n) => n.text)).toEqual(["Sent to Beta"]);
  await expect(asB.mutation(api.notes.add, { subject, text: "Mine" })).rejects.toThrow("Not found");
});

test("a fact lists the base and direction resumes whose current version cites it, in its own workspace only", async () => {
  const { t, asA, asB, w, write, resumeReply, acmeFact } = await setup();
  const directionId = await t.run((ctx) => ctx.db.insert("items", direction(w)));
  await write(resumeReply("Base"));
  await write({ ...resumeReply("Direction"), experience: [{ roleKey: "globex", bullets: [{ text: "Ran 40 implementations.", factIds: [] }] }] }, { directionId });
  expect(await asA.query(api.resume.showsFact, { id: acmeFact })).toEqual([{ key: "base", directionId: null, name: "Base resume" }]);
  await write(resumeReply("Direction v2"), { directionId });
  expect((await asA.query(api.resume.showsFact, { id: acmeFact })).map((x) => x.key)).toEqual(["base", directionId]);
  expect(await asB.query(api.resume.showsFact, { id: acmeFact })).toEqual([]);
});
