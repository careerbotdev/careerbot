import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { openrouterHeaders } from "./openrouterApp";

// What each AI model can cost, so a call reserves its most before it's made (metering.chat, metering.decide).
// OpenRouter routes a model to any of several providers, and they charge differently, so a model's price here is the
// highest of them: per prompt token (plain or written to a cache), per reply token (reasoning included), per request,
// and the higher tier where a provider charges more for long prompts. Prices are kept per model, refreshed hourly
// (crons.ts) and when a call finds its model's missing or an hour old.

export type Price = Pick<Doc<"modelPrices">, "prompt" | "completion" | "request" | "fixed" | "maxTokens" | "context" | "structured">;

// A price this old is read again before a call uses it, and one that can't be read again isn't used: the call is
// refused. Reserving at an hour-old price with a margin (MARGIN) covers a provider raising its price since; an older
// one could be any amount out, so it can't bound what a call costs. Refusing costs little: when OpenRouter can't say
// its prices, its chat endpoint is unlikely to answer either, and the next call reads them again.
const FRESH_MS = 60 * 60 * 1000;
// What a call reserves over its worst case at the kept price, for a price that went up since it was read.
const MARGIN = 1.25;

type Pricing = Record<string, unknown> & { overrides?: Record<string, unknown>[] };
type EndpointsResponse = { data?: { endpoints?: { pricing?: Pricing; max_completion_tokens?: number | null; context_length?: number | null; supported_parameters?: string[] }[] } };

const PROMPT = ["prompt", "input_cache_write", "input_cache_write_1h"];
const COMPLETION = ["completion", "internal_reasoning"];

// A model's highest prices across its providers, from OpenRouter's list of them: "unlisted" when OpenRouter has no such
// model, null when the list can't be read. A negative price is OpenRouter's mark for a router whose price depends on
// the model it picks. structured: some provider of it keeps a reply to a JSON schema (OpenRouter's structured_outputs).
async function readPrice(model: string): Promise<Price | "unlisted" | null> {
  const path = model.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`https://openrouter.ai/api/v1/models/${path}/endpoints`, { headers: openrouterHeaders() }).catch(() => null);
  if (res?.status === 404) return "unlisted";
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as EndpointsResponse | null;
  const endpoints = body?.data?.endpoints;
  if (!Array.isArray(endpoints) || !endpoints.length) return null;
  const tiers = endpoints.flatMap((e) => [e.pricing ?? {}, ...(e.pricing?.overrides ?? [])]);
  const prices = (keys: string[]) => tiers.flatMap((t) => keys.map((k) => Number(t[k])).filter((n) => Number.isFinite(n)));
  const prompt = prices(PROMPT);
  const completion = prices(COMPLETION);
  if (!prompt.length || !completion.length) return null;
  const request = prices(["request"]);
  const caps = endpoints.map((e) => e.max_completion_tokens).filter((n): n is number => typeof n === "number" && n > 0);
  const contexts = endpoints.map((e) => e.context_length).filter((n): n is number => typeof n === "number" && n > 0);
  return {
    prompt: Math.max(...prompt),
    completion: Math.max(...completion),
    request: Math.max(0, ...request),
    fixed: ![...prompt, ...completion, ...request].some((n) => n < 0),
    ...(caps.length ? { maxTokens: Math.max(...caps) } : {}),
    ...(contexts.length ? { context: Math.max(...contexts) } : {}),
    ...(endpoints.some((e) => e.supported_parameters?.includes("structured_outputs")) ? { structured: true } : {}),
  };
}

// The most a call can cost: its prompt at the highest prompt price, a reply as long as max_tokens allows at the highest
// reply price, and the price per request, with MARGIN over it.
export function worstCase(price: Price, promptTokens: number, maxTokens: number) {
  return MARGIN * (price.request + promptTokens * price.prompt + maxTokens * price.completion);
}

export const get = internalQuery({
  args: { model: v.string() },
  handler: (ctx, { model }) => ctx.db.query("modelPrices").withIndex("by_model", (q) => q.eq("model", model)).unique(),
});

export const save = internalMutation({
  args: {
    model: v.string(),
    price: v.union(
      v.null(),
      v.object({ prompt: v.number(), completion: v.number(), request: v.number(), fixed: v.boolean(), maxTokens: v.optional(v.number()), context: v.optional(v.number()), structured: v.optional(v.boolean()) }),
    ),
  },
  handler: async (ctx, { model, price }) => {
    const row = await ctx.db.query("modelPrices").withIndex("by_model", (q) => q.eq("model", model)).unique();
    if (!price) {
      if (row) await ctx.db.delete(row._id);
      return;
    }
    if (row) await ctx.db.replace(row._id, { model, ...price, at: Date.now() });
    else await ctx.db.insert("modelPrices", { model, ...price, at: Date.now() });
  },
});

// A model's price for a call about to be made: the kept one while it's under an hour old and says the model's context,
// else read again (a row kept before context was, too). Without a price read in the last hour (OpenRouter can't be
// read now), or for a model OpenRouter no longer lists, the call isn't made (FRESH_MS says why).
export async function priceOf(ctx: ActionCtx, model: string): Promise<Price> {
  const row = await ctx.runQuery(internal.modelPrices.get, { model });
  if (row?.context !== undefined && Date.now() - row.at < FRESH_MS) return row;
  const price = await readPrice(model);
  if (price === "unlisted") {
    if (row) await ctx.runMutation(internal.modelPrices.save, { model, price: null });
    throw new Error(`OpenRouter doesn't list ${model}. Choose another model in AI settings.`);
  }
  if (!price) throw new Error(`Couldn't read ${model}'s current prices from OpenRouter, so nothing was spent. Try again in a few minutes.`);
  await ctx.runMutation(internal.modelPrices.save, { model, price });
  return price;
}

export const models = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("modelPrices").collect()).map((r) => r.model),
});

// Every model with a kept price is read again (crons.ts). One OpenRouter no longer lists is dropped; one that can't be
// read right now keeps its price.
export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    for (const model of await ctx.runQuery(internal.modelPrices.models, {})) {
      const price = await readPrice(model);
      if (price) await ctx.runMutation(internal.modelPrices.save, { model, price: price === "unlisted" ? null : price });
    }
  },
});
