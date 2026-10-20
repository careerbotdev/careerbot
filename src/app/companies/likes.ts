import type { Finding } from "../../../convex/findCompanies";

// The words Companies you like shows (Search settings, and a direction's Criteria), by the way companies are found
// (findCompanies.ts) and the keys: what Find costs before it runs, where its results came from after, and each choice's
// explainer. A name search costs (companyLookup.ts): Apollo's is 1 credit, a Brave search is one on their own key, and
// without either it's a small web-search call from the AI budget (byNameUsd: its average so far; null before the first).

export type LookupSetup = { finding: Finding; braveKey: boolean; byNameUsd: number | null };
export type LookupSource = "apollo" | "brave" | "ai";

const usd = (n: number) => (n < 0.01 ? "under $0.01" : `about $${n.toFixed(2)}`);
const capital = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

export function findWords(s: LookupSetup) {
  const apollo = s.finding !== "web";
  const ai = s.byNameUsd === null ? "uses your AI budget" : usd(s.byNameUsd);
  return {
    // Beside Find, before it runs.
    note: apollo ? "1 Apollo credit" : s.braveKey ? "1 Brave search on your key" : capital(ai),
    detail: apollo ? "Looks up companies with this name, so you can pick the right one. Nothing is added until you do." : "Looks up companies with this name on the web, so you can pick the right one. Nothing is added until you do.",
    // Under the results: where they came from and what that search cost.
    source: (source: LookupSource, costUsd: number) =>
      source === "apollo" ? "From Apollo · 1 credit used" : source === "brave" ? "From a web search · 1 Brave search" : `From a web search · ${usd(costUsd)}`,
    // Each choice's cost while searches run on this way.
    addNote: apollo ? "Free to turn on · each search: about 1 Apollo credit for every 100 · Undo with U" : "Free · Undo with U",
    likeNote: apollo ? "Free to turn on · each search: about 1 Apollo credit for every 5 · Undo with U" : "Free to turn on · no extra cost a search · Undo with U",
    likeVerb: apollo ? "search" : "web search",
  };
}

