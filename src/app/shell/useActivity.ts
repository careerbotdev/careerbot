"use client";

import { useConvex, useQuery } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Job, Spend } from "@/components/Activity";
import { toast } from "@/components/Toast";
import { useNow } from "../clock";

type Row = FunctionReturnType<typeof api.activity.list>[number];
type RetryName = NonNullable<Row["retry"]>["fn"];

// The mutation that starts each kind of failed work again.
const RETRY: Record<RetryName, FunctionReference<"mutation">> = {
  "extract.start": api.extract.start,
  "goals.start": api.goals.start,
  "resume.rewrite": api.resume.rewrite,
  "resume.start": api.resume.start,
  "resume.whatsNew": api.resume.whatsNew,
  "directions.suggest": api.directions.suggest,
  "directions.detail": api.directions.detail,
  "letters.write": api.letters.write,
  "people.draft": api.people.draft,
  "followUpEmails.write": api.followUpEmails.write,
  "lineCheck.check": api.lineCheck.check,
  "factChanges.update": api.factChanges.update,
  "discovery.start": api.discovery.start,
  "enrich.start": api.enrich.start,
  "roles.start": api.roles.start,
  "insights.start": api.insights.start,
  "skills.start": api.skills.start,
  "duplicates.start": api.duplicates.start,
  "followups.start": api.followups.start,
  "conflicts.start": api.conflicts.start,
};

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// The workspace's background work for the Activity indicator and Today's Working group, and this month's spending.
export function useActivity(): { jobs: Job[] | undefined; spend: Spend | undefined } {
  const rows = useQuery(api.activity.list);
  const budget = useQuery(api.budgets.status);
  const convex = useConvex();
  const now = useNow();
  const jobs = useMemo(
    () =>
      rows?.map(
        (r): Job => ({
          id: r.id,
          label: r.label,
          state: r.state,
          detail: r.detail ?? (r.steps ? `${r.steps} ${r.steps === 1 ? "step" : "steps"} done` : undefined),
          time: r.state === "running" ? undefined : time(r.at),
          onRetry: r.retry
            ? () => {
                const { fn, args } = r.retry!;
                convex
                  .mutation(RETRY[fn], args)
                  .then(() => toast({ message: "Started again", icon: "tryAgain" }))
                  .catch((e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t start it again.", icon: "failed" }));
              }
            : undefined,
        }),
      ),
    [rows, convex],
  );
  const spend = useMemo((): Spend | undefined => {
    if (!budget) return undefined;
    const lines = [`AI $${budget.aiSpentUsd.toFixed(2)} of $${budget.aiMonthlyUsd}`];
    if (budget.apolloMonthlyCredits > 0) lines.push(`Apollo ${budget.apolloSpentCredits} of ${budget.apolloMonthlyCredits}`);
    return { period: new Date(now).toLocaleDateString("en-US", { month: "long" }), lines };
  }, [budget, now]);
  return { jobs, spend };
}
