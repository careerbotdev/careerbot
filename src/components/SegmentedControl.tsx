"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";

// The track and its segments, shared with ToggleGroup: a `subtle` track 2px in, 32px tall (44px on a phone); segments
// are muted until chosen, when they rise onto the surface with a 1px border. Focus rings the whole track (important,
// because Radix puts `outline: none` inline on the group).
export const segmentTrack =
  "inline-flex h-11 items-center gap-0.5 self-start rounded-sm bg-subtle p-0.5 has-focus-visible:outline-solid! has-focus-visible:outline-2! has-focus-visible:outline-offset-1! has-focus-visible:outline-steel! md:h-8";
// A segment's ::before reaches the track's edges, so the whole track height is hit: 32px, 44px on a phone, where a
// segment is at least 44 wide too.
export const segment =
  "relative flex h-10 min-w-11 items-center justify-center rounded-xs px-2.5 text-label leading-label font-medium whitespace-nowrap text-muted transition-colors duration-100 outline-none before:absolute before:inset-x-0 before:-inset-y-0.5 enabled:hover:bg-border md:h-6.5 md:min-w-0 md:before:-inset-y-[3px]";
export const segmentOn = "bg-surface text-text shadow-[0_0_0_1px_var(--color-border)] enabled:hover:bg-surface";

// Pick one of two to four short options that apply at once (a setting, or which view a list shows). A radio group
// underneath: one tab stop, arrow keys move and choose. null: none chosen (the value is set some other way, such as a
// number typed next to it). hideLabel: the label is only read out, for a control whose options say what it is. wide:
// the track fills its row and the segments share it (a phone's period switch).
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
  disabled = false,
  wide = false,
}: {
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  hideLabel?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  const control = (
    <RadioGroup.Root
      aria-label={label}
      value={value ?? ""}
      onValueChange={(v) => onChange(v as T)}
      orientation="horizontal"
      disabled={disabled}
      className={`${segmentTrack} data-disabled:opacity-50 ${wide ? "w-full" : ""}`}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={`${segment} ${wide ? "flex-1 justify-center" : ""} data-[state=checked]:bg-surface data-[state=checked]:text-text data-[state=checked]:shadow-[0_0_0_1px_var(--color-border)] data-[state=checked]:hover:bg-surface`}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
  if (hideLabel) return control;
  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden="true" className="text-label leading-label font-medium text-text">
        {label}
      </span>
      {control}
    </div>
  );
}
