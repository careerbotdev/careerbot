"use client";

import type { ReactNode } from "react";
import type { Entry, LayoutRole } from "../../../../convex/resumeDoc";
import type { MenuEntry } from "@/components/Menu";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Select } from "@/components/Select";
import { Switch } from "@/components/Switch";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import type { Arrangement } from "../../resumes/arrangement";
import { years } from "../breaks/words";
import type { Fact, Row } from "./words";

// How a role shows on every resume (the record's setting; each resume can change it in Layout): its own entry, folded
// into the role before or after it (its lines kept, or left out so only its title and dates show inside that role), or
// left out. Set in the role view (this section) or from its ⋯ (placementMenu). Reuses the career break's pattern
// (breaks/OnResumes.tsx): a segmented choice and a resume excerpt that shows the result.

type Choice = "own" | "fold" | "out";
type Side = "previous" | "next";
const CHOICES: { value: Choice; label: string }[] = [
  { value: "own", label: "Own entry" },
  { value: "fold", label: "Fold into a role" },
  { value: "out", label: "Leave out" },
];

// The role's placement as the record has it, the sides it can fold into (with the role it would widen), and how to
// change it. A fold keeps its side and lines where it can; a new fold goes to the first side with a role.
export function placementOf(a: Arrangement, roleKey: string) {
  const eff = a.effOf(roleKey);
  const into = a.folds.find((f) => f.roleKey === roleKey)?.into;
  const choice: Choice = eff?.hidden ? "out" : into ? "fold" : "own";
  const sides = (["previous", "next"] as const).flatMap((s) => {
    const target = a.foldTarget(roleKey, s);
    return target ? [{ side: s, target }] : [];
  });
  const side: Side | undefined = eff?.fold?.into ?? sides[0]?.side;
  const drop = eff?.fold?.bullets === "drop";
  // Each change says what it did, with Undo (U) back to the placement before.
  const set = (want: Pick<LayoutRole, "fold" | "hidden">, message: string) => {
    const was = { fold: eff?.fold ?? undefined, hidden: eff?.hidden };
    a.place(roleKey, want);
    toast({ message, icon: "done", action: { label: "Undo", key: "U", run: () => a.place(roleKey, was) } });
  };
  const fold = (to: Side | undefined, lines: "move" | "drop") => {
    const target = sides.find((s) => s.side === to)?.target;
    if (to && target) set({ fold: { into: to, bullets: lines } }, `On resumes: folded into ${target.title}${lines === "drop" ? ", its lines left out" : ""}`);
  };
  const choose = (c: Choice) => (c === "out" ? set({ hidden: true }, "On resumes: left out") : c === "own" ? set({}, "On resumes: its own entry") : fold(side, drop ? "drop" : "move"));
  const words = choice === "out" ? "Left out" : choice === "own" ? "Own entry" : `Folded into ${into!.title}`;
  return { choice, into, sides, side, drop, fold, choose, words, line: choice === "fold" ? (drop ? "Its lines left out" : "Its lines move with it") : undefined };
}

// The ⋯'s On resumes: the three choices (a fold named by the role it widens) and, once folded, Leave its lines out.
export function placementMenu(a: Arrangement, roleKey: string, approved: boolean): MenuEntry {
  const p = placementOf(a, roleKey);
  if (!approved) return { label: "On resumes", icon: "resumes", disabled: true, reason: "Approve it first" };
  return {
    label: "On resumes",
    icon: "resumes",
    hint: p.choice === "fold" ? "Folded" : p.choice === "out" ? "Left out" : "Own entry",
    items: [
      { label: "Own entry", checked: p.choice === "own", detail: "Shows this role on its own on every resume.", note: "Free · Undo: choose another", onSelect: () => p.choose("own") },
      ...p.sides.map(({ side, target }) => ({
        label: `Fold into ${target.title}`,
        checked: p.choice === "fold" && p.side === side,
        detail: `Shows this role inside ${target.title}, which widens its dates to cover it.`,
        note: "Free · Each resume can change it in Layout",
        onSelect: () => p.fold(side, p.drop ? "drop" : "move"),
      })),
      { label: "Leave out", checked: p.choice === "out", detail: "Takes this role off every resume, dates and all.", note: "Free · Undo: choose another", onSelect: () => p.choose("out") },
      ...(p.choice === "fold"
        ? [
            "separator" as const,
            {
              label: "Leave its lines out of resumes",
              checked: p.drop,
              detail: `Only its title and dates show, inside ${p.into!.title}.`,
              note: "Free · Undo: choose it again",
              onSelect: () => p.fold(p.side, p.drop ? "move" : "drop"),
            },
          ]
        : []),
    ],
  };
}

// The role view's On resumes: the choice, where a fold goes, whether its lines go with it, and an excerpt of a resume
// with the result (the role it folds into, with its dates widened, "includes" and a line from each).
export function RoleOnResumes({ a, roleKey, rows }: { a: Arrangement; roleKey: string; rows: Row[] }) {
  const p = placementOf(a, roleKey);
  const first = (key?: string) => rows.find((r): r is Fact => r.kind === "fact" && r.status === "approved" && r.counts && r.roleKey === key && !r.projectKey && !!r.data.text)?.data.text;
  const entry = a.entryOf(roleKey);
  const shown = p.into ?? a.shown.experience.find((e) => e.roleKey === roleKey);
  const lines = [first(shown?.roleKey), ...(p.into && !p.drop ? [first(roleKey)] : [])].filter((x): x is string => !!x);
  return (
    <section aria-label="On resumes" className="flex flex-col gap-3">
      <Text size="label">On resumes</Text>
      <SegmentedControl
        label="On resumes"
        hideLabel
        value={p.choice}
        options={CHOICES.map((c) => (c.value === "fold" && !p.sides.length ? { ...c, disabled: true } : c))}
        onChange={p.choose}
      />
      {p.choice === "fold" && p.into && (
        <div className="flex flex-col border-b">
          <div className="flex items-center gap-4 border-t py-3">
            <span className="flex-1 text-body-sm leading-body-sm font-medium text-text">Fold into</span>
            <Select
              label="Fold into"
              value={p.side}
              onChange={(s) => p.fold(s, p.drop ? "drop" : "move")}
              options={p.sides.map(({ side, target }) => ({ value: side, label: target.title }))}
              className="w-56"
            />
          </div>
          <div className="border-t py-3">
            <Switch
              label="Leave its lines out of resumes"
              description={p.drop ? `Only its title and dates show, inside ${p.into.title}.` : `Its lines move into ${p.into.title}.`}
              checked={p.drop}
              onChange={(on) => p.fold(p.side, on ? "drop" : "move")}
            />
          </div>
        </div>
      )}
      <Text size="sm" muted>
        Every resume starts from this. Each resume can change it in Layout.
      </Text>
      <div className="flex flex-col gap-1.5 rounded-sm border bg-surface px-4 py-5 md:px-6">
        {p.choice === "out" || !shown ? (
          <Text size="sm" muted>
            {entry ? `${entry.title} isn’t on resumes, dates and all.` : "Approve it to place it on resumes."}
          </Text>
        ) : (
          <Excerpt entry={shown} includes={p.into && entry ? `includes ${entry.title}, ${years(entry.start, entry.end)}` : undefined} lines={lines} />
        )}
      </div>
    </section>
  );
}

function Excerpt({ entry: e, includes, lines }: { entry: Entry; includes?: string; lines: string[] }): ReactNode {
  return (
    <>
      <div className="flex items-baseline gap-2 text-body-sm leading-body-sm">
        <span className="min-w-0 flex-1 font-semibold text-text">{e.title}</span>
        <span className="shrink-0 text-muted tabular-nums">{years(e.start, e.end)}</span>
      </div>
      <span className="text-body-sm leading-body-sm text-muted">{[e.employer, includes].filter(Boolean).join(" · ")}</span>
      {lines.map((l) => (
        <div key={l} className="flex gap-2 px-1.5 py-0.5 text-body-sm leading-body-sm">
          <span className="text-muted">–</span>
          <span className="min-w-0 flex-1 text-text">{l}</span>
        </div>
      ))}
    </>
  );
}
