import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { openrouterKeyFor } from "./openrouterKey";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const KEY = "sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789";

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "11".repeat(32);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const auth = new Headers(init.headers).get("Authorization");
    return new Response("{}", { status: auth === `Bearer ${KEY}` ? 200 : 401 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function setup() {
  const t = convexTest(schema, modules);
  const { a, b, wa, wb } = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "a@example.com" });
    const b = await ctx.db.insert("users", { email: "b@example.com" });
    return { a, b, wa: await ensureWorkspace(ctx, a), wb: await ensureWorkspace(ctx, b) };
  });
  return { t, wa, wb, asA: t.withIdentity({ subject: `${a}|s` }), asB: t.withIdentity({ subject: `${b}|s` }) };
}

test("a valid key is stored encrypted and only its last four characters are visible", async () => {
  const { t, wa, asA } = await setup();
  expect(await asA.action(api.openrouterKey.save, { key: `  ${KEY}\n` })).toEqual({ ok: true });
  expect(await asA.query(api.openrouterKey.status, {})).toMatchObject({ set: true, last4: "6789" });
  const row = await t.run((ctx) => ctx.db.query("apiKeys").first());
  expect(row?.sealed).not.toContain(KEY);
  expect(await t.run((ctx) => openrouterKeyFor(ctx, wa))).toBe(KEY);
});

test("a key OpenRouter rejects is not stored", async () => {
  const { asA } = await setup();
  expect(await asA.action(api.openrouterKey.save, { key: "sk-or-wrong" })).toMatchObject({ ok: false });
  expect(await asA.query(api.openrouterKey.status, {})).toEqual({ set: false });
});

test("one workspace's key is not visible or usable from another", async () => {
  const { t, wb, asA, asB } = await setup();
  await asA.action(api.openrouterKey.save, { key: KEY });
  expect(await asB.query(api.openrouterKey.status, {})).toEqual({ set: false });
  expect(await t.run((ctx) => openrouterKeyFor(ctx, wb))).toBeNull();
  await asB.mutation(api.openrouterKey.remove, {});
  expect(await asA.query(api.openrouterKey.status, {})).toMatchObject({ set: true });
});

test("removing the key clears it", async () => {
  const { t, wa, asA } = await setup();
  await asA.action(api.openrouterKey.save, { key: KEY });
  await asA.mutation(api.openrouterKey.remove, {});
  expect(await asA.query(api.openrouterKey.status, {})).toEqual({ set: false });
  expect(await t.run((ctx) => ctx.runQuery(internal.openrouterKey.sealedFor, { workspaceId: wa }))).toBeNull();
});

test("signed-out callers can't save a key", async () => {
  const { t } = await setup();
  await expect(t.action(api.openrouterKey.save, { key: KEY })).rejects.toThrow("Sign in");
});
