"use client";

import { DoorMockup } from "./mockups/Door";
import { Section } from "./Section";
import { WAITLIST_ID, Waitlist } from "./Waitlist";
import { CLOSING, HERO } from "./words";

// A page's close (the Website v4 — Pages boards): the envelopes and the reply from the hero once more, the closing
// line and the waitlist with its note, centred. `source`: where its form counts joins from. `own`: it's the page's own
// form (every page but Home, whose own is the hero's), which the header's Get notified takes you to. `doorOnPhone`:
// the envelopes show on a phone too (Open source and Questions; Home and How it works leave them out there).
export function Closing({
  joined,
  onJoined,
  source,
  heading = CLOSING.heading,
  cta = CLOSING.cta,
  own = false,
  doorOnPhone = true,
}: {
  joined: boolean;
  onJoined: () => void;
  source: string;
  heading?: string;
  cta?: string;
  own?: boolean;
  doorOnPhone?: boolean;
}) {
  return (
    <Section className="border-t border-border pt-14 pb-16 md:pt-28 md:pb-32" inner="flex flex-col items-center text-center">
      <div className={`w-full max-w-75.5 pb-7 md:block md:max-w-105 md:pb-10 ${doorOnPhone ? "" : "hidden"}`}>
        <DoorMockup />
      </div>
      <h2 className="pb-7 text-site-hero-sm leading-site-hero-sm tracking-site-hero-sm font-semibold md:pb-11 lg:text-site-closing lg:leading-site-closing lg:tracking-site-closing">
        {heading}
      </h2>
      <div id={own ? WAITLIST_ID : undefined} className="flex w-full flex-col items-center gap-2.5 md:w-auto md:gap-4">
        <Waitlist source={source} joined={joined} onJoined={onJoined} cta={cta} />
        <p className="text-body-md leading-body-md text-muted">{HERO.note}</p>
      </div>
    </Section>
  );
}
