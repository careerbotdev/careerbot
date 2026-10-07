"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ChartNumber, Explained, type NumberLine, Sparkline } from "@/components/Chart";
import type { ScreenSize } from "@/components/Panes";
import { Cell, Loading, Numbers, ViewPane } from "./ui";
import { budgetUsd, count, monthDay, num, type Overview as OverviewReport, type Period, periodWords, range, runningTotal, unsettledWords, usd } from "./words";

export type ViewProps = { period: Period; onPeriod: (p: Period) => void; size: ScreenSize };

const DAY = 86_400_000;

// This period's numbers, then everything since the workspace began, each with what this period added.
export function Overview({ period, onPeriod, size }: ViewProps) {
  const data = useQuery(api.reports.overview, { period });
  const record = useQuery(api.reports.record, { period: "all" });
  const search = useQuery(api.reports.search, { period: "all" });
  const spending = useQuery(api.reports.spending, { period: "all" });
  return (
    <ViewPane title="Overview" range={data ? range(data.from, data.to) : undefined} size={size} period={period} onPeriod={onPeriod}>
      {data ? (
        <>
          <PeriodNumbers data={data} />
          <SinceStart
            data={data}
            small={size === "small"}
            sparks={{
              factsApproved: record ? runningTotal(record.weeks.map((w) => w.factsApproved)) : [],
              companiesFound: search ? runningTotal(search.weeks.map((w) => w.companiesFound)) : [],
              aiUsd: spending ? runningTotal(spending.months.map((m) => m.aiUsd)) : [],
            }}
          />
        </>
      ) : (
        <Loading />
      )}
    </ViewPane>
  );
}

function PeriodNumbers({ data }: { data: OverviewReport }) {
  const p = data.period;
  const when = periodWords(p, data.from);
  const dates = range(data.from, data.to);
  const n = data.inPeriod;
  const budget = data.budget;
  const monthly = p === "month" && budget.aiMonthlyUsd > 0;
  const lines: NumberLine[] = [];
  if (p === "month") {
    const end = new Date(data.from);
    const days = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = Math.max(1, (data.to - data.from) / DAY);
    const pace = (n.aiUsd / elapsed) * days;
    const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), days);
    lines.push(monthly && pace > budget.aiMonthlyUsd ? { text: `On pace for ${usd(pace)} by ${monthDay(last)}, over the budget`, tone: "caution" } : { text: `On pace for ${usd(pace)} by ${monthDay(last)}` });
  }
  lines.push({ text: p === "month" && budget.apolloMonthlyCredits > 0 ? `Apollo: ${n.apolloCredits} of ${count(budget.apolloMonthlyCredits, "credit")}` : `Apollo: ${count(n.apolloCredits, "credit")}` });
  if (n.notSettled.aiCalls + n.notSettled.apolloCalls > 0) lines.push({ text: `Not settled yet: ${unsettledWords(n.notSettled)}` });
  if (n.unresolved.aiCalls + n.unresolved.apolloCalls > 0) lines.push({ text: `Unresolved: ${unsettledWords(n.unresolved)}`, tone: "caution" });

  return (
    <Numbers>
      <Cell>
        <ChartNumber
          label="Spent"
          value={usd(n.aiUsd)}
          of={monthly ? `of ${budgetUsd(budget.aiMonthlyUsd)}` : undefined}
          meter={monthly ? { value: n.aiUsd, max: budget.aiMonthlyUsd } : undefined}
          lines={lines}
          explain={{
            title: "AI spending",
            detail: `${usd(n.aiUsd)} ${when}, ${dates}${monthly ? `, of your ${budgetUsd(budget.aiMonthlyUsd)} monthly budget` : ""}.`,
            note: "Settled calls only. Calls still waiting for their price, and any the providers couldn't price, are listed apart.",
          }}
        />
      </Cell>
      <Cell>
        <ChartNumber label="Pursuits started" value={num(n.pursuitsStarted)} explain={{ title: "Pursuits started", detail: `${n.pursuitsStarted} ${when}, ${dates}.`, note: "Roles you began pursuing." }} />
      </Cell>
      <Cell>
        <ChartNumber
          label="Contacted or applied"
          value={num(n.contactedOrApplied)}
          lines={[{ text: `${num(n.contacted)} contacted · ${num(n.applied)} applied` }]}
          explain={{
            title: "Contacted or applied",
            detail: `${n.contactedOrApplied} ${when}, ${dates}: ${n.contacted} contacted, ${n.applied} applied.`,
            note: "Pursuits you wrote to someone at or applied to, each counted on the day of the first outreach message or the application, whichever came first. A pursuit can be both.",
          }}
        />
      </Cell>
      <Cell>
        <ChartNumber
          label="Replies"
          value={num(n.replies)}
          explain={{ title: "Replies", detail: `${n.replies} ${when}, ${dates}.`, note: "The first reply from someone at the company: a contact who wrote back, a conversation, an interview, an offer, or a no." }}
        />
      </Cell>
      <Cell>
        <ChartNumber
          label="New strong roles"
          value={num(n.strongRoles)}
          explain={{ title: "New strong roles", detail: `${n.strongRoles} ${when}, ${dates}.`, note: "Roles ranked a strong fit for one of your directions." }}
        />
      </Cell>
      <Cell>
        <ChartNumber label="Facts approved" value={num(n.factsApproved)} explain={{ title: "Facts approved", detail: `${n.factsApproved} ${when}, ${dates}.`, note: "Facts you approved for your record." }} />
      </Cell>
    </Numbers>
  );
}

type Row = { key: string; label: string; sub?: string; total: number; added: number; show: (n: number) => string; spark?: number[]; good?: boolean; what: string };

function SinceStart({ data, small, sparks }: { data: OverviewReport; small: boolean; sparks: { factsApproved: number[]; companiesFound: number[]; aiUsd: number[] } }) {
  const s = data.sinceBegan;
  const n = data.inPeriod;
  const began = monthDay(data.began);
  const all = data.period === "all";
  const addedWords = data.period === "month" ? "This month" : "This quarter";
  const rows: Row[] = [
    { key: "facts", label: "Facts approved", total: s.factsApproved, added: n.factsApproved, show: num, spark: sparks.factsApproved, good: true, what: "Facts you approved for your record." },
    { key: "companies", label: "Companies found", total: s.companiesFound, added: n.companiesFound, show: num, spark: sparks.companiesFound, what: "Companies found for your directions." },
    { key: "strong", label: "Strong roles", total: s.strongRoles, added: n.strongRoles, show: num, what: "Roles ranked a strong fit for one of your directions." },
    { key: "pursuits", label: "Pursuits started", total: s.pursuitsStarted, added: n.pursuitsStarted, show: num, what: "Roles you began pursuing." },
    { key: "out", label: "Contacted or applied", sub: `${num(s.contacted)} contacted · ${num(s.applied)} applied`, total: s.contactedOrApplied, added: n.contactedOrApplied, show: num, what: "Pursuits you wrote to someone at or applied to. A pursuit can be both." },
    { key: "replies", label: "Replies", total: s.replies, added: n.replies, show: num, good: true, what: "The first reply from someone at the company." },
    { key: "spent", label: "Spent", sub: `AI ${usd(s.aiUsd)} · Apollo ${count(s.apolloCredits, "credit")}`, total: s.aiUsd, added: n.aiUsd, show: usd, spark: sparks.aiUsd, what: "AI spending on settled calls." },
  ];
  return (
    <section aria-label="Since you started" className="flex flex-col">
      <div className="flex items-center gap-4 pb-2 md:gap-6">
        <h3 className="flex-1 text-label leading-label font-medium text-text">Since you started</h3>
        <span className={`shrink-0 text-right text-label leading-label text-muted tabular-nums ${small ? "" : "w-[232px]"}`}>{small ? began : `${began} to ${monthDay(data.to)}`}</span>
        {!all && !small && <span className="w-[120px] shrink-0 text-right text-label leading-label text-muted">{addedWords}</span>}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex min-h-[46px] items-center gap-4 border-t py-2.5 md:gap-6">
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-body-sm leading-body-sm font-medium text-text">{r.label}</span>
            {r.sub && <span className="truncate text-label leading-label text-muted tabular-nums">{r.sub}</span>}
          </span>
          {r.spark && r.spark.length > 1 ? <Sparkline label={`${r.label} since ${began}`} values={r.spark} tone={r.good ? "good" : "steel"} width={small ? 72 : 120} height={24} /> : <span className={small ? "w-[72px]" : "w-[120px]"} />}
          <span className={`flex shrink-0 justify-end ${small ? "w-14" : "w-22"}`}>
            <Explained explain={{ title: r.label, detail: `${r.show(r.total)} since ${began}.`, note: r.what }} className="text-title-md leading-title-md font-semibold text-text tabular-nums">
              {r.show(r.total)}
            </Explained>
          </span>
          {!all && (
            <span className={`flex shrink-0 justify-end ${small ? "w-14" : "w-[120px]"}`}>
              <Explained explain={{ title: `${r.label}, ${addedWords.toLowerCase()}`, detail: `${r.show(r.added)} ${periodWords(data.period, data.from)}, ${range(data.from, data.to)}.` }} className="text-body-sm leading-body-sm text-muted tabular-nums">
                +{r.show(r.added)}
              </Explained>
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
