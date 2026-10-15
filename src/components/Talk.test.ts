import { expect, test } from "vitest";
import { canTalkIn, problemFor } from "./Talk";

test("Talk is offered where the browser has speech recognition, except Brave on a computer, which has no service behind it", () => {
  expect(canTalkIn({ recognition: true, brave: false, device: "mac" })).toBe(true);
  expect(canTalkIn({ recognition: false, brave: false, device: "mac" })).toBe(false);
  expect([null, "mac", "windows"].map((device) => canTalkIn({ recognition: true, brave: true, device: device as "mac" | "windows" | null }))).toEqual([false, false, false]);
  // A phone's Brave may use the phone's own recognition, so Talk stays.
  expect(canTalkIn({ recognition: true, brave: true, device: "phone" })).toBe(true);
});

test("a 'network' error names Brave in Brave and the connection elsewhere; other errors read the same in both", () => {
  expect(problemFor("network", true)).toMatch(/^Talk doesn’t work in this Brave/);
  expect(problemFor("network", false)).toMatch(/^Couldn’t reach your browser’s speech service/);
  expect(problemFor("not-allowed", true)).toBe(problemFor("not-allowed", false));
  expect(problemFor("something-new", false)).toBe("Listening stopped. Press Talk to try again.");
});
