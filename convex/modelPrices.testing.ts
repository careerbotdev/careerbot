import type { TestConvex } from "convex-test";
import type schema from "./schema";

// Model prices for tests: every AI call reserves its most at its model's price (modelPrices.priceOf), read from
// OpenRouter when none is kept. Seeding them keeps each test's own fetch stub free of price lookups. They never go
// stale, so tests that move the clock don't read them again. (Two dots in the name: Convex doesn't deploy it.)

// $1 per million prompt tokens, $2 per million reply tokens, a context far above any test's prompt: a call with the
// default max_tokens holds about $0.08 (its worst case, $0.064, with the margin over it).
export const TEST_PRICE = { prompt: 1e-6, completion: 2e-6, request: 0, fixed: true, context: 1_000_000 };
// Jev's: $0.042 per million prompt tokens, answers free, a 32,000-token context: a decision holds $0.00168.
export const JEV_PRICE = { prompt: 4.2e-8, completion: 0, request: 0, fixed: true, context: 32_000 };

// The model ids the tests use.
const TEST_MODELS = [
  "m/x",
  "test/cheap",
  "test/model",
  "test/other",
  "test/sorter",
  "test/writer",
  "vendor/chat",
  "vendor/chosen",
  "vendor/default",
  "vendor/first",
  "vendor/most",
  "vendor/one",
  "vendor/own",
  "vendor/second",
  "vendor/theirs",
  "vendor/two",
  "vendor/writer",
];

export async function seedModelPrices(t: TestConvex<typeof schema>, models = TEST_MODELS) {
  await t.run(async (ctx) => {
    for (const model of models) await ctx.db.insert("modelPrices", { model, ...TEST_PRICE, at: Number.MAX_SAFE_INTEGER });
    await ctx.db.insert("modelPrices", { model: "typesafe/jev-1.13", ...JEV_PRICE, at: Number.MAX_SAFE_INTEGER });
  });
}
