"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CLOSED_REASONS, REASON_LABELS } from "../../../convex/pursuitSteps";
import { BarList, type BarRow, CATEGORIES, Chart, ChartNumber, Funnel, LineChart, type Step } from "@/components/Chart";
import type { ViewProps } from "./Overview";
import { Cell, Charts, Loading, Numbers, ViewPane } from "./ui";
import { count, monthDay, num, periodWords, range, runningTotal, type Search } from "./words";

// How the search is going: companies found and targets over time, the roles ranked for each direction by fit, the
// pursuits started by direction and how far they got, why they closed, and how long companies took to answer.
export function SearchView({ period, onPeriod, size }: ViewProps) {
  const data = useQuery(api.reports.search, { period });
  return (
    <ViewPane title="Search" range={data ? range(data.from, data.to) : undefined} size={size} period={period} onPeriod={onPeriod}>
      {data ? <Body data={data} small={size === "small"} /> : <Loading />}
    </ViewPane>
  );
}

const STEPS = [
  { key: "started", label: "Started", note: "Roles you began pursuing." },
  { key: "contactedOrApplied", label: "Contacted or applied", note: "Pursuits where you wrote to someone there (Contacted) or applied (Applied). A pursuit can be both." },
  { key: "interviewing", label: "Interviewed", note: "Pursuits where a company asked you to interview." },
  { key: "offer", label: "Offer", note: "Pursuits that reached an offer." },
] as const;

function Body({ data, small }: { data: Search; small: boolean }) {
  const when = periodWords(data.period, data.from);
  const dates = range(data.from, data.to);
  const labelWidth = small ? 116 : 150;

  const roles = data.roles.map((r) => ({ ...r, shown: r.strong + r.some + r.weak + r.none }));
  const ranked = roles.reduce((n, r) => n + r.shown, 0);
  const strong = roles.reduce((n, r) => n + r.strong, 0);
  const started = data.funnel.reduce((n, f) => n + f.started, 0);
  const open = data.funnel.reduce((n, f) => n + f.open, 0);
  const closed = CLOSED_REASONS.map((reason) => ({ reason, n: data.funnel.reduce((t, f) => t + f.closed[reason], 0) })).filter((c) => c.n > 0);
  const closedTotal = closed.reduce((n, c) => n + c.n, 0);

  const foundSoFar = runningTotal(data.weeks.map((w) => w.companiesFound));
  const weekLabel = (week: number) => monthDay(Math.max(week, data.from));

  const directions = data.funnel.map((f, i) => ({ name: f.direction ?? "No direction", tone: CATEGORIES[i % CATEGORIES.length] }));
  const split = data.funnel.length > 1;
  const contacted = data.funnel.reduce((n, f) => n + f.contacted, 0);
  const applied = data.funnel.reduce((n, f) => n + f.applied, 0);
  const steps: Step[] = STEPS.map((s) => {
    const value = data.funnel.reduce((n, f) => n + f[s.key], 0);
    const detail = split
      ? data.funnel.flatMap((f, i) => (f[s.key] > 0 ? [`${directions[i].name} ${f[s.key]}`] : [])).join(", ") || `None ${when}.`
      : `${value} of the pursuits started ${when}.`;
    return {
      key: s.key,
      label: s.label,
      value,
      parts: split ? data.funnel.map((f, i) => ({ label: directions[i].name, value: f[s.key], display: String(f[s.key]), tone: directions[i].tone })) : undefined,
      explain: {
        title: s.label,
        detail: s.key === "contactedOrApplied" && value > 0 ? `${detail}${split ? "." : ""} ${contacted} contacted, ${applied} applied.` : detail,
        note: s.note,
      },
    };
  });

  const fitRows: BarRow[] = roles
    .filter((r) => r.shown > 0)
    .sort((a, b) => b.shown - a.shown)
    .map((r) => ({
      key: String(r.directionId),
      label: r.direction,
      value: r.shown,
      display: num(r.shown),
      parts: [
        { label: "Strong", value: r.strong, display: num(r.strong), tone: "good" },
        { label: "Some", value: r.some, display: num(r.some), tone: "caution" },
        { label: "Weak or none", value: r.weak + r.none, display: num(r.weak + r.none), tone: "track" },
      ],
      explain: {
        title: r.direction,
        detail: `${r.strong} strong, ${r.some} some, ${r.weak + r.none} weak or no fit, of ${count(r.shown, "role")}.`,
        note: r.against + r.sortedOut > 0 ? `Not counted: ${r.against} against a limit, ${r.sortedOut} sorted out.` : undefined,
      },
    }));

  const closedRows: BarRow[] = closed.map((c) => ({ key: c.reason, label: REASON_LABELS[c.reason], value: c.n, display: num(c.n), explain: { title: REASON_LABELS[c.reason], detail: `${count(c.n, "pursuit")} started ${when} closed this way.` } }));
  const days = data.replies.medianDays;

  return (
    <>
      <Numbers columns={4}>
        <Cell>
          <ChartNumber
            label="Companies found"
            value={num(data.companiesFound)}
            of={`${num(data.targets)} targets`}
            explain={{ title: "Companies found", detail: `${data.companiesFound} ${when}, ${dates}.`, note: `${count(data.targets, "target")} now: companies that fit your goals and are worth watching.` }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Roles ranked"
            value={num(ranked)}
            of={`${num(strong)} strong`}
            explain={{ title: "Roles ranked", detail: `${count(ranked, "role")} ranked for your directions now; ${strong} a strong fit.`, note: "Listed roles, not counting those against a limit or sorted out." }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Pursuits"
            value={num(started)}
            lines={[{ text: `${open} open, ${closedTotal} closed` }]}
            explain={{ title: "Pursuits started", detail: `${started} ${when}, ${dates}.`, note: `${open} still open, ${closedTotal} closed.` }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="First reply"
            value={days === null ? "None yet" : count(Math.round(days), "day")}
            lines={[{ text: days === null ? "No replies yet" : `Median of ${count(data.replies.count, "reply", "replies")}` }]}
            explain={{ title: "Time to first reply", detail: days === null ? `No replies ${when}.` : `Half of the ${count(data.replies.count, "reply", "replies")} ${when} came within ${count(Math.round(days), "day")} of reaching out or applying.`, note: "From your first outreach message or your application, whichever came first, to the first reply from someone at the company." }}
          />
        </Cell>
      </Numbers>
      <Chart title="Companies over time" meta="found and targets" legend={[{ label: "Found", tone: "steel" }, { label: "Targets", tone: "blue" }]} empty={!data.weeks.length && { title: "No companies yet", line: "Companies found show here each week." }}>
        <LineChart
          label="Companies found and targets, by week"
          xLabels={data.weeks.map((w) => weekLabel(w.week))}
          series={[
            { key: "found", label: "Found", tone: "steel", values: foundSoFar },
            { key: "targets", label: "Targets", tone: "blue", values: data.weeks.map((w) => w.targets) },
          ]}
          explain={(i) => ({
            title: `Week of ${weekLabel(data.weeks[i].week)}`,
            detail: `${count(foundSoFar[i], "company", "companies")} found ${when}, ${data.weeks[i].companiesFound} that week.`,
            note: `${count(data.weeks[i].targets, "target")} at the week's end: companies that fit your goals.`,
          })}
        />
      </Chart>
      <Chart title="Roles by fit" meta={`each direction · ${num(ranked)} roles, ${num(strong)} strong`} legend={[{ label: "Strong fit", tone: "good" }, { label: "Some fit", tone: "caution" }, { label: "Weak or none", tone: "track" }]} empty={!fitRows.length && { title: "No roles ranked yet", line: "Roles show here once they're ranked for your directions." }}>
        <BarList label="Roles by fit" rows={fitRows} labelWidth={labelWidth} valueWidth={40} share />
      </Chart>
      <Chart
        title={split ? "Pursuits by direction" : "Pursuits"}
        meta="started to offer"
        legend={split ? directions.map((d) => ({ label: d.name, tone: d.tone })) : undefined}
        empty={!started && { title: "No pursuits started", line: `Pursuits started ${when} show here.` }}
      >
        <Funnel label="Pursuits from started to offer" steps={steps} outcome={!split} labelWidth={small ? 84 : 148} />
      </Chart>
      <Charts>
        <Chart title="Why pursuits closed" meta={count(closedTotal, "closed", "closed")} empty={!closedRows.length && { title: "None closed", line: `Pursuits started ${when} that closed show here.` }}>
          <BarList label="Why pursuits closed" rows={closedRows} labelWidth={labelWidth} valueWidth={32} />
        </Chart>
      </Charts>
    </>
  );
}
