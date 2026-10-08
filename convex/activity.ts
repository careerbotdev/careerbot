import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { clockOf, getInWorkspace, requireWorkspace } from "./workspaces";

// The activity indicator's list: the workspace's background work, as the person would name it.

// Finished work stays in the list this long.
export const RECENT_MS = 86_400_000;
// Jobs read, newest first: enough for a day's work however busy.
const READ = 200;

type Job = Doc<"jobs">;

// What each kind of work is called while it runs, once done, and when it failed. `what` is the thing it's about, when
// the job names one ("your Brightwater story").
const LABELS: Record<Job["kind"], (what: string | null) => [string, string, string]> = {
  firstCall: () => ["Trying your OpenRouter key", "Tried your OpenRouter key", "Couldn’t reach OpenRouter"],
  extract: (w) => [`Reading ${w ?? "your story"}`, `Read ${w ?? "your story"}`, `Couldn’t read ${w ?? "your story"}`],
  rework: () => ["Rewriting a fact", "Rewrote a fact", "Couldn’t rewrite a fact"],
  compare: () => ["Comparing models", "Compared models", "Couldn’t compare models"],
  goals: () => ["Reading your goals", "Read your goals", "Couldn’t read your goals"],
  check: () => ["Checking your record for conflicts", "Checked your record for conflicts", "Couldn’t check your record for conflicts"],
  limitRule: () => ["Reading a limit", "Read a limit", "Couldn’t read a limit"],
  insights: () => ["Finding insights", "Found insights", "Couldn’t find insights"],
  followups: () => ["Writing follow-up questions", "Wrote follow-up questions", "Couldn’t write follow-up questions"],
  resume: (w) => [`Writing ${w ?? "your resume"}`, `Wrote ${w ?? "your resume"}`, `Couldn’t write ${w ?? "your resume"}`],
  directions: (w) => (w ? [`Writing positioning for ${w}`, `Wrote positioning for ${w}`, `Couldn’t write positioning for ${w}`] : ["Suggesting directions", "Suggested directions", "Couldn’t suggest directions"]),
  duplicates: () => ["Looking for duplicates", "Looked for duplicates", "Couldn’t look for duplicates"],
  discover: () => ["Finding companies", "Found companies", "Couldn’t find companies"],
  enrich: () => ["Looking up companies", "Looked up companies", "Couldn’t look up companies"],
  roles: () => ["Checking roles", "Checked roles", "Couldn’t check roles"],
  project: (w) => [`Reading ${w ?? "a project"}`, `Read ${w ?? "a project"}`, `Couldn’t read ${w ?? "a project"}`],
  skills: () => ["Gathering your skills", "Gathered your skills", "Couldn’t gather your skills"],
  sameWork: () => ["Looking for the same work", "Looked for the same work", "Couldn’t look for the same work"],
  letter: (w) => [`Writing a cover letter${w ? ` for ${w}` : ""}`, `Wrote a cover letter${w ? ` for ${w}` : ""}`, `Couldn’t write a cover letter${w ? ` for ${w}` : ""}`],
  ask: () => ["Answering your question", "Answered your question", "Couldn’t answer your question"],
  outreach: (w) => [`Writing a message${w ? ` to ${w}` : ""}`, `Wrote a message${w ? ` to ${w}` : ""}`, `Couldn’t write a message${w ? ` to ${w}` : ""}`],
  followUp: (w) => [`Writing a follow-up${w ? ` to ${w}` : ""}`, `Wrote a follow-up${w ? ` to ${w}` : ""}`, `Couldn’t write a follow-up${w ? ` to ${w}` : ""}`],
  driveSync: () => ["Syncing Google Drive", "Synced Google Drive", "Couldn’t sync Google Drive"],
  lineCheck: (w) => [`Checking ${w ?? "a line"} against its facts`, `Checked ${w ?? "a line"} against its facts`, `Couldn’t check ${w ?? "a line"} against its facts`],
  lineUpdate: (w) => [`Updating lines of ${w ?? "a document"}`, `Updated lines of ${w ?? "a document"}`, `Couldn’t update lines of ${w ?? "a document"}`],
};

// The thing a job is about, by name, where it names one. Every lookup is scoped to the job's workspace, so an id from
// another workspace names nothing.
async function subjectOf(ctx: QueryCtx, j: Job): Promise<string | null> {
  const a = j.args ?? {};
  const get = <T extends "narratives" | "items" | "pursuits" | "contacts">(id: unknown) =>
    id ? getInWorkspace(ctx, j.workspaceId, id as Doc<T>["_id"]) : Promise.resolve(null);
  switch (j.kind) {
    case "extract": {
      const n = await get<"narratives">(a.narrativeId);
      return n ? `your ${n.title} story` : null;
    }
    case "resume": {
      if (a.posting !== undefined) return "a tailored resume";
      const d = await get<"items">(a.directionId);
      const resume = d?.kind === "direction" ? `your ${d.data.name} resume` : "your base resume";
      // Add what's new writes new lines for the resume, not the resume: "Writing new lines for your base resume".
      return a.lines ? `new lines for ${resume}` : resume;
    }
    case "directions": {
      const d = a.mode === "detail" ? await get<"items">(a.id) : null;
      return d?.kind === "direction" ? d.data.name : null;
    }
    case "project":
      return typeof a.repo === "string" ? a.repo : null;
    case "letter": {
      const p = await get<"pursuits">(a.pursuitId);
      return p?.company ?? null;
    }
    case "outreach": {
      const c = await get<"contacts">(a.contactId);
      return c?.name ?? null;
    }
    case "followUp": {
      const c = await get<"contacts">(a.contactId);
      if (c) return c.name;
      const p = await get<"pursuits">(a.pursuitId);
      return p?.company ?? null;
    }
    case "lineCheck":
      return typeof a.line === "string" ? "a line" : "your summary";
    case "lineUpdate": {
      const t = a.target as { kind: "resume" | "letter" | "answers"; id: string } | undefined;
      return t?.kind === "resume" ? "a resume" : t?.kind === "letter" ? "a cover letter" : t ? "your answers" : null;
    }
    default:
      return null;
  }
}

// How to start failed work again, where a public mutation does: its name in the API and its arguments. The screen
// runs it (Try again). Kinds without one have none.
type Retry =
  | { fn: "extract.start"; args: { narrativeId: string } }
  | { fn: "goals.start"; args: { narrativeId: string } }
  | { fn: "resume.rewrite"; args: { directionId?: string } }
  | { fn: "resume.start"; args: { directionId?: string } }
  | { fn: "resume.whatsNew"; args: { directionId?: string } }
  | { fn: "directions.suggest"; args: Record<string, never> }
  | { fn: "directions.detail"; args: { id: string } }
  | { fn: "letters.write"; args: { pursuitId: string } }
  | { fn: "people.draft"; args: { contactId: string } }
  | { fn: "followUpEmails.write"; args: { pursuitId: string; contactId?: string } }
  | { fn: "lineCheck.check"; args: { id: string; line?: string } }
  | { fn: "factChanges.update"; args: { target: { kind: "resume" | "letter" | "answers"; id: string } } }
  | { fn: "discovery.start" | "enrich.start" | "roles.start" | "insights.start" | "skills.start" | "duplicates.start" | "followups.start" | "conflicts.start"; args: Record<string, never> };

function retryOf(j: Job): Retry | null {
  const a = j.args ?? {};
  switch (j.kind) {
    case "extract":
      return a.again ? null : { fn: "extract.start", args: { narrativeId: a.narrativeId } };
    case "goals":
      return { fn: "goals.start", args: { narrativeId: a.narrativeId } };
    case "resume":
      if (a.posting !== undefined) return null;
      return { fn: a.lines ? "resume.whatsNew" : a.review ? "resume.rewrite" : "resume.start", args: a.directionId ? { directionId: a.directionId } : {} };
    case "directions":
      return a.mode === "detail" ? { fn: "directions.detail", args: { id: a.id } } : { fn: "directions.suggest", args: {} };
    case "letter":
      return { fn: "letters.write", args: { pursuitId: a.pursuitId } };
    case "outreach":
      return { fn: "people.draft", args: { contactId: a.contactId } };
    case "followUp":
      return { fn: "followUpEmails.write", args: { pursuitId: a.pursuitId, ...(a.contactId ? { contactId: a.contactId } : {}) } };
    case "lineCheck":
      return { fn: "lineCheck.check", args: { id: a.resumeId, ...(typeof a.line === "string" ? { line: a.line } : {}) } };
    case "lineUpdate":
      return { fn: "factChanges.update", args: { target: a.target } };
    case "discover":
      return { fn: "discovery.start", args: {} };
    case "enrich":
      return { fn: "enrich.start", args: {} };
    case "roles":
      return { fn: "roles.start", args: {} };
    case "insights":
      return { fn: "insights.start", args: {} };
    case "skills":
      return { fn: "skills.start", args: {} };
    case "duplicates":
      return { fn: "duplicates.start", args: {} };
    case "followups":
      return { fn: "followups.start", args: {} };
    case "check":
      return { fn: "conflicts.start", args: {} };
    default:
      return null;
  }
}

// The workspace's background work for the activity indicator: everything queued, running or paused, and what finished
// or failed in the last day, newest first. Each with its plain name, its state (queued and paused count as running,
// with a word on why it's waiting: paused work says which budget it waits for and why that budget stopped it), when it
// last moved, how far along it is where the job records that (steps done so far), and for failed work how to try again
// where that's possible.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const since = (await clockOf(ctx, workspaceId)) - RECENT_MS;
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(READ);
    const shown = jobs.filter((j) => j.status === "queued" || j.status === "running" || j.status === "paused" || (j.startedAt ?? j._creationTime) >= since);
    return Promise.all(
      shown.map(async (j) => {
        const [running, done, failed] = LABELS[j.kind](await subjectOf(ctx, j));
        const state = j.status === "done" ? ("done" as const) : j.status === "failed" ? ("failed" as const) : ("running" as const);
        const detail =
          j.status === "queued"
            ? "Waiting to start"
            : j.status === "paused"
              ? `${j.pausedFor === "apollo" ? "Paused until your Apollo budget allows" : "Paused until your AI budget allows"}${j.error ? `. ${j.error}` : ""}`
              : j.status === "failed"
                ? (j.error ?? null)
                : null;
        return {
          id: j._id,
          kind: j.kind,
          label: state === "done" ? done : state === "failed" ? failed : running,
          state,
          detail,
          steps: j.status === "running" && j.done?.length ? j.done.length : null,
          at: j.startedAt ?? j._creationTime,
          retry: j.status === "failed" ? retryOf(j) : null,
        };
      }),
    );
  },
});
