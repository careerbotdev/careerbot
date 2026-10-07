"use client";

import { useState } from "react";
import { Icons } from "@/components/icons";
import { Section } from "./Section";
import { QUESTIONS } from "./words";

// Questions (the Website v4 — Pages boards): the heading beside the questions and their answers between hairlines on a
// large screen, the heading over them narrower. `page`: the Questions page itself, where the heading is the page's
// and every question is open. Otherwise it's Home's few, with All questions under them; on a phone those fold, the
// first one open, each question a button that opens and closes its answer. An answer's `link` (Can I try it first?'s
// Open the demo) sits under it, like All questions.
type Item = { q: string; a: string; link?: { label: string; href: string } };
export function Questions({ items, page = false }: { items: Item[]; page?: boolean }) {
  const Heading = page ? "h1" : "h2";
  return (
    <Section
      className={page ? "pt-12 pb-22 md:pt-18 md:pb-30 lg:pt-26 lg:pb-36" : "pb-14 md:pb-24 lg:pb-30"}
      inner={`flex flex-col lg:flex-row lg:justify-between ${page ? "gap-8 md:gap-10" : "gap-5 md:gap-10"}`}
    >
      <Heading
        className={`font-semibold lg:w-100 lg:shrink-0 ${
          page
            ? "text-site-hero-sm leading-site-hero-sm tracking-site-hero-sm lg:text-site-hero lg:leading-site-hero lg:tracking-site-hero"
            : "text-site-section-sm leading-site-section-sm tracking-site-section-sm md:text-site-section md:leading-site-section md:tracking-site-section"
        }`}
      >
        {QUESTIONS.heading}
      </Heading>
      <div className="flex flex-col border-b border-border lg:w-180 lg:shrink-0">
        <dl className={page ? "flex flex-col" : "hidden flex-col md:flex"}>
          {items.map((x) => (
            <div key={x.q} className="flex flex-col gap-2.5 border-t border-border py-5.5 md:py-7">
              <dt className="text-site-question-sm leading-site-question-sm tracking-site-question-sm font-semibold md:text-title-lg md:leading-title-lg md:tracking-title-lg">
                {x.q}
              </dt>
              <dd className="text-site-body-sm leading-site-body-sm text-muted md:text-site-answer md:leading-site-answer">{x.a}</dd>
              {x.link && (
                <dd className="flex">
                  <a
                    href={x.link.href}
                    className="flex h-11 items-center gap-1.5 text-site-point leading-site-point font-semibold text-text md:text-site-nav md:leading-site-nav"
                  >
                    {x.link.label}
                    <Icons.onward aria-hidden="true" className="shrink-0" />
                  </a>
                </dd>
              )}
            </div>
          ))}
        </dl>
        {!page && (
          <>
            <div className="flex flex-col md:hidden">
              {items.map((x, i) => (
                <Fold key={x.q} {...x} defaultOpen={i === 0} />
              ))}
            </div>
            <a
              href="/questions"
              className="flex h-14 items-center gap-1.5 self-start border-t border-border text-site-point leading-site-point font-semibold text-text md:h-17 md:self-stretch md:text-site-nav md:leading-site-nav"
            >
              {QUESTIONS.all}
              <Icons.onward aria-hidden="true" className="shrink-0" />
            </a>
          </>
        )}
      </div>
    </Section>
  );
}

// One question on a phone: the question as a button, its answer under it while open.
function Fold({ q, a, defaultOpen }: { q: string; a: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col border-t border-border">
      <h3 className="flex">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-15 w-full items-center justify-between gap-3 py-4.5 text-left text-site-question-sm leading-site-question-sm tracking-site-question-sm font-semibold text-text"
        >
          {q}
          <Icons.expand size={20} aria-hidden="true" className={`shrink-0 text-muted transition-transform duration-160 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      </h3>
      {open && <p className="pb-5.5 text-site-body-sm leading-site-body-sm text-muted">{a}</p>}
    </div>
  );
}
