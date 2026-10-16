import { expect, test } from "vitest";
import { between } from "./useSelection";

test("Shift-click checks every row between the last one checked and this one", () => {
  const rows = ["fernhill", "orchard", "copperline", "ashgrove", "tidewell"];
  expect(between(rows, "orchard", "ashgrove")).toEqual(["orchard", "copperline", "ashgrove"]);
  expect(between(rows, "tidewell", "copperline")).toEqual(["copperline", "ashgrove", "tidewell"]);
  expect(between(rows, "orchard", "orchard")).toEqual(["orchard"]);
  // The last one checked has left the list (filtered, or in a folded group): just this one.
  expect(between(rows, "gone", "ashgrove")).toEqual(["ashgrove"]);
});
