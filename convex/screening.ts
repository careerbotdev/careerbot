import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { chatJson } from "./metering";
import { replyOf, string } from "./replyJson";
import { requireWorkspace } from "./workspaces";

// Sorts found companies into places to work and everything else (recruiters, job boards, associations, government,
// schools, media, investors). Clear cases by rule, the rest by a cheap AI read of name and website. Nothing is deleted:
// screened-out companies stay visible and can be restored. Costs no Apollo credits.

export const KINDS = ["employer", "staffing or recruiting", "job board", "association", "government", "education", "media", "investor", "other non-employer"] as const;

const RULES: [RegExp, (typeof KINDS)[number]][] = [
  [/\b(staffing|recruit(ing|ment|ers?)|talent (partners|solutions|acquisition)|executive search|headhunt)/i, "staffing or recruiting"],
  [/\b(jobs?|careers?|lowongan|vacanc(y|ies)|hiring board)\b/i, "job board"],
  [/\b(association|federation|council|chamber of commerce|society)\b/i, "association"],
  [/\b(authority|ministry|department of|government|municipal|unesco|united nations)\b/i, "government"],
  [/\b(university|college|school|academy|institute of technology)\b/i, "education"],
  [/\b(ventures|capital partners|venture capital)\b/i, "investor"],
];
const DOMAIN_RULES: [RegExp, (typeof KINDS)[number]][] = [
  [/\.(gov|mil)(\.[a-z]{2})?$/, "government"],
  [/\.edu(\.[a-z]{2})?$/, "education"],
];

export function ruleKind(name: string, domain?: string): (typeof KINDS)[number] | null {
  for (const [re, k] of DOMAIN_RULES) if (domain && re.test(domain)) return k;
  for (const [re, k] of RULES) if (re.test(name)) return k;
  return null;
}

const SYSTEM = `You sort companies for a job seeker: is each one a place they could work in a normal full-time role (an operating company that builds or sells a product or service), or something else? Judge from the name and website only; when unsure, it's an employer. Kinds: ${KINDS.map((k) => `"${k}"`).join(", ")}. A consulting firm, agency or services company is an "employer". Reply with JSON only: {"companies":[{"id": "...", "kind": "..."}]}.`;
export const SCREEN_SCHEMA = replyOf("screen_companies", "companies", { id: string, kind: string });

export const unscreened = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) =>
    (await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      .filter((c) => !c.screened)
      .map((c) => ({ id: c._id, name: c.name, domain: c.domain })),
});

export const mark = internalMutation({
  args: { workspaceId: v.id("workspaces"), marks: v.array(v.object({ id: v.id("companies"), kind: v.string(), by: v.union(v.literal("rule"), v.literal("ai")) })) },
  handler: async (ctx, { workspaceId, marks }) => {
    for (const m of marks) {
      const c = await ctx.db.get(m.id);
      // A person's own call always stands.
      if (!c || c.workspaceId !== workspaceId || c.screened?.by === "you") continue;
      const kind = (KINDS as readonly string[]).includes(m.kind) ? m.kind : "employer";
      // Screened out: nothing more to check, so it's no longer waiting.
      await ctx.db.patch(m.id, { screened: { employer: kind === "employer", kind, by: m.by, at: Date.now() }, ...(kind === "employer" ? {} : { recheckAt: undefined }) });
    }
  },
});

// Screens every company not yet screened. Called at the end of each discovery run.
export async function screenCompanies(ctx: ActionCtx, workspaceId: Id<"workspaces">) {
  const todo = await ctx.runQuery(internal.screening.unscreened, { workspaceId });
  const byRule = todo.flatMap((c) => {
    const k = ruleKind(c.name, c.domain);
    return k ? [{ id: c.id, kind: k, by: "rule" as const }] : [];
  });
  if (byRule.length) await ctx.runMutation(internal.screening.mark, { workspaceId, marks: byRule });
  const rest = todo.filter((c) => !byRule.some((r) => r.id === c.id));
  let costUsd = 0;
  const choice = rest.length ? await modelFor(ctx, workspaceId, "companies") : null;
  for (let i = 0; i < rest.length && choice; i += 150) {
    const batch = rest.slice(i, i + 150);
    const reply = await chatJson<{ companies?: { id?: string; kind?: string }[] }>(ctx, {
      workspaceId,
      purpose: "screen companies",
      model: choice.model,
      reasoning: choice.reasoning,
      schema: SCREEN_SCHEMA,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(batch.map((c) => ({ id: c.id, name: c.name, website: c.domain }))) },
      ],
    });
    costUsd += reply.costUsd;
    const out = reply.out;
    const ids = new Set(batch.map((c) => String(c.id)));
    const marks = (out.companies ?? []).filter((x) => x.id && ids.has(x.id)).map((x) => ({ id: x.id as Id<"companies">, kind: x.kind ?? "employer", by: "ai" as const }));
    if (marks.length) await ctx.runMutation(internal.screening.mark, { workspaceId, marks });
  }
  return { byRule: byRule.length, byAi: rest.length, costUsd };
}

// Their own call: restore a screened-out company, or set one aside (its roles are no longer listed).
export const setEmployer = mutation({
  args: { id: v.id("companies"), employer: v.boolean() },
  handler: async (ctx, { id, employer }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new Error("Not found.");
    await ctx.db.patch(id, { screened: { employer, kind: employer ? "employer" : "other non-employer", by: "you", at: Date.now() } });
    await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId, companyId: id });
  },
});
