"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { Field, Input, Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { Menu } from "@/components/Menu";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { useConfirm } from "../shell/ShellContext";
import { useThird } from "./third";
import type { Pursuit } from "./words";
import { FactChanges } from "../resumes/FactChanges";

// Answers to the application's questions they saved (or kept from Ask), newest first: each with what it's built on,
// Copy, Edit, and Remove (which asks first). Add an answer writes one by hand.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

type Editing = { at?: number; question: string; answer: string };

export function AnswersTab({ p }: { p: Pursuit }) {
  const save = useMutation(api.pursuits.saveAnswer);
  const remove = useMutation(api.pursuits.removeAnswer);
  const ask = useConfirm();
  const { open } = useThird();
  const [editing, setEditing] = useState<Editing | null>(null);
  const submit = () =>
    editing &&
    void save({ id: p.id, ...editing }).then(
      () => setEditing(null),
      (e: unknown) => failed(e, "Couldn’t save it."),
    );
  const editor = editing && (
    <div className="flex flex-col gap-2">
      <Field label="Question">{(props) => <Input {...props} autoFocus value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />}</Field>
      <Field label="Answer">{(props) => <Textarea {...props} rows={6} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />}</Field>
      <div className="flex gap-2">
        <Button variant="primary" detail={editing.at === undefined ? "Saves this question and answer to the pursuit." : "Saves your changes over the answer as it was."} note="Free" onClick={submit}>
          Save
        </Button>
        <Button variant="ghost" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      {p.answers.length > 0 && !p.sent && !editing && <FactChanges target={{ kind: "answers", id: p.id }} />}
      {p.answers.map((a, i) =>
        editing?.at === a.at ? (
          <div key={a.at}>{editor}</div>
        ) : (
          <section key={a.at} className={`flex flex-col gap-2 ${i > 0 ? "border-t pt-4" : ""}`}>
            <Text className="font-semibold">{a.question || "Kept from Ask"}</Text>
            <Text measure className="whitespace-pre-line">
              {a.answer}
            </Text>
            <div className="flex items-center gap-1">
              {a.factIds.length > 0 && (
                <BuiltOnPeek sources={a.factIds.flatMap((id) => (p.facts[id] ? [{ kind: "fact" as const, text: p.facts[id], source: "Approved fact", approved: true }] : []))} count={a.factIds.length} />
              )}
              <span className="flex-1" />
              <Button size="sm" variant="ghost" icon="copy" detail="Copies the answer, to paste into the application." note="Free" onClick={() => void navigator.clipboard.writeText(a.answer).then(() => toast({ message: "Copied the answer", icon: "copy" }))}>
                Copy
              </Button>
              <Button size="sm" variant="ghost" icon="edit" detail="Change the question or the answer." note="Free" onClick={() => setEditing({ at: a.at, question: a.question, answer: a.answer })}>
                Edit
              </Button>
              <Menu
                label={`More for ${a.question || "this answer"}`}
                items={[
                  {
                    label: "Remove",
                    icon: "delete",
                    tone: "danger",
                    detail: "Removes this answer from the pursuit.",
                    note: "Free · Asks first · can’t be undone",
                    onSelect: async () => {
                      if (!(await ask({ title: "Remove this answer?", body: a.question, confirmLabel: "Remove answer" }))) return;
                      void remove({ id: p.id, at: a.at }).catch((e: unknown) => failed(e, "Couldn’t remove it."));
                    },
                  },
                ]}
                trigger={<Button size="sm" variant="ghost" iconOnly icon="more" aria-label="More" />}
              />
            </div>
          </section>
        ),
      )}
      {editing && editing.at === undefined && editor}
      {!p.answers.length && !editing && <Text size="sm" muted>Save answers to the application’s questions here{open ? ", or ask about the role and keep the answer" : ""}.</Text>}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing({ question: "", answer: "" })}
          className="flex h-11 w-full items-center gap-2 rounded-sm border border-dashed border-border px-2 text-left text-body-sm leading-body-sm text-muted transition-colors duration-100 hover:bg-subtle hover:text-text md:h-8"
        >
          <Icons.add aria-hidden="true" />
          Add an answer
        </button>
      )}
    </div>
  );
}
