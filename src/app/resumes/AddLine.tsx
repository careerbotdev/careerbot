"use client";

import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { Icons } from "@/components/icons";
import { Kbd } from "@/components/Kbd";
import { Popover } from "@/components/Popover";
import { Sheet } from "@/components/Sheet";
import { Spinner } from "@/components/Spinner";
import { plural } from "./words";

// Add a line, under a role or project on a resume: its approved facts the resume doesn't use, one highlighted at a time
// with its two actions. Add as written puts the fact on as it reads in the record (free); Write it for this resume
// writes one line from it in the resume's voice (paid, with its estimate). A popover on medium screens and up, a sheet
// on phones; `room` (the length note) sits under the list.

export type AddLineProps = {
  where: string;
  facts: { id: string; text: string }[];
  room: string | null;
  cost: string;
  small: boolean;
  onAdd: (factId: string) => void;
  onWrite: (factId: string) => void;
};

const ADD = { detail: "Puts this fact on this resume as it reads in your record.", note: "Free · Undo with U, or Hide the line" };
const WRITE = "Writes one line from this fact in this resume’s voice.";

export function AddLine({ where, facts, room, cost, small, onAdd, onWrite }: AddLineProps) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(0);
  const pick = (run: (id: string) => void, id: string) => {
    setOpen(false);
    run(id);
  };
  const trigger = (
    <button
      type="button"
      onClick={small ? () => setOpen(true) : undefined}
      className="flex min-h-11 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-body-sm leading-body-sm text-muted outline-none hover:bg-subtle hover:text-text focus-visible:ring-1 focus-visible:ring-steel data-[state=open]:bg-subtle data-[state=open]:text-text data-[state=open]:shadow-[inset_0_0_0_1px_var(--color-border)] md:min-h-7"
    >
      <Icons.add aria-hidden size={14} className="shrink-0" />
      <span className="font-medium">Add a line</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">{facts.length} not used</span>
    </button>
  );
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = (on + (e.key === "ArrowDown" ? 1 : -1) + facts.length) % facts.length;
    setOn(next);
    (e.currentTarget.querySelector(`[data-fact="${next}"] button`) as HTMLElement | null)?.focus();
  };
  const list = (
    <ul role="listbox" aria-label={`Approved facts at ${where} not on this resume`} onKeyDown={keys} className="flex min-h-0 flex-col gap-px overflow-y-auto">
      {facts.map((f, i) => (
        <li
          key={f.id}
          role="option"
          aria-selected={i === on}
          data-fact={i}
          onPointerEnter={() => setOn(i)}
          onFocus={() => setOn(i)}
          onClick={() => setOn(i)}
          className={`flex flex-col gap-2 rounded-sm px-2.5 py-2 ${i === on ? "bg-subtle dark:bg-hover" : ""}`}
        >
          <span className="text-body-sm leading-body-sm text-text">{f.text}</span>
          {i === on &&
            (small ? (
              <span className="flex flex-col gap-2">
                <Button variant="outline" size="lg" className="w-full" detail={ADD.detail} note={ADD.note} onClick={() => pick(onAdd, f.id)}>
                  Add as written
                </Button>
                <CostAction variant="outline" size="lg" className="flex-1" amount={cost} budget="From your AI budget" detail={WRITE} onClick={() => pick(onWrite, f.id)}>
                  Write it for this resume
                </CostAction>
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" detail={ADD.detail} note={ADD.note} onClick={() => pick(onAdd, f.id)}>
                  Add as written
                  <Kbd>↵</Kbd>
                </Button>
                <CostAction variant="ghost" size="sm" amount={cost} budget="From your AI budget" detail={WRITE} onClick={() => pick(onWrite, f.id)}>
                  Write it for this resume
                </CostAction>
              </span>
            ))}
        </li>
      ))}
    </ul>
  );
  const note = room && <p className="border-t px-2.5 pt-2 pb-1 text-body-sm leading-body-sm text-caution-text">{room}</p>;
  if (small) {
    return (
      <li className="-mx-1.5 list-none">
        {trigger}
        <Sheet open={open} onOpenChange={setOpen} title="Add a line" description={`${where} · ${plural(facts.length, "approved fact")} not used`}>
          <div className="flex flex-col gap-2">
            {list}
            {note}
          </div>
        </Sheet>
      </li>
    );
  }
  return (
    <li className="list-none">
      <Popover trigger={trigger} title="Add a line" open={open} onOpenChange={setOpen} width={452}>
        <div className="flex min-h-0 flex-col gap-1">
          <div className="flex items-center gap-2 border-b px-2 pt-1.5 pb-2.5">
            <span className="text-body-sm leading-body-sm font-medium text-text">Add a line</span>
            <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm text-muted">
              {where} · {facts.length} not used
            </span>
            <Kbd>Esc</Kbd>
          </div>
          {list}
          {note}
        </div>
      </Popover>
    </li>
  );
}

// A line being written for the resume from a fact, where it will land.
export function WritingLine() {
  return (
    <li className="flex items-center gap-2 rounded-sm bg-subtle px-1.5 py-[3px] text-body-sm leading-body-sm text-muted">
      <span aria-hidden="true">–</span>
      <Spinner />
      Writing a line for this resume from your record
    </li>
  );
}
