import { Section } from "./Section";

// The top of a page other than Home (the Website v4 — Pages boards, How it works and Open source): its heading, as
// large as Home's headline, and a line under it.
export function PageHeader({ heading, sub }: { heading: string; sub: string }) {
  return (
    <Section className="pt-12 pb-18 md:pt-18 md:pb-24 lg:pt-26 lg:pb-30" inner="flex flex-col gap-4 lg:gap-6">
      <h1 className="max-w-260 text-site-hero-sm leading-site-hero-sm tracking-site-hero-sm font-semibold lg:text-site-hero lg:leading-site-hero lg:tracking-site-hero">{heading}</h1>
      <p className="max-w-175 text-site-lead-sm leading-site-lead-sm text-muted lg:text-site-lead lg:leading-site-lead">{sub}</p>
    </Section>
  );
}
