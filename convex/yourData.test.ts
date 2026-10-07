// @vitest-environment node
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import JSZip from "jszip";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DATA_FILE, type ExportFile, FORMAT, OTHER_HISTORY } from "./exportFormat";
import { CHUNK_BYTES, EXPORT_TOO_MANY_FILES, MAX_DATA_BYTES, MAX_ENTRIES, MAX_IMPORT_BYTES, newer, NEWER_FORMAT, TOO_LARGE, TOO_MUCH_INSIDE, WRONG_FILE } from "./exportRules";
import { IMPORT_PATH } from "./yourData";
import { directionMark } from "./resumeBasis";
import schema from "./schema";
import { VERSION } from "./version";
import { copyRows, type Known, type Row, thisSchema } from "./workspaceCopy";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
// Renata Alvarez's frozen persona run: every kind of row a real search makes.
const SNAPSHOT = JSON.parse(readFileSync("testdata/demo/renata-alvarez.json", "utf8")) as { workspace: { _id: string }; outside: Record<string, string>; tables: Record<string, Row[]> };

// Only the clock and timeouts (the scheduler's); the ZIP library needs real setImmediate.
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
afterEach(() => vi.useRealTimers());

type T = ReturnType<typeof convexTest>;
async function person(t: T, name: string) {
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { name });
    return { u, w: await ensureWorkspace(ctx, u) };
  });
  return { u, w, as: t.withIdentity({ subject: `${u}|s` }) };
}

// Runs what's been scheduled now (not what's scheduled for later, like an export's deletion an hour on).
async function settle(t: T) {
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
}

async function seed(t: T, workspaceId: Id<"workspaces">) {
  const known: Known = { map: new Map([[SNAPSHOT.workspace._id, workspaceId]]), pending: new Set(), outside: new Set() };
  await copyRows({ workspaceId: SNAPSHOT.workspace._id, outside: Object.keys(SNAPSHOT.outside), tables: SNAPSHOT.tables }, thisSchema(), known, {
    insert: (table, rows) => t.run(async (ctx) => Promise.all(rows.map((r) => ctx.db.insert(table as never, { ...r.doc, workspaceId } as never) as Promise<string>))),
    patch: (_, patches) => t.run(async (ctx) => void (await Promise.all(patches.map((p) => ctx.db.patch(p.id as never, p.set))))),
  });
}

async function exportOf(t: T, as: Awaited<ReturnType<typeof person>>["as"]) {
  await as.mutation(api.yourData.startExport, {});
  await settle(t);
  const status = await as.query(api.yourData.status, {});
  expect(status.export).toMatchObject({ status: "done", error: null });
  expect(status.export!.url).toBeTruthy();
  const buffer = await t.run(async (ctx) => {
    const row = await ctx.db.query("exports").collect();
    const fileId = row.find((r) => r.status === "done" && r.fileId)!.fileId!;
    return await (await ctx.storage.get(fileId))!.arrayBuffer();
  });
  const bytes = new Uint8Array(buffer);
  return { bytes, zip: await JSZip.loadAsync(bytes), status };
}

type As = Awaited<ReturnType<typeof person>>["as"];
// A ZIP sent to the site's upload address in pieces of CHUNK_BYTES, as the screen sends it, signed in as `as`.
async function upload(as: As, bytes: Uint8Array, name = "careerbot-export.zip") {
  const parts = Math.max(1, Math.ceil(bytes.byteLength / CHUNK_BYTES));
  let importId = "";
  let res: Response | null = null;
  for (let part = 0; part < parts; part++) {
    const q = new URLSearchParams({ name, part: String(part), parts: String(parts), ...(importId ? { import: importId } : {}) });
    res = await as.fetch(`${IMPORT_PATH}?${q}`, { method: "POST", body: new Uint8Array(bytes.subarray(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES)) });
    if (res.status !== 200) return res;
    const reply: unknown = await res.clone().json();
    importId = reply && typeof reply === "object" && "importId" in reply ? String(reply.importId) : "";
  }
  return res!;
}

async function choose(t: T, as: As, bytes: Uint8Array, name = "careerbot-export.zip") {
  const res = await upload(as, bytes, name);
  const reply: unknown = await res.json();
  if (res.status !== 200) throw new Error(reply && typeof reply === "object" && "error" in reply ? String(reply.error) : "upload failed");
  await settle(t);
  return (await as.query(api.yourData.status, {})).import!;
}

async function zipOf(files: Record<string, string>) {
  const z = new JSZip();
  for (const [p, text] of Object.entries(files)) z.file(p, text);
  return z.generateAsync({ type: "uint8array" });
}
const EMPTY = { format: FORMAT, careerbotVersion: VERSION, exportedAt: "2026-10-06T00:00:00.000Z", workspace: { _id: "a".repeat(32), name: "B", began: 1 }, outside: {}, files: {}, tables: {} };

// Each id becomes its table and place (rows are oldest first in both files), so two files of the same data compare
// equal whatever their ids. A direction resume's mark covers ids, so it becomes whether it's in step with its direction.
function normalized(f: ExportFile) {
  const label = new Map<string, string>([[f.workspace._id, "workspace"]]);
  for (const [table, rows] of Object.entries(f.tables)) rows.forEach((r, i) => label.set(r._id, `${table}#${i}`));
  const directions = new Map((f.tables.items ?? []).filter((i) => i.kind === "direction").map((d) => [d._id, directionMark(d.data as object)]));
  const walk = (x: unknown, key?: string): unknown => {
    if (typeof x === "string") return label.get(x) ?? x.replace(/\b[0-9a-hjkmnp-tv-z]{31,37}\b/g, (id) => label.get(id) ?? id);
    if (Array.isArray(x)) return x.map((y) => walk(y));
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (key === "direction" && typeof o.id === "string" && typeof o.mark === "string") return { id: walk(o.id), inStep: directions.get(o.id) === o.mark };
      return Object.fromEntries(Object.entries(o).filter(([k]) => !["_id", "_creationTime", "workspaceId"].includes(k)).map(([k, y]) => [label.get(k) ?? k, walk(y, k)]));
    }
    return x;
  };
  const { _id, ...workspace } = f.workspace;
  return { workspace: { ...workspace, id: label.get(_id) }, tables: walk(f.tables) };
}

const fileIn = async (zip: JSZip) => JSON.parse(await zip.file(DATA_FILE)!.async("string")) as ExportFile;

test("a workspace exported and imported into a fresh one on another account holds the same data; keys stay behind", async () => {
  const t = convexTest(schema, modules);
  const a = await person(t, "Renata Alvarez");
  const b = await person(t, "Renata on another copy");
  await seed(t, a.w);
  await t.run((ctx) => ctx.db.insert("apiKeys", { workspaceId: a.w, service: "openrouter", sealed: "v1.secret", last4: "abcd", setAt: 1 }));

  const { bytes, zip } = await exportOf(t, a.as);
  const source = await fileIn(zip);
  expect(source).toMatchObject({ format: FORMAT, careerbotVersion: VERSION });
  expect(Object.keys(source.tables)).not.toContain("apiKeys");
  expect(new TextDecoder().decode(bytes)).not.toContain("v1.secret");
  for (const path of ["README.md", "Record.md", "Goals.md", "Companies.md"]) expect(zip.file(path)).toBeTruthy();
  expect(Object.keys(zip.files).some((p) => p.startsWith("Pursuits/") && p.endsWith(".md"))).toBe(true);
  expect(Object.keys(zip.files).some((p) => p.startsWith("Resumes and letters/") && p.endsWith(".docx"))).toBe(true);

  // A person's own settings don't make a workspace non-empty; the file's replace them.
  await b.as.mutation(api.budgets.set, { aiMonthlyUsd: 1, apolloMonthlyCredits: 0, apolloMode: "paused" });
  const preview = await choose(t, b.as, bytes);
  expect(preview.error).toBeNull();
  expect(preview).toMatchObject({ status: "ready", preview: { format: FORMAT, version: VERSION } });
  expect(preview.preview!.counts).toContainEqual({ kind: "Pursuits", n: SNAPSHOT.tables.pursuits.length });
  await b.as.mutation(api.yourData.startImport, { importId: preview.id });
  await settle(t);
  const done = (await b.as.query(api.yourData.status, {})).import!;
  expect(done).toMatchObject({ status: "done", error: null, result: { left: 0, files: 0 } });
  for (let i = 0; i < 10; i++) await settle(t);
  expect(await t.run((ctx) => ctx.db.query("importIds").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("apiKeys").withIndex("by_workspace_service", (q) => q.eq("workspaceId", b.w)).collect())).toEqual([]);

  const copy = await fileIn((await exportOf(t, b.as)).zip);
  expect(Object.keys(copy.tables).sort()).toEqual(Object.keys(SNAPSHOT.tables).sort());
  for (const [table, rows] of Object.entries(SNAPSHOT.tables)) expect(copy.tables[table], table).toHaveLength(rows.length);
  expect(normalized(copy)).toEqual(normalized(source));
  // Importing again into the now full workspace is refused.
  await expect(choose(t, b.as, bytes)).rejects.toThrow(/only in an empty workspace/);
}, 120_000);

test("a file from a newer CareerBot, a file that isn't an export, and a stopped import", async () => {
  const t = convexTest(schema, modules);
  const b = await person(t, "B");
  const empty = EMPTY;
  expect(await choose(t, b.as, await zipOf({ [DATA_FILE]: JSON.stringify({ ...empty, careerbotVersion: "99.0.0" }) }))).toMatchObject({ status: "refused", error: newer("99.0.0", VERSION) });
  expect(await choose(t, b.as, await zipOf({ [DATA_FILE]: JSON.stringify({ ...empty, format: FORMAT + 1 }) }))).toMatchObject({ status: "refused", error: NEWER_FORMAT });
  expect(await choose(t, b.as, await zipOf({ "notes.txt": "hello" }))).toMatchObject({ status: "refused", error: WRONG_FILE });
  expect(await choose(t, b.as, new TextEncoder().encode("not a zip"))).toMatchObject({ status: "refused", error: WRONG_FILE });

  // An import whose run was cut off (no sign of life for a while) can be continued, and finishes.
  const job = { _id: "b".repeat(32), _creationTime: 1, workspaceId: empty.workspace._id, kind: "extract", args: {}, status: "running" };
  const note = { _id: "c".repeat(32), _creationTime: 2, workspaceId: empty.workspace._id, kind: "note", title: "Hi", body: "Hello", version: 1, updatedAt: 2 };
  const ready = await choose(t, b.as, await zipOf({ [DATA_FILE]: JSON.stringify({ ...empty, tables: { jobs: [job], narratives: [note] } }) }));
  expect(ready.preview!.counts).toEqual([{ kind: "Stories", n: 1 }]);
  await t.run((ctx) => ctx.db.patch(ready.id, { status: "importing", beat: Date.now() - 10 * 60_000 }));
  await b.as.mutation(api.yourData.startImport, { importId: ready.id });
  await settle(t);
  expect((await b.as.query(api.yourData.status, {})).import).toMatchObject({ status: "done", result: { rows: 1 } });
  // Work that was running at the source never comes in to run here.
  expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toEqual([]);
});

test("an upload is the sender's own import: another workspace's import and file are never read, started or deleted", async () => {
  const t = convexTest(schema, modules);
  const b = await person(t, "B");
  const c = await person(t, "C");
  const zip = await zipOf({ [DATA_FILE]: JSON.stringify(EMPTY) });
  const imports = () => t.run((ctx) => ctx.db.query("imports").collect());
  const exists = (id: Id<"_storage">) => t.run(async (ctx) => !!(await ctx.db.system.get(id)));

  // Signed out: refused, nothing stored.
  expect((await t.fetch(IMPORT_PATH, { method: "POST", body: new Uint8Array(zip) })).status).toBe(401);
  expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toEqual([]);

  // The interleaving: B is about to import when C uploads; B then uploads. Each import holds its sender's own file.
  expect((await upload(c.as, zip)).status).toBe(200);
  expect((await upload(b.as, zip)).status).toBe(200);
  await settle(t);
  const theirs = (await imports()).find((r) => r.workspaceId === c.w)!;
  const mine = (await imports()).find((r) => r.workspaceId === b.w)!;
  expect(theirs).toMatchObject({ userId: c.u, status: "ready" });
  expect(mine.fileId).not.toEqual(theirs.fileId);

  // B can't start or clear C's import, and C's file stays.
  await expect(b.as.mutation(api.yourData.startImport, { importId: theirs._id })).rejects.toThrow(/Choose the file again/);
  await b.as.mutation(api.yourData.clearImport, { importId: theirs._id });
  expect(await exists(theirs.fileId!)).toBe(true);
  expect((await imports()).find((r) => r._id === theirs._id)).toMatchObject({ status: "ready", fileId: theirs.fileId });
  // B's status shows B's import only.
  expect((await b.as.query(api.yourData.status, {})).import!.id).toBe(mine._id);
}, 120_000);

test("a ZIP that unpacks to far more than it looks is refused before it's read whole; one too large isn't stored", async () => {
  const t = convexTest(schema, modules);
  const b = await person(t, "B");
  const z = new JSZip();
  z.file(DATA_FILE, " ".repeat(MAX_DATA_BYTES + 1), { compression: "DEFLATE" });
  const bomb = await z.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  expect(bomb.byteLength).toBeLessThan(1024 * 1024);
  expect(await choose(t, b.as, bomb)).toMatchObject({ status: "refused", error: TOO_MUCH_INSIDE });

  const huge = await upload(b.as, new Uint8Array(MAX_IMPORT_BYTES + 1));
  expect(huge.status).toBe(409);
  expect(await huge.json()).toEqual({ error: TOO_LARGE });
  expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toEqual([]);
}, 120_000);

test("rows that would be left out are shown first and need saying so; losing something a person sees is refused", async () => {
  const t = convexTest(schema, modules);
  const b = await person(t, "B");
  // A line update written by work that hadn't finished (a job still running) can't come in without it.
  const job = { _id: "b".repeat(32), _creationTime: 1, workspaceId: EMPTY.workspace._id, kind: "extract", args: {}, status: "running" };
  const usage = { _id: "d".repeat(32), _creationTime: 2, workspaceId: EMPTY.workspace._id, target: "base", runId: job._id, lines: [], marks: [] };
  const ready = await choose(t, b.as, await zipOf({ [DATA_FILE]: JSON.stringify({ ...EMPTY, tables: { jobs: [job], lineUpdates: [usage] } }) }));
  expect(ready).toMatchObject({ status: "ready", preview: { omitted: [{ kind: OTHER_HISTORY, n: 1 }] } });
  await expect(b.as.mutation(api.yourData.startImport, { importId: ready.id })).rejects.toThrow(/left out/);
  await b.as.mutation(api.yourData.startImport, { importId: ready.id, leaveOut: true });
  await settle(t);
  expect((await b.as.query(api.yourData.status, {})).import).toMatchObject({ status: "done", result: { left: 1, omitted: [{ kind: OTHER_HISTORY, n: 1 }] } });

  // A note about that unfinished work would be lost too: something a person sees, so the file is refused.
  const c = await person(t, "C");
  const note = { _id: "e".repeat(32), _creationTime: 3, workspaceId: EMPTY.workspace._id, subject: { kind: "item", id: job._id }, text: "Hi", at: 3 };
  const refused = await choose(t, c.as, await zipOf({ [DATA_FILE]: JSON.stringify({ ...EMPTY, tables: { jobs: [job], notes: [note] } }) }));
  expect(refused.status).toBe("refused");
  expect(refused.error).toMatch(/can’t come in whole: Notes \(1\)/);
}, 120_000);

// A part of a row that names missing work goes in without that part. A link CareerBot keeps is listed and can be left
// out; lines a person was going through on a resume (their decisions and reasons) are refused, never dropped quietly.
test("parts of rows that would be left out: links are listed and need saying so, a resume's lines in review are refused", async () => {
  const t = convexTest(schema, modules);
  const job = { _id: "b".repeat(32), _creationTime: 1, workspaceId: EMPTY.workspace._id, kind: "extract", args: {}, status: "running" };
  const resume = { _id: "f".repeat(32), _creationTime: 2, workspaceId: EMPTY.workspace._id, model: "m", runId: job._id, at: 2 };

  const b = await person(t, "B");
  const ready = await choose(t, b.as, await zipOf({ [DATA_FILE]: JSON.stringify({ ...EMPTY, tables: { jobs: [job], resumes: [resume] } }) }));
  expect(ready).toMatchObject({ status: "ready", preview: { omitted: [{ kind: "Links in resumes", n: 1 }] } });
  await expect(b.as.mutation(api.yourData.startImport, { importId: ready.id })).rejects.toThrow(/left out/);
  await b.as.mutation(api.yourData.startImport, { importId: ready.id, leaveOut: true });
  await settle(t);
  expect((await b.as.query(api.yourData.status, {})).import).toMatchObject({ status: "done", result: { left: 0, omitted: [{ kind: "Links in resumes", n: 1 }] } });
  expect(await t.run((ctx) => ctx.db.query("resumes").collect())).toMatchObject([{ model: "m" }]);

  const c = await person(t, "C");
  const doc = { summary: "", experience: [], skills: [] };
  const basis = { roles: [], facts: [], projects: [], insights: [] };
  const additions = { at: 2, runId: job._id, before: { doc }, basis, lines: [{ text: "Led the move", factIds: [], state: "skipped", reason: "Not mine to claim" }] };
  const refused = await choose(t, c.as, await zipOf({ [DATA_FILE]: JSON.stringify({ ...EMPTY, tables: { jobs: [job], resumes: [{ ...resume, runId: undefined, additions }] } }) }));
  expect(refused.status).toBe("refused");
  expect(refused.error).toMatch(/can’t come in whole: Resume lines you were going through \(Add what’s new\) \(1\)/);
}, 120_000);

test("an export over 20 MB (a large stored file) uploads in pieces and comes in whole", async () => {
  const t = convexTest(schema, modules);
  const b = await person(t, "B");
  const big = new Uint8Array(21 * 1024 * 1024);
  for (let i = 0; i < big.length; i += 65536) crypto.getRandomValues(big.subarray(i, i + 65536));
  const z = new JSZip();
  z.file(DATA_FILE, JSON.stringify({ ...EMPTY, files: { ["f".repeat(32)]: { path: "files/big", bytes: big.byteLength, contentType: "application/pdf" } } }));
  z.file("files/big", big);
  const zip = await z.generateAsync({ type: "uint8array", compression: "STORE" });
  expect(zip.byteLength).toBeGreaterThan(20 * 1024 * 1024);
  const ready = await choose(t, b.as, zip);
  expect(ready).toMatchObject({ status: "ready", bytes: zip.byteLength });
  // The pieces were joined and are gone; only the whole file is kept for the import.
  expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(1);
  await b.as.mutation(api.yourData.startImport, { importId: ready.id });
  await settle(t);
  expect((await b.as.query(api.yourData.status, {})).import).toMatchObject({ status: "done", result: { files: 1 } });
  const stored = await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).map((f) => f.size));
  expect(stored).toEqual([big.byteLength]);
}, 120_000);

test("an export of exactly as many files as an import opens comes in; one more is refused at export", async () => {
  const t = convexTest(schema, modules);
  const a = await person(t, "A");
  const b = await person(t, "B");
  await seed(t, a.w);
  const base = Object.keys((await exportOf(t, a.as)).zip.files).length;
  // Each copy of a pursuit adds its own Pursuits/*.md.
  const pursuits = (n: number) =>
    t.run(async (ctx) => {
      const p = (await ctx.db.query("pursuits").collect()).find((r) => r.workspaceId === a.w)!;
      const small = { workspaceId: a.w, companyId: p.companyId, company: p.company, status: p.status, timeline: [], changedAt: p.changedAt, at: p.at };
      for (let i = 0; i < n; i++) await ctx.db.insert("pursuits", { ...small, title: `Copy ${i}` });
    });
  await pursuits(MAX_ENTRIES - base);
  const { bytes, zip } = await exportOf(t, a.as);
  expect(Object.keys(zip.files)).toHaveLength(MAX_ENTRIES);
  const ready = await choose(t, b.as, bytes);
  expect(ready).toMatchObject({ status: "ready", error: null });
  await b.as.mutation(api.yourData.startImport, { importId: ready.id });
  for (let i = 0; i < 10; i++) await settle(t);
  expect((await b.as.query(api.yourData.status, {})).import).toMatchObject({ status: "done", error: null });

  await pursuits(1);
  await a.as.mutation(api.yourData.startExport, {});
  await settle(t);
  expect((await a.as.query(api.yourData.status, {})).export).toMatchObject({ status: "failed", error: EXPORT_TOO_MANY_FILES });
}, 600_000);
