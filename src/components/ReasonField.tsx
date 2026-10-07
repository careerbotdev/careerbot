"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Button } from "./Button";
import { Input } from "./Field";
import { KeyHint } from "./Kbd";
import { useSmall } from "./useSmall";

export type ReasonResult = { reason?: string };

type ReasonFieldProps = {
  /** Up to five quick picks, numbered 1–5 ("Pay", "Location", "Seniority", "Not the work", "Company" for roles). */
  picks?: string[];
  /** The decision the reason is for. Given, a "Not for me · why?" line heads the field. */
  decision?: string;
  /**
   * Called once, when the field closes: Enter (or Save) with what was picked or typed, Esc (or Skip) with no reason.
   * Save the decision and its reason together from here; nothing is sent before it.
   */
  onDone: (result: ReasonResult) => void;
  /** The reason already saved, when the field reopens to change it. */
  defaultValue?: string;
  /** The quick pick to show as chosen with it, when it isn't the pick's own words. */
  defaultPick?: string;
  /**
   * The phone's layout (bigger picks, Skip and Save reason), as in the bottom bar above the keyboard, where BottomBar's
   * "reason" mode puts it. Follows the screen by default: on below 768.
   */
  bar?: boolean;
  /** Takes focus as it opens (the default). Off only for a still specimen. */
  autoFocus?: boolean;
  className?: string;
};

// Where focus goes when the field closes: what had it before the field opened; when that has gone, the row the field
// sat in (found again by its place in the list, since the row may have re-rendered as a rejected one); else the nearest
// card that takes focus (tabIndex -1). Only when focus would otherwise be lost: if the screen moved it, it stays there.
function useReturnFocus() {
  const root = useRef<HTMLDivElement>(null);
  const before = useRef<HTMLElement | null>(null);
  const remember = useCallback(() => {
    const el = document.activeElement;
    before.current = el instanceof HTMLElement && el !== document.body ? el : null;
  }, []);
  const giveBack = useCallback(() => {
    const here = root.current;
    const list = here?.closest("[role=list]");
    const row = here?.closest("[data-row-scope]")?.querySelector("[data-row]");
    const place = list && row ? [...list.querySelectorAll("[data-row]")].indexOf(row) : -1;
    const card = here?.parentElement?.closest<HTMLElement>("[tabindex]");
    requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now && now !== document.body) return;
      const target =
        (before.current?.isConnected ? before.current : null) ??
        (list?.isConnected && place >= 0 ? list.querySelectorAll<HTMLElement>("[data-row]")[place] : null) ??
        (card?.isConnected ? card : null);
      target?.focus();
    });
  }, []);
  return { root, remember, giveBack };
}

// The Why? after a negative decision (Reject, Not for me, Set aside, Keep separate, Discard). It opens right where the
// decision was made and takes focus. Picking a quick pick (a click, or 1–5 while the field is empty) fills the field with
// its words, which can then be changed. Enter saves, Esc skips; either way `onDone` runs once and focus goes back.
export function ReasonField({ picks = [], decision, onDone, defaultValue = "", defaultPick, bar: barProp, autoFocus = true, className = "" }: ReasonFieldProps) {
  const small = useSmall();
  const bar = barProp ?? small;
  const shown = picks.slice(0, bar ? 4 : 5);
  const [value, setValue] = useState(defaultValue);
  const [chosen, setChosen] = useState<string | null>(defaultPick ?? (shown.includes(defaultValue) ? defaultValue : null));
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const { root, remember, giveBack } = useReturnFocus();

  useLayoutEffect(() => {
    if (!autoFocus) return;
    remember();
    input.current?.focus();
  }, [autoFocus, remember]);

  const finish = (reason?: string) => {
    if (finished.current) return;
    finished.current = true;
    giveBack();
    onDone(reason ? { reason } : {});
  };
  const save = () => finish(value.trim() || undefined);
  const skip = () => finish();

  const pick = (label: string) => {
    setValue(label);
    setChosen(label);
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      skip();
    } else if (e.key === "Enter" && e.target === input.current) {
      e.preventDefault();
      e.stopPropagation();
      save();
    } else if (value === "" && /^[1-5]$/.test(e.key) && shown[Number(e.key) - 1]) {
      e.preventDefault();
      pick(shown[Number(e.key) - 1]);
    }
  };

  const field = {
    ref: input,
    value,
    placeholder: "Why? (optional)",
    "aria-label": decision ? `${decision}: why?` : "Why?",
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
      if (e.target.value === "") setChosen(null);
    },
  };

  const chips = shown.length > 0 && (
    <div role="group" aria-label="Quick reasons" className={`flex flex-wrap ${bar || small ? "gap-2" : "gap-1.5"}`}>
      {shown.map((label, i) => (
        <Chip key={label} number={bar || small ? undefined : i + 1} chosen={chosen === label} large={bar || small} onPick={() => pick(label)}>
          {label}
        </Chip>
      ))}
    </div>
  );

  if (bar) {
    return (
      <div ref={root} data-reason-field="" onKeyDown={onKeyDown} className={`flex w-full flex-col gap-2 ${className}`}>
        <div className="flex flex-col gap-2.5">
          <p className="text-body-md leading-body-md font-semibold text-text">{decision ? `${decision} · why?` : "Why?"}</p>
          <div className="flex flex-col gap-2">
            {chips}
            <Input {...field} enterKeyHint="go" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="lg" detail="Saves the decision without a reason." note="Free" onClick={skip}>
            Skip
          </Button>
          <Button size="lg" variant="primary" className="flex-1" detail="Saves the decision with this reason." note="Free" onClick={save}>
            Save reason
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={root} data-reason-field="" onKeyDown={onKeyDown} className={`flex w-full flex-col gap-2.5 ${className}`}>
      {decision && (
        <p className="flex items-center gap-2 text-body-sm leading-body-sm">
          <span className="font-semibold text-text">{decision}</span>
          <span className="text-muted">· why?</span>
        </p>
      )}
      <div className="flex flex-col gap-2">
        {chips}
        <Input
          {...field}
          className="pr-1.5"
          suffix={
            <span className="flex items-center gap-1.5 pl-0.5">
              <KeyHint keys="↵" onClick={save}>
                Save
              </KeyHint>
              <KeyHint keys="Esc" onClick={skip}>
                Skip
              </KeyHint>
            </span>
          }
        />
      </div>
    </div>
  );
}

// A quick pick: its number (the key that picks it) and its words; steel when chosen. Larger and unnumbered on a phone.
function Chip({ number, chosen, large, onPick, children }: { number?: number; chosen: boolean; large: boolean; onPick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-keyshortcuts={number ? String(number) : undefined}
      onClick={onPick}
      className={`relative flex shrink-0 items-center gap-1.5 rounded-sm border font-medium text-text transition-colors duration-100 ${
        large ? "h-9 pr-3 pl-2.5 text-body-sm leading-body-sm after:absolute after:inset-x-0 after:-inset-y-1" : "h-6 pr-2 pl-1.5 text-label leading-label"
      } ${chosen ? "border-steel bg-steel-subtle" : "border-border bg-surface hover:bg-subtle"}`}
    >
      {number !== undefined && (
        <span aria-hidden="true" className="font-mono text-mono leading-mono font-normal text-muted">
          {number}
        </span>
      )}
      {children}
    </button>
  );
}
