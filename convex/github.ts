import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalMutation, internalQuery, query } from "./_generated/server";
import { action, mutation } from "./functions";
import { appFor, appJwt, githubFetch, installationToken, newLink, siteOf } from "./githubApp";
import { requireWorkspace } from "./workspaces";

// A workspace's GitHub connection: CareerBot's GitHub App installed on their account, on all their repositories or the
// ones they chose on GitHub. Connecting: Projects asks for a one-time link (connect), which sends them to GitHub to
// install the app; GitHub comes back to /github/setup with the installation, and CareerBot then asks GitHub who they
// are (/github/authorized) and keeps the installation only if it's theirs, so nobody can claim someone else's. The
// person's own GitHub token is used for that check alone and revoked straight after. Disconnecting forgets the
// connection for this workspace only; uninstalling the app is done in GitHub's settings, and GitHub's webhook then
// disconnects every workspace that used it.

const COOKIE = "cb_github";

export const status = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const app = await ctx.db.query("githubApp").first();
    const install = await ctx.db.query("githubInstalls").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first();
    return {
      ready: !!app,
      connected: install ? { account: install.account, selection: install.selection, settingsUrl: install.settingsUrl, at: install.at } : null,
    };
  },
});

// Start connecting: a one-time link to this deployment's /github/connect.
export const connect = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!(await ctx.db.query("githubApp").first())) throw new Error("GitHub isn't set up yet.");
    return `${siteOf().convex}/github/connect?state=${await newLink(ctx, "connect", workspaceId)}`;
  },
});

export const installFor = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => ctx.db.query("githubInstalls").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first(),
});

export const mine = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    return { workspaceId, install: await ctx.db.query("githubInstalls").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first() };
  },
});

export const claim = internalMutation({
  args: { token: v.string(), installationId: v.number() },
  handler: async (ctx, { token, installationId }) => {
    const row = await ctx.db.query("githubLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (row) await ctx.db.patch(row._id, { installationId });
  },
});

export const saveInstall = internalMutation({
  args: { workspaceId: v.id("workspaces"), installationId: v.number(), account: v.string(), selection: v.union(v.literal("all"), v.literal("selected")), settingsUrl: v.string() },
  handler: async (ctx, { workspaceId, ...install }) => {
    for (const old of await ctx.db.query("githubInstalls").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) await ctx.db.delete(old._id);
    await ctx.db.insert("githubInstalls", { workspaceId, ...install, at: Date.now() });
  },
});

// The installation is gone (uninstalled on GitHub): every workspace connected through it is disconnected.
export const forget = internalMutation({
  args: { installationId: v.number() },
  handler: async (ctx, { installationId }) => {
    for (const row of await ctx.db.query("githubInstalls").withIndex("by_installation", (q) => q.eq("installationId", installationId)).collect()) await ctx.db.delete(row._id);
  },
});

export const setSelection = internalMutation({
  args: { installationId: v.number(), selection: v.union(v.literal("all"), v.literal("selected")) },
  handler: async (ctx, { installationId, selection }) => {
    for (const row of await ctx.db.query("githubInstalls").withIndex("by_installation", (q) => q.eq("installationId", installationId)).collect()) await ctx.db.patch(row._id, { selection });
  },
});

export type Repo = { fullName: string; name: string; description: string | null; private: boolean; url: string; pushedAt: string | null; fork: boolean; archived: boolean };

// The repositories they gave CareerBot, most recently pushed first.
export const repos = action({
  args: {},
  handler: async (ctx): Promise<Repo[]> => {
    const { install } = await ctx.runQuery(internal.github.mine, {});
    const app = await appFor(ctx);
    if (!install || !app) throw new ConvexError("Connect GitHub first.");
    const token = await installationToken(app, install.installationId);
    const out: Repo[] = [];
    for (let pageNo = 1; pageNo <= 10; pageNo++) {
      const res = await githubFetch(`/installation/repositories?per_page=100&page=${pageNo}`, { token });
      if (!res.ok) throw new ConvexError("GitHub didn’t list your repositories. Try again.");
      const body = (await res.json()) as { total_count: number; repositories: { full_name: string; name: string; description: string | null; private: boolean; html_url: string; pushed_at: string | null; fork: boolean; archived: boolean }[] };
      out.push(...body.repositories.map((r) => ({ fullName: r.full_name, name: r.name, description: r.description, private: r.private, url: r.html_url, pushedAt: r.pushed_at, fork: r.fork, archived: r.archived })));
      if (out.length >= body.total_count || body.repositories.length < 100) break;
    }
    return out.sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
  },
});

// Disconnect: forget this workspace's connection. The installation stays on GitHub (another workspace may use it);
// uninstalling is done in GitHub's settings. Projects already in the record stay.
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    for (const row of await ctx.db.query("githubInstalls").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) await ctx.db.delete(row._id);
  },
});

// ---- GitHub's redirects ----

const tokenOf = (req: Request, url: URL) =>
  url.searchParams.get("state") || (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || "";
const redirect = (to: string, cookie?: string) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const clearCookie = `${COOKIE}=; Path=/github; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
const back = (outcome: "connected" | "failed" | "requested") => `${siteOf().web}/record/projects?github=${outcome}`;

// GET /github/connect?state=…: remember the link in a cookie (GitHub doesn't always hand it back) and go install.
export const connectRedirect = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get("state") ?? "";
  const row = await ctx.runQuery(internal.githubApp.link, { token });
  const app = await ctx.runQuery(internal.githubApp.stored, {});
  if (row?.purpose !== "connect" || !app) return redirect(back("failed"));
  return redirect(`https://github.com/apps/${app.slug}/installations/new?state=${token}`, `${COOKIE}=${token}; Path=/github; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`);
});

// GET /github/setup?installation_id=…&setup_action=…: GitHub is back from installing (or from a change to which
// repositories it has). The installation is held on the link until GitHub confirms who they are.
export const setup = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const token = tokenOf(req, url);
  const row = token ? await ctx.runQuery(internal.githubApp.link, { token }) : null;
  if (url.searchParams.get("setup_action") === "request") return redirect(back("requested"), clearCookie);
  const installationId = Number(url.searchParams.get("installation_id"));
  // Changed on GitHub without starting here: repositories are read live, so there's nothing to keep; back to the GitHub pane.
  if (row?.purpose !== "connect" || !Number.isSafeInteger(installationId) || installationId <= 0) return redirect(`${siteOf().web}/record/projects?github=1`, clearCookie);
  const app = await appFor(ctx);
  if (!app) return redirect(back("failed"), clearCookie);
  await ctx.runMutation(internal.github.claim, { token, installationId });
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", app.clientId);
  authorize.searchParams.set("state", token);
  authorize.searchParams.set("redirect_uri", `${siteOf().convex}/github/authorized`);
  return redirect(authorize.toString());
});

// GET /github/authorized?code=…&state=…: keep the installation only if the person who came back can see it on GitHub.
export const authorized = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const row = await ctx.runQuery(internal.githubApp.link, { token });
  const app = await appFor(ctx);
  if (row?.purpose !== "connect" || !row.workspaceId || !row.installationId || !code || !app) return redirect(back("failed"), clearCookie);
  await ctx.runMutation(internal.githubApp.dropLink, { token });
  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "CareerBot" },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: `${siteOf().convex}/github/authorized` }),
  });
  const userToken = exchange.ok ? ((await exchange.json()) as { access_token?: string }).access_token : undefined;
  if (!userToken) return redirect(back("failed"), clearCookie);
  let theirs = false;
  for (let pageNo = 1; pageNo <= 10 && !theirs; pageNo++) {
    const res = await githubFetch(`/user/installations?per_page=100&page=${pageNo}`, { token: userToken });
    if (!res.ok) break;
    const body = (await res.json()) as { installations: { id: number }[] };
    theirs = body.installations.some((i) => i.id === row.installationId);
    if (body.installations.length < 100) break;
  }
  // Their token was only for this check.
  await fetch(`https://api.github.com/applications/${app.clientId}/token`, {
    method: "DELETE",
    headers: { Accept: "application/vnd.github+json", Authorization: `Basic ${btoa(`${app.clientId}:${app.clientSecret}`)}`, "Content-Type": "application/json", "User-Agent": "CareerBot" },
    body: JSON.stringify({ access_token: userToken }),
  }).catch(() => null);
  if (!theirs) return redirect(back("failed"), clearCookie);
  const res = await githubFetch(`/app/installations/${row.installationId}`, { token: await appJwt(app) });
  if (!res.ok) return redirect(back("failed"), clearCookie);
  const inst = (await res.json()) as { account?: { login?: string }; repository_selection?: string; html_url?: string };
  await ctx.runMutation(internal.github.saveInstall, {
    workspaceId: row.workspaceId as Id<"workspaces">,
    installationId: row.installationId,
    account: inst.account?.login ?? "",
    selection: inst.repository_selection === "all" ? "all" : "selected",
    settingsUrl: inst.html_url ?? `https://github.com/settings/installations/${row.installationId}`,
  });
  return redirect(back("connected"), clearCookie);
});

// POST /github/webhook: GitHub tells the app about installations. Signed with the app's webhook secret.
export const webhook = httpAction(async (ctx, req) => {
  const app = await appFor(ctx);
  const body = await req.text();
  if (!app || !(await signedBy(app.webhookSecret, body, req.headers.get("x-hub-signature-256") ?? ""))) return new Response("Bad signature", { status: 401 });
  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(body) as { action?: string; installation?: { id?: number; repository_selection?: string } };
  const id = payload.installation?.id;
  if (typeof id === "number") {
    if (event === "installation" && payload.action === "deleted") await ctx.runMutation(internal.github.forget, { installationId: id });
    if (event === "installation_repositories" && payload.installation?.repository_selection)
      await ctx.runMutation(internal.github.setSelection, { installationId: id, selection: payload.installation.repository_selection === "all" ? "all" : "selected" });
  }
  return new Response(null, { status: 204 });
});

export async function signedBy(secret: string, body: string, header: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const want = `sha256=${Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (header.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}
