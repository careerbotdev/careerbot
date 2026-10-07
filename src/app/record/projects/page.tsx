"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Projects } from "./Projects";

// Projects: the projects read from GitHub (?tab=rejected the Rejected tab, ?project= the one open, ?fact= a fact's
// sources beside it, ?github=1 the GitHub connection).
export default function ProjectsPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Projects />
        </Suspense>
      </main>
    </Authenticated>
  );
}
