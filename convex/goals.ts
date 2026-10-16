import { ConvexError, type Infer, v } from "convex/values";
import { PATHS } from "./directionPaths";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { checkLimit, clashKey, clashOf, CONDITIONS, cleanRule, cleanWhen, invalidFields, type JobFacts, judgeJob, LIMIT_BUCKETS, type LimitBucket, limitLabel, type LimitLike, ROLE_CHECKED, RULE_FIELDS, RULE_SPEC, type RuleField, ruleRows, sameRule } from "./limitBuckets";
import { boolean, listOf, orNull, type ReplySchema, strictObject, string, strings } from "./replyJson";
import { type ItemOf, type ItemStatus, itemsOf, pickDirection, pickLimit, STATUSES } from "./itemShapes";
import { yearlyUsd } from "./roleDetails";
import { counted, sourceCheck } from "./recordContext";
import { fillWhenApproved, refuseWhileMerging } from "./directionFill";
import { PLAIN_LANGUAGE } from "./writingGuides";
import { refuseCancelled } from "./cancel";
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
    await refuseCancelled(ctx, runId);
    // A retried run (after an interruption) that already saved its results saves nothing twice.
    if (await ctx.db.query("items").withIndex("by_run", (q) => q.eq("runId", runId)).first()) return { alreadySaved: true } as never;
    // Only a read of the narrative as it is now, by the latest-started read, saves. A read of an older version (the story
    // was edited while it ran) saves nothing, and neither does a run that finishes after a newer one started (queued,
    // running or done; a failed or cancelled newer run doesn't count), so an older read never replaces newer proposals.
    const none = { directions: 0, limits: 0 };
    const narrative = await getInWorkspace(ctx, workspaceId, narrativeId);
    if (!narrative || narrative.version !== version) return none;
    const run = await ctx.db.get(runId);
    for await (const j of ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc")) {
      if (j._creationTime <= (run?._creationTime ?? 0)) break;
      if (j.kind === "goals" && j.status !== "failed" && j.status !== "cancelled") return none;
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
        data: pickLimit({ ...raw, kind: raw.kind, appliesTo, when, rule, ruleAsRead, label, readKey, rev: 0 }),
        sources: src(raw.quotes),
        runId,
        at,
      });
    }
    await syncClashes(ctx, workspaceId);
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
    if (item.status !== "approved") await fillWhenApproved(ctx, item);
  },
});

async function queueLimitRule(ctx: MutationCtx, workspaceId: Id<"workspaces">, itemId: Id<"items">, rev: number) {
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "limitRule", args: { itemId, rev }, status: "queued", origin: "automatic" });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
}

// Which other limit each limit clashes with (limitBuckets.clashOf), for the whole workspace, after any change to a
// limit: read from goals, added, edited, its rule read, approved, rejected, switched on or off, deleted, kept beside
// another. Only proposed and approved limits that are on clash, so the mark goes as soon as either one is edited apart,
// rejected, switched off or deleted; a pair they kept both of doesn't, until either one changes. An approved partner is
// named before a proposed one. Statuses given (the migration) are cleared too.
export async function syncClashes(ctx: MutationCtx, workspaceId: Id<"workspaces">, statuses: readonly ItemStatus[] = ["proposed", "approved", "rejected"]) {
  const rows = (await Promise.all(statuses.map((s) => itemsOf(ctx, workspaceId, "limit", s)))).flat();
  const live = rows.filter((l) => (l.status === "approved" || l.status === "proposed") && !l.data.off).sort((a, b) => (a.status === b.status ? 0 : a.status === "approved" ? -1 : 1));
  const kept = (a: ItemOf<"limit">, b: ItemOf<"limit">) => !!a.data.keptWith?.some((k) => k.id === b._id && k.key === clashKey(a.data, b.data));
  let changed = 0;
  for (const l of rows) {
    const other = live.includes(l) ? live.find((o) => o._id !== l._id && !kept(l, o) && !kept(o, l) && clashOf(l.data, o.data))?._id : undefined;
    if (l.data.clashWith === other && l.data.clash === undefined) continue;
    await ctx.db.patch(l._id, { data: { ...l.data, clashWith: other, clash: undefined } });
    changed++;
  }
  return changed;
}

// Operator, once after the release that brought clashWith: every workspace's limits, in every status, get clashWith
// worked out by the rule above and lose the old clash flag. Running it again changes nothing.
export const recomputeClashes = internalMutation({
  args: {},
  handler: async (ctx) => {
    let changed = 0;
    for (const w of await ctx.db.query("workspaces").collect()) changed += await syncClashes(ctx, w._id, STATUSES);
    return { changed };
  },
});

// Keep both: a limit and the one it clashes with stay as they are, and stop showing as clashing until either changes.
// Undo (kept: false) shows them as clashing again.
export const keepBoth = mutation({
  args: { id: v.id("items"), with: v.id("items"), kept: v.boolean() },
  handler: async (ctx, { id, with: otherId, kept }) => {
    const { workspaceId, item } = await limitOf(ctx, id);
    const other = await getInWorkspace(ctx, workspaceId, otherId);
    if (other?.kind !== "limit" || otherId === id) throw new Error("Not found.");
    const pair = [
      [item, other],
      [other, item],
    ] as const;
    for (const [a, b] of pair) {
      const rest = (a.data.keptWith ?? []).filter((k) => k.id !== b._id);
      const keptWith = kept ? [...rest, { id: b._id, key: clashKey(a.data, b.data) }] : rest;
      await ctx.db.patch(a._id, { data: { ...a.data, keptWith: keptWith.length ? keptWith : undefined } });
    }
    await syncClashes(ctx, workspaceId);
  },
});

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
    await syncClashes(ctx, item.workspaceId);
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
    await syncClashes(ctx, workspaceId);
    if (!given) await queueLimitRule(ctx, workspaceId, id, 1);
    else if (ROLE_CHECKED.includes(kind)) await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
    return id;
  },
});

// ---- Merging directions ----

type Level = "strong" | "some" | "weak" | "none";
const LEVEL_RANK: Record<Level, number> = { strong: 3, some: 2, weak: 1, none: 0 };
const fitsWell = (level: Level | undefined) => level === "strong" || level === "some";
// The better of two verdicts: the higher level, then the higher score.
function better<T extends { level: Level; score?: number }>(a: T, b: T) {
  const by = LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || (b.score ?? -1) - (a.score ?? -1);
  return by > 0 ? b : a;
}
// Both lists in order, each entry once (ignoring case).
function union(a: string[] = [], b: string[] = []) {
  const seen = new Set<string>();
  return [...a, ...b].filter((s) => {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// What a mergeMoves row keeps of each record as it was before the merge: a company's fits and finds, a role's fits, sort
// and asks to rank again, whole (null: it had none), so Undo can put them back as they were.
// was: as it was; now: what the merge made of it, so Undo can tell what changed since.
type CompanyLists = { fit: NonNullable<Doc<"companies">["fit"]> | null; found: Doc<"companies">["found"] };
type PostingLists = { fit: NonNullable<Doc<"postings">["fit"]> | null; directionIds: Id<"items">[] | null; against: NonNullable<Doc<"postings">["sort"]>["against"] | null; rerank: Id<"items">[] | null };
type CompanyBefore = { was: CompanyLists; now: CompanyLists };
type PostingBefore = { was: PostingLists; now: PostingLists };
type PursuitBefore = { directionId: Id<"items">; direction?: string };
type LimitBefore = { appliesTo?: string[]; label: string };
type LengthBefore = NonNullable<Doc<"resumeSettings">["lengths"]>[number];
type Move = { table: Doc<"mergeMoves">["table"]; docId: string; before: CompanyBefore | PostingBefore | PursuitBefore | LimitBefore | LengthBefore | null };

// A list put back as it was before the merge (was), from what the merge made of it (now) and what it is now (current):
// exactly as it was when nothing has changed since; else what changed since stays, and only what the merge did is
// undone: entries it added go, and entries it took away come back, unless one with the same key (a direction) was
// written since. null: the list wasn't there.
function undoList<T>(current: T[] | undefined, was: T[] | null, now: T[] | null, key: (x: T) => string | null): T[] | undefined {
  // Compared by content: the same fields in any order are the same entry.
  const j = (x: unknown) => JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
  if (j(current ?? null) === j(now)) return was ?? undefined;
  const before = new Set((was ?? []).map(j));
  const after = new Set((now ?? []).map(j));
  const added = new Set((now ?? []).filter((x) => !before.has(j(x))).map(j));
  const kept = (current ?? []).filter((x) => !added.has(j(x)));
  const keys = new Set(kept.map(key));
  const back = (was ?? []).filter((x) => {
    const k = key(x);
    return !after.has(j(x)) && (k === null || !keys.has(k));
  });
  const out = [...kept, ...back];
  return out.length || was ? out : undefined;
}

// The direction's titles: its name, what it covers, its titles to aim at and the titles search looks for.
const titlesOf = (d: ItemOf<"direction">["data"]) => union([d.name, ...(d.includes ?? []), ...(d.detail?.targetTitles ?? []), ...(d.criteria?.titles ?? [])]);

// A merge or its Undo, as its job's args: the direction merged away (id) and the kept one (into), with their names.
type MergeArgs = { id: Id<"items">; into: Id<"items">; from: string; to: string };
// The records a merge goes through, in this order, a page at a time, each page a write of its own (mergePage).
const MERGE_PHASES = ["companies", "postings", "pursuits", "resumes", "notes", "limits", "settings"] as const;
const MERGE_PAGE = 100;
// Records counted per read, for a merge's or Undo's "N of M".
const COUNT_PAGE = 200;

// Merge one direction into another. At once: the other keeps its name and positioning and gains this one's name and
// what it covers, its titles to aim at and words to use, and its criteria (seed companies too), each once; it's marked
// as changed now, so its roles show as ranked before the merge until they rank again; this one is merged away, and Undo
// is ready. Then a merge job (runMerge) goes through the records a page at a time: each company and role keeps the better
// of its two verdicts for the kept one, and finds and the sort move to it; pursuits, tailored resumes and notes move to
// it; limits scoped to this one are scoped to it; its resume length is dropped. This one's own resume stays with it.
// Everything moved is kept in mergeMoves for Undo (unmerge). No AI call.
export const merge = mutation({
  args: { id: v.id("items"), into: v.id("items") },
  handler: async (ctx, { id, into }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const from = await getInWorkspace(ctx, workspaceId, id);
    const to = await getInWorkspace(ctx, workspaceId, into);
    if (!from || !to || from.kind !== "direction" || to.kind !== "direction" || id === into) throw new Error("Not found.");
    await refuseWhileMerging(ctx, workspaceId, [id, into]);
    if (await ctx.db.query("mergeMoves").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", id)).first())
      throw new ConvexError(`Undoing the last merge of ${from.data.name} is still under way. Try again when it’s done.`);
    const at = Date.now();
    const includes = [...new Set([...(to.data.includes ?? []), from.data.name, ...(from.data.includes ?? [])].filter((n) => n && n !== to.data.name))];
    const fd = from.data.detail;
    const detail = to.data.detail && fd ? { ...to.data.detail, targetTitles: union(to.data.detail.targetTitles, fd.targetTitles), vocabulary: union(to.data.detail.vocabulary, fd.vocabulary) } : to.data.detail;
    const tc = to.data.criteria;
    const fc = from.data.criteria;
    const seeds = union(tc?.seeds, fc?.seeds);
    const criteria =
      tc && fc
        ? { ...(seeds.length ? { seeds } : {}), industries: union(tc.industries, fc.industries), sizes: union(tc.sizes, fc.sizes), stages: union(tc.stages, fc.stages), titles: union(tc.titles, fc.titles), keywords: union(tc.keywords, fc.keywords) }
        : (tc ?? fc);
    const criteriaStatus = tc ? to.data.criteriaStatus : from.data.criteriaStatus;
    await ctx.db.patch(into, {
      data: { ...to.data, includes, detail, criteria, criteriaStatus, changedAt: at, mergedAt: at, edited: true },
      status: "approved",
      sources: [...to.sources, ...from.sources],
    });
    const args: MergeArgs = { id, into, from: from.data.name, to: to.data.name };
    const job = await ctx.db.insert("jobs", { workspaceId, kind: "merge", args, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: job });
    const undoMerge = {
      into,
      status: from.status,
      includes: to.data.includes,
      edited: to.data.edited,
      intoStatus: to.status,
      intoSources: to.sources.length,
      targetTitles: to.data.detail?.targetTitles,
      vocabulary: to.data.detail?.vocabulary,
      criteria: tc,
      criteriaStatus: to.data.criteriaStatus,
      changedAt: to.data.changedAt,
      mergedAt: to.data.mergedAt,
      job,
    };
    await ctx.db.patch(id, { status: "superseded", data: { ...from.data, mergedInto: to.data.name, undoMerge } });
    if (to.status !== "approved") await fillWhenApproved(ctx, to);
  },
});

// Undo a merge, from the direction merged away. At once: it's back as it was, and the one it went into has its own
// titles, criteria and change times back; a merge job still under way stops. Then an Undo job (runMerge) puts back
// every record the merge moved or changed, exactly, a page at a time.
export const unmerge = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const from = await getInWorkspace(ctx, workspaceId, id);
    if (from?.kind !== "direction" || from.status !== "superseded" || !from.data.undoMerge) throw new Error("Not found.");
    const u = from.data.undoMerge;
    const into = u.into;
    const running = u.job && (await ctx.db.get(u.job));
    if (running && (running.status === "queued" || running.status === "running" || running.status === "paused"))
      await ctx.db.patch(running._id, { status: "cancelled", pausedFor: undefined, error: undefined, tallied: true });
    const to = await getInWorkspace(ctx, workspaceId, into);
    if (to?.kind === "direction") {
      const detail = to.data.detail && u.targetTitles && u.vocabulary ? { ...to.data.detail, targetTitles: u.targetTitles, vocabulary: u.vocabulary } : to.data.detail;
      await ctx.db.patch(to._id, {
        status: u.intoStatus,
        sources: to.sources.slice(0, u.intoSources),
        data: { ...to.data, includes: u.includes, edited: u.edited, detail, criteria: u.criteria, criteriaStatus: u.criteriaStatus, changedAt: u.changedAt, mergedAt: u.mergedAt },
      });
    }
    await ctx.db.patch(id, { status: u.status, data: { ...from.data, undoMerge: undefined, mergedInto: undefined } });
    if (await ctx.db.query("mergeMoves").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", id)).first()) {
      const args: MergeArgs = { id, into, from: from.data.name, to: to?.kind === "direction" ? to.data.name : (from.data.mergedInto ?? "") };
      const job = await ctx.db.insert("jobs", { workspaceId, kind: "unmerge", args, status: "queued", origin: "you" });
      await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: job });
    } else await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId });
  },
});

// A merge job, or an Undo job: counts what it goes through (for Activity's "N of M"), then works through it a page at a
// time, each page its own write; a page done is checkpointed with it, so a run cut off and started again goes on from
// the next page, and a job cancelled (Undo while it runs) stops at its next page. Then the roles' rows are rebuilt.
export async function runMerge(ctx: ActionCtx, job: Doc<"jobs">) {
  const a = job.args as MergeArgs;
  const count = async (table: "companies" | "postings" | "mergeMoves") => {
    let n = 0;
    for (let cursor: string | null = null; ; ) {
      const page: { n: number; cursor: string; isDone: boolean } = await ctx.runQuery(internal.goals.mergeCount, { workspaceId: job.workspaceId, table, directionId: a.id, cursor });
      n += page.n;
      if (page.isDone) return n;
      cursor = page.cursor;
    }
  };
  let progress: { checked: number; total: number; swept?: number } = { checked: (job.result?.checked as number | undefined) ?? 0, total: 0 };
  if (job.kind === "merge") {
    const total = (await count("companies")) + (await count("postings"));
    // Every kind once, then once more (the sweep): whatever was written naming the merged direction after its page was
    // done (work that started before the merge) is moved too, so nothing is left naming it.
    for (const sweep of [false, true])
      for (const phase of MERGE_PHASES) {
        const saved = (job.done ?? []).find((d) => d.step === (sweep ? `sweep:${phase}` : phase))?.result as { cursor: string | null; isDone: boolean } | undefined;
        let at = { cursor: saved?.cursor ?? null, isDone: saved?.isDone ?? false };
        while (!at.isDone) {
          const page: { cursor: string | null; isDone: boolean; checked: number; total: number; swept: number } = await ctx.runMutation(internal.goals.mergePage, { jobId: job._id, phase, cursor: at.cursor, total, sweep });
          at = page;
          progress = page;
        }
      }
  } else {
    // Rows put back are deleted, so what's left plus what's done is the whole.
    const total = progress.checked + (await count("mergeMoves"));
    for (let more = true; more; ) {
      const page: { more: boolean; checked: number; total: number } = await ctx.runMutation(internal.goals.unmergePage, { jobId: job._id, total });
      more = page.more;
      progress = page;
    }
  }
  await ctx.runMutation(internal.roles.refreshRanks, { workspaceId: job.workspaceId });
  return progress;
}

// One page of records to count for a merge or its Undo.
export const mergeCount = internalQuery({
  args: { workspaceId: v.id("workspaces"), table: v.union(v.literal("companies"), v.literal("postings"), v.literal("mergeMoves")), directionId: v.id("items"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { workspaceId, table, directionId, cursor }) => {
    const opts = { cursor, numItems: COUNT_PAGE };
    const page =
      table === "mergeMoves"
        ? await ctx.db.query("mergeMoves").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId)).paginate(opts)
        : table === "companies"
          ? await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts)
          : await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
    return { n: page.page.length, cursor: page.continueCursor, isDone: page.isDone };
  },
});

// One page of a merge: the records of one kind it reaches, moved or changed for the kept direction, each with a
// mergeMoves row of what it was; the job's progress (companies and roles checked of all of them) and where it got to
// (its checkpoint for this kind) are saved with it. Nothing for a cancelled job.
export const mergePage = internalMutation({
  args: { jobId: v.id("jobs"), phase: v.union(...MERGE_PHASES.map((p) => v.literal(p))), cursor: v.union(v.string(), v.null()), total: v.number(), sweep: v.optional(v.boolean()) },
  handler: async (ctx, { jobId, phase, cursor, total, sweep }) => {
    await refuseCancelled(ctx, jobId);
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Not found.");
    const { workspaceId } = job;
    const { id, into, from, to } = job.args as MergeArgs;
    const opts = { cursor, numItems: MERGE_PAGE };
    const moves: Move[] = [];
    let next: { cursor: string | null; isDone: boolean } = { cursor: null, isDone: true };
    let checked = 0;

    if (phase === "companies") {
      // The better fit for the kept one, and finds for this one counted for it; nothing left naming this one.
      const page = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const c of page.page) {
        const mine = c.fit?.find((f) => f.directionId === id);
        const theirs = c.fit?.find((f) => f.directionId === into);
        if (!mine && !c.found.some((f) => f.directionId === id)) continue;
        const kept = mine ? (theirs ? better(theirs, { ...mine, directionId: into }) : { ...mine, directionId: into }) : theirs;
        const now: CompanyLists = {
          fit: c.fit ? [...c.fit.filter((f) => f.directionId !== id && f.directionId !== into), ...(kept ? [kept] : [])] : null,
          found: c.found.map((f) => (f.directionId === id ? { ...f, directionId: into } : f)),
        };
        await ctx.db.patch(c._id, { fit: now.fit ?? undefined, found: now.found });
        moves.push({ table: "companies", docId: c._id, before: { was: { fit: c.fit ?? null, found: c.found }, now } satisfies CompanyBefore });
      }
      next = { cursor: page.continueCursor, isDone: page.isDone };
      checked = page.page.length;
    } else if (phase === "postings") {
      // The better verdict for the kept one, and the sort and asks to rank again carried over to it; nothing left naming
      // this one.
      const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      const swap = (ids: Id<"items">[]) => [...new Set(ids.map((d) => (d === id ? into : d)))];
      for (const p of page.page) {
        const mine = p.fit?.find((f) => f.directionId === id);
        const theirs = p.fit?.find((f) => f.directionId === into);
        const sortedAs = p.sort?.against.find((a) => a.directionId === id);
        if (!mine && !sortedAs && !p.sort?.directionIds.includes(id) && !p.rerank?.includes(id)) continue;
        const kept = mine ? (theirs ? better(theirs, { ...mine, directionId: into }) : { ...mine, directionId: into }) : theirs;
        const theirSort = p.sort?.against.find((a) => a.directionId === into) ?? (sortedAs && { ...sortedAs, directionId: into });
        const now: PostingLists = {
          fit: p.fit ? [...p.fit.filter((f) => f.directionId !== id && f.directionId !== into), ...(kept ? [kept] : [])] : null,
          directionIds: p.sort ? swap(p.sort.directionIds) : null,
          against: p.sort ? [...p.sort.against.filter((a) => a.directionId !== id && a.directionId !== into), ...(theirSort ? [theirSort] : [])] : null,
          rerank: p.rerank ? swap(p.rerank) : null,
        };
        await ctx.db.patch(p._id, {
          fit: now.fit ?? undefined,
          sort: p.sort && { ...p.sort, directionIds: now.directionIds!, against: now.against! },
          rerank: now.rerank ?? undefined,
        });
        const was: PostingLists = { fit: p.fit ?? null, directionIds: p.sort?.directionIds ?? null, against: p.sort?.against ?? null, rerank: p.rerank ?? null };
        moves.push({ table: "postings", docId: p._id, before: { was, now } satisfies PostingBefore });
      }
      next = { cursor: page.continueCursor, isDone: page.isDone };
      checked = page.page.length;
    } else if (phase === "pursuits") {
      // Pursuits keep the score and level they were scored with.
      const page = await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(opts);
      for (const p of page.page) {
        if (p.directionId !== id) continue;
        await ctx.db.patch(p._id, { directionId: into, direction: to });
        moves.push({ table: "pursuits", docId: p._id, before: { directionId: id, direction: p.direction } satisfies PursuitBefore });
      }
      next = { cursor: page.continueCursor, isDone: page.isDone };
    } else if (phase === "resumes") {
      // Tailored resumes move; its own resume's versions stay with it.
      const page = await ctx.db.query("resumes").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", id)).paginate(opts);
      for (const r of page.page) {
        if (r.posting === undefined && r.postingId === undefined) continue;
        await ctx.db.patch(r._id, { directionId: into });
        moves.push({ table: "resumes", docId: r._id, before: null });
      }
      next = { cursor: page.continueCursor, isDone: page.isDone };
    } else if (phase === "notes") {
      const page = await ctx.db.query("notes").withIndex("by_subject", (q) => q.eq("workspaceId", workspaceId).eq("subject.kind", "item").eq("subject.id", id)).paginate(opts);
      for (const n of page.page) {
        await ctx.db.patch(n._id, { subject: { kind: "item", id: into } });
        moves.push({ table: "notes", docId: n._id, before: null });
      }
      next = { cursor: page.continueCursor, isDone: page.isDone };
    } else if (phase === "limits") {
      // Limits scoped to it hold for the kept one.
      const page = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "limit")).paginate(opts);
      for (const l of page.page) {
        if (l.kind !== "limit" || !l.data.appliesTo?.includes(from)) continue;
        const appliesTo = [...new Set(l.data.appliesTo.map((x) => (x === from ? to : x)))];
        await ctx.db.patch(l._id, { data: { ...l.data, appliesTo, label: limitLabel(l.data.kind, appliesTo, l.data.when ?? null) } });
        moves.push({ table: "items", docId: l._id, before: { appliesTo: l.data.appliesTo, label: l.data.label } satisfies LimitBefore });
      }
      if (moves.length) await syncClashes(ctx, workspaceId);
      next = { cursor: page.continueCursor, isDone: page.isDone };
    } else {
      const settings = await ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first();
      const length = settings?.lengths?.find((l) => l.directionId === id);
      if (settings && length) {
        await ctx.db.patch(settings._id, { lengths: settings.lengths!.filter((l) => l !== length) });
        moves.push({ table: "resumeSettings", docId: settings._id, before: length });
      }
    }

    for (const m of moves) await ctx.db.insert("mergeMoves", { workspaceId, directionId: id, ...m });
    // The sweep's pages count what they still found (swept), not what they read.
    const was = (job.result ?? {}) as { checked?: number; swept?: number };
    const progress = { checked: (was.checked ?? 0) + (sweep ? 0 : checked), total, swept: (was.swept ?? 0) + (sweep ? moves.length : 0) };
    const step = sweep ? `sweep:${phase}` : phase;
    const done = [...(job.done ?? []).filter((d) => d.step !== step), { step, result: next }];
    await ctx.db.patch(jobId, { result: progress, done });
    return { ...next, ...progress };
  },
});

// One page of an Undo: the merge's mergeMoves rows, oldest first, each record put back as it was and the row deleted,
// so a run started again goes on with what's left. Nothing for a cancelled job. more: there may be more rows.
export const unmergePage = internalMutation({
  args: { jobId: v.id("jobs"), total: v.number() },
  handler: async (ctx, { jobId, total }) => {
    await refuseCancelled(ctx, jobId);
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Not found.");
    const { workspaceId } = job;
    const { id, into } = job.args as MergeArgs;
    // Newest first: a record moved again by the final sweep is put back through each of its moves in turn.
    const rows = await ctx.db.query("mergeMoves").withIndex("by_direction", (q) => q.eq("workspaceId", workspaceId).eq("directionId", id)).order("desc").take(MERGE_PAGE);
    let scoped = false;
    for (const m of rows) {
      await ctx.db.delete(m._id);
      if (m.table === "companies") {
        const c = await ctx.db.get(m.docId as Id<"companies">);
        if (!c) continue;
        const { was, now } = m.before as CompanyBefore;
        await ctx.db.patch(c._id, { fit: undoList(c.fit, was.fit, now.fit, (f) => f.directionId), found: undoList(c.found, was.found, now.found, () => null) ?? [] });
      } else if (m.table === "postings") {
        const p = await ctx.db.get(m.docId as Id<"postings">);
        if (!p) continue;
        const { was, now } = m.before as PostingBefore;
        await ctx.db.patch(p._id, {
          fit: undoList(p.fit, was.fit, now.fit, (f) => f.directionId),
          sort: p.sort && {
            ...p.sort,
            directionIds: undoList(p.sort.directionIds, was.directionIds, now.directionIds, (d) => d) ?? [],
            against: undoList(p.sort.against, was.against, now.against, (a) => a.directionId) ?? [],
          },
          rerank: undoList(p.rerank, was.rerank, now.rerank, (d) => d),
        });
      } else if (m.table === "pursuits") {
        const b = m.before as PursuitBefore;
        if (await ctx.db.get(m.docId as Id<"pursuits">)) await ctx.db.patch(m.docId as Id<"pursuits">, { directionId: b.directionId, direction: b.direction });
      } else if (m.table === "resumes") {
        if (await ctx.db.get(m.docId as Id<"resumes">)) await ctx.db.patch(m.docId as Id<"resumes">, { directionId: id });
      } else if (m.table === "notes") {
        if (await ctx.db.get(m.docId as Id<"notes">)) await ctx.db.patch(m.docId as Id<"notes">, { subject: { kind: "item", id } });
      } else if (m.table === "items") {
        const l = await ctx.db.get(m.docId as Id<"items">);
        if (l?.kind !== "limit") continue;
        const b = m.before as LimitBefore;
        await ctx.db.patch(l._id, { data: { ...l.data, appliesTo: b.appliesTo, label: b.label } });
        scoped = true;
      } else {
        const st = await ctx.db.get(m.docId as Id<"resumeSettings">);
        if (st) await ctx.db.patch(st._id, { lengths: [...(st.lengths ?? []), m.before as LengthBefore] });
      }
    }
    if (scoped) await syncClashes(ctx, workspaceId);
    const progress = { checked: ((job.result?.checked as number | undefined) ?? 0) + rows.length, total };
    await ctx.db.patch(jobId, { result: progress });
    return { more: rows.length === MERGE_PAGE, ...progress };
  },
});

// Merge into…: for each other approved direction, what merging this one into it would give it (titles it doesn't
// have, roles that fit this one and not it, companies that fit this one well and it weakly or not at all), and this
// one's pursuits and notes that would move with it.
export const mergeGains = query({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const from = await getInWorkspace(ctx, workspaceId, id);
    if (from?.kind !== "direction") throw new Error("Not found.");
    const fitting = async (directionId: Id<"items">) =>
      new Set(
        (
          await ctx.db
            .query("roleRanks")
            .withIndex("by_score", (q) => q.eq("workspaceId", workspaceId).eq("directionId", directionId).eq("state", "judged"))
            .filter((q) => q.or(q.eq(q.field("level"), "strong"), q.eq(q.field("level"), "some")))
            .take(GAIN_CAP)
        ).map((r) => String(r.postingId)),
      );
    const roles = await fitting(id);
    const companies = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    const levelFor = (c: Doc<"companies">, d: Id<"items">) => c.fit?.find((f) => f.directionId === d)?.level;
    const strongHere = companies.filter((c) => fitsWell(levelFor(c, id)));
    const titles = titlesOf(from.data);
    const others = (await itemsOf(ctx, workspaceId, "direction", "approved")).filter((d) => d._id !== id);
    const pursuits = (await ctx.db.query("pursuits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).filter((p) => p.directionId && p.directionId === id).length;
    const notes = (await ctx.db.query("notes").withIndex("by_subject", (q) => q.eq("workspaceId", workspaceId).eq("subject.kind", "item").eq("subject.id", id)).collect()).length;
    return {
      pursuits,
      notes,
      into: await Promise.all(
        others.map(async (o) => {
          const has = new Set(titlesOf(o.data).map((t) => t.toLowerCase()));
          const theirs = await fitting(o._id);
          return {
            id: o._id,
            titles: titles.filter((t) => !has.has(t.toLowerCase())).length,
            roles: [...roles].filter((r) => !theirs.has(r)).length,
            companies: strongHere.filter((c) => !fitsWell(levelFor(c, o._id))).length,
          };
        }),
      ),
    };
  },
});
// Roles read per direction for mergeGains.
const GAIN_CAP = 2000;

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
    await syncClashes(ctx, workspaceId);
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
    await syncClashes(ctx, workspaceId);
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
    await syncClashes(ctx, workspaceId);
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
