"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Contact, ResumeDoc } from "../../../convex/resumeDoc";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { StatusTag } from "@/components/StatusTag";
import { toast } from "@/components/Toast";
import { sourcesOf } from "./EditSheet";
import { Line, ResumeSheet } from "./Sheet";
import { type Change, dayTime, plural } from "./words";

// History: every kept version of a base or direction resume, newest first, each with what it changed in substance
// from the one before (roles, results and claims added, changed or dropped, with what they rest on). A version opens
// read only, its lines resting on a fact since edited or rejected marked; Restore makes a copy of it the current
// version without those lines.

const KIND = { added: "Added", changed: "Changed", dropped: "Dropped" } as const;

// One row of what changed: its kind, what, and what it rests on.
export function ChangeRow({ c, facts, wide = false }: { c: Change; facts: Record<string, string>; wide?: boolean }) {
  return (
    <li className={`flex items-start gap-3 ${wide ? "border-t py-2" : ""}`}>
      <span className={`shrink-0 text-body-sm leading-body-sm text-muted ${wide ? "w-22" : "w-17"}`}>{KIND[c.kind]}</span>
      <span className="min-w-0 flex-1 text-body-sm leading-body-sm text-text">
        {c.text}
        {c.where && c.kind !== "changed" && <span className="text-muted"> at {c.where}</span>}
        {c.note && <span className="text-muted"> ({c.note})</span>}
      </span>
      {c.factIds.length > 0 && <BuiltOnPeek align="end" sources={sourcesOf(c.factIds, facts, { where: c.where ?? "your record" })} />}
    </li>
  );
}

export function HistoryPane({ directionId, facts, viewing, onView }: { directionId: Id<"items"> | null; facts: Record<string, string>; viewing: Id<"resumes"> | null; onView: (id: Id<"resumes"> | null) => void }) {
  const data = useQuery(api.resume.history, directionId ? { directionId } : {});
  if (!data) return null;
  return (
    <div className="-mx-4 flex flex-col">
      <p className="px-4 pb-3 text-body-sm leading-body-sm text-muted">What changed in substance between versions, and what each change rests on.</p>
      <ol className="flex flex-col border-t">
        {data.versions.map((v) => {
          const on = viewing === v.id || (!viewing && v.current);
          const head = (
            <span className="flex items-center gap-2">
              <span className="text-body-sm leading-body-sm font-medium text-text tabular-nums">{dayTime(v.at)}</span>
              {v.current && <span className="text-label leading-label text-muted">Current</span>}
              {viewing === v.id && !v.current && <StatusTag tone="info">Viewing</StatusTag>}
              {v.plain && <span className="text-label leading-label text-muted">Plain text</span>}
              <span className="flex-1" />
              {v.facts !== null && <span className="text-label leading-label text-muted tabular-nums">{plural(v.facts, "fact")}</span>}
            </span>
          );
          return (
            <li key={v.id} className={`flex flex-col gap-2 border-b px-4 py-3 ${on && viewing ? "bg-steel-subtle shadow-[inset_2px_0_0_var(--color-steel)]" : ""}`}>
              {v.plain ? (
                head
              ) : (
                <button type="button" onClick={() => onView(v.current ? null : v.id)} aria-current={on || undefined} className="-mx-1 rounded-sm px-1 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-steel">
                  {head}
                </button>
              )}
              {v.plain ? (
                <span className="text-body-sm leading-body-sm text-muted">Write it again to use titles and folding.</span>
              ) : v.restoredFrom ? (
                <span className="text-body-sm leading-body-sm text-muted">Restored from {dayTime(v.restoredFrom)}</span>
              ) : v.changes.length ? (
                <ul className="flex flex-col gap-1.5">
                  {v.changes.map((c, i) => (
                    <ChangeRow key={i} c={c} facts={facts} />
                  ))}
                </ul>
              ) : (
                <span className="text-body-sm leading-body-sm text-muted">{data.versions.at(-1)?.id === v.id ? "The first version." : "Nothing changed in substance."}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// An older version, read only: what restoring leaves out, Restore and Compare with current, then the page.
export function VersionView({ id, contact, small, onCompare, onDone }: { id: Id<"resumes">; contact: Contact | null; small: boolean; onCompare: () => void; onDone: () => void }) {
  const v = useQuery(api.resume.version, { id });
  const restore = useMutation(api.resume.restore);
  const undo = useMutation(api.resume.undoRestore);
  if (!v?.doc) return null;
  const flagged = Object.keys(v.flags).length;
  const run = () =>
    void restore({ id })
      .then((copy) => {
        onDone();
        toast({ message: `Restored the ${dayTime(v.at)} version`, icon: "undo", action: { label: "Undo", key: "U", run: () => void undo({ id: copy }).catch(() => toast({ message: "Couldn’t undo.", icon: "failed" })) } });
      })
      .catch((e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t restore it.", icon: "failed" }));
  return (
    <>
      <Banner tone="steel" title={`Viewing the ${dayTime(v.at)} version`} line={flagged ? `${plural(flagged, "line rests", "lines rest")} on facts you have since edited or rejected. Restoring leaves them out.` : "Restoring makes it the current version. The one you have now stays in History."}>
        <Button variant="primary" icon="undo" detail="Makes a copy of this version the current one." note="Free · Undo from the message" onClick={run}>
          Restore
        </Button>
        <Button variant="ghost" icon="switch" detail="Shows this version beside the current one, with what changed." note="Free" onClick={onCompare}>
          Compare with current
        </Button>
      </Banner>
      <FlaggedSheet doc={v.doc} flags={v.flags} contact={contact} small={small} />
    </>
  );
}

export function FlaggedSheet({ doc, flags, contact, small }: { doc: ResumeDoc; flags: Record<string, "edited" | "rejected">; contact: Contact | null; small: boolean }) {
  return (
    <ResumeSheet
      doc={doc}
      contact={contact}
      small={small}
      parts={{
        line: (b) => {
          const flag = flags[b.text];
          return <Line text={b.text} look={flag ? { tone: "problem", aside: <StatusTag tone={flag === "rejected" ? "problem" : "caution"}>{flag === "rejected" ? "Fact rejected" : "Fact edited since"}</StatusTag> } : {}} />;
        },
      }}
    />
  );
}

// A banner above the page: a rule in its tone on the left, what it's about, then its actions.
export function Banner({ tone, title, line, children }: { tone: "steel" | "caution" | "good"; title: string; line?: string; children?: React.ReactNode }) {
  const rule = { steel: "border-steel", caution: "border-caution", good: "border-good" }[tone];
  return (
    <section className={`flex flex-col gap-2.5 border-l-2 pl-4 ${rule}`}>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-body-sm leading-body-sm font-medium text-text">{title}</h3>
        {line && <p className="text-body-sm leading-body-sm text-muted">{line}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </section>
  );
}
