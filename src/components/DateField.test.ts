import { expect, test } from "vitest";
import { readDay, readDayOrProblem } from "./DateField";

test("a day typed as people write it reads as YYYY-MM-DD; without a year, this year unless that day is long gone", () => {
  const today = new Date(2026, 8, 28);
  expect(["Oct 3", "October 3", "3 Oct", "oct. 3rd", "10/3", "2026-10-03", "October 3, 2026"].map((x) => readDay(x, today))).toEqual(Array(7).fill("2026-10-03"));
  expect(readDay("Sep 20", today)).toBe("2026-09-20");
  expect(readDay("Jan 5", today)).toBe("2027-01-05");
  expect(readDay("10/3/27", today)).toBe("2027-10-03");
  expect(["Feb 30", "13/1", "someday", ""].map((x) => readDay(x, today))).toEqual([null, null, null, null]);
});

test("relative days count from today; a weekday is the next one, and 'next' skips today", () => {
  const monday = new Date(2026, 8, 28);
  expect(["today", "tomorrow", "thu", "Thursday", "next thu", "mon", "next mon"].map((x) => readDay(x, monday))).toEqual([
    "2026-09-28",
    "2026-09-29",
    "2026-10-01",
    "2026-10-01",
    "2026-10-01",
    "2026-09-28",
    "2026-10-05",
  ]);
});

test("a day the month doesn't have is refused, while the month's last real day reads", () => {
  const today = new Date(2026, 8, 28);
  for (const text of ["Sep 31, 2026", "Feb 29, 2027", "someday"]) expect(readDayOrProblem(text, today)).toHaveProperty("problem");
  expect(readDayOrProblem("Sep 30, 2026", today)).toEqual({ day: "2026-09-30" });
  expect(readDayOrProblem("Feb 29, 2028", today)).toEqual({ day: "2028-02-29" });
});
