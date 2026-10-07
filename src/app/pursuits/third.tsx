"use client";

import { createContext, useContext } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Kbd } from "@/components/Kbd";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader } from "@/components/Panes";
import { Tooltip } from "@/components/Tooltip";

// What opens beside the item on Pursuits (the third pane on large screens, a drawer on medium, a sheet on a phone): the
// tailored resume, Ask about this role, or the message to someone found at the company.
export type Third = { kind: "resume" } | { kind: "ask" } | { kind: "message"; contactId: Id<"contacts">; name: string };

// Where an item opens its third pane. Outside Pursuits (Today) there's none, and what would open it isn't offered.
export const ThirdContext = createContext<{ third: Third | null; open: ((t: Third | null) => void) | null }>({ third: null, open: null });
export const useThird = () => useContext(ThirdContext);

// Where the open item stands in the list, and the way back to it on a phone.
export type ItemNav = { at: number; of: number; onMove: (by: number) => void; back: { label: string; onBack: () => void } };

// An item's 52px top on Pursuits: on a phone the way back; beside the list, where it is with J and K. Then its actions
// (the third pane's toggle) and its ⋯ menu.
export function ItemTop({ nav, small, menu, title, actions }: { nav: ItemNav; small: boolean; menu: MenuEntry[]; title: string; actions?: React.ReactNode }) {
  const more = <Menu label={`More for ${title}`} title={title} items={menu} />;
  if (small) return <PaneHeader back={nav.back} actions={more} />;
  return (
    <PaneHeader
      actions={
        <>
          {nav.at > 0 && (
            <span className="text-body-sm leading-body-sm text-muted tabular-nums">
              {nav.at} of {nav.of}
            </span>
          )}
          <span data-tour="pursuits.keys" className="flex items-center gap-2">
            <Step label="Next" keys="J" onClick={() => nav.onMove(1)} />
            <Step label="Previous" keys="K" onClick={() => nav.onMove(-1)} />
          </span>
          {actions}
          {more}
        </>
      }
    />
  );
}

function Step({ label, keys, onClick }: { label: string; keys: string; onClick: () => void }) {
  return (
    <Tooltip content={label} keys={keys}>
      <button type="button" aria-label={label} onClick={onClick} className="flex rounded-sm">
        <Kbd>{keys}</Kbd>
      </button>
    </Tooltip>
  );
}

// Keys an item binds while it's shown, outside fields, menus and dialogs, without modifiers.
export function onItemKey(handlers: Record<string, () => void>) {
  return (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]")) return;
    const run = handlers[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!run) return;
    e.preventDefault();
    run();
  };
}
