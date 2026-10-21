import { expect, test } from "vitest";
import { likeWords } from "./likes";

// Finding a company is free; what adding one or finding more like it costs depends on the way companies are found.
test("adding a company you like says what its searches cost, by the way companies are found", () => {
  expect(likeWords("apollo").addNote).toBe("Free to add · each search: about 1 Apollo credit for every 5 · Undo with U");
  expect(likeWords("apolloWeb").likeVerb).toBe("search");
  expect(likeWords("web")).toEqual({ addNote: "Free · Undo with U", likeNote: "Free to turn on · no extra cost a search · Undo with U", likeVerb: "web search" });
  for (const f of ["apollo", "apolloWeb", "web"] as const) expect(JSON.stringify(likeWords(f))).not.toMatch(/Brave|AI budget|1 Apollo credit a search/);
});
