import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { companiesToRate } from "./companySets";
import { duplicatePairs, sameWorkSuggestions } from "./factPairs";
import { type ItemOf, itemsOf, type SkillItem, skillsOf } from "./itemShapes";
import { DEFAULT_LENS } from "./lens";
import { updatesOf } from "./resume";
import { resumeTitle } from "./resumeDoc";
import { REVIEW_KINDS, type ReviewKind } from "./reviewKinds";
import { requireWorkspace } from "./workspaces";

// Review: everything waiting on a decision, in one place, grouped by what it is. Decisions go through each kind's own
// mutations; this module only gathers what waits. Groups that unlock work come first (reviewKinds.ts).

const LABELS: Record<ReviewKind, string> = {
  directions: "Directions",
  limits: "Limits",
  criteria: "Direction criteria",
  positioning: "Positioning",
  companies: "Companies to rate",
  facts: "Facts",
  rewrites: "Rewrites",
  questions: "Questions",
  insights: "Insights",
  skills: "Skills",
  sameWork: "Same work",
  resume: "Resume updates",
};
const UNLOCKS: ReviewKind[] = ["directions", "limits", "criteria", "positioning"];

type Fact = ItemOf<"fact">;
type WithId<T extends { _id: Id<"items"> }> = T & { id: Id<"items"> };
const withId = <T extends { _id: Id<"items"> }>(d: T): WithId<T> => ({ ...d, id: d._id });

// Everything waiting, per group, in the order it's reviewed.
async function waiting(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const [proposedDirections, approvedDirections, limits, roles, approvedRoles, projects, approvedProjects, proposedFacts, approvedFacts, conflicts, followups, insights] = await Promise.all([
    itemsOf(ctx, workspaceId, "direction", "proposed"),
    itemsOf(ctx, workspaceId, "direction", "approved"),
    itemsOf(ctx, workspaceId, "limit", "proposed"),
    itemsOf(ctx, workspaceId, "role", "proposed"),
    itemsOf(ctx, workspaceId, "role", "approved"),
    itemsOf(ctx, workspaceId, "project", "proposed"),
    itemsOf(ctx, workspaceId, "project", "approved"),
    itemsOf(ctx, workspaceId, "fact", "proposed"),
    itemsOf(ctx, workspaceId, "fact", "approved"),
    itemsOf(ctx, workspaceId, "conflict", "proposed"),
    itemsOf(ctx, workspaceId, "followup", "proposed"),
    itemsOf(ctx, workspaceId, "insight", "proposed"),
  ]);
  const byAge = <T extends { _creationTime: number }>(xs: T[]) => xs.sort((a, b) => a._creationTime - b._creationTime);
  const liveFacts = [...proposedFacts, ...approvedFacts];

  // A rewrite waits on the fact until they use it or keep the current wording; the fact is decided there, once.
  const rewrites = byAge(liveFacts.filter((f) => f.data.suggestion?.text));
  const orphan = (f: Fact) => !!(f.data.noLongerSaid || f.data.sourceDeleted);
  const facts = byAge<Doc<"items">>([...roles, ...projects, ...liveFacts.filter((f) => !f.data.suggestion?.text && (f.status === "proposed" || orphan(f)))]);

  // Skills: proposed ones, then pairs that look like the same thing (both still in play).
  const proposedSkills = await skillsOf(ctx, workspaceId, "proposed");
  const liveSkills = [...proposedSkills, ...(await skillsOf(ctx, workspaceId, "approved"))];
  // A pair shows once, whichever side carries the flag.
  const seen = new Set<string>();
  const once = (a: string, b: string) => {
    const key = [a, b].sort().join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const skillPairs = liveSkills.flatMap((item) => {
    const other = item.data.sameAs && liveSkills.find((o) => o._id === item.data.sameAs);
    return other && once(item._id, other._id) ? [{ item, other }] : [];
  });

  // Same work: duplicate facts, then project facts that may tell the same work as a role's.
  const factsWithId = liveFacts.map(withId);
  const duplicates = [...duplicatePairs(factsWithId).entries()].flatMap(([id, other]) => {
    const fact = factsWithId.find((f) => f.id === id)!;
    return once(fact.id, other.id) ? [{ fact, other }] : [];
  });
  const sameWork = sameWorkSuggestions(factsWithId, approvedProjects.map(withId), approvedRoles.map(withId));

  // Companies: the Companies page's open set they haven't rated, best first, then goals misfits not kept.
  const discovery = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  const companyRows = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect();
  const companies = companiesToRate(
    companyRows.map((c) => ({ doc: c, screened: c.screened ?? null, rating: c.rating?.value ?? null, goals: c.goals ?? null, named: c.found.some((f) => f.via === "hand"), fit: c.fit ?? [] })),
    (discovery?.lens ?? DEFAULT_LENS).judge,
  );

  // Resume updates: a version waiting to be kept or discarded, for the base resume or a direction with approved
  // positioning (the resumes Resume updates lists).
  const targets = new Map<string, string>([["base", "Base resume"], ...approvedDirections.filter((d) => d.data.detailStatus === "approved").map((d) => [String(d._id), `${d.data.name} resume`] as [string, string])]);
  const resumes = (await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect()).flatMap((r) => {
    const name = targets.get(r.directionId ? String(r.directionId) : "base");
    return r.toReview && !r.discarded && r.posting === undefined && name ? [{ resume: r, name }] : [];
  });

  return {
    directions: byAge(proposedDirections),
    limits: byAge(limits),
    criteria: approvedDirections.filter((d) => d.data.criteria && d.data.criteriaStatus === "proposed"),
    positioning: approvedDirections.filter((d) => d.data.detail && d.data.detailStatus === "proposed"),
    companies,
    facts,
    rewrites,
    questions: byAge<ItemOf<"conflict" | "followup">>([...conflicts, ...followups]),
    insights: byAge(insights),
    skills: [...byAge(proposedSkills).map((item) => ({ item, other: null as SkillItem | null })), ...skillPairs],
    sameWork: [...duplicates.map((d) => ({ ...d, kind: "duplicate" as const })), ...sameWork.map((s) => ({ ...s, kind: "sameWork" as const }))],
    resume: resumes,
  };
}
type Waiting = Awaited<ReturnType<typeof waiting>>;

const list = (names: string[]) => {
  const unique = [...new Set(names.filter(Boolean))];
  return unique.length > 3 ? `${unique.slice(0, 3).join(", ")} and ${unique.length - 3} more` : unique.join(", ");
};
const and = (names: string[]) => {
  const unique = [...new Set(names.filter(Boolean))];
  return unique.length > 2 ? `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}` : unique.join(" and ");
};

// Names for where things are: roles by roleKey ("Supply Planning Manager, Brightwater"; employers alone), projects by projectKey,
// narratives by id, and facts by id. Read once per query.
async function namesOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const roles = new Map<string, ItemOf<"role">>();
  for (const status of ["rejected", "proposed", "approved"] as const) for (const r of await itemsOf(ctx, workspaceId, "role", status)) if (r.roleKey) roles.set(r.roleKey, r);
  const projects = new Map<string, ItemOf<"project">>();
  for (const status of ["rejected", "proposed", "approved"] as const) for (const p of await itemsOf(ctx, workspaceId, "project", status)) if (p.projectKey) projects.set(p.projectKey, p);
  const narratives = new Map((await ctx.db.query("narratives").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).map((n) => [String(n._id), n]));
  const facts = new Map<string, Fact>();
  for (const status of ["proposed", "approved"] as const) for (const f of await itemsOf(ctx, workspaceId, "fact", status)) facts.set(String(f._id), f);
  const roleName = (key?: string) => {
    const r = key ? roles.get(key) : undefined;
    return r ? (r.data.break ? "Career break" : [r.data.title, r.data.employer].filter(Boolean).join(", ")) : "";
  };
  const employer = (key?: string) => {
    const r = key ? roles.get(key) : undefined;
    return r ? (r.data.break ? "a career break" : (r.data.employer ?? r.data.title ?? "")) : "";
  };
  // Where an item sits: its project's name, else its role.
  const where = (i: { roleKey?: string; projectKey?: string }) => (i.projectKey && projects.get(i.projectKey)?.data.name) || roleName(i.roleKey);
  const place = (i: { roleKey?: string; projectKey?: string }) => (i.projectKey && projects.get(i.projectKey)?.data.name) || employer(i.roleKey);
  const storyName = (n: Doc<"narratives">) => (n.kind === "career" ? `${n.title} story` : n.kind === "goals" ? "Goals" : n.title);
  return { roles, projects, narratives, facts, roleName, where, place, storyName };
}
type Names = Awaited<ReturnType<typeof namesOf>>;

// A short look at what a group holds: names, a limit, where things came from or are about.
function preview(kind: ReviewKind, w: Waiting, n: Names) {
  switch (kind) {
    case "directions":
      return list(w.directions.map((d) => d.data.name));
    case "limits":
      return list(w.limits.map((l) => l.data.value));
    case "criteria":
      return list(w.criteria.map((d) => d.data.name));
    case "positioning":
      return list(w.positioning.map((d) => d.data.name));
    case "companies":
      return list(w.companies.map((c) => c.company.doc.name));
    case "facts": {
      const from = list(
        w.facts.map((i) => {
          if (i.kind === "project") return i.data.name;
          if (i.projectKey) return n.projects.get(i.projectKey)?.data.name ?? "";
          const story = i.sources[0] && n.narratives.get(String(i.sources[0].narrativeId));
          return story ? `your ${n.storyName(story)}` : "";
        }),
      );
      return from ? `From ${from}` : "";
    }
    case "rewrites":
      return `On ${list(w.rewrites.map(n.place))}`;
    case "questions":
      return `About ${list(w.questions.map((q) => n.place(q) || "your record"))}`;
    case "insights": {
      const places = w.insights.flatMap((i) => i.data.factIds.map((id) => n.facts.get(id)).flatMap((f) => (f ? [n.place(f)] : [])));
      return places.length ? `Across ${and(places)}` : "Across your record";
    }
    case "skills":
      return list(w.skills.map((s) => s.item.data.name));
    case "sameWork":
      return list(w.sameWork.map((s) => n.place(s.fact)));
    case "resume":
      return list(w.resume.map((r) => r.name));
  }
}

// How many decisions wait, and each group with something waiting, in review order. The total is what the sidebar and
// Today show.
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const w = await waiting(ctx, workspaceId);
    const n = await namesOf(ctx, workspaceId);
    const groups = REVIEW_KINDS.filter((kind) => w[kind].length > 0).map((kind) => ({ kind, label: LABELS[kind], count: w[kind].length, preview: preview(kind, w, n), unlocks: UNLOCKS.includes(kind) }));
    return { total: groups.reduce((sum, g) => sum + g.count, 0), groups };
  },
});

// ---- Cards ----

// What a card rests on: a fact (its text and where it is) or a quote (its words, the source's name and when it was
// written). The screen turns these into BuiltOn sources.
type Source = { kind: "fact" | "quote"; text: string; from: string; at?: number; approved?: boolean };

async function quotesOf(ctx: QueryCtx, n: Names, i: Doc<"items">): Promise<Source[]> {
  const out: Source[] = [];
  for (const s of i.sources) {
    const story = n.narratives.get(String(s.narrativeId));
    if (!story) continue;
    const version = await ctx.db.query("narrativeVersions").withIndex("by_narrative", (q) => q.eq("narrativeId", s.narrativeId).eq("version", s.version)).unique();
    for (const text of s.quotes) out.push({ kind: "quote", text, from: n.storyName(story), at: version?.at ?? story.updatedAt });
  }
  return out;
}

const factSources = (n: Names, ids: string[]): Source[] =>
  ids.flatMap((id) => {
    const f = n.facts.get(id);
    return f ? [{ kind: "fact" as const, text: f.data.text, from: `Fact · ${n.place(f)}`, approved: f.status === "approved" }] : [];
  });

const orNull = <T>(x: T | undefined) => x ?? null;

type Declined = {
  key: string;
  title: string;
  line: string;
  decision: string;
  reason: string | null;
  restore:
    | { via: "review"; id: Id<"items"> }
    | { via: "rate"; id: Id<"companies"> }
    | { via: "followup"; id: Id<"items"> }
    | { via: "duplicate"; id: Id<"items">; other: Id<"items"> }
    | { via: "sameWork"; id: Id<"items">; other: Id<"items"> }
    | { via: "skillPair"; id: Id<"items">; other: Id<"items"> }
    | { via: "resume"; id: Id<"resumes"> };
};

// Decisions against, newest first, so the pattern shows and each can be restored.
const DECLINED_SHOWN = 30;

// One group's cards, in review order, with everything a card needs, and what was turned down in that group.
export const items = query({
  args: { kind: v.union(...REVIEW_KINDS.map((k) => v.literal(k))) },
  handler: async (ctx, { kind }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const w = await waiting(ctx, workspaceId);
    const n = await namesOf(ctx, workspaceId);
    const rejected = async <K extends Parameters<typeof itemsOf>[2]>(k: K) => (await itemsOf(ctx, workspaceId, k, "rejected")).sort((a, b) => b._creationTime - a._creationTime).slice(0, DECLINED_SHOWN);
    const rejectedRow = (i: Doc<"items">, title: string, line: string, reason: string | null | undefined): Declined => ({ key: i._id, title, line, decision: "Rejected", reason: reason ?? null, restore: { via: "review", id: i._id } });
    const base = { kind, label: LABELS[kind] };

    switch (kind) {
      case "directions": {
        const byId = new Map([...(await itemsOf(ctx, workspaceId, "direction", "approved")), ...w.directions].map((d) => [String(d._id), d]));
        const cards = await Promise.all(
          w.directions.map(async (d) => {
            const into = d.data.addsTo ? byId.get(String(d.data.addsTo)) : undefined;
            return {
              type: "direction" as const,
              key: String(d._id),
              id: d._id,
              title: into ? `${d.data.name} under ${into.data.name}` : d.data.name,
              line: d.data.summary ?? (d.data.includes ?? []).join(", "),
              context: into ? `Adds to ${into.data.name}` : d.data.suggested ? "Suggested" : "From your goals",
              name: d.data.name,
              summary: orNull(d.data.summary),
              includes: d.data.includes ?? [],
              path: orNull(d.data.path),
              into: into ? { id: into._id, name: into.data.name } : null,
              sources: d.data.suggested ? factSources(n, d.data.evidence ?? []) : await quotesOf(ctx, n, d),
            };
          }),
        );
        return { ...base, cards, declined: (await rejected("direction")).map((d) => rejectedRow(d, d.data.name, d.data.summary ?? "", d.data.rejectedBecause)) };
      }
      case "limits": {
        const cards = await Promise.all(
          w.limits.map(async (l) => ({
            type: "limit" as const,
            key: String(l._id),
            id: l._id,
            title: l.data.value,
            line: l.data.label + (l.data.firm === false ? " · preference" : ""),
            context: l.data.label,
            value: l.data.value,
            firm: l.data.firm !== false,
            note: orNull(l.data.note ?? undefined),
            clash: !!l.data.clash,
            sources: await quotesOf(ctx, n, l),
          })),
        );
        return { ...base, cards, declined: (await rejected("limit")).map((l) => rejectedRow(l, l.data.value, l.data.label, l.data.rejectedBecause)) };
      }
      case "criteria": {
        const cards = await Promise.all(
          w.criteria.map(async (d) => {
            const c = d.data.criteria!;
            return {
              type: "criteria" as const,
              key: String(d._id),
              id: d._id,
              title: `Where ${d.data.name} looks`,
              line: [c.industries.slice(0, 3).join(", "), c.sizes.join(", ")].filter(Boolean).join(" · "),
              context: d.data.name,
              name: d.data.name,
              criteria: { seeds: c.seeds ?? [], industries: c.industries, sizes: c.sizes, stages: c.stages, titles: c.titles, keywords: c.keywords },
              sources: await quotesOf(ctx, n, d),
            };
          }),
        );
        return { ...base, cards, declined: [] as Declined[] };
      }
      case "positioning": {
        const cards = w.positioning.map((d) => {
          const t = d.data.detail!;
          return {
            type: "positioning" as const,
            key: String(d._id),
            id: d._id,
            title: `How to present you for ${d.data.name}`,
            line: t.targetTitles.slice(0, 3).join(", "),
            context: d.data.name,
            name: d.data.name,
            positioning: t.positioning,
            targetTitles: t.targetTitles,
            vocabulary: t.vocabulary,
            sources: factSources(n, [...new Set([...t.carriesOver, ...t.reframe].flatMap((s) => s.factIds))]),
          };
        });
        return { ...base, cards, declined: [] as Declined[] };
      }
      case "companies": {
        const directions = new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.name]));
        const cards = w.companies.map(({ company: { doc: c }, misfit }) => {
          const found = [...new Set(c.found.map((f) => (f.via === "hand" ? "your list" : f.directionId ? (directions.get(String(f.directionId)) ?? "") : "")).filter(Boolean))];
          const best = [...(c.fit ?? [])].sort((a, b) => ["strong", "some", "weak", "none"].indexOf(a.level) - ["strong", "some", "weak", "none"].indexOf(b.level))[0];
          const g = c.goals;
          const fit =
            g && g.level !== "unknown"
              ? { tone: g.level === "fits" ? ("good" as const) : ("caution" as const), title: g.level === "fits" ? "Fits your goals" : g.level === "partly" ? "Partly fits your goals" : "Doesn’t fit your goals", text: g.reason }
              : best
                ? { tone: best.level === "strong" || best.level === "some" ? ("good" as const) : ("caution" as const), title: `${best.level === "strong" ? "Strong" : best.level === "some" ? "Some" : best.level === "weak" ? "Weak" : "No"} fit for ${directions.get(String(best.directionId)) ?? "a direction"}`, text: best.reason }
                : null;
          return {
            type: "company" as const,
            key: String(c._id),
            id: c._id,
            title: c.name,
            line: [c.details?.summary ?? c.domain, c.foundedYear ? `Founded ${c.foundedYear}` : ""].filter(Boolean).join(" · "),
            context: found.length ? (found[0] === "your list" ? "From your list" : `Found for ${and(found)}`) : "Found",
            name: c.name,
            about: orNull(c.details?.summary ?? c.details?.siteDescription),
            website: orNull(c.websiteUrl ?? (c.domain ? `https://${c.domain}` : undefined)),
            openRoles: c.details?.jobs ? c.details.jobs.open : null,
            fit,
            misfit,
            rating: c.rating?.value ?? null,
            sources: [] as Source[],
          };
        });
        const passed = (await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
          .filter((c) => c.rating?.value === "no")
          .sort((a, b) => (b.rating?.at ?? 0) - (a.rating?.at ?? 0))
          .slice(0, DECLINED_SHOWN);
        return {
          ...base,
          cards,
          declined: passed.map((c): Declined => ({ key: c._id, title: c.name, line: c.details?.summary ?? c.domain ?? "", decision: "Not for me", reason: c.rating?.reason ?? null, restore: { via: "rate", id: c._id } })),
        };
      }
      case "facts": {
        const cards = await Promise.all(
          w.facts.map(async (i) => {
            const sources = await quotesOf(ctx, n, i);
            if (i.kind === "role")
              return {
                type: "role" as const,
                key: String(i._id),
                id: i._id,
                status: i.status,
                title: [resumeTitle(i.data)?.text, i.data.employer].filter(Boolean).join(", ") || "A role",
                line: [i.data.start && `${i.data.start} to ${i.data.end ?? "now"}`, i.data.location, i.data.break && i.data.reason].filter(Boolean).join(" · "),
                context: i.data.break ? "New career break" : "New role",
                employer: orNull(i.data.employer),
                roleTitle: orNull(i.data.title),
                alternateTitles: i.data.alternateTitles ?? [],
                break: !!i.data.break,
                start: orNull(i.data.start ?? undefined),
                end: orNull(i.data.end ?? undefined),
                location: orNull(i.data.location ?? undefined),
                sources,
              };
            if (i.kind === "project")
              return {
                type: "project" as const,
                key: String(i._id),
                id: i._id,
                status: i.status,
                title: i.data.name,
                line: i.data.summary ?? i.data.description ?? "",
                context: "New project",
                summary: orNull(i.data.summary ?? i.data.description),
                stack: i.data.stack ?? [],
                url: i.data.url,
                sources,
              };
            const f = i as Fact;
            const orphan = f.data.noLongerSaid || f.data.sourceDeleted ? { noLongerSaid: f.data.noLongerSaid ?? null, sourceDeleted: f.data.sourceDeleted ?? null } : null;
            const files: Source[] = f.data.files?.length ? [{ kind: "quote", text: f.data.files.join(", "), from: `${n.projects.get(f.projectKey ?? "")?.data.name ?? "Project"} files` }] : [];
            return {
              type: "fact" as const,
              key: String(f._id),
              id: f._id,
              status: f.status,
              title: f.data.text,
              line: n.where(f),
              context: orphan ? (orphan.sourceDeleted ? "Its story was deleted" : "No longer in your story") : n.where(f),
              text: f.data.text,
              orphan,
              sources: [...sources, ...files],
            };
          }),
        );
        const turnedDown = [...(await rejected("role")), ...(await rejected("fact")), ...(await rejected("project"))].sort((a, b) => b._creationTime - a._creationTime).slice(0, DECLINED_SHOWN);
        return {
          ...base,
          cards,
          declined: turnedDown.map((i) =>
            i.kind === "role"
              ? rejectedRow(i, [i.data.title, i.data.employer].filter(Boolean).join(", "), "Role", i.data.rejectedBecause)
              : i.kind === "project"
                ? rejectedRow(i, i.data.name, "Project", i.data.rejectedBecause)
                : rejectedRow(i, (i as Fact).data.text, n.where(i), (i as Fact).data.rejectedBecause),
          ),
        };
      }
      case "rewrites": {
        const cards = await Promise.all(
          w.rewrites.map(async (f) => ({
            type: "rewrite" as const,
            key: String(f._id),
            id: f._id,
            status: f.status,
            title: f.data.suggestion!.text!,
            line: n.where(f),
            context: n.where(f),
            now: f.data.text,
            proposed: f.data.suggestion!.text!,
            asked: orNull(f.data.suggestion!.note),
            sources: await quotesOf(ctx, n, f),
          })),
        );
        return { ...base, cards, declined: [] as Declined[] };
      }
      case "questions": {
        const cards = await Promise.all(
          w.questions.map(async (q) =>
            q.kind === "conflict"
              ? {
                  type: "conflict" as const,
                  key: String(q._id),
                  id: q._id,
                  title: q.data.question,
                  line: q.data.overlap ? `${q.data.overlap.ends.employer} and ${q.data.overlap.starts.employer}` : n.roleName(q.roleKey),
                  context: q.data.overlap ? `${q.data.overlap.ends.employer} and ${q.data.overlap.starts.employer}` : n.roleName(q.roleKey) || "Your record",
                  question: q.data.question,
                  recordSays: q.data.recordSays,
                  narrativeSays: q.data.narrativeSays,
                  narrativeValue: orNull(q.data.narrativeValue ?? undefined),
                  field: q.data.field,
                  overlap: q.data.overlap ?? null,
                  sources: await quotesOf(ctx, n, q),
                }
              : {
                  type: "followup" as const,
                  key: String(q._id),
                  id: q._id,
                  title: q.data.question,
                  line: q.data.why,
                  context: n.roleName(q.roleKey) || "Your record",
                  question: q.data.question,
                  why: q.data.why,
                  sources: factSources(n, q.data.factId ? [q.data.factId] : []),
                },
          ),
        );
        const skipped = (await itemsOf(ctx, workspaceId, "followup", "skipped")).sort((a, b) => b._creationTime - a._creationTime).slice(0, DECLINED_SHOWN);
        return {
          ...base,
          cards,
          declined: skipped.map((q): Declined => ({ key: q._id, title: q.data.question, line: n.roleName(q.roleKey), decision: "Not now", reason: q.data.skippedBecause ?? null, restore: { via: "followup", id: q._id } })),
        };
      }
      case "insights": {
        const cards = w.insights.map((i) => ({
          type: "insight" as const,
          key: String(i._id),
          id: i._id,
          status: i.status,
          title: i.data.text,
          line: `Across ${i.data.factIds.length} ${i.data.factIds.length === 1 ? "fact" : "facts"}`,
          context: and(i.data.factIds.flatMap((id) => (n.facts.get(id) ? [n.place(n.facts.get(id)!)] : []))) || "Your record",
          text: i.data.text,
          sources: factSources(n, i.data.factIds),
        }));
        return { ...base, cards, declined: (await rejected("insight")).map((i) => rejectedRow(i, i.data.text, "Insight", i.data.rejectedBecause)) };
      }
      case "skills": {
        const skillLabel = { skill: "Skill", tool: "Tool", certification: "Certification" } as const;
        const shows = (s: SkillItem): Source[] => [
          ...s.data.from.roles.map((k) => ({ kind: "fact" as const, text: n.roleName(k) || k, from: "Role" })),
          ...s.data.from.projects.map((k) => ({ kind: "fact" as const, text: n.projects.get(k)?.data.name ?? k, from: "Project" })),
          ...factSources(n, s.data.from.facts),
        ];
        const cards = w.skills.map(({ item: s, other }) =>
          other
            ? {
                type: "skillPair" as const,
                key: `${s._id}:${other._id}`,
                id: s._id,
                other: other._id,
                title: `${s.data.name} and ${other.data.name}`,
                line: "Look like the same thing",
                context: skillLabel[s.kind],
                name: s.data.name,
                otherName: other.data.name,
                sources: [...shows(s), ...shows(other)],
              }
            : {
                type: "skill" as const,
                key: String(s._id),
                id: s._id,
                status: s.status,
                title: s.data.name,
                line: [s.data.group, [...s.data.from.roles.map((k) => n.roleName(k)), ...s.data.from.projects.map((k) => n.projects.get(k)?.data.name ?? "")].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
                context: skillLabel[s.kind],
                name: s.data.name,
                group: orNull(s.data.group),
                lowValue: orNull(s.data.lowValue),
                sources: shows(s),
              },
        );
        const turnedDown = (await Promise.all((["skill", "tool", "certification"] as const).map((k) => rejected(k)))).flat().sort((a, b) => b._creationTime - a._creationTime).slice(0, DECLINED_SHOWN);
        const apart = (await skillsOf(ctx, workspaceId, "approved"))
          .concat(await skillsOf(ctx, workspaceId, "proposed"))
          .flatMap((s) => (s.data.apartBecause ?? []).map((a) => ({ s, a })));
        const names = new Map([...(await skillsOf(ctx, workspaceId, "approved")), ...(await skillsOf(ctx, workspaceId, "proposed"))].map((s) => [String(s._id), s.data.name]));
        return {
          ...base,
          cards,
          declined: [
            ...turnedDown.map((s) => rejectedRow(s, s.data.name, skillLabel[s.kind], s.data.rejectedBecause)),
            ...apart.flatMap(({ s, a }): Declined[] =>
              names.has(a.id) ? [{ key: `${s._id}:${a.id}`, title: `${s.data.name} and ${names.get(a.id)}`, line: "Kept both", decision: "Kept both", reason: a.reason, restore: { via: "skillPair", id: s._id, other: a.id as Id<"items"> } }] : [],
            ),
          ],
        };
      }
      case "sameWork": {
        const cards = await Promise.all(
          w.sameWork.map(async (s) =>
            s.kind === "duplicate"
              ? {
                  type: "duplicate" as const,
                  key: `${s.fact._id}:${s.other._id}`,
                  id: s.fact._id,
                  other: s.other._id,
                  title: s.fact.data.text,
                  line: `Same as “${s.other.data.text}”`,
                  context: n.where(s.fact),
                  text: s.fact.data.text,
                  otherText: s.other.data.text,
                  sources: [...(await quotesOf(ctx, n, s.fact)), ...(await quotesOf(ctx, n, s.other))],
                }
              : {
                  type: "sameWork" as const,
                  key: `${s.fact._id}:${s.other._id}`,
                  id: s.fact._id,
                  other: s.other._id,
                  lead: s.fact.data.sameWorkAs!.lead,
                  title: s.fact.data.text,
                  line: `Maybe the same as “${s.other.data.text}”`,
                  context: `${s.project.data.name} and ${n.roleName(s.role.roleKey)}`,
                  text: s.fact.data.text,
                  otherText: s.other.data.text,
                  project: s.project.data.name,
                  role: n.roleName(s.role.roleKey),
                  sources: [...(await quotesOf(ctx, n, s.fact)), ...(await quotesOf(ctx, n, s.other))],
                },
          ),
        );
        const declined = [...n.facts.values()].flatMap((f): Declined[] => {
          const pairs = [...(f.data.keptApart ?? []).map((o) => ({ o, how: "Kept both" as const })), ...(f.projectKey ? (f.data.keptSeparate ?? []).map((o) => ({ o, how: "Kept separate" as const })) : [])];
          return pairs.flatMap(({ o, how }) => {
            const other = n.facts.get(o);
            // Keep both is remembered on both facts; list it once, from the side that has the reason or the lower id.
            if (!other || (how === "Kept both" && !f.data.apartBecause?.some((a) => a.id === o) && (other.data.apartBecause?.some((a) => a.id === f._id) || String(f._id) > o))) return [];
            return [
              {
                key: `${f._id}:${o}`,
                title: f.data.text,
                line: `${how === "Kept both" ? "Kept apart from" : "Separate from"} “${other.data.text}”`,
                decision: how,
                reason: f.data.apartBecause?.find((a) => a.id === o)?.reason ?? null,
                restore: how === "Kept both" ? { via: "duplicate", id: f._id, other: other._id } : { via: "sameWork", id: f._id, other: other._id },
              },
            ];
          });
        });
        return { ...base, cards, declined: declined.slice(0, DECLINED_SHOWN) };
      }
      case "resume": {
        const updates = await updatesOf(ctx, workspaceId);
        const cards = w.resume.map(({ resume: r, name }) => {
          const u = updates.find((x) => x.versionId === r._id);
          return {
            type: "resume" as const,
            key: String(r._id),
            id: r._id,
            title: name,
            line: u?.summary ?? "A new version to keep or discard",
            context: name,
            name,
            href: u?.target.href ?? `/resumes?resume=${r.directionId ?? "base"}`,
            summary: orNull(u?.summary ?? undefined),
            preview: u?.preview ?? r.text ?? "",
            sources: [] as Source[],
          };
        });
        const discarded = (await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect()).filter((r) => r.discarded).slice(0, DECLINED_SHOWN);
        const directionNames = new Map((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => [String(d._id), d.data.name]));
        return {
          ...base,
          cards,
          declined: discarded.map((r): Declined => ({
            key: r._id,
            title: r.directionId ? `${directionNames.get(String(r.directionId)) ?? "Direction"} resume` : "Base resume",
            line: "Version written from Resume updates",
            decision: "Discarded",
            reason: r.discarded?.reason ?? null,
            restore: { via: "resume", id: r._id },
          })),
        };
      }
    }
  },
});
