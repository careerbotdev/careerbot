import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { HELD_BY_RUNNING } from "./budgets";
import { apollo, chat, chatJson, type Decision, decide, LONG_REPLY_TOKENS } from "./metering";
import { seedModelPrices, TEST_PRICE } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "22".repeat(32);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function workspaceWithKey(withKey = true) {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const workspaceId = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    if (withKey) await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 10, apolloMode: "on" });
    return w;
  });
  return { t, workspaceId };
}

test("a successful AI call uses the workspace key and records its real cost", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  const fetchMock = vi.fn(async () =>
    Response.json({ model: "m/x", choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0042 } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const out = await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [{ role: "user", content: "hello" }] }));
  expect(out.text).toBe("hi");
  expect(new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("Authorization")).toBe("Bearer sk-or-test");
  const [row] = await t.run((ctx) => ctx.db.query("usage").collect());
  expect(row).toMatchObject({ workspaceId, service: "openrouter", purpose: "test", inputTokens: 10, outputTokens: 2, costUsd: 0.0042, ok: true });
});

test("an AI call names CareerBot to OpenRouter: the deployment's address, or careerbot.dev without one", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  const fetchMock = vi.fn(async () => Response.json({ model: "m/x", choices: [{ message: { content: "hi" } }], usage: { cost: 0.001 } }));
  vi.stubGlobal("fetch", fetchMock);
  const sent = async () => {
    await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [{ role: "user", content: "hello" }] }));
    return new Headers((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].headers);
  };
  delete process.env.SITE_URL;
  const fallback = await sent();
  expect([fallback.get("HTTP-Referer"), fallback.get("X-OpenRouter-Title"), fallback.get("X-Title")]).toEqual(["https://careerbot.dev", "CareerBot", "CareerBot"]);
  process.env.SITE_URL = "https://jobs.example.org";
  try {
    expect((await sent()).get("HTTP-Referer")).toBe("https://jobs.example.org");
  } finally {
    delete process.env.SITE_URL;
  }
});

test("a failed AI call is still recorded, and the error surfaces", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "no credit" } }, { status: 402 })));
  await expect(
    t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [] })),
  ).rejects.toThrow("no credit");
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toMatchObject([{ ok: false, costUsd: 0 }]);
});

test("without a key, no call is made and nothing is recorded", async () => {
  const { t, workspaceId } = await workspaceWithKey(false);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [] })),
  ).rejects.toThrow("OpenRouter key");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toHaveLength(0);
});

test("the OpenRouter generation id is kept with the usage row", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "gen-abc123", model: "m/x", choices: [{ message: { content: "hi" } }], usage: { cost: 0.001 } })));
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [] }));
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toMatchObject([{ generationId: "gen-abc123" }]);
});

// ---- Reservations: every call holds the most it could cost until it settles ----

const setAiBudget = (t: TestConvex<typeof schema>, workspaceId: Id<"workspaces">, usd: number) =>
  t.run(async (ctx) => {
    const b = await ctx.db.query("budgets").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    await ctx.db.patch(b!._id, { aiMonthlyUsd: usd });
  });
const hello = [{ role: "user" as const, content: "hello" }];
const costs = (usd: number) => Response.json({ model: "m/x", choices: [{ message: { content: "hi" } }], usage: { cost: usd } });

test("two calls that each fit the budget but not together: the second is refused while the first runs, and never sent", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  // Each call holds 32,000 reply tokens at $2 per million with the margin, about $0.08: one fits $0.10, two don't.
  await setAiBudget(t, workspaceId, 0.1);
  let answerFirst!: () => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (answerFirst = () => resolve(costs(0.004)))));
  vi.stubGlobal("fetch", fetchMock);
  const first = t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "first", model: "m/x", messages: hello }));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await expect(t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "second", model: "m/x", messages: hello }))).rejects.toMatchObject({
    data: { code: "BUDGET_REACHED", service: "openrouter", message: HELD_BY_RUNNING },
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  answerFirst();
  expect((await first).text).toBe("hi");
  expect((await t.run((ctx) => ctx.db.query("usage").collect())).map((r) => [r.purpose, r.state, r.costUsd])).toEqual([["first", "settled", 0.004]]);
});

test("a settled call gives back what it held beyond its real cost, so the next call fits", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await setAiBudget(t, workspaceId, 0.12);
  vi.stubGlobal("fetch", vi.fn(async () => costs(0.03)));
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "first", model: "m/x", messages: hello }));
  const [row] = await t.run((ctx) => ctx.db.query("usage").collect());
  expect(row).toMatchObject({ state: "settled", costUsd: 0.03 });
  expect(row.reservedUsd).toBeUndefined();
  // $0.03 spent and $0.08 held for the next call is under $0.12; had the first kept its $0.08, it wouldn't be.
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "second", model: "m/x", messages: hello }));
  expect((await t.run((ctx) => ctx.db.query("usage").collect())).map((r) => [r.state, r.costUsd])).toEqual([["settled", 0.03], ["settled", 0.03]]);
});

test("a call is sent with the max_tokens it reserved for: the default, a long reply's, or the model's own most", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await t.run((ctx) => ctx.db.insert("modelPrices", { model: "vendor/short", ...TEST_PRICE, maxTokens: 8000, at: Number.MAX_SAFE_INTEGER }));
  const held: (number | undefined)[] = [];
  const sent: number[] = [];
  const bytes: number[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).max_tokens);
    bytes.push(new TextEncoder().encode(String(init.body)).length);
    held.push((await t.run((ctx) => ctx.db.query("usage").order("desc").first()))?.reservedUsd);
    return costs(0.001);
  });
  vi.stubGlobal("fetch", fetchMock);
  const call = (model: string, maxTokens?: number) => t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model, messages: hello, maxTokens }));
  await call("m/x");
  await call("m/x", LONG_REPLY_TOKENS);
  await call("vendor/short", LONG_REPLY_TOKENS);
  expect(sent).toEqual([32_000, LONG_REPLY_TOKENS, 8000]);
  // The prompt counts a token per byte of the request at $1 per million, the reply as max_tokens at $2 per million,
  // and the call holds a quarter more than that.
  expect(held.map((usd) => usd?.toFixed(6))).toEqual(sent.map((n, i) => (1.25 * (bytes[i] * 1e-6 + n * 2e-6)).toFixed(6)));

  // A long reply could cost $0.24, more than the $0.10 left of the budget: it's refused before it's sent; a default
  // one ($0.08) still fits. ($0.003 is spent already.)
  await setAiBudget(t, workspaceId, 0.103);
  await expect(call("m/x", LONG_REPLY_TOKENS)).rejects.toMatchObject({ data: { code: "BUDGET_REACHED", message: "This call could cost more than what's left of this month's AI budget." } });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await call("m/x");
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

// ---- Replies read as JSON (chatJson): one retry, metered and shown ----

const lines = { name: "lines", schema: { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"], additionalProperties: false } };

const replies = (...answers: { content: string; finish?: string; usd: number }[]) => {
  const sent: { maxTokens: number; json: unknown }[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ maxTokens: body.max_tokens, json: body.response_format });
    const a = answers[sent.length - 1];
    return Response.json({ model: "m/x", choices: [{ message: { content: a.content }, finish_reason: a.finish ?? "stop" }], usage: { cost: a.usd } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return sent;
};
const usageOf = (t: TestConvex<typeof schema>) => t.run(async (ctx) => (await ctx.db.query("usage").collect()).map((r) => [r.purpose, r.state, r.costUsd]));

test("a JSON reply cut off at max_tokens is never read; it's asked for once more with room for twice the tokens, as a retry", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  // The cut-off reply holds a complete object before where it stopped, which would read; it isn't used.
  const sent = replies({ content: '{"lines":[]} {"lines":[{"text":"Led the', finish: "length", usd: 0.01 }, { content: '{"lines":[{"text":"Led the migration."}]}', usd: 0.02 });
  const reply = await t.action(async (ctx) => chatJson<{ lines: { text: string }[] }>(ctx, { workspaceId, purpose: "resume", model: "m/x", messages: hello, schema: lines }));
  expect(reply.out).toEqual({ lines: [{ text: "Led the migration." }] });
  expect(reply.costUsd).toBeCloseTo(0.03);
  expect(sent).toEqual([
    { maxTokens: 32_000, json: { type: "json_object" } },
    { maxTokens: 64_000, json: { type: "json_object" } },
  ]);
  expect(await usageOf(t)).toEqual([
    ["resume", "settled", 0.01],
    ["resume: retry", "settled", 0.02],
  ]);
});

test("a malformed JSON reply is asked for once more; unreadable twice, the step fails with a message to try again, both calls paid and recorded", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  // What a model wrote mid-reply: code inside the JSON.
  const broken = '{"lines":[{"text":"Cut deploys to 12 minutes.","factIds":["f1".replace("f1","f2")]}]}';
  replies({ content: broken, usd: 0.01 }, { content: '{"lines":[{"text":"Cut deploys to 12 minutes.","factIds":["f2"]}]}', usd: 0.01 });
  const fixed = await t.action(async (ctx) => chatJson<{ lines: unknown[] }>(ctx, { workspaceId, purpose: "resume", model: "m/x", messages: hello, schema: lines, maxTokens: LONG_REPLY_TOKENS }));
  expect(fixed.out.lines).toHaveLength(1);
  expect(fixed.costUsd).toBeCloseTo(0.02);

  const sent = replies({ content: broken, usd: 0.01 }, { content: broken, usd: 0.01 }, { content: "{}", usd: 0.01 });
  await expect(t.action(async (ctx) => chatJson(ctx, { workspaceId, purpose: "resume", model: "m/x", messages: hello, schema: lines, maxTokens: LONG_REPLY_TOKENS }))).rejects.toThrow("The model's reply wasn't readable. Try again.");
  // An unreadable (not cut-off) reply is asked for again as it was, and only once.
  expect(sent.map((s) => s.maxTokens)).toEqual([LONG_REPLY_TOKENS, LONG_REPLY_TOKENS]);
  expect((await usageOf(t)).slice(2)).toEqual([
    ["resume", "settled", 0.01],
    ["resume: retry", "settled", 0.01],
  ]);
});

test("a reply cut off twice fails with a message saying so; the retry asks for no more than the model can write", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await t.run((ctx) => ctx.db.insert("modelPrices", { model: "vendor/short", ...TEST_PRICE, maxTokens: 40_000, at: Number.MAX_SAFE_INTEGER }));
  const sent = replies({ content: '{"lines":[', finish: "length", usd: 0.01 }, { content: '{"lines":[{"te', finish: "length", usd: 0.01 });
  await expect(t.action(async (ctx) => chatJson(ctx, { workspaceId, purpose: "skills", model: "vendor/short", messages: hello, schema: lines }))).rejects.toThrow("The model's reply was too long and got cut off. Try again.");
  expect(sent.map((s) => s.maxTokens)).toEqual([32_000, 40_000]);
});

test("a reply's schema goes as structured output, to providers that keep it, only for a model one of whose providers does", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await t.run((ctx) => ctx.db.insert("modelPrices", { model: "vendor/strict", ...TEST_PRICE, context: 1_000_000, structured: true, at: Number.MAX_SAFE_INTEGER }));
  const bodies: { response_format?: unknown; provider?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({ model: "m/x", choices: [{ message: { content: '{"lines":[]}' }, finish_reason: "stop" }], usage: { cost: 0.001 } });
    }),
  );
  for (const model of ["vendor/strict", "m/x"]) await t.action(async (ctx) => chatJson(ctx, { workspaceId, purpose: "test", model, messages: hello, schema: lines }));
  expect(bodies.map((b) => [b.response_format, b.provider])).toEqual([
    [{ type: "json_schema", json_schema: { ...lines, strict: true } }, { require_parameters: true }],
    [{ type: "json_object" }, undefined],
  ]);
});

test("a schema the provider refuses as too large is asked for again in JSON mode; any other refusal fails the step", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await t.run((ctx) => ctx.db.insert("modelPrices", { model: "vendor/strict", ...TEST_PRICE, structured: true, at: Number.MAX_SAFE_INTEGER }));
  const refusal = (raw: string) => Response.json({ error: { message: "Provider returned error", code: 400, metadata: { raw } } }, { status: 400 });
  const tooLarge = refusal('{"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues."}}');
  const formats: unknown[] = [];
  const answer = (first: Response) =>
    vi.fn(async (_url: string, init: RequestInit) => {
      formats.push(JSON.parse(String(init.body)).response_format);
      return formats.length === 1 ? first : Response.json({ model: "vendor/strict", choices: [{ message: { content: '{"lines":["Led the migration."]}' }, finish_reason: "stop" }], usage: { cost: 0.002 } });
    });
  vi.stubGlobal("fetch", answer(tooLarge));
  const reply = await t.action(async (ctx) => chatJson<{ lines: string[] }>(ctx, { workspaceId, purpose: "goals", model: "vendor/strict", messages: hello, schema: lines }));
  expect(reply.out).toEqual({ lines: ["Led the migration."] });
  expect(formats).toEqual([{ type: "json_schema", json_schema: { ...lines, strict: true } }, { type: "json_object" }]);
  expect(await usageOf(t)).toEqual([
    ["goals", "settled", 0],
    ["goals", "settled", 0.002],
  ]);

  formats.length = 0;
  vi.stubGlobal("fetch", answer(refusal('{"error":{"message":"prompt is too long"}}')));
  await expect(t.action(async (ctx) => chatJson(ctx, { workspaceId, purpose: "goals", model: "vendor/strict", messages: hello, schema: lines }))).rejects.toThrow("Provider returned error");
  expect(formats).toHaveLength(1);
});

test("an answer that doesn't say what it cost keeps what it held until the daily check settles it", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await setAiBudget(t, workspaceId, 0.12);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "gen-9", model: "m/x", choices: [{ message: { content: "hi" } }] })));
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "unsure", model: "m/x", messages: hello }));
  await expect(t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "next", model: "m/x", messages: hello }))).rejects.toMatchObject({ data: { message: HELD_BY_RUNNING } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("generation?id=gen-9") ? Response.json({ data: { total_cost: 0.02 } }) : costs(0.01))));
  await t.action(internal.metering.reconcile, {});
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "next", model: "m/x", messages: hello }));
  expect((await t.run((ctx) => ctx.db.query("usage").collect())).map((r) => [r.purpose, r.state, r.costUsd, r.reservedUsd])).toEqual([
    ["unsure", "settled", 0.02, undefined],
    ["next", "settled", 0.01, undefined],
  ]);
});

test("a prompt holds at least a token for each of its bytes, so text of several bytes a character isn't under-counted", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  let held = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      held = (await t.run((ctx) => ctx.db.query("usage").first()))!.reservedUsd!;
      return costs(0.001);
    }),
  );
  // Three bytes for each of these characters and four for the emoji: 22,000 bytes in 8,000 UTF-16 units.
  const content = "履歴書を書く😀".repeat(1000);
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [{ role: "user", content }] }));
  // Beyond the margin and the reply's 32,000 tokens at $2 per million, what it held is its prompt at $1 per million.
  const promptTokens = (held / 1.25 - 32_000 * 2e-6) / 1e-6;
  expect(promptTokens).toBeGreaterThanOrEqual(new TextEncoder().encode(content).length);
});

test("a price over an hour old is read again before a call uses it; one that can't be read again refuses the call", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await t.run((ctx) => ctx.db.insert("modelPrices", { model: "vendor/aging", ...TEST_PRICE, at: Date.now() - 2 * 60 * 60 * 1000 }));
  const call = () => t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "vendor/aging", messages: hello }));
  const endpoints = "https://openrouter.ai/api/v1/models/vendor/aging/endpoints";

  // OpenRouter's price list can't be read: the kept price is too old to bound what the call costs, so nothing is sent.
  const down = vi.fn(async (url: string) => (url === endpoints ? new Response("", { status: 503 }) : costs(0.001)));
  vi.stubGlobal("fetch", down);
  await expect(call()).rejects.toThrow("Couldn't read vendor/aging's current prices");
  expect(down.mock.calls.map(([url]) => url)).toEqual([endpoints]);
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toHaveLength(0);

  // Read again at twice the price: the call holds its worst case at the new price, and the next one, within the hour,
  // uses it without reading it again.
  let held = 0;
  let bytes = 0;
  const up = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === endpoints) return Response.json({ data: { endpoints: [{ pricing: { prompt: "0.000002", completion: "0.000004" }, context_length: 200_000 }] } });
    held = (await t.run((ctx) => ctx.db.query("usage").order("desc").first()))!.reservedUsd!;
    bytes = new TextEncoder().encode(String(init!.body)).length;
    return costs(0.001);
  });
  vi.stubGlobal("fetch", up);
  await call();
  expect(held).toBeCloseTo(1.25 * (bytes * 2e-6 + 32_000 * 4e-6), 10);
  await call();
  expect(up.mock.calls.map(([url]) => url)).toEqual([endpoints, "https://openrouter.ai/api/v1/chat/completions", "https://openrouter.ai/api/v1/chat/completions"]);
});

const isFit: Decision["questions"] = { fits: { type: "noul", instructions: "Is `posting` a sales role?" } };
const decision = (post: string): Decision => ({ state: { post }, questions: isFit });

test("decisions go to the Decisions API with the workspace key, and a group shares one usage row with its summed cost", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const post = JSON.parse(String(init.body)).state.post as string;
    return Response.json({ id: `gen-${post}`, model: "typesafe/jev-1.13-20260917", answers: { fits: { type: "noul", noul: post === "a" ? 0.9 : 0.1 } }, usage: { input_tokens: 100, output_tokens: 10, cost: 0.0000042 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const out = await t.action(async (ctx) => decide(ctx, { workspaceId, purpose: "role sort", model: "typesafe/jev-1.13", decisions: [decision("a"), decision("b")] }));
  expect(out.answers).toEqual([{ fits: { type: "noul", noul: 0.9 } }, { fits: { type: "noul", noul: 0.1 } }]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk-or-test");
  expect(JSON.parse(String(init.body))).toEqual({ model: "typesafe/jev-1.13", state: { post: "a" }, questions: isFit });
  const rows = await t.run((ctx) => ctx.db.query("usage").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ purpose: "role sort", model: "typesafe/jev-1.13-20260917", inputTokens: 200, outputTokens: 20, ok: true, state: "settled" });
  expect(rows[0].costUsd).toBeCloseTo(0.0000084, 10);
});

test("a busy decision is sent again after the wait OpenRouter asks for", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  const replies = [
    Response.json({ error: { message: "Rate limit exceeded" } }, { status: 429, headers: { "Retry-After": "0" } }),
    Response.json({ answers: { fits: { type: "noul", noul: 0.7 } }, usage: { cost: 0.000001 } }),
  ];
  const fetchMock = vi.fn(async () => replies.shift()!);
  vi.stubGlobal("fetch", fetchMock);
  const out = await t.action(async (ctx) => decide(ctx, { workspaceId, purpose: "role sort", model: "typesafe/jev-1.13", decisions: [decision("a")] }));
  expect(out.answers).toEqual([{ fits: { type: "noul", noul: 0.7 } }]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await t.run((ctx) => ctx.db.query("usage").collect())).toMatchObject([{ ok: true, costUsd: 0.000001 }]);
});

test("a reply missing an answer fails the group once every decision is back, with what was charged recorded", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
    JSON.parse(String(init.body)).state.post === "a"
      ? Response.json({ answers: {}, usage: { cost: 0.000002 } })
      : Response.json({ answers: { fits: { type: "noul", noul: 0.5 } }, usage: { cost: 0.000003 } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    t.action(async (ctx) => decide(ctx, { workspaceId, purpose: "role sort", model: "typesafe/jev-1.13", decisions: [decision("a"), decision("b")] })),
  ).rejects.toThrow('didn\'t answer "fits"');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [row] = await t.run((ctx) => ctx.db.query("usage").collect());
  expect(row).toMatchObject({ ok: false, state: "settled" });
  expect(row.costUsd).toBeCloseTo(0.000005, 10);
});

test("with this month's AI budget used up, no decision is sent", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  await t.run((ctx) => ctx.db.insert("usage", { workspaceId, service: "openrouter", purpose: "earlier", costUsd: 5, ok: true, state: "settled", at: Date.now() }));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(t.action(async (ctx) => decide(ctx, { workspaceId, purpose: "role sort", model: "typesafe/jev-1.13", decisions: [decision("a")] }))).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a group of decisions holds each one's most, its context at the model's price, and is refused unsent when that doesn't fit", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  let held: number | undefined;
  const fetchMock = vi.fn(async () => {
    held = (await t.run((ctx) => ctx.db.query("usage").order("desc").first()))?.reservedUsd;
    return Response.json({ answers: { fits: { type: "noul", noul: 0.5 } }, usage: { cost: 0.0000042 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const group = (posts: string[]) => t.action(async (ctx) => decide(ctx, { workspaceId, purpose: "role sort", model: "typesafe/jev-1.13", decisions: posts.map(decision) }));
  await group(["a", "b"]);
  // 32,000 tokens at $0.042 per million, with the margin: $0.00168 a decision.
  expect(held).toBeCloseTo(2 * 0.00168, 10);

  // $0.003 left of the budget ($0.0000084 is spent): a group of two could cost more and isn't sent; one decision fits.
  await setAiBudget(t, workspaceId, 0.0030084);
  await expect(group(["c", "d"])).rejects.toMatchObject({ data: { code: "BUDGET_REACHED", message: "This call could cost more than what's left of this month's AI budget." } });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await group(["e"]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(held).toBeCloseTo(0.00168, 10);
});

test("a kept price that doesn't say the model's context is read again, and the decision goes through at the price read", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  // Jev's price as kept before prices said the context, read minutes ago.
  await t.run(async (ctx) => {
    const row = await ctx.db.query("modelPrices").withIndex("by_model", (q) => q.eq("model", "typesafe/jev-1.13")).unique();
    await ctx.db.replace(row!._id, { model: "typesafe/jev-1.13", prompt: 4.2e-8, completion: 0, request: 0, fixed: true, at: Date.now() - 5 * 60 * 1000 });
  });
  let held: number | undefined;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/endpoints")) return Response.json({ data: { endpoints: [{ pricing: { prompt: "0.000000042", completion: "0" }, context_length: 32_000, max_completion_tokens: 28_800 }] } });
    held = (await t.run((ctx) => ctx.db.query("usage").first()))?.reservedUsd;
    return Response.json({ answers: { fits: { type: "noul", noul: 0.5 } }, usage: { cost: 0.0000042 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const out = await t.action(async (ctx) => decide(ctx, { workspaceId, purpose: "role sort", model: "typesafe/jev-1.13", decisions: [decision("a")] }));
  expect(out.answers).toEqual([{ fits: { type: "noul", noul: 0.5 } }]);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints", "https://openrouter.ai/api/alpha/decisions"]);
  expect(held).toBeCloseTo(0.00168, 10);
  expect(await t.run((ctx) => ctx.db.query("modelPrices").withIndex("by_model", (q) => q.eq("model", "typesafe/jev-1.13")).unique())).toMatchObject({ context: 32_000 });
});

// ---- The daily check (reconcile) ----

type T = TestConvex<typeof schema>;
const usageRows = (t: T) => t.run((ctx) => ctx.db.query("usage").collect());
const answer = (body: object) => vi.fn(async () => Response.json({ model: "m/x", choices: [{ message: { content: "hi" } }], ...body }));

test("an answer that doesn't say what it cost is left unsure, then settled from OpenRouter's own figure", async () => {
  const { t, workspaceId } = await workspaceWithKey();
  vi.stubGlobal("fetch", answer({ id: "gen-1" }));
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [] }));
  expect(await usageRows(t)).toMatchObject([{ state: "indeterminate", lookup: ["gen-1"], costUsd: 0 }]);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("generation?id=gen-1") ? Response.json({ data: { total_cost: 0.02 } }) : new Response("", { status: 500 }))));
  await t.action(internal.metering.reconcile, {});
  const [row] = await usageRows(t);
  expect(row).toMatchObject({ state: "settled", costUsd: 0.02, inTotals: true });
  expect(row.lookup).toBeUndefined();
  // The month's budget counts it too.
  expect(await t.run(async (ctx) => (await ctx.db.query("aiSpend").collect()).reduce((n, r) => n + r.usd, 0))).toBeCloseTo(0.02, 10);
});

test("a generation OpenRouter doesn't know yet is asked about again, and after a day counts as not charged", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-20T12:00:00Z"));
  const { t, workspaceId } = await workspaceWithKey();
  vi.stubGlobal("fetch", answer({ id: "gen-2" }));
  await t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [] }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
  vi.setSystemTime(Date.parse("2026-09-20T16:00:00Z"));
  await t.action(internal.metering.reconcile, {});
  expect(await usageRows(t)).toMatchObject([{ state: "indeterminate" }]);
  vi.setSystemTime(Date.parse("2026-09-21T16:00:00Z"));
  await t.action(internal.metering.reconcile, {});
  expect(await usageRows(t)).toMatchObject([{ state: "settled", costUsd: 0 }]);
});

test("a call that got no answer at all, or was cut off mid-run, can't be looked up and ends unresolved", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-20T12:00:00Z"));
  const { t, workspaceId } = await workspaceWithKey();
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("network down"))));
  await expect(t.action(async (ctx) => chat(ctx, { workspaceId, purpose: "test", model: "m/x", messages: [] }))).rejects.toThrow("network down");
  expect(await usageRows(t)).toMatchObject([{ state: "indeterminate", unseen: 1, ok: false }]);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("usage", { workspaceId, service: "openrouter", purpose: "cut off", costUsd: 0, ok: false, state: "reserved", at: now - 2 * 60 * 60 * 1000 });
    await ctx.db.insert("usage", { workspaceId, service: "openrouter", purpose: "running", costUsd: 0, ok: false, state: "reserved", at: now - 5 * 60 * 1000 });
  });
  const lookups = vi.fn();
  vi.stubGlobal("fetch", lookups);
  await t.action(internal.metering.reconcile, {});
  expect(lookups).not.toHaveBeenCalled();
  expect((await usageRows(t)).map((r) => [r.purpose, r.state])).toEqual([["test", "unresolved"], ["cut off", "unresolved"], ["running", "reserved"]]);
});

test("Apollo calls that failed on their way are charged as far as Apollo's own count of the cycle goes, oldest first", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-20T12:00:00Z"));
  const { t, workspaceId } = await workspaceWithKey();
  const sealed = await seal("apollo-key");
  await t.run((ctx) => ctx.db.insert("apiKeys", { workspaceId, service: "apollo", sealed, last4: "-key", setAt: 0 }));
  // Apollo's own count: 3 credits used this cycle (from the 5th); 2 are settled calls, so 1 more was charged.
  const credits = (consumed: number) =>
    vi.fn(async (url: string) =>
      url.endsWith("credit_usage_stats")
        ? Response.json({ credit_usage_stats: { lead_credit: { limit: 100, consumed, left_over: 100 - consumed } }, current_credit_cycle: { start_date: "2026-09-05", end_date: "2026-10-05" } })
        : Promise.reject(new TypeError("connection reset")),
    );
  vi.stubGlobal("fetch", credits(3));
  await t.run((ctx) => ctx.db.insert("usage", { workspaceId, service: "apollo", purpose: "earlier", credits: 2, ok: true, state: "settled", at: Date.parse("2026-09-10") }));
  const search = (purpose: string) => t.action(async (ctx) => apollo(ctx, { workspaceId, purpose, endpoint: "mixed_companies/search", automated: false, params: { page: 1 } }));
  await expect(search("first")).rejects.toThrow("connection reset");
  await expect(search("second")).rejects.toThrow("connection reset");
  await t.run((ctx) => ctx.db.insert("usage", { workspaceId, service: "apollo", purpose: "last cycle", credits: 1, ok: false, state: "indeterminate", at: Date.parse("2026-09-01") }));
  expect((await usageRows(t)).filter((r) => r.state === "indeterminate")).toHaveLength(3);
  await t.action(internal.metering.reconcile, {});
  const by = Object.fromEntries((await usageRows(t)).map((r) => [r.purpose, [r.state, r.credits]]));
  expect(by).toMatchObject({ first: ["settled", 1], second: ["settled", 0], "last cycle": ["unresolved", 1] });
});
