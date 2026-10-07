// Review's groups, in the order they're reviewed: what unlocks other work first. Pure, shared with the browser.
export const REVIEW_KINDS = ["directions", "limits", "criteria", "positioning", "companies", "facts", "rewrites", "questions", "insights", "skills", "sameWork", "resume"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
