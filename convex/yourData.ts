import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { httpAction, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { DEMO_REFUSAL } from "./demoRefusal";
import { planFor } from "./drive";
import { CHUNK_BYTES, MAX_IMPORT_BYTES, STALLED_MS, TOO_LARGE } from "./exportRules";
import { mutation } from "./functions";
import { VERSION } from "./version";
import { CARRIED } from "./workspaceCopy";
import { inWorkspace, pageOf, tablesOf } from "./workspaceRows";
import { requireWorkspace } from "./workspaces";

// Settings, Your data: export everything in a workspace as one ZIP, and import such a ZIP into an empty workspace on
// any copy (content/docs/using/your-data.mdx). The work runs in the background (yourDataRun.ts); here are what the
// screen reads, what it starts, and the small steps the background work takes. Nothing here calls AI, Apollo or email,
// and the demo is refused like every other change (functions.ts).

// An export's ZIP is kept this long, then deleted.
const KEPT_MS = 60 * 60_000;
// Settings a new workspace may already have (a budget, models, reminders, contact details): they don't make it non-empty,
// and an import replaces them with the file's.
export const SETTINGS = ["aiDefaults", "aiSettings", "budgets", "discovery", "profiles", "reminderSettings", "resumeSettings"];

const exportOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("exports").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first();
const importOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("imports").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first();

// Empty: nothing in it but settings (no stories, record, companies, roles, pursuits, resumes, notes or spending).
export async function isEmpty(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  for (const table of CARRIED) if (!SETTINGS.includes(table) && (await inWorkspace(ctx, table, workspaceId).first())) return false;
  return true;
}

// Background work that hasn't shown a sign of life for longer than STALLED_MS was cut off: Export starts again, and an
// import can be continued.
const stalled = (row: { status: string; beat: number }, busy: string[]) => busy.includes(row.status) && Date.now() - row.beat > STALLED_MS;

export const status = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const ex = await exportOf(ctx, workspaceId);
    // One still uploading is the screen's own upload in progress, shown there.
    const found = await importOf(ctx, workspaceId);
    const im = found?.status === "uploading" ? null : found;
    const live = ex?.status === "done" && ex.fileId && (ex.expiresAt ?? 0) > Date.now();
    return {
      version: VERSION,
      uploadTo: `${process.env.CONVEX_SITE_URL ?? ""}${IMPORT_PATH}`,
      empty: await isEmpty(ctx, workspaceId),
      export: ex && {
        status: ex.status,
        beat: ex.beat,
        step: ex.step ?? null,
        done: ex.done,
        total: ex.total,
        name: ex.name ?? null,
        bytes: ex.bytes ?? null,
        url: live ? await ctx.storage.getUrl(ex.fileId!) : null,
        expiresAt: ex.expiresAt ?? null,
        error: ex.error ?? null,
      },
      import: im && {
        id: im._id,
        status: im.status,
        beat: im.beat,
        name: im.name,
        bytes: im.bytes,
        preview: im.preview ?? null,
        step: im.step ?? null,
        done: im.done,
        total: im.total,
        error: im.error ?? null,
        result: im.result ?? null,
      },
    };
  },
});

// ---- Export ----

export const startExport = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const im = await importOf(ctx, workspaceId);
    if (im && (im.status === "importing" || (im.status === "failed" && im.done > 0))) throw new ConvexError("Export is available once the import is done.");
    const old = await exportOf(ctx, workspaceId);
    if (old?.status === "running" && !stalled(old, ["running"])) return old._id;
    if (old) {
      if (old.fileId) await ctx.storage.delete(old.fileId);
      await ctx.db.delete(old._id);
    }
    const now = Date.now();
    const exportId = await ctx.db.insert("exports", { workspaceId, status: "running", done: 0, total: CARRIED.length + 2, beat: now, at: now });
    await ctx.scheduler.runAfter(0, internal.yourDataRun.runExport, { exportId });
    return exportId;
  },
});

export const exportRow = internalQuery({
  args: { exportId: v.id("exports") },
  handler: (ctx, { exportId }) => ctx.db.get(exportId),
});

// One page of the workspace's rows in a table: only its own rows, through the table's workspace index.
export const page = internalQuery({
  args: { workspaceId: v.id("workspaces"), table: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: (ctx, { workspaceId, table, cursor }) => {
    if (!CARRIED.includes(table)) throw new Error(`${table} isn't carried.`);
    return pageOf(ctx, table, workspaceId, cursor);
  },
});

// Which table each id is in on this deployment (null: none), for the ids an export names but doesn't carry.
export const idTables = internalQuery({
  args: { ids: v.array(v.string()) },
  handler: (ctx, { ids }) => tablesOf(ctx, ids),
});

// The workspace's own settings, as the file carries them.
export const about = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const w = await ctx.db.get(workspaceId);
    if (!w) throw new Error("The workspace is gone.");
    return {
      _id: String(w._id),
      name: w.name,
      began: w.began ?? w._creationTime,
      ...(w.setupHidden !== undefined ? { setupHidden: w.setupHidden } : {}),
      ...(w.setupSkipped ? { setupSkipped: w.setupSkipped } : {}),
      ...(w.toursOffered ? { toursOffered: w.toursOffered } : {}),
    };
  },
});

// The current resumes, cover letters and answers, as Google Drive would hold them: the export's readable copies.
export const documents = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: (ctx, { workspaceId }) => planFor(ctx, workspaceId, undefined),
});

export const exportProgress = internalMutation({
  args: { exportId: v.id("exports"), step: v.string(), done: v.number() },
  handler: async (ctx, { exportId, step, done }) => {
    const row = await ctx.db.get(exportId);
    if (row?.status === "running") await ctx.db.patch(exportId, { step, done, beat: Date.now() });
    return row?.status === "running";
  },
});

export const exportDone = internalMutation({
  args: { exportId: v.id("exports"), fileId: v.id("_storage"), name: v.string(), bytes: v.number() },
  handler: async (ctx, { exportId, fileId, name, bytes }) => {
    const row = await ctx.db.get(exportId);
    const now = Date.now();
    await ctx.scheduler.runAfter(KEPT_MS, internal.yourData.expire, { exportId, fileId });
    if (row?.status !== "running") return;
    await ctx.db.patch(exportId, { status: "done", fileId, name, bytes, done: row.total, step: undefined, expiresAt: now + KEPT_MS, beat: now });
  },
});

export const exportFailed = internalMutation({
  args: { exportId: v.id("exports"), error: v.string() },
  handler: async (ctx, { exportId, error }) => {
    const row = await ctx.db.get(exportId);
    if (row?.status === "running") await ctx.db.patch(exportId, { status: "failed", error, beat: Date.now() });
  },
});

// An hour after it's made, the ZIP goes (and the export with it, unless a newer one took its place).
export const expire = internalMutation({
  args: { exportId: v.id("exports"), fileId: v.id("_storage") },
  handler: async (ctx, { exportId, fileId }) => {
    if (await ctx.db.system.get(fileId)) await ctx.storage.delete(fileId);
    const row = await ctx.db.get(exportId);
    if (row?.fileId === fileId) await ctx.db.delete(exportId);
  },
});

// ---- Import ----

async function mustBeEmpty(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  if (!(await isEmpty(ctx, workspaceId))) throw new ConvexError("Import works only in an empty workspace.");
}

async function dropImport(ctx: MutationCtx, row: { _id: Id<"imports">; fileId?: Id<"_storage">; chunks?: Id<"_storage">[] }) {
  for (const id of [...(row.fileId ? [row.fileId] : []), ...(row.chunks ?? [])]) if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
  await ctx.db.delete(row._id);
}

// Where the screen uploads a file to import, and the headers that let it: the site's address (CONVEX_SITE_URL), where
// importUpload takes it. The person is known by the sign-in token the request carries (no cookies), so any page may
// send it.
export const IMPORT_PATH = "/your-data/import";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" };

// The workspace a person can import into now, or why not. An earlier import that never started goes (with its file,
// which was theirs); one under way can't be replaced.
async function importable(ctx: MutationCtx, userId: Id<"users">): Promise<{ workspaceId: Id<"workspaces"> } | { error: string }> {
  const membership = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  const workspace = membership && (await ctx.db.get(membership.workspaceId));
  if (!workspace) return { error: "No workspace for this account." };
  if (workspace.demo) return { error: DEMO_REFUSAL };
  const old = await importOf(ctx, workspace._id);
  if (old?.status === "importing" || (old && old.done > 0 && old.status !== "done")) return { error: "An import is already under way here." };
  if (old) await dropImport(ctx, old);
  if (!(await isEmpty(ctx, workspace._id))) return { error: "Import works only in an empty workspace." };
  return { workspaceId: workspace._id };
}

// Before a first piece is read: whether this person can import now (the reason when not).
export const prepareImport = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const r = await importable(ctx, userId);
    return "error" in r ? r.error : null;
  },
});

// A piece importUpload just stored for this person. The first makes their import (uploading); each next one must be
// the next piece of their own import that's still uploading. The last one sends it to be joined and checked, then shown
// as a preview to import or not. A piece that doesn't fit is refused and deleted (it's theirs, just stored).
export const partIn = internalMutation({
  args: { userId: v.id("users"), importId: v.optional(v.string()), fileId: v.id("_storage"), part: v.number(), parts: v.number(), name: v.string(), bytes: v.number() },
  handler: async (ctx, { userId, importId, fileId, part, parts, name, bytes }): Promise<{ importId: Id<"imports"> } | { error: string }> => {
    const refuse = async (error: string) => {
      await ctx.storage.delete(fileId);
      return { error };
    };
    const now = Date.now();
    let id: Id<"imports">;
    if (part === 0) {
      const r = await importable(ctx, userId);
      if ("error" in r) return await refuse(r.error);
      id = await ctx.db.insert("imports", { workspaceId: r.workspaceId, userId, chunks: [fileId], parts, name: name.slice(0, 200), bytes, status: "uploading", done: 0, total: 0, beat: now, at: now });
    } else {
      const known = importId ? ctx.db.normalizeId("imports", importId) : null;
      const row = known && (await ctx.db.get(known));
      if (!row || row.userId !== userId || row.status !== "uploading" || row.parts !== parts || (row.chunks ?? []).length !== part) return await refuse("The upload was interrupted. Choose the file again.");
      if (row.bytes + bytes > MAX_IMPORT_BYTES) {
        await dropImport(ctx, row);
        return await refuse(TOO_LARGE);
      }
      id = row._id;
      await ctx.db.patch(id, { chunks: [...(row.chunks ?? []), fileId], bytes: row.bytes + bytes, beat: now });
    }
    if (part === parts - 1) {
      await ctx.db.patch(id, { status: "checking", beat: now });
      await ctx.scheduler.runAfter(0, internal.yourDataRun.checkImport, { importId: id });
    }
    return { importId: id };
  },
});

// The pieces joined into one file (yourDataRun.checkImport): the pieces go.
export const joined = internalMutation({
  args: { importId: v.id("imports"), fileId: v.id("_storage") },
  handler: async (ctx, { importId, fileId }) => {
    const row = await ctx.db.get(importId);
    if (row?.status !== "checking") return void (await ctx.storage.delete(fileId));
    for (const id of row.chunks ?? []) if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
    await ctx.db.patch(importId, { fileId, chunks: undefined, beat: Date.now() });
  },
});

// The request's body, read up to `max` bytes; null once it goes past them (the rest is never read).
async function readCapped(req: Request, max: number) {
  const reader = req.body?.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader?.read();
    if (!next || next.done) break;
    size += next.value.byteLength;
    if (size > max) {
      await reader!.cancel();
      return null;
    }
    parts.push(next.value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

// Choosing a file to import: the ZIP comes here in pieces of at most CHUNK_BYTES (POST, signed in,
// ?name=&part=&parts=, and &import= after the first), each stored and recorded on the sender's own import in the same
// request. Storage upload URLs aren't used: a storage id a browser hands back says nothing about who uploaded it.
export const importUpload = httpAction(async (ctx, req) => {
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  const userId = await getAuthUserId(ctx);
  if (!userId) return reply(401, { error: "Sign in again, then choose the file." });
  const q = new URL(req.url).searchParams;
  const part = Number(q.get("part") ?? 0);
  const parts = Number(q.get("parts") ?? 1);
  if (!Number.isInteger(part) || !Number.isInteger(parts) || part < 0 || parts < 1 || part >= parts || parts > Math.ceil(MAX_IMPORT_BYTES / CHUNK_BYTES)) return reply(413, { error: TOO_LARGE });
  if (Number(req.headers.get("Content-Length") ?? 0) > CHUNK_BYTES) return reply(413, { error: TOO_LARGE });
  if (part === 0) {
    const refused = await ctx.runMutation(internal.yourData.prepareImport, { userId });
    if (refused) return reply(409, { error: refused });
  }
  const body = await readCapped(req, CHUNK_BYTES);
  if (!body) return reply(413, { error: TOO_LARGE });
  const fileId = await ctx.storage.store(new Blob([body], { type: "application/octet-stream" }));
  const importId = q.get("import") || undefined;
  const r = await ctx.runMutation(internal.yourData.partIn, { userId, importId, fileId, part, parts, name: q.get("name") || "careerbot-export.zip", bytes: body.byteLength });
  return reply("error" in r ? 409 : 200, r);
});

export const importUploadOptions = httpAction(async () => new Response(null, { status: 204, headers: CORS }));

// Choose another file: the checked one goes.
export const clearImport = mutation({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await ctx.db.get(importId);
    if (!row || row.workspaceId !== workspaceId) return;
    if (row.status === "importing" || (row.done > 0 && row.status !== "done")) throw new ConvexError("An import is already under way here.");
    await dropImport(ctx, row);
  },
});

// Import (a checked file), or Continue (one that stopped partway): picks up after whatever is in already. A file that
// would leave rows out (its preview's omitted) goes in only once they've said so (leaveOut).
export const startImport = mutation({
  args: { importId: v.id("imports"), leaveOut: v.optional(v.boolean()) },
  handler: async (ctx, { importId, leaveOut }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await ctx.db.get(importId);
    if (!row || row.workspaceId !== workspaceId || !row.fileId) throw new ConvexError("Choose the file again.");
    const again = row.status === "failed" || (row.status === "importing" && stalled(row, ["importing"]));
    if (row.status === "importing" && !again) return;
    if (row.status !== "ready" && !again) throw new ConvexError("Choose the file again.");
    if (row.status === "ready") await mustBeEmpty(ctx, workspaceId);
    if (row.status === "ready" && row.preview?.omitted.length && !leaveOut) throw new ConvexError("Some of this file would be left out. Choose Import without them to go on.");
    await ctx.db.patch(importId, { status: "importing", error: undefined, beat: Date.now() });
    await ctx.scheduler.runAfter(0, internal.yourDataRun.runImport, { importId });
  },
});

export const importRow = internalQuery({
  args: { importId: v.id("imports") },
  handler: (ctx, { importId }) => ctx.db.get(importId),
});

export const importChecked = internalMutation({
  args: {
    importId: v.id("imports"),
    preview: v.optional(
      v.object({ format: v.number(), version: v.string(), exportedAt: v.string(), counts: v.array(v.object({ kind: v.string(), n: v.number() })), omitted: v.array(v.object({ kind: v.string(), n: v.number() })) }),
    ),
    total: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { importId, preview, total, error }) => {
    const row = await ctx.db.get(importId);
    if (row?.status !== "checking") return;
    if (error) {
      for (const id of [...(row.fileId ? [row.fileId] : []), ...(row.chunks ?? [])]) if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
      await ctx.db.patch(importId, { status: "refused", error, fileId: undefined, chunks: undefined, beat: Date.now() });
    } else await ctx.db.patch(importId, { status: "ready", preview, total: total ?? 0, beat: Date.now() });
  },
});

// The rows an earlier run of this import put in already, a page at a time.
export const putIn = internalQuery({
  args: { importId: v.id("imports"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { importId, cursor }) => {
    const p = await ctx.db.query("importIds").withIndex("by_import", (q) => q.eq("importId", importId)).paginate({ numItems: 2000, cursor });
    return { rows: p.page.map(({ old, id, later }) => ({ old, id, later })), cursor: p.continueCursor, done: p.isDone };
  },
});

async function importing(ctx: QueryCtx, importId: Id<"imports">) {
  const row = await ctx.db.get(importId);
  if (row?.status !== "importing") throw new Error("The import isn't running.");
  return row;
}

// Before the first row goes in: the settings the file brings replace the ones the workspace had.
export const clearSettings = internalMutation({
  args: { importId: v.id("imports"), tables: v.array(v.string()) },
  handler: async (ctx, { importId, tables }) => {
    const row = await importing(ctx, importId);
    for (const table of tables.filter((t) => SETTINGS.includes(t))) {
      for (const r of await inWorkspace(ctx, table, row.workspaceId).collect()) await ctx.db.delete(r._id as Id<TableNames>);
    }
  },
});

// A batch of rows, each with what it was in the file, written together with the row so it never goes in twice.
export const insertRows = internalMutation({
  args: { importId: v.id("imports"), table: v.string(), rows: v.array(v.object({ old: v.string(), doc: v.any(), later: v.array(v.string()) })), step: v.string(), done: v.number() },
  handler: async (ctx, { importId, table, rows, step, done }) => {
    const { workspaceId } = await importing(ctx, importId);
    if (!CARRIED.includes(table)) throw new Error(`${table} isn't carried.`);
    const ids: string[] = [];
    for (const { old, doc, later } of rows) {
      const already = await ctx.db.query("importIds").withIndex("by_import", (q) => q.eq("importId", importId).eq("old", old)).unique();
      if (already) {
        ids.push(already.id);
        continue;
      }
      const id = await ctx.db.insert(table as TableNames, { ...doc, workspaceId } as never);
      await ctx.db.insert("importIds", { workspaceId, importId, old, id, later });
      ids.push(id);
    }
    await ctx.db.patch(importId, { step, done, beat: Date.now() });
    return ids;
  },
});

// A stored file put in: its id in the file and here.
export const fileIn = internalMutation({
  args: { importId: v.id("imports"), old: v.string(), id: v.id("_storage") },
  handler: async (ctx, { importId, old, id }) => {
    const { workspaceId } = await importing(ctx, importId);
    await ctx.db.insert("importIds", { workspaceId, importId, old, id, later: [] });
  },
});

export const patchRows = internalMutation({
  args: { importId: v.id("imports"), table: v.string(), patches: v.array(v.object({ id: v.string(), set: v.any() })) },
  handler: async (ctx, { importId, table, patches }) => {
    const { workspaceId } = await importing(ctx, importId);
    if (!CARRIED.includes(table)) throw new Error(`${table} isn't carried.`);
    for (const { id, set } of patches) {
      const doc = await ctx.db.get(id as Id<TableNames>);
      if (!doc || !("workspaceId" in doc) || doc.workspaceId !== workspaceId) throw new Error(`${table} ${id} isn't in the workspace.`);
      await ctx.db.patch(id as Id<TableNames>, set);
    }
    await ctx.db.patch(importId, { beat: Date.now() });
  },
});

export const importFinished = internalMutation({
  args: {
    importId: v.id("imports"),
    workspace: v.object({
      name: v.string(),
      began: v.number(),
      setupHidden: v.optional(v.boolean()),
      setupSkipped: v.optional(v.array(v.union(v.literal("drive"), v.literal("people")))),
      toursOffered: v.optional(v.array(v.string())),
    }),
    result: v.object({ rows: v.number(), files: v.number(), left: v.number(), omitted: v.array(v.object({ kind: v.string(), n: v.number() })) }),
  },
  handler: async (ctx, { importId, workspace, result }) => {
    const row = await importing(ctx, importId);
    await ctx.db.patch(row.workspaceId, workspace);
    if (row.fileId && (await ctx.db.system.get(row.fileId))) await ctx.storage.delete(row.fileId);
    await ctx.db.patch(importId, { status: "done", result, fileId: undefined, step: undefined, done: row.total, beat: Date.now() });
    await ctx.scheduler.runAfter(0, internal.yourData.forgetIds, { importId });
  },
});

export const importFailed = internalMutation({
  args: { importId: v.id("imports"), error: v.string() },
  handler: async (ctx, { importId, error }) => {
    const row = await ctx.db.get(importId);
    if (row?.status === "importing") await ctx.db.patch(importId, { status: "failed", error, beat: Date.now() });
  },
});

// Once an import is done, its old and new ids go, a page at a time.
export const forgetIds = internalMutation({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    const rows = await ctx.db.query("importIds").withIndex("by_import", (q) => q.eq("importId", importId)).take(500);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === 500) await ctx.scheduler.runAfter(0, internal.yourData.forgetIds, { importId });
  },
});
