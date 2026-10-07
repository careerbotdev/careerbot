"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BarList, type BarRow, Bars, Chart, ChartNumber } from "@/components/Chart";
import type { ViewProps } from "./Overview";
import { Cell, Loading, Numbers, ViewPane } from "./ui";
import { type ActivityReport, count, kindName, monthDay, num, periodWords, range } from "./words";

// Background work done and failed, by kind and by week.
export function ActivityView({ period, onPeriod, size }: ViewProps) {
  const data = useQuery(api.reports.activity, { period });
  return (
    <ViewPane title="Activity" range={data ? range(data.from, data.to) : undefined} size={size} period={period} onPeriod={onPeriod}>
      {data ? <Body data={data} small={size === "small"} /> : <Loading />}
    </ViewPane>
  );
}

const total = (byKind: Record<string, number>) => Object.values(byKind).reduce((n, x) => n + x, 0);

function Body({ data, small }: { data: ActivityReport; small: boolean }) {
  const when = periodWords(data.period, data.from);
  const dates = range(data.from, data.to);
  const done = total(data.done);
  const failed = total(data.failed);
  const share = done + failed > 0 ? Math.round((failed / (done + failed)) * 100) : 0;
  const weekLabel = (week: number) => monthDay(Math.max(week, data.from));

  // Work by the name it's shown under; two kinds can share one ("Finding companies").
  const kinds = new Map<string, { done: number; failed: number }>();
  for (const outcome of ["done", "failed"] as const)
    for (const [kind, n] of Object.entries(data[outcome])) {
      const k = kinds.get(kindName(kind)) ?? { done: 0, failed: 0 };
      k[outcome] += n;
      kinds.set(kindName(kind), k);
    }
  const rows: BarRow[] = [...kinds]
    .sort((a, b) => b[1].done + b[1].failed - (a[1].done + a[1].failed))
    .map(([name, k]) => ({
      key: name,
      label: name,
      value: k.done + k.failed,
      display: num(k.done + k.failed),
      parts: [
        { label: "Done", value: k.done, display: num(k.done), tone: "good" },
        { label: "Failed", value: k.failed, display: num(k.failed), tone: "red" },
      ],
      explain: { title: name, detail: `${k.done} done, ${k.failed} failed ${when}.` },
    }));

  return (
    <>
      <Numbers columns={3}>
        <Cell>
          <ChartNumber label="Done" value={num(done)} explain={{ title: "Work done", detail: `${count(done, "piece")} of background work finished ${when}, ${dates}.`, note: "Reading, finding, ranking and writing that ran in the background." }} />
        </Cell>
        <Cell>
          <ChartNumber
            label="Failed"
            value={num(failed)}
            lines={failed ? [{ text: `${share}% of the work`, tone: "problem" }] : [{ text: "Nothing failed" }]}
            explain={{ title: "Work failed", detail: `${count(failed, "piece")} of work stopped with a problem ${when}, ${dates}.`, note: "Failed work can be tried again from the activity list." }}
          />
        </Cell>
        <Cell>
          <ChartNumber label="Kinds of work" value={num(kinds.size)} explain={{ title: "Kinds of work", detail: `${count(kinds.size, "kind")} of background work ran ${when}.` }} />
        </Cell>
      </Numbers>
      <Chart title="Work by kind" meta={`${range(data.from, data.to)} · ${num(done + failed)}`} legend={[{ label: "Done", tone: "good" }, { label: "Failed", tone: "red" }]} empty={!rows.length && { title: "No work yet", line: `Background work ${when} shows here.` }}>
        <BarList label="Work by kind" rows={rows} labelWidth={small ? 120 : 170} valueWidth={32} />
      </Chart>
      <Chart title="Work by week" meta={`${when}`} legend={[{ label: "Done", tone: "good" }, { label: "Failed", tone: "red" }]} empty={!rows.length && { title: "No work yet", line: `Background work ${when} shows here.` }}>
        <Bars
          label="Work by week"
          points={data.weeks.map((w) => {
            const d = total(w.done);
            const f = total(w.failed);
            const failedKinds = Object.entries(w.failed).map(([k, n]) => `${kindName(k).toLowerCase()} ${n}`);
            return {
              key: String(w.week),
              label: weekLabel(w.week),
              value: d + f,
              display: num(d + f),
              parts: [
                { label: "Done", value: d, display: num(d), tone: "good" },
                { label: "Failed", value: f, display: num(f), tone: "red" },
              ],
              explain: { title: `Week of ${weekLabel(w.week)}`, detail: `${count(d + f, "piece")} of work: ${d} done, ${f} failed.`, note: failedKinds.length ? `Failed: ${failedKinds.join(", ")}.` : undefined },
            };
          })}
        />
      </Chart>
    </>
  );
}
