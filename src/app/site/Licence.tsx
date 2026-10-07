"use client";

import { Icons } from "@/components/icons";
import { OpenMockup } from "./mockups/Open";
import { Section } from "./Section";
import { OPEN_SOURCE } from "./words";

// The licence (the Website v4 — Pages boards, Open source): the terminal mock-up on a grey stage beside what the
// AGPL-3.0 lets you do and the way to the source on GitHub; on medium screens and phones the stage comes first.
export function Licence() {
  const { licence } = OPEN_SOURCE;
  return (
    <Section className="pb-22 md:pb-36" inner="flex flex-col gap-4 md:gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
      <div className="flex aspect-[350/240] w-full items-center rounded-site-stage-sm bg-subtle px-[5.7%] md:max-w-160 lg:aspect-[640/560] lg:w-160 lg:shrink-0 lg:rounded-site-band lg:px-[6.25%]">
        <OpenMockup />
      </div>
      <div className="flex max-w-160 flex-col gap-4 lg:w-120 lg:shrink-0 lg:gap-5">
        <h2 className="text-site-section-sm leading-site-section-sm tracking-site-section-sm font-semibold lg:pb-2 lg:text-site-section lg:leading-site-section lg:tracking-site-section">
          {licence.heading}
        </h2>
        {licence.body.map((p) => (
          <p key={p} className="text-site-body-lg-sm leading-site-body-lg-sm text-muted lg:text-site-body-lg lg:leading-site-body-lg">
            {p}
          </p>
        ))}
        <a
          href={licence.source.href}
          className="flex h-11 items-center gap-1.5 self-start text-site-point leading-site-point font-semibold text-text md:text-site-nav md:leading-site-nav"
        >
          {licence.source.label}
          <Icons.onward aria-hidden="true" className="shrink-0" />
        </a>
      </div>
    </Section>
  );
}
