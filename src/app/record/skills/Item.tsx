"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, type ReactNode, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { BuiltOn, BuiltOnPeek, type BuiltOnSource } from "@/components/BuiltOn";
import { Button, buttonLook } from "@/components/Button";
import { Combobox } from "@/components/Combobox";
import { Field, Input } from "@/components/Field";
import { Icons } from "@/components/icons";
import { Menu, type MenuEntry } from "@/components/Menu";
import { Properties, Property } from "@/components/Properties";
import { RadioGroup } from "@/components/RadioGroup";
import { ReasonField } from "@/components/ReasonField";
import { ReviewActions, type ReviewAction, ReviewCard, ReviewStatement, useReviewKeys } from "@/components/ReviewCard";
import { SegmentedControl } from "@/components/SegmentedControl";
import { StatusTag } from "@/components/StatusTag";
import { Heading, Text } from "@/components/Text";
import { resumeHref } from "../../resumes/words";
import { useBar } from "../../shell/ShellContext";
import { ItemTop, type ItemNav } from "../../pursuits/third";
import { type SkillForm, useSkillActions } from "./actions";
import {
  APART_PICKS,
  APPROVES,
  day,
  EDITS,
  FREE_UNDO,
  KIND_OPTIONS,
  KEEPS_BOTH,
  KINDS,
  leftOutWhile,
  month,
  type OnResume,
  REJECT_PICKS,
  REJECTS,
  REOPENS,
  RESUME_STATE,
  type Skill,
  sourceLine,
  whereShort,
  WHY,
} from "./words";

// One skill, tool or certification open: its name and group, then the decision it waits on (the review card: Approve A,
// Edit E, Reject R with why; or, when it looks like another one, Merge M keeping one wording, or Keep both with why),
// what it rests on, where the record shows it, the resumes that show it (each opens beside it), and what was merged
// into it or kept apart from it. Its details (name, issuer and date for a certification, group, kind, whether resumes
// show it) sit beside it on large screens and under the card elsewhere. The ⋯ menu, right-click on its row and ⌘K
// hold the rest. On a phone the moves go to the bottom bar.

export type ItemProps = {
  s: Skill;
  items: Skill[];
  groups: string[];
  nav: ItemNav;
  // Where it is in the review queue (proposed ones), for the card's "3 of 12".
  position: { index: number; total: number } | null;
  small: boolean;
  large: boolean;
  leftOut: boolean;
  menu: (s: Skill, handlers: { edit: () => void; reject: () => void; keepBoth?: () => void }) => MenuEntry[];
  // After a decision on it: the next one opens.
  onDone: () => void;
  // Opened from a row's Edit: the form shows first; `onEdited` when it closes.
  startEditing?: boolean;
  onEdited?: () => void;
  resume: string | null;
  onResume: (key: string | null) => void;
};

type Why = "reject" | "apart" | null;

export function Item({ s, items, groups, nav, position, small, large, leftOut, menu, onDone, startEditing = false, onEdited, resume, onResume }: ItemProps) {
  const act = useSkillActions();
  const [editing, setEditingState] = useState(startEditing);
  const setEditing = (on: boolean) => {
    setEditingState(on);
    if (!on) onEdited?.();
  };
  const [why, setWhy] = useState<Why>(null);
  const [keep, setKeep] = useState<"this" | "other">("this");
  const words = KINDS[s.kind];
  const other = s.sameAs ? items.find((i) => i.id === s.sameAs!.id) : undefined;
  const proposed = s.status === "proposed";
  const duplicate = proposed && !!s.sameAs;
  const entries = menu(s, { edit: () => setEditing(true), reject: () => setWhy("reject"), keepBoth: duplicate ? () => setWhy("apart") : undefined });

  const approve = () => {
    act.approve([s]);
    onDone();
  };
  const reject = (reason?: string) => {
    setWhy(null);
    act.reject([s], reason);
    onDone();
  };
  const merge = () => {
    act.merge(s, keep);
    onDone();
  };
  const keepBoth = (reason?: string) => {
    setWhy(null);
    act.keepBoth(s, reason);
  };

  useReviewKeys(
    {
      approve: proposed && !duplicate ? approve : undefined,
      edit: s.status !== "rejected" ? () => setEditing(true) : undefined,
      reject: proposed ? () => setWhy(duplicate ? "apart" : "reject") : undefined,
      other: duplicate ? { m: merge } : undefined,
    },
    !editing && !why,
  );

  const moves: ReviewAction[] = duplicate
    ? [
        { label: "Merge", keys: "M", intent: "approve", detail: `One ${words.lower} named ${keep === "this" ? s.name : s.sameAs!.name}, with where both were found; the other is merged into it.`, note: FREE_UNDO, onSelect: merge },
        { label: "Keep both", keys: "R", intent: "reject", detail: KEEPS_BOTH, note: WHY, onSelect: () => setWhy("apart") },
      ]
    : [
        { label: "Approve", keys: "A", intent: "approve", detail: APPROVES(s.kind), note: FREE_UNDO, onSelect: approve },
        { label: "Edit", keys: "E", detail: `Your wording, approved as you write it.`, note: "Free", onSelect: () => setEditing(true) },
        { label: "Reject", keys: "R", intent: "reject", detail: REJECTS(s.kind), note: WHY, onSelect: () => setWhy("reject") },
      ];
  const reasonField = why && (
    <ReasonField decision={why === "apart" ? "Keep both" : "Reject"} picks={why === "apart" ? APART_PICKS : REJECT_PICKS} onDone={({ reason }) => (why === "apart" ? keepBoth(reason) : reject(reason))} />
  );

  useBar(
    small
      ? editing
        ? null
        : why
          ? { kind: "reason", decision: why === "apart" ? "Keep both" : "Reject", picks: why === "apart" ? APART_PICKS : REJECT_PICKS, onDone: ({ reason }) => (why === "apart" ? keepBoth(reason) : reject(reason)) }
          : {
              kind: "actions",
              actions: proposed ? (
                <ReviewActions actions={moves} more={entries} moreLabel={`More for ${s.name}`} />
              ) : (
                <>
                  <Menu label={`More for ${s.name}`} title={s.name} items={entries} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />
                  {s.status === "rejected" ? (
                    <Button size="lg" variant="primary" className="flex-1" icon="undo" detail={REOPENS} note={FREE_UNDO} onClick={() => act.reopen(s)}>
                      Reopen
                    </Button>
                  ) : (
                    <Button size="lg" className="flex-1" icon="edit" detail={EDITS} note="Free" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  )}
                </>
              ),
            }
      : null,
  );

  const builtOn: BuiltOnSource[] = s.facts.map((f) => ({ kind: "fact", text: f.text, source: f.source, approved: true }));
  const line = [s.kind === "certification" ? (s.issuer ?? s.group) : s.group, s.status].filter(Boolean).join(" · ");

  let top: ReactNode = null;
  if (editing) top = <EditForm s={s} groups={groups} small={small} onClose={() => setEditing(false)} />;
  else if (duplicate && other)
    top = (
      <ReviewCard
        kind="Looks like a duplicate"
        context={s.group ?? undefined}
        position={position ?? undefined}
        onNext={() => nav.onMove(1)}
        onPrevious={() => nav.onMove(-1)}
        actions={moves}
        more={entries}
        moreLabel={`More for ${s.name}`}
        footer={reasonField || undefined}
      >
        <RadioGroup
          label="Keep one wording"
          value={keep}
          onChange={setKeep}
          options={[
            { value: "this", label: s.name, description: whereShort(s) || undefined },
            { value: "other", label: other.name, description: whereShort(other) || undefined },
          ]}
        />
        {s.sameAs?.why && (
          <section aria-label="Why" className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-label leading-label font-medium text-text">
              <Icons.builtOn aria-hidden className="text-muted" />
              Why
            </h3>
            <p className="border-l-2 border-steel pl-3 text-body-sm leading-body-sm text-muted">{s.sameAs.why}</p>
          </section>
        )}
      </ReviewCard>
    );
  else if (proposed)
    top = (
      <ReviewCard
        kind={`New ${words.lower}`}
        context={(s.kind === "certification" ? s.sources[0]?.employer : s.group) ?? undefined}
        position={position ?? undefined}
        onNext={() => nav.onMove(1)}
        onPrevious={() => nav.onMove(-1)}
        actions={moves}
        more={entries}
        moreLabel={`More for ${s.name}`}
        footer={reasonField || undefined}
        builtOn={builtOn.length ? <BuiltOn sources={builtOn.slice(0, 2)} count={builtOn.length > 2 ? builtOn.length : undefined} /> : undefined}
      >
        <ReviewStatement>{s.name}</ReviewStatement>
        {s.kind === "certification" && <CertLines s={s} onEdit={() => setEditing(true)} />}
        <Cautions s={s} />
      </ReviewCard>
    );
  else if (s.status === "rejected")
    top = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag tone="neutral">Rejected</StatusTag>
          {s.rejectedBecause && <Text size="sm">{s.rejectedBecause}</Text>}
        </div>
        {!small && (
          <div className="flex items-center gap-2">
            <Button variant="primary" icon="undo" detail={REOPENS} note={FREE_UNDO} onClick={() => act.reopen(s)}>
              Reopen
            </Button>
            <Menu label={`More for ${s.name}`} title={s.name} items={entries} />
          </div>
        )}
      </div>
    );
  else if (s.lowValue || !s.counts) top = <Cautions s={s} />;

  const details = <Details s={s} groups={groups} leftOut={leftOut} inline={!large} columns={large || small ? 1 : 2} onEdit={() => setEditing(true)} onMoved={onDone} />;

  return (
    <div data-tour="record.item" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop nav={nav} small={small} menu={entries} title={s.name} />
      {!(editing && !small) && (
        <div className="flex shrink-0 flex-col gap-3 border-b px-4 pt-2 pb-5 md:px-6 lg:px-8">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border bg-subtle text-muted">
              <KindIcon s={s} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Heading>{s.name}</Heading>
              <Text size="sm" muted>
                {line}
              </Text>
              {!proposed && builtOn.length > 0 && (
                <span className="pt-1.5">
                  <BuiltOnPeek sources={builtOn} onEdit={s.status !== "rejected" ? () => setEditing(true) : undefined} />
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:px-6 lg:px-8">
          {top}
          {!large && !editing && details}
          <From s={s} />
          <OnResumes s={s} leftOut={leftOut} inline={!large} resume={resume} onResume={onResume} />
          <History s={s} />
        </div>
        {large && <aside className="w-[260px] shrink-0 border-l px-6 py-5">{details}</aside>}
      </div>
    </div>
  );
}

function KindIcon({ s }: { s: Skill }) {
  const Icon = Icons[KINDS[s.kind].icon];
  return <Icon size={20} aria-hidden />;
}

// Issuer and Earned inside a certification's card, with a way to add what's missing.
function CertLines({ s, onEdit }: { s: Skill; onEdit: () => void }) {
  const add = (label: string) => (
    <button type="button" onClick={onEdit} className="text-text underline decoration-border decoration-1 underline-offset-3 hover:decoration-text">
      {label}
    </button>
  );
  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-body-sm leading-body-sm">
      <dt className="text-muted">Issuer</dt>
      <dd>{s.issuer ?? <span className="text-muted">Not in your record · {add("Add who issued it")}</span>}</dd>
      <dt className="text-muted">Earned</dt>
      <dd>{s.earned ? month(s.earned) : <span className="text-muted">Not in your record · {add("Add a date")}</span>}</dd>
    </dl>
  );
}

// Too vague to help a resume; or left out while what it came from is rejected.
function Cautions({ s }: { s: Skill }) {
  if (!s.lowValue && s.counts) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {s.lowValue && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag tone="caution">Low value</StatusTag>
          <Text size="sm" className="text-caution-text">
            {s.lowValue}
          </Text>
        </div>
      )}
      {!s.counts && (
        <Text size="sm" muted>
          {leftOutWhile(s)}. It shows again once that’s back in your record.
        </Text>
      )}
    </div>
  );
}

function Section({ title, count, trail, children }: { title: string; count?: number; trail?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col">
      <div className="flex min-h-7 items-center gap-2 pb-2">
        <Text size="label">{title}</Text>
        {count !== undefined && <span className="text-label leading-label text-muted tabular-nums">{count}</span>}
        <span className="flex-1" />
        {trail}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Line({ label, children, trail }: { label?: string; children: ReactNode; trail?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t py-2.5">
      {label && <span className="w-[76px] shrink-0 text-body-sm leading-body-sm font-medium text-muted">{label}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-body-sm leading-body-sm">{children}</div>
      {trail}
    </div>
  );
}

// Where the record shows it: each role and project, with its dates and how many of its facts; each opens in Record.
function From({ s }: { s: Skill }) {
  if (!s.sources.length) return null;
  return (
    <Section title="From" count={s.sources.length}>
      {s.sources.map((x) => (
        <Line key={`${x.kind}:${x.key}`} label={x.kind === "role" ? "Role" : "Project"}>
          <Link
            href={x.kind === "role" ? `/record/roles?role=${encodeURIComponent(x.id ?? x.key)}` : `/record/projects?project=${encodeURIComponent(x.id ?? x.key)}`}
            className={`tap self-start font-medium hover:underline ${x.approved ? "text-text" : "text-muted"}`}
          >
            {x.title}
          </Link>
          <span className="text-muted">
            {sourceLine(x)}
            {!x.approved && " · rejected"}
          </span>
        </Line>
      ))}
    </Section>
  );
}

const SHOW_OPTIONS = [
  { value: "show", label: "Show" },
  { value: "out", label: "Leave out" },
] as const;

// Whether resumes show it, set on the record (each resume can still change it). Approved ones only.
function ShowChoice({ s, leftOut }: { s: Skill; leftOut: boolean }) {
  const act = useSkillActions();
  return (
    <SegmentedControl
      label="On resumes"
      hideLabel
      value={leftOut ? "out" : "show"}
      onChange={(v) => act.setLeftOut([s], v === "out", () => leftOut)}
      options={SHOW_OPTIONS}
    />
  );
}

// The resumes that list it now, each opening beside it; four, then the rest on request.
function OnResumes({ s, leftOut, inline, resume, onResume }: { s: Skill; leftOut: boolean; inline: boolean; resume: string | null; onResume: (key: string | null) => void }) {
  const rows = useQuery(api.skills.onResumes, { id: s.id });
  const [all, setAll] = useState(false);
  if (rows === undefined) return null;
  const shown = all ? rows : rows.slice(0, 4);
  return (
    <Section title="On resumes" count={rows.filter((r) => r.shown).length} trail={inline && s.status === "approved" ? <ShowChoice s={s} leftOut={leftOut} /> : undefined}>
      {rows.length === 0 ? (
        <div className="flex flex-col gap-0.5 border-t py-2.5 text-body-sm leading-body-sm">
          <span className="text-text">Not on a resume yet</span>
          {s.status === "approved" && <span className="text-muted">Resumes written from now on can list it.</span>}
        </div>
      ) : (
        shown.map((r) => (
          <Line key={r.id}>
            <button
              type="button"
              aria-pressed={resume === r.key}
              onClick={() => onResume(resume === r.key ? null : r.key)}
              className={`tap self-start text-left underline decoration-1 underline-offset-3 hover:decoration-text ${resume === r.key ? "decoration-text" : "decoration-border"} ${r.shown ? "text-text" : "text-muted"}`}
            >
              {r.name}
            </button>
            <span className="text-muted">{[day(r.at), r.state ? RESUME_STATE[r.state] : null, r.shown ? null : "Left out here"].filter(Boolean).join(" · ")}</span>
          </Line>
        ))
      )}
      {rows.length > shown.length && (
        <div className="border-t pt-2.5">
          <Button variant="ghost" size="sm" detail="Lists the rest of the resumes that show it." note="Free" onClick={() => setAll(true)}>
            {rows.length - shown.length} more
          </Button>
        </div>
      )}
    </Section>
  );
}

// What was merged into it (Undo merge) and what they kept apart from it (offer the pair again).
function History({ s }: { s: Skill }) {
  const act = useSkillActions();
  if (!s.merged.length && !s.apart.length) return null;
  return (
    <Section title="History">
      {s.merged.map((m) => (
        <Line
          key={m.id}
          trail={
            <Button variant="ghost" size="sm" icon="undo" detail={`Brings ${m.name} back as it was, and this one as it was before.`} note="Free" onClick={() => act.unmerge(m)}>
              Undo merge
            </Button>
          }
        >
          <span>Merged {m.name}</span>
        </Line>
      ))}
      {s.apart.map((a) => (
        <Line
          key={a.id}
          trail={
            <Button variant="ghost" size="sm" icon="undo" detail="Offers the two as the same thing again, to merge or keep both." note="Free" onClick={() => act.reopenPair(s, a)}>
              Offer again
            </Button>
          }
        >
          <span>Kept apart from {a.name}</span>
          {a.reason && <span className="text-muted">{a.reason}</span>}
        </Line>
      ))}
    </Section>
  );
}

// Its details: name (with Edit), issuer and date for a certification, group and kind (filed at once, nothing decided),
// and whether resumes show it. `inline`: under the card, two abreast.
function Details({ s, groups, leftOut, inline, columns, onEdit, onMoved }: { s: Skill; groups: string[]; leftOut: boolean; inline: boolean; columns: 1 | 2; onEdit: () => void; onMoved: () => void }) {
  const act = useSkillActions();
  const editable = s.status !== "rejected";
  return (
    <Properties columns={columns}>
      {!inline && (
        <Property label="Name">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 break-words">{s.name}</span>
            {editable && <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label="Edit" keys="E" detail={EDITS} note="Free" onClick={onEdit} />}
          </span>
        </Property>
      )}
      {s.kind === "certification" && (
        <>
          <Property label="Issuer">
            {s.issuer ?? (
              <button type="button" onClick={onEdit} className="tap self-start underline decoration-border decoration-1 underline-offset-3 hover:decoration-text">
                Add who issued it
              </button>
            )}
          </Property>
          <Property label="Earned">
            {s.earned ? (
              month(s.earned)
            ) : (
              <button type="button" onClick={onEdit} className="tap self-start underline decoration-border decoration-1 underline-offset-3 hover:decoration-text">
                Add a date
              </button>
            )}
          </Property>
        </>
      )}
      <Property label="Group">
        {editable ? <GroupPicker value={s.group} groups={groups} onChange={(g) => act.regroup([s], g)} /> : (s.group ?? "None")}
      </Property>
      {editable && (
        <Property label="Kind">
          <SegmentedControl
            label="Kind"
            hideLabel
            value={s.kind}
            onChange={(k) => {
              onMoved();
              act.rekind(s, k);
            }}
            options={KIND_OPTIONS}
          />
        </Property>
      )}
      {!inline && s.status === "approved" && (
        <Property label="On resumes">
          <ShowChoice s={s} leftOut={leftOut} />
        </Property>
      )}
    </Properties>
  );
}

// A group from the ones in use, or a new one typed in.
export function GroupPicker({ value, groups, onChange, label = "Group" }: { value: string | null; groups: string[]; onChange: (group: string) => void; label?: string }) {
  return (
    <Combobox
      label={label}
      value={value ?? undefined}
      onChange={onChange}
      options={groups.map((g) => ({ value: g, label: g }))}
      placeholder="No group"
      searchPlaceholder="Find or name a group…"
      custom
      addLabel={(typed) => `New group “${typed}”`}
    />
  );
}

// Correcting it in place: name, issuer and date for a certification, group and kind. Saving approves it as written.
// Enter saves, Esc cancels.
function EditForm({ s, groups, small, onClose }: { s: Skill; groups: string[]; small: boolean; onClose: () => void }) {
  const act = useSkillActions();
  const [form, setForm] = useState<SkillForm>({ name: s.name, group: s.group ?? "", kind: s.kind, issuer: s.issuer ?? "", earned: s.earned ?? "" });
  const [error, setError] = useState<{ name?: string; earned?: string }>({});
  const change = (patch: Partial<SkillForm>) => {
    setForm({ ...form, ...patch });
    setError({});
  };
  const cert = form.kind === "certification";
  const label = s.status === "approved" ? "Save" : "Save and approve";
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) return setError({ name: "Give it a name." });
    if (cert && form.earned.trim() && !/^\d{4}-(0[1-9]|1[0-2])$/.test(form.earned.trim())) return setError({ earned: "Write it as YYYY-MM." });
    void act.save(s, form).then((ok) => ok && onClose());
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
  useBar(
    small
      ? {
          kind: "actions",
          actions: (
            <>
              <Button size="lg" onClick={onClose}>
                Cancel
              </Button>
              <Button size="lg" variant="primary" className="flex-1" detail={s.status === "approved" ? "Saves your wording." : "Saves your wording and approves it."} note="Free" onClick={() => submit()}>
                {label}
              </Button>
            </>
          ),
        }
      : null,
  );
  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} aria-label={`Edit ${s.name}`} className="flex flex-col gap-4 border-b pb-6 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <Field label="Name" error={error.name}>
        {(p) => <Input {...p} autoFocus value={form.name} onChange={(e) => change({ name: e.target.value })} />}
      </Field>
      {cert && (
        <Field label="Issuer">
          {(p) => <Input {...p} value={form.issuer} onChange={(e) => change({ issuer: e.target.value })} />}
        </Field>
      )}
      <div className="flex flex-wrap items-start gap-4">
        {cert && (
          <Field label="Earned" hint="Leave it blank if you don’t remember." error={error.earned} className="w-40">
            {(p) => <Input {...p} inputMode="numeric" placeholder="YYYY-MM" value={form.earned} onChange={(e) => change({ earned: e.target.value })} />}
          </Field>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-label leading-label font-medium text-text">Group</span>
          <GroupPicker value={form.group || null} groups={groups} onChange={(group) => change({ group })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label leading-label font-medium text-text">Kind</span>
          <SegmentedControl label="Kind" hideLabel value={form.kind} onChange={(kind) => change({ kind })} options={KIND_OPTIONS} />
        </div>
      </div>
      {!small && (
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" keys="↵" detail={s.status === "approved" ? "Saves your wording." : "Saves your wording and approves it."} note="Free">
            {label}
          </Button>
          <Button type="button" keys="Esc" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}

// A resume beside the item: where it stands, and its skills as they show, this one marked. Opens in Resumes.
export function ResumePreview({ s, r, index, total }: { s: Skill; r: OnResume; index: number; total: number }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Text size="sm" muted>
        Written {day(r.at)} · {index} of {total === 1 ? "1 resume that lists" : `${total} resumes that list`} {s.name}
      </Text>
      <div className="flex flex-col gap-3 rounded-sm border bg-surface p-5">
        <Text size="label">Skills</Text>
        {r.skills.map((g) => (
          <div key={g.group} className="flex flex-col gap-1">
            <span className="text-label leading-label text-muted">{g.group}</span>
            <p className="text-body-sm leading-body-sm text-text">
              {g.items.map((x, n) => (
                <span key={`${x.text}-${n}`}>
                  <span className={x.key === s.id ? `rounded-xs bg-steel-subtle px-0.5 ${r.shown ? "" : "text-muted line-through"}` : ""}>{x.text}</span>
                  {n < g.items.length - 1 && ", "}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
      <Link href={resumeHref(r.key)} className={buttonLook("secondary", "self-start")}>
        Open in Resumes
      </Link>
    </div>
  );
}

// Whether the resume is up to date with the record, for the third pane's header.
export function ResumeTag({ r }: { r: OnResume }) {
  if (!r.state) return <StatusTag tone="neutral">Tailored</StatusTag>;
  return <StatusTag tone={r.state === "upToDate" ? "good" : "caution"}>{RESUME_STATE[r.state]}</StatusTag>;
}
