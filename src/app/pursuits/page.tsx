"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Pursuits } from "./Pursuits";

// Pursuits: roles and the pursuits of them (?status= the tab, ?role= the one open, ?direction= the direction it's shown
// for, ?company= All roles filtered to one company).
export default function PursuitsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Pursuits />
        </Suspense>
      </main>
    </Authenticated>
  );
}
