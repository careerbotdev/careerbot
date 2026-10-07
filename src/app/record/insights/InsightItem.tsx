"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BuiltOnChip } from "@/components/BuiltOn";
import { Button, type ButtonSize, buttonLook } from "@/components/Button";
import { Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import { Properties, Property } from "@/components/Properties";
import { ReasonField, type ReasonResult } from "@/components/ReasonField";
import { StatusTag } from "@/components/StatusTag";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { type ItemNav, ItemTop, onItemKey } from "../../pursuits/third";
import { useBar } from "../../shell/ShellContext";
import { changeOf, claimOf, day, EXPLAIN, type Insight, INSIGHT_REASONS, type Owners, placeOf, plural } from "./words";

// One insight: its claim, what it's built on and whether it's approved in their wording; Edit (E), Undo approval and
// Reject (R, with why); the rest of its words, the facts it's built on (each opens where it lives; Show with story
// quotes opens them beside with the words they were read from), their notes, and its details: where it's used, the
// directions that share its facts, the roles it draws on and its history. A rejected one shows why (the reason can be
// changed) and goes back to Review from here.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// A rejection held while its reason is asked for: `done` saves it with the reason, `cancel` drops it unsaved.
export type Rejecting = { open: boolean; start: () => void; done: (result: ReasonResult) => void; cancel: () => void };

export function InsightItem({
  insight: i,
  owners,
  nav,
  small,
  peek,
  onPeek,
  lit,
  onLight,
  rejecting,
  editAsked,
}: {
  insight: Insight;
  owners: Owners;
  nav: ItemNav;
  small: boolean;
  peek: boolean;
  onPeek: (open: boolean) => void;
  lit: string | null;
  onLight: (id: string | null) => void;
  rejecting: Rejecting;
  // Counts up each time Edit is asked for from elsewhere (⌘K).
  editAsked: number;
}) {
  const review = useMutation(api.extract.review);
  const edit = useMutation(api.extract.edit);
  const revert = useMutation(api.extract.revertWording);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(i.data.text);
  const [reasonAgain, setReasonAgain] = useState(false);
  const [seenAsk, setSeenAsk] = useState(editAsked);
  if (editAsked !== seenAsk) {
    setSeenAsk(editAsked);
    if (i.status === "approved") {
      setDraft(i.data.text);
      setEditing(true);
    }
  }
  const status = rejecting.open ? "rejected" : i.status;
  const { claim, rest } = claimOf(i.data.text);
  const reason = i.data.rejectedBecause ?? null;

  const startEdit = () => {
    setDraft(i.data.text);
    setEditing(true);
  };
  const save = () => {
    const text = draft.trim();
    setEditing(false);
    if (!text || text === i.data.text) return;
    void edit({ id: i.id, text }).then(
      () => toast({ message: "Insight saved in your wording", icon: "edit", action: { label: "Undo", key: "U", run: () => void revert({ id: i.id }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const undoApproval = () =>
    void review({ id: i.id, status: "proposed" }).then(
      () => toast({ message: "Insight moved back to Review", icon: "undo", action: { label: "Undo", key: "U", run: () => void review({ id: i.id, status: "approved" }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const moveBack = () =>
    void review({ id: i.id, status: "proposed" }).then(
      () => toast({ message: "Insight moved back to Review", icon: "undo", action: { label: "Undo", key: "U", run: () => void review({ id: i.id, status: "rejected", note: reason ?? undefined }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const changeReason = ({ reason: next }: ReasonResult) => {
    setReasonAgain(false);
    if (next === undefined || next === reason) return;
    void review({ id: i.id, status: "rejected", note: next }).catch((e: unknown) => failed(e, "Couldn’t save that."));
  };
  const copy = () => void navigator.clipboard.writeText(i.data.text).then(() => toast({ message: "Insight copied", icon: "copy" }));

  const menu: MenuEntry[] = [
    ...(status === "approved"
      ? [
          { label: "Edit", icon: "edit" as const, keys: "E", onSelect: startEdit, ...EXPLAIN.edit },
          { label: "Undo approval", icon: "undo" as const, onSelect: undoApproval, ...EXPLAIN.undoApproval },
        ]
      : status === "rejected" && !rejecting.open
        ? [
            { label: "Move back to Review", icon: "undo" as const, onSelect: moveBack, ...EXPLAIN.moveBack },
            { label: "Change the reason", icon: "edit" as const, onSelect: () => setReasonAgain(true), detail: "Changes why you rejected it.", note: EXPLAIN.reason.note },
          ]
        : []),
    { label: peek ? "Hide story quotes" : "Show with story quotes", icon: "thirdPane", onSelect: () => onPeek(!peek), ...EXPLAIN.quotes(peek) },
    { label: "Copy the insight", icon: "copy", onSelect: copy, detail: "Copies the insight’s words.", note: "Free" },
    ...(status === "approved" ? ["separator" as const, { label: "Reject", icon: "reject" as const, keys: "R", onSelect: rejecting.start, ...EXPLAIN.reject }] : []),
  ];

  useEffect(() => {
    if (editing || rejecting.open || reasonAgain) return;
    const onKey = onItemKey(status === "approved" ? { e: startEdit, r: rejecting.start } : {});
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Edit, Undo approval and Reject beside the title; on a phone ⋯, Reject and Edit in the bar, Edit in thumb reach.
  const actions = (size: ButtonSize) => {
    const phone = size === "lg";
    const grow = phone ? "flex-1" : "";
    const more = <Menu key="more" label={`More for ${claim}`} title={claim} items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />;
    if (status === "rejected")
      return [
        ...(phone ? [more] : []),
        <Button
          key="back"
          size={size}
          icon="undo"
          className={grow}
          detail={EXPLAIN.moveBack.detail}
          note={EXPLAIN.moveBack.note}
          onClick={() => {
            if (!rejecting.open) return moveBack();
            rejecting.cancel();
            undoApproval();
          }}
        >
          Move back to Review
        </Button>,
      ];
    if (status !== "approved")
      return [
        <Link key="review" href={`/review?kind=insights&item=${i.id}`} className={buttonLook("secondary", grow, size)}>
          Open in Review
        </Link>,
      ];
    const list = [
      <Button key="edit" size={size} icon="edit" keys={phone ? undefined : "E"} className={grow} detail={EXPLAIN.edit.detail} note={EXPLAIN.edit.note} onClick={startEdit}>
        Edit
      </Button>,
      ...(phone
        ? []
        : [
            <Button key="undo" size={size} icon="undo" detail={EXPLAIN.undoApproval.detail} note={EXPLAIN.undoApproval.note} onClick={undoApproval}>
              Undo approval
            </Button>,
          ]),
      <Button key="reject" size={size} icon={phone ? undefined : "reject"} keys={phone ? undefined : "R"} className={grow} detail={EXPLAIN.reject.detail} note={EXPLAIN.reject.note} onClick={rejecting.start}>
        Reject
      </Button>,
    ];
    return phone ? [more, ...list.reverse()] : list;
  };
  useBar(
    small
      ? rejecting.open
        ? { kind: "reason", decision: "Reject", picks: INSIGHT_REASONS, onDone: rejecting.done }
        : reasonAgain
          ? { kind: "reason", decision: "Rejected", picks: INSIGHT_REASONS, onDone: changeReason }
          : editing
            ? {
                kind: "actions",
                actions: (
                  <>
                    <Button size="lg" className="flex-1" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button size="lg" variant="primary" className="flex-1" detail="Keeps the insight in your wording, approved." note="Free · Undo with U" onClick={save}>
                      Save
                    </Button>
                  </>
                ),
              }
            : { kind: "actions", actions: actions("lg") }
      : null,
  );

  const onEditKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setEditing(false);
    }
  };

  const toggle = (
    <Button variant={peek ? "outline" : "ghost"} iconOnly icon="thirdPane" aria-label={peek ? "Hide story quotes" : "Show with story quotes"} aria-pressed={peek} detail={EXPLAIN.quotes(peek).detail} note="Free" onClick={() => onPeek(!peek)} />
  );

  return (
    <div data-tour="record.item" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop nav={nav} small={small} menu={menu} title={claim} actions={small ? undefined : toggle} />
      <div className="flex flex-col gap-4 border-b px-4 pt-2 pb-5 md:px-6 md:pb-6 lg:px-8">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-10 shrink-0 items-center justify-center rounded-sm border bg-subtle text-muted md:flex">
            <Icons.insights size={20} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {editing ? (
              <div className="flex flex-col gap-2">
                <Textarea aria-label="Your wording" autoFocus rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onEditKey} />
                {!small && (
                  <div className="flex items-center gap-2">
                    <Button variant="primary" keys="⌘↵" disabled={!draft.trim()} detail="Keeps the insight in your wording, approved." note="Free · Undo with U" onClick={save}>
                      Save
                    </Button>
                    <Button keys="Esc" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Heading>{claim}</Heading>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <BuiltOnChip count={i.basedOn.length} pressed={peek} onClick={() => onPeek(!peek)} />
              {status === "approved" ? <StatusTag tone="good">Approved</StatusTag> : <StatusTag tone="neutral">{status === "rejected" ? "Rejected" : "Waiting in Review"}</StatusTag>}
              {status === "approved" && i.data.edited && <Text size="sm" muted as="span">Your wording</Text>}
              {status === "rejected" && !rejecting.open && reason && (
                <span className="flex min-w-0 items-center gap-1">
                  <Text size="sm" as="span" className="min-w-0 truncate">
                    {reason}
                  </Text>
                  <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label="Change the reason" detail="Changes why you rejected it." note={EXPLAIN.reason.note} onClick={() => setReasonAgain(true)} />
                </span>
              )}
              {status === "rejected" && !rejecting.open && !reason && (
                <Button variant="ghost" size="sm" detail="Adds why you rejected it." note={EXPLAIN.reason.note} onClick={() => setReasonAgain(true)}>
                  Add why
                </Button>
              )}
            </div>
          </div>
        </div>
        {!small && !editing && <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">{actions("md")}</div>}
      </div>
      <div className="flex flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5.5 px-4 py-5 md:px-6 lg:px-8">
          {!small && rejecting.open && <ReasonField picks={INSIGHT_REASONS} onDone={rejecting.done} />}
          {!small && reasonAgain && <ReasonField picks={INSIGHT_REASONS} defaultValue={reason ?? ""} onDone={changeReason} />}
          {rest && !editing && (
            <Text measure className={status === "rejected" ? "text-muted" : ""}>
              {rest}
            </Text>
          )}
          <BuiltOnFacts insight={i} owners={owners} peek={peek} onPeek={onPeek} lit={lit} onLight={onLight} />
          <div className={peek ? "" : "lg:hidden"}>
            <Details insight={i} owners={owners} status={status} columns={small ? 1 : 2} />
          </div>
          <Notes id={i.id} />
        </div>
        <aside className={`hidden w-65 shrink-0 border-l px-6 py-6 ${peek ? "" : "lg:block"}`}>
          <Details insight={i} owners={owners} status={status} />
        </aside>
      </div>
    </div>
  );
}

// The facts it's built on, each with where it lives (a link that opens it there, also shown on hover), and the way to
// read them with their story quotes beside.
function BuiltOnFacts({ insight: i, owners, peek, onPeek, lit, onLight }: { insight: Insight; owners: Owners; peek: boolean; onPeek: (open: boolean) => void; lit: string | null; onLight: (id: string | null) => void }) {
  return (
    <section aria-label="Built on" data-tour="record.builton" className="flex flex-col">
      <div className="flex items-center gap-2 pb-2">
        <h3 className="text-label leading-label font-medium text-text">Built on</h3>
        <span className="text-label leading-label text-muted tabular-nums">{i.basedOn.length}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" icon="thirdPane" aria-pressed={peek} onClick={() => onPeek(!peek)} detail="Shows each fact beside the insight with the words from your story it was read from." note="Free">
          {peek ? "Hide story quotes" : "Show with story quotes"}
        </Button>
      </div>
      <ul className="flex flex-col">
        {i.basedOn.map((f) => {
          const place = placeOf(f, owners);
          const on = peek && lit === f.id;
          return (
            <li
              key={f.id}
              onMouseEnter={() => onLight(f.id)}
              onMouseLeave={() => onLight(null)}
              className={`group/fact relative flex items-start gap-3 border-t px-2 py-2.5 transition-colors duration-100 hover:bg-subtle ${on ? "bg-subtle shadow-[inset_2px_0_0_var(--color-steel)]" : ""}`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`line-clamp-2 text-body-md leading-body-md ${f.counts ? "text-text" : "text-muted"}`}>{f.text}</span>
                <span className="flex flex-wrap items-center gap-x-2">
                  {place.href ? (
                    <Link href={place.href} className="tap text-body-sm leading-body-sm text-muted underline decoration-border underline-offset-3 hover:text-text hover:decoration-text">
                      {place.label}
                    </Link>
                  ) : (
                    <span className="text-body-sm leading-body-sm text-muted">{place.label}</span>
                  )}
                  {!f.counts && <span className="text-body-sm leading-body-sm text-muted">· No longer in your record</span>}
                </span>
              </span>
              {place.href && (
                <span className="hidden shrink-0 md:group-hover/fact:flex">
                  <Link href={place.href} tabIndex={-1} className={buttonLook("ghost", "", "sm")}>
                    <Icons.goIn aria-hidden />
                    Open in {place.where}
                  </Link>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Where it's used, the directions that share its facts, the roles it draws on, and what happened to it.
function Details({ insight: i, owners, status, columns = 1 }: { insight: Insight; owners: Owners; status: Insight["status"]; columns?: 1 | 2 }) {
  const directions = useQuery(api.directions.list);
  const facts = new Set(i.basedOn.map((f) => f.id));
  const sharing = (directions?.directions ?? [])
    .filter((d) => d.status !== "rejected")
    .map((d) => {
      const ids = new Set([...(d.data.evidence ?? []), ...(d.data.detail?.carriesOver ?? []).flatMap((s) => s.factIds), ...(d.data.detail?.reframe ?? []).flatMap((s) => s.factIds)]);
      return { d, shared: [...ids].filter((id) => facts.has(id)).length };
    })
    .filter((x) => x.shared > 0);
  const places = new Map(i.basedOn.map((f) => placeOf(f, owners)).map((p) => [p.key, p]));
  return (
    <Properties columns={columns}>
      <Property label="Used in">
        {status === "rejected" ? (
          <span className="text-muted">No resume from now on</span>
        ) : i.usedIn.length ? (
          i.usedIn.map((u) => (
            <Line key={String(u.resume)} href={`/resumes?resume=${u.resume}`}>
              {`${u.name ? `${u.name} resume` : "Base resume"} · ${day(u.at)}`}
            </Line>
          ))
        ) : (
          <span className="text-muted">{status === "approved" ? "No resume yet" : "Not in a resume until approved"}</span>
        )}
      </Property>
      {sharing.length > 0 && (
        <Property label="Directions">
          {sharing.map(({ d, shared }) => (
            <span key={d.id} className="flex flex-col">
              <Line href={`/goals/directions?direction=${d.id}`}>{d.data.name}</Line>
              <span className="text-muted">
                {d.status === "approved" ? "Approved" : "Proposed"} · shares {shared} of these facts
              </span>
            </span>
          ))}
        </Property>
      )}
      <Property label={places.size === 1 ? "Role" : "Roles"}>
        {[...places.values()].map((p) =>
          p.href ? (
            <Line key={p.key} href={p.href.replace(/&fact=[^&]+$/, "")}>
              {p.label}
            </Line>
          ) : (
            <span key={p.key}>{p.label}</span>
          ),
        )}
      </Property>
      <Property label="History">
        <History insight={i} />
      </Property>
    </Properties>
  );
}

function Line({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="tap self-start underline decoration-border underline-offset-3 transition-colors duration-100 hover:decoration-text">
      {children}
    </Link>
  );
}

// What happened to it, newest first: written from its facts, edited (what the edit took out and put in), rewritten,
// rejected (with why), moved back to Review.
function History({ insight: i }: { insight: Insight }) {
  const log = i.data.history?.length ? i.data.history : [{ text: i.data.text, how: "read" as const, at: 0 }];
  const entries = log.map((h, n) => {
    const before = log.slice(0, n).findLast((x) => x.how !== "dismissed" && x.how !== "rejected" && x.how !== "unapproved")?.text;
    const change = (h.how === "edit" || h.how === "rewrite") && before ? changeOf(before, h.text) : null;
    const what: Record<typeof h.how, string> = {
      read: `Written from ${plural(i.basedOn.length, "fact")}`,
      edit: "Edited by you",
      rewrite: "Rewritten at your request",
      dismissed: "Kept your wording",
      rejected: "Rejected by you",
      merged: "Merged with another",
      unapproved: "Moved back to Review",
    };
    return { key: n, when: h.at ? day(h.at) : null, words: what[h.how], note: h.how === "rejected" ? (h.note ?? null) : null, change };
  });
  return (
    <ol className="flex flex-col gap-2">
      {entries.reverse().map((e) => (
        <li key={e.key} className="flex flex-col">
          <span>{[e.when, e.words].filter(Boolean).join(" · ")}</span>
          {e.note && <span className="text-muted">{e.note}</span>}
          {e.change?.out && (
            <span className="text-muted">
              Took out <del>{e.change.out}</del>
            </span>
          )}
          {e.change?.in && <span className="text-muted">Put in “{e.change.in}”</span>}
        </li>
      ))}
    </ol>
  );
}

function Notes({ id }: { id: Id<"items"> }) {
  const subject = { kind: "item" as const, id };
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const edit = useMutation(api.notes.edit);
  const remove = useMutation(api.notes.remove);
  return (
    <NoteBlock
      heading
      notes={notes ?? []}
      onAdd={(text) => void add({ subject, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onEdit={(noteId, text) => void edit({ id: noteId as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onDelete={(noteId) => void remove({ id: noteId as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
    />
  );
}
