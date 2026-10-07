"use client";

import { useSyncExternalStore } from "react";

// Small screens (under 768px, DESIGN.md Layout) swap everything that floats for the bottom sheet and the bottom bar.
const query = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

// True below 768px. False on the server and on the first render, so markup matches before hydration.
export function useSmall(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
