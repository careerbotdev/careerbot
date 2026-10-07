"use client";

import { segment, segmentOn, segmentTrack } from "@/components/SegmentedControl";

// Pick any of a few short options (Remote, Hybrid, On-site): SegmentedControl's track, but each segment turns on and off
// by itself (aria-pressed) and several can be raised at once. Each segment is its own tab stop; Space or Enter toggles.
// The label is for screen readers unless shown.
export function ToggleGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  showLabel = false,
}: {
  label: string;
  value: readonly T[];
  onChange: (value: T[]) => void;
  options: readonly { value: T; label: string }[];
  showLabel?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      {showLabel && (
        <span aria-hidden="true" className="text-label leading-label font-medium text-text">
          {label}
        </span>
      )}
      <div className={segmentTrack}>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              // Chosen values keep the options' order.
              onClick={() => onChange(options.filter((x) => (x.value === o.value ? !on : value.includes(x.value))).map((x) => x.value))}
              className={`${segment} ${on ? segmentOn : ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
