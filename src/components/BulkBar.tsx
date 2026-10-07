"use client";

import type { ReactNode } from "react";
import { Kbd } from "@/components/Kbd";
import { Menu, type MenuEntry } from "@/components/Menu";
import { Icons } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

// `detail` and `note` are the action's explainer: what it does to the checked rows; what it costs and whether it can
// be undone.
export type BulkAction = { label: string; keys?: string; onSelect: () => void; primary?: boolean; detail?: ReactNode; note?: ReactNode };

// 28px to look at, 32px to hit.
const action =
  "relative inline-flex h-7 shrink-0 items-center rounded-sm text-label leading-label font-medium whitespace-nowrap transition-colors duration-100 after:absolute after:inset-x-0 after:-inset-y-0.5";
const quiet = "text-inverse-text enabled:hover:bg-inverse-text/10 enabled:active:bg-inverse-text/16";

// The desktop bulk bar: while a list is selecting (useSelection) it rises on the inverse surface with the count, the
// actions the checked rows share (each with its key; off while none are checked, their tooltip saying so), a ⋯ for the
// rest, and Done, which leaves selecting. Keys are shown here and bound by the screen; in a narrow pane the key chips
// drop so Done stays in view. Phones use the bottom bar's bulk mode instead, so this hides below 768px. The screen
// renders it only while selecting.
export function BulkBar({ count, actions, more, onDone }: { count: number; actions: BulkAction[]; more?: MenuEntry[]; onDone: () => void }) {
  const off = count === 0;
  return (
    <div
      role="group"
      aria-label="Selected rows"
      className="@container flex h-12 min-w-0 items-center gap-2 rounded-sm border border-inverse bg-inverse pr-2 pl-3.5 shadow-raised transition-[opacity,translate] duration-160 ease-out max-md:hidden motion-reduce:transition-opacity starting:translate-y-2 starting:opacity-0 motion-reduce:starting:translate-y-0 dark:border-border"
    >
      <span aria-live="polite" className="text-body-sm leading-body-sm font-medium whitespace-nowrap text-inverse-text tabular-nums">
        {count ? `${count} selected` : "None selected"}
      </span>
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-inverse-text/16" />
      {actions.map((a) => {
        // Off stays focusable (aria-disabled), so its tooltip can say why.
        const button = (
          <button
            key={a.label}
            type="button"
            onClick={off ? undefined : a.onSelect}
            aria-disabled={off || undefined}
            className={`${action} gap-2 px-2.5 ${a.primary ? "bg-primary text-ink" : "text-inverse-text"} ${off ? "opacity-50" : a.primary ? "hover:bg-primary-hover active:bg-primary-active" : "hover:bg-inverse-text/10 active:bg-inverse-text/16"}`}
          >
            {a.label}
            {a.keys && <span className="flex @max-[28rem]:hidden"><Kbd on={a.primary ? "primary" : "inverse"}>{a.keys}</Kbd></span>}
          </button>
        );
        return !off && a.detail === undefined && a.note === undefined ? (
          button
        ) : (
          <Tooltip key={a.label} content={a.label} keys={a.keys} detail={off ? "None selected" : a.detail} note={off ? undefined : a.note} side="top">
            {button}
          </Tooltip>
        );
      })}
      {more && count > 0 && (
        <Menu
          items={more}
          label="More actions"
          trigger={
            <button type="button" aria-label="More actions" className={`${action} ${quiet} w-7 justify-center`}>
              <Icons.more aria-hidden />
            </button>
          }
        />
      )}
      <span className="flex-1" />
      <button type="button" onClick={onDone} className={`${action} gap-1.5 px-2 text-inverse-muted hover:bg-inverse-text/10 hover:text-inverse-text`}>
        Done
        <span className="flex @max-[28rem]:hidden"><Kbd on="inverse">Esc</Kbd></span>
      </button>
    </div>
  );
}
