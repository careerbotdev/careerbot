"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useId, type ReactNode } from "react";

// On or off, taking effect at once (no Save). 30×18 and square: off is a `control-border` track with a paper knob, on is
// the text colour with a surface knob. With its label it is a settings row: the label and an optional second line on
// the left, the switch at the right. Space toggles; clicking the label toggles too. hideLabel: only the switch.
export function Switch({
  label,
  checked,
  onChange,
  description,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  const control = (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={hideLabel ? label : undefined}
      aria-describedby={description && !hideLabel ? `${id}-description` : undefined}
      className="relative flex h-4.5 w-7.5 shrink-0 items-center rounded-sm bg-control-border p-0.5 transition-colors duration-100 before:absolute before:-inset-x-2 before:-inset-y-3.5 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-text md:before:-inset-x-0.5 md:before:-inset-y-[7px]"
    >
      <SwitchPrimitive.Thumb className="block size-3.5 rounded-xs bg-paper transition-transform duration-100 ease-out data-[state=checked]:translate-x-3 data-[state=checked]:bg-surface motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );
  if (hideLabel) return control;
  return (
    <div className={`flex items-start gap-4 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-body-sm leading-body-sm">
        <label htmlFor={id} className={`font-medium text-text ${disabled ? "cursor-not-allowed" : ""}`}>
          {label}
        </label>
        {description && (
          <span id={`${id}-description`} className="text-muted">
            {description}
          </span>
        )}
      </div>
      {control}
    </div>
  );
}
