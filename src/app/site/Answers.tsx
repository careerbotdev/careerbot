import { PAINS } from "./words";

// Which pain a part of the page answers (the Calm v3 boards' "Answers" pill): the word Answers, then a pill with the
// pain's small drawing and its title. Wraps under Answers when the line is too narrow.

const [VOID, RESUME, STUCK] = PAINS.items.map((p) => p.title);

// The pains' small drawings, 20px: an envelope heading off (the void), a resume (sells you short), a fork with the way
// on dotted (stuck). Also beside each pain in Home's list on a phone.
export function PainGlyph({ pain }: { pain: string }) {
  const line = { fill: "none", strokeWidth: 1.4, className: "stroke-muted" } as const;
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0">
      {pain === VOID && (
        <>
          <rect x="1.5" y="6" width="10" height="7.5" rx="1.5" {...line} />
          <path d="M2.5 7l4.5 3.3L11.5 7" strokeLinejoin="round" {...line} />
          <rect x="14" y="8.2" width="4.6" height="3.4" rx="0.8" {...line} strokeWidth={1.2} opacity={0.45} />
        </>
      )}
      {pain === RESUME && (
        <>
          <rect x="4" y="2" width="12" height="16" rx="2" {...line} />
          <path d="M7 7h6M7 10.5h6M7 14h4" strokeLinecap="round" {...line} />
        </>
      )}
      {pain === STUCK && (
        <>
          <path d="M10 18v-6M10 12C10 8 5 8 4.5 3M10 12c0-4 5-4 5.5-9" strokeLinecap="round" {...line} />
          <path d="M10 12V3" strokeLinecap="round" strokeDasharray="1.5 2.5" {...line} />
        </>
      )}
    </svg>
  );
}

export function Answers({ pain }: { pain: string }) {
  return (
    <p className="flex flex-wrap items-center gap-3">
      <span className="text-site-tag leading-site-tag font-medium text-muted">Answers</span>
      <span className="flex h-8.5 items-center gap-2 rounded-site-pill border border-border bg-surface pr-3.5 pl-2.5 text-site-chip leading-site-chip font-medium text-text">
        <PainGlyph pain={pain} />
        {pain}
      </span>
    </p>
  );
}
