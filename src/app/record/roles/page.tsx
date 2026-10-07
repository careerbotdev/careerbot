"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Roles } from "./Roles";

// Roles in the record (?role= the one open, by id or roleKey; ?fact= a fact's sources beside it; ?add=1 a new role;
// ?view=rejected the rejected ones; ?employer= the timeline for one employer).
export default function RolesPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Roles />
        </Suspense>
      </main>
    </Authenticated>
  );
}
