import { Section } from "./Section";
import { TABLE_HEADING } from "./words";

// Everything CareerBot does (the Website v4 — Pages boards, How it works; Home's feature names link here, at
// /how-it-works#features): each area with its features and a line on each, between hairlines. On a large screen the
// area, the feature and its detail are three columns; narrower, each feature sits over its detail under a small grey
// area name.
export function FeaturesTable({ groups }: { groups: { area: string; rows: { feature: string; detail: string }[] }[] }) {
  return (
    <Section id="features" className="scroll-mt-20 pb-22 outline-none md:pb-40 lg:scroll-mt-22" inner="flex flex-col gap-7 md:gap-12">
      <h2 className="text-site-section-sm leading-site-section-sm tracking-site-section-sm font-semibold md:text-site-heading md:leading-site-heading md:tracking-site-heading">
        {TABLE_HEADING}
      </h2>
      <div className="flex flex-col border-b border-border">
        {groups.map((g) => (
          <div key={g.area} className="flex flex-col gap-4 border-t border-border pt-5.5 pb-6 lg:flex-row lg:gap-6 lg:py-7">
            <h3 className="text-site-group leading-site-group tracking-site-group font-semibold text-muted lg:w-70 lg:shrink-0 lg:text-site-item lg:leading-site-item lg:tracking-normal lg:text-text">
              {g.area}
            </h3>
            <dl className="flex min-w-0 flex-1 flex-col gap-3.5">
              {g.rows.map((r) => (
                <div key={r.feature} className="flex flex-col gap-0.5 lg:flex-row lg:gap-6">
                  <dt className="text-site-item-sm leading-site-item-sm font-medium lg:w-95 lg:shrink-0 lg:text-site-item lg:leading-site-item">{r.feature}</dt>
                  <dd className="text-body-md leading-body-md text-muted lg:min-w-0 lg:flex-1 lg:text-site-item lg:leading-site-item">{r.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}
