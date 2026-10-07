"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import { ErrorLine } from "@/components/Field";
import { type Filter, FilterBar } from "@/components/FilterBar";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader } from "@/components/Panes";
import { ReasonField } from "@/components/ReasonField";
import { RejectedRow } from "@/components/RejectedRow";
import { Spinner } from "@/components/Spinner";
import { StatusTag } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { APPROVES, certLine, type Data, FREE_UNDO, GATHERS_AGAIN, KINDS, type Kind, leftOutWhile, plural, REJECT_PICKS, REJECTS, type Skill, type Tab, TAB_LABELS, WHY, whereShort } from "./words";

// The list pane: the kind's name and ⋯, tabs (Proposed, Approved, and Rejected once there is one), the Group filter
// (Issuer for certifications; on a phone behind the filter button), the last gathering's state, then the rows.

export function SkillsList({
  kind,
  small,
  tab,
  onTab,
  counts,
  filters,
  matches,
  menu,
  status,
  children,
}: {
  kind: Kind;
  small: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  counts: Record<Tab, number>;
  filters: Filter[];
  matches?: { shown: number; total: number };
  menu: MenuEntry[];
  status: ReactNode;
  children: ReactNode;
}) {
  const [filtering, setFiltering] = useState(false);
  const words = KINDS[kind];
  const tabs = (["proposed", "approved", "rejected"] as const).filter((t) => t !== "rejected" || counts.rejected > 0 || tab === "rejected");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title={words.many}
        actions={
          <>
            {small && <Button variant="ghost" iconOnly icon="filter" aria-label="Filter" aria-pressed={filtering} detail={`Shows or hides the ${kind === "certification" ? "issuer" : "group"} filter.`} note="Free" onClick={() => setFiltering(!filtering)} />}
            <Menu label={`More for ${words.many}`} items={menu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label={`More for ${words.many}`} className="data-[state=open]:bg-border data-[state=open]:text-text" data-tour="record.more" />} />
          </>
        }
      />
      <div data-tour="record.tabs">
        <Tabs label={`${words.many} by status`} className="px-4" value={tab} onValueChange={(v) => onTab(v as Tab)} tabs={tabs.map((t) => ({ value: t, label: TAB_LABELS[t], count: counts[t] }))} />
      </div>
      {(!small || filtering) && <FilterBar filters={filters} matches={matches} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status}
        {children}
      </div>
    </div>
  );
}

// The last gathering, above the rows: going, or failed with Try again and what it costs.
export function GatherLine({ last, cost, onGather }: { last: Data["last"]; cost: string; onGather: () => void }) {
  if (last?.status === "queued" || last?.status === "running")
    return (
      <div role="status" className="flex h-11 items-center gap-2.5 border-b px-4 text-body-sm leading-body-sm text-muted">
        <Spinner />
        Gathering…
      </div>
    );
  if (last?.status !== "failed") return null;
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5">
      <span className="flex-1">
        <ErrorLine>The last try failed</ErrorLine>
      </span>
      <Button variant="ghost" size="sm" icon="tryAgain" detail={GATHERS_AGAIN} note={cost} onClick={onGather}>
        Try again
      </Button>
      <CostEstimate amount={cost} />
    </div>
  );
}

export type RowGroup = { label: string; rows: Skill[] };

// The rows, under their group headers (none for certifications). A proposed row approves (A) or rejects (R, with why
// under it) on hover; any row checks (X, Space, Shift- or ⌘-click, Select in its menu, a long press on a phone), which
// starts selecting, when a click or the row's box or its group's box checks; a rejected one reopens.
export function SkillRows({
  groups,
  flat,
  open,
  onOpen,
  checked,
  onCheck,
  selecting,
  leftOut,
  paired,
  menuFor,
  onApprove,
  why,
  onWhy,
  onReject,
  onReopen,
  after,
}: {
  groups: RowGroup[];
  flat: boolean;
  open: string | null;
  onOpen: (id: string) => void;
  checked: ReadonlySet<string>;
  onCheck: ((ids: readonly string[], on: boolean) => void) | null;
  selecting: boolean;
  leftOut: Set<string>;
  // Ones another proposed item looks the same as: tagged too.
  paired: Set<string>;
  menuFor: (s: Skill) => MenuEntry[];
  onApprove: (s: Skill) => void;
  why: string | null;
  onWhy: (id: string | null) => void;
  onReject: (s: Skill, reason?: string) => void;
  onReopen: (s: Skill) => void;
  after?: ReactNode;
}) {
  const row = (s: Skill) => {
    if (s.status === "rejected")
      return (
        <RejectedRow
          key={s.id}
          title={s.name}
          line={[s.group, whereShort(s)].filter(Boolean).join(" · ")}
          decision="Rejected"
          reason={s.rejectedBecause ?? undefined}
          onRestore={() => onReopen(s)}
          menu={menuFor(s)}
          selected={open === s.id}
          onOpen={() => onOpen(s.id)}
        />
      );
    const proposed = s.status === "proposed";
    const line =
      s.kind === "certification" ? (
        certLine(s)
      ) : proposed && s.lowValue ? (
        <span className="text-caution-text">{s.lowValue}</span>
      ) : !s.counts ? (
        leftOutWhile(s)
      ) : (
        whereShort(s)
      );
    return (
      <ListRow
        key={s.id}
        title={s.name}
        line={line}
        muted={!s.counts}
        tag={proposed && (s.sameAs || paired.has(s.id)) ? <StatusTag tone="caution">Duplicate?</StatusTag> : s.status === "approved" && leftOut.has(s.id) ? <StatusTag tone="neutral">Left out</StatusTag> : undefined}
        meta={s.resumes > 0 ? plural(s.resumes, "resume") : undefined}
        actions={
          proposed
            ? [
                { label: "Approve", icon: "approve", keys: "A", detail: APPROVES(s.kind), note: FREE_UNDO, onSelect: () => onApprove(s) },
                { label: "Reject", icon: "reject", keys: "R", detail: REJECTS(s.kind), note: WHY, onSelect: () => onWhy(s.id) },
              ]
            : []
        }
        menu={menuFor(s)}
        selected={open === s.id}
        checked={checked.has(s.id)}
        onCheck={onCheck ? (on) => onCheck([s.id], on) : undefined}
        selecting={selecting}
        onOpen={() => onOpen(s.id)}
        below={
          why === s.id ? (
            <ReasonField
              decision="Reject"
              picks={REJECT_PICKS}
              onDone={({ reason }) => {
                onWhy(null);
                onReject(s, reason);
              }}
            />
          ) : undefined
        }
      />
    );
  };
  return (
    <List label="Rows" tour="record.list" className={selecting ? "p-2 pb-16" : "p-2"}>
      {flat
        ? groups.flatMap((g) => g.rows.map(row))
        : groups.map((g) => {
            const on = g.rows.filter((s) => checked.has(s.id)).length;
            return (
              <ListGroup
                key={g.label}
                label={g.label}
                count={g.rows.length}
                checked={on === 0 ? false : on === g.rows.length ? true : "some"}
                onCheck={onCheck && selecting ? (v) => onCheck(g.rows.map((s) => s.id), v) : undefined}
                meta={on ? `${on} selected` : undefined}
              >
                {g.rows.map(row)}
              </ListGroup>
            );
          })}
      {after}
    </List>
  );
}

// Under a short certifications list: where certifications come from, and gathering again.
export function OnlyOne({ count, cost, busy, onGather }: { count: number; cost: string; busy: boolean; onGather: () => void }) {
  return (
    <li className="mx-1 mt-2 flex flex-col gap-2 border-t px-3 pt-4">
      <Text size="sm" className="font-medium">
        {count === 1 ? "The only certification in your record" : "No certifications in your record"}
      </Text>
      <Text size="sm" muted>
        Certifications come from your stories. Mention one in a story, then gather again.
      </Text>
      <div className="flex items-center gap-3">
        <Button size="sm" icon="tryAgain" loading={busy} loadingLabel="Gathering" detail={GATHERS_AGAIN} note={cost} onClick={onGather}>
          Gather again
        </Button>
        <CostEstimate amount={cost} />
      </div>
    </li>
  );
}
