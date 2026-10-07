"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Icons } from "@/components/icons";
import { Heading, Text } from "@/components/Text";

// An item's top on Projects: its mark (the project's initial, or GitHub's link), title and second line, then what can
// be done with it, lined up under the title from medium screens up.
export function Head({ name, mark, line, children }: { name: string; mark?: "github"; line: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-4 border-b px-4 pt-2 pb-5 md:px-6 md:pb-6 lg:px-8">
      <div className="flex items-start gap-3.5">
        {mark === "github" ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border bg-subtle text-muted">
            <Icons.link aria-hidden size={20} />
          </span>
        ) : (
          <Avatar name={name} company size={40} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Heading>{name}</Heading>
          <Text size="sm" muted>
            {line}
          </Text>
        </div>
      </div>
      {children}
    </div>
  );
}

// A titled part of an item's body: "Summary", "Stack", "Repositories 7".
export function Section({ title, count, trail, children, label }: { title: string; count?: number; trail?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-7 items-center gap-2">
        <Text size="label">{title}</Text>
        {count !== undefined && <span className="text-label leading-label text-muted tabular-nums">{count}</span>}
        {trail}
      </div>
      {children}
    </section>
  );
}

// The body beside its details: the details in a 260 column on large screens; elsewhere the screen puts them inline.
export function Body({ children, details }: { children: ReactNode; details?: ReactNode }) {
  return (
    <div className="flex flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:px-6 lg:px-8">{children}</div>
      {details && <aside className="w-[260px] shrink-0 border-l px-6 py-5">{details}</aside>}
    </div>
  );
}
