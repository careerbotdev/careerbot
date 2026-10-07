"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { Companies } from "./Companies";

// Companies: Targets, Maybe, Found and Set aside (?tab=), the one chosen open beside the list (?company=).
export default function CompaniesPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Companies />
        </Suspense>
      </main>
    </Authenticated>
  );
}
