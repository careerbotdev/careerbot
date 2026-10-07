import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount, getAuthUserId, invalidateSessions, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query, type ActionCtx, type QueryCtx } from "./_generated/server";
import { action } from "./functions";
import { selfHosted } from "./allowlist";
import { normalSetupCode, normalUsername, passwordProblem, SETUP_ALPHABET, usernameProblem, type PasswordRefusal } from "./passwordRules";
import schema from "./schema";

// Username and password sign-in for a self-hosted copy (CAREERBOT_MODE=self-hosted; careerbot.dev stays Google and
// GitHub, invite-only). There's no email, so:
//   - The first account is the owner's, made with a setup code the installer prints (newSetupCode, run by
//     docker/convex-setup.sh). After that, sign-up is closed: the owner adds people in Settings, Account.
//   - A person the owner adds, or whose password the owner resets, gets a temporary password from the owner. It signs
//     in once: the sign-in asks for a password of their own and saves it (the flow "newPassword"), and their other
//     sessions end. The same flow changes a password in Settings, Account.
//   - The owner's own password is reset where CareerBot was installed: resetPassword, from the command line or the
//     Convex dashboard's Functions page (both need the deployment's admin key, so only whoever runs the copy can).
// Accounts are Convex Auth credentials accounts (provider "password") whose id is the username; passwords are hashed
// with Scrypt, as Convex Auth's own Password provider does. Failed sign-ins are rate-limited per account by Convex Auth
// (10 an hour).

const PROVIDER = "password";
const scrypt = new Scrypt();

function refuse(reason: PasswordRefusal["reason"], message: string): never {
  const refusal: PasswordRefusal = { kind: "password", reason, message };
  throw new ConvexError(refusal);
}

const WRONG = "That username and password don’t match. Try again, or reset your password.";

// The account and person for a username and password, or the refusal the sign-in screen shows.
async function check(ctx: ActionCtx, username: string, password: string) {
  try {
    const found = await retrieveAccount(ctx, { provider: PROVIDER, account: { id: username, secret: password } });
    if (!found) refuse("wrongPassword", WRONG);
    return found.user as Doc<"users">;
  } catch (e) {
    if (e instanceof ConvexError) throw e;
    const why = e instanceof Error ? e.message : "";
    if (why === "TooManyFailedAttempts") refuse("tooManyAttempts", "Too many wrong passwords for this username. Wait a few minutes and try again, or reset your password.");
    if (why === "InvalidAccountId" || why === "InvalidSecret") refuse("wrongPassword", WRONG);
    throw e;
  }
}

export const passwords = ConvexCredentials<DataModel>({
  id: PROVIDER,
  crypto: { hashSecret: (secret) => scrypt.hash(secret), verifySecret: (secret, hash) => scrypt.verify(hash, secret) },
  authorize: async (params, ctx) => {
    if (!selfHosted()) refuse("off", "Username and password sign-in is off on this copy.");
    const username = normalUsername(String(params.username ?? ""));
    const password = String(params.password ?? "");
    switch (params.flow) {
      // The owner's account: the setup code, a username and a password.
      case "signUp": {
        const problem = usernameProblem(username) ?? passwordProblem(password);
        if (problem) refuse("invalid", problem);
        const used = await ctx.runMutation(internal.account.useSetupCode, { hash: await sha256(normalSetupCode(String(params.setupCode ?? ""))) });
        if (used === "ownerExists") refuse("ownerExists", "This copy already has its owner. Sign in instead.");
        if (used === "tooManyTries") refuse("setupCode", "That setup code was tried wrongly too many times and no longer works. Make a new one with the command below.");
        if (used !== "ok") refuse("setupCode", "That setup code doesn’t work. Check it in the install’s output, or make a new one.");
        const { user } = await createAccount(ctx, {
          provider: PROVIDER,
          account: { id: username, secret: password },
          profile: { name: username, username, owner: true } as never,
          shouldLinkViaEmail: false,
          shouldLinkViaPhone: false,
        });
        return { userId: user._id };
      }
      case "signIn": {
        const user = await check(ctx, username, password);
        if (user.temporaryPassword) refuse("newPasswordNeeded", "You signed in with a temporary password. Choose your own to carry on.");
        return { userId: user._id };
      }
      // A password of their own, in place of the temporary one or the one they have; every other session ends.
      case "newPassword": {
        const next = String(params.newPassword ?? "");
        const problem = passwordProblem(next);
        if (problem) refuse("invalid", problem);
        const user = await check(ctx, username, password);
        if (next === password) refuse("invalid", "Choose a password that isn’t the one you have now.");
        await modifyAccountCredentials(ctx, { provider: PROVIDER, account: { id: username, secret: next } });
        await ctx.runMutation(internal.account.passwordChosen, { userId: user._id });
        await invalidateSessions(ctx, { userId: user._id });
        return { userId: user._id };
      }
      default:
        throw new ConvexError("Unknown sign-in flow.");
    }
  },
});

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Random numbers below `n`, from the platform's secure generator (actions only: queries and mutations are seeded).
function randomBelow(n: number, count: number) {
  return [...crypto.getRandomValues(new Uint32Array(count))].map((x) => x % n);
}

// A temporary password a person can read out or type: two words and four digits (maple-tide-4182).
const WORDS =
  "acorn amber anchor apple aspen atlas badge bamboo banjo barley basil beach beacon bear birch bison blaze bloom brave breeze brick brook cabin cactus camel candle canoe canyon cargo cedar chalk cherry cider cliff clover cloud coast cobalt comet coral cotton crane creek crow dawn delta desert dove dune eagle echo ember fable falcon fern field finch flame flint flute forest frost garden ginger glade goose grain granite grape grove harbor hawk hazel heath heron honey ivory jade jasmine juniper kayak kettle kite lantern larch lark lemon lilac linen lotus lunar lynx mango maple marble marsh meadow melon mesa mint moss nectar north nutmeg oasis ocean olive onyx orbit orchid otter panda pearl pebble pepper petal plum pond poppy prairie quail quartz quill raven ridge river robin rowan ruby saddle sage salmon shell shore silk silver slate sparrow spruce stone storm stream summit swan thistle thyme tide tiger timber topaz trail tulip tundra valley velvet violet walnut willow wren yarrow zebra zephyr".split(" ");

function temporaryPassword() {
  const [a, b, n] = randomBelow(WORDS.length, 2).concat(randomBelow(10000, 1));
  return `${WORDS[a]}-${WORDS[b]}-${String(n).padStart(4, "0")}`;
}

// ─── Setup codes ────────────────────────────────────────────────────────────────────────────────────────────────────

const MAX_WRONG_TRIES = 10;

async function ownerOf(ctx: QueryCtx) {
  return await ctx.db
    .query("users")
    .withIndex("by_owner", (q) => q.eq("owner", true))
    .first();
}

// Makes a setup code, which creates the owner account once; any earlier code stops working. When the copy has its owner
// already, it makes none and says whose it is. The installer runs it on every start until there's an owner
// (docker/convex-setup.sh); `docker compose run --rm convex-setup new-setup-code`, or
// `npx convex run account:newSetupCode` without Docker, makes a new one.
export const newSetupCode = internalAction({
  args: {},
  handler: async (ctx): Promise<{ code: string } | { owner: string }> => {
    const owner = await ctx.runQuery(internal.account.ownerName, {});
    if (owner !== null) return { owner };
    const chars = randomBelow(SETUP_ALPHABET.length, 8).map((i) => SETUP_ALPHABET[i]);
    const code = `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
    await ctx.runMutation(internal.account.storeSetupCode, { hash: await sha256(normalSetupCode(code)) });
    return { code };
  },
});

export const ownerName = internalQuery({
  args: {},
  handler: async (ctx) => {
    const owner = await ownerOf(ctx);
    return owner ? (owner.username ?? owner.name ?? owner.email ?? "the owner") : null;
  },
});

export const storeSetupCode = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    await ctx.db.insert("setupCodes", { hash, wrongTries: 0 });
  },
});

// Spends the newest setup code if it's the one given (by its hash). A wrong one counts against it; returns why not.
export const useSetupCode = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }): Promise<"ok" | "wrong" | "tooManyTries" | "ownerExists"> => {
    if (await ownerOf(ctx)) return "ownerExists";
    const newest = await ctx.db.query("setupCodes").order("desc").first();
    if (!newest || newest.usedAt !== undefined) return "wrong";
    if (newest.wrongTries >= MAX_WRONG_TRIES) return "tooManyTries";
    if (newest.hash !== hash) {
      await ctx.db.patch(newest._id, { wrongTries: newest.wrongTries + 1 });
      return newest.wrongTries + 1 >= MAX_WRONG_TRIES ? "tooManyTries" : "wrong";
    }
    await ctx.db.patch(newest._id, { usedAt: Date.now() });
    return "ok";
  },
});

// Whether the sign-in screen should offer Create your account: a self-hosted copy with no owner yet.
export const ownerNeeded = query({
  args: {},
  handler: async (ctx) => selfHosted() && !(await ownerOf(ctx)),
});

// ─── Temporary passwords ────────────────────────────────────────────────────────────────────────────────────────────

export const passwordChosen = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { temporaryPassword: undefined });
  },
});

// Marks a person's password as temporary and clears their wrong-password count (the reset is how they get back in).
export const markTemporary = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { temporaryPassword: true });
    const account = await passwordAccount(ctx, userId);
    const limit = account && (await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", account._id)).unique());
    if (limit) await ctx.db.delete(limit._id);
  },
});

async function passwordAccount(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", PROVIDER))
    .first();
}

// Gives a password account a temporary password: the old one stops working and every session ends.
async function setTemporary(ctx: ActionCtx, userId: Id<"users">, username: string) {
  const password = temporaryPassword();
  await modifyAccountCredentials(ctx, { provider: PROVIDER, account: { id: username, secret: password } });
  await ctx.runMutation(internal.account.markTemporary, { userId });
  await invalidateSessions(ctx, { userId });
  return password;
}

export const accountFor = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", PROVIDER).eq("providerAccountId", username))
      .unique();
    return account && { userId: account.userId, username: account.providerAccountId };
  },
});

// The owner's way back in (or anyone's, by whoever runs the copy): a temporary password for a username, printed to sign
// in with once. `docker compose run --rm convex-setup reset-password sam`, or
// `npx convex run account:resetPassword '{"username":"sam"}'`, or the Convex dashboard's Functions page.
export const resetPassword = internalAction({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<{ username: string; temporaryPassword: string }> => {
    const account = await ctx.runQuery(internal.account.accountFor, { username: normalUsername(username) });
    if (!account) throw new ConvexError(`No account here has the username ${normalUsername(username)}.`);
    return { username: account.username, temporaryPassword: await setTemporary(ctx, account.userId, account.username) };
  },
});

// ─── People (Settings, Account; the owner only) ─────────────────────────────────────────────────────────────────────

export type Person = {
  id: Id<"users">;
  username: string | null;
  name: string | null;
  email: string | null;
  provider: string | null;
  owner: boolean;
  you: boolean;
  addedAt: number;
  lastSignInAt: number | null;
  temporaryPassword: boolean;
};

async function requireOwner(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const me = userId && (await ctx.db.get(userId));
  if (!selfHosted() || !me?.owner) throw new ConvexError("Only this copy’s owner can do that.");
  return me;
}

export const ownerId = internalQuery({
  args: {},
  handler: async (ctx) => (await requireOwner(ctx))._id,
});

// Who can sign in to this copy: everyone with a password account or a workspace, the owner first, then by when they
// were added. Null for anyone but the owner.
export const people = query({
  args: {},
  handler: async (ctx): Promise<Person[] | null> => {
    const userId = await getAuthUserId(ctx);
    const me = userId && (await ctx.db.get(userId));
    if (!selfHosted() || !me?.owner) return null;
    const list: Person[] = [];
    for (const user of await ctx.db.query("users").collect()) {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
        .first();
      const member = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (account?.provider !== PROVIDER && !member) continue;
      list.push({
        id: user._id,
        username: user.username ?? null,
        name: user.name ?? null,
        email: user.email ?? null,
        provider: account?.provider ?? null,
        owner: !!user.owner,
        you: user._id === me._id,
        addedAt: user._creationTime,
        lastSignInAt: user.lastSignInAt ?? null,
        temporaryPassword: !!user.temporaryPassword,
      });
    }
    return list.sort((a, b) => Number(b.owner) - Number(a.owner) || a.addedAt - b.addedAt);
  },
});

// Adds a person with a username of the owner's choosing and returns their temporary password, for the owner to give
// them. Their workspace is made when they first sign in.
export const addPerson = action({
  args: { username: v.string() },
  handler: async (ctx, args): Promise<{ username: string; temporaryPassword: string }> => {
    await ctx.runQuery(internal.account.ownerId, {});
    const username = normalUsername(args.username);
    const problem = usernameProblem(username);
    if (problem) throw new ConvexError(problem);
    if (await ctx.runQuery(internal.account.accountFor, { username })) throw new ConvexError(`Someone here already has the username ${username}.`);
    const password = temporaryPassword();
    await createAccount(ctx, {
      provider: PROVIDER,
      account: { id: username, secret: password },
      profile: { name: username, username, temporaryPassword: true } as never,
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });
    return { username, temporaryPassword: password };
  },
});

export const personToChange = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await requireOwner(ctx);
    if (userId === me._id) throw new ConvexError("That’s you: change your own password, or reset it from the command line.");
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("That person isn’t here any more.");
    const account = await passwordAccount(ctx, userId);
    return { name: user.username ?? user.name ?? user.email ?? "them", username: account?.providerAccountId ?? null };
  },
});

// A new temporary password for someone else (the owner's own: resetPassword). Their old password stops working and
// they're signed out everywhere.
export const resetPersonPassword = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ username: string; temporaryPassword: string }> => {
    const person = await ctx.runQuery(internal.account.personToChange, { userId });
    if (!person.username) throw new ConvexError(`${person.name} signs in with Google or GitHub, so there’s no password to reset.`);
    return { username: person.username, temporaryPassword: await setTemporary(ctx, userId, person.username) };
  },
});

// Removes someone else: signed out everywhere, their account gone at once, and their workspace with everything in it
// deleted in the background (purgeWorkspace).
export const removePerson = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.runQuery(internal.account.personToChange, { userId });
    await invalidateSessions(ctx, { userId });
    await ctx.runMutation(internal.account.removeUser, { userId });
  },
});

export const removeUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    for (const account of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect()) {
      for (const limit of await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", account._id)).collect()) await ctx.db.delete(limit._id);
      for (const code of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", account._id)).collect()) await ctx.db.delete(code._id);
      await ctx.db.delete(account._id);
    }
    for (const member of await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) {
      await ctx.db.delete(member._id);
      const others = await ctx.db.query("memberships").withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId)).first();
      if (!others) await ctx.scheduler.runAfter(0, internal.account.purgeWorkspace, { workspaceId: member.workspaceId, table: 0 });
    }
    await ctx.db.delete(userId);
  },
});

// Every table a workspace's rows can be in (all but Convex Auth's own and the copy-wide ones; a row without this
// workspace's id is left alone either way).
const PURGED = (Object.keys(schema.tables) as TableNames[]).filter((t) => !t.startsWith("auth") && !["users", "setupCodes", "workspaces"].includes(t));

// Deletes a removed person's workspace: every row with its id, a page of one table at a time, then the workspace.
export const purgeWorkspace = internalMutation({
  args: { workspaceId: v.id("workspaces"), table: v.number(), cursor: v.optional(v.string()) },
  handler: async (ctx, { workspaceId, table, cursor }) => {
    if (table >= PURGED.length) {
      if (await ctx.db.get(workspaceId)) await ctx.db.delete(workspaceId);
      return;
    }
    const page = await ctx.db.query(PURGED[table]).paginate({ cursor: cursor ?? null, numItems: 500 });
    for (const doc of page.page) if ("workspaceId" in doc && doc.workspaceId === workspaceId) await ctx.db.delete(doc._id);
    await ctx.scheduler.runAfter(0, internal.account.purgeWorkspace, page.isDone ? { workspaceId, table: table + 1 } : { workspaceId, table, cursor: page.continueCursor });
  },
});
