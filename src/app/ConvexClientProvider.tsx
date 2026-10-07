"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { watchClock } from "./clock";
import { installDemoGuard } from "./demo/demo";
import { listenForRefusal } from "./SignIn";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
if (typeof window !== "undefined") {
  // Before the provider finishes a sign-in, so a refused account is heard (SignIn).
  listenForRefusal();
  // In the read-only demo, mutations and actions don't reach the server (demo/demo.ts).
  installDemoGuard(convex);
  // A workspace held at one moment (the demo) is counted from it (clock.ts).
  watchClock(convex);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
