import { Section } from "./Section";
import { START } from "./words";

// Where it starts (the Website v4 — Pages boards, Home): the heading, the usual start in grey over CareerBot's, then
// the line on the usual way (grey) beside the line on CareerBot's, and under them, between hairlines, the way from your
// own words to what you send, each step's name in the first line's lane and what it is in the second's. Side by side on
// a large screen; on a medium one the lines stack and each step keeps a narrower lane for its name; on a phone the name
// sits over what it is.
export function Start() {
  const [usual, ours] = START.heading;
  return (
    <Section className="pb-14 md:pb-24 lg:pb-30" inner="flex flex-col gap-6 md:gap-10 lg:gap-12">
      <h2 className="flex flex-col text-site-section-sm leading-site-section-sm tracking-site-section-sm font-semibold md:text-site-headline-sm md:leading-site-headline-sm md:tracking-site-headline-sm lg:text-site-headline lg:leading-site-headline lg:tracking-site-headline">
        <span className="text-muted">{usual}</span>
        <span>{ours}</span>
      </h2>
      <div className="flex flex-col gap-4 md:max-w-175 md:gap-5 lg:max-w-none lg:flex-row lg:gap-24 lg:pt-2">
        <p className="text-site-body-lg-sm leading-site-body-lg-sm text-muted md:text-site-body-xl md:leading-site-body-xl lg:w-100 lg:shrink-0">{START.usual}</p>
        <p className="min-w-0 flex-1 text-site-body-lg-sm leading-site-body-lg-sm text-text md:text-site-body-xl md:leading-site-body-xl">{START.ours}</p>
      </div>
      <ol className="flex flex-col border-b border-border">
        {START.steps.map((s) => (
          <li key={s.title} className="flex flex-col gap-1.5 border-t border-border py-4 md:flex-row md:items-baseline md:gap-8 md:py-5.5 lg:gap-24">
            <span className="text-site-question-sm leading-site-question-sm tracking-site-question-sm font-semibold md:w-56 md:shrink-0 lg:w-100">{s.title}</span>
            <span className="min-w-0 flex-1 text-site-note leading-site-note text-muted md:text-site-answer md:leading-site-answer">{s.body}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
