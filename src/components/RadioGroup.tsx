"use client";

import * as RadioPrimitive from "@radix-ui/react-radio-group";
import { useId, type ReactNode } from "react";
import { controlBox } from "@/components/Checkbox";

export type RadioOption<T extends string> = { value: T; label: string; description?: string; meta?: ReactNode; disabled?: boolean };

// Pick one of a few options that each need words (a second line, a cost). A square radio with a square mark, like the
// check box. One tab stop; arrow keys move and choose. For two to four short options, use SegmentedControl instead.
// `divided`: a list of choices between rules, each a 14px name over its line, with `meta` (a price) at the right in a
// fixed 128px lane (the model choice).
export function RadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
  disabled = false,
  divided = false,
}: {
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options: readonly RadioOption<T>[];
  hideLabel?: boolean;
  disabled?: boolean;
  divided?: boolean;
}) {
  const id = useId();
  return (
    <RadioPrimitive.Root
      aria-label={hideLabel ? label : undefined}
      aria-labelledby={hideLabel ? undefined : `${id}-label`}
      value={value ?? ""}
      onValueChange={(v) => onChange(v as T)}
      disabled={disabled}
      className={divided ? "flex flex-col border-b" : "flex flex-col gap-3"}
    >
      {!hideLabel && (
        <span id={`${id}-label`} className={`text-label leading-label font-medium text-text ${divided ? "pb-3" : ""}`}>
          {label}
        </span>
      )}
      {options.map((o) => (
        <label
          key={o.value}
          className={`group/check flex items-start gap-2.5 text-body-sm leading-body-sm text-text ${divided ? "border-t py-3" : ""} ${disabled || o.disabled ? "cursor-not-allowed" : ""}`}
        >
          <span className="flex pt-0.5">
            <RadioPrimitive.Item value={o.value} disabled={o.disabled} className={`${controlBox} data-[state=checked]:border-text`}>
              <RadioPrimitive.Indicator className="size-2 rounded-xs bg-text" />
            </RadioPrimitive.Item>
          </span>
          <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${disabled || o.disabled ? "opacity-50" : ""}`}>
            <span className={divided ? "text-row-title leading-row-title font-medium" : ""}>{o.label}</span>
            {o.description && <span className="text-muted">{o.description}</span>}
          </span>
          {o.meta !== undefined && <span className="flex w-32 shrink-0 justify-end text-right text-muted tabular-nums">{o.meta}</span>}
        </label>
      ))}
    </RadioPrimitive.Root>
  );
}
