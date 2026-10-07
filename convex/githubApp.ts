import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, httpAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { open, seal } from "./secretBox";

// CareerBot's own GitHub App: read-only access (repository contents and metadata) to the repositories each person
// chooses on GitHub. Separate from signing in with GitHub. The operator creates it once through GitHub's manifest flow:
// `npx convex run githubApp:setupLink` gives a one-time link; that page sends the manifest to GitHub; GitHub comes back
// to /github/app/created, where the app's id, private key, client secret and webhook secret are sealed (secretBox) and
// stored. Access tokens are minted per installation, on the server, for each read, and never stored.

export const API = "https://api.github.com";
const HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "CareerBot" };

export function githubFetch(path: string, init: { token?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return fetch(path.startsWith("http") ? path : `${API}${path}`, {
    method: init.method ?? "GET",
    headers: { ...HEADERS, ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

// Where GitHub sends people back to (this deployment's HTTP routes) and the web app.
export const siteOf = () => {
  const convex = process.env.CONVEX_SITE_URL;
  const web = process.env.SITE_URL;
  if (!convex || !web) throw new Error("CONVEX_SITE_URL and SITE_URL must be set.");
  return { convex: convex.replace(/\/$/, ""), web: web.replace(/\/$/, "") };
};

// What the app asks for: read-only contents and metadata. Installing it, the person picks all repositories or some.
export function manifest() {
  const { convex, web } = siteOf();
  const host = new URL(web).host;
  return {
    name: `CareerBot (${host})`.slice(0, 34),
    url: web,
    description: "Reads the repositories you choose, so CareerBot can add them to your record as projects. Read-only.",
    public: true,
    hook_attributes: { url: `${convex}/github/webhook`, active: true },
    redirect_url: `${convex}/github/app/created`,
    callback_urls: [`${convex}/github/authorized`],
    setup_url: `${convex}/github/setup`,
    setup_on_update: true,
    request_oauth_on_install: false,
    default_permissions: { contents: "read", metadata: "read" },
    default_events: [],
  };
}

// ---- One-time links ----

const LINK_MS = { app: 24 * 60 * 60 * 1000, connect: 30 * 60 * 1000 };

export async function newLink(ctx: MutationCtx, purpose: "app" | "connect", workspaceId?: Id<"workspaces">) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  await ctx.db.insert("githubLinks", { token, purpose, workspaceId, expiresAt: Date.now() + LINK_MS[purpose] });
  return token;
}

export const link = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db.query("githubLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
    return row && row.expiresAt > Date.now() ? row : null;
  },
});

export const dropLink = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db.query("githubLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (row) await ctx.db.delete(row._id);
  },
});

// Operator only (Convex CLI): a link to the page that creates the app. Good for a day, used once.
// `npx convex run githubApp:setupLink` (add '{"org": "name"}' to create it under an organization).
export const setupLink = internalMutation({
  args: { org: v.optional(v.string()) },
  handler: async (ctx, { org }) => {
    const token = await newLink(ctx, "app");
    return `${siteOf().convex}/github/app/new?state=${token}${org ? `&org=${encodeURIComponent(org)}` : ""}`;
  },
});

// ---- The app's credentials ----

export const stored = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("githubApp").order("desc").first(),
});

export const save = internalMutation({
  args: { appId: v.number(), slug: v.string(), clientId: v.string(), owner: v.string(), sealedPem: v.string(), sealedClientSecret: v.string(), sealedWebhookSecret: v.string() },
  handler: async (ctx, app) => {
    for (const old of await ctx.db.query("githubApp").collect()) await ctx.db.delete(old._id);
    await ctx.db.insert("githubApp", { ...app, at: Date.now() });
  },
});

export type GithubApp = { appId: number; slug: string; clientId: string; pem: string; clientSecret: string; webhookSecret: string };

export async function appFor(ctx: Pick<ActionCtx, "runQuery">): Promise<GithubApp | null> {
  const row = await ctx.runQuery(internal.githubApp.stored, {});
  if (!row) return null;
  return { appId: row.appId, slug: row.slug, clientId: row.clientId, pem: await open(row.sealedPem), clientSecret: await open(row.sealedClientSecret), webhookSecret: await open(row.sealedWebhookSecret) };
}

// ---- Signing in as the app ----

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const derLength = (n: number) => {
  if (n < 0x80) return [n];
  const out: number[] = [];
  for (let x = n; x > 0; x >>= 8) out.unshift(x & 0xff);
  return [0x80 | out.length, ...out];
};

// GitHub gives the private key as PKCS#1 ("BEGIN RSA PRIVATE KEY"); Web Crypto reads PKCS#8, so it's wrapped.
export function pkcs8Of(pem: string) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return der;
  const rsa = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const body = [0x02, 0x01, 0x00, ...rsa, 0x04, ...derLength(der.length)];
  const out = new Uint8Array(1 + derLength(body.length + der.length).length + body.length + der.length);
  out.set([0x30, ...derLength(body.length + der.length), ...body]);
  out.set(der, out.length - der.length);
  return out;
}

// A short-lived token that says "this is the app" (RS256, ten minutes at most, a minute early for clock drift).
export async function appJwt(app: Pick<GithubApp, "appId" | "pem">, now = Date.now()) {
  const key = await crypto.subtle.importKey("pkcs8", pkcs8Of(app.pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const iat = Math.floor(now / 1000) - 60;
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat, exp: iat + 540, iss: String(app.appId) })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

// A token for one installation, read-only, for one read. Never stored.
export async function installationToken(app: GithubApp, installationId: number, repositories?: string[]) {
  const res = await githubFetch(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    token: await appJwt(app),
    body: { permissions: { contents: "read", metadata: "read" }, ...(repositories ? { repositories } : {}) },
  });
  if (!res.ok) throw new ConvexError(res.status === 404 ? "GitHub isn’t connected any more. Connect it again in Projects." : res.status === 422 ? "CareerBot can’t see that repository. Choose it on GitHub, then read it again." : "GitHub refused access. Try again.");
  return ((await res.json()) as { token: string }).token;
}

// ---- The manifest flow (operator, once) ----

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#15171A;max-width:32rem;margin:4rem auto;padding:0 1.5rem}button{font:inherit;background:#FFBA08;color:#15171A;border:0;border-radius:2px;padding:.5rem 1rem;cursor:pointer}</style></head><body><h1 style="font-size:1.25rem">${esc(title)}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

// GET /github/app/new?state=…[&org=…]: sends the manifest to GitHub, which shows it for creating the app.
export const newApp = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const row = await ctx.runQuery(internal.githubApp.link, { token: state });
  if (row?.purpose !== "app") return page("This link has expired", "<p>Make a new one with <code>npx convex run githubApp:setupLink</code>.</p>", 404);
  const org = url.searchParams.get("org");
  const action = `https://github.com/${org ? `organizations/${encodeURIComponent(org)}/` : ""}settings/apps/new?state=${encodeURIComponent(state)}`;
  return page(
    "Create CareerBot's GitHub App",
    `<p>GitHub will show the app's settings: read-only access to repository contents and metadata. Create it there, and GitHub brings you back here.</p><form method="post" action="${esc(action)}"><input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest()))}"><button type="submit">Continue to GitHub</button></form>`,
  );
});

// GET /github/app/created?code=…&state=…: GitHub made the app; its credentials are fetched once and sealed.
export const appCreated = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const row = await ctx.runQuery(internal.githubApp.link, { token: state });
  if (row?.purpose !== "app" || !/^[\w-]+$/.test(code)) return page("This link has expired", "<p>Make a new one with <code>npx convex run githubApp:setupLink</code>.</p>", 404);
  await ctx.runMutation(internal.githubApp.dropLink, { token: state });
  const res = await githubFetch(`/app-manifests/${code}/conversions`, { method: "POST" });
  if (!res.ok) return page("GitHub didn't finish creating the app", `<p>GitHub answered ${res.status}. Start again with a new link.</p>`, 502);
  const app = (await res.json()) as { id: number; slug: string; client_id: string; client_secret: string; webhook_secret: string; pem: string; owner?: { login?: string } };
  await ctx.runMutation(internal.githubApp.save, {
    appId: app.id,
    slug: app.slug,
    clientId: app.client_id,
    owner: app.owner?.login ?? "",
    sealedPem: await seal(app.pem),
    sealedClientSecret: await seal(app.client_secret),
    sealedWebhookSecret: await seal(app.webhook_secret),
  });
  const web = siteOf().web;
  return page("CareerBot's GitHub App is ready", `<p>${esc(app.slug)} is created. People connect GitHub from Projects in CareerBot.</p><p><a href="${esc(`${web}/record/projects?github=1`)}">Open Projects</a></p>`);
});
