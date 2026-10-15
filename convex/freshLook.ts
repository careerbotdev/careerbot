// What a review decision starts on its own (insights.afterReview), so the screens can say so, with the estimate, before
// the click. Once a story, or an approved project, has no facts left waiting, deciding its last one (approving or
// rejecting it), or approving the project itself, gathers skills, tools and certifications (with at least one approved
// fact) and looks for insights (with at least two). Approving a role from a story with no facts left waiting gathers
// skills. Only a decision on something waiting counts: changing an approved item, or deciding it the same way again,
// starts nothing. `open` comes from insights.freshLookOpen.

export type FreshLookOpen = {
  // Facts waiting for review, per story (its id) and per project (its key, with whether the project is approved).
  stories: Record<string, number>;
  projects: Record<string, { open: number; approved: boolean }>;
  // Approved facts that count.
  approvedFacts: number;
};
// One decision: what it's on (its kind, the story it came from, its project), its status before, and the decision.
export type Deciding = { kind: string; narrativeId?: string | null; projectKey?: string | null; was?: string; to: "approved" | "rejected" };
export type FreshLook = { gathers: boolean; insights: boolean };

export function freshLook(deciding: Deciding[], open: FreshLookOpen | undefined): FreshLook {
  const none = { gathers: false, insights: false };
  if (!open) return none;
  const live = deciding.filter((d) => d.was !== "approved" && d.was !== d.to);
  // A fact belongs to its story when it has one (as afterReview reads it), else to its project.
  const scope = (d: Deciding) => (d.narrativeId ? `story:${d.narrativeId}` : d.projectKey ? `project:${d.projectKey}` : null);
  const decided = new Map<string, number>();
  for (const d of live) {
    const key = d.kind === "fact" && (d.was ?? "proposed") === "proposed" ? scope(d) : null;
    if (key) decided.set(key, (decided.get(key) ?? 0) + 1);
  }
  const waiting = (key: string) => (key.startsWith("story:") ? (open.stories[key.slice(6)] ?? 0) : (open.projects[key.slice(8)]?.open ?? 0));
  const finished = (key: string) => waiting(key) - (decided.get(key) ?? 0) <= 0;
  const projectApproved = (key: string) => !!open.projects[key]?.approved || live.some((d) => d.kind === "project" && d.to === "approved" && d.projectKey === key);
  const approved = open.approvedFacts + live.filter((d) => d.kind === "fact" && d.to === "approved").length;
  const look = { ...none };
  const factsDone = () => {
    if (approved >= 1) look.gathers = true;
    if (approved >= 2) look.insights = true;
  };
  for (const d of live) {
    const key = scope(d);
    if (d.kind === "fact" && key && finished(key) && (key.startsWith("story:") || projectApproved(key.slice(8)))) factsDone();
    else if (d.kind === "role" && d.to === "approved" && d.narrativeId && finished(`story:${d.narrativeId}`)) look.gathers = true;
    else if (d.kind === "project" && d.to === "approved" && d.projectKey && finished(`project:${d.projectKey}`)) factsDone();
  }
  return look;
}
