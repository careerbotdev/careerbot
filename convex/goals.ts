import { ConvexError, type Infer, v } from "convex/values";
import { PATHS } from "./directionPaths";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { checkLimit, CONDITIONS, cleanRule, cleanWhen, invalidFields, type JobFacts, judgeJob, LIMIT_BUCKETS, type LimitBucket, limitLabel, type LimitLike, ROLE_CHECKED, RULE_FIELDS, RULE_SPEC, type RuleField, ruleRows, sameRule } from "./limitBuckets";
import { boolean, listOf, orNull, type ReplySchema, strictObject, string, strings } from "./replyJson";
import { type ItemOf, itemsOf, pickDirection, pickLimit } from "./itemShapes";
import { yearlyUsd } from "./roleDetails";
import { counted, sourceCheck } from "./recordContext";
import { PLAIN_LANGUAGE } from "./writingGuides";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Reads the one goals narrative into directions they're drawn to and hard limits,
// read against their whole record. Everything comes back as proposals they can approve or correct.

const SYSTEM = `You are a great career coach reading what someone wants next, in their own words, against everything their career record shows.

Produce two things:

1. directions: the kinds of work they're drawn to, each under one strong banner title. Each has "name": one short title for one job, the way a job board would label it ("Supply Chain Product", "Solutions Consulting"), never two jobs joined with "and", "/" or a comma; "includes": the closely related paths and titles that roll up under that banner (for example "Product Operations" under Supply Chain Product, "Presales Consulting" and "Value Consulting" under Solutions Consulting); "summary" (one or two sentences: what the work is and why it fits them, grounded in their record); "path", how well their record fits it: "continue" (the work of their current role, including its duties), "adjacent" (a different job that reuses most of their record) or "stretch" (something they want that their record only partly supports); and "quotes" (short verbatim snippets from the goals narrative). Roll titles up under the banner of the job family a hiring company would put them in (product operations and product analytics roles sit with supply chain product; presales and value consulting sit with solutions consulting). Use the more widely used function name as the banner. Different kinds of work get separate banners even when they wrote them together on one line (customer success and implementation are different jobs). So does the same work for a different kind of employer they name, one that hires it under its own titles and vocabulary and that a search would find differently (recruiting on a company's in-house team and recruiting at an agency): each gets its own resume and search. Titles that are only other names for the same job at the same kind of employer still roll up under one banner. Every path they name appears either as a banner or in some banner's "includes". Don't invent directions they didn't ask for.

2. limits: their hard limits and preferences, sorted into fixed buckets that are the same for everyone. Each bucket's "rule" is an object with only these fields and values (the object itself, not wrapped in the bucket name):
${RULE_SPEC}
Seniority levels are sets: "include" lists every level that works, from their lowest acceptable level all the way to the top of the scale unless they name a ceiling (a step up from their current role starts at the level above it in the record); "exclude" lists levels they rule out. "companies.exclude" holds named employers only; kinds of company go in the industry lists or the note. "want" and "avoid" in work hold only activities they named. Places carry the coordinates of the named place; "miles" only if they gave a distance.

Each limit has "kind" (a bucket), "value" (that limit in plain words, to them as "you"), "firm" (true if they said it's a must, false for a preference), "appliesTo" (direction names it holds for, or [] for every direction), "when" (null, or {"industryChange": true} / {"functionChange": true} for a limit that only holds when the job is a change of industry or of kind of work for them, e.g. accepting a lower level to pivot; several conditions mean any of them), "rule", "note" (nuance no rule field can hold, or null) and "quotes".
A field they didn't give is left out, never filled with an assumed or typical value: no ceiling they didn't name, no radius they didn't give. Anything a rule field can hold goes in the rule, not only the note; what no field can hold (company traits, reasons) goes in the note. An exception that only holds in some situations is its own limit with "when", never only a note: a lower level accepted for a pivot is a second seniority limit whose "include" lists the extra lower levels (it loosens the general limit; it does not replace it). One limit per bucket, scope and condition. Leave out anything you'd have to guess.

${PLAIN_LANGUAGE}

Reply with JSON only: {"directions":[...],"limits":[...]}.`;


type Out = {
  directions?: { name: string; includes?: string[]; summary?: string; path?: string; quotes?: string[] }[];
  limits?: { kind?: string; label?: string; value: string; firm?: boolean; quotes?: string[]; rule?: Record<string, unknown>; appliesTo?: string[]; when?: unknown; note?: string | null }[];
};

// A limit rule's field as a reply's schema (structured output, metering.chat): null or empty when the wording doesn't
// give it, as cleanRule reads a field left out. A value from a list stays a plain string: cleanRule keeps only the
// listed ones.
function fieldSchema(f: RuleField) {
  switch (f.type) {
    case "number":
      return orNull("number");
    case "bool":
      return orNull("boolean");
    case "enum":
      return orNull("string");
    case "set":
    case "names":
    case "countries":
      return strings;
    case "places":
      return listOf({ place: string, lat: orNull("number"), lng: orNull("number"), miles: orNull("number") });
  }
}

// The reply's shape, as save reads it. A limit's rule has every bucket's fields, cleanRule keeping those of its own (one
// rule shape per bucket to choose from is more than Claude's structured output takes; "exclude" is a list of strings in
// both buckets that have it). "when" with neither condition is none.
export const GOALS_SCHEMA: ReplySchema = {
  name: "goals",
  schema: strictObject({
    directions: listOf({ name: string, includes: strings, summary: string, path: string, quotes: strings }),
    limits: listOf({
      kind: string,
      value: string,
      firm: boolean,
      appliesTo: strings,
      when: strictObject({ industryChange: boolean, functionChange: boolean }),
      rule: strictObject(Object.fromEntries(Object.values(RULE_FIELDS).flatMap((fields) => fields.map((f) => [f.key, fieldSchema(f)])))),
      note: string,
      quotes: strings,
    }),
  }),
};
// A limit rule step's reply: the rule of the limit's own bucket.
export const limitRuleSchema = (kind: LimitBucket): ReplySchema => ({
  name: "limit_rule",
  schema: strictObject({ rule: strictObject(Object.fromEntries(RULE_FIELDS[kind].map((f) => [f.key, fieldSchema(f)]))) }),
});

export const start = mutation({
  args: { narrativeId: v.id("narratives") },
  handler: async (ctx, { narrativeId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const n = await getInWorkspace(ctx, workspaceId, narrativeId);
    if (!n || n.kind !== "goals") throw new Error("That isn't your goals narrative.");
    if (!n.body.trim()) throw new Error("Write your goals first.");
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "goals", args: { narrativeId, version: n.version }, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces"), narrativeId: v.id("narratives") },
  handler: async (ctx, { workspaceId, narrativeId }) => {
    const narrative = await getInWorkspace(ctx, workspaceId, narrativeId);
    const stands = await sourceCheck(ctx, workspaceId);
    const roles = (await counted(ctx, workspaceId, "role", stands)).map((r) => ({ key: r.roleKey, employer: r.data.employer, title: r.data.title, start: r.data.start, end: r.data.end }));
    const facts = (await counted(ctx, workspaceId, "fact", stands)).map((f) => ({ role: f.roleKey, text: f.data.text }));
    const settled = [...(await itemsOf(ctx, workspaceId, "direction", "approved")), ...(await itemsOf(ctx, workspaceId, "limit", "approved"))].map((i) => ({ kind: i.kind, ...i.data }));
    const rejected = [
      ...(await itemsOf(ctx, workspaceId, "direction", "rejected")).map((i) => ({ kind: i.kind, name: i.data.name, value: i.data.summary, quotes: i.sources.flatMap((x) => x.quotes) })),
      ...(await itemsOf(ctx, workspaceId, "limit", "rejected")).map((i) => ({ kind: i.kind, name: i.data.label, value: i.data.value, quotes: i.sources.flatMap((x) => x.quotes) })),
    ];
    return { narrative, record: { roles, facts }, settled, rejected };
  },
});

export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), runId: v.id("jobs"), narrativeId: v.id("narratives"), version: v.number(), out: v.any() },
  handler: async (ctx, { workspaceId, runId, narrativeId, version, out }) => {
    // A retried run (after an interruption) that already saved its results saves nothing twice.
    if (await ctx.db.query("items").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return { alreadySaved: true } as never;
    // Only a read of the narrative as it is now, by the latest-started read, saves. A read of an older version (the story
    // was edited while it ran) saves nothing, and neither does a run that finishes after a newer one started (queued,
    // running or done; a failed newer run doesn't count), so an older read never replaces newer proposals.
    const none = { directions: 0, limits: 0 };
    const narrative = await getInWorkspace(ctx, workspaceId, narrativeId);
    if (!narrative || narrative.version !== version) return none;
    const run = await ctx.db.get(runId);
    for await (const j of ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc")) {
      if (j._creationTime <= (run?._creationTime ?? 0)) break;
      if (j.kind === "goals" && j.status !== "failed") return none;
    }
    const o = out as Out;
    // A new read replaces earlier unreviewed proposals; what they approved or edited stays.
    for (const kind of ["direction", "limit"] as const) {
      const old = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("status", "proposed")).collect();
      for (const i of old) await ctx.db.patch(i._id, { status: "superseded" });
    }
    // Approved banners (and every title under them) aren't proposed again, nor are rejected ones;
    // genuinely new titles for an approved banner come back as a proposal to add to it.
    const norm = (x: unknown) => String(x ?? "").trim().toLowerCase();
    const owner = new Map<string, ItemOf<"direction">>();
    const rejectedNames = new Set<string>();
    for (const i of await itemsOf(ctx, workspaceId, "direction", "approved")) for (const n of [i.data.name, ...(i.data.includes ?? [])]) owner.set(norm(n), i);
    for (const i of await itemsOf(ctx, workspaceId, "direction", "rejected")) rejectedNames.add(norm(i.data.name));
    const at = Date.now();
    const src = (quotes?: string[]) => [{ narrativeId, version, quotes: (quotes ?? []).filter((q) => typeof q === "string") }];
    for (const d of o.directions ?? []) {
      const data = pickDirection(d ?? {});
      if (!data.name) continue;
      if (rejectedNames.has(norm(data.name))) continue;
      const target = owner.get(norm(data.name));
      if (target) {
        const fresh = [...new Set((data.includes ?? []).filter((n) => !owner.has(norm(n)) && !rejectedNames.has(norm(n))))];
        if (fresh.length)
          await ctx.db.insert("items", { workspaceId, kind: "direction", status: "proposed", data: { name: target.data.name, includes: fresh, addsTo: target._id }, sources: src(d.quotes), runId, at: Date.now() });
        continue;
      }
      await ctx.db.insert("items", { workspaceId, kind: "direction", status: "proposed", data, sources: src(d.quotes), runId, at });
    }
    const limitsIn = (status: "approved" | "rejected") => itemsOf(ctx, workspaceId, "limit", status);
    // A limit's identity is the bucket, scope and condition it was first read with (readKey), so rescoping or rewording it
    // by hand doesn't make a reread think it's new.
    const keyOf = (i: ItemOf<"limit">) => [i.data.readKey, norm(i.data.label)].filter(Boolean) as string[];
    const settledLimits = await limitsIn("approved");
    // Passages behind a rejected limit: a new limit resting only on those is the same idea again, reworded.
    const squash = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const rejectedPassages = (await limitsIn("rejected")).flatMap((i) => i.sources.flatMap((x) => x.quotes)).map(squash).filter((q) => q.length > 12);
    const onlyRejected = (quotes?: string[]) => {
      const qs = (quotes ?? []).map(squash).filter(Boolean);
      return qs.length > 0 && qs.every((q) => rejectedPassages.some((r) => r.includes(q) || q.includes(r)));
    };
    const rejectedKeys = new Set((await limitsIn("rejected")).flatMap(keyOf));
    for (const raw of o.limits ?? []) {
      if (typeof raw?.value !== "string" || !raw.value || !raw.kind || !(raw.kind in LIMIT_BUCKETS)) continue;
      const appliesTo = Array.isArray(raw.appliesTo) ? raw.appliesTo.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
      const when = cleanWhen(raw.when);
      const label = limitLabel(raw.kind, appliesTo, when);
      const readKey = norm(label);
      if (rejectedKeys.has(readKey) || onlyRejected(raw.quotes)) continue;
      // Two limits for the same bucket, scope and condition contradict each other; both stay, marked, for the person to settle.
      const clash = (o.limits ?? []).filter((x) => x?.kind === raw.kind && norm(limitLabel(String(x.kind), (x.appliesTo ?? []).filter(Boolean), cleanWhen(x.when))) === readKey).length > 1;
      const rule = cleanRule(raw.kind, raw.rule);
      // What validation threw away is kept beside the rule, so a bad read can be seen rather than silently lost.
      const ruleAsRead = raw.rule && !sameRule(raw.rule, rule) ? raw.rule : undefined;
      const mine = settledLimits.find((i) => keyOf(i).includes(readKey));
      if (mine) {
        // Approved as read, never touched, with no rule yet: take this read's. Anything they edited stays theirs.
        if (!mine.data.edited && !mine.data.rule && rule) await ctx.db.patch(mine._id, { data: { ...mine.data, rule } });
        continue;
      }
      await ctx.db.insert("items", {
        workspaceId,
        kind: "limit",
        status: "proposed",
        data: pickLimit({ ...raw, kind: raw.kind, appliesTo, when, rule, ruleAsRead, label, readKey, rev: 0, clash: clash || undefined }),
        sources: src(raw.quotes),
        runId,
        at,
      });
    }
    return { directions: o.directions?.length ?? 0, limits: o.limits?.length ?? 0 };
  },
});

export async function runGoals(ctx: ActionCtx, job: Doc<"jobs">) {
  const { narrativeId } = job.args as { narrativeId: Id<"narratives"> };
  const { narrative, record, settled, rejected } = await ctx.runQuery(internal.goals.inputs, { workspaceId: job.workspaceId, narrativeId });
  if (!narrative) throw new Error("Narrative not found.");
  const choice = await modelFor(ctx, job.workspaceId, "extract");
  const reply = await chatJson<Out>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "goals",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: GOALS_SCHEMA,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Their career record:\n${JSON.stringify(record)}\n\nDirections and limits they've already confirmed (keep these; add only what's missing or changed):\n${JSON.stringify(settled)}\n\nWhat they rejected (their decision: don't propose these again in any form or wording, and don't let them shape anything else you write, including notes):\n${JSON.stringify(rejected)}\n\nGoals narrative:\n${narrative.body}`,
      },
    ],
  });
  const out = reply.out;
  const counts = await ctx.runMutation(internal.goals.save, { workspaceId: job.workspaceId, runId: job._id, narrativeId, version: narrative.version, out });
  return { ...counts, costUsd: reply.costUsd, model: reply.model };
}

export const items = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = [];
    for (const kind of ["direction", "limit"] as const)
      for (const status of ["proposed", "approved", "rejected"] as const) rows.push(...(await itemsOf(ctx, workspaceId, kind, status)));
    // Destructured rather than picked so each row keeps its kind tied to its data.
    return rows.sort((a, b) => a._creationTime - b._creationTime).map(({ _id, _creationTime, workspaceId: _w, runId, at, ...row }) => ({ id: _id, ...row }));
  },
});

// Correct a direction; the correction is approved as given.
export const edit = mutation({
  args: { id: v.id("items"), fields: v.object({ name: v.optional(v.string()), summary: v.optional(v.string()), includes: v.optional(v.array(v.string())), path: v.optional(v.string()) }) },
  handler: async (ctx, { id, fields: { path, ...fields } }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await getInWorkspace(ctx, workspaceId, id);
    if (!item || item.kind !== "direction") throw new Error("Not found.");
    const isPath = (p: string): p is keyof typeof PATHS => p in PATHS;
    if (path !== undefined && !isPath(path)) throw new ConvexError("Choose Current, Adjacent or Stretch.");
    // Ranking roles reads the name and summary.
    const changed = (fields.name !== undefined && fields.name !== item.data.name) || (fields.summary !== undefined && fields.summary !== item.data.summary);
    await ctx.db.patch(id, { data: { ...item.data, ...fields, path: path ?? item.data.path, edited: true, ...(changed ? { changedAt: Date.now() } : {}) }, status: "approved" });
  },
});

async function queueLimitRule(ctx: MutationCtx, workspaceId: Id<"workspaces">, itemId: Id<"items">, rev: number) {
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "limitRule", args: { itemId, rev }, status: "queued", origin: "automatic" });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
}

const RULE_SYSTEM = `Turn one job-search limit, written in plain words, into data a search checks. You get its bucket, the fields that bucket allows, and the wording. Use only what the wording states; leave out any field it doesn't give. Reply with JSON only: {"rule":{...}}.`;

export const limitFor = internalQuery({
  args: { workspaceId: v.id("workspaces"), itemId: v.id("items") },
  handler: (ctx, { workspaceId, itemId }) => getInWorkspace(ctx, workspaceId, itemId),
});

export const setRule = internalMutation({
  args: { itemId: v.id("items"), rev: v.number(), rule: v.any() },
  handler: async (ctx, { itemId, rev, rule }) => {
    const item = await ctx.db.get(itemId);
    // Any change since this job was queued (another rewording, or filters set by hand) wins over this answer.
    if (!item || item.kind !== "limit" || (item.data.rev ?? 0) !== rev) return;
    await ctx.db.patch(itemId, { data: { ...item.data, rule: cleanRule(item.data.kind, rule), ruleStale: false } });
    if (ROLE_CHECKED.includes(item.data.kind)) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId: item.workspaceId });
  },
});

export async function runLimitRule(ctx: ActionCtx, job: Doc<"jobs">) {
  const { itemId, rev } = job.args as { itemId: Id<"items">; rev: number };
  const item = await ctx.runQuery(internal.goals.limitFor, { workspaceId: job.workspaceId, itemId });
  if (!item || item.kind !== "limit") throw new Error("Limit not found.");
  const choice = await modelFor(ctx, job.workspaceId, "extract");
  const bucketLine = RULE_SPEC.split("\n").find((line) => line.startsWith(`- ${item.data.kind}:`)) ?? "";
  const reply = await chatJson<{ rule?: unknown }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "limit rule",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: limitRuleSchema(item.data.kind as LimitBucket),
    messages: [
      { role: "system", content: RULE_SYSTEM },
      { role: "user", content: `Bucket and allowed fields:\n${bucketLine}\n\nWording:\n${item.data.value}` },
    ],
  });
  const out = reply.out;
  await ctx.runMutation(internal.goals.setRule, { itemId, rev, rule: out.rule ?? null });
  return { costUsd: reply.costUsd, model: reply.model };
}

// A limit's scope (direction names, trimmed, once each) and condition, as typed; an unknown condition is refused.
function scopeOf(appliesTo: string[], when: string[]) {
  if (when.some((c) => !(CONDITIONS as readonly string[]).includes(c))) throw new ConvexError("Unknown condition.");
  return { appliesTo: [...new Set(appliesTo.map((a) => a.trim()).filter(Boolean))], when: cleanWhen(Object.fromEntries(when.map((c) => [c, true]))) };
}

// One of their limits, else Not found.
async function limitOf(ctx: QueryCtx, id: Id<"items">) {
  const { workspaceId } = await requireWorkspace(ctx);
  const item = await getInWorkspace(ctx, workspaceId, id);
  if (item?.kind !== "limit") throw new Error("Not found.");
  return { workspaceId, item };
}

// A limit they add themselves, approved as given: its wording, whose search rule is then read from it, or its fields
// (the Goals page gives eligibility this way), worded from them; for some directions only, or under a condition.
export const addLimit = mutation({
  args: { kind: v.string(), value: v.string(), firm: v.boolean(), rule: v.optional(v.any()), appliesTo: v.optional(v.array(v.string())), when: v.optional(v.array(v.string())) },
  handler: async (ctx, { kind, value, firm, rule, appliesTo, when }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!(kind in LIMIT_BUCKETS)) throw new Error("Choose a kind of limit.");
    const bad = invalidFields(kind, rule);
    if (bad.length) throw new ConvexError(`Check ${bad.join(", ")}.`);
    const scope = scopeOf(appliesTo ?? [], when ?? []);
    const given = rule === undefined ? null : cleanRule(kind, rule);
    const wording = value.trim() || (given ? ruleRows(kind, given).map((r) => `${r.label}: ${r.value}`).join(". ") : "");
    if (!wording) throw new ConvexError(rule === undefined ? "Give a value." : "Set at least one field.");
    const data = { kind, label: limitLabel(kind, scope.appliesTo, scope.when), value: wording, firm, ...scope, edited: true, rev: 1 };
    const id = await ctx.db.insert("items", { workspaceId, kind: "limit", status: "approved", data: given ? { ...data, rule: given, ruleStale: false } : { ...data, ruleStale: true }, sources: [], at: Date.now() });
    if (!given) await queueLimitRule(ctx, workspaceId, id, 1);
    else if (ROLE_CHECKED.includes(kind)) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
    return id;
  },
});

// Merge one direction into another: the other keeps its title and gains this one's title and what it includes.
export const merge = mutation({
  args: { id: v.id("items"), into: v.id("items") },
  handler: async (ctx, { id, into }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const from = await getInWorkspace(ctx, workspaceId, id);
    const to = await getInWorkspace(ctx, workspaceId, into);
    if (!from || !to || from.kind !== "direction" || to.kind !== "direction" || id === into) throw new Error("Not found.");
    const includes = [...new Set([...(to.data.includes ?? []), from.data.name, ...(from.data.includes ?? [])].filter((n) => n && n !== to.data.name))];
    await ctx.db.patch(into, { data: { ...to.data, includes, edited: true }, status: "approved", sources: [...to.sources, ...from.sources] });
    const undoMerge = { into, status: from.status, includes: to.data.includes, edited: to.data.edited, intoStatus: to.status, intoSources: to.sources.length };
    await ctx.db.patch(id, { status: "superseded", data: { ...from.data, mergedInto: to.data.name, undoMerge } });
  },
});

// Undo a merge, from the direction merged away: it's back as it was, and the one it went into loses what it gained.
export const unmerge = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const from = await getInWorkspace(ctx, workspaceId, id);
    if (from?.kind !== "direction" || from.status !== "superseded" || !from.data.undoMerge) throw new Error("Not found.");
    const u = from.data.undoMerge;
    const data = { ...from.data, undoMerge: undefined, mergedInto: undefined };
    const to = await getInWorkspace(ctx, workspaceId, u.into);
    if (to?.kind === "direction") await ctx.db.patch(to._id, { status: u.intoStatus, sources: to.sources.slice(0, u.intoSources), data: { ...to.data, includes: u.includes, edited: u.edited } });
    await ctx.db.patch(id, { status: u.status, data });
  },
});

// Change a limit: wording, how firm, filters, scope and condition in one save, approved as given.
// Filters typed by hand must be valid as given (nothing silently dropped). If only the wording changed, the filters stay
// as they were and the limit says so (sentenceChanged) until they update the rule from the new wording or keep it.
export const updateLimit = mutation({
  args: { id: v.id("items"), value: v.string(), firm: v.boolean(), rule: v.any(), appliesTo: v.array(v.string()), when: v.array(v.string()) },
  handler: async (ctx, { id, value, firm, rule, appliesTo, when }) => {
    const { workspaceId, item } = await limitOf(ctx, id);
    if (!value.trim()) throw new Error("Say what the limit is.");
    const bad = invalidFields(item.data.kind, rule);
    if (bad.length) throw new ConvexError(`Check ${bad.join(", ")}.`);
    const scope = scopeOf(appliesTo, when);
    const clean = cleanRule(item.data.kind, rule);
    // Filters changed by hand are set after the wording; unchanged filters still follow the wording they were read from.
    const sentenceChanged = sameRule(clean, item.data.rule) && (value.trim() !== item.data.value || item.data.sentenceChanged);
    await ctx.db.patch(id, {
      status: "approved",
      data: {
        ...item.data,
        value: value.trim(),
        firm,
        rule: clean,
        ruleAsRead: undefined,
        ruleStale: false,
        sentenceChanged: sentenceChanged || undefined,
        ...scope,
        label: limitLabel(item.data.kind, scope.appliesTo, scope.when),
        // Kept from the first read, so rereads still recognise it.
        readKey: item.data.readKey ?? String(item.data.label ?? "").trim().toLowerCase(),
        rev: (item.data.rev ?? 0) + 1,
        edited: true,
      },
    });
    if (ROLE_CHECKED.includes(item.data.kind)) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
  },
});

// Switch a limit off (kept and shown, but nothing filters, ranks or judges by it) or back on.
export const setLimitOn = mutation({
  args: { id: v.id("items"), on: v.boolean() },
  handler: async (ctx, { id, on }) => {
    const { workspaceId, item } = await limitOf(ctx, id);
    if (!item.data.off === on) return;
    await ctx.db.patch(id, { data: { ...item.data, off: on ? undefined : true } });
    if (ROLE_CHECKED.includes(item.data.kind)) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
  },
});

// Read a reworded limit's rule again from its wording. A newer answer or edit wins over this one (setRule checks rev).
export const updateRule = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId, item } = await limitOf(ctx, id);
    const rev = (item.data.rev ?? 0) + 1;
    await ctx.db.patch(id, { data: { ...item.data, sentenceChanged: undefined, ruleStale: true, rev } });
    await queueLimitRule(ctx, workspaceId, id, rev);
  },
});

// Keep a reworded limit's rule as it is.
export const keepRule = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { item } = await limitOf(ctx, id);
    await ctx.db.patch(id, { data: { ...item.data, sentenceChanged: undefined } });
  },
});

// Delete a limit they added themselves, with its notes. One read from their goals is rejected instead, so a reread
// doesn't propose it again.
export const removeLimit = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId, item } = await limitOf(ctx, id);
    if (item.sources.length) throw new ConvexError("Only a limit you added yourself can be deleted.");
    const notes = await ctx.db.query("notes").withIndex("by_subject", (q) => q.eq("workspaceId", workspaceId).eq("subject.kind", "item").eq("subject.id", id)).collect();
    for (const n of notes) await ctx.db.delete(n._id);
    await ctx.db.delete(id);
    if (ROLE_CHECKED.includes(item.data.kind)) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
  },
});

// The latest read of their goals narrative.
export const lastRead = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
    const job = jobs.find((j) => j.kind === "goals");
    if (!job) return null;
    return { status: job.status, version: job.args.version as number, at: job._creationTime, error: job.error ?? null, result: (job.result ?? null) as unknown };
  },
});

// ---- What limits do to the listed roles ----

// A limit being edited or added, judged in place of the saved one it edits (id) or beside the rest.
const draftArg = v.object({ id: v.optional(v.id("items")), kind: v.string(), firm: v.boolean(), rule: v.any(), appliesTo: v.array(v.string()), when: v.array(v.string()) });
type Judged = LimitLike & { id?: Id<"items">; off?: boolean };

// Listed roles read, newest first; more are counted over the newest this many.
const EFFECTS_CAP = 2000;

// Which of the limits a role fails, off ones as if on, and whether a firm limit that's on hides it.
function judge(limits: Judged[], job: JobFacts) {
  const on = limits.filter((l) => !l.off);
  const { results } = judgeJob(on, job);
  const failed = new Set(results.filter((r) => r.verdict === "fail").map((r) => r.limit));
  for (const l of limits) if (l.off && judgeJob([...on, l], job).results.some((r) => r.limit === l && r.verdict === "fail")) failed.add(l);
  return { failed, hidden: results.some((r) => r.verdict === "fail" && r.limit.firm !== false) };
}

// The listed roles (their all-directions rows, judged or set apart), each judged by what it states against their saved
// approved limits, and against them with the draft when there is one.
async function judgeListed(ctx: QueryCtx, workspaceId: Id<"workspaces">, draft?: Infer<typeof draftArg>) {
  const saved: (Judged & { id: Id<"items"> })[] = (await itemsOf(ctx, workspaceId, "limit", "approved")).map((l) => ({
    id: l._id, kind: l.data.kind, firm: l.data.firm, appliesTo: l.data.appliesTo, when: l.data.when, rule: l.data.rule, off: l.data.off,
  }));
  const mine: Judged | null = draft ? { ...draft, ...scopeOf(draft.appliesTo, draft.when), rule: cleanRule(draft.kind, draft.rule), off: saved.find((l) => l.id === draft.id)?.off } : null;
  const withDraft = mine && [...saved.filter((l) => !mine.id || l.id !== mine.id), mine];
  const names = new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.name]));
  const newest = (state: "judged" | "against") =>
    ctx.db.query("roleRanks").withIndex("by_newest", (q) => q.eq("workspaceId", workspaceId).eq("directionId", undefined).eq("state", state)).order("desc").take(EFFECTS_CAP + 1);
  const rows = [...(await newest("judged")), ...(await newest("against"))].sort((a, b) => b.newest - a.newest);
  const employers = new Map<string, string | undefined>();
  const roles = [];
  for (const row of rows.slice(0, EFFECTS_CAP)) {
    if (!employers.has(row.companyId)) employers.set(row.companyId, (await ctx.db.get(row.companyId))?.name);
    const employer = employers.get(row.companyId);
    const job: JobFacts = {
      employer, level: row.seniority, modes: row.setup && [row.setup], travelPercent: row.travel, clearanceRequired: row.clearance, sponsors: row.visa,
      country: row.countries?.[0], direction: row.best && names.get(row.best), pay: row.payMin === undefined ? undefined : { min: row.payMin, currency: "USD", period: "year" },
    };
    // payMin is only the low end: under a floor, the top of its range (the board's pay first) may still reach it.
    if (job.pay && [...saved, ...(mine ? [mine] : [])].some((l) => l.kind === "pay" && checkLimit(l, job) === "fail")) {
      const p = await ctx.db.get(row.postingId);
      const pay = p?.boardDetails?.pay ?? p?.details?.pay;
      if (pay?.max !== undefined) job.pay.max = yearlyUsd({ max: pay.max, currency: pay.currency, period: pay.period });
    }
    roles.push({ row, employer, base: judge(saved, job), draft: withDraft && judge(withDraft, job) });
  }
  return { roles, capped: rows.length > EFFECTS_CAP, saved, mine };
}

// What their limits do to the listed roles: how many each fails (off ones: what it would do when on), how many a firm
// limit that's on hides, and the same with a draft limit in place.
export const effects = query({
  args: { draft: v.optional(draftArg) },
  handler: async (ctx, { draft }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { roles, capped, saved, mine } = await judgeListed(ctx, workspaceId, draft);
    return {
      total: roles.length,
      hidden: roles.filter((r) => r.base.hidden).length,
      limits: saved.map((l) => ({ id: l.id, fails: roles.filter((r) => r.base.failed.has(l)).length })),
      draft: mine && { fails: roles.filter((r) => r.draft?.failed.has(mine)).length, hidden: roles.filter((r) => r.draft?.hidden).length },
      capped,
    };
  },
});

// The listed roles a limit fails (the first 50), with the draft in place when there is one.
export const hiddenBy = query({
  args: { id: v.id("items"), draft: v.optional(draftArg) },
  handler: async (ctx, { id, draft }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { roles, saved, mine } = await judgeListed(ctx, workspaceId, draft);
    const limit = mine?.id === id ? mine : saved.find((l) => l.id === id);
    if (!limit) throw new Error("Not found.");
    const failing = roles.filter((r) => (r.draft ?? r.base).failed.has(limit)).slice(0, 50);
    return Promise.all(
      failing.map(async ({ row, employer }) => ({ postingId: row.postingId, directionId: row.best ?? null, title: (await ctx.db.get(row.postingId))?.title ?? "", company: employer ?? "" })),
    );
  },
});
