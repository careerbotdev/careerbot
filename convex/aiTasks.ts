import { v } from "convex/values";

// What CareerBot uses AI for. Which model and reasoning effort each task uses is the workspace's own setting: one
// default for every task, and a task's own choice where it has one (aiSettings.ts), chosen from OpenRouter's current
// list. There is no default in code or configuration, so nothing goes stale.
export const AI_TASKS = {
  extract: "Reading narratives",
  projects: "Reading projects",
  rework: "Rewriting facts",
  insights: "Insights",
  directions: "Directions and search criteria",
  companies: "Screening companies",
  followups: "Follow-up questions",
  resume: "Writing resumes",
  letter: "Writing cover letters",
  ask: "Ask about this role",
  outreach: "Writing outreach",
  followUp: "Writing follow-ups",
  duplicates: "Finding duplicates",
  sameWork: "Finding same work",
  skills: "Gathering skills",
  lineCheck: "Checking edited lines",
  firstCall: "Test calls",
  roleSort: "Sorting roles",
  roleSortJev: "Sorting roles with Jev",
} as const;
export type AiTask = keyof typeof AI_TASKS;

// Tasks answered by a decision model (Jev, through OpenRouter's Decisions API), not a chat model. A chat model can't
// answer them, so they never use the workspace's default model; each needs its own choice.
export const DECISION_TASKS: Partial<Record<AiTask, true>> = { roleSortJev: true };

export const aiTask = v.union(
  v.literal("extract"),
  v.literal("projects"),
  v.literal("rework"),
  v.literal("insights"),
  v.literal("directions"), v.literal("companies"),
  v.literal("followups"),
  v.literal("resume"),
  v.literal("letter"),
  v.literal("ask"),
  v.literal("outreach"),
  v.literal("followUp"),
  v.literal("duplicates"),
  v.literal("sameWork"),
  v.literal("skills"),
  v.literal("lineCheck"),
  v.literal("firstCall"),
  v.literal("roleSort"),
  v.literal("roleSortJev"),
);

// OpenRouter's reasoning effort levels; "none" turns reasoning off. Unset means the model's own default, which for some
// models is reasoning at length.
export const reasoningLevel = v.union(v.literal("none"), v.literal("low"), v.literal("medium"), v.literal("high"));
export type Reasoning = "none" | "low" | "medium" | "high";

export type ModelChoice = { model: string; reasoning?: Reasoning };
