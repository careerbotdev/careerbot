import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertAllowed } from "./allowlist";
import type { PasswordRefusal } from "./passwordRules";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
// Each password is hashed with Scrypt, slow on purpose: a test that signs in a few times takes seconds.
vi.setConfig({ testTimeout: 30_000 });

// Convex Auth signs the session's tokens with JWT_PRIVATE_KEY: a key made once for these tests.
let privateKey = "";
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))));
  privateKey = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
});

beforeEach(() => {
  vi.useFakeTimers();
  process.env.CAREERBOT_MODE = "self-hosted";
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.CONVEX_SITE_URL = "http://localhost:3211";
  process.env.SIGNUP_ALLOWLIST = "";
});
afterEach(() => {
  vi.useRealTimers();
  for (const key of ["CAREERBOT_MODE", "JWT_PRIVATE_KEY", "CONVEX_SITE_URL", "SIGNUP_ALLOWLIST"]) delete process.env[key];
});

type T = TestConvex<typeof schema>;
const signIn = (t: T, params: Record<string, string>) => t.action(api.auth.signIn, { provider: "password", params });

// What a refused sign-in says, or "signed in".
async function outcome(run: Promise<unknown>) {
  try {
    await run;
    return "signed in";
  } catch (e) {
    if (e instanceof ConvexError) return (e.data as PasswordRefusal).reason ?? e.data;
    throw e;
  }
}

async function newCode(t: T) {
  const made = await t.action(internal.account.newSetupCode, {});
  if (!("code" in made)) throw new Error("no code made");
  return made.code;
}

const userNamed = (t: T, username: string) => t.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.username === username)!);
const sessionsOf = (t: T, userId: Id<"users">) => t.run((ctx) => ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect());

// A copy with its owner, sam, signed in: `asOwner` calls as them.
async function withOwner() {
  const t = convexTest(schema, modules);
  const code = await newCode(t);
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: code, username: "Sam", password: "correct horse" }))).toBe("signed in");
  const owner = await userNamed(t, "sam");
  const [session] = await sessionsOf(t, owner._id);
  return { t, owner, asOwner: t.withIdentity({ subject: `${owner._id}|${session._id}` }) };
}

test("the owner account needs the newest setup code; a wrong one is refused and counted", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.account.ownerNeeded, {})).toBe(true);
  const code = await newCode(t);
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: "AAAA-AAAA", username: "sam", password: "correct horse" }))).toBe("setupCode");
  expect((await t.run((ctx) => ctx.db.query("setupCodes").first()))?.wrongTries).toBe(1);
  // Typed loosely: lower case, no dash.
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: code.replace("-", "").toLowerCase(), username: "sam", password: "correct horse" }))).toBe("signed in");
  expect(await t.query(api.account.ownerNeeded, {})).toBe(false);
  expect((await userNamed(t, "sam")).owner).toBe(true);
});

test("a used setup code makes no second owner, and no new code is made once there's an owner", async () => {
  const { t } = await withOwner();
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: "AAAA-AAAA", username: "mallory", password: "correct horse" }))).toBe("ownerExists");
  expect(await t.action(internal.account.newSetupCode, {})).toEqual({ owner: "sam" });
});

test("a new setup code replaces the old one", async () => {
  const t = convexTest(schema, modules);
  const old = await newCode(t);
  const fresh = await newCode(t);
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: old, username: "sam", password: "correct horse" }))).toBe("setupCode");
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: fresh, username: "sam", password: "correct horse" }))).toBe("signed in");
});

test("after ten wrong tries the setup code stops working, even typed right", async () => {
  const t = convexTest(schema, modules);
  const code = await newCode(t);
  for (let i = 0; i < 10; i++) await outcome(signIn(t, { flow: "signUp", setupCode: "AAAA-AAAA", username: "sam", password: "correct horse" }));
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: code, username: "sam", password: "correct horse" }))).toBe("setupCode");
  expect(await t.query(api.account.ownerNeeded, {})).toBe(true);
});

test("passwords need 8 characters; a refused one doesn't spend the setup code", async () => {
  const t = convexTest(schema, modules);
  const code = await newCode(t);
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: code, username: "sam", password: "seven77" }))).toBe("invalid");
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: code, username: "s", password: "correct horse" }))).toBe("invalid");
  expect(await outcome(signIn(t, { flow: "signUp", setupCode: code, username: "sam", password: "eight888" }))).toBe("signed in");
});

test("sign-in takes the username in any case and refuses a wrong password or an unknown name alike", async () => {
  const { t } = await withOwner();
  expect(await outcome(signIn(t, { flow: "signIn", username: " SAM", password: "correct horse" }))).toBe("signed in");
  expect(await outcome(signIn(t, { flow: "signIn", username: "sam", password: "wrong horse" }))).toBe("wrongPassword");
  expect(await outcome(signIn(t, { flow: "signIn", username: "nobody", password: "correct horse" }))).toBe("wrongPassword");
});

test("password sign-in is off on careerbot.dev", async () => {
  const t = convexTest(schema, modules);
  delete process.env.CAREERBOT_MODE;
  expect(await outcome(signIn(t, { flow: "signIn", username: "sam", password: "correct horse" }))).toBe("off");
  expect(await t.query(api.account.ownerNeeded, {})).toBe(false);
  expect(await t.query(api.auth.signInMethods, {})).toEqual([]);
});

test("only the owner sees and manages people", async () => {
  const { t, asOwner } = await withOwner();
  const { temporaryPassword } = await asOwner.action(api.account.addPerson, { username: "Alex" });
  const alex = await userNamed(t, "alex");
  const asAlex = t.withIdentity({ subject: `${alex._id}|s` });
  expect(await asAlex.query(api.account.people, {})).toBeNull();
  await expect(asAlex.action(api.account.addPerson, { username: "eve" })).rejects.toThrow("owner");
  const owner = await userNamed(t, "sam");
  await expect(asAlex.action(api.account.resetPersonPassword, { userId: owner._id })).rejects.toThrow("owner");
  await expect(asAlex.action(api.account.removePerson, { userId: owner._id })).rejects.toThrow("owner");
  await expect(t.action(api.account.addPerson, { username: "eve" })).rejects.toThrow("owner");
  await expect(asOwner.action(api.account.addPerson, { username: "alex" })).rejects.toThrow("already");
  const people = await asOwner.query(api.account.people, {});
  expect(people?.map((p) => [p.username, p.owner, p.you, p.temporaryPassword])).toEqual([
    ["sam", true, true, false],
    ["alex", false, false, true],
  ]);
  expect(temporaryPassword).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
});

test("a temporary password asks for a new one, which signs in and ends the temporary one", async () => {
  const { t, asOwner } = await withOwner();
  const { temporaryPassword } = await asOwner.action(api.account.addPerson, { username: "alex" });
  expect(await outcome(signIn(t, { flow: "signIn", username: "alex", password: temporaryPassword }))).toBe("newPasswordNeeded");
  expect(await outcome(signIn(t, { flow: "newPassword", username: "alex", password: temporaryPassword, newPassword: "short" }))).toBe("invalid");
  expect(await outcome(signIn(t, { flow: "newPassword", username: "alex", password: temporaryPassword, newPassword: "alex's own one" }))).toBe("signed in");
  expect(await outcome(signIn(t, { flow: "signIn", username: "alex", password: temporaryPassword }))).toBe("wrongPassword");
  expect(await outcome(signIn(t, { flow: "signIn", username: "alex", password: "alex's own one" }))).toBe("signed in");
  expect((await userNamed(t, "alex")).temporaryPassword).toBeUndefined();
});

test("changing a password ends every other session", async () => {
  const { t, owner } = await withOwner();
  await signIn(t, { flow: "signIn", username: "sam", password: "correct horse" });
  expect(await sessionsOf(t, owner._id)).toHaveLength(2);
  expect(await outcome(signIn(t, { flow: "newPassword", username: "sam", password: "correct horse", newPassword: "battery staple" }))).toBe("signed in");
  expect(await sessionsOf(t, owner._id)).toHaveLength(1);
  expect(await outcome(signIn(t, { flow: "signIn", username: "sam", password: "correct horse" }))).toBe("wrongPassword");
});

test("the owner's reset gives someone a temporary password and signs them out everywhere", async () => {
  const { t, asOwner } = await withOwner();
  const added = await asOwner.action(api.account.addPerson, { username: "alex" });
  await signIn(t, { flow: "newPassword", username: "alex", password: added.temporaryPassword, newPassword: "alex's own one" });
  const alex = await userNamed(t, "alex");
  expect(await sessionsOf(t, alex._id)).toHaveLength(1);
  const reset = await asOwner.action(api.account.resetPersonPassword, { userId: alex._id });
  expect(await sessionsOf(t, alex._id)).toHaveLength(0);
  expect(await outcome(signIn(t, { flow: "signIn", username: "alex", password: "alex's own one" }))).toBe("wrongPassword");
  expect(await outcome(signIn(t, { flow: "signIn", username: "alex", password: reset.temporaryPassword }))).toBe("newPasswordNeeded");
  const owner = await userNamed(t, "sam");
  await expect(asOwner.action(api.account.resetPersonPassword, { userId: owner._id })).rejects.toThrow("That’s you");
});

test("the owner's own reset, from the command line, works the same way", async () => {
  const { t } = await withOwner();
  await expect(t.action(internal.account.resetPassword, { username: "nobody" })).rejects.toThrow("No account");
  const { temporaryPassword } = await t.action(internal.account.resetPassword, { username: "Sam" });
  expect(await outcome(signIn(t, { flow: "signIn", username: "sam", password: "correct horse" }))).toBe("wrongPassword");
  expect(await outcome(signIn(t, { flow: "signIn", username: "sam", password: temporaryPassword }))).toBe("newPasswordNeeded");
});

test("removing someone deletes their account and everything in their workspace, and no one else's", async () => {
  const { t, owner, asOwner } = await withOwner();
  const added = await asOwner.action(api.account.addPerson, { username: "alex" });
  await signIn(t, { flow: "newPassword", username: "alex", password: added.temporaryPassword, newPassword: "alex's own one" });
  const alex = await userNamed(t, "alex");
  const workspaceOf = (userId: Id<"users">) => t.run(async (ctx) => (await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).unique())!.workspaceId);
  const [theirs, mine] = [await workspaceOf(alex._id), await workspaceOf(owner._id)];
  await t.run(async (ctx) => {
    for (const workspaceId of [theirs, mine]) await ctx.db.insert("profiles", { workspaceId, name: "A name", links: [] });
  });
  await asOwner.action(api.account.removePerson, { userId: alex._id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    expect(await ctx.db.get(alex._id)).toBeNull();
    expect(await ctx.db.get(theirs)).toBeNull();
    expect((await ctx.db.query("profiles").collect()).map((p) => p.workspaceId)).toEqual([mine]);
    expect(await ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", "alex")).unique()).toBeNull();
  });
  expect(await outcome(signIn(t, { flow: "signIn", username: "alex", password: "alex's own one" }))).toBe("wrongPassword");
});

test("on a self-hosted copy, Google and GitHub need SIGNUP_ALLOWLIST; password accounts don't", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const google = await ctx.db.insert("users", { email: "friend@example.com" });
    await ctx.db.insert("authAccounts", { userId: google, provider: "google", providerAccountId: "g1" });
    await expect(assertAllowed(ctx, google)).rejects.toThrow("Ask its owner to add you");
    process.env.SIGNUP_ALLOWLIST = "Friend@example.com";
    await expect(assertAllowed(ctx, google)).resolves.toBeUndefined();
    const password = await ctx.db.insert("users", { username: "alex" });
    await ctx.db.insert("authAccounts", { userId: password, provider: "password", providerAccountId: "alex" });
    await expect(assertAllowed(ctx, password)).resolves.toBeUndefined();
  });
});
