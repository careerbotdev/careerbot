import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { action, mutation } from "./functions";
import { openrouterHeaders } from "./openrouterApp";
import { AI_TASKS, type AiTask, aiTask, DECISION_TASKS, type ModelChoice, type Reasoning, reasoningLevel } from "./aiTasks";
import { requireWorkspace } from "./workspaces";

// Which model a task uses: its own choice if it has one, else the workspace's default. Decision tasks never use the
// default (it's a chat model, which can't answer them), so they need their own.

const ownRow = (ctx: QueryCtx, workspaceId: Id<"workspaces">, task: AiTask) =>
  ctx.db.query("aiSettings").withIndex("by_workspace_task", (q) => q.eq("workspaceId", workspaceId).eq("task", task)).unique();

const defaultRow = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("aiDefaults").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();

const choiceOf = (row: { model: string; reasoning?: Reasoning } | null): ModelChoice | null => (row ? { model: row.model, reasoning: row.reasoning } : null);

export const choiceFor = internalQuery({
  args: { workspaceId: v.id("workspaces"), task: aiTask },
  handler: async (ctx, { workspaceId, task }): Promise<ModelChoice | null> =>
    choiceOf(await ownRow(ctx, workspaceId, task)) ?? (DECISION_TASKS[task] ? null : choiceOf(await defaultRow(ctx, workspaceId))),
});

// The model and effort a task uses. Fails only when the task has no choice and the workspace has no default yet.
export async function modelFor(ctx: ActionCtx, workspaceId: Id<"workspaces">, task: AiTask): Promise<ModelChoice> {
  const choice = await ctx.runQuery(internal.aiSettings.choiceFor, { workspaceId, task });
  if (!choice) throw new Error(`Choose a model for ${AI_TASKS[task].toLowerCase()} in settings.`);
  return choice;
}

// Every task with the model it uses. `own`: the task has its own choice; otherwise it follows the default (decision
// tasks never do, so without their own they have none).
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const fallback = choiceOf(await defaultRow(ctx, workspaceId));
    return Promise.all(
      (Object.keys(AI_TASKS) as AiTask[]).map(async (task) => {
        const own = choiceOf(await ownRow(ctx, workspaceId, task));
        const decision = !!DECISION_TASKS[task];
        return { task, label: AI_TASKS[task], decision, own: own !== null, choice: own ?? (decision ? null : fallback) };
      }),
    );
  },
});

export const defaultChoice = query({
  args: {},
  handler: async (ctx): Promise<ModelChoice | null> => {
    const { workspaceId } = await requireWorkspace(ctx);
    return choiceOf(await defaultRow(ctx, workspaceId));
  },
});

export async function saveDefault(ctx: MutationCtx, workspaceId: Id<"workspaces">, model: string, reasoning?: Reasoning) {
  if (!model.trim()) throw new Error("Choose a model.");
  const fields = { model: model.trim(), reasoning };
  const row = await defaultRow(ctx, workspaceId);
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("aiDefaults", { workspaceId, ...fields });
}

// The model every task without its own choice uses (first-time setup, or after a comparison). Decision tasks keep theirs.
export const setDefault = mutation({
  args: { model: v.string(), reasoning: v.optional(reasoningLevel) },
  handler: async (ctx, { model, reasoning }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await saveDefault(ctx, workspaceId, model, reasoning);
  },
});

export async function saveTask(ctx: MutationCtx, workspaceId: Id<"workspaces">, task: AiTask, model: string, reasoning?: Reasoning) {
  if (!model.trim()) throw new Error("Choose a model.");
  const fields = { model: model.trim(), reasoning };
  const row = await ownRow(ctx, workspaceId, task);
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("aiSettings", { workspaceId, task, ...fields });
}

// A task's own model, used instead of the default.
export const set = mutation({
  args: { task: aiTask, model: v.string(), reasoning: v.optional(reasoningLevel) },
  handler: async (ctx, { task, model, reasoning }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await saveTask(ctx, workspaceId, task, model, reasoning);
  },
});

// Drop a task's own model, so it follows the default again.
export const clearTask = mutation({
  args: { task: aiTask },
  handler: async (ctx, { task }) => {
    if (DECISION_TASKS[task]) throw new Error(`${AI_TASKS[task]} needs its own model.`);
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await ownRow(ctx, workspaceId, task);
    if (row) await ctx.db.delete(row._id);
  },
});

// Operator, once: each workspace without a default gets the choice (model and effort) most of its chat tasks use as its
// default, and those tasks' own rows go, so they follow it. Tasks with a different choice keep theirs, so every task
// runs as before. A workspace that has a default is left alone, so running it again changes nothing.
export const adoptDefault = internalMutation({
  args: {},
  handler: async (ctx) => {
    let adopted = 0;
    for (const w of await ctx.db.query("workspaces").collect()) {
      if (await defaultRow(ctx, w._id)) continue;
      const rows = (await ctx.db.query("aiSettings").withIndex("by_workspace_task", (q) => q.eq("workspaceId", w._id)).collect()).filter((r) => !DECISION_TASKS[r.task]);
      const key = (r: { model: string; reasoning?: Reasoning }) => `${r.model}\n${r.reasoning ?? ""}`;
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
      const top = rows.reduce<(typeof rows)[number] | null>((best, r) => (!best || counts.get(key(r))! > counts.get(key(best))! ? r : best), null);
      if (!top) continue;
      await saveDefault(ctx, w._id, top.model, top.reasoning);
      for (const r of rows) if (key(r) === key(top)) await ctx.db.delete(r._id);
      adopted++;
    }
    return { adopted };
  },
});

export type CatalogModel = {
  id: string;
  name: string;
  inPerM: number;
  outPerM: number;
  contextLength: number;
  reasoning: boolean;
  json: boolean;
};

async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", { headers: openrouterHeaders() });
  if (!res.ok) throw new Error("Couldn't load the model list from OpenRouter.");
  const body: { data: { id: string; name: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }[] } =
    await res.json();
  return body.data.map((m) => ({
    id: m.id,
    name: m.name,
    inPerM: Number(m.pricing?.prompt ?? 0) * 1e6,
    outPerM: Number(m.pricing?.completion ?? 0) * 1e6,
    contextLength: m.context_length ?? 0,
    reasoning: (m.supported_parameters ?? []).includes("reasoning"),
    json: (m.supported_parameters ?? []).includes("response_format"),
  }));
}

// Every model OpenRouter offers right now, so choices never depend on what existed when the code was written.
export const catalog = action({
  args: {},
  handler: fetchCatalog,
});

// A short list to pick the default from, for people who don't want to browse the whole catalog. Ids are OpenRouter's;
// prices come from the live catalog, so only the list itself can go stale.
export const RECOMMENDED: { id: string; description: string }[] = [
  { id: "deepseek/deepseek-v4.1-flash", description: "Low cost and quick. Handles everyday reading, sorting and screening well." },
  { id: "openai/gpt-6-luna", description: "The lowest cost here. Fine for most tasks." },
  { id: "google/gemini-3.8-flash", description: "In between: more careful than the low-cost models, still quick." },
  { id: "anthropic/claude-sonnet-5.5", description: "The strongest writer here, for resumes, letters and outreach. Costs several times more." },
];

const USAGE_DAYS = 30;
const USAGE_PAGE = 2000;

// One page of the workspace's AI calls since `since`: tokens, and which models answered them.
export const usagePage = internalQuery({
  args: { since: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { since, cursor }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const page = await ctx.db
      .query("usage")
      .withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", workspaceId).eq("service", "openrouter").gte("at", since))
      .paginate({ cursor, numItems: USAGE_PAGE });
    const decisionModels = (await Promise.all((Object.keys(DECISION_TASKS) as AiTask[]).map((t) => ownRow(ctx, workspaceId, t)))).flatMap((r) => (r ? [r.model] : []));
    let inputTokens = 0;
    let outputTokens = 0;
    for (const u of page.page) {
      // Decision models answer their own tasks whatever the default is; OpenRouter reports them with a dated id.
      if (u.model && decisionModels.some((m) => u.model === m || u.model!.startsWith(`${m}-`))) continue;
      inputTokens += u.inputTokens ?? 0;
      outputTokens += u.outputTokens ?? 0;
    }
    return { inputTokens, outputTokens, cursor: page.continueCursor, done: page.isDone };
  },
});

export type Recommended = {
  id: string;
  name: string;
  description: string;
  // Null when OpenRouter no longer lists the model.
  price: { inPerM: number; outPerM: number; reasoning: boolean } | null;
  // The workspace's last 30 days of AI work (decision tasks aside) at this model's prices; null without a price.
  monthlyUsd: number | null;
};

// The recommended models with today's prices and what a month like the workspace's last one would cost on each.
export const recommended = action({
  args: {},
  handler: async (ctx): Promise<{ usage: { days: number; inputTokens: number; outputTokens: number }; models: Recommended[] }> => {
    const since = Date.now() - USAGE_DAYS * 24 * 60 * 60 * 1000;
    const usage = { days: USAGE_DAYS, inputTokens: 0, outputTokens: 0 };
    for (let cursor: string | null = null; ; ) {
      const page: { inputTokens: number; outputTokens: number; cursor: string; done: boolean } = await ctx.runQuery(internal.aiSettings.usagePage, { since, cursor });
      usage.inputTokens += page.inputTokens;
      usage.outputTokens += page.outputTokens;
      if (page.done) break;
      cursor = page.cursor;
    }
    const catalog = await fetchCatalog();
    const models = RECOMMENDED.map(({ id, description }) => {
      const m = catalog.find((c) => c.id === id);
      return {
        id,
        name: m?.name ?? id,
        description,
        price: m ? { inPerM: m.inPerM, outPerM: m.outPerM, reasoning: m.reasoning } : null,
        monthlyUsd: m ? (usage.inputTokens * m.inPerM + usage.outputTokens * m.outPerM) / 1e6 : null,
      };
    });
    return { usage, models };
  },
});

export type { Reasoning };
