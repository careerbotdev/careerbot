"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { ApolloBalance } from "../../../convex/apolloKey";
import { buttonLook } from "@/components/Button";
import { Icons } from "@/components/icons";
import { NumberField } from "@/components/NumberField";
import type { ScreenSize } from "@/components/Panes";
import { ProgressBar } from "@/components/Progress";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Text } from "@/components/Text";
import { clockNow } from "../clock";
import { GroupHead, monthDay, Rows, saved, SettingRow, SettingsPane } from "./ui";

// The month's AI budget and the Apollo credits set aside, each with what's been spent against it, and whether Apollo
// work runs on its own. Each change saves as it's made, with Undo.

type Budget = { aiMonthlyUsd: number; apolloMonthlyCredits: number; apolloMode: "on" | "onRequest" | "paused" };

const MODES = [
  { value: "on", label: "On" },
  { value: "onRequest", label: "Only when I ask" },
  { value: "paused", label: "Paused" },
] as const;

export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
// AI spend is counted by UTC month; it starts again on the first.
const nextMonth = () => {
  const now = new Date(clockNow());
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
};

export function Budgets({ size }: { size: ScreenSize }) {
  const status = useQuery(api.budgets.status);
  const apolloKey = useQuery(api.apolloKey.status);
  const readBalance = useAction(api.apolloKey.balance);
  const set = useMutation(api.budgets.set);
  const [balance, setBalance] = useState<ApolloBalance | null>();
  const hasApollo = !!apolloKey?.set;
  useEffect(() => {
    if (hasApollo) void readBalance({}).then(setBalance, () => setBalance(null));
  }, [hasApollo, readBalance]);
  if (!status) return <SettingsPane title="Budgets and spending" size={size}>{null}</SettingsPane>;

  const now: Budget = { aiMonthlyUsd: status.aiMonthlyUsd, apolloMonthlyCredits: status.apolloMonthlyCredits, apolloMode: status.apolloMode };
  const change = (next: Partial<Budget>, message: string) => {
    void set({ ...now, ...next }).then(() => saved(message, () => void set(now)));
  };
  const credits = status.apolloMonthlyCredits;
  const renews = balance?.cycleEnd ? ` · renews ${monthDay(balance.cycleEnd)}` : "";

  return (
    <SettingsPane title="Budgets and spending" size={size}>
      <section aria-label="AI" className="flex flex-col">
        <GroupHead label="AI" />
        <Meter
          label="AI budget"
          amount={usd(status.aiSpentUsd)}
          of={status.aiMonthlyUsd > 0 ? `spent of ${usd(status.aiMonthlyUsd)} this month` : "spent this month"}
          side={`Resets ${new Date(nextMonth()).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
          value={status.aiSpentUsd}
          max={status.aiMonthlyUsd}
        />
        <Rows>
          <SettingRow
            title="Monthly budget"
            line={status.aiMonthlyUsd > 0 ? "AI work pauses when it’s reached and picks up again when you raise it." : "No AI work runs until you set one."}
            control={
              <NumberField
                label="Monthly AI budget"
                hideLabel
                currency
                min={0}
                example={25}
                value={status.aiMonthlyUsd}
                onChange={(n) => change({ aiMonthlyUsd: n ?? 0 }, `AI budget set to ${usd(n ?? 0)} a month`)}
                className="w-28"
              />
            }
          />
        </Rows>
      </section>
      <section aria-label="Apollo" className="flex flex-col">
        <GroupHead label="Apollo" />
        <Meter
          label="Apollo credits"
          amount={status.apolloSpentCredits.toLocaleString("en-US")}
          of={credits > 0 ? `of ${credits.toLocaleString("en-US")} credits used this cycle` : "credits used this cycle"}
          side={balance ? `${balance.left.toLocaleString("en-US")} left in your plan${renews}` : undefined}
          value={status.apolloSpentCredits}
          max={credits > 0 ? credits : (balance?.limit ?? 0)}
        />
        <Rows>
          <SettingRow
            title="Credits set aside each month"
            line="0 lets CareerBot use whatever is left in your Apollo plan. Never more than that."
            control={
              <NumberField
                label="Apollo credits set aside"
                hideLabel
                unit="credits"
                min={0}
                example={400}
                value={credits}
                onChange={(n) => change({ apolloMonthlyCredits: n ?? 0 }, `Apollo credits set aside: ${(n ?? 0).toLocaleString("en-US")}`)}
                className="w-36"
              />
            }
          />
          <SettingRow
            title="Automated Apollo work"
            line="Finding companies, their details and job postings on its own, within the credits above."
            control={
              <SegmentedControl
                label="Automated Apollo work"
                hideLabel
                value={status.apolloMode}
                onChange={(apolloMode) => change({ apolloMode }, `Automated Apollo work: ${MODES.find((m) => m.value === apolloMode)?.label}`)}
                options={MODES}
              />
            }
          />
        </Rows>
      </section>
      <div className="flex flex-col gap-3 border-t pt-4 @lg:flex-row @lg:items-start @lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text className="font-medium">Spending by month, task and pursuit</Text>
          <Text size="sm" muted>
            Every call and credit, with what it was for.
          </Text>
        </div>
        <Link href="/reports?view=spending" className={buttonLook("secondary", "self-start", size === "small" ? "lg" : "md")}>
          <Icons.openElsewhere aria-hidden="true" />
          Open Reports
        </Link>
      </div>
    </SettingsPane>
  );
}

// What's been spent against a budget: the amount large, what it's out of, a note at the right, and the bar.
function Meter({ label, amount, of, side, value, max }: { label: string; amount: string; of: string; side?: string; value: number; max: number }) {
  return (
    <div className="flex flex-col gap-2 pb-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-title-lg leading-title-lg font-semibold tracking-title-lg text-text tabular-nums">{amount}</span>
        <Text size="sm" muted as="span">
          {of}
        </Text>
        {side && (
          <Text size="sm" muted as="span" className="@lg:ml-auto">
            {side}
          </Text>
        )}
      </div>
      {max > 0 && <ProgressBar label={label} value={value} max={max} status={value >= max ? "stopped" : "running"} valueText={`${amount} ${of}`} />}
    </div>
  );
}
