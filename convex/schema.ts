import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v, type Validator } from "convex/values";
import { aiTask, reasoningLevel } from "./aiTasks";
import { layoutProject, layoutSkill, resumeDoc, resumeLayout, resumeLength, shownDoc } from "./resumeDoc";
import { CLOSED_REASONS, PATHS, PURSUIT_STATUSES, REMINDER_RULES } from "./pursuitSteps";
import { CONTACT_GROUPS } from "./contactGroups";
import { BOARD_PROVIDERS } from "./boardProviders";
import { CLEARANCES, detailsValidator, EMPLOYMENT_TYPES, LEVELS, SETUPS } from "./roleDetails";
import { conflictData, contextData, directionData, factData, followupData, insightData, itemStatus, limitData, projectData, roleData, skillData } from "./itemShapes";
import { factMarks, resumeBasis } from "./resumeBasis";
import { release } from "./releases";
import { compareRow, rubric } from "./roleRubric";

const pursuitStatus = v.union(...PURSUIT_STATUSES.map((s) => v.literal(s)));
const closedReason = v.union(...CLOSED_REASONS.map((s) => v.literal(s)));
const reminderRule = v.union(...REMINDER_RULES.map((s) => v.literal(s)));
const pursuitPath = v.union(...PATHS.map((s) => v.literal(s)));
const contactGroup = v.union(...CONTACT_GROUPS.map((s) => v.literal(s)));

// What a note is on: a pursuit, a company, a role posting, an item of the record (fact, role, project, direction…), a
// resume (a base or direction resume's version, or a tailored resume), or a story (a narrative).
export const noteSubject = v.union(
  v.object({ kind: v.literal("pursuit"), id: v.id("pursuits") }),
  v.object({ kind: v.literal("company"), id: v.id("companies") }),
  v.object({ kind: v.literal("posting"), id: v.id("postings") }),
  v.object({ kind: v.literal("item"), id: v.id("items") }),
  v.object({ kind: v.literal("resume"), id: v.id("resumes") }),
  v.object({ kind: v.literal("narrative"), id: v.id("narratives") }),
);

// Who started a job, and so who a paid call was for: "you", the person (a button), or "automatic", CareerBot on its own
// (the daily roles check, insights after a review, reading a limit, a follow-on step). Unset on rows from before it was
// kept: unknown.
export const origin = v.union(v.literal("you"), v.literal("automatic"));

// One row shape per kind of item; `data` differs by kind.
function item<K extends string, D extends Validator<Record<string, unknown>, "required", string>>(kind: K, data: D) {
  return v.object({
    workspaceId: v.id("workspaces"),
    kind: v.literal(kind),
    status: itemStatus,
    data,
    // Where it came from: narrative + version + the passages it rests on. Every line has a root. It counts while any of
    // its sources does (recordContext.sourceCheck): a narrative they haven't rejected, or its approved project.
    sources: v.array(v.object({ narrativeId: v.id("narratives"), version: v.number(), quotes: v.array(v.string()) })),
    roleKey: v.optional(v.string()),
    // A project and its facts share the project's key (itemShapes.projectKeyOf).
    projectKey: v.optional(v.string()),
    runId: v.optional(v.id("jobs")),
    // Each time they undid its approval (extract.unapprove), or a direction part's (directions.unapprovePart).
    undone: v.optional(v.array(v.object({ at: v.number(), part: v.optional(v.union(v.literal("detail"), v.literal("criteria"))) }))),
    // A fact or insight whose approval is in the reports' count (tallies factsApproved, insightsApproved), so it's counted
    // once and taken back only if it was.
    tallied: v.optional(v.boolean()),
    at: v.number(),
  });
}

export default defineSchema({
  ...authTables,

  // Convex Auth's people, with what a self-hosted copy adds (account.ts): username, the name they sign in with
  // (password accounts only; also their account's id); owner, the first account, made with the setup code, who adds the
  // others; temporaryPassword, the password was set by the owner (added, or reset) and is changed at the next sign-in.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    username: v.optional(v.string()),
    owner: v.optional(v.boolean()),
    temporaryPassword: v.optional(v.boolean()),
    // When they last signed in (a new session; auth.ts), for the owner's list of people.
    lastSignInAt: v.optional(v.number()),
    // The newest version of CareerBot they've used (updates.sawVersion): a newer one shows What's new once.
    seenVersion: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_owner", ["owner"]),

  // A self-hosted copy's setup codes (account.ts): only the newest unused one creates the owner account, once, and only
  // while there's no owner. Kept as a SHA-256 hash; wrongTries counts guesses, and past a few the code stops working.
  setupCodes: defineTable({
    hash: v.string(),
    usedAt: v.optional(v.number()),
    wrongTries: v.number(),
  }),

  // A self-hosted copy's check for a new version (updates.ts), one row: off, its owner turned it off in Settings,
  // Updates; checkedAt, when careerbot.dev/releases.json was last read; newer, the releases it listed that were newer
  // than this copy then, newest first.
  updateCheck: defineTable({
    off: v.optional(v.boolean()),
    checkedAt: v.optional(v.number()),
    newer: v.optional(v.array(release)),
  }),

  // One person's search. Everything else CareerBot stores belongs to exactly one workspace. setupHidden: Getting started
  // on Today was put away until later (Today, Hide until later, or Show Today once it's done); it shows again when
  // unset. setupSkipped: Getting started steps they chose to leave out (Google Drive; "people" is kept only so rows from
  // before the first pursuit had paths still read; nothing sets or reads it). toursOffered: the screens whose tour was
  // offered once already (tours.ts), so the offer never comes back on its own. demo: the read-only demo workspace
  // (demo.ts): nothing in it can be changed, and its one member is the shared user the demo signs visitors in as. began:
  // when the search began, on a copy of another workspace (the demo, demoSeed.ts), whose row is newer than what it
  // holds; Reports count from it (unset: when the row was made). asOf: the moment a workspace is held at, the demo's
  // snapshot (demoSeed.ts): what's new, due, recent or out of date, and this month's, count from it instead of the
  // clock (workspaces.clockOf), so a demo seeded once never ages; unset: now.
  workspaces: defineTable({
    name: v.string(),
    setupHidden: v.optional(v.boolean()),
    setupSkipped: v.optional(v.array(v.union(v.literal("drive"), v.literal("people")))),
    toursOffered: v.optional(v.array(v.string())),
    demo: v.optional(v.boolean()),
    began: v.optional(v.number()),
    asOf: v.optional(v.number()),
  }).index("by_demo", ["demo"]),

  // Who can use a workspace. For now each person has exactly one, created on first sign-in.
  memberships: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  // Bring-your-own service keys, encrypted with secretBox. Never sent to a client.
  apiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    service: v.union(v.literal("openrouter"), v.literal("apollo"), v.literal("brave")),
    sealed: v.string(),
    last4: v.string(),
    setAt: v.number(),
  }).index("by_workspace_service", ["workspaceId", "service"]),

  // One row per paid call to an outside service. Budgets and usage reports read from here.
  usage: defineTable({
    workspaceId: v.id("workspaces"),
    service: v.union(v.literal("openrouter"), v.literal("apollo")),
    purpose: v.string(),
    model: v.optional(v.string()),
    endpoint: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    // An AI call's reservation: the most it could cost (its model's highest prices, the prompt and its max_tokens),
    // held against the budget until it settles. An indeterminate call keeps it until the daily check settles it.
    reservedUsd: v.optional(v.number()),
    credits: v.optional(v.number()),
    ok: v.boolean(),
    // OpenRouter's id for the generation, so a call can be looked up in OpenRouter's activity later.
    generationId: v.optional(v.string()),
    // "reserved": the call is running, holding its maximum cost. "settled": the real cost. "indeterminate": it may have
    // been charged more than recorded (the request failed on the way, or the reply didn't say what it cost); the daily
    // check (metering.reconcile) settles it from the provider's own figures. "unresolved": the provider couldn't say
    // either, so only what's recorded is known (Apollo: at most `credits`). Rows from before reservations existed have no
    // state and are settled.
    state: v.optional(v.union(v.literal("reserved"), v.literal("settled"), v.literal("indeterminate"), v.literal("unresolved"))),
    // An indeterminate AI call: the generations whose cost the reply didn't give (looked up by id), and how many requests
    // got no reply at all (nothing to look up).
    lookup: v.optional(v.array(v.string())),
    unseen: v.optional(v.number()),
    // What it was spent on: the job it ran in, who started that (origin), and the pursuit it was for. Unset on calls from
    // before these were kept, and on the operator's own runs.
    jobId: v.optional(v.id("jobs")),
    origin: v.optional(origin),
    pursuitId: v.optional(v.id("pursuits")),
    // Set once its settled cost is in spendTotals, so it's added once.
    inTotals: v.optional(v.boolean()),
    at: v.number(),
  })
    .index("by_workspace_service_at", ["workspaceId", "service", "at"])
    .index("by_workspace_state", ["workspaceId", "state", "at"]),

  // Settled spending as running totals for the reports (reports.ts), so a year of calls reads as a few rows a month: per
  // workspace, month (UTC), service, task (the call's purpose without its detail: "find companies", not "find
  // companies: Sales"), origin (unset: unknown) and pursuit (when the call was for one). Each settled call adds to one
  // of a few shards, picked at random, so calls settling at once rarely write the same row.
  spendTotals: defineTable({
    workspaceId: v.id("workspaces"),
    month: v.number(),
    service: v.union(v.literal("openrouter"), v.literal("apollo")),
    task: v.string(),
    origin: v.optional(origin),
    pursuitId: v.optional(v.id("pursuits")),
    shard: v.number(),
    usd: v.number(),
    credits: v.number(),
    calls: v.number(),
  }).index("by_key", ["workspaceId", "month", "service", "task", "origin", "pursuitId", "shard"]),

  // Counts for the reports (reports.ts, tallies.ts), kept up where things happen, so a report reads a few rows a day
  // instead of every job, company, fact or resume. day: the UTC day it happened (0 for standing counts, "roles"). key:
  // what it's split by (a job's kind; for "roles", a direction and its level or state). A change is a row of its own
  // (no `folded`), never a change to a row another write may change, so writes at once never collide over a count;
  // tallies.fold adds changes into the count's one folded row (folded) every few minutes. A report adds up both.
  // shard: rows from before changes were rows of their own, folded like changes.
  // Each row a count is about carries whether it's in the count (its `tallied`), so it's counted once, however the
  // counting of what was there before (reports.backfill) and changes as they happen interleave.
  // Metrics: jobDone, jobFailed (by kind); companies (found); targets (made a target, less those no longer one);
  // factsApproved, insightsApproved (approvals, less undone ones); resumeKept (base and direction resume versions
  // kept), resumeUpdated (of those, written from Resume updates), tailored (tailored resumes written); strongRoles
  // (roles that became a strong fit for any direction); roles (listed roles now, by direction and level).
  tallies: defineTable({
    workspaceId: v.id("workspaces"),
    metric: v.union(
      v.literal("jobDone"), v.literal("jobFailed"), v.literal("companies"), v.literal("targets"), v.literal("factsApproved"), v.literal("insightsApproved"),
      v.literal("resumeKept"), v.literal("resumeUpdated"), v.literal("tailored"), v.literal("strongRoles"), v.literal("roles"),
    ),
    day: v.number(),
    key: v.optional(v.string()),
    n: v.number(),
    folded: v.optional(v.literal(true)),
    shard: v.optional(v.number()),
  })
    .index("by_metric", ["workspaceId", "metric", "day", "key", "folded"])
    .index("by_folded", ["folded"]),

  // Each workspace's AI spending per month as a running total, so an AI call's budget check reads a few rows, not every
  // call of the month (budgets.ts). Shard 0: what was spent and held before the month's total started, summed once from
  // usage. Shards 1 to 8: each settled call adds its cost to one, picked at random. held: reservations of calls not
  // settled yet, added when a call is reserved and taken off when it settles.
  aiSpend: defineTable({
    workspaceId: v.id("workspaces"),
    month: v.number(),
    shard: v.number(),
    usd: v.number(),
    held: v.optional(v.number()),
  }).index("by_workspace_month", ["workspaceId", "month", "shard"]),

  // Each AI model's highest prices across the providers OpenRouter may route it to (USD per token, and per request),
  // what AI calls reserve against the budget (modelPrices.ts). fixed: false for routers whose price depends on the
  // model they pick. maxTokens: the most any provider writes in one reply. context: the most tokens any provider takes
  // in one request, prompt and reply together. structured: some provider keeps a reply to a JSON schema. Refreshed
  // hourly and when a call finds one missing or an hour old.
  modelPrices: defineTable({
    model: v.string(),
    prompt: v.number(),
    completion: v.number(),
    request: v.number(),
    fixed: v.boolean(),
    maxTokens: v.optional(v.number()),
    context: v.optional(v.number()),
    structured: v.optional(v.boolean()),
    at: v.number(),
  }).index("by_model", ["model"]),

  // Monthly limits the person sets. No row means no AI budget yet, so nothing is spent.
  budgets: defineTable({
    workspaceId: v.id("workspaces"),
    aiMonthlyUsd: v.number(),
    apolloMonthlyCredits: v.number(),
    // "on": automated Apollo work runs; "onRequest": only when the person asks; "paused": never.
    apolloMode: v.union(v.literal("on"), v.literal("onRequest"), v.literal("paused")),
  }).index("by_workspace", ["workspaceId"]),

  // Background work. A job that hits a budget is paused, not failed, and resumes where it left off.
  jobs: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.union(v.literal("firstCall"), v.literal("extract"), v.literal("rework"), v.literal("compare"), v.literal("goals"), v.literal("check"), v.literal("limitRule"), v.literal("insights"), v.literal("followups"), v.literal("resume"), v.literal("directions"), v.literal("duplicates"), v.literal("discover"), v.literal("enrich"), v.literal("roles"), v.literal("project"), v.literal("skills"), v.literal("sameWork"), v.literal("letter"), v.literal("ask"), v.literal("outreach"), v.literal("followUp"), v.literal("driveSync"), v.literal("lineCheck"), v.literal("lineUpdate")),
    args: v.any(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("paused"), v.literal("done"), v.literal("failed")),
    pausedFor: v.optional(v.union(v.literal("openrouter"), v.literal("apollo"))),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    // When it last started running, and how many times it was started; an interrupted run is picked up again.
    startedAt: v.optional(v.number()),
    attempts: v.optional(v.number()),
    // Steps a run has finished (e.g. each paid Apollo search), so a resumed run doesn't pay for them again.
    done: v.optional(v.array(v.object({ step: v.string(), result: v.any() }))),
    // Done or failed and in the reports' count of it (tallies jobDone, jobFailed).
    tallied: v.optional(v.boolean()),
    // Who started it (unset: from before it was kept).
    origin: v.optional(origin),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_status", ["status"]),

  // A person's own account of a job, project or what they want next. Written in any order.
  // "goals" is the single goals narrative; "career" covers an employer or project; "note" is a quick addition.
  narratives: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.union(v.literal("career"), v.literal("goals"), v.literal("note")),
    title: v.string(),
    body: v.string(),
    version: v.number(),
    updatedAt: v.number(),
    // Set when they rejected it as a source: what came from it stops counting (sources.ts) until they restore it.
    rejectedAt: v.optional(v.number()),
    // Why they rejected it, when they said (cleared on restore).
    rejectedBecause: v.optional(v.string()),
    // The role it's about, when they linked it to one (a quick note on Brightwater): the role item's roleKey.
    roleKey: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId", "updatedAt"])
    .index("by_workspace_kind", ["workspaceId", "kind"]),

  // Every saved version of a narrative, so changes can be compared and rolled back.
  narrativeVersions: defineTable({
    workspaceId: v.id("workspaces"),
    narrativeId: v.id("narratives"),
    version: v.number(),
    title: v.string(),
    body: v.string(),
    at: v.number(),
  })
    .index("by_narrative", ["narrativeId", "version"])
    .index("by_workspace", ["workspaceId"]),

  // Everything CareerBot understands about a person, as proposals they review.
  // kind "direction": a kind of work they want next (from the goals narrative). "limit": a hard limit (pay, place, travel...).
  // kind "role": a structured record entry (employer, title, dates...). "fact": what they did in a role.
  // "followup": an optional question whose answer would sharpen the record; "approved" once answered, "skipped" if not now.
  // "conflict": a question where a narrative disagrees with the approved record; "approved" once answered.
  // "context": background that sharpens facts but isn't reviewed. "insight": a cross-record observation.
  // "project": one of their GitHub repositories as an entry of its own, with facts read from its files.
  // "skill", "tool", "certification": what the record shows they know or hold, with where it shows it (skills.ts).
  // Each kind has its own `data` shape (itemShapes.ts); the database refuses a row that doesn't match its kind.
  items: defineTable(
    v.union(
      item("role", roleData),
      item("fact", factData),
      item("context", contextData),
      item("insight", insightData),
      item("direction", directionData),
      item("limit", limitData),
      item("conflict", conflictData),
      item("followup", followupData),
      item("project", projectData),
      item("skill", skillData),
      item("tool", skillData),
      item("certification", skillData),
    ),
  )
    .index("by_workspace_kind_status", ["workspaceId", "kind", "status"])
    .index("by_run", ["runId"]),

  // A task's own model and reasoning effort, when it has one. No row: the task uses the workspace's default
  // (aiDefaults), except decision tasks (aiTasks.ts DECISION_TASKS), which only ever use their own.
  aiSettings: defineTable({
    workspaceId: v.id("workspaces"),
    task: aiTask,
    model: v.string(),
    reasoning: v.optional(reasoningLevel),
  }).index("by_workspace_task", ["workspaceId", "task"]),

  // The one model and reasoning effort a workspace uses for every task without its own choice. At most one per workspace.
  aiDefaults: defineTable({
    workspaceId: v.id("workspaces"),
    model: v.string(),
    reasoning: v.optional(reasoningLevel),
  }).index("by_workspace", ["workspaceId"]),

  // The contact block at the top of every exported resume. One per workspace, written by the person.
  profiles: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    links: v.array(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  // Companies found for the workspace, from Apollo searches or added by hand. One row per company.
  companies: defineTable({
    workspaceId: v.id("workspaces"),
    apolloId: v.optional(v.string()),
    name: v.string(),
    domain: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    foundedYear: v.optional(v.number()),
    // Filled in from free sources: the company's own website and its public job board. Each part says where it came from.
    details: v.optional(
      v.object({
        summary: v.optional(v.string()),
        siteDescription: v.optional(v.string()),
        board: v.optional(v.object({ provider: v.union(...BOARD_PROVIDERS.map((p) => v.literal(p))), slug: v.string(), url: v.string(), foundBy: v.optional(v.string()) })),
        jobs: v.optional(v.object({ open: v.number(), remote: v.number(), matching: v.array(v.object({ title: v.string(), url: v.string(), location: v.optional(v.string()), direction: v.string() })) })),
        sources: v.array(v.string()),
        at: v.number(),
      }),
    ),
    // How well it fits each direction, judged from its details against the approved direction and limits.
    fit: v.optional(v.array(v.object({ directionId: v.id("items"), level: v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none")), reason: v.string() }))),
    fitAt: v.optional(v.number()),
    // A job board link they gave, used instead of looking for one (for sites that hide their board).
    boardUrl: v.optional(v.string()),
    // Set when they ask for a company to be checked again; checked before anything else.
    recheckAt: v.optional(v.number()),
    // Their roles, as last read from the job board: when it last read (at) or last failed (failedAt), how many roles were
    // read, and the board's own total when it gives one. rolesCheckAt: they asked for the roles to be read again.
    roles: v.optional(v.object({ at: v.optional(v.number()), failedAt: v.optional(v.number()), read: v.number(), total: v.optional(v.number()) })),
    rolesCheckAt: v.optional(v.number()),
    // A roles worker working out what the company repeats across its postings, so others wait instead of doing it too.
    textsCleaning: v.optional(v.object({ by: v.string(), at: v.number() })),
    // AI judgment against their approved company goals: a signal with a reason, never a verdict. keep: their override.
    goals: v.optional(v.object({ level: v.union(v.literal("fits"), v.literal("partly"), v.literal("doesnt"), v.literal("unknown")), reason: v.string(), keep: v.optional(v.boolean()), at: v.number() })),
    // Their own rating. "excited" makes it a target. reason: why it's not for them, when they said.
    rating: v.optional(v.object({ value: v.union(v.literal("excited"), v.literal("maybe"), v.literal("no")), reason: v.optional(v.string()), at: v.number() })),
    // Not a place to work (a recruiter, job board, association…). Kept and shown, so it can be restored.
    screened: v.optional(v.object({ employer: v.boolean(), kind: v.string(), by: v.union(v.literal("rule"), v.literal("ai"), v.literal("you")), at: v.number() })),
    // Every way it was found: which direction, by its criteria or as a lookalike of seed companies.
    found: v.array(v.object({ directionId: v.optional(v.id("items")), via: v.union(v.literal("criteria"), v.literal("lookalike"), v.literal("hiring"), v.literal("large"), v.literal("hand")), runId: v.optional(v.id("jobs")), at: v.number() })),
    // In the reports' counts: of companies found (tallies companies), and of targets while it is one (targets).
    talliedFound: v.optional(v.boolean()),
    talliedTarget: v.optional(v.boolean()),
    at: v.number(),
  })
    .index("by_workspace", ["workspaceId", "at"])
    .index("by_workspace_apollo", ["workspaceId", "apolloId"]),

  // Every role read from the job boards of Targets and Maybe companies. One row per role at a company: a role listed
  // twice (same board id, or same title and location) is one row. closedAt: gone from a complete read of the board.
  postings: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("companies"),
    provider: v.union(...BOARD_PROVIDERS.map((p) => v.literal(p))),
    // The board's own id for the role, or its link when the board has none.
    externalId: v.string(),
    url: v.string(),
    // The board's own application link, when it gives one apart from the role's page.
    applyUrl: v.optional(v.string()),
    title: v.string(),
    location: v.optional(v.string()),
    remote: v.boolean(),
    // When its full description was looked for, and whether there was one (the text is in postingTexts).
    descriptionAt: v.optional(v.number()),
    hasDescription: v.optional(v.boolean()),
    postedAt: v.optional(v.number()),
    // Its details as the job board states them (pay, setup, employment type…), kept from every read; they win over
    // what the AI read (details). The two are merged, each field with where it came from (roleDetails.ts).
    boardDetails: v.optional(detailsValidator),
    // What judging read from its description (details), and its two-part brief: job, what it is (from the posting
    // only); forYou, why it fits them and what's thin (from their approved record only). at: when judged.
    details: v.optional(v.object({ ...detailsValidator.fields, at: v.number() })),
    brief: v.optional(v.object({ job: v.string(), forYou: v.string(), at: v.number() })),
    firstSeen: v.number(),
    lastSeen: v.number(),
    closedAt: v.optional(v.number()),
    // How well it fits each approved direction, judged from its description. Judged only for directions the sort passed
    // it to; "none" when judged and not fitting. score: 0 to 100 (unset on verdicts from before scores). method: what
    // judged it; sortedBy: what sorted it there; directionAt: when the direction had last changed as of this verdict, so
    // a verdict from before a change shows. Verdicts from before sorting have neither. rubric: how it was scored
    // (roleRubric.ts; unset: v1, from before rubrics); stretch: under v2, the gaps between the role and them, in short
    // plain words (unset: none).
    fit: v.optional(
      v.array(
        v.object({
          directionId: v.id("items"),
          level: v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none")),
          reason: v.optional(v.string()),
          score: v.optional(v.number()),
          method: v.union(v.literal("model"), v.literal("jev")),
          sortedBy: v.optional(v.union(v.literal("model"), v.literal("jev"))),
          directionAt: v.optional(v.number()),
          rubric: v.optional(rubric),
          stretch: v.optional(v.array(v.string())),
        }),
      ),
    ),
    fitAt: v.optional(v.number()),
    // The quick sort before judging: the directions it could plausibly be (only those are judged; the rest are sorted
    // out), every direction it was sorted against with when that direction had last changed, and what sorted it.
    sort: v.optional(
      v.object({
        directionIds: v.array(v.id("items")),
        against: v.array(v.object({ directionId: v.id("items"), directionAt: v.number() })),
        method: v.union(v.literal("model"), v.literal("jev")),
        at: v.number(),
      }),
    ),
    // Directions they asked to rank this role for again (roles.rankAgain): sorted, then judged, on the next pass.
    rerank: v.optional(v.array(v.id("items"))),
    // A pass's next step for it: its description, the sort, or judging. A worker claims it (claimedBy, claimedAt) before
    // working on it, so no two work on the same role; a claim older than 10 minutes is free again.
    queue: v.optional(v.union(v.literal("text"), v.literal("sort"), v.literal("judge"))),
    claimedAt: v.optional(v.number()),
    claimedBy: v.optional(v.string()),
    // Where it sits among the free roles of its step: a random number from 0 to 1, given when it's first queued. Workers
    // claiming at once each start at a random place, so they rarely reach for the same roles.
    spot: v.optional(v.number()),
    // A step that failed: how many times this pass, when last, and why. Three in one pass set it aside until the next.
    failed: v.optional(v.object({ count: v.number(), at: v.number(), error: v.string() })),
    // Their own rating, and for "no" the reason they gave (optional). "no" keeps the role, set aside, so it can be restored.
    rating: v.optional(v.object({ value: v.union(v.literal("interested"), v.literal("no")), at: v.number(), reason: v.optional(v.string()) })),
  })
    .index("by_workspace", ["workspaceId", "closedAt"])
    .index("by_company", ["companyId", "closedAt"])
    .index("by_external", ["workspaceId", "companyId", "externalId"])
    .index("by_queue", ["workspaceId", "queue", "claimedAt", "spot"])
    // Roles they turned down, for ranking's preferences.
    .index("by_rating", ["workspaceId", "rating.value"]),

  // Where each listed role stands for each approved direction, and for all of them together (no directionId: its best
  // verdict, from `best`), kept in step with its posting (roles.ts, ranker), so the Roles page reads a page at a time,
  // best score first, filtered, however many there are. One row per role and direction it has a verdict for or was
  // sorted out of, while it's open, at a Targets or Maybe company and in their area; a role waiting to be ranked has
  // none. state: judged, sortedOut, or against (what it states is against a firm limit of theirs that roles are checked
  // against once judged, limitBuckets.ROLE_CHECKED). meetsPreferences: false when it's against such a limit, firm or a
  // preference, so it ranks below those that aren't. The rest are what the Roles page filters on, copied from the role,
  // its details (board first) and its company: payMin is the low end of its pay in yearly US dollars (unset when it
  // isn't in dollars or not listed); newest: when it was posted, else first seen. at: when the direction had last
  // changed as of the ranking (the oldest of its directions for the all-directions row).
  roleRanks: defineTable({
    workspaceId: v.id("workspaces"),
    directionId: v.optional(v.id("items")),
    best: v.optional(v.id("items")),
    postingId: v.id("postings"),
    companyId: v.id("companies"),
    companyRating: v.union(v.literal("excited"), v.literal("maybe")),
    state: v.union(v.literal("judged"), v.literal("sortedOut"), v.literal("against")),
    meetsPreferences: v.optional(v.boolean()),
    level: v.optional(v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none"))),
    score: v.optional(v.number()),
    rating: v.optional(v.union(v.literal("interested"), v.literal("no"))),
    payMin: v.optional(v.number()),
    setup: v.optional(v.union(...SETUPS.map((s) => v.literal(s)))),
    seniority: v.optional(v.union(...LEVELS.map((s) => v.literal(s)))),
    employmentType: v.optional(v.union(...EMPLOYMENT_TYPES.map((s) => v.literal(s)))),
    yearsAsked: v.optional(v.number()),
    travel: v.optional(v.number()),
    clearance: v.optional(v.union(...CLEARANCES.map((s) => v.literal(s)))),
    visa: v.optional(v.boolean()),
    // Its places, lower case, joined by "|", and the countries they name: the location filter reads these.
    places: v.optional(v.string()),
    countries: v.optional(v.array(v.string())),
    postedAt: v.optional(v.number()),
    newest: v.number(),
    // In the reports' counts: a direction's row in its count of listed roles (tallies roles), the all-directions row's
    // becoming a strong fit in strongRoles.
    tallied: v.optional(v.boolean()),
    at: v.number(),
  })
    .index("by_posting", ["postingId"])
    .index("by_score", ["workspaceId", "directionId", "state", "meetsPreferences", "score", "newest"])
    .index("by_newest", ["workspaceId", "directionId", "state", "newest"])
    .index("by_ranked", ["workspaceId", "directionId", "at"]),

  // A role's full description as plain text (up to 8,000 characters), as read. Kept apart so lists of roles stay small.
  // clean: the same without what the company repeats across its postings (boilerplate.ts); what the AI reads.
  postingTexts: defineTable({
    workspaceId: v.id("workspaces"),
    postingId: v.id("postings"),
    text: v.string(),
    clean: v.optional(v.string()),
  })
    .index("by_posting", ["postingId"])
    .index("by_workspace", ["workspaceId"]),

  // Company search settings: default seed companies (by website), and what Apollo knows them as.
  discovery: defineTable({
    workspaceId: v.id("workspaces"),
    seeds: v.array(v.string()),
    // Companies they'd name themselves (websites); looked up and added every run.
    named: v.optional(v.array(v.string())),
    // Last resort when no public job board is found: Apollo's job postings (1 credit per company). Off unless they turn it on.
    apolloJobs: v.optional(v.boolean()),
    // Roles passes started before this are stopped at their next step.
    rolesStoppedAt: v.optional(v.number()),
    // Failures in the roles pass started at `since` that weren't about any one role (a bug, a limit, OpenRouter down):
    // how many, when last, and the last error. Too many stop the pass.
    rolesProblems: v.optional(v.object({ since: v.number(), count: v.number(), at: v.number(), error: v.string() })),
    // The AI budget refused a call in the roles pass started at `since` (why, as budgets.reserve said): the pass hands
    // out no more AI work, and pauses with this once no AI call is still running. Cleared when the pass runs again.
    rolesBudget: v.optional(v.object({ since: v.number(), at: v.number(), message: v.string() })),
    // How roles are sorted before judging: an AI model (unset) or Jev.
    roleSort: v.optional(v.union(v.literal("model"), v.literal("jev"))),
    // Whether judging counts how big a stretch a role is (rubric v2, roleRubric.ts): unset or true, it does; false, v1.
    stretch: v.optional(v.boolean()),
    // Learn from your ratings: targets seed lookalike searches, turned-down companies aren't found again, and what
    // they turned down (companies, roles) and why reaches fit and ranking as preferences. Unset or true: on.
    learn: v.optional(v.boolean()),
    // How goals shape the company search (BUILD.md "Goals are explicit"). Unset: steer and rank.
    lens: v.optional(v.object({ industries: v.union(v.literal("steer"), v.literal("only"), v.literal("ignore")), judge: v.union(v.literal("off"), v.literal("rank"), v.literal("hide")) })),
    // Seeds looked up in Apollo: its id and name, or null when Apollo has no such company.
    resolved: v.array(v.object({ domain: v.string(), apolloId: v.union(v.string(), v.null()), name: v.optional(v.string()) })),
  }).index("by_workspace", ["workspaceId"]),

  // Plain-text resumes written from the approved record. Every version is kept.
  resumes: defineTable({
    workspaceId: v.id("workspaces"),
    // Structured resume (resumeDoc.ts). Early versions only have plain text.
    doc: v.optional(resumeDoc),
    text: v.optional(v.string()),
    // Where this resume differs from the resume settings, chosen by the person. `doc` changes only when they add a
    // proposed line (Add what's new, `additions`). A base resume overrides folds and career breaks; a direction or
    // tailored one also titles. A new one starts with the overrides of the one it's made from.
    layout: v.optional(resumeLayout),
    // What it was written from (resumeBasis.ts): each approved role, fact, project and insight, and a direction resume's
    // direction, with a mark of its content, so what changed since can be listed. Base and direction resumes only;
    // tailored ones are frozen. Unset on versions from before it was kept: unknown until rewritten.
    writtenFrom: v.optional(resumeBasis),
    // The facts its lines cite as they read after a line update was applied (factChanges.ts).
    cites: v.optional(factMarks),
    // Versions from before writtenFrom kept only counts of what they were written from. Nothing reads them.
    basedOn: v.optional(v.object({ roles: v.number(), facts: v.number(), insights: v.number() })),
    // A version written from Resume updates, waiting for them to keep or discard it.
    toReview: v.optional(v.boolean()),
    // A waiting version they discarded, with their reason if they gave one. Kept (never current, never waiting) so Undo
    // can bring it back and Review can show the reason.
    discarded: v.optional(v.object({ at: v.number(), reason: v.optional(v.string()) })),
    // A version kept from Resume updates: when it was written (at is when it was kept), so Undo can put it back.
    writtenAt: v.optional(v.number()),
    model: v.string(),
    // The job that wrote it, so a retried run never saves a second copy.
    runId: v.optional(v.id("jobs")),
    // A direction resume has a direction; a tailored one also has the posting it was tailored to (its text, and the role
    // on the Roles page it came from when it came from one) and a requirements map. Neither: the base resume.
    directionId: v.optional(v.id("items")),
    posting: v.optional(v.string()),
    postingId: v.optional(v.id("postings")),
    requirements: v.optional(
      v.array(v.object({ requirement: v.string(), strength: v.union(v.literal("strong"), v.literal("partial"), v.literal("thin")), factIds: v.array(v.string()), note: v.optional(v.string()) })),
    ),
    // Tailored resumes: per role, a title in the posting's wording that the role's approved facts support. Suggestions only.
    postingTitles: v.optional(v.array(v.object({ roleKey: v.string(), title: v.string() }))),
    // A version restored from History: the older version it copies.
    restoredFrom: v.optional(v.id("resumes")),
    // In the reports' counts of versions kept (resumeKept, and resumeUpdated when it has writtenAt) or of tailored ones.
    tallied: v.optional(v.boolean()),
    // Add what's new, on the current version while they go through it: lines proposed for what's new in the record
    // since it was written. `before`: the version as it was when proposed; `basis`: the record's basis then (the marks
    // of the facts the lines rest on). Each line is added, skipped (with their reason) or not yet decided.
    additions: v.optional(
      v.object({
        at: v.number(),
        runId: v.id("jobs"),
        before: v.object({ doc: resumeDoc, writtenFrom: v.optional(resumeBasis) }),
        basis: resumeBasis,
        lines: v.array(
          v.object({
            text: v.string(),
            factIds: v.array(v.string()),
            roleKey: v.optional(v.string()),
            projectKey: v.optional(v.string()),
            state: v.optional(v.union(v.literal("added"), v.literal("skipped"))),
            reason: v.optional(v.string()),
          }),
        ),
      }),
    ),
    // Lines they skipped from Add what's new: a fact with the same mark is never proposed again for this resume. Carried
    // to the next version, like its bullets.
    skipped: v.optional(v.array(v.object({ text: v.string(), factIds: v.array(v.string()), marks: v.array(v.string()), reason: v.optional(v.string()), at: v.number() }))),
    at: v.number(),
  })
    .index("by_workspace", ["workspaceId", "at"])
    .index("by_run", ["runId"])
    .index("by_direction", ["workspaceId", "directionId", "at"])
    .index("by_posting", ["workspaceId", "postingId", "at"]),

  // A role they're going after, started from the Roles page (Start), or a company they write to with no open role
  // (Start outreach: no posting, titled with what they're after, on the Outreach path). They set its status; every
  // change is on its timeline, dated. Its role and company are copied when started, so it stands when the posting
  // closes. direction, score and level: the direction it's pursued for and how the role scored for it then, kept for
  // outcomes. path: the path they chose (Apply, Outreach or both; pursuitSteps.pathOf joins it with what they did).
  // contactedAt: the first outreach message marked sent; appliedAt: the first time it was marked Applied; repliedAt:
  // the first reply from a person there. resumeId: the tailored resume they chose for it (unset: the newest tailored
  // to its role; with no role, its direction's resume); its cover letter is its newest (letters). answers: answers to
  // application questions they saved, each with the approved facts it rests on. sent: set when it reaches Applied,
  // Interviewing or Offer: the resume exactly as shown then, the cover letter and the answers, kept as sent (answers
  // unset: sent before answers were kept); cleared if they go back to Preparing. changedAt: its last activity.
  pursuits: defineTable({
    workspaceId: v.id("workspaces"),
    postingId: v.optional(v.id("postings")),
    companyId: v.id("companies"),
    title: v.string(),
    company: v.string(),
    directionId: v.optional(v.id("items")),
    direction: v.optional(v.string()),
    score: v.optional(v.number()),
    level: v.optional(v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none"))),
    status: pursuitStatus,
    closedReason: v.optional(closedReason),
    nextStep: v.optional(v.string()),
    path: v.optional(pursuitPath),
    contactedAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
    // The interview day they set (YYYY-MM-DD, their calendar), for the Prepare reminder.
    interviewAt: v.optional(v.string()),
    // A reminder put off until a day (YYYY-MM-DD, their calendar): it doesn't show before then, and comes back with the
    // same step (pursuitSteps.remindersOf). Snoozing isn't activity, so changedAt stays.
    snoozed: v.optional(v.object({ rule: reminderRule, until: v.string() })),
    resumeId: v.optional(v.id("resumes")),
    // cites: the facts an answer rests on as they read after a line update was applied to it (factChanges.ts).
    answers: v.optional(v.array(v.object({ question: v.string(), answer: v.string(), factIds: v.array(v.string()), cites: v.optional(factMarks), at: v.number() }))),
    sent: v.optional(
      v.object({
        at: v.number(),
        resumeId: v.optional(v.id("resumes")),
        resume: v.optional(shownDoc),
        letterId: v.optional(v.id("letters")),
        letter: v.optional(v.string()),
        answers: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
      }),
    ),
    timeline: v.array(
      v.object({
        at: v.number(),
        event: v.union(v.literal("started"), v.literal("status"), v.literal("nextStep"), v.literal("notes"), v.literal("resume"), v.literal("letter"), v.literal("answer"), v.literal("interview"), v.literal("followedUp"), v.literal("prepared"), v.literal("checkedIn"), v.literal("people"), v.literal("revealed"), v.literal("outreach"), v.literal("snoozed"), v.literal("path"), v.literal("replied"), v.literal("added")),
        status: v.optional(pursuitStatus),
        reason: v.optional(closedReason),
        text: v.optional(v.string()),
      }),
    ),
    changedAt: v.number(),
    at: v.number(),
  })
    .index("by_workspace", ["workspaceId", "changedAt"])
    .index("by_posting", ["workspaceId", "postingId"]),

  // People at a pursuit's company, found through Apollo when they asked (People: Find again). hiringManager: the one
  // most likely to be the role's hiring manager. group: the group they moved this person to (unset: worked out from the
  // title, contactGroups.groupOf). email: revealed only when they chose this person (1 Apollo credit, never twice for
  // the same Apollo person in a workspace). No apolloId: someone they added by hand, with the email they typed.
  // repliedAt: when they marked that this person answered.
  // draft: an outreach message written from the approved record (parts: what each of its four parts says), which they
  // send from their own email. sent: every message they marked sent, exactly as it was (subject, text, to whom, when);
  // a later draft never changes it.
  contacts: defineTable({
    workspaceId: v.id("workspaces"),
    pursuitId: v.id("pursuits"),
    apolloId: v.optional(v.string()),
    name: v.string(),
    title: v.optional(v.string()),
    hiringManager: v.optional(v.boolean()),
    group: v.optional(contactGroup),
    email: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    revealedAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
    draft: v.optional(v.object({ subject: v.string(), text: v.string(), factIds: v.array(v.string()), parts: v.optional(v.object({ who: v.string(), why: v.string(), fit: v.string(), ask: v.string() })), at: v.number() })),
    sent: v.optional(v.array(v.object({ subject: v.string(), text: v.string(), to: v.string(), at: v.number() }))),
    at: v.number(),
  })
    .index("by_pursuit", ["pursuitId", "at"])
    .index("by_apollo", ["workspaceId", "apolloId"]),

  // Which reminders a workspace wants (pursuitSteps.REMINDER_RULES). No row: all on.
  reminderSettings: defineTable({
    workspaceId: v.id("workspaces"),
    followUp: v.boolean(),
    prepare: v.boolean(),
    stale: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

  // Ask about this role: the conversation kept with a pursuit. from "you": their message (learned: the note it became
  // when it told something new about them, read into the record as proposals to review); from "careerbot": an answer
  // with the approved facts it rests on (kept: saved to the pursuit's answers). runId: the run that wrote an answer.
  pursuitMessages: defineTable({
    workspaceId: v.id("workspaces"),
    pursuitId: v.id("pursuits"),
    from: v.union(v.literal("you"), v.literal("careerbot")),
    text: v.string(),
    factIds: v.optional(v.array(v.string())),
    kept: v.optional(v.boolean()),
    learned: v.optional(v.id("narratives")),
    runId: v.optional(v.id("jobs")),
    at: v.number(),
  })
    .index("by_pursuit", ["pursuitId", "at"])
    .index("by_workspace", ["workspaceId"])
    .index("by_run", ["runId"]),

  // Cover letters written for a pursuit, every version kept, newest in use. Paragraphs cite the approved facts they
  // rest on; edited: their own wording (a paragraph they changed keeps no citations).
  letters: defineTable({
    workspaceId: v.id("workspaces"),
    pursuitId: v.id("pursuits"),
    paragraphs: v.array(v.object({ text: v.string(), factIds: v.array(v.string()) })),
    edited: v.optional(v.boolean()),
    resumeId: v.optional(v.id("resumes")),
    model: v.optional(v.string()),
    runId: v.optional(v.id("jobs")),
    // The facts its paragraphs cite as they read, on a version made by a line update (factChanges.ts).
    cites: v.optional(factMarks),
    at: v.number(),
  })
    .index("by_pursuit", ["pursuitId", "at"])
    .index("by_workspace", ["workspaceId"])
    .index("by_run", ["runId"]),

  // Line updates (factChanges.ts): the lines of a resume, cover letter or set of answers resting on an approved fact
  // edited or rejected since, rewritten on their ask by one paid call, waiting to be applied or discarded. One per
  // document (target: "resume:<id>", "letter:<id>", "answers:<pursuitId>"). Each line: as it was (before, with the facts
  // it cited and their own words for it, theirs), what it becomes (text, empty when the line goes) with the facts it
  // rests on now (factIds), and whether to use it (a line in their own words stays theirs unless they choose it). marks:
  // the cited facts as they read when the lines were written; gone: the cited facts that didn't count then (unset on
  // updates from before it was kept).
  lineUpdates: defineTable({
    workspaceId: v.id("workspaces"),
    target: v.string(),
    runId: v.id("jobs"),
    lines: v.array(
      v.object({
        before: v.string(),
        cited: v.array(v.string()),
        theirs: v.optional(v.string()),
        change: v.union(v.literal("edited"), v.literal("rejected")),
        text: v.string(),
        factIds: v.array(v.string()),
        use: v.boolean(),
      }),
    ),
    marks: factMarks,
    gone: v.optional(v.array(v.string())),
    at: v.number(),
  }).index("by_target", ["workspaceId", "target"]),

  // Follow-up emails for a pursuit when its application goes quiet, written from the approved record. "draft": the one
  // they're working on (at most one per pursuit); "rewrite": a newer version waiting to be kept, the draft staying until
  // then (at most one); "sent": a draft they marked sent, kept exactly as it was (to whom, when) and never changed.
  // contactId: who it's written to (unset: no one in particular); to: on a sent one, that person as they were then.
  // factIds: the approved facts it rests on; edited: their own wording. runId: the run that wrote it.
  followUps: defineTable({
    workspaceId: v.id("workspaces"),
    pursuitId: v.id("pursuits"),
    state: v.union(v.literal("draft"), v.literal("rewrite"), v.literal("sent")),
    contactId: v.optional(v.id("contacts")),
    to: v.optional(v.string()),
    subject: v.string(),
    text: v.string(),
    factIds: v.array(v.string()),
    edited: v.optional(v.boolean()),
    runId: v.optional(v.id("jobs")),
    at: v.number(),
  })
    .index("by_pursuit", ["pursuitId", "state", "at"])
    .index("by_workspace", ["workspaceId"])
    .index("by_run", ["runId"]),

  // How each role, project and skill shows on every resume. One per workspace: folds, career breaks (shown, with reason,
  // left out), and projects and skills left out, set on the record; titles set on the base resume. Each resume
  // overrides it per role, project and skill in its own `layout`.
  resumeSettings: defineTable({
    workspaceId: v.id("workspaces"),
    roles: resumeLayout.fields.roles,
    projects: v.optional(v.array(layoutProject)),
    skills: v.optional(v.array(layoutSkill)),
    // How long resumes are written (resumeDoc.LENGTHS): the record's default for every resume (unset: two pages), and the
    // base resume's (no directionId) or a direction resume's own.
    length: v.optional(resumeLength),
    lengths: v.optional(v.array(v.object({ directionId: v.optional(v.id("items")), length: resumeLength }))),
  }).index("by_workspace", ["workspaceId"]),

  // CareerBot's GitHub App (read-only repository contents and metadata), created once by the operator through GitHub's
  // manifest flow (githubApp.ts). Its private key, client secret and webhook secret are sealed with secretBox. One row.
  githubApp: defineTable({
    appId: v.number(),
    slug: v.string(),
    clientId: v.string(),
    owner: v.string(),
    sealedPem: v.string(),
    sealedClientSecret: v.string(),
    sealedWebhookSecret: v.string(),
    at: v.number(),
  }),

  // A workspace's GitHub connection: the app's installation on their account, on all their repositories or the ones they
  // chose (github.ts). Gone when they disconnect (which uninstalls the app) or uninstall it on GitHub.
  githubInstalls: defineTable({
    workspaceId: v.id("workspaces"),
    installationId: v.number(),
    account: v.string(),
    selection: v.union(v.literal("all"), v.literal("selected")),
    // Where they change which repositories it has, on GitHub.
    settingsUrl: v.string(),
    at: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_installation", ["installationId"]),

  // One-time links for GitHub's round trips, each good for a short while: "app" creates the GitHub App (made by the
  // operator); "connect" connects a workspace, holding the installation GitHub came back with until GitHub confirms it's
  // theirs.
  githubLinks: defineTable({
    token: v.string(),
    purpose: v.union(v.literal("app"), v.literal("connect")),
    workspaceId: v.optional(v.id("workspaces")),
    installationId: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_workspace", ["workspaceId"]),

  // A workspace's Google Drive connection (drive.ts): its own Google consent, separate from signing in, for the
  // drive.file scope only, so CareerBot sees nothing but the files it makes and the folder they pick. The refresh token
  // and the latest access token are sealed with secretBox and never sent to a client. parentId: the folder they chose
  // for the CareerBot folder (unset: the top of their Drive). broken: Google stopped accepting the connection; syncing
  // waits until they connect again. checkAt: a look for changes is scheduled for then (one at a time).
  driveConnections: defineTable({
    workspaceId: v.id("workspaces"),
    account: v.string(),
    sealedRefresh: v.string(),
    sealedAccess: v.optional(v.string()),
    accessExpiresAt: v.optional(v.number()),
    parentId: v.optional(v.string()),
    parentName: v.optional(v.string()),
    broken: v.optional(v.string()),
    checkAt: v.optional(v.number()),
    at: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // What CareerBot keeps in a workspace's Drive, one row per place (drivePaths.ts): the CareerBot folder ("root"), its
  // folders and the Google Docs in them. fileId: Drive's id, kept so every update lands in the same file (unset: not
  // made yet). hash: the content last written; sourceId: the resume, letter or pursuit it was written from. frozen: a
  // tailored file written as sent, never changed again while its pursuit stays past Preparing. error: the last try
  // failed; failedHash: the content that failed, so looking for changes doesn't try it again on its own (a change to it,
  // or Try again, does). Left in place on disconnect, so connecting the same account again reuses them.
  driveFiles: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    name: v.string(),
    parentKey: v.optional(v.string()),
    fileId: v.optional(v.string()),
    hash: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    frozen: v.optional(v.boolean()),
    syncedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    failedAt: v.optional(v.number()),
    failedHash: v.optional(v.string()),
  }).index("by_workspace_key", ["workspaceId", "key"]),

  // One-time links for connecting Google Drive, each good for half an hour, used once. from: where connecting began
  // ("today": Getting started), so Google comes back there; unset: Settings.
  driveLinks: defineTable({
    token: v.string(),
    workspaceId: v.id("workspaces"),
    expiresAt: v.number(),
    from: v.optional(v.literal("today")),
  })
    .index("by_token", ["token"])
    .index("by_workspace", ["workspaceId"]),

  // Side-by-side runs of the same task with different models, for judging cost, speed and quality: reading a story
  // (extract, with the story it read), writing the base resume (resume) or finding insights (insights). Each output is
  // kept here only; nothing from a comparison enters the record or resumes.
  comparisons: defineTable({
    workspaceId: v.id("workspaces"),
    task: v.union(v.literal("extract"), v.literal("resume"), v.literal("insights")),
    narrativeId: v.optional(v.id("narratives")),
    narrativeTitle: v.optional(v.string()),
    narrativeVersion: v.optional(v.number()),
    contenders: v.array(
      v.object({
        model: v.string(),
        reasoning: v.optional(reasoningLevel),
        status: v.union(v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("paused")),
        output: v.optional(v.any()),
        costUsd: v.optional(v.number()),
        // The model that actually answered (an alias like "~vendor/latest" resolves to a specific one).
        resolvedModel: v.optional(v.string()),
        seconds: v.optional(v.number()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        error: v.optional(v.string()),
      }),
    ),
    at: v.number(),
  }).index("by_workspace", ["workspaceId", "at"]),

  // A rubric tried on a sample of a workspace's judged roles before it's applied (roles.compareRubric): the roles they
  // rated, the best `sample` per approved direction, and `sample` more at random. One row per role and direction it has
  // a live verdict for (roleRubric.compareRow): that verdict (old) beside what the rubric judged (new), with reasons and
  // the stretch. Live verdicts are never touched. status: running, done, or failed; failed: roles whose judging failed,
  // error: the last reason; costUsd: what the AI calls cost.
  rubricRuns: defineTable({
    workspaceId: v.id("workspaces"),
    rubric,
    at: v.number(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    sample: v.number(),
    rows: v.array(compareRow),
    failed: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId", "at"]),

  // Notes in their own words on anything (notes.ts), dated: at when written, editedAt when last changed. Never evidence:
  // nothing reads them into the record, a resume, a letter or an AI prompt.
  notes: defineTable({
    workspaceId: v.id("workspaces"),
    subject: noteSubject,
    text: v.string(),
    at: v.number(),
    editedAt: v.optional(v.number()),
  }).index("by_subject", ["workspaceId", "subject.kind", "subject.id", "at"]),

  // Settings, Your data (yourData.ts): a whole-workspace export, made in the background (yourDataRun.ts) as one ZIP in
  // file storage (fileId) and deleted an hour after it's made (expiresAt). One per workspace; a new export replaces it.
  // step, done and total: what it's reading now, and how many of its parts are done. beat: the last sign it was running.
  exports: defineTable({
    workspaceId: v.id("workspaces"),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    step: v.optional(v.string()),
    done: v.number(),
    total: v.number(),
    fileId: v.optional(v.id("_storage")),
    name: v.optional(v.string()),
    bytes: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    error: v.optional(v.string()),
    beat: v.number(),
    at: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // Settings, Your data: an export brought in from another copy, into an empty workspace. The ZIP (fileId) arrives through
  // the site's upload address (yourData.importUpload), which stores it and makes this row for the signed-in person who
  // sent it (userId) in one go, so no one can point an import at a file they didn't upload. It's checked first
  // (checking, then ready with its preview, or refused with why), then put in on their say (importing, then done or
  // failed). preview: the file's format and CareerBot version, when it was exported, how many of each kind it holds, and
  // what would be left out (omitted, by kind). step, done, total: the kind going in now, and rows in so far of all. beat:
  // the last sign it was running, so a stopped import can be continued. result: rows and files in, and rows left out
  // because what they needed wasn't in the file (left; omitted, by kind). The ZIP is deleted once it's in. One per
  // workspace.
  imports: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    fileId: v.optional(v.id("_storage")),
    // While it's uploading (a piece of at most CHUNK_BYTES per request): the pieces in so far, and how many there are.
    // The last piece's arrival joins them into fileId before the check.
    chunks: v.optional(v.array(v.id("_storage"))),
    parts: v.optional(v.number()),
    name: v.string(),
    bytes: v.number(),
    status: v.union(v.literal("uploading"), v.literal("checking"), v.literal("ready"), v.literal("refused"), v.literal("importing"), v.literal("done"), v.literal("failed")),
    preview: v.optional(
      v.object({
        format: v.number(),
        version: v.string(),
        exportedAt: v.string(),
        counts: v.array(v.object({ kind: v.string(), n: v.number() })),
        omitted: v.array(v.object({ kind: v.string(), n: v.number() })),
      }),
    ),
    step: v.optional(v.string()),
    done: v.number(),
    total: v.number(),
    error: v.optional(v.string()),
    result: v.optional(v.object({ rows: v.number(), files: v.number(), left: v.number(), omitted: v.array(v.object({ kind: v.string(), n: v.number() })) })),
    beat: v.number(),
    at: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // While an import runs: each row put in, by its id in the file (old) and here (id), with the top-level fields still to
  // patch in once every row is in (later). Written with the row itself, so an import that stops picks up after the rows
  // already in and never puts one in twice. Deleted when the import is done. A stored file is here too (old: its id in
  // the file).
  importIds: defineTable({
    workspaceId: v.id("workspaces"),
    importId: v.id("imports"),
    old: v.string(),
    id: v.string(),
    later: v.array(v.string()),
  })
    .index("by_import", ["importId", "old"])
    .index("by_workspace", ["workspaceId"]),

  // People who asked on the public website (careerbot.dev) to hear when CareerBot opens up (waitlist.ts). Not tied to a
  // workspace. email: lowercased and trimmed, one row each; source: where on the site they joined, if the page says.
  waitlist: defineTable({
    email: v.string(),
    at: v.number(),
    source: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_at", ["at"]),
});
