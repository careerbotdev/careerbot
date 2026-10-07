"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Breaks } from "./Breaks";

// Breaks: career breaks in the record (?break= the one open, ?add=1 with &start= and &end= to add one, ?fact= a fact of
// the open break beside it).
export default function BreaksPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Breaks />
        </Suspense>
      </main>
    </Authenticated>
  );
}
