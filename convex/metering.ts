import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { openrouterHeaders } from "./openrouterApp";
import type { Reasoning } from "./aiTasks";
import { APOLLO_CREDITS } from "./apolloPricing";
import { addAiSpend, BUDGET_REACHED, type BudgetReached, monthStart, resumeHeld } from "./budgets";
import { priceOf, worstCase } from "./modelPrices";
import { apolloBalance, apolloKeyFor } from "./apolloKey";
import { openrouterKeyFor } from "./openrouterKey";
import { CutOffReply, parseReplyJson, type ReplySchema, UnreadableReply } from "./replyJson";
import { addSpend } from "./tallies";

// The only way CareerBot calls OpenRouter or Apollo. Each call reserves the most it could cost against the workspace
// budget first (budgets.reserve), then settles its usage row with what was actually charged and gives back the rest. A
// call that may have been charged more than it could tell is left indeterminate, still holding its reservation, and the
// daily check (reconcile) settles it.

// What a paid call is spent on: the job it runs in, who started that job, and the pursuit it's for. It rides on the
// action's ctx, so every call a job makes carries it without each step passing it on: jobs.run sets it for every job,
// the roles pass for its workers (roles.work), and an action the person calls directly sets its own (people.ts).
export type SpentFor = { jobId?: Id<"jobs">; origin?: Doc<"jobs">["origin"]; pursuitId?: Id<"pursuits"> };
type MeteredCtx = ActionCtx & { spentFor?: SpentFor };
export function spendingFor(ctx: ActionCtx, spentFor: SpentFor): ActionCtx {
  return { ...ctx, spentFor } as MeteredCtx;
}

export const settle = internalMutation({
  args: {
    usageId: v.id("usage"),
    ok: v.boolean(),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    credits: v.optional(v.number()),
    generationId: v.optional(v.string()),
    // Unset: settled. Indeterminate: what's recorded may be short; lookup and unseen say what's left to find out.
    state: v.optional(v.literal("indeterminate")),
    lookup: v.optional(v.array(v.string())),
    unseen: v.optional(v.number()),
  },
  handler: async (ctx, { usageId, state, ...patch }) => {
    const row = await ctx.db.get(usageId);
    if (!row) return;
    // An indeterminate call keeps what it holds until the daily check knows what it cost.
    const release = state === "indeterminate" ? 0 : (row.reservedUsd ?? 0);
    const next = { ...patch, state: state ?? ("settled" as const), ...(release ? { reservedUsd: undefined } : {}) };
    await ctx.db.patch(usageId, next);
    if (row.service === "openrouter") await addAiSpend(ctx, row.workspaceId, row.at, { usd: (patch.costUsd ?? 0) - (row.costUsd ?? 0), held: -release });
    if (release) await resumeHeld(ctx, row.workspaceId);
    await addSpend(ctx, { ...row, ...next });
  },
});

// Every AI call records itself as reserved before it's made, holding `amount` (the most it could cost) against the
// budget; budgets.reserve refuses it when that doesn't fit. Settling replaces what it holds with its real cost.
async function reserveAi(ctx: MeteredCtx, args: { workspaceId: Id<"workspaces">; purpose: string; model: string; amount: number }) {
  return ctx.runMutation(internal.budgets.reserve, { ...args, ...ctx.spentFor, service: "openrouter", automated: true });
}

// Reply tokens a call may use (max_tokens, reasoning included), unless it asks for more; replies seen reach about 20,000.
// Long writing (resumes, skills, directions) has seen over 50,000 and asks for LONG_REPLY_TOKENS. A model that can't
// write that much gets its own most.
const REPLY_TOKENS = 32_000;
export const LONG_REPLY_TOKENS = 96_000;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
// What one call answered: its words, what it cost, the model that answered (an alias resolves to a specific one), its
// tokens, and whether it stopped at max_tokens before it was done (cutOff).
export type ChatReply = { text: string; costUsd: number; model: string; inputTokens?: number; outputTokens?: number; cutOff?: boolean };
// A reply's schema (replyJson.ReplySchema) goes as structured output to a model a provider of which keeps to one
// (modelPrices: structured).
type ChatArgs = { workspaceId: Id<"workspaces">; purpose: string; model: string; messages: ChatMessage[]; json?: boolean; schema?: ReplySchema; reasoning?: Reasoning; maxTokens?: number };

type OpenRouterResponse = {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; metadata?: { limit_source?: string; raw?: string } };
};

// One chat call: the budget is checked, the model's price read (modelPrices), and the call reserves the most it could
// cost (its prompt at one token a byte, and a reply of max_tokens) before it's sent with that max_tokens, so it can't
// cost more than it holds.
export async function chat(ctx: ActionCtx, args: ChatArgs): Promise<ChatReply> {
  const key = await openrouterKeyFor(ctx, args.workspaceId);
  if (!key) throw new Error("Add your OpenRouter key in settings first.");
  // A budget that's unset or used up stops the call before OpenRouter is asked anything.
  const blocked = await ctx.runQuery(internal.budgets.aiCheck, { workspaceId: args.workspaceId });
  if (blocked) throw new ConvexError({ code: BUDGET_REACHED, service: "openrouter", message: blocked } satisfies BudgetReached);
  const price = await priceOf(ctx, args.model);
  if (!price.fixed) throw new Error(`${args.model} has no set price, so its cost can't be kept within your AI budget. Choose another model in AI settings.`);
  const maxTokens = Math.min(args.maxTokens ?? REPLY_TOKENS, price.maxTokens ?? Infinity);
  // usage.include asks OpenRouter to report the real dollar cost of this call. JSON mode alone isn't kept by every
  // provider (Anthropic's models write what they like under it), so a reply with a schema goes as structured output,
  // only to the providers that keep it (require_parameters), when the model has one.
  const structured = args.json && args.schema && price.structured;
  const request = JSON.stringify({
    model: args.model,
    messages: args.messages,
    usage: { include: true },
    max_tokens: maxTokens,
    ...(structured ? { response_format: { type: "json_schema", json_schema: { ...args.schema, strict: true } }, provider: { require_parameters: true } } : args.json ? { response_format: { type: "json_object" } } : {}),
    ...(args.reasoning ? { reasoning: { effort: args.reasoning } } : {}),
  });
  // The prompt is at most one token per byte of the request: byte-level BPE tokenizers (GPT, Llama, Qwen, DeepSeek) never
  // make a token of less than a byte, nor do SentencePiece ones with byte fallback, and the request's JSON (about 30
  // bytes a message) outweighs the few tokens a chat template adds to each. No provider takes more than the model's
  // context.
  const promptTokens = Math.min(new TextEncoder().encode(request).length, price.context ?? Infinity);
  const usageId = await reserveAi(ctx, { workspaceId: args.workspaceId, purpose: args.purpose, model: args.model, amount: worstCase(price, promptTokens, maxTokens) });
  let res: Response;
  let body: OpenRouterResponse = {};
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openrouterHeaders({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
      body: request,
    });
    body = await res.json().catch(() => ({}));
  } catch (e) {
    // It failed on its way, so OpenRouter may have charged for it, with no reply to say what.
    await ctx.runMutation(internal.metering.settle, { usageId, ok: false, costUsd: 0, state: "indeterminate", unseen: 1 });
    throw e;
  }
  // An answer that doesn't say what it cost was still charged: its generation is looked up later (reconcile).
  const unknownCost = res.ok && body.usage?.cost === undefined;
  await ctx.runMutation(internal.metering.settle, {
    usageId,
    ok: res.ok,
    model: body.model ?? args.model,
    inputTokens: body.usage?.prompt_tokens,
    outputTokens: body.usage?.completion_tokens,
    costUsd: body.usage?.cost ?? 0,
    generationId: body.id,
    ...(unknownCost ? { state: "indeterminate" as const, ...(body.id ? { lookup: [body.id] } : { unseen: 1 }) } : {}),
  });
  if (!res.ok) throw new OpenRouterError(body.error?.message ?? `OpenRouter returned ${res.status}.`, res.status, retryAfterMs(res.headers.get("retry-after")), body.error?.metadata?.limit_source, body.error?.metadata?.raw);
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    costUsd: body.usage?.cost ?? 0,
    model: body.model ?? args.model,
    inputTokens: body.usage?.prompt_tokens,
    outputTokens: body.usage?.completion_tokens,
    // OpenRouter normalizes every provider's stop reason; "length" is max_tokens reached.
    ...(body.choices?.[0]?.finish_reason === "length" ? { cutOff: true } : {}),
  };
}

// Claude's structured output builds a reply's schema into a grammar of limited size and refuses a larger one (the
// goals reply's limit rules).
const TOO_LARGE = /grammar is too large|schema is too complex/i;

// One AI call that must answer in JSON, read with parseReplyJson; every step that reads a model's JSON comes through here,
// with its reply's schema (chat sends it as structured output where the model keeps to one; a schema the provider
// refuses as too large is asked for again in JSON mode).
// A reply that stopped at max_tokens (its JSON unfinished, so none of it is used) or that isn't readable JSON is asked
// for once more, a cut-off one with room for twice the tokens (chat caps it at the model's own most). The second call
// is metered like any other, as "<purpose>: retry", so it's held against the budget and shows in spending under the
// same task; the reply's costUsd is both calls'. When the second fails too, the step fails with a message to try again.
export async function chatJson<T>(ctx: ActionCtx, args: Omit<ChatArgs, "json" | "schema"> & { schema: ReplySchema }): Promise<ChatReply & { out: T }> {
  let costUsd = 0;
  let maxTokens = args.maxTokens;
  for (let attempt = 0; ; attempt++) {
    const ask = { ...args, json: true, maxTokens, purpose: attempt ? `${args.purpose}: retry` : args.purpose };
    const reply = await chat(ctx, ask).catch((e: unknown) => {
      if (e instanceof OpenRouterError && e.status === 400 && TOO_LARGE.test(e.providerSaid ?? "")) return chat(ctx, { ...ask, schema: undefined });
      throw e;
    });
    costUsd += reply.costUsd;
    try {
      if (reply.cutOff) throw new CutOffReply(reply.text);
      return { ...reply, costUsd, out: parseReplyJson<T>(reply.text) };
    } catch (e) {
      if (attempt >= 1 || !(e instanceof UnreadableReply)) throw e;
      if (reply.cutOff) maxTokens = 2 * (args.maxTokens ?? REPLY_TOKENS);
    }
  }
}

// A call OpenRouter refused, with its status, how long it asked us to wait (Retry-After), which of its limits said no,
// and what the provider behind it said.
export class OpenRouterError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs?: number, readonly source?: string, readonly providerSaid?: string) {
    super(message);
  }
}

// Retry-After is seconds or a date.
export function retryAfterMs(header: string | null) {
  if (!header) return undefined;
  const s = Number(header);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

// Statuses that mean "busy, try again": rate limited, timed out, or the provider behind OpenRouter is down for a moment.
const TRANSIENT = new Set([408, 429, 502, 503, 504]);

// Runs an AI call again when OpenRouter is busy (or the request never got there), waiting as long as it asks, else
// 2, 4, 8, 16 then 30 seconds with some jitter so many workers don't retry in step. Any other error is thrown at once.
export async function withBackoff<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      // 402 is usually out of credits, except when too many paid calls are running at once (OpenRouter's in-flight budget).
      const busy = e instanceof OpenRouterError ? TRANSIENT.has(e.status) || (e.status === 402 && e.source === "openrouter_in_flight_budget") : e instanceof TypeError;
      if (!busy || attempt >= tries) throw e;
      const asked = e instanceof OpenRouterError ? e.retryAfterMs : undefined;
      const wait = Math.min(60_000, asked ?? Math.min(30_000, 1000 * 2 ** attempt)) + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Every Apollo call goes through here: it reads the account's credit balance first (free), reserves the credits against
// that balance and the person's own cap, calls Apollo, then settles. A call Apollo refuses is settled at 0 credits; one
// that fails on its way is indeterminate, still holding its credits, until the daily check compares Apollo's own count.
export async function apollo(
  ctx: MeteredCtx,
  args: { workspaceId: Id<"workspaces">; purpose: string; endpoint: keyof typeof APOLLO_CREDITS; params: Record<string, string | number | string[]>; automated: boolean; path?: string; method?: "GET" | "POST" },
) {
  const key = await apolloKeyFor(ctx, args.workspaceId);
  if (!key) throw new Error("Add your Apollo key in settings first.");
  const balance = await apolloBalance(key);
  const credits = APOLLO_CREDITS[args.endpoint];
  const usageId = await ctx.runMutation(internal.budgets.reserve, {
    ...ctx.spentFor,
    workspaceId: args.workspaceId,
    service: "apollo",
    automated: args.automated,
    amount: credits,
    purpose: args.purpose,
    endpoint: args.endpoint,
    accountLeft: balance?.left,
    cycleStart: balance?.cycleStart,
  });
  const qs = new URLSearchParams();
  for (const [k, x] of Object.entries(args.params)) for (const item of Array.isArray(x) ? x : [x]) qs.append(Array.isArray(x) ? `${k}[]` : k, String(item));
  let res: Response;
  try {
    res = await fetch(`https://api.apollo.io/api/v1/${args.path ?? args.endpoint}?${qs}`, { method: args.method ?? "POST", headers: { "x-api-key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" } });
  } catch (e) {
    await ctx.runMutation(internal.metering.settle, { usageId, ok: false, credits, state: "indeterminate" });
    throw e;
  }
  await ctx.runMutation(internal.metering.settle, { usageId, ok: res.ok, credits: res.ok ? credits : 0 });
  if (!res.ok) throw new Error(res.status === 401 ? "Apollo didn't accept your key." : res.status === 403 ? "Your Apollo plan or key doesn't allow this search." : res.status === 429 ? "Apollo's rate limit was hit. Try again in a while." : `Apollo returned ${res.status}.`);
  return res.json() as Promise<unknown>;
}

// A question for a decision model: "noul" asks yes or no and returns the probability of yes; "choice" picks one of the
// criteria's options; "score" places the state on the criteria's ordered levels. Question ids are ours; the model never
// sees them, so the instructions carry the whole question.
export type DecisionQuestion =
  | { type: "noul"; instructions: unknown; criteria?: { true: unknown; false: unknown } }
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "score"; instructions: unknown; criteria: unknown[] };
export type DecisionAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: "score"; score: number; confidence?: number; probabilities?: Record<string, number> };
export type Decision = { state: unknown; questions: Record<string, DecisionQuestion> };

type RawAnswer = { type?: unknown; noul?: unknown; choice?: unknown; score?: unknown; confidence?: unknown; probabilities?: unknown };
type DecisionsResponse = {
  id?: string;
  model?: string;
  answers?: Record<string, RawAnswer | undefined>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  error?: { message?: string; metadata?: { limit_source?: string } };
};

// One answer, when it has the type the question was asked as and that type's value.
function readAnswer(q: DecisionQuestion, a: RawAnswer | undefined): DecisionAnswer | null {
  if (!a || a.type !== q.type) return null;
  const confidence = typeof a.confidence === "number" ? a.confidence : undefined;
  const probabilities =
    a.probabilities && typeof a.probabilities === "object"
      ? Object.fromEntries(Object.entries(a.probabilities).filter((e): e is [string, number] => typeof e[1] === "number"))
      : undefined;
  if (q.type === "noul") return typeof a.noul === "number" ? { type: "noul", noul: a.noul } : null;
  if (q.type === "choice") return typeof a.choice === "string" ? { type: "choice", choice: a.choice, confidence, probabilities } : null;
  return typeof a.score === "number" ? { type: "score", score: a.score, confidence, probabilities } : null;
}

// Every question answered; anything missing means the reply can't be used.
function readAnswers(questions: Record<string, DecisionQuestion>, answers: DecisionsResponse["answers"]): Record<string, DecisionAnswer> {
  const out: Record<string, DecisionAnswer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = readAnswer(q, answers?.[id]);
    if (!a) throw new Error(`The decision model didn't answer "${id}".`);
    out[id] = a;
  }
  return out;
}

// Decision models (Jev) through OpenRouter's Decisions API: a state and typed questions in, typed answers with
// probabilities out, no text. Each decision is one request, and a group of them is sent together: they share one budget
// reservation and one usage row, settled with their summed cost, so hundreds of decisions record as one call. Busy
// replies are retried (withBackoff). The group fails when any decision fails, after every request in it has finished,
// so what was charged is always recorded; requests that failed on their way or whose answer didn't say what it cost
// leave the row indeterminate, for the daily check.
export async function decide(ctx: ActionCtx, args: { workspaceId: Id<"workspaces">; purpose: string; model: string; decisions: Decision[] }) {
  const key = await openrouterKeyFor(ctx, args.workspaceId);
  if (!key) throw new Error("Add your OpenRouter key in settings first.");
  const price = await priceOf(ctx, args.model);
  if (!price.fixed || !price.context) throw new Error(`${args.model} has no set price, so its cost can't be kept within your AI budget. Choose another model in AI settings.`);
  // A decision can't be sent max_tokens, but its state, questions and answer together fit the model's context, so each
  // costs at most its context in tokens at the higher of its prompt and reply prices (Jev: $0.042 a million prompt
  // tokens, answers free, 32,000 tokens), plus the price per request. The group holds that for every decision in it.
  const each = worstCase({ ...price, prompt: Math.max(price.prompt, price.completion) }, price.context, 0);
  const usageId = await reserveAi(ctx, { workspaceId: args.workspaceId, purpose: args.purpose, model: args.model, amount: each * args.decisions.length });
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let model = args.model;
  const lookup: string[] = [];
  let unseen = 0;
  const one = async (d: Decision) => {
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/alpha/decisions", {
        method: "POST",
        headers: openrouterHeaders({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
        body: JSON.stringify({ model: args.model, state: d.state, questions: d.questions }),
      });
    } catch (e) {
      unseen++;
      throw e;
    }
    const body: DecisionsResponse = await res.json().catch(() => ({}));
    // Output is free for decision models; usage.cost is what the input cost.
    costUsd += body.usage?.cost ?? 0;
    if (res.ok && body.usage?.cost === undefined) {
      if (body.id) lookup.push(body.id);
      else unseen++;
    }
    inputTokens += body.usage?.input_tokens ?? 0;
    outputTokens += body.usage?.output_tokens ?? 0;
    if (!res.ok) throw new OpenRouterError(body.error?.message ?? `OpenRouter returned ${res.status}.`, res.status, retryAfterMs(res.headers.get("retry-after")), body.error?.metadata?.limit_source);
    model = body.model ?? model;
    return readAnswers(d.questions, body.answers);
  };
  const done = await Promise.allSettled(args.decisions.map((d) => withBackoff(() => one(d))));
  const failed = done.find((r): r is PromiseRejectedResult => r.status === "rejected");
  const unsure = lookup.length || unseen ? { state: "indeterminate" as const, ...(lookup.length ? { lookup } : {}), ...(unseen ? { unseen } : {}) } : {};
  await ctx.runMutation(internal.metering.settle, { usageId, ok: !failed, model, inputTokens, outputTokens, costUsd, ...unsure });
  if (failed) throw failed.reason;
  return { answers: done.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])), costUsd, model };
}

// The daily check on calls that may have cost more than recorded, run by crons.ts. An AI call's generations
// are looked up in OpenRouter's own record of what each was charged; once every one is known the call is settled, and
// when some request got no reply at all (nothing to look up) it's unresolved, with what's known. An Apollo call that
// failed on its way is checked against Apollo's own count of credits used this billing cycle: what Apollo counts beyond
// the cycle's settled calls was charged for these, oldest first, and the rest cost nothing; one from before the cycle
// can't be checked and is unresolved. A call still reserved long after any run could still be going was cut off (a
// deploy, a crash) and is checked the same way.

// Actions stop after 10 minutes, so a call reserved an hour ago was cut off.
const CUT_OFF_MS = 60 * 60 * 1000;
// OpenRouter may take a moment to have a generation's figures: one it still doesn't know after a day was never charged.
const LOOKUP_GRACE_MS = 24 * 60 * 60 * 1000;
// A call that still can't be checked after a week (no key to ask with, Apollo's count unreadable) is left unresolved.
const GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;
// Calls checked per workspace and service a day.
const CHECK_BATCH = 200;

// A workspace's calls waiting on the check for one service, oldest first: indeterminate ones, and reserved ones that
// were cut off.
async function waiting(ctx: QueryCtx, workspaceId: Id<"workspaces">, service: Doc<"usage">["service"]) {
  const inState = (state: "indeterminate" | "reserved", before: number) =>
    ctx.db
      .query("usage")
      .withIndex("by_workspace_state", (q) => q.eq("workspaceId", workspaceId).eq("state", state).lte("at", before))
      .filter((q) => q.eq(q.field("service"), service))
      .take(CHECK_BATCH);
  return [...(await inState("indeterminate", Date.now())), ...(await inState("reserved", Date.now() - CUT_OFF_MS))].sort((a, b) => a.at - b.at);
}

export const unsettled = internalQuery({
  args: { workspaceId: v.id("workspaces"), service: v.union(v.literal("openrouter"), v.literal("apollo")) },
  handler: async (ctx, { workspaceId, service }): Promise<Pick<Doc<"usage">, "_id" | "at" | "state" | "lookup" | "unseen">[]> =>
    (await waiting(ctx, workspaceId, service)).map((r) => ({ _id: r._id, at: r.at, state: r.state, lookup: r.lookup, unseen: r.unseen })),
});

// The workspaces whose spending is settled: not the demo (demo.ts), which makes no calls and must not change.
export const workspaces = internalQuery({ args: {}, handler: async (ctx) => (await ctx.db.query("workspaces").collect()).filter((w) => !w.demo).map((w) => w._id) });

// What OpenRouter charged for one generation: its cost, "none" when it has no such generation, null when it couldn't say.
async function generationCost(key: string, id: string): Promise<number | "none" | null> {
  const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`, { headers: openrouterHeaders({ Authorization: `Bearer ${key}` }) }).catch(() => null);
  if (res?.status === 404) return "none";
  const body = (await res?.json().catch(() => null)) as { data?: { total_cost?: unknown } } | null;
  return res?.ok && typeof body?.data?.total_cost === "number" ? body.data.total_cost : null;
}

export const reconcile = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const workspaceId of await ctx.runQuery(internal.metering.workspaces, {})) {
      const ai = await ctx.runQuery(internal.metering.unsettled, { workspaceId, service: "openrouter" });
      const key = ai.length ? await openrouterKeyFor(ctx, workspaceId) : null;
      for (const row of ai) {
        // A cut-off call never got a reply: nothing to look up.
        const ids = row.state === "reserved" ? [] : (row.lookup ?? []);
        const unseen = row.state === "reserved" ? 1 : (row.unseen ?? 0);
        const costs = key ? await Promise.all(ids.map((id) => generationCost(key, id))) : ids.map(() => null);
        const late = now - row.at > LOOKUP_GRACE_MS;
        const open = costs.some((c) => c === null || (c === "none" && !late));
        if (open && now - row.at <= GIVE_UP_MS) continue;
        const addUsd = costs.reduce<number>((n, c) => n + (typeof c === "number" ? c : 0), 0);
        await ctx.runMutation(internal.metering.resolve, { usageId: row._id, addUsd, unresolved: open || unseen > 0 });
      }
      if (!(await ctx.runQuery(internal.metering.unsettled, { workspaceId, service: "apollo" })).length) continue;
      const apolloKey = await apolloKeyFor(ctx, workspaceId);
      const balance = apolloKey ? await apolloBalance(apolloKey) : null;
      await ctx.runMutation(internal.metering.settleApollo, { workspaceId, consumed: balance?.consumed, cycleStart: balance?.cycleStart });
    }
  },
});

// An AI call checked: what the lookups found is added to it, and it's settled, or unresolved when some of it couldn't be
// known. A call that settled on its own meanwhile is left alone.
export const resolve = internalMutation({
  args: { usageId: v.id("usage"), addUsd: v.number(), unresolved: v.boolean() },
  handler: async (ctx, { usageId, addUsd, unresolved }) => {
    const row = await ctx.db.get(usageId);
    if (!row || row.service !== "openrouter" || !(row.state === "indeterminate" || row.state === "reserved")) return;
    const next = { costUsd: (row.costUsd ?? 0) + addUsd, state: unresolved ? ("unresolved" as const) : ("settled" as const), lookup: undefined, unseen: undefined, reservedUsd: undefined };
    await ctx.db.patch(usageId, next);
    await addAiSpend(ctx, row.workspaceId, row.at, { usd: addUsd, held: -(row.reservedUsd ?? 0) });
    if (row.reservedUsd) await resumeHeld(ctx, row.workspaceId);
    await addSpend(ctx, { ...row, ...next });
  },
});

// A workspace's unsettled Apollo calls against Apollo's own count of credits used this cycle (consumed, since
// cycleStart). Without Apollo's count, only calls past GIVE_UP_MS are touched: unresolved.
export const settleApollo = internalMutation({
  args: { workspaceId: v.id("workspaces"), consumed: v.optional(v.number()), cycleStart: v.optional(v.number()) },
  handler: async (ctx, { workspaceId, consumed, cycleStart }) => {
    const now = Date.now();
    const cycle = await ctx.db
      .query("usage")
      .withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", workspaceId).eq("service", "apollo").gte("at", cycleStart ?? monthStart()))
      .collect();
    let beyond = consumed === undefined ? 0 : consumed - cycle.filter((r) => r.state === "settled" || r.state === undefined).reduce((n, r) => n + (r.credits ?? 0), 0);
    for (const r of await waiting(ctx, workspaceId, "apollo")) {
      const checkable = consumed !== undefined && cycleStart !== undefined && r.at >= cycleStart;
      if (!checkable) {
        if (now - r.at > GIVE_UP_MS || (cycleStart !== undefined && r.at < cycleStart)) await ctx.db.patch(r._id, { state: "unresolved" });
        continue;
      }
      const credits = r.credits ?? 0;
      const charged = credits > 0 && beyond >= credits;
      if (charged) beyond -= credits;
      const next = { credits: charged ? credits : 0, state: "settled" as const };
      await ctx.db.patch(r._id, next);
      await addSpend(ctx, { ...r, ...next });
    }
  },
});
