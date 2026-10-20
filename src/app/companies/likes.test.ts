import { expect, test } from "vitest";
import { findWords } from "./likes";

// What Find costs is said beside it before it runs, by the way companies are found; the results say what it cost.
test("Find's cost before it runs, and its source after, by the way companies are found", () => {
  const apollo = findWords({ finding: "apollo", braveKey: true, byNameUsd: 0.004 });
  expect(apollo.note).toBe("1 Apollo credit");
  expect(apollo.source("apollo", 0)).toBe("From Apollo · 1 credit used");
  expect(findWords({ finding: "apolloWeb", braveKey: false, byNameUsd: null }).note).toBe("1 Apollo credit");

  const brave = findWords({ finding: "web", braveKey: true, byNameUsd: 0.004 });
  expect(brave.note).toBe("1 Brave search on your key");
  expect(brave.source("brave", 0)).toBe("From a web search · 1 Brave search");

  const ai = findWords({ finding: "web", braveKey: false, byNameUsd: 0.004 });
  expect(ai.note).toBe("Under $0.01");
  expect(ai.source("ai", 0.012)).toBe("From a web search · about $0.01");
  // Before the first, its cost isn't known yet: it says where it comes from.
  expect(findWords({ finding: "web", braveKey: false, byNameUsd: null }).note).toBe("Uses your AI budget");
});
