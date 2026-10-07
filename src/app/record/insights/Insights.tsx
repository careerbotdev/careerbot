"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { CostEstimate } from "@/components/CostEstimate";
import { EmptyState } from "@/components/EmptyState";
import { type Filter, FilterBar, FilterOptions } from "@/components/FilterBar";
import { Icons } from "@/components/icons";
import { Kbd } from "@/components/Kbd";
import { List, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, type ThirdPane, useScreenSize } from "@/components/Panes";
import type { ReasonResult } from "@/components/ReasonField";
import { Spinner } from "@/components/Spinner";
import { StatusTag } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../../costs";
import { useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { RECORD_TOUR } from "../../tours/record";
import { FactsPeek } from "./FactsPeek";
import { InsightItem } from "./InsightItem";
import { claimOf, EXPLAIN, type Insight, INSIGHT_REASONS, ownersOf, placeOf, rowLine } from "./words";

// Insights: what's true of them across their roles and projects, built from what they approved. The list (Approved,
// Rejected with its Reason filter; the proposed ones wait in Review, one row away) and the insight open beside it
// (?insight=), with its facts and their story quotes in a third pane when asked. J and K move through the list, Esc
// closes what's open; Find new insights takes a fresh look. On a phone the list comes first and an insight opens full
// screen with a way back.

type Tab = "approved" | "rejected";
const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));
// A reason as the filter sorts it: one of the quick picks, their own words, or none.
const reasonKind = (r: string | null | undefined) => (!r ? "none" : INSIGHT_REASONS.includes(r) ? r : "other");
const REASON_LABELS: Record<string, string> = { none: "No reason", other: "In your words" };
const FIND_DETAIL = "Reads your approved record for what’s true of you across roles and projects. New ones wait in Review.";

export function Insights() {
  const params = useSearchParams();
  const router = useRouter();
  const small = useScreenSize() === "small";
  const data = useQuery(api.insights.list);
  const items = useQuery(api.extract.items);
  const costs = useQuery(api.estimates.costs, {});
  const tour = useTour(RECORD_TOUR, !!data && !!items);
  const review = useMutation(api.extract.review);
  const start = useMutation(api.insights.start);
  const owners = useMemo(() => ownersOf(items), [items]);
  const open = params.get("insight");
  // Rejecting: the reason field is open, the insight shown as rejected until the reason is saved or skipped; then the
  // rejection and its reason are saved together. Those rejected here stay in the list they were in, tagged, until the
  // tab changes.
  const [pending, setPending] = useState<string | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [peek, setPeek] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [editAsked, setEditAsked] = useState(0);

  const all = useMemo(() => data?.insights ?? [], [data]);
  const current = all.find((i) => i.id === open) ?? null;
  const asked = params.get("tab");
  const tab: Tab = asked === "rejected" || asked === "approved" ? asked : current?.status === "rejected" && !kept.has(current.id) ? "rejected" : "approved";
  const statusOf = useCallback((i: Insight) => (i.id === pending ? "rejected" : i.status), [pending]);
  const approved = all.filter((i) => statusOf(i) === "approved");
  const rejected = all.filter((i) => statusOf(i) === "rejected");
  const proposed = all.filter((i) => i.status === "proposed").length;

  const rows = useMemo(() => {
    const inTab = all.filter((i) => (tab === "approved" ? i.status === "approved" || kept.has(i.id) || i.id === pending : statusOf(i) === "rejected"));
    return inTab.filter((i) => (tab !== "rejected" || !reason || reasonKind(i.data.rejectedBecause) === reason) && (!from || i.basedOn.some((f) => placeOf(f, owners).key === from)));
  }, [all, tab, kept, pending, statusOf, reason, from, owners]);
  const at = rows.findIndex((i) => i.id === open);

  const go = useCallback(
    (change: { insight?: string | null; tab?: Tab | null }) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(change)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const q = next.toString();
      router.push(q ? `/record/insights?${q}` : "/record/insights", { scroll: false });
    },
    [params, router],
  );
  const openInsight = useCallback((id: string) => go({ insight: id }), [go]);
  const close = useCallback(() => go({ insight: null }), [go]);
  const move = useCallback(
    (by: number) => {
      const next = rows[Math.min(rows.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
      if (next) openInsight(next.id);
    },
    [rows, at, openInsight],
  );
  const setTab = (t: Tab) => {
    setKept(new Set());
    go({ tab: t, insight: null });
  };
  const peekOpen = !!current && peek === current.id;
  const setPeekOpen = useCallback((o: boolean) => setPeek(o && open ? open : null), [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e) || pending) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") {
        if (e.target instanceof Element && e.target.closest("[role=list]")) return;
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "Escape") {
        if (peekOpen) setPeek(null);
        else if (open) close();
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, peekOpen, open, close, pending]);

  const reject = useCallback(
    (id: string) => {
      if (open !== id) openInsight(id);
      setPending(id);
    },
    [open, openInsight],
  );
  const rejectDone = (id: string) => ({ reason: why }: ReasonResult) => {
    setPending(null);
    setKept((s) => new Set(s).add(id));
    void review({ id: id as Insight["id"], status: "rejected", note: why }).then(
      () => toast({ message: "Insight rejected", icon: "reject", action: { label: "Undo", key: "U", run: () => void review({ id: id as Insight["id"], status: "approved" }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const moveBack = useCallback(
    (i: Insight) =>
      void review({ id: i.id, status: "proposed" }).then(
        () =>
          toast({
            message: "Insight moved back to Review",
            icon: "undo",
            action: { label: "Undo", key: "U", run: () => void review({ id: i.id, status: i.status === "rejected" ? "rejected" : "approved", note: i.data.rejectedBecause ?? undefined }) },
          }),
        (e: unknown) => failed(e, "Couldn’t save that."),
      ),
    [review],
  );

  const busy = data?.last?.status === "queued" || data?.last?.status === "running";
  const cost = aboutUsd(costs?.insights);
  const find = useCallback(
    () => void start({}).then(() => toast({ message: "Looking for new insights", icon: "running" }), (e: unknown) => failed(e, "Couldn’t start.")),
    [start],
  );

  const commands = useMemo((): Command[] => {
    const list: Command[] = [
      { id: "insights-approved", group: "Insights", label: "Approved insights", icon: "insights", onSelect: () => setTab("approved") },
      { id: "insights-rejected", group: "Insights", label: "Rejected insights", icon: "reject", onSelect: () => setTab("rejected") },
      { id: "insights-review", group: "Insights", label: "Insights waiting in Review", icon: "review", onSelect: () => router.push("/review?kind=insights") },
      { id: "insights-find", group: "Insights", label: busy ? "Looking for new insights…" : "Find new insights", detail: cost ?? undefined, icon: "insights", onSelect: () => !busy && find() },
    ];
    if (current) {
      const title = claimOf(current.data.text).claim;
      list.push({ id: "insight-peek", group: "This insight", label: peekOpen ? "Hide story quotes" : "Show with story quotes", keywords: [title], icon: "thirdPane", onSelect: () => setPeekOpen(!peekOpen) });
      if (current.status === "approved")
        list.push(
          { id: "insight-edit", group: "This insight", label: "Edit the insight", keywords: [title], icon: "edit", keys: "E", onSelect: () => setEditAsked((n) => n + 1) },
          { id: "insight-undo", group: "This insight", label: "Undo approval", keywords: [title], icon: "undo", onSelect: () => moveBack(current) },
          { id: "insight-reject", group: "This insight", label: "Reject the insight", keywords: [title], icon: "reject", keys: "R", onSelect: () => reject(current.id) },
        );
      if (current.status === "rejected") list.push({ id: "insight-back", group: "This insight", label: "Move back to Review", keywords: [title], icon: "undo", onSelect: () => moveBack(current) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, peekOpen, busy, cost, find, moveBack, reject, setPeekOpen, router]);
  useCommands(commands);

  if (!data || !items) return null;

  const places = new Map(all.flatMap((i) => i.basedOn.map((f) => placeOf(f, owners))).map((p) => [p.key, p.label]));
  const filters: Filter[] = [
    ...(tab === "rejected"
      ? [
          {
            id: "reason",
            label: "Reason",
            value: reason ? (REASON_LABELS[reason] ?? reason) : "Any",
            onClear: () => setReason(null),
            editor: (
              <FilterOptions
                label="Reason"
                multiple={false}
                selected={[reason ?? "any"]}
                onChange={([v]) => setReason(v === "any" ? null : v)}
                options={[{ value: "any", label: "Any reason" }, ...INSIGHT_REASONS.map((r) => ({ value: r, label: r })), { value: "other", label: REASON_LABELS.other }, { value: "none", label: REASON_LABELS.none }].map((o) => ({
                  ...o,
                  count: o.value === "any" ? rejected.length : rejected.filter((i) => reasonKind(i.data.rejectedBecause) === o.value).length,
                }))}
              />
            ),
          },
        ]
      : []),
    {
      id: "from",
      label: "From",
      value: from ? (places.get(from) ?? undefined) : undefined,
      onClear: () => setFrom(null),
      editor: (
        <FilterOptions
          label="From"
          multiple={false}
          selected={[from ?? ""]}
          onChange={([v]) => setFrom(v || null)}
          options={[...places].map(([value, label]) => ({ value, label }))}
        />
      ),
    },
  ];
  const showFilters = tab === "rejected" || filtering || !!from;
  const menu: MenuEntry[] = [
    {
      label: busy ? "Looking for new insights…" : "Find new insights",
      icon: "insights",
      hint: cost ?? undefined,
      detail: FIND_DETAIL,
      note: cost ?? "Uses your AI budget",
      onSelect: find,
      ...(busy ? { disabled: true, reason: "Looking now" } : {}),
    },
    { label: "Open Review", icon: "review", count: proposed || undefined, onSelect: () => router.push("/review?kind=insights"), detail: "Opens the insights waiting for you to approve or reject.", note: "Free" },
    "separator",
    tour.menu,
  ];

  const rowMenu = (i: Insight): MenuEntry[] =>
    statusOf(i) === "approved"
      ? [
          { label: "Undo approval", icon: "undo", onSelect: () => moveBack(i), ...EXPLAIN.undoApproval },
          { label: "Reject", icon: "reject", keys: "R", onSelect: () => reject(i.id), ...EXPLAIN.reject },
        ]
      : [{ label: "Move back to Review", icon: "undo", onSelect: () => moveBack(i), ...EXPLAIN.moveBack }];

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Insights"
        actions={
          <>
            <Button
              variant="ghost"
              iconOnly
              icon="filter"
              aria-label={showFilters ? "Hide filters" : "Filter"}
              aria-pressed={showFilters}
              detail="Narrows the list to insights from one role or project; rejected ones also by why."
              note="Free"
              onClick={() => setFiltering(!filtering)}
            />
            <Menu label="More for Insights" items={menu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Insights" className="data-[state=open]:bg-border data-[state=open]:text-text" data-tour="record.more" />} />
          </>
        }
      />
      <div data-tour="record.tabs">
      <Tabs
        label="Insights by status"
        className="px-4"
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        tabs={[
          { value: "approved", label: "Approved", count: approved.length },
          { value: "rejected", label: "Rejected", count: rejected.length },
        ]}
      />
      </div>
      {showFilters && <FilterBar filters={filters} matches={tab === "rejected" || from ? { shown: rows.length, total: tab === "rejected" ? rejected.length : approved.length } : undefined} onClearAll={from || reason ? () => (setFrom(null), setReason(null)) : undefined} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "approved" && proposed > 0 && (
          <List label="Waiting in Review" className="px-2 pt-2">
            <ListRow
              title={`${proposed} proposed`}
              line="Waiting in Review"
              href="/review?kind=insights"
              lead={
                <span className="flex size-7 items-center justify-center rounded-sm border bg-subtle text-muted">
                  <Icons.review size={16} aria-hidden />
                </span>
              }
              tag={<Icons.goIn aria-hidden className="text-muted" />}
            />
          </List>
        )}
        {rows.length ? (
          <List label={tab === "approved" ? "Approved insights" : "Rejected insights"} tour="record.list" className="p-2">
            {rows.map((i) => {
              const out = statusOf(i) === "rejected";
              return (
                <ListRow
                  key={i.id}
                  wrap
                  title={claimOf(i.data.text).claim}
                  line={tab === "rejected" && i.data.rejectedBecause ? `${i.data.rejectedBecause} · ${rowLine(i, owners)}` : rowLine(i, owners)}
                  muted={out}
                  tag={out && tab === "approved" ? <StatusTag tone="neutral">Rejected</StatusTag> : undefined}
                  selected={i.id === open}
                  onOpen={() => openInsight(i.id)}
                  menu={i.id === pending ? undefined : rowMenu(i)}
                />
              );
            })}
          </List>
        ) : (
          <div className="h-80">
            {tab === "approved" ? (
              <EmptyState icon="insights" title={from ? "None from there" : "No insights yet"}>
                {from ? "No approved insight draws on it." : "Insights come from what you approved, across your roles and projects. Find new ones below."}
              </EmptyState>
            ) : (
              <EmptyState icon="reject" title={reason ? "None with that reason" : "Nothing rejected"}>
                {reason ? "Change or clear the filter." : "Insights you reject show here with why, and never come back."}
              </EmptyState>
            )}
          </div>
        )}
      </div>
      <div className="flex h-13 shrink-0 items-center gap-3 border-t px-4">
        {busy ? (
          <span role="status" className="flex items-center gap-2">
            <Spinner />
            <Text size="sm" as="span">
              Looking for new insights…
            </Text>
          </span>
        ) : (
          <>
            <Button icon="insights" onClick={find} detail={FIND_DETAIL} note={cost ?? "Uses your AI budget"}>
              Find new insights
            </Button>
            {data.last?.status === "failed" ? (
              <Text size="sm" muted as="span" className="truncate">
                The last look failed
              </Text>
            ) : data.last?.status === "done" && data.last.added === 0 ? (
              <Text size="sm" muted as="span" className="truncate">
                Nothing new last time
              </Text>
            ) : (
              cost && <CostEstimate amount={cost} />
            )}
          </>
        )}
      </div>
    </div>
  );

  const item = current ? (
    <InsightItem
      key={current.id}
      insight={current}
      owners={owners}
      small={small}
      nav={{ at: at + 1, of: rows.length, onMove: move, back: { label: "Insights", onBack: close } }}
      peek={peekOpen}
      onPeek={setPeekOpen}
      lit={lit}
      onLight={setLit}
      editAsked={editAsked}
      rejecting={{ open: pending === current.id, start: () => reject(current.id), done: rejectDone(current.id), cancel: () => setPending(null) }}
    />
  ) : undefined;

  const third: ThirdPane | undefined = current
    ? {
        title: "Built on",
        actions: small ? undefined : <Kbd>Esc</Kbd>,
        open: peekOpen,
        onOpenChange: setPeekOpen,
        children: <FactsPeek insight={current} owners={owners} lit={lit} onLight={setLit} />,
      }
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        list={list}
        item={item}
        third={third}
        empty={
          <EmptyState icon="insights" title="Open an insight">
            See what it’s built on, where it’s used, and change or reject it.
          </EmptyState>
        }
      />
    </div>
  );
}
