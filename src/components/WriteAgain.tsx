"use client";

import { type KeyboardEvent, type MouseEvent, type ReactElement, useState } from "react";
import { Button } from "./Button";
import { Textarea } from "./Field";
import { Kbd } from "./Kbd";
import { Popover } from "./Popover";
import { useSmall } from "./useSmall";

// Write a document again with a note on what should change: a small popover under its trigger (the sheet on phones)
// with the field (optional), example chips that fill it, a line on what it's written from and what happens to it, the
// cost, Cancel and the action (⌘↵). An empty field writes it again as before. The note is the caller's to hold (`note`,
// `onNote`), so a note from History can be put back in it; open and closed too (`open`, `onOpenChange`).
export function WriteAgain({
  trigger,
  title,
  subject,
  action = title,
  examples,
  line,
  amount,
  note,
  onNote,
  open,
  onOpenChange,
  onWrite,
  align = "start",
}: {
  trigger: ReactElement<Record<string, unknown> & { onClick?: (e: MouseEvent) => void }>;
  // "Write again", "Tailor again"; the action's own label when it differs.
  title: string;
  // What it is for, beside the title ("Cover letter", "For Product Manager, Cold Chain Planning").
  subject?: string;
  action?: string;
  examples: string[];
  line: string;
  amount: string;
  note: string;
  onNote: (note: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWrite: (note: string) => void;
  align?: "start" | "center" | "end";
}) {
  const small = useSmall();
  const [field, setField] = useState<HTMLTextAreaElement | null>(null);
  const write = () => {
    onOpenChange(false);
    onWrite(note.trim());
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      write();
    }
  };
  const pick = (x: string) => {
    onNote(x);
    field?.focus();
  };
  return (
    <Popover title={title} trigger={trigger} open={open} onOpenChange={onOpenChange} align={align} width={406}>
      <div className="flex flex-col">
        {!small && (
          <div className="flex items-center gap-2 border-b px-3 pt-2 pb-2.5">
            <h2 className="text-body-sm leading-body-sm font-medium text-text">{title}</h2>
            {subject && <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm text-muted">{subject}</span>}
            <span className="flex-1" />
            <Kbd>Esc</Kbd>
          </div>
        )}
        <div className={`flex flex-col gap-2.5 ${small ? "px-2 pb-2" : "px-3 py-3"}`}>
          {small && subject && <p className="-mt-1 text-body-sm leading-body-sm text-muted">{subject}</p>}
          <label className="flex flex-col gap-2">
            <span className="text-body-sm leading-body-sm font-medium text-text">
              What should change? <span className="font-normal text-muted">Optional</span>
            </span>
            <Textarea ref={setField} rows={2} autoFocus value={note} maxLength={1000} onChange={(e) => onNote(e.target.value)} onKeyDown={onKey} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {examples.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={note === x}
                onClick={() => pick(x)}
                className={`relative flex items-center rounded-sm border font-medium text-text transition-colors duration-100 ${
                  small ? "h-9 px-2.5 text-body-sm leading-body-sm" : "h-7 px-2 text-label leading-label"
                } ${note === x ? "border-steel bg-steel-subtle" : "border-border bg-surface hover:bg-subtle"}`}
              >
                {x}
              </button>
            ))}
          </div>
          <p className="text-body-sm leading-body-sm text-muted">{line}</p>
        </div>
        <div className={`flex items-center gap-3 ${small ? "px-2 pt-2 pb-1" : "border-t px-3 py-2"}`}>
          <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{amount}</span>
          <span className="flex-1" />
          {!small && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button variant="primary" size={small ? "lg" : "md"} className={small ? "flex-1" : ""} keys={small ? undefined : "⌘↵"} detail={line} note={amount} onClick={write}>
            {action}
          </Button>
        </div>
      </div>
    </Popover>
  );
}
