"use client";

import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { Text } from "@/components/Text";
import { WEBSITE } from "./mode";
import { SignIn } from "./SignIn";
import { Website } from "./site/Website";
import { Today } from "./today/Today";

// Where the app opens (page.tsx): Today once signed in, the website before (its Sign in goes to /sign-in). A
// self-hosted copy and the demo have no website: signed out, / is the sign-in, or the demo's entry (SignIn; mode.ts).
export function Home() {
  return (
    <>
      <AuthLoading>
        <main className="flex min-h-dvh w-full flex-col px-4 pt-6 md:items-center md:justify-center md:p-6">
          <div className="flex w-full flex-col gap-6 md:max-w-100">
            <Logo height={32} />
            <Text muted>Loading…</Text>
          </div>
        </main>
      </AuthLoading>
      <Unauthenticated>
        {WEBSITE ? <Website /> : <SignIn />}
      </Unauthenticated>
      <Authenticated>
        <main className="flex min-h-0 w-full flex-1 flex-col">
          <Suspense>
            <Today />
          </Suspense>
        </main>
      </Authenticated>
    </>
  );
}
