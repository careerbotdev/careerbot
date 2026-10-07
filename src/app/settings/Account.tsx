"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { type FormEvent, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Person } from "../../../convex/account";
import { passwordProblem, type PasswordRefusal, usernameProblem } from "../../../convex/passwordRules";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, Input } from "@/components/Field";
import { Menu } from "@/components/Menu";
import type { ScreenSize } from "@/components/Panes";
import { toast } from "@/components/Toast";
import { SELF_HOSTED } from "../mode";
import { day } from "../pursuits/dates";
import { useConfirm } from "../shell/ShellContext";
import { SettingsPane } from "./ui";

const PROVIDERS: Record<string, string> = { google: "Google", github: "GitHub", password: "Password" };

// Who's signed in, how, and to which workspace; and Sign out (the page's, so stories can stand in for it). On a
// self-hosted copy (Settings — Account, self-hosted in Paper): their username and Change password, and for the owner,
// People: everyone who can sign in, Add a person, and for each Reset password and Remove, with the temporary password
// to give them.
export function Account({ size, signOut, selfHosted = SELF_HOSTED }: { size: ScreenSize; signOut: () => void; selfHosted?: boolean }) {
  const me = useQuery(api.users.me);
  const workspace = useQuery(api.workspaces.current);
  const small = size === "small";
  const rows: [string, string | null | undefined][] = selfHosted
    ? [
        ...(me?.name && me.name !== me.username ? [["Name", me.name] as [string, string]] : []),
        ...(me?.username ? [["Username", me.username] as [string, string]] : []),
        ...(me?.email ? [["Email", me.email] as [string, string]] : []),
        ["Signed in with", me?.provider ? (PROVIDERS[me.provider] ?? me.provider) : null],
        ["Workspace", workspace?.name],
      ]
    : [
        ["Name", me?.name],
        ["Email", me?.email],
        ["Signed in with", me?.provider ? (PROVIDERS[me.provider] ?? me.provider) : null],
        ["Workspace", workspace?.name],
      ];
  const signOutButton = (
    <Button
      icon={selfHosted ? undefined : "signOut"}
      variant={selfHosted ? "ghost" : "secondary"}
      className="self-start"
      size={small ? "lg" : "md"}
      detail="Signs you out on this device and clears anything you were writing here that isn’t saved."
      note="Free · Sign in again to come back"
      onClick={signOut}
    >
      Sign out
    </Button>
  );
  return (
    <SettingsPane title="Account" size={size}>
      <div className="flex flex-col gap-8">
        <dl className="flex flex-col border-b">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 border-t py-3 @lg:flex-row @lg:items-baseline @lg:gap-6">
              <dt className="text-body-sm leading-body-sm text-muted @lg:w-40 @lg:shrink-0">{label}</dt>
              <dd className="min-w-0 text-body-md leading-body-md break-words text-text">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {selfHosted ? (
          <div className="flex flex-wrap gap-2">
            {me?.provider === "password" && me.username && <ChangePassword username={me.username} size={size} />}
            {signOutButton}
          </div>
        ) : (
          signOutButton
        )}
        {selfHosted && me?.owner && <People size={size} />}
      </div>
    </SettingsPane>
  );
}

// Change password: the current one, then a new one; their other devices are signed out (convex/account.ts, the
// "newPassword" flow, which signs this device in again).
function ChangePassword({ username, size }: { username: string; size: ScreenSize }) {
  // Not destructured here: the Settings stories render this with no auth provider, and only a submit needs it.
  const auth = useAuthActions();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problems, setProblems] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [sending, setSending] = useState(false);
  const reset = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) [setCurrent, setNext, setConfirm].forEach((set) => set(""));
    setProblems({});
  };
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const found = { current: current ? undefined : "Enter your current password.", next: passwordProblem(next) ?? undefined, confirm: confirm === next ? undefined : "The passwords don’t match." };
    setProblems(found);
    if (found.current || found.next || found.confirm) return;
    setSending(true);
    try {
      await auth.signIn("password", { flow: "newPassword", username, password: current, newPassword: next });
      reset(false);
      toast({ message: "Password changed. Your other devices are signed out.", icon: "done" });
    } catch (err) {
      const data: unknown = err instanceof ConvexError ? err.data : undefined;
      const refusal = data && typeof data === "object" && "kind" in data && data.kind === "password" ? (data as PasswordRefusal) : null;
      if (refusal?.reason === "wrongPassword") setProblems({ current: "That isn’t your current password." });
      else setProblems({ next: refusal?.message ?? "Couldn’t change it. Try again." });
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <Button size={size === "small" ? "lg" : "md"} detail="Asks for your current password, then a new one. Your other devices are signed out." note="Free" onClick={() => setOpen(true)}>
        Change password
      </Button>
      <Dialog
        open={open}
        onOpenChange={reset}
        title="Change password"
        footer={
          <>
            <Button variant="ghost" onClick={() => reset(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={sending} loadingLabel="Changing" detail="Saves your new password. Your other devices are signed out." note="Free" onClick={() => void submit()}>
              Change password
            </Button>
          </>
        }
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
          <Field label="Current password" error={problems.current}>
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
          <Field label="New password" hint="At least 8 characters." error={problems.next}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <Field label="Confirm new password" error={problems.confirm}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          <button type="submit" hidden />
        </form>
      </Dialog>
    </>
  );
}

type Issued = { userId: Id<"users"> | null; username: string; password: string; added: boolean };

// The owner's list of who can sign in.
function People({ size }: { size: ScreenSize }) {
  const people = useQuery(api.account.people);
  const methods = useQuery(api.auth.signInMethods);
  const resetPassword = useAction(api.account.resetPersonPassword);
  const remove = useAction(api.account.removePerson);
  const ask = useConfirm();
  const [adding, setAdding] = useState(false);
  // The temporary password just made, shown under its person until they leave the page.
  const [issued, setIssued] = useState<Issued | null>(null);
  const small = size === "small";

  const reset = async (person: Person) => {
    try {
      const made = await resetPassword({ userId: person.id });
      setIssued({ userId: person.id, username: made.username, password: made.temporaryPassword, added: false });
    } catch (e) {
      toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t reset the password. Try again.", icon: "failed" });
    }
  };
  const askToRemove = async (person: Person) => {
    const name = person.username ?? person.name ?? person.email ?? "this person";
    if (!(await ask({ title: `Remove ${name}?`, body: `Removes ${name}’s account and deletes their workspace: stories, record, resumes and pursuits.`, confirmLabel: "Remove" }))) return;
    try {
      await remove({ userId: person.id });
      if (issued?.userId === person.id) setIssued(null);
      toast({ message: `${name} removed` });
    } catch (e) {
      toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t remove them. Try again.", icon: "failed" });
    }
  };

  const add = (
    <Button
      variant="primary"
      size={small ? "lg" : "md"}
      className={small ? "w-full" : ""}
      detail="Adds an account to this copy, with a workspace of its own. You choose the username; you get a temporary password to give them."
      note="Free"
      onClick={() => setAdding(true)}
    >
      Add a person
    </Button>
  );
  const oauth = (methods ?? []).filter((m) => m !== "password").map((m) => PROVIDERS[m] ?? m);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <div className="flex grow flex-col gap-0.5">
          <h2 className="text-title-md leading-title-md font-semibold text-text">People</h2>
          <p className="text-body-sm leading-body-sm text-muted">Who can sign in to this copy. Each person has a workspace of their own.</p>
        </div>
        {!small && add}
      </div>
      <ul aria-label="People" className="flex flex-col border-b">
        {(people ?? []).map((person) => (
          <li key={person.id} className="flex flex-col border-t">
            <PersonRow person={person} small={small} onReset={() => void reset(person)} onRemove={() => void askToRemove(person)} />
            {issued && issued.userId === person.id && <TemporaryPassword issued={issued} />}
          </li>
        ))}
      </ul>
      <p className="text-body-sm leading-body-sm text-muted">
        {oauth.length
          ? `${oauth.join(" and ")} sign-in let in only the emails listed in SIGNUP_ALLOWLIST, in this copy’s .env (then docker compose up -d).`
          : "Google and GitHub sign-in are off. To offer them, add their keys to this copy’s .env, and the emails they may sign in with to SIGNUP_ALLOWLIST."}
      </p>
      {small && <div className="pt-3">{add}</div>}
      <AddPerson
        open={adding}
        onOpenChange={setAdding}
        onAdded={(made) => {
          setAdding(false);
          setIssued({ userId: null, username: made.username, password: made.temporaryPassword, added: true });
        }}
      />
      {issued?.userId === null && <TemporaryPassword issued={issued} />}
    </section>
  );
}

function PersonRow({ person, small, onReset, onRemove }: { person: Person; small: boolean; onReset: () => void; onRemove: () => void }) {
  const name = person.username ?? person.name ?? person.email ?? "Someone";
  const how = person.provider && person.provider !== "password" ? `Signs in with ${PROVIDERS[person.provider] ?? person.provider}${person.email ? ` as ${person.email}` : ""}` : null;
  const line = person.owner
    ? `Owner${person.you ? " · you" : ""}`
    : [how ?? `Added ${day(person.addedAt)}`, person.lastSignInAt ? `last signed in ${day(person.lastSignInAt)}` : person.temporaryPassword ? "hasn’t chosen a password yet" : null].filter(Boolean).join(" · ");
  const canReset = !person.you && person.provider === "password";
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-subtle text-label leading-label font-medium text-text uppercase">
        {name.slice(0, 1)}
      </span>
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-body-md leading-body-md font-medium text-text">{name}</span>
        <span className="text-body-sm leading-body-sm text-muted">{line}</span>
      </div>
      {!person.you && (
        <>
          {canReset && !small && (
            <Button size="sm" detail={`Makes a temporary password for ${name} and signs them out everywhere. Their old password stops working.`} note="Free · Can’t be undone" onClick={onReset}>
              Reset password
            </Button>
          )}
          <Menu
            label={`More for ${name}`}
            title={name}
            items={[
              ...(canReset && small
                ? [{ label: "Reset password", detail: `Makes a temporary password for ${name} and signs them out everywhere. Their old password stops working.`, note: "Free · Can’t be undone", onSelect: onReset }]
                : []),
              { label: "Remove", tone: "danger" as const, detail: `Removes ${name}’s account and deletes their workspace: stories, record, resumes and pursuits.`, note: "Free · Asks first · Can’t be undone", onSelect: onRemove },
            ]}
          />
        </>
      )}
    </div>
  );
}

// The temporary password just made, for the owner to give the person themselves.
function TemporaryPassword({ issued }: { issued: Issued }) {
  const copy = () => void navigator.clipboard.writeText(issued.password).then(() => toast({ message: "Temporary password copied.", icon: "copy" }));
  return (
    <div role="status" className="mb-2.5 flex flex-col gap-2 rounded-sm border border-steel bg-steel-subtle p-3">
      <p className="text-body-sm leading-body-sm font-medium text-text">Temporary password for {issued.username}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-sm bg-surface px-2 py-1 font-mono text-body-md leading-body-md text-text select-all">{issued.password}</code>
        <Button size="sm" detail="Copies the temporary password." note="Free" onClick={copy}>
          Copy
        </Button>
      </div>
      <p className="text-body-sm leading-body-sm text-muted">
        Give it to {issued.username} yourself. It works once; then they choose their own.
        {issued.added ? "" : " Their old password no longer works, and they’re signed out everywhere."}
      </p>
    </div>
  );
}

function AddPerson({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: (made: { username: string; temporaryPassword: string }) => void }) {
  const addPerson = useAction(api.account.addPerson);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const close = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setUsername("");
      setError(undefined);
    }
  };
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const problem = usernameProblem(username);
    if (problem) return setError(problem);
    setSending(true);
    try {
      const made = await addPerson({ username });
      setUsername("");
      setError(undefined);
      onAdded(made);
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Couldn’t add them. Try again.");
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add a person"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={sending}
            loadingLabel="Adding"
            detail="Adds an account to this copy, with a workspace of its own. You get a temporary password to give them."
            note="Free"
            onClick={() => void submit()}
          >
            Add a person
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-body-md leading-body-md text-muted">They sign in with the username you choose here and a temporary password you’ll give them; then they choose their own.</p>
        <Field label="Username" hint="2 to 32 letters, digits, dots, dashes or underscores." error={error}>
          {(p) => <Input {...p} autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
