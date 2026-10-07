import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { seedModelPrices } from "./modelPrices.testing";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "66".repeat(32);
  process.env.CONVEX_SITE_URL = "https://calm-fox.convex.site";
  process.env.SITE_URL = "https://dev.example.com";
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
  delete process.env.CONVEX_SITE_URL;
  delete process.env.SITE_URL;
});

const REPO: Record<string, string> = {
  "README.md": "# Trail\nTrail maps for hikers.",
  "docs/PRD.md": "Offline maps; share routes.",
  ".env": "OPENAI_TOKEN=sk-live-secret",
  "src/lib/apiKey.ts": "export const k = 'sk-live-other';".padEnd(2000, " "),
  "src/app/map.ts": "export function draw() {}".padEnd(2000, " "),
};

async function setup() {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("sk-or-test");
  const key = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
  await t.mutation(internal.githubApp.save, { appId: 42, slug: "careerbot-dev", clientId: "Iv1.abc", owner: "owner", sealedPem: await seal(pem), sealedClientSecret: await seal("cs"), sealedWebhookSecret: await seal("wh") });
  const [a, b] = await t.run(async (ctx) => {
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      await ctx.db.insert("apiKeys", { workspaceId: w, service: "openrouter", sealed, last4: "test", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: 0, apolloMode: "paused" });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "projects", model: "test/model" });
      out.push({ u, w });
    }
    await ctx.db.insert("githubInstalls", { workspaceId: out[0].w, installationId: 77, account: "octo", selection: "selected", settingsUrl: "https://github.com/settings/installations/77", at: 0 });
    await ctx.db.insert("items", { workspaceId: out[0].w, kind: "role", status: "approved", roleKey: "acme", data: { employer: "Acme", title: "Head of CS", start: "2021-01" }, sources: [], at: 0 });
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  // GitHub (the one repository, a token for it) and OpenRouter (the model's reply); every model call is kept.
  const sent: { system: string; user: string }[] = [];
  const tokens: unknown[] = [];
  const stub = (reply: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const p = url.pathname;
        if (url.host === "openrouter.ai") {
          const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
          sent.push({ system: body.messages[0].content, user: body.messages[1].content });
          const r = typeof reply === "function" ? (reply as (system: string) => unknown)(body.messages[0].content) : reply;
          return Response.json({ choices: [{ message: { content: JSON.stringify(r) } }], usage: { cost: 0.002 } });
        }
        if (p === "/app/installations/77/access_tokens") {
          tokens.push(JSON.parse(String(init?.body)));
          return Response.json({ token: "ghs_read" });
        }
        if (p === "/repos/octo/trail") return Response.json({ full_name: "octo/trail", name: "trail", html_url: "https://github.com/octo/trail", private: false, fork: false, description: "Trail maps", default_branch: "main" });
        if (p === "/repos/octo/trail/languages") return Response.json({ TypeScript: 10 });
        if (p === "/repos/octo/trail/git/trees/main") return Response.json({ tree: Object.entries(REPO).map(([path, text]) => ({ path, type: "blob", size: text.length })), truncated: false });
        if (p === "/repos/octo/trail/commits")
          return Response.json([
            { commit: { author: { name: "Octo", date: "2026-08-10T00:00:00Z" }, message: "Share routes" }, author: { login: "octo" } },
            { commit: { author: { name: "Octo", date: "2025-03-02T00:00:00Z" }, message: "First commit" }, author: { login: "octo" } },
          ]);
        const file = p.match(/^\/repos\/octo\/trail\/contents\/(.+)$/);
        if (file && REPO[decodeURIComponent(file[1])] !== undefined) return new Response(REPO[decodeURIComponent(file[1])]);
        return new Response("not found", { status: 404 });
      }),
    );
  const reply = {
    summary: "Trail maps for hikers, offline.",
    stack: ["TypeScript"],
    facts: [
      { text: "Built Trail, offline trail maps for hikers.", files: ["README.md", "src/app/map.ts"] },
      { text: "Wrote the product plan for offline maps and route sharing.", files: ["docs/PRD.md"] },
      { text: "Grew it to 10,000 users.", files: ["metrics.md"] },
    ],
  };
  const read = async (repos = ["octo/trail"]) => {
    const n = await asA.mutation(api.projects.read, { repos });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return n;
  };
  const record = (w = a.w) => t.query(internal.resume.inputs, { workspaceId: w });
  return { t, asA, asB, a, b, stub, reply, read, record, sent, tokens };
}

test("reading a repository proposes a project and facts citing its files, from a token for that repository only", async () => {
  const { asA, stub, reply, read, sent, tokens } = await setup();
  stub(reply);
  // Only their own account's repositories.
  expect(await read(["octo/trail", "someone/else", "not-a-repo"])).toBe(1);
  expect(tokens).toEqual([{ permissions: { contents: "read", metadata: "read" }, repositories: ["trail"] }]);
  const items = await asA.query(api.extract.items, {});
  const project = items.find((i) => i.kind === "project");
  expect(project).toMatchObject({
    status: "proposed",
    projectKey: "github:octo/trail",
    data: { name: "trail", repo: "octo/trail", url: "https://github.com/octo/trail", start: "2025-03", end: "2026-08", commits: 2, languages: ["TypeScript"], summary: "Trail maps for hikers, offline.", stack: ["TypeScript"] },
  });
  const facts = items.filter((i) => i.kind === "fact");
  expect(facts.map((f) => [f.status, f.projectKey, f.roleKey ?? null, f.data.files, f.data.evidenceMissing ?? false])).toEqual([
    ["proposed", "github:octo/trail", null, ["README.md", "src/app/map.ts"], false],
    ["proposed", "github:octo/trail", null, ["docs/PRD.md"], false],
    // A file that wasn't read backs nothing: flagged for a look.
    ["proposed", "github:octo/trail", null, [], true],
  ]);
  // Secret-looking files never reach the model.
  expect(sent).toHaveLength(1);
  expect(sent[0].user).not.toContain("sk-live");
  expect(sent[0].user).toContain("--- README.md (readme) ---");
  expect(await asA.query(api.projects.runs, {})).toEqual({ runs: { "octo/trail": { status: "done", error: null } }, inRecord: ["octo/trail"] });
});

test("credentials inside files that are read never reach the model; the rest of the text does, unchanged", async () => {
  // Built from parts so no scanner mistakes the fixtures for real credentials.
  const githubToken = "ghp" + "_" + "R4nd0mT0k3nV4lu3".repeat(3).slice(0, 36);
  const keyBody = "MIIEowIBAAKCAQEA" + "q8Zx3Lm9".repeat(8);
  const readme = REPO["README.md"];
  REPO["README.md"] = `${readme}\n\nDeploy with \`GH_TOKEN=${githubToken} pnpm deploy\`.`;
  REPO["docs/deploy.md"] = `# Deploy\nThe signing key:\n\n-----BEGIN RSA ${"PRIVATE"} KEY-----\n${keyBody}\n${keyBody}\n-----END RSA ${"PRIVATE"} KEY-----\n\nThen run the deploy script.`;
  try {
    const { stub, reply, read, sent } = await setup();
    stub(reply);
    await read();
    const user = sent[0].user;
    expect(user).not.toContain(githubToken);
    expect(user).not.toContain(keyBody);
    expect(user).not.toContain("PRIVATE KEY");
    expect(user).toContain("Deploy with `GH_TOKEN=[redacted] pnpm deploy`.");
    expect(user).toContain("The signing key:\n\n[redacted]\n\nThen run the deploy script.");
    expect(user).toContain(`--- README.md (readme) ---\n${readme}\n`);
    expect(user).toContain("--- docs/PRD.md (planning) ---\nOffline maps; share routes.");
  } finally {
    REPO["README.md"] = readme;
    delete REPO["docs/deploy.md"];
  }
});

test("reading it again proposes only what's new and keeps what they wrote", async () => {
  const { asA, stub, reply, read } = await setup();
  stub(reply);
  await read();
  const project = (await asA.query(api.extract.items, {})).find((i) => i.kind === "project")!;
  await asA.mutation(api.projects.edit, { id: project.id, name: "Trail", summary: "Offline trail maps." });
  stub({ ...reply, summary: "Something else", facts: [...reply.facts, { text: "Added route sharing.", files: ["docs/PRD.md"] }] });
  await read();
  const items = await asA.query(api.extract.items, {});
  expect(items.filter((i) => i.kind === "project").map((p) => [p.status, p.data.name, p.data.summary])).toEqual([["approved", "Trail", "Offline trail maps."]]);
  expect(items.filter((i) => i.kind === "fact").map((f) => f.data.text)).toEqual([...reply.facts.map((f) => f.text), "Added route sharing."]);
});

test("a project's facts reach the approved record only once the fact and the project are both approved", async () => {
  const { asA, stub, reply, read, record } = await setup();
  stub(reply);
  await read();
  const items = await asA.query(api.extract.items, {});
  const project = items.find((i) => i.kind === "project")!;
  const [built, planned] = items.filter((i) => i.kind === "fact");
  expect((await record()).record).toMatchObject({ projects: [], facts: [] });
  await asA.mutation(api.extract.review, { id: built.id, status: "approved" });
  expect((await record()).record.facts).toEqual([]);
  await asA.mutation(api.extract.review, { id: project.id, status: "approved" });
  await asA.mutation(api.projects.link, { id: project.id, roleKey: "acme" });
  const { projects, facts } = (await record()).record;
  expect(projects).toMatchObject([{ projectKey: "github:octo/trail", name: "trail", url: "https://github.com/octo/trail", start: "2025-03", end: "2026-08", roleKey: "acme" }]);
  expect(facts.map((f) => [f.text, f.projectKey])).toEqual([[built.data.text, "github:octo/trail"]]);
  // Rejected and unreviewed facts stay out.
  await asA.mutation(api.extract.review, { id: planned.id, status: "rejected", note: "Too thin" });
  expect((await record()).record.facts).toHaveLength(1);
  await expect(asA.mutation(api.projects.link, { id: project.id, roleKey: "ghost" })).rejects.toThrow("isn't in your record");
});

test("projects belong to one workspace", async () => {
  const { b, asA, asB, stub, reply, read, record } = await setup();
  stub(reply);
  await read();
  const project = (await asA.query(api.extract.items, {})).find((i) => i.kind === "project")!;
  await asA.mutation(api.extract.review, { id: project.id, status: "approved" });
  await expect(asB.mutation(api.projects.edit, { id: project.id, name: "Mine" })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.projects.link, { id: project.id, roleKey: null })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.extract.review, { id: project.id, status: "rejected" })).rejects.toThrow("Not found");
  await expect(asB.mutation(api.projects.read, { repos: ["octo/trail"] })).rejects.toThrow("Connect GitHub first");
  expect(await asB.query(api.extract.items, {})).toEqual([]);
  expect(await asB.query(api.projects.runs, {})).toEqual({ runs: {}, inRecord: [] });
  expect((await record(b.w)).record.projects).toEqual([]);
});

test("a repository read in parts ends with one set of at most 6 facts, the first saying what it is, citing only files it read", async () => {
  const docs = Array.from({ length: 5 }, (_, n) => `docs/plan-${n}.md`);
  for (const d of docs) REPO[d] = `# ${d}\n`.padEnd(39_000, "x");
  try {
    const { asA, stub, read, sent } = await setup();
    const partFacts = (n: number) => Array.from({ length: 5 }, (_, k) => ({ text: `Part ${n} detail ${k}.`, files: ["docs/PRD.md"] }));
    let part = 0;
    stub((system: string) =>
      system.startsWith("You get the facts proposed")
        ? {
            facts: [
              { text: "Built Trail, offline trail maps for hikers.", files: ["README.md", "docs/plan-0.md"] },
              { text: "Planned and shipped route sharing.", files: ["docs/PRD.md", "secrets/not-read.md"] },
              ...Array.from({ length: 6 }, (_, k) => ({ text: `Extra ${k}.`, files: ["docs/PRD.md"] })),
            ],
          }
        : { summary: "Trail", stack: [], facts: partFacts(part++) },
    );
    await read();
    // Two part reads, then the final pass.
    expect(sent.filter((m) => m.system.startsWith("You get the facts proposed"))).toHaveLength(1);
    expect(sent.length).toBeGreaterThan(2);
    const facts = (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact");
    expect(facts.length).toBeLessThanOrEqual(6);
    expect(facts[0].data.text).toBe("Built Trail, offline trail maps for hikers.");
    expect(facts.some((f) => f.data.text.startsWith("Part "))).toBe(false);
    expect(facts[1].data.files).toEqual(["docs/PRD.md"]);
  } finally {
    for (const d of docs) delete REPO[d];
  }
});

test("rejecting a project sets aside its unreviewed facts and stops its approved ones counting; restoring brings back only what was set aside", async () => {
  const { asA, stub, reply, read, record } = await setup();
  stub(reply);
  await read();
  const items = await asA.query(api.extract.items, {});
  const project = items.find((i) => i.kind === "project")!;
  const [built, planned, grew] = items.filter((i) => i.kind === "fact");
  await asA.mutation(api.extract.review, { id: project.id, status: "approved" });
  await asA.mutation(api.extract.review, { id: built.id, status: "approved" });
  await asA.mutation(api.extract.review, { id: grew.id, status: "rejected", note: "No users yet" });
  await asA.mutation(api.sources.reject, { source: { projectId: project.id } });
  const statuses = async () => (await asA.query(api.extract.items, {})).filter((i) => i.kind !== "role").map((i) => [i.kind, i.status, i.kind === "fact" ? i.data.text : ""]);
  expect(await statuses()).toEqual([
    ["project", "rejected", ""],
    ["fact", "approved", built.data.text],
    ["fact", "rejected", grew.data.text],
  ]);
  expect((await record()).record).toMatchObject({ projects: [], facts: [] });
  expect((await asA.query(api.sources.list, {})).projects).toMatchObject({ "github:octo/trail": { setAside: 1 } });
  await expect(asA.mutation(api.sources.readAgain, { source: { projectId: project.id }, includingRejected: false })).rejects.toThrow("Restore it");
  await asA.mutation(api.sources.restore, { source: { projectId: project.id } });
  expect(await statuses()).toEqual([
    ["project", "proposed", ""],
    ["fact", "approved", built.data.text],
    ["fact", "proposed", planned.data.text],
    ["fact", "rejected", grew.data.text],
  ]);
  await asA.mutation(api.extract.review, { id: project.id, status: "approved" });
  expect((await record()).record.facts.map((f) => f.text)).toEqual([built.data.text]);
});

test("Read again on a project repeats nothing and respects its rejections, unless that run includes them", async () => {
  const { t, asA, asB, stub, reply, read, sent } = await setup();
  stub(reply);
  await read();
  const items = await asA.query(api.extract.items, {});
  const project = items.find((i) => i.kind === "project")!;
  const grew = items.filter((i) => i.kind === "fact").find((f) => f.data.text === "Grew it to 10,000 users.")!;
  await asA.mutation(api.extract.review, { id: grew.id, status: "rejected", note: "No users yet" });
  await expect(asB.mutation(api.sources.readAgain, { source: { projectId: project.id }, includingRejected: true })).rejects.toThrow("Not found");
  const again = async (includingRejected: boolean) => {
    await asA.mutation(api.sources.readAgain, { source: { projectId: project.id }, includingRejected });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  const facts = async () => (await asA.query(api.extract.items, {})).filter((i) => i.kind === "fact").map((f) => [f.data.text, f.status]);
  await again(false);
  expect(sent[sent.length - 1].user).toContain("No users yet");
  expect(await facts()).toEqual(reply.facts.map((f) => [f.text, f.text === grew.data.text ? "rejected" : "proposed"]));
  await again(true);
  expect(sent[sent.length - 1].user).not.toContain("No users yet");
  expect(await facts()).toEqual([...reply.facts.map((f) => [f.text, f.text === grew.data.text ? "rejected" : "proposed"]), [grew.data.text, "proposed"]]);
});

test("a proposed insight citing only a rejected project's facts is set aside with the project and restored with it", async () => {
  const { t, a, asA, asB, stub, reply, read } = await setup();
  stub(reply);
  await read();
  const items = await asA.query(api.extract.items, {});
  const project = items.find((i) => i.kind === "project")!;
  const built = items.filter((i) => i.kind === "fact")[0];
  await asA.mutation(api.extract.review, { id: project.id, status: "approved" });
  await asA.mutation(api.extract.review, { id: built.id, status: "approved" });
  const insight = await t.run((ctx) => ctx.db.insert("items", { workspaceId: a.w, kind: "insight", status: "proposed", data: { text: "Builds whole products.", factIds: [built.id] }, sources: [], at: 0 }));
  const status = () => t.run(async (ctx) => (await ctx.db.get(insight))!.status);
  await asA.mutation(api.sources.reject, { source: { projectId: project.id } });
  expect(await status()).toBe("setAside");
  // The project row counts it among what was set aside with it (its unreviewed facts, and this insight).
  expect((await asA.query(api.sources.list, {})).projects["github:octo/trail"].setAside).toBe(3);
  // Its unreviewed facts are listed on the project, for this workspace only; the approved one stays in the record.
  const aside = (await asA.query(api.projects.setAside, { id: project.id })).map((f) => f.id);
  expect(aside).toHaveLength(2);
  expect(aside).not.toContain(built.id);
  await expect(asB.query(api.projects.setAside, { id: project.id })).resolves.toEqual([]);
  await asA.mutation(api.sources.restore, { source: { projectId: project.id } });
  expect(await status()).toBe("proposed");
  expect(await asA.query(api.projects.setAside, { id: project.id })).toEqual([]);
});

test("a test persona's repository, given as its README, is read like one from GitHub, without a GitHub connection", async () => {
  const { t, asB, b, stub, reply, sent } = await setup();
  stub(reply);
  await t.mutation(internal.admin.readTrialProject, { workspaceId: b.w, repo: "octo/trail", readme: "# Trail\nTrail maps for hikers." });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const items = await asB.query(api.extract.items, {});
  expect(items.find((i) => i.kind === "project")).toMatchObject({ status: "proposed", projectKey: "github:octo/trail", data: { name: "trail", url: "https://github.com/octo/trail" } });
  expect(items.filter((i) => i.kind === "fact").map((f) => f.data.evidenceMissing ?? false)).toEqual([false, true, true]);
  expect(sent[0].user).toContain("--- README.md (readme) ---\n# Trail\nTrail maps for hikers.");
});
