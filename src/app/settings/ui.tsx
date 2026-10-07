"use client";

import type { ReactNode } from "react";
import { BackLink } from "@/components/BackLink";
import { type ScreenSize } from "@/components/Panes";
import { Heading } from "@/components/Text";
import { toast } from "@/components/Toast";

// The parts every Settings pane is built from.

// A pane: its title (52px on medium and up; under the phone's Back as a larger title), then its settings kept to a 640px
// measure. `back`: a pane inside a section (Compare models in AI) leads with the way back to it on medium and up (the
// phone's Back does it there). `wide`: content that needs the width (models side by side) sets its own measure.
export function SettingsPane({ title, size, back, wide = false, children }: { title: string; size: ScreenSize; back?: { href: string; label: string }; wide?: boolean; children: ReactNode }) {
  const pad = size === "large" ? "px-8" : size === "medium" ? "px-6" : "px-4";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {size === "small" ? (
        <div className={`${pad} pt-1 pb-3`}>
          <Heading>{title}</Heading>
        </div>
      ) : (
        <header className={`flex h-[52px] shrink-0 items-center gap-3 ${pad}`}>
          {back && (
            <span className="flex">
              <BackLink href={back.href} label={back.label} />
            </span>
          )}
          <Heading size="md">{title}</Heading>
        </header>
      )}
      <div className={`@container flex w-full flex-col gap-8 pt-2 pb-8 ${wide ? "" : "max-w-176"} ${pad}`}>{children}</div>
    </div>
  );
}

// A group's name and what it's for.
export function GroupHead({ label, line, count }: { label: string; line?: ReactNode; count?: number }) {
  return (
    <div className="flex flex-col gap-1 pb-3">
      <h3 className="flex gap-2 text-label leading-label font-medium text-text">
        {label}
        {count !== undefined && <span className="font-normal text-muted tabular-nums">{count}</span>}
      </h3>
      {line && <p className="text-body-sm leading-body-sm text-muted">{line}</p>}
    </div>
  );
}

// Rows between rules: a setting's name and line at the left, its control at the right (under them on a phone), and
// anything more below.
export function Rows({ children }: { children: ReactNode }) {
  return <div className="flex flex-col border-b">{children}</div>;
}

export function SettingRow({ title, line, control, children }: { title: ReactNode; line?: ReactNode; control?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-t py-4">
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="text-body-md leading-body-md font-medium text-text">{title}</div>
          {line && <div className="text-body-sm leading-body-sm text-muted">{line}</div>}
        </div>
        {control && <div className="flex shrink-0 flex-wrap items-center gap-2">{control}</div>}
      </div>
      {children}
    </div>
  );
}

// A change saved as it's made, with the way back: "Model set to …", Undo (U).
export function saved(message: string, undo: () => void) {
  toast({ message, action: { label: "Undo", key: "U", run: undo } });
}

// Month and day ("Oct 14").
export const monthDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
