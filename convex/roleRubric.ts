import { type Infer, v } from "convex/values";

// How judging scores a role for a direction (roles.ts, rankPrompt). Each verdict records the rubric it was judged
// under; a verdict from before rubrics is v1.
// v1: the level and the score say only how well the role is the direction's work; gaps in their background never
//     lower either.
// v2: the level still says only that; the score also counts how big a stretch the role is for them (years asked
//     against theirs, seniority well above theirs, core requirements their approved record lacks, preferences it
//     doesn't meet), and the verdict lists the stretch in short plain words. A stretch lowers a score, never hides a role.
export const rubric = v.union(v.literal("v1"), v.literal("v2"));
export type Rubric = Infer<typeof rubric>;

// The rubric judging uses: v2 unless they turned off counting the stretch (discovery.stretch false).
export const rubricOf = (settings: { stretch?: boolean } | null | undefined): Rubric => (settings?.stretch === false ? "v1" : "v2");

// A reply's stretch: its lines that are text, trimmed.
export function cleanStretch(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim());
}

const fitLevel = v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none"));
// One role and direction in a comparison of rubrics (rubricRuns): its live verdict (old) beside the one the rubric
// tried gave it (new; "none" with no reason when the reply left the direction out, as saving a verdict would).
export const compareRow = v.object({
  postingId: v.id("postings"),
  directionId: v.id("items"),
  oldLevel: fitLevel,
  oldScore: v.optional(v.number()),
  oldReason: v.optional(v.string()),
  newLevel: fitLevel,
  newScore: v.optional(v.number()),
  newReason: v.optional(v.string()),
  stretch: v.array(v.string()),
});
export type CompareRow = Infer<typeof compareRow>;

const LEVEL_RANK: Record<CompareRow["oldLevel"], number> = { none: 0, weak: 1, some: 2, strong: 3 };
// The change in score of one row (null when either side has no score).
export const scoreChange = (r: Pick<CompareRow, "oldScore" | "newScore">) => (r.oldScore === undefined || r.newScore === undefined ? null : r.newScore - r.oldScore);

// What a comparison found over some of its rows: how many scores rose, fell or stayed, the mean change, and how many
// levels rose or fell.
export function compareSummary(rows: Pick<CompareRow, "oldLevel" | "oldScore" | "newLevel" | "newScore">[]) {
  const changes = rows.map(scoreChange).filter((c): c is number => c !== null);
  return {
    rows: rows.length,
    scored: changes.length,
    up: changes.filter((c) => c > 0).length,
    down: changes.filter((c) => c < 0).length,
    same: changes.filter((c) => c === 0).length,
    meanChange: changes.length ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10 : null,
    levelUp: rows.filter((r) => LEVEL_RANK[r.newLevel] > LEVEL_RANK[r.oldLevel]).length,
    levelDown: rows.filter((r) => LEVEL_RANK[r.newLevel] < LEVEL_RANK[r.oldLevel]).length,
  };
}
