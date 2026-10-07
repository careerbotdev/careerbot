"use client";

import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { Icons, type IconName } from "@/components/icons";
import { Kbd } from "@/components/Kbd";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, type ScreenSize } from "@/components/Panes";
import { Count } from "@/components/StatusTag";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { clockNow } from "../clock";

// What the Goals screens (Goals, Limits, Directions) share: the item's top and head, its sections, the Details column's
// place, rows of values, and how a failed save is said.

export const failed = (e: unknown, fallback = "Couldn’t save that.") => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// "Sep 23", with the year when it isn't this one.
export function day(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date(clockNow()).getFullYear() ? { year: "numeric" } : {}) });
}

// "Sep 23, 11:55 PM".
export const dayTime = (ms: number) => `${day(ms)}, ${new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

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

// Where the open item stands in its list, for J and K.
export type Position = { at: number; of: number; onMove: (by: number) => void };

// An item's 52px top: on a phone the way back; beside the list, where it is with J and K. Then its own actions (the
// third pane's toggle) and its ⋯ menu.
export function ItemTop({ small, position, back, menu, title, actions }: { small: boolean; position: Position | null; back: { label: string; onBack: () => void }; menu: MenuEntry[]; title: string; actions?: ReactNode }) {
  const more = menu.length ? <Menu label={`More for ${title}`} title={title} items={menu} /> : null;
  if (small) return <PaneHeader back={back} actions={more} />;
  return (
    <PaneHeader
      actions={
        <>
          {position && position.at > 0 && (
            <>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">
                {position.at} of {position.of}
              </span>
              <Step label="Next" keys="J" onClick={() => position.onMove(1)} />
              <Step label="Previous" keys="K" onClick={() => position.onMove(-1)} />
            </>
          )}
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

// The side padding of an item pane at each size.
export const padOf = (size: ScreenSize) => (size === "large" ? "px-8" : size === "medium" ? "px-6" : "px-4");

// An item's head: its area's mark in a 40px box, the title and a muted line, then what can be done with it (lined up
// under the title on medium screens and up).
export function ItemHead({ icon, title, line, size, children }: { icon: IconName; title: string; line?: ReactNode; size: ScreenSize; children?: ReactNode }) {
  const Icon = Icons[icon];
  return (
    <div className={`flex shrink-0 flex-col gap-4 border-b pb-6 ${padOf(size)} ${size === "small" ? "pt-1" : ""}`}>
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-sm border bg-subtle text-text">
          <Icon size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Heading>{title}</Heading>
          {line && (
            <Text size="sm" muted>
              {line}
            </Text>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:pl-[54px]">{children}</div>}
    </div>
  );
}

// An item's body and its Details: beside it on a large screen (240 wide, a rule on its left), else after the body's
// sections, two abreast. `details` is given the column count and its classes.
export function ItemBody({ size, details, children }: { size: ScreenSize; details?: (columns: 1 | 2, className: string) => ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1">
      <div className={`flex min-w-0 flex-1 flex-col gap-7 py-6 ${padOf(size)}`}>
        {children}
        {size !== "large" && details?.(2, "border-t pt-5")}
      </div>
      {size === "large" && details?.(1, "w-60 shrink-0 self-stretch border-l px-6 py-5")}
    </div>
  );
}

// A section of an item: its label with a count, and anything that goes with the label at the right (Built on, a link).
export function Section({ label, count, extra, tag, children, className = "" }: { label: string; count?: number; extra?: ReactNode; tag?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={`flex flex-col gap-3 ${className}`}>
      <h3 className="flex min-h-5.5 items-center gap-2 text-label leading-label font-medium text-text">
        {label}
        {count !== undefined && <Count>{count.toLocaleString("en-US")}</Count>}
        {tag}
        {extra && (
          <>
            <span className="flex-1" />
            {extra}
          </>
        )}
      </h3>
      {children}
    </section>
  );
}

// Labelled values, one to a row with a rule above each: a rule's fields, a direction's criteria. The label sits in a
// fixed lane so the values line up.
export function ValueRows({ rows, lane = "w-32" }: { rows: { label: string; value: ReactNode; note?: ReactNode }[]; lane?: string }) {
  return (
    <dl className="flex flex-col">
      {rows.map((r) => (
        <div key={r.label} className="flex gap-4 border-t py-2.5 text-body-sm leading-body-sm max-md:flex-col max-md:gap-1">
          <dt className={`${lane} shrink-0 text-muted`}>{r.label}</dt>
          <dd className="flex min-w-0 flex-1 flex-col gap-0.5 text-text">
            {r.value}
            {r.note && <span className="text-muted">{r.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// A caution or problem in the flow: a 2px rule at its left, the headline in the tone's words and a muted line under it,
// with its actions after.
export function Notice({ tone, title, children, actions }: { tone: "caution" | "problem"; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div role="note" className={`flex flex-col gap-1 border-l-2 pl-3 ${tone === "caution" ? "border-caution" : "border-red"}`}>
      <p className={`text-body-sm leading-body-sm font-medium ${tone === "caution" ? "text-caution-text" : "text-red dark:text-text"}`}>{title}</p>
      {children && <div className="text-body-sm leading-body-sm text-muted">{children}</div>}
      {actions && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1.5">{actions}</div>}
    </div>
  );
}

// A link in running text: underlined in the border colour, darkening on hover.
export const inlineLink = "rounded-sm underline decoration-border decoration-1 underline-offset-3 transition-colors duration-100 hover:decoration-text";
