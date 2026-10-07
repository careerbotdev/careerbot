import type { ReactNode } from "react";

// Work that takes a while, with how far along it is. Steel while running, green when done, red when it stopped; green
// too for steps of your own done so far (Getting started, "2 of 7"). The words say what and how much ("Ranking 38 new
// roles", "24 of 38"); the bar only confirms them.
const fills = {
  running: "bg-steel",
  done: "bg-good",
  stopped: "bg-red",
  steps: "bg-good",
};

export type ProgressStatus = keyof typeof fills;

// The bar on its own, 4px by default (pass `h-[3px]` and the like to fit a tighter spot). `label` names the work for
// screen readers.
export function ProgressBar({
  label,
  value,
  max = 1,
  status = "running",
  valueText,
  className = "",
}: {
  label: string;
  value: number;
  max?: number;
  status?: ProgressStatus;
  valueText?: string;
  className?: string;
}) {
  const now = status === "done" ? max : Math.min(max, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={valueText}
      className={`flex h-1 w-full shrink-0 overflow-clip rounded-xs bg-border ${className}`}
    >
      <div
        className={`h-full transition-[width] duration-160 ease-out motion-reduce:transition-none ${fills[status]}`}
        style={{ width: `${max > 0 ? Math.round((now / max) * 1000) / 10 : 0}%` }}
      />
    </div>
  );
}

// The bar under a body-sm line naming the work, with the amount in muted tabular figures at the right.
export function Progress({
  label,
  value,
  max = 1,
  status = "running",
  detail,
  className = "",
}: {
  label: string;
  value: number;
  max?: number;
  status?: ProgressStatus;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex justify-between gap-3 text-body-sm leading-body-sm">
        <span className="min-w-0 text-text">{label}</span>
        {detail && <span className="shrink-0 text-muted tabular-nums">{detail}</span>}
      </div>
      <ProgressBar label={label} value={value} max={max} status={status} valueText={typeof detail === "string" ? detail : undefined} />
    </div>
  );
}
