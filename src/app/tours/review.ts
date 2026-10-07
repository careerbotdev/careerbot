import type { TourDef } from "@/components/Tour";

// Review: the groups of decisions waiting, the card for one decision, its keys, and what was turned down.
export const REVIEW_TOUR: TourDef = {
  id: "review",
  name: "Review",
  steps: [
    { title: "Review", body: "Every decision waiting for you: new facts, roles and updates. You go through them one at a time, or check several and decide them together." },
    { target: "review.groups", side: "right", title: "Groups", body: "Decisions sorted by kind, each with how many wait. Groups that unlock other work come first. Open a group to go through it." },
    { target: "review.mode", side: "bottom", title: "Cards or List", body: "Cards shows one decision at a time. List shows the whole group as rows, where you can check several and approve or reject them together." },
    { target: "review.card", side: "left", title: "The card", body: "One decision, with what it’s built on and what you can do with it. Rejecting asks why, if you like. Skip for now in its menu moves on and leaves it waiting." },
    { target: "review.keys", side: "top", title: "Keys", body: "Each action’s letter decides the card: A approves, R rejects, E edits where it can. J and K move to the next and previous card; U undoes the last decision." },
    { target: "review.declined", side: "right", title: "Turned down", body: "In List, what you turned down in this group, with its reason. Restore brings one back." },
    { target: "review.more", side: "bottom", title: "More for Review", body: "Suggest questions, Look for conflicts and Find facts said twice look for new things to decide. They use your AI budget, and what they find waits here." },
  ],
};
