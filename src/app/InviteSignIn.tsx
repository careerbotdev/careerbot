"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { NotAllowed } from "../../convex/allowlist";
import { ErrorLine } from "@/components/Field";
import { Icons } from "@/components/icons";
import { usd } from "./settings/Budgets";
import { Tag } from "./site/Tag";
import { INVITE, SIGN_IN } from "./site/words";
import { linkLook, OAuthButtons, type OAuthProvider, SignInFrame, SignInHeading } from "./signInParts";

// An invite's page on careerbot.dev (/invite/<token>; Invite in Paper's Sign in and getting started): what the beta is
// (AI included up to the monthly allowance, no charge, invite-only) and Google and GitHub, for the invited email. An
// invite that expired, was withdrawn or used, or a link that's no invite's, says so and still offers sign-in for
// people who already signed up. A refused sign-in says why: another account than the invited one, or suspended.

export type Invite = FunctionReturnType<typeof api.invites.lookup>;

export function InviteScreen({
  invite,
  notAllowed,
  methods,
  failed = false,
  going,
  onSignIn,
  onTryAnother,
}: {
  // undefined while it's loading.
  invite: Invite | undefined;
  notAllowed: NotAllowed | null;
  methods: readonly string[] | undefined;
  failed?: boolean;
  going?: OAuthProvider;
  onSignIn: (provider: OAuthProvider) => void;
  onTryAnother: () => void;
}) {
  if (!invite) return <SignInFrame>{null}</SignInFrame>;
  const refused =
    notAllowed &&
    (notAllowed.reason === "suspended" ? INVITE.suspended : invite.email && invite.state === "open" ? INVITE.wrongAccount(invite.email, notAllowed.email) : INVITE[invite.state === "open" ? "unknown" : invite.state]);
  const words = refused ?? (invite.state === "open" && invite.email ? { heading: INVITE.heading, body: INVITE.body(invite.email) } : INVITE[invite.state === "open" ? "unknown" : invite.state]);
  const welcome = !refused && invite.state === "open";
  return (
    <SignInFrame>
      <div role={refused ? "alert" : undefined} className="flex w-full max-w-100 flex-col items-start">
        <Tag icon="inviteOnly">{SIGN_IN.tag}</Tag>
        <SignInHeading refused={!welcome}>{words.heading}</SignInHeading>
        <p className="pt-3 text-site-body-lg-sm leading-site-body-lg-sm text-muted">{words.body}</p>
        {welcome && (
          <ul aria-label="Included" className="flex flex-col gap-2 pt-5">
            {INVITE.included(invite.allowanceUsd === null ? null : usd(invite.allowanceUsd)).map((line) => (
              <li key={line} className="flex items-center gap-2.5 text-site-note leading-site-note text-text">
                <Icons.approve aria-hidden className="size-4 shrink-0 text-good" />
                {line}
              </li>
            ))}
          </ul>
        )}
        {failed && (
          <div className="pt-6">
            <ErrorLine>Sign-in didn’t work. Try again.</ErrorLine>
          </div>
        )}
        {refused ? (
          <div className="flex min-h-11 items-center pt-6">
            <button type="button" className={linkLook} onClick={onTryAnother}>
              {INVITE.other}
            </button>
          </div>
        ) : (
          <div className={`w-full ${failed ? "pt-4" : "pt-8"}`}>
            <OAuthButtons methods={methods} going={going} invited onSignIn={onSignIn} />
          </div>
        )}
      </div>
    </SignInFrame>
  );
}
