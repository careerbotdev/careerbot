import JSZip from "jszip";
import { convexTest, type TestConvex, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { isFrozen, pathOf, planNodes, stepFor, type DocFile } from "./drivePaths";
import type { ResumeDoc } from "./resumeDoc";
import schema from "./schema";
import { open } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "99".repeat(32);
  process.env.CONVEX_SITE_URL = "https://calm-fox.convex.site";
  process.env.SITE_URL = "https://dev.example.com";
  process.env.AUTH_GOOGLE_ID = "123456-abc.apps.googleusercontent.com";
  process.env.AUTH_GOOGLE_SECRET = "google-secret";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const k of ["MASTER_KEY_V1", "CONVEX_SITE_URL", "SITE_URL", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) delete process.env[k];
});

const resume = (summary: string): ResumeDoc => ({ summary, experience: [{ roleKey: "acme", employer: "Acme", title: "Head of CS", bullets: [{ text: "Cut churn by 20%.", factIds: [] }] }], skills: [] });

// Google's side: the token endpoint, revoking, and a Drive that keeps what it's given. An uploaded Word document is
// kept as its text (what the Google Doc reads), with its type.
type File = { id: string; name: string; parents: string[]; mimeType: string; text?: string; uploaded?: string; trashed?: boolean };
function fakeGoogle({ account = "a@example.com", scope = `openid email ${DRIVE_SCOPE}` } = {}) {
  const files = new Map<string, File>();
  const calls: { method: string; url: string; auth: string | null; body?: string }[] = [];
  let n = 0;
  let made = 0;
  const idToken = `h.${btoa(JSON.stringify({ email: account })).replace(/=+$/, "")}.s`;
  // The multipart body as parts: each part's type and its bytes.
  const parts = (bytes: Uint8Array) =>
    Array.from(bytes, (b) => String.fromCharCode(b))
      .join("")
      .split(/--careerbot-[0-9a-f-]+/)
      .map((c) => c.replace(/^\r\n/, "").replace(/\r\n$/, ""))
      .filter((c) => c && c !== "--")
      .map((c) => ({ type: c.slice(0, c.indexOf("\r\n\r\n")).replace(/^Content-Type:\s*/i, "").split(";")[0], data: Uint8Array.from(c.slice(c.indexOf("\r\n\r\n") + 4), (ch) => ch.charCodeAt(0)) }));
  const textOf = async (docx: Uint8Array) =>
    (await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string"))
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&");
  const move = (f: File, q: URLSearchParams) => {
    if (q.get("addParents")) f.parents = [...f.parents.filter((p) => !(q.get("removeParents") ?? "").split(",").includes(p)), q.get("addParents")!];
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : undefined;
      const bytes = init?.body instanceof Uint8Array ? init.body : undefined;
      calls.push({ method, url: url.origin + url.pathname, auth: new Headers(init?.headers).get("authorization"), body });
      if (url.href === "https://oauth2.googleapis.com/token") {
        const form = new URLSearchParams(body);
        if (form.get("grant_type") === "authorization_code") return Response.json({ access_token: "at-first", refresh_token: "rt-secret", expires_in: 3600, scope, id_token: idToken });
        return Response.json({ access_token: `at-${++n}`, expires_in: 3600 });
      }
      if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) return new Response(null, { status: 200 });
      const [, api, id] = url.pathname.match(/^\/(upload\/)?drive\/v3\/files(?:\/(.+))?$/) ?? [];
      if (url.pathname.includes("/drive/v3/files")) {
        if (!new Headers(init?.headers).get("authorization")?.startsWith("Bearer at-")) return new Response(null, { status: 401 });
        const upload = api && bytes ? parts(bytes) : null;
        const meta = upload ? JSON.parse(new TextDecoder().decode(upload[0].data)) : JSON.parse(body ?? "{}");
        const file = upload?.[1] ? { uploaded: upload[1].type, text: await textOf(upload[1].data) } : null;
        if (method === "GET") {
          const f = files.get(id);
          return f ? Response.json({ parents: f.parents, trashed: !!f.trashed }) : Response.json({ error: { errors: [{ reason: "notFound" }] } }, { status: 404 });
        }
        if (method === "POST") {
          const f: File = { id: `drive-file-${++made}`, name: meta.name, parents: meta.parents, mimeType: meta.mimeType, ...(file ?? {}) };
          files.set(f.id, f);
          return Response.json({ id: f.id });
        }
        const f = files.get(id);
        if (!f) return Response.json({ error: { errors: [{ reason: "notFound" }] } }, { status: 404 });
        if (meta?.name) f.name = meta.name;
        if (file) Object.assign(f, file);
        move(f, url.searchParams);
        return Response.json({ id: f.id, trashed: !!f.trashed });
      }
      return new Response("not found", { status: 404 });
    }),
  );
  // Where a file sits, by name from the top of their Drive.
  const path = (f: File): string[] => (f.parents[0] === "root" || !files.has(f.parents[0]) ? [f.name] : [...path(files.get(f.parents[0])!), f.name]);
  const byPath = (p: string) => [...files.values()].find((f) => path(f).join("/") === p);
  return { files, calls, path, byPath };
}

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => {
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      out.push({ u, w: await ensureWorkspace(ctx, u) });
    }
    return out;
  });
  const w = a.w;
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("profiles", { workspaceId: w, name: "Ada Lovelace", email: "ada@example.com", links: [] });
    const directionId = await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0, data: { name: "Customer Success" } });
    const older = await ctx.db.insert("resumes", { workspaceId: w, doc: resume("First base."), model: "m", at: 1 });
    const base = await ctx.db.insert("resumes", { workspaceId: w, doc: resume("Second base."), model: "m", at: 2 });
    await ctx.db.insert("resumes", { workspaceId: w, directionId, doc: resume("CS direction."), model: "m", at: 3 });
    const companyId = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", found: [], at: 0 });
    const postingId = await ctx.db.insert("postings", { workspaceId: w, companyId, provider: "lever", externalId: "1", url: "u", title: "Onboarding Manager", remote: false, firstSeen: 0, lastSeen: 0 });
    const tailored = await ctx.db.insert("resumes", { workspaceId: w, directionId, posting: "Onboarding Manager at Beta", postingId, doc: resume("Tailored to Beta."), model: "m", at: 4 });
    const pursuitId = await ctx.db.insert("pursuits", {
      workspaceId: w,
      postingId,
      companyId,
      title: "Onboarding Manager",
      company: "Beta",
      status: "preparing",
      answers: [{ question: "Why Beta?", answer: "The product.", factIds: [], at: 5 }],
      timeline: [{ at: 0, event: "started" }],
      changedAt: 0,
      at: 0,
    });
    await ctx.db.insert("letters", { workspaceId: w, pursuitId, paragraphs: [{ text: "Dear Beta, version one.", factIds: [] }], at: 6 });
    return { directionId, older, base, companyId, postingId, tailored, pursuitId };
  });
  return { t, a, b, ...ids, asA: t.withIdentity({ subject: `${a.u}|s` }), asB: t.withIdentity({ subject: `${b.u}|s` }) };
}

// Connect Drive the way a browser would: Settings' link, Google's consent (the cookie remembers the browser), back.
async function connect(t: TestConvex<typeof schema>, as: TestConvexForDataModel<DataModel>, { cookie: sendCookie = true } = {}) {
  const link = new URL(await as.mutation(api.drive.connect, {}));
  const state = link.searchParams.get("state")!;
  const start = await t.fetch(`/google/drive/connect?state=${state}`);
  const google = new URL(start.headers.get("location")!);
  const cookie = start.headers.get("set-cookie")!.split(";")[0];
  const done = await t.fetch(`/google/drive/callback?code=c0de&state=${google.searchParams.get("state")}`, sendCookie ? { headers: { cookie } } : {});
  return { google, back: done.headers.get("location") };
}
const settle = (t: TestConvex<typeof schema>) => t.finishAllScheduledFunctions(vi.runAllTimers);

test("the folder's layout: the base resume on top, each direction and each tailored role in its own folder", () => {
  const doc = resume("S");
  const input = {
    contact: { name: "Ada", links: [] },
    base: { id: "r1", doc },
    directions: [{ id: "d1", name: "  Customer   Success ", resume: { id: "r2", doc } }],
    tailored: [
      { roleKey: "p1", role: "Onboarding Manager", companyKey: "c1", company: "Beta", frozen: false, resume: { id: "r3", doc }, letter: { id: "l1", text: "Hi.\n\nBye." }, answers: { id: "q1", items: [{ question: "Why?", answer: "Because." }] } },
      { roleKey: "p2", role: "Onboarding Manager", companyKey: "c1", company: "Beta", frozen: true, resume: { id: "r4", doc } },
      { roleKey: "p3", role: "", companyKey: "c2", company: null, frozen: false, letter: { id: "l2", text: "Hello." } },
      { roleKey: "p4", role: "Nothing yet", companyKey: "c3", company: "Gamma", frozen: false },
    ],
  };
  const nodes = planNodes(input);
  const paths = nodes.filter((n) => !n.folder).map((n) => pathOf(nodes, n.key).join("/"));
  expect(paths).toEqual([
    "CareerBot/Base resume",
    "CareerBot/Directions/Customer Success/Resume",
    "CareerBot/Tailored/Beta/Onboarding Manager/Resume",
    "CareerBot/Tailored/Beta/Onboarding Manager/Cover letter",
    "CareerBot/Tailored/Beta/Onboarding Manager/Answers",
    "CareerBot/Tailored/Beta/Onboarding Manager (2)/Resume",
    "CareerBot/Tailored/Other companies/Role/Cover letter",
  ]);
  // A role with nothing to keep gets no folder; every folder comes before what's in it.
  expect(nodes.some((n) => n.name === "Gamma" || n.name === "Nothing yet")).toBe(false);
  const at = new Map(nodes.map((n, i) => [n.key, i]));
  for (const n of nodes) if (n.parent !== "root") expect(at.get(n.parent)!).toBeLessThan(at.get(n.key)!);
  // Renaming a direction keeps its place (same key): its folder is renamed, its Doc left alone.
  const renamed = planNodes({ ...input, directions: [{ ...input.directions[0], name: "Support" }] });
  const folder = renamed.find((n) => n.key === "folder:direction:d1")!;
  const written = { fileId: "f", name: "Customer Success", parentKey: "folder:directions" };
  expect(stepFor(folder, written)).toBe("move");
  const d = renamed.find((n) => n.key === "direction:d1") as DocFile;
  expect(stepFor(d, { fileId: "g", name: d.name, parentKey: d.parent, hash: d.hash })).toBe("skip");
  expect(stepFor(d, { fileId: "g", name: d.name, parentKey: d.parent, hash: "older" })).toBe("update");
  expect(stepFor(d, null)).toBe("create");
});

test("the freeze rule: a tailored file is written as sent once its pursuit reaches Applied or later, then never again", () => {
  expect([null, undefined, "preparing", "contacted", "inConversation", "applied", "interviewing", "offer", "closed"].map(isFrozen)).toEqual([false, false, false, false, false, true, true, true, true]);
  const doc = resume("S");
  const node = (frozen: boolean, summary = "S") =>
    planNodes({ contact: null, base: null, directions: [], tailored: [{ roleKey: "p", role: "R", companyKey: "c", company: "C", frozen, resume: { id: "r", doc: { ...doc, summary } } }] }).find((n) => !n.folder) as DocFile;
  const row = (n: DocFile, frozen?: boolean) => ({ fileId: "f", name: n.name, parentKey: n.parent, hash: n.hash, frozen });
  // Left Preparing with the Doc already reading as sent: only marked frozen. Different: written once.
  expect(stepFor(node(true), row(node(false)))).toBe("mark");
  expect(stepFor(node(true, "As sent"), row(node(false)))).toBe("update");
  // Once frozen, nothing changes it.
  expect(stepFor(node(true, "Changed later"), row(node(true), true))).toBe("skip");
  // Back in Preparing, it's kept in step again.
  expect(stepFor(node(false, "Changed later"), row(node(true), true))).toBe("update");
  expect(stepFor(node(false), row(node(false), true))).toBe("mark");
});

test("connecting keeps the tokens sealed, for the workspace and browser that started it, and only with Drive access", async () => {
  const s = await setup();
  expect(await s.asA.query(api.drive.status, {})).toEqual({ ready: true, picker: null, connected: null });
  const g = fakeGoogle();
  const { google, back } = await connect(s.t, s.asA);
  expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(Object.fromEntries(google.searchParams)).toMatchObject({
    client_id: "123456-abc.apps.googleusercontent.com",
    redirect_uri: "https://calm-fox.convex.site/google/drive/callback",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
  });
  expect(back).toBe("https://dev.example.com/settings?section=drive&drive=connected");
  const conn = (await s.t.run((ctx) => ctx.db.query("driveConnections").collect()))[0];
  expect(conn).toMatchObject({ workspaceId: s.a.w, account: "a@example.com" });
  expect(conn.sealedRefresh).not.toContain("rt-secret");
  expect(await open(conn.sealedRefresh)).toBe("rt-secret");
  expect(await open(conn.sealedAccess!)).toBe("at-first");
  // Nothing a client reads carries a token.
  const status = await s.asA.query(api.drive.status, {});
  expect(status.connected).toMatchObject({ account: "a@example.com", place: "My Drive" });
  expect(JSON.stringify(status)).not.toMatch(/at-first|rt-secret|sealed/);
  expect(await s.asB.query(api.drive.status, {})).toMatchObject({ connected: null });
  // A link used, made up, or finished in another browser does nothing.
  expect((await s.t.fetch("/google/drive/callback?code=c0de&state=guess")).headers.get("location")).toBe("https://dev.example.com/settings?section=drive&drive=failed");
  expect((await connect(s.t, s.asB, { cookie: false })).back).toBe("https://dev.example.com/settings?section=drive&drive=failed");
  expect(await s.asB.query(api.drive.status, {})).toMatchObject({ connected: null });
  // Drive access unticked on Google's screen: nothing kept, and what Google gave is revoked.
  const denied = fakeGoogle({ scope: "openid email" });
  expect((await connect(s.t, s.asB)).back).toBe("https://dev.example.com/settings?section=drive&drive=denied");
  expect(await s.asB.query(api.drive.status, {})).toMatchObject({ connected: null });
  expect(denied.calls.some((c) => c.url === "https://oauth2.googleapis.com/revoke")).toBe(true);
  expect(g.calls.some((c) => c.url === "https://oauth2.googleapis.com/revoke")).toBe(false);
});

test("syncing makes the folder and its Docs, and a kept version updates the same Doc in place", async () => {
  const s = await setup();
  const g = fakeGoogle();
  await connect(s.t, s.asA);
  await settle(s.t);
  const docs = [...g.files.values()].filter((f) => f.mimeType === "application/vnd.google-apps.document").map((f) => g.path(f).join("/"));
  expect(docs.sort()).toEqual([
    "CareerBot/Base resume",
    "CareerBot/Directions/Customer Success/Resume",
    "CareerBot/Tailored/Beta/Onboarding Manager/Answers",
    "CareerBot/Tailored/Beta/Onboarding Manager/Cover letter",
    "CareerBot/Tailored/Beta/Onboarding Manager/Resume",
  ]);
  const base = g.byPath("CareerBot/Base resume")!;
  // Written as the Word document Download Word saves, so the Google Doc reads like the PDF.
  expect(base.uploaded).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  expect(base.text).toContain("Second base.");
  expect(base.text).toContain("Ada Lovelace");
  expect(base.text).toContain("EXPERIENCE");
  expect(g.byPath("CareerBot")!.parents).toEqual(["root"]);
  expect(await s.asA.query(api.drive.fileFor, { id: s.base })).toMatchObject({ url: `https://docs.google.com/document/d/${base.id}/edit`, holdsThis: true, error: null });
  // Nothing changed: a look finds nothing to do and Drive isn't called.
  const before = g.calls.length;
  await s.t.mutation(internal.drive.check, { workspaceId: s.a.w });
  await settle(s.t);
  expect(g.calls.length).toBe(before);

  // Restore the first version: the same Doc takes it, in place.
  const restored = await s.asA.mutation(api.resume.restore, { id: s.older });
  await settle(s.t);
  expect(g.byPath("CareerBot/Base resume")!.id).toBe(base.id);
  expect(g.files.get(base.id)!.text).toContain("First base.");
  expect(g.calls.filter((c) => c.method === "PATCH" && c.url.endsWith(`/upload/drive/v3/files/${base.id}`))).toHaveLength(1);
  const row = await s.t.run((ctx) => ctx.db.query("driveFiles").withIndex("by_workspace_key", (q) => q.eq("workspaceId", s.a.w).eq("key", "base")).unique());
  expect(row).toMatchObject({ fileId: base.id, sourceId: restored });
  // Only what changed was written.
  expect(g.calls.slice(before).filter((c) => c.url.includes("/drive/v3/")).map((c) => c.method)).toEqual(["PATCH"]);

  // A renamed direction renames its folder; the Doc stays where it is.
  await s.t.run((ctx) => ctx.db.patch(s.directionId, { data: { name: "Support" } }));
  await s.t.mutation(internal.drive.check, { workspaceId: s.a.w });
  await settle(s.t);
  expect(g.byPath("CareerBot/Directions/Support/Resume")).toBeDefined();

  // A Doc deleted in Drive is made again; the kept token is refreshed once it runs out.
  g.files.delete(base.id);
  vi.setSystemTime(new Date("2026-09-29T14:00:00Z"));
  await s.asA.mutation(api.drive.syncNow, {});
  await settle(s.t);
  expect(g.byPath("CareerBot/Base resume")!.id).not.toBe(base.id);
  expect(g.calls.filter((c) => c.url === "https://oauth2.googleapis.com/token")).toHaveLength(2);
});

test("a tailored resume, letter and answers stop changing once the pursuit is applied, and follow again back in Preparing", async () => {
  const s = await setup();
  const g = fakeGoogle();
  await connect(s.t, s.asA);
  await settle(s.t);
  const letter = g.byPath("CareerBot/Tailored/Beta/Onboarding Manager/Cover letter")!;
  await s.asA.mutation(api.pursuits.setStatus, { id: s.pursuitId, status: "applied" });
  await settle(s.t);
  expect(await s.asA.query(api.drive.fileFor, { id: s.tailored })).toMatchObject({ frozen: true, holdsThis: true });
  // Changed after it was sent: Drive keeps it as sent.
  await s.t.run(async (ctx) => {
    await ctx.db.insert("letters", { workspaceId: s.a.w, pursuitId: s.pursuitId, paragraphs: [{ text: "Dear Beta, version two.", factIds: [] }], at: 7 });
    await ctx.db.patch(s.tailored, { doc: resume("Tailored again.") });
  });
  const before = g.calls.length;
  await s.t.mutation(internal.drive.check, { workspaceId: s.a.w });
  await s.asA.mutation(api.drive.syncNow, {});
  await settle(s.t);
  // Try again looks at every file, and changes none of these.
  expect(g.calls.slice(before).filter((c) => c.url.includes("/drive/v3/") && c.method !== "GET")).toEqual([]);
  expect(g.files.get(letter.id)!.text).toContain("version one");
  // Back to Preparing: kept in step again, in the same Docs.
  await s.asA.mutation(api.pursuits.setStatus, { id: s.pursuitId, status: "preparing" });
  await settle(s.t);
  expect(g.files.get(letter.id)!.text).toContain("version two");
  expect(g.byPath("CareerBot/Tailored/Beta/Onboarding Manager/Resume")!.text).toContain("Tailored again.");
});

test("answers changed after Apply, before Drive ever synced, reach Drive as they were sent", async () => {
  const s = await setup();
  const g = fakeGoogle();
  await s.asA.mutation(api.pursuits.setStatus, { id: s.pursuitId, status: "applied" });
  await s.asA.mutation(api.pursuits.saveAnswer, { id: s.pursuitId, question: "Why Beta?", answer: "Changed after it was sent.", at: 5 });
  await connect(s.t, s.asA);
  await settle(s.t);
  const answers = g.byPath("CareerBot/Tailored/Beta/Onboarding Manager/Answers")!;
  expect(answers.text).toContain("The product.");
  expect(answers.text).not.toContain("Changed after it was sent.");
});

test("the CareerBot folder moves to the folder they choose and back on Undo, never into itself", async () => {
  const s = await setup();
  const g = fakeGoogle();
  await connect(s.t, s.asA);
  await settle(s.t);
  const root = g.byPath("CareerBot")!;
  // Their own CareerBot folder, or one inside it, can't hold it.
  for (const inside of [root, g.byPath("CareerBot/Tailored")!])
    await expect(s.asA.mutation(api.drive.setFolder, { parentId: inside.id, parentName: inside.name })).rejects.toThrow("Choose a folder outside it");
  expect(root.parents).toEqual(["root"]);
  const before = await s.asA.mutation(api.drive.setFolder, { parentId: "their-job-search", parentName: "Job search" });
  await settle(s.t);
  expect(root.parents).toEqual(["their-job-search"]);
  expect((await s.asA.query(api.drive.status, {})).connected).toMatchObject({ place: "Job search" });
  await s.asA.mutation(api.drive.unsetFolder, before);
  await settle(s.t);
  expect(root.parents).toEqual(["root"]);
  expect((await s.asA.query(api.drive.status, {})).connected).toMatchObject({ place: "My Drive" });
});

test("each workspace syncs only its own; disconnecting revokes, stops syncing and leaves the files", async () => {
  const s = await setup();
  const g = fakeGoogle();
  await connect(s.t, s.asA);
  await connect(s.t, s.asB);
  await settle(s.t);
  const rows = await s.t.run((ctx) => ctx.db.query("driveFiles").collect());
  // B has nothing yet but its own CareerBot folder.
  expect(rows.filter((r) => r.workspaceId === s.b.w).map((r) => r.key)).toEqual(["root"]);
  expect(rows.filter((r) => r.workspaceId === s.a.w).length).toBeGreaterThan(5);
  expect([...g.files.values()].filter((f) => f.name === "CareerBot")).toHaveLength(2);
  // B can't see A's resume in Drive, or anything about it.
  expect(await s.asB.query(api.drive.fileFor, { id: s.base })).toBeNull();
  expect((await s.asB.query(api.drive.status, {})).connected).toMatchObject({ files: 0 });

  const count = g.files.size;
  await s.asA.action(api.drive.disconnect, {});
  const revoke = g.calls.find((c) => c.url === "https://oauth2.googleapis.com/revoke")!;
  expect(new URLSearchParams(revoke.body).get("token")).toBe("rt-secret");
  expect((await s.asA.query(api.drive.status, {})).connected).toBeNull();
  expect(await s.asA.query(api.drive.fileFor, { id: s.base })).toBeNull();
  await s.asA.mutation(api.resume.restore, { id: s.older });
  await settle(s.t);
  expect(g.files.size).toBe(count);
  await expect(s.asA.mutation(api.drive.syncNow, {})).rejects.toThrow("Connect Google Drive first");
  expect((await s.asB.query(api.drive.status, {})).connected).not.toBeNull();
});
