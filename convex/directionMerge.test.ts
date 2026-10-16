import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

// goals.merge and goals.unmerge: one direction merged into another, at once and with no AI call, and Undo putting
// everything back exactly. Fictional directions and companies only.

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unexpected", { status: 500 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const detail = (targetTitles: string[], vocabulary: string[]) => ({ positioning: "Runs the operating side.", targetTitles, vocabulary, carriesOver: [], reframe: [], titleMap: [] });

async function setup() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    const direction = (name: string, data: object) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name, ...data }, sources: [], at: 0 });
    const kept = await direction("Chief of Staff", {
      includes: ["Operations Lead"],
      detail: detail(["Chief of Staff"], ["operating rhythm"]),
      detailStatus: "approved",
      criteria: { seeds: ["northwind.example"], industries: ["Software"], sizes: [], stages: [], titles: ["Chief of Staff"], keywords: ["planning"] },
      criteriaStatus: "approved",
      changedAt: 10,
    });
    const merged = await direction("Startup Operations", {
      includes: ["Head of Operations"],
      detail: detail(["Head of Operations", "chief of staff"], ["budgets", "Operating rhythm"]),
      detailStatus: "approved",
      criteria: { seeds: ["lumenworks.example", "northwind.example"], industries: ["Software", "Fintech"], sizes: ["51-200"], stages: [], titles: ["Head of Operations"], keywords: ["hiring"] },
      criteriaStatus: "approved",
      changedAt: 5,
    });
    const company = (name: string, fit: { directionId: Id<"items">; level: "strong" | "some" | "weak" | "none" }[], found: { directionId?: Id<"items">; via: "criteria" | "hand"; at: number }[] = []) =>
      ctx.db.insert("companies", { workspaceId: w, name, found, fit: fit.map((f) => ({ ...f, reason: `${f.level} fit` })), rating: { value: "excited", at: 0 }, at: 0 });
    const harbor = await company("Harbor Freightworks", [{ directionId: merged, level: "strong" }, { directionId: kept, level: "weak" }]);
    const quill = await company("Quillmark", [{ directionId: merged, level: "some" }, { directionId: kept, level: "strong" }]);
    const tidewater = await company("Tidewater Labs", [{ directionId: merged, level: "some" }], [{ via: "hand", at: 0 }, { directionId: merged, via: "criteria", at: 1 }]);
    let n = 0;
    const posting = (companyId: Id<"companies">, fit: { directionId: Id<"items">; level: "strong" | "some" | "weak" | "none"; score: number }[], extra: object = {}) =>
      ctx.db.insert("postings", {
        workspaceId: w, companyId, provider: "greenhouse", externalId: `r${++n}`, url: `https://jobs.example/${n}`, title: `Operations Role ${n}`, remote: true, firstSeen: 0, lastSeen: 0,
        fit: fit.map((f) => ({ ...f, method: "model" as const, directionAt: 1 })), fitAt: 1, ...extra,
      });
    const better = await posting(harbor, [{ directionId: merged, level: "strong", score: 82 }, { directionId: kept, level: "some", score: 60 }]);
    const worse = await posting(quill, [{ directionId: merged, level: "weak", score: 20 }, { directionId: kept, level: "strong", score: 90 }]);
    const only = await posting(tidewater, [{ directionId: merged, level: "some", score: 55 }], {
      sort: { directionIds: [merged], against: [{ directionId: merged, directionAt: 1 }, { directionId: kept, directionAt: 1 }], method: "model", at: 1 },
      rerank: [merged],
    });
    const pursuit = await ctx.db.insert("pursuits", {
      workspaceId: w, postingId: better, companyId: harbor, title: "Operations Role 1", company: "Harbor Freightworks", directionId: merged, direction: "Startup Operations", score: 82, level: "strong",
      status: "preparing", timeline: [{ at: 0, event: "started" }], changedAt: 0, at: 0,
    });
    const ownResume = await ctx.db.insert("resumes", { workspaceId: w, directionId: merged, text: "Startup Operations resume.", model: "m", at: 1 });
    const tailored = await ctx.db.insert("resumes", { workspaceId: w, directionId: merged, posting: "Operations Role 1 at Harbor Freightworks", postingId: better, text: "Tailored.", model: "m", at: 2 });
    const note = await ctx.db.insert("notes", { workspaceId: w, subject: { kind: "item", id: merged }, text: "Ask about the board deck.", at: 3 });
    const limit = await ctx.db.insert("items", {
      workspaceId: w, kind: "limit", status: "approved", sources: [], at: 0,
      data: { kind: "pay", label: "Pay · Startup Operations", value: "At least $150k.", firm: true, appliesTo: ["Startup Operations", "Chief of Staff"], rule: null, ruleStale: true },
    });
    const settings = await ctx.db.insert("resumeSettings", { workspaceId: w, roles: [], lengths: [{ length: "two" }, { directionId: merged, length: "one" }] });
    return { w, kept, merged, harbor, quill, tidewater, better, worse, only, pursuit, ownResume, tailored, note, limit, settings };
  });
  const as = t.withIdentity({ subject: `${(await t.run((ctx) => ctx.db.query("users").first()))!._id}|s` });
  // Every record the merge may touch, as it is now.
  const snapshot = () =>
    t.run(async (ctx) => {
      const ids = [s.kept, s.merged, s.harbor, s.quill, s.tidewater, s.better, s.worse, s.only, s.pursuit, s.ownResume, s.tailored, s.note, s.limit, s.settings];
      return Promise.all(ids.map((id) => ctx.db.get(id)));
    });
  return { t, as, s, snapshot };
}

test("merging combines titles, vocabulary and criteria once each, keeps the better fit, and moves what goes with it, with no AI call", async () => {
  const { t, as, s } = await setup();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fetch).not.toHaveBeenCalled();

  await t.run(async (ctx) => {
    const kept = await ctx.db.get(s.kept);
    if (kept?.kind !== "direction") throw new Error("kept");
    expect(kept.status).toBe("approved");
    expect(kept.data.name).toBe("Chief of Staff");
    expect(kept.data.includes).toEqual(["Operations Lead", "Startup Operations", "Head of Operations"]);
    expect(kept.data.detail?.positioning).toBe("Runs the operating side.");
    expect(kept.data.detail?.targetTitles).toEqual(["Chief of Staff", "Head of Operations"]);
    expect(kept.data.detail?.vocabulary).toEqual(["operating rhythm", "budgets"]);
    expect(kept.data.criteria).toEqual({
      seeds: ["northwind.example", "lumenworks.example"],
      industries: ["Software", "Fintech"],
      sizes: ["51-200"],
      stages: [],
      titles: ["Chief of Staff", "Head of Operations"],
      keywords: ["planning", "hiring"],
    });
    expect(kept.data.mergedAt).toBeDefined();
    expect(kept.data.changedAt).toBe(kept.data.mergedAt);
    expect((await ctx.db.get(s.merged))).toMatchObject({ status: "superseded", data: { mergedInto: "Chief of Staff" } });

    const levelFor = async (id: Id<"companies">) => (await ctx.db.get(id))!.fit!.find((f) => f.directionId === s.kept)?.level;
    expect(await levelFor(s.harbor)).toBe("strong");
    expect(await levelFor(s.quill)).toBe("strong");
    expect(await levelFor(s.tidewater)).toBe("some");
    expect((await ctx.db.get(s.tidewater))!.found.map((f) => f.directionId)).toEqual([undefined, s.kept]);

    const verdict = async (id: Id<"postings">) => (await ctx.db.get(id))!.fit!.find((f) => f.directionId === s.kept);
    expect(await verdict(s.better)).toMatchObject({ level: "strong", score: 82 });
    expect(await verdict(s.worse)).toMatchObject({ level: "strong", score: 90 });
    expect(await verdict(s.only)).toMatchObject({ level: "some", score: 55 });
    const only = (await ctx.db.get(s.only))!;
    expect(only.sort?.directionIds).toEqual([s.kept]);
    expect(only.sort?.against.map((a) => a.directionId)).toEqual([s.kept]);
    expect(only.rerank).toEqual([s.kept]);

    expect(await ctx.db.get(s.pursuit)).toMatchObject({ directionId: s.kept, direction: "Chief of Staff", score: 82, level: "strong" });
    expect((await ctx.db.get(s.tailored))!.directionId).toBe(s.kept);
    expect((await ctx.db.get(s.ownResume))!.directionId).toBe(s.merged);
    expect((await ctx.db.get(s.note))!.subject).toEqual({ kind: "item", id: s.kept });
    const limit = await ctx.db.get(s.limit);
    expect(limit?.kind === "limit" && limit.data.appliesTo).toEqual(["Chief of Staff"]);
    expect((await ctx.db.get(s.settings))!.lengths).toEqual([{ length: "two" }]);
  });
});

test("the kept direction's roles show as ranked before the merge until ranked again", async () => {
  const { t, as, s } = await setup();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const fit = await as.query(api.directions.fit, {});
  expect(fit.find((f) => f.directionId === s.kept)?.stale).toBe(true);
});

test("Undo puts every record back exactly as it was, with no AI call", async () => {
  const { t, as, s, snapshot } = await setup();
  const before = await snapshot();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await as.mutation(api.goals.unmerge, { id: s.merged });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await snapshot()).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("mergeMoves").collect())).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

test("Merge into… counts what each other direction would gain, and what moves with it", async () => {
  const { t, as, s } = await setup();
  await t.mutation(internal.roles.refreshRanks, { workspaceId: s.w });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const gains = await as.query(api.goals.mergeGains, { id: s.merged });
  expect(gains.pursuits).toBe(1);
  expect(gains.notes).toBe(1);
  // New titles: Startup Operations, Head of Operations (Chief of Staff it has). Roles: only the Tidewater one (the
  // others already fit it). Companies: Harbor (weak there) and Tidewater (unset there); Quillmark already fits it.
  expect(gains.into).toEqual([{ id: s.kept, titles: 2, roles: 1, companies: 2 }]);
});

test("Undo while the merge is still under way stops it and puts back what it had moved", async () => {
  const { t, as, s, snapshot } = await setup();
  const before = await snapshot();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  // The merge job has done its companies and one page of roles when Undo comes.
  const job = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "merge")!);
  await t.mutation(internal.goals.mergePage, { jobId: job._id, phase: "companies", cursor: null, total: 6 });
  await t.mutation(internal.goals.mergePage, { jobId: job._id, phase: "postings", cursor: null, total: 6 });
  expect(await t.run(async (ctx) => (await ctx.db.get(s.better))!.fit!.find((f) => f.directionId === s.kept)?.score)).toBe(82);
  await as.mutation(api.goals.unmerge, { id: s.merged });
  await expect(t.mutation(internal.goals.mergePage, { jobId: job._id, phase: "pursuits", cursor: null, total: 6 })).rejects.toThrow();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await snapshot()).toEqual(before);
  const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
  expect(jobs.map((j) => [j.kind, j.status])).toEqual([
    ["merge", "cancelled"],
    ["unmerge", "done"],
  ]);
  expect(await t.run((ctx) => ctx.db.query("mergeMoves").collect())).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

test("Activity shows a merge by name, with how far it has got", async () => {
  const { t, as, s } = await setup();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  const job = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "merge")!);
  await t.mutation(internal.jobs.markStarted, { jobId: job._id });
  await t.mutation(internal.goals.mergePage, { jobId: job._id, phase: "companies", cursor: null, total: 6 });
  expect((await as.query(api.activity.list, {}))[0]).toMatchObject({ label: "Merging Startup Operations into Chief of Staff", state: "running", detail: "3 of 6" });
  // Its run, cut off here, starts again and goes on from the roles.
  await t.run((ctx) => ctx.db.patch(job._id, { status: "queued" }));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await as.query(api.activity.list, {}))[0]).toMatchObject({ label: "Merged Startup Operations into Chief of Staff", state: "done" });
  // Each company was checked once, and recorded once.
  expect(await t.run(async (ctx) => (await ctx.db.query("mergeMoves").collect()).filter((m) => m.table === "companies"))).toHaveLength(3);
});

// What one function may read here: less than all the roles below at once.
const BYTES_READ = 1_000_000;
const ROLES = 2600;

test("a workspace with 2,600 roles across both directions merges and undoes a page at a time, within what one function may read", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead: BYTES_READ } });
  const s = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    const kept = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Chief of Staff", changedAt: 10 }, sources: [], at: 0 });
    const merged = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name: "Startup Operations", changedAt: 5 }, sources: [], at: 0 });
    const company = await ctx.db.insert("companies", { workspaceId: w, name: "Harbor Freightworks", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 }, at: 0 });
    return { w, kept, merged, company };
  });
  const brief = "Runs the weekly operating rhythm for a leadership team: priorities, the planning calendar and projects no single team owns. ".repeat(4);
  for (let start = 0; start < ROLES; start += 200)
    await t.run(async (ctx) => {
      for (let i = start; i < start + 200; i++)
        await ctx.db.insert("postings", {
          workspaceId: s.w, companyId: s.company, provider: "greenhouse", externalId: `r${i}`, url: `https://jobs.example/${i}`, title: `Operations Role ${i}`, remote: true, firstSeen: 0, lastSeen: 0,
          brief: { job: brief, forYou: brief, at: 1 },
          fit: [
            { directionId: s.merged, level: i % 2 ? "strong" : "weak", score: i % 2 ? 80 : 20, method: "model", directionAt: 1 },
            { directionId: s.kept, level: "some", score: 50, method: "model", directionAt: 1 },
          ],
          fitAt: 1,
        });
    });
  // Reading every role at once is more than one function may read.
  await expect(t.run((ctx) => ctx.db.query("postings").collect())).rejects.toThrow("Read too much data");
  const as = t.withIdentity({ subject: `${(await t.run((ctx) => ctx.db.query("users").first()))!._id}|s` });
  // Each role's verdict for the kept direction, read a page at a time.
  const keptScores = async () => {
    const out: (number | undefined)[] = [];
    for (let cursor: string | null = null, done = false; !done; ) {
      const page = await t.run((ctx) => ctx.db.query("postings").paginate({ cursor, numItems: 200 }));
      out.push(...page.page.map((p) => p.fit?.find((f) => f.directionId === s.kept)?.score));
      cursor = page.continueCursor;
      done = page.isDone;
    }
    return out;
  };

  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const merge = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "merge")!);
  expect(merge).toMatchObject({ status: "done", result: { checked: ROLES + 1, total: ROLES + 1 } });
  const merged = await keptScores();
  expect(merged.filter((x) => x === 80)).toHaveLength(ROLES / 2);
  expect(merged.filter((x) => x === 50)).toHaveLength(ROLES / 2);

  await as.mutation(api.goals.unmerge, { id: s.merged });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const undo = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "unmerge")!);
  expect(undo).toMatchObject({ status: "done", result: { checked: ROLES, total: ROLES } });
  expect((await keptScores()).every((x) => x === 50)).toBe(true);
  expect(await t.run((ctx) => ctx.db.query("mergeMoves").first())).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
}, 180_000);

// Every place a record names a direction, for the zero-reference check.
const references = (t: Awaited<ReturnType<typeof setup>>["t"], id: Id<"items">) =>
  t.run(async (ctx) => {
    const hits: string[] = [];
    for (const c of await ctx.db.query("companies").collect()) if (c.fit?.some((f) => f.directionId === id) || c.found.some((f) => f.directionId === id)) hits.push(`company ${c.name}`);
    for (const p of await ctx.db.query("postings").collect())
      if (p.fit?.some((f) => f.directionId === id) || p.sort?.directionIds.includes(id) || p.sort?.against.some((a) => a.directionId === id) || p.rerank?.includes(id)) hits.push(`role ${p.title}`);
    for (const p of await ctx.db.query("pursuits").collect()) if (p.directionId === id) hits.push(`pursuit ${p.title}`);
    for (const r of await ctx.db.query("resumes").collect()) if (r.directionId === id && r.posting !== undefined) hits.push("tailored resume");
    for (const n of await ctx.db.query("notes").collect()) if (n.subject.id === id) hits.push(`note ${n.text}`);
    return hits;
  });

test("what lands for the merged direction while the merge runs goes to the kept one, and nothing is left naming it", async () => {
  const { t, as, s } = await setup();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  const job = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "merge")!);
  await t.mutation(internal.goals.mergePage, { jobId: job._id, phase: "companies", cursor: null, total: 6 });
  await t.mutation(internal.goals.mergePage, { jobId: job._id, phase: "postings", cursor: null, total: 6 });
  // Work that started before the merge lands now: a company's fit judged for both directions (none is kept for the
  // merged one), a note from a page still open (it goes on the kept one), and a role written straight to the table after
  // its page was done (the sweep moves it).
  await t.mutation(internal.enrich.saveFit, { workspaceId: s.w, id: s.quill, fit: [{ directionId: s.merged, level: "strong", reason: "Ops" }, { directionId: s.kept, level: "some", reason: "Ops" }] });
  expect((await t.run((ctx) => ctx.db.get(s.quill)))!.fit!.map((f) => f.directionId)).toEqual([s.kept]);
  const note = await as.mutation(api.notes.add, { subject: { kind: "item", id: s.merged }, text: "Board deck is due Friday." });
  expect((await t.run((ctx) => ctx.db.get(note)))!.subject).toEqual({ kind: "item", id: s.kept });
  const late = await t.run((ctx) =>
    ctx.db.insert("postings", {
      workspaceId: s.w, companyId: s.harbor, provider: "greenhouse", externalId: "late", url: "https://jobs.example/late", title: "Late Role", remote: true, firstSeen: 0, lastSeen: 0,
      fit: [{ directionId: s.merged, level: "strong", score: 77, method: "model", directionAt: 1 }], fitAt: 1,
    }),
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const done = await t.run(async (ctx) => (await ctx.db.get(job._id))!);
  expect(done.status).toBe("done");
  expect(done.result.swept).toBeGreaterThanOrEqual(1);
  expect(await references(t, s.merged)).toEqual([]);
  expect((await t.run((ctx) => ctx.db.get(late)))!.fit).toMatchObject([{ directionId: s.kept, score: 77 }]);
  expect(fetch).not.toHaveBeenCalled();
});

test("while the merge runs, merging, ranking, filling in or setting aside either direction waits, with why", async () => {
  const { t, as, s } = await setup();
  const other = await t.run((ctx) => ctx.db.insert("items", { workspaceId: s.w, kind: "direction", status: "approved", data: { name: "Founder" }, sources: [], at: 0 }));
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  const why = "Startup Operations is still being merged into Chief of Staff. Try again when it’s done.";
  await expect(as.mutation(api.goals.merge, { id: other, into: s.kept })).rejects.toThrow(why);
  await expect(as.mutation(api.roles.rankAgain, { directionId: s.kept })).rejects.toThrow(why);
  await expect(as.mutation(api.directions.detail, { id: s.kept })).rejects.toThrow(why);
  await expect(as.mutation(api.extract.review, { id: s.kept, status: "rejected" })).rejects.toThrow(why);
  expect((await as.query(api.directions.list, {})).directions.find((d) => d.id === s.kept)?.merge).toBe("merging");
  // Another direction is free.
  await as.mutation(api.extract.review, { id: other, status: "rejected" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await as.query(api.directions.list, {})).directions.find((d) => d.id === s.kept)?.merge).toBeNull();
  await as.mutation(api.roles.rankAgain, { directionId: s.kept });
});

test("while Undo runs, both directions say so and what would clash waits, with why", async () => {
  const { t, as, s } = await setup();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await as.mutation(api.goals.unmerge, { id: s.merged });
  const list = (await as.query(api.directions.list, {})).directions;
  expect([s.merged, s.kept].map((id) => list.find((d) => d.id === id)?.merge)).toEqual(["undoing", "undoing"]);
  const why = "The merge of Startup Operations into Chief of Staff is still being undone. Try again when it’s done.";
  for (const id of [s.merged, s.kept]) {
    await expect(as.mutation(api.roles.rankAgain, { directionId: id })).rejects.toThrow(why);
    await expect(as.mutation(api.directions.detail, { id })).rejects.toThrow(why);
    await expect(as.mutation(api.extract.review, { id, status: "rejected" })).rejects.toThrow(why);
  }
  await expect(as.mutation(api.goals.merge, { id: s.merged, into: s.kept })).rejects.toThrow(why);
  await expect(as.mutation(api.goals.merge, { id: s.kept, into: s.merged })).rejects.toThrow(why);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await as.query(api.directions.list, {})).directions.filter((d) => d.merge)).toEqual([]);
  await as.mutation(api.roles.rankAgain, { directionId: s.merged });
});

test("what lands while Undo runs stays, and everything else is back as it was before the merge", async () => {
  const { t, as, s, snapshot } = await setup();
  const before = await snapshot();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await as.mutation(api.goals.unmerge, { id: s.merged });
  // Before the Undo job reaches them: Harbor is judged afresh for both directions, a role gets a fresh verdict for the
  // direction back from the merge, and a note goes on it.
  const fresh = [{ directionId: s.merged, level: "some" as const, reason: "Judged again" }, { directionId: s.kept, level: "none" as const, reason: "Judged again" }];
  await t.mutation(internal.enrich.saveFit, { workspaceId: s.w, id: s.harbor, fit: fresh });
  await t.run(async (ctx) => {
    const p = (await ctx.db.get(s.worse))!;
    await ctx.db.patch(s.worse, { fit: [...p.fit!, { directionId: s.merged, level: "some", score: 64, method: "model", directionAt: 2 }] });
  });
  const note = await as.mutation(api.notes.add, { subject: { kind: "item", id: s.merged }, text: "Ask about the hiring plan." });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.kind === "unmerge")))?.status).toBe("done");

  const after = await snapshot();
  const [harbor, worse] = [after[before.findIndex((r) => r?._id === s.harbor)], after[before.findIndex((r) => r?._id === s.worse)]];
  // What landed during the Undo stays.
  expect(harbor && "fit" in harbor && harbor.fit).toEqual(fresh);
  expect(worse && "fit" in worse && worse.fit?.find((f) => f.directionId === s.merged)).toMatchObject({ level: "some", score: 64 });
  expect(worse && "fit" in worse && worse.fit?.find((f) => f.directionId === s.kept)).toMatchObject({ level: "strong", score: 90 });
  expect((await t.run((ctx) => ctx.db.get(note)))!.subject).toEqual({ kind: "item", id: s.merged });
  // Everything else is as it was.
  const rest = (rows: typeof before) => rows.filter((r) => r?._id !== s.harbor && r?._id !== s.worse);
  expect(rest(after)).toEqual(rest(before));
  expect(await t.run((ctx) => ctx.db.query("mergeMoves").collect())).toEqual([]);
});

test("what was put with the kept direction for the merged one goes back with it on Undo", async () => {
  const { t, as, s } = await setup();
  await as.mutation(api.goals.merge, { id: s.merged, into: s.kept });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  // Work that started before the merge finishes after it: a note from a page still open, a tailored resume, and a
  // company search for the merged direction.
  const note = await as.mutation(api.notes.add, { subject: { kind: "item", id: s.merged }, text: "Ask about the hiring plan." });
  const run = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: s.w, kind: "resume", args: {}, status: "running" }));
  const resume = await t.mutation(internal.resume.save, {
    workspaceId: s.w, runId: run, model: "m", directionId: s.merged, posting: "Operations Role 2 at Quillmark",
    doc: { summary: "", experience: [], skills: [] },
  });
  const search = await t.run((ctx) => ctx.db.insert("jobs", { workspaceId: s.w, kind: "discover", args: {}, status: "running" }));
  await t.mutation(internal.discovery.saveCompanies, { workspaceId: s.w, runId: search, directionId: s.merged, via: "criteria", orgs: [{ apolloId: "a-1", name: "Larkspur Freight" }] });
  const larkspur = await t.run(async (ctx) => (await ctx.db.query("companies").collect()).find((c) => c.name === "Larkspur Freight")!);
  expect(larkspur.found.map((f) => f.directionId)).toEqual([s.kept]);
  expect((await t.run((ctx) => ctx.db.get(note)))!.subject.id).toBe(s.kept);
  expect((await t.run((ctx) => ctx.db.get(resume!)))!.directionId).toBe(s.kept);

  await as.mutation(api.goals.unmerge, { id: s.merged });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run((ctx) => ctx.db.get(note)))!.subject.id).toBe(s.merged);
  expect((await t.run((ctx) => ctx.db.get(resume!)))!.directionId).toBe(s.merged);
  expect((await t.run((ctx) => ctx.db.get(larkspur._id)))!.found.map((f) => f.directionId)).toEqual([s.merged]);
});
