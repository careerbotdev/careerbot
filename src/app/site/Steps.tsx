"use client";

import { Icons } from "@/components/icons";
import { STEP_TILES } from "./mockups/Steps";
import { Section } from "./Section";
import { HOME_STEPS, METHOD } from "./words";

// How CareerBot fixes it (the Website v4 — Pages boards, Home): the heading and Aim. Tailor. Talk. in grey under it,
// then the four steps in short. From medium up each step is its tile (mockups/Steps.tsx) over its number, title and
// line, four across on a large screen and two on a medium one; on a phone, a numbered list between hairlines. Under a
// hairline, a few of the features (each a link to the full list on How it works, from medium up) and See how it works.

export function Steps() {
  return (
    <Section className="pb-14 md:pb-24 lg:pb-30" inner="flex flex-col gap-6 md:gap-10 lg:gap-14">
      <h2 className="flex flex-col text-site-section-sm leading-site-section-sm tracking-site-section-sm font-semibold md:text-site-headline-sm md:leading-site-headline-sm md:tracking-site-headline-sm lg:text-site-headline lg:leading-site-headline lg:tracking-site-headline">
        <span>{HOME_STEPS.heading}</span>
        <span className="text-muted">{HOME_STEPS.sub}</span>
      </h2>
      <ol className="flex flex-col gap-4 md:hidden">
        {METHOD.steps.map((s) => (
          <li key={s.n} className="flex items-start gap-4 border-t border-border pt-4">
            <span className="flex h-6 w-7 shrink-0 items-center font-mono text-site-index leading-site-index text-muted">{s.n}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-site-question-sm leading-site-question-sm tracking-site-question-sm font-semibold">{s.title}</span>
              <span className="text-site-note leading-site-note text-muted">{s.short}</span>
            </span>
          </li>
        ))}
      </ol>
      <ol className="hidden gap-x-6 gap-y-10 md:grid md:grid-cols-2 lg:grid-cols-4">
        {METHOD.steps.map((s, i) => {
          const Tile = STEP_TILES[i];
          return (
            <li key={s.n} className="flex min-w-0 flex-col gap-5">
              <Tile />
              <div className="flex flex-col gap-2 pr-2">
                <span className="font-mono text-mono leading-mono text-muted">{s.n}</span>
                <h3 className="text-site-card-heading leading-site-card-heading tracking-site-card-heading font-semibold lg:min-h-13">{s.title}</h3>
                <p className="text-site-body leading-site-body text-muted">{s.short}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-5 border-t border-border pt-6 md:flex-row md:items-center md:justify-between md:gap-6 md:pt-8">
        <ul className="hidden flex-wrap items-center gap-2 md:flex">
          {HOME_STEPS.features.map((f) => (
            <li key={f} className="flex">
              <a
                href="/how-it-works#features"
                className="inline-flex h-9 items-center rounded-site-pill border border-border px-3.5 text-site-nav leading-site-nav font-medium whitespace-nowrap text-text transition-colors duration-100 hover:bg-subtle"
              >
                {f}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="/how-it-works"
          className="inline-flex h-13 shrink-0 items-center justify-center gap-2 rounded-site-pill bg-subtle px-5 text-site-point leading-site-point font-semibold text-text transition-colors duration-100 hover:bg-hover md:h-11 md:text-site-nav md:leading-site-nav"
        >
          {HOME_STEPS.more}
          <Icons.onward aria-hidden="true" className="shrink-0" />
        </a>
      </div>
    </Section>
  );
}
