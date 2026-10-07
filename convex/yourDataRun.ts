"use node";

import JSZip from "jszip";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction } from "./_generated/server";
import { docxOf } from "./docxFiles";
import { type DriveNode, ROOT } from "./drivePaths";
import { countsOf, DATA_FILE, type ExportFile, FORMAT, type FileAbout, lostEssential, omissionsOf, readExport, Refusal, STEPS, zipName } from "./exportFormat";
import { EXPORT_TOO_LARGE, EXPORT_TOO_MANY_FILES, MAX_DATA_BYTES, MAX_ENTRIES, MAX_IMPORT_BYTES, MAX_ROWS, MAX_UNPACKED_BYTES, MISSING_FILES, TOO_MUCH_INSIDE, WRONG_FILE } from "./exportRules";
import { fileName, readableFiles } from "./readableExport";
import { toMarkdown } from "./resumeDoc";
import { VERSION } from "./version";
import { CARRIED, carried, copyRows, type Done, filesIn, type Known, namedIds, type Row, thisSchema } from "./workspaceCopy";

// The background half of Settings, Your data (yourData.ts): making an export's ZIP, checking a chosen file, and putting
// one in. Node, for the memory a whole workspace's ZIP takes. None of it calls AI, Apollo or email.

// An import stops itself well before an action's time runs out and carries on in a new run.
const RUN_MS = 8 * 60_000;
class Pause extends Error {}

const plainError = (e: unknown) => (e instanceof Refusal ? e.message : "Something went wrong. Try again.");

// ---- Export ----

async function rowsOf(ctx: ActionCtx, workspaceId: Id<"workspaces">, table: string) {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    const p: { rows: unknown[]; cursor: string; done: boolean } = await ctx.runQuery(internal.yourData.page, { workspaceId, table, cursor });
    rows.push(...(p.rows as Row[]));
    if (p.done) return rows;
    cursor = p.cursor;
  }
}

// Where a resume, cover letter or answers sits in the ZIP: the same folders Google Drive gets, under "Resumes and letters".
function pathOf(node: DriveNode, byKey: Map<string, DriveNode>) {
  const parts = [node.name];
  for (let at = byKey.get(node.parent); at && at.key !== ROOT; at = byKey.get(at.parent)) parts.unshift(at.name);
  return ["Resumes and letters", ...parts.map((p) => fileName(p, "Untitled"))].join("/");
}

export const runExport = internalAction({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }) => {
    const row = await ctx.runQuery(internal.yourData.exportRow, { exportId });
    if (row?.status !== "running") return;
    const { workspaceId } = row;
    try {
      const schema = thisSchema();
      const tables: Record<string, Row[]> = {};
      let done = 0;
      for (const table of [...CARRIED].sort()) {
        if (!(await ctx.runMutation(internal.yourData.exportProgress, { exportId, step: STEPS[table], done }))) return;
        const rows = carried(table, await rowsOf(ctx, workspaceId, table));
        if (rows.length) tables[table] = rows;
        done++;
      }
      const named = namedIds(String(workspaceId), tables);
      const outside: Record<string, string> = {};
      for (let i = 0; i < named.length; i += 500) {
        const found: Record<string, string | null> = await ctx.runQuery(internal.yourData.idTables, { ids: named.slice(i, i + 500) });
        for (const [id, table] of Object.entries(found)) if (table) outside[id] = table;
      }

      await ctx.runMutation(internal.yourData.exportProgress, { exportId, step: "Files", done });
      const zip = new JSZip();
      const files: Record<string, FileAbout> = {};
      for (const [table, rows] of Object.entries(tables))
        for (const r of rows)
          for (const id of filesIn(schema.tables[table], r)) {
            if (files[id]) continue;
            const blob = await ctx.storage.get(id as Id<"_storage">);
            if (!blob) continue;
            files[id] = { path: `files/${id}`, contentType: blob.type || undefined, bytes: blob.size };
            zip.file(files[id].path, new Uint8Array(await blob.arrayBuffer()));
          }
      const at = Date.now();
      const file: ExportFile = {
        format: FORMAT,
        careerbotVersion: VERSION,
        exportedAt: new Date(at).toISOString(),
        workspace: await ctx.runQuery(internal.yourData.about, { workspaceId }),
        outside,
        files,
        tables,
      };
      zip.file(DATA_FILE, JSON.stringify(file, null, 2));

      await ctx.runMutation(internal.yourData.exportProgress, { exportId, step: "Readable copies", done: done + 1 });
      for (const f of readableFiles(file)) zip.file(f.path, f.text);
      const nodes: DriveNode[] = await ctx.runQuery(internal.yourData.documents, { workspaceId });
      const byKey = new Map(nodes.map((n) => [n.key, n]));
      for (const n of nodes) {
        if (n.folder) continue;
        const path = pathOf(n, byKey);
        zip.file(`${path}.docx`, new Uint8Array(await docxOf(n.content)));
        const c = n.content;
        const md = c.kind === "resume" ? toMarkdown(c.doc, c.contact) : c.kind === "letter" ? c.text : c.items.map((a) => `## ${a.question}\n\n${a.answer}\n`).join("\n");
        zip.file(`${path}.md`, md);
      }

      // Never an export that no import could take. JSZip lists each folder as an entry too, as the import counts them.
      if (Object.keys(zip.files).length > MAX_ENTRIES) {
        await ctx.runMutation(internal.yourData.exportFailed, { exportId, error: EXPORT_TOO_MANY_FILES });
        return;
      }
      const bytes = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const json = zip.file(DATA_FILE)!;
      const dataBytes = (await json.async("uint8array")).byteLength;
      const unpacked = dataBytes + Object.values(files).reduce((n, f) => n + f.bytes, 0);
      if (bytes.byteLength > MAX_IMPORT_BYTES || dataBytes > MAX_DATA_BYTES || unpacked > MAX_UNPACKED_BYTES || rowCount(file) > MAX_ROWS) {
        await ctx.runMutation(internal.yourData.exportFailed, { exportId, error: EXPORT_TOO_LARGE });
        return;
      }
      const fileId = await ctx.storage.store(new Blob([bytes], { type: "application/zip" }));
      await ctx.runMutation(internal.yourData.exportDone, { exportId, fileId, name: zipName(at), bytes: bytes.byteLength });
    } catch (e) {
      console.error("export failed", e);
      await ctx.runMutation(internal.yourData.exportFailed, { exportId, error: "The export didn’t finish. Try again." });
    }
  },
});

// ---- Import ----

// One file in the ZIP, unpacked a piece at a time and given up on (refused) as soon as it passes `max` bytes, so a file
// that unpacks to far more than its packed size is never held whole.
function readBounded(entry: JSZip.JSZipObject, max: number) {
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const parts: Uint8Array[] = [];
    let size = 0;
    let over = false;
    const stream = entry.nodeStream("nodebuffer");
    stream.on("data", (chunk: Uint8Array) => {
      if (over) return;
      size += chunk.byteLength;
      if (size > max) {
        over = true;
        stream.pause();
        reject(new Refusal(TOO_MUCH_INSIDE));
        return;
      }
      parts.push(chunk);
    });
    stream.on("error", (e: unknown) => reject(e instanceof Refusal ? e : new Refusal(WRONG_FILE)));
    stream.on("end", () => {
      const out = new Uint8Array(size);
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.byteLength;
      }
      resolve(out);
    });
  });
}

// The chosen ZIP's careerbot-export.json, read and brought to this copy's format, within the limits on what's inside.
async function openFile(ctx: ActionCtx, fileId: Id<"_storage">) {
  const blob = await ctx.storage.get(fileId);
  if (!blob) throw new Refusal("The file is gone. Choose it again.");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await blob.arrayBuffer());
  } catch {
    throw new Refusal(WRONG_FILE);
  }
  if (Object.keys(zip.files).length > MAX_ENTRIES) throw new Refusal(TOO_MUCH_INSIDE);
  const data = zip.file(DATA_FILE);
  if (!data) throw new Refusal(WRONG_FILE);
  const bytes = await readBounded(data, MAX_DATA_BYTES);
  const read = readExport(new TextDecoder().decode(bytes));
  if (rowCount(read.file) > MAX_ROWS) throw new Refusal(TOO_MUCH_INSIDE);
  return { zip, unpacked: bytes.byteLength, ...read };
}

const rowCount = (f: ExportFile) => Object.values(f.tables).reduce((n, rows) => n + rows.length, 0);

// What goes in: the file's rows less work that hadn't finished, which never comes in whatever the file says; what
// names that work is left out as the file's own leftovers are.
function planOf(file: ExportFile) {
  const tables = Object.fromEntries(Object.entries(file.tables).map(([t, rows]) => [t, carried(t, rows)]));
  const unfinished = (file.tables.jobs ?? []).filter((j) => !tables.jobs?.includes(j)).map((j) => j._id);
  return { workspaceId: file.workspace._id, outside: [...Object.keys(file.outside), ...unfinished], tables };
}

// The rows that would be left out, found by running the copy without writing anything.
async function leftOut(file: ExportFile) {
  const known: Known = { map: new Map([[file.workspace._id, file.workspace._id], ...Object.keys(file.files).map((id) => [id, id] as [string, string])]), pending: new Set(), outside: new Set() };
  let n = 0;
  const r = await copyRows(planOf(file), thisSchema(), known, { insert: async (_table, rows) => rows.map(() => `new${n++}`), patch: async () => {} }, { loose: true });
  return omissionsOf(r.left, r.dropped, r.droppedText);
}

export const checkImport = internalAction({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    const row = await ctx.runQuery(internal.yourData.importRow, { importId });
    if (row?.status !== "checking" || (!row.fileId && !row.chunks?.length)) return;
    try {
      // Uploaded in pieces: joined into one file first.
      let fileId = row.fileId;
      if (!fileId) {
        const blobs = await Promise.all(row.chunks!.map((id) => ctx.storage.get(id)));
        if (blobs.some((b) => !b)) throw new Refusal("The upload was interrupted. Choose the file again.");
        fileId = await ctx.storage.store(new Blob(blobs as Blob[], { type: "application/zip" }));
        await ctx.runMutation(internal.yourData.joined, { importId, fileId });
      }
      const { zip, file, from } = await openFile(ctx, fileId);
      if (Object.values(file.files).some((f) => !zip.file(f.path))) throw new Refusal(MISSING_FILES);
      const omitted = await leftOut(file);
      if (omitted.some((o) => o.essential)) throw new Refusal(lostEssential(omitted));
      const preview = { format: from, version: file.careerbotVersion, exportedAt: file.exportedAt, counts: countsOf(file.tables), omitted: omitted.map(({ kind, n }) => ({ kind, n })) };
      await ctx.runMutation(internal.yourData.importChecked, { importId, preview, total: rowCount(file) });
    } catch (e) {
      if (!(e instanceof Refusal)) console.error("import check failed", e);
      await ctx.runMutation(internal.yourData.importChecked, { importId, error: e instanceof Refusal ? e.message : WRONG_FILE });
    }
  },
});

export const runImport = internalAction({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    const row = await ctx.runQuery(internal.yourData.importRow, { importId });
    if (row?.status !== "importing" || !row.fileId) return;
    const until = Date.now() + RUN_MS;
    const check = () => {
      if (Date.now() > until) throw new Pause();
    };
    try {
      const { zip, file, unpacked } = await openFile(ctx, row.fileId);
      // What an earlier run put in already.
      const done: Done = new Map();
      for (let cursor: string | null = null; ; ) {
        const p: { rows: { old: string; id: string; later: string[] }[]; cursor: string; done: boolean } = await ctx.runQuery(internal.yourData.putIn, { importId, cursor });
        for (const r of p.rows) done.set(r.old, { id: r.id, later: r.later });
        if (p.done) break;
        cursor = p.cursor;
      }
      if (!done.size) await ctx.runMutation(internal.yourData.clearSettings, { importId, tables: Object.keys(file.tables) });

      const plan = planOf(file);
      const known: Known = { map: new Map([[file.workspace._id, String(row.workspaceId)]]), pending: new Set(), outside: new Set() };

      let files = 0;
      let room = MAX_UNPACKED_BYTES - unpacked;
      for (const [old, about] of Object.entries(file.files)) {
        const had = done.get(old);
        if (had) {
          known.map.set(old, had.id);
          files++;
          continue;
        }
        const entry = zip.file(about.path);
        if (!entry) throw new Refusal(MISSING_FILES);
        check();
        const bytes = await readBounded(entry, room);
        room -= bytes.byteLength;
        const id = await ctx.storage.store(new Blob([bytes], { type: about.contentType ?? "application/octet-stream" }));
        await ctx.runMutation(internal.yourData.fileIn, { importId, old, id });
        known.map.set(old, id);
        files++;
      }

      let inserted = [...done.keys()].filter((k) => !file.files[k]).length;
      const r = await copyRows(plan, thisSchema(), known, {
        insert: async (table, rows) => {
          check();
          inserted += rows.length;
          return await ctx.runMutation(internal.yourData.insertRows, { importId, table, rows, step: STEPS[table], done: inserted });
        },
        patch: async (table, patches) => {
          check();
          await ctx.runMutation(internal.yourData.patchRows, { importId, table, patches });
        },
      }, { loose: true, done });

      const { name, began, setupHidden, setupSkipped, toursOffered } = file.workspace;
      const workspace = { name, began, ...(setupHidden !== undefined ? { setupHidden } : {}), ...(setupSkipped ? { setupSkipped } : {}), ...(toursOffered ? { toursOffered } : {}) };
      await ctx.runMutation(internal.yourData.importFinished, { importId, workspace, result: { rows: inserted, files, left: r.left.length, omitted: omissionsOf(r.left, r.dropped, r.droppedText).map(({ kind, n }) => ({ kind, n })) } });
    } catch (e) {
      if (e instanceof Pause) {
        await ctx.scheduler.runAfter(0, internal.yourDataRun.runImport, { importId });
        return;
      }
      console.error("import failed", e);
      await ctx.runMutation(internal.yourData.importFailed, { importId, error: plainError(e) });
    }
  },
});
