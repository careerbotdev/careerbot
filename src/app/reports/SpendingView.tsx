"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { buttonLook } from "@/components/Button";
import { BarList, type BarRow, Bars, Chart, ChartNumber, Explained, type NumberLine } from "@/components/Chart";
import { Icons } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import type { ViewProps } from "./Overview";
import { Cell, Charts, Loading, Numbers, ViewPane } from "./ui";
import { AREA_LINES, budgetUsd, count, monthLong, monthName, num, periodWords, range, type Spending, taskName, type Unsettled, unsettledWords, usd } from "./words";

const TOP_TASKS = 7;
const RECENT_MONTHS = 6;

// AI dollars and Apollo credits: against the budgets, by month, by area and task, who started the work, Apollo credits
// by use, and by pursuit. Calls not yet settled, and ones that couldn't be, are shown apart from the totals.
export function SpendingView({ period, onPeriod, size }: ViewProps) {
  const data = useQuery(api.reports.spending, { period });
  // This month alone is one bar; the months before it show how it compares.
  const history = useQuery(api.reports.spending, period === "month" ? { period: "all" } : "skip");
  const budgets = (
    <Tooltip content="Budgets" detail="Set how much AI and Apollo may spend each month, in Settings.">
      <Link href="/settings?section=budgets" className={buttonLook("ghost", "", size === "small" ? "lg" : "md")}>
        <Icons.settings aria-hidden />
        Budgets
      </Link>
    </Tooltip>
  );
  return (
    <ViewPane title="Spending" range={data ? range(data.from, data.to) : undefined} size={size} period={period} onPeriod={onPeriod} actions={budgets}>
      {data ? <Body data={data} months={period === "month" && history ? history.months.slice(-RECENT_MONTHS) : data.months} small={size === "small"} /> : <Loading />}
    </ViewPane>
  );
}

function Body({ data, months, small }: { data: Spending; months: Spending["months"]; small: boolean }) {
  const p = data.period;
  const when = periodWords(p, data.from);
  const dates = range(data.from, data.to);
  const ai = data.months.reduce((t, m) => t + m.aiUsd, 0);
  const credits = data.months.reduce((t, m) => t + m.apolloCredits, 0);
  const aiBudget = data.budget.aiMonthlyUsd;
  const apolloBudget = data.budget.apolloMonthlyCredits;
  const month = p === "month";
  const current = months.at(-1)?.month;

  const aiLines: NumberLine[] = month || data.months.length < 2 ? [] : [{ text: `${usd(ai / data.months.length)} a month on average${aiBudget > 0 ? `, of ${budgetUsd(aiBudget)}` : ""}` }];
  const labelWidth = small ? 116 : 150;

  const tasks = new Map<string, { ai: number; credits: number; calls: number }>();
  for (const t of data.tasks) {
    const name = taskName(t.task);
    const was = tasks.get(name) ?? { ai: 0, credits: 0, calls: 0 };
    tasks.set(name, { ai: was.ai + t.aiUsd, credits: was.credits + t.apolloCredits, calls: was.calls + t.calls });
  }
  const byAi = [...tasks].filter(([, t]) => t.ai > 0).sort((a, b) => b[1].ai - a[1].ai);
  const rest = byAi.slice(TOP_TASKS);
  const taskRows: BarRow[] = byAi.slice(0, TOP_TASKS).map(([name, t]) => ({ key: name, label: name, value: t.ai, display: usd(t.ai), explain: { title: name, detail: `${usd(t.ai)} ${when}, on ${count(t.calls, "call")}.` } }));
  if (rest.length) {
    const sum = rest.reduce((n, [, t]) => n + t.ai, 0);
    taskRows.push({ key: "other", label: `${count(rest.length, "other task")}`, value: sum, display: usd(sum), explain: { title: `${count(rest.length, "other task")}`, detail: rest.map(([name, t]) => `${name} ${usd(t.ai)}`).join(", ") } });
  }
  const creditRows: BarRow[] = [...tasks]
    .filter(([, t]) => t.credits > 0)
    .sort((a, b) => b[1].credits - a[1].credits)
    .map(([name, t]) => ({ key: name, label: name, value: t.credits, display: num(t.credits), explain: { title: name, detail: `${count(t.credits, "Apollo credit")} ${when}, on ${count(t.calls, "call")}.` } }));
  const areaRows: BarRow[] = data.areas
    .filter((a) => a.aiUsd > 0)
    .sort((a, b) => b.aiUsd - a.aiUsd)
    .map((a) => ({ key: a.area, label: a.area, sub: AREA_LINES[a.area], value: a.aiUsd, display: usd(a.aiUsd), explain: { title: a.area, detail: `${usd(a.aiUsd)} ${when}, on ${count(a.calls, "call")}.`, note: AREA_LINES[a.area] } }));
  const origins = [
    { key: "automatic", label: "Automatic", note: "Work CareerBot does on its own, such as checking for new roles each day." },
    { key: "you", label: "You asked", note: "Work you started with a button." },
    { key: "unknown", label: "Before this was kept", note: "Calls from before CareerBot kept who started the work." },
  ] as const;
  const originRows: BarRow[] = origins
    .filter((o) => data.origins[o.key].aiUsd > 0)
    .map((o) => ({ key: o.key, label: o.label, value: data.origins[o.key].aiUsd, display: usd(data.origins[o.key].aiUsd), explain: { title: o.label, detail: `${usd(data.origins[o.key].aiUsd)} ${when}.`, note: o.note } }));

  return (
    <>
      <Numbers columns={2}>
        <Cell>
          <ChartNumber
            label={`AI ${when}`}
            value={usd(ai)}
            of={month && aiBudget > 0 ? `of ${budgetUsd(aiBudget)}` : undefined}
            meter={month && aiBudget > 0 ? { value: ai, max: aiBudget } : undefined}
            lines={aiLines}
            explain={{ title: "AI spending", detail: `${usd(ai)} ${when}, ${dates}.`, note: "Settled calls only." }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label={`Apollo credits ${when}`}
            value={num(credits)}
            of={month && apolloBudget > 0 ? `of ${num(apolloBudget)}` : undefined}
            meter={month && apolloBudget > 0 ? { value: credits, max: apolloBudget } : undefined}
            lines={month && apolloBudget > 0 ? [{ text: `${num(Math.max(0, apolloBudget - credits))} left this month` }] : []}
            explain={{ title: "Apollo credits", detail: `${count(credits, "credit")} ${when}, ${dates}.`, note: "Finding people is free; revealing an email costs a credit." }}
          />
        </Cell>
      </Numbers>
      <NotCounted notSettled={data.notSettled} unresolved={data.unresolved} when={when} />
      <Charts>
        <Chart
          title="AI by month"
          meta={month ? (months.length > 1 ? `last ${count(months.length, "month")}` : undefined) : p === "all" ? `since ${monthName(data.from)}` : undefined}
          legend={aiBudget > 0 ? [{ label: `Budget ${budgetUsd(aiBudget)} a month`, budget: true }] : undefined}
          empty={months.every((m) => m.aiUsd === 0) && { title: "Nothing spent yet", line: "Spending shows here after the first AI call." }}
        >
          <Bars
            label="AI by month"
            budget={aiBudget > 0 ? aiBudget : undefined}
            points={months.map((m) => ({
              key: String(m.month),
              label: monthName(m.month),
              value: m.aiUsd,
              display: usd(m.aiUsd),
              explain: {
                title: m.month === current ? `${monthLong(m.month)} so far` : monthLong(m.month),
                detail: `${usd(m.aiUsd)}${aiBudget > 0 ? ` of your ${budgetUsd(aiBudget)} budget` : ""}, on ${count(m.calls, "call")}.`,
                note: aiBudget > 0 && m.aiUsd > aiBudget ? `${usd(m.aiUsd - aiBudget)} over the budget.` : undefined,
              },
            }))}
          />
        </Chart>
        <Chart title="AI by area" meta={range(data.from, data.to)} empty={!areaRows.length && { title: "Nothing spent yet", line: "Each area's spending shows here." }}>
          <BarList label="AI by area" rows={areaRows} labelWidth={labelWidth} />
        </Chart>
        <Chart title="AI by task" meta={range(data.from, data.to)} empty={!taskRows.length && { title: "Nothing spent yet", line: "Each task's spending shows here." }}>
          <BarList label="AI by task" rows={taskRows} labelWidth={labelWidth} />
        </Chart>
        <Chart title="Who started the work" meta={range(data.from, data.to)} empty={!originRows.length && { title: "Nothing spent yet", line: "Automatic work and work you asked for show here." }}>
          <BarList label="Who started the work" rows={originRows} labelWidth={labelWidth} />
        </Chart>
        <Chart title="Apollo credits by use" meta={range(data.from, data.to)} empty={!creditRows.length && { title: "No credits used", line: "Credits show here once Apollo is used." }}>
          <BarList label="Apollo credits by use" rows={creditRows} labelWidth={labelWidth} valueWidth={40} />
        </Chart>
      </Charts>
      <ByPursuit data={data} ai={ai} credits={credits} when={when} small={small} />
    </>
  );
}

// Calls not in the totals above, each group with what's known of it.
function NotCounted({ notSettled, unresolved, when }: { notSettled: Unsettled; unresolved: Unsettled; when: string }) {
  const rows = [
    { key: "notSettled", label: "Not settled yet", u: notSettled, note: "Calls still running or waiting for their final price. They're checked each night and added to the totals once settled." },
    { key: "unresolved", label: "Unresolved", u: unresolved, note: "Calls the providers couldn't price. AI shows what's known of their cost; Apollo, the most they could cost." },
  ].filter((r) => r.u.aiCalls + r.u.apolloCalls > 0);
  if (!rows.length) return null;
  return (
    <section aria-label="Not in these totals" className="flex flex-col">
      <h3 className="pb-2 text-label leading-label font-medium text-text">Not in these totals</h3>
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-x-6 gap-y-0.5 border-t py-2.5">
          <span className="min-w-0 flex-1 text-body-sm leading-body-sm text-text">{r.label}</span>
          <Explained explain={{ title: r.label, detail: `${unsettledWords(r.u)} ${when}.`, note: r.note }} className={`text-body-sm leading-body-sm tabular-nums ${r.key === "unresolved" ? "text-caution-text" : "text-muted"}`}>
            {unsettledWords(r.u)}
          </Explained>
        </div>
      ))}
    </section>
  );
}

// Each pursuit's AI dollars and Apollo credits, then what wasn't for any pursuit.
function ByPursuit({ data, ai, credits, when, small }: { data: Spending; ai: number; credits: number; when: string; small: boolean }) {
  if (!data.pursuits.length) return null;
  const onPursuits = data.pursuits.reduce((t, x) => ({ ai: t.ai + x.aiUsd, credits: t.credits + x.apolloCredits }), { ai: 0, credits: 0 });
  const top = Math.max(...data.pursuits.map((x) => x.aiUsd), 0);
  const cell = (shown: string, title: string, detail: string) => (
    <Explained explain={{ title, detail }} className="text-body-sm leading-body-sm font-medium text-text tabular-nums">
      {shown}
    </Explained>
  );
  const row = (key: string, name: string, sub: string | null, a: number, c: number, bar: boolean) => (
    <div key={key} className="flex min-h-[52px] items-center gap-3 border-t py-2 md:gap-4">
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-body-sm leading-body-sm font-medium text-text">{name}</span>
        {sub && <span className="truncate text-label leading-label text-muted">{sub}</span>}
      </span>
      {!small && <span className="flex w-28 shrink-0">{bar && <span className="h-3 rounded-r-xs bg-steel" style={{ width: `${top > 0 ? (a / top) * 100 : 0}%` }} />}</span>}
      <span className="flex w-16 shrink-0 justify-end">{cell(usd(a), `${name}: AI`, `${usd(a)} ${when}.`)}</span>
      <span className="flex w-16 shrink-0 justify-end md:w-24">{cell(num(c), `${name}: Apollo credits`, `${count(c, "credit")} ${when}.`)}</span>
    </div>
  );
  return (
    <section aria-label="By pursuit" className="flex flex-col">
      <div className="flex items-center gap-3 pb-2 md:gap-4">
        <h3 className="flex-1 text-label leading-label font-medium text-text">By pursuit</h3>
        <span className="w-16 shrink-0 text-right text-label leading-label text-muted">AI</span>
        <span className="w-16 shrink-0 text-right text-label leading-label text-muted md:w-24">Apollo credits</span>
      </div>
      {data.pursuits.map((x) => row(String(x.pursuitId), x.title ?? "A pursuit since deleted", x.company, x.aiUsd, x.apolloCredits, true))}
      {row("all", count(data.pursuits.length, "pursuit"), null, onPursuits.ai, onPursuits.credits, false)}
      {row("none", "Not for a pursuit", "Finding and sorting roles, your record, your goals", Math.max(0, ai - onPursuits.ai), Math.max(0, credits - onPursuits.credits), false)}
    </section>
  );
}
