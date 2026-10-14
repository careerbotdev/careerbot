import { expect, test } from "vitest";
import { countryCode, countryName } from "./limitBuckets";
import { inWorkArea, matchesTitle } from "./enrich";

test("a job matches a target title by its core words, ignoring seniority", () => {
  expect(matchesTitle("Senior Enterprise Account Executive, Defense", "Enterprise Account Executive")).toBe(true);
  expect(matchesTitle("Director of Solutions Consulting", "Solutions Consultant")).toBe(false);
  expect(matchesTitle("Solutions Consultant II", "Principal Solutions Consultant")).toBe(true);
  expect(matchesTitle("Account Manager", "Enterprise Account Executive")).toBe(false);
});

test("a role counts only where they said they'd work: named countries, remote only if remote is fine", () => {
  const us = { countries: ["US"], remoteOk: true };
  const role = (location: string | undefined, remote = false) => ({ location, remote });
  for (const l of ["US, CA, Santa Clara", "Austin, TX", "Remote - US", "New York, NY", "United States"]) expect(inWorkArea(role(l), us)).toBe(true);
  for (const l of ["Remote - Bengaluru, India", "Bengaluru", "Jakarta, Indonesia", "London, UK", "Paris, France", "Toronto, Canada"]) expect(inWorkArea(role(l, true), us)).toBe(false);
  expect(inWorkArea(role("Remote", true), us)).toBe(true);
  expect(inWorkArea(role("Remote", true), { countries: ["US"], remoteOk: false })).toBe(false);
  expect(inWorkArea(role(undefined), us)).toBe(true);
  expect(inWorkArea(role("Toronto, Canada"), { countries: ["US", "CA"], remoteOk: true })).toBe(true);
  expect(inWorkArea(role("Atlanta, Georgia"), us)).toBe(true);
  expect(inWorkArea(role("Bengaluru, India"), null)).toBe(true);
  // Apollo postings can carry only a country.
  expect(inWorkArea(role("India", true), us)).toBe(false);
  expect(inWorkArea(role("Germany"), us)).toBe(false);
  // Apollo gives ISO codes; they're turned into names first, so "IN" is India, not Indiana.
  for (const code of ["IN", "DE"]) expect(inWorkArea(role(countryName(countryCode(code)!), true), us)).toBe(false);
});

test("a posting with no title never matches and never crashes the pass", () => {
  expect(matchesTitle(undefined as unknown as string, "Account Executive")).toBe(false);
});
