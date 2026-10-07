"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Bars, Chart, ChartNumber } from "@/components/Chart";
import type { ViewProps } from "./Overview";
import { Cell, Charts, Loading, Numbers, ViewPane } from "./ui";
import { count, monthDay, num, periodWords, range, type RecordReport } from "./words";

// How the record grew: stories written, facts and insights approved, and resume versions kept, by week.
export function RecordView({ period, onPeriod, size }: ViewProps) {
  const data = useQuery(api.reports.record, { period });
  return (
    <ViewPane title="Record" range={data ? range(data.from, data.to) : undefined} size={size} period={period} onPeriod={onPeriod}>
      {data ? <Body data={data} /> : <Loading />}
    </ViewPane>
  );
}

function Body({ data }: { data: RecordReport }) {
  const when = periodWords(data.period, data.from);
  const dates = range(data.from, data.to);
  const sum = (key: "stories" | "factsApproved" | "insightsApproved" | "resumeKept" | "resumeUpdated" | "tailored") => data.weeks.reduce((n, w) => n + w[key], 0);
  const stories = sum("stories");
  const facts = sum("factsApproved");
  const insights = sum("insightsApproved");
  const kept = sum("resumeKept");
  const updated = sum("resumeUpdated");
  const tailored = sum("tailored");
  const weekLabel = (week: number) => monthDay(Math.max(week, data.from));
  const weekTitle = (week: number) => `Week of ${weekLabel(week)}`;

  return (
    <>
      <Numbers columns={4}>
        <Cell>
          <ChartNumber
            label="Stories"
            value={num(data.totals.stories)}
            lines={[{ text: `${stories} new ${when}` }]}
            explain={{ title: "Stories", detail: `${count(data.totals.stories, "story", "stories")} in your record; ${stories} written ${when}.`, note: "The narratives your record is read from." }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Facts approved"
            value={num(facts)}
            of={`of ${num(data.totals.factsApproved)}`}
            explain={{ title: "Facts approved", detail: `${facts} ${when}, ${dates}; ${data.totals.factsApproved} in all.`, note: "Facts you approved for your record." }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Insights"
            value={num(insights)}
            lines={[{ text: `${num(data.totals.insightsApproved)} in all` }]}
            explain={{ title: "Insights approved", detail: `${insights} ${when}, ${dates}; ${data.totals.insightsApproved} in all.`, note: "Insights about your work you approved." }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Resumes kept"
            value={num(kept)}
            lines={[{ text: `${updated} from Resume updates` }, { text: `${count(tailored, "tailored resume")}` }]}
            explain={{ title: "Resume versions kept", detail: `${kept} ${when}, ${dates}; ${updated} of them written from Resume updates.`, note: `${count(tailored, "tailored resume")} written for roles ${when}.` }}
          />
        </Cell>
      </Numbers>
      <Charts>
        <Chart title="Facts approved" meta="by week" empty={!facts && { title: "No facts approved", line: `Facts you approve ${when} show here.` }}>
          <Bars
            label="Facts approved by week"
            points={data.weeks.map((w) => ({ key: String(w.week), label: weekLabel(w.week), value: w.factsApproved, display: num(w.factsApproved), tone: "good", explain: { title: weekTitle(w.week), detail: `${count(w.factsApproved, "fact")} approved.` } }))}
          />
        </Chart>
        <Chart title="Insights approved" meta="by week" empty={!insights && { title: "No insights approved", line: `Insights you approve ${when} show here.` }}>
          <Bars
            label="Insights approved by week"
            points={data.weeks.map((w) => ({ key: String(w.week), label: weekLabel(w.week), value: w.insightsApproved, display: num(w.insightsApproved), tone: "good", explain: { title: weekTitle(w.week), detail: `${count(w.insightsApproved, "insight")} approved.` } }))}
          />
        </Chart>
      </Charts>
      <Chart
        title="Resumes kept and tailored"
        meta="by week"
        legend={[
          { label: "Kept", tone: "steel" },
          { label: "From Resume updates", tone: "blue" },
          { label: "Tailored", tone: "violet" },
        ]}
        empty={!kept && !tailored && { title: "No resumes kept", line: `Resume versions you keep ${when} show here.` }}
      >
        <Bars
          label="Resumes kept and tailored by week"
          height={160}
          points={data.weeks.map((w) => ({
            key: String(w.week),
            label: weekLabel(w.week),
            value: w.resumeKept + w.tailored,
            display: num(w.resumeKept + w.tailored),
            parts: [
              { label: "Kept", value: w.resumeKept - w.resumeUpdated, display: num(w.resumeKept - w.resumeUpdated), tone: "steel" },
              { label: "From Resume updates", value: w.resumeUpdated, display: num(w.resumeUpdated), tone: "blue" },
              { label: "Tailored", value: w.tailored, display: num(w.tailored), tone: "violet" },
            ],
            explain: { title: weekTitle(w.week), detail: `${count(w.resumeKept, "version")} kept, ${w.resumeUpdated} of them from Resume updates.`, note: `${count(w.tailored, "tailored resume")}.` },
          }))}
        />
      </Chart>
    </>
  );
}
