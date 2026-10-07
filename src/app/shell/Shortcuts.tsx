"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Keys } from "@/components/Kbd";

// G then a letter: the areas, by the letter after G.
export const GO: Record<string, { href: string; label: string; keys: string }> = {
  t: { href: "/", label: "Today", keys: "G then T" },
  r: { href: "/review", label: "Review", keys: "G then R" },
  p: { href: "/pursuits", label: "Pursuits", keys: "G then P" },
  c: { href: "/companies", label: "Companies", keys: "G then C" },
  e: { href: "/resumes", label: "Resumes", keys: "G then E" },
  d: { href: "/record/roles", label: "Record", keys: "G then D" },
  g: { href: "/goals", label: "Goals", keys: "G then G" },
  o: { href: "/reports", label: "Reports", keys: "G then O" },
  s: { href: "/settings", label: "Settings", keys: "G then S" },
};

// How long after G the next letter still counts.
const SEQUENCE_MS = 1500;

// Where a key types instead: a field, an editor, an open menu, list or dialog.
function typing(e: KeyboardEvent) {
  const el = e.target instanceof Element ? e.target : null;
  return !!el?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]");
}

// Binds G then a letter (go to an area) and ? (every shortcut), anywhere outside a field. Listens before the screens do
// (capture), so the letter after G never also reaches a screen's own keys (R on Review).
export function useGoKeys(go: (href: string) => void, showShortcuts: () => void) {
  const since = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat || typing(e)) return;
      if (e.key === "?") {
        e.preventDefault();
        showShortcuts();
        return;
      }
      const key = e.key.toLowerCase();
      if (since.current && Date.now() - since.current < SEQUENCE_MS) {
        since.current = 0;
        const to = GO[key];
        if (!to) return;
        e.preventDefault();
        e.stopPropagation();
        go(to.href);
        return;
      }
      if (key === "g" && !e.shiftKey) since.current = Date.now();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, showShortcuts]);
}

const GROUPS: { label: string; keys: [string, string][] }[] = [
  {
    label: "Anywhere",
    keys: [
      ["⌘K", "Search or jump to"],
      ["?", "All shortcuts"],
      ...Object.values(GO).map((g): [string, string] => [g.keys, g.label]),
    ],
  },
  {
    label: "Lists",
    keys: [
      ["J", "Next"],
      ["K", "Previous"],
      ["↵", "Open"],
      ["Esc", "Close the item"],
    ],
  },
  {
    label: "Review",
    keys: [
      ["A", "Approve"],
      ["E", "Edit"],
      ["R", "Reject"],
      ["U", "Undo"],
    ],
  },
  {
    label: "Companies",
    keys: [
      ["T", "Target"],
      ["M", "Maybe"],
      ["R", "Not for me"],
      ["E", "Edit the website or job board"],
      ["N", "Add a note"],
      ["X", "Select"],
    ],
  },
];

// Every shortcut, opened with ?.
export function Shortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Shortcuts" footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}>
      {GROUPS.map((g) => (
        <section key={g.label} className="flex flex-col gap-1">
          <h3 className="text-label-caps leading-label-caps font-medium tracking-label-caps text-muted uppercase">{g.label}</h3>
          <ul className="flex flex-col">
            {g.keys.map(([keys, label]) => (
              <li key={label} className="flex h-8 items-center justify-between gap-3 text-body-sm leading-body-sm text-text">
                {label}
                <Keys keys={keys} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  );
}
