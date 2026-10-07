"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChosenSlot, Chevron, fieldDisabled, fieldLook, fieldOpen, listInner, listSeparator, Mark, optionRow, raisedSurface, sheetRow, type MarkTone } from "@/components/choices";
import { Sheet } from "@/components/Sheet";
import { useThemeRoot } from "@/components/themeRoot";
import { Tooltip } from "@/components/Tooltip";
import { useSmall } from "@/components/useSmall";

// count: how many there are of it, at the right in tabular figures. mark: a status square before the label, shown in
// the field too when it's the choice.
export type SelectOption<T extends string> = { value: T; label: string; count?: number; mark?: MarkTone; disabled?: boolean };

const triggers = {
  field: `inline-flex h-11 min-w-48 md:h-8 ${fieldLook}`,
  // Sits in running text (a resume's role title): no box until hovered, shows `display` instead of the option label.
  inline: "inline-flex items-center gap-1 rounded-sm text-left text-body-md leading-body-md text-text transition-colors duration-100 hover:bg-subtle",
};

// Pick one option from a list. On medium screens and up the list opens on a raised surface under the field (Radix:
// arrows, Home/End, typing to jump, Enter, Escape); on a phone it opens in a Sheet. "separator" draws a rule between
// groups of options. disabled with reason: the field says why in a tooltip, and stays focusable so the keyboard can
// reach it.
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = "Choose…",
  variant = "field",
  display,
  disabled = false,
  reason,
  className = "",
}: {
  label: string;
  value: T | undefined;
  onChange: (value: T) => void;
  options: readonly (SelectOption<T> | "separator")[];
  placeholder?: string;
  variant?: keyof typeof triggers;
  display?: ReactNode;
  disabled?: boolean;
  reason?: string;
  className?: string;
}) {
  const small = useSmall();
  const [open, setOpen] = useState(false);
  const [themeRef, container] = useThemeRoot();
  const chosen = options.find((o): o is SelectOption<T> => o !== "separator" && o.value === value);
  const shown = (
    <>
      {chosen?.mark && variant === "field" && (
        <span className="mr-2 flex">
          <Mark tone={chosen.mark} />
        </span>
      )}
      <span className={`min-w-0 truncate ${chosen || display ? "" : "text-muted"}`}>{display ?? chosen?.label ?? placeholder}</span>
    </>
  );
  const look = `${triggers[variant]} ${className}`;

  // Disabled: a look-alike that can't open, still focusable so its tooltip can say why.
  if (disabled) {
    const field = (
      <button type="button" aria-label={label} aria-disabled="true" className={`${look} ${variant === "field" ? fieldDisabled : "cursor-not-allowed text-muted opacity-70"}`}>
        {shown}
        {variant === "field" && <span className="flex-1" />}
        <Chevron open={false} />
      </button>
    );
    return reason ? <Tooltip content={reason}>{field}</Tooltip> : field;
  }

  if (small) {
    return (
      <>
        <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)} className={`${look} ${open && variant === "field" ? fieldOpen : ""}`}>
          {shown}
          {variant === "field" && <span className="flex-1" />}
          <Chevron open={open} />
        </button>
        <Sheet open={open} onOpenChange={setOpen} title={label}>
          <OptionList
            label={label}
            value={value}
            options={options}
            onPick={(v) => {
              onChange(v);
              setOpen(false);
            }}
          />
        </Sheet>
      </>
    );
  }

  return (
    <RadixSelect.Root value={value ?? ""} onValueChange={(v) => onChange(v as T)} open={open} onOpenChange={setOpen}>
      <RadixSelect.Trigger ref={themeRef} aria-label={label} className={`${look} ${open && variant === "field" ? fieldOpen : ""}`}>
        {shown}
        {variant === "field" && <span className="flex-1" />}
        <Chevron open={open} />
      </RadixSelect.Trigger>
      <RadixSelect.Portal container={container}>
        <RadixSelect.Content position="popper" sideOffset={4} align="start" className={`${raisedSurface} min-w-(--radix-select-trigger-width)`}>
          <RadixSelect.Viewport className={listInner}>
            {options.map((o, i) =>
              o === "separator" ? (
                <RadixSelect.Separator key={`separator-${i}`} className={listSeparator} />
              ) : (
                <RadixSelect.Item key={o.value} value={o.value} disabled={o.disabled} className={`${optionRow} data-highlighted:bg-subtle data-disabled:opacity-50 dark:data-highlighted:bg-hover`}>
                  <span className="flex w-4 shrink-0 justify-center">
                    <RadixSelect.ItemIndicator>
                      <ChosenSlot on />
                    </RadixSelect.ItemIndicator>
                  </span>
                  {o.mark && <Mark tone={o.mark} />}
                  <span className="min-w-0 flex-1 truncate">
                    <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  </span>
                  {o.count !== undefined && <span className="shrink-0 text-muted tabular-nums">{o.count}</span>}
                </RadixSelect.Item>
              ),
            )}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

// The options as a listbox inside a phone's sheet: 44px rows, the choice ticked and focused first, arrows and Home/End
// move, Enter or a tap picks.
function OptionList<T extends string>({ label, value, options, onPick }: { label: string; value: T | undefined; options: readonly (SelectOption<T> | "separator")[]; onPick: (value: T) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const first = options.find((o): o is SelectOption<T> => o !== "separator" && !o.disabled && (value === undefined || o.value === value))?.value;
  const move = (e: KeyboardEvent) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]:not([aria-disabled=true])") ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
  };
  return (
    <div ref={list} role="listbox" aria-label={label} onKeyDown={move} className="flex flex-col gap-px">
      {options.map((o, i) =>
        o === "separator" ? (
          <div key={`separator-${i}`} role="separator" className="my-1 h-px shrink-0 bg-border" />
        ) : (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === value}
            aria-disabled={o.disabled || undefined}
            tabIndex={o.value === first ? 0 : -1}
            autoFocus={o.value === first}
            onClick={() => !o.disabled && onPick(o.value)}
            className={`${sheetRow} focus-visible:bg-subtle active:bg-subtle aria-disabled:opacity-50 dark:focus-visible:bg-hover dark:active:bg-hover`}
          >
            <ChosenSlot on={o.value === value} />
            {o.mark && <Mark tone={o.mark} />}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count !== undefined && <span className="shrink-0 text-muted tabular-nums">{o.count}</span>}
          </button>
        ),
      )}
    </div>
  );
}
