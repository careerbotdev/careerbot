import type { FreshLook } from "../../convex/freshLook";

// About what an AI step costs, from what it has cost them so far (estimates.costs); null until they've run it once.
export const aboutUsd = (usd: number | null | undefined) => (usd == null ? null : usd < 0.01 ? "Under $0.01" : `About $${usd.toFixed(2)}`);

const spend = (usd: number | null | undefined) => {
  const cost = aboutUsd(usd);
  return cost ? cost[0].toLowerCase() + cost.slice(1) : "uses your AI budget";
};

// What a review decision starts on its own (freshLook.ts), with the estimate for all of it (gatherUsd, insightsUsd:
// estimates.costs' skills and insights; unknown until each has run once), or null when it starts nothing.
export function thenNote(look: FreshLook, gatherUsd: number | null | undefined, insightsUsd: number | null | undefined) {
  if (!look.gathers && !look.insights) return null;
  const what = look.gathers && look.insights ? "Then reads insights and gathers skills" : look.insights ? "Then reads insights" : "Then gathers skills";
  const parts = [...(look.gathers ? [gatherUsd] : []), ...(look.insights ? [insightsUsd] : [])];
  return `${what}: ${spend(parts.some((p) => p == null) ? null : parts.reduce<number>((sum, p) => sum + (p ?? 0), 0))}`;
}

// What an approval starts that's paid, said in its explainer's note before the click, with the estimate:
// - approving directions with nothing filled in fills them in (fillUsd: one fill-in, estimates.costs' directionDetail);
// - `then`: what finishing a story's or project's review starts (thenNote).
// An approval that starts neither is free.
export function approveNote(fillUsd: number | null | undefined, filled: number, then?: string | null) {
  const paid = [...(filled ? [`Fills ${filled === 1 ? "it" : `${filled} directions`} in: ${spend(fillUsd == null ? null : fillUsd * filled)}`] : []), ...(then ? [then] : [])];
  return `${paid.length ? paid.join(" · ") : "Free"} · Undo with U`;
}

// A rejection's note: free unless it finishes a story's review (`then`), with Why when it asks why first.
export const rejectNote = (then: string | null | undefined, withNote = false) => `${then ?? "Free"} · Undo with U${withNote ? " · Why steers what’s proposed next" : ""}`;
