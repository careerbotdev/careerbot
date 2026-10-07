"use client";

import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/Button";
import { ErrorLine, Input, type InputProps } from "@/components/Field";
import { Icons } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { Tooltip } from "@/components/Tooltip";
import { SignInScene } from "./site/mockups/Hero";

// The parts every signed-out screen is made of (Sign in in Paper's Website v3 — Calm; Self-hosted — … boards on
// Self-hosting and getting started): the logo, the hero scene beside the form on a large screen (above it on a phone),
// and the form's 52px fields, links and code.

export function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full flex-col bg-surface text-text lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
      <header className="flex h-17 shrink-0 items-center px-5 md:px-10 lg:col-start-1 lg:row-start-1 lg:h-auto lg:px-16 lg:pt-10">
        {/* A plain link on purpose: it loads the whole page, which the analytics count (site/nav.ts). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="rounded-sm">
          <span className="inline-flex lg:hidden">
            <Logo height={21} />
          </span>
          <span className="hidden lg:inline-flex">
            <Logo height={26} />
          </span>
        </a>
      </header>
      <div className="h-49.5 shrink-0 px-5 pt-2 md:px-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:p-6">
        <SignInScene />
      </div>
      <div className="flex flex-col px-5 pt-8 pb-10 md:px-10 lg:col-start-1 lg:row-start-2 lg:justify-center lg:pt-0 lg:pr-16 lg:pb-26.5 lg:pl-40">{children}</div>
    </main>
  );
}

export const linkLook = "tap rounded-sm text-site-note leading-site-note font-medium text-text underline decoration-1 underline-offset-3";

// careerbot.dev's sign-in and the demo's entry: the page's heading under its tag, 40px on a phone and 48 from large up;
// `refused` (This account isn't invited yet) is smaller, being a sentence.
export function SignInHeading({ children, refused = false }: { children: string; refused?: boolean }) {
  const size = refused
    ? "text-site-not-invited-sm leading-site-not-invited-sm tracking-site-not-invited-sm lg:text-site-callout lg:leading-site-callout lg:tracking-site-callout"
    : "text-site-heading leading-site-heading tracking-site-heading lg:text-site-section lg:leading-site-section lg:tracking-site-section";
  return <h1 className={`pt-6 font-semibold ${size}`}>{children}</h1>;
}

// The form's heading: 36px on a phone, 44 from large up.
export function FormHeading({ children }: { children: string }) {
  return <h1 className="text-site-step leading-site-step font-semibold tracking-site-callout lg:text-site-callout lg:leading-site-callout">{children}</h1>;
}

// What went wrong with the whole form (That username and password don't match), above its fields.
export function FormProblem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-site-field bg-red/10 px-3.5 py-3 text-site-note leading-site-note text-text">
      {children}
    </p>
  );
}

// A command to run where CareerBot was installed, in mono on a grey block. Long ones wrap at their spaces.
export function Command({ children }: { children: string }) {
  return <code className="block rounded-site-tile bg-subtle px-3 py-2 font-mono text-label leading-body-md wrap-break-word text-text">{children}</code>;
}

const fieldLook = "h-13! rounded-site-field! px-4! text-site-control! leading-site-control!";

// A labelled 52px field: the label (with `aside` at its right, such as Forgot password?), the control, then the hint
// or, in its place, what's wrong.
export function SiteField({
  label,
  aside,
  hint,
  error,
  children,
}: {
  label: string;
  aside?: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; className: string }) => ReactNode;
}) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-body-md leading-body-md font-medium text-text">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, "aria-describedby": note ? `${id}-note` : undefined, "aria-invalid": error ? true : undefined, className: `${fieldLook} ${error ? "" : "border-control-border! focus-within:border-steel!"}` })}
      {error ? (
        <ErrorLine id={`${id}-note`}>{error}</ErrorLine>
      ) : (
        hint && (
          <div id={`${id}-note`} className="flex flex-col gap-2 text-body-md leading-body-md text-muted">
            {hint}
          </div>
        )
      )}
    </div>
  );
}

// A password field with Show password.
export function PasswordInput(props: Omit<InputProps, "type" | "suffix">) {
  const [shown, setShown] = useState(false);
  const label = shown ? "Hide password" : "Show password";
  const Icon = shown ? Icons.hidePassword : Icons.showPassword;
  return (
    <Input
      {...props}
      type={shown ? "text" : "password"}
      suffix={
        <Tooltip content={label}>
          <button type="button" aria-label={label} aria-pressed={shown} onClick={() => setShown(!shown)} className="tap -mr-2 flex size-11 items-center justify-center rounded-sm text-muted transition-colors duration-100 hover:text-text">
            <Icon aria-hidden className="size-4.5" />
          </button>
        </Tooltip>
      }
    />
  );
}

export type OAuthProvider = "google" | "github";
const PROVIDERS: Record<OAuthProvider, string> = { google: "Google", github: "GitHub" };

// Continue with Google and Continue with GitHub, for the ones this copy has set up. `invited`: careerbot.dev's words.
export function OAuthButtons({ methods, going, invited, onSignIn }: { methods: readonly string[] | undefined; going?: OAuthProvider; invited: boolean; onSignIn: (provider: OAuthProvider) => void }) {
  return (
    <div className="flex w-full flex-col gap-2.5">
      {(Object.keys(PROVIDERS) as OAuthProvider[])
        .filter((p) => methods?.includes(p))
        .map((p) => (
          <Button
            key={p}
            variant="outline"
            size="lg"
            icon={p}
            loading={going === p}
            disabled={!!going && going !== p}
            className="h-13! w-full gap-2.5! rounded-site-field! border-control-border! text-site-control! leading-site-control! [&_svg]:size-4.5"
            detail={`Signs you in with your ${PROVIDERS[p]} account${invited ? ", if it was invited" : ""}.`}
            note="Free"
            onClick={() => onSignIn(p)}
          >
            Continue with {PROVIDERS[p]}
          </Button>
        ))}
    </div>
  );
}
