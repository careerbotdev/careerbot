import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// What deleting a story takes with it, when they choose to (narratives.remove, narratives.removal). Only what the story
// alone backs can go: an item another story or its approved project also stands behind stays and just loses this
// story's passages. `unreviewed`: what's waiting for review (facts, roles, and the insights and questions resting only
// on facts that go); `approved`: approved facts, and an approved role. A role goes only when nothing that stays is filed
// under it. A note kept for a fact goes with that fact. A rejected item resting only on this story always goes (with its
// reason and any note), whatever they tick: rejections steer later reads (extract.inputs) and shouldn't outlive their source.
export type Choice = { unreviewed: boolean; approved: boolean };
export type Counts = { facts: number; roles: number; insights: number; questions: number };

export type Removal = {
  // Item ids that go.
  gone: Set<string>;
  // Whether an item stands only on this story.
  only: (i: Doc<"items">) => boolean;
};

export function plan(items: Doc<"items">[], narrativeId: Id<"narratives">, projectKeys: Set<string | undefined>, choice: Choice): Removal {
  const only = (i: Doc<"items">) =>
    i.sources.length > 0 && i.sources.every((s) => s.narrativeId === narrativeId) && !(i.projectKey && projectKeys.has(i.projectKey));
  const wants = (i: Doc<"items">) => (i.status === "proposed" && choice.unreviewed) || (i.status === "approved" && choice.approved);
  const gone = new Set<string>();
  for (const i of items) if (i.kind === "fact" && only(i) && wants(i)) gone.add(i._id);
  for (const i of items) if (i.status === "rejected" && only(i)) gone.add(i._id);
  for (const i of items) {
    if (i.status !== "proposed" || !choice.unreviewed || !only(i) || (i.kind !== "insight" && i.kind !== "followup")) continue;
    const rests: string[] = i.kind === "insight" ? i.data.factIds : i.data.factId ? [i.data.factId] : [];
    if (rests.every((f) => gone.has(f))) gone.add(i._id);
  }
  for (const i of items) if (i.kind === "context" && i.data.factId && gone.has(i.data.factId)) gone.add(i._id);
  for (const r of items) {
    if (r.kind !== "role" || !r.roleKey || !only(r) || !wants(r)) continue;
    const held = items.some((i) => i._id !== r._id && i.roleKey === r.roleKey && i.status !== "rejected" && i.kind !== "conflict" && !gone.has(i._id));
    if (!held) gone.add(r._id);
  }
  return { gone, only };
}

function countsOf(items: Doc<"items">[], ids: (id: string) => boolean): Counts {
  const c: Counts = { facts: 0, roles: 0, insights: 0, questions: 0 };
  for (const i of items) {
    if (!ids(i._id) || i.status === "rejected") continue;
    if (i.kind === "fact") c.facts++;
    else if (i.kind === "role") c.roles++;
    else if (i.kind === "insight") c.insights++;
    else if (i.kind === "followup") c.questions++;
  }
  return c;
}

export async function removalInputs(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const items = await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId)).collect();
  const projectKeys = new Set(items.filter((i) => i.kind === "project" && i.status === "approved").map((p) => p.projectKey));
  return { items, projectKeys };
}

// Fact ids cited by a line of a resume they kept (any version not discarded).
export async function factsInResumes(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const cited = new Set<string>();
  for (const r of await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
    if (r.discarded || !r.doc) continue;
    for (const b of [...r.doc.experience.flatMap((e) => e.bullets), ...(r.doc.projects ?? []).flatMap((p) => p.bullets)]) for (const f of b.factIds) cited.add(f);
  }
  return cited;
}

// What the Delete story… dialog shows (narratives.removal): what goes if they tick only what's waiting (the default),
// what more goes if they tick approved facts too (and how many of those are in resume lines), and what stays either way
// because another story (`by`: "Side story", "Pricing note") or an approved project also backs it.
export function summary(items: Doc<"items">[], narrativeId: Id<"narratives">, projectKeys: Set<string | undefined>, inResumes: Set<string>, titleOf: (id: Id<"narratives">) => string | undefined) {
  const first = plan(items, narrativeId, projectKeys, { unreviewed: true, approved: false });
  const both = plan(items, narrativeId, projectKeys, { unreviewed: true, approved: true });
  const approvedOnly = (i: string) => both.gone.has(i) && !first.gone.has(i);
  const shared = items.filter(
    (i) => (i.kind === "fact" || i.kind === "role") && (i.status === "proposed" || i.status === "approved") && i.sources.some((s) => s.narrativeId === narrativeId) && !first.only(i),
  );
  const others = new Set(shared.flatMap((i) => i.sources.map((s) => s.narrativeId)).filter((o) => o !== narrativeId));
  return {
    unreviewed: countsOf(items, (i) => first.gone.has(i)),
    approved: countsOf(items, approvedOnly),
    inResumes: items.filter((i) => i.kind === "fact" && approvedOnly(i._id) && inResumes.has(i._id)).length,
    // Rejected items it alone backs: they go whatever they tick.
    rejected: items.filter((i) => i.status === "rejected" && first.gone.has(i._id)).length,
    stays: {
      facts: shared.filter((i) => i.kind === "fact").length,
      roles: shared.flatMap((i) => (i.kind === "role" ? [i.data.title] : [])),
      by: [...others].flatMap((o) => titleOf(o) ?? []),
      project: shared.some((i) => !!i.projectKey && projectKeys.has(i.projectKey)),
    },
  };
}
