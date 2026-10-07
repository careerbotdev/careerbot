"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Field";
import { Icons } from "@/components/icons";
import { HERO } from "./words";

// The waitlist form (the Calm v3 boards): an email and Get notified, 52px tall, side by side from medium up and
// stacked, full width, on a phone. Joining replaces the form with HERO.joined (on every form of the page, through
// `joined`); a refusal (not an email, too many at once) shows under the field. `source`: where it was joined from.
// `tone`: "band" for the dark call-to-action band. `wide`: the field takes the row's width (the sign-in page), else it's
// 360 (300 in a band). `email`: filled in already (the account a sign-in was refused for). `cta`: the button's words.
// `website` is a field people never see: a bot fills it in and is told it worked.

// The page's own form, which the header's Get notified, the band's phone button and the sign-in page send people to:
// the hero's on Home, the closing's on the other pages.
export const WAITLIST_ID = "waitlist";

// Scrolls the page's form into view and puts the cursor in its field (or, once joined, on its answer).
export function goToWaitlist() {
  const box = document.getElementById(WAITLIST_ID);
  if (!box) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  box.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  box.querySelector<HTMLElement>("input[type=email], [role=status]")?.focus({ preventScroll: true });
}

type Tone = "page" | "band";

// The answer once joined, in place of the form.
export function Joined({ tone = "page", focus = false }: { tone?: Tone; focus?: boolean }) {
  const done = useRef<HTMLParagraphElement>(null);
  // The form that was sent is gone: its answer takes the focus, so it's read out and Tab carries on from there.
  useEffect(() => {
    if (focus) done.current?.focus();
  }, [focus]);
  return (
    <p
      ref={done}
      role="status"
      tabIndex={-1}
      data-theme={tone === "band" ? "dark" : undefined}
      className="flex min-h-13 items-center gap-2 text-site-control leading-site-control font-medium text-text outline-none"
    >
      <Icons.done aria-hidden className="shrink-0 text-good" />
      {HERO.joined}
    </p>
  );
}

export function Waitlist({
  source,
  joined,
  onJoined,
  tone = "page",
  wide = false,
  email: filled = "",
  cta = HERO.cta,
}: {
  source: string;
  joined: boolean;
  onJoined: () => void;
  tone?: Tone;
  wide?: boolean;
  email?: string;
  cta?: string;
}) {
  const join = useMutation(api.waitlist.join);
  const [email, setEmail] = useState(filled);
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);

  if (joined) return <Joined tone={tone} focus={submitted} />;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSending(true);
    setError(undefined);
    join({ email, source, website })
      .then(() => {
        setSubmitted(true);
        onJoined();
      })
      .catch((err: unknown) => setError(err instanceof ConvexError ? String(err.data) : "Couldn’t join right now. Try again."))
      .finally(() => setSending(false));
  };

  // The field and button take 16px type everywhere, so a phone doesn't zoom in on the field. In a band the field is a
  // shade lighter than the band (the dark scope's subtle).
  const type = "text-site-control! leading-site-control!";
  const field = tone === "band" ? "bg-subtle! border-border!" : "border-control-border!";
  const width = wide ? "md:min-w-0 md:flex-1" : tone === "band" ? "md:w-75" : "md:w-90";
  return (
    <form
      onSubmit={submit}
      data-theme={tone === "band" ? "dark" : undefined}
      className={`flex w-full flex-col gap-2.5 text-left md:flex-row md:items-start ${wide ? "" : "md:w-auto"}`}
    >
      <Field label="Email" hideLabel error={error} className={width}>
        {(p) => (
          <Input
            {...p}
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(undefined);
            }}
            className={`h-13! rounded-site-field! px-4! md:px-4.5! ${type} ${p["aria-invalid"] ? "" : `${field} focus:border-steel!`}`}
          />
        )}
      </Field>
      <div aria-hidden="true" className="sr-only">
        <input tabIndex={-1} name="website" autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={sending}
        loadingLabel="Joining"
        className={`h-13! w-full rounded-site-field! px-6! font-semibold! md:w-auto ${type}`}
        detail="Adds your email to the waitlist: one email when the hosted version opens."
        note="Free. Email privacy@careerbot.dev to be taken off."
      >
        {cta}
      </Button>
    </form>
  );
}
