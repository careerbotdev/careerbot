"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { aboutUsd } from "../../costs";
import { Button } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { Icons } from "@/components/icons";
import { Menu } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import type { ThirdPane } from "@/components/Panes";
import { ReasonField } from "@/components/ReasonField";
import { Skeleton } from "@/components/Skeleton";
import { StatusTag } from "@/components/StatusTag";
import { EXPLAIN, factMenu, useFactActions } from "./actions";
import { act, type Fact, failed, FREE_UNDO, monthDay, PICKS, projectOf, type RecordData, storyLine, useRecord, WHY } from "./shared";
import { WordsField } from "./WordsField";

const typing = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]";

// A fact's third pane for the host's PaneLayout: its words with Edit (E) and Rewrite, a rewrite waiting or being
// written, its sources (story quotes, your notes, the repository), its context, its history, the resumes it shows on
// and notes on it; its ⋯ holds the rest (R rejects). Undefined while no fact is open.
export function useFactPane(factId: string | null, onClose: () => void): ThirdPane | undefined {
  // The last fact open stays in the pane while it closes.
  const [last, setLast] = useState(factId);
  if (factId && factId !== last) setLast(factId);
  const id = factId ?? last;
  if (!id) return undefined;
  return {
    title: "Fact",
    open: !!factId,
    onOpenChange: (o) => !o && onClose(),
    actions: <PaneMenu id={id} />,
    children: <FactPane key={id} id={id} />,
  };
}

type Mode = null | "edit" | "context" | "why";

// Which field the pane has open; its ⋯ opens them too.
let setPaneMode: ((m: Mode) => void) | null = null;

function PaneMenu({ id }: { id: string }) {
  const r = useRecord();
  const costs = useQuery(api.estimates.costs, {});
  const f = r?.facts.find((x) => x.id === id);
  const a = useFactActions(r, f);
  if (!r || !f) return null;
  const cost = aboutUsd(costs?.rewrite) ?? "Uses your AI budget";
  const open = (m: Mode) => () => setPaneMode?.(m);
  const items = [
    ...factMenu(r, f, a, { edit: open("edit"), context: open("context"), reject: open("why") }, cost),
    "separator" as const,
    { label: "Copy link", icon: "copy" as const, onSelect: () => void navigator.clipboard.writeText(`${window.location.origin}${linkTo(r, f)}`) },
  ];
  return <Menu items={items} label="More for this fact" title="Fact" description={f.data.text} />;
}

// Where the fact lives in Record: its role's or project's page, opened on it.
function linkTo(r: RecordData, f: Fact) {
  if (f.projectKey) {
    const p = projectOf(r, f);
    return `/record/projects?project=${p?.id ?? ""}&fact=${f.id}`;
  }
  return `/record/roles?role=${encodeURIComponent(f.roleKey ?? "")}&fact=${f.id}`;
}

function FactPane({ id }: { id: string }) {
  const r = useRecord();
  const costs = useQuery(api.estimates.costs, {});
  const [mode, setMode] = useState<Mode>(null);
  const f = r?.facts.find((x) => x.id === id);
  const a = useFactActions(r, f);
  const accept = useMutation(api.extract.acceptSuggestion);
  const dismiss = useMutation(api.extract.dismissSuggestion);
  const revert = useMutation(api.extract.revertWording);
  const [keepWhy, setKeepWhy] = useState(false);

  useEffect(() => {
    setPaneMode = setMode;
    return () => {
      if (setPaneMode === setMode) setPaneMode = null;
    };
  }, []);

  // E edits and R rejects the open fact, ahead of anything the item binds.
  const rejected = f?.status === "rejected";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(typing)) return;
      const key = e.key.toLowerCase();
      if (key === "e") setMode("edit");
      else if (key === "r" && !rejected) setMode("why");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, rejected]);

  if (!r) return <PaneSkeleton />;
  if (!f) return <p className="pt-1 text-body-md leading-body-md text-muted">This fact is no longer in your record.</p>;
  const cost = aboutUsd(costs?.rewrite) ?? "Uses your AI budget";
  const sug = f.data.suggestion;
  const done = () => setMode(null);

  return (
    <div className="flex flex-col gap-5 pt-1 pb-4">
      <div className="flex flex-col gap-2.5">
        {mode === "edit" ? (
          <WordsField label="Edit fact" initial={f.data.text} save="Save and approve" detail={EXPLAIN.edit.detail} note={FREE_UNDO} onSave={(text) => (done(), a.edit(text))} onCancel={done} />
        ) : (
          <>
            <p className={`text-body-md leading-body-md font-medium ${rejected ? "text-muted line-through decoration-1" : "text-text"}`}>{f.data.text}</p>
            {(f.status !== "approved" || f.data.edited) && (
              <span className="flex flex-wrap gap-1.5">
                {f.status === "proposed" && <StatusTag tone="neutral">To review</StatusTag>}
                {rejected && <StatusTag tone="neutral">Rejected{f.data.rejectedBecause ? ` · ${f.data.rejectedBecause}` : ""}</StatusTag>}
                {f.status === "approved" && f.data.edited && <StatusTag tone="neutral">Your wording</StatusTag>}
              </span>
            )}
            {mode === "context" ? (
              <WordsField label="Context or direction" placeholder={EXPLAIN.context} save="Rewrite" detail={EXPLAIN.rewrite.detail} cost={cost} optional onSave={(note) => (done(), a.rework(note))} onCancel={done} />
            ) : mode === "why" ? (
              <ReasonField decision="Reject" picks={PICKS.fact} onDone={({ reason }) => (done(), a.reject(reason))} />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {rejected ? (
                  <Button variant="outline" size="sm" icon="undo" detail="Puts it back in your record to review." note={FREE_UNDO} onClick={a.restore}>
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" keys="E" detail={EXPLAIN.edit.detail} note={FREE_UNDO} onClick={() => setMode("edit")}>
                      Edit
                    </Button>
                    <CostAction
                      variant="outline"
                      size="sm"
                      icon="tryAgain"
                      amount={cost}
                      detail={EXPLAIN.rewrite.detail}
                      reason={sug ? (sug.pending ? "A rewrite is being written" : "A rewrite is waiting") : undefined}
                      onClick={() => a.rework("")}
                    >
                      Rewrite
                    </CostAction>
                  </>
                )}
              </div>
            )}
          </>
        )}
        {sug?.pending && (
          <span className="flex items-center gap-1.5 text-body-sm leading-body-sm text-muted">
            <Icons.running aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            Writing a rewrite…
          </span>
        )}
        {sug?.text && (
          <div className="flex flex-col gap-2 rounded-sm border bg-surface p-3">
            <span className="text-label leading-label text-muted">Proposed{sug.note ? " · from your note" : ""}</span>
            <p className="text-body-md leading-body-md font-medium text-text">{sug.text}</p>
            {keepWhy ? (
              <ReasonField
                decision="Keep current"
                picks={PICKS.rewrite}
                onDone={({ reason }) => {
                  setKeepWhy(false);
                  act(dismiss({ id: f.id, reason }), "Kept your wording", "reject", () => revert({ id: f.id }));
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  detail="The fact takes the new wording and is approved. The old wording stays in its history."
                  note={FREE_UNDO}
                  onClick={() => act(accept({ id: f.id }), "Rewritten", "approve", () => revert({ id: f.id }))}
                >
                  Use this
                </Button>
                <Button size="sm" detail="Keeps the wording it has. The rewrite stays in its history." note={WHY} onClick={() => setKeepWhy(true)}>
                  Keep current
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <FactSources factId={f.id} />
      <FactContext r={r} f={f} />
      <History r={r} f={f} />
      <ShowsOn id={f.id} />
      <FactNotes id={f.id} />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2">
        <span className="text-label leading-label font-medium text-text">{title}</span>
        {count !== undefined && <span className="text-label leading-label text-muted tabular-nums">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

// What one fact rests on: each story it was read from with its quotes (and a way to open the story), the notes it was
// rewritten with, and a project's repository with the files it points to. Also Insights' facts peek.
export function FactSources({ factId }: { factId: string }) {
  const r = useRecord();
  if (!r) return <PaneSkeleton />;
  const f = r.facts.find((x) => x.id === factId);
  if (!f) return null;
  const notes = (f.data.history ?? []).filter((h) => h.how === "rewrite" && h.note);
  const project = f.projectKey ? projectOf(r, f) : undefined;
  const files = f.data.files ?? [];
  const count = f.sources.length + notes.length + (project ? 1 : 0);
  return (
    <Section title="Sources" count={count}>
      {count === 0 && <p className="text-body-sm leading-body-sm text-muted">Your own words: nothing else to show.</p>}
      <div className="flex flex-col gap-3">
        {f.sources.map((s) => (
          <div key={`${s.narrativeId}:${s.version}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-label leading-label font-medium text-text">{storyLine(r, String(s.narrativeId), s.version)}</span>
              {r.story.has(String(s.narrativeId)) && (
                <Link href={`/record/story?story=${s.narrativeId}`} className="tap shrink-0 rounded-sm text-label leading-label text-text underline decoration-border underline-offset-3 hover:decoration-text">
                  Open in Story
                </Link>
              )}
            </div>
            {s.quotes.length ? (
              s.quotes.map((q) => (
                <blockquote key={q} className="border-l-2 border-steel pl-3 text-body-sm leading-body-sm text-muted">
                  “{q}”
                </blockquote>
              ))
            ) : (
              <p className="text-body-sm leading-body-sm text-muted">Read from the whole story.</p>
            )}
          </div>
        ))}
        {notes.map((h, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="text-label leading-label font-medium text-text">Your note · {monthDay(h.at)}</span>
            <blockquote className="border-l-2 border-steel pl-3 text-body-sm leading-body-sm text-muted">“{h.note}”</blockquote>
          </div>
        ))}
        {project && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-label leading-label font-medium text-text">GitHub · {project.data.repo}</span>
              {project.data.url && (
                <a href={project.data.url} target="_blank" rel="noreferrer" className="tap shrink-0 rounded-sm text-label leading-label text-text underline decoration-border underline-offset-3 hover:decoration-text">
                  Open on GitHub
                </a>
              )}
            </div>
            <ul className="flex flex-col gap-0.5 border-l-2 border-steel pl-3">
              {(files.length ? files : ["Commit history"]).map((path) => (
                <li key={path} className="font-mono text-mono leading-mono break-all text-muted">
                  {path}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

// Context kept for this fact: from its story, your notes, what the line left out.
function FactContext({ r, f }: { r: RecordData; f: Fact }) {
  const kept = r.context.filter((c) => c.data.factId === f.id);
  if (!kept.length) return null;
  const from: Record<string, string> = { "your note": "Your note", "left out of the line": "Left out of the line" };
  return (
    <Section title="Context" count={kept.length}>
      <ul className="flex flex-col">
        {kept.map((c) => (
          <li key={c.id} className="flex flex-col gap-0.5 border-t py-[7px]">
            <span className="text-body-sm leading-body-sm text-text">{c.data.text}</span>
            <span className="text-label leading-label text-muted">{(c.data.from && from[c.data.from]) ?? (c.sources[0] ? storyLine(r, String(c.sources[0].narrativeId)) : "Your note")}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

type Version = NonNullable<Fact["data"]["history"]>[number];

// What happened to its wording, newest first: read, edited, rewritten (with the note), a rewrite kept out, rejected,
// merged, an approval undone.
function History({ r, f }: { r: RecordData; f: Fact }) {
  const history: Version[] = f.data.history?.length ? f.data.history : [{ text: f.data.text, how: "read", at: 0 }];
  const dated = history.some((h) => h.at > 0);
  const from = f.projectKey ? "GitHub" : f.sources[0] ? storyLine(r, String(f.sources[0].narrativeId)).replace(/ · version \d+$/, "") : null;
  const words = (h: Version, i: number): [string, string | undefined] => {
    const was = h.text !== f.data.text ? h.text : undefined;
    switch (h.how) {
      case "read":
        return [from ? `Read from ${from.endsWith(" story") ? `the ${from}` : from}` : "Read", was];
      case "edit":
        return [i === 0 ? "Added in your words" : "Edited in your words", was];
      case "rewrite":
        return [h.note ? "Rewritten with your note" : "Rewritten", h.note ? `“${h.note}”` : was];
      case "dismissed":
        return ["Kept your wording over a rewrite", h.reason ?? h.text];
      case "rejected":
        return ["Rejected", h.note];
      case "merged":
        return ["Merged with a fact that said the same", h.note];
      case "unapproved":
        return ["Approval undone", undefined];
    }
  };
  return (
    <Section title="History">
      <ol className="flex flex-col">
        {history
          .map((h, i) => [h, i] as const)
          .reverse()
          .map(([h, i]) => {
            const [what, more] = words(h, i);
            return (
              <li key={i} className="flex gap-3 py-[5px]">
                {dated && <span className="w-12 shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{h.at > 0 ? monthDay(h.at) : ""}</span>}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body-sm leading-body-sm text-text">{what}</span>
                  {more && <span className="line-clamp-3 text-body-sm leading-body-sm text-muted">{more}</span>}
                </span>
              </li>
            );
          })}
      </ol>
    </Section>
  );
}

// The resumes whose current version has a line resting on this fact.
function ShowsOn({ id }: { id: string }) {
  const resumes = useQuery(api.resume.showsFact, { id: id as Id<"items"> });
  return (
    <Section title="Shows on">
      {resumes === undefined ? (
        <Skeleton className="h-4 w-1/2" />
      ) : resumes.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {resumes.map((x) => (
            <Link key={x.key} href={`/resumes?resume=${x.key}`} className="tap rounded-sm text-body-sm leading-body-sm text-text underline decoration-border underline-offset-3 hover:decoration-text">
              {x.name}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-body-sm leading-body-sm text-muted">Not on a resume yet.</p>
      )}
    </Section>
  );
}

function FactNotes({ id }: { id: string }) {
  const subject = { kind: "item" as const, id: id as Id<"items"> };
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const edit = useMutation(api.notes.edit);
  const remove = useMutation(api.notes.remove);
  return (
    <Section title="Notes" count={notes?.length || undefined}>
      <NoteBlock
        notes={notes ?? []}
        onAdd={(text) => void add({ subject, text }).catch(failed)}
        onEdit={(noteId, text) => void edit({ id: noteId as Id<"notes">, text }).catch(failed)}
        onDelete={(noteId) => void remove({ id: noteId as Id<"notes"> }).catch(failed)}
      />
    </Section>
  );
}

function PaneSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-1" aria-busy="true">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}
