"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type { ReactNode } from "react";
import { Dash, Tick } from "@/components/choices";

// The 16px square shared by Checkbox and RadioGroup: `control-border` when off (3:1), muted under the pointer (on the
// box or its label, a `group/check`) and, in dark mode, on a hovered or selected row (a `group/row` with aria-selected
// or data-selected). The ::before widens the hit area to 32px, 44px on a phone, without moving anything.
export const controlBox =
  "relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-control-border bg-surface transition-colors duration-100 " +
  "before:absolute before:-inset-3.5 md:before:-inset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
  "data-[state=unchecked]:enabled:hover:border-muted data-[state=unchecked]:enabled:group-hover/check:border-muted " +
  "dark:data-[state=unchecked]:group-hover/row:border-muted dark:data-[state=unchecked]:group-aria-selected/row:border-muted dark:data-[state=unchecked]:group-data-[selected=true]/row:border-muted";

// A check box with its label (and an optional second line). On is the text colour with a surface tick; "some" (part of
// a group is ticked) shows a dash, and ticking it ticks everything. Space toggles; the label toggles too. hideLabel:
// only the box, labelled for screen readers (a list row's box).
export function Checkbox({
  label,
  checked,
  onChange,
  hideLabel,
  description,
  disabled,
}: {
  label: string;
  checked: boolean | "some";
  onChange: (checked: boolean) => void;
  hideLabel?: boolean;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const box = (
    <CheckboxPrimitive.Root
      checked={checked === "some" ? "indeterminate" : checked}
      onCheckedChange={(v) => onChange(v === true)}
      disabled={disabled}
      aria-label={hideLabel ? label : undefined}
      className={`${controlBox} text-surface data-[state=checked]:border-text data-[state=checked]:bg-text data-[state=indeterminate]:border-text data-[state=indeterminate]:bg-text`}
    >
      <CheckboxPrimitive.Indicator>{checked === "some" ? <Dash /> : <Tick />}</CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (hideLabel) return box;
  return (
    <label className={`group/check inline-flex items-start gap-2.5 text-body-sm leading-body-sm text-text ${disabled ? "cursor-not-allowed" : ""}`}>
      <span className="flex pt-0.5">{box}</span>
      <span className={`flex flex-col gap-0.5 ${disabled ? "opacity-50" : ""}`}>
        <span>{label}</span>
        {description && <span className="text-muted">{description}</span>}
      </span>
    </label>
  );
}
