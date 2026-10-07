"use client";

import type { ReactNode } from "react";
import { useScreenSize } from "@/components/Panes";
import { AimMockup, ScatterMockup } from "./mockups/Why";
import { type Step, useMockupMotion } from "./mockups/motion";
import { Section } from "./Section";
import { WHY } from "./words";

// Why isn't your job search working? (the Website v4 — Pages boards, How it works): the heading, then the usual search
// beside what works, each a drawing (from medium up), its three words and a line on it (side by side from medium
// screens, stacked on a phone), and under a hairline the line that ties them to CareerBot. The words below each drawing
// fade up after it has played (Calm v3 — motion, Why), on the mock-ups' terms: shown before the page's script runs and
// held still with reduced motion. On a phone, with no drawing to wait for, they're simply there.

// After the drawing: its words, then the line on them.
const steps: Step[] = [
  { m: "words", to: { opacity: [0, 1], y: [12, 0] }, at: 2.2, duration: 0.5 },
  { m: "body", to: { opacity: [0, 1], y: [8, 0] }, at: 2.45, duration: 0.5 },
];

// One half: its drawing, its three words and the line under them. `tone`: the words' and the line's colours.
function Half({ drawing, words, body, tone }: { drawing: ReactNode; words: string[]; body: string; tone: { words: string; body: string } }) {
  const scope = useMockupMotion(steps, { still: useScreenSize() === "small" });
  return (
    <div ref={scope} className="flex min-w-0 flex-1 flex-col">
      <div className="hidden md:block">{drawing}</div>
      <p
        data-m="words"
        className={`pt-7 text-site-display-sm leading-site-display-sm tracking-site-display-sm font-semibold md:pt-10 md:text-site-contrast md:leading-site-contrast md:tracking-site-contrast ${tone.words}`}
      >
        {words.map((w) => (
          <span key={w} className="block">
            {w}
          </span>
        ))}
      </p>
      <p data-m="body" className={`pt-4 text-site-body-lg-sm leading-site-body-lg-sm md:max-w-130 md:pt-6 md:text-site-body-xl md:leading-site-body-xl ${tone.body}`}>
        {body}
      </p>
    </div>
  );
}

export function Why() {
  return (
    <Section className="pb-24 md:pb-40" inner="flex flex-col gap-8 md:gap-14">
      <h2 className="text-site-headline-sm leading-site-headline-sm tracking-site-headline-sm font-semibold md:text-site-headline md:leading-site-headline md:tracking-site-headline">
        {WHY.heading}
      </h2>
      <div className="flex flex-col gap-12 md:flex-row">
        <Half drawing={<ScatterMockup />} words={WHY.words[0]} body={WHY.body[0]} tone={{ words: "text-muted/60", body: "text-muted" }} />
        <Half drawing={<AimMockup />} words={WHY.words[1]} body={WHY.body[1]} tone={{ words: "text-text", body: "text-text" }} />
      </div>
      <p className="border-t border-border pt-7 text-site-statement-sm leading-site-statement-sm tracking-site-statement-sm font-semibold md:pt-6 md:text-site-statement md:leading-site-statement md:tracking-site-statement">
        {WHY.close}
      </p>
    </Section>
  );
}
