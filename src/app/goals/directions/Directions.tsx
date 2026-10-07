"use client";

import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PATHS } from "../../../../convex/directionPaths";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { CostEstimate } from "@/components/CostEstimate";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/icons";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, type ThirdPane, useScreenSize } from "@/components/Panes";
import { ReasonField } from "@/components/ReasonField";
import { RejectedRow } from "@/components/RejectedRow";
import { StatusTag } from "@/components/StatusTag";
import { TabPanel, Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../../costs";
import { GOALS_TOUR } from "../../tours/goals";
import { useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { failed } from "../ui";
import { useDirectionActs } from "./acts";
import { DirectionItem } from "./Direction";
import { ProposedItem } from "./Proposed";
import { ResumePane, ResumeStateTag, TailorPane } from "./Resume";
import { APPROVE_WORDS, type Direction, type ItemTab, lineOf, type ListTab, type Pane, PATH_ORDER, pathOf, proposedParts, REJECT_PICKS, REJECT_WORDS, rolesWord } from "./words";

// Directions: the kinds of work they're going for, approved or proposed, grouped by how their record fits (Current,
// Adjacent, Stretch), and the one open beside the list (?direction=). An approved one has tabs (?tab=) and a third pane
// with its resume or Tailor a resume (?pane=); a proposed one is one decision on the review card. Decided ones stay
// put in the list while the next opens. J and K move, Esc closes; on a phone the list comes first and a direction
// opens full screen with a way back.

const ITEM_TABS: ItemTab[] = ["overview", "criteria", "titles", "resumes", "notes"];
const SUGGEST_DETAIL = "Suggests more kinds of work your record supports, each to approve or reject.";
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog], [role=list]"));

export function Directions() {
  const size = useScreenSize();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const data = useQuery(api.directions.list);
  const fits = useQuery(api.directions.fit);
  const costs = useQuery(api.estimates.costs, {});
  const suggest = useMutation(api.directions.suggest);
  const fillIn = useMutation(api.directions.detail);
  const acts = useDirectionActs();
  const [showRejected, setShowRejected] = useState(false);
  // Decided here in the Proposed list: kept in place (as approved or rejected) until the list changes.
  const [kept, setKept] = useState<Record<string, true>>({});
  // The row whose reason is being asked, under it, after Reject from the list.
  const [why, setWhy] = useState<Id<"items"> | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  const set = useCallback(
    (next: Partial<Record<"direction" | "tab" | "list" | "pane", string | null>>, push = false) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) q.set(k, v);
        else q.delete(k);
      }
      const href = q.toString() ? `${path}?${q}` : path;
      if (push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [params, router, path],
  );

  const all = useMemo(() => data?.directions ?? [], [data]);
  const approved = all.filter((d) => d.status === "approved");
  const proposed = all.filter((d) => d.status === "proposed");
  const openId = params.get("direction");
  const open = all.find((d) => d.id === openId) ?? null;
  const listParam = params.get("list");
  const tab: ListTab =
    listParam === "approved" || listParam === "proposed"
      ? listParam
      : open
        ? open.status === "approved" && !kept[open.id]
          ? "approved"
          : "proposed"
        : approved.length || !proposed.length
          ? "approved"
          : "proposed";
  const shown = (d: Direction) =>
    tab === "approved" ? d.status === "approved" : d.status === "proposed" || !!kept[d.id] || (d.status === "rejected" && (showRejected || d.id === openId));
  const groups = PATH_ORDER.map((p) => ({ path: p, rows: all.filter((d) => shown(d) && pathOf(d) === p) })).filter((g) => g.rows.length);
  const entries = groups.flatMap((g) => g.rows).filter((d) => d.status !== "rejected" || d.id === openId);
  const at = entries.findIndex((d) => d.id === openId);

  const openRow = useCallback((id: string | null) => set({ direction: id, tab: null, pane: null }, true), [set]);
  const move = (by: number) => {
    if (!entries.length) return;
    const to = entries[Math.min(entries.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
    if (to && to.id !== openId) openRow(to.id);
  };
  // After a decision: the next one still proposed after it (else before it), or none.
  const next = (from: Direction) => {
    const i = entries.findIndex((d) => d.id === from.id);
    const later = [...entries.slice(i + 1), ...entries.slice(0, Math.max(0, i))].find((d) => d.id !== from.id && d.status === (tab === "proposed" ? "proposed" : "approved"));
    return later ?? null;
  };
  const decided = (d: Direction) => {
    if (tab === "proposed") setKept((k) => ({ ...k, [d.id]: true }));
    const after = next(d);
    set({ direction: after?.id ?? (tab === "proposed" ? d.id : null), tab: null, pane: null, list: tab }, false);
  };

  const pane = open?.status === "approved" && (params.get("pane") === "resume" || params.get("pane") === "tailor") ? (params.get("pane") as Pane) : null;
  const setPane = useCallback(
    (p: Pane | null, v?: string | null) => {
      if (v !== undefined) setVersion(v);
      set({ pane: p });
    },
    [set],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "Escape") {
        if (pane) setPane(null);
        else if (why) setWhy(null);
        else if (openId) openRow(null);
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const busy = data?.last?.status === "queued" || data?.last?.status === "running";
  const suggestCost = aboutUsd(costs?.suggestDirections);
  const fillCost = aboutUsd(costs?.directionDetail);
  const suggestNote = `${suggestCost ?? "Uses your AI budget"} · Nothing changes until you approve one`;
  const missing = approved.filter((d) => !d.data.detail).length;
  const suggestMore = useCallback(
    () =>
      void suggest({}).then(
        (jobId) => toast(jobId ? { message: "Suggesting directions", icon: "running" } : { message: "Directions are being worked on. Try again when it’s done.", icon: "failed" }),
        (e: unknown) => failed(e, "Couldn’t start."),
      ),
    [suggest],
  );
  const fillMissing = () =>
    void fillIn({}).then(
      (jobId) => toast(jobId ? { message: "Filling in your directions", icon: "running" } : { message: "Directions are being worked on. Try again when it’s done.", icon: "failed" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );

  const commands = useMemo(
    (): Command[] => [
      { id: "directions-suggest", group: "Directions", label: "Suggest more directions", icon: "add", onSelect: suggestMore },
      ...all.filter((d) => d.status !== "rejected").map((d): Command => ({ id: `direction-${d.id}`, group: "Directions", label: d.data.name, icon: "directions", onSelect: () => openRow(d.id) })),
    ],
    [all, suggestMore, openRow],
  );
  useCommands(commands);
  const tour = useTour(GOALS_TOUR, data !== undefined);

  if (!data) return null;

  const listMenu: MenuEntry[] = [
    { label: "Suggest more", icon: "add", hint: suggestCost ?? undefined, detail: SUGGEST_DETAIL, note: suggestNote, onSelect: suggestMore, ...(busy ? { disabled: true, reason: "Working on your directions now" } : {}) },
    {
      label: "Fill in directions missing detail",
      icon: "tryAgain",
      hint: fillCost ?? undefined,
      detail: "Proposes the positioning, titles and criteria for each approved direction that doesn’t have them yet.",
      note: `${fillCost ?? "Uses your AI budget"} · Nothing changes until you approve them`,
      onSelect: fillMissing,
      ...(busy ? { disabled: true, reason: "Working on your directions now" } : !missing ? { disabled: true, reason: "Every approved direction is filled in" } : {}),
    },
    tour.menu,
  ];
  const filter: MenuEntry[] = [{ label: "Show rejected", checked: showRejected, onSelect: () => setShowRejected(!showRejected) }];

  const fitOf = (d: Direction) => fits?.find((f) => f.directionId === d.id);
  const row = (d: Direction) => {
    const selected = d.id === openId;
    const onOpen = () => openRow(d.id);
    if (d.status === "rejected" && why === d.id)
      return (
        <ListRow
          key={d.id}
          title={d.data.name}
          line={lineOf(d)}
          muted
          tag={<StatusTag tone="neutral">Rejected</StatusTag>}
          onOpen={onOpen}
          below={
            <ReasonField
              bar={false}
              picks={REJECT_PICKS}
              onDone={({ reason }) => {
                setWhy(null);
                if (reason) acts.because(d, reason);
              }}
            />
          }
        />
      );
    if (d.status === "rejected")
      return <RejectedRow key={d.id} title={d.data.name} line={lineOf(d)} decision="Rejected" reason={d.data.rejectedBecause ?? undefined} onRestore={() => acts.restore(d)} selected={selected} onOpen={onOpen} />;
    if (d.status === "approved" && tab === "approved") {
      const toReview = proposedParts(d).length;
      const f = fitOf(d);
      return (
        <ListRow
          key={d.id}
          title={d.data.name}
          line={lineOf(d)}
          tag={toReview ? <StatusTag tone="info">{toReview} to review</StatusTag> : undefined}
          meta={f ? rolesWord(f.count) : undefined}
          selected={selected}
          onOpen={onOpen}
        />
      );
    }
    if (d.status === "approved") return <ListRow key={d.id} title={d.data.name} line={lineOf(d)} tag={<StatusTag tone="good">Approved</StatusTag>} selected={selected} onOpen={onOpen} />;
    const reject = () => {
      setKept((k) => ({ ...k, [d.id]: true }));
      void acts.reject(d).then(() => setWhy(d.id));
    };
    const approve = () => {
      setKept((k) => ({ ...k, [d.id]: true }));
      void acts.approve(d);
    };
    return (
      <ListRow
        key={d.id}
        title={d.data.name}
        line={lineOf(d)}
        selected={selected}
        onOpen={onOpen}
        actions={[
          { label: "Approve", icon: "approve", detail: APPROVE_WORDS.detail, note: APPROVE_WORDS.note, onSelect: approve },
          { label: "Reject", icon: "reject", detail: REJECT_WORDS.detail, note: REJECT_WORDS.note, onSelect: reject },
        ]}
        menu={[
          { label: "Approve", icon: "approve", detail: APPROVE_WORDS.detail, note: APPROVE_WORDS.note, onSelect: approve },
          { label: "Reject", icon: "reject", detail: REJECT_WORDS.detail, note: REJECT_WORDS.note, onSelect: reject },
        ]}
      />
    );
  };

  const empty =
    tab === "approved" ? (
      <EmptyState icon="directions" title="No approved directions">
        Approve a proposed direction to rank roles for it.
      </EmptyState>
    ) : (
      <EmptyState icon="directions" title="Nothing to review" action={<Button detail={SUGGEST_DETAIL} note={suggestNote} onClick={suggestMore}>Suggest more</Button>}>
        Suggest more to see kinds of work your record supports.
      </EmptyState>
    );
  const noteLine =
    data.last?.status === "failed" ? (
      <p className="flex items-start gap-1.5 text-body-sm leading-body-sm text-text">
        <Icons.failed aria-hidden className="mt-px shrink-0 text-red" />
        {data.last.mode === "suggest" ? "Suggesting failed" : "Filling in failed"}: {data.last.error ?? "try again."}
      </p>
    ) : data.last?.status === "done" && data.last.mode === "suggest" && (data.last.result as { suggested?: number } | null)?.suggested === 0 ? (
      <p className="text-body-sm leading-body-sm text-muted">No new directions this time.</p>
    ) : null;

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Directions"
        actions={
          <>
            <Menu label="Filter" items={filter} trigger={<Button variant="ghost" iconOnly icon="filter" aria-label="Filter" />} />
            <Menu label="More for Directions" title="Directions" items={listMenu} />
          </>
        }
      />
      <div data-tour="directions.list" className="flex min-h-0 flex-1 flex-col *:flex-1">
      <Tabs
        label="Directions"
        value={tab}
        onValueChange={(v) => {
          setKept({});
          set({ list: v, direction: null, tab: null, pane: null });
        }}
        className="px-4"
        tabs={[
          { value: "approved", label: "Approved", count: approved.length },
          { value: "proposed", label: "Proposed", count: proposed.length },
        ]}
      >
        <TabPanel value={tab} className="flex min-h-0 flex-col overflow-y-auto p-2">
          {groups.length ? (
            <List label={tab === "approved" ? "Approved directions" : "Proposed directions"}>
              {groups.map((g) => (
                <ListGroup key={g.path} label={PATHS[g.path]} count={g.rows.filter((d) => d.status !== "rejected").length}>
                  {g.rows.map(row)}
                </ListGroup>
              ))}
            </List>
          ) : (
            empty
          )}
        </TabPanel>
      </Tabs>
      </div>
      <div data-tour="directions.suggest" className="flex shrink-0 flex-col gap-2 border-t px-2 py-1.5">
        {noteLine && <div className="px-2 pt-1">{noteLine}</div>}
        <div className="flex h-8 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon="add"
            loading={busy}
            loadingLabel={data.last?.mode === "suggest" ? "Suggesting" : "Filling in"}
            detail="Proposes kinds of work your approved record supports that you haven’t considered. They wait under Proposed."
            note={suggestCost ?? "Uses your AI budget"}
            onClick={suggestMore}
          >
            Suggest more
          </Button>
          {suggestCost && <CostEstimate amount={suggestCost} />}
        </div>
      </div>
    </div>
  );

  const back = { label: "Directions", onBack: () => openRow(null) };
  const position = { at: at + 1, of: entries.length, onMove: move };
  const itemTab = ITEM_TABS.find((t) => t === params.get("tab")) ?? "overview";
  const item = !open ? undefined : open.status === "approved" && !(tab === "proposed" && kept[open.id]) ? (
    <DirectionItem
      key={open.id}
      d={open}
      others={approved.filter((d) => d.id !== open.id)}
      fit={fitOf(open)}
      size={size}
      position={position}
      back={back}
      tab={itemTab}
      onTab={(t) => set({ tab: t === "overview" ? null : t })}
      pane={pane}
      onPane={setPane}
      onGone={() => {
        const after = next(open);
        set({ direction: after?.id ?? null, tab: null, pane: null }, false);
      }}
    />
  ) : (
    <ProposedItem key={open.id} d={open} approved={approved.filter((d) => d.id !== open.id)} size={size} position={position} back={back} onDecided={() => decided(open)} />
  );

  const third: ThirdPane | undefined =
    open && pane
      ? {
          title: pane === "resume" ? "Resume" : "Tailor a resume",
          actions: pane === "resume" ? <ResumeStateTag directionId={open.id} /> : undefined,
          open: true,
          onOpenChange: (o) => !o && setPane(null),
          children: pane === "resume" ? <ResumePane d={open} version={version} onVersion={setVersion} /> : <TailorPane d={open} />,
        }
      : undefined;

  if (!all.length)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PaneHeader title="Directions" />
        <EmptyState
          icon="directions"
          title="No directions yet"
          action={
            <Button variant="primary" loading={busy} loadingLabel="Suggesting" detail="Proposes kinds of work your approved record supports." note={suggestCost ?? "Uses your AI budget"} onClick={suggestMore}>
              Suggest directions
            </Button>
          }
        >
          Read your goals in Goals to find the work you want, or suggest directions from your record.
        </EmptyState>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        list={listPane}
        item={item}
        empty={
          <EmptyState icon="directions" title="No direction open">
            Open one from the list, or press J.
          </EmptyState>
        }
        third={third}
      />
    </div>
  );
}
