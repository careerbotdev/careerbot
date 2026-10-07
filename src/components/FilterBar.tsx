"use client";

import { createContext, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Popover } from "@/components/Popover";
import { Icons } from "@/components/icons";

// Chips are 26px to look at (32 on phones); the ::after stretches each hit area to 32px, and to 44px on phones.
const hit = "relative after:absolute after:inset-x-0 after:-inset-y-[3px] max-md:after:inset-y-[calc(50%-22px)]";

// Lets a single-choice editor close its chip once a choice is made (choosing closes, as in every menu and sheet).
const CloseEditor = createContext<() => void>(() => {});

// One filter in effect: its name and value open its editor (a popover, or a sheet on phones); × removes it.
export function FilterChip({
  label,
  value,
  children,
  onRemove,
  open,
  onOpenChange,
}: {
  label: string;
  /** What it's set to, in words ("Strong, Some"). */
  value?: string;
  /** The editor, usually FilterOptions. */
  children: ReactNode;
  onRemove: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const setOpen = (o: boolean) => {
    setOwn(o);
    onOpenChange?.(o);
  };
  return (
    <div className="flex h-[26px] shrink-0 items-center rounded-sm border border-border bg-surface transition-colors duration-100 hover:bg-subtle max-md:h-8">
      <Popover
        title={label}
        open={isOpen}
        onOpenChange={setOpen}
        align="start"
        width={240}
        trigger={
          <button type="button" aria-label={`${label}: ${value ?? "Any"}`} className={`${hit} flex h-full items-center gap-1.5 rounded-sm pr-0.5 pl-2 text-label leading-label`}>
            <span className="text-muted">{label}</span>
            <span className="font-medium text-text">{value ?? "Any"}</span>
          </button>
        }
      >
        <CloseEditor value={() => setOpen(false)}>{children}</CloseEditor>
      </Popover>
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
        className="relative flex size-5 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-100 after:absolute after:-inset-1.5 hover:text-text max-md:after:-inset-3"
      >
        <Icons.close size={12} aria-hidden />
      </button>
    </div>
  );
}

export type Filter = {
  id: string;
  label: string;
  /** Set when the filter is in effect; its chip shows this. */
  value?: string;
  editor: ReactNode;
  onClear: () => void;
};

// Filters as chips under a list's tabs, with how many rows match. "+ Filter" lists every filter (with what each is set
// to) behind a search; picking one opens its chip. Clear removes them all. Popovers on md and up, sheets on phones.
export function FilterBar({ filters, matches, onClearAll }: { filters: Filter[]; matches?: { shown: number; total: number }; onClearAll?: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const active = filters.filter((f) => f.value !== undefined);

  const pick = (id: string) => {
    setAdding(false);
    // Let the add popover finish closing (and hand focus back) before the chip's own editor opens.
    requestAnimationFrame(() => setEditing(id));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5 max-md:gap-y-3">
      {filters
        .filter((f) => f.value !== undefined || f.id === editing)
        .map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            value={f.value}
            open={editing === f.id}
            onOpenChange={(o) => setEditing(o ? f.id : null)}
            onRemove={() => {
              f.onClear();
              if (editing === f.id) setEditing(null);
            }}
          >
            {f.editor}
          </FilterChip>
        ))}
      <Popover
        title="Filter"
        open={adding}
        onOpenChange={setAdding}
        align="start"
        width={240}
        trigger={
          <button
            type="button"
            className={`${hit} flex h-[26px] shrink-0 items-center gap-1.5 rounded-sm border border-dashed border-border pr-2 pl-2 text-label leading-label font-medium text-text transition-colors duration-100 hover:bg-subtle max-md:h-8`}
          >
            <Icons.add size={12} aria-hidden className="text-muted" />
            Filter
          </button>
        }
      >
        <FilterPicker filters={filters} onPick={pick} />
      </Popover>
      {onClearAll && active.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className={`${hit} h-[26px] shrink-0 rounded-sm px-2 text-label leading-label font-medium text-muted transition-colors duration-100 hover:bg-subtle hover:text-text max-md:h-8`}
        >
          Clear
        </button>
      )}
      {matches && (
        <span aria-live="polite" className="ml-auto pl-2 text-label leading-label whitespace-nowrap text-muted tabular-nums">
          {matches.shown.toLocaleString("en-US")} of {matches.total.toLocaleString("en-US")}
        </span>
      )}
    </div>
  );
}

// The "+ Filter" list: a search field over every filter; arrows move, Enter opens.
function FilterPicker({ filters, onPick }: { filters: Filter[]; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const listId = useId();
  const shown = filters.filter((f) => f.label.toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.min(at, shown.length - 1);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAt((current + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % Math.max(shown.length, 1));
    } else if (e.key === "Enter" && shown[current]) {
      e.preventDefault();
      onPick(shown[current].id);
    }
  };

  return (
    <div className="flex flex-col gap-px">
      <div className="px-1 pt-1 pb-1.5">
        <label className="flex h-8 items-center gap-2 rounded-sm border border-border bg-surface px-2.5 text-muted focus-within:border-steel focus-within:ring-1 focus-within:ring-steel max-md:h-11">
          <Icons.search aria-hidden className="mr-1.5" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={shown[current] ? `${listId}-${shown[current].id}` : undefined}
            aria-label="Filter by"
            placeholder="Filter by"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAt(0);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-body-md leading-body-md text-text outline-none placeholder:text-muted max-md:text-title-md"
          />
        </label>
      </div>
      <ul id={listId} role="listbox" aria-label="Filters" className="flex flex-col gap-px">
        {shown.map((f, i) => (
          <li
            key={f.id}
            id={`${listId}-${f.id}`}
            role="option"
            aria-selected={i === current}
            onClick={() => onPick(f.id)}
            onPointerMove={() => setAt(i)}
            className={`flex h-[30px] cursor-default items-center gap-2.5 rounded-sm px-2 text-body-sm leading-body-sm max-md:h-11 ${i === current ? "bg-subtle" : ""}`}
          >
            <span className="flex-1 truncate text-text">{f.label}</span>
            {f.value !== undefined && <span className="truncate text-muted">{f.value}</span>}
            <Icons.goIn aria-hidden className="shrink-0 text-muted" />
          </li>
        ))}
        {shown.length === 0 && <li className="flex h-[30px] items-center px-2 text-body-sm leading-body-sm text-muted">No filter by that name</li>}
      </ul>
    </div>
  );
}

// An editor for a filter with a set of choices: a listbox of options with a check beside each one in effect. Arrows
// move, Space or Enter toggles (or picks, for single choice).
export function FilterOptions({
  label,
  options,
  selected,
  onChange,
  multiple = true,
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiple?: boolean;
}) {
  const list = useRef<HTMLUListElement>(null);
  const close = useContext(CloseEditor);
  const toggle = (value: string) => {
    if (!multiple) {
      onChange([value]);
      close();
      return;
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: Math.min(i + 1, items.length - 1), ArrowUp: Math.max(i - 1, 0), Home: 0, End: items.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    items[next]?.focus();
  };

  return (
    <ul ref={list} role="listbox" aria-label={label} aria-multiselectable={multiple} onKeyDown={onKeyDown} className="flex flex-col gap-px">
      {options.map((o, i) => {
        const on = selected.includes(o.value);
        return (
          <li
            key={o.value}
            role="option"
            aria-selected={on}
            tabIndex={i === 0 ? 0 : -1}
            onClick={() => toggle(o.value)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                toggle(o.value);
              }
            }}
            className="flex h-[30px] cursor-default items-center gap-2 rounded-sm px-2 text-body-sm leading-body-sm outline-none hover:bg-subtle focus-visible:bg-subtle max-md:h-11"
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-text">{on && <Icons.approve aria-hidden />}</span>
            <span className="flex-1 truncate text-text">{o.label}</span>
            {o.count !== undefined && <span className="text-muted tabular-nums">{o.count}</span>}
          </li>
        );
      })}
    </ul>
  );
}
