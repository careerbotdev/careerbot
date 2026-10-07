"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { GROUP_LABELS } from "../../../convex/contactGroups";
import { CLOSED_REASONS, OUTCOME_MIN, PATH_LABELS, REASON_LABELS } from "../../../convex/pursuitSteps";
import { BarList, type BarRow, Chart, ChartNumber } from "@/components/Chart";
import { type Column, Table } from "@/components/Table";
import { Text } from "@/components/Text";
import type { ViewProps } from "./Overview";
import { Cell, Charts, Loading, Numbers, ViewPane } from "./ui";
import { count, monthDay, num, type OutcomesReport, periodWords, range } from "./words";

// What happened with the pursuits started in the period: how many were contacted or applied (a pursuit can be both), got
// to an interview or an offer, and closed; suggestions worked out from those counts; replies by path (once a path has
// OUTCOME_MIN pursuits) and by the group of the people written to; interviews by direction, of the pursuits contacted
// or applied, and by the resume version each application was sent with.
export function OutcomesView({ period, onPeriod, size }: ViewProps) {
  const data = useQuery(api.reports.outcomes, { period });
  return (
    <ViewPane title="Outcomes" range={data ? range(data.from, data.to) : undefined} size={size} period={period} onPeriod={onPeriod}>
      {data ? <Body data={data} small={size === "small"} wide={size === "large"} /> : <Loading />}
    </ViewPane>
  );
}

type Counts = OutcomesReport["directions"][number];
type PathRow = OutcomesReport["paths"][number];

// How each closed, in words: "1 rejected, 2 no response".
const closedWords = (c: Counts["closed"]) =>
  CLOSED_REASONS.filter((r) => c[r] > 0)
    .map((r) => `${c[r]} ${REASON_LABELS[r].toLowerCase()}`)
    .join(", ");

// A row's bar: of `of` pursuits (contacted or applied, or applications), those that got to an interview (green) and
// those that didn't yet, "2 of 5" at the end.
function outcomeRow(key: string, label: string, sub: string | undefined, c: Pick<Counts, "interviewed" | "open" | "closed">, of: number, detail: string): BarRow {
  const closed = closedWords(c.closed);
  return {
    key,
    label,
    sub,
    value: of,
    display: `${c.interviewed} of ${of}`,
    parts: [
      { label: "Interviewed", value: c.interviewed, display: num(c.interviewed), tone: "good" },
      { label: "No interview", value: of - c.interviewed, display: num(of - c.interviewed), tone: "track" },
    ],
    explain: { title: label, detail, note: closed ? `${c.open} open. Closed: ${closed}.` : `${c.open} open.` },
  };
}

// wide: a large screen, where Replies by path shows every column; below it, the path, replies of pursuits and the
// first reply.
function Body({ data, small, wide }: { data: OutcomesReport; small: boolean; wide: boolean }) {
  const when = periodWords(data.period, data.from);
  const labelWidth = small ? 116 : 150;
  const sum = (key: "started" | "contacted" | "applied" | "contactedOrApplied" | "interviewed" | "offers" | "open") => data.directions.reduce((n, d) => n + d[key], 0);
  const [started, contacted, applied, out, interviewed, offers, open] = [sum("started"), sum("contacted"), sum("applied"), sum("contactedOrApplied"), sum("interviewed"), sum("offers"), sum("open")];
  const closed = Object.fromEntries(CLOSED_REASONS.map((r) => [r, data.directions.reduce((n, d) => n + d.closed[r], 0)])) as Counts["closed"];
  const closedTotal = CLOSED_REASONS.reduce((n, r) => n + closed[r], 0);
  const share = out ? Math.round((interviewed / out) * 100) : null;

  const directionRows = data.directions
    .filter((d) => d.contactedOrApplied > 0)
    .map((d) =>
      outcomeRow(
        d.directionId ?? "none",
        d.direction ?? "No direction",
        undefined,
        d,
        d.contactedOrApplied,
        `${count(d.started, "pursuit")} started ${when}: ${d.contacted} contacted, ${d.applied} applied, ${d.interviewed} to an interview, ${count(d.offers, "offer")}.`,
      ),
    );
  const versionRows = data.versions.map((v) => {
    const version = v.versionAt !== null ? `${monthDay(v.versionAt)}${v.current ? " · current" : ""}` : "Version not known";
    const [label, sub] = v.direction ? [v.direction, version] : ["Not tailored", undefined];
    const sent = !v.direction ? "sent without a tailored resume" : v.versionAt !== null ? `sent with a resume tailored from the ${monthDay(v.versionAt)} ${v.direction} resume` : `sent with a ${v.direction} resume whose version isn’t known`;
    return outcomeRow(`${v.directionId ?? "none"}|${v.versionId ?? "none"}`, label, sub, v, v.applied, `${count(v.applied, "application")} ${sent}: ${v.interviewed} to an interview, ${count(v.offers, "offer")}.`);
  });
  const legend = [
    { label: "Interviewed", tone: "good" as const },
    { label: "No interview", tone: "track" as const },
  ];

  const paths = data.paths.filter((p) => p.started >= OUTCOME_MIN);
  const fewer = data.paths.filter((p) => p.started < OUTCOME_MIN);
  const pathColumns: Column<PathRow>[] = [
    { key: "path", label: "Path", cell: (p) => (small && p.path === "both" ? "Both" : PATH_LABELS[p.path]) },
    ...(wide ? [{ key: "started", label: "Pursuits", align: "end" as const, width: 56, cell: (p: PathRow) => num(p.started) }] : []),
    { key: "replied", label: "Replied", align: "end", width: wide ? 56 : 64, cell: (p) => (wide ? num(p.replied) : `${p.replied} of ${p.started}`) },
    ...(!wide
      ? []
      : [
          { key: "rate", label: "Reply rate", align: "end" as const, width: 64, cell: (p: PathRow) => `${Math.round((p.replied / p.started) * 100)}%` },
          { key: "interviewed", label: "Interviews", align: "end" as const, width: 64, cell: (p: PathRow) => num(p.interviewed) },
          { key: "offers", label: "Offers", align: "end" as const, width: 48, cell: (p: PathRow) => num(p.offers) },
        ]),
    { key: "days", label: "First reply", align: "end", width: 72, cell: (p) => (p.replyDays === null ? "None yet" : count(Math.round(p.replyDays), "day")) },
  ];
  const groupRows: BarRow[] = data.groups
    .filter((g) => g.written > 0)
    .map((g) => ({
      key: g.group,
      label: GROUP_LABELS[g.group].title,
      value: g.written,
      display: `${g.replied} of ${g.written}`,
      parts: [
        { label: "Replied", value: g.replied, display: num(g.replied), tone: "good" },
        { label: "No reply", value: g.written - g.replied, display: num(g.written - g.replied), tone: "track" },
      ],
      explain: { title: GROUP_LABELS[g.group].title, detail: `${g.replied} of the ${count(g.written, "person", "people")} you wrote to ${when} replied.`, note: "A person counts once an outreach message to them is marked sent, and as replied once you mark their reply." },
    }));
  return (
    <>
      <Numbers columns={4}>
        <Cell>
          <ChartNumber
            label="Contacted or applied"
            value={num(out)}
            of={`of ${num(started)} started`}
            lines={[{ text: `${num(contacted)} contacted · ${num(applied)} applied` }]}
            explain={{
              title: "Contacted or applied",
              detail: `${out} of the ${count(started, "pursuit")} started ${when}: ${contacted} contacted, ${applied} applied.`,
              note: "Contacted: an outreach message marked sent, or set to Contacted. Applied: set to Applied. A pursuit can be both, and counts whatever its status now.",
            }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Interviewed"
            value={share === null ? "None yet" : `${share}%`}
            lines={[{ text: out ? `${interviewed} of ${num(out)} contacted or applied` : "None contacted or applied yet" }]}
            explain={{ title: "Interviewed", detail: out ? `${interviewed} of the ${count(out, "pursuit")} contacted or applied ${when} got to an interview.` : `None contacted or applied ${when}.`, note: "Counted once a pursuit is set to Interviewing or Offer." }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Offers"
            value={num(offers)}
            lines={[{ text: interviewed ? `from ${count(interviewed, "interview")}` : "No interviews yet", tone: offers > 0 ? "good" : "muted" }]}
            explain={{ title: "Offers", detail: `${count(offers, "pursuit")} started ${when} reached an offer.`, note: "Counted once a pursuit is set to Offer." }}
          />
        </Cell>
        <Cell>
          <ChartNumber
            label="Closed"
            value={num(closedTotal)}
            lines={[{ text: closedTotal ? closedWords(closed) : `${num(open)} open` }]}
            explain={{ title: "Closed", detail: closedTotal ? `${closedWords(closed)}.` : `None closed ${when}.`, note: `${count(open, "pursuit")} still open.` }}
          />
        </Cell>
      </Numbers>
      <Chart title="Suggestions" meta={data.suggestions.length ? num(data.suggestions.length) : undefined} empty={!data.suggestions.length && { title: "No suggestions yet", line: `Suggestions show once directions, resume versions or paths each have ${OUTCOME_MIN} to compare.` }}>
        <ul className="flex flex-col border-t">
          {data.suggestions.map((s) => (
            <li key={s.text} className="flex flex-col gap-0.5 border-b py-2.5">
              <span className="text-body-sm leading-body-sm font-medium text-text">{s.text}</span>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">{s.detail}</span>
            </li>
          ))}
        </ul>
      </Chart>
      <Chart title="Replies by path" meta={paths.length ? `pursuits started ${when}` : undefined} empty={!paths.length && { title: "No path to show yet", line: `A path shows once ${OUTCOME_MIN} pursuits started ${when} are on it.` }}>
        <Table label="Replies by path" columns={pathColumns} rows={paths} rowKey={(p) => p.path} />
        <Text size="sm" muted>
          Replied: someone there wrote back, or it moved to In conversation, Interviewing or Offer, or closed as Rejected or Declined. First reply: the median days from the first outreach message or the application.
          {fewer.length > 0 && ` ${fewer.map((p) => `${PATH_LABELS[p.path]} (${p.started})`).join(", ")} ${fewer.length === 1 ? "has" : "have"} fewer than ${OUTCOME_MIN} pursuits.`}
        </Text>
      </Chart>
      <Charts>
        <Chart title="By direction" meta="interviewed of contacted or applied" legend={legend} empty={!directionRows.length && { title: "None contacted or applied", line: `Pursuits started ${when} show here once you contact someone or apply.` }}>
          <BarList label="Pursuits by direction" rows={directionRows} labelWidth={labelWidth} valueWidth={52} />
        </Chart>
        <Chart title="By resume version" meta="interviewed of applied" legend={legend} empty={!versionRows.length && { title: "No applications", line: `Applications ${when} show here by the resume sent.` }}>
          <BarList label="Applications by resume version" rows={versionRows} labelWidth={labelWidth} valueWidth={52} />
        </Chart>
      </Charts>
      <Charts>
        <Chart title="Replies by group" meta="replied of written to" legend={[{ label: "Replied", tone: "good" }, { label: "No reply", tone: "track" }]} empty={!groupRows.length && { title: "No outreach yet", line: `People you write to ${when} show here by group.` }}>
          <BarList label="Replies by group" rows={groupRows} labelWidth={labelWidth} valueWidth={52} />
        </Chart>
      </Charts>
    </>
  );
}
