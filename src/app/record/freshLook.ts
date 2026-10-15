"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { type Deciding, freshLook } from "../../../convex/freshLook";
import { approveNote, rejectNote, thenNote } from "../costs";

// An item of the record as a decision on it: its kind and status, the story it came from and its project.
type Decidable = { kind: string; status?: string; sources?: { narrativeId?: string }[]; projectKey?: string };

// Deciding the last of a story's or project's items (or approving a role or project with none left) starts a fresh look
// (convex/freshLook.ts): gathering skills and reading insights, which are paid. The notes on what decides record items
// say so before the click, with the estimate. `then`: those words alone (null when it starts nothing), for a note
// worded otherwise.
export function useFreshLook() {
  const costs = useQuery(api.estimates.costs, {});
  const open = useQuery(api.insights.freshLookOpen);
  const then = (items: Decidable[], to: Deciding["to"]) =>
    thenNote(freshLook(items.map((i) => ({ kind: i.kind, narrativeId: i.sources?.[0]?.narrativeId, projectKey: i.projectKey, was: i.status, to })), open), costs?.skills, costs?.insights);
  return {
    then,
    approveNote: (items: Decidable[]) => approveNote(null, 0, then(items, "approved")),
    rejectNote: (items: Decidable[], withNote = false) => rejectNote(then(items, "rejected"), withNote),
  };
}
