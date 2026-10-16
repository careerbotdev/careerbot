"use client";

import Link from "next/link";
import type { BudgetStatus } from "../../../convex/budgets";
import { buttonLook } from "@/components/Button";
import { Icons } from "@/components/icons";
import { clockNow } from "../clock";
import { Notice } from "../goals/ui";
import { SUPPORT_EMAIL } from "../site/words";

// CareerBot's AI on careerbot.dev (convex/plan.ts): a workspace without an OpenRouter key of its own runs on CareerBot's
// key within a monthly allowance. When that's used up, Settings (Budgets and spending) and Today say so, with what they
// can do: wait for the month to turn, ask for more, or add their own key.

// AI spend is counted by UTC month; it starts again on the first.
export const nextMonth = () => {
  const now = new Date(clockNow());
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
};
export const resetDay = () => new Date(nextMonth()).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// On CareerBot's AI, whether the allowance is what limits AI work (no lower budget of their own).
export const onAllowance = (s: BudgetStatus | undefined) => s?.plan?.source === "platform" && s.aiMonthlyUsd === s.plan.allowanceUsd;

// Why AI work is paused on CareerBot's AI, or null: their allowance is used up, or CareerBot's AI as a whole is.
export function allowanceReached(s: BudgetStatus | undefined): "allowance" | "platform" | null {
  if (!s || s.plan?.source !== "platform") return null;
  if (onAllowance(s) && s.aiSpentUsd >= s.aiMonthlyUsd) return "allowance";
  return s.plan.platformUsedUp ? "platform" : null;
}

export function AllowanceNotice({ status, size = "md" }: { status: BudgetStatus | undefined; size?: "md" | "lg" }) {
  const reached = allowanceReached(status);
  if (!reached) return null;
  return (
    <Notice
      tone="caution"
      title={reached === "allowance" ? "This month’s AI allowance is used up" : "CareerBot’s AI is used up for this month"}
      actions={
        <>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("More AI allowance")}`} className={buttonLook("secondary", "", size)}>
            <Icons.email aria-hidden="true" />
            Ask for more
          </a>
          <Link href="/settings?section=connections" className={buttonLook("secondary", "", size)}>
            <Icons.goIn aria-hidden="true" />
            Add your own key
          </Link>
        </>
      }
    >
      AI work is paused and picks up again on {resetDay()}. To keep going sooner, ask for more or add your own OpenRouter key.
    </Notice>
  );
}
