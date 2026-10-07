"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Review } from "./Review";

// Review: every decision waiting, grouped by what it unlocks (?kind= the group, ?item= the card).
export default function ReviewPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Review />
        </Suspense>
      </main>
    </Authenticated>
  );
}
