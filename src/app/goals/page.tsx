"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Goals } from "./Goals";

// Goals: the goals story and what it produced (?tab=story|produced, ?version=N an earlier version).
export default function GoalsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Goals />
        </Suspense>
      </main>
    </Authenticated>
  );
}
