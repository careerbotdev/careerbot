"use client";

import { useCallback, useMemo, useState } from "react";
import type { MenuEntry } from "@/components/Menu";

// Selecting several rows of a list. It's never entered by the pointer passing over a row: only on purpose, from Select
// in the list's ⋯ menu (or a row's menu), X or Space on a row, Shift- or ⌘-click on a row, or a long press on a phone.
// While it's on, every row that can be checked shows its box, a click checks a row instead of opening it, and the bulk
// bar shows, with none checked too. Done (or Esc) leaves it and unchecks everything, as does acting on what's checked.
export type Selection = {
  on: boolean;
  checked: ReadonlySet<string>;
  start: () => void;
  // Checks or unchecks rows; checking any starts selecting.
  check: (ids: readonly string[], on: boolean) => void;
  done: () => void;
};

export function useSelection(): Selection {
  const [on, setOn] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const start = useCallback(() => setOn(true), []);
  const done = useCallback(() => {
    setOn(false);
    setChecked(new Set());
  }, []);
  const check = useCallback((ids: readonly string[], value: boolean) => {
    if (value) setOn(true);
    setChecked((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  return useMemo(() => ({ on, checked, start, check, done }), [on, checked, start, check, done]);
}

// The list ⋯ menu's entries for it: Select (and Select all) while it's off; Select all and Done while it's on. `ids`
// are the rows shown that can be checked; `many` names them ("companies").
export function selectEntries(sel: Selection, ids: readonly string[], many: string): MenuEntry[] {
  const all: MenuEntry[] = ids.length > 1 && ids.some((id) => !sel.checked.has(id)) ? [{ label: `Select all ${ids.length}`, icon: "approveAll", detail: `Checks every one of the ${many} shown.`, note: "Free", onSelect: () => sel.check(ids, true) }] : [];
  return sel.on
    ? [...all, { label: "Done selecting", icon: "close", keys: "Esc", detail: "Hides the boxes and unchecks everything.", note: "Free", onSelect: sel.done }]
    : ids.length
      ? [{ label: "Select", icon: "select", detail: `Shows a box on each of the ${many}, to act on several at once.`, note: "Free", onSelect: sel.start }, ...all]
      : [];
}
