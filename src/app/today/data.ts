"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { type Reminder, remindersOf } from "../../../convex/pursuitSteps";
import { useNow } from "../clock";

export type PursuitRow = FunctionReturnType<typeof api.pursuits.list>["pursuits"][number];
export type ReviewSummary = FunctionReturnType<typeof api.review.summary>;
export type TodayRole = FunctionReturnType<typeof api.today.roles>[number];
export type ResumeUpdate = FunctionReturnType<typeof api.resume.updates>[number];
export type FactDocument = FunctionReturnType<typeof api.factChanges.documents>[number];

// One line on Today. A pursuit's line is its most pressing reminder, or an offer waiting for a reply (`reminder` null).
// A resume from Resume updates carries its lines resting on changed facts (facts) when it has some; any other document
// with such lines (a tailored resume, a cover letter, answers) is a line of its own.
export type TodayLine =
  | { kind: "review"; id: "review"; summary: ReviewSummary }
  | { kind: "pursuit"; id: string; p: PursuitRow; reminder: Reminder | null }
  | { kind: "role"; id: string; role: TodayRole }
  | { kind: "resume"; id: string; update: ResumeUpdate; facts: FactDocument | null }
  | { kind: "document"; id: string; doc: FactDocument };

export type TodayData = {
  lines: TodayLine[];
  review: TodayLine[];
  pursuits: TodayLine[];
  roles: TodayLine[];
  resumes: TodayLine[];
  // Pursuits with a reminder due now: the count beside Pursuits.
  due: number;
};

// Decisions waiting in Review, by kind in the order they unlock other work.
export function useReviewSummary(): ReviewSummary | undefined {
  return useQuery(api.review.summary);
}

// What needs them today, in Today's order: Review, then pursuits' reminders (and offers to answer), new strong roles,
// resumes to update and documents resting on changed facts. Undefined while loading.
export function useToday(): TodayData | undefined {
  const summary = useReviewSummary();
  const pursuits = useQuery(api.pursuits.list);
  const roles = useQuery(api.today.roles);
  const updates = useQuery(api.resume.updates, {});
  const documents = useQuery(api.factChanges.documents, {});
  const now = useNow();
  if (summary === undefined || !pursuits || !roles || !updates || !documents) return undefined;
  const review: TodayLine[] = summary.total > 0 ? [{ kind: "review", id: "review", summary }] : [];
  const due = pursuits.pursuits.map((p) => ({ p, reminder: remindersOf(p, now, pursuits.rules)[0] ?? null }));
  const pursuitLines = due.flatMap(({ p, reminder }): TodayLine[] =>
    reminder || p.status === "offer" ? [{ kind: "pursuit", id: `pursuit-${p.id}`, p, reminder }] : [],
  );
  const roleLines: TodayLine[] = roles.map((role) => ({ kind: "role", id: `role-${role.id}`, role }));
  const slotOf = (u: ResumeUpdate) => u.target.directionId ?? "base";
  const resumeLines: TodayLine[] = updates.map((update) => ({ kind: "resume", id: `resume-${slotOf(update)}`, update, facts: documents.find((d) => d.slot === slotOf(update)) ?? null }));
  const documentLines: TodayLine[] = documents
    .filter((d) => !d.slot || !updates.some((u) => slotOf(u) === d.slot))
    .map((doc) => ({ kind: "document", id: `document-${doc.target.kind}-${doc.target.id}`, doc }));
  return {
    lines: [...review, ...pursuitLines, ...roleLines, ...resumeLines, ...documentLines],
    review,
    pursuits: pursuitLines,
    roles: roleLines,
    resumes: [...resumeLines, ...documentLines],
    due: due.filter((d) => d.reminder).length,
  };
}
