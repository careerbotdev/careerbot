import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { assertAllowed } from "./allowlist";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SIGNUP_ALLOWLIST = "owner@example.com, other@example.com";
});
afterEach(() => {
  delete process.env.SIGNUP_ALLOWLIST;
});

test("an allowlisted email can sign in, regardless of case", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "Owner@Example.com" });
    await expect(assertAllowed(ctx, id)).resolves.toBeUndefined();
  });
});

test("an email not on the allowlist is refused", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "stranger@example.com" });
    await expect(assertAllowed(ctx, id)).rejects.toThrow("isn't allowed");
  });
});

test("an account without an email is refused", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await expect(assertAllowed(ctx, id)).rejects.toThrow("isn't allowed");
  });
});

test("an empty allowlist refuses everyone", async () => {
  process.env.SIGNUP_ALLOWLIST = "";
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "owner@example.com" });
    await expect(assertAllowed(ctx, id)).rejects.toThrow("isn't allowed");
  });
});
