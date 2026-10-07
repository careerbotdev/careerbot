import { query } from "./_generated/server";
import { JUDGE_BATCH } from "./roles";
import { MODEL_BATCH } from "./roleSort";
import { requireWorkspace } from "./workspaces";

// What AI work has cost them lately, for the estimate beside the button that starts it ("About $0.01").

// AI calls read, newest first; enough for the last 20 of each kind however busy.
const READ = 1000;
// Calls averaged per kind.
const LAST = 20;

// What each kind of work has cost them, on average over its last 20 calls (null before their first): a follow-up, an
// outreach message, a cover letter, an answer about a role, a resume tailored to a role, and ranking one role (its
// share of a sorting call plus its share of a judging call). The record's work: reading a story (and a revised one),
// a rewrite of one fact, checking for disagreements, finding duplicates, finding same work, gathering skills, looking
// for insights, and one call reading a repository (a large repository takes a few). Resumes: writing the base resume,
// a direction resume, and new lines for Add what's new. Goals: reading the goals narrative, reading one limit's rule from
// its wording, filling in directions' detail, and suggesting directions. Checking a line (or summary) in their own words
// against its facts.
export const costs = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db
      .query("usage")
      .withIndex("by_workspace_service_at", (q) => q.eq("workspaceId", workspaceId).eq("service", "openrouter"))
      .order("desc")
      .take(READ);
    const byPurpose = new Map<string, number[]>();
    for (const u of rows) {
      if (!u.ok || u.state === "reserved" || typeof u.costUsd !== "number") continue;
      const seen = byPurpose.get(u.purpose);
      if (!seen) byPurpose.set(u.purpose, [u.costUsd]);
      else if (seen.length < LAST) seen.push(u.costUsd);
    }
    const average = (purpose: string) => {
      const c = byPurpose.get(purpose);
      return c?.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
    };
    const sort = average("role sort");
    const judge = average("role fit");
    return {
      followUp: average("follow-up"),
      outreach: average("outreach"),
      letter: average("cover letter"),
      ask: average("ask about this role"),
      tailor: average("tailored resume"),
      rankPerRole: sort === null && judge === null ? null : (sort ?? 0) / MODEL_BATCH + (judge ?? 0) / JUDGE_BATCH,
      read: average("extract"),
      readRevision: average("revision"),
      rewrite: average("rework"),
      disagreements: average("check"),
      duplicates: average("duplicates"),
      sameWork: average("same work"),
      skills: average("skills"),
      insights: average("insights"),
      repository: average("project"),
      resume: average("resume"),
      directionResume: average("direction resume"),
      resumeLines: average("resume lines"),
      goals: average("goals"),
      limitRule: average("limit rule"),
      directionDetail: average("direction detail"),
      suggestDirections: average("suggest directions"),
      lineCheck: average("line check"),
      lineUpdate: average("line update"),
    };
  },
});
