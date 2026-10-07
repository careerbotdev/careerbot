import { api } from "../../../convex/_generated/api";
import type { Release } from "../../../convex/releases";
import type { UpdateStatus } from "../../../convex/updates";
import { answer, type Answers } from "../storyConvex";

// A self-hosted copy's update check, for the stories of Settings, Updates and Today: the copy runs 0.7.0, checked this
// morning. "out": 0.8.0 is out and has steps to read first, 0.7.1 before it; "current": nothing newer; "unchecked": no
// check has read the list yet (just installed, or careerbot.dev couldn't be reached); "off": its owner turned the
// check off. Turning the check on or off changes it as the deployment would.

export type UpdateState = "out" | "current" | "unchecked" | "off";

export const NEWER: Release[] = [
  {
    version: "0.8.0",
    date: "2026-10-20",
    summary: "See what changed after each update, and, on a copy you run yourself, when a new version is out. Copies you run yourself now install ready-made images for each version.",
    new: [
      "A changelog at careerbot.dev/changelog, with an RSS feed.",
      "After an update, What’s new opens the notes for the new version.",
      "On a copy you run yourself, Settings shows when a new version is out, with its notes and the steps to update.",
    ],
    better: [],
    fixed: ["Release notes on GitHub match the changelog."],
    selfHost: ["Docker Compose now pulls CareerBot’s images instead of building them. Get the new `compose.yaml` with `git pull` before you update."],
    needsAction: true,
    shots: [],
  },
  {
    version: "0.7.1",
    date: "2026-10-12",
    summary: "Outreach messages read better to recruiters. A pursuit started from a company keeps its direction.",
    new: [],
    better: ["Outreach messages to recruiters ask for a short call instead of a referral."],
    fixed: ["A pursuit started from a company’s details keeps the direction it was started with."],
    selfHost: [],
    needsAction: false,
    shots: [],
  },
];

export function updateFixtures(state: UpdateState = "out"): Answers {
  const checkedAt = state === "unchecked" ? null : new Date().setHours(9, 2, 0, 0);
  let off = state === "off";
  const status = (): UpdateStatus => {
    const newer = off || state !== "out" ? [] : NEWER;
    return { current: "0.7.0", off, offByEnv: false, checkedAt: off ? null : checkedAt, newer, needsAction: newer.some((r) => r.needsAction) };
  };
  return {
    ...answer(api.updates.status, status),
    ...answer(api.updates.setCheck, ({ on }) => {
      off = !on;
    }),
  };
}
