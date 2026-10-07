"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type IconName, Icons } from "./icons";

// A toast confirms what just happened and carries its one action: Undo, Open, Try again. One at a time; a new one
// replaces the last. It stays 6 seconds (longer while the pointer or focus is on it). An action with a `key` runs from
// that key while the toast shows, and stays bound after it hides until another toast replaces it, so U undoes the
// last thing even after the toast has gone. `icon` says what kind of thing happened; `failed` is red. `keep`: while it
// shows, a failure doesn't replace it, for a toast that already says why the action didn't happen (the demo's refusal),
// whose caller then fails too and would only repeat it less clearly.
export type ToastAction = { label: string; run: () => void; key?: string };
export type Toast = { message: string; icon?: IconName; action?: ToastAction; keep?: boolean };

const lifetime = 6000;

type Shown = Toast & { id: number };
let shown: Shown | null = null;
let bound: ToastAction | null = null;
let next = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Toast) {
  if (shown?.keep && t.icon === "failed") return;
  shown = { ...t, id: ++next };
  bound = t.action?.key ? t.action : null;
  emit();
}

function hide(id: number) {
  if (shown?.id !== id) return;
  shown = null;
  emit();
}

// Runs an action once: its key is spent and its toast goes.
function run(action: ToastAction) {
  if (bound === action) bound = null;
  shown = null;
  emit();
  action.run();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Where the key would type or pick instead: a field, an editor, an open menu or list.
function typing(e: KeyboardEvent) {
  const el = e.target instanceof Element ? e.target : null;
  return !!el?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=menu], [role=listbox]");
}

// One toast, as it looks: `inverse` with its text, an icon, the message, the action with its key, and a close button.
// The icon and close mark take their dark-mode colours on the dark surface in both themes.
export function ToastView({ toast: t, onAction, onClose }: { toast: Toast; onAction?: () => void; onClose?: () => void }) {
  const Icon = t.icon && Icons[t.icon];
  const iconTone = t.icon === "failed" ? "text-red" : t.icon === "approve" || t.icon === "approveAll" || t.icon === "done" ? "text-good" : "text-muted";
  return (
    <div className="pointer-events-auto flex min-h-11 w-full max-w-110 items-center gap-2.5 rounded-sm border border-inverse bg-inverse py-1.5 pr-1.5 pl-3.5 text-inverse-text shadow-raised dark:border-border">
      {Icon && (
        <span data-theme="dark" className={`flex shrink-0 ${iconTone}`}>
          <Icon aria-hidden="true" />
        </span>
      )}
      <p className="min-w-0 flex-1 text-body-sm leading-body-sm">{t.message}</p>
      {t.action && (
        <button
          type="button"
          onClick={onAction}
          className="relative flex h-8 shrink-0 items-center gap-2 rounded-sm bg-paper/10 px-2.5 text-label leading-label font-medium transition-colors duration-100 after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-paper/20 md:after:hidden dark:bg-border dark:hover:bg-control-border"
        >
          {t.action.label}
          {t.action.key && (
            <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-paper/14 px-[5px] font-mono text-mono leading-mono font-medium dark:bg-paper/12">
              {t.action.key}
            </kbd>
          )}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={onClose} className="relative flex size-7 shrink-0 items-center justify-center rounded-sm after:absolute after:-inset-2 hover:bg-paper/10 md:after:hidden">
        <span data-theme="dark" className="flex text-muted">
          <Icons.close aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

// Mounted once for the whole app: shows the current toast at the bottom centre (above the bar on phones) and binds the
// last action's key.
export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => shown, () => null);
  const [held, setHeld] = useState(false);
  const timer = useRef<number>(undefined);

  useEffect(() => {
    if (!current || held) return;
    timer.current = window.setTimeout(() => hide(current.id), lifetime);
    return () => window.clearTimeout(timer.current);
  }, [current, held]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!bound?.key || e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e)) return;
      if (e.key.toLowerCase() !== bound.key.toLowerCase()) return;
      e.preventDefault();
      run(bound);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-2 md:bottom-6"
    >
      {current && (
        <div
          key={current.id}
          className="flex w-full justify-center transition-[opacity,translate] duration-160 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:starting:translate-y-0"
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <ToastView toast={current} onAction={() => current.action && run(current.action)} onClose={() => hide(current.id)} />
        </div>
      )}
    </div>
  );
}
