"use client";

import Link from "next/link";
import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Icons } from "./icons";
import { Kbd } from "./Kbd";
import { Popover } from "./Popover";
import { StatusTag } from "./StatusTag";
import { useSmall } from "./useSmall";

// What something CareerBot wrote rests on: an approved or proposed fact, or a quote from a story or note. `source`
// is the muted line that says where it's from ("Fact · Ironbridge Logistics", "Ironbridge story · written Sep 8"). `href` or `onOpen`
// opens it where it lives.
export type BuiltOnSource = {
  kind: "fact" | "quote";
  text: string;
  source: string;
  approved?: boolean;
  href?: string;
  onOpen?: () => void;
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
// while its peek is open; `open` and `onOpenChange` let the line light up with it.
export function BuiltOnPeek({
  sources,
  count = sources.length,
  onOpenRecord,
  onEdit,
  open,
  onOpenChange,
  align = "start",
}: {
  sources: BuiltOnSource[];
  count?: number;
  onOpenRecord?: () => void;
  onEdit?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
}) {
  const small = useSmall();
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const setOpen = (o: boolean) => {
    setOwn(o);
    onOpenChange?.(o);
  };
  const close = (run?: () => void) => () => {
    setOpen(false);
    run?.();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!onEdit || e.key.toLowerCase() !== "e" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    close(onEdit)();
  };
  const title = `Built on ${count}`;
  return (
    <Popover
      title={title}
      open={isOpen}
      onOpenChange={setOpen}
      align={align}
      width={360}
      trigger={<BuiltOnChip count={count} />}
    >
      <div onKeyDown={onKeyDown} className={small ? "flex flex-col" : "-m-1 flex flex-col"}>
        {!small && (
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <Icons.builtOn aria-hidden="true" />
            <span className="text-label leading-label font-medium text-text">Built on</span>
            <span className="text-label leading-label font-medium text-muted tabular-nums">{count}</span>
            <span className="flex-1" />
            <Kbd>Esc</Kbd>
          </div>
        )}
        <ul className={`flex flex-col ${small ? "" : "p-1.5"}`}>
          {sources.map((s) => (
            <li key={s.text}>
              <SourceLink source={s} onOpen={close(s.onOpen)} />
            </li>
          ))}
        </ul>
        {(onOpenRecord || onEdit) && (
          <div className={`flex shrink-0 items-center gap-2 border-t ${small ? "mt-1 h-12 px-1" : "h-10 px-1"}`}>
            {onOpenRecord && (
              <PeekAction onSelect={close(onOpenRecord)} className="font-medium text-text">
                Open in Record
              </PeekAction>
            )}
            <span className="flex-1" />
            {onEdit && (
              <PeekAction onSelect={close(onEdit)} className="text-muted" keys="E">
                Edit this line
              </PeekAction>
            )}
          </div>
        )}
      </div>
    </Popover>
  );
}

// One source in the peek, as a link to it: its muted source line, then the fact (with Approved when it is) or the
// quote. The open-elsewhere arrow shows on hover and focus.
function SourceLink({ source: s, onOpen }: { source: BuiltOnSource; onOpen: () => void }) {
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
  const look = "group/source flex min-h-11 flex-col justify-center rounded-sm p-2 text-left transition-colors duration-100 hover:bg-subtle focus-visible:bg-subtle dark:hover:bg-hover dark:focus-visible:bg-hover md:min-h-0";
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
