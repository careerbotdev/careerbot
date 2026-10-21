"use client";

import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { listInner, optionRow, raisedSurface } from "./choices";
import { domainOf, isList, looksLikeWebsite } from "./companyText";
import { ErrorLine, Input } from "./Field";
import { Icons } from "./icons";
import { Menu, type MenuEntry } from "./Menu";
import { StatusTag } from "./StatusTag";
import { Tooltip } from "./Tooltip";

// Choosing a company as its name is typed (the Companies you like boards in Paper). From two characters, a moment after
// typing stops, the companies it may mean come up under the box, each with its initial, name and website (their own
// companies first, marked so); arrows move, Enter or a click adds one, Escape closes. A typed website needs no search:
// the list offers to add it as it is. Several lines pasted into the box go to `onList` (Paste a list). Every lookup is
// free, so nothing about cost shows until one is added (`addNote`).

export type FoundCompany = { name: string; domain: string; yours?: boolean };
export type Picked = { domain: string; name?: string };

const MIN_CHARS = 2;
const WAIT_MS = 250;

type Option = { kind: "company"; company: FoundCompany } | { kind: "site"; domain: string };

export function CompanyPicker({
  label,
  suggest,
  website,
  onAdd,
  addDetail,
  addNote = "Free · Undo with U",
  small,
  onList,
  after,
  initial = "",
  autoFocus,
}: {
  // What the box is for, for screen readers ("Add a company you like").
  label: string;
  // The companies a typed name may mean (free).
  suggest: (q: string) => Promise<FoundCompany[]>;
  // A typed website: its name from its own site, when it says it.
  website: (site: string) => Promise<{ domain: string; name: string | null }>;
  onAdd: (c: Picked) => Promise<unknown>;
  // What adding one does, for its row's explainer: a company by its name, or (null) a typed website.
  addDetail: (name: string | null) => string;
  // What adding one costs and whether it can be undone, under its explainer.
  addNote?: string;
  small: boolean;
  // Several lines pasted into the box, for Paste a list.
  onList?: (text: string) => void;
  // Beside the box (Paste a list).
  after?: ReactNode;
  // Starting words (a pasted line being fixed), and whether the box takes focus at once.
  initial?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [found, setFound] = useState<{ q: string; companies: FoundCompany[] } | null>(null);
  const [focused, setFocused] = useState(!!autoFocus);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(suggest);
  const listId = useId();
  const q = text.trim();
  const site = looksLikeWebsite(q);
  // The screen's suggest, website and onAdd reject with words meant for the person.
  const fail = (e: unknown) => setError(e instanceof Error && e.message ? e.message : "Couldn’t do that. Try again.");

  useEffect(() => {
    latest.current = suggest;
  }, [suggest]);
  useEffect(() => {
    if (q.length < MIN_CHARS || site) return;
    let live = true;
    const wait = window.setTimeout(() => {
      latest.current(q).then(
        (companies) => live && setFound({ q, companies }),
        (e: unknown) => {
          if (!live) return;
          setFound({ q, companies: [] });
          fail(e);
        },
      );
    }, WAIT_MS);
    return () => {
      live = false;
      window.clearTimeout(wait);
    };
  }, [q, site]);

  const options: Option[] = site ? [{ kind: "site", domain: domainOf(q) }] : q.length >= MIN_CHARS && found ? found.companies.map((company) => ({ kind: "company", company })) : [];
  const none = !site && found?.q === q && found.companies.length === 0;
  const open = focused && q.length >= MIN_CHARS && (options.length > 0 || none);
  const at = Math.min(active, Math.max(options.length - 1, 0));

  const add = (c: Picked) =>
    onAdd(c).then(() => {
      setText("");
      setFound(null);
      setActive(0);
      setError(null);
    }, fail);
  const pick = (o: Option) => {
    if (busy) return;
    if (o.kind === "company") return void add({ domain: o.company.domain, name: o.company.name });
    setBusy(true);
    void website(q)
      .then((w) => add({ domain: w.domain, ...(w.name ? { name: w.name } : {}) }), fail)
      .finally(() => setBusy(false));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      setFocused(true);
      setActive((at + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[at]) pick(options[at]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setFocused(false);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!onList || !isList(pasted)) return;
    e.preventDefault();
    onList(pasted);
  };
  const guess = `${q.toLowerCase().replace(/[^a-z0-9]+/g, "") || "acme"}.com`;

  return (
    <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
              <Input
                aria-label={label}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={open && options.length ? `${listId}-${at}` : undefined}
                autoFocus={autoFocus}
                // A dialog opens on it (Dialog's first focus), rather than on a control above it.
                data-autofocus={autoFocus || undefined}
                icon="search"
                value={text}
                placeholder="Company name or website"
                suffix={busy ? "Adding" : undefined}
                onChange={(e) => {
                  setText(e.target.value);
                  setActive(0);
                  setFocused(true);
                  setError(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
              />
            {/* A listbox in place under the box, not a popover: inside a modal dialog (Search settings) a popover's focus
                handling moved focus off the box as it opened. Focus stays in the box; arrows move aria-activedescendant. */}
            {open && (
              <div onMouseDown={(e) => e.preventDefault()} className={`${raisedSurface} absolute top-full left-0 z-50 mt-1 flex w-full min-w-62 flex-col overflow-y-auto`}>
            <div role="listbox" id={listId} aria-label={`Companies for ${q}`} className={listInner}>
              {options.map((o, i) => {
                const name = o.kind === "company" ? o.company.name : null;
                const domain = o.kind === "company" ? o.company.domain : o.domain;
                return (
                  <Tooltip key={domain} side="right" content={`Add ${name ?? domain}`} detail={addDetail(name)} note={addNote}>
                    <div
                      role="option"
                      id={`${listId}-${i}`}
                      aria-selected={i === at}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(o)}
                      className={`${optionRow} ${small ? "min-h-12 py-1.5" : "min-h-9"} ${i === at ? "bg-subtle dark:bg-hover" : ""}`}
                    >
                      {o.kind === "site" ? (
                        <>
                          <span className="flex size-6 shrink-0 items-center justify-center text-muted">
                            <Icons.link aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">Add {o.domain}</span>
                        </>
                      ) : (
                        <>
                          <Avatar name={o.company.name} company size={24} />
                          <span className={`flex min-w-0 flex-1 ${small ? "flex-col" : "items-center gap-2"}`}>
                            <span className={`truncate font-medium ${small ? "text-body-md leading-body-md" : "shrink-0"}`}>{o.company.name}</span>
                            <span className="truncate text-muted">
                              {o.company.domain}
                              {small && o.company.yours ? " · in your companies" : ""}
                            </span>
                          </span>
                          {!small && o.company.yours && <span className="shrink-0 text-muted">In your companies</span>}
                        </>
                      )}
                    </div>
                  </Tooltip>
                );
              })}
              {none ? (
                <div className="flex flex-col px-2 py-1.5 text-body-sm leading-body-sm">
                  <span className="text-text">No company named {q} found.</span>
                  <span className="text-muted">Type its website instead, like {guess}.</span>
                </div>
              ) : (
                !site && <div className="-mx-1 mt-1 border-t px-3 pt-2 pb-1 text-body-sm leading-body-sm text-muted">Not here? Type its website, like {guess}.</div>
              )}
            </div>
              </div>
            )}
          </div>
          {after}
        </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

// Paste a list, beside the box.
export function PasteButton({ small, onClick }: { small: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size={small ? "lg" : "sm"} icon="paste" detail="Adds several at once: names or websites, one per line or separated by commas. You check each one before they’re added." note="Free" onClick={onClick}>
      Paste a list
    </Button>
  );
}

// A company in a list of chosen ones: its initial, name and website, a short muted tag ("Not used to find more like
// it") and its actions: a ⋯ menu (`menu`), or Remove alone (`remove`).
export function CompanyLine({
  name,
  domain,
  tag,
  small,
  menu,
  remove,
}: {
  name: string | null;
  domain: string;
  tag?: string;
  small: boolean;
  menu?: MenuEntry[];
  remove?: { detail: string; onRemove: () => void };
}) {
  const called = name ?? domain;
  return (
    <li className="flex items-center gap-3 border-b py-2.5 last:border-b-0 max-md:py-3">
      <Avatar name={called} company size={28} />
      <span className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
        <span className="truncate font-medium text-text max-md:text-body-md max-md:leading-body-md">{called}</span>
        {(name || tag) && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {name && <span className="truncate text-muted">{domain}</span>}
            {tag && <StatusTag tone="neutral">{tag}</StatusTag>}
          </span>
        )}
      </span>
      {menu && <Menu items={menu} label={`More for ${called}`} title={called} />}
      {remove && <Button variant="ghost" size={small ? "lg" : "sm"} iconOnly icon="close" aria-label={`Remove ${called}`} detail={remove.detail} note="Free · Undo with U" onClick={remove.onRemove} />}
    </li>
  );
}
