import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeLimits } from "./itemShapes";
import { limitsFor } from "./limitBuckets";
import { DEFAULT_LENS, type Lens } from "./lens";

// The industries a direction's company search covers: its own criteria plus the industries their approved company
// limits want, as the lens in Search settings says. The wanted ones come from the limits each time, never copied into
// a direction's criteria, so changing a limit changes every direction at once. One reading for every consumer:
// discovery's Apollo searches, the web search's prompts, fit judging, role judging and the Criteria the page shows.

export type IndustryGoals = {
  lens: Lens;
  // Avoided by any approved companies limit: never searched, whatever names them.
  avoid: string[];
  // The companies limits that name wanted industries, with their scope.
  wants: { appliesTo?: string[]; when?: Record<string, boolean> | null; industries: string[] }[];
};

export async function industryGoals(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<IndustryGoals> {
  const limits = (await activeLimits(ctx, workspaceId)).filter((l) => l.data.kind === "companies");
  const list = (x: unknown) => (Array.isArray(x) ? (x as string[]) : []);
  const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  return {
    lens: row?.lens ?? DEFAULT_LENS,
    avoid: [...new Set(limits.flatMap((l) => list(l.data.rule?.industriesAvoid)))],
    wants: limits.filter((l) => list(l.data.rule?.industriesWant).length).map((l) => ({ appliesTo: l.data.appliesTo, when: l.data.when ?? null, industries: list(l.data.rule?.industriesWant) })),
  };
}

// The industries their goals want for this direction: limits for every direction or for this one (a direction's own
// replaces the every-direction one, as limitsFor reads scope). A limit that holds only on a change of industry or kind
// of work is an exception for some jobs, not the direction's aim, so it doesn't widen the search. Avoided ones never.
export function wantedFor(g: IndustryGoals, direction: string): string[] {
  const scoped = limitsFor(g.wants.map((w) => ({ ...w, kind: "companies" })), { direction });
  return [...new Set(scoped.flatMap((w) => w.industries))].filter((i) => !g.avoid.includes(i));
}

// A direction's industries as judging reads them (fit of companies, roles): the wanted ones first, then its own.
export function directionIndustries(g: IndustryGoals, direction: string, own: string[]): string[] {
  return [...new Set([...wantedFor(g, direction), ...own])].filter((i) => !g.avoid.includes(i));
}

// What a company search for this direction covers, as the lens in Search settings says. Steer: directionIndustries;
// Only these: the wanted ones alone; Ignore: none.
export function searchIndustries(g: IndustryGoals, direction: string, own: string[]): string[] {
  return g.lens.industries === "ignore" ? [] : g.lens.industries === "only" ? wantedFor(g, direction) : directionIndustries(g, direction, own);
}

// A direction's Criteria as the page shows its industries: the ones their goals add to its search (none while the
// lens ignores industry), whether a limit for this direction alone gave them, and its own ones their goals don't want
// (from their record, often a past industry), so they can drop them. With no wanted industries, nothing is marked.
export function shownIndustries(g: IndustryGoals, direction: string, own: string[]) {
  const want = wantedFor(g, direction);
  return {
    fromGoals: g.lens.industries === "ignore" ? [] : want,
    goalsScoped: limitsFor(g.wants.map((w) => ({ ...w, kind: "companies" })), { direction }).some((w) => !!w.appliesTo?.length),
    fromRecord: want.length ? own.filter((i) => !want.includes(i) && !g.avoid.includes(i)) : [],
  };
}
