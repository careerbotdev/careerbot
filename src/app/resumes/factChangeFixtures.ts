import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { answer, type Answers } from "../storyConvex";

// Fixture data for lines resting on changed facts, on the base resume's current version (v-base-3): the inventory
// fact edited (about $9 million freed is now about $8.6 million, after finance's count) and the Operator of the Year
// fact rejected. "stale": the two lines, offered Update lines. "update": the new lines waiting to apply or discard, one in
// their own words. Update lines, Apply, Discard and Use the new line move between them as the real ones do.

type ForDocument = NonNullable<FunctionReturnType<typeof api.factChanges.forDocument>>;

const INVENTORY = "Took finished-goods inventory from 41 to 29 days of supply without lowering service, freeing about $9 million in working capital for the business.";
const AWARD = "Named Operator of the Year for 2025 after moving production out of a closing plant without missing a retail order.";
const THEIRS = "Cut inventory from 41 to 29 days of supply with no drop in service, which put about $9 million back in the bank.";

const STALE: ForDocument["stale"] = [
  {
    index: 1,
    text: INVENTORY,
    theirs: THEIRS,
    factIds: ["f2"],
    change: "edited",
    facts: [{ id: "f2", now: "Took finished-goods inventory from 41 to 29 days of supply without lowering service, freeing about $8.6 million in working capital.", was: "Took finished-goods inventory from 41 to 29 days of supply without lowering service, freeing about $9 million in working capital." }],
  },
  { index: 3, text: AWARD, theirs: null, factIds: ["f4"], change: "rejected", facts: [{ id: "f4", now: null, was: "Named Brightwater’s Operator of the Year for 2025." }] },
];

const UPDATE: NonNullable<ForDocument["update"]> = {
  at: Date.UTC(2026, 8, 29, 15),
  lines: [
    { before: INVENTORY, theirs: THEIRS, change: "edited", text: "Took finished-goods inventory from 41 to 29 days of supply without lowering service, freeing about $8.6 million in working capital for the business.", use: false },
    { before: AWARD, theirs: null, change: "rejected", text: "", use: true },
  ],
};

export function factChangeAnswers(mode: "stale" | "update"): Answers {
  let state: ForDocument = mode === "stale" ? { stale: STALE, update: null, run: null } : { stale: STALE, update: UPDATE, run: { status: "done", error: null } };
  const ours = (id: string) => id === "v-base-3";
  return {
    ...answer(api.factChanges.forDocument, ({ target }) => (ours(target.id) ? state : { stale: [], update: null, run: null })),
    ...answer(api.factChanges.update, () => {
      state = { ...state, update: UPDATE, run: { status: "done", error: null } };
      return "job-lines" as Id<"jobs">;
    }),
    ...answer(api.factChanges.setUse, ({ index, use }) => {
      if (state.update) state = { ...state, update: { ...state.update, lines: state.update.lines.map((l, i) => (i === index ? { ...l, use } : l)) } };
    }),
    ...answer(api.factChanges.apply, () => {
      state = { stale: [], update: null, run: state.run };
    }),
    ...answer(api.factChanges.discard, () => {
      state = { ...state, update: null };
    }),
  };
}
