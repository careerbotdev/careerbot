"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Insights } from "./Insights";

// Insights: what's true of them across their record (?tab= Approved or Rejected, ?insight= the one open).
export default function InsightsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Insights />
        </Suspense>
      </main>
    </Authenticated>
  );
}
