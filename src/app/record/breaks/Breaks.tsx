"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/icons";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { StatusTag } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { useNow } from "../../clock";
import { RECORD_TOUR } from "../../tours/record";
import { useFactPane } from "../facts/Facts";
import { BreakForm, type BreakValues } from "./BreakForm";
import { BreakHead, BreakItem, BreakMark } from "./BreakItem";
import { usePlaceBreak } from "./OnResumes";
import { ADD_BREAK, gapsOf, isBreak, lengthOf, type Role, span } from "./words";

// Breaks: the career breaks in the record (?break= the one open; the first on larger screens when none is), with the
// Removed tab for those taken out, the gaps of three months or more between approved roles (each offered as a break,
// never turned into one on its own) and Add a break (B; ?add=1, with &start= and &end= to fill in its months). J and K
// move through the breaks, Esc closes what's open. A fact opened from a break (?fact=) opens beside it. On a phone the
// list comes first and a break opens full screen with a way back.

type Tab = "breaks" | "removed";
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

export function Breaks() {
  const params = useSearchParams();
  const router = useRouter();
  const size = useScreenSize();
  const small = size === "small";
  const items = useQuery(api.extract.items);
  const tour = useTour(RECORD_TOUR, items !== undefined);
  const add = useMutation(api.breaks.add);
  const place = usePlaceBreak();
  const now = useNow(true);
  const [picked, setPicked] = useState<Tab | null>(null);
  // Rows removed or restored here stay where they were until the tab changes.
  const [stay, setStay] = useState<string[]>([]);
  // A break just added, waiting to appear so its resume choice can be saved.
  const placing = useRef<{ id: string; values: BreakValues } | null>(null);

  const adding = params.get("add") === "1";
  const asked = params.get("break");
  const fact = params.get("fact");
  const rows = useMemo(() => items ?? [], [items]);
  const all = useMemo(() => rows.filter(isBreak).sort((a, b) => String(b.data.start ?? "").localeCompare(String(a.data.start ?? ""))), [rows]);
  const wanted = asked ? all.find((r) => r.id === asked || r.roleKey === asked) : undefined;
  const tab: Tab = picked ?? (wanted?.status === "rejected" ? "removed" : "breaks");
  const shown = all.filter((r) => stay.includes(r.id) || (tab === "removed") === (r.status === "rejected"));
  const counts = { breaks: all.filter((r) => r.status !== "rejected").length, removed: all.filter((r) => r.status === "rejected").length };
  const open = adding ? undefined : (wanted ?? (small ? undefined : shown[0]));
  const at = open ? shown.findIndex((r) => r.id === open.id) : -1;
  const { gaps, runs } = useMemo(() => gapsOf(rows, now), [rows, now]);

  const go = useCallback(
    (change: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(change)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const q = next.toString();
      router.push(q ? `/record/breaks?${q}` : "/record/breaks", { scroll: false });
    },
    [params, router],
  );
  const openBreak = useCallback((id: string) => go({ break: id, add: null, start: null, end: null, fact: null }), [go]);
  const startAdd = useCallback((start?: string, end?: string) => go({ add: "1", start, end, break: null, fact: null }), [go]);
  const close = useCallback(() => go({ break: null, add: null, start: null, end: null, fact: null }), [go]);
  const move = useCallback(
    (by: number) => {
      if (!shown.length) return;
      const next = shown[Math.min(shown.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
      if (next) openBreak(next.id);
    },
    [shown, at, openBreak],
  );
  const setTab = useCallback((t: Tab) => {
    setPicked(t);
    setStay([]);
  }, []);
  const factPane = useFactPane(open ? fact : null, () => go({ fact: null }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") move(key === "j" ? 1 : -1);
      else if (key === "b") startAdd();
      else if (key === "Escape") {
        if (fact) go({ fact: null });
        else if (adding || asked) close();
        else return;
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, startAdd, fact, adding, asked, go, close]);

  // Once a new break shows up, its resume choice is saved (Show needs nothing saved).
  useEffect(() => {
    const wait = placing.current;
    const made = wait && all.find((r) => r.id === wait.id);
    if (!wait || !made?.roleKey) return;
    placing.current = null;
    const v = wait.values;
    if (v.choice !== "show") void place({ roleKey: made.roleKey, start: v.start, end: v.end, reason: v.reason || undefined }, v.choice, v.into);
  }, [all, place]);

  const save = async (v: BreakValues) => {
    try {
      const id = await add({ start: v.start, end: v.end, reason: v.reason });
      placing.current = { id, values: v };
      setTab("breaks");
      openBreak(id);
      toast({ message: "Break added", icon: "breaks" });
      return null;
    } catch (e) {
      return e instanceof ConvexError ? String(e.data) : "Couldn’t save the break.";
    }
  };

  const listMenu: MenuEntry[] = [
    { label: "Add a break", icon: "add", keys: "B", onSelect: () => startAdd(), detail: ADD_BREAK.detail, note: ADD_BREAK.note },
    "separator",
    {
      label: tab === "removed" ? "Show breaks" : "Show removed breaks",
      icon: tab === "removed" ? "breaks" : "setAside",
      onSelect: () => setTab(tab === "removed" ? "breaks" : "removed"),
      detail: tab === "removed" ? "Lists your breaks again." : "Lists the breaks you removed, to restore.",
      note: "Free",
    },
    "separator",
    tour.menu,
  ];
  const commands = useMemo(
    (): Command[] => [
      { id: "breaks-add", group: "Breaks", label: "Add a break", icon: "add", keys: "B", onSelect: () => startAdd() },
      { id: "breaks-tab", group: "Breaks", label: "Breaks", icon: "breaks", onSelect: () => setTab("breaks") },
      { id: "breaks-removed", group: "Breaks", label: "Removed breaks", icon: "setAside", onSelect: () => setTab("removed") },
      ...gaps.map((g): Command => ({ id: `breaks-gap-${g.start}`, group: "Breaks", label: `Add ${span(g.start, g.end)} as a career break`, icon: "add", onSelect: () => startAdd(g.start, g.end) })),
    ],
    [startAdd, setTab, gaps],
  );
  useCommands(commands);

  if (!items) return null;

  const row = (r: Role) => {
    const out = r.status === "rejected";
    return (
      <ListRow
        key={r.id}
        title={r.data.title || "Career break"}
        line={[span(r.data.start, r.data.end), r.data.reason].filter(Boolean).join(" · ")}
        lead={<BreakMark size="row" />}
        tag={out ? <StatusTag tone="neutral">Removed</StatusTag> : r.status === "proposed" ? <StatusTag tone="neutral">Not approved</StatusTag> : undefined}
        meta={out ? undefined : (lengthOf(r.data.start, r.data.end, now) ?? undefined)}
        selected={r.id === open?.id}
        onOpen={() => openBreak(r.id)}
        menu={[
          { label: "Open", icon: "goIn", onSelect: () => openBreak(r.id), detail: "Opens the break.", note: "Free" },
          { label: "Copy link", icon: "link", onSelect: () => void navigator.clipboard.writeText(`${window.location.origin}/record/breaks?break=${r.id}`).then(() => toast({ message: "Link copied", icon: "link" })), detail: "Copies a link to this break.", note: "Free" },
        ]}
      />
    );
  };
  const start = params.get("start") ?? undefined;
  const end = params.get("end") ?? undefined;

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Breaks"
        actions={
          <>
            {small && <Button variant="ghost" iconOnly icon="add" aria-label="Add a break" keys="B" detail={ADD_BREAK.detail} note={ADD_BREAK.note} onClick={() => startAdd()} />}
            <Menu label="More for Breaks" items={listMenu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Breaks" className="data-[state=open]:bg-border data-[state=open]:text-text" data-tour="record.more" />} />
          </>
        }
      />
      <div data-tour="record.tabs">
      <Tabs
        label="Breaks by status"
        className="px-4"
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        tabs={[
          { value: "breaks", label: "Breaks", count: counts.breaks },
          { value: "removed", label: "Removed", count: counts.removed },
        ]}
      />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <List label="Breaks" tour="record.list" className="p-2">
          {tab === "breaks" ? (
            (shown.length > 0 || adding) && (
              <ListGroup label="Breaks" count={shown.length}>
                {shown.map(row)}
                {adding && <ListRow title="New break" line={start ? span(start, end) : "Dates not set yet"} lead={<BreakMark size="row" />} selected onOpen={() => {}} />}
              </ListGroup>
            )
          ) : shown.length ? (
            <ListGroup label="Removed" count={shown.length}>
              {shown.map(row)}
            </ListGroup>
          ) : (
            <Note title="Nothing removed" line="Breaks you remove show here, to restore." />
          )}
          {tab === "breaks" && (
            <ListGroup label="Gaps between roles" count={gaps.length || undefined}>
              {gaps.length ? (
                gaps.map((g) => (
                  <ListRow
                    key={g.start}
                    title={span(g.start, g.end)}
                    line={g.between}
                    lead={
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-dashed text-muted">
                        <Icons.add aria-hidden size={16} />
                      </span>
                    }
                    meta={g.length}
                    onOpen={() => startAdd(g.start, g.end)}
                    actions={[{ label: "Add as a career break", icon: "add", onSelect: () => startAdd(g.start, g.end), detail: "Starts a break with these months filled in.", note: "Free" }]}
                  />
                ))
              ) : (
                <Note title="No gaps" line={runs ?? "Approve roles with their dates to see the gaps between them."} />
              )}
            </ListGroup>
          )}
        </List>
        <div className="px-2 pb-2">
          <div className="flex border-t p-2">
            <span className="flex-1" />
            <Button variant="ghost" size="sm" icon="add" keys="B" detail={ADD_BREAK.detail} note={ADD_BREAK.note} onClick={() => startAdd()}>
              Add a break
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const addMenu: MenuEntry[] = [{ label: "Cancel", icon: "close", keys: "Esc", onSelect: close }];
  const item = adding ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <PaneHeader back={small ? { label: "Breaks", onBack: close } : undefined} actions={<Menu label="More for New break" title="New break" items={addMenu} />} />
      <BreakHead title="New break" line="Add the months you were away from work." />
      <BreakForm key={`${start ?? ""}-${end ?? ""}`} roleKey="break-new" small={small} initial={{ start, end }} onSave={save} onCancel={close} />
    </div>
  ) : open ? (
    <BreakItem
      key={open.id}
      role={open}
      rows={rows}
      small={small}
      large={size === "large"}
      nav={{ at: at + 1, of: shown.length, onMove: move, back: { label: tab === "removed" ? "Removed" : "Breaks", onBack: close } }}
      fact={fact}
      onFact={(id) => go({ fact: id })}
      onRemoved={(id) => {
        setPicked(tab);
        setStay((s) => (s.includes(id) ? s : [...s, id]));
      }}
    />
  ) : undefined;

  const empty = (
    <EmptyState
      icon="breaks"
      title={tab === "removed" ? "Nothing removed" : "No breaks"}
      action={
        <Button icon="add" keys="B" detail={ADD_BREAK.detail} note={ADD_BREAK.note} onClick={() => startAdd()}>
          Add a break
        </Button>
      }
    >
      Add the months you were away from work.
    </EmptyState>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={list} item={item} empty={empty} third={factPane} />
    </div>
  );
}

// A line in the list that isn't a row: "No gaps" and how far the roles run.
function Note({ title, line }: { title: string; line: string }) {
  return (
    <li className="flex flex-col gap-0.5 px-3 pt-1 pb-2">
      <span className="text-body-sm leading-body-sm font-medium text-text">{title}</span>
      <span className="text-body-sm leading-body-sm text-muted">{line}</span>
    </li>
  );
}
