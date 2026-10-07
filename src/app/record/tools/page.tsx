"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Skills } from "../skills/Skills";

// Tools in the record: proposed, approved and rejected, by group (?tab=, ?item= the one open).
export default function ToolsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Skills kind="tool" />
        </Suspense>
      </main>
    </Authenticated>
  );
}
