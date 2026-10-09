import { type ExpressionOrValue, type FilterBuilder, type NamedTableInfo, paginationOptsValidator } from "convex/server";
import { ConvexError, type Infer, type ObjectType, v, type Validator } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { BOARD_PROVIDERS } from "./boardProviders";
import { Boilerplate } from "./boilerplate";
import { aiRunning, BUDGET_REACHED, type BudgetReached, HELD_BY_RUNNING } from "./budgets";
import { learns } from "./discovery";
import { apolloJobsFor, type Board, inWorkArea, interleave, jobCountries, type Read, readBoard, readDescription, setSearchTitles, workAreaOf } from "./enrich";
import { activeLimits, itemsOf } from "./itemShapes";
import { CLEARANCES, eligibilityProblems, firmProblems, LEVELS, limitsFor, type Problem, problemText, ROLE_CHECKED } from "./limitBuckets";
import { chatJson, OpenRouterError, spendingFor, withBackoff } from "./metering";
import { listOf, number, orNull, type ReplySchema, replyOf, strictObject, string, strings } from "./replyJson";
import { inPlace, locationProblems, placeOptions } from "./places";
import { approvedRecord } from "./recordContext";
import { cleanDetails, type Clearance, type Details, detailsValidator, EMPLOYMENT_TYPES, mergeDetails, SETUPS, valuesOf, yearlyUsd } from "./roleDetails";
import { UnreadableReply } from "./replyJson";
import { resumeTitle, yearsWorked } from "./resumeDoc";
import { cleanStretch, compareRow, compareSummary, type Rubric, rubric, rubricOf, scoreChange } from "./roleRubric";
import { chunks, directionsFor, pool, SORT_TASK, type SortMethod, sortRoles } from "./roleSort";
import { origin } from "./schema";
import { dayOf, STANDING, tally } from "./tallies";
import { clockOf, requireWorkspace } from "./workspaces";

// Finding roles: every open role at Targets and Maybe companies, read from their own job boards, with full descriptions,
// sorted to the approved directions each could plausibly be, then judged against only those. A pass reads the boards
// first, 10 companies a run, each run scheduling the next. Then everything else is done by workers running side by
// side: each claims a few roles (so no two work on the same one), fetches their descriptions, sorts or judges them,
// saves, and claims again until nothing is left. A call the budget refuses for what other calls still running hold is
// tried again once they settle; the pass's own run pauses the pass once the AI budget can't fit their next call and no
// call is still running, and hands over to a fresh run (with fresh workers) before Convex's 10-minute limit.

// Companies read per run.
const BATCH = 10;
// Workers a pass runs at once, started this far apart so their first claims don't collide.
const WORKERS = 32;
const STAGGER_MS = 100;
// Roles a worker claims at a time: descriptions fetched together, roles per sort, roles per judging call. Judging
// calls are small so many run at once and each comes back quickly.
const TEXT_BATCH = 10;
const SORT_BATCH = 40;
export const JUDGE_BATCH = 5;
// Descriptions one worker fetches at once (fetchTexts).
const FETCHES = 3;
// A claim older than this is free again: its worker was cut off (Convex stops an action after 10 minutes).
const CLAIM_MS = 10 * 60 * 1000;
// Workers stop claiming after this long, so what they hold is saved within Convex's limit; the pass's run watches as
// long, then hands over to the next run if work is left.
const WORK_MS = 6 * 60 * 1000;
// How often the pass's run checks on the work, and how long a worker with nothing free to claim waits before trying again.
const POLL_MS = 10 * 1000;
const WAIT_MS = 5 * 1000;
// The longest a worker waits before trying again when the budget keeps refusing its calls for what calls still running
// hold: each refusal in a row doubles its wait from WAIT_MS up to this, so near the end of a budget the workers whose
// calls don't fit ask again now and then rather than every few seconds.
const HELD_WAIT_MS = 60 * 1000;
// Failures of a role's own input in one pass after which it's set aside until the next pass.
const MAX_FAILURES = 3;
// Problems in one pass that weren't about any one role (a bug, a limit, OpenRouter down) after which the pass stops and
// fails with the last one, rather than handing over forever.
const MAX_PROBLEMS = 20;
// Roles read per page by the steps that go through every role (queueing, the result), and descriptions per page when
// working out what a company repeats: a page stays far within what one function may read (16 MB), however many roles a
// workspace or company has. Steps that also bring each role's rows on the Roles page in step (one per direction and
// one for all) take fewer, so a page's writes stay within a mutation's limit however many directions there are.
const PAGE = 500;
const SYNC_PAGE = 200;
const TEXT_PAGE = 200;
// Roles rankAgain clears per write (rankAgainPage): few, so each write is quick and seldom meets a running pass's
// workers saving one of the same roles.
const RERANK_PAGE = 50;
// Roles (and descriptions) saved per write, so a large board with descriptions stays well within a write's size.
const SAVE_CHUNK = 50;
// Coverage read longer ago than this is stale.
const STALE_MS = 3 * 24 * 60 * 60 * 1000;
// Rows counted for the Roles page; more shows as this many and more.
const COUNT_CAP = 2000;
// Rows a page of the Roles page reads when it filters by place (which the database can't): the matches among them.
const PLACE_SCAN = 200;

const level = v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none"));
type Level = "strong" | "some" | "weak" | "none";
const LEVEL_ORDER: Record<Level, number> = { strong: 0, some: 1, weak: 2, none: 3 };
type Rated = "excited" | "maybe";
const sortMethod = v.union(v.literal("model"), v.literal("jev"));
type Step = "text" | "sort" | "judge";
// A pass limited to some companies (an operator's run); unset: every watched company.
const onlyCompanies = v.optional(v.array(v.id("companies")));
const STEPS: Step[] = ["text", "sort", "judge"];

// Targets (excited) and Maybe companies that are places to work: the ones whose roles are watched, with their rating.
const watched = (c: Doc<"companies">): Rated | null =>
  (c.rating?.value === "excited" || c.rating?.value === "maybe") && c.screened?.employer !== false ? c.rating.value : null;
// A role listed again under another id (or another board) is the same role when its title and location match.
const sameRole = (title: string, location?: string) => [title, location ?? ""].map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).join("|");

const openAt = (ctx: QueryCtx, companyId: Id<"companies">) => ctx.db.query("postings").withIndex("by_company", (q) => q.eq("companyId", companyId).eq("closedAt", undefined)).collect();
const textOf = (ctx: QueryCtx, postingId: Id<"postings">) => ctx.db.query("postingTexts").withIndex("by_posting", (q) => q.eq("postingId", postingId)).first();
const inQueue = (ctx: QueryCtx, workspaceId: Id<"workspaces">, step: Step) => ctx.db.query("postings").withIndex("by_queue", (q) => q.eq("workspaceId", workspaceId).eq("queue", step));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Approved directions with when each last changed in a way ranking reads (unset: when it was made).
async function directionTimes(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.changedAt ?? d.at]));
}

async function settingsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
}

async function isStopped(ctx: QueryCtx, workspaceId: Id<"workspaces">, since: number) {
  const row = await settingsOf(ctx, workspaceId);
  return !!row?.rolesStoppedAt && row.rolesStoppedAt >= since;
}

type Row = Omit<Doc<"roleRanks">, "_id" | "_creationTime">;
const ROW_KEYS = ["directionId", "best", "companyRating", "state", "meetsPreferences", "level", "score", "rating", "payMin", "setup", "seniority", "employmentType", "yearsAsked", "travel", "clearance", "visa", "places", "countries", "postedAt", "newest", "at"] as const;
const sameRow = (a: Row, b: Row) => ROW_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

// What a role states that's against their approved limits checked on judged roles (limitBuckets.ROLE_CHECKED), for one
// direction (a limit may apply to some directions only), from its details and the board's location line (its place when
// no places were read), and its employer's name. Reads the limits and directions once. byEmployer: whether a limit
// rules out employers by name, so callers that would read the company only for that can skip it.
type ProblemsOf = ((directionId: string, d: Details, location?: string, employer?: string) => Problem[]) & { byEmployer?: boolean };
async function problemsFor(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<ProblemsOf> {
  const limits = (await activeLimits(ctx, workspaceId)).filter((l) => ROLE_CHECKED.includes(l.data.kind)).map((l) => l.data);
  if (!limits.length) return () => [];
  const byEmployer = limits.some((l) => l.kind === "companies" && l.firm === true && (l.rule?.exclude as unknown[] | undefined)?.length);
  const names = new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.name]));
  const problemsOf: ProblemsOf = (directionId, d, location, employer) => {
    const direction = names.get(directionId);
    const places = (d.locations?.length ? d.locations : location ? [location] : []).map((place) => ({ place, countries: [...jobCountries(place)] }));
    return [
      ...eligibilityProblems(limits, { direction, clearanceRequired: d.clearance, sponsors: d.visa }), ...locationProblems(limits, { direction, setup: d.setup, places }),
      ...firmProblems(limits, { direction, employer, payTop: d.pay?.max !== undefined ? yearlyUsd(d.pay, "top") : undefined, level: d.seniority, travel: d.travel, employmentType: d.employmentType }),
    ];
  };
  problemsOf.byEmployer = byEmployer;
  return problemsOf;
}

// Keep one role's rows on the Roles page (roleRanks) in step with it, while it's listed (open, at a watched company,
// in their area; `rated`: its company's rating, null when it isn't listed): a row per approved direction it has a
// verdict for or was sorted out of, and one for all directions together (its best verdict, or sorted out when it was
// sorted out of every direction it was ranked for). A verdict against a firm limit (problemsOf) is set apart, and one
// against a preference ranks lower. Each carries what the page filters on.
async function syncRanks(ctx: MutationCtx, p: Doc<"postings">, approved: Map<string, number>, rated: Rated | null, problemsOf: ProblemsOf, employer?: string) {
  const want = new Map<string, Row>();
  if (rated) {
    const d = valuesOf(detailsOf(p));
    const places = [...(d.locations ?? []), ...(p.location ? [p.location] : [])];
    const countries = [...new Set(places.flatMap((x) => [...jobCountries(x)]))];
    const base: Row = {
      workspaceId: p.workspaceId, postingId: p._id, companyId: p.companyId, companyRating: rated, state: "judged",
      rating: p.rating?.value, payMin: yearlyUsd(d.pay), setup: d.setup, seniority: d.seniority, employmentType: d.employmentType, yearsAsked: d.yearsAsked,
      travel: d.travel, clearance: d.clearance, visa: d.visa, places: places.length ? places.join("|").toLowerCase() : undefined, countries: countries.length ? countries : undefined,
      postedAt: p.postedAt, newest: p.postedAt ?? p.firstSeen, at: 0,
    };
    const judged: Row[] = [];
    const out: Row[] = [];
    for (const dir of approved.keys()) {
      const s = standing(p, dir as Id<"items">);
      if (s.at === null || (!s.level && !s.sortedOut)) continue;
      let row: Row;
      if (s.level) {
        const problems = problemsOf(dir, d, p.location, employer);
        row = { ...base, directionId: dir as Id<"items">, state: problems.some((x) => x.firm) ? "against" : "judged", meetsPreferences: !problems.length, level: s.level, score: s.score ?? undefined, at: s.at };
      } else row = { ...base, directionId: dir as Id<"items">, state: "sortedOut", at: s.at };
      want.set(dir, row);
      (s.level ? judged : out).push(row);
    }
    const at = Math.min(...[...judged, ...out].map((r) => r.at));
    // Best first: one that isn't against a limit, then the highest score, then the best level (verdicts from before
    // scores have none).
    const setApart = (r: Row) => (r.state === "against" ? 2 : r.meetsPreferences ? 0 : 1);
    const best = judged.sort((a, b) => setApart(a) - setApart(b) || (b.score ?? -1) - (a.score ?? -1) || LEVEL_ORDER[a.level!] - LEVEL_ORDER[b.level!])[0];
    if (best) want.set("", { ...best, directionId: undefined, best: best.directionId, at });
    else if (out.length) want.set("", { ...base, state: "sortedOut", at });
  }
  // The reports' counts move with the rows (tallies.ts; a row's `tallied` says it's in them): a direction's row in its
  // count of listed roles by level (or sorted out, or against a limit), the all-directions row's becoming a strong fit.
  const counts = new Map<string, number>();
  const count = (r: Row, n: number) => {
    const k = `${r.directionId}|${r.state === "judged" ? r.level : r.state}`;
    counts.set(k, (counts.get(k) ?? 0) + n);
  };
  const strong = (r: Row) => r.state === "judged" && r.level === "strong";
  let newlyStrong = false;
  // A row as saved: a direction's row is counted; the all-directions row keeps whether it was counted while it stays
  // strong, and is counted when it becomes strong.
  const saved = (w: Row, old?: Row): Row => {
    if (w.directionId) return { ...w, tallied: true };
    if (!strong(w)) return { ...w, tallied: undefined };
    if (old && strong(old)) return { ...w, tallied: old.tallied };
    newlyStrong = true;
    return { ...w, tallied: true };
  };
  for (const row of await ctx.db.query("roleRanks").withIndex("by_posting", (q) => q.eq("postingId", p._id)).collect()) {
    const key = row.directionId ?? "";
    const w = want.get(key);
    want.delete(key);
    if (w && sameRow(row, w)) continue;
    if (row.directionId && row.tallied) count(row, -1);
    if (!w) {
      await ctx.db.delete(row._id);
      continue;
    }
    const next = saved(w, row);
    await ctx.db.replace(row._id, next);
    if (next.directionId) count(next, 1);
  }
  for (const w of want.values()) {
    const next = saved(w);
    await ctx.db.insert("roleRanks", next);
    if (next.directionId) count(next, 1);
  }
  for (const [k, n] of counts) await tally(ctx, p.workspaceId, "roles", STANDING, n, k);
  if (newlyStrong) await tally(ctx, p.workspaceId, "strongRoles", dayOf(Date.now()), 1);
}

// Syncs roles' rows on the Roles page after they change, reading the approved directions and their area once, and
// each company once (or taking the watched companies with their ratings, when the caller has them).
export async function ranker(ctx: MutationCtx, workspaceId: Id<"workspaces">, watchedRatings?: Map<string, Rated>) {
  const approved = await directionTimes(ctx, workspaceId);
  const area = await workAreaOf(ctx, workspaceId);
  const problemsOf = await problemsFor(ctx, workspaceId);
  const known = new Map<string, Rated | null>(watchedRatings);
  const ratingOf = async (id: Id<"companies">) => {
    if (watchedRatings) return watchedRatings.get(id) ?? null;
    if (!known.has(id)) {
      const c = await ctx.db.get(id);
      known.set(id, c ? watched(c) : null);
    }
    return known.get(id)!;
  };
  const employers = new Map<string, string | undefined>();
  const employerOf = async (id: Id<"companies">) => {
    if (!problemsOf.byEmployer) return undefined;
    if (!employers.has(id)) employers.set(id, (await ctx.db.get(id))?.name);
    return employers.get(id);
  };
  return {
    approved,
    area,
    sync: async (p: Doc<"postings">) => syncRanks(ctx, p, approved, !p.closedAt && inWorkArea(p, area) ? await ratingOf(p.companyId) : null, problemsOf, await employerOf(p.companyId)),
  };
}

// Every watched company of a workspace with its rating.
async function watchedRatings(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const out = new Map<string, Rated>();
  for (const c of await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
    const r = watched(c);
    if (r) out.set(c._id, r);
  }
  return out;
}

// A role's next step: its description, then the sort (the first time, against every approved direction; after
// rankAgain, against the directions asked for), then judging for the directions it was sorted to that have no verdict.
// Roles judged before sorting existed have a verdict and no sort; they're done until ranked again.
function stepFor(p: Doc<"postings">, approved: Map<string, number>): Step | undefined {
  if (!p.descriptionAt) return "text";
  if (approved.size && ((!p.sort && p.fitAt === undefined) || p.rerank?.some((d) => approved.has(d)))) return "sort";
  if (p.sort?.directionIds.some((d) => approved.has(d) && !p.fit?.some((f) => f.directionId === d))) return "judge";
  return undefined;
}

// Watched companies whose board a pass reads, those someone asked to check first, then Targets: every one they asked to
// check, and with `boards`, every one not read since the pass started.
async function boardsToRead(ctx: QueryCtx, workspaceId: Id<"workspaces">, since: number, boards: boolean, only?: Id<"companies">[]) {
  const settings = await settingsOf(ctx, workspaceId);
  const useApollo = !!settings?.apolloJobs;
  const companies = (await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).filter((c) => watched(c) && (!only || only.includes(c._id)));
  // A company found only through Apollo's postings is read again only while they have that turned on.
  const left = companies
    .filter((c) => c.details?.board && (c.details.board.provider !== "apollo" || useApollo))
    .filter((c) => c.rolesCheckAt || (boards && Math.max(c.roles?.at ?? 0, c.roles?.failedAt ?? 0) < since))
    .sort((a, b) => (b.rolesCheckAt ?? 0) - (a.rolesCheckAt ?? 0) || Number(a.rating?.value !== "excited") - Number(b.rating?.value !== "excited"));
  return { left, useApollo };
}

export const todo = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.number(), boards: v.boolean(), only: onlyCompanies },
  handler: async (ctx, { workspaceId, since, boards, only }) => {
    const { left, useApollo } = await boardsToRead(ctx, workspaceId, since, boards, only);
    return {
      batch: left.slice(0, BATCH).map((c) => ({ id: c._id, board: c.details!.board! })),
      remaining: left.length,
      titles: interleave((await directionsFor(ctx, workspaceId)).map((d) => d.titles)),
      useApollo,
    };
  },
});

// Put every open role in their area in the queue for its next step, and take out roles no longer open, watched or in
// their area (with `only`, every role outside those companies: a later pass queues them again from where they stand).
// Roles that failed three times this pass stay out until the next one. Every role's rows on the Roles page are brought
// in step on the way. A page of the workspace's roles at a time, so a workspace with tens of thousands of roles stays
// within what one write may read.
export const plan = internalMutation({
  args: { workspaceId: v.id("workspaces"), since: v.number(), only: onlyCompanies, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { workspaceId, since, only, cursor }) => {
    const ratings = await watchedRatings(ctx, workspaceId);
    const companies = new Set([...ratings.keys()].filter((c) => !only || only.includes(c as Id<"companies">)));
    const rank = await ranker(ctx, workspaceId, ratings);
    const { approved, area } = rank;
    const counts: Record<Step, number> = { text: 0, sort: 0, judge: 0 };
    // Running again (the budget allows now, or a fresh run took over): AI work is handed out again.
    if (cursor === null) {
      const row = await settingsOf(ctx, workspaceId);
      if (row?.rolesBudget) await ctx.db.patch(row._id, { rolesBudget: undefined });
    }
    const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate({ cursor, numItems: SYNC_PAGE });
    for (const p of page.page) {
      const inScope = !p.closedAt && companies.has(p.companyId) && inWorkArea(p, area);
      const setAside = p.failed && p.failed.count >= MAX_FAILURES && p.failed.at >= since;
      const step = inScope && !setAside ? stepFor(p, approved) : undefined;
      if (step) counts[step]++;
      // A role gets its spot (schema.ts) the first time it's queued, and keeps it.
      const spot = step && p.spot === undefined ? Math.random() : p.spot;
      if (p.queue !== step) await ctx.db.patch(p._id, { queue: step, claimedAt: undefined, claimedBy: undefined, spot });
      else if (spot !== p.spot) await ctx.db.patch(p._id, { spot });
      await rank.sync(p);
    }
    return { ...counts, isDone: page.isDone, cursor: page.continueCursor, method: (await settingsOf(ctx, workspaceId))?.roleSort ?? ("model" as SortMethod) };
  },
});

// Up to n roles of a step that nobody holds: from a random spot in its queue, and the next ones on from there (or back
// from there, at the end), so workers claiming at once read and take different roles instead of all reaching for the
// same first few. Once none is free, claims older than CLAIM_MS.
async function freeIn(ctx: QueryCtx, workspaceId: Id<"workspaces">, step: Step, n: number, now: number) {
  const at = Math.random();
  const free = await ctx.db.query("postings").withIndex("by_queue", (q) => q.eq("workspaceId", workspaceId).eq("queue", step).eq("claimedAt", undefined).gte("spot", at)).take(n);
  if (free.length < n)
    free.push(...(await ctx.db.query("postings").withIndex("by_queue", (q) => q.eq("workspaceId", workspaceId).eq("queue", step).eq("claimedAt", undefined).lt("spot", at)).order("desc").take(n - free.length)));
  return free.length ? free : ctx.db.query("postings").withIndex("by_queue", (q) => q.eq("workspaceId", workspaceId).eq("queue", step).lt("claimedAt", now - CLAIM_MS)).take(n);
}

// A worker takes a few roles nobody holds: descriptions first; sorting once every description is in (so what a
// company repeats is counted across all its roles); then judging. Once the budget refused an AI call in this pass in a
// way waiting on running calls won't change (release's `budget`), only descriptions are handed out. Null: stopped, or
// nothing left it may take. wait: the rest is held by other workers (or waits on their descriptions).
export const claim = internalMutation({
  args: { workspaceId: v.id("workspaces"), since: v.number(), worker: v.string() },
  handler: async (ctx, { workspaceId, since, worker }): Promise<{ step: Step; ids: Id<"postings">[] } | { wait: true } | null> => {
    if (await isStopped(ctx, workspaceId, since)) return null;
    const refused = (await settingsOf(ctx, workspaceId))?.rolesBudget?.since === since;
    const now = Date.now();
    let textLeft = false;
    for (const [step, n] of [["text", TEXT_BATCH], ["sort", SORT_BATCH], ["judge", JUDGE_BATCH]] as const) {
      // Whether descriptions are still out is read only once none is free, so a claim of descriptions doesn't also read
      // the front of their queue, which every other claim changes.
      if (step === "sort") {
        textLeft = !!(await inQueue(ctx, workspaceId, "text").first());
        if (textLeft) continue;
      }
      if (step !== "text" && refused) continue;
      const free = await freeIn(ctx, workspaceId, step, n, now);
      if (!free.length) continue;
      for (const p of free) await ctx.db.patch(p._id, { claimedAt: now, claimedBy: worker });
      return { step, ids: free.map((p) => p._id) };
    }
    return textLeft || (!refused && ((await inQueue(ctx, workspaceId, "sort").first()) || (await inQueue(ctx, workspaceId, "judge").first()))) ? { wait: true } : null;
  },
});

// A worker couldn't finish its roles: they're free again. `error`: the roles' own input failed (the model couldn't
// read or answer for them), which counts toward setting them aside. Anything else (our own limits and bugs, OpenRouter
// down, the budget) frees them without counting; a problem that isn't the budget is recorded for the pass, and so is
// a budget refusal that waiting on running calls won't change (`budget`, why it refused, work's refusedBy), which stops
// the pass handing out AI work.
export const release = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    since: v.number(),
    worker: v.string(),
    ids: v.array(v.id("postings")),
    error: v.optional(v.string()),
    problem: v.optional(v.string()),
    budget: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceId, since, worker, ids, error, problem, budget }) => {
    const at = Date.now();
    for (const id of ids) {
      const p = await ctx.db.get(id);
      if (!p || p.workspaceId !== workspaceId || p.claimedBy !== worker) continue;
      const count = error ? (p.failed && p.failed.at >= since ? p.failed.count : 0) + 1 : 0;
      await ctx.db.patch(id, {
        claimedAt: undefined,
        claimedBy: undefined,
        ...(error ? { failed: { count, at, error: error.slice(0, 500) }, ...(count >= MAX_FAILURES ? { queue: undefined } : {}) } : {}),
      });
    }
    if (problem) {
      const row = await settingsOf(ctx, workspaceId);
      const had = row?.rolesProblems && row.rolesProblems.since === since ? row.rolesProblems.count : 0;
      const rolesProblems = { since, count: had + 1, at, error: problem.slice(0, 500) };
      if (row) await ctx.db.patch(row._id, { rolesProblems });
      else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], rolesProblems });
    }
    if (budget) {
      // The first refusal is kept.
      const row = await settingsOf(ctx, workspaceId);
      if (row?.rolesBudget?.since === since) return;
      const rolesBudget = { since, at, message: budget };
      if (row) await ctx.db.patch(row._id, { rolesBudget });
      else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], rolesBudget });
    }
  },
});

// Whether each step has roles left, whether the pass was stopped, why the AI budget refused a call in it (refused) and
// whether an AI call is still running then, and problems that weren't about any one role. Reads only the first role of
// each step, however many are queued.
export const progress = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.number() },
  handler: async (ctx, { workspaceId, since }) => {
    const left: Record<Step, boolean> = { text: false, sort: false, judge: false };
    for (const step of STEPS) left[step] = !!(await inQueue(ctx, workspaceId, step).first());
    const settings = await settingsOf(ctx, workspaceId);
    const problems = settings?.rolesProblems;
    const refused = settings?.rolesBudget?.since === since ? settings.rolesBudget.message : null;
    return {
      ...left,
      stopped: await isStopped(ctx, workspaceId, since),
      refused,
      running: refused ? await aiRunning(ctx, workspaceId) : false,
      problems: problems && problems.since === since ? { count: problems.count, error: problems.error } : null,
    };
  },
});

// A page of what a pass did, for its job's result: roles sorted and judged since it started, and roles set aside with why.
export const outcome = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.number(), only: onlyCompanies, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { workspaceId, since, only, cursor }) => {
    const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).eq("closedAt", undefined)).paginate({ cursor, numItems: PAGE });
    const open = page.page.filter((p) => !only || only.includes(p.companyId));
    const setAside = open.filter((p) => p.failed && p.failed.count >= MAX_FAILURES && p.failed.at >= since);
    return {
      sorted: open.filter((p) => (p.sort?.at ?? 0) >= since).length,
      sortedOut: open.filter((p) => (p.sort?.at ?? 0) >= since && !p.sort!.directionIds.length).length,
      judged: open.filter((p) => (p.fitAt ?? 0) >= since).length,
      setAside: setAside.length,
      error: setAside[0]?.failed?.error ?? null,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

const jobInput = v.object({
  externalId: v.string(), title: v.string(), url: v.string(), applyUrl: v.optional(v.string()), location: v.optional(v.string()), remote: v.boolean(), postedAt: v.optional(v.number()), description: v.optional(v.string()), facts: v.optional(detailsValidator),
});
// What a read of the board states about a role, over what earlier reads stated (a field a board stops giving stays).
const boardFacts = (had: Details | undefined, facts: Details | undefined) => (facts && Object.keys(facts).length ? { ...had, ...facts } : had);

// Save one part of a board read. `touched` carries the roles already saved from this read, so a role listed twice is one row.
export const saveJobs = internalMutation({
  args: { workspaceId: v.id("workspaces"), companyId: v.id("companies"), provider: v.union(...BOARD_PROVIDERS.map((p) => v.literal(p))), jobs: v.array(jobInput), touched: v.array(v.id("postings")), at: v.number() },
  handler: async (ctx, { workspaceId, companyId, provider, jobs, touched, at }) => {
    const c = await ctx.db.get(companyId);
    if (!c || c.workspaceId !== workspaceId) return touched;
    const done = new Set<Id<"postings">>(touched);
    const rank = await ranker(ctx, workspaceId);
    const existing = await ctx.db.query("postings").withIndex("by_company", (q) => q.eq("companyId", companyId)).collect();
    const byId = new Map(existing.map((p) => [p.externalId, p]));
    const byRole = new Map<string, Doc<"postings">>();
    // An open row wins over a closed one with the same title and location.
    for (const p of existing) {
      const had = byRole.get(sameRole(p.title, p.location));
      if (!had || (had.closedAt && !p.closedAt)) byRole.set(sameRole(p.title, p.location), p);
    }
    for (const j of jobs) {
      const p = byId.get(j.externalId) ?? byRole.get(sameRole(j.title, j.location));
      if (p && done.has(p._id)) continue;
      // Boards whose listing carries descriptions give one (maybe "") with every role; that counts as looked up.
      const listed = j.description !== undefined && !p?.descriptionAt;
      const described = listed ? { descriptionAt: at, hasDescription: !!j.description } : {};
      let id: Id<"postings">;
      if (p) {
        id = p._id;
        await ctx.db.patch(id, {
          provider, externalId: j.externalId, url: j.url, applyUrl: j.applyUrl, title: j.title, location: j.location, remote: j.remote, lastSeen: at, closedAt: undefined, postedAt: p.postedAt ?? j.postedAt, ...described,
          boardDetails: boardFacts(p.boardDetails, j.facts),
          // A retitled role is sorted and judged again, as a new one.
          ...(p.title !== j.title ? { fit: undefined, fitAt: undefined, sort: undefined, rerank: undefined, details: undefined, brief: undefined } : {}),
        });
        await rank.sync((await ctx.db.get(id))!);
      } else {
        id = await ctx.db.insert("postings", {
          workspaceId, companyId, provider, externalId: j.externalId, url: j.url, ...(j.applyUrl ? { applyUrl: j.applyUrl } : {}), title: j.title, location: j.location, remote: j.remote, postedAt: j.postedAt, firstSeen: at, lastSeen: at, ...described,
          ...(j.facts && Object.keys(j.facts).length ? { boardDetails: j.facts } : {}),
        });
        const row = (await ctx.db.get(id))!;
        byId.set(j.externalId, row);
        byRole.set(sameRole(j.title, j.location), row);
      }
      if (listed && j.description) await ctx.db.insert("postingTexts", { workspaceId, postingId: id, text: j.description });
      done.add(id);
    }
    return [...done];
  },
});

// A board read all the way through: roles not seen in it are closed. A partial read (a board searched by title, or one
// with more roles than were read) closes nothing.
export const finishRead = internalMutation({
  args: { workspaceId: v.id("workspaces"), companyId: v.id("companies"), touched: v.array(v.id("postings")), complete: v.boolean(), read: v.number(), total: v.optional(v.number()), at: v.number() },
  handler: async (ctx, { workspaceId, companyId, touched, complete, read, total, at }) => {
    const c = await ctx.db.get(companyId);
    if (!c || c.workspaceId !== workspaceId) return;
    if (complete) {
      const seen = new Set<Id<"postings">>(touched);
      for (const p of await openAt(ctx, companyId))
        if (!seen.has(p._id)) {
          await ctx.db.patch(p._id, { closedAt: at });
          await syncRanks(ctx, p, new Map(), null, () => []);
        }
    }
    // A request to check again made while this read ran still stands.
    await ctx.db.patch(companyId, { roles: { at, read, ...(total !== undefined ? { total } : {}) }, ...((c.rolesCheckAt ?? 0) > at ? {} : { rolesCheckAt: undefined }) });
  },
});

// The board couldn't be read. Nothing is closed; the last good read stands.
export const failRead = internalMutation({
  args: { workspaceId: v.id("workspaces"), companyId: v.id("companies"), at: v.number() },
  handler: async (ctx, { workspaceId, companyId, at }) => {
    const c = await ctx.db.get(companyId);
    if (!c || c.workspaceId !== workspaceId) return;
    await ctx.db.patch(companyId, { roles: { ...(c.roles ?? { read: 0 }), failedAt: at }, ...((c.rolesCheckAt ?? 0) > at ? {} : { rolesCheckAt: undefined }) });
  },
});

// Where to fetch each claimed role's description.
export const textInput = internalQuery({
  args: { workspaceId: v.id("workspaces"), ids: v.array(v.id("postings")) },
  handler: async (ctx, { workspaceId, ids }) => {
    const out = [];
    for (const id of ids) {
      const p = await ctx.db.get(id);
      if (!p || p.workspaceId !== workspaceId) continue;
      const c = await ctx.db.get(p.companyId);
      out.push({ id, externalId: p.externalId, url: p.url, board: c?.details?.board?.provider === p.provider ? c.details.board : null });
    }
    return out;
  },
});

// Descriptions looked up: text "" means the board had none (or couldn't be read), and the role is marked as without one.
// Only the worker holding a role saves it.
export const saveTexts = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    worker: v.string(),
    texts: v.array(v.object({ id: v.id("postings"), text: v.string(), postedAt: v.optional(v.number()), facts: v.optional(detailsValidator) })),
    at: v.number(),
  },
  handler: async (ctx, { workspaceId, worker, texts, at }) => {
    const rank = await ranker(ctx, workspaceId);
    const { approved } = rank;
    for (const { id, text, postedAt, facts } of texts) {
      const p = await ctx.db.get(id);
      if (!p || p.workspaceId !== workspaceId || p.claimedBy !== worker) continue;
      const row = await textOf(ctx, id);
      if (row && text) await ctx.db.patch(row._id, { text, clean: undefined });
      else if (text) await ctx.db.insert("postingTexts", { workspaceId, postingId: id, text });
      const patch = { descriptionAt: at, hasDescription: !!text || !!row, boardDetails: boardFacts(p.boardDetails, facts), ...(postedAt && !p.postedAt ? { postedAt } : {}) };
      await ctx.db.patch(id, { ...patch, queue: stepFor({ ...p, ...patch }, approved), claimedAt: undefined, claimedBy: undefined, failed: undefined });
      // A posted date or details found with the description show on the Roles page.
      if (patch.postedAt || facts) await rank.sync({ ...p, ...patch });
    }
  },
});

// What the sort reads for each claimed role. text: its description without what the company repeats; null when that
// hasn't been worked out yet; "" when it has no description.
export const sortInput = internalQuery({
  args: { workspaceId: v.id("workspaces"), ids: v.array(v.id("postings")) },
  handler: async (ctx, { workspaceId, ids }) => {
    const directions = await directionsFor(ctx, workspaceId);
    const times = await directionTimes(ctx, workspaceId);
    const names = new Map<string, string>();
    const postings = [];
    for (const id of ids) {
      const p = await ctx.db.get(id);
      if (!p || p.workspaceId !== workspaceId) continue;
      if (!names.has(p.companyId)) names.set(p.companyId, (await ctx.db.get(p.companyId))?.name ?? "");
      const row = p.hasDescription ? await textOf(ctx, id) : null;
      const against = (p.rerank?.length ? p.rerank : directions.map((d) => d.id)).filter((d) => times.has(d));
      postings.push({ id, companyId: p.companyId, title: p.title, company: names.get(p.companyId)!, text: row ? (row.clean ?? null) : "", against });
    }
    return {
      method: (await settingsOf(ctx, workspaceId))?.roleSort ?? ("model" as SortMethod),
      directions: directions.map((d) => ({ id: d.id, name: d.name, ...(d.positioning ? { positioning: d.positioning } : {}), titles: d.titles, changedAt: times.get(d.id)! })),
      postings,
    };
  },
});

// One page of the descriptions of a company's open roles, to find what the company repeats. A large company's
// descriptions (thousands, up to 8,000 characters each) are far more than one function may read at once.
export const companyTexts = internalQuery({
  args: { workspaceId: v.id("workspaces"), companyId: v.id("companies"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { workspaceId, companyId, cursor }) => {
    const page = await ctx.db.query("postings").withIndex("by_company", (q) => q.eq("companyId", companyId).eq("closedAt", undefined)).paginate({ cursor, numItems: TEXT_PAGE });
    const texts = [];
    for (const p of page.page) {
      if (p.workspaceId !== workspaceId || !p.hasDescription) continue;
      const row = await textOf(ctx, p._id);
      if (row) texts.push({ textId: row._id, title: p.title, text: row.text });
    }
    return { texts, isDone: page.isDone, cursor: page.continueCursor };
  },
});

// One worker at a time works out what a company repeats: the others wait rather than all reading the same thousands of
// descriptions. A hold older than a claim is free again. False: another worker holds it.
export const holdCompany = internalMutation({
  args: { workspaceId: v.id("workspaces"), companyId: v.id("companies"), worker: v.string(), done: v.optional(v.boolean()) },
  handler: async (ctx, { workspaceId, companyId, worker, done }) => {
    const c = await ctx.db.get(companyId);
    if (!c || c.workspaceId !== workspaceId) return false;
    const now = Date.now();
    const held = c.textsCleaning && c.textsCleaning.by !== worker && c.textsCleaning.at > now - CLAIM_MS;
    if (done) {
      if (c.textsCleaning?.by === worker) await ctx.db.patch(companyId, { textsCleaning: undefined });
      return true;
    }
    if (held) return false;
    await ctx.db.patch(companyId, { textsCleaning: { by: worker, at: now } });
    return true;
  },
});

export const saveClean = internalMutation({
  args: { workspaceId: v.id("workspaces"), texts: v.array(v.object({ id: v.id("postingTexts"), clean: v.string() })) },
  handler: async (ctx, { workspaceId, texts }) => {
    for (const { id, clean } of texts) {
      const row = await ctx.db.get(id);
      if (row && row.workspaceId === workspaceId && row.clean !== clean) await ctx.db.patch(id, { clean });
    }
  },
});

// The sort's answer: the directions each role could plausibly be, out of those it was sorted against. A role sorted
// again for some directions (rankAgain) keeps its sort for the others.
export const saveSort = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    worker: v.string(),
    method: sortMethod,
    directions: v.array(v.object({ id: v.id("items"), changedAt: v.number() })),
    results: v.array(v.object({ id: v.id("postings"), against: v.array(v.id("items")), directionIds: v.array(v.id("items")) })),
  },
  handler: async (ctx, { workspaceId, worker, method, directions, results }) => {
    const rank = await ranker(ctx, workspaceId);
    const { approved } = rank;
    const changed = new Map(directions.map((d) => [String(d.id), d.changedAt]));
    const at = Date.now();
    for (const r of results) {
      const p = await ctx.db.get(r.id);
      if (!p || p.workspaceId !== workspaceId || p.claimedBy !== worker) continue;
      const sorted = new Set<string>(r.against);
      const sort = {
        directionIds: [...(p.sort?.directionIds ?? []).filter((d) => !sorted.has(d)), ...r.directionIds.filter((d) => sorted.has(d))],
        against: [...(p.sort?.against ?? []).filter((a) => !sorted.has(a.directionId)), ...r.against.map((d) => ({ directionId: d, directionAt: changed.get(d) ?? at }))],
        method,
        at,
      };
      const rerank = p.rerank?.filter((d) => !sorted.has(d));
      const next = { ...p, sort, rerank: rerank?.length ? rerank : undefined };
      await ctx.db.patch(r.id, { sort, rerank: next.rerank, queue: stepFor(next, approved), claimedAt: undefined, claimedBy: undefined, failed: undefined });
      await rank.sync(next);
    }
  },
});

// Their approved record, compactly, for the brief's "for you" and the stretch: approved roles with their skills and
// approved facts, approved projects with theirs, nothing awaiting review, rejected or from a narrative; and their years
// of work, from those roles' dates (a project adds no years).
async function recordSummary(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const { roles, projects, facts } = await approvedRecord(ctx, workspaceId);
  const lines: string[] = [];
  const factsOf = (key: string | undefined) => facts.filter((f) => f.roleKey === key).map((f) => `  - ${f.text}`);
  for (const r of [...roles].sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))) {
    const when = `${r.start ?? "?"} to ${r.end ?? "now"}`;
    if (r.break) lines.push(`Career break (${when})${r.reason ? `: ${r.reason}` : ""}`);
    else lines.push(`${r.employer ?? "?"} · ${resumeTitle(r)?.text ?? "untitled"} (${when})${r.location ? `, ${r.location}` : ""}`);
    const skills = [...(r.skills ?? []), ...(r.tools ?? [])];
    if (skills.length) lines.push(`  Skills: ${skills.join(", ")}`);
    lines.push(...factsOf(r.roleKey));
  }
  if (projects.length) lines.push("Projects (their own repositories):");
  for (const p of projects) {
    const role = p.roleKey ? roles.find((r) => r.roleKey === p.roleKey) : undefined;
    lines.push(`${p.name} (${p.start ?? "?"} to ${p.end ?? "?"})${role ? `, part of ${role.title ?? "?"} at ${role.employer ?? "?"}` : ""}${p.summary ? `: ${p.summary}` : ""}`);
    if (p.stack?.length) lines.push(`  Stack: ${p.stack.join(", ")}`);
    lines.push(...facts.filter((f) => f.projectKey === p.projectKey).map((f) => `  - ${f.text}`));
  }
  const loose = facts.filter((f) => !f.projectKey && (!f.roleKey || !roles.some((r) => r.roleKey === f.roleKey))).map((f) => `  - ${f.text}`);
  if (loose.length) lines.push("Not tied to a role:", ...loose);
  return { text: lines.join("\n"), years: yearsWorked(roles, Date.now()) };
}

// What every judging call reads before its roles, the same for every call so the model's provider can reuse it: every
// approved direction (and when each last changed), their approved limits, their approved record and years of work; and
// the rubric to score by (theirs, unless one is asked for; roleRubric.ts).
async function judgeContext(ctx: QueryCtx, workspaceId: Id<"workspaces">, asked?: Rubric) {
  const directions = await directionsFor(ctx, workspaceId);
  const times = await directionTimes(ctx, workspaceId);
  // Eligibility limits, which the Roles page also checks from what a role states, go with their fields, so both read
  // them the same way.
  const limits = (await activeLimits(ctx, workspaceId)).map((l) => ({
    kind: l.data.kind, label: l.data.label, value: l.data.value, ...(l.data.firm ? { firm: true } : {}), ...(l.data.kind === "eligibility" && l.data.rule ? { rule: l.data.rule } : {}),
  }));
  const record = await recordSummary(ctx, workspaceId);
  return {
    directions,
    times: directions.map((d) => ({ id: d.id, changedAt: times.get(d.id)! })),
    limits,
    record: record.text,
    years: record.years,
    rubric: asked ?? rubricOf(await settingsOf(ctx, workspaceId)),
  };
}

// One role as judging reads it, for the directions asked: its description without what the company repeats (null
// when it has none), and what its board states.
async function postingInput(ctx: QueryCtx, p: Doc<"postings">, directionIds: Id<"items">[]) {
  const c = await ctx.db.get(p.companyId);
  const row = p.hasDescription ? await textOf(ctx, p._id) : null;
  return {
    id: p._id,
    title: p.title,
    company: c?.name ?? "",
    ...(c?.details?.summary ? { companySummary: c.details.summary } : {}),
    ...(p.location ? { location: p.location } : {}),
    remote: p.remote,
    ...(p.boardDetails && Object.keys(p.boardDetails).length ? { board: p.boardDetails } : {}),
    description: row ? (row.clean ?? row.text) : null,
    directionIds,
  };
}
// What one judging call reads (judgeContext, then its roles from postingInput); directions and limits go as they are.
// turnedDown: roles they said Not for me to, with why, when they learn from their ratings (only role fit reads them; a
// rubric comparison is scored against their ratings, so it doesn't).
type JudgeInput = { rubric: Rubric; record: string; years: number; directions: unknown[]; limits: unknown[]; turnedDown?: unknown[]; postings: { id: Id<"postings">; directionIds: Id<"items">[] }[] };

// Roles they turned down with a reason, latest first: preferences for ranking, never limits.
const TURNED_DOWN_MAX = 30;
async function turnedDownRoles(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  if (!learns(await settingsOf(ctx, workspaceId))) return [];
  const rows = await ctx.db.query("postings").withIndex("by_rating", (q) => q.eq("workspaceId", workspaceId).eq("rating.value", "no")).collect();
  const out = [];
  for (const p of rows.filter((r) => r.rating?.reason).sort((a, b) => b.rating!.at - a.rating!.at).slice(0, TURNED_DOWN_MAX))
    out.push({ title: p.title, company: (await ctx.db.get(p.companyId))?.name ?? "", why: p.rating!.reason! });
  return out;
}

// What judging reads for each claimed role (postingInput), for only the directions the sort passed it to that it has
// no verdict for, after what every call reads (judgeContext).
export const judgeInput = internalQuery({
  args: { workspaceId: v.id("workspaces"), ids: v.array(v.id("postings")) },
  handler: async (ctx, { workspaceId, ids }) => {
    const context = await judgeContext(ctx, workspaceId);
    const approved = new Set(context.directions.map((d) => String(d.id)));
    const postings = [];
    for (const id of ids) {
      const p = await ctx.db.get(id);
      if (p?.workspaceId === workspaceId) postings.push(await postingInput(ctx, p, (p.sort?.directionIds ?? []).filter((d) => approved.has(d) && !p.fit?.some((f) => f.directionId === d))));
    }
    return { ...context, turnedDown: await turnedDownRoles(ctx, workspaceId), postings };
  },
});

// Judging input for some postings against every approved direction, whatever the sort said: the answer key the sort
// backtest (sortFaceoff:faceoff) scores sorts against. Reads only.
export const truthInput = internalQuery({
  args: { workspaceId: v.id("workspaces"), ids: v.array(v.id("postings")) },
  handler: async (ctx, { workspaceId, ids }) => {
    const context = await judgeContext(ctx, workspaceId);
    const all = context.directions.map((d) => d.id);
    const postings = [];
    for (const id of ids) {
      const p = await ctx.db.get(id);
      if (p?.workspaceId === workspaceId) postings.push(await postingInput(ctx, p, all));
    }
    return { ...context, turnedDown: await turnedDownRoles(ctx, workspaceId), postings };
  },
});

// What judging found for each role: verdicts for the directions it was judged against (those the reply named, and
// "none" for the rest), each with the rubric it was scored by and, under v2, the role's stretch; what its description
// says (details) and its brief.
export const saveFit = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    worker: v.string(),
    rubric,
    directions: v.array(v.object({ id: v.id("items"), changedAt: v.number() })),
    results: v.array(
      v.object({
        id: v.id("postings"),
        judged: v.array(v.id("items")),
        fit: v.array(v.object({ directionId: v.id("items"), level, score: v.optional(v.number()), reason: v.string() })),
        stretch: v.array(v.string()),
        details: v.optional(detailsValidator),
        brief: v.optional(v.object({ job: v.string(), forYou: v.string() })),
      }),
    ),
  },
  handler: async (ctx, { workspaceId, worker, rubric: judgedBy, directions, results }) => {
    const rank = await ranker(ctx, workspaceId);
    const { approved } = rank;
    const changed = new Map(directions.map((d) => [String(d.id), d.changedAt]));
    const at = Date.now();
    for (const { id, judged, fit, stretch, details, brief } of results) {
      const p = await ctx.db.get(id);
      if (!p || p.workspaceId !== workspaceId || p.claimedBy !== worker) continue;
      const verdicts = judged.map((d) => {
        const f = fit.find((x) => x.directionId === d);
        return {
          directionId: d, level: f?.level ?? ("none" as const), ...(f ? { reason: f.reason } : {}), ...(f?.score !== undefined ? { score: f.score } : {}), method: "model" as const,
          ...(p.sort ? { sortedBy: p.sort.method } : {}), directionAt: changed.get(d) ?? at, rubric: judgedBy, ...(f && stretch.length ? { stretch } : {}),
        };
      });
      const next = {
        ...p,
        fit: [...(p.fit ?? []).filter((f) => !judged.includes(f.directionId)), ...verdicts],
        ...(judged.length ? { fitAt: at } : {}),
        ...(details ? { details: { ...details, at } } : {}),
        ...(brief ? { brief: { ...brief, at } } : {}),
      };
      await ctx.db.patch(id, { fit: next.fit, fitAt: next.fitAt, details: next.details, brief: next.brief, queue: stepFor(next, approved), claimedAt: undefined, claimedBy: undefined, failed: undefined });
      await rank.sync(next);
    }
  },
});

// What judging asks the model under each rubric (roleRubric.ts): v1 as first written; v2 also counts the stretch.
function rankPrompt(rubric: Rubric) {
  const v2 = rubric === "v2";
  return `You read job postings for one job seeker: how well each fits the directions named on it, ${v2 ? "how big a stretch it is for them, " : ""}what it states about the job, and a short brief. ${
    v2
      ? "The score tells them whether to spend their time on a role, so it counts both how well the work fits and how big a stretch the role is for them. A stretch lowers the score; it never lowers the level or rules a role out."
      : "This is not a prediction of whether they'd be hired: gaps in their background are handled when tailoring, so they never lower a level or a score."
  }

Fit. Judge each posting only against the directions in its "directionIds". A quick first sort found it could plausibly be each of them; that sort leans toward including, so "none" is still a fair answer.
Judge from the posting's description: the work, the level, the setting. What the company repeats in all its postings (about the company, benefits, legal text) has been taken out. Use the title only when there's no description, and then say the level rests on the title alone. Title words alone never decide: a role can fit under a different title, and a familiar title can hide different work.
For each direction use its positioning, target titles, market vocabulary and criteria, and respect the seeker's approved limits (where they'll work, seniority, work they avoid, company types, pay, travel, the security clearance they hold, whether they need visa sponsorship). A role against a firm limit is "none" for every direction. A role that requires a higher clearance than they hold, or says it doesn't sponsor a visa when they need one, is against that limit; a role that doesn't say is not.
${
  v2
    ? `Levels, for the work alone: "strong" (the work this direction is about, not beneath their level), "some" (plausible and worth a look), "weak" (only partly this direction's work), "none" (different work, or against a firm limit). Never lower a level for a stretch.
"score": 0 to 100, how worth their time the role is. First place it in its level's band by how well the work fits (strong 75 to 100, some 50 to 74, weak 25 to 49, none 0 to 24). Then take points off for every gap in its stretch, by how much it would hold them back: about 5 for a small one; 10 to 15 for each clear one (a core requirement their record lacks, a post above theirs, a place or setup outside their preference); 20 or more for work they said they avoid, or for many more years than they have. A big stretch can cost 40 points or more, and a score may end well below its level's band. Only a role with no stretch keeps its score in the band, used whole so roles of one level are told apart.`
    : `Levels: "strong" (the work this direction is about, at a fitting level, within their limits), "some" (plausible and worth a look), "weak" (a stretch, or only partly this direction's work), "none" (different work, or against a limit).
"score": 0 to 100 for the same judgment, inside its level's band: strong 75 to 100, some 50 to 74, weak 25 to 49, none 0 to 24. Use the whole band, so roles of one level are told apart by how well they fit.`
}
"reason": one plain sentence naming the deciding facts from the posting. When the posting is too thin to judge, say "Read this one yourself:" and what's missing.${
  v2
    ? `
"stretch", for each posting: the gaps between it and them, judged from their approved record and years of work (never assume experience the record doesn't show): years asked beyond theirs; seniority well above the most senior post they've held; core requirements (the skills, domains, sectors or credentials the job centers on) their record lacks; approved limits that aren't firm that it doesn't meet (where they'll work, setup, pay, travel, or another preference). A nice-to-have is not a gap. Each gap is a short plain phrase, e.g. "asks for 12+ years of product marketing", "VP level, above your manager posts", "hospital billing work your record doesn't show", "on-site in Denver, outside your location preference". [] when there's none.`
    : ""
}

Details: what the posting states about the job, in these fields; leave a field out when the posting doesn't say it or clearly imply it. Never guess. "board" holds what the job board itself states: leave those fields out.
- "pay": {"min": number, "max": number, "currency": "USD", "period": "year"|"month"|"week"|"day"|"hour"}: the base pay range. Several ranges (by location or level): those for the places the seeker would work (their Location limit), else US ones, the lowest min and highest max among them, in their currency.
- "setup": "onsite"|"hybrid"|"remote"
- "locations": the places it can be done from, as the posting names them, e.g. ["Austin, TX", "Remote, US"]
- "seniority": one of ${LEVELS.map((l) => `"${l}"`).join("|")} ("individual": an individual contributor at any grade)
- "yearsAsked": the fewest years of experience it asks for, as a number
- "employmentType": one of ${EMPLOYMENT_TYPES.map((t) => `"${t}"`).join("|")}
- "travel": the most travel it expects, as a percent of time (0 when it says there's none)
- "clearance": the security clearance it requires, one of ${CLEARANCES.map((c) => `"${c}"`).join("|")} ("none" when it says none is needed)
- "visa": true when it offers visa sponsorship, false when it says it doesn't

Brief, for every posting, however well it fits:
- "job": two or three neutral sentences on what the job is: the work, who it serves, what it asks for. From the posting only.
- "forYou": one to three sentences to the seeker ("you", "your"): why it fits them and what's thin (for a poor fit, why it doesn't), naming the roles and facts from their approved record that bear on it. Use only their record: never assume experience it doesn't show, and when the record doesn't cover something the job asks for, say it's thin.

No dashes as punctuation (no em or en dashes); use commas or periods.
Reply with JSON only: {"postings":[{"id": "...", "fit": [{"directionId": "...", "level": "...", "score": 0, "reason": "..."}], ${v2 ? `"stretch": ["..."], ` : ""}"details": {...}, "brief": {"job": "...", "forYou": "..."}}]}, with every direction in its "directionIds" in "fit".`;
}

type FitReply = {
  postings?: { id?: string; fit?: { directionId?: string; level?: string; score?: unknown; reason?: string }[]; stretch?: unknown; details?: unknown; brief?: { job?: unknown; forYou?: unknown } }[];
};
// The reply's shape (structured output, metering.chat), as judgeCall reads it: details as cleanDetails takes them, a
// detail the posting doesn't give null or empty, and "stretch" under the v2 rubric only.
const DETAILS = strictObject({
  pay: strictObject({ min: orNull("number"), max: orNull("number"), currency: string, period: string }),
  setup: string,
  locations: strings,
  seniority: string,
  yearsAsked: orNull("number"),
  employmentType: string,
  travel: orNull("number"),
  clearance: string,
  visa: orNull("boolean"),
});
export const roleFitSchema = (rubric: Rubric): ReplySchema =>
  replyOf("role_fit", "postings", {
    id: string,
    fit: listOf({ directionId: string, level: string, score: number, reason: string }),
    ...(rubric === "v2" ? { stretch: strings } : {}),
    details: DETAILS,
    brief: strictObject({ job: string, forYou: string }),
  });

// A worker fetches a few descriptions at a time: with every worker fetching, a whole claim at once is more than the
// boards answer, and a description they turn away is saved as none.
async function fetchTexts(ctx: ActionCtx, ws: Id<"workspaces">, worker: string, ids: Id<"postings">[]) {
  const at = Date.now();
  const rows = await ctx.runQuery(internal.roles.textInput, { workspaceId: ws, ids });
  const texts: { id: Id<"postings">; text: string; postedAt?: number; facts?: Details }[] = [];
  await pool(rows, FETCHES, async (t) => {
    const d = t.board ? await readDescription(t.board, t) : null;
    texts.push({ id: t.id, text: d?.text ?? "", ...(d?.postedAt ? { postedAt: d.postedAt } : {}), ...(d?.facts ? { facts: d.facts } : {}) });
  });
  await ctx.runMutation(internal.roles.saveTexts, { workspaceId: ws, worker, texts, at });
}

// Works out and saves what one company repeats across its postings: every description is counted, a page at a time,
// then each is cleaned and saved, a page at a time again.
async function cleanCompany(ctx: ActionCtx, ws: Id<"workspaces">, companyId: Id<"companies">) {
  const repeated = new Boilerplate();
  for (let cursor: string | null = null, done = false; !done; ) {
    const page: { texts: { title: string; text: string }[]; isDone: boolean; cursor: string } = await ctx.runQuery(internal.roles.companyTexts, { workspaceId: ws, companyId, cursor });
    repeated.count(page.texts);
    ({ cursor, isDone: done } = page);
  }
  for (let cursor: string | null = null, done = false; !done; ) {
    const page: { texts: { textId: Id<"postingTexts">; text: string }[]; isDone: boolean; cursor: string } = await ctx.runQuery(internal.roles.companyTexts, { workspaceId: ws, companyId, cursor });
    const texts = page.texts.map((r) => ({ id: r.textId, clean: repeated.clean(r.text) }));
    for (let i = 0; i < texts.length; i += SAVE_CHUNK) await ctx.runMutation(internal.roles.saveClean, { workspaceId: ws, texts: texts.slice(i, i + SAVE_CHUNK) });
    ({ cursor, isDone: done } = page);
  }
}

// Sorts the claimed roles. Returns the ones put off because another worker is still working out what their company
// repeats; they're freed to be claimed again. Claims are spread over every company's roles, so the roles are read again
// after each company this worker works out: one another worker finished meanwhile isn't worked out twice. A sort call
// that fails (the budget refusing it, say) stops the rest, but every call that came back is paid for, so its roles are
// saved first; the failure then comes as Unfinished, naming the roles left, or as itself when none was saved.
async function sortSome(ctx: ActionCtx, ws: Id<"workspaces">, worker: string, ids: Id<"postings">[]) {
  let input = await ctx.runQuery(internal.roles.sortInput, { workspaceId: ws, ids });
  const later: Id<"postings">[] = [];
  const uncleaned = new Set(input.postings.filter((p) => p.text === null).map((p) => p.companyId));
  for (const companyId of uncleaned) {
    if (!input.postings.some((p) => p.companyId === companyId && p.text === null)) continue;
    if (!(await ctx.runMutation(internal.roles.holdCompany, { workspaceId: ws, companyId, worker }))) {
      later.push(...input.postings.filter((p) => p.companyId === companyId).map((p) => p.id));
      continue;
    }
    try {
      await cleanCompany(ctx, ws, companyId);
    } finally {
      await ctx.runMutation(internal.roles.holdCompany, { workspaceId: ws, companyId, worker, done: true });
    }
    input = await ctx.runQuery(internal.roles.sortInput, { workspaceId: ws, ids: ids.filter((id) => !later.includes(id)) });
  }
  // Roles sorted against the same directions go together (they differ only after rankAgain).
  const groups = new Map<string, typeof input.postings>();
  for (const p of input.postings) if (!later.includes(p.id)) groups.set(p.against.join(","), [...(groups.get(p.against.join(",")) ?? []), p]);
  const results: { id: Id<"postings">; against: Id<"items">[]; directionIds: Id<"items">[] }[] = [];
  let failure: { e: unknown } | undefined;
  for (const group of groups.values()) {
    const against = group[0].against;
    const directions = input.directions.filter((d) => against.includes(d.id));
    const sort = await sortRoles(ctx, ws, input.method, group.map((p) => ({ id: p.id, title: p.title, company: p.company, text: p.text ?? "" })), directions);
    for (const p of group) {
      const sorted = sort.results.get(p.id);
      if (sorted) results.push({ id: p.id, against, directionIds: against.filter((d) => sorted.includes(d)) });
    }
    failure = sort.failure;
    if (failure) break;
  }
  if (results.length) await ctx.runMutation(internal.roles.saveSort, { workspaceId: ws, worker, method: input.method, directions: input.directions.map((d) => ({ id: d.id, changedAt: d.changedAt })), results });
  if (failure) {
    if (!results.length) throw failure.e;
    const saved = new Set<Id<"postings">>(results.map((r) => r.id));
    throw new Unfinished(ids.filter((id) => !saved.has(id)), failure.e);
  }
  return later;
}

// Judges roles for the directions named on each, under the input's rubric: per role, the verdicts the reply gave (a
// direction it leaves out is "none" once saved), its stretch (v2 only), details and brief; and what the call cost.
// Saves nothing. `purpose` names the call in their AI spending.
export async function judgeCall(ctx: ActionCtx, ws: Id<"workspaces">, input: JudgeInput, purpose: string) {
  const asked = input.postings.filter((p) => p.directionIds.length);
  let byId = new Map<string, NonNullable<FitReply["postings"]>[number]>();
  let costUsd = 0;
  if (asked.length) {
    const choice = await modelFor(ctx, ws, "companies");
    const reply = await withBackoff(() =>
      chatJson<FitReply>(ctx, {
        workspaceId: ws,
        purpose,
        model: choice.model,
        reasoning: choice.reasoning,
        schema: roleFitSchema(input.rubric),
        messages: [
          { role: "system", content: rankPrompt(input.rubric) },
          {
            role: "user",
            content: `Their approved record:\n${input.record}\n\n${input.rubric === "v2" ? `Their years of work, from their approved roles' dates: ${input.years}\n\n` : ""}Directions:\n${JSON.stringify(input.directions)}\n\nTheir approved limits:\n${JSON.stringify(input.limits)}\n\n${
              input.turnedDown?.length ? `Roles they turned down, and why (their preferences, never limits: a posting like one of these, in the way the reason names, may score lower, but this alone never makes it "none"):\n${JSON.stringify(input.turnedDown)}\n\n` : ""
            }Postings:\n${JSON.stringify(asked)}`,
          },
        ],
      }),
    );
    byId = new Map((reply.out.postings ?? []).map((p) => [String(p.id), p]));
    costUsd = reply.costUsd;
  }
  const text = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const results = input.postings.map((p) => {
    const r = byId.get(String(p.id));
    const details = r ? cleanDetails(r.details) : {};
    const brief = { job: text(r?.brief?.job), forYou: text(r?.brief?.forYou) };
    return {
      id: p.id,
      judged: p.directionIds,
      fit: (r?.fit ?? [])
        .filter((x) => x.directionId && p.directionIds.includes(x.directionId as Id<"items">) && x.level && Object.hasOwn(LEVEL_ORDER, x.level) && x.reason?.trim())
        .map((x) => {
          const score = typeof x.score === "number" || typeof x.score === "string" ? Number(x.score) : NaN;
          return { directionId: x.directionId as Id<"items">, level: x.level as Level, reason: x.reason!.trim(), ...(score >= 0 && score <= 100 ? { score: Math.round(score) } : {}) };
        }),
      stretch: input.rubric === "v2" ? cleanStretch(r?.stretch) : [],
      ...(r ? { details } : {}),
      ...(brief.job && brief.forYou ? { brief } : {}),
    };
  });
  return { results, costUsd };
}

async function judgeSome(ctx: ActionCtx, ws: Id<"workspaces">, worker: string, ids: Id<"postings">[]) {
  const input = await ctx.runQuery(internal.roles.judgeInput, { workspaceId: ws, ids });
  const { results } = await judgeCall(ctx, ws, input, "role fit");
  await ctx.runMutation(internal.roles.saveFit, { workspaceId: ws, worker, rubric: input.rubric, directions: input.times, results });
  return [];
}

// Does one claimed step; returns roles put off for later.
async function runStep(ctx: ActionCtx, ws: Id<"workspaces">, worker: string, step: Step, ids: Id<"postings">[]): Promise<Id<"postings">[]> {
  if (step === "text") {
    await fetchTexts(ctx, ws, worker, ids);
    return [];
  }
  return step === "sort" ? sortSome(ctx, ws, worker, ids) : judgeSome(ctx, ws, worker, ids);
}

const budgetStop = (e: unknown) => e instanceof ConvexError && (e.data as BudgetReached)?.code === BUDGET_REACHED;
// Whether a failure could come from the roles' own input: a reply the model couldn't make readable for them, or
// OpenRouter turning the request down as too long. Anything else (a model that doesn't exist, our own limits and bugs,
// OpenRouter down) is ours or OpenRouter's.
const inputFault = (e: unknown) =>
  e instanceof UnreadableReply || (e instanceof OpenRouterError && (e.status === 413 || (e.status === 400 && /context|too long|too large|maximum|tokens/i.test(e.message))));
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
// A step that failed after saving some of its roles: `left`, the ones it didn't save, and why it failed (`failure`).
class Unfinished extends Error {
  constructor(
    readonly left: Id<"postings">[],
    readonly failure: unknown,
  ) {
    super(messageOf(failure));
  }
}
// Whether a write lost to other workers' writes on every one of Convex's own retries (many claiming the same roles at once).
const conflicted = (e: unknown) => /changed while this mutation was being run/.test(messageOf(e));

// One worker: claims roles, does their next step, saves, and claims again until nothing is left, the pass is stopped,
// the AI budget runs out, or its time is up. A claim that keeps losing to other workers' claims is tried again after a
// short, random pause. When a few roles fail together in a way their input could cause, each is tried alone: only a
// role that fails alone counts toward being set aside, and if every one fails alone the cause is taken to be ours, not
// theirs. Its paid calls are spent on the pass's job, for whoever started the pass.
// A call the budget refuses for what calls still running hold frees its roles to be claimed again after a random pause,
// longer each time in a row (HELD_WAIT_MS): those calls settle and give back what they didn't spend, so the next try
// fits or meets a refusal that waiting won't change (what's left is too little, or the rest is held by calls that aren't
// running: the daily check settles those, resuming the pass). Only a refusal waiting won't change is recorded for the
// pass, which then stops. A step that saved some of its roles before failing (Unfinished) is taken as having failed for
// the rest only: those alone are let go, or tried alone, so nothing already paid for is asked again.
export const work = internalAction({
  args: { workspaceId: v.id("workspaces"), since: v.number(), worker: v.string(), until: v.number(), jobId: v.optional(v.id("jobs")), origin: v.optional(origin) },
  handler: async (actionCtx, { workspaceId: ws, since, worker, until, jobId, origin }) => {
    const ctx = spendingFor(actionCtx, { jobId, origin });
    let done = 0;
    let heldWait = WAIT_MS;
    const release = (ids: Id<"postings">[], why: { error: string } | { problem: string } | { budget: string } | Record<string, never> = {}) =>
      ids.length ? ctx.runMutation(internal.roles.release, { workspaceId: ws, since, worker, ids, ...why }) : null;
    const refusedBy = async (ids: Id<"postings">[], e: unknown) => {
      const { message } = (e as ConvexError<BudgetReached>).data;
      if (message !== HELD_BY_RUNNING) return release(ids, { budget: message });
      await release(ids);
      await sleep(heldWait * (0.5 + Math.random()));
      heldWait = Math.min(2 * heldWait, HELD_WAIT_MS);
    };
    while (Date.now() < until) {
      let got;
      try {
        got = await ctx.runMutation(internal.roles.claim, { workspaceId: ws, since, worker });
      } catch (e) {
        if (!conflicted(e)) throw e;
        await sleep(Math.random() * WAIT_MS);
        continue;
      }
      if (!got) break;
      if ("wait" in got) {
        await sleep(WAIT_MS);
        continue;
      }
      let left = got.ids;
      try {
        const later = await runStep(ctx, ws, worker, got.step, got.ids);
        done += got.ids.length - later.length;
        heldWait = WAIT_MS;
        if (later.length) {
          await release(later);
          await sleep(WAIT_MS);
        }
        continue;
      } catch (caught) {
        const e = caught instanceof Unfinished ? caught.failure : caught;
        if (caught instanceof Unfinished) {
          done += left.length - caught.left.length;
          left = caught.left;
        }
        if (budgetStop(e)) {
          await refusedBy(left, e);
          continue;
        }
        if (!inputFault(e)) {
          await release(left, { problem: messageOf(e) });
          await sleep(WAIT_MS);
          continue;
        }
        if (left.length === 1) {
          await release(left, { error: messageOf(e) });
          continue;
        }
      }
      const alone = await Promise.allSettled(left.map((id) => runStep(ctx, ws, worker, got.step, [id])));
      const failed = alone.flatMap((r, i) => (r.status === "rejected" ? [{ id: left[i], e: r.reason as unknown }] : []));
      await release(alone.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
      done += alone.length - failed.length;
      const refused = failed.find((f) => budgetStop(f.e));
      if (refused) {
        await refusedBy(failed.map((f) => f.id), refused.e);
        continue;
      }
      if (failed.length === got.ids.length) await release(got.ids, { problem: messageOf(failed[0].e) });
      else for (const f of failed) await release([f.id], inputFault(f.e) ? { error: messageOf(f.e) } : { problem: messageOf(f.e) });
    }
    return done;
  },
});

const runArgs = { workspaceId: v.id("workspaces"), since: v.number(), boards: v.boolean(), only: onlyCompanies, origin: v.optional(origin) };

// Queue the next run of a pass, as the one before it was started (origin).
async function queueRun(ctx: MutationCtx, { workspaceId, since, boards, only, origin }: ObjectType<typeof runArgs>) {
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "roles", args: { since, ...(boards ? {} : { boards: false }), ...(only ? { only } : {}) }, status: "queued", origin });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
}

export const next = internalMutation({ args: runArgs, handler: queueRun });

// The end of a pass whose work is done. A company someone asked to check again after the pass read the boards gets
// another run of this pass that reads it (same start, so only the boards asked for are read again). Otherwise the pass
// is done here, in the same write that looked, so a request from here on starts a new pass; one already made for a
// company outside a pass for some companies starts it now. Returns whether the pass goes on.
export const finish = internalMutation({
  args: { jobId: v.id("jobs"), ...runArgs },
  handler: async (ctx, { jobId, ...run }) => {
    if ((await boardsToRead(ctx, run.workspaceId, run.since, false, run.only)).left.length) {
      await queueRun(ctx, run);
      return true;
    }
    await ctx.db.patch(jobId, { status: "done" });
    if (run.only && (await boardsToRead(ctx, run.workspaceId, run.since, false)).left.length) await startPass(ctx, run.workspaceId, "you");
    return false;
  },
});

// Start a pass unless one is already queued or running (a running pass reads, before it's done, every board someone
// asks to check meanwhile), or take up a paused one (a pass paused for the budget queues every role's next step again
// when it resumes, so it does what a new one would), so a workspace never has two at once. A pass reads every watched
// company whose board wasn't read since it started; with boards false (ranking again), only boards someone asked to
// check. origin: whether they asked for it, or the daily check started it.
async function startPass(ctx: MutationCtx, workspaceId: Id<"workspaces">, origin: Doc<"jobs">["origin"], boards = true) {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  const passes = jobs.filter((j) => j.kind === "roles");
  if (passes.some((j) => j.status === "queued" || j.status === "running")) return null;
  const paused = passes.find((j) => j.status === "paused");
  if (paused && !(await isStopped(ctx, workspaceId, typeof paused.args?.since === "number" ? paused.args.since : paused._creationTime))) {
    await ctx.db.patch(paused._id, { status: "queued" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: paused._id });
    return paused._id;
  }
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "roles", args: { since: Date.now(), ...(boards ? {} : { boards: false }) }, status: "queued", origin });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  return jobId;
}

export const start = mutation({
  args: {},
  handler: async (ctx) => startPass(ctx, (await requireWorkspace(ctx)).workspaceId, "you"),
});

// Check one company's roles again: its board is read first, and roles that had no description are looked up again.
export const checkCompany = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(companyId);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    if (!watched(c)) throw new ConvexError("Roles are read for Targets and Maybe companies. Rate it first.");
    await ctx.db.patch(companyId, { rolesCheckAt: Date.now() });
    for (const p of await openAt(ctx, companyId)) if (p.descriptionAt && !p.hasDescription) await ctx.db.patch(p._id, { descriptionAt: undefined });
    return startPass(ctx, workspaceId, "you");
  },
});

// Daily: a pass for every workspace with Targets or Maybe companies. Not the demo (demo.ts): nothing in it changes.
export const startAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const w of await ctx.db.query("workspaces").collect()) {
      if (w.demo) continue;
      const companies = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", w._id)).collect();
      if (companies.some(watched)) await startPass(ctx, w._id, "automatic");
    }
  },
});

// Where a role stands for one direction: its verdict, or sorted out, or waiting (level null), and when the direction
// had last changed as of that (null: not ranked for it yet).
function standing(p: Doc<"postings">, directionId: Id<"items">) {
  const f = p.fit?.find((x) => x.directionId === directionId);
  if (f) return { level: f.level, score: f.score ?? null, reason: f.reason ?? null, method: f.method, sortedOut: false, at: f.directionAt ?? p.fitAt ?? null };
  const s = p.sort?.against.find((x) => x.directionId === directionId);
  if (s) return { level: null, score: null, reason: null, method: null, sortedOut: !p.sort!.directionIds.includes(directionId), at: s.directionAt };
  // Judged before sorting existed, against every direction at once: a direction it wasn't listed for was "none".
  if (p.fitAt !== undefined && !p.sort && !p.rerank?.includes(directionId)) return { level: "none" as const, score: null, reason: null, method: null, sortedOut: false, at: p.fitAt };
  return { level: null, score: null, reason: null, method: null, sortedOut: false, at: null };
}

// A role's details, the board's first (a role its board marks remote is remote), each with where it came from.
const detailsOf = (p: Doc<"postings">) => mergeDetails({ ...(p.remote ? { setup: "remote" as const } : {}), ...p.boardDetails }, p.details);

// A role as the Roles page lists it, for one direction (or, for all directions, its best one), with what it states
// that's against their limits for that direction.
function roleOf(p: Doc<"postings">, c: Doc<"companies">, directionId: Id<"items"> | undefined, names: Map<string, string>, problemsOf: ProblemsOf) {
  const s = directionId ? standing(p, directionId) : null;
  const details = detailsOf(p);
  return {
    id: p._id,
    title: p.title,
    company: { id: c._id, name: c.name },
    direction: directionId ? { id: directionId, name: names.get(directionId) ?? "" } : null,
    level: s?.level ?? null,
    score: s?.score ?? null,
    reason: s?.reason ?? null,
    sortedBy: p.sort?.method ?? null,
    details,
    problems: directionId ? problemsOf(directionId, valuesOf(details), p.location, c.name).map(problemText) : [],
    brief: p.brief?.job ?? null,
    location: p.location ?? null,
    remote: p.remote,
    postedAt: p.postedAt ?? null,
    firstSeen: p.firstSeen,
    url: p.url,
    rating: p.rating?.value ?? null,
    ratingReason: p.rating?.reason ?? null,
  };
}

// Filters on the Roles page. Each that a role may not state takes `unknown`: whether roles that don't say are kept.
const orUnknown = <T extends Validator<unknown, "required", string>>(value: T) => v.optional(v.object({ value, unknown: v.boolean() }));
const oneOf = <T extends string>(list: readonly T[]) => v.union(...list.map((x) => v.literal(x)));
const filters = v.object({
  minScore: orUnknown(v.number()),
  // Yearly, in US dollars.
  minPay: orUnknown(v.number()),
  // Places (a city, region or country); remote roles aren't held to a place.
  locations: orUnknown(v.array(v.string())),
  setups: orUnknown(v.array(oneOf(SETUPS))),
  postedWithinDays: orUnknown(v.number()),
  // Targets, Maybes, or these companies.
  companies: v.optional(v.union(v.literal("targets"), v.literal("maybes"), v.array(v.id("companies")))),
  seniority: orUnknown(v.array(oneOf(LEVELS))),
  maxYears: orUnknown(v.number()),
  employmentTypes: orUnknown(v.array(oneOf(EMPLOYMENT_TYPES))),
  // Unset: every role but the ones they said Not for me to.
  rating: v.optional(v.union(v.literal("interested"), v.literal("unrated"), v.literal("no"))),
  maxTravel: orUnknown(v.number()),
  // The clearance they hold: roles asking for more are left out.
  clearance: orUnknown(oneOf(CLEARANCES)),
  // Only roles that sponsor a visa.
  visa: v.optional(v.object({ unknown: v.boolean() })),
});
export type RoleFilters = Infer<typeof filters>;
type RankTable = NamedTableInfo<DataModel, "roleRanks">;
const DAY_MS = 24 * 60 * 60 * 1000;

// The filters the database checks as it reads a page (all but places).
function matches(q: FilterBuilder<RankTable>, f: RoleFilters, now: number): ExpressionOrValue<boolean> {
  const all: ExpressionOrValue<boolean>[] = [];
  const known = (field: keyof Row, unknown: boolean, cond: ExpressionOrValue<boolean>) =>
    all.push(unknown ? q.or(q.eq(q.field(field), undefined), cond) : q.and(q.neq(q.field(field), undefined), cond));
  const anyOf = (field: keyof Row, values: readonly (string | boolean)[]) => q.or(...values.map((x) => q.eq(q.field(field), x)));
  if (f.minScore) known("score", f.minScore.unknown, q.gte(q.field("score"), f.minScore.value));
  if (f.minPay) known("payMin", f.minPay.unknown, q.gte(q.field("payMin"), f.minPay.value));
  if (f.setups?.value.length) known("setup", f.setups.unknown, anyOf("setup", f.setups.value));
  if (f.postedWithinDays) known("postedAt", f.postedWithinDays.unknown, q.gte(q.field("postedAt"), now - f.postedWithinDays.value * DAY_MS));
  if (f.seniority?.value.length) known("seniority", f.seniority.unknown, anyOf("seniority", f.seniority.value));
  if (f.maxYears) known("yearsAsked", f.maxYears.unknown, q.lte(q.field("yearsAsked"), f.maxYears.value));
  if (f.employmentTypes?.value.length) known("employmentType", f.employmentTypes.unknown, anyOf("employmentType", f.employmentTypes.value));
  if (f.maxTravel) known("travel", f.maxTravel.unknown, q.lte(q.field("travel"), f.maxTravel.value));
  if (f.clearance) known("clearance", f.clearance.unknown, anyOf("clearance", CLEARANCES.slice(0, CLEARANCES.indexOf(f.clearance.value) + 1)));
  if (f.visa) known("visa", f.visa.unknown, q.eq(q.field("visa"), true));
  if (f.companies === "targets" || f.companies === "maybes") all.push(q.eq(q.field("companyRating"), f.companies === "targets" ? "excited" : "maybe"));
  else if (f.companies?.length) all.push(anyOf("companyId", f.companies));
  all.push(f.rating === undefined ? q.neq(q.field("rating"), "no") : q.eq(q.field("rating"), f.rating === "unrated" ? undefined : f.rating));
  return q.and(...all);
}

// The place filter, which the database can't check: a role in one of the places (a state, country, city or region, by
// name or code, places.ts), or remote. Roles with no place are kept when `unknown`.
function inPlaces(r: Row, f: RoleFilters) {
  const terms = f.locations?.value.map((t) => t.trim()).filter(Boolean) ?? [];
  if (!terms.length || r.setup === "remote") return true;
  if (!r.places) return f.locations!.unknown;
  return terms.some((t) => inPlace(t, { places: r.places!.split("|"), countries: r.countries ?? [] }));
}

// The approved direction asked for, or all of them (undefined); throws when it isn't one of theirs.
async function scopeOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, directionId: Id<"items"> | undefined) {
  const directions = await itemsOf(ctx, workspaceId, "direction", "approved");
  if (directionId && !directions.some((d) => d._id === directionId)) throw new ConvexError("Not found.");
  return { directions, names: new Map(directions.map((d) => [String(d._id), d.data.name])) };
}

// Rows of one page of the Roles view as roles: open roles in their area at Targets and Maybe companies (a row not
// yet brought in step with a change isn't shown), each with its pursuit when it was started.
export async function rolesOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, rows: Doc<"roleRanks">[], names: Map<string, string>) {
  const area = await workAreaOf(ctx, workspaceId);
  const problemsOf = await problemsFor(ctx, workspaceId);
  const companies = new Map<string, Doc<"companies"> | null>();
  const out = [];
  for (const r of rows) {
    const p = await ctx.db.get(r.postingId);
    if (!companies.has(r.companyId)) companies.set(r.companyId, await ctx.db.get(r.companyId));
    const c = companies.get(r.companyId);
    if (!p || p.closedAt || !c || !watched(c) || !inWorkArea(p, area)) continue;
    const pursuit = await ctx.db.query("pursuits").withIndex("by_posting", (q) => q.eq("workspaceId", workspaceId).eq("postingId", p._id)).first();
    out.push({ ...roleOf(p, c, r.directionId ?? r.best, names, problemsOf), pursuit: pursuit ? { id: pursuit._id, status: pursuit.status, closedReason: pursuit.closedReason ?? null } : null });
  }
  return out;
}

// One page of the Roles page: the judged roles for one direction (or for all directions together, each at its best
// direction) that pass the filters and aren't against a firm limit, best score first (those against a preference
// after the rest), then newest. Read through roleRanks, so a page reads only its own roles however many there are;
// filtering by place reads more rows a page, and keeps the matches among them.
export const list = query({
  args: { directionId: v.optional(v.id("items")), filters, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { directionId, filters: f, paginationOpts }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { names } = await scopeOf(ctx, workspaceId, directionId);
    const now = await clockOf(ctx, workspaceId);
    const opts = f.locations?.value.length ? { ...paginationOpts, numItems: Math.max(paginationOpts.numItems, PLACE_SCAN) } : paginationOpts;
    const page = await ctx.db
      .query("roleRanks")
      .withIndex("by_score", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "judged"))
      .order("desc")
      .filter((q) => matches(q, f, now))
      .paginate(opts);
    return { ...page, page: await rolesOf(ctx, workspaceId, page.page.filter((r) => inPlaces(r, f)), names) };
  },
});

// How many judged roles pass the filters (up to COUNT_CAP; more: there are more).
export const count = query({
  args: { directionId: v.optional(v.id("items")), filters },
  handler: async (ctx, { directionId, filters: f }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await scopeOf(ctx, workspaceId, directionId);
    const now = await clockOf(ctx, workspaceId);
    const rows = await ctx.db
      .query("roleRanks")
      .withIndex("by_score", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "judged"))
      .filter((q) => matches(q, f, now))
      .take(COUNT_CAP + 1);
    return { count: Math.min(COUNT_CAP, rows.filter((r) => inPlaces(r, f)).length), more: rows.length > COUNT_CAP };
  },
});

// One page of the roles sorted out before judging, for one direction (or out of every direction they were ranked
// for), newest first.
export const sortedOut = query({
  args: { directionId: v.optional(v.id("items")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { directionId, paginationOpts }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { names } = await scopeOf(ctx, workspaceId, directionId);
    const page = await ctx.db
      .query("roleRanks")
      .withIndex("by_newest", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "sortedOut"))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: await rolesOf(ctx, workspaceId, page.page, names) };
  },
});

// One page of the judged roles set apart for what they state being against a firm limit of theirs, for one direction
// (or all of them together), best score first.
export const against = query({
  args: { directionId: v.optional(v.id("items")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { directionId, paginationOpts }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { names } = await scopeOf(ctx, workspaceId, directionId);
    const page = await ctx.db
      .query("roleRanks")
      .withIndex("by_score", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "against"))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: await rolesOf(ctx, workspaceId, page.page, names) };
  },
});

// The Roles page apart from its roles. The approved directions; for the one asked for, or all of them: whether any
// roles were ranked, whether some were ranked before a direction last changed (stale; rankAgain ranks them afresh),
// how many were sorted out, how many are set apart for being against a firm limit (against), and the filters their
// firm eligibility limits start the page with (fromLimits: the clearance they hold; only roles that sponsor a visa).
// The watched companies, to filter by. Coverage: per watched company, how much of its board was read and when. pass:
// the last roles pass. stretch: whether judging counts how big a stretch a role is (saveStretch).
export const overview = query({
  args: { directionId: v.optional(v.id("items")) },
  handler: async (ctx, { directionId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { directions, names } = await scopeOf(ctx, workspaceId, directionId);
    const companies = (await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).filter(watched);
    const eligibility = limitsFor(
      (await activeLimits(ctx, workspaceId)).filter((l) => l.data.kind === "eligibility" && l.data.firm !== false && !l.data.when).map((l) => l.data),
      { direction: directionId ? names.get(directionId) : undefined },
    );
    const held = eligibility.map((l) => l.rule?.clearance).find((x): x is Clearance => CLEARANCES.includes(x));
    let stale = false;
    for (const d of directions.filter((x) => !directionId || x._id === directionId))
      stale ||= !!(await ctx.db.query("roleRanks").withIndex("by_ranked", (q) => q.eq("workspaceId", workspaceId).eq("directionId", d._id).lt("at", d.data.changedAt ?? d.at)).first());
    const out = await ctx.db.query("roleRanks").withIndex("by_newest", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "sortedOut")).take(COUNT_CAP + 1);
    const against = await ctx.db.query("roleRanks").withIndex("by_newest", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "against")).take(COUNT_CAP + 1);
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const last = jobs.find((j) => j.kind === "roles");
    const now = await clockOf(ctx, workspaceId);
    return {
      directions: directions.map((x) => ({ id: x._id, name: x.data.name })),
      ranked: !!(await ctx.db.query("roleRanks").withIndex("by_ranked", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId)).first()),
      stale,
      stretch: rubricOf(await settingsOf(ctx, workspaceId)) === "v2",
      sortedOut: { count: Math.min(COUNT_CAP, out.length), more: out.length > COUNT_CAP },
      against: { count: Math.min(COUNT_CAP, against.length), more: against.length > COUNT_CAP },
      fromLimits: { clearance: held ?? null, visa: eligibility.some((l) => l.rule?.sponsorshipNeeded === true) },
      companies: companies.map((c) => ({ id: c._id, name: c.name, rating: watched(c)! })).sort((a, b) => a.name.localeCompare(b.name)),
      pass: last ? { status: last.status, error: last.error ?? null } : null,
      coverage: companies
        .map((c) => ({
          id: c._id,
          name: c.name,
          rating: c.rating!.value,
          board: c.details?.board ? { provider: c.details.board.provider, url: c.details.board.url } : null,
          // Workday and Oracle boards are searched by their titles, not read whole.
          searched: c.details?.board?.provider === "workday" || c.details?.board?.provider === "oracle",
          read: c.roles?.read ?? 0,
          boardTotal: c.roles?.total ?? null,
          lastRead: c.roles?.at ?? null,
          lastFailed: c.roles?.failedAt && c.roles.failedAt > (c.roles.at ?? 0) ? c.roles.failedAt : null,
          stale: !c.roles?.at || now - c.roles.at > STALE_MS,
          checking: !!c.rolesCheckAt,
        }))
        .sort((a, b) => Number(a.rating !== "excited") - Number(b.rating !== "excited") || a.name.localeCompare(b.name)),
    };
  },
});

// What the location filter suggests (places.ts): the places their listed roles are in, then every US state and country.
export const places = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db.query("roleRanks").withIndex("by_ranked", (q) => q.eq("workspaceId", workspaceId).eq("directionId", undefined)).take(COUNT_CAP);
    return placeOptions(
      rows.flatMap((r) => r.places?.split("|") ?? []),
      rows.flatMap((r) => r.countries ?? []),
    );
  },
});

// Bring roles' rows on the Roles page in step with them: every role of a workspace (also how they're first filled in),
// or of one company after its rating, or whether it's a place to work, changed. A page a run, each scheduling the next.
export const refreshRanks = internalMutation({
  args: { workspaceId: v.id("workspaces"), companyId: v.optional(v.id("companies")), cursor: v.optional(v.string()) },
  handler: async (ctx, { workspaceId, companyId, cursor }) => {
    const rank = await ranker(ctx, workspaceId);
    const opts = { cursor: cursor ?? null, numItems: SYNC_PAGE };
    const page = companyId
      ? await ctx.db.query("postings").withIndex("by_company", (q) => q.eq("companyId", companyId)).paginate(opts)
      : await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
    for (const p of page.page) if (p.workspaceId === workspaceId) await rank.sync(p);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId, ...(companyId ? { companyId } : {}), cursor: page.continueCursor });
  },
});

// One page of rankAgain, each its own write: each open role's verdicts and sort for the directions are cleared and it's
// queued again (a role a worker holds is let go, so what it was working out from before is dropped). The next page
// follows; the last starts a pass that reads no boards, or leaves the roles to the pass already running, whose workers
// take them from the queue. Pages are small and never part of the request itself, so a pass's 32 workers claiming and
// saving the same roles meanwhile can't make the request fail, and a page they do collide with is run again on its own.
// A page leaves a role it already cleared as it was (but let go), so running one again clears nothing twice.
export const rankAgainPage = internalMutation({
  args: { workspaceId: v.id("workspaces"), directionIds: v.array(v.id("items")), cursor: v.union(v.string(), v.null()), origin: v.optional(origin) },
  handler: async (ctx, { workspaceId, directionIds, cursor, origin }) => {
    const ratings = await watchedRatings(ctx, workspaceId);
    const rank = await ranker(ctx, workspaceId, ratings);
    const { approved, area } = rank;
    const asked = new Set<string>(directionIds.filter((d) => approved.has(d)));
    if (!asked.size) return;
    const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).eq("closedAt", undefined)).paginate({ cursor, numItems: RERANK_PAGE });
    for (const p of page.page) {
      // Not ranked yet: the pass ranks it for every direction anyway.
      if (!p.sort && p.fitAt === undefined) continue;
      // Judged before sorting existed: every other direction it wasn't listed for was "none", written out so those
      // verdicts stay once it has a sort. Directions already waiting to be ranked again have no verdict to keep.
      const legacy = p.sort
        ? []
        : [...approved.keys()]
            .filter((d) => !asked.has(d) && !p.rerank?.some((r) => r === d) && !p.fit?.some((f) => f.directionId === d))
            .map((d) => ({ directionId: d as Id<"items">, level: "none" as const, method: "model" as const, directionAt: p.fitAt }));
      const fit = [...(p.fit ?? []).filter((f) => !asked.has(f.directionId)).map((f) => (p.sort ? f : { ...f, directionAt: f.directionAt ?? p.fitAt })), ...legacy];
      const sort = p.sort && { ...p.sort, directionIds: p.sort.directionIds.filter((d) => !asked.has(d)), against: p.sort.against.filter((a) => !asked.has(a.directionId)) };
      const next = { ...p, fit, sort, rerank: [...new Set([...(p.rerank ?? []), ...(asked as Set<Id<"items">>)])] };
      const inArea = ratings.has(p.companyId) && inWorkArea(p, area);
      await ctx.db.patch(p._id, { fit, sort, rerank: next.rerank, queue: inArea ? stepFor(next, approved) : undefined, claimedAt: undefined, claimedBy: undefined, failed: undefined });
      await rank.sync(next);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.roles.rankAgainPage, { workspaceId, directionIds, cursor: page.continueCursor, origin });
    else await startPass(ctx, workspaceId, origin, false);
  },
});

// Rank every open role again for one direction (or every approved direction), after it changed: their verdicts and
// sort for it are cleared, a page at a time (rankAgainPage), and a pass sorts and judges them for it alone. Nothing is
// ranked again without this.
export async function rankAgainFor(ctx: MutationCtx, workspaceId: Id<"workspaces">, origin: "you" | "automatic", directionId?: Id<"items">) {
  const approved = await directionTimes(ctx, workspaceId);
  if (directionId && !approved.has(directionId)) throw new ConvexError("Not found.");
  const directionIds = directionId ? [directionId] : ([...approved.keys()] as Id<"items">[]);
  await ctx.scheduler.runAfter(0, internal.roles.rankAgainPage, { workspaceId, directionIds, cursor: null, origin });
}

export const rankAgain = mutation({
  args: { directionId: v.optional(v.id("items")) },
  handler: async (ctx, { directionId }) => rankAgainFor(ctx, (await requireWorkspace(ctx)).workspaceId, "you", directionId),
});

// How roles are sorted before judging: an AI model or Jev. Applies to roles sorted from now on.
export async function saveSortMethod(ctx: MutationCtx, workspaceId: Id<"workspaces">, method: SortMethod) {
  const row = await settingsOf(ctx, workspaceId);
  if (row) await ctx.db.patch(row._id, { roleSort: method });
  else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], roleSort: method });
}

export const setSortMethod = mutation({
  args: { method: sortMethod },
  handler: async (ctx, { method }) => saveSortMethod(ctx, (await requireWorkspace(ctx)).workspaceId, method),
});

// How roles are sorted now: "model" (the Sorting roles task's model) or "jev" (the decision model).
export const sortMethodChoice = query({
  args: {},
  handler: async (ctx): Promise<SortMethod> => (await settingsOf(ctx, (await requireWorkspace(ctx)).workspaceId))?.roleSort ?? "model",
});

// Whether judging counts how big a stretch a role is (rubric v2) or not (v1; roleRubric.ts). Applies to roles judged
// from now on; rankAgain judges the rest again under it.
export async function saveStretch(ctx: MutationCtx, workspaceId: Id<"workspaces">, on: boolean) {
  const row = await settingsOf(ctx, workspaceId);
  if (row) await ctx.db.patch(row._id, { stretch: on });
  else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], stretch: on });
}

export const setStretch = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => saveStretch(ctx, (await requireWorkspace(ctx)).workspaceId, on),
});

// One role for its own page: its details (each with where it came from), its brief, its full description (as read),
// how it was sorted and its verdict for each approved direction, best first, with what it states that's against
// their limits for that direction and its stretch (roleRubric.ts). Links: the posting, the board's own
// application page when it gives one, and the company's website.
export const get = query({
  args: { id: v.id("postings") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await ctx.db.get(id);
    if (!p || p.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const c = await ctx.db.get(p.companyId);
    const text = await textOf(ctx, id);
    const { names } = await scopeOf(ctx, workspaceId, undefined);
    const problemsOf = await problemsFor(ctx, workspaceId);
    const details = detailsOf(p);
    return {
      id: p._id,
      title: p.title,
      company: { id: p.companyId, name: c?.name ?? "", website: c && /^https?:\/\//i.test(c.websiteUrl ?? "") ? c.websiteUrl! : c?.domain ? `https://${c.domain}` : null },
      url: p.url,
      applyUrl: p.applyUrl ?? null,
      location: p.location ?? null,
      remote: p.remote,
      postedAt: p.postedAt ?? null,
      firstSeen: p.firstSeen,
      closedAt: p.closedAt ?? null,
      description: text?.text ?? null,
      hasDescription: p.descriptionAt ? !!p.hasDescription : null,
      details,
      brief: p.brief ? { job: p.brief.job, forYou: p.brief.forYou } : null,
      sort: p.sort ? { directionIds: p.sort.directionIds, method: p.sort.method, at: p.sort.at } : null,
      fit: [...names.keys()]
        .map((d) => ({ directionId: d as Id<"items">, name: names.get(d)!, ...standing(p, d as Id<"items">) }))
        .filter((f) => f.level)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || LEVEL_ORDER[a.level!] - LEVEL_ORDER[b.level!])
        .map(({ directionId, name, level, score, reason }) => ({
          directionId, name, level: level!, score, reason, problems: problemsOf(directionId, valuesOf(details), p.location, c?.name).map(problemText), stretch: p.fit?.find((f) => f.directionId === directionId)?.stretch ?? [],
        })),
      rating: p.rating?.value ?? null,
      ratingReason: p.rating?.reason ?? null,
    };
  },
});

// Their rating of a role, with the reason they gave for Not for me (optional), saved together. "no" sets it aside, kept:
// the Roles page leaves it out unless asked for; null restores it.
export const rate = mutation({
  args: { id: v.id("postings"), value: v.union(v.literal("interested"), v.literal("no"), v.null()), reason: v.optional(v.string()) },
  handler: async (ctx, { id, value, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await ctx.db.get(id);
    if (!p || p.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const why = value === "no" ? reason?.trim() : undefined;
    const rating = value ? { value, at: Date.now(), ...(why ? { reason: why } : {}) } : undefined;
    await ctx.db.patch(id, { rating });
    await (await ranker(ctx, workspaceId)).sync({ ...p, rating });
  },
});

// Read one company's board and save what's on it. Returns whether the board could be read.
async function readCompany(ctx: ActionCtx, ws: Id<"workspaces">, c: { id: Id<"companies">; board: Board }, apolloJobs: ((id: string) => Promise<Read | null>) | null) {
  const at = Date.now();
  const r = c.board.provider === "apollo" ? await apolloJobs?.(c.board.slug) ?? null : await readBoard(c.board);
  if (!r) {
    await ctx.runMutation(internal.roles.failRead, { workspaceId: ws, companyId: c.id, at });
    return false;
  }
  const jobs = r.jobs
    .filter((j) => j.title && j.url && j.externalId)
    .map((j) => ({
      externalId: j.externalId, title: j.title, url: j.url, remote: j.remote, ...(j.applyUrl ? { applyUrl: j.applyUrl } : {}), ...(j.location ? { location: j.location } : {}), ...(j.postedAt ? { postedAt: j.postedAt } : {}),
      ...(j.description !== undefined ? { description: j.description } : {}), ...(j.facts ? { facts: j.facts } : {}),
    }));
  let touched: Id<"postings">[] = [];
  for (let i = 0; i < jobs.length; i += SAVE_CHUNK)
    touched = await ctx.runMutation(internal.roles.saveJobs, { workspaceId: ws, companyId: c.id, provider: r.board.provider, jobs: jobs.slice(i, i + SAVE_CHUNK), touched, at });
  // Workday and Oracle are searched by title, and some boards list only so many: those reads are partial.
  const complete = !r.searched && (r.total === undefined || r.jobs.length >= r.total);
  await ctx.runMutation(internal.roles.finishRead, { workspaceId: ws, companyId: c.id, touched, complete, read: touched.length, ...(r.total !== undefined ? { total: r.total } : {}), at });
  return true;
}

export async function runRoles(ctx: ActionCtx, job: Doc<"jobs">) {
  const ws = job.workspaceId;
  const since: number = typeof job.args?.since === "number" ? job.args.since : job._creationTime;
  const boards = job.args?.boards !== false;
  // An operator's pass for some companies only: their boards, descriptions, sorting and judging, nothing else.
  const only: Id<"companies">[] | undefined = Array.isArray(job.args?.only) ? job.args.only : undefined;
  const scope = { workspaceId: ws, since, ...(only ? { only } : {}) };
  if (await ctx.runQuery(internal.roles.stopped, { workspaceId: ws, since })) return { stopped: true };
  const { batch, remaining, titles, useApollo } = await ctx.runQuery(internal.roles.todo, { ...scope, boards });
  if (batch.length) {
    setSearchTitles(titles);
    const apolloJobs = useApollo ? apolloJobsFor(ctx, ws) : null;
    let read = 0;
    for (let i = 0; i < batch.length; i += 5) read += (await Promise.all(batch.slice(i, i + 5).map((c) => readCompany(ctx, ws, c, apolloJobs)))).filter(Boolean).length;
    await ctx.runMutation(internal.roles.next, { ...scope, boards, origin: job.origin });
    return { companies: batch.length, read, companiesLeft: remaining - batch.length };
  }
  // Boards read: descriptions, sorting and judging go to the workers.
  const queued = { text: 0, sort: 0, judge: 0, method: "model" as SortMethod };
  for (let cursor: string | null = null, done = false; !done; ) {
    const page: { text: number; sort: number; judge: number; method: SortMethod; isDone: boolean; cursor: string } = await ctx.runMutation(internal.roles.plan, { ...scope, cursor });
    for (const step of STEPS) queued[step] += page[step];
    queued.method = page.method;
    ({ cursor, isDone: done } = page);
  }
  if (!queued.text && !queued.sort && !queued.judge) return end(ctx, job, scope, boards);
  // A missing model choice fails the pass once, with its plain message, rather than every worker on every role.
  if (queued.sort) await modelFor(ctx, ws, SORT_TASK[queued.method]);
  if (queued.sort || queued.judge) await modelFor(ctx, ws, "companies");
  const started = Date.now();
  for (let i = 0; i < WORKERS; i++) await ctx.scheduler.runAfter(i * STAGGER_MS, internal.roles.work, { workspaceId: ws, since, worker: `${job._id}:${i}`, until: started + WORK_MS, jobId: job._id, origin: job.origin });
  while (Date.now() < started + WORK_MS) {
    await sleep(POLL_MS);
    const left = await ctx.runQuery(internal.roles.progress, { workspaceId: ws, since });
    if (left.stopped) return { stopped: true };
    if (!left.text && !left.sort && !left.judge) return end(ctx, job, scope, boards);
    // The budget refused an AI call: once the descriptions are in and no AI call is still running (what those cost is
    // known), the pass pauses with why, and picks up again when the budget allows (raised, or the month's reset).
    if (left.refused && !left.text && !left.running) throw new ConvexError({ code: BUDGET_REACHED, service: "openrouter", message: left.refused } satisfies BudgetReached);
    // Failing again and again for reasons that aren't about any role: stop the workers and fail with the reason.
    if (left.problems && left.problems.count >= MAX_PROBLEMS) {
      await ctx.runMutation(internal.roles.halt, { workspaceId: ws });
      throw new Error(`Roles stopped after ${left.problems.count} failures: ${left.problems.error}`);
    }
  }
  // Time's up for this run and its workers; the next run starts fresh ones for what's left.
  await ctx.runMutation(internal.roles.next, { ...scope, boards, origin: job.origin });
  return { handedOver: true, ...(await ctx.runQuery(internal.roles.progress, { workspaceId: ws, since })) };
}

// A pass's work is done: what it did, unless a board someone asked to check meanwhile needs another run first.
async function end(ctx: ActionCtx, job: Doc<"jobs">, scope: { workspaceId: Id<"workspaces">; since: number; only?: Id<"companies">[] }, boards: boolean) {
  if (await ctx.runMutation(internal.roles.finish, { ...scope, jobId: job._id, boards, origin: job.origin })) return { handedOver: true };
  return outcomeOf(ctx, scope);
}

// What the pass did, added up a page of roles at a time.
async function outcomeOf(ctx: ActionCtx, scope: { workspaceId: Id<"workspaces">; since: number; only?: Id<"companies">[] }) {
  const total = { sorted: 0, sortedOut: 0, judged: 0, setAside: 0, error: null as string | null };
  for (let cursor: string | null = null, done = false; !done; ) {
    const page: typeof total & { isDone: boolean; cursor: string } = await ctx.runQuery(internal.roles.outcome, { ...scope, cursor });
    total.sorted += page.sorted;
    total.sortedOut += page.sortedOut;
    total.judged += page.judged;
    total.setAside += page.setAside;
    total.error ??= page.error;
    ({ cursor, isDone: done } = page);
  }
  const { setAside, error, ...rest } = total;
  return { ...rest, ...(setAside ? { setAside, error } : {}) };
}

// Whether a pass that started at `since` was stopped.
export const stopped = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.number() },
  handler: (ctx, { workspaceId, since }) => isStopped(ctx, workspaceId, since),
});

// Stop the pass that's running: its workers stop at their next claim.
export const halt = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const row = await settingsOf(ctx, workspaceId);
    if (row) await ctx.db.patch(row._id, { rolesStoppedAt: Date.now() });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], rolesStoppedAt: Date.now() });
  },
});

// ---- Trying a rubric (roleRubric.ts) on a sample of roles before it's applied ----

// Judged roles listed for all directions together that a comparison picks from at random: the first this many, best first.
const SAMPLE_POOL = 8000;

// The roles a comparison picks from, beyond those they rated: the best `sample` for each approved direction, as its
// Roles page lists them (top), and the judged roles listed for all directions together (listed).
export const rubricPool = internalQuery({
  args: { workspaceId: v.id("workspaces"), sample: v.number() },
  handler: async (ctx, { workspaceId, sample }) => {
    const judged = (directionId: Id<"items"> | undefined) =>
      ctx.db.query("roleRanks").withIndex("by_score", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "judged")).order("desc");
    const top: Id<"postings">[] = [];
    for (const d of await itemsOf(ctx, workspaceId, "direction", "approved")) top.push(...(await judged(d._id).take(sample)).map((r) => r.postingId));
    return { top, listed: (await judged(undefined).take(SAMPLE_POOL)).map((r) => r.postingId) };
  },
});

// One page of their roles, open or closed, that they rated (Interested or Not for me) and that have a verdict.
export const ratedRoles = internalQuery({
  args: { workspaceId: v.id("workspaces"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { workspaceId, cursor }) => {
    const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate({ cursor, numItems: PAGE });
    return { ids: page.page.filter((p) => p.rating && p.fit?.length).map((p) => p._id), isDone: page.isDone, cursor: page.continueCursor };
  },
});

// What a comparison judges for some roles: as judgeInput, but under the rubric asked for and for every approved
// direction each has a verdict for; and those verdicts (old), to set beside the new ones.
export const compareInput = internalQuery({
  args: { workspaceId: v.id("workspaces"), rubric, ids: v.array(v.id("postings")) },
  handler: async (ctx, { workspaceId, rubric: asked, ids }) => {
    const context = await judgeContext(ctx, workspaceId, asked);
    const approved = new Set(context.directions.map((d) => String(d.id)));
    const postings = [];
    const old = [];
    for (const id of ids) {
      const p = await ctx.db.get(id);
      const live = p?.workspaceId === workspaceId ? (p.fit ?? []).filter((f) => approved.has(f.directionId)) : [];
      if (!p || !live.length) continue;
      postings.push(await postingInput(ctx, p, live.map((f) => f.directionId)));
      old.push(...live.map((f) => ({ postingId: p._id, directionId: f.directionId, level: f.level, ...(f.score !== undefined ? { score: f.score } : {}), ...(f.reason ? { reason: f.reason } : {}) })));
    }
    return { ...context, postings, old };
  },
});

export const startRubricRun = internalMutation({
  args: { workspaceId: v.id("workspaces"), rubric, sample: v.number() },
  handler: (ctx, args) => ctx.db.insert("rubricRuns", { ...args, at: Date.now(), status: "running", rows: [] }),
});

// Rows a comparison judged, what they cost and how many roles failed (with the last error), added to it; with a
// status, it's over.
export const saveRubricRun = internalMutation({
  args: {
    runId: v.id("rubricRuns"), rows: v.array(compareRow), costUsd: v.number(), failed: v.number(), error: v.optional(v.string()),
    status: v.optional(v.union(v.literal("done"), v.literal("failed"))),
  },
  handler: async (ctx, { runId, rows, costUsd, failed, error, status }) => {
    const run = await ctx.db.get(runId);
    if (run) await ctx.db.patch(runId, { rows: [...run.rows, ...rows], costUsd: (run.costUsd ?? 0) + costUsd, failed: (run.failed ?? 0) + failed, ...(error ? { error } : {}), ...(status ? { status } : {}) });
  },
});

// Judge a sample of a workspace's roles under a rubric, keeping each new verdict beside the live one (rubricRuns) and
// never touching the live ones: every role they rated, the best `sample` per approved direction, and `sample` more at
// random among the other judged roles listed. As many calls at once as a pass has workers. Read it with rubricRun;
// admin:applyRubric applies a rubric.
export const compareRubric = internalAction({
  args: { workspaceId: v.id("workspaces"), rubric, sample: v.optional(v.number()) },
  handler: async (ctx, { workspaceId, rubric: asked, sample = 30 }): Promise<Id<"rubricRuns">> => {
    const ids = new Set<Id<"postings">>();
    for (let cursor: string | null = null, done = false; !done; ) {
      const page: { ids: Id<"postings">[]; isDone: boolean; cursor: string } = await ctx.runQuery(internal.roles.ratedRoles, { workspaceId, cursor });
      for (const id of page.ids) ids.add(id);
      ({ cursor, isDone: done } = page);
    }
    const { top, listed } = await ctx.runQuery(internal.roles.rubricPool, { workspaceId, sample });
    for (const id of top) ids.add(id);
    const rest = listed.filter((id) => !ids.has(id));
    for (let i = 0; i < sample && rest.length; i++) ids.add(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    const runId = await ctx.runMutation(internal.roles.startRubricRun, { workspaceId, rubric: asked, sample });
    let judged = 0;
    await pool(chunks([...ids], JUDGE_BATCH), WORKERS, async (batch) => {
      try {
        const input = await ctx.runQuery(internal.roles.compareInput, { workspaceId, rubric: asked, ids: batch });
        const { results, costUsd } = await judgeCall(ctx, workspaceId, input, "rubric comparison");
        const rows = input.old.map((o) => {
          const r = results.find((x) => x.id === o.postingId);
          const f = r?.fit.find((x) => x.directionId === o.directionId);
          return {
            postingId: o.postingId, directionId: o.directionId, oldLevel: o.level, ...(o.score !== undefined ? { oldScore: o.score } : {}), ...(o.reason ? { oldReason: o.reason } : {}),
            newLevel: f?.level ?? ("none" as const), ...(f?.score !== undefined ? { newScore: f.score } : {}), ...(f ? { newReason: f.reason } : {}), stretch: f ? (r?.stretch ?? []) : [],
          };
        });
        await ctx.runMutation(internal.roles.saveRubricRun, { runId, rows, costUsd, failed: 0 });
        judged += input.postings.length;
      } catch (e) {
        await ctx.runMutation(internal.roles.saveRubricRun, { runId, rows: [], costUsd: 0, failed: batch.length, error: messageOf(e) });
      }
    });
    await ctx.runMutation(internal.roles.saveRubricRun, { runId, rows: [], costUsd: 0, failed: 0, status: judged || !ids.size ? "done" : "failed" });
    return runId;
  },
});

// A comparison and what it found (roleRubric.compareSummary) over all its rows, and over the roles they said they're
// Interested in and Not for me each; every rated role's rows; and the `top` biggest drops and rises. Each row with its
// role's title, company and their rating, and the direction's name. The workspace's latest unless one is asked for.
export const rubricRun = internalQuery({
  args: { workspaceId: v.id("workspaces"), runId: v.optional(v.id("rubricRuns")), top: v.optional(v.number()) },
  handler: async (ctx, { workspaceId, runId, top = 10 }) => {
    const run = runId ? await ctx.db.get(runId) : await ctx.db.query("rubricRuns").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").first();
    if (!run || run.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const names = new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.name]));
    const companies = new Map<string, string>();
    const roles = new Map<string, { title: string; company: string; rating: "interested" | "no" | null }>();
    for (const id of new Set(run.rows.map((r) => r.postingId))) {
      const p = await ctx.db.get(id);
      if (p && !companies.has(p.companyId)) companies.set(p.companyId, (await ctx.db.get(p.companyId))?.name ?? "");
      roles.set(id, { title: p?.title ?? "", company: p ? companies.get(p.companyId)! : "", rating: p?.rating?.value ?? null });
    }
    const rows = run.rows.map((r) => ({ ...roles.get(r.postingId)!, direction: names.get(r.directionId) ?? "", change: scoreChange(r), ...r }));
    const moved = rows.filter((r) => r.change !== null).sort((a, b) => a.change! - b.change!);
    return {
      id: run._id, rubric: run.rubric, at: run.at, status: run.status, sample: run.sample, failed: run.failed ?? 0, costUsd: run.costUsd ?? 0, error: run.error ?? null,
      roles: roles.size,
      all: compareSummary(rows),
      interested: compareSummary(rows.filter((r) => r.rating === "interested")),
      notForMe: compareSummary(rows.filter((r) => r.rating === "no")),
      rated: rows.filter((r) => r.rating),
      drops: moved.filter((r) => r.change! < 0).slice(0, top),
      rises: moved.filter((r) => r.change! > 0).reverse().slice(0, top),
    };
  },
});
