// A role's fit score: a square with its number in semibold tabular figures, coloured by its fit level. Strong on `good`,
// some on `caution` (paper text on the light fills, ink on the lighter dark-mode ones), weak or none on `subtle` with
// `muted` text. The number always shows ("–" when the role was judged before scores).
// 40 in an item header, 28 in a list row (the default), 20 inline.
const colors = {
  strong: "bg-good text-paper dark:text-ink",
  some: "bg-caution text-paper dark:text-ink",
  weak: "bg-subtle text-muted",
  none: "bg-subtle text-muted",
};

export type FitLevel = keyof typeof colors;

const sizes = {
  lg: "size-10 text-title-md leading-5",
  md: "size-7 text-body-sm leading-body-sm",
  sm: "size-5 text-label leading-label",
};

export function ScoreBadge({ score, level, size = "md", className = "" }: { score: number | null; level: FitLevel | null; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      role="img"
      aria-label={score === null ? "No score" : `Score ${score}${level ? `, ${level === "none" ? "no" : level} fit` : ""}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-sm font-semibold tabular-nums ${sizes[size]} ${colors[level ?? "none"]} ${className}`}
    >
      {score ?? "–"}
    </span>
  );
}
