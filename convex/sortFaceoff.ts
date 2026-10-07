import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";
import { modelFor } from "./aiSettings";
import { chunks, d1Signals, directionsFor, JEV_NONE, JEV_PICK, JEV_RULE, JEV_RULES, JEV_WORK, jevPass, jevSignals, type JevSignals, PAGE, pool, readPostings, REPORT_BY_MS, round, type SortDirection } from "./roleSort";
import { judgeCall } from "./roles";

// One page of the workspace's open roles that have a description, with the directions they're sorted against.
export const openRoles = internalQuery({
  args: { workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const page = await ctx.db.query("postings").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).paginate(paginationOpts);
    return {
      roles: page.page.filter((p) => p.closedAt === undefined && p.hasDescription).map((p) => ({ id: p._id, companyId: p.companyId, title: p.title })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      directions: (await directionsFor(ctx, workspaceId)).map((d) => ({ id: String(d.id), name: d.name, ...(d.positioning ? { positioning: d.positioning } : {}), titles: d.titles })),
    };
  },
});

// Operator only (spike): Jev against Liquid AI's d1 on the same roles, scored against an answer key neither of them
// chose. `sample` open roles are drawn at random (whatever the last sort did with them), judged against every approved
// direction by Rank roles (the workspace's model; its cost is recorded as usage), then sorted by both with Jev's rule.
// A role "fits" a direction when judging says strong or some. Writes nothing but usage.
// `npx convex run sortFaceoff:faceoff '{"workspaceId": "...", "sample": 200}'`
export const faceoff = internalAction({
  args: { workspaceId: v.id("workspaces"), sample: v.optional(v.number()) },
  handler: async (ctx, { workspaceId: ws, sample = 200 }) => {
    const started = Date.now();
    type Open = { id: Id<"postings">; companyId: Id<"companies">; title: string };
    let open: Open[] = [];
    let directions: SortDirection[] = [];
    for (let cursor: string | null = null, done = false; !done; ) {
      const page: { roles: Open[]; isDone: boolean; continueCursor: string; directions: SortDirection[] } = await ctx.runQuery(internal.sortFaceoff.openRoles, { workspaceId: ws, paginationOpts: { numItems: PAGE, cursor } });
      open.push(...page.roles);
      directions = page.directions;
      done = page.isDone;
      cursor = page.continueCursor;
    }
    if (!open.length || !directions.length) throw new Error("No open roles or no approved directions.");
    const roles: Open[] = [];
    for (let i = 0; i < sample && open.length; i++) roles.push(open.splice(Math.floor(Math.random() * open.length), 1)[0]);
    open = [];
    const postings = await readPostings(ctx, ws, roles);

    // The answer key and both sorts, side by side.
    const truth = new Map<string, { directionId: string; level: string }[]>();
    let truthCost = 0;
    const truthErrors: string[] = [];
    const key = (async () => {
      const t = Date.now();
      await pool(chunks(roles, 5), 16, async (batch) => {
        try {
          const input = await ctx.runQuery(internal.roles.truthInput, { workspaceId: ws, ids: batch.map((r) => r.id) });
          const { results, costUsd } = await judgeCall(ctx, ws, input, "sort faceoff");
          truthCost += costUsd;
          for (const r of results) truth.set(String(r.id), r.fit.map((f) => ({ directionId: String(f.directionId), level: f.level })));
        } catch (e) {
          truthErrors.push(e instanceof Error ? e.message : String(e));
        }
      });
      return (Date.now() - t) / 1000;
    })();
    const jevChoice = await modelFor(ctx, ws, "roleSortJev");
    const jev = (async () => {
      const t = Date.now();
      const r = await jevSignals(ctx, ws, jevChoice.model, postings, directions);
      return { ...r, seconds: (Date.now() - t) / 1000 };
    })();
    const d1 = (async () => {
      const t = Date.now();
      const r = await d1Signals(postings, directions, started + REPORT_BY_MS);
      return { ...r, seconds: (Date.now() - t) / 1000 };
    })();
    const [truthSeconds, j, d] = await Promise.all([key, jev, d1]);

    // Scored on roles all three got back to.
    const scored = roles.filter((r) => truth.has(r.id) && j.signals.has(r.id) && d.signals.has(r.id));
    const fits = (id: string) => (truth.get(id) ?? []).filter((f) => f.level === "strong" || f.level === "some");
    const pairs = scored.flatMap((r) => fits(r.id).map((f) => ({ r, f })));
    const strong = pairs.filter((x) => x.f.level === "strong");
    const fitting = scored.filter((r) => fits(r.id).length);
    const unfit = scored.filter((r) => !fits(r.id).length);
    const names = new Map(directions.map((dd) => [dd.id, dd.name]));
    const report = (signals: Map<string, JevSignals>, seconds: number, costUsd: number) => {
      const res = jevPass(signals, directions, JEV_RULE);
      const kept = (x: (typeof pairs)[number]) => !!res.get(x.r.id)?.includes(x.f.directionId);
      const passed = scored.filter((r) => res.get(r.id)?.length);
      return {
        seconds,
        costUsd: Math.round(costUsd * 1e6) / 1e6,
        recall: pairs.length ? round(pairs.filter(kept).length / pairs.length) : null,
        recallStrong: strong.length ? round(strong.filter(kept).length / strong.length) : null,
        roleRecall: fitting.length ? round(fitting.filter((r) => res.get(r.id)?.length).length / fitting.length) : null,
        passed: scored.length ? round(passed.length / scored.length) : null,
        directionsPerPassed: passed.length ? round(passed.reduce((n, r) => n + res.get(r.id)!.length, 0) / passed.length) : 0,
        passedWithoutFit: unfit.length ? round(unfit.filter((r) => res.get(r.id)?.length).length / unfit.length) : null,
        otherRules: JEV_RULES.map(([rule, pass]) => {
          const r2 = jevPass(signals, directions, pass);
          const k2 = (x: (typeof pairs)[number]) => !!r2.get(x.r.id)?.includes(x.f.directionId);
          return { rule, recall: pairs.length ? round(pairs.filter(k2).length / pairs.length) : null, passed: scored.length ? round(scored.filter((r) => r2.get(r.id)?.length).length / scored.length) : null };
        }),
        misses: pairs.filter((x) => !kept(x)).slice(0, 8).map(({ r, f }) => ({ title: r.title, direction: names.get(f.directionId) ?? f.directionId, level: f.level, none: round(signals.get(r.id)!.none) })),
        res,
      };
    };
    const jr = report(j.signals, j.seconds, j.costUsd);
    const dr = report(d.signals, d.seconds, 0);
    // How often the two send a role on (to any direction) alike.
    const agree = scored.filter((r) => !!jr.res.get(r.id)?.length === !!dr.res.get(r.id)?.length).length;
    const strip = ({ res: _res, ...rest }: ReturnType<typeof report>) => rest;
    return {
      sampled: roles.length,
      scored: scored.length,
      directions: directions.length,
      fitPairs: pairs.length,
      strongPairs: strong.length,
      rolesWithAFit: fitting.length,
      answerKey: { model: (await modelFor(ctx, ws, "companies")).model, seconds: truthSeconds, costUsd: Math.round(truthCost * 1e6) / 1e6, failedBatches: truthErrors.length, errors: [...new Set(truthErrors)].slice(0, 3) },
      rule: `none < ${JEV_NONE}, then pick >= ${JEV_PICK} or work >= ${JEV_WORK}`,
      jev: { model: jevChoice.model, ...strip(jr) },
      d1: { model: "d1:free", failed: d.errors.length, errors: [...new Set(d.errors)].slice(0, 3), inputTokens: d.inputTokens, ...strip(dr) },
      passAgreement: scored.length ? round(agree / scored.length) : null,
      totalSeconds: (Date.now() - started) / 1000,
    };
  },
});
