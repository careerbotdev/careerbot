"use client";

import { useConvex, useQuery } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useCallback, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  "resume.voiceExample": api.resume.voiceExample,
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

// A failure toast: the server's own words when it gave some, else `fallback`.
const failed = (fallback: string) => (e: unknown) => toast({ message: e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback, icon: "failed" });

// The workspace's background work for the Activity indicator and Today's Working group, and this month's spending.
// Deleting or resetting the account shows first, from its own row (convex/accountDelete.ts, accountReset.ts), as the
// workspace's work goes with it. Running work can be cancelled; finished work cleared off the list, one at a time or
// all at once (onClearFinished), with Undo.
export function useActivity(): { jobs: Job[] | undefined; spend: Spend | undefined; onClearFinished: () => void } {
  const rows = useQuery(api.activity.list);
  const deletion = useQuery(api.accountDelete.status)?.deletion;
  const reset = useQuery(api.accountReset.status)?.reset;
  const budget = useQuery(api.budgets.status);
  const convex = useConvex();
  const now = useNow();
  // A clear's toast: how many it took off, with Undo (U) putting them back.
  const cleared = useCallback(
    (clearing: Promise<Id<"jobs">[]>) =>
      clearing
        .then((ids) => {
          if (!ids.length) return;
          toast({
            message: `Cleared ${ids.length} finished`,
            icon: "activity",
            action: { label: "Undo", key: "U", run: () => void convex.mutation(api.activity.restore, { jobIds: ids }).catch(failed("Couldn’t put them back.")) },
          });
        })
        .catch(failed("Couldn’t clear them.")),
    [convex],
  );
  const jobs = useMemo(() => {
    const deleting: Job[] =
      deletion && deletion.step !== "done" ? [{ id: "account-deletion", label: "Deleting your account", state: "running", detail: `${deletion.deleted.toLocaleString("en-US")} items deleted` }] : [];
    if (reset && reset.step !== "done")
      deleting.push({ id: "account-reset", label: "Resetting your account", state: "running", detail: `${reset.cleared.toLocaleString("en-US")} of ${reset.total.toLocaleString("en-US")} items cleared` });
    const work = rows?.map(
      (r): Job => ({
        id: r.id,
        label: r.label,
        state: r.state,
        detail: r.detail ?? (r.steps ? `${r.steps} ${r.steps === 1 ? "step" : "steps"} done` : undefined),
        time: time(r.at),
        waiting: r.waiting,
        onRetry: r.retry
          ? () => {
              const { fn, args } = r.retry!;
              convex
                .mutation(RETRY[fn], args)
                .then(() => toast({ message: "Started again", icon: "tryAgain" }))
                .catch(failed("Couldn’t start it again."));
            }
          : undefined,
        onCancel: r.state === "running" ? () => void convex.mutation(api.jobs.cancel, { jobId: r.id }).catch(failed("Couldn’t cancel it.")) : undefined,
        onClear: r.state === "running" ? undefined : () => void cleared(convex.mutation(api.activity.clear, { jobId: r.id })),
      }),
    );
    return work && [...deleting, ...work];
  }, [rows, deletion, reset, convex, cleared]);
  const onClearFinished = useCallback(() => void cleared(convex.mutation(api.activity.clearFinished, {})), [convex, cleared]);
  const spend = useMemo((): Spend | undefined => {
    if (!budget) return undefined;
    const lines = [`AI $${budget.aiSpentUsd.toFixed(2)} of $${budget.aiMonthlyUsd}`];
    if (budget.apolloMonthlyCredits > 0) lines.push(`Apollo ${budget.apolloSpentCredits} of ${budget.apolloMonthlyCredits}`);
    return { period: new Date(now).toLocaleDateString("en-US", { month: "long" }), lines };
  }, [budget, now]);
  return { jobs, spend, onClearFinished };
}
