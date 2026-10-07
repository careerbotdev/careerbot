"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent, type MouseEvent, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Icons, type IconName } from "./icons";
import { Kbd } from "./Kbd";
import { Menu, type MenuEntry } from "./Menu";
import { Tooltip } from "./Tooltip";
import { useSmall } from "./useSmall";

// One move on the card. The first of a kind's actions is its Amber one. `keys` names the key the screen binds (see
// useReviewKeys); `detail` and `note` are the explainer (what it does; what it costs and whether it can be undone).
// `intent` says which swipe runs it on a phone: right runs "approve" (the first action when none says so), left runs
// "reject".
export type ReviewAction = {
  label: string;
  onSelect: () => void;
  keys?: string;
  detail?: ReactNode;
  note?: ReactNode;
  reason?: string;
  loading?: boolean;
  loadingLabel?: string;
  intent?: "approve" | "reject";
};

// The quiet text action at the right of the footer ("Add context", "Add a title").
export type ReviewAside = ReviewAction & { icon?: IconName };

// A kind's moves, the same on the card (medium and up) and in the phone's bottom bar (ReviewActions).
export type ReviewMoves = {
  actions: ReviewAction[];
  aside?: ReviewAside;
  // The ⋯ menu; `moreLabel` names its button ("More for this fact").
  more?: MenuEntry[];
  moreLabel?: string;
};

// Whether the card is laid out for a phone, for the body parts inside it.
const PhoneLayout = createContext(false);

// The one-decision card: what's proposed, what it rests on, and the moves. The header names the kind and where it
// comes from ("New fact · Network Operations Manager, Ironbridge Logistics") with the position ("3 of 12") and K and J to step through; the body
// is the caller's (ReviewStatement, ReviewCompany, ReviewUpdate), then `builtOn` (a BuiltOn block); the footer holds
// the kind's actions, the aside and ⋯. It emits intents and binds no keys (the screen calls useReviewKeys).
// On a phone (below 768, or `phone`) the footer turns into swipe hints, the moves go to the bottom bar as
// ReviewActions, and the card swipes: right runs the approve action, left the reject one. `footer` replaces the
// footer's contents (a reason field while rejecting). `defaultSwipe` starts it dragged that far, for a specimen.
export function ReviewCard({
  kind,
  context,
  position,
  onNext,
  onPrevious,
  children,
  builtOn,
  actions,
  aside,
  more,
  moreLabel,
  footer,
  phone,
  defaultSwipe,
  className = "",
}: ReviewMoves & {
  kind: string;
  context?: string;
  position?: { index: number; total: number };
  onNext?: () => void;
  onPrevious?: () => void;
  children: ReactNode;
  builtOn?: ReactNode;
  footer?: ReactNode;
  phone?: boolean;
  defaultSwipe?: number;
  className?: string;
}) {
  const small = useSmall();
  const onPhone = phone ?? small;
  const approve = actions.find((a) => a.intent === "approve") ?? actions[0];
  const reject = actions.find((a) => a.intent === "reject");
  const { dx, animate, tilt, left, handlers } = useSwipe({
    enabled: onPhone && !footer,
    onRight: approve?.onSelect,
    onLeft: reject?.onSelect,
    initial: defaultSwipe,
  });
  const where = position ? `${position.index} of ${position.total}` : undefined;

  const card = (
    <article
      tabIndex={-1}
      aria-label={[kind, context, where].filter(Boolean).join(", ")}
      {...(onPhone ? handlers : {})}
      style={onPhone ? { translate: `${dx}px 0`, rotate: `${tilt ? Math.max(-4, Math.min(4, dx / 32)) : 0}deg`, transformOrigin: left ? "100% 0" : "0 0" } : undefined}
      className={`relative flex w-full flex-col rounded-sm border bg-surface text-text outline-none ${onPhone ? "touch-pan-y select-none" : ""} ${
        dx ? "opacity-96" : ""
      } ${animate ? "transition-[translate,rotate,opacity] duration-160 ease-out motion-reduce:transition-none" : ""}`}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b pr-3 pl-5">
        <span className="shrink-0 text-body-sm leading-body-sm font-medium">{kind}</span>
        {context && (
          <>
            <span aria-hidden="true" className="text-body-sm leading-body-sm text-muted">
              ·
            </span>
            <span className="min-w-0 truncate text-body-sm leading-body-sm text-muted">{context}</span>
          </>
        )}
        <span className="flex-1" />
        {where && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{where}</span>}
        {!onPhone && position && (
          <span className="flex shrink-0 items-center gap-2">
            <Step keyName="K" label="Previous" onSelect={onPrevious} disabled={position.index <= 1} />
            <Step keyName="J" label="Next" onSelect={onNext} disabled={position.index >= position.total} />
          </span>
        )}
      </header>
      <PhoneLayout.Provider value={onPhone}>
        <div className="flex flex-col gap-4 p-5">
          {children}
          {builtOn}
        </div>
      </PhoneLayout.Provider>
      {footer ? (
        <div className="border-t px-5 py-3">{footer}</div>
      ) : onPhone ? (
        (approve || reject) && (
          <footer aria-hidden="true" className="flex items-center justify-between gap-2 border-t px-5 py-3 text-body-sm leading-body-sm text-muted">
            <span>{reject && `← ${reject.label}`}</span>
            <span>{approve && `${approve.label} →`}</span>
          </footer>
        )
      ) : (
        <footer className="flex items-center gap-2 border-t px-5 py-3">
          {actions.map((a, i) => (
            <Move key={a.label} action={a} variant={i === 0 ? "primary" : "secondary"} />
          ))}
          <span className="flex-1" />
          {aside && (
            <Button variant="ghost" icon={aside.icon} keys={aside.keys} detail={aside.detail} note={aside.note} reason={aside.reason} onClick={aside.onSelect}>
              {aside.label}
            </Button>
          )}
          {more && <Menu items={more} label={moreLabel} />}
        </footer>
      )}
    </article>
  );

  if (!onPhone) return <div className={className}>{card}</div>;
  // The underlay says what letting go does: green Approve to the right, a muted Reject to the left.
  const right = dx > 0;
  return (
    <div className={`relative ${className}`}>
      {dx !== 0 && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex items-center rounded-sm ${right ? "justify-start bg-good-subtle pl-[22px] text-good-text" : "justify-end bg-subtle pr-[22px] text-muted"}`}
        >
          {right ? <Icons.approve size={20} /> : <Icons.reject size={20} />}
        </div>
      )}
      {card}
    </div>
  );
}

// K or J beside the position: the key cap, and a button that steps when there's somewhere to step to.
function Step({ keyName, label, onSelect, disabled }: { keyName: string; label: string; onSelect?: () => void; disabled: boolean }) {
  if (!onSelect) return <Kbd>{keyName}</Kbd>;
  return (
    <Tooltip content={label} keys={keyName}>
      <button
        type="button"
        aria-label={label}
        aria-keyshortcuts={keyName}
        disabled={disabled}
        onClick={onSelect}
        className="relative flex rounded-sm after:absolute after:-inset-1.5 hover:[&>kbd]:bg-subtle hover:[&>kbd]:text-text disabled:opacity-50 disabled:hover:[&>kbd]:bg-surface disabled:hover:[&>kbd]:text-muted"
      >
        <Kbd>{keyName}</Kbd>
      </button>
    </Tooltip>
  );
}

function Move({ action: a, variant, size = "md", className }: { action: ReviewAction; variant: "primary" | "secondary"; size?: "md" | "lg"; className?: string }) {
  return (
    <Button
      variant={variant}
      size={size}
      keys={size === "md" ? a.keys : undefined}
      detail={a.detail}
      note={a.note}
      reason={a.reason}
      loading={a.loading}
      loadingLabel={a.loadingLabel}
      onClick={a.onSelect}
      className={className}
    >
      {a.label}
    </Button>
  );
}

// The card's moves in the phone's bottom bar (BottomBar's "actions" mode): the others first, the reject one nearest
// the left thumb, then the Amber one filling the rest, then ⋯ with the aside and the menu.
export function ReviewActions({ actions, aside, more, moreLabel = "More" }: ReviewMoves) {
  const [primary, ...others] = actions;
  const menu: MenuEntry[] = [
    ...(aside ? [{ label: aside.label, icon: aside.icon ?? ("add" as const), detail: aside.detail, note: aside.note, onSelect: aside.onSelect }] : []),
    ...(aside && more?.length ? ["separator" as const] : []),
    ...(more ?? []),
  ];
  return (
    <>
      {[...others].reverse().map((a) => (
        <Move key={a.label} action={a} variant="secondary" size="lg" />
      ))}
      {primary && <Move action={primary} variant="primary" size="lg" className="flex-1" />}
      {menu.length > 0 && <Menu items={menu} label={moreLabel} trigger={<Button size="lg" iconOnly icon="more" aria-label={moreLabel} />} />}
    </>
  );
}

// The line under the card naming the keys. Hidden on phones, which swipe and tap instead.
const defaultLegend: [string, string][] = [
  ["A", "Approve"],
  ["E", "Edit"],
  ["R", "Reject"],
  ["J", "Next"],
  ["K", "Previous"],
  ["U", "Undo"],
];

export function ReviewKeyLegend({ items = defaultLegend, className = "" }: { items?: [key: string, label: string][]; className?: string }) {
  return (
    <ul aria-label="Keys" className={`hidden flex-wrap items-center gap-3 md:flex ${className}`}>
      {items.map(([key, label]) => (
        <li key={key} className="flex items-center gap-1.5">
          <Kbd>{key}</Kbd>
          <span className="text-body-sm leading-body-sm text-muted">{label}</span>
        </li>
      ))}
    </ul>
  );
}

// What J opens next, under the card: "Next in Direction criteria", then its title and a muted line.
export function ReviewNext({ group, title, line, onOpen }: { group: string; title: string; line?: string; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label leading-label text-muted">Next in {group}</span>
      <button
        type="button"
        onClick={onOpen}
        aria-keyshortcuts="J"
        className="flex min-h-11 items-center gap-3 rounded-sm border px-4 py-3 text-left transition-colors duration-100 hover:bg-subtle"
      >
        <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm font-medium text-text">{title}</span>
        {line && <span className="hidden min-w-0 truncate text-body-sm leading-body-sm text-muted md:inline">{line}</span>}
        <span aria-hidden="true" className="hidden md:inline-flex">
          <Kbd>J</Kbd>
        </span>
      </button>
    </div>
  );
}

// Bodies by kind. A statement (a new fact, a direction's criteria): 16/24 medium, 14/20 on a phone.
export function ReviewStatement({ children }: { children: ReactNode }) {
  const phone = useContext(PhoneLayout);
  return <p className={`font-medium text-text ${phone ? "text-body-md leading-body-md" : "text-title-md leading-6"}`}>{children}</p>;
}

// A company to rate: its initial, name and a line about it, then why it fits (or only partly does).
export function ReviewCompany({ name, line, fit }: { name: string; line?: string; fit?: { tone: "good" | "caution"; title: string; text: string } }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={name} company size={40} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-title-md leading-title-md font-semibold text-text">{name}</span>
          {line && <span className="text-body-sm leading-body-sm text-muted">{line}</span>}
        </div>
      </div>
      {fit && (
        <div className={`flex flex-col gap-1 border-l-2 pl-3.5 ${fit.tone === "good" ? "border-good" : "border-caution"}`}>
          <span className={`text-body-sm leading-body-sm font-semibold ${fit.tone === "good" ? "text-good-text" : "text-caution-text"}`}>{fit.title}</span>
          <span className="text-body-sm leading-body-sm text-text">{fit.text}</span>
        </div>
      )}
    </>
  );
}

// An update to a fact: what the record says now, struck through, over what's proposed.
export function ReviewUpdate({ now, proposed }: { now: string; proposed: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-label leading-label text-muted">Now</span>
        <del className="text-body-md leading-body-md text-muted decoration-1">{now}</del>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-label leading-label text-muted">Proposed</span>
        <ins className="text-body-md leading-body-md font-medium text-text no-underline">{proposed}</ins>
      </div>
    </div>
  );
}

// The screen binds the review keys with this: A approve, E edit, R reject, J next, K previous, U undo, plus `other`
// keys a kind adds ({ T: target, M: maybe }). Keys are ignored while typing in a field or moving through a menu, list or
// dialog, with a modifier held, or when something else already handled them (a toast's U runs its own Undo, so pass
// `undo` only when no toast carries it).
export type ReviewKeyHandlers = {
  approve?: () => void;
  edit?: () => void;
  reject?: () => void;
  next?: () => void;
  previous?: () => void;
  undo?: () => void;
  other?: Record<string, () => void>;
};

const busy = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]";

export function useReviewKeys(handlers: ReviewKeyHandlers, enabled = true) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.target instanceof Element && e.target.closest(busy)) return;
      const h = latest.current;
      const key = e.key.toLowerCase();
      const map: Record<string, (() => void) | undefined> = { a: h.approve, e: h.edit, r: h.reject, j: h.next, k: h.previous, u: h.undo };
      for (const [k, run] of Object.entries(h.other ?? {})) map[k.toLowerCase()] = run;
      const run = map[key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

// A horizontal drag on touch: follows the finger with a slight tilt, and on release past the threshold flies off
// and runs the side's intent; short of it, it snaps back. Vertical drags are left to scrolling. With reduced motion
// there's no tilt and no fly-off.
function useSwipe({ enabled, onRight, onLeft, initial = 0 }: { enabled: boolean; onRight?: () => void; onLeft?: () => void; initial?: number }) {
  const [drag, setDrag] = useState({ dx: initial, animate: false, tilt: true, left: initial < 0 });
  const start = useRef<{ x: number; y: number; id: number; width: number; locked: boolean; reduce: boolean } | null>(null);
  const swiped = useRef(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!enabled || e.pointerType === "mouse" || !e.isPrimary) return;
      start.current = {
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        width: e.currentTarget.offsetWidth,
        locked: false,
        reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
      swiped.current = false;
    },
    [enabled],
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        start.current = null;
        return;
      }
      if (Math.abs(dx) < 8) return;
      s.locked = true;
      swiped.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // A pointer the browser no longer tracks; the drag still follows its events.
      }
    }
    setDrag({ dx, animate: false, tilt: !s.reduce, left: dx < 0 });
  }, []);

  const onPointerEnd = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      start.current = null;
      if (!s.locked) return;
      const dx = e.clientX - s.x;
      const run = dx > 0 ? onRight : onLeft;
      if (e.type === "pointerup" && run && Math.abs(dx) >= Math.min(112, s.width * 0.3)) {
        setDrag((d) => ({ ...d, dx: Math.sign(dx) * s.width * 1.2, animate: !s.reduce }));
        timer.current = window.setTimeout(
          () => {
            run();
            setDrag({ dx: 0, animate: false, tilt: true, left: false });
          },
          s.reduce ? 0 : 160,
        );
        return;
      }
      setDrag((d) => ({ ...d, dx: 0, animate: true }));
    },
    [onRight, onLeft],
  );

  // The lift that ends a swipe isn't a tap on whatever is under the finger.
  const onClickCapture = useCallback((e: MouseEvent) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    dx: drag.dx,
    animate: drag.animate,
    tilt: drag.tilt,
    left: drag.left,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  };
}
