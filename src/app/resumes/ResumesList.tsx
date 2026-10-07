"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import { EmptyState } from "@/components/EmptyState";
import { Icons, type IconName } from "@/components/icons";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader } from "@/components/Panes";
import { StatusTag } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { EXPLAIN, type Overview, type Row, STATE, day, tailoredName, toUpdate } from "./words";

// The list of resumes: All (the base resume, one per direction, every tailored one) or To update (the base and
// direction resumes the record has changed under, or with a new version waiting). Each row says how it stands; a
// direction resume not written yet offers Write.

export type Tab = "all" | "update";

// The 28px square that leads a row or heads an item: the resume's kind as an icon.
export function Mark({ icon, size = 28 }: { icon: IconName; size?: 28 | 40 }) {
  const Icon = Icons[icon];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-sm border bg-subtle text-muted ${size === 40 ? "size-10" : "size-7"}`}>
      <Icon aria-hidden size={size === 40 ? 20 : 16} />
    </span>
  );
}

export function ResumesList({
  overview,
  tab,
  onTab,
  selected,
  onOpen,
  write,
  menuFor,
  menu,
  updateAll,
}: {
  overview: Overview;
  tab: Tab;
  onTab: (t: Tab) => void;
  selected: string | null;
  onOpen: (key: string) => void;
  write: { amount: (r: Row) => string; run: (r: Row) => void };
  menuFor: (key: string) => MenuEntry[];
  menu: MenuEntry[];
  updateAll: { amount: string | null; run: () => void; busy: boolean };
}) {
  const all = [overview.base, ...overview.directions];
  const due = all.filter(toUpdate);
  const count = all.filter((r) => r.state !== "notWritten").length + overview.tailored.length;
  const row = (r: Row) => {
    const state = STATE[r.state];
    const icon: IconName = r.directionId ? "directions" : "resumes";
    if (r.state === "notWritten")
      return (
        <ListRow
          key={r.key}
          title={r.name}
          muted
          lead={<Mark icon={icon} />}
          line={r.writing ? "Writing…" : (r.blocked ?? undefined)}
          meta={r.writing ? undefined : "Not written yet"}
          selected={selected === r.key}
          onOpen={() => onOpen(r.key)}
          actions={r.blocked || r.writing ? [] : [{ label: `Write · ${write.amount(r)}`, icon: "add", detail: EXPLAIN.write(r), note: write.amount(r), onSelect: () => write.run(r) }]}
          menu={menuFor(r.key)}
        />
      );
    return (
      <ListRow
        key={r.key}
        title={r.name}
        lead={<Mark icon={icon} />}
        line={r.writing ? "Writing a new version…" : state && <StatusTag tone={state.tone}>{state.label}</StatusTag>}
        meta={r.at ? day(r.at) : undefined}
        selected={selected === r.key}
        onOpen={() => onOpen(r.key)}
        menu={menuFor(r.key)}
      />
    );
  };
  let body: ReactNode;
  if (tab === "update") {
    body = due.length ? (
      <>
        <div className="flex items-center gap-3 px-5 pt-3 pb-1">
          <span className="flex-1 text-body-sm leading-body-sm text-muted">{due.length} to update</span>
          {updateAll.amount && <CostEstimate amount={updateAll.amount} />}
          <Button size="sm" icon="tryAgain" loading={updateAll.busy} loadingLabel="Writing" detail={EXPLAIN.updateAll} note={updateAll.amount ?? "Uses your AI budget"} onClick={updateAll.run}>
            Update all
          </Button>
        </div>
        <List label="Resumes to update" tour="resumes.list" className="p-2">
          {due.map(row)}
        </List>
      </>
    ) : (
      <EmptyState icon="done" title="Your resumes are up to date">
        Each one matches your approved record.
      </EmptyState>
    );
  } else {
    body = (
      <List label="Resumes" tour="resumes.list" className="p-2">
        <ListGroup label="Base">{row(overview.base)}</ListGroup>
        {overview.directions.length > 0 && (
          <ListGroup label="Directions" count={overview.directions.length}>
            {overview.directions.map(row)}
          </ListGroup>
        )}
        {overview.tailored.length > 0 && (
          <ListGroup label="Tailored" count={overview.tailored.length}>
            {overview.tailored.map((t) => (
              <ListRow
                key={t.id}
                title={tailoredName(t)}
                lead={<Avatar name={t.company ?? t.title} company size={28} />}
                line={t.direction}
                meta={day(t.at)}
                selected={selected === t.id}
                onOpen={() => onOpen(t.id)}
                menu={menuFor(t.id)}
              />
            ))}
          </ListGroup>
        )}
      </List>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Resumes"
        actions={
          <div data-tour="resumes.more" className="flex">
            <Menu label="More for Resumes" items={menu} />
          </div>
        }
      />
      <div data-tour="resumes.tabs">
        <Tabs
          label="Resumes"
          className="px-4"
          value={tab}
          onValueChange={(v) => onTab(v as Tab)}
          tabs={[
            { value: "all", label: "All", count },
            { value: "update", label: "To update", count: due.length },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}
