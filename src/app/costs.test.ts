import { expect, test } from "vitest";
import { type Deciding, freshLook } from "../../convex/freshLook";
import { approveNote, rejectNote, thenNote } from "./costs";

test("approving a direction with nothing filled in says it's filled in and about what that costs; several add up; the rest is free", () => {
  expect(approveNote(0.032, 1)).toBe("Fills it in: about $0.03 · Undo with U");
  expect(approveNote(0.032, 3)).toBe("Fills 3 directions in: about $0.10 · Undo with U");
  expect(approveNote(0.002, 1)).toBe("Fills it in: under $0.01 · Undo with U");
  expect(approveNote(null, 1)).toBe("Fills it in: uses your AI budget · Undo with U");
  expect(approveNote(0.032, 0)).toBe("Free · Undo with U");
});

test("what finishing a review starts is said with the estimate for all of it", () => {
  const both = { gathers: true, insights: true };
  expect(thenNote(both, 0.004, 0.006)).toBe("Then reads insights and gathers skills: about $0.01");
  expect(thenNote(both, 0.002, 0.003)).toBe("Then reads insights and gathers skills: under $0.01");
  expect(thenNote(both, 0.004, null)).toBe("Then reads insights and gathers skills: uses your AI budget");
  expect(thenNote({ gathers: true, insights: false }, 0.012, null)).toBe("Then gathers skills: about $0.01");
  expect(thenNote({ gathers: false, insights: false }, 0.012, 0.02)).toBeNull();
  // On an approval, beside a direction's fill-in, and on a rejection, with and without a note.
  const then = thenNote(both, 0.004, 0.006);
  expect(approveNote(null, 0, then)).toBe("Then reads insights and gathers skills: about $0.01 · Undo with U");
  expect(approveNote(0.032, 1, then)).toBe("Fills it in: about $0.03 · Then reads insights and gathers skills: about $0.01 · Undo with U");
  expect(approveNote(null, 0, null)).toBe("Free · Undo with U");
  expect(rejectNote(then)).toBe("Then reads insights and gathers skills: about $0.01 · Undo with U");
  expect(rejectNote(null)).toBe("Free · Undo with U");
  expect(rejectNote(null, true)).toBe("Free · Undo with U · Why steers what’s proposed next");
});

test("a fresh look starts when a story or approved project has nothing left waiting, never for a change to an approved item", () => {
  const open = { stories: { s1: 2, s2: 0 }, projects: { trail: { open: 1, approved: true }, draft: { open: 1, approved: false } }, approvedFacts: 3 };
  const fact = (narrativeId: string | null, to: Deciding["to"] = "approved", projectKey: string | null = null, was = "proposed"): Deciding => ({ kind: "fact", narrativeId, projectKey, was, to });
  const both = { gathers: true, insights: true };
  const none = { gathers: false, insights: false };
  // A story with two facts waiting: one isn't the last, both are; rejecting the last one finishes it too.
  expect(freshLook([fact("s1")], open)).toEqual(none);
  expect(freshLook([fact("s1"), fact("s1")], open)).toEqual(both);
  expect(freshLook([fact("s1"), fact("s1", "rejected")], open)).toEqual(both);
  // A rewrite or edit of an approved fact, or rejecting one, starts nothing; a rejected one approved again does.
  expect(freshLook([fact("s2", "approved", null, "approved")], open)).toEqual(none);
  expect(freshLook([fact("s2", "rejected", null, "approved")], open)).toEqual(none);
  expect(freshLook([fact("s2", "approved", null, "rejected")], open)).toEqual(both);
  // A role gathers only, once its story has nothing left; one added by hand has no story.
  expect(freshLook([{ kind: "role", narrativeId: "s1", was: "proposed", to: "approved" }], open)).toEqual(none);
  expect(freshLook([{ kind: "role", narrativeId: "s2", was: "proposed", to: "approved" }], open)).toEqual({ gathers: true, insights: false });
  expect(freshLook([{ kind: "role", narrativeId: null, was: "proposed", to: "approved" }], open)).toEqual(none);
  expect(freshLook([{ kind: "role", narrativeId: "s2", was: "proposed", to: "rejected" }], open)).toEqual(none);
  // A project's last fact counts once the project is approved, or approved with it.
  expect(freshLook([fact(null, "approved", "trail")], open)).toEqual(both);
  expect(freshLook([fact(null, "approved", "draft")], open)).toEqual(none);
  expect(freshLook([fact(null, "approved", "draft"), { kind: "project", projectKey: "draft", was: "proposed", to: "approved" }], open)).toEqual(both);
  // Insights need two approved facts, gathering one.
  expect(freshLook([fact("s2", "approved", null, "rejected")], { ...open, approvedFacts: 0 })).toEqual({ gathers: true, insights: false });
  expect(freshLook([fact("s1", "rejected"), fact("s1", "rejected")], { ...open, approvedFacts: 0 })).toEqual(none);
  // Anything else, or nothing known yet, starts nothing.
  expect(freshLook([{ kind: "direction", was: "proposed", to: "approved" }], open)).toEqual(none);
  expect(freshLook([fact("s2")], undefined)).toEqual(none);
});
