import { Section } from "./Section";
import { PATHS } from "./words";

// Two paths: Apply and Outreach (How it works, after the four steps): the heading beside the line on why not to wait,
// then the two paths side by side from medium up, each between hairlines, equal in size; on a phone one under the
// other. Last, the line that CareerBot never sends anything.
export function Paths() {
  return (
    <Section className="pb-24 md:pb-40" inner="flex flex-col gap-8 md:gap-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <h2 className="max-w-150 text-site-headline-sm leading-site-headline-sm tracking-site-headline-sm font-semibold lg:w-150 lg:shrink-0 lg:text-site-headline lg:leading-site-headline lg:tracking-site-headline">
          {PATHS.heading}
        </h2>
        <p className="max-w-160 text-site-body-lg-sm leading-site-body-lg-sm text-muted lg:w-120 lg:shrink-0 lg:pt-2 lg:text-site-body-xl lg:leading-site-body-xl">{PATHS.intro}</p>
      </div>
      <div className="grid border-b border-border md:grid-cols-2 md:gap-x-10">
        {PATHS.paths.map((p) => (
          <div key={p.title} className="flex flex-col gap-2.5 border-t border-border pt-5 pb-6 lg:gap-3.5 lg:pt-7 lg:pb-8">
            <h3 className="text-site-question-sm leading-site-question-sm tracking-site-question-sm font-semibold lg:text-site-card-heading lg:leading-site-card-heading lg:tracking-site-card-heading">
              {p.title}
            </h3>
            <p className="text-site-body-sm leading-site-body-sm text-muted lg:text-site-body-lg-sm lg:leading-site-body-lg-sm">{p.body}</p>
          </div>
        ))}
      </div>
      <p className="max-w-200 text-site-body-sm leading-site-body-sm text-text lg:text-site-body lg:leading-site-body">{PATHS.note}</p>
    </Section>
  );
}
