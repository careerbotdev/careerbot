"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { CLOSED_REASONS, outcomeSuggestions, REASON_LABELS } from "../../../convex/pursuitSteps";
import { Button } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, useScreenSize } from "@/components/Panes";
import { type Column, Table } from "@/components/Table";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { useDemo } from "../demo/demo";
import { day } from "./dates";

// With no role open: how the pursuits went, by the direction each was started for (contacted and applied apart, since a
// pursuit can be both; how they closed in a line under the table), what stands out, and where roles come from (each
// watched company's board, the ones needing a hand first).

type Row = FunctionReturnType<typeof api.pursuits.byDirection>[number];
type Coverage = FunctionReturnType<typeof api.roles.overview>["coverage"][number];

const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t start.", icon: "failed" });

export function ByDirection({ menu }: { menu: MenuEntry[] }) {
  const rows = useQuery(api.pursuits.byDirection);
  // Below large screens the pane is narrow (beside the list on medium, the whole phone): short labels, no set widths.
  const compact = useScreenSize() !== "large";
  const cols = (key: keyof Omit<Row, "direction" | "closed" | "open" | "contactedOrApplied">, label: string): Column<Row> => ({ key, label, align: "end", width: compact ? undefined : 64, cell: (r) => r[key] });
  const columns: Column<Row>[] = [
    { key: "direction", label: "Direction", cell: (r) => (r.direction === "All directions" ? <span className="font-semibold">{r.direction}</span> : (r.direction ?? "No direction")) },
    cols("started", "Started"),
    cols("contacted", compact ? "Cont." : "Contacted"),
    cols("applied", compact ? "Appl." : "Applied"),
    cols("interviewed", compact ? "Intv." : "Interviewed"),
    cols("offers", "Offers"),
  ];
  const all: Row | null = rows?.length
    ? rows.reduce<Row>(
        (t, r) => ({
          direction: "All directions",
          started: t.started + r.started,
          contacted: t.contacted + r.contacted,
          applied: t.applied + r.applied,
          contactedOrApplied: t.contactedOrApplied + r.contactedOrApplied,
          interviewed: t.interviewed + r.interviewed,
          offers: t.offers + r.offers,
          open: t.open + r.open,
          closed: Object.fromEntries(CLOSED_REASONS.map((x) => [x, t.closed[x] + r.closed[x]])) as Row["closed"],
        }),
        { direction: "All directions", started: 0, contacted: 0, applied: 0, contactedOrApplied: 0, interviewed: 0, offers: 0, open: 0, closed: { rejected: 0, withdrawn: 0, noResponse: 0, declined: 0 } },
      )
    : null;
  const closedWords = (rows ?? [])
    .map((r) => [r.direction ?? "No direction", CLOSED_REASONS.filter((x) => r.closed[x] > 0).map((x) => `${r.closed[x]} ${REASON_LABELS[x].toLowerCase()}`).join(", ")])
    .filter(([, w]) => w);
  // What stands out: the suggestions Reports' Outcomes shows over all time, for these directions.
  const stands = rows ? outcomeSuggestions(rows.flatMap((r) => (r.direction ? [{ ...r, name: r.direction }] : []))).map((s) => `${s.text}. ${s.detail}`).join(" ") || null : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <PaneHeader title="By direction" actions={<Menu label="More for Pursuits" items={menu} />} className="md:pl-6 lg:pl-8" />
      <div className="flex flex-col gap-8 px-4 pt-2 pb-8 md:px-6 lg:px-8">
        {rows && all ? (
          <section className="flex flex-col gap-2">
            <Table label="Pursuits by direction" columns={columns} rows={rows.length > 1 ? [...rows, all] : rows} rowKey={(r) => r.direction ?? ""} />
            {closedWords.length > 0 && (
              <Text size="sm" muted>
                Closed: {closedWords.map(([d, w]) => `${d} ${w}`).join(" · ")}
              </Text>
            )}
          </section>
        ) : (
          rows && <Text size="sm" muted>Start a pursuit of a role to see how each direction goes.</Text>
        )}
        {stands && (
          <section className="flex flex-col gap-1.5">
            <Text size="label">What stands out</Text>
            <Text measure>{stands}</Text>
          </section>
        )}
        <Sources />
      </div>
    </div>
  );
}

// Where roles come from: the companies read without trouble folded into one line, then each that needs a hand (no
// board it can read, a failed or out-of-date read, one read from Apollo), with Check again at its cost. The demo reads
// no boards (its roles came with it), which is what it says there instead.
function Sources() {
  const data = useQuery(api.roles.overview, {});
  const demo = useDemo();
  if (!data) return null;
  const trouble = (c: Coverage) => !c.board || !!c.lastFailed || c.stale || c.board.provider === "apollo" || c.checking;
  const fine = data.coverage.filter((c) => !trouble(c));
  const latest = Math.max(0, ...fine.map((c) => c.lastRead ?? 0));
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Text size="label">Where roles come from</Text>
        <Text size="sm" muted tabular>
          {data.coverage.length} {data.coverage.length === 1 ? "company" : "companies"} watched
        </Text>
      </div>
      {demo ? (
        <Text size="sm" muted>
          The demo’s roles came with it; it doesn’t read job boards.
        </Text>
      ) : data.coverage.length === 0 ? (
        <Text size="sm">
          Rate companies Target or Maybe in{" "}
          <Link href="/companies" className="underline">
            Companies
          </Link>{" "}
          to read their roles.
        </Text>
      ) : (
        <ul className="flex flex-col border-t">
          {fine.length > 0 && (
            <li className="flex min-h-11 flex-wrap items-center gap-x-6 gap-y-1 border-b py-2">
              <Text className="w-40 shrink-0 font-medium">
                {fine.length} {fine.length === 1 ? "company" : "companies"}
              </Text>
              <Text size="sm" muted>
                {latest ? `Boards read ${day(latest)}` : "Boards read"}
              </Text>
            </li>
          )}
          {data.coverage.filter(trouble).map((c) => (
            <Source key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Source({ c }: { c: Coverage }) {
  const check = useMutation(api.roles.checkCompany);
  const apollo = c.board?.provider === "apollo";
  const what = !c.board
    ? "No job board CareerBot can read"
    : c.checking
      ? "Checking…"
      : c.lastFailed
        ? `Couldn’t read it ${day(c.lastFailed)}`
        : apollo
          ? c.lastRead
            ? `Read from Apollo ${day(c.lastRead)}`
            : "Read from Apollo"
          : c.lastRead
            ? `Out of date · read ${day(c.lastRead)}`
            : "Not read yet";
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-6 gap-y-1 border-b py-2">
      <Text className="w-40 shrink-0 truncate font-medium">{c.name}</Text>
      <Text size="sm" className={`min-w-0 flex-1 ${!c.board || c.lastFailed ? "text-caution-text" : "text-muted"}`}>
        {what}
      </Text>
      {!c.board ? (
        <Link href={`/companies?company=${c.id}`} className="rounded-sm px-2 py-1 text-label leading-label font-medium text-text hover:bg-subtle">
          Add a job board link
        </Link>
      ) : (
        <span className="flex items-center gap-3">
          {apollo && <CostEstimate amount="About 1 Apollo credit" />}
          <Button
            size="sm"
            variant="ghost"
            icon="tryAgain"
            loading={c.checking}
            loadingLabel="Checking"
            detail={`Reads ${c.name}’s roles again${apollo ? " from Apollo" : " from its board"}.`}
            note={apollo ? "About 1 Apollo credit" : "Free"}
            onClick={() => void check({ companyId: c.id }).catch(failed)}
          >
            Check again
          </Button>
        </span>
      )}
    </li>
  );
}
