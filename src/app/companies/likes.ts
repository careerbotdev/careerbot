import type { Finding } from "../../../convex/findCompanies";

// What adding a company you like costs (Search settings, and a direction's Criteria), by the way companies are found
// (findCompanies.ts). Finding one is always free (companyLookup.ts); what costs is the searches after: with Apollo,
// every company you like is looked up by the hundred, and the ones searches find more like are searched five at a time.
// The web search names them in its own searches at no extra cost.

export function likeWords(finding: Finding) {
  const apollo = finding !== "web";
  return {
    // Adding one (or a pasted list): it's added to your companies and searches find more like it.
    addNote: apollo ? "Free to add · each search: about 1 Apollo credit for every 5 · Undo with U" : "Free · Undo with U",
    // Use to find more like it, on one that's off.
    likeNote: apollo ? "Free to turn on · each search: about 1 Apollo credit for every 5 · Undo with U" : "Free to turn on · no extra cost a search · Undo with U",
    likeVerb: apollo ? "search" : "web search",
  };
}
