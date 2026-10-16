import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NEEDS_APOLLO, PEOPLE_BY_HAND } from "./findCompanies";
import { seedModelPrices } from "./modelPrices.testing";
import schema from "./schema";
import { seal } from "./secretBox";
import { WEB_CAP } from "./webDiscovery";
import { ensureWorkspace } from "./workspaces";

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

const criteria = { industries: ["logistics"], sizes: [], stages: [], keywords: [] };

async function setup({ apollo = false, brave = true }: { apollo?: boolean; brave?: boolean } = {}) {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("a-key");
  const ids = await t.run(async (ctx) => {
    const u = await ctx.db.insert("users", { email: "a@example.com" });
    const w = await ensureWorkspace(ctx, u);
    await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
    if (apollo) await ctx.db.insert("apiKeys", { workspaceId: w, service: "apollo", sealed, last4: "-key", setAt: 0 });
    if (brave) await ctx.db.insert("apiKeys", { workspaceId: w, service: "brave", sealed, last4: "rave", setAt: 0 });
    await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "onRequest" });
    await ctx.db.insert("aiSettings", { workspaceId: w, task: "companies", model: "test/model" });
    const dir = (name: string, titles: string[]) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", data: { name, criteria: { ...criteria, titles }, criteriaStatus: "approved" }, sources: [], at: 0 });
    const ops = await dir("Ops", ["Operations Manager"]);
    const product = await dir("Product", ["Product Manager", "Group Product Manager"]);
    await ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "companies", label: "Companies", value: "x", rule: { exclude: ["Old Employer"] } }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "limit", status: "approved", data: { kind: "location", label: "Location", value: "US, remote is fine", rule: { countries: ["US"], modes: ["remote", "onsite"] } }, sources: [], at: 0 });
    await ctx.db.insert("companies", { workspaceId: w, name: "Turned Down Co", domain: "turneddown.com", found: [{ via: "hand", at: 0 }], rating: { value: "no", at: 0 }, at: 0 });
    return { u, w, ops, product };
  });
  return { t, ...ids, as: t.withIdentity({ subject: `${ids.u}|s` }) };
}

type Company = { name: string; website: string; sourceUrl?: string };
const co = (name: string, domain: string): Company => ({ name, website: `https://www.${domain}/`, sourceUrl: `https://news.example.com/${domain}` });
const reply = (companies: unknown[]) => Response.json({ choices: [{ message: { content: `Here they are:\n\`\`\`json\n${JSON.stringify({ companies })}\n\`\`\`` } }], usage: { cost: 0.02 } });

// The world the searches see: the web search's answers (by the kind asked and the direction), Brave's (or its
// refusal), the boards' pages, and Apollo's.
function stub(o: { relevant?: (dir: string) => Company[]; hiring?: (dir: string) => Company[]; brave?: (q: string) => Response; boards?: Record<string, string>; apollo?: () => unknown }) {
  const calls: { kind: string; url: URL; body?: Record<string, unknown> }[] = [];
  const f = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "openrouter.ai") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { content: string }[] };
      const user = body.messages[body.messages.length - 1].content;
      const dir = user.match(/^Direction: (.+)$/m)?.[1] ?? "";
      if (body.model === "perplexity/sonar-pro") {
        const relevant = user.includes("whether or not they are hiring today");
        calls.push({ kind: relevant ? "relevant" : "hiring", url, body });
        return reply((relevant ? o.relevant : o.hiring)?.(dir) ?? []);
      }
      calls.push({ kind: "openrouter", url, body });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ companies: [] }) } }], usage: { cost: 0.001 } });
    }
    if (url.hostname === "api.search.brave.com") {
      // Job-board searches for finding companies, apart from enrichment's search for one company's board.
      calls.push({ kind: url.searchParams.get("q")?.includes("site:") ? "brave" : "braveBoard", url });
      return o.brave?.(url.searchParams.get("q") ?? "") ?? Response.json({ web: { results: [] } });
    }
    if (url.hostname === "api.apollo.io") {
      if (url.pathname.endsWith("credit_usage_stats")) return Response.json({ credit_usage_stats: { lead_credit: { limit: 2500, consumed: 0, left_over: 2500 } }, current_credit_cycle: {} });
      calls.push({ kind: "apollo", url });
      return Response.json(o.apollo?.() ?? { organizations: [] });
    }
    const page = o.boards?.[`${url.hostname}${url.pathname}`];
    return page ? new Response(page, { headers: { "content-type": "text/html" } }) : new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

async function find(s: Awaited<ReturnType<typeof setup>>) {
  await s.as.mutation(api.discovery.start, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const job = (await s.t.run((ctx) => ctx.db.query("jobs").collect())).find((j) => j.kind === "discover")!;
  const companies = await s.t.run((ctx) => ctx.db.query("companies").collect());
  return { job, companies, byDomain: (d: string) => companies.filter((c) => c.domain === d) };
}

test("without an Apollo key, companies are found with AI only: capped, one row per website, never past employers or turned-down companies", async () => {
  const s = await setup();
  const many = Array.from({ length: 20 }, (_, i) => co(`Relevant ${i}`, `relevant${i}.com`));
  const calls = stub({
    relevant: (dir) => (dir === "Ops" ? [...many, co("Old Employer", "oldemployer.com"), co("Turned Down Co", "turneddown.com")] : [co("Relevant 0", "relevant0.com")]),
    hiring: (dir) => (dir === "Ops" ? [co("Relevant 1", "relevant1.com"), co("Acme", "acme.com"), { name: "Lever Board", website: "https://jobs.lever.co/somebody" }] : []),
    brave: () => Response.json({ web: { results: [{ url: "https://job-boards.greenhouse.io/acme/jobs/1", title: "Job Application for Operations Manager at Acme" }, { url: "https://jobs.lever.co/beacon/2", title: "Beacon - Operations Manager" }] } }),
    boards: { "job-boards.greenhouse.io/acme": `<a href="https://www.acme.com">Acme</a>`, "jobs.lever.co/beacon": `<a href="https://beaconhq.io/about">Beacon</a> <a href="https://www.linkedin.com/company/beacon">in</a>` },
  });
  const { job, companies, byDomain } = await find(s);
  expect(job.status).toBe("done");
  expect(job.result.finding).toBe("web");
  expect(calls.some((c) => c.kind === "apollo")).toBe(false);

  // Up to the cap that fit each direction; Old Employer (a past employer) and Turned Down Co never come back.
  expect(job.result.web.report[0]).toEqual({ direction: "Ops", relevant: { found: WEB_CAP, added: WEB_CAP }, hiringNow: { found: 3, added: 2, fromJobBoards: 2 } });
  expect(byDomain("oldemployer.com")).toHaveLength(0);
  expect(byDomain("turneddown.com")[0].found).toHaveLength(1);
  // A job board's own address isn't a company's website.
  expect(companies.some((c) => c.name === "Lever Board")).toBe(false);

  // One row per website, found every way it was found, with where it was seen.
  const acme = byDomain("acme.com");
  expect(acme).toHaveLength(1);
  // Each direction finds it once (the first source to name it), so one row with a `found` for each direction.
  expect(acme[0].found.map((f) => [f.directionId, f.via, f.source, f.evidence])).toEqual([
    [s.ops, "hiringNow", "jobBoards", "https://job-boards.greenhouse.io/acme/jobs/1"],
    [s.product, "hiringNow", "jobBoards", "https://job-boards.greenhouse.io/acme/jobs/1"],
  ]);
  expect(byDomain("beaconhq.io")[0]).toMatchObject({ name: "Beacon", websiteUrl: "https://beaconhq.io" });
  const r1 = byDomain("relevant1.com");
  expect(r1).toHaveLength(1);
  expect(r1[0].found.map((f) => f.via)).toEqual(["relevant", "hiringNow"]);
  expect(byDomain("relevant0.com")[0].found.map((f) => f.directionId)).toEqual([s.ops, s.product]);
  // No company facts from the web: name and website only.
  expect(Object.keys(r1[0]).filter((k) => ["foundedYear", "linkedinUrl", "apolloId"].includes(k))).toEqual([]);

  // The list says how each was found and where it was seen.
  const listed = (await s.as.query(api.discovery.list, {})).companies.find((c) => c.domain === "acme.com")!;
  expect(listed.found).toEqual(["Ops (hiring now, job boards)", "Product (hiring now, job boards)"]);
  expect(listed.evidence).toEqual(["https://job-boards.greenhouse.io/acme/jobs/1"]);
  const relevant1 = (await s.as.query(api.discovery.list, {})).companies.find((c) => c.domain === "relevant1.com")!;
  expect(relevant1.found).toEqual(["Ops (fits, web search)", "Ops (hiring now, web search)"]);
  // Its row, before it's filled in, says how without the direction.
  expect(listed.ways).toEqual(["hiring now, job boards"]);
  expect(relevant1.ways).toEqual(["fits, web search", "hiring now, web search"]);
  // Find companies counts the job-board searches each direction takes: one per title, up to two.
  expect((await s.as.query(api.discovery.list, {})).searchable.map((d) => d.boardQueries)).toEqual([1, 2]);

  // Job boards searched for each direction's first titles, where they can work, only boards CareerBot reads.
  const queries = calls.filter((c) => c.kind === "brave").map((c) => c.url.searchParams.get("q")!);
  expect(queries).toHaveLength(3);
  expect(queries[0]).toContain(`"Operations Manager" remote United States (site:job-boards.greenhouse.io`);
  expect(queries[0]).not.toContain("smartrecruiters");

  // Metered as their own purposes, on the web search's model.
  const usage = await s.t.run((ctx) => ctx.db.query("usage").collect());
  expect(usage.filter((u) => u.model === "perplexity/sonar-pro").map((u) => u.purpose).sort()).toEqual(["companies hiring now", "companies hiring now", "relevant companies", "relevant companies"]);
  // Find companies' estimate a direction, from what the web search has cost so far.
  const costs = await s.as.query(api.estimates.costs, {});
  expect([costs.findRelevant, costs.findHiringNow].every((n) => typeof n === "number")).toBe(true);
  expect(job.result.web.boardQueries).toBe(3);
});

test("when Brave refuses, the search goes on with the web search alone and says so", async () => {
  const s = await setup();
  const calls = stub({
    relevant: () => [co("Fits Co", "fits.com")],
    hiring: (dir) => (dir === "Ops" ? [co("Hiring Co", "hiring.com")] : [co("Product Co", "productco.com")]),
    brave: () => new Response("", { status: 429 }),
  });
  const { job, byDomain } = await find(s);
  expect(job.status).toBe("done");
  // Refused on the first query: none for the second title, nor for the next direction.
  expect(calls.filter((c) => c.kind === "brave")).toHaveLength(1);
  expect(byDomain("hiring.com")[0].found[0]).toMatchObject({ via: "hiringNow", source: "aiSearch" });
  expect(byDomain("productco.com")).toHaveLength(1);
  expect(job.result.web.notes).toEqual(["Job boards weren’t searched: your Brave Search key reached its limit. Hiring now comes from web search alone."]);
  const activity = (await s.as.query(api.activity.list, {})).find((a) => a.kind === "discover")!;
  expect(activity.detail).toContain("reached its limit");
});

test("job sites and staffing agencies the web search finds are set aside by the usual screen", async () => {
  const s = await setup({ brave: false });
  stub({ relevant: () => [co("Rivertown Staffing", "rivertownstaffing.com"), co("Fernhill Foods", "fernhill.io"), co("Hireline Jobs", "hireline.example")] });
  const { companies } = await find(s);
  const screened = Object.fromEntries(companies.map((c) => [c.name, c.screened?.employer ?? true]));
  expect(screened).toMatchObject({ "Rivertown Staffing": false, "Hireline Jobs": false, "Fernhill Foods": true });
});

test("the way companies are found is theirs to choose: Apollo alone stays as it was, Apollo + AI adds to Apollo's companies by website", async () => {
  // No Apollo key: AI only, and the Apollo ways can't be chosen.
  const none = await setup();
  await expect(none.as.mutation(api.findCompanies.set, { finding: "apolloWeb" })).rejects.toThrow(NEEDS_APOLLO);
  expect(await none.as.query(api.findCompanies.settings, {})).toEqual({ choice: null, finding: "web", apolloKey: false, braveKey: true });

  // A key and no choice: Apollo alone, with no web search.
  const s = await setup({ apollo: true });
  const apollo = () => ({ organizations: [{ id: "G1", name: "Fernhill Foods", primary_domain: "fernhill.io" }] });
  let calls = stub({ relevant: () => [co("Fernhill Foods Inc", "fernhill.io"), co("Missed Co", "missed.com")], apollo });
  let r = await find(s);
  expect(r.job.result.finding).toBe("apollo");
  expect(calls.filter((c) => c.kind === "relevant" || c.kind === "hiring" || c.kind === "brave")).toEqual([]);
  expect(r.byDomain("missed.com")).toHaveLength(0);

  // Apollo + AI: Apollo first, then the web search adds what it missed, and finds Apollo's company again on its row.
  await s.as.mutation(api.findCompanies.set, { finding: "apolloWeb" });
  await s.t.run(async (ctx) => {
    for (const j of await ctx.db.query("jobs").collect()) await ctx.db.delete(j._id);
  });
  calls = stub({ relevant: () => [co("Fernhill Foods Inc", "fernhill.io"), co("Missed Co", "missed.com")], apollo });
  r = await find(s);
  expect(r.job.result.finding).toBe("apolloWeb");
  expect(calls.some((c) => c.kind === "apollo") && calls.some((c) => c.kind === "relevant")).toBe(true);
  expect(r.byDomain("fernhill.io")).toHaveLength(1);
  expect(r.byDomain("fernhill.io")[0]).toMatchObject({ name: "Fernhill Foods", apolloId: "G1" });
  expect(r.byDomain("fernhill.io")[0].found.map((f) => f.via)).toContain("relevant");
  expect(r.byDomain("missed.com")).toHaveLength(1);
  expect(r.job.result.report.length).toBe(2);
  expect(r.job.result.web.report.map((x: { relevant: { added: number } }) => x.relevant.added)).toEqual([1, 0]);

  // AI only, even with a key: no Apollo call at all.
  await s.as.mutation(api.findCompanies.set, { finding: "web" });
  await s.t.run(async (ctx) => {
    for (const j of await ctx.db.query("jobs").collect()) await ctx.db.delete(j._id);
  });
  calls = stub({ relevant: () => [co("Another Co", "another.com")], apollo });
  r = await find(s);
  expect(r.job.result.finding).toBe("web");
  expect(calls.some((c) => c.kind === "apollo")).toBe(false);
  expect(r.byDomain("another.com")).toHaveLength(1);
});

test("with AI only, people at a company are added by hand: no people search", async () => {
  const s = await setup({ apollo: true });
  await s.as.mutation(api.findCompanies.set, { finding: "web" });
  const pursuitId: Id<"pursuits"> = await s.t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { workspaceId: s.w, name: "Beta", domain: "beta.com", apolloId: "org-1", found: [], at: 0 });
    const postingId = await ctx.db.insert("postings", { workspaceId: s.w, companyId, provider: "lever", externalId: "1", url: "u", title: "Ops Lead", remote: false, firstSeen: 0, lastSeen: 0 });
    return ctx.db.insert("pursuits", { workspaceId: s.w, postingId, companyId, title: "Ops Lead", company: "Beta", status: "preparing", timeline: [{ at: 0, event: "started" }], changedAt: 0, at: 0 });
  });
  const calls = stub({});
  await expect(s.as.action(api.people.find, { pursuitId })).rejects.toThrow(PEOPLE_BY_HAND);
  expect(calls.some((c) => c.kind === "apollo")).toBe(false);
});

test("a company is never saved under its website: named ones take their name from their own site, results without a name are left out", async () => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.insert("companies", { workspaceId: s.w, name: "Already Inc", domain: "already.com", found: [{ via: "hand", at: 0 }], at: 0 }));
  await s.as.mutation(api.discovery.setNamed, { named: ["nvidia.com", "https://www.toasttab.com", "nameless.example", "already.com"] });
  stub({
    relevant: (dir) => (dir === "Ops" ? [{ name: "acme.com", website: "https://acme.com" }, { name: "https://beta.io", website: "https://beta.io" }, co("Gamma Co", "gamma.io")] : []),
    brave: () => Response.json({ web: { results: [{ url: "https://jobs.ashbyhq.com/zeta/123", title: "Senior Operations Manager" }] } }),
    boards: {
      "nvidia.com/": `<html><head><meta property="og:site_name" content="NVIDIA"><title>World Leader in AI Computing</title></head></html>`,
      "toasttab.com/": `<html><head><title>Restaurant POS and Management System | Toast</title></head></html>`,
      "nameless.example/": `<html><head><title>Welcome</title></head></html>`,
      "jobs.ashbyhq.com/zeta": `<a href="https://zeta.com">Zeta</a>`,
    },
  });
  const { job, companies } = await find(s);
  expect(job.status).toBe("done");
  // Every row has a real name, never a website or an address.
  expect(companies.filter((c) => c.domain && (c.name.toLowerCase() === c.domain || c.name.includes("/")))).toEqual([]);
  const name = (d: string) => companies.filter((c) => c.domain === d).map((c) => c.name);
  expect(name("nvidia.com")).toEqual(["NVIDIA"]);
  expect(name("toasttab.com")).toEqual(["Toast"]);
  expect(name("already.com")).toEqual(["Already Inc"]);
  expect(name("nameless.example")).toEqual([]);
  expect(job.result.named).toEqual({ found: 3, added: 2, missing: ["nameless.example"] });
  // The web search's results: only the one with a name; the board whose title doesn't name its company is left out.
  expect(name("gamma.io")).toEqual(["Gamma Co"]);
  expect(name("acme.com")).toEqual([]);
  expect(name("beta.io")).toEqual([]);
  expect(name("zeta.com")).toEqual([]);
  expect(job.result.web.notes).toContain("2 companies from job boards were left out: no name or website to be found.");
});
