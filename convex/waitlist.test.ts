import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("a valid email is stored once, lowercased and trimmed, with its source", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(api.waitlist.join, { email: "  Ada@Example.COM ", source: "hero" })).toEqual({ ok: true });
  const rows = await t.query(internal.waitlist.list, {});
  expect(rows).toEqual([{ email: "ada@example.com", at: expect.any(Number), source: "hero" }]);
});

test("joining again with the same email, in any case, answers the same and adds no row", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.waitlist.join, { email: "ada@example.com" });
  expect(await t.mutation(api.waitlist.join, { email: "ADA@example.com", source: "footer" })).toEqual({ ok: true });
  const rows = await t.query(internal.waitlist.list, {});
  expect(rows).toHaveLength(1);
  expect(rows[0].source).toBeNull();
});

test("a filled-in hidden field answers ok and stores nothing", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(api.waitlist.join, { email: "bot@example.com", website: "http://spam.example" })).toEqual({ ok: true });
  expect(await t.query(internal.waitlist.list, {})).toEqual([]);
});

test("something that isn't an email address is refused and not stored", async () => {
  const t = convexTest(schema, modules);
  for (const email of ["", "   ", "ada", "ada@", "@example.com", "ada@example", "ada example@x.com", "a@@b.com", `${"a".repeat(250)}@x.com`]) {
    await expect(t.mutation(api.waitlist.join, { email })).rejects.toThrow("That doesn't look like an email address.");
  }
  expect(await t.query(internal.waitlist.list, {})).toEqual([]);
});

test("after 200 joins in ten minutes, the next is refused; joins older than that don't count", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 200; i++) await ctx.db.insert("waitlist", { email: `old${i}@example.com`, at: now - 11 * 60 * 1000 });
  });
  expect(await t.mutation(api.waitlist.join, { email: "first@example.com" })).toEqual({ ok: true });
  await t.run(async (ctx) => {
    for (let i = 0; i < 199; i++) await ctx.db.insert("waitlist", { email: `new${i}@example.com`, at: now });
  });
  await expect(t.mutation(api.waitlist.join, { email: "late@example.com" })).rejects.toThrow("Too many sign-ups right now. Try again in a few minutes.");
  expect((await t.query(internal.waitlist.list, {})).some((r) => r.email === "late@example.com")).toBe(false);
});

test("someone who asks is taken off the list, however their address is typed", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.waitlist.join, { email: "ada@example.com" });
  await t.mutation(api.waitlist.join, { email: "bo@example.com" });
  expect(await t.mutation(internal.waitlist.remove, { email: " ADA@example.com" })).toEqual({ removed: true });
  expect((await t.query(internal.waitlist.list, {})).map((r) => r.email)).toEqual(["bo@example.com"]);
  expect(await t.mutation(internal.waitlist.remove, { email: "ada@example.com" })).toEqual({ removed: false });
});
