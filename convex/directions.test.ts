import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const u = await t.run((ctx) => ctx.db.insert("users", { email: "a@example.com" }));
  const w = await t.run((ctx) => ensureWorkspace(ctx, u));
  const as = t.withIdentity({ subject: `${u}|s` });
  const goalsId = await as.mutation(api.narratives.create, { kind: "goals", title: "", body: "Supply chain product, or solutions consulting." });
  const direction = (name: string, status: "approved" | "proposed" | "rejected" | "superseded", quotes: string[] = []) =>
    t.run((ctx) => ctx.db.insert("items", { workspaceId: w, kind: "direction", status, data: { name }, sources: quotes.length ? [{ narrativeId: goalsId, version: 1, quotes }] : [], at: 0 }));
  return { t, w, as, goalsId, direction };
}

test("the list has every approved, proposed and rejected direction, with where each came from", async () => {
  const { as, goalsId, direction } = await setup();
  await direction("Supply Chain Product", "approved", ["supply chain product"]);
  await direction("Solutions Consulting", "proposed", ["or solutions consulting"]);
  await direction("Consulting", "rejected");
  await direction("Old Banner", "superseded");
  const { directions } = await as.query(api.directions.list, {});
  expect(directions.map((d) => [d.data.name, d.status, d.sources])).toEqual([
    ["Supply Chain Product", "approved", [{ narrativeId: goalsId, version: 1, quotes: ["supply chain product"] }]],
    ["Solutions Consulting", "proposed", [{ narrativeId: goalsId, version: 1, quotes: ["or solutions consulting"] }]],
    ["Consulting", "rejected", []],
  ]);
});

test("fit counts each approved direction's listed, judged roles that fit strongly or somewhat, leaving out Not for me", async () => {
  const { t, w, as, direction } = await setup();
  const sales = await direction("Supply Chain Product", "approved");
  const partners = await direction("Solutions Consulting", "approved");
  await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { workspaceId: w, name: "Acme", domain: "acme.com", found: [{ via: "hand", at: 0 }], rating: { value: "excited", at: 0 }, at: 0 });
    let n = 0;
    const rank = async (directionId: Id<"items"> | undefined, state: "judged" | "against" | "sortedOut", level?: "strong" | "some" | "weak", rating?: "no") => {
      const postingId = await ctx.db.insert("postings", { workspaceId: w, companyId, provider: "greenhouse", externalId: `r${++n}`, url: `https://x/${n}`, title: `Role ${n}`, remote: false, firstSeen: 0, lastSeen: 0 });
      await ctx.db.insert("roleRanks", { workspaceId: w, directionId, postingId, companyId, companyRating: "excited", state, level, rating, newest: n, at: 0 });
    };
    await rank(sales, "judged", "strong");
    await rank(sales, "judged", "strong");
    await rank(sales, "judged", "some");
    await rank(sales, "judged", "weak");
    await rank(sales, "judged", "strong", "no");
    await rank(sales, "against", "strong");
    await rank(sales, "sortedOut");
    await rank(undefined, "judged", "strong");
  });
  expect(await as.query(api.directions.fit, {})).toEqual([
    { directionId: sales, count: 3, strong: 2, some: 1, more: false },
    { directionId: partners, count: 0, strong: 0, some: 0, more: false },
  ]);
});
