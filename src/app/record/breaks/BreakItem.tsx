"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button, type ButtonSize } from "@/components/Button";
import { Icons } from "@/components/icons";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import { Properties, Property } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { StatusTag } from "@/components/StatusTag";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { type ItemNav, ItemTop, onItemKey } from "../../pursuits/third";
import { useNow } from "../../clock";
import { useBar } from "../../shell/ShellContext";
import { Facts, openAddFact } from "../facts/Facts";
import { BreakForm, type BreakValues } from "./BreakForm";
import { choiceOf, OnResumes, usePlaceBreak } from "./OnResumes";
import { employerName, fullSpan, jobsOf, lengthOf, neighbours, type Role, type Row, span } from "./words";

// A career break: its months and reason, Edit (E) and Remove (with why, and Undo); how it shows on every resume, with
// the excerpt; its facts and notes; its details beside (under it on smaller screens): dates, length, reason, the roles
// before and after it, and its status. The ⋯ menu adds a fact or a note, undoes the approval, and copies its link. A
// removed break says it's left out of every resume, with Restore.

export const REMOVE_REASONS = ["Not a real break", "Dates are wrong", "Rather not say"];
export const failed = (e: unknown, fallback = "Couldn’t save that.") => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// A break's mark: the pause sign in a square, 28 in a row and 40 at the top of the item.
export function BreakMark({ size }: { size: "row" | "item" }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-sm border bg-subtle text-muted ${size === "row" ? "size-7" : "size-10"}`}>
      <Icons.breaks aria-hidden size={size === "row" ? 16 : 20} />
    </span>
  );
}

// The top of the item and of the add form: the mark, the title, its second line, then what it holds.
export function BreakHead({ title, line, children }: { title: string; line: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-4 border-b px-4 pt-2 pb-6 md:px-8">
      <div className="flex items-start gap-3.5">
        <BreakMark size="item" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Heading>{title}</Heading>
          <Text size="sm" muted>
            {line}
          </Text>
        </div>
      </div>
      {children}
    </div>
  );
}

export function BreakItem({
  role,
  rows,
  nav,
  small,
  large,
  fact,
  onFact,
  onRemoved,
}: {
  role: Role;
  rows: Row[];
  nav: ItemNav;
  small: boolean;
  large: boolean;
  fact: string | null;
  onFact: (factId: string) => void;
  // Keeps the row where it is in the list after Remove or Restore, until they move on.
  onRemoved: (id: string) => void;
}) {
  const review = useMutation(api.extract.review);
  const edit = useMutation(api.breaks.edit);
  const presentation = useQuery(api.resume.presentation);
  const place = usePlaceBreak();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const now = useNow(true);
  const d = role.data;
  const roleKey = role.roleKey ?? String(role.id);
  const approved = role.status === "approved";
  const removed = role.status === "rejected" || removing;
  const title = d.title || "Career break";
  const line = [span(d.start, d.end), d.reason].filter(Boolean).join(" · ");
  const { choice, into } = choiceOf(presentation, roleKey);
  const { before, after } = neighbours(jobsOf(rows), d.start);
  const same = !!before && !!after && employerName(before) === employerName(after);

  const set = (status: "approved" | "proposed" | "rejected", note?: string) => review({ id: role.id, status, ...(note ? { note } : {}) });
  const remove = (reason?: string) => {
    setRemoving(false);
    onRemoved(role.id);
    const was = role.status === "proposed" ? "proposed" : "approved";
    void set("rejected", reason).then(
      () => toast({ message: "Break removed", icon: "setAside", action: { label: "Undo", key: "U", run: () => void set(was).catch(failed) } }),
      (e: unknown) => failed(e),
    );
  };
  const restore = () => {
    // Held, not sent yet: Restore takes the removal back before it's made.
    if (removing) return setRemoving(false);
    onRemoved(role.id);
    void set("approved").then(
      () => toast({ message: "Break restored", icon: "undo", action: { label: "Undo", key: "U", run: () => void set("rejected", d.rejectedBecause ?? undefined).catch(failed) } }),
      (e: unknown) => failed(e),
    );
  };
  const approval = (on: boolean) =>
    void set(on ? "approved" : "proposed").then(
      () => toast({ message: on ? "Break approved" : "Approval undone", icon: on ? "approve" : "undo", action: { label: "Undo", key: "U", run: () => void set(on ? "proposed" : "approved").catch(failed) } }),
      (e: unknown) => failed(e),
    );
  const copyLink = () =>
    void navigator.clipboard.writeText(`${window.location.origin}/record/breaks?break=${role.id}`).then(
      () => toast({ message: "Link copied", icon: "link" }),
      () => failed(null, "Couldn’t copy the link."),
    );
  const addNote = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
  const save = async (v: BreakValues) => {
    try {
      await edit({ id: role.id, start: v.start, end: v.end, reason: v.reason });
      if (approved && (v.choice !== choice || (v.choice === "fold" && v.into !== into))) await place({ roleKey, start: v.start, end: v.end, reason: v.reason || undefined }, v.choice, v.into);
      setEditing(false);
      toast({ message: "Break saved", icon: "approve" });
      return null;
    } catch (e) {
      return e instanceof ConvexError ? String(e.data) : "Couldn’t save the break.";
    }
  };

  const menu: MenuEntry[] = [
    { label: "Edit", icon: "edit", keys: "E", onSelect: () => setEditing(true), detail: "Changes its months or its reason.", note: "Free" },
    { label: "Add a fact", icon: "add", keys: "F", onSelect: openAddFact, detail: "Adds a fact about this break to your record.", note: "Free" },
    { label: "Add a note", icon: "add", keys: "N", onSelect: addNote, detail: "Adds a dated note to this break.", note: "Free" },
    "separator",
    ...(role.status === "approved" ? [{ label: "Undo approval", icon: "undo" as const, onSelect: () => approval(false), detail: "Takes the break back to review, so resumes stop using it.", note: "Free · Undo with U" }] : []),
    ...(role.status === "proposed" ? [{ label: "Approve", icon: "approve" as const, onSelect: () => approval(true), detail: "Puts the break back in your record, so resumes use it.", note: "Free · Undo with U" }] : []),
    removed
      ? { label: "Restore", icon: "undo", onSelect: restore, detail: "Puts the break back in your record, approved.", note: "Free · Undo with U" }
      : { label: "Remove", icon: "setAside", onSelect: () => setRemoving(true), detail: "Takes the break out of your record and every resume, with why if you like.", note: "Free · Undo with U" },
    "separator",
    { label: "Copy link", icon: "link", onSelect: copyLink, detail: "Copies a link to this break.", note: "Free" },
  ];

  useEffect(() => {
    if (editing) return;
    const onKey = onItemKey({ e: () => setEditing(true) });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  // Approve (a break taken back to review), Edit, and Remove or Restore; on a phone, in the bar after ⋯, the other way
  // round, so the main one sits in thumb reach.
  const actions = (size: ButtonSize) => {
    const phone = size === "lg";
    const list = [
      role.status === "proposed" && (
        <Button key="approve" variant="primary" size={size} className={phone ? "flex-1" : ""} icon={phone ? undefined : "approve"} detail="Puts the break back in your record, so resumes use it." note="Free · Undo with U" onClick={() => approval(true)}>
          Approve
        </Button>
      ),
      removed && (
        <Button key="restore" size={size} className={phone ? "flex-1" : ""} icon={phone ? undefined : "undo"} detail="Puts the break back in your record, approved." note="Free · Undo with U" onClick={restore}>
          Restore
        </Button>
      ),
      <Button key="edit" size={size} className={phone ? "flex-1" : ""} icon={phone ? undefined : "edit"} keys={phone ? undefined : "E"} detail="Changes its months or its reason." note="Free" onClick={() => setEditing(true)}>
        Edit
      </Button>,
      !removed && (
        <Button key="remove" size={size} className={phone ? "flex-1" : ""} icon={phone ? undefined : "setAside"} detail="Takes the break out of your record and every resume, with why if you like." note="Free · Undo with U" onClick={() => setRemoving(true)}>
          Remove
        </Button>
      ),
    ].filter(Boolean);
    return phone ? [<Menu key="more" label={`More for ${title}`} title={title} items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />, ...list.reverse()] : list;
  };
  useBar(small && !editing ? (removing ? { kind: "reason", decision: "Remove", picks: REMOVE_REASONS, onDone: ({ reason }) => remove(reason) } : { kind: "actions", actions: actions("lg") }) : null);

  const details = (
    <Properties columns={large ? 1 : 2}>
      <Property label="Dates">{fullSpan(d.start, d.end)}</Property>
      <Property label="Length">{lengthOf(d.start, d.end, now) ?? "Not set"}</Property>
      <Property label="Reason">{d.reason || <span className="text-muted">None given</span>}</Property>
      <Property label="Before">{before ? <RoleLink role={before} full={same} /> : <span className="text-muted">No role before it</span>}</Property>
      <Property label="After">{after ? <RoleLink role={after} full={same} /> : <span className="text-muted">No role after it</span>}</Property>
      <Property label="Status">{role.status === "rejected" ? ["Removed", d.rejectedBecause].filter(Boolean).join(" · ") : approved ? "Approved" : "Not approved"}</Property>
    </Properties>
  );

  return (
    <div data-tour="record.item" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop nav={nav} small={small} menu={menu} title={title} />
      <BreakHead title={title} line={line}>
        {removed && (
          <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">
            <StatusTag tone="neutral">Removed</StatusTag>
            <Text size="sm" muted as="span">
              Left out of every resume
            </Text>
          </div>
        )}
        {!small && !editing && <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">{actions("md")}</div>}
      </BreakHead>
      {editing ? (
        <BreakForm
          roleKey={roleKey}
          small={small}
          initial={{ start: d.start ?? undefined, end: d.end ?? undefined, reason: d.reason ?? "", choice, into }}
          choosable={approved ? undefined : "Approve the break to choose how it shows."}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className={`flex grow ${large ? "flex-row" : "flex-col"}`}>
          <div className="flex min-w-0 flex-1 flex-col gap-[22px] px-4 py-5 md:px-8">
            {removing && !small && <ReasonField picks={REMOVE_REASONS} onDone={({ reason }) => remove(reason)} />}
            {!removed && (
              <OnResumes
                draft={{ roleKey, start: d.start ?? undefined, end: d.end ?? undefined, reason: d.reason }}
                choice={choice}
                into={into}
                disabled={approved ? undefined : "Approve the break to choose how it shows."}
                onChange={(c, side) => void place({ roleKey, start: d.start ?? undefined, end: d.end ?? undefined, reason: d.reason }, c, side ?? into)}
              />
            )}
            <Facts owner={{ roleKey }} open={fact} onOpen={onFact} />
            {!large && details}
            <Notes id={role.id} />
          </div>
          {large && <aside className="w-60 shrink-0 border-l px-6 py-5">{details}</aside>}
        </div>
      )}
    </div>
  );
}

// A role beside the break, opening it in Roles.
// Its employer, or its title too when both sides are at the same one.
function RoleLink({ role, full }: { role: Role; full: boolean }) {
  return (
    <Link
      href={`/record/roles?role=${role.id}`}
      className="tap self-start rounded-sm underline decoration-border decoration-1 underline-offset-3 transition-colors duration-100 hover:decoration-text"
    >
      {full ? [role.data.title, employerName(role)].filter(Boolean).join(", ") : employerName(role)}
    </Link>
  );
}

// Their notes on the break, dated.
function Notes({ id }: { id: Id<"items"> }) {
  const subject = { kind: "item" as const, id };
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const change = useMutation(api.notes.edit);
  const remove = useMutation(api.notes.remove);
  return (
    <section className="flex flex-col gap-3">
      <Text size="label">Notes</Text>
      <NoteBlock
        notes={notes ?? []}
        onAdd={(text) => void add({ subject, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
        onEdit={(noteId, text) => void change({ id: noteId as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
        onDelete={(noteId) => void remove({ id: noteId as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
      />
    </section>
  );
}
