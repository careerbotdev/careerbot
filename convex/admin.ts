import { internal } from "./_generated/api";
import { v } from "convex/values";
import { aiTask, reasoningLevel } from "./aiTasks";
import { saveDefault, saveTask } from "./aiSettings";
import { isKind, itemStatus } from "./itemShapes";
import { internalAction, internalMutation } from "./_generated/server";
import { viaReader } from "./enrich";
import { screenCompanies } from "./screening";
import { rankAgainFor, ranker, saveSortMethod, saveStretch } from "./roles";
import { rubric } from "./roleRubric";
import { tallyApproval } from "./tallies";
import { ensureWorkspace } from "./workspaces";

// Operator-only fixes, run with `npx convex run admin:<name>`. Never callable from a client.

export const setNarrativeKind = internalMutation({
  args: { id: v.id("narratives"), kind: v.union(v.literal("career"), v.literal("goals"), v.literal("note")) },
  handler: async (ctx, { id, kind }) => {
    await ctx.db.patch(id, { kind });
  },
});

export const deleteNarrative = internalMutation({
  args: { id: v.id("narratives") },
  handler: async (ctx, { id }) => {
    const versions = await ctx.db.query("narrativeVersions").withIndex("by_narrative", (q) => q.eq("narrativeId", id)).collect();
    for (const x of versions) await ctx.db.delete(x._id);
    await ctx.db.delete(id);
  },
});

export const setItemStatus = internalMutation({
  args: { id: v.id("items"), status: itemStatus },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status });
  },
});

export const setFactText = internalMutation({
  args: { id: v.id("items"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const item = await ctx.db.get(id);
    if (!item || !isKind("fact")(item)) throw new Error("Not a fact.");
    await ctx.db.patch(id, { data: { ...item.data, text, edited: true }, status: "approved" });
    await tallyApproval(ctx, item, "approved");
  },
});

export const deleteItem = internalMutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const setSuggestion = internalMutation({
  args: { id: v.id("items"), text: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { id, text, note }) => {
    const item = await ctx.db.get(id);
    if (!item || !(isKind("fact")(item) || isKind("insight")(item))) throw new Error("Not a fact or insight.");
    await ctx.db.patch(id, { data: { ...item.data, suggestion: { text, note, at: Date.now() } } });
  },
});

// Operator: a workspace's default model (aiSettings.setDefault). Tasks with their own choice keep it.
export const setAiChoice = internalMutation({
  args: { workspaceId: v.id("workspaces"), model: v.string(), reasoning: v.optional(reasoningLevel) },
  handler: async (ctx, { workspaceId, model, reasoning }) => {
    await saveDefault(ctx, workspaceId, model, reasoning);
  },
});

export const setAiTask = internalMutation({
  args: { workspaceId: v.id("workspaces"), task: aiTask, model: v.string(), reasoning: v.optional(reasoningLevel) },
  handler: async (ctx, { workspaceId, task, model, reasoning }) => {
    await saveTask(ctx, workspaceId, task, model, reasoning);
  },
});

// Operator: start a goals read for a workspace's goals narrative (same job the "Read my goals" button starts).
export const startGoals = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const n = await ctx.db.query("narratives").withIndex("by_workspace_kind", (q) => q.eq("workspaceId", workspaceId).eq("kind", "goals")).first();
    if (!n) throw new Error("No goals narrative.");
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "goals", args: { narrativeId: n._id, version: n.version }, status: "queued", origin: "automatic" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// Operator: start a record-wide job for a workspace (same job its page button starts).
export const startJob = internalMutation({
  args: { workspaceId: v.id("workspaces"), kind: v.union(v.literal("insights"), v.literal("followups"), v.literal("resume"), v.literal("directions"), v.literal("enrich"), v.literal("discover"), v.literal("roles"), v.literal("project"), v.literal("skills")), args: v.optional(v.any()) },
  handler: async (ctx, { workspaceId, kind, args }) => {
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind, args: args ?? { why: "operator" }, status: "queued", origin: "automatic" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// Operator: add a narrative, save a new version, or read one, the same way the page does. Used for trial runs.
export const addNarrative = internalMutation({
  args: { workspaceId: v.id("workspaces"), title: v.string(), body: v.string() },
  handler: async (ctx, { workspaceId, title, body }) => {
    const id = await ctx.db.insert("narratives", { workspaceId, kind: "career", title, body, version: 1, updatedAt: Date.now() });
    await ctx.db.insert("narrativeVersions", { workspaceId, narrativeId: id, version: 1, title, body, at: Date.now() });
    return id;
  },
});

export const saveNarrative = internalMutation({
  args: { id: v.id("narratives"), body: v.string() },
  handler: async (ctx, { id, body }) => {
    const n = (await ctx.db.get(id))!;
    const version = n.version + 1;
    await ctx.db.patch(id, { body, version, updatedAt: Date.now() });
    await ctx.db.insert("narrativeVersions", { workspaceId: n.workspaceId, narrativeId: id, version, title: n.title, body, at: Date.now() });
    return version;
  },
});

export const readNarrative = internalMutation({
  args: { id: v.id("narratives") },
  handler: async (ctx, { id }) => {
    const n = (await ctx.db.get(id))!;
    const done = (await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", n.workspaceId)).collect())
      .filter((j) => j.kind === "extract" && j.args.narrativeId === id && j.status === "done")
      .map((j) => j.args.version as number);
    const fromVersion = done.length ? Math.max(...done) : undefined;
    const jobId = await ctx.db.insert("jobs", { workspaceId: n.workspaceId, kind: "extract", args: { narrativeId: id, version: n.version, again: false, fromVersion }, status: "queued", origin: "automatic" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// Operator: remove a trial narrative and everything read from it.
export const purgeNarrative = internalMutation({
  args: { id: v.id("narratives") },
  handler: async (ctx, { id }) => {
    const n = await ctx.db.get(id);
    if (!n) return 0;
    let removed = 0;
    for (const i of await ctx.db.query("items").collect())
      if (i.workspaceId === n.workspaceId && i.sources.some((s) => s.narrativeId === id)) (await ctx.db.delete(i._id), removed++);
    for (const x of await ctx.db.query("narrativeVersions").withIndex("by_narrative", (q) => q.eq("narrativeId", id)).collect()) await ctx.db.delete(x._id);
    await ctx.db.delete(id);
    return removed;
  },
});

// Operator: a fresh workspace for a fictional test persona (scripts/personas.ts), owned by a user made for it. No one
// signs in as that user; the script acts as it through `convex run --identity`.
export const createTrialWorkspace = internalMutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, { name, email }) => {
    const userId = await ctx.db.insert("users", { name, email });
    const workspaceId = await ensureWorkspace(ctx, userId);
    await ctx.db.patch(workspaceId, { name });
    return { userId, workspaceId };
  },
});

// Operator: a role posting given as text, at a company added by hand, for test personas (scripts/personas.ts). The
// company has no job board, so no roles pass reads one for it or closes the role; the provider is nominal. Rate the
// company (enrich.rate) for its roles to be ranked.
export const addTrialPosting = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    company: v.object({ name: v.string(), domain: v.string() }),
    title: v.string(),
    location: v.optional(v.string()),
    remote: v.boolean(),
    url: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { workspaceId, company, title, location, remote, url, text }) => {
    const at = Date.now();
    const existing = (await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).find((c) => c.domain === company.domain);
    const companyId =
      existing?._id ??
      (await ctx.db.insert("companies", { workspaceId, name: company.name, domain: company.domain, websiteUrl: `https://${company.domain}`, found: [{ via: "hand", at }], at }));
    const postingId = await ctx.db.insert("postings", {
      workspaceId, companyId, provider: "greenhouse", externalId: url, url, title, location, remote,
      descriptionAt: at, hasDescription: true, firstSeen: at, lastSeen: at,
    });
    await ctx.db.insert("postingTexts", { workspaceId, postingId, text: text.slice(0, 8000) });
    return { companyId, postingId };
  },
});

// Operator: read a test persona's repository, given as its README, with the same project read a GitHub repository
// gets (projects.runProject), for test personas (scripts/personas.ts), which have no GitHub App to read through.
export const readTrialProject = internalMutation({
  args: { workspaceId: v.id("workspaces"), repo: v.string(), readme: v.string() },
  handler: async (ctx, { workspaceId, repo, readme }) => {
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "project", args: { repo, trial: { readme } }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// Operator: set a workspace's default seed companies (websites).
export const setSeeds = internalMutation({
  args: { workspaceId: v.id("workspaces"), seeds: v.array(v.string()) },
  handler: async (ctx, { workspaceId, seeds }) => {
    const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    if (row) await ctx.db.patch(row._id, { seeds });
    else await ctx.db.insert("discovery", { workspaceId, seeds, resolved: [] });
  },
});

// Operator: screen a workspace's companies now (same step discovery runs at the end).
export const screenNow = internalAction({
  args: { workspaceId: v.id("workspaces") },
  handler: (ctx, { workspaceId }): Promise<{ byRule: number; byAi: number; costUsd: number }> => screenCompanies(ctx, workspaceId),
});

export const setNamed = internalMutation({
  args: { workspaceId: v.id("workspaces"), named: v.array(v.string()) },
  handler: async (ctx, { workspaceId, named }) => {
    const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    if (row) await ctx.db.patch(row._id, { named });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], named, resolved: [] });
  },
});

// Operator: clear filled-in details that include a job board, so they're read again under current rules.
export const clearBoards = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    let n = 0;
    for (const c of await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      if (c.details?.board) (await ctx.db.patch(c._id, { details: undefined }), n++);
    return n;
  },
});

// Operator: clear filled-in details for companies with no job board found, so they're tried again with new readers.
export const clearNoBoard = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    let n = 0;
    for (const c of await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      if (c.details && !c.details.board) (await ctx.db.patch(c._id, { details: undefined }), n++);
    return n;
  },
});

// Operator: judge fit and goals again for a workspace.
export const rejudge = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    let n = 0;
    for (const c of await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      if (c.fitAt) { await ctx.db.patch(c._id, { fitAt: undefined }); n++; }
    return n;
  },
});

// Operator: what a server fetch of a page actually gets (each hop's status, or the error), for sites that come back empty.
export const probe = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, { url }) => {
    const hops: string[] = [];
    let next = url;
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch(next, { headers: { accept: "text/html", "user-agent": "CareerBot/1.0 (+https://careerbot.dev)" }, redirect: "manual", signal: AbortSignal.timeout(10000) });
        hops.push(`${res.status} ${next} ${res.headers.get("server") ?? ""}`);
        const loc = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && loc) { next = new URL(loc, next).toString(); continue; }
        break;
      } catch (e) {
        hops.push(`error ${next}: ${String(e)}`);
        break;
      }
    }
    return hops;
  },
});

// Operator: what the reader fallback returns for a page (length and the start).
export const probeReader = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, { url }) => {
    const md = await viaReader(url);
    return { length: md.length, start: md.slice(0, 200) };
  },
});

// Operator: stop waiting on checks that can't run (companies with no website).
export const clearStuckRechecks = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    let n = 0;
    for (const c of await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      if (c.recheckAt && !c.domain) { await ctx.db.patch(c._id, { recheckAt: undefined }); n++; }
    return n;
  },
});

// Operator: rank a workspace's open roles again for every approved direction (or one), as roles:rankAgain does for
// them, so every role gets what judging now writes.
export const rankAgain = internalMutation({
  args: { workspaceId: v.id("workspaces"), directionId: v.optional(v.id("items")) },
  handler: (ctx, { workspaceId, directionId }) => rankAgainFor(ctx, workspaceId, "automatic", directionId),
});

// Operator: sort and judge one company's roles again (clears their sort and fit), for timing and prompt checks.
export const rejudgeRoles = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const c = await ctx.db.get(companyId);
    if (!c) return 0;
    const rank = await ranker(ctx, c.workspaceId);
    let n = 0;
    for (const p of await ctx.db.query("postings").withIndex("by_company", (q) => q.eq("companyId", companyId)).collect())
      if (p.fitAt || p.sort) {
        const next = { ...p, fit: undefined, fitAt: undefined, sort: undefined, rerank: undefined };
        await ctx.db.patch(p._id, { fit: undefined, fitAt: undefined, sort: undefined, rerank: undefined });
        await rank.sync(next);
        n++;
      }
    return n;
  },
});

// Operator: stop a workspace's roles pass. The step that's running finishes; nothing after it runs.
export const stopRoles = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    if (row) await ctx.db.patch(row._id, { rolesStoppedAt: Date.now() });
  },
});

// Operator: how a workspace's roles are sorted before judging (roles.setSortMethod, for the owner's workspace).
export const setRoleSort = internalMutation({
  args: { workspaceId: v.id("workspaces"), method: v.union(v.literal("model"), v.literal("jev")) },
  handler: (ctx, { workspaceId, method }) => saveSortMethod(ctx, workspaceId, method),
});

// Operator: whether a workspace's roles are judged counting how big a stretch each is (roles.setStretch), from now on.
export const setStretch = internalMutation({
  args: { workspaceId: v.id("workspaces"), on: v.boolean() },
  handler: (ctx, { workspaceId, on }) => saveStretch(ctx, workspaceId, on),
});

// Operator: apply a rubric (roleRubric.ts) to a workspace once roles:compareRubric was looked at: judging switches to
// it, and every open role is ranked again for every approved direction under it.
export const applyRubric = internalMutation({
  args: { workspaceId: v.id("workspaces"), rubric },
  handler: async (ctx, { workspaceId, rubric: chosen }) => {
    await saveStretch(ctx, workspaceId, chosen === "v2");
    await rankAgainFor(ctx, workspaceId, "automatic");
  },
});

// Operator: forget every failure recorded on a workspace's roles (roles set aside, and the pass's problems), so the
// next pass, or the running one at its next hand-over, queues them again. A page of 500 roles per run, each run
// scheduling the next. Returns how many were cleared on this page.
export const clearRoleFailures = internalMutation({
  args: { workspaceId: v.id("workspaces"), cursor: v.optional(v.string()) },
  handler: async (ctx, { workspaceId, cursor }) => {
    if (!cursor) {
      const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
      if (row?.rolesProblems) await ctx.db.patch(row._id, { rolesProblems: undefined });
    }
    const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate({ cursor: cursor ?? null, numItems: 500 });
    let n = 0;
    for (const p of page.page) if (p.failed) { await ctx.db.patch(p._id, { failed: undefined }); n++; }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.admin.clearRoleFailures, { workspaceId, cursor: page.continueCursor });
    return n;
  },
});
