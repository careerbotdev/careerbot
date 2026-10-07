"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// An address that's only a way in (/sign-in, /demo): signed out, the frame (Shell) shows the sign-in, or the demo's
// entry, there as it does at any address; once signed in (back from Google or GitHub, or by Open the demo), this goes
// on to Today.
export function OnToToday() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);
  return null;
}
