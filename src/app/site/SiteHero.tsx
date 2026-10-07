"use client";

import { Icons } from "@/components/icons";
import { Section } from "./Section";
import { Tag } from "./Tag";
import { WAITLIST_ID, Waitlist } from "./Waitlist";
import { DEMO_URL, HEADLINE_LEAD, HEADLINE_MARK, HERO } from "./words";

// The top of Home (the Website v4 — Pages boards' hero): the Open source tag, the headline with its last words marked
// in amber (on a large screen a sentence a line, the mark after the second), the line under it, and the waitlist (the
// page's main form, which the header's Get notified and the band's phone button send people to) and its note, left
// aligned. Under them (Website — Home with Open the demo), Open the demo as an outlined pill, like the header's Sign
// in, beside a line on what it is; stacked on a phone, the pill across the column. `demo`: the demo's way in (DEMO_URL,
// set once it's live); without it there's no Open the demo.
export function SiteHero({ joined, onJoined, demo = DEMO_URL }: { joined: boolean; onJoined: () => void; demo?: string }) {
  const [first, second] = HEADLINE_LEAD.split(/(?<=\.)\s+/);
  return (
    <Section className="pt-10 pb-10 md:pt-18 md:pb-16 lg:pb-18" inner="flex flex-col items-start">
      <Tag>{HERO.tag}</Tag>
      <h1 className="max-w-300 pt-5.5 text-site-hero-sm leading-site-hero-sm tracking-site-hero-sm font-semibold md:pt-7 lg:text-site-hero lg:leading-site-hero lg:tracking-site-hero">
        {first} <br className="hidden lg:inline" />
        {second} <br className="md:hidden" />
        <span className="site-mark min-[360px]:whitespace-nowrap">{HEADLINE_MARK}</span>
      </h1>
      <p className="max-w-175 pt-5 text-site-lead-sm leading-site-lead-sm text-muted md:pt-6 lg:text-site-lead lg:leading-site-lead">{HERO.subline}</p>
      <div id={WAITLIST_ID} className="flex w-full flex-col gap-3 pt-7 md:w-auto md:gap-4 md:pt-8">
        <Waitlist source="hero" joined={joined} onJoined={onJoined} />
        <p className="text-body-md leading-body-md text-muted">{HERO.note}</p>
      </div>
      {demo && (
        <div className="flex w-full flex-col items-start gap-2.5 pt-6 md:w-auto md:flex-row md:items-center md:gap-3.5 md:pt-7">
          <a
            href={demo}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-site-pill border border-border bg-surface px-4.5 text-site-nav leading-site-nav font-medium whitespace-nowrap text-text transition-colors duration-100 hover:bg-subtle md:h-11 md:w-auto"
          >
            {HERO.demo.label}
            <Icons.onward aria-hidden="true" className="shrink-0" />
          </a>
          <p className="text-body-md leading-body-md text-muted md:text-site-note md:leading-site-note">{HERO.demo.note}</p>
        </div>
      )}
    </Section>
  );
}
