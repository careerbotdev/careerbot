"use client";

import { BuiltOnPeek } from "@/components/BuiltOn";
import { FitWord } from "@/components/StatusTag";

type Requirement = { requirement: string; strength: "strong" | "partial" | "thin"; factIds: string[]; note?: string };

// "5 of 11 strong".
export const strongOf = (requirements: { strength: string }[]) => `${requirements.filter((r) => r.strength === "strong").length} of ${requirements.length} strong`;

// A tailored resume's requirements map: each requirement of the posting, how strongly their record shows it (Strong,
// Some, or Weak; None when nothing in the record speaks to it), and the approved facts it rests on.
export function Requirements({ requirements, facts }: { requirements: Requirement[]; facts: Record<string, string> }) {
  return (
    <ul className="flex flex-col gap-1">
      {requirements.map((r, i) => (
        <li key={i} className="flex items-start gap-3 rounded-sm py-1">
          <FitWord level={r.strength === "strong" ? "strong" : r.strength === "partial" ? "some" : r.factIds.length ? "weak" : "none"} className="w-12 shrink-0 text-body-sm leading-body-sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-sm leading-body-sm text-text">{r.requirement}</span>
            {r.note && <span className="text-label leading-label text-muted">{r.note}</span>}
          </span>
          {r.factIds.length > 0 && (
            <BuiltOnPeek align="end" sources={r.factIds.map((id) => ({ kind: "fact", text: facts[id] ?? "No longer in your record", source: "Fact", approved: id in facts }))} />
          )}
        </li>
      ))}
    </ul>
  );
}
