import { getFunctionName } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Path } from "../../../convex/pursuitSteps";
import type { FirstPursuit, SetupStep } from "../../../convex/today";
import { pursuitsFixtures } from "../pursuits/fixtures";
import { settingsFixtures } from "../settings/fixtures";
import { yourDataFixtures } from "../settings/yourDataFixtures";
import { type Answers, answer } from "../storyConvex";
import type { TodayRole } from "./data";
import type { Setup } from "./GettingStarted";

// Getting started at each stage the boards show, for Today's stories: Setup at its OpenRouter key, first story, Apollo
// key or Google Drive; then your first pursuit starting, choosing a path, on the Outreach path (contacts found, the
// message to send), on the Apply path (the letter written, to apply), after the outreach message and after applying
// (following up), and all done (on Outreach, with Apply too still there). The pursuit is the Pursuits screen's Loadstar
// Systems role, so its people are the same. What the stories do (Start, choosing a path, Outreach too or Apply too,
// Mark Applied, Skip, Hide until later) changes the stage as the server would.

export type Stage = "key" | "story" | "apollo" | "drive" | "starting" | "choosing" | "outreach" | "apply" | "outreachSent" | "applied" | "done";

const DAY = 86_400_000;
const done = (detail: string | null = null, at: number | null = null): SetupStep => ({ done: true, detail, at });
const todo: SetupStep = { done: false, detail: null, at: null };
const SETUP_ORDER = ["signIn", "key", "story", "review", "goals", "resume", "apollo", "companies", "drive"] as const;
const DONE_LINES: Record<(typeof SETUP_ORDER)[number], string> = {
  signIn: "wren@example.com",
  key: "Key added · $25 a month",
  story: "Ironbridge Logistics, 2020–2023",
  review: "38 facts approved",
  goals: "3 directions · 2 limits",
  resume: "Written",
  apollo: "Key added · 400 credits a month",
  companies: "12 target companies",
  drive: "Skipped",
};
// How many Setup steps each stage has done.
const SETUP_DONE: Record<Stage, number> = { key: 1, story: 2, apollo: 6, drive: 8, starting: 9, choosing: 9, outreach: 9, apply: 9, outreachSent: 9, applied: 9, done: 9 };
// The path each stage's pursuit is on.
const PATH: Partial<Record<Stage, Path>> = { outreach: "outreach", apply: "apply", outreachSent: "outreach", applied: "apply", done: "outreach" };

export function gettingStartedFixtures(stage: Stage, now = Date.now()): Answers {
  let current = stage;
  let path: Path | null = PATH[stage] ?? null;
  let hidden = false;
  const skipped = new Set<"drive">(SETUP_DONE[stage] === 9 ? ["drive"] : []);
  const pursuits = pursuitsFixtures({ now });
  const settings = settingsFixtures({ fresh: stage === "key", drive: false });
  const ranked = pursuits[getFunctionName(api.roles.list)] as (args: object) => { page: TodayRole[] };

  const firstPursuit = (): FirstPursuit | null => {
    if (current === "starting" || SETUP_DONE[current] < 9) return null;
    const started = now - 3 * DAY;
    const reached = now - DAY;
    const sent = current === "outreachSent" || current === "done";
    const applied = current === "applied";
    const outreach = current === "outreach" || current === "outreachSent" || current === "done";
    const apply = current === "apply" || current === "applied";
    return {
      pursuitId: "pur-pm-load" as Id<"pursuits">,
      postingId: "post-pm-load" as Id<"postings">,
      title: "Senior Product Manager, Load Planning",
      company: "Loadstar Systems",
      direction: "Supply Chain Product",
      path,
      applyUrl: "https://jobs.example.com/loadstar/load-planning",
      steps: {
        pursuit: done(null, started),
        tailor: done("Tailored · covers 9 of 11 requirements"),
        path: path ? done(path === "both" ? "Apply and Outreach" : path === "outreach" ? "Outreach" : "Apply") : todo,
        contacts: outreach ? done("6 contacts") : todo,
        message: sent ? done("Sent to Rafael Duarte", reached) : todo,
        letter: apply ? done("Letter written · 3 answers kept") : todo,
        applied: applied ? done(null, reached) : todo,
        followUp: current === "done" ? done(null, now) : { done: false, detail: null, at: sent || applied ? reached + 7 * DAY : null },
      },
    };
  };

  const setup = (): Setup => {
    const n = SETUP_DONE[current];
    const steps = Object.fromEntries(
      SETUP_ORDER.map((k, i) => [k, i < n ? done(k === "drive" && !skipped.has("drive") ? "Connected · wren@example.com" : DONE_LINES[k]) : k === "drive" && skipped.has("drive") ? done("Skipped") : todo]),
    ) as Setup["steps"];
    return { workspaceId: "ws", hidden, storyUsdPerWord: stage === "story" ? null : 0.00002, firstStory: null, skipped: [...skipped], steps, firstPursuit: firstPursuit() };
  };

  return {
    ...settings,
    ...pursuits,
    ...(stage === "apollo" ? answer(api.apolloKey.status, () => ({ set: false as const })) : {}),
    // Nothing in the workspace yet: Getting started offers to bring it from another copy.
    ...(stage === "key" || stage === "story" ? yourDataFixtures("empty") : {}),
    ...answer(api.today.setup, setup),
    ...answer(api.today.roles, () => ranked({ filters: {} }).page.filter((r) => r.level === "strong" && !r.pursuit)),
    // Today's own lines, behind Getting started.
    ...answer(api.review.summary, () => ({ total: 0, groups: [] })),
    ...answer(api.resume.updates, () => []),
    ...answer(api.factChanges.documents, () => []),
    ...answer(api.activity.list, () => []),
    ...answer(api.today.hideSetup, ({ hidden: h }) => {
      hidden = h;
    }),
    ...answer(api.today.skipStep, ({ step, skipped: on }) => {
      if (on) skipped.add(step);
      else skipped.delete(step);
      if (on && current === "drive") current = "starting";
    }),
    ...answer(api.pursuits.start, () => {
      current = "choosing";
      return "pur-pm-load" as Id<"pursuits">;
    }),
    ...answer(api.pursuits.setPath, ({ path: p }) => {
      path = p ?? null;
      if (current === "choosing" && p) current = p === "apply" ? "apply" : "outreach";
    }),
    ...answer(api.pursuits.setStatus, ({ status }) => {
      current = status === "applied" ? "applied" : "apply";
    }),
  };
}
