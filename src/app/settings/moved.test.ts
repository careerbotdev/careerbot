import { expect, test } from "vitest";
import { movedTo } from "./moved";

const to = (query: string) => movedTo(new URLSearchParams(query));

test("old Settings sections go to where their controls live now", () => {
  expect(to("section=keys")).toBe("/settings?section=connections");
  expect(to("section=drive")).toBe("/settings?section=connections");
  expect(to("section=contact")).toBe("/settings?section=account");
  expect(to("section=companies")).toBe("/companies?settings=search");
  expect(to("section=reminders")).toBe("/pursuits");
});

test("coming back from Google to the old Drive address still finishes connecting in Connections", () => {
  expect(to("section=drive&drive=connected")).toBe("/settings?section=connections&drive=connected");
});

test("sections that didn't move stay put", () => {
  for (const section of ["account", "ai", "budgets", "connections", "updates", "yourdata"]) expect(to(`section=${section}`)).toBeNull();
  expect(to("")).toBeNull();
});
