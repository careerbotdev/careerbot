"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { Textarea } from "@/components/Field";

// A fact's words in place (Edit, Add a fact) or a note to rewrite it with (Add context or rewrite): ↵ saves, Esc
// cancels, Shift+↵ starts a new line. `cost`: the save spends ("About $0.01"). `optional`: saving with nothing written
// is fine (a rewrite without a note).
export function WordsField({
  label,
  initial = "",
  placeholder,
  save,
  detail,
  note,
  cost,
  optional = false,
  onSave,
  onCancel,
}: {
  label: string;
  initial?: string;
  placeholder?: string;
  save: string;
  detail: string;
  note?: string;
  cost?: string;
  optional?: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ready = optional || !!text.trim();
  const submit = () => ready && onSave(text.trim());
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  const button = { variant: "primary" as const, size: "sm" as const, keys: "↵", detail, reason: ready ? undefined : "Write it first", onClick: submit, children: save };
  return (
    <div className="flex w-full flex-col gap-2" onKeyDown={onKeyDown}>
      <Textarea
        aria-label={label}
        rows={2}
        autoFocus
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      />
      <div className="flex flex-wrap items-center gap-2">
        {cost ? <CostAction amount={cost} {...button} /> : <Button {...button} note={note} />}
        <Button variant="ghost" size="sm" keys="Esc" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
