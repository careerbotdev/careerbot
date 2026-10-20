import type { Finding } from "../../../convex/findCompanies";
import type { Segment } from "@/components/SegmentedControl";

// The choice of how companies are found (findCompanies.ts): each way's line under the setting and its explainer, with
// what it spends. Without an Apollo key, the Apollo ways can't be chosen and say why (the server refuses them too).

export type FindingSetup = {
  // Their choice where it can run; without an Apollo key, always "web".
  finding: Finding;
  apolloKey: boolean;
  braveKey: boolean;
};

export const FINDING_LABEL: Record<Finding, string> = { apollo: "Apollo", apolloWeb: "Apollo + AI", web: "AI only" };

// The line under the setting for the way chosen.
export const FINDING_LINE: Record<Finding, string> = {
  apollo: "Apollo’s search finds companies and the people at them.",
  apolloWeb: "Apollo’s search, plus a web search and job boards for what it missed.",
  web: "A web search finds companies. You add people by hand.",
};

// The server's words when an Apollo way is chosen without a key (findCompanies.NEEDS_APOLLO).
export const NEEDS_APOLLO = "Add your Apollo key in Settings, Connections first.";

// About what the web search costs a direction (perDirectionUsd: estimates.costs' findRelevant plus findHiringNow; null
// before the first search), from their AI budget.
function aiSpend(perDirectionUsd: number | null) {
  if (perDirectionUsd === null) return "from your AI budget";
  return `${perDirectionUsd < 0.01 ? "under $0.01" : `about $${perDirectionUsd.toFixed(2)}`} a direction from your AI budget`;
}

export function findingOptions(setup: FindingSetup, perDirectionUsd: number | null): Segment<Finding>[] {
  const ai = aiSpend(perDirectionUsd);
  const reason = setup.apolloKey ? undefined : NEEDS_APOLLO;
  return [
    {
      value: "apollo",
      label: FINDING_LABEL.apollo,
      detail: "Apollo’s search for companies that fit each direction, ones hiring for its titles and ones like the companies you like and your targets. Finds people at a company too.",
      note: "Apollo credits · Undo with U",
      reason,
    },
    {
      value: "apolloWeb",
      label: FINDING_LABEL.apolloWeb,
      detail: setup.braveKey
        ? "Apollo’s search, plus a web search and public job boards for companies hiring now and ones that fit that Apollo missed."
        : "Apollo’s search, plus a web search for companies hiring now and ones that fit that Apollo missed. Job boards are searched too once you add a Brave Search key.",
      note: `Apollo credits, and ${ai} · Undo with U`,
      reason,
    },
    {
      value: "web",
      label: FINDING_LABEL.web,
      detail: `A web search for companies that fit each direction, hiring or not, plus job boards for ones hiring now${setup.braveKey ? "" : " when you’ve added a Brave Search key"}. You add people at a company by hand.`,
      note: `${ai[0].toUpperCase()}${ai.slice(1)} · Undo with U`,
    },
  ];
}
