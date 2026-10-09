import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalQuery, type QueryCtx } from "./_generated/server";
import { modelFor } from "./aiSettings";
import { type AiTask, type ModelChoice, reasoningLevel } from "./aiTasks";
import { withoutBoilerplate } from "./boilerplate";
import { itemsOf } from "./itemShapes";
import { chatJson, decide, type DecisionQuestion, withBackoff } from "./metering";
import { type ReplySchema, strictObject, strings } from "./replyJson";

// Sorting roles: before a role is judged in full, it's sorted to the directions it could plausibly be, or to none. Only
// those directions are judged; a role sorted to none isn't judged at all. The sort leans toward including: a role wrongly
// left out is never read again, while an extra one only costs a judgment. Two ways to sort, chosen per workspace: an AI
// model naming the directions for each posting, or Jev answering yes or no per direction with a probability.

export type SortMethod = "model" | "jev";
export type SortPosting = { id: string; title: string; company: string; text: string };
export type SortDirection = { id: string; name: string; positioning?: string; titles: string[] };
// The AI task whose model each method uses: "Sorting roles" or "Sorting roles with Jev".
export const SORT_TASK: Record<SortMethod, AiTask> = { model: "roleSort", jev: "roleSortJev" };

// Postings per AI model call: few enough that each call comes back quickly, and all of a sort's calls run at once.
export const MODEL_BATCH = 10;
// Jev decisions (one per posting) sent together under one budget reservation.
const JEV_GROUP = 50;
// Model calls, and Jev groups, running at once within one sort; the rest start as those finish.
const MODEL_AT_ONCE = 64;
const JEV_AT_ONCE = 4;
// How Jev's answers decide, chosen on the backtest of 1,086 roles (see roleSort:backtest). A role is sorted out only when
// Jev is nearly sure its work is none of the directions (`pick` says none with at least JEV_NONE). Otherwise it goes on to
// each direction Jev gave any real chance as the one it is most (JEV_PICK), or said yes to at JEV_WORK. Low on purpose:
// a missed role costs more than an extra judgment.
export const JEV_NONE = 0.95;
export const JEV_PICK = 0.02;
export const JEV_WORK = 0.2;

// Approved directions as ranking sees them: only approved detail and approved criteria.
export async function directionsFor(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return (await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => {
    const detail = d.data.detailStatus === "approved" ? d.data.detail : undefined;
    const criteria = d.data.criteriaStatus === "approved" ? d.data.criteria : undefined;
    return {
      id: d._id,
      name: d.data.name,
      ...(d.data.summary ? { summary: d.data.summary } : {}),
      ...(detail ? { positioning: detail.positioning, vocabulary: detail.vocabulary } : {}),
      titles: [...new Set([...(detail?.targetTitles ?? []), ...(criteria?.titles ?? [])])],
      ...(criteria ? { criteria: { industries: criteria.industries, sizes: criteria.sizes, stages: criteria.stages, keywords: criteria.keywords } } : {}),
    };
  });
}

export const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

// Runs `run` over every item, `atOnce` at a time. After a failure no new item starts; the first failure is thrown once
// the running ones finish.
export async function pool<T>(items: T[], atOnce: number, run: (item: T) => Promise<void>) {
  let next = 0;
  let failure: { e: unknown } | undefined;
  await Promise.all(
    Array.from({ length: Math.min(atOnce, items.length) }, async () => {
      while (!failure && next < items.length) {
        const item = items[next++];
        try {
          await run(item);
        } catch (e) {
          failure ??= { e };
        }
      }
    }),
  );
  if (failure) throw failure.e;
}

// A sort's reply (structured output, metering.chat): the keys of each of `count` postings, r1 to rN, with the keys of
// its directions.
export const sortSchema = (count: number): ReplySchema => ({ name: "role_sort", schema: strictObject(Object.fromEntries(Array.from({ length: count }, (_, i) => [`r${i + 1}`, strings]))) });

// What the sort reads of a direction, keyed d1, d2, ... so replies stay short.
const dirKey = (i: number) => `d${i + 1}`;
const brief = (d: SortDirection) => ({ name: d.name, ...(d.positioning ? { positioning: d.positioning } : {}), titles: d.titles });

const SORT = `You sort job postings for a job seeker before each one is read closely. For each posting, name every direction it could plausibly be: the work the direction is about, or near it, at any level and under any title. The directions often overlap, and a posting often fits several: name each one whose work overlaps the posting's work even partly. When unsure, include the direction: a posting left out is never looked at again for it, while an extra one only costs a closer read. Name no direction only when the work is clearly something else (another field or function, such as engineering, design, finance or legal). Judge the work the description describes, not the title's words; use the title only when there is no description.
Reply with JSON only: one key per posting, each with the keys of its directions, for example {"r1": ["d2"], "r2": [], "r3": ["d1", "d3"]}.`;

// A batch that fails starts no more of them, and comes back as `failure` beside the results of the batches that did
// come back, each paid for. `stopAt` (the backtest): batches that fail, or aren't back by then, are left out of the
// results instead, and counted.
async function modelSort(ctx: ActionCtx, ws: Id<"workspaces">, choice: ModelChoice, postings: SortPosting[], directions: SortDirection[], stopAt?: number) {
  const ids = new Map(directions.map((d, i) => [dirKey(i), d.id]));
  const dirs = Object.fromEntries(directions.map((d, i) => [dirKey(i), brief(d)]));
  const results = new Map<string, string[]>();
  let costUsd = 0;
  // Postings the reply left out; they go on to every direction rather than being dropped.
  let unanswered = 0;
  const errors: string[] = [];
  const sortBatch = async (batch: SortPosting[]) => {
    const listed = Object.fromEntries(batch.map((p, i) => [`r${i + 1}`, { title: p.title, company: p.company, description: p.text }]));
    const reply = await withBackoff(() =>
      chatJson<Record<string, unknown>>(ctx, {
        workspaceId: ws,
        purpose: "role sort",
        model: choice.model,
        reasoning: choice.reasoning,
        schema: sortSchema(batch.length),
        messages: [
          { role: "system", content: SORT },
          { role: "user", content: `Directions:\n${JSON.stringify(dirs)}\n\nPostings:\n${JSON.stringify(listed)}` },
        ],
      }),
    );
    costUsd += reply.costUsd;
    batch.forEach((p, i) => {
      const named = reply.out[`r${i + 1}`];
      if (!Array.isArray(named)) {
        unanswered++;
        results.set(p.id, directions.map((d) => d.id));
        return;
      }
      results.set(p.id, [...new Set(named.map((k) => ids.get(String(k))).filter((id): id is string => !!id))]);
    });
  };
  let failure: { e: unknown } | undefined;
  if (stopAt === undefined) failure = await pool(chunks(postings, MODEL_BATCH), MODEL_AT_ONCE, sortBatch).then(() => undefined, (e: unknown) => ({ e }));
  else {
    const run = pool(chunks(postings, MODEL_BATCH), MODEL_AT_ONCE, async (batch) => {
      if (Date.now() >= stopAt) return;
      await sortBatch(batch).catch((e: unknown) => void errors.push(e instanceof Error ? e.message : String(e)));
    });
    const deadline = Promise.withResolvers<void>();
    const timer = setTimeout(deadline.resolve, Math.max(0, stopAt - Date.now()));
    await Promise.race([run, deadline.promise]);
    clearTimeout(timer);
  }
  return { results: new Map(results), costUsd, unanswered, errors, failure };
}

// Jev's questions for one posting (in the state as `posting`). Question ids never reach the model, so each question
// carries what it's about. Per direction: `work_dN`, whether the job's main work is that direction's work. Across
// directions: `pick`, which one direction it is most, or none of them, with a probability for each.
const NONE = "none";
const OTHER_WORK = "for example software or hardware engineering, research, design, finance, accounting, legal, recruiting, people operations, marketing, or manufacturing";
function jevQuestions(directions: SortDirection[]): Record<string, DecisionQuestion> {
  const perDirection = directions.map((d, i): [string, DecisionQuestion] => [
    `work_${dirKey(i)}`,
    {
      type: "noul",
      instructions: { direction: brief(d), question: "Is the main work of the job in `posting` the kind of work described by `direction`, at any level and under any title?" },
      criteria: {
        true: "Day to day, the job does what `direction` is about.",
        false: `The job's main work is a different function (${OTHER_WORK}), even if it mentions some of the same topics.`,
      },
    },
  ]);
  const pick: DecisionQuestion = {
    type: "choice",
    instructions: "Which of these kinds of work is the main work of the job in `posting`? Judge what the job does day to day, not the words in its title.",
    criteria: { ...Object.fromEntries(directions.map((d, i) => [dirKey(i), brief(d)])), [NONE]: `None of these: the job's main work is a different function (${OTHER_WORK}).` },
  };
  return { ...Object.fromEntries(perDirection), pick };
}

// Jev's signals per posting: the probability its main work is each direction's work (`work`, in the directions' order),
// the probability each direction is the one it is most (`pick`), and the probability it's none of them (`none`).
export type JevSignals = { work: number[]; pick: number[]; none: number };
// Asks Jev for each posting's signals, a group at a time. A group that fails starts no more of them, and comes back as
// `failure` beside the signals of the groups that came back.
export async function jevSignals(ctx: ActionCtx, ws: Id<"workspaces">, model: string, postings: SortPosting[], directions: SortDirection[]) {
  const questions = jevQuestions(directions);
  const signals = new Map<string, JevSignals>();
  let costUsd = 0;
  const failure = await pool(chunks(postings, JEV_GROUP), JEV_AT_ONCE, async (group) => {
    const r = await decide(ctx, {
      workspaceId: ws,
      purpose: "role sort",
      model,
      decisions: group.map((p) => ({ state: { posting: { title: p.title, company: p.company, description: p.text } }, questions })),
    });
    costUsd += r.costUsd;
    group.forEach((p, i) => {
      const a = r.answers[i];
      const pick = a.pick.type === "choice" ? (a.pick.probabilities ?? { [a.pick.choice]: 1 }) : {};
      signals.set(p.id, {
        work: directions.map((_, k) => {
          const w = a[`work_${dirKey(k)}`];
          return w.type === "noul" ? w.noul : 0;
        }),
        pick: directions.map((_, k) => pick[dirKey(k)] ?? 0),
        none: pick[NONE] ?? 0,
      });
    });
  }).then(() => undefined, (e: unknown) => ({ e }));
  return { signals, costUsd, failure };
}

// Liquid AI's d1 (spike, backtest only): the same questions as Jev, asked of Liquid's decisions API one posting a call
// (its free tier, `d1:free`, so no cost is recorded), with the same signals, so Jev's rules score it alike. Busy
// replies wait and try again.
const D1_AT_ONCE = 8;
export async function d1Signals(postings: SortPosting[], directions: SortDirection[], stopAt: number) {
  const key = process.env.LIQUIDAI_API_KEY;
  if (!key) throw new Error("Set LIQUIDAI_API_KEY on this deployment first.");
  const questions = jevQuestions(directions);
  const signals = new Map<string, JevSignals>();
  const errors: string[] = [];
  let inputTokens = 0;
  await pool(postings, D1_AT_ONCE, async (p) => {
    for (let attempt = 0; attempt < 5 && Date.now() < stopAt; attempt++) {
      const res = await fetch("https://api.liquid.ai/decisions/v1/systemone", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "d1:free", state: { posting: { title: p.title, company: p.company, description: p.text } }, questions }),
      }).catch((e: unknown) => ({ ok: false, status: 0, json: async () => ({ error: { message: String(e) } }), headers: new Headers() }) as unknown as Response);
      const body = (await res.json().catch(() => ({}))) as { answers?: Record<string, { type: string; noul?: number; choice?: string; probabilities?: Record<string, number> }>; usage?: { input_tokens?: number }; error?: { message?: string } };
      if (res.status === 429 || res.status >= 500) {
        const wait = Promise.withResolvers<void>();
        setTimeout(wait.resolve, Number(res.headers.get("retry-after") ?? 0) * 1000 || 1000 * 2 ** attempt);
        await wait.promise;
        continue;
      }
      if (!res.ok || !body.answers) return void errors.push(body.error?.message ?? `Liquid returned ${res.status}.`);
      inputTokens += body.usage?.input_tokens ?? 0;
      // Every question answered in its type, or the role counts as unanswered: a missing answer is never a zero.
      const a = body.answers;
      const work = directions.map((_, k) => a[`work_${dirKey(k)}`]?.noul);
      const pick = a.pick?.type === "choice" ? a.pick.probabilities : undefined;
      const options = [...directions.map((_, k) => dirKey(k)), NONE];
      if (work.some((w) => typeof w !== "number") || !pick || options.some((o) => typeof pick[o] !== "number")) return void errors.push("Liquid left a question unanswered.");
      signals.set(p.id, { work: work as number[], pick: directions.map((_, k) => pick[dirKey(k)]), none: pick[NONE] });
      return;
    }
    errors.push("Liquid stayed busy.");
  });
  return { signals, errors, inputTokens };
}

// A Jev rule: which directions a posting goes on to, from its signals (one flag per direction).
type JevRule = (s: JevSignals) => boolean[];
export const jevPass = (signals: Map<string, JevSignals>, directions: SortDirection[], rule: JevRule) =>
  new Map(
    [...signals].map(([id, s]) => {
      const pass = rule(s);
      return [id, directions.filter((_, k) => pass[k]).map((d) => d.id)];
    }),
  );
const gated = (none: number, pick: number, work: number): JevRule => (s) => s.work.map((w, k) => s.none < none && (s.pick[k] >= pick || w >= work));
export const JEV_RULE = gated(JEV_NONE, JEV_PICK, JEV_WORK);

// Sorts each posting to the ids of the directions it could plausibly be ([] for none), with the workspace's model for the
// method: "Sorting roles" for an AI model, "Sorting roles with Jev" for Jev. A call that fails (the budget refusing it,
// say) starts no more; the results are then those of the calls that came back, each paid for, and `failure` is why the
// rest weren't sorted, for the caller to deal with once it has saved them.
export async function sortRoles(ctx: ActionCtx, ws: Id<"workspaces">, method: SortMethod, postings: SortPosting[], directions: SortDirection[]): Promise<{ results: Map<string, string[]>; costUsd: number; failure?: { e: unknown } }> {
  if (!postings.length || !directions.length) return { results: new Map<string, string[]>(postings.map((p) => [p.id, []])), costUsd: 0 };
  const choice = await modelFor(ctx, ws, SORT_TASK[method]);
  if (method === "model") {
    const { results, costUsd, failure } = await modelSort(ctx, ws, choice, postings, directions);
    return { results, costUsd, failure };
  }
  const { signals, costUsd, failure } = await jevSignals(ctx, ws, choice.model, postings, directions);
  return { results: jevPass(signals, directions, JEV_RULE), costUsd, failure };
}

// ---- Backtest ----

// Roles judged by the first full ranking, before sorting existed: their verdicts are the answers the sort is checked
// against. A role fits a direction when that ranking said strong or some.
const LABELLED_BEFORE = 1790425000000;
export const PAGE = 500;
const TEXTS_PER_READ = 100;

// One page of the workspace's postings, keeping the labelled ones, with the directions they're sorted against.
export const labelled = internalQuery({
  args: { workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(paginationOpts);
    return {
      postings: page.page
        .filter((p) => p.fitAt !== undefined && p.fitAt < LABELLED_BEFORE)
        .map((p) => ({
          id: p._id,
          companyId: p.companyId,
          title: p.title,
          fits: (p.fit ?? []).flatMap((f) => (f.level === "strong" || f.level === "some" ? [{ directionId: String(f.directionId), level: f.level, reason: f.reason ?? "" }] : [])),
        })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      directions: (await directionsFor(ctx, workspaceId)).map((d) => ({ id: String(d.id), name: d.name, ...(d.positioning ? { positioning: d.positioning } : {}), titles: d.titles })),
    };
  },
});

// Full descriptions (raw, as read from the board) and company names for some postings.
export const texts = internalQuery({
  args: { workspaceId: v.id("workspaces"), ids: v.array(v.id("postings")) },
  handler: async (ctx, { workspaceId, ids }) => {
    const names = new Map<string, string>();
    const out = [];
    for (const id of ids) {
      const p = await ctx.db.get(id);
      if (!p || p.workspaceId !== workspaceId) continue;
      if (!names.has(p.companyId)) names.set(p.companyId, (await ctx.db.get(p.companyId))?.name ?? "");
      const text = p.hasDescription ? (await ctx.db.query("postingTexts").withIndex("by_posting", (q) => q.eq("postingId", id)).first())?.text : undefined;
      out.push({ id: String(id), company: names.get(p.companyId)!, text: text ?? "" });
    }
    return out;
  },
});

export const round = (n: number) => Math.round(n * 1000) / 1000;
// Other Jev rules the backtest scores from the same answers, for choosing the one sortRoles uses.
export const JEV_RULES: [string, JevRule][] = [
  ...[0.1, 0.2, 0.3, 0.5].map((t): [string, JevRule] => [`work >= ${t}`, (s) => s.work.map((w) => w >= t)]),
  ...[0.02, 0.05, 0.1, 0.2].map((t): [string, JevRule] => [`pick >= ${t}`, (s) => s.pick.map((p) => p >= t)]),
  ...[0.8, 0.9, 0.95, 0.98, 1.01].flatMap((g) =>
    [0.2, 0.3, 0.5].map((w): [string, JevRule] => [`none < ${g}, then pick >= ${JEV_PICK} or work >= ${w}`, gated(g, JEV_PICK, w)]),
  ),
];
// `npx convex run` gives up on a function after 5 minutes, so the backtest reports by then with what's back.
export const REPORT_BY_MS = 270_000;

// Descriptions without what each company repeats across its postings, as the sort reads them in a pass.
export async function readPostings(ctx: ActionCtx, ws: Id<"workspaces">, roles: { id: Id<"postings">; companyId: Id<"companies">; title: string }[]): Promise<SortPosting[]> {
  const read: { id: string; company: string; text: string }[] = (
    await Promise.all(chunks(roles, TEXTS_PER_READ).map((c) => ctx.runQuery(internal.roleSort.texts, { workspaceId: ws, ids: c.map((r) => r.id) })))
  ).flat();
  const byId = new Map(read.map((r) => [r.id, r]));
  const byCompany = new Map<string, typeof roles>();
  for (const r of roles) {
    const group = byCompany.get(r.companyId);
    if (group) group.push(r);
    else byCompany.set(r.companyId, [r]);
  }
  const clean = new Map<string, string>();
  for (const group of byCompany.values()) {
    const withText = group.filter((r) => byId.get(r.id)?.text);
    withoutBoilerplate(withText.map((r) => ({ title: r.title, text: byId.get(r.id)!.text }))).forEach((t, i) => clean.set(withText[i].id, t));
  }
  return roles.map((r) => ({ id: r.id, title: r.title, company: byId.get(r.id)?.company ?? "", text: clean.get(r.id) ?? "" }));
}

// Operator only: sorts the labelled roles with one method and reports how the sort did against the first ranking's
// verdicts. Reads and pays for AI calls (recorded as usage like any other), and writes nothing else.
// `npx convex run roleSort:backtest '{"workspaceId": "...", "method": "jev"}'`. Optional: `limit` sorts only the first
// roles; `model` and `reasoning` try something other than the workspace's choice; `raw` also returns every role's result
// (the directions it was sorted to, Jev's probabilities) so other rules can be tried without asking again. `d1` asks
// Liquid AI's d1 the same questions as Jev (spike; LIQUIDAI_API_KEY on the deployment).
export const backtest = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    method: v.union(v.literal("model"), v.literal("jev"), v.literal("d1")),
    limit: v.optional(v.number()),
    model: v.optional(v.string()),
    reasoning: v.optional(reasoningLevel),
    raw: v.optional(v.boolean()),
  },
  handler: async (ctx, { workspaceId: ws, method, limit, model, reasoning, raw }) => {
    const started = Date.now();
    type Labelled = { id: Id<"postings">; companyId: Id<"companies">; title: string; fits: { directionId: string; level: "strong" | "some"; reason: string }[] };
    let roles: Labelled[] = [];
    let directions: SortDirection[] = [];
    for (let cursor: string | null = null, done = false; !done; ) {
      const page: { postings: Labelled[]; isDone: boolean; continueCursor: string; directions: SortDirection[] } = await ctx.runQuery(internal.roleSort.labelled, { workspaceId: ws, paginationOpts: { numItems: PAGE, cursor } });
      roles.push(...page.postings);
      directions = page.directions;
      done = page.isDone;
      cursor = page.continueCursor;
    }
    if (limit !== undefined) roles = roles.slice(0, limit);
    if (!roles.length || !directions.length) throw new Error("No labelled roles or no approved directions to sort against.");

    const postings = await readPostings(ctx, ws, roles);
    const byId = new Map(postings.map((p) => [p.id, p]));

    const own = method === "d1" ? { model: "d1:free", reasoning: undefined } : await modelFor(ctx, ws, SORT_TASK[method]).catch(() => null);
    const choice: ModelChoice = { model: model ?? own?.model ?? "", reasoning: reasoning ?? (model ? undefined : own?.reasoning) };
    if (!choice.model) throw new Error("Choose a model for this sort in settings, or pass one.");
    const sortStarted = Date.now();
    let results: Map<string, string[]>;
    let costUsd: number;
    let modelRun: { unanswered: number; errors: string[] } | undefined;
    let signals: Map<string, JevSignals> | undefined;
    if (method === "model") {
      const r = await modelSort(ctx, ws, choice, postings, directions, started + REPORT_BY_MS);
      ({ results, costUsd } = r);
      modelRun = { unanswered: r.unanswered, errors: r.errors };
    } else if (method === "d1") {
      const r = await d1Signals(postings, directions, started + REPORT_BY_MS);
      signals = r.signals;
      costUsd = 0;
      modelRun = { unanswered: postings.length - r.signals.size, errors: r.errors };
      results = jevPass(signals, directions, JEV_RULE);
    } else {
      let failure;
      ({ signals, costUsd, failure } = await jevSignals(ctx, ws, choice.model, postings, directions));
      if (failure) throw failure.e;
      results = jevPass(signals, directions, JEV_RULE);
    }
    const sortSeconds = (Date.now() - sortStarted) / 1000;

    // Only roles the sort got back to are scored. Pairs: role and direction the first ranking said fit, among
    // directions still approved.
    const sorted = roles.filter((r) => results.has(r.id));
    const current = new Set(directions.map((d) => d.id));
    const pairs = sorted.flatMap((r) => r.fits.filter((f) => current.has(f.directionId)).map((f) => ({ r, f })));
    const strong = pairs.filter((x) => x.f.level === "strong");
    const unfit = sorted.filter((r) => !r.fits.some((f) => current.has(f.directionId)));
    const fitting = sorted.filter((r) => r.fits.some((f) => current.has(f.directionId)));
    const score = (res: Map<string, string[]>) => {
      const kept = (x: (typeof pairs)[number]) => !!res.get(x.r.id)?.includes(x.f.directionId);
      const passed = sorted.filter((r) => res.get(r.id)?.length);
      return {
        recall: pairs.length ? round(pairs.filter(kept).length / pairs.length) : null,
        recallStrong: strong.length ? round(strong.filter(kept).length / strong.length) : null,
        // Roles the first ranking found some fit for that the sort passed on at all (to any direction).
        roleRecall: fitting.length ? round(fitting.filter((r) => res.get(r.id)?.length).length / fitting.length) : null,
        passed: sorted.length ? round(passed.length / sorted.length) : null,
        directionsPerPassed: passed.length ? round(passed.reduce((n, r) => n + res.get(r.id)!.length, 0) / passed.length) : 0,
        // Roles the first ranking found no fit for, sent on anyway: the judging the sort doesn't save.
        passedWithoutFit: unfit.length ? round(unfit.filter((r) => res.get(r.id)?.length).length / unfit.length) : null,
      };
    };
    const misses = pairs.filter((x) => !results.get(x.r.id)?.includes(x.f.directionId));
    const names = new Map(directions.map((d) => [d.id, d.name]));
    const k = (id: string) => directions.findIndex((d) => d.id === id);
    return {
      method,
      model: choice.model,
      ...(choice.reasoning ? { reasoning: choice.reasoning } : {}),
      roles: roles.length,
      sorted: sorted.length,
      directions: directions.length,
      fitPairs: pairs.length,
      rolesWithAFit: fitting.length,
      // Verdicts for directions no longer approved, left out of recall.
      pairsForOldDirections: sorted.reduce((n, r) => n + r.fits.filter((f) => !current.has(f.directionId)).length, 0),
      rolesWithoutDescription: postings.filter((p) => !p.text).length,
      sortSeconds,
      totalSeconds: (Date.now() - started) / 1000,
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      ...score(results),
      ...(modelRun ? { unanswered: modelRun.unanswered, failedBatches: modelRun.errors.length, errors: [...new Set(modelRun.errors)].slice(0, 5) } : {}),
      ...(signals
        ? {
            rule: `none < ${JEV_NONE}, then pick >= ${JEV_PICK} or work >= ${JEV_WORK}`,
            otherRules: JEV_RULES.map(([rule, pass]) => ({ rule, ...score(jevPass(signals!, directions, pass)) })),
          }
        : {}),
      missCount: misses.length,
      misses: misses.slice(0, 10).map(({ r, f }) => ({
        title: r.title,
        company: byId.get(r.id)?.company ?? "",
        direction: names.get(f.directionId) ?? f.directionId,
        level: f.level,
        reason: f.reason,
        sortedTo: (results.get(r.id) ?? []).map((id) => names.get(id) ?? id),
        ...(signals ? { work: round(signals.get(r.id)!.work[k(f.directionId)]), pick: round(signals.get(r.id)!.pick[k(f.directionId)]), none: round(signals.get(r.id)!.none) } : {}),
      })),
      ...(raw
        ? {
            directionIds: directions.map((d) => d.id),
            raw: sorted.map((r) => ({
              title: r.title,
              fits: r.fits.filter((f) => current.has(f.directionId)).map((f) => ({ d: k(f.directionId), level: f.level })),
              sortedTo: (results.get(r.id) ?? []).map(k),
              ...(signals ? { work: signals.get(r.id)!.work.map(round), pick: signals.get(r.id)!.pick.map(round), none: round(signals.get(r.id)!.none) } : {}),
            })),
          }
        : {}),
    };
  },
});
