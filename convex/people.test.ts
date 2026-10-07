import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { seedModelPrices } from "./modelPrices.testing";
import { grouped, groupOf, hiringOrder, teamTitle } from "./contactGroups";
import schema from "./schema";
import { seal } from "./secretBox";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.MASTER_KEY_V1 = "77".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MASTER_KEY_V1;
});

async function setup({ mode = "onRequest" as "on" | "onRequest" | "paused", cap = 0 } = {}) {
  const t = convexTest(schema, modules);
  await seedModelPrices(t);
  const sealed = await seal("key");
  const [a, b] = await t.run(async (ctx) => {
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      const w = await ensureWorkspace(ctx, u);
      for (const service of ["apollo", "openrouter"] as const) await ctx.db.insert("apiKeys", { workspaceId: w, service, sealed, last4: "-key", setAt: 0 });
      await ctx.db.insert("budgets", { workspaceId: w, aiMonthlyUsd: 5, apolloMonthlyCredits: cap, apolloMode: mode });
      await ctx.db.insert("aiSettings", { workspaceId: w, task: "outreach", model: "test/model" });
      out.push({ u, w });
    }
    return out;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const w = a.w;
  const postingId = await t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: w, kind: "role", status: "approved", roleKey: "acme", sources: [], at: 0, data: { employer: "Acme", title: "Head of CS" } });
    await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", roleKey: "acme", data: { text: "Cut churn by 20%." }, sources: [], at: 0 });
    await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "proposed", roleKey: "acme", data: { text: "Doubled revenue." }, sources: [], at: 0 });
    const c = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", apolloId: "org-1", found: [], at: 0 });
    return ctx.db.insert("postings", { workspaceId: w, companyId: c, provider: "lever", externalId: "1", url: "u", title: "Head of Customer Success", remote: false, firstSeen: 0, lastSeen: 0 });
  });
  const pursuitId = await asA.mutation(api.pursuits.start, { postingId });
  return { t, asA, asB, w, pursuitId };
}

// Apollo with `left` credits on the account (null: the balance can't be read); every call recorded.
function stubApollo(left: number | null) {
  const f = vi.fn(async (input: string, init?: { body?: string }) => {
    const url = new URL(input);
    if (url.hostname === "openrouter.ai") {
      const body = JSON.parse(init!.body!) as { messages: { content: string }[] };
      const factId = /"id":"([^"]+)","roleKey":"acme","text":"Cut churn/.exec(body.messages[1].content)?.[1];
      return Response.json({ choices: [{ message: { content: JSON.stringify({ subject: "Customer success at Beta", text: "Hi Dana, I cut churn by 20% at Acme.", factIds: [factId, "made-up"], parts: { who: "A CS lead", why: "Beta's onboarding", fit: "Cut churn by 20%", ask: "20 minutes" } }) } }], usage: { cost: 0.001 } });
    }
    if (url.pathname.endsWith("credit_usage_stats"))
      return left === null ? new Response("", { status: 403 }) : Response.json({ credit_usage_stats: { lead_credit: { limit: 100, consumed: 100 - left, left_over: left } }, current_credit_cycle: { start_date: "2026-09-05" } });
    if (url.pathname.endsWith("mixed_people/api_search")) {
      // The leaders search, the team search (the role's work) and the recruiting search; Dana comes back twice.
      const titles = url.searchParams.getAll("person_titles[]");
      if (titles.includes("recruiter")) return Response.json({ people: [{ id: "p4", first_name: "Ana", last_name_obfuscated: "Ru***z", title: "Senior Recruiter" }] });
      if (titles.length) return Response.json({ people: [{ id: "p3", first_name: "Lee", last_name_obfuscated: "Pa***k", title: "Customer Success Manager" }, { id: "p2", first_name: "Dana", last_name_obfuscated: "Le***e", title: "VP, Customer Success" }] });
      return Response.json({ people: [{ id: "p1", first_name: "Sam", last_name_obfuscated: "Ch***n", title: "CEO" }, { id: "p2", first_name: "Dana", last_name_obfuscated: "Le***e", title: "VP, Customer Success" }] });
    }
    if (url.pathname.endsWith("people/match")) return Response.json({ person: { name: "Dana Lee", email: "dana@beta.com", linkedin_url: "https://linkedin.com/in/dana" } });
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  return { f, calls: (path: string) => f.mock.calls.filter(([u]) => String(u).includes(path)).length };
}
const usage = (t: Awaited<ReturnType<typeof setup>>["t"]) => t.run(async (ctx) => (await ctx.db.query("usage").collect()).filter((u) => u.service === "apollo").map((u) => [u.endpoint, u.credits, u.state]));

test("the likely hiring manager is the one whose title names the role's work, leading it; nobody is when no title does", () => {
  const people = [{ title: "CEO" }, { title: "Customer Success Manager" }, { title: "VP, Customer Success" }, { title: "Director of Sales" }];
  expect(hiringOrder("Head of Customer Success", people).map((p) => [p.title, p.hiringManager])).toEqual([
    ["VP, Customer Success", true],
    ["Customer Success Manager", false],
    ["Director of Sales", false],
    ["CEO", false],
  ]);
  expect(hiringOrder("Solutions Engineer", people).some((p) => p.hiringManager)).toBe(false);
});

test("contacts fall into Hiring manager, Team and Recruiting by title; a manager is a peer when the role is a manager too", () => {
  const role = "Solutions Consultant, Demand Planning";
  const people = [{ title: "Talent Partner, Go-to-Market" }, { title: "Solutions Consultant" }, { title: "Director, Customer Solutions" }, { title: "Senior Solutions Consultant" }, { title: "CEO" }];
  expect(grouped(role, people).map((p) => [p.title, groupOf(role, p.title), p.hiringManager])).toEqual([
    ["Director, Customer Solutions", "hiringManager", true],
    ["CEO", "hiringManager", false],
    ["Solutions Consultant", "team", false],
    ["Senior Solutions Consultant", "team", false],
    ["Talent Partner, Go-to-Market", "recruiting", false],
  ]);
  expect(groupOf("Product Manager", "Senior Product Manager")).toBe("team");
  expect(groupOf("Head of Customer Success", "Customer Success Manager")).toBe("team");
  expect(groupOf("Product Analyst", "Product Manager")).toBe("hiringManager");
  expect(groupOf("Product Manager", "Sourcing Lead")).toBe("recruiting");
  expect(["Senior Product Manager, Load Planning", "Head of Customer Success", "Director, Supply Planning", "Leadership Coach"].map(teamTitle)).toEqual(["Product Manager", "Customer Success", "Supply Planning", "Leadership Coach"]);
});

test("finding contacts is three free Apollo searches (leaders, the role's work, recruiting), each person once, in groups; paused or unreadable balance spends nothing", async () => {
  const { t, asA, asB, pursuitId } = await setup();
  const apollo = stubApollo(10);
  await expect(asB.action(api.people.find, { pursuitId })).rejects.toThrow("Not found");
  expect(await asA.action(api.people.find, { pursuitId })).toBe(4);
  expect((await asA.query(api.people.list, { pursuitId })).people.map((p) => [p.name, p.group, p.hiringManager, p.email])).toEqual([
    ["Dana Le***e", "hiringManager", true, null],
    ["Sam Ch***n", "hiringManager", false, null],
    ["Lee Pa***k", "team", false, null],
    ["Ana Ru***z", "recruiting", false, null],
  ]);
  const searched = apollo.f.mock.calls.filter(([u]) => String(u).includes("api_search")).map(([u]) => new URL(String(u)).searchParams.getAll("person_titles[]"));
  expect(searched).toEqual([[], ["Customer Success"], ["recruiter", "talent", "sourcer", "people partner"]]);
  expect(await usage(t)).toEqual([["mixed_people/api_search", 0, "settled"], ["mixed_people/api_search", 0, "settled"], ["mixed_people/api_search", 0, "settled"]]);
  expect(apollo.calls("people/match")).toBe(0);
  expect((await asA.query(api.pursuits.get, { id: pursuitId })).timeline[0]).toMatchObject({ event: "people", text: "4" });

  // Moving someone to another group sticks, also after finding again.
  const lee = (await asA.query(api.people.list, { pursuitId })).people.find((p) => p.name === "Lee Pa***k")!;
  await expect(asB.mutation(api.people.setGroup, { contactId: lee.id, group: "hiringManager" })).rejects.toThrow("Not found");
  await asA.mutation(api.people.setGroup, { contactId: lee.id, group: "hiringManager" });
  await asA.action(api.people.find, { pursuitId });
  expect((await asA.query(api.people.list, { pursuitId })).people.map((p) => [p.name, p.group])).toEqual([
    ["Dana Le***e", "hiringManager"],
    ["Sam Ch***n", "hiringManager"],
    ["Lee Pa***k", "hiringManager"],
    ["Ana Ru***z", "recruiting"],
  ]);

  const unread = stubApollo(null);
  await expect(asA.action(api.people.find, { pursuitId })).rejects.toThrow("Couldn't read your Apollo credit balance");
  expect(unread.calls("api_search")).toBe(0);
  const { asA: paused, pursuitId: p2 } = await setup({ mode: "paused" });
  const off = stubApollo(10);
  await expect(paused.action(api.people.find, { pursuitId: p2 })).rejects.toThrow("paused");
  expect(off.calls("api_search")).toBe(0);
});

test("an email is revealed only for the person chosen, for 1 credit, never past the balance or their cap, and never paid twice", async () => {
  const { t, asA, asB, pursuitId } = await setup({ cap: 1 });
  stubApollo(10);
  await asA.action(api.people.find, { pursuitId });
  const [dana, sam] = (await asA.query(api.people.list, { pursuitId })).people;
  await expect(asB.action(api.people.reveal, { contactId: dana.id })).rejects.toThrow("Not found");

  const empty = stubApollo(0);
  await expect(asA.action(api.people.reveal, { contactId: dana.id })).rejects.toThrow("doesn't have enough credits");
  expect(empty.calls("people/match")).toBe(0);

  const apollo = stubApollo(10);
  expect(await asA.action(api.people.reveal, { contactId: dana.id })).toBe("dana@beta.com");
  expect(await asA.action(api.people.reveal, { contactId: dana.id })).toBe("dana@beta.com");
  expect(apollo.calls("people/match")).toBe(1);
  // Their cap of 1 credit this cycle is used.
  await expect(asA.action(api.people.reveal, { contactId: sam.id })).rejects.toThrow("set aside");
  expect(apollo.calls("people/match")).toBe(1);
  expect((await usage(t)).filter(([e]) => e === "people/match")).toEqual([["people/match", 1, "settled"]]);
  expect((await asA.query(api.people.list, { pursuitId })).people.slice(0, 2).map((p) => [p.name, p.revealed, p.email])).toEqual([["Dana Lee", true, "dana@beta.com"], ["Sam Ch***n", false, null]]);

  // Finding again keeps whoever was revealed.
  await asA.action(api.people.find, { pursuitId });
  expect((await asA.query(api.people.list, { pursuitId })).people.filter((p) => p.revealed).map((p) => p.email)).toEqual(["dana@beta.com"]);

  // The same person found for another pursuit at the company is revealed from the first, for nothing.
  const other = await t.run(async (ctx) => {
    const p = (await ctx.db.get(pursuitId))!;
    return ctx.db.insert("postings", { workspaceId: p.workspaceId, companyId: p.companyId, provider: "lever", externalId: "2", url: "u2", title: "Customer Success Manager", remote: false, firstSeen: 0, lastSeen: 0 });
  });
  const second = await asA.mutation(api.pursuits.start, { postingId: other });
  await asA.action(api.people.find, { pursuitId: second });
  const again = (await asA.query(api.people.list, { pursuitId: second })).people.find((p) => p.name.startsWith("Dana"))!;
  expect(await asA.action(api.people.reveal, { contactId: again.id })).toBe("dana@beta.com");
  expect(apollo.calls("people/match")).toBe(1);
});

test("an outreach message rests on the approved record, cites only approved facts, knows the contact's group, and says what each part says", async () => {
  const { t, asA, asB, pursuitId } = await setup();
  const apollo = stubApollo(10);
  await asA.action(api.people.find, { pursuitId });
  const [dana] = (await asA.query(api.people.list, { pursuitId })).people;
  await expect(asB.mutation(api.people.draft, { contactId: dana.id })).rejects.toThrow("Not found");
  await asA.mutation(api.people.draft, { contactId: dana.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const prompt = (apollo.f.mock.calls.find(([u]) => String(u).includes("openrouter")) as unknown as [string, { body: string }])[1].body;
  expect(prompt).toContain("Cut churn by 20%.");
  expect(prompt).not.toContain("Doubled revenue.");
  expect(prompt).toContain("likely the hiring manager");
  expect(prompt).toContain("haven't applied");
  const shown = (await asA.query(api.people.list, { pursuitId })).people[0];
  expect([shown.draft?.subject, shown.draft?.factIds.length, shown.sent, shown.draftSent]).toEqual(["Customer success at Beta", 1, [], false]);
  expect(shown.draft?.parts).toEqual({ who: "A CS lead", why: "Beta's onboarding", fit: "Cut churn by 20%", ask: "20 minutes" });

  // A second contact, once the first was written to and the pursuit applied: a new message that knows both.
  await asA.mutation(api.people.markSent, { contactId: dana.id });
  await asA.mutation(api.pursuits.setStatus, { id: pursuitId, status: "applied" });
  const ana = (await asA.query(api.people.list, { pursuitId })).people.find((p) => p.group === "recruiting")!;
  apollo.f.mockClear();
  await asA.mutation(api.people.draft, { contactId: ana.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const second = (apollo.f.mock.calls.find(([u]) => String(u).includes("openrouter")) as unknown as [string, { body: string }])[1].body;
  expect(second).toContain("in recruiting");
  expect(second).toContain("They already wrote to: Dana Le***e, VP, Customer Success");
  expect(second).toContain("They applied through the posting on 2026-09-20");
});

test("a message marked sent is kept exactly as sent, to whom and when; a later draft never changes it; each send is on the timeline; the first moves the pursuit to Contacted", async () => {
  const { t, asA, asB, pursuitId } = await setup();
  stubApollo(10);
  await asA.action(api.people.find, { pursuitId });
  const [dana] = (await asA.query(api.people.list, { pursuitId })).people;
  await asA.action(api.people.reveal, { contactId: dana.id });
  await asA.mutation(api.people.draft, { contactId: dana.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await expect(asB.mutation(api.people.markSent, { contactId: dana.id })).rejects.toThrow("Not found");
  vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
  await asA.mutation(api.people.markSent, { contactId: dana.id });
  // The same draft marked again is still one send.
  await asA.mutation(api.people.markSent, { contactId: dana.id });
  const first = { subject: "Customer success at Beta", text: "Hi Dana, I cut churn by 20% at Acme.", to: "Dana Lee <dana@beta.com>", at: new Date("2026-09-21T12:00:00Z").getTime() };
  expect((await asA.query(api.people.list, { pursuitId })).people[0]).toMatchObject({ sent: [first], draftSent: true });
  expect(await asA.query(api.pursuits.get, { id: pursuitId })).toMatchObject({ status: "contacted", contactedAt: first.at, path: "outreach", chosenPath: null });

  // A new draft replaces the draft only; what was sent stays, and the new one can be sent too.
  vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
  stubApollo(10).f.mockImplementation(async () =>
    Response.json({ choices: [{ message: { content: JSON.stringify({ subject: "Following up", text: "Hi Dana, following up.", factIds: [] }) } }], usage: { cost: 0.001 } }),
  );
  await asA.mutation(api.people.draft, { contactId: dana.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = (await asA.query(api.people.list, { pursuitId })).people[0];
  expect([after.draft?.subject, after.sent, after.draftSent]).toEqual(["Following up", [first], false]);
  await asA.mutation(api.people.markSent, { contactId: dana.id });
  expect((await asA.query(api.people.list, { pursuitId })).people[0].sent.map((x) => x.subject)).toEqual(["Following up", "Customer success at Beta"]);
  expect((await asA.query(api.pursuits.get, { id: pursuitId })).timeline.filter((e) => e.event === "outreach").map((e) => e.text)).toEqual([
    "Dana Lee: Following up",
    "Dana Lee: Customer success at Beta",
  ]);
  // Contacted keeps the day of the first message.
  expect((await asA.query(api.pursuits.get, { id: pursuitId })).contactedAt).toBe(first.at);
});

test("the people at a company are everyone found across its pursuits, each once, in their groups, and only for its workspace", async () => {
  const { t, asA, asB, w, pursuitId } = await setup();
  stubApollo(10);
  const { companyId, second } = await t.run(async (ctx) => {
    const p = (await ctx.db.get(pursuitId))!;
    const posting = await ctx.db.insert("postings", { workspaceId: w, companyId: p.companyId, provider: "lever", externalId: "2", url: "u2", title: "Customer Success Manager", remote: false, firstSeen: 0, lastSeen: 0 });
    return { companyId: p.companyId, second: posting };
  });
  const other = await asA.mutation(api.pursuits.start, { postingId: second });
  await asA.action(api.people.find, { pursuitId });
  await asA.action(api.people.find, { pursuitId: other });
  expect((await asA.query(api.people.atCompany, { companyId })).map((p) => [p.name, p.group, p.hiringManager])).toEqual([
    ["Dana Le***e", "hiringManager", true],
    ["Sam Ch***n", "hiringManager", false],
    ["Lee Pa***k", "team", false],
    ["Ana Ru***z", "recruiting", false],
  ]);
  await expect(asB.query(api.people.atCompany, { companyId })).rejects.toThrow("Not found");
});

test("a contact added by hand has no Apollo id, costs nothing, stays when finding again, and can be written to at the email typed", async () => {
  const { t, asA, asB, pursuitId } = await setup();
  const apollo = stubApollo(10);
  await expect(asB.mutation(api.people.add, { pursuitId, name: "Kim", title: "", email: "", group: "team" })).rejects.toThrow("Not found");
  await expect(asA.mutation(api.people.add, { pursuitId, name: "  ", title: "", email: "", group: "team" })).rejects.toThrow("Write their name");
  await expect(asA.mutation(api.people.add, { pursuitId, name: "Kim", title: "", email: "kim at beta", group: "team" })).rejects.toThrow("doesn't look right");
  const kim = await asA.mutation(api.people.add, { pursuitId, name: " Kim Ostrander ", title: "Onboarding Lead", email: "kim@beta.com", group: "team" });
  await asA.action(api.people.find, { pursuitId });
  const listed = (await asA.query(api.people.list, { pursuitId })).people.find((p) => p.id === kim)!;
  expect(listed).toMatchObject({ name: "Kim Ostrander", title: "Onboarding Lead", group: "team", added: true, revealed: true, email: "kim@beta.com" });
  expect(await asA.action(api.people.reveal, { contactId: kim })).toBe("kim@beta.com");
  expect(apollo.calls("people/match")).toBe(0);
  await asA.mutation(api.people.draft, { contactId: kim });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await asA.mutation(api.people.markSent, { contactId: kim });
  expect((await asA.query(api.people.list, { pursuitId })).people.find((p) => p.id === kim)!.sent[0].to).toBe("Kim Ostrander <kim@beta.com>");
  expect((await asA.query(api.pursuits.get, { id: pursuitId })).timeline.some((e) => e.event === "added" && e.text === "Kim Ostrander")).toBe(true);
});

test("a company with no website can't be searched, and says to add a contact instead", async () => {
  const { t, asA, pursuitId } = await setup();
  const apollo = stubApollo(10);
  await t.run(async (ctx) => {
    const p = (await ctx.db.get(pursuitId))!;
    await ctx.db.patch(p.companyId, { apolloId: undefined, domain: undefined });
  });
  await expect(asA.action(api.people.find, { pursuitId })).rejects.toThrow("Add a contact you know instead");
  expect(apollo.calls("api_search")).toBe(0);
});

test("outreach with no open role tells the model there's no posting, and finds people by what they're after", async () => {
  const { t, asA, w, pursuitId } = await setup();
  const apollo = stubApollo(10);
  const companyId = await t.run(async (ctx) => {
    await ctx.db.insert("items", { workspaceId: w, kind: "direction", status: "approved", sources: [], at: 0, data: { name: "Customer Success" } });
    return (await ctx.db.get(pursuitId))!.companyId;
  });
  const id = await asA.mutation(api.pursuits.startAtCompany, { companyId });
  expect(await asA.action(api.people.find, { pursuitId: id })).toBeGreaterThan(0);
  const kim = await asA.mutation(api.people.add, { pursuitId: id, name: "Kim Ostrander", title: "Onboarding Lead", email: "kim@beta.com", group: "team" });
  await asA.mutation(api.people.draft, { contactId: kim });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const call = apollo.f.mock.calls.find(([u]) => String(u).includes("openrouter.ai"))!;
  const prompt = JSON.parse((call as unknown as [string, { body: string }])[1].body).messages[1].content as string;
  expect(prompt).toContain("No open role: they're after Customer Success work at Beta");
  expect(prompt).not.toContain("applied through the posting");
  expect((await asA.query(api.people.list, { pursuitId: id })).people.find((p) => p.id === kim)!.draft?.text).toBe("Hi Dana, I cut churn by 20% at Acme.");
});

test("a reply is kept on the contact and the pursuit, moves an early pursuit to In conversation, and Undo puts it all back", async () => {
  const { asA, asB, pursuitId } = await setup();
  const kim = await asA.mutation(api.people.add, { pursuitId, name: "Kim Ostrander", title: "Onboarding Lead", email: "kim@beta.com", group: "team" });
  const lee = await asA.mutation(api.people.add, { pursuitId, name: "Lee Park", title: "", email: "", group: "team" });
  await asA.mutation(api.pursuits.setStatus, { id: pursuitId, status: "contacted" });
  await expect(asB.mutation(api.people.markReplied, { contactId: kim })).rejects.toThrow("Not found");
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  expect(await asA.mutation(api.people.markReplied, { contactId: kim })).toBe("contacted");
  const at = new Date("2026-09-24T12:00:00Z").getTime();
  let p = await asA.query(api.pursuits.get, { id: pursuitId });
  expect(p).toMatchObject({ status: "inConversation", repliedAt: at });
  expect(p.timeline.slice(0, 2).map((e) => [e.event, e.text ?? e.status])).toEqual([
    ["status", "inConversation"],
    ["replied", "Kim Ostrander"],
  ]);
  expect((await asA.query(api.people.list, { pursuitId })).people.find((x) => x.id === kim)!.repliedAt).toBe(at);

  // A later reply keeps the first date and doesn't move a pursuit already past it.
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  await asA.mutation(api.pursuits.setStatus, { id: pursuitId, status: "interviewing" });
  expect(await asA.mutation(api.people.markReplied, { contactId: lee })).toBe("interviewing");
  p = await asA.query(api.pursuits.get, { id: pursuitId });
  expect(p).toMatchObject({ status: "interviewing", repliedAt: at });

  // Undo: the reply goes from the contact, the timeline and the pursuit's first reply.
  await asA.mutation(api.people.unmarkReplied, { contactId: kim, status: "contacted" });
  p = await asA.query(api.pursuits.get, { id: pursuitId });
  expect(p).toMatchObject({ status: "interviewing", repliedAt: new Date("2026-09-26T12:00:00Z").getTime() });
  expect(p.timeline.filter((e) => e.event === "replied").map((e) => e.text)).toEqual(["Lee Park"]);
  await asA.mutation(api.people.unmarkReplied, { contactId: lee });
  expect((await asA.query(api.pursuits.get, { id: pursuitId })).repliedAt).toBeNull();
});
