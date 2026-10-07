import type { ReactNode } from "react";
import type { FitLevel } from "./ScoreBadge";
import { Icons, type IconName } from "./icons";

// A status in words, 20px tall with 6px sides, label type and a 1px border so every tone is one size. Colour only
// confirms the words.
// good (approved, done) and caution (needs a look) sit on their tint with the -text shade. Red has no tint: a problem
// is red words in a red outline on paper in light mode, and paper on red in dark mode, where red is never text. info
// (applied, current) is ink on the steel tint inside a steel border. neutral (preparing, maybe, closed) is muted on
// subtle, for states that are neither good nor waiting.
const tones = {
  good: "border-transparent bg-good-subtle text-good-text",
  caution: "border-transparent bg-caution-subtle text-caution-text",
  problem: "border-red bg-surface text-red dark:bg-red dark:text-paper",
  info: "border-steel bg-steel-subtle text-text",
  neutral: "border-transparent bg-subtle text-muted",
};

export type StatusTone = keyof typeof tones;

export function StatusTag({ tone, icon, children, className = "" }: { tone: StatusTone; icon?: IconName; children: ReactNode; className?: string }) {
  const Icon = icon && Icons[icon];
  return (
    <span
      data-tone={tone}
      className={`inline-flex h-5 shrink-0 items-center gap-1 self-center rounded-sm border px-1.5 text-label leading-label font-medium whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {Icon && <Icon aria-hidden="true" size={12} />}
      {children}
    </span>
  );
}

// Inside a line, a fit is a coloured word rather than a tag: good-text for strong, caution-text for some, muted for
// weak or none.
const fitWords: Record<FitLevel, [string, string]> = {
  strong: ["Strong", "text-good-text"],
  some: ["Some", "text-caution-text"],
  weak: ["Weak", "text-muted"],
  none: ["None", "text-muted"],
};

export function FitWord({ level, children, className = "" }: { level: FitLevel; children?: ReactNode; className?: string }) {
  const [word, color] = fitWords[level];
  return <span className={`font-medium ${color} ${className}`}>{children ?? word}</span>;
}

// A count beside a label ("Review 14"): a plain muted number in tabular figures, never a coloured bubble.
export function Count({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`text-label leading-label font-medium text-muted tabular-nums ${className}`}>{children}</span>;
}

// Unread: a 6px steel mark before the words, which turn semibold. The mark is decoration; say "Unread" in words.
export function UnreadMark({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-1.5 shrink-0 rounded-xs bg-steel ${className}`} />;
}
