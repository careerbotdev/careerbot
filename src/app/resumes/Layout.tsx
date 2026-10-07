"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type ReactNode, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type Entry, LENGTHS, type ResumeDoc, type ResumeLayout, type ResumeLength, breakLine, mergeLayout } from "../../../convex/resumeDoc";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { Input } from "@/components/Field";
import { Menu, type MenuEntry } from "@/components/Menu";
import { Popover } from "@/components/Popover";
import { SegmentedControl } from "@/components/SegmentedControl";
import { StatusTag } from "@/components/StatusTag";
import { Switch } from "@/components/Switch";
import { toast } from "@/components/Toast";
import { type Level, type Titles, titleChoices, useArrangement } from "./arrangement";

// Layout: how this resume shows, or the default for every resume. Length (the next version's target), each role's
// title, fold and whether it shows (a career break with or without its reason), and the projects and skills on it.
// Every choice applies at once and leaves the written resume as it is; "Use the default" puts this resume back.

export type LayoutInput = {
  id: Id<"resumes">;
  doc: ResumeDoc;
  settings: ResumeLayout;
  layout: ResumeLayout | null;
  titles: Titles;
  level: Exclude<Level, "record">;
  directionId: Id<"items"> | null;
  // How long the next version is written: its own length, or the default. Null for a tailored resume (it follows its
  // direction's).
  length: { own: ResumeLength | null; record: ResumeLength } | null;
};

const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t save that choice.", icon: "failed" });
const name = (e: Entry) => (e.break ? e.title : `${e.title}, ${e.employer}`);

export function LayoutPane(input: LayoutInput) {
  const [scope, setScope] = useState<"this" | "default">("this");
  const every = scope === "default";
  return (
    <div className="-mx-4 flex flex-col gap-3.5 pt-1">
      <Group label="Applies to">
        <SegmentedControl
          label="Applies to"
          hideLabel
          value={scope}
          onChange={setScope}
          options={[
            { value: "this", label: "This resume" },
            { value: "default", label: "Default for every resume" },
          ]}
        />
      </Group>
      {input.length && <Length directionId={input.directionId} length={input.length} every={every} />}
      <Roles {...input} every={every} />
      <Projects {...input} every={every} />
      <Skills {...input} every={every} />
    </div>
  );
}

function Group({ label, count, aside, children }: { label: string; count?: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 px-4 pb-4">
      <div className="flex min-h-5 items-center gap-2">
        <h3 className="text-label leading-label font-medium text-text">{label}</h3>
        {count !== undefined && <span className="text-label leading-label text-muted tabular-nums">{count}</span>}
        <span className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

// "Set here · Use the default", or "Same as default".
function Inherit({ own, onReset }: { own: boolean; onReset: () => void }) {
  if (!own) return <span className="text-label leading-label text-muted">Same as default</span>;
  return (
    <span className="flex items-center gap-1.5 text-label leading-label">
      <span className="text-muted">Set here ·</span>
      <button type="button" onClick={onReset} className="rounded-sm font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text">
        Use the default
      </button>
    </span>
  );
}

function Length({ directionId, length, every }: { directionId: Id<"items"> | null; length: NonNullable<LayoutInput["length"]>; every: boolean }) {
  const setLength = useMutation(api.resume.setLength);
  const setRecordLength = useMutation(api.resume.setRecordLength);
  const scope = directionId ? { directionId } : {};
  const value = every ? length.record : (length.own ?? length.record);
  return (
    <Group label="Length">
      <div className="flex flex-wrap items-center gap-2.5">
        <SegmentedControl
          label="Length"
          hideLabel
          value={value}
          onChange={(l) => void (every ? setRecordLength({ length: l }) : setLength({ ...scope, length: l })).catch(failed)}
          options={(Object.keys(LENGTHS) as ResumeLength[]).map((l) => ({ value: l, label: LENGTHS[l] }))}
        />
        {!every && <Inherit own={length.own !== null} onReset={() => void setLength({ ...scope, length: null }).catch(failed)} />}
      </div>
      <span className="text-label leading-label text-muted">For the next version written.</span>
    </Group>
  );
}

function Roles({ id, doc, settings, layout, titles, level, every }: LayoutInput & { every: boolean }) {
  const a = useArrangement({ id, doc, settings, layout, level: every ? "record" : level });
  // Titles on the base resume are the default for every resume, so they're chosen in either scope there.
  const titled = !every || level === "base";
  const t = useArrangement({ id, doc, settings, layout, level });
  const [typing, setTyping] = useState<{ roleKey: string; text: string } | null>(null);
  const entries = doc.experience.filter((e) => e.roleKey);
  const differing = every ? [] : entries.filter((e) => Object.values(a.differs(e.roleKey!)).some(Boolean));
  const reset = () =>
    differing.forEach((e) => {
      const d = a.differs(e.roleKey!);
      if (d.placement) a.resetPlacement(e.roleKey!);
      if (d.title) a.resetTitle(e.roleKey!);
    });
  return (
    <Group label="Roles" count={entries.filter((e) => !e.break).length} aside={differing.length > 0 && <Inherit own onReset={reset} />}>
      <ul className="flex flex-col border-b">
        {entries.map((e) => {
          const roleKey = e.roleKey!;
          const eff = a.effOf(roleKey);
          const into = a.folds.find((f) => f.roleKey === roleKey)?.into;
          const shown = !eff?.hidden;
          const fold = (to: "previous" | "next") => {
            const target = a.foldTarget(roleKey, to);
            return target
              ? [{ label: `Fold into ${to === "previous" ? "the role before" : "the role after"}`, hint: target.employer || target.title, checked: into === target, onSelect: () => a.place(roleKey, { fold: { into: to, bullets: eff?.fold?.bullets ?? "move" } }) }]
              : [];
          };
          const placement: MenuEntry[] = [
            ...fold("previous"),
            ...fold("next"),
            ...(into
              ? [
                  { label: "Don’t fold", detail: "Shows this role on its own again.", note: "Free", onSelect: () => a.place(roleKey, { fold: undefined, hidden: eff?.hidden, showReason: eff?.showReason }) },
                  ...(e.bullets.length
                    ? [
                        { label: "Keep its lines", checked: eff?.fold?.bullets !== "drop", onSelect: () => a.place(roleKey, { fold: { into: eff!.fold!.into, bullets: "move" } }) },
                        { label: "Leave its lines out", checked: eff?.fold?.bullets === "drop", onSelect: () => a.place(roleKey, { fold: { into: eff!.fold!.into, bullets: "drop" } }) },
                      ]
                    : []),
                ]
              : []),
            shown
              ? { label: "Leave this role out", icon: "setAside", detail: "Takes this role off. It stays listed here, to show again.", note: "Free · Undo from this menu", onSelect: () => a.place(roleKey, { hidden: true }) }
              : { label: "Show this role", icon: "undo", detail: "Puts this role back on.", note: "Free", onSelect: () => a.place(roleKey, {}) },
          ];
          if (e.break)
            return (
              <li key={roleKey} className="flex items-center gap-2 border-t py-2 pr-2 pl-6">
                <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm text-muted">{breakLine({ ...e, reason: undefined })}</span>
                {e.reason && shown && !into && (
                  <span className="flex items-center gap-2">
                    <span className="text-label leading-label text-muted">Show reason</span>
                    <Switch label={`Show the reason for ${e.title}`} hideLabel checked={!!eff?.showReason} onChange={(on) => a.place(roleKey, { showReason: on || undefined })} />
                  </span>
                )}
                {!shown && <StatusTag tone="neutral">Left out</StatusTag>}
                <Menu label={`${e.title} on resumes`} items={placement} />
              </li>
            );
          const c = titleChoices(t, e, titles);
          const titleItems: MenuEntry[] = titled
            ? [
                { group: `Title on resumes · ${e.employer}` },
                { label: c.official, hint: "Official title", checked: c.mode === "official", onSelect: () => t.title(roleKey, { title: "official" }) },
                ...c.candidates.map((x, i) => ({ label: x.text, hint: x.from, checked: c.mode === "translated" && c.at === i, onSelect: () => t.title(roleKey, { title: "translated", translated: x.text, source: x.source }) })),
                ...c.candidates.map((x, i) => ({ label: `${x.text} (${c.official})`, hint: "Both", checked: c.mode === "both" && c.at === i, onSelect: () => t.title(roleKey, { title: "both", translated: x.text, source: x.source }) })),
                { label: "Type a title", icon: "edit", detail: "Opens a field to write the title yourself.", note: "Free", onSelect: () => setTyping({ roleKey, text: t.effOf(roleKey)?.translated ?? "" }) },
                "separator",
              ]
            : [];
          const shownTitle = t.shown.experience.find((x) => x.roleKey === roleKey)?.title ?? (into ? (t.effOf(roleKey)?.translated ?? e.title) : e.title);
          const sourceWord = c.mode === "official" ? "official title" : c.source === "you" ? "your title" : "suggested title";
          return (
            <li key={roleKey} className="flex flex-col border-t">
              <div className="flex items-center gap-2 py-[7px] pr-2 pl-0.5">
                <Checkbox label={`Show ${name(e)}`} hideLabel checked={shown} onChange={(on) => a.place(roleKey, on ? { fold: eff?.fold ?? undefined } : { hidden: true })} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-body-sm leading-body-sm font-medium ${shown ? "text-text" : "text-muted"}`}>{shownTitle}</span>
                  <span className="truncate text-label leading-label text-muted">
                    {e.employer} · {sourceWord}
                  </span>
                </span>
                {into && <StatusTag tone="info">Folded into {into.employer || into.title}</StatusTag>}
                {!shown && <StatusTag tone="neutral">Left out</StatusTag>}
                <Menu label={`${e.employer} on resumes`} items={[...titleItems, ...placement]} trigger={<Button variant="ghost" size="sm" iconOnly icon="expand" aria-label={`Title and fold for ${name(e)}`} />} />
              </div>
              {typing?.roleKey === roleKey && (
                <form
                  className="flex items-center gap-2 pb-2 pl-6"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    if (!typing.text.trim()) return;
                    t.title(roleKey, { title: "translated", translated: typing.text.trim(), source: "you" });
                    setTyping(null);
                  }}
                >
                  <Input aria-label={`Title for ${e.employer}`} autoFocus value={typing.text} onChange={(ev) => setTyping({ roleKey, text: ev.target.value })} onKeyDown={(ev) => ev.key === "Escape" && setTyping(null)} />
                  <Button type="submit" size="sm" disabled={!typing.text.trim()} detail="Shows the role under the title you typed." note="Free · Change it from the same menu">
                    Save
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </Group>
  );
}

function Projects({ id, doc, settings, layout, every }: LayoutInput & { every: boolean }) {
  const setProject = useMutation(api.resume.setProject);
  const setDefault = useMutation(api.resume.setProjectPresentation);
  const projects = doc.projects ?? [];
  if (!projects.length) return null;
  const outOf = (l: ResumeLayout | null) => new Set((l?.projects ?? []).filter((p) => p.hidden).map((p) => p.projectKey));
  const out = every ? outOf(settings) : outOf(mergeLayout(settings, layout));
  const own = !every && (layout?.projects ?? []).some((p) => p.hidden !== undefined && p.hidden !== outOf(settings).has(p.projectKey));
  const set = (projectKey: string, hidden: boolean | null) => void (every ? setDefault({ projectKey, hidden: !!hidden }) : setProject({ id, projectKey, hidden })).catch(failed);
  const shown = projects.filter((p) => !out.has(p.projectKey));
  return (
    <Group label="Projects">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body-sm leading-body-sm text-text">{shown.length ? shown.map((p) => p.name).join(", ") : "None on this resume"}</span>
          {own && <Inherit own onReset={() => projects.forEach((p) => set(p.projectKey, null))} />}
        </span>
        <Menu
          label="Choose projects"
          items={projects.map((p) => ({ label: p.name, checked: !out.has(p.projectKey), onSelect: () => set(p.projectKey, !out.has(p.projectKey)) }))}
          trigger={<Button variant="outline" size="sm">Choose</Button>}
        />
      </div>
    </Group>
  );
}

function Skills({ id, doc, settings, layout, every }: LayoutInput & { every: boolean }) {
  const setSkill = useMutation(api.resume.setSkill);
  const setDefault = useMutation(api.resume.setSkillPresentation);
  const groups = doc.skills.filter((g) => g.keys?.length);
  if (!groups.length) return null;
  const outOf = (l: ResumeLayout | null) => new Set((l?.skills ?? []).filter((k) => k.hidden).map((k) => k.key));
  const out = every ? outOf(settings) : outOf(mergeLayout(settings, layout));
  const keys = groups.flatMap((g) => g.keys ?? []);
  const own = !every && (layout?.skills ?? []).some((k) => k.hidden !== undefined && k.hidden !== outOf(settings).has(k.key));
  const set = (key: string, hidden: boolean | null) => void (every ? setDefault({ key: key as Id<"items">, hidden: !!hidden }) : setSkill({ id, key, hidden })).catch(failed);
  return (
    <Group label="Skills">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body-sm leading-body-sm text-text">
            {keys.filter((k) => !out.has(k)).length} of {keys.length} {every ? "on every resume" : "on this resume"}
          </span>
          {own && <Inherit own onReset={() => keys.forEach((k) => set(k, null))} />}
        </span>
        <Popover title="Choose skills" showTitle align="end" width={320} trigger={<Button variant="outline" size="sm">Choose skills</Button>}>
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.group} className="flex flex-col gap-1">
                <span className="text-label leading-label font-medium text-muted">{g.group}</span>
                {g.items.map((item, i) => {
                  const key = g.keys![i];
                  return <Checkbox key={key} label={item} checked={!out.has(key)} onChange={(on) => set(key, !on)} />;
                })}
              </div>
            ))}
          </div>
        </Popover>
      </div>
    </Group>
  );
}
