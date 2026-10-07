import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

// The docs home's parts (the Docs home boards): three groups side by side on large screens (Using CareerBot, Running
// your own copy, Contributing), each a heading, a line, and the pages to start with; and the cards at the end
// (Troubleshooting, Reference, Words). Stacked on a phone.

export function HomeGroups({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">{children}</div>;
}

export function HomeGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-site-card-heading leading-site-card-heading tracking-site-card-heading font-semibold text-text">{title}</h2>
        <p className="text-site-body-sm leading-site-body-sm text-muted">{description}</p>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function HomeCards({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 pt-4 md:grid-cols-3 md:gap-4">{children}</div>;
}

export function HomeCard({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <Link href={href} className="group flex flex-col gap-2 rounded-sm bg-subtle p-5 transition-colors duration-100 hover:bg-hover">
      <span className="flex items-center justify-between gap-3">
        <span className="text-site-item leading-site-item font-semibold text-text">{title}</span>
        <Icon name="onward" aria-hidden="true" className="shrink-0 text-muted group-hover:text-text" />
      </span>
      <span className="text-body-md leading-body-md text-muted [&_p]:inline">{children}</span>
    </Link>
  );
}
