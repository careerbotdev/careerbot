import { describe, expect, test } from "vitest";
import { findEstimate, type FindSetup, lastSearch, rowLine, searchCost, totalCost } from "./findPlan";

const data = {
  likes: [
    { domain: "acme.com", name: null, add: true, like: false, lookup: null },
    { domain: "seed.com", name: null, add: false, like: true, lookup: null },
  ],
  searchable: [
    { id: "d1", name: "Strategic Sales", ownSeeds: null, hasTitles: true, boardQueries: 2, targets: [] },
    { id: "d2", name: "Founding GTM", ownSeeds: null, hasTitles: false, boardQueries: 0, targets: [] },
  ],
} as unknown as Parameters<typeof findEstimate>[0];
const setup = (s: Partial<FindSetup>): FindSetup => ({ finding: "apollo", braveKey: true, relevantUsd: 0.03, hiringNowUsd: 0.01, byNameUsd: null, aiLeft: null, ...s });

describe("Find companies estimate", () => {
  test("Apollo: credits only, no job boards", () => {
    const e = findEstimate(data, setup({}));
    expect(e.searches.map(searchCost)).toEqual(["3 credits", "2 credits"]);
    expect(e.boardSearches).toBe(0);
    expect(totalCost(e)).toBe("About 8 Apollo credits");
  });

  test("Apollo + AI: credits and dollars a direction, and Brave's job-board searches", () => {
    const e = findEstimate(data, setup({ finding: "apolloWeb" }));
    expect(e.searches.map(searchCost)).toEqual(["3 credits · $0.04", "2 credits · $0.03"]);
    expect(e.boardSearches).toBe(2);
    expect(totalCost(e)).toBe("About 8 Apollo credits, $0.07");
  });

  test("AI only: dollars alone; named companies and seeds cost nothing", () => {
    const e = findEstimate(data, setup({ finding: "web" }));
    expect(e.searches.map(searchCost)).toEqual(["$0.04", "$0.03"]);
    expect([e.seeds, e.named, e.targets, e.credits]).toEqual([0, 0, 0, 0]);
    expect(totalCost(e)).toBe("About $0.07");
  });

  test("before the first web search, the cost is the AI budget; without a Brave key, no job boards", () => {
    const e = findEstimate(data, setup({ finding: "web", braveKey: false, relevantUsd: null, hiringNowUsd: null }));
    expect(e.searches.map(searchCost)).toEqual(["AI budget", "AI budget"]);
    expect(e.boardSearches).toBe(0);
    expect(totalCost(e)).toBe("Uses your AI budget");
  });
});

describe("Last search", () => {
  const web = {
    report: [{ direction: "Strategic Sales", relevant: { found: 18, added: 11 }, hiringNow: { found: 7, added: 4, fromJobBoards: 2 } }],
    named: null,
    notes: ["Job boards weren’t searched: your Brave Search key reached its limit. Hiring now comes from web search alone."],
  };

  test("AI only reads the web search's report and its notes, and says which companies you added had no name", () => {
    const r = lastSearch({ finding: "web", report: [], named: { found: 1, added: 1, missing: ["nameless.com"] }, web });
    expect(r.lines).toEqual(["Strategic Sales: 18 that fit, 11 new; 7 hiring now, 4 new", "Companies you added: 1 found, 1 new; no name found on their website: nameless.com"]);
    expect(r.notes).toEqual(web.notes);
    expect(r.lines.join(" ")).not.toContain("Apollo");
  });

  test("Apollo + AI adds the web search to Apollo's line", () => {
    const r = lastSearch({
      finding: "apolloWeb",
      report: [{ direction: "Strategic Sales", criteria: { found: 40, added: 12, total: 1210 }, hiring: { found: 8, added: 3, total: null }, lookalikes: [] }],
      named: { found: 0, added: 0, missing: ["gone.com"] },
      web,
    });
    expect(r.lines[0]).toBe("Strategic Sales: 40 from its criteria (of 1,210 in Apollo), 12 new; 8 hiring for its titles, 3 new; 25 more from the web search, 15 new");
    expect(r.lines[1]).toBe("Companies you added: 0 found, 0 new; not in Apollo: gone.com");
  });
});

describe("Found labels", () => {
  test("a company the web search found, not filled in, says how in its row", () => {
    expect(rowLine({ details: null, domain: "watershed.com", ways: ["fits, web search"] })).toBe("watershed.com · Fits, web search");
    expect(rowLine({ details: null, domain: "vanta.com", ways: ["hiring now, job boards"] })).toBe("vanta.com · Hiring now, job boards");
  });

  test("once filled in, the row says what it does; Apollo finds show their website", () => {
    expect(rowLine({ details: { summary: "Fleet safety software" } as never, domain: "gomotive.com", ways: ["hiring now, job boards"] })).toBe("Fleet safety software");
    expect(rowLine({ details: null, domain: "acme.com", ways: [] })).toBe("acme.com");
    expect(rowLine({ details: null, domain: undefined, ways: [] })).toBe("No website yet");
  });
});
