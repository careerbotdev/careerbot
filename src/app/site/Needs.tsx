import { Icons } from "@/components/icons";
import { Section } from "./Section";
import { OPEN_SOURCE } from "./words";

// What you need to run it (the Website v4 — Pages boards, Open source): the heading and the way to the self-hosting
// guide, beside the five things a copy of your own needs, numbered, between hairlines, and the optional
// Brave key last. On medium screens and phones the list goes under the heading.
export function Needs() {
  const { needs } = OPEN_SOURCE;
  return (
    <Section className="pb-22 md:pb-36" inner="flex flex-col gap-4 md:gap-8 lg:flex-row lg:justify-between lg:gap-10">
      <div className="flex max-w-160 flex-col gap-4 lg:w-100 lg:shrink-0">
        <h2 className="text-site-section-sm leading-site-section-sm tracking-site-section-sm font-semibold lg:text-site-section lg:leading-site-section lg:tracking-site-section">
          {needs.heading}
        </h2>
        <p className="text-site-body-sm leading-site-body-sm text-muted lg:text-site-body-lg-sm lg:leading-site-body-lg-sm">{needs.note}</p>
        <a
          href={needs.guide.href}
          className="flex h-11 items-center gap-1.5 self-start text-site-point leading-site-point font-semibold text-text md:text-site-nav md:leading-site-nav"
        >
          {needs.guide.label}
          <Icons.onward aria-hidden="true" className="shrink-0" />
        </a>
      </div>
      <div className="flex flex-col border-b border-border lg:w-180 lg:shrink-0">
        <ol className="flex flex-col">
          {needs.items.map((n, i) => (
            <li key={n.title} className="flex items-start border-t border-border py-5 lg:py-7">
              <span className="flex h-6 w-9 shrink-0 items-center font-mono text-site-index leading-site-index text-muted lg:h-6.5 lg:w-14">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-site-question-sm leading-site-question-sm tracking-site-question-sm font-semibold lg:text-site-card-heading lg:leading-site-card-heading lg:tracking-site-card-heading">
                  {n.title}
                </span>
                <span className="text-site-body-sm leading-site-body-sm text-muted lg:text-site-body-lg-sm lg:leading-site-body-lg-sm">{n.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="border-t border-border pt-4.5 pb-5.5 pl-9 text-site-body-sm leading-site-body-sm text-muted lg:pt-6 lg:pb-7 lg:pl-14 lg:text-site-body lg:leading-site-body">
          {needs.optional}
        </p>
      </div>
    </Section>
  );
}
