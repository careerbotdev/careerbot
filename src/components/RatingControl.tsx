"use client";

import { Icons } from "./icons";
import { Kbd } from "./Kbd";
import { segment, segmentOn, segmentTrack } from "./SegmentedControl";
import { Tooltip } from "./Tooltip";

export type RatingOption<T extends string> = {
  value: T;
  label: string;
  // The key that rates with it; shown in the segment and its tooltip, bound by the screen.
  keys?: string;
  // Its explainer: what it does, and that it can be taken back.
  detail?: string;
  // A good outcome (Target): chosen, it shows a tick in the good text colour.
  good?: boolean;
};

// Their own rating of something, on SegmentedControl's track: one option or none. Choosing the chosen one again takes
// the rating off. Each segment is a toggle button with its key hint and its explainer.
export function RatingControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | null;
  onChange: (value: T | null) => void;
  options: readonly RatingOption<T>[];
}) {
  return (
    <div role="group" aria-label={label} className={segmentTrack}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Tooltip key={o.value} content={o.label} keys={o.keys} detail={o.detail} note={on ? "Choose it again to take the rating off." : undefined}>
            <button
              type="button"
              aria-pressed={on}
              aria-keyshortcuts={o.keys}
              onClick={() => onChange(on ? null : o.value)}
              className={`${segment} gap-1.5 ${on ? segmentOn : ""} ${on && o.good ? "text-good-text!" : ""}`}
            >
              {on && o.good && <Icons.approve aria-hidden="true" size={14} className="shrink-0" />}
              {o.label}
              {o.keys && (
                <span aria-hidden="true" className="hidden md:inline-flex">
                  <Kbd>{o.keys}</Kbd>
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
