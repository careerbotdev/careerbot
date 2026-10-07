"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Directions } from "./Directions";

// Directions: approved and proposed (?list=), the one open (?direction=) with its tab (?tab=) and the resume or Tailor a
// resume beside it (?pane=).
export default function DirectionsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Directions />
        </Suspense>
      </main>
    </Authenticated>
  );
}
