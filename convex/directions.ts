import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type QueryCtx, query } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { activeLimits, type ItemOf, itemsOf, pickDirection } from "./itemShapes";
import { STAGE_LIST } from "./directionVocab";
import { toDomain } from "./discovery";
import { INDUSTRIES, SIZES } from "./limitBuckets";
import { chatJson, LONG_REPLY_TOKENS } from "./metering";
import { listOf, type ReplySchema, replyOf, strictObject, string, strings } from "./replyJson";
import { approvedRecord, backgroundNarratives, counted } from "./recordContext";
import { PLAIN_LANGUAGE } from "./writingGuides";
import { refuseCancelled } from "./cancel";
import { getInWorkspace, requireWorkspace } from "./workspaces";
import { fillIn, fillingNow, fillProgress, passDone, passIds, recentJobs, refuseWhileMerging, underway } from "./directionFill";

// Deepens each direction: how to position the record for it, the titles and vocabulary its market uses, which stories
// carry over and which need reframing, how past titles translate, and what search should look for. "Suggest more" proposes
// directions they hadn't considered. Evidence is the approved record; narratives are background. Detail and criteria are
// reviewed separately, and only approved ones feed resumes and search.

export const STAGES = STAGE_LIST;

const DETAIL_SPEC = `For each direction produce:
- "positioning": two sentences on how to present them for this kind of work, grounded in their record, in the second person.
- "targetTitles": the job titles this market actually posts for someone at their level (5 to 10).
- "vocabulary": terms hiring managers in this market use that fit their record (8 to 15 short terms).
- "carriesOver": the stories from their record that transfer as they are: {"text": one line, "factIds": approved fact ids it rests on}.
- "reframe": stories that fit only when told differently: {"text": the story as it should be told here, "how": what changes in the telling, "factIds"}.
- "titleMap": how their past titles read in this market: {"from": their title, "to": the equivalent here}.
- "criteria": what search should look for: "industries" (from [${INDUSTRIES.map((x) => `"${x}"`).join(", ")}]), "sizes" (from [${SIZES.map((x) => `"${x}"`).join(", ")}]), "stages" (from [${STAGES.map((x) => `"${x}"`).join(", ")}]), "titles" (the titles to search for), "keywords" (terms to find in postings and company descriptions).
Use only what the approved record supports; never invent experience.
Criteria and target titles aim at where they want to go, not only where they've been: they follow their approved limits (the kinds of companies and industries they want or avoid, the seniority each direction must reach, and anything else in the limits' rules). An industry from their past belongs in the criteria only if their goals keep it. Titles sit at the seniority their limits allow for that direction.`;

const SYSTEM = `You are a great career strategist who has read someone's whole career record and what they want next.

${DETAIL_SPEC}

${PLAIN_LANGUAGE}

Reply with JSON only: {"directions":[{"id": "...", "positioning": ..., "targetTitles": [...], "vocabulary": [...], "carriesOver": [...], "reframe": [...], "titleMap": [...], "criteria": {...}}]}.`;

const SUGGEST = `You are a great career strategist. From their approved record and insights, propose directions they haven't considered that their record genuinely supports and that fit their goals and limits: other kinds of work where their strengths are valued. Not repeats or near-repeats of their current directions, and nothing they rejected. Each gets "name" (one job-board banner title), "includes" (related titles under it), "summary" (one or two sentences on why it fits, grounded in the record), "path" ("adjacent" or "stretch"), "factIds" (the approved facts that show they could do it), and the full detail below.

${DETAIL_SPEC}

${PLAIN_LANGUAGE}

Reply with JSON only: {"directions":[{"name": "...", "includes": [...], "summary": "...", "path": "...", "factIds": [...], "positioning": ..., "targetTitles": [...], "vocabulary": [...], "carriesOver": [...], "reframe": [...], "titleMap": [...], "criteria": {...}}]}.`;

// The replies' shapes (structured output, metering.chat), as clean and save read them.
const DETAIL = {
  positioning: string,
  targetTitles: strings,
  vocabulary: strings,
  carriesOver: listOf({ text: string, factIds: strings }),
  reframe: listOf({ text: string, how: string, factIds: strings }),
  titleMap: listOf({ from: string, to: string }),
  criteria: strictObject({ industries: strings, sizes: strings, stages: strings, titles: strings, keywords: strings }),
};
export const DETAIL_SCHEMA: ReplySchema = replyOf("direction_detail", "directions", { id: string, ...DETAIL });
export const SUGGEST_SCHEMA: ReplySchema = replyOf("suggest_directions", "directions", { name: string, includes: strings, summary: string, path: string, factIds: strings, ...DETAIL });

// Fill in one direction (again, when it has detail already), or every approved direction with nothing filled in that
// isn't being filled in now.
export const detail = mutation({
  args: { id: v.optional(v.id("items")) },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    await refuseWhileMerging(ctx, workspaceId, id ? [id] : undefined);
    if (id) {
      const d = await getInWorkspace(ctx, workspaceId, id);
      if (d?.kind !== "direction" || d.status !== "approved") throw new Error("Not found.");
      return fillIn(ctx, workspaceId, [id], "you");
    }
    const jobs = await recentJobs(ctx, workspaceId);
    const missing = [];
    for (const d of await itemsOf(ctx, workspaceId, "direction", "approved")) if (!d.data.detail && !(await fillingNow(ctx, jobs, d))) missing.push(d._id);
    return fillIn(ctx, workspaceId, missing, "you");
  },
});

export const suggest = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if ((await recentJobs(ctx, workspaceId)).some((j) => j.kind === "directions" && j.args.mode === "suggest" && underway(j))) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "directions", args: { mode: "suggest" }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const record = await approvedRecord(ctx, workspaceId);
    const approved = await itemsOf(ctx, workspaceId, "direction", "approved");
    const rejected = (await itemsOf(ctx, workspaceId, "direction", "rejected")).map((d) => d.data.name);
    const proposed = (await itemsOf(ctx, workspaceId, "direction", "proposed")).map((d) => d.data.name);
    const limits = (await activeLimits(ctx, workspaceId)).map((l) => ({ label: l.data.label, value: l.data.value, appliesTo: l.data.appliesTo, when: l.data.when, rule: l.data.rule, firm: l.data.firm }));
    return { record, directions: approved, rejected, proposed, limits, background: await backgroundNarratives(ctx, workspaceId) };
  },
});

type Raw = Record<string, unknown>;
const s = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : "");
const strList = (x: unknown) => (Array.isArray(x) ? [...new Set(x.map(s).filter(Boolean))] : []);
const oneOf = (x: unknown, allowed: readonly string[]) => strList(x).map((i) => i.toLowerCase()).filter((i) => allowed.includes(i));

// Reduces a reply to the detail and criteria shapes. Stories keep only approved fact ids; a story with none is dropped.
function clean(raw: Raw, approvedFacts: Set<string>, avoid: Set<string>) {
  const stories = (x: unknown, withHow: boolean) =>
    (Array.isArray(x) ? x : [])
      .map((st: Raw) => ({ text: s(st?.text), how: withHow ? s(st?.how) || undefined : undefined, factIds: strList(st?.factIds).filter((id) => approvedFacts.has(id)) }))
      .filter((st) => st.text && st.factIds.length)
      .map((st) => Object.fromEntries(Object.entries(st).filter(([, x]) => x !== undefined)) as { text: string; factIds: string[]; how?: string });
  const detail = {
    positioning: s(raw.positioning),
    targetTitles: strList(raw.targetTitles),
    vocabulary: strList(raw.vocabulary),
    carriesOver: stories(raw.carriesOver, false),
    reframe: stories(raw.reframe, true),
    titleMap: (Array.isArray(raw.titleMap) ? raw.titleMap : []).map((m: Raw) => ({ from: s(m?.from), to: s(m?.to) })).filter((m) => m.from && m.to),
  };
  const c = (raw.criteria ?? {}) as Raw;
  const criteria = { industries: oneOf(c.industries, INDUSTRIES).filter((i) => !avoid.has(i)), sizes: oneOf(c.sizes, SIZES), stages: oneOf(c.stages, STAGES), titles: strList(c.titles), keywords: strList(c.keywords) };
  return { detail: detail.positioning ? detail : null, criteria };
}

const norm = (t: string) => t.trim().toLowerCase();

// Industries their approved limits avoid never become search criteria, whatever the model proposes.
async function avoidedIndustries(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return new Set((await activeLimits(ctx, workspaceId)).flatMap((l) => (l.data.kind === "companies" && Array.isArray(l.data.rule?.industriesAvoid) ? (l.data.rule.industriesAvoid as string[]) : [])));
}

// The next direction a fill-in pass fills: the first it was asked for that it hasn't got to and that's still approved
// (one that isn't is passed over). With none left the pass closes, so a direction asked for after this starts a new one.
// None once the pass was cancelled from Activity.
export const nextToFill = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status === "cancelled") return null;
    const done = passDone(job);
    const skipped = [];
    let next = null;
    for (const id of passIds(job)) {
      if (done.has(id)) continue;
      const d = await getInWorkspace(ctx, job.workspaceId, id);
      if (d?.kind === "direction" && d.status === "approved") {
        next = { id: d._id, name: d.data.name, includes: d.data.includes, summary: d.data.summary, fit: d.data.path };
        break;
      }
      skipped.push({ step: id, result: { filled: false } });
    }
    await ctx.db.patch(jobId, { ...(skipped.length ? { done: [...(job.done ?? []), ...skipped] } : {}), ...(next ? {} : { args: { ...job.args, closed: true } }) });
    return next;
  },
});

// One direction's reply from a fill-in pass, saved once (the pass's step for it): its detail and criteria, proposed. A
// reply with no positioning fills nothing, and the direction shows Fill in again. Approved detail or criteria are
// theirs; a new fill-in never overwrites them.
export const saveFill = internalMutation({
  args: { jobId: v.id("jobs"), id: v.id("items"), out: v.any() },
  handler: async (ctx, { jobId, id, out }) => {
    await refuseCancelled(ctx, jobId);
    const job = await ctx.db.get(jobId);
    if (!job || passDone(job).has(id)) return false;
    const rows: Raw[] = Array.isArray(out?.directions) ? out.directions : [];
    const raw = rows.find((r) => r.id === id) ?? (rows.length === 1 ? rows[0] : null);
    const d = await getInWorkspace(ctx, job.workspaceId, id);
    const facts = new Set((await counted(ctx, job.workspaceId, "fact")).map((f) => String(f._id)));
    const { detail, criteria } = raw ? clean(raw, facts, await avoidedIndustries(ctx, job.workspaceId)) : { detail: null, criteria: null };
    const filled = !!(detail && criteria && d?.kind === "direction" && d.status === "approved");
    if (filled && d?.kind === "direction")
      await ctx.db.patch(d._id, {
        data: {
          ...d.data,
          detailRunId: jobId,
          ...(d.data.detailStatus === "approved" ? {} : { detail, detailStatus: "proposed" as const }),
          ...(d.data.criteriaStatus === "approved" ? {} : { criteria: { ...(d.data.criteria?.seeds ? { seeds: d.data.criteria.seeds } : {}), ...criteria }, criteriaStatus: "proposed" as const }),
        },
      });
    await ctx.db.patch(jobId, { done: [...(job.done ?? []), { step: id, result: { filled } }] });
    return filled;
  },
});

export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), runId: v.id("jobs"), out: v.any() },
  handler: async (ctx, { workspaceId, runId, out }) => {
    await refuseCancelled(ctx, runId);
    if (await ctx.db.query("items").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return { alreadySaved: true };
    const facts = new Set((await counted(ctx, workspaceId, "fact")).map((f) => String(f._id)));
    const avoid = await avoidedIndustries(ctx, workspaceId);
    const rows: Raw[] = Array.isArray(out?.directions) ? out.directions : [];
    let n = 0;
    const taken = new Set<string>();
    for (const status of ["proposed", "approved", "rejected", "superseded"] as const)
      for (const d of await itemsOf(ctx, workspaceId, "direction", status)) for (const t of [d.data.name, ...(d.data.includes ?? [])]) taken.add(norm(t));
    for (const raw of rows) {
      const base = pickDirection(raw);
      if (!base.name || taken.has(norm(base.name))) continue;
      const { detail, criteria } = clean(raw, facts, avoid);
      const evidence = strList(raw.factIds).filter((id) => facts.has(id));
      // A suggestion has to rest on approved facts.
      if (!evidence.length) continue;
      taken.add(norm(base.name));
      await ctx.db.insert("items", {
        workspaceId,
        kind: "direction",
        status: "proposed",
        data: { ...base, path: base.path === "continue" ? "adjacent" : base.path, suggested: true, evidence, ...(detail ? { detail, detailStatus: "proposed" as const, criteria, criteriaStatus: "proposed" as const } : {}) },
        sources: [],
        runId,
        at: Date.now(),
      });
      n++;
    }
    return { suggested: n };
  },
});

// A fill-in pass fills its directions one call each, in the order asked, until none is left (directions asked for while
// it runs join it); each one saved is a step, so a pass picked up again (after a pause for the budget, or an
// interruption) carries on where it stopped. Suggest more is one call.
export async function runDirections(ctx: ActionCtx, job: Doc<"jobs">) {
  const inp = await ctx.runQuery(internal.directions.inputs, { workspaceId: job.workspaceId });
  const choice = await modelFor(ctx, job.workspaceId, "directions");
  const record = { roles: inp.record.roles, projects: inp.record.projects, facts: inp.record.facts, insights: inp.record.insights, context: inp.record.context };
  const call = (purpose: string, schema: ReplySchema, system: string, content: string) =>
    chatJson<unknown>(ctx, { workspaceId: job.workspaceId, purpose, model: choice.model, reasoning: choice.reasoning, maxTokens: LONG_REPLY_TOKENS, schema, messages: [{ role: "system", content: system }, { role: "user", content }] });
  const context = `Their approved limits:\n${JSON.stringify(inp.limits)}\n\nApproved record (cite facts by id):\n${JSON.stringify(record)}\n\nTheir narratives, as background only:\n${JSON.stringify(inp.background)}`;
  if (job.args.mode === "suggest") {
    const current = inp.directions.map((d) => ({ name: d.data.name, includes: d.data.includes })).concat(inp.proposed.map((name) => ({ name, includes: undefined })));
    const reply = await call("suggest directions", SUGGEST_SCHEMA, SUGGEST, `Their current directions (don't repeat):\n${JSON.stringify(current)}\n\nDirections they rejected (never propose again):\n${JSON.stringify(inp.rejected)}\n\n${context}`);
    const saved = await ctx.runMutation(internal.directions.save, { workspaceId: job.workspaceId, runId: job._id, out: reply.out });
    return { ...saved, costUsd: reply.costUsd, model: reply.model };
  }
  let detailed = 0;
  let costUsd = 0;
  for (let next = await ctx.runMutation(internal.directions.nextToFill, { jobId: job._id }); next; next = await ctx.runMutation(internal.directions.nextToFill, { jobId: job._id })) {
    const reply = await call("direction detail", DETAIL_SCHEMA, SYSTEM, `Directions to fill in (use each "id"):\n${JSON.stringify([next])}\n\n${context}`);
    costUsd += reply.costUsd ?? 0;
    if (await ctx.runMutation(internal.directions.saveFill, { jobId: job._id, id: next.id, out: reply.out })) detailed++;
  }
  return { detailed, costUsd, model: choice.model };
}

// ---- Review ----

// Every direction that's approved, proposed (read from goals, or suggested) or rejected, with where each came from and,
// for an approved one, its fill-in: being filled in now, or failed (its pass ended without filling it). Beside them, the
// last Suggest more and how far the fill-in pass underway has got.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const facts = new Map((await counted(ctx, workspaceId, "fact")).map((f) => [String(f._id), f.data.text]));
    const rows: ItemOf<"direction">[] = [];
    for (const status of ["approved", "proposed", "rejected"] as const) rows.push(...(await itemsOf(ctx, workspaceId, "direction", status)));
    const jobs = await recentJobs(ctx, workspaceId);
    const suggesting = jobs.find((j) => j.kind === "directions" && j.args.mode === "suggest");
    const avoid = await avoidedIndustries(ctx, workspaceId);
    const withFacts = (st: { text: string; factIds: string[]; how?: string }) => ({ ...st, facts: st.factIds.map((id) => facts.get(id) ?? "(no longer in your record)") });
    const fillOf = async (d: ItemOf<"direction">) => {
      if (d.status !== "approved" || !d.data.fillJob) return null;
      if (await fillingNow(ctx, jobs, d)) return "filling" as const;
      return d.data.detail ? null : ("failed" as const);
    };
    return {
      suggest: suggesting ? { status: suggesting.status, error: suggesting.error, result: suggesting.result } : null,
      filling: fillProgress(jobs),
      directions: await Promise.all(
        rows.map(async (d) => ({
          id: d._id,
          status: d.status,
          data: d.data,
          sources: d.sources,
          fill: await fillOf(d),
          // Records still moving: another direction being merged into it, or a merge of it or into it being undone.
          merge: jobs.some((j) => j.kind === "unmerge" && underway(j) && (j.args.id === d._id || j.args.into === d._id))
            ? ("undoing" as const)
            : jobs.some((j) => j.kind === "merge" && underway(j) && j.args.into === d._id)
              ? ("merging" as const)
              : null,
          carriesOver: (d.data.detail?.carriesOver ?? []).map(withFacts),
          reframe: (d.data.detail?.reframe ?? []).map(withFacts),
          evidence: (d.data.evidence ?? []).map((id) => facts.get(id) ?? "(no longer in your record)"),
          // Industries in these criteria that an approved limit now avoids (criteria approved before the limit was).
          avoided: (d.data.criteria?.industries ?? []).filter((i) => avoid.has(i)),
        })),
      ),
    };
  },
});

// Listed roles counted per direction (up to FIT_CAP; more: there are more).
const FIT_CAP = 2000;

// How many listed, judged roles fit each approved direction strongly or somewhat, leaving out those they rated Not for me,
// and whether some of its roles were ranked before it last changed (stale; roles.rankAgain ranks them afresh).
export const fit = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const out = [];
    for (const d of await itemsOf(ctx, workspaceId, "direction", "approved")) {
      const rows = await ctx.db
        .query("roleRanks")
        .withIndex("by_score", (q) => q.eq("workspaceId", workspaceId).eq("directionId", d._id).eq("state", "judged"))
        .filter((q) => q.and(q.neq(q.field("rating"), "no"), q.or(q.eq(q.field("level"), "strong"), q.eq(q.field("level"), "some"))))
        .take(FIT_CAP + 1);
      const fits = rows.slice(0, FIT_CAP);
      const strong = fits.filter((r) => r.level === "strong").length;
      const stale = !!(await ctx.db.query("roleRanks").withIndex("by_ranked", (q) => q.eq("workspaceId", workspaceId).eq("directionId", d._id).lt("at", d.data.changedAt ?? d.at)).first());
      out.push({ directionId: d._id, count: fits.length, strong, some: fits.length - strong, more: rows.length > FIT_CAP, stale });
    }
    return out;
  },
});

export const approvePart = mutation({
  args: { id: v.id("items"), part: v.union(v.literal("detail"), v.literal("criteria")) },
  handler: async (ctx, { id, part }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const d = await getInWorkspace(ctx, workspaceId, id);
    if (!d || d.kind !== "direction" || !d.data[part]) throw new Error("Not found.");
    const key = part === "detail" ? "detailStatus" : "criteriaStatus";
    // Ranking roles reads only approved detail and criteria, so approving one changes what roles are ranked against.
    if (d.data[key] !== "approved") await ctx.db.patch(id, { data: { ...d.data, [key]: "approved" as const, changedAt: Date.now() } });
  },
});

// Undo a part's approval: it goes back to review (resumes, discovery and ranking read only approved parts), logged on
// the direction.
export const unapprovePart = mutation({
  args: { id: v.id("items"), part: v.union(v.literal("detail"), v.literal("criteria")) },
  handler: async (ctx, { id, part }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const d = await getInWorkspace(ctx, workspaceId, id);
    if (!d || d.kind !== "direction") throw new Error("Not found.");
    const key = part === "detail" ? "detailStatus" : "criteriaStatus";
    if (d.data[key] !== "approved") return;
    const at = Date.now();
    await ctx.db.patch(id, { data: { ...d.data, [key]: "proposed" as const, changedAt: at }, undone: [...(d.undone ?? []), { at, part }] });
  },
});

const detailFields = { positioning: v.string(), targetTitles: v.array(v.string()), vocabulary: v.array(v.string()) };
const criteriaFields = { seeds: v.optional(v.array(v.string())), industries: v.array(v.string()), sizes: v.array(v.string()), stages: v.array(v.string()), titles: v.array(v.string()), keywords: v.array(v.string()) };

// Their corrections are approved as given. Criteria lists must use the shared vocabularies.
export const editDetail = mutation({
  args: { id: v.id("items"), ...detailFields },
  handler: async (ctx, { id, ...fields }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const d = await getInWorkspace(ctx, workspaceId, id);
    if (!d || d.kind !== "direction" || !d.data.detail) throw new Error("Not found.");
    if (!fields.positioning.trim()) throw new ConvexError("Say how to position this direction.");
    const tidy = (x: string[]) => [...new Set(x.map((i) => i.trim()).filter(Boolean))];
    await ctx.db.patch(id, { data: { ...d.data, detail: { ...d.data.detail, positioning: fields.positioning.trim(), targetTitles: tidy(fields.targetTitles), vocabulary: tidy(fields.vocabulary) }, detailStatus: "approved", changedAt: Date.now() } });
  },
});

export const editCriteria = mutation({
  args: { id: v.id("items"), ...criteriaFields },
  handler: async (ctx, { id, ...c }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const d = await getInWorkspace(ctx, workspaceId, id);
    if (!d || d.kind !== "direction") throw new Error("Not found.");
    const bad = [
      ...c.industries.filter((x) => !(INDUSTRIES as readonly string[]).includes(x)),
      ...c.sizes.filter((x) => !(SIZES as readonly string[]).includes(x)),
      ...c.stages.filter((x) => !(STAGES as readonly string[]).includes(x)),
    ];
    if (bad.length) throw new ConvexError(`Not on the list: ${bad.join(", ")}.`);
    // Own seeds are checked with everything else, so Save either keeps all of it or none. Omitted: unchanged; empty: none of its own.
    const badSeeds = (c.seeds ?? []).filter((x) => x.trim() && !toDomain(x));
    if (badSeeds.length) throw new ConvexError(`Use each company's website, like acme.com: ${badSeeds.join(", ")}`);
    const seeds = c.seeds === undefined ? d.data.criteria?.seeds : [...new Set(c.seeds.map(toDomain).filter((x): x is string => !!x))];
    const tidy = (x: string[]) => [...new Set(x.map((i) => i.trim()).filter(Boolean))];
    await ctx.db.patch(id, { data: { ...d.data, criteria: { ...(seeds?.length ? { seeds } : {}), industries: c.industries, sizes: c.sizes, stages: c.stages, titles: tidy(c.titles), keywords: tidy(c.keywords) }, criteriaStatus: "approved", changedAt: Date.now() } });
  },
});
