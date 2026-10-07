"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { type Toast, toast } from "@/components/Toast";
import { DEMO } from "../mode";
import { WAITLIST_ID } from "../site/Waitlist";
import { CAREERBOT_URL, DEMO_REFUSAL } from "../site/words";
import { type Current, DemoRefused, demoOf, guardDemo } from "./guard";

// The read-only demo on the app's Convex client (guard.ts says how): the refusal's toast, the guard installed on a
// client, and whether a screen is in the demo.

// The refusal: the lock, the words and Get notified (careerbot.dev's waitlist; the demo's build has no website).
const WAITLIST_URL = `${CAREERBOT_URL}/#${WAITLIST_ID}`;
export const REFUSAL: Toast = {
  message: DEMO_REFUSAL.message,
  icon: "readOnly",
  keep: true,
  action: { label: DEMO_REFUSAL.action, run: () => window.open(WAITLIST_URL, "_self") },
};

// For screens: whether this is the demo (the banner, prompts that would mislead there, writes made with no click).
export function useDemo() {
  return demoOf(useQuery(api.workspaces.current));
}

// A caller that doesn't catch (`void save()`) leaves the refusal unhandled; it's been shown already, so the browser
// isn't told. Once per page.
let quiet = false;
function hushRefusals() {
  if (quiet || typeof window === "undefined") return;
  quiet = true;
  window.addEventListener("unhandledrejection", (e) => {
    if (e.reason instanceof DemoRefused) e.preventDefault();
  });
}

type Watched = { onUpdate: (callback: () => void) => () => void; localQueryResult: () => unknown };
type Guardable = { mutation: unknown; action: unknown; watchQuery: (query: typeof api.workspaces.current, args: Record<string, never>) => Watched };

// Guards a client (the app's, or a story's), knowing whether it's the demo from its own workspaces.current.
export function installDemoGuard<C extends Guardable>(client: C) {
  let demo = DEMO;
  const current = client.watchQuery(api.workspaces.current, {});
  const read = () => {
    try {
      demo = demoOf(current.localQueryResult() as Current | undefined);
    } catch {
      // The query failed: keep what was known.
    }
  };
  read();
  current.onUpdate(read);
  hushRefusals();
  return guardDemo(client, () => demo, () => toast(REFUSAL));
}
