import { ConvexError } from "convex/values";

// What the server says when someone in the demo tries to change something (functions.ts refuses every public mutation
// and action there). Kept free of server code so the app can import it and tell this refusal apart from real errors.
export const DEMO_REFUSAL = "This is a demo, so nothing in it can be changed.";

export type DemoRefusal = { kind: "demo"; message: string };

export function isDemoRefusal(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "kind" in data && data.kind === "demo";
}

// Why the demo sign-in (auth.ts, provider "demo") said no: this deployment has no demo (production), or too many
// people opened it in the last minute. A different kind from the read-only refusal, so the app doesn't confuse them.
export const NO_DEMO = "There's no demo here.";
export const DEMO_BUSY = "The demo is busy. Try again in a minute.";
export type DemoSignInRefusal = { kind: "demoSignIn"; reason: "none" | "busy"; message: string };
