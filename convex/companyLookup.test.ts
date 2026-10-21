import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { forgetSuggestions, PAGE_BYTES } from "./companyLookup";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

// Companies you like (Search settings, a direction's Criteria): companies for a typed name and a pasted list, always
// free (their own companies, then Wikidata; never Apollo, a web search, an AI call or Clearbit), and a typed website
// read for free, only from a public https homepage.

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-14T12:00:00Z"));
  forgetSuggestions();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

// Every key is set, so a paid call would be possible if anything made one.
async function setup(companies: { name: string; domain?: string }[] = []) {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("a-key");
  const { u, w } = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    for (const service of ["openrouter", "apollo", "brave"] as const) await ctx.db.insert("apiKeys", { workspaceId: w, service, sealed, last4: "-key", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 100, apolloMode: "onRequest" });
    for (const c of companies) await ctx.db.insert("companies", { workspaceId: w, name: c.name, ...(c.domain ? { domain: c.domain } : {}), found: [{ via: "hand", at: 0 }], at: 0 });
    return { u, w };
  });
  return { t, w: w as Id<"workspaces">, as: t.withIdentity({ subject: `${u}|s` }) };
}

const home = (name: string, line: string) => `<html><head><meta property="og:site_name" content="${name}"><meta name="description" content="${line}"><title>${name}</title></head></html>`;

// Wikidata's organisations by the words searched: each one's id, label and official website (none: not an
// organisation with a website, so the SPARQL filter leaves it out).
type Org = { id: string; label: string; site?: string };
const FREE_HOSTS = ["www.wikidata.org", "query.wikidata.org"];

// The world a lookup sees: Wikidata (or Wikidata down), and homepages by host. Anything else answers 500 and is
// recorded, so a test can assert nothing paid (or Clearbit) was ever asked.
function stub(o: { wikidata?: Record<string, Org[]>; down?: boolean; pages?: Record<string, string | (() => Response)> } = {}) {
  const calls: URL[] = [];
  const f = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === "www.wikidata.org") {
      if (o.down) return new Response("", { status: 503 });
      const words = (url.searchParams.get("search") ?? "").toLowerCase();
      const hits = Object.entries(o.wikidata ?? {}).find(([k]) => k.toLowerCase() === words)?.[1] ?? [];
      return Response.json({ search: hits.map((h) => ({ id: h.id, label: h.label })) });
    }
    if (url.hostname === "query.wikidata.org") {
      if (o.down) return new Response("", { status: 503 });
      const ids = [...(url.searchParams.get("query") ?? "").matchAll(/wd:(Q\d+)/g)].map((m) => m[1]);
      const all = Object.values(o.wikidata ?? {}).flat();
      return Response.json({ results: { bindings: all.filter((h) => ids.includes(h.id) && h.site).map((h) => ({ item: { value: `http://www.wikidata.org/entity/${h.id}` }, site: { value: h.site } })) } });
    }
    const page = o.pages?.[url.hostname];
    if (typeof page === "function") return page();
    if (page) return new Response(page, { headers: { "content-type": "text/html" } });
    return new Response("", { status: url.hostname.endsWith(".com") || url.hostname.endsWith(".example") ? 404 : 500 });
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

// Every outside call went to Wikidata or a company's own homepage (one of `homepages`): never Apollo, OpenRouter,
// Brave or Clearbit.
function onlyFree(calls: URL[], homepages: string[] = []) {
  for (const c of calls) expect([...FREE_HOSTS, ...homepages], c.toString()).toContain(c.hostname);
  expect(calls.some((c) => /apollo|openrouter|brave|clearbit/.test(c.hostname))).toBe(false);
}

const NORTHWIND: Org[] = [
  { id: "Q1", label: "Northwind Logistics", site: "https://www.northwind.example.com/" },
  { id: "Q2", label: "Northwind Health", site: "https://northwindhealth.example.com" },
  { id: "Q3", label: "Northwind (band)" },
  { id: "Q4", label: "Northwind Jobs", site: "https://boards.greenhouse.io/northwind" },
];

test("as a name is typed: their own companies first, then Wikidata's organisations with a website, each website once, all free", async () => {
  const s = await setup([{ name: "Northwind Logistics", domain: "northwind.example.com" }, { name: "Northwind Studio", domain: "northwind.example.net" }, { name: "Northwind Nowhere" }]);
  const calls = stub({ wikidata: { Northw: NORTHWIND } });
  const found = await s.as.action(api.companyLookup.suggest, { q: "  Northw " });
  expect(found).toEqual([
    { name: "Northwind Logistics", domain: "northwind.example.com", yours: true },
    { name: "Northwind Studio", domain: "northwind.example.net", yours: true },
    // Wikidata's Northwind Logistics is the same website, kept once (as theirs); a band has no website, and a job board
    // isn't a company's own site.
    { name: "Northwind Health", domain: "northwindhealth.example.com", yours: false },
  ]);
  onlyFree(calls);
  expect(calls.map((c) => c.hostname)).toEqual(["www.wikidata.org", "query.wikidata.org"]);
  // Only the words typed go out.
  expect(calls[0].searchParams.get("search")).toBe("Northw");
});

test("nothing is looked up under two characters or for a typed website; the same words again are answered from memory", async () => {
  const s = await setup();
  const calls = stub({ wikidata: { Northwind: NORTHWIND } });
  expect(await s.as.action(api.companyLookup.suggest, { q: "N" })).toEqual([]);
  expect(await s.as.action(api.companyLookup.suggest, { q: "northwind.example.com" })).toEqual([]);
  expect(calls).toEqual([]);
  await s.as.action(api.companyLookup.suggest, { q: "Northwind" });
  await s.as.action(api.companyLookup.suggest, { q: "northwind" });
  expect(calls).toHaveLength(2);
});

test("with Wikidata down, their own companies still come up", async () => {
  const s = await setup([{ name: "Kestrel Freight", domain: "kestrelfreight.com" }]);
  const calls = stub({ down: true });
  expect(await s.as.action(api.companyLookup.suggest, { q: "Kestrel" })).toEqual([{ name: "Kestrel Freight", domain: "kestrelfreight.com", yours: true }]);
  onlyFree(calls);
  // Down isn't remembered: the next try asks again.
  stub({ wikidata: { Kestrel: [{ id: "Q9", label: "Kestrel Analytics", site: "https://kestrel-analytics.com" }] } });
  expect((await s.as.action(api.companyLookup.suggest, { q: "Kestrel" })).map((c) => c.domain)).toEqual(["kestrelfreight.com", "kestrel-analytics.com"]);
});

test("a pasted list: a website as it is (named by their companies or its homepage), a name by its exact match, else the best one marked to check", async () => {
  const s = await setup([{ name: "Kestrel Freight", domain: "kestrelfreight.com" }]);
  const calls = stub({
    wikidata: {
      tidewell: [{ id: "Q5", label: "Tidewell Systems", site: "https://tidewell.example.com" }],
      "Meridian Coldchain": [
        { id: "Q6", label: "Meridian Coldchain", site: "https://meridian.example.com" },
        { id: "Q7", label: "Meridian Coldchain Holdings", site: "https://meridianholdings.example.com" },
      ],
    },
    pages: { "harborline.example.com": home("Harborline", "Port logistics.") },
  });
  const lines = ["Kestrel Freight", "tidewell", "https://www.Harborline.example.com/about", "quiet.example", "Meridian Coldchain", "Quillfeather Co", "localhost.internal"];
  expect(await s.as.action(api.companyLookup.resolve, { lines })).toEqual([
    { line: "Kestrel Freight", match: { domain: "kestrelfreight.com", name: "Kestrel Freight" }, check: false },
    { line: "tidewell", match: { domain: "tidewell.example.com", name: "Tidewell Systems" }, check: true },
    { line: "https://www.Harborline.example.com/about", match: { domain: "harborline.example.com", name: "Harborline" }, check: false },
    { line: "quiet.example", match: { domain: "quiet.example", name: null }, check: false },
    { line: "Meridian Coldchain", match: { domain: "meridian.example.com", name: "Meridian Coldchain" }, check: false },
    { line: "Quillfeather Co", match: null, check: false },
    { line: "localhost.internal", match: null, check: false },
  ]);
  onlyFree(calls, ["harborline.example.com", "quiet.example"]);
  // A list longer than a hundred is refused before anything is looked up.
  const before = calls.length;
  await expect(s.as.action(api.companyLookup.resolve, { lines: Array.from({ length: 101 }, (_, i) => `Company ${i}`) })).rejects.toThrow("at most 100");
  expect(calls).toHaveLength(before);
});

test("a typed website is free: its name from its own homepage, with no search", async () => {
  const s = await setup();
  const calls = stub({ pages: { "harborline.com": home("Harborline", "Port logistics.") } });
  expect(await s.as.action(api.companyLookup.website, { website: "https://www.Harborline.com/about" })).toEqual({ domain: "harborline.com", name: "Harborline" });
  onlyFree(calls, ["harborline.com"]);
  expect(calls.map((c) => c.toString())).toEqual(["https://harborline.com/"]);
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
  expect(calls.map((c) => c.hostname)).toEqual(["redirects.com", "toprivate.com"]);
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
