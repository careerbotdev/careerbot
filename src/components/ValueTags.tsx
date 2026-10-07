"use client";

import { useState } from "react";

// Values in a row of quiet tags: a direction's titles, a rule's industries, a list of employers. Each is 22px, label
// type in the text colour on `subtle` inside a border. With `max`, the rest fold into a "+N" tag that shows them.
export function ValueTags({ items, max, label, className = "" }: { items: readonly string[]; max?: number; label?: string; className?: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all || max === undefined || items.length <= max ? items : items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <ul aria-label={label} className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((i) => (
        <li key={i} className="flex h-5.5 max-w-full items-center rounded-sm border bg-subtle px-[7px] text-label leading-label font-medium text-text">
          <span className="truncate">{i}</span>
        </li>
      ))}
      {rest > 0 && (
        <li className="flex">
          <button
            type="button"
            onClick={() => setAll(true)}
            aria-label={`Show ${rest} more`}
            className="tap flex h-5.5 items-center rounded-sm border bg-subtle px-[7px] text-label leading-label font-medium text-text tabular-nums transition-colors duration-100 hover:bg-border"
          >
            +{rest}
          </button>
        </li>
      )}
    </ul>
  );
}
