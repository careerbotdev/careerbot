import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, httpAction, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { action, mutation } from "./functions";
import { docxOf } from "./docxFiles";
import { cleanName, type DocContent, type DriveNode, isFrozen, pastedKey, planNodes, ROOT, ROOT_NAME, type Step, stepFor, type TailoredInput } from "./drivePaths";
import { syncSoon } from "./driveSoon";
import { siteOf } from "./githubApp";
import { letterOf, letterText } from "./pursuits";
import { counted } from "./recordContext";
import { postingName, resumeShower } from "./resume";
import type { ResumeDoc } from "./resumeDoc";
import { open, seal } from "./secretBox";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Google Drive: a Google Doc of each resume, cover letter and set of answers, kept in the CareerBot folder of the
// person's own Drive (drivePaths.ts has the layout). Connecting is its own Google consent, separate from signing in
// (the same Google OAuth client, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET), for the drive.file scope only: CareerBot can
// see nothing but the files it makes and the folder they choose. Settings asks for a one-time link (connect), which
// goes through /google/drive/connect (remembering the browser in a cookie) to Google's consent screen; Google comes
// back to /google/drive/callback, where the code is exchanged and the refresh token sealed (secretBox). Tokens never
// reach a client. Choosing a folder uses Google's Picker in the browser with its own short-lived token from Google
// (GOOGLE_PICKER_KEY is the Picker's browser key); only the folder's id comes here.
//
// Syncing is background work (jobs, kind driveSync, no AI and no cost): after a change (driveSoon.syncSoon) and every
// ten minutes, CareerBot works out what the folder should hold and syncs only when something differs. A Doc is updated
// in place, so its link stays and Drive keeps earlier versions in its own history. Disconnecting revokes the tokens and
// stops syncing; the files stay in Drive.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const GDOC = "application/vnd.google-apps.document";
const COOKIE = "cb_drive";
const LINK_MS = 30 * 60 * 1000;
const BROKEN = "Google Drive stopped accepting CareerBot. Connect it again.";

export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const docUrl = (id: string) => `https://docs.google.com/document/d/${id}/edit`;

// The OAuth client signing in already uses; null until it's set.
function googleClient() {
  const id = process.env.AUTH_GOOGLE_ID;
  const secret = process.env.AUTH_GOOGLE_SECRET;
  return id && secret ? { id, secret } : null;
}

// What the browser needs for Google's Picker: the client id, the Picker's browser key and the Cloud project's number
// (the start of the client id). Null until the key is set, so Choose a folder shows only once it works.
function pickerConfig() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const apiKey = process.env.GOOGLE_PICKER_KEY;
  return clientId && apiKey ? { clientId, apiKey, appId: clientId.split("-")[0] } : null;
}

const connectionOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("driveConnections").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
const filesOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">) => ctx.db.query("driveFiles").withIndex("by_workspace_key", (q) => q.eq("workspaceId", workspaceId)).collect();
const rowOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">, key: string) => ctx.db.query("driveFiles").withIndex("by_workspace_key", (q) => q.eq("workspaceId", workspaceId).eq("key", key)).unique();

async function lastSync(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  return jobs.find((j) => j.kind === "driveSync") ?? null;
}
const busy = (job: Doc<"jobs"> | null) => job?.status === "queued" || job?.status === "running";

// ---- What the folder should hold ----

// The Drive key of a resume's place: the base resume, a direction's, or the role a tailored one is for.
export const keyOfResume = (r: Doc<"resumes">) => (r.posting !== undefined ? `resume:${r.postingId ?? pastedKey(r.posting)}` : r.directionId ? `direction:${r.directionId}` : "base");

// Everything the CareerBot folder should hold now, the folder itself first. A tailored resume is the one its pursuit
// uses (the one it chose, else the newest for the role); once the pursuit leaves Preparing, its resume, letter and
// answers are the ones kept as sent (answers from before they were kept: the saved ones). An export's resumes and
// letters are the same (yourData.ts).
export async function planFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, parentId: string | undefined): Promise<DriveNode[]> {
  const shower = await resumeShower(ctx, workspaceId);
  const profile = await ctx.db.query("profiles").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  const contact = profile?.name ? { name: profile.name, email: profile.email, phone: profile.phone, location: profile.location, links: profile.links } : null;
  const base = await shower.current(undefined);
  const directions = [];
  for (const d of await counted(ctx, workspaceId, "direction")) {
    const resume = await shower.current(d._id);
    if (resume) directions.push({ id: String(d._id), name: d.data.name, resume: { id: String(resume.id), doc: resume.doc } });
  }

  const resumes = (await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect()).filter((r) => r.posting !== undefined);
  const newest = new Map<string, Doc<"resumes">>();
  for (const r of resumes) {
    const key = r.postingId ?? pastedKey(r.posting!);
    if (!newest.has(key)) newest.set(key, r);
  }
  // A pursuit with no open role has no tailored resume, letter or answers to sync.
  const pursuits = new Map((await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).flatMap((p) => (p.postingId ? [[String(p.postingId), p] as const] : [])));
  const tailored: TailoredInput[] = [];
  for (const roleKey of [...new Set([...newest.keys(), ...pursuits.keys()])].sort()) {
    const p = pursuits.get(roleKey);
    const frozen = isFrozen(p?.status);
    const chosen = p?.resumeId ? await getInWorkspace(ctx, workspaceId, p.resumeId) : null;
    const r = chosen ?? newest.get(roleKey) ?? null;
    const shown = r ? shower.shown(r) : null;
    const sentResume = frozen && p?.sent?.resume ? { id: String(p.sent.resumeId ?? p._id), doc: p.sent.resume as ResumeDoc } : null;
    const answers = (frozen && p?.sent?.answers) || p?.answers;
    const letter = p ? await letterOf(ctx, p._id) : null;
    const posting = r?.postingId || p ? await getInWorkspace(ctx, workspaceId, p?.postingId ?? r!.postingId!) : null;
    const companyId = posting?.companyId ?? p?.companyId;
    const company = companyId ? ((await getInWorkspace(ctx, workspaceId, companyId))?.name ?? p?.company ?? null) : null;
    const pasted = !posting && !p && r ? await postingName(ctx, workspaceId, r) : null;
    const companyName = company ?? pasted?.company ?? null;
    tailored.push({
      roleKey,
      role: posting?.title ?? p?.title ?? pasted?.title ?? "",
      companyKey: companyId ? String(companyId) : `name-${cleanName(companyName, "other").toLowerCase()}`,
      company: companyName,
      frozen,
      ...(sentResume ? { resume: sentResume } : r && shown ? { resume: { id: String(r._id), doc: shown } } : {}),
      ...(frozen && p?.sent?.letter !== undefined
        ? { letter: { id: String(p.sent.letterId ?? p._id), text: p.sent.letter } }
        : letter
          ? { letter: { id: String(letter._id), text: letterText(letter) } }
          : {}),
      ...(p && answers?.length ? { answers: { id: String(p._id), items: answers.map(({ question, answer }) => ({ question, answer })) } } : {}),
    });
  }
  return [{ key: ROOT, name: ROOT_NAME, parent: parentId ?? "root", folder: true }, ...planNodes({ contact, base: base && { id: String(base.id), doc: base.doc }, directions, tailored })];
}

// What a failure is remembered by: a Doc's content, or a folder's name and place.
const markOf = (n: DriveNode) => (n.folder ? `${n.name}/${n.parent}` : n.hash);

// Whether a place needs a sync: it differs from what was written, and isn't the same content that failed last time.
function needsSync(n: DriveNode, row: Doc<"driveFiles"> | undefined) {
  return stepFor(n, row) !== "skip" && !(row?.error && row.failedHash === markOf(n));
}

// ---- Starting a sync ----

async function startSync(ctx: MutationCtx, workspaceId: Id<"workspaces">, origin: "you" | "automatic", full = false) {
  const last = await lastSync(ctx, workspaceId);
  if (last && busy(last)) return last._id;
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "driveSync", args: { full }, status: "queued", origin });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  return jobId;
}

// A look for changes (driveSoon.syncSoon, and every ten minutes): syncs only when the folder should hold something
// it doesn't.
export const check = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const conn = await connectionOf(ctx, workspaceId);
    if (!conn) return;
    if (conn.checkAt !== undefined && conn.checkAt <= Date.now()) await ctx.db.patch(conn._id, { checkAt: undefined });
    if (conn.broken) return;
    const rows = new Map((await filesOf(ctx, workspaceId)).map((r) => [r.key, r]));
    if ((await planFor(ctx, workspaceId, conn.parentId)).some((n) => needsSync(n, rows.get(n.key)))) await startSync(ctx, workspaceId, "automatic");
  },
});

export const checkAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const conn of await ctx.db.query("driveConnections").collect()) if (!conn.broken) await syncSoon(ctx, conn.workspaceId, 0);
  },
});

// Try again: sync now, failed files included, looking at every file (one deleted in Drive is made again).
export const syncNow = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const conn = await connectionOf(ctx, workspaceId);
    if (!conn) throw new ConvexError("Connect Google Drive first.");
    if (conn.broken) throw new ConvexError(BROKEN);
    return startSync(ctx, workspaceId, "you", true);
  },
});

// ---- Status ----

// Settings: whether Drive can be connected here, the connection (account, where the folder is, how syncing went) and
// what Choose a folder needs.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const ready = googleClient() !== null;
    const conn = await connectionOf(ctx, workspaceId);
    if (!conn) return { ready, picker: null, connected: null };
    const rows = await filesOf(ctx, workspaceId);
    const root = rows.find((r) => r.key === ROOT);
    const docs = rows.filter((r) => r.key !== ROOT && !r.key.startsWith("folder:"));
    const failed = rows.filter((r) => r.error);
    const last = await lastSync(ctx, workspaceId);
    return {
      ready,
      picker: pickerConfig(),
      connected: {
        account: conn.account,
        place: conn.parentName ?? "My Drive",
        chosen: conn.parentId !== undefined,
        folderUrl: root?.fileId ? folderUrl(root.fileId) : null,
        broken: conn.broken ?? null,
        files: docs.filter((r) => r.fileId).length,
        failed: failed.length,
        error: failed[0]?.error ?? (last?.status === "failed" ? (last.error ?? null) : null),
        syncing: busy(last),
        syncedAt: Math.max(0, ...rows.map((r) => r.syncedAt ?? 0)) || null,
        at: conn.at,
      },
    };
  },
});

// One resume's Doc in Drive, for its Export menu and details: the link, when it was last synced, whether it failed,
// whether it's frozen as sent, and whether the Doc holds this resume (a base or direction resume's newer version not
// synced yet, or another resume tailored to the same role, doesn't). Null without a connection.
export const fileFor = query({
  args: { id: v.id("resumes") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const conn = await connectionOf(ctx, workspaceId);
    const r = await getInWorkspace(ctx, workspaceId, id);
    if (!conn || !r) return null;
    const row = await rowOf(ctx, workspaceId, keyOfResume(r));
    return {
      broken: !!conn.broken,
      url: row?.fileId ? docUrl(row.fileId) : null,
      syncedAt: row?.syncedAt ?? null,
      error: row?.error ?? null,
      frozen: !!row?.frozen,
      holdsThis: row?.sourceId === String(id),
      tailored: r.posting !== undefined,
      syncing: busy(await lastSync(ctx, workspaceId)),
    };
  },
});

// ---- Connecting ----

// Start connecting: a one-time link to this deployment's /google/drive/connect. from "today": started from Getting
// started, so Google comes back to its step instead of Settings.
export const connect = mutation({
  args: { from: v.optional(v.literal("today")) },
  handler: async (ctx, { from }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!googleClient()) throw new ConvexError("Google Drive isn’t set up yet.");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.db.insert("driveLinks", { token, workspaceId, expiresAt: Date.now() + LINK_MS, ...(from ? { from } : {}) });
    return `${siteOf().convex}/google/drive/connect?state=${token}`;
  },
});

export const link = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db.query("driveLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
    return row && row.expiresAt > Date.now() ? row : null;
  },
});

export const dropLink = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db.query("driveLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (row) await ctx.db.delete(row._id);
  },
});

// Connected: the sealed tokens replace any earlier connection. Places already in Drive are kept, so the same account
// finds its files again (a file it can't reach is made anew). The first sync starts straight away.
export const saveConnection = internalMutation({
  args: { workspaceId: v.id("workspaces"), account: v.string(), sealedRefresh: v.string(), sealedAccess: v.string(), accessExpiresAt: v.number() },
  handler: async (ctx, { workspaceId, ...conn }) => {
    const old = await connectionOf(ctx, workspaceId);
    if (old) await ctx.db.delete(old._id);
    await ctx.db.insert("driveConnections", { workspaceId, ...conn, ...(old?.parentId ? { parentId: old.parentId, parentName: old.parentName } : {}), at: Date.now() });
    await startSync(ctx, workspaceId, "you");
  },
});

// The folder they chose in Google's Picker for the CareerBot folder to live in. The folder moves there on the next
// sync, straight after. One of CareerBot's own (the CareerBot folder or one inside it) is refused: the folder can't
// go inside itself.
export const setFolder = mutation({
  args: { parentId: v.string(), parentName: v.string() },
  handler: async (ctx, { parentId, parentName }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const conn = await connectionOf(ctx, workspaceId);
    if (!conn) throw new ConvexError("Connect Google Drive first.");
    if (!/^[\w-]{10,200}$/.test(parentId)) throw new ConvexError("That isn’t a Drive folder.");
    if ((await filesOf(ctx, workspaceId)).some((r) => r.fileId === parentId)) throw new ConvexError("That’s your CareerBot folder or one inside it. Choose a folder outside it.");
    const before = { parentId: conn.parentId, parentName: conn.parentName };
    await ctx.db.patch(conn._id, { parentId, parentName: parentName.trim().slice(0, 200) || "Chosen folder" });
    await startSync(ctx, workspaceId, "you");
    return before;
  },
});

// Undo a folder choice: back where it was (the top of their Drive when unset).
export const unsetFolder = mutation({
  args: { parentId: v.optional(v.string()), parentName: v.optional(v.string()) },
  handler: async (ctx, { parentId, parentName }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const conn = await connectionOf(ctx, workspaceId);
    if (!conn) throw new ConvexError("Connect Google Drive first.");
    await ctx.db.patch(conn._id, { parentId, parentName });
    await startSync(ctx, workspaceId, "you");
  },
});

export const mine = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    return { workspaceId, conn: await connectionOf(ctx, workspaceId) };
  },
});

export const forget = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const conn = await connectionOf(ctx, workspaceId);
    if (conn) await ctx.db.delete(conn._id);
  },
});

// Disconnect: Google revokes CareerBot's tokens and syncing stops. The files stay in their Drive.
export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    const { workspaceId, conn } = await ctx.runQuery(internal.drive.mine, {});
    if (!conn) return;
    const token = await open(conn.sealedRefresh);
    await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => null);
    await ctx.runMutation(internal.drive.forget, { workspaceId });
  },
});

// ---- Google's redirects ----

const redirect = (to: string, cookie?: string) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const clearCookie = `${COOKIE}=; Path=/google/drive; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
// Back to where connecting began: Getting started's Google Drive step, or Settings.
const back = (outcome: "connected" | "failed" | "denied", from?: "today") =>
  from === "today" ? `${siteOf().web}/?step=drive&drive=${outcome}` : `${siteOf().web}/settings?section=drive&drive=${outcome}`;
const callbackUrl = () => `${siteOf().convex}/google/drive/callback`;

// GET /google/drive/connect?state=…: remember this browser (the callback must come back to it) and go to Google.
export const connectRedirect = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get("state") ?? "";
  const row = token ? await ctx.runQuery(internal.drive.link, { token }) : null;
  const client = googleClient();
  if (!row || !client) return redirect(back("failed"));
  const to = new URL(AUTH_URL);
  to.searchParams.set("client_id", client.id);
  to.searchParams.set("redirect_uri", callbackUrl());
  to.searchParams.set("response_type", "code");
  to.searchParams.set("scope", `openid email ${SCOPE}`);
  to.searchParams.set("access_type", "offline");
  to.searchParams.set("prompt", "consent");
  to.searchParams.set("state", token);
  return redirect(to.toString(), `${COOKIE}=${token}; Path=/google/drive; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`);
});

// The Google account a consent was given as, from the id token Google just handed over directly.
function accountOf(idToken: string | undefined) {
  try {
    const payload: unknown = JSON.parse(atob((idToken?.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
    return payload && typeof payload === "object" && "email" in payload && typeof payload.email === "string" ? payload.email : "";
  } catch {
    return "";
  }
}

// GET /google/drive/callback?code=…&state=…: keep the connection only for the link's workspace, from the browser that
// started it, and only with Drive access granted.
export const callback = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookie = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const row = token ? await ctx.runQuery(internal.drive.link, { token }) : null;
  const client = googleClient();
  if (!row || !client || cookie !== token) return redirect(back("failed", row?.from), clearCookie);
  await ctx.runMutation(internal.drive.dropLink, { token });
  if (url.searchParams.get("error") === "access_denied") return redirect(back("denied", row.from), clearCookie);
  if (!code) return redirect(back("failed", row.from), clearCookie);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, code, grant_type: "authorization_code", redirect_uri: callbackUrl() }),
  });
  const got = res.ok ? ((await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string }) : null;
  if (!got?.access_token || !got.refresh_token) return redirect(back("failed", row.from), clearCookie);
  // Drive access is a box they can untick on Google's screen; without it there's nothing to keep.
  if (!(got.scope ?? "").split(" ").includes(SCOPE)) {
    await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: got.refresh_token }) }).catch(() => null);
    return redirect(back("denied", row.from), clearCookie);
  }
  await ctx.runMutation(internal.drive.saveConnection, {
    workspaceId: row.workspaceId,
    account: accountOf(got.id_token),
    sealedRefresh: await seal(got.refresh_token),
    sealedAccess: await seal(got.access_token),
    accessExpiresAt: Date.now() + (got.expires_in ?? 3600) * 1000,
  });
  return redirect(back("connected", row.from), clearCookie);
});

// ---- Syncing ----

export const syncInputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const conn = await connectionOf(ctx, workspaceId);
    if (!conn || conn.broken) return null;
    return { conn, nodes: await planFor(ctx, workspaceId, conn.parentId), rows: await filesOf(ctx, workspaceId) };
  },
});

export const saveAccess = internalMutation({
  args: { workspaceId: v.id("workspaces"), sealedAccess: v.string(), accessExpiresAt: v.number() },
  handler: async (ctx, { workspaceId, ...access }) => {
    const conn = await connectionOf(ctx, workspaceId);
    if (conn) await ctx.db.patch(conn._id, access);
  },
});

export const markBroken = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const conn = await connectionOf(ctx, workspaceId);
    if (conn) await ctx.db.patch(conn._id, { broken: BROKEN, sealedAccess: undefined, accessExpiresAt: undefined });
  },
});

const place = { workspaceId: v.id("workspaces"), key: v.string(), name: v.string(), parentKey: v.string() };

// A place written: what's there now, in the same row every time.
export const saveFile = internalMutation({
  args: { ...place, fileId: v.string(), hash: v.optional(v.string()), sourceId: v.optional(v.string()), frozen: v.optional(v.boolean()) },
  handler: async (ctx, { workspaceId, key, ...file }) => {
    const row = await rowOf(ctx, workspaceId, key);
    const next = { ...file, frozen: file.frozen || undefined, syncedAt: Date.now(), error: undefined, failedAt: undefined, failedHash: undefined };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("driveFiles", { workspaceId, key, ...next });
  },
});

// A place that failed: why, and the content that failed. What was there before stays.
export const failFile = internalMutation({
  args: { ...place, error: v.string(), failedHash: v.string() },
  handler: async (ctx, { workspaceId, key, name, parentKey, error, failedHash }) => {
    const row = await rowOf(ctx, workspaceId, key);
    const failed = { error, failedHash, failedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, failed);
    else await ctx.db.insert("driveFiles", { workspaceId, key, name, parentKey, ...failed });
  },
});

class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly gone: boolean,
  ) {
    super(message);
  }
}
class Unauthorized extends Error {}

// A token for Drive: the one kept while it has a minute left, else a new one from the refresh token. Google refusing
// the refresh token (revoked, or access removed in their Google account) breaks the connection until they connect
// again.
async function accessToken(ctx: ActionCtx, conn: Doc<"driveConnections">, fresh = false) {
  if (!fresh && conn.sealedAccess && (conn.accessExpiresAt ?? 0) > Date.now() + 60_000) return open(conn.sealedAccess);
  const client = googleClient();
  if (!client) throw new Error("Google Drive isn’t set up here.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: await open(conn.sealedRefresh), grant_type: "refresh_token" }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (body.error === "invalid_grant") {
    await ctx.runMutation(internal.drive.markBroken, { workspaceId: conn.workspaceId });
    throw new Error(BROKEN);
  }
  if (!res.ok || !body.access_token) throw new Error("Google didn’t answer. Try again.");
  await ctx.runMutation(internal.drive.saveAccess, { workspaceId: conn.workspaceId, sealedAccess: await seal(body.access_token), accessExpiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

// Drive's reasons, in words.
function wordsFor(status: number, reason: string) {
  if (reason === "storageQuotaExceeded") return "Your Google Drive is full.";
  if (status === 429 || /rateLimit/i.test(reason)) return "Google Drive asked CareerBot to slow down. Try again in a minute.";
  if (status === 404 || reason === "appNotAuthorizedToFile") return "CareerBot can’t reach this in your Drive anymore.";
  return "Google Drive didn’t take the change. Try again.";
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function driveCall(token: string, url: string, init: { method?: string; json?: unknown; file?: { meta: unknown; content: DocContent } } = {}) {
  const boundary = `careerbot-${crypto.randomUUID()}`;
  let body: BodyInit | undefined;
  if (init.json !== undefined) body = JSON.stringify(init.json);
  else if (init.file) {
    const enc = new TextEncoder();
    const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(init.file.meta)}\r\n--${boundary}\r\nContent-Type: ${DOCX}\r\n\r\n`);
    const doc = new Uint8Array(await docxOf(init.file.content));
    const tail = enc.encode(`\r\n--${boundary}--`);
    const all = new Uint8Array(head.length + doc.length + tail.length);
    all.set(head);
    all.set(doc, head.length);
    all.set(tail, head.length + doc.length);
    body = all;
  }
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : init.file ? { "Content-Type": `multipart/related; boundary=${boundary}` } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });
  if (res.status === 401) throw new Unauthorized();
  if (res.ok) return (await res.json()) as { id?: string; parents?: string[]; trashed?: boolean };
  const failed = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null;
  const reason = failed?.error?.errors?.[0]?.reason ?? "";
  throw new DriveError(wordsFor(res.status, reason), res.status, res.status === 404 || reason === "appNotAuthorizedToFile");
}

async function create(token: string, node: DriveNode, parentId: string) {
  const meta = { name: node.name, parents: [parentId], mimeType: node.folder ? FOLDER : GDOC };
  const out = node.folder
    ? await driveCall(token, `${FILES}?fields=id&supportsAllDrives=true`, { method: "POST", json: meta })
    : await driveCall(token, `${UPLOAD}?uploadType=multipart&fields=id&supportsAllDrives=true`, { method: "POST", file: { meta, content: node.content } });
  if (!out.id) throw new DriveError("Google Drive didn’t take the change. Try again.", 500, false);
  return out.id;
}

// Write one place: make it, or change the same file in place (content, name, folder). A file that's gone (deleted,
// in the trash, or out of reach from another account) is made anew. Returns its file id and whether it's new.
async function write(token: string, node: DriveNode, step: Step, fileId: string | undefined, moved: boolean, parentId: string) {
  if (step === "create" || !fileId) return { id: await create(token, node, parentId), made: true };
  try {
    const q = new URLSearchParams({ fields: "id,trashed", supportsAllDrives: "true" });
    if (moved) {
      const now = await driveCall(token, `${FILES}/${fileId}?fields=parents,trashed&supportsAllDrives=true`);
      if (now.trashed) return { id: await create(token, node, parentId), made: true };
      q.set("addParents", parentId);
      if (now.parents?.length) q.set("removeParents", now.parents.join(","));
    }
    const out = node.folder
      ? await driveCall(token, `${FILES}/${fileId}?${q}`, { method: "PATCH", json: { name: node.name } })
      : await driveCall(token, `${UPLOAD}/${fileId}?uploadType=multipart&${q}`, { method: "PATCH", file: { meta: { name: node.name }, content: node.content } });
    return out.trashed ? { id: await create(token, node, parentId), made: true } : { id: fileId, made: false };
  } catch (e) {
    if (e instanceof DriveError && e.gone) return { id: await create(token, node, parentId), made: true };
    throw e;
  }
}

// Whether a file is still there for CareerBot: not deleted, not in the trash, still in reach.
async function stillThere(token: string, fileId: string) {
  try {
    return !(await driveCall(token, `${FILES}/${fileId}?fields=trashed&supportsAllDrives=true`)).trashed;
  } catch (e) {
    if (e instanceof DriveError && e.gone) return false;
    throw e;
  }
}

// The sync job: every place that differs from what was written, folders before what's in them. Try again (full)
// also looks at every file still there, so one deleted in Drive is made again. A failure is kept on its place and the
// rest carry on; the connection breaking stops the run.
export async function runDriveSync(ctx: ActionCtx, job: Doc<"jobs">) {
  const input = await ctx.runQuery(internal.drive.syncInputs, { workspaceId: job.workspaceId });
  if (!input) return { written: 0, failed: 0 };
  const full = job.args?.full === true;
  const rows = new Map(input.rows.map((r) => [r.key, r]));
  const ids = new Map(input.rows.flatMap((r) => (r.fileId ? [[r.key, r.fileId] as const] : [])));
  const made = new Set<string>();
  let token: string | null = null;
  // A Drive call with a working token: a refused one is replaced once.
  const call = async <T>(run: (token: string) => Promise<T>) => {
    token ??= await accessToken(ctx, input.conn);
    try {
      return await run(token);
    } catch (e) {
      if (!(e instanceof Unauthorized)) throw e;
      token = await accessToken(ctx, input.conn, true);
      return run(token);
    }
  };
  let written = 0;
  let failed = 0;
  for (const node of input.nodes) {
    const row = rows.get(node.key);
    const base = { workspaceId: job.workspaceId, key: node.key, name: node.name, parentKey: node.parent };
    const doc = node.folder ? {} : { hash: node.hash, sourceId: node.sourceId, frozen: node.frozen };
    try {
      // What's in a folder made anew goes in with it, made anew too.
      let step: Step = made.has(node.parent) ? "create" : stepFor(node, row);
      if (step === "skip" && full && row?.fileId && !(await call((t) => stillThere(t, row.fileId!)))) step = "create";
      if (step === "skip") continue;
      if (step === "mark" && row?.fileId) {
        await ctx.runMutation(internal.drive.saveFile, { ...base, fileId: row.fileId, ...doc });
        continue;
      }
      const parentId = node.key === ROOT ? node.parent : ids.get(node.parent);
      if (!parentId) throw new DriveError("Its folder couldn’t be made. Try again.", 0, false);
      const moved = row?.parentKey !== node.parent || made.has(node.parent);
      const out = await call((t) => write(t, node, step, row?.fileId, moved, parentId));
      ids.set(node.key, out.id);
      if (out.made) made.add(node.key);
      await ctx.runMutation(internal.drive.saveFile, { ...base, fileId: out.id, ...doc });
      written++;
    } catch (e) {
      if (!(e instanceof DriveError)) throw e instanceof Unauthorized ? new Error(BROKEN) : e;
      await ctx.runMutation(internal.drive.failFile, { ...base, error: e.message, failedHash: markOf(node) });
      failed++;
    }
  }
  return { written, failed };
}
