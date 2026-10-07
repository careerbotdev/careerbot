"use client";

import { createContext, type ReactNode, useContext, useEffect, useId, useState, useSyncExternalStore } from "react";
import type { BottomBarMode } from "@/components/BottomBar";
import type { Command } from "@/components/CommandPalette";

// What screens tell the shell while they're shown: the phone bar's mode, their ⌘K commands, and questions before
// something is deleted. Kept in a small store outside React state, so a screen registering on every render only
// re-renders the bar or palette that shows it, never itself.

export type ConfirmRequest = { title: string; body?: ReactNode; confirmLabel: string };
// A question waiting for its answer.
export type Asked = ConfirmRequest & { answer: (yes: boolean) => void };

export type ShellStore = {
  subscribe: (listener: () => void) => () => void;
  setBar: (id: string, mode: BottomBarMode | null) => void;
  setCommands: (id: string, commands: Command[] | null) => void;
  ask: (request: ConfirmRequest) => Promise<boolean>;
  bar: () => BottomBarMode | null;
  commands: () => Command[];
  asked: () => Asked | null;
};

function createStore(): ShellStore {
  const bars = new Map<string, BottomBarMode>();
  const registered = new Map<string, Command[]>();
  const listeners = new Set<() => void>();
  // Snapshots change identity only when their part changes.
  let bar: BottomBarMode | null = null;
  let commands: Command[] = [];
  let asked: Asked | null = null;
  const emit = () => listeners.forEach((l) => l());
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // The newest screen's mode wins; when it goes, the one before it shows again.
    setBar(id, mode) {
      bars.delete(id);
      if (mode) bars.set(id, mode);
      bar = [...bars.values()].at(-1) ?? null;
      emit();
    },
    // The screen registered last is the one in front: its commands come first.
    setCommands(id, next) {
      registered.delete(id);
      if (next?.length) registered.set(id, next);
      commands = [...registered.values()].reverse().flat();
      emit();
    },
    // A new question answers the one before it with No.
    ask(request) {
      asked?.answer(false);
      return new Promise<boolean>((resolve) => {
        const answer = (yes: boolean) => {
          if (asked?.answer !== answer) return;
          asked = null;
          emit();
          resolve(yes);
        };
        asked = { ...request, answer };
        emit();
      });
    },
    bar: () => bar,
    commands: () => commands,
    asked: () => asked,
  };
}

const Store = createContext<ShellStore | null>(null);

// Wraps the app once, signed in or not, so screens always find the store.
export function ShellProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <Store.Provider value={store}>{children}</Store.Provider>;
}

function useStore() {
  const store = useContext(Store);
  if (!store) throw new Error("useBar, useCommands and useConfirm need the shell.");
  return store;
}

// The shell's side: what to show now.
export function useShellState() {
  const store = useStore();
  return {
    bar: useSyncExternalStore(store.subscribe, store.bar, store.bar),
    commands: useSyncExternalStore(store.subscribe, store.commands, store.commands),
    asked: useSyncExternalStore(store.subscribe, store.asked, store.asked),
  };
}

// While the calling screen is shown with a mode, the phone's bottom bar shows it (an item's actions, a bulk selection,
// a question); null, or leaving, gives the bar back to the areas.
export function useBar(mode: BottomBarMode | null) {
  const store = useStore();
  const id = useId();
  useEffect(() => store.setBar(id, mode), [store, id, mode]);
  useEffect(() => () => store.setBar(id, null), [store, id]);
}

// ⌘K commands for as long as the calling screen is shown, listed before the rest.
export function useCommands(commands: Command[]) {
  const store = useStore();
  const id = useId();
  useEffect(() => store.setCommands(id, commands), [store, id, commands]);
  useEffect(() => () => store.setCommands(id, null), [store, id]);
}

// Asks before something is deleted: the ConfirmDialog on medium screens and up, the bottom bar's confirm mode on a
// phone. Resolves true when they confirm. Only for what can't be undone.
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  return useStore().ask;
}
