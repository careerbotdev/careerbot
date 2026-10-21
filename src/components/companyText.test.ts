import { expect, test } from "vitest";
import { isList, listText, looksLikeWebsite, PASTE_MAX, parseList } from "./companyText";

// Paste a list and Copy list (Companies you like).

test("a pasted list: names and websites, one per line or separated by commas, blanks, bullets and numbering gone", () => {
  expect(parseList("Kestrel Freight\n\n  tidewell \r\n- Harborline\n• Lumen Planning\n3. Orchard Forecasting\n2) Fernhill Foods").lines).toEqual([
    "Kestrel Freight",
    "tidewell",
    "Harborline",
    "Lumen Planning",
    "Orchard Forecasting",
    "Fernhill Foods",
  ]);
  expect(parseList("https://www.harborline.example.com/about, meridian.example.com,brightwater").lines).toEqual(["https://www.harborline.example.com/about", "meridian.example.com", "brightwater"]);
  // Mixed, and a legal ending after a comma stays with its name.
  expect(parseList("Acme, Inc.\nquillfeather.com, Northwind Health, LLC\nParcelpoint").lines).toEqual(["Acme, Inc.", "quillfeather.com", "Northwind Health, LLC", "Parcelpoint"]);
  expect(parseList(" \n , \n").lines).toEqual([]);
});

test("the same company twice is kept once, by website or by name", () => {
  expect(parseList("acme.com\nhttps://www.ACME.com/jobs\nKestrel Freight\nkestrel  freight\nKestrel-Freight").lines).toEqual(["acme.com", "Kestrel Freight"]);
});

test("at most a hundred lines, and how many more there were", () => {
  const many = Array.from({ length: 130 }, (_, i) => `Company ${i}`).join("\n");
  const { lines, over } = parseList(many);
  expect(lines).toHaveLength(PASTE_MAX);
  expect(lines.at(-1)).toBe("Company 99");
  expect(over).toBe(30);
  expect(parseList("a.com\nb.com").over).toBe(0);
});

test("several lines pasted into the search box open Paste a list; one name, or a name with a comma, doesn't", () => {
  expect(isList("Kestrel Freight\nHarborline")).toBe(true);
  expect(isList("Kestrel Freight\n")).toBe(false);
  expect(isList("Acme, Inc.")).toBe(false);
  expect(looksLikeWebsite("https://www.acme.com/about")).toBe(true);
  expect(looksLikeWebsite("Acme Inc")).toBe(false);
});

test("Copy list is the websites, one per line", () => {
  expect(listText(["kestrel.example.com", "lumenplan.example.com"])).toBe("kestrel.example.com\nlumenplan.example.com");
  expect(listText([])).toBe("");
});
