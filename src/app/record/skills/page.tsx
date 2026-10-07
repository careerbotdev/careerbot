"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Skills } from "./Skills";

// Skills in the record: proposed, approved and rejected, by group (?tab=, ?item= the one open).
export default function SkillsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Skills kind="skill" />
        </Suspense>
      </main>
    </Authenticated>
  );
}
