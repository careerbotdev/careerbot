import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { NotAllowed } from "./allowlist";
import { admit, openInvite } from "./invites";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const NOW = new Date("2026-10-13T12:00:00Z").getTime();
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  delete process.env.CAREERBOT_MODE;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.SIGNUP_ALLOWLIST;
});

// Why a sign-in was refused, or "admitted".
async function outcome(ctx: MutationCtx, userId: Id<"users">) {
  try {
    await admit(ctx, userId);
    return "admitted";
  } catch (e) {
    if (e instanceof ConvexError) return (e.data as NotAllowed).reason;
    throw e;
  }
}

const person = (ctx: MutationCtx, email?: string) => ctx.db.insert("users", email ? { email } : {});

test("an invited email signs up once, in any case, and the invite is used", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const { id } = await openInvite(ctx, " Priya@Example.com ", undefined);
    const priya = await person(ctx, "priya@EXAMPLE.com");
    expect(await outcome(ctx, priya)).toBe("admitted");
    const invite = await ctx.db.get(id);
    expect(invite).toMatchObject({ email: "priya@example.com", status: "accepted", acceptedUserId: priya, acceptedAt: NOW });
    // The same account again, before its workspace is made, still gets in.
    expect(await outcome(ctx, priya)).toBe("admitted");
  });
});

test("an account with another email than the invite's is refused", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await openInvite(ctx, "priya@example.com", undefined);
    expect(await outcome(ctx, await person(ctx, "mallory@example.com"))).toBe("notInvited");
    expect(await outcome(ctx, await person(ctx))).toBe("notInvited");
    expect((await ctx.db.query("invites").first())?.status).toBe("open");
  });
});

test("an invite past its 14 days is refused, and works again once sent again", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const { id } = await openInvite(ctx, "priya@example.com", undefined);
    expect((await ctx.db.get(id))?.expiresAt).toBe(NOW + 14 * DAY);
  });
  vi.setSystemTime(NOW + 14 * DAY);
  await t.run(async (ctx) => {
    const priya = await person(ctx, "priya@example.com");
    expect(await outcome(ctx, priya)).toBe("expired");
    await openInvite(ctx, "priya@example.com", undefined);
    expect(await outcome(ctx, priya)).toBe("admitted");
  });
});

test("a withdrawn invite is refused", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const { id } = await openInvite(ctx, "priya@example.com", undefined);
    await ctx.db.patch(id, { status: "revoked" });
    expect(await outcome(ctx, await person(ctx, "priya@example.com"))).toBe("revoked");
  });
});

test("a used invite doesn't let a second account with the same email in", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await openInvite(ctx, "priya@example.com", undefined);
    const google = await person(ctx, "priya@example.com");
    expect(await outcome(ctx, google)).toBe("admitted");
    await ensureWorkspace(ctx, google);
    const github = await person(ctx, "priya@example.com");
    expect(await outcome(ctx, github)).toBe("used");
    // Inviting it again is refused: it already has an account.
    await expect(openInvite(ctx, "priya@example.com", undefined)).rejects.toThrow("already has an account");
  });
});

test("someone with a workspace signs in without an invite; a suspended one is refused", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const old = await person(ctx, "early@example.com");
    await ensureWorkspace(ctx, old);
    expect(await outcome(ctx, old)).toBe("admitted");
    await ctx.db.insert("suspensions", { userId: old, at: NOW, by: old, allowanceBefore: null });
    expect(await outcome(ctx, old)).toBe("suspended");
  });
});

test("careerbot.dev's sign-in uses invites: an email on the old allowlist alone isn't let in", async () => {
  process.env.SIGNUP_ALLOWLIST = "listed@example.com";
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const listed = await person(ctx, "listed@example.com");
    expect(await outcome(ctx, listed)).toBe("notInvited");
  });
});

test("the invite page reads open, expired, withdrawn, used and unknown links, shows the email only while open, and a resent invite's old link stops working", async () => {
  const t = convexTest(schema, modules);
  const first = await t.run(async (ctx) => (await openInvite(ctx, "priya@example.com", undefined)).token);
  const look = (token: string) => t.query(api.invites.lookup, { token });
  expect(await look(first)).toEqual({ state: "open", email: "priya@example.com", expiresAt: NOW + 14 * DAY, allowanceUsd: null });
  process.env.PLATFORM_OPENROUTER_API_KEY = "sk-or-platform";
  process.env.PLATFORM_AI_LIMIT_USD = "100";
  expect((await look(first)).allowanceUsd).toBe(5);
  delete process.env.PLATFORM_OPENROUTER_API_KEY;
  delete process.env.PLATFORM_AI_LIMIT_USD;
  expect((await look("nope")).state).toBe("unknown");
  const second = await t.run(async (ctx) => (await openInvite(ctx, "priya@example.com", undefined)).token);
  expect((await look(first)).state).toBe("unknown");
  expect((await look(second)).state).toBe("open");
  vi.setSystemTime(NOW + 15 * DAY);
  expect(await look(second)).toMatchObject({ state: "expired", email: null });
  await t.run(async (ctx) => {
    const invite = (await ctx.db.query("invites").first())!;
    await ctx.db.patch(invite._id, { status: "revoked" });
  });
  expect(await look(second)).toMatchObject({ state: "revoked", email: null });
  await t.run(async (ctx) => {
    const invite = (await ctx.db.query("invites").first())!;
    await ctx.db.patch(invite._id, { status: "accepted" });
  });
  expect(await look(second)).toMatchObject({ state: "accepted", email: null });
});

test("the allowlist carries over: people who signed in get a used invite, others an open one with its link, once", async () => {
  process.env.SIGNUP_ALLOWLIST = "Early@example.com, new@example.com";
  process.env.SITE_URL = "https://careerbot.dev";
  const t = convexTest(schema, modules);
  const early = await t.run(async (ctx) => {
    const id = await person(ctx, "early@example.com");
    await ensureWorkspace(ctx, id);
    return id;
  });
  const carried = await t.mutation(internal.invites.fromAllowlist, {});
  expect(carried.map((c) => [c.email, c.state])).toEqual([
    ["early@example.com", "accepted"],
    ["new@example.com", "open"],
  ]);
  expect(carried[1].link).toMatch(/^https:\/\/careerbot\.dev\/invite\/[0-9a-f]{48}$/);
  await t.run(async (ctx) => {
    const invites = await ctx.db.query("invites").collect();
    expect(invites.find((i) => i.email === "early@example.com")).toMatchObject({ status: "accepted", acceptedUserId: early });
    expect(await ctx.db.query("adminLog").collect()).toHaveLength(2);
  });
  expect((await t.mutation(internal.invites.fromAllowlist, {})).map((c) => c.state)).toEqual(["already invited", "already invited"]);
  await t.run(async (ctx) => {
    expect(await outcome(ctx, await person(ctx, "new@example.com"))).toBe("admitted");
  });
  delete process.env.SITE_URL;
});
