"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { useSignOut } from "../localDrafts";
import { Settings } from "./Settings";

// Settings: Account, AI, Budgets and spending, Keys, Companies, Reminders, Contact and GitHub (?section=).
export default function SettingsPage() {
  const signOut = useSignOut();
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <Settings signOut={signOut} />
        </Suspense>
      </main>
    </Authenticated>
  );
}
