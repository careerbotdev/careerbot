"use client";

import { useId, useState, type ReactNode } from "react";
import { Count } from "./StatusTag";
import { Icons } from "./icons";

// A group inside a List that folds away: a chevron, its name and count, a muted line saying what's in it (under the
// name, or at the right of it with `noteInline` on medium screens and up), then its rows while open; closed, its rows
// aren't rendered at all. For rows kept apart from the main list (Set aside, Against your limits). Controlled with
// `open` and `onOpenChange`, or its own from `defaultOpen`.
export function ListFold({
  label,
  count,
  note,
  noteInline = false,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  count?: number;
  note?: ReactNode;
  defaultOpen?: boolean;
  noteInline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  const [own, setOwn] = useState(defaultOpen);
  const isOpen = open ?? own;
  const toggle = () => {
    setOwn(!isOpen);
    onOpenChange?.(!isOpen);
  };
  const Chevron = isOpen ? Icons.expand : Icons.goIn;
  return (
    <li className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={toggle}
        className="flex flex-col gap-0.5 rounded-sm px-3 pt-3 pb-2 text-left transition-colors duration-100 hover:bg-subtle max-md:min-h-11"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Chevron aria-hidden="true" size={14} className="shrink-0 text-muted" />
          <span className="text-body-sm leading-body-sm font-semibold text-text">{label}</span>
          {count !== undefined && <Count>{count}</Count>}
          {note && noteInline && <span className="ml-auto hidden min-w-0 truncate pl-2 text-label leading-label text-muted md:block">{note}</span>}
        </span>
        {note && <span className={`pl-[22px] text-label leading-label text-muted ${noteInline ? "md:hidden" : ""}`}>{note}</span>}
      </button>
      {isOpen && (
        <ul id={id} role="list" aria-label={label} className="flex flex-col gap-0.5">
          {children}
        </ul>
      )}
    </li>
  );
}
