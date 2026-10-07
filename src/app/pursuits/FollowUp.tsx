"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useState, type KeyboardEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button, type ButtonSize } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { Input, Textarea } from "@/components/Field";
import { KeyHint } from "@/components/Kbd";
import { Select } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../costs";

// The follow-up to a pursuit's contact, when an application goes quiet: written from their approved record, the role,
// the pursuit's timeline and the contact; Copy and open Mail puts it in their own email; Mark as sent keeps it as sent,
// on the timeline, and the next reminder counts from then (Undo with U). Rewrite writes a new version that waits beside
// the draft until they keep it.

export type FollowUpData = FunctionReturnType<typeof api.followUpEmails.forPursuit>;

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
// Words typed in a field or picked in a list aren't keys for the pane.
const typing = (e: globalThis.KeyboardEvent) => !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog]"));

// What the follow-up block and its send actions share: the draft and what can be done with it.
export type FollowUp = {
  pursuitId: Id<"pursuits">;
  data: FollowUpData | undefined;
  // About what writing it costs.
  amount: string;
  write: (contactId?: Id<"contacts">) => void;
  copyAndMail: () => void;
  markSent: () => void;
};

export function useFollowUp(pursuitId: Id<"pursuits">): FollowUp {
  const data = useQuery(api.followUpEmails.forPursuit, { pursuitId });
  const costs = useQuery(api.estimates.costs, {});
  const write = useMutation(api.followUpEmails.write);
  const markSent = useMutation(api.followUpEmails.markSent);
  const undoSent = useMutation(api.followUpEmails.undoSent);
  const amount = aboutUsd(costs?.followUp ?? costs?.outreach) ?? "Uses your AI budget";
  return {
    pursuitId,
    data,
    amount,
    write: (contactId?: Id<"contacts">) => void write({ pursuitId, ...(contactId ? { contactId } : {}) }).catch((e: unknown) => failed(e, "Couldn’t start it.")),
    copyAndMail: () => {
      const d = data?.draft;
      if (!d) return;
      const to = data.to?.email ?? "";
      void navigator.clipboard.writeText(`${d.subject}\n\n${d.text}`).then(() => toast({ message: "Copied the follow-up", icon: "copy" }));
      window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.text)}`;
    },
    markSent: () =>
      void markSent({ pursuitId })
        .then((id) => {
          if (!id) return;
          toast({ message: `Marked as sent${data?.to ? ` to ${data.to.name}` : ""}`, icon: "done", action: { label: "Undo", key: "U", run: () => void undoSent({ id }) } });
        })
        .catch((e: unknown) => failed(e, "Couldn’t save that.")),
  };
}

export const MARK_SENT = { detail: "Records that you sent it; the next reminder counts from today.", note: "Free · Undo with U" };

// Copy and open Mail (Amber) and Mark as sent, wherever the pane puts its actions. Before there's a draft, Write the
// follow-up is the main action instead. `primaryOnly`: Copy and open Mail alone, where Mark as sent sits in ⋯ (a
// pursuit's phone bar, which has no room for both).
export function SendActions({ f, size = "md", small = false, primaryOnly = false }: { f: FollowUp; size?: ButtonSize; small?: boolean; primaryOnly?: boolean }) {
  const d = f.data;
  if (!d) return null;
  if (!d.draft)
    return (
      <CostAction
        amount={f.amount}
        budget="From your AI budget"
        variant="primary"
        size={size}
        className={small ? "flex-1" : ""}
        loading={d.writing}
        loadingLabel="Writing"
        detail={`Writes a short follow-up${d.to ? ` to ${d.to.name}` : ""} from your approved record, this role and how it has gone.`}
        onClick={() => f.write()}
      >
        Write the follow-up
      </CostAction>
    );
  return (
    <>
      <Button
        variant="primary"
        icon={small ? undefined : "email"}
        size={size}
        className={small ? "flex-1" : ""}
        detail="Copies the follow-up and opens it in your email, addressed and ready to send."
        note="Free"
        onClick={f.copyAndMail}
      >
        Copy and open Mail
      </Button>
      {!primaryOnly && (
        <Button size={size} detail={MARK_SENT.detail} note={MARK_SENT.note} onClick={f.markSent}>
          Mark as sent
        </Button>
      )}
    </>
  );
}

// The draft: who it's to, then the message with what it's built on, Rewrite and Edit (E). `send`: the send actions
// under it (the pursuit's Overview); off where the pane's header holds them (Today).
export function FollowUpDraft({ f, send = false }: { f: FollowUp; send?: boolean }) {
  const d = f.data;
  const [editing, setEditing] = useState(false);
  const edit = useMutation(api.followUpEmails.edit);
  const keep = useMutation(api.followUpEmails.keep);
  const discard = useMutation(api.followUpEmails.discard);
  const hasDraft = !!d?.draft;

  useEffect(() => {
    if (!hasDraft) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e)) return;
      e.preventDefault();
      setEditing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasDraft]);

  if (!d) return null;
  const pursuitId = f.pursuitId;
  const sources = (ids: string[]) => ids.flatMap((id) => (d.facts[id] ? [{ kind: "fact" as const, text: d.facts[id], source: "Approved fact", approved: true }] : []));
  const shown = d.rewrite ?? d.draft;

  return (
    <section aria-label="Follow-up" className="flex max-w-[640px] flex-col gap-3">
      <To d={d} onChoose={(id) => f.write(id)} />
      {shown ? (
        <div className="flex flex-col rounded-sm border">
          {editing && d.draft ? (
            <Editor
              subject={d.draft.subject}
              text={d.draft.text}
              onCancel={() => setEditing(false)}
              onSave={(subject, text) => {
                setEditing(false);
                void edit({ pursuitId, subject, text }).catch((e: unknown) => failed(e, "Couldn’t save it."));
              }}
            />
          ) : (
            <div className="flex flex-col gap-3 px-4 pt-4 pb-3 md:px-5">
              <div className="flex items-start gap-3">
                <Text className="min-w-0 flex-1 font-semibold">{shown.subject}</Text>
                {d.rewrite && <StatusTag tone="caution">New version</StatusTag>}
                {shown.factIds.length > 0 && <BuiltOnPeek sources={sources(shown.factIds)} align="end" onEdit={d.rewrite ? undefined : () => setEditing(true)} />}
              </div>
              <Text measure className="whitespace-pre-line">
                {shown.text}
              </Text>
            </div>
          )}
          {!editing && (
            <div className="mx-4 flex flex-wrap items-center gap-2 border-t py-2 md:mx-5">
              {d.rewrite ? (
                <>
                  <Button size="sm" variant="ghost" icon="approve" detail="Keeps the new version as your draft." note="Free" onClick={() => void keep({ pursuitId })}>
                    Keep the new one
                  </Button>
                  <Button size="sm" variant="ghost" icon="undo" detail="Drops the new version; your draft stays as it was." note="Free" onClick={() => void discard({ pursuitId })}>
                    Keep the one I had
                  </Button>
                </>
              ) : (
                <>
                  <CostAction
                    amount={f.amount}
                    budget="From your AI budget"
                    variant="ghost"
                    size="sm"
                    icon="tryAgain"
                    loading={d.writing}
                    loadingLabel="Writing"
                    detail="Writes the follow-up again from your record and this role. Your current draft stays until you keep the new one."
                    onClick={() => f.write()}
                  >
                    Rewrite
                  </CostAction>
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" icon="edit" keys="E" detail="Change the words yourself." note="Free" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                </>
              )}
            </div>
          )}
          {!d.writing && d.failed && (
            <Text size="sm" className="px-4 pb-3 md:px-5">
              The last try failed: {d.failed}
            </Text>
          )}
        </div>
      ) : (
        !send && <Text size="sm" muted>{d.writing ? "Writing the follow-up…" : "No follow-up written yet."}</Text>
      )}
      {send && (
        <div className="flex flex-wrap items-center gap-2">
          <SendActions f={f} />
        </div>
      )}
    </section>
  );
}

// Who it goes to: the person, their title and email; a choice when more than one person's email was revealed.
function To({ d, onChoose }: { d: FollowUpData; onChoose: (id: Id<"contacts">) => void }) {
  const to = d.to;
  return (
    <div className="flex items-center gap-3">
      <Text size="sm" muted className="w-7 shrink-0">
        To
      </Text>
      {to ? (
        <>
          <Avatar name={to.name} size={28} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Text className="truncate">{to.name}</Text>
            <Text size="sm" muted className="truncate">
              {[to.title, to.email].filter(Boolean).join(" · ")}
            </Text>
          </div>
        </>
      ) : (
        <Text size="sm" muted className="flex-1">
          The hiring team · reveal someone’s email under People to write to them
        </Text>
      )}
      {d.contacts.length > 1 && (
        <Select
          label="Write to"
          value={to?.id}
          onChange={(id) => onChoose(id as Id<"contacts">)}
          options={d.contacts.map((c) => ({ value: c.id as string, label: c.name }))}
          className="min-w-0 md:min-w-36"
        />
      )}
    </div>
  );
}

// Their own wording: the subject and the message; ⌘↵ saves, Esc cancels.
function Editor({ subject: s, text: t, onSave, onCancel }: { subject: string; text: string; onSave: (subject: string, text: string) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState(s);
  const [text, setText] = useState(t);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (text.trim()) onSave(subject.trim() || s, text.trim());
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <div className="flex flex-col gap-2 p-3" onKeyDown={onKeyDown}>
      <Input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <Textarea
        autoFocus
        aria-label="Follow-up"
        rows={9}
        value={text}
        onChange={(e) => setText(e.target.value)}
        count={
          <span className="flex items-center gap-1.5">
            <KeyHint keys="⌘↵" onClick={() => text.trim() && onSave(subject.trim() || s, text.trim())}>
              Save
            </KeyHint>
            <KeyHint keys="Esc" onClick={onCancel}>
              Cancel
            </KeyHint>
          </span>
        }
      />
    </div>
  );
}
