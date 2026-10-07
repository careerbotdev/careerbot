import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { isSkill, type ItemOf, itemsOf, SKILL_KINDS, type SkillItem, type SkillKind, skillsOf } from "./itemShapes";
import { chatJson, LONG_REPLY_TOKENS } from "./metering";
import { replyOf, strictObject, string, strings } from "./replyJson";
import { counted, sourceCheck } from "./recordContext";
import { postingName, updatesOf } from "./resume";
import { skillKey } from "./resumeDoc";
import { getInWorkspace, requireWorkspace } from "./workspaces";

// Skills, tools and certifications as reviewed items. "Gather skills" reads the approved record (roles' skills and tools,
// projects' stacks, approved facts) and proposes each one once, named the way resumes and postings name it, grouped,
// with where the record shows it; near-duplicates are offered as merges and vague ones flagged as low value. They're
// reviewed like facts: approve, edit or rename, merge, reject. A rejected one is never proposed again, in any spelling.
// Resumes list only approved ones (resume.ts), each shown or left out on the record and per resume.

const SYSTEM = `You gather the skills, tools and certifications someone's approved career record shows, for their resume.

Read their approved roles (the skills and tools each one lists), their approved projects (each one's stack) and their approved facts (what they did). List each skill, tool or certification the record shows, once:
- "kind": "skill" (an ability or practice, such as customer onboarding, contract negotiation or data modeling), "tool" (a named product, platform, language, framework or service, such as Salesforce, Python or Figma) or "certification" (a credential someone holds, such as PMP).
- "name": the way resumes and job postings usually write it (Salesforce, not SFDC or salesforce crm; JavaScript; Google Analytics). Variants, abbreviations and spellings of one thing are one item.
- "group": a short, plain group it belongs to (CRM, Analytics, Languages, Cloud, Design, Customer success, and so on), shared across items so the list reads in a few groups.
- "from": where the record shows it: "roles" (role keys), "projects" (project keys), "facts" (fact ids). Only what the record shows; never add something it doesn't.
- "lowValue": when it's too vague or generic to stand out on a resume (Dashboards, APIs, Communication, Microsoft Office), a short reason; otherwise leave it out.
- For a certification, "issuer" (who issued it) and "earned" (the month, YYYY-MM) when the record says them; otherwise leave them out.

Items they already have:
- Approved ones are settled. When the record shows one again, give its "id" (with the "from" you found) and keep its name.
- Ones awaiting their review: give its "id" when you list it again; you may improve its name, group and kind.
- Rejected ones: never list them again, in any spelling or wording. Learn from the reasons they gave.
- When two items are the same thing in different words (existing or new), list the one to merge away with "sameAs": the id, or the name, of the one it's the same as, and "sameWhy": one plain sentence on why they're the same. Never for a pair they said is different.

Every item has its "kind". Reply with JSON only: {"items": [{"id": "...", "kind": "...", "name": "...", "group": "...", "from": {"roles": [], "projects": [], "facts": []}, "lowValue": "...", "issuer": "...", "earned": "...", "sameAs": "...", "sameWhy": "..."}]}.`;

type OutItem = { id?: unknown; kind?: unknown; name?: unknown; group?: unknown; from?: { roles?: unknown; projects?: unknown; facts?: unknown }; lowValue?: unknown; issuer?: unknown; earned?: unknown; sameAs?: unknown; sameWhy?: unknown };
type From = SkillItem["data"]["from"];

const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const strs = (x: unknown) => (Array.isArray(x) ? [...new Set(x.map((y) => (typeof y === "string" ? y.trim() : String(y ?? ""))).filter(Boolean))] : []);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// The reply's shape (structured output, metering.chat), as save reads it: a field it doesn't give is empty.
export const SKILLS_SCHEMA = replyOf("skills", "items", {
  id: string,
  kind: string,
  name: string,
  group: string,
  from: strictObject({ roles: strings, projects: strings, facts: strings }),
  lowValue: string,
  issuer: string,
  earned: string,
  sameAs: string,
  sameWhy: string,
});
const union = (a: From, b: From): From => ({
  roles: [...new Set([...a.roles, ...b.roles])],
  projects: [...new Set([...a.projects, ...b.projects])],
  facts: [...new Set([...a.facts, ...b.facts])],
});
const apart = (a: SkillItem, b: SkillItem) => !!a.data.keptApart?.includes(b._id) || !!b.data.keptApart?.includes(a._id);

// Every skill, tool and certification of theirs still in play: approved, awaiting review or rejected.
async function allSkills(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return (await Promise.all((["approved", "proposed", "rejected"] as const).map((status) => skillsOf(ctx, workspaceId, status)))).flat();
}

async function running(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  return jobs.find((j) => j.kind === "skills" && (j.status === "queued" || j.status === "running")) ?? null;
}

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    // One at a time: a run already waiting or going will see the record as it is.
    if (await running(ctx, workspaceId)) return null;
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "skills", args: {}, status: "queued", origin: "you" });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
    return jobId;
  },
});

// What gathering reads: the approved record that counts (roles with their skills and tools, projects with their stack,
// facts), and their skills, tools and certifications so far: approved (settled), awaiting review (may be refined) and
// rejected with reasons (never again).
export const inputs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const stands = await sourceCheck(ctx, workspaceId);
    const roles = (await counted(ctx, workspaceId, "role", stands))
      .filter((r) => r.roleKey && !r.data.break)
      .map((r) => ({ roleKey: r.roleKey!, title: r.data.title, employer: r.data.employer, skills: r.data.skills ?? [], tools: r.data.tools ?? [] }));
    const projects = (await counted(ctx, workspaceId, "project", stands)).map((p) => ({ projectKey: p.projectKey!, name: p.data.name, stack: p.data.stack ?? [], languages: p.data.languages ?? [] }));
    const facts = (await counted(ctx, workspaceId, "fact", stands)).map((f) => ({ id: f._id, roleKey: f.roleKey, projectKey: f.projectKey, text: f.data.text }));
    const items = await allSkills(ctx, workspaceId);
    const brief = (i: SkillItem) => ({ id: i._id, kind: i.kind, name: i.data.name, group: i.data.group });
    return {
      roles,
      projects,
      facts,
      approved: items.filter((i) => i.status === "approved").map(brief),
      proposed: items.filter((i) => i.status === "proposed").map(brief),
      rejected: items.filter((i) => i.status === "rejected").map((i) => ({ kind: i.kind, name: i.data.name, because: i.data.rejectedBecause ?? null })),
      keptApart: items.flatMap((a) => items.filter((b) => a._id < b._id && apart(a, b)).map((b) => [a._id, b._id])),
    };
  },
});

// Save what a run gathered. An item it names by id, or by a name they already have, is that item: an approved one only
// gains where it was found; one awaiting review also takes the new name, group, kind and flag. Anything rejected, by id
// or in any spelling of its name, is skipped. Sources are kept only where they're an approved role, project or fact
// that counts, and an item the record doesn't show anywhere is dropped. Then merges: an item awaiting review is
// flagged as the same as another (an approved one never is), unless they kept the two apart. A run saves once.
export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), jobId: v.id("jobs"), out: v.any() },
  handler: async (ctx, { workspaceId, jobId, out }) => {
    const job = await ctx.db.get(jobId);
    if (!job || (job.done ?? []).some((d) => d.step === "saved")) return { added: 0, updated: 0 };
    const stands = await sourceCheck(ctx, workspaceId);
    const approvedRoles = await counted(ctx, workspaceId, "role", stands);
    const approvedProjects = await counted(ctx, workspaceId, "project", stands);
    const roles = new Set(approvedRoles.flatMap((r) => r.roleKey ?? []));
    const projects = new Set(approvedProjects.flatMap((p) => p.projectKey ?? []));
    // Names the record itself lists as tools: a role's tools, a project's stack and languages.
    const listedTools = new Set([...approvedRoles.flatMap((r) => r.data.tools ?? []), ...approvedProjects.flatMap((p) => [...(p.data.stack ?? []), ...(p.data.languages ?? [])])].map(skillKey));
    const facts = new Set((await counted(ctx, workspaceId, "fact", stands)).map((f) => String(f._id)));
    const items = await allSkills(ctx, workspaceId);
    const byId = new Map(items.map((i) => [String(i._id), i]));
    const rejected = new Set(items.filter((i) => i.status === "rejected").map((i) => skillKey(i.data.name)));
    const byName = new Map(items.filter((i) => i.status !== "rejected").map((i) => [skillKey(i.data.name), i]));
    const at = Date.now();
    let added = 0;
    let updated = 0;
    // Each listed item as saved, for resolving merges by id or name afterwards.
    const saved: { raw: OutItem; id: Id<"items"> }[] = [];
    for (const raw of ((out as { items?: OutItem[] })?.items ?? []).filter((x) => x && typeof x === "object")) {
      const name = str(raw.name);
      const said = str(raw.kind).toLowerCase().replace(/s$/, "");
      const from: From = {
        roles: strs(raw.from?.roles).filter((k) => roles.has(k)),
        projects: strs(raw.from?.projects).filter((k) => projects.has(k)),
        facts: strs(raw.from?.facts).filter((id) => facts.has(id)),
      };
      if (!name || rejected.has(skillKey(name))) continue;
      const named = byId.get(str(raw.id));
      if (named?.status === "rejected") continue;
      const target = named ?? byName.get(skillKey(name));
      if (!target && !from.roles.length && !from.projects.length && !from.facts.length) continue;
      // A reply that leaves the kind out takes how the record lists it (a role's tools, a project's stack), else the
      // item's own.
      const kind: SkillKind = SKILL_KINDS.includes(said as SkillKind) ? (said as SkillKind) : listedTools.has(skillKey(name)) ? "tool" : (target?.kind ?? "skill");
      const group = str(raw.group) || undefined;
      const lowValue = str(raw.lowValue) || undefined;
      // Who issued a certification and when it was earned, when the reply says.
      const cert = kind === "certification" ? { ...(str(raw.issuer) ? { issuer: str(raw.issuer) } : {}), ...(MONTH.test(str(raw.earned)) ? { earned: str(raw.earned) } : {}) } : {};
      if (target?.status === "approved") {
        const next = union(target.data.from, from);
        if (JSON.stringify(next) !== JSON.stringify(target.data.from)) {
          await ctx.db.patch(target._id, { data: { ...target.data, from: next } });
          updated++;
        }
        saved.push({ raw, id: target._id });
      } else if (target) {
        const data = { ...target.data, name, from: union(target.data.from, from), group: group ?? target.data.group, lowValue, ...cert };
        await ctx.db.replace(target._id, { ...target, kind, data });
        byName.set(skillKey(name), { ...target, kind, data } as SkillItem);
        updated++;
        saved.push({ raw, id: target._id });
      } else {
        const data = { name, from, ...(group ? { group } : {}), ...(lowValue ? { lowValue } : {}), ...cert };
        const id = await ctx.db.insert("items", { workspaceId, kind, status: "proposed", data, sources: [], runId: jobId, at });
        byName.set(skillKey(name), { _id: id, _creationTime: at, workspaceId, kind, status: "proposed", data, sources: [], at } as SkillItem);
        added++;
        saved.push({ raw, id });
      }
    }
    // Merges, once every item is saved: the one awaiting review is the one flagged.
    const now = new Map((await allSkills(ctx, workspaceId)).filter((i) => i.status !== "rejected").map((i) => [String(i._id), i]));
    const named = (x: unknown) => now.get(str(x)) ?? [...now.values()].find((i) => skillKey(i.data.name) === skillKey(str(x)));
    for (const { raw, id } of saved) {
      const a = now.get(String(id));
      const b = named(raw.sameAs);
      if (!a || !b || a._id === b._id || apart(a, b)) continue;
      const [flag, other] = a.status === "proposed" ? [a, b] : b.status === "proposed" ? [b, a] : [null, null];
      if (!flag || !other || flag.data.sameAs === other._id) continue;
      const sameWhy = str(raw.sameWhy) || undefined;
      await ctx.db.patch(flag._id, { data: { ...flag.data, sameAs: other._id, sameWhy } });
      now.set(String(flag._id), { ...flag, data: { ...flag.data, sameAs: other._id, sameWhy } } as SkillItem);
    }
    await ctx.db.patch(jobId, { done: [...(job.done ?? []), { step: "saved", result: { added, updated } }] });
    return { added, updated };
  },
});

export async function runSkills(ctx: ActionCtx, job: Doc<"jobs">) {
  const input = await ctx.runQuery(internal.skills.inputs, { workspaceId: job.workspaceId });
  const shows = input.roles.some((r) => r.skills.length || r.tools.length) || input.projects.length || input.facts.length;
  if (!shows) return { added: 0, updated: 0 };
  const choice = await modelFor(ctx, job.workspaceId, "skills");
  const reply = await chatJson<{ items?: unknown }>(ctx, {
    workspaceId: job.workspaceId,
    purpose: "skills",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: SKILLS_SCHEMA,
    maxTokens: LONG_REPLY_TOKENS,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Their approved record (where skills show):\n${JSON.stringify({ roles: input.roles, projects: input.projects, facts: input.facts })}\n\nApproved skills, tools and certifications (settled):\n${JSON.stringify(input.approved)}\n\nAwaiting their review:\n${JSON.stringify(input.proposed)}\n\nRejected, and why (never again, in any spelling):\n${JSON.stringify(input.rejected)}\n\nPairs they said are different (never merge):\n${JSON.stringify(input.keptApart)}`,
      },
    ],
  });
  const out = reply.out;
  const saved = await ctx.runMutation(internal.skills.save, { workspaceId: job.workspaceId, jobId: job._id, out });
  return { ...saved, costUsd: reply.costUsd, model: reply.model };
}

// ---- Review ----

// The resumes as they stand: each base or direction resume's current version (its newest kept one, for a direction
// still approved) and every tailored one; and whether one of them shows on a resume: its own choice there, else the
// record's (resume.setSkill, resume.setSkillPresentation).
async function currentResumes(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const rows = await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").collect();
  const directions = new Set((await itemsOf(ctx, workspaceId, "direction", "approved")).map((d) => String(d._id)));
  const seen = new Set<string>();
  const current = rows.filter((r) => {
    if (r.posting !== undefined) return true;
    const key = String(r.directionId ?? "base");
    if (r.toReview || seen.has(key) || (r.directionId && !directions.has(key))) return false;
    seen.add(key);
    return true;
  });
  const settings = await ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  const shows = (r: Doc<"resumes">, key: string) => !(r.layout?.skills?.find((k) => k.key === key)?.hidden ?? settings?.skills?.find((k) => k.key === key)?.hidden ?? false);
  return { current, shows };
}

// Their skills, tools and certifications, oldest first so reviewing never moves one. Each with where the record shows
// it (`sources`: roles and projects with their dates and how many of its facts are there; `facts`: those facts), whether
// it counts and, when it doesn't, the rejected roles and projects it waits on (`blockedBy`); how many resumes show it
// now; the one a flagged item looks like and why; the ones merged into it (Undo merge) and the ones they kept apart from
// it, with why (Reopen the pair).
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const items = (await allSkills(ctx, workspaceId)).sort((a, b) => a._creationTime - b._creationTime);
    const stands = await sourceCheck(ctx, workspaceId);
    // Every version of a role or project by its key, the approved one winning.
    const roles = new Map<string | undefined, ItemOf<"role">>();
    const projects = new Map<string | undefined, ItemOf<"project">>();
    for (const status of ["approved", "proposed", "rejected"] as const) {
      for (const r of await itemsOf(ctx, workspaceId, "role", status)) if (!roles.has(r.roleKey)) roles.set(r.roleKey, r);
      for (const p of await itemsOf(ctx, workspaceId, "project", status)) if (!projects.has(p.projectKey)) projects.set(p.projectKey, p);
    }
    const facts = new Map((await ctx.db.query("items").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", "fact")).collect()).map((f) => [String(f._id), f]));
    const byId = new Map(items.map((i) => [String(i._id), i]));
    const merged = (await skillsOf(ctx, workspaceId, "superseded")).filter((g) => g.data.mergedInto && g.data.undoMerge);
    const { current, shows } = await currentResumes(ctx, workspaceId);
    const onResumes = new Map<string, number>();
    for (const r of current) for (const key of new Set(r.doc?.skills.flatMap((g) => g.keys ?? []) ?? [])) if (shows(r, key)) onResumes.set(key, (onResumes.get(key) ?? 0) + 1);
    const job = (await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100)).find((j) => j.kind === "skills");
    return {
      last: job ? { status: job.status, error: job.error ?? null, added: (job.result?.added as number | undefined) ?? null } : null,
      items: items.map((i) => {
        const found = i.data.from.facts.flatMap((id) => (facts.get(id)?.status === "approved" ? [facts.get(id)!] : []));
        const counts = stands(i);
        const other = i.data.sameAs ? byId.get(String(i.data.sameAs)) : undefined;
        const sources = [
          ...i.data.from.roles.map((k) => {
            const r = roles.get(k);
            return { kind: "role" as const, key: k, id: r?._id ?? null, title: r?.data.title ?? k, employer: r?.data.employer ?? null, start: r?.data.start ?? null, end: r?.data.end ?? null, facts: found.filter((f) => f.roleKey === k && !f.projectKey).length, approved: r?.status === "approved" };
          }),
          ...i.data.from.projects.map((k) => {
            const p = projects.get(k);
            return { kind: "project" as const, key: k, id: p?._id ?? null, title: p?.data.name ?? k, employer: null, start: p?.data.start ?? null, end: p?.data.end ?? null, facts: found.filter((f) => f.projectKey === k).length, approved: p?.status === "approved" };
          }),
        ];
        return {
          id: i._id,
          kind: i.kind,
          status: i.status,
          name: i.data.name,
          group: i.data.group ?? null,
          issuer: i.data.issuer ?? null,
          earned: i.data.earned ?? null,
          lowValue: i.data.lowValue ?? null,
          rejectedBecause: i.data.rejectedBecause ?? null,
          edited: !!i.data.edited,
          counts,
          blockedBy: counts ? [] : sources.filter((s) => !s.approved).map((s) => s.title),
          sameAs: other && other.status !== "rejected" ? { id: other._id, name: other.data.name, why: i.data.sameWhy ?? null } : null,
          sources,
          facts: found.map((f) => {
            const p = f.projectKey ? projects.get(f.projectKey) : undefined;
            const r = f.roleKey ? roles.get(f.roleKey) : undefined;
            return { id: f._id, text: f.kind === "fact" ? f.data.text : "", source: p ? p.data.name : r ? [r.data.title, r.data.employer].filter(Boolean).join(" · ") : "" };
          }),
          resumes: onResumes.get(String(i._id)) ?? 0,
          merged: merged.filter((g) => g.data.mergedInto === i._id).map((g) => ({ id: g._id, name: g.data.name })),
          apart: (i.data.keptApart ?? []).flatMap((id) => {
            const o = byId.get(id);
            if (!o) return [];
            const reason = i.data.apartBecause?.find((a) => a.id === id)?.reason ?? o.data.apartBecause?.find((a) => a.id === String(i._id))?.reason ?? null;
            return [{ id: o._id, name: o.data.name, reason }];
          }),
        };
      }),
    };
  },
});

// The resumes that list one of them now (base first, then direction resumes, then tailored ones, newest first): each
// with its name, when it was written, whether it's up to date with the record (base and direction resumes), whether it
// shows the item there, and its skill groups as they show, for a look at where it sits.
export const onResumes = query({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { current, shows } = await currentResumes(ctx, workspaceId);
    const listing = current.filter((r) => r.doc?.skills.some((g) => g.keys?.includes(id)));
    if (!listing.length) return [];
    const updates = await updatesOf(ctx, workspaceId);
    const rank = { base: 0, direction: 1, tailored: 2 };
    const out = await Promise.all(
      listing.map(async (r) => {
        const kind = r.posting !== undefined ? ("tailored" as const) : r.directionId ? ("direction" as const) : ("base" as const);
        const direction = kind === "direction" ? await getInWorkspace(ctx, workspaceId, r.directionId!) : null;
        const named = kind === "tailored" ? await postingName(ctx, workspaceId, r) : null;
        return {
          id: r._id,
          key: kind === "tailored" ? String(r._id) : String(r.directionId ?? "base"),
          kind,
          name: named ? [named.title, named.company].filter(Boolean).join(" · ") : direction?.kind === "direction" ? direction.data.name : "Base resume",
          at: r.at,
          state: kind === "tailored" ? null : (updates.find((u) => u.target.directionId === r.directionId)?.state ?? "upToDate"),
          shown: shows(r, id),
          skills: r
            .doc!.skills.map((g) => ({ group: g.group, items: g.items.map((text, n) => ({ text, key: g.keys?.[n] ?? null })).filter((x) => !x.key || x.key === id || shows(r, x.key)) }))
            .filter((g) => g.items.length),
        };
      }),
    );
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
  },
});

async function skillIn(ctx: QueryCtx, workspaceId: Id<"workspaces">, id: Id<"items">) {
  const item = await getInWorkspace(ctx, workspaceId, id);
  if (!item || !isSkill(item) || item.status === "superseded" || item.status === "setAside") throw new Error("Not found.");
  return item;
}

// Correct one: its name, group and kind, and for a certification who issued it and when it was earned (YYYY-MM; left
// as it was when not given, cleared when blank). The person's wording wins outright, approved as given.
export const edit = mutation({
  args: {
    id: v.id("items"),
    name: v.string(),
    group: v.optional(v.string()),
    kind: v.union(...SKILL_KINDS.map((k) => v.literal(k))),
    issuer: v.optional(v.string()),
    earned: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, group, kind, issuer, earned }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await skillIn(ctx, workspaceId, id);
    if (!name.trim()) throw new Error("Give it a name.");
    if (earned?.trim() && !MONTH.test(earned.trim())) throw new Error("Write when it was earned as YYYY-MM.");
    const cert = kind === "certification";
    await ctx.db.replace(id, {
      ...item,
      kind,
      status: "approved",
      data: {
        ...item.data,
        name: name.trim(),
        group: group?.trim() || undefined,
        issuer: cert ? (issuer === undefined ? item.data.issuer : issuer.trim() || undefined) : undefined,
        earned: cert ? (earned === undefined ? item.data.earned : earned.trim() || undefined) : undefined,
        lowValue: undefined,
        edited: true,
      },
    });
  },
});

// File some under a group or another kind without deciding on them: approved ones stay approved, the rest wait for
// review. A blank group clears it. Leaving certifications drops who issued it and when.
export const classify = mutation({
  args: { ids: v.array(v.id("items")), group: v.optional(v.string()), kind: v.optional(v.union(...SKILL_KINDS.map((k) => v.literal(k)))) },
  handler: async (ctx, { ids, group, kind }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    for (const id of ids) {
      const item = await skillIn(ctx, workspaceId, id);
      const next = kind ?? item.kind;
      const data = { ...item.data, ...(group !== undefined ? { group: group.trim() || undefined } : {}), ...(next !== "certification" ? { issuer: undefined, earned: undefined } : {}) };
      await ctx.db.replace(id, { ...item, kind: next, data });
    }
  },
});

// A flagged item and the one it looks like, both theirs and still in play.
async function flaggedPair(ctx: QueryCtx, workspaceId: Id<"workspaces">, id: Id<"items">) {
  const item = await skillIn(ctx, workspaceId, id);
  if (!item.data.sameAs) throw new Error("Not found.");
  const other = await skillIn(ctx, workspaceId, item.data.sameAs);
  if (other.status === "rejected" || item.status === "rejected") throw new Error("Not found.");
  return { item, other };
}

// Keep one name, approved, with where both were found; the other is merged away (superseded). Anything that pointed at
// the merged one (another flag, a resume's skill line, a left-out choice) now points at the kept one.
export const merge = mutation({
  args: { id: v.id("items"), keep: v.union(v.literal("this"), v.literal("other")) },
  handler: async (ctx, { id, keep }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { item, other } = await flaggedPair(ctx, workspaceId, id);
    const [kept, gone] = keep === "this" ? [item, other] : [other, item];
    const keptApart = [...new Set([...(kept.data.keptApart ?? []), ...(gone.data.keptApart ?? [])])];
    const undoMerge = { status: gone.status, flagged: keep === "this" ? ("kept" as const) : ("removed" as const), keptStatus: kept.status, keptFrom: kept.data.from, keptApart: kept.data.keptApart };
    await ctx.db.patch(kept._id, { status: "approved", data: { ...kept.data, sameAs: undefined, from: union(kept.data.from, gone.data.from), keptApart: keptApart.length ? keptApart : undefined } });
    await ctx.db.patch(gone._id, { status: "superseded", data: { ...gone.data, sameAs: undefined, mergedInto: kept._id, undoMerge } });
    await rebind(ctx, workspaceId, gone._id, kept._id);
  },
});

// Undo a merge, from the one merged away: both are as they were before, flag and all. What was pointed at the kept one
// stays with it.
export const unmerge = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const gone = await getInWorkspace(ctx, workspaceId, id);
    if (!gone || !isSkill(gone) || gone.status !== "superseded" || !gone.data.undoMerge || !gone.data.mergedInto) throw new Error("Not found.");
    const kept = await getInWorkspace(ctx, workspaceId, gone.data.mergedInto);
    if (!kept || !isSkill(kept)) throw new Error("Not found.");
    const u = gone.data.undoMerge;
    await ctx.db.patch(kept._id, { status: u.keptStatus, data: { ...kept.data, from: u.keptFrom, keptApart: u.keptApart, sameAs: u.flagged === "kept" ? gone._id : kept.data.sameAs } });
    await ctx.db.patch(gone._id, { status: u.status, data: { ...gone.data, mergedInto: undefined, undoMerge: undefined, sameAs: u.flagged === "removed" ? kept._id : undefined } });
  },
});

// They're different: clear the flag and remember the pair, so no later run offers it again. `reason`: why, when they
// said, kept on the flagged one.
export const keepApart = mutation({
  args: { id: v.id("items"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const { item, other } = await flaggedPair(ctx, workspaceId, id);
    const why = reason?.trim();
    const apartBecause = why ? [...(item.data.apartBecause ?? []).filter((a) => a.id !== other._id), { id: String(other._id), reason: why }] : item.data.apartBecause;
    await ctx.db.patch(item._id, { data: { ...item.data, sameAs: undefined, keptApart: [...new Set([...(item.data.keptApart ?? []), other._id])], apartBecause } });
    await ctx.db.patch(other._id, { data: { ...other.data, keptApart: [...new Set([...(other.data.keptApart ?? []), item._id])] } });
  },
});

// Undo Keep both: the pair is flagged again, as it was, and forgotten as different.
export const reopenPair = mutation({
  args: { id: v.id("items"), other: v.id("items") },
  handler: async (ctx, { id, other: otherId }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const item = await skillIn(ctx, workspaceId, id);
    const other = await skillIn(ctx, workspaceId, otherId);
    if (!item.data.keptApart?.includes(otherId)) throw new Error("Not found.");
    await ctx.db.patch(item._id, { data: { ...item.data, sameAs: other._id, keptApart: item.data.keptApart.filter((x) => x !== otherId), apartBecause: item.data.apartBecause?.filter((a) => a.id !== otherId) } });
    await ctx.db.patch(other._id, { data: { ...other.data, keptApart: other.data.keptApart?.filter((x) => x !== id) } });
  },
});

async function rebind(ctx: MutationCtx, workspaceId: Id<"workspaces">, from: Id<"items">, to: Id<"items">) {
  for (const i of await skillsOf(ctx, workspaceId, "proposed")) if (i.data.sameAs === from) await ctx.db.patch(i._id, { data: { ...i.data, sameAs: to } });
  const swap = <T extends { key: string }>(xs: T[] | undefined) => {
    const out = (xs ?? []).map((x) => (x.key === from ? { ...x, key: to } : x));
    return out.filter((x, i) => out.findIndex((y) => y.key === x.key) === i);
  };
  const settings = await ctx.db.query("resumeSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
  if (settings?.skills?.some((k) => k.key === from)) await ctx.db.patch(settings._id, { skills: swap(settings.skills) });
  for (const r of await ctx.db.query("resumes").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
    const cites = r.doc?.skills.some((g) => g.keys?.includes(from)) || r.layout?.skills?.some((k) => k.key === from);
    if (!r.doc || !cites) continue;
    const skills = r.doc.skills
      .map((g) => {
        const keys = g.keys?.map((k) => (k === from ? to : k));
        const keep = g.items.map((_, i) => !keys || keys.indexOf(keys[i]) === i);
        return { ...g, items: g.items.filter((_, i) => keep[i]), ...(keys ? { keys: keys.filter((_, i) => keep[i]) } : {}) };
      })
      .filter((g) => g.items.length);
    await ctx.db.patch(r._id, { doc: { ...r.doc, skills }, ...(r.layout ? { layout: { ...r.layout, ...(r.layout.skills ? { skills: swap(r.layout.skills) } : {}) } } : {}) });
  }
}

// ---- Migration ----

// Operator, once: every approved role's skills and tools become proposed skill and tool items (one per name across
// roles, with each role it came from), so they're reviewed like everything else. A name they already have as an item,
// in any status, is left alone, so running it again adds nothing.
export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    let added = 0;
    for (const w of await ctx.db.query("workspaces").collect()) {
      const known = new Map<string, Id<"items"> | null>();
      for (const status of ["approved", "proposed", "rejected", "superseded", "setAside"] as const) for (const i of await skillsOf(ctx, w._id, status)) known.set(skillKey(i.data.name), null);
      for (const role of await itemsOf(ctx, w._id, "role", "approved")) {
        if (!role.roleKey || role.data.break) continue;
        const named = [...(role.data.skills ?? []).map((name) => ({ name, kind: "skill" as const })), ...(role.data.tools ?? []).map((name) => ({ name, kind: "tool" as const }))];
        for (const { name, kind } of named) {
          const key = skillKey(name);
          if (!key) continue;
          if (!known.has(key)) {
            known.set(key, await ctx.db.insert("items", { workspaceId: w._id, kind, status: "proposed", data: { name: name.trim(), from: { roles: [role.roleKey], projects: [], facts: [] } }, sources: [], at: Date.now() }));
            added++;
            continue;
          }
          const id = known.get(key);
          const item = id ? await ctx.db.get(id) : null;
          if (item && isSkill(item) && !item.data.from.roles.includes(role.roleKey)) await ctx.db.patch(item._id, { data: { ...item.data, from: { ...item.data.from, roles: [...item.data.from.roles, role.roleKey] } } });
        }
      }
    }
    return { added };
  },
});
