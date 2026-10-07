"use client";

import { Button } from "@/components/Button";
import { Section } from "./Section";
import { goToWaitlist, Joined, Waitlist } from "./Waitlist";

// Home's call to action after the pains (the Website v4 — Pages boards' CTA band), for a reader who's convinced there:
// a dark band with a short heading and the waitlist, side by side on a large screen and stacked on a medium one. On a
// phone the band holds one full-width Get notified, which scrolls up to the hero's form and puts the cursor in it.
// Once joined, the band says so. The band stays dark in dark mode, a shade lighter than the page.
export function CtaBand({ heading, cta, source, joined, onJoined }: { heading: string; cta: string; source: string; joined: boolean; onJoined: () => void }) {
  return (
    <Section className="pb-14 md:pb-24 lg:pb-30">
      <div className="flex flex-col gap-6 rounded-site-stage bg-inverse px-6 pt-8 pb-6 md:rounded-site-band md:px-14 md:py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <h2 className="text-site-band-sm leading-site-band-sm tracking-site-band-sm font-semibold text-inverse-text md:max-w-140 md:text-site-band md:leading-site-band md:tracking-site-band">
          {heading}
        </h2>
        <div className="hidden md:flex lg:shrink-0">
          <Waitlist source={source} joined={joined} onJoined={onJoined} tone="band" />
        </div>
        <div className="md:hidden">
          {joined ? (
            <Joined tone="band" />
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="h-13! w-full rounded-site-field! text-site-control! leading-site-control! font-semibold!"
              detail="Takes you to the waitlist at the top of the page."
              note="Free"
              onClick={goToWaitlist}
            >
              {cta}
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
