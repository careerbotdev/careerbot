"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../costs";

// Ask about this role, in the third pane: the conversation kept with the pursuit. Each answer shows what it's built on,
// with Keep (to the pursuit's answers) and Copy; a message that told something new says it went to the record for
// review. ⌘↵ sends.
export function Ask({ pursuitId }: { pursuitId: Id<"pursuits"> }) {
  const data = useQuery(api.ask.conversation, { pursuitId });
  const costs = useQuery(api.estimates.costs, {});
  const ask = useMutation(api.ask.ask);
  const keep = useMutation(api.ask.keep);
  const [text, setText] = useState("");
  if (!data) return null;
  const busy = data.last?.status === "queued" || data.last?.status === "running";
  const send = () => {
    if (busy || !text.trim()) return;
    void ask({ pursuitId, text }).then(
      () => setText(""),
      (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t send it.", icon: "failed" }),
    );
  };
  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex flex-1 flex-col gap-4">
        {!data.messages.length && <Text size="sm" muted>Paste a question from the application, or ask anything about the role.</Text>}
        {data.messages.map((m) =>
          m.from === "you" ? (
            <div key={m.id} className="flex flex-col gap-2 self-end md:ml-10">
              <Text className="rounded-sm border bg-surface px-3 py-2 whitespace-pre-line">{m.text}</Text>
              {m.learned && (
                <div className="flex items-center gap-2 rounded-sm bg-surface px-3 py-2 text-body-sm leading-body-sm text-muted">
                  <Icons.review aria-hidden size={14} />
                  <span className="flex-1">Sent to your Record for review</span>
                  <Link href="/review" className="font-medium text-text hover:underline">
                    Open
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-2">
              <Text className="whitespace-pre-line">{m.text}</Text>
              <div className="flex items-center gap-1">
                {m.factIds.length > 0 && <BuiltOnPeek sources={m.factIds.flatMap((id) => (data.facts[id] ? [{ kind: "fact" as const, text: data.facts[id], source: "Approved fact", approved: true }] : []))} count={m.factIds.length} />}
                <span className="flex-1" />
                {m.kept ? (
                  <StatusTag tone="good" icon="approve">
                    Kept
                  </StatusTag>
                ) : (
                  <Button size="sm" variant="ghost" icon="approve" detail="Saves this answer to the pursuit's Answers." note="Free" onClick={() => void keep({ messageId: m.id })}>
                    Keep
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon="copy" detail="Copies the answer." note="Free" onClick={() => void navigator.clipboard.writeText(m.text).then(() => toast({ message: "Copied the answer", icon: "copy" }))}>
                  Copy
                </Button>
              </div>
            </div>
          ),
        )}
        {busy && (
          <Text size="sm" muted className="flex items-center gap-2">
            <Spinner className="text-steel" /> Writing
          </Text>
        )}
        {!busy && data.last?.status === "failed" && <Text size="sm">The last try failed: {data.last.error}</Text>}
      </div>
      <div
        className="sticky bottom-0 flex flex-col gap-1.5 bg-inherit pt-2 pb-1"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      >
        <Textarea aria-label="Your question" rows={3} value={text} placeholder="Paste an application question, or ask about this role" onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center gap-3">
          <span className="flex-1 text-label leading-label text-muted">Answers you keep go to Answers</span>
          <span className="text-label leading-label text-muted tabular-nums">{aboutUsd(costs?.ask) ?? ""}</span>
          <Button
            size="sm"
            icon="ask"
            keys="⌘↵"
            detail="Answers from your approved record, the resume and the posting."
            note={aboutUsd(costs?.ask) ?? "Uses your AI budget"}
            reason={busy ? "Writing the last answer." : !text.trim() ? "Write a question first." : undefined}
            onClick={send}
          >
            Ask
          </Button>
        </div>
      </div>
    </div>
  );
}
