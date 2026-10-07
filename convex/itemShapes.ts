import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// The shape of `data` for each kind of item. The items table is a union of these, so the database refuses a row whose
// data doesn't match its kind. Model replies are reduced to these fields (`pick*` below) before anything is written.

const str = v.string();
const opt = v.optional;
const strOrNull = v.union(v.string(), v.null());
const strs = v.array(v.string());

// An item's review status. "setAside": still unreviewed when the narrative or project it came from was rejected; it
// comes back with that source (sources.restore). Not a decision about the item, so never a rejection to learn from.
export const STATUSES = ["proposed", "approved", "rejected", "skipped", "superseded", "setAside"] as const;
export const itemStatus = v.union(...STATUSES.map((s) => v.literal(s)));

// A wording in a fact's or insight's history. `was`: the status before an edit or a rewrite approved it, so Undo puts
// it back (extract.revertWording). `reason`: why they kept the current wording over a rewrite.
export const version = v.object({
  text: str,
  how: v.union(v.literal("read"), v.literal("edit"), v.literal("rewrite"), v.literal("dismissed"), v.literal("rejected"), v.literal("merged"), v.literal("unapproved")),
  note: opt(v.string()),
  reason: opt(v.string()),
  was: opt(itemStatus),
  at: v.number(),
});

// Why they said two items are different (Keep both, Keep separate), by the other item's id; shown where the pair was.
const apartBecause = opt(v.array(v.object({ id: str, reason: str })));

export const suggestion = v.union(
  v.null(),
  v.object({ text: opt(str), note: opt(str), pending: opt(v.boolean()), from: opt(v.literal("revision")), at: v.number() }),
);

// A change to a role's details made by answering a question, logged on the role.
const roleChange = v.object({ field: str, from: v.union(str, v.null()), to: str, how: v.literal("answer"), at: v.number() });

export const roleData = v.object({
  key: opt(str),
  employer: opt(str),
  title: opt(str),
  alternateTitles: opt(strs),
  marketTitle: opt(strOrNull),
  change: opt(strOrNull),
  location: opt(strOrNull),
  start: opt(strOrNull),
  end: opt(strOrNull),
  team: opt(strs),
  projects: opt(strs),
  skills: opt(strs),
  tools: opt(strs),
  edited: opt(v.boolean()),
  history: opt(v.array(roleChange)),
  // A career break the person added: time without a role (title "Career break", no employer needed), with their own
  // reason if they give one.
  break: opt(v.boolean()),
  reason: opt(str),
  // Why they rejected it, when they said.
  rejectedBecause: opt(strOrNull),
  // Early reads stamped the kind into data; harmless, kept for old rows.
  kind: opt(v.literal("role")),
});

export const factData = v.object({
  text: str,
  history: opt(v.array(version)),
  suggestion: opt(suggestion),
  edited: opt(v.boolean()),
  rejectedBecause: opt(strOrNull),
  evidenceMissing: opt(v.boolean()),
  noLongerSaid: opt(strOrNull),
  sourceDeleted: opt(strOrNull),
  // Flagged by "Find duplicates": another fact in the same role that says the same thing, awaiting Merge or Keep both.
  duplicateOf: opt(v.id("items")),
  // Facts the person said are different from this one; never flagged as its duplicates again.
  keptApart: opt(strs),
  // Set when this fact was merged away (status superseded): the fact that kept its sources and history.
  mergedInto: opt(v.id("items")),
  // A project's fact: the repository files it rests on ("commit history" for what the commits show).
  files: opt(strs),
  // Same work (sameWork.ts), between a linked project's fact and an approved fact of its role. sameWorkAs: on the
  // project's fact, a suggested pair awaiting Connect or Keep separate. sameWork: on both facts once connected. lead:
  // the richer of the two, the one resumes write the line from. keptSeparate: on the project's fact, the role's facts
  // they said are separate work, never suggested again.
  sameWorkAs: opt(v.object({ factId: v.id("items"), lead: v.id("items") })),
  sameWork: opt(v.object({ factId: v.id("items"), lead: v.id("items") })),
  keptSeparate: opt(strs),
  apartBecause,
  // On a fact merged away (duplicates.merge): what the merge changed, so Undo can take it back (duplicates.unmerge).
  // status: its own before; flagged: which of the two carried the flag; kept*: the kept fact's status, and how many
  // sources and history entries it had.
  undoMerge: opt(v.object({ status: itemStatus, flagged: v.union(v.literal("kept"), v.literal("removed")), keptStatus: itemStatus, keptSources: v.number(), keptHistory: v.number() })),
});

// A project from one of their GitHub repositories: its name, link and dates (first and last commit, YYYY-MM) and commit
// count come from GitHub; summary and stack are read from the repository and reviewed with the project. Its facts carry
// the same projectKey. The item's roleKey is the role it's linked to, if any.
export const projectData = v.object({
  name: str,
  repo: str,
  url: str,
  private: opt(v.boolean()),
  description: opt(str),
  summary: opt(str),
  stack: opt(strs),
  languages: opt(strs),
  start: opt(strOrNull),
  end: opt(strOrNull),
  commits: opt(v.number()),
  edited: opt(v.boolean()),
  readAt: opt(v.number()),
  rejectedBecause: opt(strOrNull),
});

export const projectKeyOf = (repo: string) => `github:${repo.toLowerCase()}`;

export const contextData = v.object({
  text: str,
  factId: opt(v.id("items")),
  from: opt(v.union(v.literal("your note"), v.literal("left out of the line"))),
});

const story = v.object({ text: str, factIds: strs, how: opt(str) });
export const directionDetail = v.object({
  positioning: str,
  targetTitles: strs,
  vocabulary: strs,
  carriesOver: v.array(story),
  reframe: v.array(story),
  titleMap: v.array(v.object({ from: str, to: str })),
});
export const directionCriteria = v.object({
  // Seed company websites for lookalike searches; when set, they replace the workspace's default seeds.
  seeds: opt(strs),
  industries: strs,
  sizes: strs,
  stages: strs,
  titles: strs,
  keywords: strs,
});

export const directionData = v.object({
  name: str,
  includes: opt(strs),
  summary: opt(str),
  path: opt(v.union(v.literal("continue"), v.literal("adjacent"), v.literal("stretch"))),
  edited: opt(v.boolean()),
  addsTo: opt(v.id("items")),
  mergedInto: opt(str),
  // Proposed by "Suggest more directions" rather than read from the goals narrative.
  suggested: opt(v.boolean()),
  // For a suggested direction: the approved facts it rests on.
  evidence: opt(strs),
  // The run that last wrote detail and criteria, so a retried run doesn't write them twice.
  detailRunId: opt(v.id("jobs")),
  // How to position the record for this direction. Reviewed on its own; only approved detail feeds resumes.
  detail: opt(directionDetail),
  detailStatus: opt(v.union(v.literal("proposed"), v.literal("approved"))),
  // What search looks for in this direction. Reviewed on its own; only approved criteria feed discovery.
  criteria: opt(directionCriteria),
  criteriaStatus: opt(v.union(v.literal("proposed"), v.literal("approved"))),
  // When what ranking roles reads (name, summary, approved detail and criteria) last changed; unset: not since it was
  // made. Role verdicts from before it are marked as ranked before the change.
  changedAt: opt(v.number()),
  rejectedBecause: opt(strOrNull),
  // On an addition merged into a direction (goals.merge): what the merge changed, so Undo can take it back
  // (goals.unmerge).
  undoMerge: opt(v.object({ into: v.id("items"), status: itemStatus, includes: opt(strs), edited: opt(v.boolean()), intoStatus: itemStatus, intoSources: v.number() })),
});

export const limitData = v.object({
  kind: str,
  label: str,
  value: str,
  firm: opt(v.boolean()),
  appliesTo: opt(strs),
  when: opt(v.union(v.null(), v.record(v.string(), v.boolean()))),
  // Validated per bucket by limitBuckets.cleanRule; only its outer shape is fixed here.
  rule: opt(v.union(v.null(), v.record(v.string(), v.any()))),
  ruleAsRead: opt(v.any()),
  ruleStale: opt(v.boolean()),
  note: opt(strOrNull),
  readKey: opt(str),
  rev: opt(v.number()),
  edited: opt(v.boolean()),
  // Switched off: kept and shown, but nothing filters, ranks or judges by it (activeLimits leaves it out).
  off: opt(v.boolean()),
  // The wording changed after its rule was set; the rule still filters by the old wording until they update or keep it.
  sentenceChanged: opt(v.boolean()),
  clash: opt(v.boolean()),
  rejectedBecause: opt(strOrNull),
});

export const insightData = v.object({
  text: str,
  factIds: strs,
  history: opt(v.array(version)),
  suggestion: opt(suggestion),
  edited: opt(v.boolean()),
  rejectedBecause: opt(strOrNull),
});

// A skill, tool or certification (kinds "skill", "tool", "certification"): its name as resumes and postings write it, a
// short group ("CRM", "Analytics"), and where the record shows it (`from`): approved roles by roleKey (their skills and
// tools), approved projects by projectKey (their stack) and approved facts by id. Gathered as proposals (skills.ts) and
// reviewed like facts. lowValue: why it's too vague to stand out on a resume. sameAs: another item it looks like the
// same thing as, awaiting Merge or Keep both, with why (sameWhy); keptApart: items they said are different; mergedInto:
// set when merged away (status superseded). A certification can say who issued it and when it was earned (YYYY-MM).
export const SKILL_KINDS = ["skill", "tool", "certification"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
export const skillData = v.object({
  name: str,
  group: opt(str),
  from: v.object({ roles: strs, projects: strs, facts: strs }),
  lowValue: opt(str),
  sameAs: opt(v.id("items")),
  sameWhy: opt(str),
  issuer: opt(str),
  earned: opt(str),
  keptApart: opt(strs),
  mergedInto: opt(v.id("items")),
  edited: opt(v.boolean()),
  rejectedBecause: opt(strOrNull),
  apartBecause,
  // On one merged away (skills.merge): what the merge changed, so Undo can take it back (skills.unmerge).
  undoMerge: opt(v.object({ status: itemStatus, flagged: v.union(v.literal("kept"), v.literal("removed")), keptStatus: itemStatus, keptFrom: v.object({ roles: strs, projects: strs, facts: strs }), keptApart: opt(strs) })),
});

// A question about the record, or about two jobs whose dates overlap (`overlap`, conflicts.overlaps): then `ends` is
// the job that started first, whose end is in question, `starts` the other, whose start is; recordSays and
// narrativeSays are their dates, and field is null. answer.pick "both": they held both jobs at once, nothing changes;
// answer.field: which date an overlap's answer changed.
const overlapJob = v.object({ roleKey: str, employer: str });
export const conflictData = v.object({
  field: v.union(v.literal("start"), v.literal("end"), v.literal("title"), v.literal("employer"), v.null()),
  recordSays: str,
  narrativeSays: str,
  narrativeValue: opt(strOrNull),
  question: str,
  overlap: opt(v.object({ ends: overlapJob, starts: overlapJob })),
  answer: opt(
    v.object({
      pick: v.union(v.literal("record"), v.literal("narrative"), v.literal("other"), v.literal("both")),
      value: strOrNull,
      field: opt(v.union(v.literal("start"), v.literal("end"))),
      reason: opt(str),
      at: v.number(),
    }),
  ),
});

export const followupData = v.object({
  question: str,
  why: str,
  factId: v.union(v.id("items"), v.null()),
  answer: opt(str),
  answeredAt: opt(v.number()),
  narrativeId: opt(v.id("narratives")),
  // Why they said Not now, when they said.
  skippedBecause: opt(str),
});

// ---- Reducing model output to a kind's fields ----

const s = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
const list = (x: unknown) => (Array.isArray(x) ? x.map(s).filter((i): i is string => !!i) : undefined);
const drop = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;

// A career break read from a story has no employer or title of its own, only its dates, reason and what they did in
// it, like one they add themselves (breaks.ts).
export function pickRole(r: Record<string, unknown>) {
  if (r.break === true)
    return drop({ key: s(r.key), title: "Career break", break: true as const, reason: s(r.reason), start: s(r.start), end: s(r.end), projects: list(r.projects), skills: list(r.skills), tools: list(r.tools) });
  return drop({
    key: s(r.key),
    employer: s(r.employer),
    title: s(r.title),
    alternateTitles: list(r.alternateTitles),
    change: s(r.change),
    location: s(r.location),
    start: s(r.start),
    end: s(r.end),
    team: list(r.team) ?? (s(r.team) ? [s(r.team)!] : undefined),
    projects: list(r.projects),
    skills: list(r.skills),
    tools: list(r.tools),
  });
}

const PATHS = ["continue", "adjacent", "stretch"] as const;
export function pickDirection(d: Record<string, unknown>) {
  return drop({
    name: s(d.name) ?? "",
    includes: list(d.includes),
    summary: s(d.summary),
    path: PATHS.includes(d.path as never) ? (d.path as (typeof PATHS)[number]) : undefined,
  });
}

// The caller has already cleaned the scope, condition and rule and set the label, readKey, rev and clash.
type LimitIn = Record<string, unknown> & {
  kind: string;
  label: string;
  appliesTo?: string[];
  when?: Record<string, boolean> | null;
  rule?: Record<string, unknown> | null;
  readKey?: string;
  rev?: number;
  clash?: boolean;
};
export function pickLimit(l: LimitIn) {
  return drop({
    kind: l.kind,
    label: l.label,
    value: s(l.value) ?? "",
    firm: typeof l.firm === "boolean" ? l.firm : undefined,
    appliesTo: l.appliesTo,
    when: l.when,
    rule: l.rule,
    ruleAsRead: l.ruleAsRead,
    note: s(l.note) ?? (l.note === null ? null : undefined),
    readKey: l.readKey,
    rev: l.rev,
    clash: l.clash,
  });
}

const CONFLICT_FIELDS = ["start", "end", "title", "employer"] as const;
export function pickConflict(c: Record<string, unknown>) {
  return drop({
    field: CONFLICT_FIELDS.includes(c.field as never) ? (c.field as (typeof CONFLICT_FIELDS)[number]) : null,
    recordSays: s(c.recordSays) ?? "",
    narrativeSays: s(c.narrativeSays) ?? "",
    narrativeValue: s(c.narrativeValue) ?? (c.narrativeValue === null ? null : undefined),
    question: s(c.question) ?? "",
  });
}

// ---- Typed access ----

export type ItemKind = Doc<"items">["kind"];
export type ItemOf<K extends ItemKind> = Extract<Doc<"items">, { kind: K }>;
export type ItemStatus = Doc<"items">["status"];

// Items of one kind and status, typed as that kind.
export async function itemsOf<K extends ItemKind>(ctx: QueryCtx, workspaceId: Id<"workspaces">, kind: K, status: ItemStatus): Promise<ItemOf<K>[]> {
  const rows = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("status", status)).collect();
  return rows as ItemOf<K>[];
}

// The limits that filter, rank and judge: approved and not switched off.
export async function activeLimits(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<ItemOf<"limit">[]> {
  return (await itemsOf(ctx, workspaceId, "limit", "approved")).filter((l) => l.data.off !== true);
}

export const isKind = <K extends ItemKind>(kind: K) => (i: Doc<"items">): i is ItemOf<K> => i.kind === kind;

export type SkillItem = ItemOf<SkillKind>;
export const isSkill = (i: Doc<"items">): i is SkillItem => (SKILL_KINDS as readonly string[]).includes(i.kind);

// Skills, tools and certifications of one status, all three kinds.
export async function skillsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, status: ItemStatus): Promise<SkillItem[]> {
  return (await Promise.all(SKILL_KINDS.map((kind) => itemsOf(ctx, workspaceId, kind, status)))).flat();
}
