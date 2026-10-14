import { convexTest, type TestConvex } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import { NOT_OPERATOR } from "./operators";
import { choicesIn, functionsInSource, jsonOf, OPERATOR_ONLY, publicFunctions, valueFor, type PublicFunction } from "./publicFunctions.testing";
import schema from "./schema";
import { seal } from "./secretBox";

// One workspace never reaches another's data. Ada (workspace A) has a row in every table, every string in them "ALPHA";
// Bea (workspace B) has her own, every string "BRAVO". Bea calls every public query, mutation and action with Ada's ids
// wherever an argument takes one, each union's every choice and with and without the optional fields. However a call
// ends, nothing of Ada's may come back, change, be scheduled for, or be sent out; and nothing of Ada's may be written
// into Bea's rows. Signed out, a call reaches nobody's data either.

const modules = import.meta.glob("./**/*.ts");
const sources = import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// Thousands of calls, each in a fresh deployment.
vi.setConfig({ testTimeout: 600_000 });

type T = TestConvex<typeof schema>;
type TableName = keyof typeof schema.tables;
type Doc = Record<string, unknown> & { _id: string };

const ADA = "ALPHA";
const BEA = "BRAVO";

// Tables of the whole copy, not of one workspace, that anyone may read: their rows are made plainly, not as Ada's.
const SHARED: Record<string, true> = { modelPrices: true, updateCheck: true };

// Rows with a union at the top (items: one row per kind) or a key per service (apiKeys) get one row per choice, so an
// argument taking their id is tried with each; other tables get one row, as a workspace usually has.
const EVERY_CHOICE: Record<string, true> = { items: true, apiKeys: true };

// Rows that make a person more or less than a workspace's member: an operator of careerbot.dev (who reaches every
// workspace by design), a suspended account. Neither Ada nor Bea is either; the operator test below makes Olga one.
const ROLES: Record<string, true> = { operators: true, suspensions: true };

type Person = { userId: Id<"users">; workspaceId: Id<"workspaces">; rows: Map<string, string[]> };

// A person with a workspace and a row in every table (their strings `text`), each id in them pointing at their own rows.
async function personWithEverything(t: T, text: string, tables: readonly string[]): Promise<Person> {
  const made = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: text, email: `${text.toLowerCase()}@example.com` });
    const workspaceId = await ctx.db.insert("workspaces", { name: text });
    const membershipId = await ctx.db.insert("memberships", { workspaceId, userId });
    const rows = new Map<string, string[]>([
      ["users", [userId]],
      ["workspaces", [workspaceId]],
      ["memberships", [membershipId]],
    ]);
    const making = new Set<string>();
    const idOf = async (table: string): Promise<string> => {
      const known = rows.get(table);
      if (known) return known[0];
      if (making.has(table)) throw new Error(`Rows of ${table} refer to each other`);
      making.add(table);
      const made: string[] = [];
      if (table === "_storage") made.push(await ctx.storage.store(new Blob([text])));
      else {
        const json = jsonOf(schema.tables[table as TableName].validator);
        const seen = new Set<string>();
        for (let pick = 0; pick < (EVERY_CHOICE[table] ? choicesIn(json) : 1); pick++) {
          const doc = (await valueFor(json, { text: SHARED[table] ? "shared" : text, pick, full: false, idOf })) as Record<string, Value>;
          // A key that opens, so work that needs one gets past that check.
          if (table === "apiKeys") doc.sealed = await seal(`${text}-key`);
          const key = JSON.stringify(doc, plain);
          if (seen.has(key)) continue;
          seen.add(key);
          made.push(await ctx.db.insert(table as TableName, doc as never));
        }
      }
      rows.set(table, made);
      return made[0];
    };
    for (const table of tables) await idOf(table);
    return { userId, workspaceId, rows: Object.fromEntries(rows) };
  });
  return { ...made, rows: new Map(Object.entries(made.rows)) };
}

// JSON that also takes bigints and bytes.
const plain = (_: string, v: unknown) => (typeof v === "bigint" ? `${v}n` : v instanceof ArrayBuffer ? `bytes:${v.byteLength}` : v);
const text = (v: unknown) => JSON.stringify(v, plain) ?? "";

// Every row of every table, the scheduled functions and the stored files.
async function everything(t: T): Promise<Map<string, Map<string, Doc>>> {
  const tables = await t.run(async (ctx) => {
    const out: Record<string, unknown[]> = {};
    for (const table of Object.keys(schema.tables)) out[table] = await ctx.db.query(table as TableName).collect();
    out._scheduled_functions = await ctx.db.system.query("_scheduled_functions").collect();
    out._storage = await ctx.db.system.query("_storage").collect();
    return out;
  });
  return new Map(Object.entries(tables).map(([table, docs]) => [table, new Map((docs as Doc[]).map((d) => [d._id, d]))]));
}

// What in `found` is Ada's: her text, or one of her ids not in `given` (an id the caller passed in may come back).
function adasIn(found: string, ada: Set<string>, given = ""): string[] {
  const hits = found.includes(ADA) ? [ADA] : [];
  for (const id of ada) if (found.includes(id) && !given.includes(id)) hits.push(id);
  return hits;
}

// Everything a call did to Ada: what it returned or threw of hers, her rows it changed or deleted, rows of anyone else's
// it wrote her data into, work it scheduled on her data, and what it sent out of hers.
function harm(before: Map<string, Map<string, Doc>>, after: Map<string, Map<string, Doc>>, ada: Set<string>, given: string, returned: string, sent: string[]) {
  const found: string[] = [];
  const back = adasIn(returned, ada, given);
  if (back.length) found.push(`returned Ada's ${back.join(", ")}`);
  for (const [table, rows] of after) {
    const was = before.get(table)!;
    for (const [id, doc] of was) {
      if (!ada.has(id)) continue;
      if (!rows.has(id)) found.push(`deleted Ada's ${table} row`);
      else if (text(rows.get(id)) !== text(doc)) found.push(`changed Ada's ${table} row`);
    }
    for (const [id, doc] of rows) {
      if (ada.has(id) || text(was.get(id)) === text(doc)) continue;
      const hers = adasIn(text(doc), ada);
      if (hers.length) found.push(`${table === "_scheduled_functions" ? "scheduled work with" : `wrote into ${table}`} Ada's ${hers.join(", ")}`);
    }
  }
  for (const request of sent) if (adasIn(request, ada).length) found.push(`sent out Ada's data: ${request.slice(0, 120)}`);
  return found;
}

// Every outside request a test's calls make: refused, and kept to check.
let sent: string[] = [];
beforeEach(() => {
  sent = [];
  process.env.MASTER_KEY_V1 = "11".repeat(32);
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: { body?: unknown }) => {
      sent.push(`${String(input)} ${typeof init?.body === "string" ? init.body : ""}`);
      throw new Error("No network in tests.");
    }),
  );
});
afterEach(() => {
  delete process.env.MASTER_KEY_V1;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const KINDS = ["query", "mutation", "action"] as const;

async function call(t: T, f: PublicFunction, args: Record<string, Value>) {
  try {
    if (f.kind === "query") return text(await t.query(makeFunctionReference<"query">(f.path), args));
    if (f.kind === "mutation") return text(await t.mutation(makeFunctionReference<"mutation">(f.path), args));
    return text(await t.action(makeFunctionReference<"action">(f.path), args));
  } catch (e) {
    // What a refusal says is shown to the caller, so it mustn't carry Ada's data either.
    return text(e instanceof Error ? { message: e.message, data: "data" in e ? e.data : undefined } : e);
  }
}

// The argument sets to try: each union choice, and each of Ada's rows of a table that has several (picks: the most
// rows a table has), with and without the optional fields, each set once.
async function argSets(f: PublicFunction, picks: number, idOf: (table: string, pick: number) => Promise<string>) {
  const sets = new Map<string, Record<string, Value>>();
  for (const full of [false, true])
    for (let pick = 0; pick < Math.max(choicesIn(f.args), picks); pick++) {
      const args = (await valueFor(f.args, { text: "bravo", pick, full, idOf: (table) => idOf(table, pick) })) as Record<string, Value>;
      sets.set(text(args), args);
    }
  return [...sets.values()];
}

const TABLES = [...Object.keys(schema.tables), "_storage"].filter((table) => !ROLES[table]);

// A deployment with Ada's workspace and Bea's, and the ids of everything of Ada's (all but the shared tables' rows).
async function adaAndBea() {
  const t = convexTest(schema, modules);
  const ada = await personWithEverything(t, ADA, TABLES);
  const bea = await personWithEverything(t, BEA, TABLES.filter((table) => !SHARED[table]));
  const adas = new Set([...ada.rows].filter(([table]) => !SHARED[table]).flatMap(([, ids]) => ids));
  return { t, ada, bea, adas };
}

// Every public function, called by `who` with Ada's ids, each in a fresh deployment: what each call did to Ada.
async function audit(who: "ada" | "bea" | "nobody") {
  const found: string[] = [];
  for (const f of await publicFunctions(modules, KINDS)) {
    const { t, ada, bea, adas } = await adaAndBea();
    const picks = Math.max(...[...ada.rows.values()].map((ids) => ids.length));
    const idOf = async (table: string, pick: number) => {
      const ids = ada.rows.get(table)!;
      return ids[pick % ids.length];
    };
    const caller = who === "nobody" ? t : t.withIdentity({ subject: `${(who === "ada" ? ada : bea).userId}|session` });
    for (const args of await argSets(f, picks, idOf)) {
      const before = await everything(t);
      sent = [];
      const returned = await call(caller as T, f, args);
      const harmed = harm(before, await everything(t), adas, text(args), returned, sent);
      // Signed out, a call gets nothing done outside either: no key tried, no list fetched.
      if (who === "nobody" && sent.length) harmed.push(`sent ${sent.length} outside request(s) for someone signed out`);
      for (const what of harmed) found.push(`${f.path} ${text(args)}: ${what}`);
    }
  }
  return [...new Set(found)];
}

test("every public query, mutation and action is found, from the modules and from the source alike", async () => {
  const all = await publicFunctions(modules, KINDS);
  expect(all.length).toBeGreaterThanOrEqual(250);
  expect(all.length).toBe(functionsInSource(sources, KINDS));
});

test("called by someone else with your ids, no public function returns, changes, schedules or sends anything of yours", async () => {
  expect(await audit("bea")).toEqual([]);
});

test("signed out, no public function returns, changes, schedules or sends anyone's data, or calls out", async () => {
  expect(await audit("nobody")).toEqual([]);
});

// The control: if the made-up data stopped matching what the functions read, every call would refuse for its own reasons
// and the checks above would pass without seeing anything.
test("the same calls by the person whose ids they are do reach their data, so the checks above can see it", async () => {
  const reached = new Set((await audit("ada")).map((found) => found.split(" ")[0]));
  expect(reached.size).toBeGreaterThan((await publicFunctions(modules, KINDS)).length / 3);
});

// The operators' functions reach every workspace by design (workspaceGuard.test.ts lists them): Bea, a member of a
// workspace and nothing more, and someone signed out are refused before anything happens; Olga, an operator, gets in.
test("an operator's functions refuse everyone but an operator", async () => {
  const { t, ada, bea } = await adaAndBea();
  const olga = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Olga", email: "olga@example.com" });
    await ctx.db.insert("memberships", { workspaceId: await ctx.db.insert("workspaces", { name: "Olga" }), userId });
    await ctx.db.insert("operators", { userId, role: "owner" });
    return userId;
  });
  const as = (userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session` }) as T;
  const idOf = async (table: string) => ada.rows.get(table)![0];
  const admin = (await publicFunctions(modules, KINDS)).filter((f) => OPERATOR_ONLY[f.path]);
  expect(admin.map((f) => f.path).sort()).toEqual(Object.keys(OPERATOR_ONLY).sort());
  const snapshot = async () => text([...(await everything(t))].map(([table, rows]) => [table, [...rows.values()]]));
  const refused: string[] = [];
  const allowed: string[] = [];
  for (const f of admin) {
    const [args] = await argSets(f, 1, idOf);
    for (const caller of [as(bea.userId), t]) {
      const before = await snapshot();
      if (!(await call(caller, f, args)).includes(NOT_OPERATOR)) refused.push(`${f.path} let in someone who isn't an operator`);
      if (before !== (await snapshot())) refused.push(`${f.path} changed something for someone who isn't an operator`);
    }
    if ((await call(as(olga), f, args)).includes(NOT_OPERATOR)) allowed.push(f.path);
  }
  expect(refused).toEqual([]);
  expect(allowed).toEqual([]);
});
