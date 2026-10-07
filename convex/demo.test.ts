import { convexTest, type TestConvex } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { ConvexError, jsonToConvex, type JSONValue, type Value, type ValidatorJSON } from "convex/values";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEMO_BUSY, type DemoSignInRefusal, isDemoRefusal, NO_DEMO } from "./demoRefusal";
import { SIGN_INS_PER_MINUTE } from "./demo";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
// The same modules' source, to count the public mutations and actions a second way (see publicWrites).
const sources = import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// Calling every public mutation and action twice takes a while.
vi.setConfig({ testTimeout: 120_000 });

type T = TestConvex<typeof schema>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session` });

// ---- Every public mutation and action ----

type Write = { path: string; kind: "mutation" | "action"; args: ValidatorJSON };

// Convex Auth's own: signIn and signOut act on the caller's session, not on a workspace (signing in or out of the demo
// must keep working), and store is internal. They're the only public actions not defined through functions.ts.
const AUTH_OWN = new Set(["auth:signIn", "auth:signOut"]);

// Every public mutation and action the deployment registers, found from the modules themselves.
async function publicWrites(): Promise<Write[]> {
  const found: Write[] = [];
  for (const [file, load] of Object.entries(modules)) {
    if (file.startsWith("./_generated/") || file.endsWith(".test.ts")) continue;
    const exported = (await load()) as Record<string, unknown>;
    for (const [name, fn] of Object.entries(exported)) {
      if (typeof fn !== "function" || !("isPublic" in fn) || !fn.isPublic || !("exportArgs" in fn) || typeof fn.exportArgs !== "function") continue;
      const kind = "isMutation" in fn && fn.isMutation ? "mutation" : "isAction" in fn && fn.isAction ? "action" : null;
      const path = `${file.slice(2, -3)}:${name}`;
      if (!kind || AUTH_OWN.has(path)) continue;
      found.push({ path, kind, args: JSON.parse(fn.exportArgs() as string) as ValidatorJSON });
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

// The same count read from the source (`export const x = mutation(` or `action(`), so a module the glob misses, or a
// registered function the check above doesn't recognize, fails the test instead of passing with fewer calls.
function writesInSource() {
  let n = 0;
  for (const [file, text] of Object.entries(sources)) if (!file.endsWith(".test.ts")) n += text.match(/^export const \w+ = (mutation|action)\(/gm)?.length ?? 0;
  return n;
}

// A value that passes a validator: required fields only, the first choice of a union, empty lists and records, and
// for an id, a real row of that table in the caller's workspace (idOf).
async function valueFor(json: ValidatorJSON, idOf: (table: string) => Promise<string>): Promise<Value> {
  switch (json.type) {
    case "null":
      return null;
    case "number":
      return 1;
    case "bigint":
      return BigInt(1);
    case "boolean":
      return false;
    case "string":
      return "demo";
    case "bytes":
      return new ArrayBuffer(1);
    case "any":
      return "demo";
    case "literal":
      return jsonToConvex(json.value as JSONValue);
    case "id":
      return idOf(json.tableName);
    case "array":
      return [];
    case "record":
      return {};
    case "union":
      return valueFor(json.value[0], idOf);
    case "object": {
      const out: Record<string, Value> = {};
      for (const [field, { fieldType, optional }] of Object.entries(json.value)) if (!optional) out[field] = await valueFor(fieldType, idOf);
      return out;
    }
    default:
      throw new Error(`No value for validator ${json.type}`);
  }
}

type TableName = keyof typeof schema.tables;

// Convex leaves a validator's JSON form off its public type; every validator has it at run time.
function jsonOf(validator: object): ValidatorJSON {
  if (!("json" in validator)) throw new Error("A validator without its JSON form");
  return validator.json as ValidatorJSON;
}

// A person with a workspace (demo or not), and arguments for every write made of rows in that workspace: each table an
// argument names gets one row, made from the schema's own validator (its ids pointing at rows made the same way).
async function personWithArgs(t: T, writes: Write[], demo: boolean) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: demo ? "Renata Alvarez" : "Ada" });
    const workspaceId = await ctx.db.insert("workspaces", { name: demo ? "Renata Alvarez" : "Ada", ...(demo ? { demo: true } : {}) });
    const membershipId = await ctx.db.insert("memberships", { workspaceId, userId });
    const made = new Map<string, string>([
      ["users", userId],
      ["workspaces", workspaceId],
      ["memberships", membershipId],
    ]);
    const making = new Set<string>();
    const idOf = async (table: string): Promise<string> => {
      const known = made.get(table);
      if (known) return known;
      if (making.has(table)) throw new Error(`Rows of ${table} refer to each other`);
      making.add(table);
      let id: string;
      if (table === "_storage") id = await ctx.storage.store(new Blob(["demo"]));
      else {
        const doc = (await valueFor(jsonOf(schema.tables[table as TableName].validator), idOf)) as Record<string, Value>;
        id = await ctx.db.insert(table as TableName, doc as never);
      }
      made.set(table, id);
      return id;
    };
    const args: Record<string, Record<string, Value>> = {};
    for (const w of writes) args[w.path] = (await valueFor(w.args, idOf)) as Record<string, Value>;
    return { userId, workspaceId, args };
  });
}

// What a call did: "ran", "demo" (the demo refusal), or the error it gave.
async function outcome(t: T, userId: Id<"users">, w: Write, args: Record<string, Value>) {
  const caller = as(t, userId);
  try {
    if (w.kind === "mutation") await caller.mutation(makeFunctionReference<"mutation">(w.path), args);
    else await caller.action(makeFunctionReference<"action">(w.path), args);
    return "ran";
  } catch (e) {
    return isDemoRefusal(e) ? "demo" : e instanceof Error ? e.message : String(e);
  }
}

// Every row of every table, to compare before and after.
const everything = (t: T) =>
  t.run(async (ctx) => {
    const out: Record<string, unknown[]> = {};
    for (const table of Object.keys(schema.tables)) out[table] = await ctx.db.query(table as TableName).collect();
    out._scheduled_functions = await ctx.db.system.query("_scheduled_functions").collect();
    out._storage = await ctx.db.system.query("_storage").collect();
    return out;
  });

// Nothing a test runs reaches the internet.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("No network in tests.");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("every public mutation and action is found, from the modules and from the source alike", async () => {
  const writes = await publicWrites();
  // Today there are 184 (plus Convex Auth's own two); a broken glob would find none.
  expect(writes.length).toBeGreaterThanOrEqual(150);
  expect(writes.length).toBe(writesInSource());
});

test("in the demo, every public mutation and action is refused before it runs, and nothing changes", async () => {
  const writes = await publicWrites();
  const t = convexTest(schema, modules);
  const { userId, args } = await personWithArgs(t, writes, true);
  const before = await everything(t);
  const notRefused: string[] = [];
  for (const w of writes) {
    const result = await outcome(t, userId, w, args[w.path]);
    if (result !== "demo") notRefused.push(`${w.path}: ${result}`);
  }
  expect(notRefused).toEqual([]);
  expect(await everything(t)).toEqual(before);
});

test("in an ordinary workspace, the same calls are never refused as the demo", async () => {
  const writes = await publicWrites();
  const t = convexTest(schema, modules);
  // Scheduled work stays queued: these calls only need to show they got past the check.
  vi.useFakeTimers();
  const { userId, args } = await personWithArgs(t, writes, false);
  const refused: string[] = [];
  const invalid: string[] = [];
  let ran = 0;
  for (const w of writes) {
    const result = await outcome(t, userId, w, args[w.path]);
    if (result === "demo") refused.push(w.path);
    if (/Validator error|ArgumentValidationError/i.test(result)) invalid.push(`${w.path}: ${result}`);
    if (result === "ran") ran++;
  }
  expect(refused).toEqual([]);
  // The arguments are valid, so the demo refusal above came from the check, not from the arguments.
  expect(invalid).toEqual([]);
  // Many run through; others refuse for their own reasons (no key, nothing to work on).
  expect(ran).toBeGreaterThan(writes.length / 3);
});

test("in the demo, reading still works and says it's the demo", async () => {
  const t = convexTest(schema, modules);
  const { userId, workspaceId } = await personWithArgs(t, [], true);
  expect(await as(t, userId).query(api.workspaces.current, {})).toEqual({ id: workspaceId, name: "Renata Alvarez", demo: true, asOf: null });
  const other = await personWithArgs(t, [], false);
  expect((await as(t, other.userId).query(api.workspaces.current, {}))?.demo).toBe(false);
});

// ---- The demo's moment ----

test("a workspace held at its snapshot's moment reads the same weeks later; an ordinary one moves on", async () => {
  vi.useFakeTimers();
  const asOf = Date.UTC(2026, 9, 6, 14);
  vi.setSystemTime(asOf);
  const t = convexTest(schema, modules);
  const demo = await personWithArgs(t, [], true);
  const other = await personWithArgs(t, [], false);
  await t.run(async (ctx) => {
    await ctx.db.patch(demo.workspaceId, { asOf });
    for (const { workspaceId } of [demo, other]) {
      await ctx.db.insert("usage", { workspaceId, service: "openrouter", purpose: "skills", costUsd: 0.5, ok: true, state: "settled", at: asOf - 3_600_000 });
      await ctx.db.insert("jobs", { workspaceId, kind: "skills", args: {}, status: "done", origin: "you", startedAt: asOf - 3_600_000 });
    }
  });
  // This month's AI spending (Settings, Activity) and the work done in the last day (Activity).
  const read = async (userId: Id<"users">) => ({
    spent: (await as(t, userId).query(api.budgets.status, {})).aiSpentUsd,
    recent: (await as(t, userId).query(api.activity.list, {})).length,
  });
  expect(await read(demo.userId)).toEqual({ spent: 0.5, recent: 1 });
  expect(await read(other.userId)).toEqual({ spent: 0.5, recent: 1 });
  vi.setSystemTime(asOf + 40 * 86_400_000);
  expect(await read(demo.userId)).toEqual({ spent: 0.5, recent: 1 });
  expect(await read(other.userId)).toEqual({ spent: 0, recent: 0 });
});

// ---- Signing in to the demo ----

let privateKey = "";
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))));
  privateKey = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
});

function withAuthEnv() {
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.CONVEX_SITE_URL = "http://localhost:3211";
  process.env.SIGNUP_ALLOWLIST = "";
}
afterEach(() => {
  for (const key of ["JWT_PRIVATE_KEY", "CONVEX_SITE_URL", "SIGNUP_ALLOWLIST"]) delete process.env[key];
});

const demoSignIn = (t: T) => t.action(api.auth.signIn, { provider: "demo", params: {} });
async function signInOutcome(t: T) {
  try {
    await demoSignIn(t);
    return "signed in";
  } catch (e) {
    if (e instanceof ConvexError) return (e.data as DemoSignInRefusal).message;
    throw e;
  }
}
const sessionsOf = (t: T, userId: Id<"users">) => t.run((ctx) => ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect());

test("the demo sign-in is refused where there's no demo workspace", async () => {
  withAuthEnv();
  const t = convexTest(schema, modules);
  await personWithArgs(t, [], false);
  expect(await signInOutcome(t)).toBe(NO_DEMO);
  expect(await t.run((ctx) => ctx.db.query("authSessions").collect())).toEqual([]);
});

test("the demo sign-in signs a visitor in as the demo's person, past the allowlist, without a new workspace", async () => {
  withAuthEnv();
  const t = convexTest(schema, modules);
  const { userId, workspaceId } = await personWithArgs(t, [], true);
  expect(await signInOutcome(t)).toBe("signed in");
  expect(await sessionsOf(t, userId)).toHaveLength(1);
  const memberships = await t.run((ctx) => ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).collect());
  expect(memberships.map((m) => m.workspaceId)).toEqual([workspaceId]);
  expect(await t.run((ctx) => ctx.db.query("workspaces").collect())).toHaveLength(1);
});

test("past 60 demo sign-ins a minute, the demo is busy until the minute has passed", async () => {
  vi.useFakeTimers();
  withAuthEnv();
  const t = convexTest(schema, modules);
  const { userId } = await personWithArgs(t, [], true);
  await t.run(async (ctx) => {
    for (let i = 0; i < SIGN_INS_PER_MINUTE - 1; i++) await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 1e9 });
  });
  // The 60th of the minute still gets in; the 61st doesn't.
  expect(await signInOutcome(t)).toBe("signed in");
  expect(await signInOutcome(t)).toBe(DEMO_BUSY);
  vi.advanceTimersByTime(61_000);
  expect(await signInOutcome(t)).toBe("signed in");
});

// ---- Old sessions ----

test("old demo sessions are deleted with their refresh tokens; recent ones and other people's stay", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const demo = await personWithArgs(t, [], true);
  const other = await personWithArgs(t, [], false);
  const sessionWithToken = (userId: Id<"users">) =>
    t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 30 * 86_400_000 });
      await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + 30 * 86_400_000 });
      return sessionId;
    });
  const old = await sessionWithToken(demo.userId);
  const othersOld = await sessionWithToken(other.userId);
  vi.advanceTimersByTime(25 * 60 * 60 * 1000);
  const recent = await sessionWithToken(demo.userId);
  await t.mutation(internal.demo.dropOldSessions, {});
  expect((await sessionsOf(t, demo.userId)).map((s) => s._id)).toEqual([recent]);
  expect((await sessionsOf(t, other.userId)).map((s) => s._id)).toEqual([othersOld]);
  const tokens = await t.run((ctx) => ctx.db.query("authRefreshTokens").collect());
  expect(tokens.map((r) => r.sessionId).sort()).toEqual([othersOld, recent].sort());
  expect(tokens.some((r) => r.sessionId === old)).toBe(false);
});

// ---- Crons ----

test("the daily roles pass and spending check skip the demo", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const demo = await personWithArgs(t, [], true);
  const other = await personWithArgs(t, [], false);
  await t.run(async (ctx) => {
    for (const workspaceId of [demo.workspaceId, other.workspaceId])
      await ctx.db.insert("companies", { workspaceId, name: "Example Co", found: [], at: 0, rating: { value: "excited", at: 0 } });
  });
  await t.mutation(internal.roles.startAll, {});
  const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
  expect(jobs.map((j) => j.workspaceId)).toEqual([other.workspaceId]);
  expect(await t.query(internal.metering.workspaces, {})).toEqual([other.workspaceId]);
});
