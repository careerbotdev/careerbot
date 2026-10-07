"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type Entry, type LayoutRole, PLACEMENT, type ResumeDoc, type ResumeLayout, TITLE, type TitleSuggestion, arrange, mergeLayout, part } from "../../../convex/resumeDoc";
import { toast } from "@/components/Toast";

// How each role shows, chosen in Layout and saved as it's chosen. "Default for every resume" (level record): a fold or
// career break choice is the setting for every resume. On a resume, a fold or break choice overrides that setting for
// that resume. A title chosen on the base resume is the setting for every resume; on a direction or tailored resume it
// overrides it for that resume.

export type Level = "record" | "base" | "direction" | "tailored";
// Translated titles to offer per role: the level's suggestion (the direction's title map, else the record's market
// title); on a tailored resume also its direction resume's titles and the ones suggested for its posting.
export type Titles = { suggested: Record<string, TitleSuggestion>; direction: Record<string, string>; posting?: Record<string, string> };

type Placement = Pick<LayoutRole, "fold" | "hidden" | "showReason">;
type Plain = Placement & Pick<LayoutRole, "title" | "translated">;
// A choice that means "as written" is the same as no choice.
const plain = (r: Partial<LayoutRole> | undefined): Plain => ({
  fold: r?.fold ?? undefined,
  hidden: r?.hidden || undefined,
  showReason: r?.showReason || undefined,
  title: r?.title === "official" ? undefined : r?.title,
  translated: r?.title && r.title !== "official" ? r.translated : undefined,
});
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type Arrangement = {
  // The entries as shown, where each folded entry went, and the role each project linked to one sits inside.
  shown: ResumeDoc;
  folds: { roleKey: string; into: Entry }[];
  placed: Record<string, string>;
  level: Level;
  entryOf: (roleKey: string) => Entry | undefined;
  effOf: (roleKey: string) => LayoutRole | undefined;
  // What the level below says: the record's fold and break setting, and (below the base resume) its title.
  lowerOf: (roleKey: string) => Plain;
  place: (roleKey: string, want: Placement) => void;
  title: (roleKey: string, want: Pick<LayoutRole, "title" | "translated" | "source">) => void;
  differs: (roleKey: string) => { placement: boolean; title: boolean };
  resetPlacement: (roleKey: string) => void;
  resetTitle: (roleKey: string) => void;
  foldTarget: (roleKey: string, into: "previous" | "next") => Entry | null;
};

export function useArrangement({ id, doc, settings, layout, level }: { id?: Id<"resumes">; doc: ResumeDoc; settings: ResumeLayout; layout: ResumeLayout | null; level: Level }): Arrangement {
  const setRole = useMutation(api.resume.setRole);
  const setPresentation = useMutation(api.resume.setPresentation);
  const setting = (roleKey: string) => settings.roles.find((r) => r.roleKey === roleKey);
  const below = level === "record" ? null : settings;
  const own = level === "record" ? { roles: settings.roles.map((r) => part(r, PLACEMENT)) } : (layout ?? { roles: [] });
  const arranged = arrange(doc, below, own);
  const titled = level === "direction" || level === "tailored";
  const lowerOf = (roleKey: string) => plain({ ...(level === "record" ? {} : part(setting(roleKey), PLACEMENT)), ...(titled ? part(setting(roleKey), TITLE) : {}) });
  const effOf = (roleKey: string) => mergeLayout(below, own).roles.find((r) => r.roleKey === roleKey);
  const layoutOf = (roleKey: string): LayoutRole => own.roles.find((r) => r.roleKey === roleKey) ?? { roleKey };
  // What's chosen at this level. The base resume's titles are the settings themselves.
  const ownOf = (roleKey: string): LayoutRole => (level === "base" ? { ...part(layoutOf(roleKey), PLACEMENT), ...part(setting(roleKey), TITLE, roleKey) } : layoutOf(roleKey));
  const save = (role: LayoutRole) => {
    const clean = Object.fromEntries(Object.entries(role).filter(([, x]) => x !== undefined)) as LayoutRole;
    const saving =
      level === "record"
        ? setPresentation({ roleKey: clean.roleKey, ...(clean.fold ? { fold: clean.fold } : {}), ...(clean.hidden ? { hidden: true } : {}), ...(clean.showReason ? { showReason: true } : {}) })
        : setRole({ id: id!, role: clean });
    saving.catch((e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t save that choice.", icon: "failed" }));
  };
  // Where each field ends up: a value the level below already has is inherited, not stored again.
  const place = (roleKey: string, want: Placement) => {
    const lower = lowerOf(roleKey);
    const next = { ...ownOf(roleKey) };
    for (const k of PLACEMENT) {
      const w = plain(want)[k];
      if (same(w, lower[k])) delete next[k];
      else Object.assign(next, { [k]: w ?? (k === "fold" ? null : false) });
    }
    save(next);
  };
  const title = (roleKey: string, want: Pick<LayoutRole, "title" | "translated" | "source">) => {
    const lower = lowerOf(roleKey);
    const next = { ...ownOf(roleKey) };
    for (const k of TITLE) delete next[k];
    const w = plain(want);
    if (!same([w.title, w.translated], [lower.title, lower.translated])) Object.assign(next, want);
    save(next);
  };
  const differs = (roleKey: string) => {
    const [a, b] = [plain(effOf(roleKey)), lowerOf(roleKey)];
    const off = (keys: readonly (keyof Plain)[]) => keys.some((k) => !same(a[k], b[k]));
    return { placement: level !== "record" && off(PLACEMENT), title: titled && off(["title", "translated"]) };
  };
  // What folding this entry each way would do, or null when there's no role on that side.
  const foldTarget = (roleKey: string, into: "previous" | "next"): Entry | null =>
    arrange(doc, below, { roles: [...own.roles.filter((r) => r.roleKey !== roleKey), { ...layoutOf(roleKey), hidden: false, fold: { into, bullets: "move" } }] }).folds.find((f) => f.roleKey === roleKey)
      ?.into ?? null;
  return {
    // The entries as shown, where each folded entry went, and the role each project linked to one sits inside.
    shown: arranged.doc,
    folds: arranged.folds,
    placed: arranged.placed,
    level,
    entryOf: (roleKey: string) => doc.experience.find((e) => e.roleKey === roleKey),
    effOf,
    lowerOf,
    place,
    title,
    differs,
    resetPlacement: (roleKey: string) => save(part(ownOf(roleKey), TITLE)),
    resetTitle: (roleKey: string) => save(part(ownOf(roleKey), PLACEMENT)),
    foldTarget,
  };
}

// The titles a role can take: official, each translated title offered, and both; the one shown now marked.
export function titleChoices(a: Arrangement, entry: Entry, titles: Titles) {
  const roleKey = entry.roleKey!;
  const official = entry.title;
  const eff = a.effOf(roleKey);
  const lower = a.lowerOf(roleKey);
  const suggestion = titles.suggested[roleKey];
  const candidates: { text: string; source?: LayoutRole["source"]; from: string }[] = [];
  const offer = (text: string | undefined, from: string, source?: LayoutRole["source"]) => {
    const t = text?.trim();
    if (t && t !== official && !candidates.some((c) => c.text === t)) candidates.push({ text: t, source, from });
  };
  offer(eff?.translated, eff?.source === "you" ? "Your title" : eff?.source === "tailored" ? "Suggested for the posting" : "Suggested", eff?.source);
  if (a.level === "tailored") {
    offer(titles.direction[roleKey], "The direction’s", "direction");
    offer(titles.posting?.[roleKey], "Suggested for the posting", "tailored");
  } else offer(suggestion?.text, "Suggested", suggestion?.from === "direction" ? "direction" : undefined);
  offer(lower.translated, "Also fits");
  const mode = eff?.title && eff.title !== "official" ? eff.title : "official";
  const at = candidates.findIndex((c) => c.text === eff?.translated?.trim());
  return { official, candidates, mode, at, source: eff?.source };
}
