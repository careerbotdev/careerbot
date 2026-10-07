"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button } from "@/components/Button";
import { ErrorLine } from "@/components/Field";
import { Tag } from "../site/Tag";
import { WAITLIST_ID } from "../site/Waitlist";
import { CAREERBOT_URL, DEMO_ENTRY } from "../site/words";
import { linkLook, SignInFrame, SignInHeading } from "../signInParts";

// The demo's entry (the Demo — open the demo boards in Paper), laid out as careerbot.dev's sign-in is: No sign-up, the
// heading and who the made-up person is, Open the demo, and careerbot.dev's waitlist for anyone who wants their own.
// Open the demo signs in at once as the demo's shared person (Convex Auth's "demo" provider, convex/auth.ts), and the
// frame (Shell) then shows the address asked for: Today from / and /demo (demo/page.tsx). When the server says no (the
// demo is busy, or there's none on this deployment), its words show under the button.

export function DemoEntry() {
  const { signIn } = useAuthActions();
  const [opening, setOpening] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const open = () => {
    setOpening(true);
    setRefusal(null);
    signIn("demo").then(
      // Signed in, this screen goes; stays opening until then.
      ({ signingIn }) => !signingIn && setOpening(false),
      (e: unknown) => {
        setRefusal(refusalWords(e));
        setOpening(false);
      },
    );
  };
  return <DemoEntryScreen opening={opening} refusal={refusal} onOpen={open} />;
}

// The server's own words for a refused demo sign-in (convex/demoRefusal.ts, DemoSignInRefusal), else a plain failure.
function refusalWords(e: unknown) {
  const data: unknown = e instanceof ConvexError ? e.data : null;
  if (typeof data === "object" && data !== null && "kind" in data && data.kind === "demoSignIn" && "message" in data && typeof data.message === "string") return data.message;
  return DEMO_ENTRY.failed;
}

export function DemoEntryScreen({ opening = false, refusal = null, onOpen }: { opening?: boolean; refusal?: string | null; onOpen: () => void }) {
  return (
    <SignInFrame>
      <div className="flex w-full max-w-100 flex-col items-start">
        <Tag icon="noSignUp">{DEMO_ENTRY.tag}</Tag>
        <SignInHeading>{DEMO_ENTRY.heading}</SignInHeading>
        <p className="pt-3 text-site-body-lg-sm leading-site-body-lg-sm text-muted">{DEMO_ENTRY.body}</p>
        <div className="flex w-full flex-col gap-2.5 pt-8">
          <Button
            variant="primary"
            size="lg"
            loading={opening}
            loadingLabel={DEMO_ENTRY.opening}
            className="h-13! w-full rounded-site-field! text-site-control! leading-site-control!"
            detail={DEMO_ENTRY.detail}
            note="Free"
            onClick={onOpen}
          >
            {DEMO_ENTRY.open}
          </Button>
          {refusal && (
            <div role="alert">
              <ErrorLine>{refusal}</ErrorLine>
            </div>
          )}
        </div>
        <p className="flex min-h-11 flex-wrap items-center gap-x-1.5 pt-5 text-site-note leading-site-note text-muted">
          {DEMO_ENTRY.own.ask}
          <a href={`${CAREERBOT_URL}/#${WAITLIST_ID}`} className={linkLook}>
            {DEMO_ENTRY.own.link}
          </a>
        </p>
      </div>
    </SignInFrame>
  );
}
