"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Resumes } from "./Resumes";

// Resumes: the base resume, one per direction and every tailored one (?resume= the one open, ?tab=update the ones to
// update).
export default function ResumesPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Resumes />
        </Suspense>
      </main>
    </Authenticated>
  );
}
