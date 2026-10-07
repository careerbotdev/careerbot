"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { ApolloBalance } from "../../../convex/apolloKey";
import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Field";
import type { ScreenSize } from "@/components/Panes";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { useDemo } from "../demo/demo";
import { useConfirm } from "../shell/ShellContext";
import { monthDay, SettingsPane } from "./ui";

// The workspace's keys: each masked to its last four with when it was added, Replace (a field that checks the new key
// before it takes the old one's place) and Remove (asks first). Apollo also shows what's left on the plan this cycle.
// The demo carries no keys and calls out to nothing, which is all it says there.

type Status = { set: false } | { set: true; last4: string; setAt?: number };
type Saved = { ok: true } | { ok: false; message: string };

export function Keys({ size }: { size: ScreenSize }) {
  if (useDemo()) {
    return (
      <SettingsPane title="Keys" size={size}>
        <Text size="sm">The demo has no keys: nothing in it calls OpenRouter, Apollo or Brave Search.</Text>
      </SettingsPane>
    );
  }
  return <OwnKeys size={size} />;
}

function OwnKeys({ size }: { size: ScreenSize }) {
  const apollo = useQuery(api.apolloKey.status);
  const readBalance = useAction(api.apolloKey.balance);
  const [balance, setBalance] = useState<ApolloBalance | null>();
  const apolloSetAt = apollo?.set ? apollo.setAt : null;
  useEffect(() => {
    if (apolloSetAt !== null) void readBalance({}).then(setBalance, () => setBalance(null));
  }, [apolloSetAt, readBalance]);

  return (
    <SettingsPane title="Keys" size={size}>
      <div className="flex flex-col border-b">
        <KeyRow
          name="OpenRouter"
          line="Pays for every AI task, from your own OpenRouter account. Set a monthly limit on the key at OpenRouter too, as a second cap on AI spending."
          status={useQuery(api.openrouterKey.status)}
          save={api.openrouterKey.save}
          remove={api.openrouterKey.remove}
          removing="AI work stops until you add a key again."
          placeholder="sk-or-…"
          size={size}
        />
        <KeyRow
          name="Apollo"
          line="Finds companies, their details and job postings. Needs a master key, or one with company search, organization enrichment and credit usage."
          status={apollo}
          save={api.apolloKey.save}
          remove={api.apolloKey.remove}
          removing="Finding companies, their details and job postings through Apollo stops until you add a key again. Credits already used stay spent."
          size={size}
        >
          {apollo?.set && (
            <Text size="sm">
              {balance === undefined
                ? "Checking your Apollo credits…"
                : balance === null
                  ? "Couldn’t read your Apollo credits, so none will be spent."
                  : `${balance.left.toLocaleString("en-US")} credits left this cycle${balance.cycleEnd ? ` · renews ${monthDay(balance.cycleEnd)}` : ""}`}
            </Text>
          )}
        </KeyRow>
        <KeyRow
          name="Brave Search"
          line="Finds a company’s job board when its website doesn’t link one. Optional."
          status={useQuery(api.braveKey.status)}
          save={api.braveKey.save}
          remove={api.braveKey.remove}
          removing="Job boards are no longer looked up by search until you add a key again."
          size={size}
        />
      </div>
    </SettingsPane>
  );
}

function KeyRow({
  name,
  line,
  status,
  save,
  remove,
  removing,
  placeholder,
  size,
  children,
}: {
  name: string;
  line: string;
  status: Status | undefined;
  save: FunctionReference<"action", "public", { key: string }, Saved>;
  remove: FunctionReference<"mutation", "public", Record<string, never>, unknown>;
  // What stops when it's removed.
  removing: string;
  placeholder?: string;
  size: ScreenSize;
  children?: ReactNode;
}) {
  const saveKey = useAction(save);
  const removeKey = useMutation(remove);
  const ask = useConfirm();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const small = size === "small";

  const close = () => {
    setEditing(false);
    setKey("");
    setError(undefined);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    const result = await saveKey({ key }).catch((): Saved => ({ ok: false, message: "Couldn’t save the key. Try again." }));
    setSaving(false);
    if (!result.ok) return setError(result.message);
    close();
    toast({ message: `${name} key saved` });
  };
  const askToRemove = async () => {
    if (!(await ask({ title: `Remove the ${name} key?`, body: removing, confirmLabel: "Remove key" }))) return;
    await removeKey({});
    toast({ message: `${name} key removed` });
  };

  // Replace and Remove: beside the name in a wide pane, under the key and its details in a narrow one.
  const actions = (className: string) =>
    !editing && (
      <div className={`shrink-0 gap-2 ${className}`}>
        <Button size={small ? "lg" : "sm"} detail={status?.set ? `Paste a new ${name} key. The one you have keeps working until the new one is checked.` : `Paste your ${name} key. It’s checked with ${name} first.`} note="Free" onClick={() => setEditing(true)}>
          {status?.set ? "Replace" : "Add key"}
        </Button>
        {status?.set && (
          <Button size={small ? "lg" : "sm"} variant="ghost" detail={`Deletes the ${name} key from this workspace. ${removing}`} note="Free · Asks first · can’t be undone" onClick={() => void askToRemove()}>
            Remove
          </Button>
        )}
      </div>
    );
  if (status === undefined) return <div className="h-24 border-t" />;
  const set = status.set;
  return (
    <section aria-label={name} className="flex flex-col gap-2.5 border-t py-4">
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-body-md leading-body-md font-medium text-text">{name}</h3>
          <Text size="sm" muted>
            {line}
          </Text>
        </div>
        {actions("hidden @lg:flex")}
      </div>
      {editing ? (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-1.5">
          <Field label={`${set ? "New " : ""}${name} key`} error={error} hint={set ? "The old key keeps working until this one is checked." : undefined}>
            {(p) => (
              <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center">
                <Input {...p} autoFocus type="password" autoComplete="off" placeholder={placeholder} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Escape" && close()} className="min-w-0 font-mono @lg:flex-1" />
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" size={small ? "lg" : "md"} className={small ? "flex-1" : ""} loading={saving} loadingLabel="Checking" reason={key.trim() ? undefined : `Paste the ${name} key first.`} detail={`Checks the key with ${name}, then saves it for this workspace.`} note={set ? "Free · Replace it again to change it" : "Free · Undo by removing it"}>
                    Save key
                  </Button>
                  <Button variant="ghost" size={small ? "lg" : "md"} onClick={close}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Field>
        </form>
      ) : (
        set && (
          <div className="flex items-center gap-2.5">
            <span className="rounded-sm bg-subtle px-1.5 py-0.5 font-mono text-mono leading-mono font-medium text-text">••••{status.last4}</span>
            {status.setAt !== undefined && (
              <Text size="sm" muted>
                Added {monthDay(status.setAt)}
              </Text>
            )}
          </div>
        )
      )}
      {!editing && children}
      {actions("flex pt-1 @lg:hidden")}
    </section>
  );
}
