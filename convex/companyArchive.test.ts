import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { COMPANY_SORTS, type CompanySort, companiesToRate, sortCompanies, type Sortable } from "./companySets";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => {
    const ids = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      ids.push({ u, w: await ensureWorkspace(ctx, u) });
    }
    return ids;
  });
  const asA = t.withIdentity({ subject: `${a.u}|s` });
  const asB = t.withIdentity({ subject: `${b.u}|s` });
  const direction = await t.run((ctx) => ctx.db.insert("items", { workspaceId: a.w, kind: "direction", status: "approved", data: { name: "Supply Planning" }, sources: [], at: 0 } as never));
  const level = (l: "strong" | "some" | "weak" | "none") => ({ fit: [{ directionId: direction, level: l, reason: "." }], fitAt: 1 });
  const board = (slug: string) => ({ details: { board: { provider: "greenhouse" as const, slug, url: `https://boards.greenhouse.io/${slug}` }, sources: ["website"], at: 1 } });
  // Fictional companies: two pairs tie on fit (and one pair on name too), one has no fit judged yet.
  const company = (name: string, extra: Partial<Doc<"companies">>) => t.run((ctx) => ctx.db.insert("companies", { workspaceId: a.w, name, found: [{ via: "criteria", at: extra.at ?? 0 }], at: 0, ...extra }));
  const ids = {
    fernhill: await company("Fernhill Foods", { ...level("strong"), ...board("fernhill"), at: 5 * DAY }),
    orchard: await company("Orchard Forecasting", { ...level("strong"), at: 9 * DAY }),
    copperline: await company("Copperline Robotics", { ...level("some"), ...board("copperline"), at: 2 * DAY }),
    ashgrove: await company("Ashgrove Manufacturing", { ...level("some"), at: 7 * DAY }),
    bramblewood: await company("Bramblewood Home", { ...level("weak"), ...board("bramblewood"), at: 3 * DAY }),
    tidewell: await company("Tidewell Medical Supply", { ...level("none"), at: 4 * DAY }),
    brinewell: await company("Brinewell", { at: 8 * DAY }),
    loadstar: await company("Loadstar Systems", { ...level("strong"), ...board("loadstar"), rating: { value: "excited", at: 0 } }),
    kestrel: await company("Kestrel Freight", { ...level("some"), rating: { value: "maybe", at: 0 } }),
  };
  return { t, a, asA, asB, ids };
}

// The Companies page's Found list, as discovery.list returns it: open employers with no rating, not archived.
const foundOf = (companies: (Sortable & { rating: string | null })[]) => companies.filter((c) => !c.archived && c.screened?.employer !== false && c.rating === null);
const names = (list: { name: string }[]) => list.map((c) => c.name);

test("each sort orders a whole list, ties by name, the same every time", async () => {
  const { asA } = await setup();
  const found = foundOf((await asA.query(api.discovery.list, {})).companies);
  const expected: Record<CompanySort, string[]> = {
    best: ["Fernhill Foods", "Orchard Forecasting", "Ashgrove Manufacturing", "Copperline Robotics", "Bramblewood Home", "Tidewell Medical Supply", "Brinewell"],
    weakest: ["Brinewell", "Tidewell Medical Supply", "Bramblewood Home", "Ashgrove Manufacturing", "Copperline Robotics", "Fernhill Foods", "Orchard Forecasting"],
    board: ["Fernhill Foods", "Copperline Robotics", "Bramblewood Home", "Orchard Forecasting", "Ashgrove Manufacturing", "Tidewell Medical Supply", "Brinewell"],
    newest: ["Orchard Forecasting", "Brinewell", "Ashgrove Manufacturing", "Fernhill Foods", "Tidewell Medical Supply", "Bramblewood Home", "Copperline Robotics"],
    name: ["Ashgrove Manufacturing", "Bramblewood Home", "Brinewell", "Copperline Robotics", "Fernhill Foods", "Orchard Forecasting", "Tidewell Medical Supply"],
  };
  for (const sort of COMPANY_SORTS) {
    const sorted = sortCompanies(found, sort, "rank");
    expect(names(sorted), sort).toEqual(expected[sort]);
    // Whatever order the rows come in, the same order comes out, so pages cut from it never repeat or skip a company.
    for (const shuffled of [[...found].reverse(), [...found.slice(3), ...found.slice(0, 3)]]) expect(names(sortCompanies(shuffled, sort, "rank"))).toEqual(expected[sort]);
    const pages = [0, 3, 6].map((at) => sorted.slice(at, at + 3)).flat();
    expect(names(pages)).toEqual(expected[sort]);
    expect(new Set(pages.map((c) => c.id)).size).toBe(found.length);
  }
});

test("ranked says whether a company's fit is judged yet", async () => {
  const { asA } = await setup();
  const list = (await asA.query(api.discovery.list, {})).companies;
  expect(list.filter((c) => !c.ranked).map((c) => c.name)).toEqual(["Brinewell"]);
});

test("archive hides companies from every list, keeps the rating, and restore (or undo) puts them back", async () => {
  const { t, asA, asB, ids } = await setup();
  const before = await asA.query(api.discovery.list, {});
  await asA.mutation(api.enrich.archive, { ids: [ids.orchard, ids.loadstar], archived: true });
  const after = await asA.query(api.discovery.list, {});
  const archived = after.companies.filter((c) => c.archived).map((c) => c.name);
  expect(archived.sort()).toEqual(["Loadstar Systems", "Orchard Forecasting"]);
  // The rating stays as it was.
  expect(after.companies.find((c) => c.id === ids.loadstar)?.rating).toBe("excited");
  // Out of Found and out of Review's companies to rate.
  expect(names(foundOf(after.companies))).not.toContain("Orchard Forecasting");
  expect(foundOf(after.companies).length).toBe(foundOf(before.companies).length - 1);
  const docs = await t.run((ctx) => ctx.db.query("companies").collect());
  const toRate = companiesToRate(
    docs.map((c) => ({ name: c.name, screened: c.screened ?? null, rating: c.rating?.value ?? null, goals: c.goals ?? null, named: false, fit: c.fit ?? [], archived: c.archived ?? null })),
    "rank",
  );
  expect(toRate.map((x) => x.company.name)).not.toContain("Orchard Forecasting");
  expect(toRate.length).toBe(6);
  // Its roles aren't read: an archived target isn't watched.
  expect((await asA.query(api.roles.overview, {})).coverage.map((c) => c.name)).toEqual(["Kestrel Freight"]);

  // Another workspace can't archive or restore them.
  await expect(asB.mutation(api.enrich.archive, { ids: [ids.orchard], archived: false })).rejects.toThrow();

  // Undo of the archive, or Restore: back where they were, ratings as they were.
  await asA.mutation(api.enrich.archive, { ids: [ids.orchard, ids.loadstar], archived: false });
  const restored = await asA.query(api.discovery.list, {});
  expect(restored.companies.filter((c) => c.archived)).toEqual([]);
  expect(names(foundOf(restored.companies)).sort()).toEqual(names(foundOf(before.companies)).sort());
  expect(restored.companies.find((c) => c.id === ids.loadstar)?.rating).toBe("excited");
  expect((await asA.query(api.roles.overview, {})).coverage.map((c) => c.name).sort()).toEqual(["Kestrel Freight", "Loadstar Systems"]);

  // Undo of a restore archives them again; archiving twice changes nothing more.
  await asA.mutation(api.enrich.archive, { ids: [ids.orchard], archived: true });
  const at = (await t.run((ctx) => ctx.db.get(ids.orchard)))?.archived?.at;
  await asA.mutation(api.enrich.archive, { ids: [ids.orchard], archived: true });
  expect((await t.run((ctx) => ctx.db.get(ids.orchard)))?.archived?.at).toBe(at);
});

