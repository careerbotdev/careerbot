import { Icons } from "@/components/icons";
import { Section } from "./Section";
import { CARDS } from "./words";

// Home's two cards under the steps (the Website v4 — Pages boards): Open source, yours to run, and It writes boldly,
// but never makes things up, each a title, a line and a link to the page that says more (the whole card is the link).
// From medium up each is a bordered card with a small drawing on a grey square: a terminal over two key chips, and a
// highlighted resume line linked to a checked fact. Side by side on a large screen, stacked on a medium one; on a
// phone, two plain sections between hairlines.

const DRAWINGS = [<Terminal key="terminal" />, <Rooted key="rooted" />];

export function Cards() {
  return (
    <Section className="pb-14 md:pb-24 lg:pb-30" inner="flex flex-col md:gap-6 lg:flex-row">
      {CARDS.map((c, i) => (
        <div
          key={c.title}
          className="relative flex min-w-0 flex-1 items-center gap-7 border-t border-border pt-5 pb-2 md:rounded-site-stage md:border md:py-7 md:pr-7 md:pl-9"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:gap-2.5">
            <h2 className="text-site-card-heading leading-site-card-heading tracking-site-card-heading font-semibold md:text-site-subheading md:leading-site-subheading md:tracking-site-subheading">
              {c.title}
            </h2>
            <p className="text-site-body-sm leading-site-body-sm text-muted md:text-site-body-lg-sm md:leading-site-body-lg-sm">{c.body}</p>
            <a
              href={c.link.href}
              className="flex h-11 items-center gap-1.5 self-start text-site-point leading-site-point font-semibold text-text after:absolute after:inset-0 after:rounded-site-stage md:h-auto md:pt-1.5 md:text-site-nav md:leading-site-nav"
            >
              {c.link.label}
              <Icons.onward aria-hidden="true" className="shrink-0" />
            </a>
          </div>
          <div aria-hidden="true" className="hidden h-43 w-50 shrink-0 items-center justify-center rounded-site-card bg-subtle md:flex">
            {DRAWINGS[i]}
          </div>
        </div>
      ))}
    </Section>
  );
}

// A terminal with two lines run, over the two keys a copy of your own needs.
function Terminal() {
  return (
    <svg viewBox="0 0 200 140" className="w-50">
      <rect x="20.5" y="22.5" width="159" height="63" rx="6" strokeWidth="1" className="fill-inverse stroke-site-terminal-line" />
      {[30, 38, 46].map((cx) => (
        <circle key={cx} cx={cx} cy="31" r="2" className="fill-inverse-muted opacity-60" />
      ))}
      <path d="M29 45 l3 2.5 -3 2.5" fill="none" strokeWidth="1.2" strokeLinecap="round" className="stroke-inverse-muted" />
      <rect x="38" y="45" width="78" height="4" rx="2" className="fill-inverse-muted opacity-60" />
      <rect x="38" y="54" width="100" height="4" rx="2" className="fill-site-terminal-line" />
      <path d="M29 67 l3 2.5 -3 2.5" fill="none" strokeWidth="1.2" strokeLinecap="round" className="stroke-inverse-muted" />
      <rect x="38" y="67" width="40" height="4" rx="2" className="fill-inverse-muted opacity-60" />
      <rect x="82" y="65" width="4" height="8" className="fill-inverse-text" />
      {[
        { x: 20, w: 76, bar: 40 },
        { x: 102, w: 64, bar: 28 },
      ].map(({ x, w, bar }) => (
        <g key={x}>
          <rect x={x} y="96" width={w} height="22" rx="11" strokeWidth="1" className="fill-surface stroke-border" />
          <circle cx={x + 12} cy="107" r="3" fill="none" strokeWidth="1.1" className="stroke-text" />
          <path d={`M${x + 15} 107 h6 m-2 0 v2.5`} fill="none" strokeWidth="1.1" strokeLinecap="round" className="stroke-text" />
          <rect x={x + 26} y="105" width={bar} height="4" rx="2" className="fill-control-border" />
        </g>
      ))}
    </svg>
  );
}

// A resume line marked in amber, linked to the checked fact it comes from.
function Rooted() {
  return (
    <svg viewBox="0 0 200 140" className="w-50">
      <rect x="18" y="20" width="150" height="62" rx="6" strokeWidth="1" className="fill-surface stroke-border" />
      <rect x="30" y="32" width="120" height="4" rx="2" className="fill-site-skeleton" />
      <rect x="30" y="41" width="90" height="4" rx="2" className="fill-site-skeleton" />
      <rect x="30" y="53" width="112" height="4" rx="2" className="fill-primary" />
      <rect x="30" y="68" width="100" height="4" rx="2" className="fill-site-skeleton" />
      <path d="M144 55 C160 60, 150 96, 150 104" fill="none" strokeWidth="1.2" className="stroke-steel" />
      <circle cx="144" cy="55" r="2" className="fill-steel" />
      <circle cx="150" cy="104" r="2" className="fill-steel" />
      <rect x="70" y="104" width="112" height="24" rx="12" strokeWidth="1" className="fill-steel-subtle stroke-steel" />
      <circle cx="83" cy="116" r="5" className="fill-good" />
      <path d="M80.6 116 l1.7 1.7 l3.2 -3.4" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-surface" />
      <rect x="94" y="114" width="74" height="4" rx="2" className="fill-control-border" />
    </svg>
  );
}
