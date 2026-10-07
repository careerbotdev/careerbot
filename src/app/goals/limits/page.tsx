"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Limits } from "./Limits";

// Limits: the list and the limit open beside it (?limit=), its form while editing (?edit=1), Add a limit (?add=1).
export default function LimitsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Limits />
        </Suspense>
      </main>
    </Authenticated>
  );
}
