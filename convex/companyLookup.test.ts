import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { PAGE_BYTES } from "./companyLookup";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

// Finding a company by name (Companies you like, a direction's Criteria): the source by the way companies are found,
// and a typed website read for free, only from a public https homepage.

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-14T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function setup({ apollo = false, brave = false }: { apollo?: boolean; brave?: boolean } = {}) {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("a-key");
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    if (apollo) await ctx.db.insert("apiKeys", { workspaceId: w, service: "apollo", sealed, last4: "-key", setAt: 0 });
    if (brave) await ctx.db.insert("apiKeys", { workspaceId: w, service: "brave", sealed, last4: "rave", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "onRequest" });
    return { u, w };
  });
  return { t, w, as: t.withIdentity({ subject: `${u}|s` }) };
}

const home = (name: string, line: string) => `<html><head><meta property="og:site_name" content="${name}"><meta name="description" content="${line}"><title>${name}</title></head></html>`;

// The world a lookup sees: Apollo's organizations, Brave's results, the AI's companies, and homepages by host.
function stub(o: { apollo?: unknown[]; brave?: unknown[]; ai?: unknown[]; pages?: Record<string, string | (() => Response)> }) {
  const calls: { kind: string; url: URL; body?: string }[] = [];
  const f = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "api.apollo.io") {
      if (url.pathname.endsWith("credit_usage_stats")) return Response.json({ credit_usage_stats: { lead_credit: { limit: 2500, consumed: 0, left_over: 2500 } }, current_credit_cycle: {} });
      calls.push({ kind: "apollo", url });
      return Response.json({ organizations: o.apollo ?? [] });
    }
    if (url.hostname === "api.search.brave.com") {
      calls.push({ kind: "brave", url });
      return Response.json({ web: { results: o.brave ?? [] } });
    }
    if (url.hostname === "openrouter.ai") {
      calls.push({ kind: "ai", url, body: String(init?.body ?? "") });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ companies: o.ai ?? [] }) } }], usage: { cost: 0.004 } });
    }
    calls.push({ kind: "page", url });
    const page = o.pages?.[url.hostname];
    if (typeof page === "function") return page();
    return page ? new Response(page, { headers: { "content-type": "text/html" } }) : new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

const paid = (calls: { kind: string }[]) => calls.filter((c) => c.kind !== "page").map((c) => c.kind);

test("with Apollo, Find searches Apollo by name: every company with that name, each with its website and line, remembered with its Apollo id", async () => {
  const s = await setup({ apollo: true });
  const calls = stub({
    apollo: [
      { id: "K1", name: "Kestrel Freight", primary_domain: "kestrelfreight.com" },
      { id: "K2", name: "Kestrel Analytics", website_url: "https://www.kestrel-analytics.com" },
    ],
    pages: { "kestrelfreight.com": home("Kestrel Freight", "Freight brokerage software for regional carriers.") },
  });
  const r = await s.as.action(api.companyLookup.find, { name: "Kestrel" });
  expect(r.source).toBe("apollo");
  // Ambiguous: both come back, for them to pick the one they mean.
  expect(r.companies).toEqual([
    { name: "Kestrel Freight", domain: "kestrelfreight.com", line: "Freight brokerage software for regional carriers." },
    { name: "Kestrel Analytics", domain: "kestrel-analytics.com", line: null },
  ]);
  expect(paid(calls)).toEqual(["apollo"]);
  expect(calls[0].url.searchParams.get("q_organization_name")).toBe("Kestrel");
  const row = await s.t.run((ctx) => ctx.db.query("discovery").first());
  expect(row?.resolved).toEqual([
    { domain: "kestrelfreight.com", apolloId: "K1", name: "Kestrel Freight" },
    { domain: "kestrel-analytics.com", apolloId: "K2", name: "Kestrel Analytics" },
  ]);
});

test("on AI only with a Brave key, Find is one Brave search, job sites and directories left out; nothing from the AI budget", async () => {
  const s = await setup({ brave: true });
  const calls = stub({
    brave: [
      { url: "https://www.kestrelfreight.com/", title: "Kestrel Freight | Freight software", description: "Software for regional carriers." },
      { url: "https://en.wikipedia.org/wiki/Kestrel", title: "Kestrel - Wikipedia", description: "A bird." },
      { url: "https://jobs.lever.co/kestrel", title: "Kestrel - Jobs", description: "Open roles." },
    ],
  });
  const r = await s.as.action(api.companyLookup.find, { name: "Kestrel Freight" });
  expect(r).toEqual({ source: "brave", costUsd: 0, companies: [{ name: "Kestrel Freight", domain: "kestrelfreight.com", line: "Software for regional carriers." }] });
  expect(paid(calls)).toEqual(["brave"]);
});

test("on AI only without Brave, Find is one small web-search call, its cost reported; no result is an empty list", async () => {
  const s = await setup();
  const calls = stub({ ai: [{ name: "Kestrel Freight", website: "https://kestrelfreight.com", line: "Freight software" }] });
  const r = await s.as.action(api.companyLookup.find, { name: "Kestrel" });
  expect(r.source).toBe("ai");
  expect(r.companies).toEqual([{ name: "Kestrel Freight", domain: "kestrelfreight.com", line: "Freight software" }]);
  expect(r.costUsd).toBeGreaterThan(0);
  expect(paid(calls)).toEqual(["ai"]);
  expect(calls[0].body).toContain("Kestrel");

  stub({ ai: [] });
  expect((await s.as.action(api.companyLookup.find, { name: "Quillfeather" })).companies).toEqual([]);
  await expect(s.as.action(api.companyLookup.find, { name: "  " })).rejects.toThrow("name first");
});

test("a typed website is free: its name from its own homepage, with no search", async () => {
  const s = await setup({ apollo: true, brave: true });
  const calls = stub({ pages: { "harborline.com": home("Harborline", "Port logistics.") } });
  expect(await s.as.action(api.companyLookup.website, { website: "https://www.Harborline.com/about" })).toEqual({ domain: "harborline.com", name: "Harborline" });
  expect(paid(calls)).toEqual([]);
  expect(calls.map((c) => c.url.toString())).toEqual(["https://harborline.com/"]);
  // A site that doesn't say its name: the website alone.
  stub({});
  expect(await s.as.action(api.companyLookup.website, { website: "quiet.com" })).toEqual({ domain: "quiet.com", name: null });
});

test("a typed website is only fetched as a public https homepage: no IP addresses, localhost, internal names or redirects to them", async () => {
  const s = await setup();
  const calls = stub({
    pages: {
      "redirects.com": () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
      "toprivate.com": () => new Response(null, { status: 301, headers: { location: "https://db.internal/" } }),
    },
  });
  for (const bad of ["10.0.0.1", "http://127.0.0.1:8080", "localhost", "printer.local", "db.internal", "nas.home.arpa", "Kestrel Freight"])
    await expect(s.as.action(api.companyLookup.website, { website: bad }), bad).rejects.toThrow("website, like acme.com");
  expect(calls).toEqual([]);
  // A public site that redirects somewhere private: the redirect isn't followed, and no name comes back.
  expect(await s.as.action(api.companyLookup.website, { website: "redirects.com" })).toEqual({ domain: "redirects.com", name: null });
  expect(await s.as.action(api.companyLookup.website, { website: "toprivate.com" })).toEqual({ domain: "toprivate.com", name: null });
  expect(calls.map((c) => c.url.hostname)).toEqual(["redirects.com", "toprivate.com"]);
});

test("only the start of a homepage is read", async () => {
  const s = await setup();
  let pulled = 0;
  const big = () =>
    new Response(
      new ReadableStream({
        pull(c) {
          pulled += 64_000;
          c.enqueue(new TextEncoder().encode(pulled === 64_000 ? `${home("Bigsite", "Big.")}${" ".repeat(64_000)}` : " ".repeat(64_000)));
        },
      }),
      { headers: { "content-type": "text/html" } },
    );
  stub({ pages: { "bigsite.com": big } });
  expect(await s.as.action(api.companyLookup.website, { website: "bigsite.com" })).toEqual({ domain: "bigsite.com", name: "Bigsite" });
  expect(pulled).toBeLessThanOrEqual(PAGE_BYTES + 2 * 64_000);
});
