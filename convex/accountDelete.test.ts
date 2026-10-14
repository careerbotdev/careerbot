// @vitest-environment node
import { readFileSync } from "node:fs";
import { convexTest, type TestConvex } from "convex-test";
import type { GenericValidator } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { ORDER, PERSON_TABLES } from "./accountDelete";
import { isDemoRefusal } from "./demoRefusal";
import schema from "./schema";
import { seal } from "./secretBox";
import { classify, copyRows, type Known, type Row, thisSchema, WORKSPACE_TABLES } from "./workspaceCopy";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
// Renata Alvarez's frozen persona run: every kind of row a real search makes.
const SNAPSHOT = JSON.parse(readFileSync("testdata/demo/renata-alvarez.json", "utf8")) as { workspace: { _id: string }; outside: Record<string, string>; tables: Record<string, Row[]> };

let fetched: { url: string; method: string }[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  process.env.MASTER_KEY_V1 = "99".repeat(32);
  fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      fetched.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response(null, { status: 204 });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of ["MASTER_KEY_V1", "CAREERBOT_MODE"]) delete process.env[key];
});

type T = TestConvex<typeof schema>;

// A person with a whole search in their workspace (the persona's rows), a stored file, keys, Drive and GitHub
// connections, sign-in account and session, and a waitlist entry.
async function person(t: T, email: string, installationId: number) {
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { name: email.split("@")[0], email });
    return { u, w: await ensureWorkspace(ctx, u) };
  });
  const known: Known = { map: new Map([[SNAPSHOT.workspace._id, w]]), pending: new Set(), outside: new Set() };
  await copyRows({ workspaceId: SNAPSHOT.workspace._id, outside: Object.keys(SNAPSHOT.outside), tables: SNAPSHOT.tables }, thisSchema(), known, {
    insert: (table, rows) => t.run(async (ctx) => Promise.all(rows.map((r) => ctx.db.insert(table as never, { ...r.doc, workspaceId: w } as never) as Promise<string>))),
    patch: (_, patches) => t.run(async (ctx) => void (await Promise.all(patches.map((p) => ctx.db.patch(p.id as never, p.set))))),
  });
  const sealed = await seal(`refresh-${email}`);
  const file = await t.run(async (ctx) => {
    const file = await ctx.storage.store(new Blob([`export of ${email}`]));
    await ctx.db.insert("exports", { workspaceId: w, status: "done", done: 1, total: 1, fileId: file, name: "careerbot-export.zip", beat: 0, at: 0 });
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "4f2a", setAt: 0 });
    await ctx.db.insert("driveConnections", { workspaceId: w, account: email, sealedRefresh: sealed, sealedAccess: sealed, accessExpiresAt: 0, at: 0 });
    await ctx.db.insert("githubInstalls", { workspaceId: w, installationId, account: email, selection: "all", settingsUrl: "https://github.com/settings/installations/1", at: 0 });
    const account = await ctx.db.insert("authAccounts", { userId: u, provider: "google", providerAccountId: email });
    await ctx.db.insert("authRateLimits", { identifier: account, lastAttemptTime: 0, attemptsLeft: 9 });
    const session = await ctx.db.insert("authSessions", { userId: u, expirationTime: Date.now() + 3_600_000 });
    await ctx.db.insert("authRefreshTokens", { sessionId: session, expirationTime: Date.now() + 3_600_000 });
    await ctx.db.insert("waitlist", { email, at: 0 });
    return file;
  });
  return { u, w, file, as: t.withIdentity({ subject: `${u}|s` }) };
}

// Every row a workspace has, by table.
const countsOf = (t: T, workspaceId: Id<"workspaces">) =>
  t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of Object.keys(WORKSPACE_TABLES)) {
      const rows = await ctx.db.query(table as TableNames).collect();
      counts[table] = rows.filter((r) => "workspaceId" in r && r.workspaceId === workspaceId).length;
    }
    return counts;
  });

async function withGithubApp(t: T) {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))));
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  await t.mutation(internal.githubApp.save, { appId: 1, slug: "careerbot", clientId: "Iv1", owner: "careerbot", sealedPem: await seal(pem), sealedClientSecret: await seal("s"), sealedWebhookSecret: await seal("w") });
}

test("deleting an account takes everything of theirs, files, keys, connections and sign-ins included, and nothing of anyone else's", async () => {
  const t = convexTest(schema, modules);
  await withGithubApp(t);
  const a = await person(t, "ana@example.com", 111);
  const b = await person(t, "ben@example.com", 222);
  const before = await countsOf(t, a.w);
  expect(Object.values(before).filter((n) => n > 0).length).toBeGreaterThan(20);
  const bBefore = await countsOf(t, b.w);

  await expect(a.as.mutation(api.accountDelete.start, { confirm: "ben@example.com" })).rejects.toThrow("Type ana@example.com to confirm");
  await a.as.mutation(api.accountDelete.start, { confirm: " Ana@Example.com " });
  // Asking again while it runs starts nothing new.
  await a.as.mutation(api.accountDelete.start, { confirm: "ana@example.com" });
  expect(await t.run((ctx) => ctx.db.query("accountDeletions").collect())).toHaveLength(1);
  expect((await a.as.query(api.accountDelete.status, {}))?.deletion?.step).toBe("revoking");

  // Run up to the end of the grace period: the account is gone, and the screen still learns it's done.
  for (let i = 0; i < 200 && (await t.run(async (ctx) => (await ctx.db.query("accountDeletions").first())?.step)) !== "done"; i++) {
    vi.advanceTimersByTime(15_000);
    await t.finishInProgressScheduledFunctions();
  }
  expect((await a.as.query(api.accountDelete.status, {}))?.deletion?.step).toBe("done");

  expect(Object.values(await countsOf(t, a.w)).every((n) => n === 0)).toBe(true);
  expect(await countsOf(t, b.w)).toEqual(bBefore);
  await t.run(async (ctx) => {
    expect(await ctx.db.get(a.u)).toBeNull();
    expect(await ctx.db.get(a.w)).toBeNull();
    expect(await ctx.storage.get(a.file)).toBeNull();
    expect(await ctx.storage.get(b.file)).not.toBeNull();
    for (const table of ["authAccounts", "authSessions"] as const) expect((await ctx.db.query(table).collect()).map((r) => r.userId)).toEqual([b.u]);
    expect(await ctx.db.query("authRefreshTokens").collect()).toHaveLength(1);
    expect(await ctx.db.query("authRateLimits").collect()).toHaveLength(1);
    expect((await ctx.db.query("waitlist").collect()).map((w) => w.email)).toEqual(["ben@example.com"]);
    expect((await ctx.db.query("memberships").collect()).map((m) => m.userId)).toEqual([b.u]);
    expect(await ctx.db.get(b.u)).not.toBeNull();
  });
  // Google revoked A's Drive token, and the GitHub installation only A used was uninstalled.
  expect(fetched.filter((f) => f.url.startsWith("https://oauth2.googleapis.com/revoke"))).toHaveLength(1);
  expect(fetched.filter((f) => f.method === "DELETE").map((f) => f.url)).toEqual(["https://api.github.com/app/installations/111"]);

  // An hour on, the deletion's own row goes too.
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.query("accountDeletions").collect())).toEqual([]);
});

test("the demo refuses it, and a self-hosted copy's owner can't while others can sign in", async () => {
  const t = convexTest(schema, modules);
  const demo = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { name: "Renata" });
    const w = await ctx.db.insert("workspaces", { name: "Renata", demo: true });
    await ctx.db.insert("memberships", { workspaceId: w, userId: u });
    return u;
  });
  const refusal = await t
    .withIdentity({ subject: `${demo}|s` })
    .mutation(api.accountDelete.start, { confirm: "Renata" })
    .catch((e: unknown) => e);
  expect(isDemoRefusal(refusal)).toBe(true);

  process.env.CAREERBOT_MODE = "self-hosted";
  const copy = convexTest(schema, modules);
  const { owner, alex } = await copy.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { username: "sam", owner: true });
    await ensureWorkspace(ctx, owner);
    const alex = await ctx.db.insert("users", { username: "alex" });
    await ensureWorkspace(ctx, alex);
    return { owner, alex };
  });
  const asOwner = copy.withIdentity({ subject: `${owner}|s` });
  expect((await asOwner.query(api.accountDelete.status, {}))?.blocked).toMatch("remove the other people");
  await expect(asOwner.mutation(api.accountDelete.start, { confirm: "sam" })).rejects.toThrow("remove the other people");
  // Anyone else on the copy can delete their own.
  await copy.withIdentity({ subject: `${alex}|s` }).mutation(api.accountDelete.start, { confirm: "alex" });
  await copy.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await copy.run((ctx) => ctx.db.get(alex))).toBeNull();
  expect((await asOwner.query(api.accountDelete.status, {}))?.blocked).toBeNull();
});

test("every workspace table is deleted, and every table naming a person is deleted or kept on purpose", () => {
  // A workspace table neither carried nor left out by a copy fails here first (and stops an export).
  expect(() => classify(Object.keys(WORKSPACE_TABLES))).not.toThrow();
  expect([...ORDER].sort()).toEqual(Object.keys(WORKSPACE_TABLES).sort());
  const namesUser = (v: GenericValidator): boolean =>
    v.kind === "object" ? Object.values(v.fields).some((f) => f.kind === "id" && f.tableName === "users") : v.kind === "union" && v.members.some(namesUser);
  const personTables = Object.entries(schema.tables)
    .filter(([name, table]) => !name.startsWith("auth") && name !== "users" && !(name in WORKSPACE_TABLES) && namesUser(table.validator))
    .map(([name]) => name);
  expect(personTables.sort()).toEqual(Object.keys(PERSON_TABLES).sort());
});
