import { convexTest, type TestConvex, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { appJwt } from "./githubApp";
import schema from "./schema";
import { open, seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "55".repeat(32);
  process.env.CONVEX_SITE_URL = "https://calm-fox.convex.site";
  process.env.SITE_URL = "https://dev.example.com";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
  delete process.env.CONVEX_SITE_URL;
  delete process.env.SITE_URL;
});

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const pem = (label: string, der: Uint8Array) => `-----BEGIN ${label}-----\n${b64(der).match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;

// An RSA key like the one GitHub gives an app (PKCS#1), and its public half to check signatures with.
async function rsaKey() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  // PKCS#8 for RSA is a fixed 26-byte header around the PKCS#1 key.
  return { pkcs1: pem("RSA PRIVATE KEY", pkcs8.slice(26)), pkcs8: pem("PRIVATE KEY", pkcs8), publicKey: pair.publicKey };
}

async function verifies(jwt: string, publicKey: CryptoKey) {
  const [h, p, s] = jwt.split(".");
  const bytes = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, bytes(s), new TextEncoder().encode(`${h}.${p}`));
  return { ok, payload: JSON.parse(new TextDecoder().decode(bytes(p))) as { iat: number; exp: number; iss: string } };
}

async function setup(withApp = true) {
  const t = convexTest(schema, modules);
  const key = await rsaKey();
  const [a, b] = await t.run(async (ctx) => {
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      out.push({ u, w: await ensureWorkspace(ctx, u) });
    }
    return out;
  });
  if (withApp)
    await t.mutation(internal.githubApp.save, {
      appId: 42,
      slug: "careerbot-dev",
      clientId: "Iv1.abc",
      owner: "owner",
      sealedPem: await seal(key.pkcs1),
      sealedClientSecret: await seal("client-secret"),
      sealedWebhookSecret: await seal("hook-secret"),
    });
  return { t, key, a, b, asA: t.withIdentity({ subject: `${a.u}|s` }), asB: t.withIdentity({ subject: `${b.u}|s` }) };
}

// GitHub's side of connecting: the person's token exchange, the installations they can see, the installation itself.
function fakeGithub(theirs: number[], calls: { url: string; method: string; auth: string | null }[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const auth = new Headers(init?.headers).get("authorization");
      calls.push({ url: url.origin + url.pathname, method: init?.method ?? "GET", auth });
      if (url.href === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "ghu_person" });
      if (url.pathname === "/user/installations") return Response.json({ installations: theirs.map((id) => ({ id })) });
      if (url.pathname === "/applications/Iv1.abc/token") return new Response(null, { status: 204 });
      const inst = url.pathname.match(/^\/app\/installations\/(\d+)$/);
      if (inst && (init?.method ?? "GET") === "GET")
        return Response.json({ id: Number(inst[1]), account: { login: "octo" }, repository_selection: "selected", html_url: `https://github.com/settings/installations/${inst[1]}` });
      if (inst && init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response("not found", { status: 404 });
    }),
  );
  return calls;
}

// Connect GitHub the way a browser would: Projects' link, GitHub's install page, back to setup, then authorization.
async function connect(t: TestConvex<typeof schema>, as: TestConvexForDataModel<DataModel>, installationId: number) {
  const link = new URL(await as.mutation(api.github.connect, {}));
  const state = link.searchParams.get("state")!;
  const start = await t.fetch(`/github/connect?state=${state}`);
  expect(start.status).toBe(302);
  expect(start.headers.get("location")).toBe(`https://github.com/apps/careerbot-dev/installations/new?state=${state}`);
  const cookie = start.headers.get("set-cookie")!.split(";")[0];
  // GitHub doesn't always hand the state back after installing; the cookie carries it.
  const setupRes = await t.fetch(`/github/setup?installation_id=${installationId}&setup_action=install`, { headers: { cookie } });
  const authorize = new URL(setupRes.headers.get("location")!);
  expect(authorize.origin + authorize.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(authorize.searchParams.get("client_id")).toBe("Iv1.abc");
  expect(authorize.searchParams.get("redirect_uri")).toBe("https://calm-fox.convex.site/github/authorized");
  const done = await t.fetch(`/github/authorized?code=c0de&state=${authorize.searchParams.get("state")}`);
  return done.headers.get("location");
}

test("the operator creates the app once through GitHub's manifest flow; its secrets are stored sealed", async () => {
  const { t, key } = await setup(false);
  const link = new URL(await t.mutation(internal.githubApp.setupLink, {}));
  expect(link.origin + link.pathname).toBe("https://calm-fox.convex.site/github/app/new");
  expect((await t.fetch("/github/app/new?state=guess")).status).toBe(404);
  const page = await (await t.fetch(link.pathname + link.search)).text();
  const manifest = JSON.parse(page.match(/name="manifest" value="([^"]+)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  expect(manifest).toMatchObject({
    default_permissions: { contents: "read", metadata: "read" },
    redirect_url: "https://calm-fox.convex.site/github/app/created",
    setup_url: "https://calm-fox.convex.site/github/setup",
    callback_urls: ["https://calm-fox.convex.site/github/authorized"],
    hook_attributes: { url: "https://calm-fox.convex.site/github/webhook" },
    url: "https://dev.example.com",
  });
  expect(page).toContain(`https://github.com/settings/apps/new?state=${link.searchParams.get("state")}`);
  const conversions = vi.fn(async () => Response.json({ id: 42, slug: "careerbot-dev", client_id: "Iv1.abc", client_secret: "cs-1", webhook_secret: "wh-1", pem: key.pkcs1, owner: { login: "owner" } }));
  vi.stubGlobal("fetch", conversions);
  const created = await t.fetch(`/github/app/created?code=abc123&state=${link.searchParams.get("state")}`);
  expect(created.status).toBe(200);
  expect((conversions.mock.calls[0] as unknown as [string])[0]).toBe("https://api.github.com/app-manifests/abc123/conversions");
  const row = (await t.query(internal.githubApp.stored, {}))!;
  expect(row).toMatchObject({ appId: 42, slug: "careerbot-dev", clientId: "Iv1.abc" });
  expect(row.sealedPem).not.toContain("PRIVATE KEY");
  expect(await open(row.sealedPem)).toBe(key.pkcs1);
  expect(await open(row.sealedWebhookSecret)).toBe("wh-1");
  // The link works once.
  expect((await t.fetch(`/github/app/created?code=abc123&state=${link.searchParams.get("state")}`)).status).toBe(404);
});

test("the app signs in with a short-lived RS256 token from GitHub's PKCS#1 key or a PKCS#8 one", async () => {
  const key = await rsaKey();
  for (const p of [key.pkcs1, key.pkcs8]) {
    const { ok, payload } = await verifies(await appJwt({ appId: 42, pem: p }, 1_700_000_000_000), key.publicKey);
    expect(ok).toBe(true);
    expect(payload).toEqual({ iat: 1_700_000_000 - 60, exp: 1_700_000_000 - 60 + 540, iss: "42" });
  }
});

test("connecting keeps an installation only for the workspace that started it, and only when GitHub says it's theirs", async () => {
  const { t, key, asA, asB } = await setup();
  expect(await asA.query(api.github.status, {})).toEqual({ ready: true, connected: null });
  const calls = fakeGithub([77]);
  expect(await connect(t, asA, 77)).toBe("https://dev.example.com/record/projects?github=connected");
  expect((await asA.query(api.github.status, {})).connected).toMatchObject({ account: "octo", selection: "selected", settingsUrl: "https://github.com/settings/installations/77" });
  expect((await asB.query(api.github.status, {})).connected).toBeNull();
  // The installation was checked as the app, and the person's own token was revoked straight after.
  const appCall = calls.find((c) => c.url === "https://api.github.com/app/installations/77")!;
  expect((await verifies(appCall.auth!.replace("Bearer ", ""), key.publicKey)).ok).toBe(true);
  expect(calls.some((c) => c.url === "https://api.github.com/applications/Iv1.abc/token" && c.method === "DELETE")).toBe(true);
  // Someone else can't claim installation 77 by sending its id: GitHub doesn't list it for them.
  fakeGithub([99]);
  expect(await connect(t, asB, 77)).toBe("https://dev.example.com/record/projects?github=failed");
  expect((await asB.query(api.github.status, {})).connected).toBeNull();
  // A made-up or used link does nothing.
  expect((await t.fetch("/github/authorized?code=c0de&state=guess")).headers.get("location")).toBe("https://dev.example.com/record/projects?github=failed");
});

test("GitHub's webhook is trusted only when signed; an uninstall there disconnects here", async () => {
  const { t, asA } = await setup();
  fakeGithub([77]);
  await connect(t, asA, 77);
  const body = JSON.stringify({ action: "deleted", installation: { id: 77 } });
  const sign = async (secret: string) => {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return `sha256=${Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body))), (x) => x.toString(16).padStart(2, "0")).join("")}`;
  };
  const send = async (signature: string) => (await t.fetch("/github/webhook", { method: "POST", body, headers: { "x-github-event": "installation", "x-hub-signature-256": signature } })).status;
  expect(await send(await sign("not-the-secret"))).toBe(401);
  expect((await asA.query(api.github.status, {})).connected).not.toBeNull();
  expect(await send(await sign("hook-secret"))).toBe(204);
  expect((await asA.query(api.github.status, {})).connected).toBeNull();
});

test("disconnecting forgets only this workspace's connection and never uninstalls the app", async () => {
  const { t, a, b, asA, asB } = await setup();
  const calls = fakeGithub([77]);
  // Two workspaces share one installation.
  for (const w of [a.w, b.w]) await t.mutation(internal.github.saveInstall, { workspaceId: w, installationId: 77, account: "octo", selection: "all", settingsUrl: "https://github.com/settings/installations/77" });
  await asA.mutation(api.github.disconnect, {});
  expect((await asA.query(api.github.status, {})).connected).toBeNull();
  expect((await asB.query(api.github.status, {})).connected).not.toBeNull();
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  await expect(asA.action(api.github.repos, {})).rejects.toThrow("Connect GitHub first");
});
