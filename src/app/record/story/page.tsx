"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Story } from "./Story";

// Story: stories and quick notes (?show= the tab, ?story= the one open, ?tab=proposals what its read proposed).
export default function StoryPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Story />
        </Suspense>
      </main>
    </Authenticated>
  );
}
