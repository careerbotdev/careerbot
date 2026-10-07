"use client";

import { Mark } from "./mockups/draw";
import { PortalMockup } from "./mockups/Portal";
import { Section } from "./Section";
import { PORTAL } from "./words";

// Your whole search in one place (the Website v4 — Pages boards, How it works): what the reader gets, the heading and
// a line, centred on a large screen, then the portal's window with everything in it; on a phone, the seven things it
// keeps as a list, each with a check, between hairlines.
export function Portal() {
  return (
    <Section className="pb-24 md:pb-40" inner="flex flex-col gap-8 lg:items-center lg:gap-14">
      <div className="flex flex-col gap-3.5 lg:w-250 lg:items-center lg:gap-5 lg:text-center">
        <h2 className="text-site-display-sm leading-site-display-sm tracking-site-display-sm font-semibold lg:text-site-display lg:leading-site-display lg:tracking-site-display">
          {PORTAL.heading}
        </h2>
        <p className="text-site-lead-sm leading-site-lead-sm text-muted lg:text-site-intro lg:leading-site-intro">{PORTAL.intro}</p>
      </div>
      <ul className="flex flex-col border-b border-border md:hidden">
        {PORTAL.items.map((item) => (
          <li key={item} className="flex items-start gap-3 border-t border-border py-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Mark x={0} y={0} size={20} state="done" />
            </span>
            <span className="min-w-0 flex-1 text-site-body-sm leading-site-body-sm text-text">{item}</span>
          </li>
        ))}
      </ul>
      <div className="hidden w-full md:block">
        <PortalMockup />
      </div>
    </Section>
  );
}
