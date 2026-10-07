import { useAuthActions } from "@convex-dev/auth/react";
import { useCallback } from "react";

// Drafts kept in this browser while someone writes, before anything is saved to their workspace. Each is keyed by the
// workspace it belongs to, so another account signed in on the same browser never sees it, and signing out clears
// them all (BUILD.md: multi-tenant, private by default).
const PREFIX = "careerbot.draft:";

export const draftKey = (workspaceId: string, name: string) => `${PREFIX}${workspaceId}:${name}`;

export function forgetDrafts() {
  for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
}

// Every way out of the account goes through here, so nothing they were writing stays behind on the device. `then`:
// what happens once signed out (Leave the demo goes on to careerbot.dev).
export function useSignOut(then?: () => void) {
  const { signOut } = useAuthActions();
  return useCallback(() => {
    forgetDrafts();
    void signOut().finally(then);
  }, [signOut, then]);
}
