"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { Icons, type IconName } from "./icons";
import { ReasonField, type ReasonResult } from "./ReasonField";

export type BottomBarItem = { label: string; icon: IconName; href?: string; onSelect?: () => void; count?: number };

// What the bar holds. "nav": the areas (Today, Review, Pursuits, More), `current` naming the one shown by its label or
// href. "actions": an open item's actions, its one primary action filling the rest. "bulk": while a list is selecting,
// what the checked rows can do (off while none are), with the count and Done to leave. "confirm": the question before
// something is deleted, the safe choice focused. "reason": the Why? after a negative decision, above the keyboard,
// which calls `onDone` once (ReasonField). Actions are large Buttons (44px); give the primary one `className="flex-1"`.
export type BottomBarMode =
  | { kind: "nav"; current: string; items: BottomBarItem[] }
  | { kind: "actions"; actions: ReactNode }
  | { kind: "bulk"; count: number; actions: ReactNode; onDone: () => void }
  | { kind: "confirm"; message: string; detail?: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }
  | { kind: "reason"; decision: string; picks?: string[]; onDone: (result: ReasonResult) => void };

// The phone's bar, in thumb reach: 56px plus the safe area. It morphs in place between the areas and the actions of
// what's in front of you, and turns back when that's done. Placed by the screen (fixed to the bottom on a phone).
export function BottomBar({ mode }: { mode: BottomBarMode }) {
  return (
    <div data-tour="shell.bar" className="border-t bg-surface pb-[max(6px,env(safe-area-inset-bottom))]">
      <div
        key={mode.kind}
        className="transition-[opacity,translate] duration-160 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
      >
        {mode.kind === "nav" ? (
          <Nav current={mode.current} items={mode.items} />
        ) : mode.kind === "actions" ? (
          <div className="flex items-center gap-2 px-4 pt-2 pb-0.5">{mode.actions}</div>
        ) : mode.kind === "bulk" ? (
          <div role="region" aria-label="Selection">
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-body-md leading-body-md font-semibold text-text tabular-nums" aria-live="polite">
                {mode.count ? `${mode.count} selected` : "None selected"}
              </span>
              <Button variant="ghost" size="sm" onClick={mode.onDone}>
                Done
              </Button>
            </div>
            <div className="flex items-center gap-2 px-4 pt-2 pb-0.5">{mode.actions}</div>
          </div>
        ) : mode.kind === "reason" ? (
          <div className="px-4 pt-3 pb-0.5">
            <ReasonField bar decision={mode.decision} picks={mode.picks} onDone={mode.onDone} />
          </div>
        ) : (
          <Confirm {...mode} />
        )}
      </div>
    </div>
  );
}

function Nav({ current, items }: { current: string; items: BottomBarItem[] }) {
  return (
    <nav aria-label="Main">
      <ul className="flex px-2 pt-1.5">
        {items.map((item) => {
          const Icon = Icons[item.icon];
          const on = current === item.label || current === item.href;
          const look = `relative flex h-11 w-full flex-col items-center justify-center gap-[3px] rounded-sm text-label leading-label font-medium transition-colors duration-100 ${
            on ? "text-text" : "text-muted"
          }`;
          const body = (
            <>
              <Icon size={20} className="shrink-0" />
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span
                  aria-hidden
                  className="absolute top-0.5 left-[52%] flex h-4 items-center rounded-sm bg-text px-1 text-label leading-label font-semibold text-surface tabular-nums"
                >
                  {item.count}
                </span>
              )}
            </>
          );
          const name = item.count ? `${item.label}, ${item.count}` : undefined;
          return (
            <li key={item.label} className="flex-1">
              {item.href ? (
                <Link href={item.href} aria-label={name} aria-current={on ? "page" : undefined} onClick={item.onSelect} className={look}>
                  {body}
                </Link>
              ) : (
                <button type="button" aria-label={name} aria-current={on ? "page" : undefined} onClick={item.onSelect} className={look}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Confirm({ message, detail, confirmLabel, onConfirm, onCancel }: Extract<BottomBarMode, { kind: "confirm" }>) {
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  // The safe choice takes focus, so Enter keeps things as they are.
  useEffect(() => cancel.current?.focus(), []);
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-message`}
      aria-describedby={detail ? `${id}-detail` : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="flex flex-col gap-0.5 px-4 pt-3">
        <p id={`${id}-message`} className="text-body-md leading-body-md font-semibold text-text">
          {message}
        </p>
        {detail && (
          <p id={`${id}-detail`} className="text-body-sm leading-body-sm text-muted">
            {detail}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 pt-2 pb-0.5">
        <Button ref={cancel} size="lg" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" size="lg" className="flex-1" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
