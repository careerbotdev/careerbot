import { expect, test } from "vitest";
import { type Placed, placementOf, writerRecord } from "./resumePlacement";

const roles = [
  { roleKey: "now", employer: "Foothill Peaks", title: "ICU Staff Nurse", start: "2020-01" },
  { roleKey: "then", employer: "Mission Trail", title: "Med-Surg Staff Nurse", start: "2016-01", end: "2019-12" },
];
const record = {
  roles,
  projects: [{ projectKey: "audit", roleKey: "then" }],
  facts: [
    { id: "f1", roleKey: "now", text: "Precepted 12 new grads." },
    { id: "f2", roleKey: "then", text: "Cut falls by half." },
    { id: "f3", roleKey: "then", projectKey: "audit", text: "Ran the chart audit." },
  ],
  context: [{ roleKey: "then", text: "Night shift." }, { projectKey: "audit", text: "Monthly." }],
};
const kept = (p: Placed[], hidden: string[] = []) => {
  const r = writerRecord(record, p, hidden);
  return { facts: r.facts.map((f) => f.id), context: r.context.length, projects: r.projects };
};

test("a role's placement governs only its own facts and context; a linked project keeps its own visibility", () => {
  const out = placementOf(roles, { roles: [{ roleKey: "then", hidden: true }] });
  expect(out).toEqual([{ roleKey: "then", how: "out" }]);
  expect(kept(out)).toEqual({ facts: ["f1", "f3"], context: 1, projects: record.projects });
  // Folded with its lines left out, while its linked project stays visible: the project's facts and entry stay.
  const drop = placementOf(roles, { roles: [{ roleKey: "then", fold: { into: "next", bullets: "drop" } }] });
  expect(drop).toEqual([{ roleKey: "then", how: "fold", into: "now", lines: "drop" }]);
  expect(kept(drop)).toEqual({ facts: ["f1", "f3"], context: 1, projects: record.projects });
  const move = placementOf(roles, { roles: [{ roleKey: "then", fold: { into: "next", bullets: "move" } }] });
  expect(kept(move)).toEqual({ facts: ["f1", "f2", "f3"], context: 2, projects: record.projects });
  // A project hidden itself gives no facts or context, whatever its role's placement.
  expect(kept(move, ["audit"])).toMatchObject({ facts: ["f1", "f2"], context: 1 });
  expect(kept(drop, ["audit"])).toMatchObject({ facts: ["f1"], context: 0 });
});

test("a resume's own placement wins over the record's, and a fold with nothing to fold into stays its own entry", () => {
  const record = { roles: [{ roleKey: "then", fold: { into: "next" as const, bullets: "move" as const } }] };
  expect(placementOf(roles, record, { roles: [{ roleKey: "then", fold: null }] })).toEqual([]);
  expect(placementOf(roles, record, { roles: [{ roleKey: "then", fold: { into: "next", bullets: "drop" } }] })[0].lines).toBe("drop");
  expect(placementOf(roles, { roles: [{ roleKey: "now", fold: { into: "next", bullets: "move" } }] })).toEqual([]);
});
