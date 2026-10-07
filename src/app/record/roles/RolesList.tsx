"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { type Filter, FilterBar } from "@/components/FilterBar";
import { Icons } from "@/components/icons";
import { List, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader } from "@/components/Panes";
import { RejectedRow } from "@/components/RejectedRow";
import { StatusTag } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { BreakMark } from "../breaks/BreakItem";
import { monthSpan, plural, type Project, type Role, roleTitle, yearSpan } from "./words";

// The list pane of Roles: Timeline (newest first, a career break as a gap between roles, a role's linked projects under
// it, how many facts each has or how many wait for review) and Rejected (each with why). The Employer filter narrows
// the timeline.

export type View = "timeline" | "rejected";
export type Line = { role: Role; facts: number; toReview: number; projects: Project[] };

export function RolesList({
  view,
  onView,
  counts,
  filters,
  matches,
  menu,
  children,
}: {
  view: View;
  onView: (v: View) => void;
  counts: { roles: number; rejected: number };
  filters: Filter[];
  matches?: { shown: number; total: number };
  menu: MenuEntry[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Roles" actions={<Menu label="More for Roles" items={menu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Roles" className="data-[state=open]:bg-border data-[state=open]:text-text" data-tour="record.more" />} />} />
      <div data-tour="record.tabs">
      <Tabs
        label="Roles by status"
        className="px-4"
        value={view}
        onValueChange={(v) => onView(v as View)}
        tabs={[
          { value: "timeline", label: "Timeline", count: counts.roles },
          { value: "rejected", label: "Rejected", count: counts.rejected },
        ]}
      />
      </div>
      {view === "timeline" && <FilterBar filters={filters} matches={matches} />}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// The timeline: roles with their projects under them, and breaks between them.
export function Timeline({ lines, selected, onOpen, menuFor }: { lines: Line[]; selected: string | null; onOpen: (r: Role) => void; menuFor: (r: Role) => MenuEntry[] }) {
  return (
    <List label="Roles" tour="record.list" className="p-2">
      {lines.map(({ role, facts, toReview, projects }) =>
        role.data.break ? (
          <BreakRow key={role.id} role={role} selected={selected === role.id} onOpen={() => onOpen(role)} />
        ) : (
          <TimelineRole key={role.id} role={role} facts={facts} toReview={toReview} projects={projects} selected={selected === role.id} onOpen={() => onOpen(role)} menu={menuFor(role)} />
        ),
      )}
    </List>
  );
}

function TimelineRole({ role, facts, toReview, projects, selected, onOpen, menu }: Omit<Line, "role"> & { role: Role; selected: boolean; onOpen: () => void; menu: MenuEntry[] }) {
  const title = roleTitle(role);
  const tag =
    role.status === "proposed" ? (
      <StatusTag tone="info">New</StatusTag>
    ) : toReview > 0 ? (
      <StatusTag tone="info">{toReview} to review</StatusTag>
    ) : undefined;
  return (
    <>
      <ListRow
        title={title}
        line={[yearSpan(role.data.start, role.data.end), role.data.employer].filter(Boolean).join(" · ")}
        lead={<Avatar name={role.data.employer || title} company size={28} />}
        tag={tag}
        meta={tag ? undefined : plural(facts, "fact")}
        selected={selected}
        onOpen={onOpen}
        menu={menu}
      />
      {projects.map((p) => (
        <li key={p.id} data-row-scope="" className="flex">
          <Link
            data-row=""
            href={`/record/projects?project=${p.id}`}
            className="flex min-h-11 md:min-h-8 flex-1 items-center gap-2.5 rounded-sm py-1.5 pr-3 pl-[52px] transition-colors duration-100 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-steel"
          >
            <Icons.projects aria-hidden size={14} className="shrink-0 text-muted" />
            <span className="truncate text-body-sm leading-body-sm font-medium text-text">{p.data.name}</span>
            <span className="text-body-sm leading-body-sm text-muted">Project</span>
          </Link>
        </li>
      ))}
    </>
  );
}

// A career break: a gap in the timeline. It opens beside the list, like a role.
function BreakRow({ role, selected, onOpen }: { role: Role; selected: boolean; onOpen: () => void }) {
  return (
    <ListRow
      muted
      title={role.data.title || "Career break"}
      line={[monthSpan(role.data.start, role.data.end), role.data.reason].filter(Boolean).join(" · ")}
      lead={<BreakMark size="row" />}
      tag={role.status === "proposed" ? <StatusTag tone="neutral">Not approved</StatusTag> : undefined}
      selected={selected}
      onOpen={onOpen}
    />
  );
}

export function RejectedRows({ roles, selected, onOpen, onRestore }: { roles: Role[]; selected: string | null; onOpen: (r: Role) => void; onRestore: (r: Role) => void }) {
  if (!roles.length)
    return (
      <EmptyState icon="reject" title="No rejected roles">
        Roles you reject show here with why, so you can restore them.
      </EmptyState>
    );
  return (
    <List label="Rejected roles" tour="record.list" className="p-2">
      {roles.map((r) => (
        <RejectedRow
          key={r.id}
          title={roleTitle(r)}
          line={[yearSpan(r.data.start, r.data.end), r.data.employer].filter(Boolean).join(" · ")}
          lead={<Avatar name={r.data.employer || roleTitle(r)} company size={28} />}
          decision="Rejected"
          reason={r.data.rejectedBecause ?? undefined}
          onRestore={() => onRestore(r)}
          restoreKeys="U"
          selected={selected === r.id}
          onOpen={() => onOpen(r)}
        />
      ))}
    </List>
  );
}
