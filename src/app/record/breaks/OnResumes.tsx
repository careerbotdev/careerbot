"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import { arrange, type Entry, type LayoutRole, part, PLACEMENT, recordDoc } from "../../../../convex/resumeDoc";
import { Button } from "@/components/Button";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { type Fact, type Row, span, years } from "./words";

// How a career break shows on every resume (the record's setting; each resume can change it): shown, shown with its
// reason, folded into the role beside it, or left out. A resume excerpt beside the choice shows the break between the
// roles either side, its line (or the role it folds into) highlighted.

export type Choice = "show" | "reason" | "fold" | "out";
export type Side = "previous" | "next";
export const CHOICES: { value: Choice; label: string }[] = [
  { value: "show", label: "Show" },
  { value: "reason", label: "Show with reason" },
  { value: "fold", label: "Fold into a role" },
  { value: "out", label: "Leave out" },
];

type Presentation = { roles: LayoutRole[] };
// A break as the excerpt and the fold rules see it: its own dates and reason, or the form's while it's written.
export type Draft = { roleKey: string; start?: string; end?: string; reason?: string };

type Placement = { fold?: { into: Side; bullets: "move" }; hidden?: true; showReason?: true };
const layoutOf = (choice: Choice, into: Side): Placement =>
  choice === "out" ? { hidden: true } : choice === "fold" ? { fold: { into, bullets: "move" } } : choice === "reason" ? { showReason: true } : {};

// The record's choice for a break, and the side it folds into.
export function choiceOf(presentation: Presentation | undefined, roleKey: string): { choice: Choice; into: Side | null } {
  const r = presentation?.roles.find((x) => x.roleKey === roleKey);
  return { choice: r?.hidden ? "out" : r?.fold ? "fold" : r?.showReason ? "reason" : "show", into: r?.fold?.into ?? null };
}

// The approved record as a resume without bullets, with the break (as drafted) in it, and every other role's setting.
function recordWith(rows: Row[], presentation: Presentation | undefined, draft: Draft) {
  const roles = rows.flatMap((r) => (r.kind === "role" && r.status === "approved" && r.counts && r.roleKey !== draft.roleKey ? [{ ...r.data, roleKey: r.roleKey }] : []));
  const doc = recordDoc([...roles, ...(draft.start ? [{ roleKey: draft.roleKey, title: "Career break", break: true, start: draft.start, end: draft.end, reason: draft.reason }] : [])]);
  const others = (presentation?.roles ?? []).filter((r) => r.roleKey !== draft.roleKey).map((r) => part(r, PLACEMENT));
  const shown = (choice: Choice, into: Side) => arrange(doc, { roles: [...others, { roleKey: draft.roleKey, ...layoutOf(choice, into) }] });
  // The sides it can fold into: a role (never another break) on that side, as a resume would find it.
  const sides = (["previous", "next"] as const).filter((into) => shown("fold", into).folds.some((f) => f.roleKey === draft.roleKey));
  return { doc, shown, sides };
}

// Saves the record's choice for a break. A fold goes to the side asked for, else the one it had, else the first that
// has a role to fold into.
export function usePlaceBreak() {
  const rows = useQuery(api.extract.items);
  const presentation = useQuery(api.resume.presentation);
  const setPresentation = useMutation(api.resume.setPresentation);
  return (draft: Draft, choice: Choice, into?: Side | null) => {
    const { sides } = recordWith(rows ?? [], presentation, draft);
    const side = into && sides.includes(into) ? into : (sides[0] ?? null);
    if (choice === "fold" && !side) {
      toast({ message: "No role on either side to fold into.", icon: "failed" });
      return Promise.resolve(false);
    }
    return setPresentation({ roleKey: draft.roleKey, ...layoutOf(choice, side ?? "previous") }).then(
      () => true,
      (e: unknown) => {
        toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t save that choice.", icon: "failed" });
        return false;
      },
    );
  };
}

// The choice, the line under it and the excerpt. `onChange` saves it (the item) or keeps it (the form); `disabled`
// says why it can't be chosen now.
export function OnResumes({ draft, choice, into, onChange, disabled }: { draft: Draft; choice: Choice; into: Side | null; onChange: (choice: Choice, into?: Side) => void; disabled?: string }) {
  const rows = useQuery(api.extract.items);
  const presentation = useQuery(api.resume.presentation);
  const { doc, shown, sides } = recordWith(rows ?? [], presentation, draft);
  const side = into && sides.includes(into) ? into : (sides[0] ?? "previous");
  const arranged = shown(choice, side);
  const target = arranged.folds.find((f) => f.roleKey === draft.roleKey)?.into;
  const other = sides.find((s) => s !== side);
  const otherTarget = other ? shown("fold", other).folds.find((f) => f.roleKey === draft.roleKey)?.into : undefined;

  // The roles either side of the break as written, then how they show.
  const at = doc.experience.findIndex((e) => e.roleKey === draft.roleKey);
  const keys = new Set([doc.experience[at - 1]?.roleKey, draft.roleKey, doc.experience[at + 1]?.roleKey].filter(Boolean));
  const excerpt = at < 0 ? [] : arranged.doc.experience.filter((e) => keys.has(e.roleKey) || e === target);
  const bullet = (roleKey?: string) => rows?.find((r): r is Fact => r.kind === "fact" && r.status === "approved" && r.counts && r.roleKey === roleKey && !!r.data.text)?.data.text;

  return (
    <section className="flex flex-col">
      <div className="pb-2">
        <Text size="label">On resumes</Text>
      </div>
      <div className="flex flex-col gap-3">
        <SegmentedControl label="On resumes" hideLabel value={choice} options={CHOICES} onChange={(c) => onChange(c, c === "fold" ? side : undefined)} disabled={!!disabled} />
        <Text size="sm" muted>
          {disabled ?? "Every resume starts from this. Each resume can change it."}
        </Text>
        {choice === "fold" && target && (
          <div className="flex flex-wrap items-center gap-2">
            <Text size="sm">Folds into {target.employer || target.title}</Text>
            {other && otherTarget && (
              <Button size="sm" variant="ghost" detail="Widens the role on the other side of the break instead." note="Free · each resume can change it" onClick={() => onChange("fold", other)}>
                Fold into {otherTarget.employer || otherTarget.title} instead
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 rounded-sm border bg-surface px-4 py-5 md:px-7 md:py-6">
          {excerpt.length ? (
            excerpt.map((e) => <Line key={e.roleKey} entry={e} lit={e.roleKey === draft.roleKey || e === target} bullet={e.break ? undefined : bullet(e.roleKey)} />)
          ) : (
            <Lit>
              <span className="flex-1">Career break</span>
              <span className="text-muted tabular-nums">Start – End</span>
            </Lit>
          )}
        </div>
      </div>
    </section>
  );
}

function Lit({ on = true, children }: { on?: boolean; children: ReactNode }) {
  return (
    <div className={`-mx-1.5 flex items-baseline gap-2 rounded-sm px-1.5 py-1 text-body-sm leading-body-sm ${on ? "bg-steel-subtle shadow-[inset_2px_0_0_var(--color-steel)]" : ""}`}>{children}</div>
  );
}

// One entry of the excerpt: a break's line ("Career break · reason", its months), or a role's title, employer and years
// with the first line of its facts.
function Line({ entry: e, lit, bullet }: { entry: Entry; lit: boolean; bullet?: string }) {
  if (e.break)
    return (
      <Lit on={lit}>
        <span className="min-w-0 flex-1 font-medium text-text">{[e.title, e.reason].filter(Boolean).join(" · ")}</span>
        <span className="shrink-0 text-muted tabular-nums">{span(e.start, e.end)}</span>
      </Lit>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <Lit on={lit}>
        <span className="min-w-0 flex-1 font-semibold text-text">{[e.title, e.employer].filter(Boolean).join(", ")}</span>
        <span className="shrink-0 text-muted tabular-nums">{years(e.start, e.end)}</span>
      </Lit>
      {bullet && (
        <div className="flex gap-2 px-1.5 py-0.5 text-body-sm leading-body-sm">
          <span className="text-muted">–</span>
          <span className="min-w-0 flex-1 text-text">{bullet}</span>
        </div>
      )}
    </div>
  );
}
