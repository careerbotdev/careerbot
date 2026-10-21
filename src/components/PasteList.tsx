"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { CompanyPicker, type FoundCompany, type Picked } from "./CompanyPicker";
import { PASTE_MAX, parseList } from "./companyText";
import { ErrorLine, Textarea } from "./Field";
import { StatusTag } from "./StatusTag";

// Paste a list (the Companies you like boards in Paper): names or websites, one per line or separated by commas. Look
// them up finds each line's company for free (its website as it is, else the best match, marked Check this when the
// name matched no company exactly). Each line can be fixed (the same search, started from its words) or removed before
// Add N companies; a company already in the list, or twice in this one, is shown but not added. Edit list goes back to
// the words. Text pasted into the search box starts here already looked up (`initial`).

export type PasteLine = { line: string; match: { domain: string; name: string | null } | null; check: boolean };
type Row = PasteLine & { key: number };

export function PasteList({
  small,
  initial,
  have,
  resolve,
  suggest,
  website,
  addDetail,
  addNote,
  onAdd,
  onClose,
}: {
  small: boolean;
  // Text pasted into the search box, looked up at once.
  initial?: string;
  // Websites already in the list.
  have: string[];
  resolve: (lines: string[]) => Promise<PasteLine[]>;
  suggest: (q: string) => Promise<FoundCompany[]>;
  website: (site: string) => Promise<{ domain: string; name: string | null }>;
  // What Add N companies does, and what it costs.
  addDetail: (n: number) => string;
  addNote: string;
  onAdd: (companies: Picked[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [over, setOver] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const size = small ? "lg" : "sm";
  const fail = (e: unknown) => setError(e instanceof Error && e.message ? e.message : "Couldn’t do that. Try again.");
  const started = useRef(false);

  const lookUp = (words: string) => {
    const { lines, over: more } = parseList(words);
    if (!lines.length) return;
    setBusy(true);
    setError(null);
    void resolve(lines)
      .then((found) => {
        setRows(found.map((r, key) => ({ ...r, key })));
        setOver(more);
      }, fail)
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      lookUp(initial);
    }
  });

  if (!rows)
    return (
      <div aria-label="Paste a list" role="group" className="flex flex-col gap-2 rounded-sm border bg-surface p-3">
        <span className="flex flex-col">
          <span className="text-body-sm leading-body-sm font-medium text-text">Paste a list</span>
          <span className="text-body-sm leading-body-sm text-muted">Names or websites, one per line or separated by commas. Up to {PASTE_MAX}.</span>
        </span>
        <Textarea aria-label="Companies to add" rows={6} autoFocus={!initial} value={text} onChange={(e) => (setText(e.target.value), setError(null))} />
        {error && <ErrorLine>{error}</ErrorLine>}
        <span className="flex items-center justify-end gap-2">
          <Button variant="ghost" size={size} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size={size}
            loading={busy}
            loadingLabel="Looking up"
            detail="Finds each line’s company by its website, or else by its name. Nothing is added until you press Add."
            note="Free"
            reason={parseList(text).lines.length ? undefined : "Paste some names or websites first."}
            onClick={() => lookUp(text)}
          >
            Look them up
          </Button>
        </span>
      </div>
    );

  const seen = new Set<string>();
  const shown = rows.map((r) => {
    const domain = r.match?.domain;
    const state = !domain ? "missing" : have.includes(domain) ? "have" : seen.has(domain) ? "twice" : "new";
    if (domain) seen.add(domain);
    return { ...r, state };
  });
  const adding = shown.filter((r) => r.state === "new");
  const set = (key: number, next: Partial<Row> | null) => setRows((xs) => (xs ?? []).flatMap((x) => (x.key !== key ? [x] : next ? [{ ...x, ...next }] : [])));

  return (
    <div aria-label="Paste a list" role="group" className="flex flex-col rounded-sm border bg-surface">
      <span className="flex items-center gap-2 border-b py-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 text-body-sm leading-body-sm font-medium text-text">
          {rows.length} {rows.length === 1 ? "line" : "lines"} from your list
        </span>
        <Button variant="ghost" size={size} icon="edit" detail="Back to the names and websites you pasted, to change them." note="Free" onClick={() => setRows(null)}>
          Edit list
        </Button>
      </span>
      {over > 0 && (
        <p className="border-b px-3 py-2 text-body-sm leading-body-sm text-muted">
          Only the first {PASTE_MAX} are here. Paste the other {over} after adding these.
        </p>
      )}
      <ul aria-label="Companies from your list" className="flex flex-col px-3">
        {shown.map((r) => {
          const name = r.match?.name ?? r.match?.domain ?? r.line;
          if (fixing === r.key)
            return (
              <li key={r.key} className="border-b py-2 last:border-b-0">
                <CompanyPicker
                  label={`Fix “${r.line}”`}
                  small={small}
                  initial={r.line}
                  autoFocus
                  suggest={suggest}
                  website={website}
                  addDetail={(n) => `Uses ${n ?? "this website"} for “${r.line}”.`}
                  addNote="Free"
                  onAdd={async (c) => {
                    set(r.key, { match: { domain: c.domain, name: c.name ?? null }, check: false });
                    setFixing(null);
                  }}
                />
              </li>
            );
          return (
            <li key={r.key} className={`flex items-center gap-3 border-b py-2 last:border-b-0 max-md:py-3 ${r.state === "have" || r.state === "twice" ? "opacity-60" : ""}`}>
              {r.match ? <Avatar name={name} company size={28} /> : <span aria-hidden className="size-7 shrink-0 rounded-sm border border-dashed border-control-border" />}
              <span className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
                <span className={`truncate font-medium max-md:text-body-md max-md:leading-body-md ${r.match ? "text-text" : "text-muted"}`}>{name}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-muted">{!r.match ? "No company found" : r.check ? `${r.match.domain} · from “${r.line}”` : r.match.name ? r.match.domain : null}</span>
                  {r.state === "new" && r.check && <StatusTag tone="caution">Check this</StatusTag>}
                  {r.state === "have" && <StatusTag tone="neutral">Already in your list</StatusTag>}
                  {r.state === "twice" && <StatusTag tone="neutral">Twice in this list</StatusTag>}
                </span>
              </span>
              {(r.check || !r.match) && (
                <Button variant="ghost" size={size} icon="edit" detail={`Search for the company “${r.line}” meant, by its name or website.`} note="Free" onClick={() => setFixing(r.key)}>
                  Fix
                </Button>
              )}
              <Button variant="ghost" size={size} iconOnly icon="close" aria-label={`Remove “${r.line}”`} detail="Leaves this line out. Nothing is added until you press Add." note="Free" onClick={() => set(r.key, null)} />
            </li>
          );
        })}
      </ul>
      {error && (
        <span className="px-3 pb-2">
          <ErrorLine>{error}</ErrorLine>
        </span>
      )}
      <span className="flex items-center gap-2 border-t bg-subtle px-3 py-2">
        <span className="min-w-0 flex-1 text-body-sm leading-body-sm text-muted max-md:hidden">{addNote}</span>
        <Button variant="ghost" size={size} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size={size}
          loading={busy}
          loadingLabel="Adding"
          detail={addDetail(adding.length)}
          note={addNote}
          reason={adding.length ? undefined : "Nothing new to add."}
          onClick={() => {
            setBusy(true);
            void onAdd(adding.map((r) => ({ domain: r.match!.domain, ...(r.match!.name ? { name: r.match!.name } : {}) })))
              .then(onClose, fail)
              .finally(() => setBusy(false));
          }}
        >
          Add {adding.length} {adding.length === 1 ? "company" : "companies"}
        </Button>
      </span>
    </div>
  );
}
