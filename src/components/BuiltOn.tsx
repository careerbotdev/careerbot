"use client";

import Link from "next/link";
import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { Textarea } from "./Field";
import { Icons } from "./icons";
import { Kbd } from "./Kbd";
import { Popover } from "./Popover";
import { StatusTag } from "./StatusTag";
import { useSmall } from "./useSmall";

// What something CareerBot wrote rests on: an approved or proposed fact, or a quote from a story or note. `source`
// is the muted line that says where it's from ("Fact · Ironbridge Logistics", "Ironbridge story · written Sep 8"). `href` or `onOpen`
// opens it where it lives. `rework`: asks for a new wording of the fact with their comment (a peek offers "Rewrite
// this fact…" for it).
export type BuiltOnSource = {
  kind: "fact" | "quote";
  text: string;
  source: string;
  approved?: boolean;
  href?: string;
  onOpen?: () => void;
  rework?: (note: string) => Promise<unknown>;
};

// A quote with the steel rule beside it and where it's from under it.
export function SourceQuote({ text, source }: { text: string; source: string }) {
  return (
    <blockquote className="flex flex-col gap-1 border-l-2 border-steel pl-3">
      <p className="text-body-sm leading-body-sm text-muted">“{text}”</p>
      <footer className="text-label leading-label text-muted">{source}</footer>
    </blockquote>
  );
}

// The sources block inside a card: the layers mark, "Built on" and a count, then each source. A quote shows in quote
// marks, a fact as it reads.
export function BuiltOn({ sources, count, className = "" }: { sources: BuiltOnSource[]; count?: number; className?: string }) {
  return (
    <section aria-label="Built on" className={`flex flex-col gap-2 ${className}`}>
      <h3 className="flex items-center gap-1.5 text-label leading-label font-medium text-text">
        <Icons.builtOn aria-hidden="true" className="text-muted" />
        Built on
        {count !== undefined && <span className="text-muted tabular-nums">{count}</span>}
      </h3>
      <div className="flex flex-col gap-3">
        {sources.map((s) =>
          s.kind === "quote" ? (
            <SourceQuote key={s.text} text={s.text} source={s.source} />
          ) : (
            <div key={s.text} className="flex flex-col gap-1 border-l-2 border-steel pl-3">
              <p className="text-body-sm leading-body-sm text-text">{s.text}</p>
              <span className="text-label leading-label text-muted">{s.source}</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

// The "Built on 3" chip on its own, for a line whose sources open somewhere other than the peek (Insights opens them in
// its third pane). Quiet at rest, steel on hover, focus, while its peek is open or while `pressed`.
export function BuiltOnChip({ count, pressed, className = "", ...props }: ComponentProps<"button"> & { count: number; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`Built on ${count}: show sources`}
      aria-pressed={pressed}
      {...props}
      className={`relative inline-flex h-5.5 shrink-0 items-center gap-1 rounded-sm bg-subtle px-1.5 text-label leading-label font-medium text-muted transition-colors duration-100 after:absolute after:-inset-[11px] hover:bg-steel-subtle hover:text-text hover:inset-ring hover:inset-ring-steel focus-visible:bg-steel-subtle focus-visible:text-text focus-visible:inset-ring focus-visible:inset-ring-steel aria-pressed:bg-steel-subtle aria-pressed:text-text aria-pressed:inset-ring aria-pressed:inset-ring-steel data-[state=open]:bg-steel-subtle data-[state=open]:text-text data-[state=open]:inset-ring data-[state=open]:inset-ring-steel md:after:inset-0 ${className}`}
    >
      <Icons.builtOn aria-hidden="true" size={12} />
      Built on {count}
    </button>
  );
}

// The chip beside a line ("Built on 3") and the peek it opens: a 360px raised panel on medium screens and up, the
// Sheet on phones. The peek lists each source as a link to where it lives, with the line's own actions under them
// (`onOpenRecord`, and `onEdit` on E). Esc goes back. The chip is quiet at rest and turns steel on hover, focus or
// while its peek is open; `open` and `onOpenChange` let the line light up with it. `line`: the line as it reads where
// it's shown, set apart from the facts under it ("On this resume"), so framing and evidence read side by side. A fact
// with `rework` offers "Rewrite this fact…": a field for what should change, then Ask for a rewrite.
export function BuiltOnPeek({
  sources,
  count = sources.length,
  line,
  reworkCost = "About $0.01",
  onOpenRecord,
  onEdit,
  open,
  onOpenChange,
  align = "start",
}: {
  sources: BuiltOnSource[];
  count?: number;
  line?: string;
  // What a rewrite costs, in words.
  reworkCost?: string;
  onOpenRecord?: () => void;
  onEdit?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
}) {
  const small = useSmall();
  const [own, setOwn] = useState(false);
  // The fact being reworded (its index) and the comment so far.
  const [rewriting, setRewriting] = useState<{ at: number; note: string } | null>(null);
  const isOpen = open ?? own;
  const setOpen = (o: boolean) => {
    setOwn(o);
    if (!o) setRewriting(null);
    onOpenChange?.(o);
  };
  const close = (run?: () => void) => () => {
    setOpen(false);
    run?.();
  };
  const reworkable = sources.flatMap((s, i) => (s.rework ? [i] : []));
  const ask = () => {
    const note = rewriting?.note.trim();
    const rework = rewriting && sources[rewriting.at]?.rework;
    if (!rework || !note) return;
    void rework(note).then(() => setOpen(false));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (rewriting) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ask();
      }
      return;
    }
    if (!onEdit || e.key.toLowerCase() !== "e" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    close(onEdit)();
  };
  const title = `Built on ${count}`;
  return (
    <Popover title={title} open={isOpen} onOpenChange={setOpen} align={align} width={line ? 440 : 360} flip={false} trigger={<BuiltOnChip count={count} />}>
      <div onKeyDown={onKeyDown} className={small ? "flex flex-col" : "-m-1 flex min-h-0 flex-col overflow-y-auto"}>
        {!small && (
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <Icons.builtOn aria-hidden="true" />
            <span className="text-label leading-label font-medium text-text">Built on</span>
            <span className="text-label leading-label font-medium text-muted tabular-nums">{count}</span>
            <span className="flex-1" />
            <Kbd>Esc</Kbd>
          </div>
        )}
        {line && (
          <section aria-label="On this resume" className={`flex flex-col gap-1 ${small ? "pb-2" : "px-3 pt-3 pb-1"}`}>
            <span className="text-label leading-label text-muted">On this resume</span>
            <p className="text-body-sm leading-body-sm text-text">{line}</p>
          </section>
        )}
        <ul className={`flex flex-col ${line ? "gap-1" : ""} ${small ? "" : "p-1.5"}`}>
          {sources.map((s) => (
            <li key={s.text}>
              <SourceLink source={s} onOpen={close(s.onOpen)} panel={!!line} />
            </li>
          ))}
        </ul>
        {rewriting ? (
          <Rewrite
            fact={reworkable.length > 1 ? sources[rewriting.at].text : null}
            note={rewriting.note}
            onNote={(note) => setRewriting({ ...rewriting, note })}
            onAsk={ask}
            onCancel={() => setRewriting(null)}
            small={small}
            cost={reworkCost}
          />
        ) : (
          (onOpenRecord || onEdit || reworkable.length > 0) && (
            <div className={`flex shrink-0 flex-wrap items-center gap-2 border-t ${small ? "mt-1 min-h-12 px-1" : "min-h-10 px-1"}`}>
              {onOpenRecord && (
                <PeekAction onSelect={close(onOpenRecord)} className="font-medium text-text">
                  Open in Record
                </PeekAction>
              )}
              {reworkable.map((i) => (
                <PeekAction key={i} onSelect={() => setRewriting({ at: i, note: "" })} className="text-text">
                  {reworkable.length > 1 ? `Rewrite fact ${reworkable.indexOf(i) + 1}…` : "Rewrite this fact…"}
                </PeekAction>
              ))}
              <span className="flex-1" />
              {onEdit && (
                <PeekAction onSelect={close(onEdit)} className="text-muted" keys="E">
                  Edit this line
                </PeekAction>
              )}
            </div>
          )
        )}
      </div>
    </Popover>
  );
}

// "Rewrite this fact": what should change, what a rewrite does, its cost and Ask for a rewrite (⌘↵).
function Rewrite({ fact, note, onNote, onAsk, onCancel, small, cost }: { fact: string | null; note: string; onNote: (note: string) => void; onAsk: () => void; onCancel: () => void; small: boolean; cost: string }) {
  return (
    <section aria-label="Rewrite this fact" className="flex flex-col border-t">
      <div className={`flex flex-col gap-2 ${small ? "py-3" : "px-3 pt-3 pb-2"}`}>
        <label htmlFor="rewrite-fact" className="flex items-baseline gap-2 text-label leading-label">
          <span className="font-medium text-text">Rewrite this fact</span>
          <span className="text-muted">What should change?</span>
        </label>
        {fact && <p className="line-clamp-2 text-label leading-label text-muted">{fact}</p>}
        <Textarea id="rewrite-fact" autoFocus rows={2} grow={false} value={note} placeholder="Lead with the result" onChange={(e) => onNote(e.target.value)} />
        <p className="text-label leading-label text-muted">The rewrite keeps every number and comes to Review to use or dismiss. The fact stays as it is until you use it.</p>
      </div>
      <div className={`flex shrink-0 items-center gap-2 border-t ${small ? "min-h-12" : "h-11 px-3"}`}>
        <span className="flex-1 text-label leading-label text-muted">{cost}</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          keys="⌘↵"
          disabled={!note.trim()}
          detail="Asks for a new wording of the fact with your comment. It comes to Review > Rewrites; the fact stays as it is until you use it."
          note={`${cost} · Dismiss it in Review`}
          onClick={onAsk}
        >
          Ask for a rewrite
        </Button>
      </div>
    </section>
  );
}

// One source in the peek, as a link to it: its muted source line, then the fact (with Approved when it is) or the
// quote. The open-elsewhere arrow shows on hover and focus. `panel`: set apart on a subtle panel, under the line it's
// beside.
function SourceLink({ source: s, onOpen, panel }: { source: BuiltOnSource; onOpen: () => void; panel?: boolean }) {
  const body: ReactNode =
    s.kind === "quote" ? (
      <span className="flex flex-col gap-1.5">
        <Meta source={s} />
        <span className="border-l-2 border-steel pl-3 text-body-sm leading-body-sm text-muted">“{s.text}”</span>
      </span>
    ) : (
      <span className="flex flex-col gap-1">
        <Meta source={s} />
        <span className="text-body-sm leading-body-sm text-text">{s.text}</span>
      </span>
    );
  const look = `group/source flex min-h-11 flex-col justify-center rounded-sm p-2 text-left transition-colors duration-100 hover:bg-subtle focus-visible:bg-subtle dark:hover:bg-hover dark:focus-visible:bg-hover md:min-h-0 ${panel ? "bg-subtle dark:bg-hover" : ""}`;
  const label = <span className="sr-only">Open </span>;
  if (s.href)
    return (
      <Link href={s.href} onClick={onOpen} className={look}>
        {label}
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onOpen} className={`w-full ${look}`}>
      {label}
      {body}
    </button>
  );
}

function Meta({ source: s }: { source: BuiltOnSource }) {
  return (
    <span className="flex min-h-5 items-center gap-1.5">
      <span className="text-label leading-label text-muted">{s.source}</span>
      <span className="flex-1" />
      {s.approved && <StatusTag tone="good">Approved</StatusTag>}
      <Icons.openElsewhere aria-hidden="true" className="hidden text-text group-hover/source:block group-focus-visible/source:block" />
    </span>
  );
}

function PeekAction({ onSelect, keys, className, children }: { onSelect: () => void; keys?: string; className: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-keyshortcuts={keys}
      className={`flex h-7 items-center gap-2 rounded-sm px-2 text-label leading-label transition-colors duration-100 hover:bg-subtle hover:text-text max-md:h-11 dark:hover:bg-hover ${className}`}
    >
      {children}
      {keys && (
        <span aria-hidden="true" className="hidden md:inline-flex">
          <Kbd>{keys}</Kbd>
        </span>
      )}
    </button>
  );
}
