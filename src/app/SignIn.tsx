"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { api } from "../../convex/_generated/api";
import type { NotAllowed } from "../../convex/allowlist";
import { ErrorLine } from "@/components/Field";
import { DemoEntry } from "./demo/DemoEntry";
import { DEMO, SELF_HOSTED } from "./mode";
import { SelfHostedSignIn } from "./SelfHostedSignIn";
import { Analytics } from "./site/Analytics";
import { Tag } from "./site/Tag";
import { WAITLIST_ID, Waitlist } from "./site/Waitlist";
import { SIGN_IN } from "./site/words";
import { linkLook, OAuthButtons, type OAuthProvider, SignInFrame, SignInHeading } from "./signInParts";

// The signed-out screen. On careerbot.dev (Sign in in Paper's Website v3 — Calm) the hosted version is invite-only, so
// it says so, and offers the ways to sign in this deployment has set up (Google, GitHub; convex/auth.ts), and the
// waitlist for anyone not invited. When the account they came back with isn't on the allowlist, it says so and offers
// the waitlist with that account's email filled in, or another account. A self-hosted copy has its own
// (SelfHostedSignIn: username and password), and the demo has its entry instead (DemoEntry: Open the demo).

// A refused sign-in, heard from the auth provider: it finishes the sign-in (the ?code GitHub or Google sent back) on
// its own and doesn't report failures, so the refusal arrives as an unhandled rejection carrying the server's answer.
let refused: NotAllowed | null = null;
const listeners = new Set<() => void>();
const setRefused = (next: NotAllowed | null) => {
  refused = next;
  listeners.forEach((l) => l());
};
export function listenForRefusal() {
  window.addEventListener("unhandledrejection", (e) => {
    const data = (e.reason as { data?: unknown } | undefined)?.data as NotAllowed | undefined;
    if (data?.kind !== "notAllowed") return;
    e.preventDefault();
    setRefused(data);
  });
}
const useRefused = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => refused,
    () => null,
  );

// At /sign-in, a public page, the website's analytics count it (site/Analytics.tsx); the same screen shown at the app's
// addresses to someone signed out isn't counted.
export function SignIn() {
  const { signIn } = useAuthActions();
  const path = usePathname();
  const notAllowed = useRefused();
  const methods = useQuery(api.auth.signInMethods);
  const [failed, setFailed] = useState(false);
  const [going, setGoing] = useState<OAuthProvider>();
  const go = (provider: OAuthProvider) => {
    setFailed(false);
    setGoing(provider);
    // Back to the page they asked for once signed in.
    signIn(provider, { redirectTo: `${location.pathname}${location.search}` }).catch(() => {
      setFailed(true);
      setGoing(undefined);
    });
  };
  if (SELF_HOSTED) return <SelfHostedSignIn methods={methods} notAllowed={notAllowed} failed={failed} going={going} onOAuth={go} onTryAnother={() => setRefused(null)} />;
  if (DEMO) return <DemoEntry />;
  return (
    <>
      <SignInScreen notAllowed={notAllowed} methods={methods} failed={failed} going={going} onSignIn={go} onTryAnother={() => setRefused(null)} />
      {path === "/sign-in" && <Analytics />}
    </>
  );
}

export function SignInScreen({
  notAllowed,
  methods,
  failed = false,
  going,
  onSignIn,
  onTryAnother,
}: {
  notAllowed: NotAllowed | null;
  // The ways to sign in that are set up; undefined while that's still loading.
  methods: readonly string[] | undefined;
  failed?: boolean;
  going?: OAuthProvider;
  onSignIn: (provider: OAuthProvider) => void;
  onTryAnother: () => void;
}) {
  return (
    <SignInFrame>
      {notAllowed ? <NotInvited email={notAllowed.email} onTryAnother={onTryAnother} /> : <Providers methods={methods} failed={failed} going={going} onSignIn={onSignIn} />}
    </SignInFrame>
  );
}

function Providers({ methods, failed, going, onSignIn }: { methods: readonly string[] | undefined; failed: boolean; going?: OAuthProvider; onSignIn: (provider: OAuthProvider) => void }) {
  return (
    <div className="flex w-full max-w-100 flex-col items-start">
      <Tag icon="inviteOnly">{SIGN_IN.tag}</Tag>
      <SignInHeading>{SIGN_IN.heading}</SignInHeading>
      <p className="pt-3 text-site-body-lg-sm leading-site-body-lg-sm text-muted">{SIGN_IN.body}</p>
      {failed && (
        <div className="pt-6">
          <ErrorLine>Sign-in didn’t work. Try again.</ErrorLine>
        </div>
      )}
      {methods?.length === 0 && (
        <div className="pt-6">
          <ErrorLine>No way to sign in is set up. Add Google or GitHub sign-in keys to this copy’s Convex settings.</ErrorLine>
        </div>
      )}
      <div className={`w-full ${failed ? "pt-4" : "pt-8"}`}>
        <OAuthButtons methods={methods} going={going} invited onSignIn={onSignIn} />
      </div>
      <p className="flex min-h-11 flex-wrap items-center gap-x-1.5 pt-5 text-site-note leading-site-note text-muted">
        {SIGN_IN.waitlist.ask}
        <a href={`/#${WAITLIST_ID}`} className={linkLook}>
          {SIGN_IN.waitlist.link}
        </a>
      </p>
    </div>
  );
}

// The account came back refused: the waitlist, with its email filled in when the provider gave one.
function NotInvited({ email, onTryAnother }: { email: string | null; onTryAnother: () => void }) {
  const [joined, setJoined] = useState(false);
  return (
    <div role="alert" className="flex w-full max-w-110 flex-col items-start">
      <Tag icon="inviteOnly">{SIGN_IN.tag}</Tag>
      <SignInHeading refused>{SIGN_IN.notInvited.heading}</SignInHeading>
      <p className="pt-3 pb-7 text-site-body-lg-sm leading-site-body-lg-sm text-muted">{SIGN_IN.notInvited.body}</p>
      <Waitlist source="sign-in" wide email={email ?? ""} joined={joined} onJoined={() => setJoined(true)} />
      <div className="flex min-h-11 items-center pt-4">
        <button type="button" className={linkLook} onClick={onTryAnother}>
          {SIGN_IN.notInvited.other}
        </button>
      </div>
    </div>
  );
}
