import { describe, expect, test } from "vitest";
import { FINDING_LINE, findingOptions, NEEDS_APOLLO } from "./finding";

describe("finding companies choice", () => {
  test("without an Apollo key, the Apollo ways can't be chosen and say why; AI only can", () => {
    const options = findingOptions({ finding: "web", apolloKey: false, braveKey: true }, 0.05);
    expect(options.map((o) => [o.label, o.reason ?? null])).toEqual([
      ["Apollo", NEEDS_APOLLO],
      ["Apollo + AI", NEEDS_APOLLO],
      ["AI only", null],
    ]);
  });

  test("with an Apollo key, every way can be chosen", () => {
    expect(findingOptions({ finding: "apollo", apolloKey: true, braveKey: true }, 0.05).every((o) => !o.reason)).toBe(true);
  });

  test("the web ways say what they spend a direction, or only the budget before the first search", () => {
    const known = findingOptions({ finding: "apolloWeb", apolloKey: true, braveKey: true }, 0.048);
    expect(known.find((o) => o.value === "apolloWeb")?.note).toBe("Apollo credits, and about $0.05 a direction from your AI budget · Undo with U");
    expect(known.find((o) => o.value === "web")?.note).toBe("About $0.05 a direction from your AI budget · Undo with U");
    const first = findingOptions({ finding: "web", apolloKey: false, braveKey: true }, null);
    expect(first.find((o) => o.value === "web")?.note).toBe("From your AI budget · Undo with U");
    expect(known.find((o) => o.value === "apollo")?.note).toBe("Apollo credits · Undo with U");
  });

  test("job boards are promised only with a Brave Search key", () => {
    const withBrave = findingOptions({ finding: "web", apolloKey: true, braveKey: true }, null);
    const without = findingOptions({ finding: "web", apolloKey: true, braveKey: false }, null);
    expect(withBrave.find((o) => o.value === "web")?.detail).not.toContain("Brave");
    expect(without.find((o) => o.value === "web")?.detail).toContain("when you’ve added a Brave Search key");
    expect(without.find((o) => o.value === "apolloWeb")?.detail).toContain("once you add a Brave Search key");
  });

  test("AI only's line says people are added by hand", () => {
    expect(FINDING_LINE.web).toBe("A web search finds companies. You add people by hand.");
  });
});
