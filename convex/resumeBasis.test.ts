import { expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import { basisOf, changesSince, describeChanges, hasChanges, type Labels } from "./resumeBasis";

const id = (s: string) => s as Id<"items">;
const role = { _id: id("r1"), data: { employer: "Brightwater", title: "Builder", start: "2020-01" } };
const facts = (first: string) => [
  { _id: id("f1"), data: { text: first } },
  { _id: id("f2"), data: { text: "Shipped the S&OP deck." } },
];
const labels: Labels = { fact: () => ({ role: "Brightwater" }), project: () => "", role: () => "Brightwater", skill: () => "", titled: (k) => (k === "a" ? "Charge Nurse" : "MICU Staff Nurse") };

test("a fact reworded in place is a change even when every count stays the same", () => {
  const before = basisOf({ roles: [role], facts: facts("Shipped the forecast."), projects: [], insights: [] });
  const now = basisOf({ roles: [role], facts: facts("Shipped search for 40 teams."), projects: [], insights: [] });
  const changes = changesSince(before, now);
  expect(changes.facts).toEqual({ added: [], removed: [], reworded: [id("f1")] });
  expect(describeChanges(changes, labels)).toBe("1 reworded fact at Brightwater");
  expect(hasChanges(changesSince(now, now))).toBe(false);
});

test("a project's commit count moving is no change; its summary and a direction's positioning are", () => {
  const project = { _id: id("p1"), projectKey: "github:octo/trail", data: { name: "Trail", url: "https://github.com/octo/trail", summary: "Maps." } };
  const direction = { _id: id("d1"), data: { name: "Customer Success", detail: { positioning: "P" } } };
  const read = (p: typeof project) => basisOf({ roles: [], facts: [], projects: [p], insights: [] }, direction);
  const before = read(project);
  const recounted = { ...project, data: { ...project.data, commits: 90 } };
  expect(hasChanges(changesSince(before, read(recounted)))).toBe(false);
  const edited = changesSince(before, read({ ...project, data: { ...project.data, summary: "Trail maps." } }));
  expect(edited.projects.edited).toEqual([id("p1")]);
  const repositioned = changesSince(before, basisOf({ roles: [], facts: [], projects: [project], insights: [] }, { ...direction, data: { ...direction.data, detail: { positioning: "Q" } } }));
  expect([repositioned.direction, hasChanges(repositioned)]).toEqual([true, true]);
});

test("an item with no name left is counted without empty brackets", () => {
  const before = basisOf({ roles: [], facts: [], projects: [{ _id: id("p1"), data: { name: "Gone", url: "" } }], insights: [] });
  const now = basisOf({ roles: [], facts: [], projects: [], insights: [] });
  expect(describeChanges(changesSince(before, now), labels)).toBe("1 removed project");
});

test("a placement change shows as one, named by role; a version from before placement was kept never does", () => {
  const before = { ...basisOf({ roles: [], facts: [], projects: [], insights: [] }), placement: [{ roleKey: "a", how: "fold" as const, into: "b", lines: "move" as const }] };
  const now = { ...before, placement: [{ roleKey: "a", how: "fold" as const, into: "b", lines: "drop" as const }] };
  const changes = changesSince(before, now);
  expect(hasChanges(changes)).toBe(true);
  expect(describeChanges(changes, labels)).toBe("Charge Nurse now folds into MICU Staff Nurse with its lines left out");
  expect(describeChanges(changesSince(now, { ...now, placement: [] }), labels)).toBe("Charge Nurse now has its own entry");
  const { placement: _, ...old } = before;
  expect(hasChanges(changesSince(old, now))).toBe(false);
});
