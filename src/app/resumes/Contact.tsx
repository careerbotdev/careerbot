"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type KeyboardEvent, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Contact } from "../../../convex/resumeDoc";
import { Field, Input } from "@/components/Field";
import { Icons } from "@/components/icons";
import { KeyHint } from "@/components/Kbd";

// The contact block at the top of the resume, edited in place: name, location, email, phone and links. One block for
// every resume and every download; never read by an AI step. Enter saves, Esc puts it back.

const empty = (c: Contact | null) => ({ name: c?.name ?? "", location: c?.location ?? "", email: c?.email ?? "", phone: c?.phone ?? "", links: (c?.links ?? []).join(", ") });

export function ContactBlock({ contact, small = false }: { contact: Contact | null; small?: boolean }) {
  const save = useMutation(api.profile.save);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(() => empty(contact));
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<keyof typeof f>("name");
  const open = (at: keyof typeof f = "name") => {
    setF(empty(contact));
    setError(null);
    setFocus(at);
    setEditing(true);
  };
  if (!editing && contact) {
    const rest = [contact.location, contact.email, contact.phone, ...contact.links].filter(Boolean);
    return (
      <header className="flex flex-col gap-1">
        <button type="button" onClick={() => open()} className="-mx-1 rounded-sm px-1 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-steel" aria-label="Edit the contact block">
          <span className="block text-title-lg leading-title-lg font-semibold text-text">{contact.name}</span>
          <span className="block text-body-sm leading-body-sm text-muted">{rest.join("  ·  ")}</span>
        </button>
        {contact.links.length === 0 && (
          <button type="button" onClick={() => open("links")} className="tap flex w-fit items-center gap-1 rounded-sm text-body-sm leading-body-sm text-muted hover:text-text">
            <Icons.add aria-hidden size={14} />
            Add a link
          </button>
        )}
      </header>
    );
  }
  const done = () =>
    void save({ ...f, links: f.links.split(",") })
      .then(() => setEditing(false))
      .catch((e: unknown) => setError(e instanceof ConvexError ? String(e.data) : "Couldn’t save."));
  const cancel = () => {
    setEditing(false);
    setF(empty(contact));
    setError(null);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      done();
    } else if (e.key === "Escape" && contact) {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };
  const field = (k: keyof typeof f, label: string, placeholder?: string, type = "text") => (
    <Field label={label} className="min-w-0 flex-1" error={k === "name" ? (error ?? undefined) : undefined}>
      {(p) => <Input {...p} type={type} autoFocus={editing && focus === k} placeholder={placeholder} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />}
    </Field>
  );
  return (
    <div role="group" aria-label="Contact block" onKeyDown={onKeyDown} className="-mx-3 -mt-2 flex flex-col gap-2.5 rounded-sm bg-subtle p-3">
      <div className={`flex gap-2.5 ${small ? "flex-col" : ""}`}>
        {field("name", "Name", "Your name")}
        {field("location", "Location", "City, State")}
      </div>
      <div className={`flex gap-2.5 ${small ? "flex-col" : ""}`}>
        {field("email", "Email", undefined, "email")}
        {field("phone", "Phone")}
      </div>
      {field("links", "Links", "linkedin.com/in/…, github.com/…")}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 text-label leading-label text-muted">Used on every resume and at the top of downloads.</span>
        <KeyHint keys="↵" onClick={done}>
          Save
        </KeyHint>
        {contact && (
          <KeyHint keys="Esc" onClick={cancel}>
            Cancel
          </KeyHint>
        )}
      </div>
    </div>
  );
}
