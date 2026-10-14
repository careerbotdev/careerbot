"use client";

import { useMutation } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import { toast, type Toast } from "@/components/Toast";

// Back from connecting on GitHub or Google (?<param>=connected|failed|…): says how it went, once, and `leave` tidies the
// address. A connection that came back (?connection=) is kept only once this signed-in app finishes it, which refuses
// one started from another account; until then it isn't connected.
export function useConnectionReturn(param: string, returned: Record<string, Toast>, leave: () => void) {
  const params = useSearchParams();
  const finish = useMutation(api.connections.finish);
  const outcome = params.get(param);
  const token = params.get("connection");
  const said = useRef(false);
  useEffect(() => {
    if (said.current || !outcome || !returned[outcome]) return;
    said.current = true;
    leave();
    if (outcome !== "connected") {
      toast(returned[outcome]);
      return;
    }
    void finish({ token: token ?? "" }).then(
      (refused) => toast(refused ? { message: refused, icon: "failed" } : returned.connected),
      () => toast(returned.failed),
    );
  }, [outcome, token, returned, leave, finish]);
}
