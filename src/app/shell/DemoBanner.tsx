"use client";

import { Button } from "@/components/Button";
import { DEMO_BANNER } from "../site/words";

// Over the whole app in the demo (the Demo — Today with the banner boards in Paper), full width and 36px tall on
// steel-subtle: what this is, then (from medium up) that `person`, whose search is shown, is made up and nothing changed
// is saved, and at the right Leave the demo ("Leave" on a phone), which signs out (Shell).
export function DemoBanner({ person, onLeave }: { person: string; onLeave: () => void }) {
  return (
    <div role="region" aria-label="Demo" className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-b bg-steel-subtle pr-2 pl-4 text-body-sm leading-body-sm text-text md:px-4">
      <p className="flex min-w-0 items-baseline gap-2">
        <span className="font-medium">{DEMO_BANNER.title}</span>
        <span className="hidden min-w-0 truncate text-muted md:inline">{DEMO_BANNER.body(person)}</span>
      </p>
      <Button variant="ghost" size="sm" className="px-2! text-body-sm! leading-body-sm!" aria-label={DEMO_BANNER.leave} detail={DEMO_BANNER.detail} note="Free" onClick={onLeave}>
        <span className="md:hidden">{DEMO_BANNER.leaveShort}</span>
        <span className="hidden md:inline">{DEMO_BANNER.leave}</span>
      </Button>
    </div>
  );
}
