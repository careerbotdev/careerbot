"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BuiltOn, type BuiltOnSource } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import type { MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import type { ScreenSize } from "@/components/Panes";
import { Properties, Property } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { ReviewActions, ReviewCard, ReviewStatement, useReviewKeys } from "@/components/ReviewCard";
import { ValueTags } from "@/components/ValueTags";
import { useBar } from "../../shell/ShellContext";
import { failed, inlineLink, ItemBody, ItemHead, ItemTop, Notice, type Position, Section, ValueRows } from "../ui";
import { useDirectionActs } from "./acts";
import { DirectionForm } from "./forms";
import { facts } from "./Parts";
import { APPROVE_WORDS, capAll, COPY_LINK_WORDS, type Direction, fromOf, pathWord, REJECT_PICKS, REJECT_WORDS } from "./words";

// A proposed direction (read from their goals, or suggested from their record), as one decision: what it is, its
// titles, industries and positioning, and what it's built on; Approve, Edit or Reject, or add it to a direction it's
// close to. A rejected one shows why, with Restore.

export function ProposedItem({
  d,
  approved,
  size,
  position,
  back,
  onDecided,
}: {
  d: Direction;
  // The approved directions, to add it to.
  approved: Direction[];
  size: ScreenSize;
  position: Position | null;
  back: { label: string; onBack: () => void };
  // After Approve, Reject or Add to: the list stays put and the next proposed one opens.
  onDecided: () => void;
}) {
  const small = size === "small";
  const acts = useDirectionActs();
  const notes = useQuery(api.notes.list, { subject: { kind: "item", id: d.id } });
  const addNote = useMutation(api.notes.add);
  const editNote = useMutation(api.notes.edit);
  const removeNote = useMutation(api.notes.remove);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const rejected = d.status === "rejected";
  const close = approved.find((a) => a.id === d.data.addsTo);

  const approve = () => void acts.approve(d).then(onDecided);
  const reject = (reason?: string) => {
    setRejecting(false);
    void acts.reject(d, reason).then(onDecided);
  };
  const addTo = (into: Direction) => void acts.merge(d, { id: into.id, name: into.data.name }).then(onDecided);

  const actions = rejected
    ? [{ label: "Restore", detail: "Puts it back among the proposed directions.", note: "Free", onSelect: () => acts.restore(d) }]
    : [
        { label: "Approve", keys: "A", intent: "approve" as const, detail: APPROVE_WORDS.detail, note: APPROVE_WORDS.note, onSelect: approve },
        { label: "Edit", keys: "E", detail: "Change its title, what it includes, its fit and what it is. Saving approves it.", note: "Free", onSelect: () => setEditing(true) },
        { label: "Reject", keys: "R", intent: "reject" as const, detail: REJECT_WORDS.detail, note: REJECT_WORDS.note, onSelect: () => setRejecting(true) },
      ];
  const aside = close && !rejected ? { label: `Add to ${close.data.name}`, icon: "switch" as const, detail: `Adds its title and what it includes to ${close.data.name}.`, note: "Free · Undo with U", onSelect: () => addTo(close) } : undefined;
  const menu: MenuEntry[] = [
    ...(rejected ? [] : [{ label: "Merge into…", icon: "switch" as const, ...(approved.length ? { items: approved.map((a) => ({ label: a.data.name, onSelect: () => addTo(a) })) } : { disabled: true, reason: "No approved directions" }) }]),
    { label: "Copy link", icon: "link", detail: COPY_LINK_WORDS.detail, note: COPY_LINK_WORDS.note, onSelect: () => acts.copyLink(d) },
  ];

  useReviewKeys({ approve: rejected ? undefined : approve, edit: rejected ? undefined : () => setEditing(true), reject: rejected ? undefined : () => setRejecting(true) }, !editing && !rejecting);
  useBar(
    small && !editing
      ? rejecting
        ? { kind: "reason", decision: `Reject ${d.data.name}`, picks: REJECT_PICKS, onDone: ({ reason }) => reject(reason) }
        : { kind: "actions", actions: <ReviewActions actions={actions} aside={aside} more={menu} moreLabel={`More for ${d.data.name}`} /> }
      : null,
  );

  const from = fromOf(d);
  const sources: BuiltOnSource[] = d.data.suggested
    ? facts(d.evidence)
    : d.sources.flatMap((s) => s.quotes.map((text) => ({ kind: "quote" as const, text, source: `Goals · version ${s.version}`, href: `/goals?version=${s.version}` })));
  const kind = d.data.suggested ? "Suggested direction" : "From your goals";
  const c = d.data.criteria;
  const rows = [
    ...(c?.titles.length ? [{ label: "Titles", value: <ValueTags items={c.titles} /> }] : d.data.includes?.length ? [{ label: "Includes", value: <ValueTags items={d.data.includes} /> }] : []),
    ...(c?.industries.length ? [{ label: "Industries", value: <ValueTags items={capAll(c.industries)} /> }] : []),
    ...(d.data.detail?.positioning ? [{ label: "Positioning", value: d.data.detail.positioning }] : []),
  ];

  const details = (columns: 1 | 2, className: string) => (
    <Properties columns={columns} className={className}>
      <Property label="Path">{pathWord(d)}</Property>
      {!!d.data.includes?.length && <Property label="Includes">{d.data.includes.join(", ")}</Property>}
      <Property label="From">
        {from.href ? (
          <Link href={from.href} className={`tap self-start ${inlineLink}`}>
            {from.label}
          </Link>
        ) : (
          from.label
        )}
      </Property>
      {close && (
        <Property label="Close to">
          <Link href={`/goals/directions?direction=${close.id}`} className={`tap self-start ${inlineLink}`}>
            {close.data.name}
          </Link>
        </Property>
      )}
    </Properties>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop small={small} position={position} back={back} menu={menu} title={d.data.name} />
      <ItemHead icon="directions" title={d.data.name} line={`${pathWord(d)} · ${rejected ? "rejected" : d.data.suggested ? "suggested" : "from your goals"}`} size={size} />
      <ItemBody size={size} details={details}>
        {rejected && (
          <Notice tone="caution" title="Rejected" actions={<Button size="sm" icon="undo" detail="Puts it back among the proposed directions." note="Free" onClick={() => acts.restore(d)}>Restore</Button>}>
            {d.data.rejectedBecause ?? "No reason given."}
          </Notice>
        )}
        {editing ? (
          <DirectionForm d={d} onDone={() => setEditing(false)} />
        ) : (
          <ReviewCard
            kind={kind}
            context={d.data.suggested ? pathWord(d) : undefined}
            position={position && position.at > 0 ? { index: position.at, total: position.of } : undefined}
            onNext={position ? () => position.onMove(1) : undefined}
            onPrevious={position ? () => position.onMove(-1) : undefined}
            builtOn={sources.length ? <BuiltOn sources={sources.slice(0, 3)} count={sources.length} /> : undefined}
            actions={rejected ? [] : actions}
            aside={aside}
            footer={rejecting && !small ? <ReasonField decision={`Reject ${d.data.name}`} picks={REJECT_PICKS} onDone={({ reason }) => reject(reason)} /> : undefined}
          >
            {d.data.summary && <ReviewStatement>{d.data.summary}</ReviewStatement>}
            {rows.length > 0 && <ValueRows rows={rows} lane="w-24" />}
          </ReviewCard>
        )}
        <Section label="Notes" count={notes?.length || undefined}>
          <NoteBlock
            notes={notes ?? []}
            onAdd={(text) => void addNote({ subject: { kind: "item", id: d.id }, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
            onEdit={(id, text) => void editNote({ id: id as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
            onDelete={(id) => void removeNote({ id: id as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
          />
        </Section>
      </ItemBody>
    </div>
  );
}
