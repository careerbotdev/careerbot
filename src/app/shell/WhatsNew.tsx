"use client";

import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { toast } from "@/components/Toast";
import { releaseAnchor, VERSION } from "../changelog/releases";

// What's new: the first time someone opens a newer version of the app than they used before, a quiet toast says so,
// with What's new to read its notes on the changelog (in a new tab, so their work stays open). Once per person and
// version (updates.sawVersion); never on their first visit. Not in the demo, which nobody updates. `version`: the app's
// own (stories set it).
export function WhatsNew({ version = VERSION }: { version?: string }) {
  const saw = useMutation(api.updates.sawVersion);
  useEffect(() => {
    if (!version) return;
    let live = true;
    saw({ version })
      .then((show) => {
        if (show && live)
          toast({
            message: `Updated to CareerBot ${version}`,
            action: { label: "What’s new", run: () => window.open(`/changelog#${releaseAnchor(version)}`, "_blank", "noopener") },
          });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [saw, version]);
  return null;
}
