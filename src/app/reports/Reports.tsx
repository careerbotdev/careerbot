"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Command } from "@/components/CommandPalette";
import { Icons } from "@/components/icons";
import { List, ListRow } from "@/components/ListRow";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { useCommands } from "../shell/ShellContext";
import { ActivityView } from "./ActivityView";
import { Overview } from "./Overview";
import { OutcomesView } from "./OutcomesView";
import { RecordView } from "./RecordView";
import { SearchView } from "./SearchView";
import { SpendingView } from "./SpendingView";
import { PeriodSwitch } from "./ui";
import { budgetUsd, count, num, type Period, PERIODS, usd, type View, VIEWS } from "./words";

// Reports: the list of views with the period switch above it (?period=month|quarter|all), and the chosen view open
// beside it (?view=). On a phone the list comes first and a view opens full screen, with Back to the list and the
// period switch under its title.
export function Reports() {
  const size = useScreenSize();
  const small = size === "small";
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const asked = params.get("period");
  const period: Period = PERIODS.some((p) => p.value === asked) ? (asked as Period) : "month";
  const wanted = params.get("view");
  const view: View | null = VIEWS.some((v) => v.key === wanted) ? (wanted as View) : small ? null : "overview";

  const go = useCallback(
    (change: { view?: View | null; period?: Period }) => {
      const next = new URLSearchParams(params);
      if (change.view !== undefined) {
        if (change.view) next.set("view", change.view);
        else next.delete("view");
      }
      if (change.period) {
        if (change.period === "month") next.delete("period");
        else next.set("period", change.period);
      }
      const q = next.toString();
      router.push(q ? `${path}?${q}` : path, { scroll: false });
    },
    [params, router, path],
  );
  const setPeriod = useCallback((p: Period) => go({ period: p }), [go]);

  const overview = useQuery(api.reports.overview, { period });
  const activity = useQuery(api.reports.activity, { period });
  const outcomes = useQuery(api.reports.outcomes, { period });
  const lines = useMemo((): Record<View, string> => {
    const n = overview?.inPeriod;
    const budget = overview?.budget.aiMonthlyUsd ?? 0;
    const done = activity ? Object.values(activity.done).reduce((t, x) => t + x, 0) : 0;
    const failed = activity ? Object.values(activity.failed).reduce((t, x) => t + x, 0) : 0;
    const out = outcomes?.directions.reduce((t, d) => t + d.contactedOrApplied, 0) ?? 0;
    const interviewed = outcomes?.directions.reduce((t, d) => t + d.interviewed, 0) ?? 0;
    return {
      overview: n ? `${usd(n.aiUsd)} spent · ${num(n.contactedOrApplied)} contacted or applied · ${count(n.replies, "reply", "replies")}` : " ",
      spending: n ? `${usd(n.aiUsd)}${period === "month" && budget > 0 ? ` of ${budgetUsd(budget)}` : ""} · ${count(n.apolloCredits, "Apollo credit")}` : " ",
      search: n ? `${count(n.companiesFound, "company", "companies")} found · ${num(n.strongRoles)} new strong roles` : " ",
      outcomes: outcomes ? `${num(out)} contacted or applied · ${num(interviewed)} interviewed` : " ",
      record: n ? `${count(n.factsApproved, "fact")} approved` : " ",
      activity: activity ? `${num(done)} done · ${num(failed)} failed` : " ",
    };
  }, [overview, activity, outcomes, period]);

  useCommands(
    useMemo(
      (): Command[] => [
        ...VIEWS.map((v): Command => ({ id: `reports-${v.key}`, group: "Reports", label: v.title, icon: v.icon, onSelect: () => go({ view: v.key }) })),
        ...PERIODS.filter((p) => p.value !== period).map((p): Command => ({ id: `reports-period-${p.value}`, group: "Reports", label: `Show ${p.label.toLowerCase()}`, icon: "date", onSelect: () => setPeriod(p.value) })),
      ],
      [go, setPeriod, period],
    ),
  );

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Reports" />
      <div className="flex shrink-0 border-b px-4 pb-3">
        <PeriodSwitch period={period} onPeriod={setPeriod} wide={small} />
      </div>
      <List label="Reports" className="min-h-0 flex-1 overflow-y-auto p-2">
        {VIEWS.map((v) => {
          const Icon = Icons[v.icon];
          return (
            <ListRow
              key={v.key}
              title={v.title}
              line={lines[v.key]}
              selected={!small && view === v.key}
              onOpen={() => go({ view: v.key })}
              lead={
                <span className="flex size-7 items-center justify-center rounded-sm border bg-subtle text-muted">
                  <Icon aria-hidden />
                </span>
              }
              tag={small ? <Icons.goIn className="text-muted" aria-hidden /> : undefined}
            />
          );
        })}
      </List>
    </div>
  );

  const shared = { period, onPeriod: setPeriod, size };
  const item =
    view === "overview" ? <Overview {...shared} />
    : view === "spending" ? <SpendingView {...shared} />
    : view === "search" ? <SearchView {...shared} />
    : view === "outcomes" ? <OutcomesView {...shared} />
    : view === "record" ? <RecordView {...shared} />
    : view === "activity" ? <ActivityView {...shared} />
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={list} item={item} back={{ label: "Reports", onBack: () => go({ view: null }) }} />
    </div>
  );
}
