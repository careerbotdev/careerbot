"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import type { MenuEntry } from "@/components/Menu";
import { PaneLayout, useScreenSize } from "@/components/Panes";
import { toast } from "@/components/Toast";
import { GOALS_TOUR } from "../../tours/goals";
import { useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { failed } from "../ui";
import { AddPane, LimitItem } from "./LimitItem";
import { type Group, LimitsList } from "./LimitsList";
import { ADD_LIMIT_WORDS, allWords, type Limit } from "./words";

// Limits: the list (Firm, Preference, Proposed, Rejected) and the one open beside it (?limit=), its form while editing
// (?edit=1) or Add a limit (?add=1). J and K move through the list, Esc closes what's open. On a phone the list comes
// first and an item opens full screen with a way back.

const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

export function Limits() {
  const params = useSearchParams();
  const router = useRouter();
  const size = useScreenSize();
  const small = size === "small";
  const items = useQuery(api.goals.items);
  const effects = useQuery(api.goals.effects, {});
  const review = useMutation(api.extract.review);
  const setOn = useMutation(api.goals.setLimitOn);
  const [show, setShow] = useState({ proposed: true, rejected: true });
  const [focus, setFocus] = useState<string | null>(null);
  const open = params.get("limit");
  const editing = params.get("edit") === "1";
  const adding = params.get("add") === "1";

  const limits = useMemo(() => (items ?? []).filter((i): i is Limit => i.kind === "limit"), [items]);
  const directions = useMemo(
    () => (items ?? []).flatMap((i) => (i.kind === "direction" && i.status === "approved" && !i.data.addsTo ? [String(i.data.name)] : [])),
    [items],
  );
  const groups: Group[] = useMemo(() => {
    const approved = limits.filter((l) => l.status === "approved");
    return [
      { label: "Firm", rows: approved.filter((l) => l.data.firm !== false) },
      { label: "Preference", rows: approved.filter((l) => l.data.firm === false) },
      ...(show.proposed ? [{ label: "Proposed", rows: limits.filter((l) => l.status === "proposed") }] : []),
      ...(show.rejected ? [{ label: "Rejected", rows: limits.filter((l) => l.status === "rejected") }] : []),
    ];
  }, [limits, show]);
  const entries = groups.flatMap((g) => g.rows);
  const at = entries.findIndex((l) => l.id === open);
  const current = limits.find((l) => l.id === open);

  const go = useCallback(
    (change: { limit?: string | null; edit?: boolean; add?: boolean }) => {
      const next = new URLSearchParams(params);
      if (change.limit !== undefined) {
        if (change.limit) next.set("limit", change.limit);
        else next.delete("limit");
      }
      for (const k of ["edit", "add"] as const) {
        if (change[k]) next.set(k, "1");
        else if (change[k] === false) next.delete(k);
      }
      const q = next.toString();
      router.push(q ? `/goals/limits?${q}` : "/goals/limits", { scroll: false });
    },
    [router, params],
  );
  const openLimit = useCallback((id: string) => go({ limit: id, edit: false, add: false }), [go]);
  const close = useCallback(() => go({ limit: null, edit: false, add: false }), [go]);
  const add = useCallback(() => go({ limit: null, edit: false, add: true }), [go]);
  const edit = (field?: string) => {
    setFocus(field ?? null);
    go({ edit: true });
  };
  const move = useCallback(
    (by: number) => {
      if (!entries.length) return;
      const next = entries[Math.min(entries.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
      if (next) openLimit(next.id);
    },
    [entries, at, openLimit],
  );

  // J, K and Esc; the form binds its own Esc and ⌘↵ while it's open.
  useEffect(() => {
    if (editing || adding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") move(key === "j" ? 1 : -1);
      else if (key === "Escape" && open) close();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, adding, move, open, close]);

  const commands = useMemo(
    (): Command[] => [
      { id: "limits-add", group: "Limits", label: "Add a limit", icon: "add", onSelect: add },
      ...limits.map((l): Command => ({ id: `limit-${l.id}`, group: "Limits", label: l.data.label, detail: l.status === "approved" ? undefined : l.status === "proposed" ? "Proposed" : "Rejected", icon: "limits", keywords: [l.data.value], onSelect: () => openLimit(l.id) })),
    ],
    [limits, add, openLimit],
  );
  useCommands(commands);
  const tour = useTour(GOALS_TOUR, items !== undefined);

  if (!items) return null;

  const switchOn = (l: Limit, on: boolean) =>
    void setOn({ id: l.id, on }).then(
      () => toast({ message: `${on ? "On" : "Off"}: ${l.data.label}`, icon: on ? "approve" : "undo", action: { label: "Undo", key: "U", run: () => void setOn({ id: l.id, on: !on }).catch((e: unknown) => failed(e)) } }),
      (e: unknown) => failed(e),
    );
  const restore = (l: Limit) =>
    void review({ id: l.id, status: "proposed" }).then(
      () => toast({ message: `Restored: ${l.data.label}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void review({ id: l.id, status: "rejected" }).catch((e: unknown) => failed(e)) } }),
      (e: unknown) => failed(e),
    );
  const menu: MenuEntry[] = [
    { label: "Add a limit", icon: "add", detail: ADD_LIMIT_WORDS.detail, note: ADD_LIMIT_WORDS.note, onSelect: add },
    "separator",
    { label: "Your goals story", icon: "goals", detail: "Opens your goals story, where proposed limits are read from.", note: "Free", onSelect: () => router.push("/goals") },
    { label: "Proposed limits in Review", icon: "review", detail: "Opens Review, where proposed limits wait for you to approve or reject them.", note: "Free", onSelect: () => router.push("/review") },
    { label: "Roles in Pursuits", icon: "pursuits", detail: "Opens every role in Pursuits, to see what your limits hide and rank lower.", note: "Free", onSelect: () => router.push("/pursuits?status=all") },
    tour.menu,
  ];

  const list = (
    <LimitsList
      groups={groups}
      approvedCount={limits.filter((l) => l.status === "approved").length}
      selected={open}
      effects={effects}
      show={show}
      onShow={setShow}
      small={small}
      onOpen={openLimit}
      onAdd={add}
      onSwitch={switchOn}
      onRestore={restore}
      menu={menu}
    />
  );
  const shared = { limits, directions, effects, size, onBack: close };
  const item = adding ? (
    <AddPane {...shared} position={null} onSaved={(id: Id<"items">) => openLimit(id)} onCancel={close} />
  ) : current ? (
    <LimitItem
      key={current.id}
      {...shared}
      limit={current}
      position={at >= 0 ? { at: at + 1, of: entries.length, onMove: move } : null}
      editing={editing}
      focus={focus}
      onEdit={edit}
      onEditDone={() => go({ edit: false })}
      onGone={close}
    />
  ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        list={list}
        item={item}
        empty={
          <EmptyState icon="limits" title={limits.length ? "Open a limit" : "Your limits"}>
            {effects ? `All your limits: ${allWords(effects).toLowerCase()}. ` : ""}Open one to see its rule and what it filters.
          </EmptyState>
        }
      />
    </div>
  );
}
