import { readFileSync } from "node:fs";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { clearedTables, KEPT } from "./accountReset";
import { isDemoRefusal } from "./demoRefusal";
import schema from "./schema";
import { seal } from "./secretBox";
import { copyRows, type Known, type Row, thisSchema, WORKSPACE_TABLES } from "./workspaceCopy";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
// Renata Alvarez's frozen persona run: every kind of row a real search makes.
const SNAPSHOT = JSON.parse(readFileSync("testdata/demo/renata-alvarez.json", "utf8")) as { workspace: { _id: string }; outside: Record<string, string>; tables: Record<string, Row[]> };

beforeEach(() => {
  vi.useFakeTimers();
  process.env.MASTER_KEY_V1 = "99".repeat(32);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.MASTER_KEY_V1;
});

type T = TestConvex<typeof schema>;

// A person with a whole search in their workspace (the persona's rows, seed companies included), an export with its
// file, a key, Drive and GitHub connections, and Getting started put away with Drive skipped.
async function person(t: T, email: string) {
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
    await ctx.db.insert("githubInstalls", { workspaceId: w, installationId: 1, account: email, selection: "all", settingsUrl: "https://github.com/settings/installations/1", at: 0 });
    const discovery = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", w)).unique();
    if (discovery) await ctx.db.patch(discovery._id, { seeds: ["acme.com"], resolved: [{ domain: "acme.com", apolloId: "1" }] });
    else await ctx.db.insert("discovery", { workspaceId: w, seeds: ["acme.com"], resolved: [{ domain: "acme.com", apolloId: "1" }] });
    await ctx.db.patch(w, { setupHidden: true, setupSkipped: ["drive"] });
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

async function runToEnd(t: T) {
  for (let i = 0; i < 500 && (await t.run(async (ctx) => (await ctx.db.query("accountResets").first())?.step)) !== "done"; i++) {
    vi.advanceTimersByTime(1_000);
    await t.finishInProgressScheduledFunctions();
  }
}

test("every table a reset keeps is a workspace table", () => {
  for (const table of Object.keys(KEPT)) expect(WORKSPACE_TABLES).toHaveProperty(table);
  expect(clearedTables(false)[0]).toBe("jobs");
  expect(clearedTables(false)).not.toContain("apiKeys");
  expect(clearedTables(true)).toContain("apiKeys");
});

test("resetting clears the workspace's work, seed companies and exports, keeps sign-in, settings, spending and connections, and leaves others alone", async () => {
  const t = convexTest(schema, modules);
  const a = await person(t, "ana@example.com");
  const b = await person(t, "ben@example.com");
  const before = await countsOf(t, a.w);
  const bBefore = await countsOf(t, b.w);
  const counts = await a.as.query(api.accountReset.counts, {});
  expect(counts.groups.stories).toBeGreaterThan(0);
  expect(counts.groups.seeds).toBeGreaterThan(0);
  expect(counts.groups.exports).toBe(1);

  await expect(a.as.mutation(api.accountReset.start, { confirm: "ben@example.com", keys: false })).rejects.toThrow("Type ana@example.com to confirm");
  await a.as.mutation(api.accountReset.start, { confirm: " Ana@Example.com ", keys: false });
  // Asking again while it runs starts nothing new.
  await a.as.mutation(api.accountReset.start, { confirm: "ana@example.com", keys: false });
  expect(await t.run((ctx) => ctx.db.query("accountResets").collect())).toHaveLength(1);
  await runToEnd(t);

  const after = await countsOf(t, a.w);
  const status = await a.as.query(api.accountReset.status, {});
  expect(status?.reset?.step).toBe("done");
  for (const table of clearedTables(false)) expect([table, after[table]]).toEqual([table, 0]);
  for (const table of Object.keys(KEPT)) expect([table, after[table]]).toEqual([table, before[table]]);
  expect(status?.reset?.cleared).toBe(clearedTables(false).reduce((n, table) => n + before[table], 0));
  expect(await countsOf(t, b.w)).toEqual(bBefore);
  await t.run(async (ctx) => {
    expect(await ctx.db.get(a.u)).not.toBeNull();
    expect(await ctx.storage.get(a.file)).toBeNull();
    expect(await ctx.storage.get(b.file)).not.toBeNull();
    const discovery = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", a.w)).unique();
    expect(discovery?.seeds).toEqual([]);
    expect(discovery?.resolved).toEqual([]);
    const theirs = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", b.w)).unique();
    expect(theirs?.seeds).toEqual(["acme.com"]);
    expect((await ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", a.w)).unique())?.roles ?? []).toEqual([]);
  });
  // Getting started starts from the beginning: shown, nothing skipped, no story yet.
  const setup = await a.as.query(api.today.setup, {});
  expect(setup.hidden).toBe(false);
  expect(setup.skipped).toEqual([]);
  expect(setup.steps.story.done).toBe(false);
  expect(setup.firstStory).toBeNull();
  // Import works again in the emptied workspace.
  expect((await a.as.query(api.yourData.status, {})).empty).toBe(true);

  // Again, with the keys: they go too.
  await a.as.mutation(api.accountReset.start, { confirm: "ana@example.com", keys: true });
  await runToEnd(t);
  expect((await countsOf(t, a.w)).apiKeys).toBe(0);
  expect((await countsOf(t, b.w)).apiKeys).toBe(1);
}, 120_000);

test("the demo refuses it", async () => {
  const t = convexTest(schema, modules);
  const demo = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { name: "Renata" });
    const w = await ctx.db.insert("workspaces", { name: "Renata", demo: true });
    await ctx.db.insert("memberships", { workspaceId: w, userId: u });
    return u;
  });
  const refusal = await t
    .withIdentity({ subject: `${demo}|s` })
    .mutation(api.accountReset.start, { confirm: "Renata", keys: false })
    .catch((e: unknown) => e);
  expect(isDemoRefusal(refusal)).toBe(true);
});
