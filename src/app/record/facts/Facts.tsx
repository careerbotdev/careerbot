"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { api } from "../../../../convex/_generated/api";
import { aboutUsd } from "../../costs";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { Icons } from "@/components/icons";
import { ContextMenu, Menu } from "@/components/Menu";
import { ReasonField } from "@/components/ReasonField";
import { Skeleton } from "@/components/Skeleton";
import { StatusTag } from "@/components/StatusTag";
import { Tooltip } from "@/components/Tooltip";
import { EXPLAIN, factMenu, useFactActions } from "./actions";
import { FactCards } from "./Cards";
import { act, ADD_FACT, connectedOf, type Fact, FREE_UNDO, isOwnedBy, live, type Owner, PICKS, type RecordData, sourcesOf, useRecord } from "./shared";
import { WordsField } from "./WordsField";

export { FactCards } from "./Cards";
export { FactSources, useFactPane } from "./Pane";
export { openAddFact, type Owner, useFactsHaveCards } from "./shared";

// How many facts show before "N more", besides any that need a look or are open.
const SHOWN = 5;

const typing = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]";

// The "Facts N" section of a role, career break or project: the decisions waiting on its facts (unless `cards` is off,
// for a host that shows FactCards elsewhere), then each fact with what it rests on, Edit and ⋯ on hover (E and R on the
// focused one), "Your wording", a rewrite being written, a fact its story no longer says (Keep it or Reject it), N more
// with the rejected ones, and Add a fact (F, or openAddFact() from the host's menu). Clicking a fact opens it
// (`onOpen`); `open` is the fact open beside it.
export function Facts({ owner, open, onOpen, cards = true }: { owner: Owner; open?: string | null; onOpen: (factId: string) => void; cards?: boolean }) {
  const r = useRecord();
  const costs = useQuery(api.estimates.costs, {});
  const addFact = useMutation(api.extract.addFact);
  const removeAdded = useMutation(api.extract.removeAddedFact);
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const start = () => setAdding(true);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(typing)) return;
      e.preventDefault();
      start();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(ADD_FACT, start);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ADD_FACT, start);
    };
  }, []);

  if (!r)
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );

  const cost = aboutUsd(costs?.rewrite) ?? "Uses your AI budget";
  const mine = r.facts.filter(isOwnedBy(owner));
  const facts = mine.filter(live);
  const rejected = mine.filter((f) => f.status === "rejected");
  const role = "roleKey" in owner ? r.roles.find((x) => x.roleKey === owner.roleKey) : undefined;
  const what = "projectKey" in owner ? "project" : role?.data.break ? "break" : "role";
  const attention = (f: Fact) => f.id === open || f.data.suggestion?.pending || f.data.noLongerSaid || f.data.sourceDeleted;
  const shown = all ? facts : facts.filter((f, i) => i < SHOWN || attention(f));
  const hidden = facts.length - shown.length + (all ? 0 : rejected.length);

  const add = (text: string) => {
    setAdding(false);
    const input = "roleKey" in owner ? { roleKey: owner.roleKey, text } : { projectKey: owner.projectKey, text };
    let id: Fact["id"] | null = null;
    act(
      addFact(input).then((x) => (id = x)),
      "Fact added",
      "add",
      () => (id ? removeAdded({ id }) : Promise.resolve()),
    );
  };

  return (
    <section aria-label="Facts" className="flex flex-col gap-6">
      {cards && <FactCards owner={owner} open={open} onOpen={onOpen} />}
      <div className="flex flex-col">
        <h3 className="flex items-center gap-2 pb-2">
          <span className="text-label leading-label font-medium text-text">Facts</span>
          <span className="text-label leading-label text-muted tabular-nums">{facts.length}</span>
        </h3>
        {facts.length === 0 && !adding && <p className="border-t px-2 py-2.5 text-body-md leading-body-md text-muted">No facts on this {what} yet.</p>}
        <ul className="flex flex-col">
          {shown.map((f) => (
            <FactRow key={f.id} r={r} f={f} selected={f.id === open} onOpen={onOpen} cost={cost} />
          ))}
          {all && rejected.length > 0 && (
            <>
              <li className="flex items-center gap-2 border-t px-2 pt-4 pb-2">
                <span className="text-label leading-label font-medium text-text">Rejected</span>
                <span className="text-label leading-label text-muted tabular-nums">{rejected.length}</span>
              </li>
              {rejected.map((f) => (
                <FactRow key={f.id} r={r} f={f} selected={f.id === open} onOpen={onOpen} cost={cost} />
              ))}
            </>
          )}
        </ul>
        {adding ? (
          <div className="border-t px-2 pt-3">
            <WordsField
              label="New fact"
              placeholder="What you did, and what came of it"
              save="Add fact"
              detail="Adds it in your words, approved as you write it."
              note={FREE_UNDO}
              onSave={add}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <div className="flex min-h-11 items-center gap-4 border-t px-2 py-1.5">
            {(hidden > 0 || all) && (
              <button
                type="button"
                onClick={() => setAll(!all)}
                aria-expanded={all}
                className="tap rounded-sm text-body-sm leading-body-sm font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text"
              >
                {all ? "Show fewer" : `${hidden} more`}
              </button>
            )}
            <span className="flex-1" />
            <Button variant="ghost" size="sm" icon="add" keys="F" detail="Adds a fact in your words, approved as you write it." note={FREE_UNDO} onClick={() => setAdding(true)}>
              Add a fact
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

type Mode = null | "edit" | "context" | "why";

// One fact: its words (a click or Enter opens it), what needs saying under them, and at the right its tag at rest,
// with Built on, Edit and ⋯ on hover or focus. The same menu on right-click or a long press.
function FactRow({ r, f, selected, onOpen, cost }: { r: RecordData; f: Fact; selected: boolean; onOpen: (id: string) => void; cost: string }) {
  const [mode, setMode] = useState<Mode>(null);
  const a = useFactActions(r, f);
  const rejected = f.status === "rejected";
  const sources = sourcesOf(r, f);
  const connected = connectedOf(r).get(f.id);
  const orphan = !rejected && (f.data.noLongerSaid || f.data.sourceDeleted);
  const pending = f.data.suggestion?.pending;
  const fields = { edit: () => setMode("edit"), context: () => setMode("context"), reject: () => setMode("why"), open: () => onOpen(f.id) };
  const menu = factMenu(r, f, a, fields, cost);
  const done = () => setMode(null);

  // E and R on the focused fact; the card's keys then leave it alone.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented || mode) return;
    if (e.target instanceof Element && e.target.closest(typing)) return;
    const key = e.key.toLowerCase();
    if (key === "e") fields.edit();
    else if (key === "r" && !rejected) fields.reject();
    else return;
    e.preventDefault();
  };

  const tag = rejected ? (
    <StatusTag tone="neutral">Rejected</StatusTag>
  ) : pending ? (
    <span className="flex items-center gap-1.5 text-body-sm leading-body-sm whitespace-nowrap text-muted">
      <Icons.running aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      Writing a rewrite…
    </span>
  ) : f.status === "proposed" ? (
    <StatusTag tone="neutral">To review</StatusTag>
  ) : f.data.edited ? (
    <StatusTag tone="neutral">Your wording</StatusTag>
  ) : null;

  const why = f.data.noLongerSaid ? "Your revised story no longer says this" : "Its story was deleted";

  return (
    <li data-fact-row="" onKeyDown={onKeyDown} className="group/fact border-t">
      <ContextMenu items={menu} title="Fact" description={f.data.text}>
        <div className={`relative flex items-start gap-3 border-l-2 py-2.5 pr-2 pl-1.5 transition-colors duration-100 ${selected ? "border-steel bg-steel-subtle" : "border-transparent bg-surface md:hover:bg-subtle"}`}>
          {mode === "edit" ? (
            <WordsField label="Edit fact" initial={f.data.text} save="Save and approve" detail={EXPLAIN.edit.detail} note={FREE_UNDO} onSave={(text) => (done(), a.edit(text))} onCancel={done} />
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <button
                  type="button"
                  aria-current={selected || undefined}
                  onClick={() => onOpen(f.id)}
                  className={`min-h-11 md:min-h-0 rounded-sm text-left text-body-md leading-body-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel ${rejected ? "text-muted line-through decoration-1" : "text-text"}`}
                >
                  {f.data.text}
                </button>
                {rejected && f.data.rejectedBecause && <span className="text-body-sm leading-body-sm text-muted">Rejected: {f.data.rejectedBecause}</span>}
                {f.status === "approved" && !f.counts && (
                  <span className="text-body-sm leading-body-sm text-muted">{f.projectKey ? "Left out until its project is approved." : "Left out while its story is rejected."}</span>
                )}
                {connected && <span className="text-body-sm leading-body-sm text-muted">Same work as {connected.where}</span>}
                {f.status === "proposed" && f.data.evidenceMissing && (
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusTag tone="caution">Needs a look</StatusTag>
                    <span className="text-body-sm leading-body-sm text-muted">{f.projectKey ? "No file in the repository shows this" : "Its quotes aren’t in its story"}</span>
                  </span>
                )}
                {orphan && mode !== "why" && (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusTag tone="caution">Needs a look</StatusTag>
                    <Tooltip content={why} detail={f.data.noLongerSaid ?? f.data.sourceDeleted ?? undefined}>
                      <span tabIndex={0} className="rounded-sm text-body-sm leading-body-sm text-muted">
                        {why}
                      </span>
                    </Tooltip>
                    <span className="flex-1" />
                    <Button size="sm" detail="Keeps the fact as it reads." note={FREE_UNDO} onClick={a.keep}>
                      Keep it
                    </Button>
                    <Button size="sm" variant="ghost" detail="Takes it out of your record. Resumes stop using it." note={FREE_UNDO} onClick={() => setMode("why")}>
                      Reject it
                    </Button>
                  </span>
                )}
                {mode === "context" && (
                  <div className="pt-1">
                    <WordsField
                      label="Context or direction"
                      placeholder={EXPLAIN.context}
                      save="Rewrite"
                      detail={EXPLAIN.rewrite.detail}
                      cost={cost}
                      optional
                      onSave={(note) => (done(), a.rework(note))}
                      onCancel={done}
                    />
                  </div>
                )}
                {mode === "why" && (
                  <div className="pt-1">
                    <ReasonField decision="Reject" picks={PICKS.fact} onDone={({ reason }) => (done(), a.reject(reason))} />
                  </div>
                )}
              </div>
              {tag && (
                <span className="flex h-6 shrink-0 items-center md:group-hover/fact:invisible md:group-has-[[data-state=open]]/fact:invisible md:group-has-[:focus-visible]/fact:invisible">{tag}</span>
              )}
              <span className="pointer-events-none absolute top-2 right-2 hidden items-center gap-0.5 bg-inherit pl-2 opacity-0 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100 md:flex md:group-hover/fact:pointer-events-auto md:group-hover/fact:opacity-100 md:group-has-[:focus-visible]/fact:pointer-events-auto md:group-has-[:focus-visible]/fact:opacity-100">
                  {sources.length > 0 && <BuiltOnPeek sources={sources} onOpenRecord={() => onOpen(f.id)} onEdit={fields.edit} align="end" />}
                  {!rejected && <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label="Edit" keys="E" detail={EXPLAIN.edit.detail} note={FREE_UNDO} onClick={fields.edit} />}
                  <Menu
                    items={menu}
                    label="More for this fact"
                    title="Fact"
                    description={f.data.text}
                    trigger={<Button variant="ghost" size="sm" iconOnly icon="more" aria-label="More for this fact" className="data-[state=open]:bg-border" />}
                  />
                </span>
            </>
          )}
        </div>
      </ContextMenu>
    </li>
  );
}
