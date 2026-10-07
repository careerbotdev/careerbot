import { expect, test } from "vitest";
import { inPlace, placeOptions } from "./places";

const austin = { places: ["Austin, TX"], countries: ["US"] };
const texasOnly = { places: ["Remote - Texas"], countries: [] };
const sf = { places: ["San Francisco"], countries: ["US"] };
const london = { places: ["London, United Kingdom"], countries: ["GB"] };
const berlin = { places: ["Berlin, DE"], countries: ["DE"] };
const cambridgeUk = { places: ["Cambridge, England"], countries: ["GB"] };
const twoCities = { places: ["Austin, TX", "Portland, OR"], countries: ["US"] };

test("a state matches by name or code, in either direction, and a well-known city is in its state", () => {
  for (const term of ["Texas", "TX", "tx", "texas"]) {
    expect(inPlace(term, austin)).toBe(true);
    expect(inPlace(term, texasOnly)).toBe(true);
    expect(inPlace(term, sf)).toBe(false);
  }
  expect(inPlace("California", sf)).toBe(true);
  expect(inPlace("CA", sf)).toBe(true);
});

test("a city with its state matches however either is written, and only when both are in one location", () => {
  for (const term of ["Austin, TX", "Austin, Texas", "Austin,TX", "Austin"]) expect(inPlace(term, austin)).toBe(true);
  expect(inPlace("Austin, CA", austin)).toBe(false);
  expect(inPlace("Austin, OR", twoCities)).toBe(false);
  expect(inPlace("Portland, Oregon", twoCities)).toBe(true);
});

test("a country contains its states and cities: United States, US and USA match Austin, TX; others don't", () => {
  for (const term of ["United States", "US", "USA", "United States of America"]) {
    expect(inPlace(term, austin)).toBe(true);
    expect(inPlace(term, texasOnly)).toBe(true);
    expect(inPlace(term, london)).toBe(false);
  }
  expect(inPlace("United Kingdom", london)).toBe(true);
  expect(inPlace("UK", london)).toBe(true);
  expect(inPlace("London, UK", london)).toBe(true);
});

test("a code that is also a country's isn't read as a state outside the US", () => {
  expect(inPlace("Delaware", berlin)).toBe(false);
  expect(inPlace("Germany", berlin)).toBe(true);
});

test("a city is words to find, never a state to require: Cambridge in England matches Cambridge", () => {
  expect(inPlace("Cambridge", cambridgeUk)).toBe(true);
  expect(inPlace("Massachusetts", cambridgeUk)).toBe(false);
});

test("other words match whole words in a location, not parts of one", () => {
  expect(inPlace("Bay Area", { places: ["San Francisco Bay Area"], countries: ["US"] })).toBe(true);
  expect(inPlace("York", { places: ["New York, NY"], countries: ["US"] })).toBe(true);
  expect(inPlace("Yor", { places: ["New York, NY"], countries: ["US"] })).toBe(false);
});

test("suggestions: the places in their roles, their states and countries first; every state and country findable by code; no Remote", () => {
  const options = placeOptions(["austin, tx", "austin, tx", "remote - us", "hybrid - london, uk", "new york, ny"], ["US", "GB"]);
  const labels = options.map((o) => o.label);
  expect(labels.slice(0, 4)).toEqual(["United States", "United Kingdom", "New York", "Texas"]);
  expect(labels).toContain("Austin, TX");
  expect(labels).toContain("London, UK");
  expect(labels.some((l) => /remote/i.test(l))).toBe(false);
  expect(options.find((o) => o.label === "Texas")?.keywords).toContain("TX");
  expect(options.find((o) => o.label === "Germany")?.keywords).toContain("DE");
  expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(labels.length);
});
