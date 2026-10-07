"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { type ReactNode, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { REASON_LABELS, type Reminder, STATUS_LABELS } from "../../../convex/pursuitSteps";
import { valuesOf, whereText } from "../../../convex/roleDetails";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { type Filter, FilterBar } from "@/components/FilterBar";
import { List, ListRow } from "@/components/ListRow";
import { ListFold } from "@/components/ListFold";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader } from "@/components/Panes";
import { ReasonField } from "@/components/ReasonField";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusTag, type StatusTone } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { ROLE_REASONS } from "./RoleItem";
import { INTERESTED, NOT_FOR_ME, NOT_INTERESTED, OPEN_POSTING, postedWord, pursuitMeta, type PursuitRow, RESTORE_ROLE, type RoleRow } from "./words";

// The list of Pursuits: tabs (All roles, Interested, Pursuing, Closed), the filter bar (Direction first; the role
// filters under + on All roles and Interested), then the rows. A role row: score, title, company · place, its pursuit's
// status or Interested, and when it was posted (or how many places it's in). A pursuit row: its status and the reminder
// due or what's next. All roles ends with the roles against their limits and the other roles, folded.

export type Tab = "all" | "interested" | "pursuing" | "closed";
export type Scope = { directionId?: Id<"items"> };
export type PursuitEntry = { p: PursuitRow; due: Reminder | undefined };
// Roles with the same title at one company are one row, its places listed in its menu.
export type RoleGroup = RoleRow[];
// key: a role's posting id, or a pursuit's own id when it has no open role.
export type Open = (key: string, directionId: string | null) => void;

const PAGE = 25;
const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// A pursuit's status as a tag: under way past Preparing is current (info), an offer is good, the rest neutral.
function PursuitTag({ status, reason }: { status: PursuitRow["status"]; reason: PursuitRow["closedReason"] }) {
  const tone: StatusTone = status === "offer" ? "good" : status === "preparing" || status === "closed" ? "neutral" : "info";
  return <StatusTag tone={tone}>{status === "closed" && reason ? REASON_LABELS[reason] : STATUS_LABELS[status]}</StatusTag>;
}

export function PursuitsList({
  tab,
  onTab,
  counts,
  filters,
  matches,
  onClearAll,
  menu,
  banner,
  children,
  small,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  counts: { all?: number; pursuing: number; closed: number };
  filters: Filter[];
  matches?: { shown: number; total: number };
  onClearAll?: () => void;
  menu: MenuEntry[];
  banner?: ReactNode;
  children: ReactNode;
  small: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Pursuits" count={small ? counts.pursuing || undefined : undefined} actions={<Menu label="More for Pursuits" items={menu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Pursuits" data-tour="pursuits.more" />} />} />
      <div data-tour="pursuits.tabs">
        <Tabs
          label="Roles by status"
          className="px-4"
          value={tab}
          onValueChange={(v) => onTab(v as Tab)}
          tabs={[
            { value: "all", label: "All roles", count: counts.all },
            { value: "interested", label: "Interested" },
            { value: "pursuing", label: "Pursuing", count: counts.pursuing },
            { value: "closed", label: "Closed", count: counts.closed },
          ]}
        />
      </div>
      <div data-tour="pursuits.filters">
        <FilterBar filters={filters} matches={matches} onClearAll={onClearAll} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {banner}
        {children}
      </div>
    </div>
  );
}

// "Ranked before you changed …", with Rank again, above the rows.
export function StaleBanner({ text, action }: { text: string; action: ReactNode }) {
  return (
    <div role="status" className="mx-2 mt-2 flex items-center gap-3 rounded-sm bg-caution-subtle px-3 py-2.5">
      <Text size="sm" className="flex-1 text-caution-text">
        {text}
      </Text>
      {action}
    </div>
  );
}

export function PursuitRows({ rows, selected, onOpen, empty }: { rows: PursuitEntry[]; selected: string | null; onOpen: Open; empty: ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <List label="Pursuits" tour="pursuits.list" className="p-2">
      {rows.map(({ p, due }) => {
        const meta = pursuitMeta(p, due);
        return (
          <ListRow
            key={p.id}
            title={p.title}
            line={[p.company, p.postingId ? p.direction : "No open role"].filter(Boolean).join(" · ")}
            lead={<ScoreBadge score={p.score} level={p.level} />}
            tag={<PursuitTag status={p.status} reason={p.closedReason} />}
            meta={<span className={meta.caution ? "text-caution-text" : undefined}>{meta.text}</span>}
            selected={(p.postingId ?? p.id) === selected}
            onOpen={() => onOpen(p.postingId ?? p.id, p.directionId)}
          />
        );
      })}
    </List>
  );
}

// Role rows, with Interested and Not for me (with why) on each row's menu, and every place for a role in several.
export function RoleRows({
  groups,
  selected,
  onOpen,
  checked,
  onCheck,
  selecting,
  more,
  children,
}: {
  groups: RoleGroup[];
  selected: string | null;
  onOpen: Open;
  checked: ReadonlySet<string>;
  onCheck: ((id: string, on: boolean) => void) | null;
  selecting: boolean;
  more?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <List label="Roles" tour="pursuits.list" className={selecting ? "p-2 pb-16" : "p-2"}>
      {groups.map((g) => (
        <RoleListRow key={g[0].id} roles={g} selected={selected} onOpen={onOpen} checked={checked.has(g[0].id)} onCheck={onCheck} selecting={selecting} />
      ))}
      {more}
      {children}
    </List>
  );
}

function RoleListRow({ roles, selected, onOpen, checked, onCheck, selecting }: { roles: RoleRow[]; selected: string | null; onOpen: Open; checked: boolean; onCheck: ((id: string, on: boolean) => void) | null; selecting: boolean }) {
  const rate = useMutation(api.roles.rate);
  const [why, setWhy] = useState(false);
  const r = roles[0];
  const many = roles.length > 1;
  const place = (x: RoleRow) => whereText(valuesOf(x.details), x.location);
  const tag = r.pursuit ? (
    <PursuitTag status={r.pursuit.status} reason={r.pursuit.closedReason} />
  ) : r.rating === "interested" ? (
    <StatusTag tone="neutral">Interested</StatusTag>
  ) : r.rating === "no" ? (
    <StatusTag tone="neutral">Not for me</StatusTag>
  ) : r.problems.length ? (
    <StatusTag tone="problem">{r.problems[0]}</StatusTag>
  ) : null;
  const notForMe = (reason?: string) => {
    setWhy(false);
    void rate({ id: r.id, value: "no", reason }).then(
      () => toast({ message: `Not for me: ${r.title}`, icon: "reject", action: { label: "Undo", key: "U", run: () => void rate({ id: r.id, value: r.rating }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const menu: MenuEntry[] = [
    ...(!r.pursuit
      ? [
          {
            label: r.rating === "interested" ? "Not interested after all" : "Interested",
            icon: "approve" as const,
            keys: "I",
            ...(r.rating === "interested" ? NOT_INTERESTED : { ...INTERESTED, note: "Free" }),
            onSelect: () => void rate({ id: r.id, value: r.rating === "interested" ? null : "interested" }).catch((e: unknown) => failed(e, "Couldn’t save that.")),
          },
          r.rating === "no"
            ? { label: "Restore", icon: "undo" as const, ...RESTORE_ROLE, onSelect: () => void rate({ id: r.id, value: null }) }
            : { label: "Not for me", icon: "reject" as const, keys: "R", ...NOT_FOR_ME, onSelect: () => setWhy(true) },
          "separator" as const,
        ]
      : []),
    ...(many ? [{ group: "Places" }, ...roles.map((x) => ({ label: place(x) ?? "Place not given", hint: postedWord(x), detail: "Opens the role as listed for this place.", note: "Free", onSelect: () => onOpen(x.id, x.direction?.id ?? null) })), "separator" as const] : []),
    { label: "Open the posting", icon: "openElsewhere", ...OPEN_POSTING, onSelect: () => window.open(r.url, "_blank", "noreferrer") },
  ];
  return (
    <ListRow
      title={r.title}
      line={[r.company.name, many ? null : place(r)].filter(Boolean).join(" · ")}
      lead={<ScoreBadge score={r.score} level={r.level} />}
      tag={tag}
      meta={many ? `${roles.length} places` : postedWord(r)}
      selected={roles.some((x) => x.id === selected)}
      muted={r.rating === "no"}
      onOpen={() => onOpen(r.id, r.direction?.id ?? null)}
      menu={menu}
      checked={checked}
      onCheck={onCheck && !r.pursuit ? (on) => onCheck(r.id, on) : undefined}
      selecting={selecting}
      below={why ? <ReasonField decision="Not for me" picks={ROLE_REASONS} onDone={({ reason }) => notForMe(reason)} /> : undefined}
    />
  );
}

// The roles set apart for being against a firm limit of theirs, folded, read a page at a time once opened.
export function AgainstFold({ scope, count, selected, onOpen }: { scope: Scope; count: { count: number; more: boolean }; selected: string | null; onOpen: Open }) {
  return (
    <ListFold label="Against your limits" count={count.count} note="Against a firm limit you set" noteInline defaultOpen={false}>
      <Paged query="against" scope={scope} selected={selected} onOpen={onOpen} />
    </ListFold>
  );
}

// Roles that aren't the work of any of their directions (or the one picked), folded.
export function OtherFold({ scope, count, selected, onOpen }: { scope: Scope; count: { count: number; more: boolean }; selected: string | null; onOpen: Open }) {
  return (
    <ListFold label="Other roles" count={count.count} note={scope.directionId ? "Not the work of this direction" : "Not the work of your directions"} noteInline defaultOpen={false}>
      <Paged query="sortedOut" scope={scope} selected={selected} onOpen={onOpen} />
    </ListFold>
  );
}

function Paged({ query, scope, selected, onOpen }: { query: "against" | "sortedOut"; scope: Scope; selected: string | null; onOpen: Open }) {
  const { results, status, loadMore } = usePaginatedQuery(query === "against" ? api.roles.against : api.roles.sortedOut, scope, { initialNumItems: PAGE });
  return (
    <>
      {results.map((r) => (
        <RoleListRow key={r.id} roles={[r]} selected={selected} onOpen={onOpen} checked={false} onCheck={null} selecting={false} />
      ))}
      <More status={status} onMore={() => loadMore(PAGE)} />
    </>
  );
}

// Show more, while a list has more pages; Loading while one comes.
export function More({ status, onMore }: { status: string; onMore: () => void }) {
  if (status === "LoadingFirstPage" || status === "LoadingMore")
    return (
      <li className="px-3 py-2">
        <Text size="sm" muted>
          Loading…
        </Text>
      </li>
    );
  if (status !== "CanLoadMore") return null;
  return (
    <li className="px-1.5 py-1">
      <Button variant="ghost" size="sm" onClick={onMore}>
        Show more
      </Button>
    </li>
  );
}

// A list with nothing in it: what to do next, in a sentence.
export function Empty({ icon = "pursuits", title, children, action }: { icon?: "pursuits" | "roles" | "directions"; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="h-80">
      <EmptyState icon={icon} title={title} action={action}>
        {children}
      </EmptyState>
    </div>
  );
}
