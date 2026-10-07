"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { type FormEvent, type ReactNode, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { NotAllowed } from "../../convex/allowlist";
import { normalUsername, passwordProblem, type PasswordRefusal, usernameProblem } from "../../convex/passwordRules";
import { Button } from "@/components/Button";
import { ErrorLine, Input } from "@/components/Field";
import { Icons } from "@/components/icons";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { Command, FormHeading, FormProblem, linkLook, OAuthButtons, type OAuthProvider, PasswordInput, SignInFrame, SiteField } from "./signInParts";

// The signed-out screen of a self-hosted copy (mode.ts; the Self-hosted — … boards on Self-hosting and getting
// started). Until the copy has its owner: Create your account, with the setup code the installer printed. After that:
// Sign in with a username and password, and Google and GitHub below when this copy has them set up. Forgot password?
// says how to get a new one (there's no email here: the owner resets it). A temporary password, from the owner, leads
// to Choose a new password. A Google or GitHub account that isn't let in (SIGNUP_ALLOWLIST) is told to ask the owner.

type Refusal = PasswordRefusal | null;
type View = "signIn" | "forgot" | "newPassword";
// Where the screen starts: its stories start part-way through (a username typed, a temporary password, a refusal).
export type Start = { view: View; username?: string; password?: string; refusal?: Refusal };

export function SelfHostedSignIn({
  methods,
  notAllowed,
  failed,
  going,
  onOAuth,
  onTryAnother,
}: {
  methods: readonly string[] | undefined;
  notAllowed: NotAllowed | null;
  failed: boolean;
  going?: OAuthProvider;
  onOAuth: (provider: OAuthProvider) => void;
  onTryAnother: () => void;
}) {
  const { signIn } = useAuthActions();
  const ownerNeeded = useQuery(api.account.ownerNeeded);
  // Each resolves with why it was refused, or null once signed in.
  const send = async (params: Record<string, string>): Promise<Refusal> => {
    try {
      await signIn("password", params);
      return null;
    } catch (e) {
      const data: unknown = e instanceof ConvexError ? e.data : undefined;
      if (data && typeof data === "object" && "kind" in data && data.kind === "password") return data as PasswordRefusal;
      return { kind: "password", reason: "invalid", message: "Sign-in didn’t work. Try again." };
    }
  };
  return (
    <SelfHostedScreen
      methods={methods}
      ownerNeeded={ownerNeeded}
      notAllowed={notAllowed}
      oauthFailed={failed}
      going={going}
      onOAuth={onOAuth}
      onTryAnother={onTryAnother}
      onCreate={(p) => send({ flow: "signUp", ...p })}
      onSignIn={(p) => send({ flow: "signIn", ...p })}
      onNewPassword={async (p) => {
        const refusal = await send({ flow: "newPassword", ...p });
        if (!refusal) toast({ message: "Password saved. You’re signed in.", icon: "done" });
        return refusal;
      }}
    />
  );
}

export function SelfHostedScreen({
  methods,
  ownerNeeded,
  notAllowed,
  oauthFailed = false,
  going,
  start = { view: "signIn" },
  onOAuth,
  onTryAnother,
  onCreate,
  onSignIn,
  onNewPassword,
}: {
  methods: readonly string[] | undefined;
  ownerNeeded: boolean | undefined;
  notAllowed: NotAllowed | null;
  oauthFailed?: boolean;
  going?: OAuthProvider;
  start?: Start;
  onOAuth: (provider: OAuthProvider) => void;
  onTryAnother: () => void;
  onCreate: (p: { setupCode: string; username: string; password: string }) => Promise<Refusal>;
  onSignIn: (p: { username: string; password: string }) => Promise<Refusal>;
  onNewPassword: (p: { username: string; password: string; newPassword: string }) => Promise<Refusal>;
}) {
  const [view, setView] = useState<View>(start.view);
  const [username, setUsername] = useState(start.username ?? "");
  // The temporary password they signed in with, kept for Choose a new password.
  const [temporary, setTemporary] = useState(start.password ?? "");
  let body: ReactNode = null;
  if (methods === undefined || ownerNeeded === undefined) body = null;
  else if (ownerNeeded) body = <CreateAccount onCreate={onCreate} />;
  else if (notAllowed) body = <NotLetIn email={notAllowed.email} onTryAnother={onTryAnother} />;
  else if (view === "forgot") body = <Forgot username={username} onBack={() => setView("signIn")} />;
  else if (view === "newPassword")
    body = <ChoosePassword refusal={start.view === "newPassword" ? start.refusal : undefined} onSave={(newPassword) => onNewPassword({ username, password: temporary, newPassword })} />;
  else
    body = (
      <SignInForm
        methods={methods}
        username={username}
        onUsername={setUsername}
        refusal={start.view === "signIn" ? start.refusal : undefined}
        oauthFailed={oauthFailed}
        going={going}
        onOAuth={onOAuth}
        onForgot={() => setView("forgot")}
        onSignIn={async (password) => {
          const refusal = await onSignIn({ username, password });
          if (refusal?.reason !== "newPasswordNeeded") return refusal;
          setTemporary(password);
          setView("newPassword");
          return null;
        }}
      />
    );
  return (
    <SignInFrame>
      <div className="flex w-full max-w-100 flex-col lg:max-w-110">{body}</div>
    </SignInFrame>
  );
}

const lead = "pt-3 text-site-body-lg-sm leading-site-body-lg-sm text-muted";
const primary = "h-13! w-full rounded-site-field! px-6! font-semibold! text-site-control! leading-site-control!";

// A form that sends once at a time and shows what came back.
function useSending(run: () => Promise<Refusal | undefined>) {
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setRefusal(null);
    run()
      .then((r) => setRefusal(r ?? null))
      .finally(() => setSending(false));
  };
  return { sending, refusal, setRefusal, submit };
}

function CreateAccount({ onCreate }: { onCreate: (p: { setupCode: string; username: string; password: string }) => Promise<Refusal> }) {
  const [setupCode, setSetupCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problems, setProblems] = useState<{ setupCode?: string; username?: string; password?: string; confirm?: string }>({});
  const form = useSending(async () => {
    const found = {
      setupCode: setupCode.trim() ? undefined : "Enter the setup code.",
      username: usernameProblem(username) ?? undefined,
      password: passwordProblem(password) ?? undefined,
      confirm: confirm === password ? undefined : "The passwords don’t match.",
    };
    setProblems(found);
    if (Object.values(found).some(Boolean)) return null;
    return await onCreate({ setupCode, username: normalUsername(username), password });
  });
  const codeRefused = form.refusal?.reason === "setupCode" ? form.refusal.message : undefined;
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col">
      <FormHeading>Create your account</FormHeading>
      <p className={`${lead} pb-6`}>The first account here owns this copy of CareerBot, and decides who else can sign in.</p>
      {form.refusal && !codeRefused && (
        <div className="pb-4">
          <FormProblem>{form.refusal.message}</FormProblem>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <SiteField
          label="Setup code"
          error={problems.setupCode ?? codeRefused}
          hint={
            <>
              <p>A one-time code from when CareerBot was installed. It makes sure the first account belongs to whoever set this copy up, not whoever finds this page first. It’s in the convex-setup service’s logs: in Coolify or Dokploy, open that service’s logs; with Docker Compose, run docker compose logs convex-setup.</p>
              <p className="flex flex-col gap-1.5">
                Lost it? Deploy CareerBot again (Redeploy in Coolify or Dokploy) to get a new one, or run this where you installed it:
                <Command>docker compose run --rm convex-setup new-setup-code</Command>
              </p>
            </>
          }
        >
          {(p) => (
            <Input
              {...p}
              name="setupCode"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              className={`${p.className} font-mono uppercase`}
            />
          )}
        </SiteField>
        <SiteField label="Username" error={problems.username}>
          {(p) => <Input {...p} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />}
        </SiteField>
        <SiteField label="Password" hint="At least 8 characters." error={problems.password}>
          {(p) => <PasswordInput {...p} name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </SiteField>
        <SiteField label="Confirm password" error={problems.confirm}>
          {(p) => <PasswordInput {...p} name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </SiteField>
      </div>
      <div className="pt-6">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={form.sending}
          loadingLabel="Creating account"
          className={primary}
          detail="Creates the owner account for this copy of CareerBot and signs you in. After this, only the owner can add people."
          note="Free"
        >
          Create account
        </Button>
      </div>
    </form>
  );
}

function SignInForm({
  methods,
  username,
  onUsername,
  refusal: started,
  oauthFailed,
  going,
  onOAuth,
  onForgot,
  onSignIn,
}: {
  methods: readonly string[];
  username: string;
  onUsername: (username: string) => void;
  refusal?: Refusal;
  oauthFailed: boolean;
  going?: OAuthProvider;
  onOAuth: (provider: OAuthProvider) => void;
  onForgot: () => void;
  onSignIn: (password: string) => Promise<Refusal>;
}) {
  const [password, setPassword] = useState("");
  const form = useSending(async () => (username.trim() && password ? await onSignIn(password) : { kind: "password", reason: "wrongPassword", message: "Enter your username and password." }));
  const refusal = form.refusal ?? started ?? null;
  const passwords = methods.includes("password");
  const oauth = methods.some((m) => m !== "password");
  return (
    <div className="flex flex-col">
      <FormHeading>Sign in</FormHeading>
      <div className="flex flex-col gap-4 pt-6">
        {refusal && <FormProblem>{refusal.message}</FormProblem>}
        {oauthFailed && <ErrorLine>Sign-in didn’t work. Try again.</ErrorLine>}
        {!passwords && <ErrorLine>This copy’s Convex isn’t set up for username and password sign-in: set CAREERBOT_MODE=self-hosted in its environment.</ErrorLine>}
      </div>
      {passwords && (
        <form noValidate onSubmit={form.submit} className={`flex flex-col ${refusal || oauthFailed ? "pt-4" : ""}`}>
          <div className="flex flex-col gap-4">
            <SiteField label="Username">
              {(p) => <Input {...p} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => onUsername(e.target.value)} />}
            </SiteField>
            <SiteField
              label="Password"
              aside={
                <Tooltip content="Forgot password?" detail="Shows how to get a new password on this copy." note="Free">
                  <button type="button" className={linkLook} onClick={onForgot}>
                    Forgot password?
                  </button>
                </Tooltip>
              }
            >
              {(p) => <PasswordInput {...p} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </SiteField>
          </div>
          <div className="pt-6">
            <Button type="submit" variant="primary" size="lg" loading={form.sending} loadingLabel="Signing in" className={primary} detail="Signs you in to your workspace on this copy." note="Free">
              Sign in
            </Button>
          </div>
        </form>
      )}
      {oauth && (
        <>
          {passwords && (
            <div className="flex items-center gap-3 py-5 text-body-md leading-body-md text-muted">
              <span className="h-px grow bg-border" />
              or
              <span className="h-px grow bg-border" />
            </div>
          )}
          <OAuthButtons methods={methods} going={going} invited={false} onSignIn={onOAuth} />
        </>
      )}
    </div>
  );
}

// Copies a command, and says so.
function CopyCommand({ command }: { command: string }) {
  return (
    <div className="flex items-start gap-3 rounded-site-field bg-subtle py-3.5 pr-2 pl-4">
      <code className="min-w-0 grow font-mono text-body-sm leading-body-md wrap-break-word whitespace-pre-wrap text-text">{command}</code>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="copy"
        aria-label="Copy"
        detail="Copies the command."
        note="Free"
        onClick={() => void navigator.clipboard.writeText(command).then(() => toast({ message: "Command copied.", icon: "copy" }))}
      />
    </div>
  );
}

function Forgot({ username, onBack }: { username: string; onBack: () => void }) {
  const name = normalUsername(username) || "your-username";
  return (
    <div className="flex flex-col">
      <FormHeading>Reset your password</FormHeading>
      <p className={`${lead} pb-6`}>Passwords on this copy of CareerBot are reset by its owner.</p>
      <section className="flex flex-col gap-1 border-t py-5">
        <h2 className="text-title-md leading-6 font-semibold text-text">Someone else runs this copy</h2>
        <p className="text-site-body-sm leading-site-body-sm text-muted">Ask them to reset it in Settings, Account. You’ll sign in with the temporary password they give you, then choose your own.</p>
      </section>
      <section className="flex flex-col gap-3 border-t py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-md leading-6 font-semibold text-text">You run this copy</h2>
          <p className="text-site-body-sm leading-site-body-sm text-muted">Run this where you set CareerBot up. It prints a temporary password to sign in with.</p>
        </div>
        <CopyCommand command={`docker compose run --rm convex-setup \\\n  reset-password ${name}`} />
        <p className="text-body-md leading-body-md text-muted">
          Without Docker: <code className="font-mono text-label">npx convex run account:resetPassword &apos;{JSON.stringify({ username: name })}&apos;</code>. No terminal? Run account:resetPassword from the Functions page of your Convex dashboard.
        </p>
      </section>
      <div className="flex min-h-11 items-center pt-2">
        <button type="button" className={linkLook} onClick={onBack}>
          Back to sign in
        </button>
      </div>
    </div>
  );
}

function ChoosePassword({ refusal: started, onSave }: { refusal?: Refusal; onSave: (newPassword: string) => Promise<Refusal> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problems, setProblems] = useState<{ password?: string; confirm?: string }>({});
  const form = useSending(async () => {
    const found = { password: passwordProblem(password) ?? undefined, confirm: confirm === password ? undefined : "The passwords don’t match." };
    setProblems(found);
    if (found.password || found.confirm) return null;
    return await onSave(password);
  });
  const refusal = form.refusal ?? started ?? null;
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col">
      <FormHeading>Choose a new password</FormHeading>
      <p className={`${lead} pb-6`}>You signed in with a temporary password. Choose your own to carry on.</p>
      {refusal && (
        <div className="pb-4">
          <FormProblem>{refusal.message}</FormProblem>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <SiteField label="New password" hint="At least 8 characters." error={problems.password}>
          {(p) => <PasswordInput {...p} name="newPassword" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </SiteField>
        <SiteField label="Confirm new password" error={problems.confirm}>
          {(p) => <PasswordInput {...p} name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </SiteField>
      </div>
      <div className="pt-6">
        <Button type="submit" variant="primary" size="lg" loading={form.sending} loadingLabel="Saving" className={primary} detail="Saves your new password and signs you in. The temporary one stops working." note="Free">
          Save and sign in
        </Button>
      </div>
    </form>
  );
}

// A Google or GitHub account this copy doesn't let in (SIGNUP_ALLOWLIST).
function NotLetIn({ email, onTryAnother }: { email: string | null; onTryAnother: () => void }) {
  return (
    <div role="alert" className="flex flex-col">
      <FormHeading>This account can’t sign in to this copy</FormHeading>
      <p className={lead}>
        {email ? `${email} isn’t one of the accounts this copy lets in. ` : ""}Ask its owner to add you.
      </p>
      <div className="flex min-h-11 items-center gap-1.5 pt-5">
        <Icons.back aria-hidden className="text-muted" />
        <button type="button" className={linkLook} onClick={onTryAnother}>
          Try another account
        </button>
      </div>
    </div>
  );
}
