import type { ReactNode } from "react";
import { Icons } from "./icons";

// An item's details beside (or under) its body: "Details", then each property as a muted label over its value. The
// column itself (240 wide with a rule on its left on large screens, or in the flow below) is the screen's to place;
// `columns={2}` lays the properties out two abreast, for the flow of a narrower pane.
export function Properties({ columns = 1, children, className = "" }: { columns?: 1 | 2; children: ReactNode; className?: string }) {
  return (
    <section aria-label="Details" className={`flex flex-col gap-3.5 ${className}`}>
      <h3 className="text-label leading-label font-medium text-text">Details</h3>
      <dl className={`grid gap-x-6 gap-y-3.5 ${columns === 2 ? "grid-cols-2" : ""}`}>{children}</dl>
    </section>
  );
}

// One property: its name, and its value in body-sm (a line of words, a PropertyLink, a field being edited in place).
// Several lines or a value with its action: lay them out inside.
export function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-label leading-label text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-col text-body-sm leading-body-sm text-text">{children}</dd>
    </div>
  );
}

// A value that opens elsewhere (a website, a job board): underlined in the border colour, the arrow after it. A value
// longer than its column is cut short, the arrow still showing.
export function PropertyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="tap inline-flex max-w-full min-w-0 items-center gap-1 self-start rounded-sm underline decoration-border decoration-1 underline-offset-3 transition-colors duration-100 hover:decoration-text"
    >
      <span className="min-w-0 truncate">{children}</span>
      <Icons.openElsewhere aria-hidden="true" size={12} className="shrink-0 text-muted" />
    </a>
  );
}
