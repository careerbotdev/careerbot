"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Reports } from "./Reports";

// Reports: the views (?view=overview|spending|search|record|activity) over a period (?period=month|quarter|all).
export default function ReportsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Reports />
        </Suspense>
      </main>
    </Authenticated>
  );
}
