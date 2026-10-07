"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { ScreenSize } from "@/components/Panes";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Skeleton } from "@/components/Skeleton";
import { type Period, PERIODS } from "./words";

// The parts every report view is built from.

export function PeriodSwitch({ period, onPeriod, wide = false }: { period: Period; onPeriod: (p: Period) => void; wide?: boolean }) {
  return <SegmentedControl label="Period" hideLabel wide={wide} value={period} onChange={onPeriod} options={PERIODS} />;
}

// A view: its title and the dates it covers in a 52px header, actions at the right; on a phone, the title under Back
// with the period switch below it. The body keeps to 880px.
export function ViewPane({
  title,
  range,
  size,
  period,
  onPeriod,
  actions,
  children,
}: {
  title: string;
  range?: string;
  size: ScreenSize;
  period: Period;
  onPeriod: (p: Period) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pad = size === "large" ? "px-8" : size === "medium" ? "px-6" : "px-4";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {size === "small" ? (
        <div className={`flex flex-col gap-3 pt-1 pb-3 ${pad}`}>
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-title-lg leading-title-lg font-semibold tracking-title-lg text-text">{title}</h2>
            {range && <span className="text-body-sm leading-body-sm text-muted tabular-nums">{range}</span>}
            <span className="flex-1" />
            {actions}
          </div>
          <PeriodSwitch period={period} onPeriod={onPeriod} wide />
        </div>
      ) : (
        <header className={`flex h-[52px] shrink-0 items-center gap-2.5 pr-3 ${size === "large" ? "pl-8" : "pl-6"}`}>
          <h2 className="text-title-md leading-title-md font-semibold text-text">{title}</h2>
          {range && <span className="text-body-sm leading-body-sm text-muted tabular-nums">{range}</span>}
          <span className="flex-1" />
          {actions}
        </header>
      )}
      <div className={`flex w-full max-w-[880px] min-w-0 flex-col gap-10 pt-2 pb-8 ${pad}`}>{children}</div>
    </div>
  );
}

// Big numbers in rows between rules: two across on a phone and in the medium pane, `columns` across on a large screen.
export function Numbers({ columns = 3, children }: { columns?: 2 | 3 | 4; children: ReactNode }) {
  const large = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[columns];
  return <div className={`grid grid-cols-2 ${large}`}>{children}</div>;
}

export function Cell({ children }: { children: ReactNode }) {
  return <div className="min-w-0 border-t py-4 pr-4 md:py-5 md:pr-6">{children}</div>;
}

// Charts side by side on a large screen, one under another below that.
export function Charts({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">{children}</div>;
}

// A view's place held while its report loads.
export function Loading() {
  return (
    <div aria-label="Loading" role="status" className="flex flex-col gap-10">
      <div className="grid grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 border-t py-5 pr-6">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function Nothing({ title, line }: { title: string; line: string }) {
  return (
    <div className="h-72">
      <EmptyState icon="reports" title={title}>
        {line}
      </EmptyState>
    </div>
  );
}
