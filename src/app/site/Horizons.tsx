"use client";

import { Answers } from "./Answers";
import { FanMockup } from "./mockups/Fan";
import { Section } from "./Section";
import { HORIZONS, PAINS } from "./words";

// See where else your experience fits (the Website v4 — Pages boards, How it works): for the reader who's lost, the
// heading beside what CareerBot shows them and the pain it answers, then, from medium screens up, the directions
// fanning out from where they are now.
export function Horizons() {
  return (
    <Section className="pb-26 md:pb-44" inner="flex flex-col gap-5 lg:gap-14">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <h2 className="max-w-150 text-site-headline-sm leading-site-headline-sm tracking-site-headline-sm font-semibold lg:w-150 lg:shrink-0 lg:text-site-headline lg:leading-site-headline lg:tracking-site-headline">
          {HORIZONS.heading}
        </h2>
        <div className="flex max-w-160 flex-col gap-5 lg:w-120 lg:shrink-0 lg:gap-6 lg:pt-2">
          <p className="text-site-body-lg-sm leading-site-body-lg-sm text-muted lg:text-site-body-xl lg:leading-site-body-xl">{HORIZONS.body}</p>
          <div className="lg:pt-2">
            <Answers pain={PAINS.items[2].title} />
          </div>
        </div>
      </div>
      <div className="hidden pt-3 md:block lg:pt-0">
        <FanMockup />
      </div>
    </Section>
  );
}
