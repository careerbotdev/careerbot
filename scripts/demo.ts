// The demo (`pnpm demo <step>`): the read-only demo workspace, built from a frozen test-persona run and kept in the repo
// as a snapshot (testdata/demo/renata-alvarez.json), so the demo never needs the test deployment again.
//
//   pnpm demo prepare --from <workspaceId> --allow-deployment <name>
//     Copies the persona run's workspace into a new, ordinary workspace with its own user on the same deployment (the
//     run itself stays untouched), then carries the search on through the app's own functions as that user, the way a
//     person would: an Outreach pursuit at a Target company beside the Apply one, people added by hand to both, an
//     outreach message written by the real AI step and marked sent, the Apply pursuit marked Applied, a follow-up
//     written, and their own monthly AI budget set (budgetUsd). What it did goes to testdata/demo/<persona>.prepare.json.
//     The OpenRouter key comes from OPENROUTER_API_KEY, is never printed, and is removed again at the end; new AI
//     spending is capped (aiCapUsd).
//   pnpm demo export --workspace <id> --allow-deployment <name> [--out testdata/demo/renata-alvarez.json]
//     Writes that workspace's rows as the snapshot, by the same rules as the app's own export (convex/workspaceCopy.ts):
//     every table with a workspaceId is either carried or left out on purpose, and a table that's neither stops the
//     export, so a new table is never missed. Left out: keys, GitHub and Drive connections, memberships (made again),
//     and jobs not finished, so nothing in the demo can run. OpenRouter's ids for each call are left out too.
//   pnpm demo seed --allow-deployment <name> [--snapshot file] [--check]
//     Replaces the deployment's demo workspace whole with the snapshot: the old one, its user and that user's sign-ins
//     are deleted; a new workspace marked demo, its one user (the shared one visitors are signed in as) and membership
//     are made, and every row is inserted with a new id (workspaceCopy.copyRows, as the app's import does), every
//     reference to an old id (in id fields, lists of fact ids, job arguments, or inside text like "resume:<id>")
//     pointing at the new one. --check only compares the counts per table between the snapshot and the demo workspace
//     there.
//
// Safety: every step needs --allow-deployment <name> and CONVEX_DEPLOY_KEY set to that deployment's own key; the
// deployments in REFUSED (the owner's and the hosted ones) are refused whatever the flags say. The script calls the
// deployment over HTTP with that key (internal functions in convex/demoSeed.ts, and public ones as the persona's user).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference, type FunctionType } from "convex/server";
import { carried, CARRIED, classify, copyRows, type Known, namedIds, type Row, type Schema } from "../convex/workspaceCopy";
import { REFUSED } from "./personas";

const SNAPSHOT = "testdata/demo/renata-alvarez.json";
const EXTRA = "testdata/demo/renata-alvarez.extra.json";
const PREPARED = "testdata/demo/renata-alvarez.prepare.json";
const POLL_MS = 3000;
const WAIT_MS = 5 * 60_000;

// ---- What the snapshot carries ----

// Fields that name the operator's own accounts elsewhere: OpenRouter's ids for each call.
const STRIPPED: Record<string, string[]> = { usage: ["generationId", "lookup"] };

// began: when the search began (the row's own began, else when the row was made), so the copy's Reports count from it.
type WorkspaceRow = { _id: string; name: string; began: number; setupHidden?: boolean; setupSkipped?: ("drive" | "people")[]; toursOffered?: string[] };
export type Snapshot = {
  about: Record<string, unknown>;
  workspace: WorkspaceRow;
  // Ids its rows name that it doesn't carry (a job still running when it was taken, a user), with their tables.
  outside: Record<string, string>;
  tables: Record<string, Row[]>;
};

// Stable JSON: keys sorted at every level.
function sorted(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sorted);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, y]) => [k, sorted(y)]));
  return x;
}

// ---- The deployment ----

function fail(message: string): never {
  console.error(`demo: ${message}`);
  process.exit(1);
}

type Target = { name: string; url: string; key: string };

// The deployment named with --allow-deployment, reached with its own key; never one in REFUSED.
function target(allow: string | undefined): Target {
  if (!allow) fail("name the deployment with --allow-deployment <name>.");
  if (REFUSED.some((r) => allow.includes(r))) fail(`refusing ${allow}: it's never seeded.`);
  const key = process.env.CONVEX_DEPLOY_KEY?.trim();
  if (!key) fail(`CONVEX_DEPLOY_KEY isn't set. Set it to ${allow}'s own deploy key.`);
  const name = key.split("|")[0].split(":")[1];
  if (name !== allow) fail("CONVEX_DEPLOY_KEY isn't the key of the deployment named with --allow-deployment.");
  return { name, url: `https://${name}.convex.cloud`, key };
}

// Convex's HTTP client takes the deployment's key as admin auth, optionally acting as a user; the method isn't in its
// published types.
type AdminAuth = { setAdminAuth(token: string, actingAs?: { subject: string; issuer: string }): void };

class Deployment {
  admin: ConvexHttpClient;
  constructor(readonly t: Target) {
    this.admin = this.client();
  }
  client(actingAs?: { subject: string; issuer: string }) {
    const c = new ConvexHttpClient(this.t.url);
    const auth: AdminAuth = c as unknown as AdminAuth;
    auth.setAdminAuth(this.t.key, actingAs);
    return c;
  }
  // A client acting as a user, the way Convex Auth's tokens name one (subject "<userId>|<sessionId>").
  as(userId: string) {
    return this.client({ subject: `${userId}|demo-script`, issuer: "careerbot-demo" });
  }
  // The deployment's own schema: what its rows are checked against.
  #schema?: Promise<Schema>;
  schema() {
    this.#schema ??= q(this.admin, "demoSeed:shape") as Promise<Schema>;
    return this.#schema;
  }
}

const ref = <T extends FunctionType>(type: T, name: string) => makeFunctionReference<T>(name);
const q = (c: ConvexHttpClient, name: string, args: Record<string, unknown> = {}) => c.query(ref("query", name), args);
const m = (c: ConvexHttpClient, name: string, args: Record<string, unknown> = {}) => c.mutation(ref("mutation", name), args);
const act = (c: ConvexHttpClient, name: string, args: Record<string, unknown> = {}) => c.action(ref("action", name), args);

async function rowsOf(d: Deployment, table: string, workspaceId: string): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    const p = (await q(d.admin, "demoSeed:read", { table, workspaceId, cursor })) as { rows: Row[]; cursor: string; done: boolean };
    rows.push(...p.rows);
    if (p.done) return rows;
    cursor = p.cursor;
  }
}

// ---- Export ----

async function takeSnapshot(d: Deployment, workspaceId: string, about: Record<string, unknown>): Promise<Snapshot> {
  const copied = classify((await d.schema()).workspaceTables);
  const ws = (await q(d.admin, "demoSeed:workspace", { workspaceId })) as (Omit<WorkspaceRow, "began"> & { began?: number; _creationTime: number; demo?: boolean }) | null;
  if (!ws) fail(`no workspace ${workspaceId} on ${d.t.name}.`);
  const tables: Record<string, Row[]> = {};
  for (const table of [...copied].sort()) {
    let rows = carried(table, await rowsOf(d, table, workspaceId));
    const strip = STRIPPED[table] ?? [];
    if (strip.length) rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !strip.includes(k))) as Row);
    if (rows.length) tables[table] = rows;
  }
  const named = namedIds(workspaceId, tables);
  const outside: Record<string, string> = {};
  for (let i = 0; i < named.length; i += 500) {
    const found = (await q(d.admin, "demoSeed:tablesOf", { ids: named.slice(i, i + 500) })) as Record<string, string | null>;
    for (const [id, table] of Object.entries(found)) if (table) outside[id] = table;
  }
  const { _id, name, setupHidden, setupSkipped, toursOffered } = ws;
  const began = ws.began ?? ws._creationTime;
  return {
    about: { ...about, deployment: d.t.name, workspaceId, exportedAt: new Date().toISOString(), counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])) },
    workspace: { _id, name, began, ...(setupHidden !== undefined ? { setupHidden } : {}), ...(setupSkipped ? { setupSkipped } : {}), ...(toursOffered ? { toursOffered } : {}) },
    outside,
    tables,
  };
}

// ---- Import ----

// Puts a snapshot into a new workspace (with its user and membership) and returns their ids, the order the tables went
// in and what had to be left out.
async function importSnapshot(d: Deployment, snap: Snapshot, workspace: { name: string; userName: string; demo: boolean; asOf?: number; setupHidden?: boolean; toursOffered?: string[] }) {
  const schema = await d.schema();
  classify(schema.workspaceTables);
  const { workspaceId, userId } = (await m(d.admin, "demoSeed:create", {
    ...workspace,
    began: snap.workspace.began,
    ...(snap.workspace.setupSkipped ? { setupSkipped: snap.workspace.setupSkipped } : {}),
  })) as { workspaceId: string; userId: string };
  const known: Known = { map: new Map([[snap.workspace._id, workspaceId]]), pending: new Set(), outside: new Set() };
  const r = await copyRows({ workspaceId: snap.workspace._id, outside: Object.keys(snap.outside), tables: snap.tables }, schema, known, {
    insert: async (table, rows) => (await m(d.admin, "demoSeed:insert", { workspaceId, table, docs: rows.map((row) => row.doc) })) as string[],
    patch: async (table, patches) => void (await m(d.admin, "demoSeed:patch", { workspaceId, table, patches })),
  });
  return { workspaceId, userId, ...r };
}

// Rows per table: the snapshot's against the workspace's on the deployment.
async function compare(d: Deployment, snap: Snapshot, workspaceId: string) {
  const rows: { table: string; snapshot: number; deployed: number }[] = [];
  for (const table of CARRIED) rows.push({ table, snapshot: snap.tables[table]?.length ?? 0, deployed: (await rowsOf(d, table, workspaceId)).length });
  for (const r of rows) if (r.snapshot || r.deployed) console.log(`  ${r.table.padEnd(18)} ${String(r.snapshot).padStart(4)}  ${String(r.deployed).padStart(4)}${r.snapshot === r.deployed ? "" : "  differs"}`);
  return rows.every((r) => r.snapshot === r.deployed);
}

// ---- The steps ----

type Flags = Record<string, string | true>;
function flags(argv: string[]): { step: string; f: Flags } {
  const f: Flags = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) fail(`unexpected ${a}`);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      f[a.slice(2)] = next;
      i++;
    } else f[a.slice(2)] = true;
  }
  return { step: argv[0] ?? "", f };
}
const str = (f: Flags, name: string) => (typeof f[name] === "string" ? f[name] : undefined);

async function seed(d: Deployment, f: Flags) {
  const file = str(f, "snapshot") ?? SNAPSHOT;
  if (!existsSync(file)) fail(`no snapshot at ${file}`);
  const snap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const existing = (await q(d.admin, "demoSeed:demoWorkspaces")) as string[];
  if (f.check) {
    if (existing.length !== 1) fail(`${d.t.name} has ${existing.length} demo workspaces; expected one.`);
    console.log(`demo: ${file} against the demo workspace ${existing[0]} on ${d.t.name} (snapshot, deployed):`);
    if (!(await compare(d, snap, existing[0]))) fail("the counts differ.");
    return console.log("demo: the counts match.");
  }
  for (const ws of existing) {
    const users = await m(d.admin, "demoSeed:unlink", { workspaceId: ws });
    let deleted = 0;
    for (const table of (await d.schema()).workspaceTables) {
      let cursor: string | null = null;
      for (;;) {
        const r = (await m(d.admin, "demoSeed:clear", { table, workspaceId: ws, cursor })) as { deleted: number; cursor: string; done: boolean };
        deleted += r.deleted;
        if (r.done) break;
        cursor = r.cursor;
      }
    }
    await m(d.admin, "demoSeed:drop", { workspaceId: ws });
    console.log(`demo: deleted the old demo workspace ${ws} (${deleted} rows, ${users} user)`);
  }
  const name = String(snap.about.name ?? snap.workspace.name);
  // The demo is held at the moment of its snapshot (workspaces.clockOf): what's new, due or this month's is counted from
  // then, so it reads the same whatever day it's opened.
  const asOf = Date.parse(String(snap.about.exportedAt));
  if (Number.isNaN(asOf)) fail(`${file} doesn't say when it was exported (about.exportedAt).`);
  // Getting started stays put away (no OpenRouter key comes with the demo, so it would only ask for one); no tour has
  // been offered yet.
  const r = await importSnapshot(d, snap, { name, userName: name, demo: true, asOf, setupHidden: true });
  console.log(
    `demo: seeded the demo workspace ${r.workspaceId} (user ${r.userId}) on ${d.t.name}; ${r.patched} rows patched, ${r.marks} direction resumes' marks brought along, ${r.dropped.length} references to rows not carried left out`,
  );
  console.log("demo: rows per table (snapshot, deployed):");
  if (!(await compare(d, snap, r.workspaceId))) fail("the counts differ.");
  const current = await q(d.as(r.userId), "workspaces:current");
  console.log(`demo: as the demo user, workspaces:current is ${JSON.stringify(current)}`);
}

async function exportStep(d: Deployment, f: Flags) {
  const workspaceId = str(f, "workspace") ?? fail("name the workspace with --workspace <id>.");
  const out = str(f, "out") ?? SNAPSHOT;
  const extra = JSON.parse(readFileSync(EXTRA, "utf8")) as Extra;
  const prepared = existsSync(PREPARED) ? (JSON.parse(readFileSync(PREPARED, "utf8")) as { workingCopy?: { workspaceId?: string } }) : null;
  const snap = await takeSnapshot(d, workspaceId, {
    name: extra.name,
    persona: extra.persona,
    personaRun: extra.personaRun,
    ...(prepared?.workingCopy?.workspaceId === workspaceId ? { prepared } : {}),
  });
  mkdirSync(dirname(out), { recursive: true });
  const text = `${JSON.stringify(sorted(snap), null, 2)}\n`;
  writeFileSync(out, text);
  const counts = Object.entries(snap.tables).map(([t, r]) => `${t} ${r.length}`).join(", ");
  console.log(`demo: wrote ${out} (${(text.length / 1024).toFixed(0)} KB): ${counts}; ${Object.keys(snap.outside).length} ids named but not carried`);
}

type Contact = { name: string; title: string; email: string; group: "hiringManager" | "team" | "recruiting" };
type Extra = {
  persona: string;
  personaRun: { run: string; deployment: string; workspaceId: string };
  name: string;
  writer: string;
  aiCapUsd: number;
  // The demo person's own monthly AI budget, set once the search is carried on: the persona run's is the test harness's
  // cap ($3), which the run's first days of spending would read as on pace to go over.
  budgetUsd: number;
  apply: { company: string; contacts: Contact[]; note: string; followUpTo: string };
  outreach: { company: string; direction: string; contacts: Contact[]; draftFor: string; nextStep: string };
};

async function prepare(d: Deployment, f: Flags) {
  const from = str(f, "from") ?? fail("name the persona run's workspace with --from <id>.");
  const openrouter = process.env.OPENROUTER_API_KEY?.trim() || fail("OPENROUTER_API_KEY isn't set; the outreach message is written by the real AI step.");
  const extra = JSON.parse(readFileSync(EXTRA, "utf8")) as Extra;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const steps: { step: string; note: string }[] = [];
  const done = (step: string, note = "") => (steps.push({ step, note }), console.log(`  ${step}${note ? `: ${note}` : ""}`));

  const snap = await takeSnapshot(d, from, {});
  const copy = await importSnapshot(d, snap, {
    name: `${extra.name} (demo working copy) ${stamp}`,
    userName: extra.name,
    demo: false,
    ...(snap.workspace.setupHidden !== undefined ? { setupHidden: snap.workspace.setupHidden } : {}),
    ...(snap.workspace.toursOffered ? { toursOffered: snap.workspace.toursOffered } : {}),
  });
  done("Copied the persona run", `${from} into ${copy.workspaceId} (user ${copy.userId})`);
  const me = d.as(copy.userId);
  const ws = copy.workspaceId;
  const rows = (table: string) => rowsOf(d, table, ws);
  const waitFor = async (jobId: unknown, label: string) => {
    if (!jobId) throw new Error(`${label} didn't start`);
    for (const until = Date.now() + WAIT_MS; Date.now() < until; await sleep(POLL_MS)) {
      const j = (await rows("jobs")).find((x) => x._id === jobId);
      if (j?.status === "done") return;
      if (j?.status === "failed" || j?.status === "paused") throw new Error(`${label} ${String(j.status)}: ${String(j.error ?? j.pausedFor ?? "")}`);
    }
    throw new Error(`${label} still running after ${WAIT_MS / 60_000} minutes`);
  };

  const spent = async () => ((await q(me, "budgets:status")) as { aiSpentUsd: number }).aiSpentUsd;
  const budget = (snap.tables.budgets?.[0] ?? {}) as { apolloMonthlyCredits?: number; apolloMode?: string };
  const before = await spent();
  // The month's budget is what's spent already plus the cap, so new spending stops at the cap.
  await m(me, "budgets:set", { aiMonthlyUsd: Math.round((before + extra.aiCapUsd) * 100) / 100, apolloMonthlyCredits: 0, apolloMode: "paused" });
  try {
    const saved = (await act(me, "openrouterKey:save", { key: openrouter })) as { ok: boolean };
    if (!saved.ok) throw new Error("OpenRouter didn't accept the key");
  } catch {
    // The call carried the key, so nothing it was given is echoed.
    throw new Error("openrouterKey:save failed.");
  }
  for (const task of ["outreach", "followUp"]) await m(me, "aiSettings:set", { task, model: extra.writer });
  done("AI", `key set, outreach and follow-ups on ${extra.writer}, new spending capped at $${extra.aiCapUsd} (spent before: $${before.toFixed(4)})`);

  try {
    const companies = await rows("companies");
    const companyId = (name: string) => companies.find((c) => c.name === name)?._id ?? fail(`no company ${name}`);
    const pursuits = await rows("pursuits");
    const apply = pursuits.find((p) => p.postingId && p.companyId === companyId(extra.apply.company)) ?? fail(`no pursuit at ${extra.apply.company}`);
    await m(me, "pursuits:setPath", { id: apply._id, path: "apply" });
    done("Apply pursuit", `${String(apply.title)} at ${extra.apply.company}, path Apply`);

    const named = (data: unknown) => !!data && typeof data === "object" && "name" in data && data.name === extra.outreach.direction;
    const direction = (await rows("items")).find((i) => i.kind === "direction" && i.status === "approved" && named(i.data));
    if (!direction) throw new Error(`no approved direction ${extra.outreach.direction}`);
    const outreachId = (await m(me, "pursuits:startAtCompany", { companyId: companyId(extra.outreach.company), directionId: direction._id })) as string;
    done("Outreach pursuit", `${extra.outreach.direction} at ${extra.outreach.company} (${outreachId})`);

    const added: Record<string, string> = {};
    for (const [pursuitId, list] of [[apply._id, extra.apply.contacts], [outreachId, extra.outreach.contacts]] as const)
      for (const c of list) added[c.name] = (await m(me, "people:add", { pursuitId, ...c })) as string;
    done("People added by hand", Object.keys(added).join(", "));

    await m(me, "pursuits:setStatus", { id: apply._id, status: "applied" });
    done("Apply pursuit marked Applied", "the resume and cover letter kept as sent");

    await waitFor(await m(me, "people:draft", { contactId: added[extra.outreach.draftFor] }), "outreach message");
    await m(me, "people:markSent", { contactId: added[extra.outreach.draftFor] });
    done("Outreach message", `written for ${extra.outreach.draftFor} and marked sent`);

    await waitFor(await m(me, "followUpEmails:write", { pursuitId: apply._id, contactId: added[extra.apply.followUpTo] }), "follow-up");
    done("Follow-up", `drafted to ${extra.apply.followUpTo}`);

    await m(me, "notes:add", { subject: { kind: "pursuit", id: apply._id }, text: extra.apply.note });
    await m(me, "pursuits:setNextStep", { id: outreachId, text: extra.outreach.nextStep });
    done("Note and next step");
  } finally {
    const after = await spent();
    await m(me, "openrouterKey:remove");
    await m(me, "budgets:set", { aiMonthlyUsd: extra.budgetUsd, apolloMonthlyCredits: budget.apolloMonthlyCredits ?? 0, apolloMode: budget.apolloMode ?? "paused" });
    done("AI key removed, budget set", `$${extra.budgetUsd} a month; new AI spending $${(after - before).toFixed(4)}`);
    const record = {
      preparedAt: new Date().toISOString(),
      deployment: d.t.name,
      from,
      workingCopy: { workspaceId: ws, userId: copy.userId },
      aiSpentUsd: { before, after, added: after - before },
      steps,
    };
    writeFileSync(PREPARED, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`demo: working copy ${ws} on ${d.t.name}; record at ${PREPARED}`);
  }
}

async function main() {
  const { step, f } = flags(process.argv.slice(2));
  const run = { prepare, export: exportStep, seed }[step];
  if (!run)
    fail(
      "usage: pnpm demo prepare --from <workspaceId> --allow-deployment <name> | export --workspace <id> --allow-deployment <name> [--out file] | seed --allow-deployment <name> [--snapshot file] [--check]",
    );
  await run(new Deployment(target(str(f, "allow-deployment"))), f);
}

// Run when executed (`pnpm demo`), not when imported to check the remapping.
if (process.argv[1]?.endsWith("demo.ts")) main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
