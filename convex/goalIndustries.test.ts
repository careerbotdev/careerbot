import { expect, test } from "vitest";
import { directionIndustries, type IndustryGoals, searchIndustries, shownIndustries, wantedFor } from "./goalIndustries";

const WANT = ["ai", "aerospace and defense", "robotics", "hardware and semiconductors", "energy", "industrial", "developer tools", "data infrastructure"];
const goals = (extra: Partial<IndustryGoals> = {}): IndustryGoals => ({
  lens: { industries: "steer", judge: "rank" },
  avoid: ["staffing"],
  wants: [{ industries: WANT }],
  ...extra,
});

test("every wanted industry comes first, the direction's own extras follow, avoided ones never", () => {
  const g = goals({ wants: [{ industries: [...WANT, "staffing"] }] });
  expect(directionIndustries(g, "Enterprise Sales", ["proptech", "ai", "staffing"])).toEqual([...WANT, "proptech"]);
  expect(searchIndustries(g, "Enterprise Sales", ["proptech"])).toEqual([...WANT, "proptech"]);
  expect(shownIndustries(g, "Enterprise Sales", ["proptech", "ai", "staffing"])).toEqual({ fromGoals: WANT, goalsScoped: false, fromRecord: ["proptech"] });
});

test("a direction's own limit holds only there and replaces the every-direction one; a pivot-only one doesn't widen the search", () => {
  const g = goals({ wants: [{ industries: WANT }, { appliesTo: ["Field Sales"], industries: ["energy"] }, { when: { industryChange: true }, industries: ["fintech"] }] });
  expect(wantedFor(g, "Field Sales")).toEqual(["energy"]);
  expect(shownIndustries(g, "Field Sales", []).goalsScoped).toBe(true);
  expect(wantedFor(g, "Enterprise Sales")).toEqual(WANT);
});

test("the lens: only these searches the wanted ones alone, ignore none; with no wanted industries the direction's own stand as before", () => {
  expect(searchIndustries(goals({ lens: { industries: "only", judge: "rank" } }), "X", ["proptech"])).toEqual(WANT);
  expect(searchIndustries(goals({ lens: { industries: "ignore", judge: "rank" } }), "X", ["proptech"])).toEqual([]);
  expect(shownIndustries(goals({ lens: { industries: "ignore", judge: "rank" } }), "X", ["proptech"]).fromGoals).toEqual([]);
  const none = goals({ wants: [] });
  expect(searchIndustries(none, "X", ["proptech", "staffing"])).toEqual(["proptech"]);
  expect(shownIndustries(none, "X", ["proptech"])).toEqual({ fromGoals: [], goalsScoped: false, fromRecord: [] });
});
