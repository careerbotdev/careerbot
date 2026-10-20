"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { CostAction, CostEstimate } from "@/components/CostEstimate";
import { Textarea } from "@/components/Field";
import { KeyHint } from "@/components/Kbd";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { WriteAgain } from "@/components/WriteAgain";
import { day } from "./dates";
import { aboutUsd } from "../costs";
import type { Pursuit } from "./words";
import { FactChanges } from "../resumes/FactChanges";

// The cover letter: once sent, as it was sent; before that, the newest version, with Write again (with a note on what
// should change), Edit and Copy, and what it's built on.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast({ message: "Copied the cover letter", icon: "copy" }));

export function LetterTab({ p }: { p: Pursuit }) {
  const data = useQuery(api.letters.forPursuit, p.sent ? "skip" : { pursuitId: p.id });
  const costs = useQuery(api.estimates.costs, {});
  const write = useMutation(api.letters.write);
  const edit = useMutation(api.letters.edit);
  const [draft, setDraft] = useState<string | null>(null);
  const [again, setAgain] = useState({ open: false, note: "" });
  if (p.sent)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {p.sent.letter && <StatusTag tone="info">Sent {day(p.sent.at)} · kept as sent</StatusTag>}
          {p.sent.letter && (
            <Button size="sm" variant="ghost" icon="copy" note="Free" detail="Copies the letter as it was sent." onClick={() => copy(p.sent!.letter!)}>
              Copy
            </Button>
          )}
        </div>
        {p.sent.letter ? <Text measure className="whitespace-pre-line">{p.sent.letter}</Text> : <Text size="sm" muted>It was sent without a cover letter.</Text>}
      </div>
    );
  if (!data) return null;
  const busy = data.last?.status === "queued" || data.last?.status === "running";
  const letter = data.versions[0];
  const text = letter?.paragraphs.map((x) => x.text).join("\n\n") ?? "";
  const factIds = [...new Set(letter?.paragraphs.flatMap((x) => x.factIds) ?? [])];
  const save = () => {
    if (!draft?.trim()) return;
    void edit({ pursuitId: p.id, text: draft }).then(() => setDraft(null), (e: unknown) => failed(e, "Couldn’t save it."));
  };
  const amount = aboutUsd(costs?.letter) ?? "Uses your AI budget";
  const detail = "Writes a cover letter for this role from your approved record and the resume tailored to it, with an optional note on what should change. Earlier versions stay.";
  const run = (note?: string) =>
    void write({ pursuitId: p.id, ...(note ? { note } : {}) }).then(
      () => setAgain({ open: false, note: "" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {letter ? (
          <div className="flex min-w-0 items-center gap-3">
            <WriteAgain
              title="Write again"
              subject="Cover letter"
              examples={["Shorter", "Warmer opening", "Lead with results"]}
              line="Written only from your approved record and this posting. Earlier letters stay in its versions."
              amount={amount}
              note={again.note}
              onNote={(note) => setAgain((a) => ({ ...a, note }))}
              open={again.open}
              onOpenChange={(open) => setAgain((a) => ({ ...a, open }))}
              onWrite={run}
              trigger={
                <Button icon="tryAgain" loading={busy} loadingLabel="Writing" detail={detail} note={`${amount}. From your AI budget`}>
                  Write again
                </Button>
              }
            />
            <CostEstimate amount={amount} budget="From your AI budget" />
          </div>
        ) : (
          <CostAction amount={amount} budget="From your AI budget" loading={busy} loadingLabel="Writing" detail={detail} onClick={() => run()}>
            Write a cover letter
          </CostAction>
        )}
        <span className="flex-1" />
        {letter && draft === null && (
          <>
            {factIds.length > 0 && <BuiltOnPeek align="end" sources={factIds.flatMap((id) => (data.facts[id] ? [{ kind: "fact" as const, text: data.facts[id], source: "Approved fact", approved: true }] : []))} onEdit={() => setDraft(text)} />}
            <Button size="sm" variant="ghost" icon="copy" detail="Copies the letter." note="Free" onClick={() => copy(text)}>
              Copy
            </Button>
            <Button size="sm" variant="ghost" icon="edit" detail="Change the words yourself; it's kept as a new version." note="Free" onClick={() => setDraft(text)}>
              Edit
            </Button>
          </>
        )}
      </div>
      {letter && draft === null && <FactChanges target={{ kind: "letter", id: letter.id }} />}
      {!busy && data.last?.status === "failed" && <Text size="sm">The last try failed: {data.last.error}</Text>}
      {draft !== null ? (
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(null);
            }
          }}
        >
          <Textarea
            autoFocus
            aria-label="Your cover letter"
            rows={14}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            count={
              <span className="flex items-center gap-1.5">
                <KeyHint keys="⌘↵" onClick={save}>Save</KeyHint>
                <KeyHint keys="Esc" onClick={() => setDraft(null)}>Cancel</KeyHint>
              </span>
            }
          />
        </div>
      ) : letter ? (
        <>
          <Text size="sm" muted>
            {letter.edited ? "Your wording" : "Written"} {day(letter.at)}
            {letter.note && ` · Asked for “${letter.note}”`}
          </Text>
          <Text measure className="whitespace-pre-line">
            {text}
          </Text>
        </>
      ) : (
        !busy && <Text size="sm" muted>No cover letter yet.</Text>
      )}
    </div>
  );
}
