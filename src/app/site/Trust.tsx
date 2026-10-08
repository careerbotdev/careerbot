"use client";

import { RootedMockup } from "./mockups/Rooted";
import { Section } from "./Section";
import { TRUST } from "./words";

// It writes boldly, from what you really did (the Website v4 — Pages boards, How it works): the honesty line beside
// the rooted mock-up on a grey stage; on a phone, the words alone.
export function Trust() {
  return (
    <Section className="pb-26 md:pb-44" inner="flex flex-col gap-4.5 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
      <div className="flex max-w-160 flex-col gap-4.5 lg:w-125 lg:shrink-0 lg:gap-6">
        <h2 className="text-site-headline-sm leading-site-headline-sm tracking-site-headline-sm font-semibold lg:text-site-callout lg:leading-site-callout lg:tracking-site-callout">
          {TRUST.heading}
        </h2>
        <p className="text-site-body-lg-sm leading-site-body-lg-sm text-muted lg:text-site-body-xl lg:leading-site-body-xl">{TRUST.body}</p>
      </div>
      <div className="hidden w-full md:block md:max-w-160 lg:flex lg:aspect-[640/320] lg:items-center lg:rounded-site-band lg:bg-subtle lg:px-[5.625%]">
        <RootedMockup />
      </div>
    </Section>
  );
}
