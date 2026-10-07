import type { Doc, Id } from "./_generated/dataModel";
import { type ItemKind, type ItemOf, isSkill, itemsOf, type SkillItem, skillsOf } from "./itemShapes";
import type { QueryCtx } from "./_generated/server";

// What every AI step that reads across the record gets, split the same way everywhere:
// the approved record is the evidence; their narratives are background for understanding, never a source of claims;
// the goals narrative only ever arrives as approved directions.

// Whether an item still counts as far as its sources go. Every reader of the approved record asks this, so a rejected
// narrative or project stops what came from it counting everywhere at once. An item rests on the narratives it cites
// and, for a project's facts and notes, on that project while it's approved; it counts while any of those does, and
// always when it cites none (added by hand). An insight rests on the facts it cites. A skill, tool or certification
// rests on where the record shows it: an approved role, project or fact that counts. A project is itself a source: its
// own status decides.
export async function sourceCheck(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<(i: Doc<"items">) => boolean> {
  const narratives = await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
  const rejected = new Set(narratives.filter((n) => n.rejectedAt !== undefined).map((n) => String(n._id)));
  const projects = new Set((await itemsOf(ctx, workspaceId, "project", "approved")).map((p) => p.projectKey));
  const roles = new Map((await itemsOf(ctx, workspaceId, "role", "approved")).map((r) => [r.roleKey, r]));
  const facts = new Map(
    (await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "fact")).collect()).map((f) => [String(f._id), f]),
  );
  const rests = (i: Doc<"items">) => {
    const each = [...i.sources.map((s) => !rejected.has(String(s.narrativeId))), ...(i.projectKey ? [projects.has(i.projectKey)] : [])];
    return each.length === 0 || each.some(Boolean);
  };
  return (i) => {
    if (i.kind === "project") return true;
    if (isSkill(i)) {
      const { roles: r, projects: p, facts: f } = i.data.from;
      const each = [
        ...r.map((k) => !!roles.get(k) && rests(roles.get(k)!)),
        ...p.map((k) => projects.has(k)),
        ...f.map((id) => facts.get(id)?.status === "approved" && rests(facts.get(id)!)),
      ];
      return each.length === 0 || each.some(Boolean);
    }
    if (i.kind !== "insight") return rests(i);
    const cited = i.data.factIds.flatMap((id) => facts.get(id) ?? []);
    return cited.length === 0 || cited.some(rests);
  };
}

// Approved items of one kind that count (sourceCheck). Pass a check already made to read several kinds at once.
export async function counted<K extends ItemKind>(ctx: QueryCtx, workspaceId: Id<"workspaces">, kind: K, check?: (i: Doc<"items">) => boolean): Promise<ItemOf<K>[]> {
  const stands = check ?? (await sourceCheck(ctx, workspaceId));
  return (await itemsOf(ctx, workspaceId, kind, "approved")).filter(stands);
}

// The approved items that count, whole: what approvedRecord is made from, and what a resume's basis marks.
export type CountedRecord = {
  roles: ItemOf<"role">[];
  projects: ItemOf<"project">[];
  facts: ItemOf<"fact">[];
  context: ItemOf<"context">[];
  insights: ItemOf<"insight">[];
  directions: ItemOf<"direction">[];
  skills: SkillItem[];
};
export async function countedRecord(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<CountedRecord> {
  const stands = await sourceCheck(ctx, workspaceId);
  return {
    roles: await counted(ctx, workspaceId, "role", stands),
    projects: await counted(ctx, workspaceId, "project", stands),
    facts: await counted(ctx, workspaceId, "fact", stands),
    context: await counted(ctx, workspaceId, "context", stands),
    insights: await counted(ctx, workspaceId, "insight", stands),
    directions: await counted(ctx, workspaceId, "direction", stands),
    skills: (await skillsOf(ctx, workspaceId, "approved")).filter(stands),
  };
}

// The approved record as AI steps read it.
export function recordOf(items: CountedRecord) {
  const roles = items.roles.map((r) => ({
    roleKey: r.roleKey,
    employer: r.data.employer,
    title: r.data.title,
    alternateTitles: r.data.alternateTitles,
    start: r.data.start,
    end: r.data.end,
    location: r.data.location,
    skills: r.data.skills,
    tools: r.data.tools,
    // A career break the person added: its own reason, in their words.
    break: r.data.break,
    reason: r.data.reason,
  }));
  // Projects (their repositories) they approved, each with the role it's linked to; a project's facts count only while
  // the project itself is approved (sourceCheck).
  const projects = items.projects.map((p) => ({
    projectKey: p.projectKey!,
    name: p.data.name,
    url: p.data.url,
    summary: p.data.summary,
    stack: p.data.stack,
    start: p.data.start,
    end: p.data.end,
    commits: p.data.commits,
    roleKey: p.roleKey,
  }));
  const facts = items.facts.map((f) => ({ id: f._id, roleKey: f.roleKey, projectKey: f.projectKey, text: f.data.text }));
  const context = items.context.map((c) => ({ roleKey: c.roleKey, projectKey: c.projectKey, text: c.data.text }));
  const insights = items.insights.map((i) => ({ id: i._id, text: i.data.text }));
  const directions = items.directions.map((d) => ({ name: d.data.name, includes: d.data.includes, summary: d.data.summary }));
  // Skills, tools and certifications they approved: the only ones a resume lists.
  const skills = items.skills.map((k) => ({ id: k._id, kind: k.kind, name: k.data.name, group: k.data.group }));
  return { roles, projects, facts, context, insights, directions, skills };
}

export async function approvedRecord(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return recordOf(await countedRecord(ctx, workspaceId));
}

// Their narratives as background, except the goals narrative and any they rejected.
export async function backgroundNarratives(ctx: QueryCtx, workspaceId: Id<"workspaces">, except?: Id<"narratives">) {
  return (await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
    .filter((n) => n._id !== except && n.kind !== "goals" && n.rejectedAt === undefined && n.body.trim())
    .map((n) => ({ title: n.title, kind: n.kind, body: n.body }));
}

export { itemsOf };

// For comparing quotes with text: case, spacing, quote marks and punctuation don't matter.
export const squash = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9$%]+/g, " ").trim();
export const quotedIn = (body: string, quotes?: unknown[]) => {
  const b = squash(body);
  return (quotes ?? []).some((q) => typeof q === "string" && squash(q).length > 0 && b.includes(squash(q)));
};
