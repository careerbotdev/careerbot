"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DONE, type Path, REASON_LABELS, type Reminder, STATUS_LABELS, suggestedStep, takesApply, takesOutreach, timelineWords } from "../../../convex/pursuitSteps";
import { Button, buttonLook } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { Icons } from "@/components/icons";
import { DateField } from "@/components/DateField";
import { Input } from "@/components/Field";
import { KeyHint } from "@/components/Kbd";
import { NoteBlock } from "@/components/NoteBlock";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { Snooze } from "../today/Snooze";
import { day } from "./dates";
import { type FollowUp, FollowUpDraft } from "./FollowUp";
import { type Pursuit, reminderTitle } from "./words";

// A pursuit's Overview: its next step (the reminder due, with Snooze and what marks it done; else their own step or
// the one it suggests, which they can change), Choose a path while it's being prepared, the follow-up when one is due
// or waiting to be sent, the interview day, and the timeline. A closed pursuit shows how it ended, its notes and the
// timeline.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// Whether the follow-up belongs on the Overview now: one is due, or a draft is waiting to be sent.
export function showsFollowUp(due: Reminder | undefined, f: FollowUp) {
  if (due?.rule === "followUp" && !due.step) return true;
  const d = f.data;
  return !!d?.draft && !d.sent.some((s) => s.at >= d.draft!.at);
}

// `due`: the reminder due now, if any. `step` off leaves out the next step, for a pane whose header already says it
// (Today), and the follow-up's send actions move to that header. `onPeople` opens its People tab, where there is one.
export function PursuitOverview({ p, f, due, step = true, onPeople }: { p: Pursuit; f: FollowUp; due: Reminder | undefined; step?: boolean; onPeople?: () => void }) {
  const setInterview = useMutation(api.pursuits.setInterview);
  if (p.status === "closed")
    return (
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-1 border-l-2 border-border pl-3.5">
          <Text size="label-caps" muted>
            Closed {day(p.changedAt)}
          </Text>
          <Text className="font-semibold">
            {p.closedReason ? REASON_LABELS[p.closedReason] : STATUS_LABELS.closed}
            {p.reached ? `, after getting as far as ${STATUS_LABELS[p.reached]}` : ""}
          </Text>
        </section>
        <Notes subject={{ kind: "pursuit", id: p.id }} />
        <Timeline p={p} />
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      {step && <NextStep p={p} due={due} f={f} onPeople={onPeople} />}
      {p.status === "preparing" && !!p.resumeId && !!p.postingId && <ChoosePath p={p} onPeople={onPeople} />}
      {showsFollowUp(due, f) && <FollowUpDraft f={f} send={step} />}
      {p.status !== "preparing" && (
        <div className="max-w-80">
          <DateField
            label="Interview"
            value={p.interviewAt}
            placeholder="No interview set"
            hint="A reminder to prepare comes the day before."
            onChange={(date) => void setInterview({ id: p.id, date }).catch((e: unknown) => failed(e, "Couldn’t save that."))}
          />
        </div>
      )}
      <Timeline p={p} />
    </div>
  );
}

// Choose a path: two equal cards, Outreach and Apply, each a check box (both can be on) with what it means and its
// first step. Choosing changes only the steps it suggests; both first steps stay on every pursuit.
function ChoosePath({ p, onPeople }: { p: Pursuit; onPeople?: () => void }) {
  const setPath = useMutation(api.pursuits.setPath);
  const outreach = takesOutreach(p.path);
  const apply = takesApply(p.path);
  const choose = (o: boolean, a: boolean) => {
    const path: Path | null = o && a ? "both" : o ? "outreach" : a ? "apply" : null;
    void setPath({ id: p.id, path }).catch((e: unknown) => failed(e, "Couldn’t save that."));
  };
  const href = p.applyUrl ?? p.url;
  const card = "flex flex-col gap-3 rounded-sm border border-border p-4";
  return (
    <section aria-label="Path" className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className={card}>
          <Checkbox label="Outreach" checked={outreach} onChange={(on) => choose(on, apply)} description="Write to the hiring manager, someone on the team or a recruiter. CareerBot finds them and drafts an outreach message from your record; you send it from your own email." />
          {onPeople && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button size="sm" icon="people" detail={`Shows people at ${p.company} to write to.`} note="Finding is free · an email is 1 credit" onClick={onPeople}>
                Find contacts
              </Button>
            </div>
          )}
        </div>
        <div className={card}>
          <Checkbox label="Apply" checked={apply} onChange={(on) => choose(outreach, on)} description="Send your tailored resume and letter through the posting, then mark it Applied. CareerBot keeps a copy of exactly what you sent." />
          {href && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={href} target="_blank" rel="noreferrer" className={buttonLook("secondary", "", "sm")}>
                <Icons.openElsewhere aria-hidden />
                Open the posting
              </a>
            </div>
          )}
        </div>
      </div>
      <Text size="sm" muted>
        Doing both is common. Most people only apply and wait; a short message to the hiring manager gets you noticed.
      </Text>
    </section>
  );
}

// The next step, beside a caution rule while a reminder is due: its words, Snooze, and what marks it done (for a
// follow-up, sending it does; for the next contact, writing to them on People; after three contacts with no reply,
// applying or Close · No response). Otherwise their own step or the suggested one, with Change.
function NextStep({ p, due, f, onPeople }: { p: Pursuit; due: Reminder | undefined; f: FollowUp; onPeople?: () => void }) {
  const done = useMutation(api.pursuits.done);
  const setStatus = useMutation(api.pursuits.setStatus);
  const setNextStep = useMutation(api.pursuits.setNextStep);
  const [editing, setEditing] = useState<string | null>(null);
  const suggested = suggestedStep({
    status: p.status,
    // With no open role there's nothing to tailor: its direction's resume goes with the message.
    hasResume: !!p.resumeId || !p.postingId,
    hasLetter: p.hasLetter,
    path: p.path,
    contacted: p.contactedAt !== null,
    applied: p.appliedAt !== null,
    hasContacts: p.outreach.hasContacts,
    to: p.outreach.to,
  });
  const own = p.nextStep ?? suggested;
  const title = due ? reminderTitle(due, { company: p.company, canApply: !!p.postingId && p.appliedAt === null }, f.data?.to?.name) : own;
  const href = p.applyUrl ?? p.url;
  const save = () => {
    if (editing === null) return;
    void setNextStep({ id: p.id, text: editing }).then(() => setEditing(null), (e: unknown) => failed(e, "Couldn’t save that."));
  };
  if (editing !== null)
    return (
      <div
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setEditing(null);
          } else if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      >
        <Input
          autoFocus
          aria-label="Next step"
          value={editing}
          placeholder={suggested ?? "What’s next"}
          onChange={(e) => setEditing(e.target.value)}
          suffix={
            <span className="flex items-center gap-1.5 pl-0.5">
              <KeyHint keys="↵" onClick={save}>Save</KeyHint>
              <KeyHint keys="Esc" onClick={() => setEditing(null)}>Cancel</KeyHint>
            </span>
          }
        />
      </div>
    );
  if (!title) return null;
  return (
    <section className={`flex items-start gap-4 border-l-2 pl-3.5 ${due ? "border-caution" : "border-border"}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text size="label-caps" muted>
          Next step
        </Text>
        <Text className="font-semibold">{title}</Text>
        {due && <Text size="sm" muted>{due.text}.</Text>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {due && <Snooze pursuitId={p.id} rule={due.rule} size="sm" />}
        {due && due.rule !== "followUp" && (
          <Button size="sm" detail="Marks it done on the timeline." note="Free" onClick={() => void done({ id: p.id, rule: due.rule }).catch((e: unknown) => failed(e, "Couldn’t save that."))}>
            {DONE[due.rule].label}
          </Button>
        )}
        {due?.step === "nextContact" && onPeople && (
          <Button size="sm" icon="people" detail="Shows your contacts, to write to the next one." note="Free" onClick={onPeople}>
            People
          </Button>
        )}
        {due?.step === "noReply" && p.appliedAt === null && href && (
          <a href={href} target="_blank" rel="noreferrer" className={buttonLook("secondary", "", "sm")}>
            <Icons.openElsewhere aria-hidden />
            Apply
          </a>
        )}
        {due?.step === "noReply" && (
          <Button
            size="sm"
            detail="Closes the pursuit as No response."
            note="Free · Undo with U"
            onClick={() =>
              void setStatus({ id: p.id, status: "closed", reason: "noResponse" }).then(
                () => toast({ message: `${p.company}: Closed · No response`, icon: "done", action: { label: "Undo", key: "U", run: () => void setStatus({ id: p.id, status: p.status }) } }),
                (e: unknown) => failed(e, "Couldn’t save that."),
              )
            }
          >
            Close · No response
          </Button>
        )}
        {!due && (
          <Button size="sm" variant="ghost" icon="edit" detail="Write your own next step; clear it to go back to the suggested one." note="Free" onClick={() => setEditing(p.nextStep ?? "")}>
            Change
          </Button>
        )}
      </div>
    </section>
  );
}

// Their notes, dated: on a pursuit (adding one goes on its timeline), or on a role not started yet.
export function Notes({ subject, heading = true }: { subject: { kind: "pursuit"; id: Id<"pursuits"> } | { kind: "posting"; id: Id<"postings"> }; heading?: boolean }) {
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const edit = useMutation(api.notes.edit);
  const remove = useMutation(api.notes.remove);
  return (
    <NoteBlock
      heading={heading}
      notes={notes ?? []}
      onAdd={(text) => void add({ subject, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onEdit={(id, text) => void edit({ id: id as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onDelete={(id) => void remove({ id: id as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
    />
  );
}

// What happened, newest first, dated.
export function Timeline({ p }: { p: Pursuit }) {
  return (
    <section aria-label="Timeline" className="flex flex-col gap-2">
      <Text size="label">Timeline</Text>
      <ol className="flex flex-col gap-1.5">
        {p.timeline.map((e, i) => (
          <li key={i} className="flex gap-4 text-body-sm leading-body-sm">
            <span className="w-14 shrink-0 text-muted tabular-nums">{day(e.at)}</span>
            <span className="min-w-0 text-text">{timelineWords(e, day)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
