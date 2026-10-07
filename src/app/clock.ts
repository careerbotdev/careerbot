"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../../convex/_generated/api";

// The time screens count from: now, or the moment the signed-in workspace is held at (workspaces.current's asOf, the
// demo's snapshot; convex/workspaces.ts, clockOf), so what's today, new, due or this month's reads as it did then, as
// the server counts it. Known from the client's own workspaces.current (watchClock), before the screens that use it
// re-render with their data.

let held: number | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

type Watched = { onUpdate: (callback: () => void) => () => void; localQueryResult: () => unknown };
type Watchable = { watchQuery: (query: typeof api.workspaces.current, args: Record<string, never>) => Watched };

// Keeps the clock in step with a client's (the app's, or a story's) workspace.
export function watchClock(client: Watchable) {
  const current = client.watchQuery(api.workspaces.current, {});
  const read = () => {
    let at: number | null;
    try {
      at = (current.localQueryResult() as { asOf: number | null } | null | undefined)?.asOf ?? null;
    } catch {
      return;
    }
    if (at === held) return;
    held = at;
    for (const l of [...listeners]) l();
  };
  read();
  current.onUpdate(read);
}

// The time now, for words worked out outside a component ("today", "3 days ago").
export const clockNow = () => held ?? Date.now();

// Calendar days move on while the app stays open: the time is read again this often.
const TICK_MS = 10 * 60_000;
// The time now, for a screen: it renders again when the workspace's clock is known, and as the day moves on unless
// `still` (a list that stays put while it's open reads the time once).
export function useNow(still = false) {
  const at = useSyncExternalStore(subscribe, () => held, () => null);
  const [real, setReal] = useState(() => Date.now());
  useEffect(() => {
    if (at !== null || still) return;
    const timer = window.setInterval(() => setReal(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [at, still]);
  return at ?? real;
}
