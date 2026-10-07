"use client";

import type { ComponentType } from "react";
import { PainGlyph } from "./Answers";
import { PainResumeMockup, PainStuckMockup, PainVoidMockup } from "./mockups/Pains";
import { Section } from "./Section";
import { PAINS } from "./words";

// Where job searches go wrong (the Website v4 — Pages boards): the three pains in the reader's words. From medium up,
// three across, each its drawing with its title and what it's like under it; on a phone, a short list: each pain's
// small drawing on a grey square beside its title and the first sentence of what it's like.

const DRAWINGS: ComponentType[] = [PainVoidMockup, PainResumeMockup, PainStuckMockup];

export function Pains() {
  return (
    <Section className="pb-14 md:pb-24" inner="flex flex-col gap-6 md:gap-8 lg:gap-14">
      <h2 className="text-site-headline-sm leading-site-headline-sm tracking-site-headline-sm font-semibold lg:text-site-headline lg:leading-site-headline lg:tracking-site-headline">
        {PAINS.heading}
      </h2>
      <ul className="flex flex-col gap-4 md:hidden">
        {PAINS.items.map((p) => (
          <li key={p.title} className="flex items-start gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-site-tile bg-subtle">
              <PainGlyph pain={p.title} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-site-pain-sm leading-site-pain-sm tracking-site-pain-sm font-semibold">{p.title}</span>
              <span className="text-site-note leading-site-note text-muted">{p.short}</span>
            </span>
          </li>
        ))}
      </ul>
      <ul className="hidden gap-6 md:grid md:grid-cols-3 lg:gap-9">
        {PAINS.items.map((p, i) => {
          const Drawing = DRAWINGS[i];
          return (
            <li key={p.title} className="flex flex-col">
              <Drawing />
              <div className="flex flex-col gap-2.5 pt-5.5 lg:gap-3 lg:pt-7 lg:pr-3">
                <h3 className="text-site-subheading-sm leading-site-subheading-sm tracking-site-subheading-sm font-semibold lg:text-site-subheading lg:leading-site-subheading lg:tracking-site-subheading">
                  {p.title}
                </h3>
                <p className="text-site-body leading-site-body text-muted lg:text-site-answer lg:leading-site-answer">{p.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
