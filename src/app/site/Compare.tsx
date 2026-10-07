import { Section } from "./Section";
import { OPEN_SOURCE } from "./words";

// How it differs from the hosted version (the Website v4 — Pages boards, Open source): when, cost, running it and your
// data, for a copy of your own and for the hosted version. From medium up a table, its rows between hairlines; on a
// phone each row is a group, the two versions under its name.
export function Compare() {
  const { compare } = OPEN_SOURCE;
  const [own, hosted] = compare.columns;
  return (
    <Section className="pb-22 md:pb-36" inner="flex flex-col gap-6 md:gap-12">
      <h2 className="max-w-250 text-site-section-sm leading-site-section-sm tracking-site-section-sm font-semibold lg:text-site-section lg:leading-site-section lg:tracking-site-section">
        {compare.heading}
      </h2>
      <table className="hidden w-full table-fixed border-b border-border text-left md:table">
        <thead>
          <tr>
            <td className="w-40 pb-4 lg:w-50" />
            {compare.columns.map((c) => (
              <th key={c} scope="col" className="pb-4 text-site-nav leading-site-nav font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {compare.rows.map((r) => (
            <tr key={r.label} className="border-t border-border align-top">
              <th scope="row" className="py-6 pr-6 text-site-body-lg-sm leading-site-body-lg-sm font-semibold">
                {r.label}
              </th>
              <td className="py-6 pr-10 text-site-body-lg-sm leading-site-body-lg-sm text-muted">{r.own}</td>
              <td className="py-6 pr-10 text-site-body-lg-sm leading-site-body-lg-sm text-muted">{r.hosted}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col border-b border-border md:hidden">
        {compare.rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-2.5 border-t border-border pt-4.5 pb-5">
            <h3 className="text-site-question-sm leading-site-question-sm font-semibold">{r.label}</h3>
            <dl className="flex flex-col gap-2.5">
              {[
                [own, r.own],
                [hosted, r.hosted],
              ].map(([version, text]) => (
                <div key={version} className="flex gap-3">
                  <dt className="w-24 shrink-0 pt-0.5 text-body-sm leading-body-sm font-medium text-muted">{version}</dt>
                  <dd className="min-w-0 flex-1 text-site-note leading-site-note text-text">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}
