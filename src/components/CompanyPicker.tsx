"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ErrorLine, Input } from "./Field";

// Choosing a company by its name (the Companies you like boards in Paper). Type a name and press Find (nothing is
// looked up while typing, since a search can cost): the companies with that name come back, each with its website and
// a line on what it does, and Add takes the one meant. A typed website needs no search, so Find becomes Add. When the
// one meant isn't there, Use a website instead turns the box into one for its website. The screen says what Find costs
// (`findNote`, shown beside it before it runs) and where the results came from (each result set's `source`).

export type FoundCompany = { name: string; domain: string; line: string | null };
export type Picked = { domain: string; name?: string };

// Looks like a website (acme.com, https://www.acme.com/about), not a name.
export const looksLikeWebsite = (s: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(s.trim());

export function CompanyPicker({
  label,
  find,
  website,
  onAdd,
  findNote,
  findDetail,
  addDetail,
  addNote = "Free · Undo with U",
  small,
}: {
  // What the box is for, for screen readers ("Add a company you like").
  label: string;
  // Find: the companies with this name, and where they came from with what it cost ("From Apollo · 1 credit used").
  find: (name: string) => Promise<{ companies: FoundCompany[]; source: string }>;
  // A typed website: its name from its own site, when it says it.
  website: (site: string) => Promise<{ domain: string; name: string | null }>;
  onAdd: (c: Picked) => Promise<unknown>;
  // What Find costs, beside it ("1 Apollo credit").
  findNote: string;
  findDetail: string;
  // What adding one does, for its Add button: a company found by name, or (null) a typed website.
  addDetail: (name: string | null) => string;
  // What adding one costs, under its explainer (a direction's: what each of its searches then costs).
  addNote?: string;
  small: boolean;
}) {
  const [text, setText] = useState("");
  const [byWebsite, setByWebsite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ name: string; companies: FoundCompany[]; source: string } | null>(null);
  const site = byWebsite || looksLikeWebsite(text);
  const size = small ? "lg" : "sm";
  // The screen's find, website and onAdd reject with words meant for the person.
  const fail = (e: unknown) => setError(e instanceof Error && e.message ? e.message : "Couldn’t do that. Try again.");

  const done = () => {
    setText("");
    setFound(null);
    setByWebsite(false);
    setError(null);
  };
  const add = (c: Picked) =>
    onAdd(c)
      .then(done)
      .catch(fail);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const run = site
      ? website(q).then((w) => add({ domain: w.domain, ...(w.name ? { name: w.name } : {}) }))
      : find(q).then((r) => setFound({ name: q, ...r }));
    void run.catch(fail).finally(() => setBusy(false));
  };

  const results = found && (
    <div aria-label="Companies found" className="flex flex-col rounded-sm border bg-surface">
      {found.companies.length > 0 ? (
        <>
          <p className="px-3 pt-2 pb-1 text-label leading-label font-medium text-muted">
            {found.companies.length} {found.companies.length === 1 ? "company" : "companies"} named {found.name}
          </p>
          <ul>
            {found.companies.map((c) => (
              <li key={c.domain} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0 max-md:py-3">
                <Avatar name={c.name} company size={28} />
                <span className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
                  <span className="flex min-w-0 gap-2 max-md:flex-col max-md:gap-0">
                    <span className="shrink-0 font-medium text-text max-md:text-body-md max-md:leading-body-md">{c.name}</span>
                    <span className="truncate text-muted">{c.domain}</span>
                  </span>
                  {c.line && <span className="text-text">{c.line}</span>}
                </span>
                <Button size={size} detail={addDetail(c.name)} note={addNote} onClick={() => void add({ domain: c.domain, name: c.name })}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 p-3 max-md:flex-col max-md:items-start">
          <p className="text-body-sm leading-body-sm text-text">No company named {found.name} found.</p>
          <UseWebsite size={size} onClick={() => (setByWebsite(true), setFound(null), setText(""))} />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t bg-subtle px-3 py-2 text-body-sm leading-body-sm max-md:flex-col max-md:items-start max-md:gap-1.5">
        <span className="text-muted">{found.source}</span>
        {found.companies.length > 0 && <UseWebsite size={size} link onClick={() => (setByWebsite(true), setFound(null), setText(""))} />}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Input
            aria-label={label}
            icon="search"
            className="min-w-0 flex-1"
            value={text}
            placeholder={byWebsite ? "Their website, like acme.com" : "Company name or website"}
            onChange={(e) => (setText(e.target.value), setError(null))}
          />
          {site ? (
            <Button type="submit" size={size} loading={busy} detail={addDetail(null)} note={addNote} reason={text.trim() ? undefined : "Type a website first."}>
              Add
            </Button>
          ) : (
            <Button type="submit" size={size} loading={busy} loadingLabel="Finding" detail={findDetail} note={`${findNote} · a website needs no search`} reason={text.trim() ? undefined : "Type a company’s name first."}>
              Find
            </Button>
          )}
          {!small && <span className="shrink-0 text-body-sm leading-body-sm text-muted">{site ? "Free" : findNote}</span>}
        </div>
        {small && <span className="text-body-sm leading-body-sm text-muted">{site ? "Free" : `${findNote} a search`}</span>}
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}
      {results}
    </div>
  );
}

function UseWebsite({ size, link, onClick }: { size: "sm" | "lg"; link?: boolean; onClick: () => void }) {
  const detail = "Turns the box into one for the company’s website. A website is added as it is, with no search; its name comes from its own site.";
  if (link)
    return (
      <Button variant="ghost" size={size} className={`${size === "lg" ? "-mx-4" : "-mx-2.5"} underline decoration-border underline-offset-3 hover:decoration-text`} detail={detail} note="Free" onClick={onClick}>
        Not here? Use a website instead
      </Button>
    );
  return (
    <Button size={size} detail={detail} note="Free" onClick={onClick}>
      Use a website instead
    </Button>
  );
}

// A company in a list of chosen ones: its initial, name and website (with a short note, like "not in Apollo"), Remove,
// and what's under it (its choices).
export function CompanyLine({
  name,
  domain,
  note,
  removeDetail,
  onRemove,
  small,
  children,
}: {
  name: string | null;
  domain: string;
  note?: string;
  removeDetail: string;
  onRemove: () => void;
  small: boolean;
  children?: ReactNode;
}) {
  const site = [name ? domain : null, note].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-2 border-b py-2.5 last:border-b-0 max-md:gap-0">
      <span className="flex items-center gap-3">
        <Avatar name={name ?? domain} company size={28} />
        <span className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
          <span className="truncate font-medium text-text max-md:text-body-md max-md:leading-body-md">{name ?? domain}</span>
          {site && <span className="truncate text-muted">{site}</span>}
        </span>
        <Button variant="ghost" size={small ? "lg" : "sm"} iconOnly icon="close" aria-label={`Remove ${name ?? domain}`} detail={removeDetail} note="Free · Undo with U" onClick={onRemove} />
      </span>
      {children && <span className="flex gap-6 pl-10 max-md:flex-col max-md:gap-0">{children}</span>}
    </li>
  );
}
