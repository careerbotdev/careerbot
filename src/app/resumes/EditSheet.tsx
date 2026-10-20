"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type Bullet, type Contact, type Entry, type LineCheck, type ResumeDoc, type ResumeLayout, type ResumeLength, arrange, bulletStates, dates, entryKey, factUse, inOrder, orderFor, roomNote, shownLines } from "../../../convex/resumeDoc";
import { Button } from "@/components/Button";
import { BuiltOnPeek, type BuiltOnSource } from "@/components/BuiltOn";
import { CostAction } from "@/components/CostEstimate";
import { Field, Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { ContextMenu, Menu, type MenuEntry } from "@/components/Menu";
import { ReasonField } from "@/components/ReasonField";
import { StatusTag } from "@/components/StatusTag";
import { toast } from "@/components/Toast";
import { AddLine, WritingLine } from "./AddLine";
import { ContactBlock } from "./Contact";
import { type At, Line, type LineLook, Page } from "./Sheet";
import { FREE_UNDO, type Version } from "./words";
import { aboutUsd } from "../costs";

// A line's own role or project: what its pin, hide and order go by.
type Place = { roleKey?: string; projectKey?: string };

// The resume open for work: the page as it shows, the contact block edited in place, and each line opening onto what
// it's built on, with Pin (always shown) and Hide (left out here, kept as a struck line to bring back), and its ⋯ menu
// (Edit, Pin, Hide, Move up ⌥↑ and Move down ⌥↓ within its role, Check against facts), which a right-click or a long
// press on a phone also opens; on a pointer, its handle drags it within its role. The summary and any line can be put
// in their own words on this resume (click the words, or Edit): it keeps the facts it rests on and shows Edited, with
// CareerBot's words a click away, and Check against facts (paid, on their ask) says whether their words say only what
// the facts support, until they edit them again. Under each role or project with approved facts the resume doesn't
// use, Add a line puts one on (as written, or written for this resume). While Add what's new is open, the lines it
// proposes sit in their roles, each to Add or Skip.

const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t save that.", icon: "failed" });

// What a check against facts found, on the line: Supported, or Goes beyond with the words that do under the line.
function checkTag(c: LineCheck | undefined, checking: boolean) {
  if (checking) return <StatusTag tone="info" icon="running">Checking</StatusTag>;
  if (!c) return null;
  return c.supported ? <StatusTag tone="good">Supported</StatusTag> : <StatusTag tone="caution">Goes beyond</StatusTag>;
}
function checkNote(c: LineCheck | undefined) {
  if (!c || c.supported) return null;
  return <span className="text-label leading-label text-caution-text">{c.beyond.length ? `Beyond its facts: ${c.beyond.map((p) => `“${p}”`).join(", ")}` : "Says more than its facts support"}</span>;
}

// Where a fact lives in Record.
export const factHref = (at: { roleKey?: string; projectKey?: string }) => (at.roleKey ? `/record/roles?role=${encodeURIComponent(at.roleKey)}` : "/record/projects");

export function sourcesOf(factIds: string[], facts: Record<string, string>, at: At): BuiltOnSource[] {
  return factIds.map((id) => ({ kind: "fact", text: facts[id] ?? "No longer in your record", source: `Fact · ${at.where}`, approved: id in facts, href: factHref(at) }));
}

// The muted line under a role's title for the roles folded into it: "includes Volunteer Logistics Lead, Three Rivers Pantry Network, Sep 2021 – Mar 2023".
export function foldedLine(folds: { roleKey: string; into: Entry }[], written: ResumeDoc) {
  return (e: Entry) => {
    const inside = folds.filter((f) => f.into.roleKey === e.roleKey).flatMap((f) => written.experience.filter((x) => x.roleKey === f.roleKey));
    return inside.length ? `includes ${inside.map((x) => [x.break ? x.title : `${x.title}, ${x.employer}`, dates(x)].filter(Boolean).join(", ")).join("; ")}` : null;
  };
}

export function EditSheet({
  id,
  version,
  settings,
  facts,
  places,
  length,
  writing,
  contact,
  small,
  canAdd,
}: {
  id: Id<"resumes">;
  version: Pick<Version, "doc" | "layout" | "additions">;
  settings: ResumeLayout;
  facts: Record<string, string>;
  // Where each approved fact goes on a resume (list.places), for Add a line.
  places: Record<string, { roleKey?: string; projectKey?: string }>;
  // The length it's written to, for the note on Add a line.
  length: ResumeLength;
  // The facts a line is being written from for this resume.
  writing: string[];
  contact: Contact | null;
  small: boolean;
  // Add what's new lines can be added here (a base or direction resume's current version).
  canAdd: boolean;
}) {
  const router = useRouter();
  const setBullet = useMutation(api.resume.setBullet);
  const setLine = useMutation(api.resume.setLine);
  const setWords = useMutation(api.resume.setWords);
  const setSummary = useMutation(api.resume.setSummary);
  const startCheck = useMutation(api.lineCheck.check);
  const moveLine = useMutation(api.resume.moveLine);
  const addLine = useMutation(api.resume.addLine);
  const removeLine = useMutation(api.resume.removeLine);
  const writeLine = useMutation(api.resume.writeLine);
  const checking = useQuery(api.lineCheck.checking, { id });
  const costs = useQuery(api.estimates.costs, {});
  const checkCost = aboutUsd(costs?.lineCheck) ?? "Uses your AI budget";
  const rework = useMutation(api.extract.rework);
  const reworkCost = aboutUsd(costs?.rewrite) ?? "Uses your AI budget";
  const lineCost = aboutUsd(costs?.resumeLine) ?? "Uses your AI budget";
  const [why, setWhy] = useState<number | null>(null);
  // The line being dragged by its handle: CareerBot's words and the role or project it's in.
  const [dragging, setDragging] = useState<{ text: string; at: Place } | null>(null);
  // What's open to edit: "summary", or a line by CareerBot's words.
  const [editing, setEditing] = useState<string | null>(null);
  const written = version.doc!;
  const layout = version.layout;
  const arranged = arrange(written, settings, layout);
  // Pins and hides go by a line's words within its own role or project.
  const stateIn = bulletStates(layout.bullets);
  const use = factUse(written, layout, places);
  const room = roomNote(shownLines(arranged.doc), length);
  const lines = canAdd ? (version.additions?.lines ?? []) : [];
  const added = new Set(lines.filter((l) => l.state === "added").map((l) => l.text));
  const mark = (text: string, at: Place, state: "pinned" | "hidden" | null, undo: "pinned" | "hidden" | null) =>
    void setBullet({ id, text, state, ...at }).then(
      () => toast({ message: state === "pinned" ? "Pinned" : state === "hidden" ? "Hidden on this resume" : undo === "pinned" ? "Unpinned" : "Shown again", icon: state === "hidden" ? "setAside" : "done", action: { label: "Undo", key: "U", run: () => void setBullet({ id, text, state: undo, ...at }).catch(failed) } }),
      failed,
    );
  // A line's actions show on hover or focus, and stay while the Built on peek they hold is open: the pointer leaves
  // the line and focus goes into the peek, and a hidden chip would leave the peek nothing to sit under.
  const quiet = "hidden group-hover/line:flex group-focus-within/line:flex has-[[data-state=open]]:flex";
  const theirs = new Map((layout.words ?? []).map((w) => [w.text, w.to]));
  const checks = new Map((layout.words ?? []).flatMap((w) => (w.check ? [[w.text, w.check] as const] : [])));
  // Check against facts: a line by CareerBot's words, or the summary (no line).
  const check = (line?: string) =>
    void startCheck({ id, ...(line !== undefined ? { line } : {}) }).then(
      (jobId) => toast(jobId ? { message: line === undefined ? "Checking the summary against its facts" : "Checking the line against its facts", icon: "running" } : { message: "Already checking it.", icon: "failed" }),
      failed,
    );
  const checkAction = (line?: string) => (
    <CostAction
      variant="ghost"
      size="sm"
      className="h-6"
      amount={checkCost}
      detail={line === undefined ? "Checks whether your summary says only what the resume’s facts support, and marks any words that go beyond them." : "Checks whether this line says only what its facts support, and marks any words that go beyond them."}
      note={`${checkCost} · The words stay as they are`}
      onClick={() => check(line)}
    >
      Check against facts
    </CostAction>
  );
  // Saves a line in their words (null: CareerBot's again), with Undo back to what it read before.
  const reword = (text: string, to: string | null) => {
    const before = theirs.get(text) ?? null;
    return setWords({ id, text, to }).then(() =>
      toast({ message: to === null ? "CareerBot’s words are back" : "Line saved in your words", icon: "done", action: { label: "Undo", key: "U", run: () => void setWords({ id, text, to: before }).catch(failed) } }),
    );
  };
  const resummarize = (text: string | null) => {
    const before = layout.summary ?? null;
    return setSummary({ id, text }).then(() =>
      toast({ message: text === null ? "CareerBot’s summary is back" : "Summary saved in your words", icon: "done", action: { label: "Undo", key: "U", run: () => void setSummary({ id, text: before }).catch(failed) } }),
    );
  };
  // The line beside the facts it rests on, each as it reads in the record, with Rewrite this fact… for an approved one:
  // a new wording with their comment, to Review > Rewrites (Update lines then offers the line in its new words).
  const ask = (factId: string, note: string) =>
    rework({ id: factId as Id<"items">, note }).then(() => toast({ message: "Asked for a rewrite. It comes to Review under Rewrites.", icon: "running" }), failed);
  const peek = (b: Bullet, at: At) =>
    b.factIds.length > 0 && (
      <BuiltOnPeek
        align="end"
        line={b.text}
        reworkCost={reworkCost}
        sources={sourcesOf(b.factIds, facts, at).map((s, i) => ({ ...s, source: `In your record · ${at.where}`, ...(s.approved ? { rework: (note: string) => ask(b.factIds[i], note) } : {}) }))}
        onOpenRecord={() => router.push(factHref(at))}
      />
    );
  // A line's role or project as written (a folded role's own, not the one it shows in: `at` is where it shows), its
  // lines in their order with hidden ones, the ones shown, and where the line is among those.
  const placeOf = (text: string, at: Place) => {
    const entries = [
      ...written.experience.map((e) => ({ at: { roleKey: e.roleKey } as Place, name: arranged.doc.experience.find((x) => x.roleKey === e.roleKey)?.title ?? e.title, bullets: e.bullets })),
      ...(written.projects ?? []).map((p) => ({ at: { projectKey: p.projectKey } as Place, name: p.name, bullets: p.bullets })),
    ];
    const here = (e: (typeof entries)[number]) => (at.projectKey ? e.at.projectKey === at.projectKey : !e.at.projectKey && within(at.roleKey).includes(e.at.roleKey));
    const entry = entries.find((e) => here(e) && e.bullets.some((b) => b.text === text));
    if (!entry) return null;
    const all = inOrder(entry.bullets, orderFor(layout.order, entry.at)?.lines);
    const shown = all.filter((b) => stateIn(entry.at, b.text) !== "hidden");
    return { at: entry.at, name: entry.name, all, shown, i: shown.findIndex((b) => b.text === text) };
  };
  // Moves a line to where `to` is among its role's lines, with Undo back to where it was.
  const moveTo = (text: string, place: Place, to: string, message: string) => {
    const p = placeOf(text, place);
    const at = p?.all.findIndex((b) => b.text === to) ?? -1;
    if (!p || at < 0 || to === text) return;
    void moveLine({ id, text, to: at, ...p.at }).then(
      (from) => toast({ message, icon: "done", action: { label: "Undo", key: "U", run: () => void moveLine({ id, text, to: from, ...p.at }).catch(failed) } }),
      failed,
    );
  };
  const move = (text: string, place: Place, by: -1 | 1) => {
    const p = placeOf(text, place);
    const next = p?.shown[p.i + by];
    if (next) moveTo(text, place, next.text, by < 0 ? "Moved up" : "Moved down");
  };
  const MOVE = "Moves the line within its role on this resume. The order carries into new versions.";
  // A line's ⋯ menu, and what a right-click or a long press on a phone opens.
  const lineMenu = (b: Bullet, key: string, at: At): MenuEntry[] => {
    const p = placeOf(key, at);
    const own = p?.at ?? at;
    const pinned = stateIn(own, key) === "pinned";
    return [
      { label: "Edit", icon: "edit", keys: "E", detail: "Puts this line in your own words on this resume. It stays built on the same facts, marked Edited.", note: FREE_UNDO, onSelect: () => setEditing(`line:${key}`) },
      ...(b.edited ? [{ label: "Use CareerBot’s", icon: "undo" as const, detail: `Puts CareerBot’s words back: “${key}”`, note: FREE_UNDO, onSelect: () => void reword(key, null).catch(failed) }] : []),
      { label: pinned ? "Unpin" : "Pin", icon: "pin", detail: pinned ? "Lets the layout decide whether it shows." : "Keeps this line on this resume, in every new version too, even when its role folds.", note: FREE_UNDO, onSelect: () => mark(key, own, pinned ? null : "pinned", pinned ? "pinned" : null) },
      { label: "Hide", icon: "hide", detail: "Takes this line off this resume and keeps it off in new versions. It stays here, struck, to bring back.", note: FREE_UNDO, onSelect: () => mark(key, own, "hidden", pinned ? "pinned" : null) },
      "separator",
      { label: "Move up", icon: "moveUp", keys: "⌥↑", detail: MOVE, note: FREE_UNDO, onSelect: () => move(key, at, -1), ...(!p || p.i <= 0 ? { disabled: true, reason: "It’s the first line here" } : {}) },
      { label: "Move down", icon: "moveDown", keys: "⌥↓", detail: MOVE, note: FREE_UNDO, onSelect: () => move(key, at, 1), ...(!p || p.i >= p.shown.length - 1 ? { disabled: true, reason: "It’s the last line here" } : {}) },
      ...(small && b.factIds.length ? ["separator" as const, { label: `Built on ${b.factIds.length}`, icon: "builtOn" as const, detail: "Opens what this line rests on in your record.", note: "Free", onSelect: () => router.push(factHref(at)) }] : []),
      ...(b.edited && !checking?.lines.includes(key)
        ? [
            ...(small && b.factIds.length ? [] : ["separator" as const]),
            { label: "Check against facts", icon: "approve" as const, hint: checkCost, detail: "Checks whether this line says only what its facts support, and marks any words that go beyond them.", note: `${checkCost} · The words stay as they are`, onSelect: () => check(key) },
          ]
        : []),
    ];
  };
  const line = (b: Bullet, at: At) => {
    // Pins, hides, edits and moves go by CareerBot's words.
    const key = b.original ?? b.text;
    if (editing === `line:${key}`) {
      return (
        <li className="px-1.5 py-1">
          <WordsEditor label="This line" initial={b.text} rows={2} onSave={(to) => reword(key, to)} onDone={() => setEditing(null)} />
        </li>
      );
    }
    const p = placeOf(key, at);
    const own = p?.at ?? at;
    const pinned = stateIn(own, key) === "pinned";
    const items = lineMenu(b, key, at);
    const title = p ? `${p.name} · line ${p.i + 1} of ${p.shown.length}` : at.where;
    const aside: ReactNode = (
      <>
        {added.has(key) && <StatusTag tone="good">Added</StatusTag>}
        {b.added && <StatusTag tone="neutral">Added</StatusTag>}
        {b.unsourced && <StatusTag tone="caution">No approved basis</StatusTag>}
        <span className={`${quiet} items-center gap-1`}>
          {peek(b, at)}
          <Button variant="ghost" size="sm" className="h-6" detail={pinned ? "Lets the layout decide whether it shows." : "Keeps this line on this resume, in every new version too, even when its role folds."} note={FREE_UNDO} onClick={() => mark(key, own, pinned ? null : "pinned", pinned ? "pinned" : null)}>
            {pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" className="h-6" detail="Takes this line off this resume and keeps it off in new versions. It stays here, struck, to bring back." note={FREE_UNDO} onClick={() => mark(key, own, "hidden", pinned ? "pinned" : null)}>
            Hide
          </Button>
          <Menu items={items} label="More for this line" title={title} description={b.text} trigger={<Button variant="ghost" size="sm" iconOnly icon="more" aria-label="More for this line" className="h-6 w-6 data-[state=open]:bg-border data-[state=open]:text-text" />} />
        </span>
        {b.edited && <StatusTag tone="neutral">Edited</StatusTag>}
        {b.edited && checkTag(checks.get(key), !!checking?.lines.includes(key))}
        {pinned && <StatusTag tone="info">Pinned</StatusTag>}
      </>
    );
    // Drag by the handle (on a pointer), within its role: dropped on another line of the same role, it takes its place.
    const handle = !small && p && p.shown.length > 1 && (
      <span
        draggable
        aria-hidden="true"
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", key);
          setDragging({ text: key, at: own });
        }}
        onDragEnd={() => setDragging(null)}
        className="absolute top-[5px] -left-4 hidden cursor-grab text-muted group-hover/line:block active:cursor-grabbing"
      >
        <Icons.drag size={14} />
      </span>
    );
    const sameRole = dragging !== null && dragging.text !== key && entryKey(dragging.at) === entryKey(own);
    return (
      <ContextMenu items={items} title={title} description={b.text}>
        <Line
          text={b.text}
          look={{
            aside,
            stack: true,
            lead: handle,
            onEdit: () => setEditing(`line:${key}`),
            note: b.edited ? checkNote(checks.get(key)) : null,
            className: `outline-none hover:bg-subtle focus-within:bg-subtle has-[[data-state=open]]:bg-subtle ${dragging?.text === key && entryKey(dragging.at) === entryKey(own) ? "opacity-50" : ""}`,
          }}
          onKeyDown={(e) => {
            if (e.target instanceof Element && e.target.closest("input, textarea, [role=menu]")) return;
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              move(key, at, e.key === "ArrowUp" ? -1 : 1);
            } else if (!e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "e" && e.target === e.currentTarget.querySelector("[role=button]")) {
              e.preventDefault();
              setEditing(`line:${key}`);
            }
          }}
          onDragOver={(e) => {
            if (!sameRole) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            if (!sameRole || !dragging) return;
            e.preventDefault();
            moveTo(dragging.text, dragging.at, key, "Moved");
            setDragging(null);
          }}
        />
      </ContextMenu>
    );
  };
  const summary = (text: string) =>
    editing === "summary" ? (
      <WordsEditor label="Summary" initial={text} rows={4} onSave={(to) => resummarize(to)} onDone={() => setEditing(null)} />
    ) : (
      <div data-tour="resumes.summary" className="group/line -mx-1.5 flex items-start gap-2 rounded-sm px-1.5 py-[3px] hover:bg-subtle focus-within:bg-subtle">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p
            role="button"
            tabIndex={0}
            aria-label="Edit the summary"
            onClick={() => setEditing("summary")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setEditing("summary");
              }
            }}
            className="min-w-0 flex-1 cursor-text rounded-xs text-body-sm leading-body-sm text-text outline-none focus-visible:ring-1 focus-visible:ring-steel"
          >
            {text}
          </p>
          {arranged.summaryEdited && checkNote(layout.summaryCheck)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={`${quiet} items-center gap-1`}>
            <Button variant="ghost" size="sm" className="h-6" detail="Puts the summary in your own words on this resume. A new version is written with its own summary." note="Free · Undo with U" onClick={() => setEditing("summary")}>
              Edit
            </Button>
            {arranged.summaryEdited && (
              <Button variant="ghost" size="sm" className="h-6" detail="Puts CareerBot’s summary back." note="Free · Undo with U" onClick={() => void resummarize(null).catch(failed)}>
                Use CareerBot’s
              </Button>
            )}
            {arranged.summaryEdited && !checking?.summary && checkAction()}
          </span>
          {arranged.summaryEdited && <StatusTag tone="neutral">Edited</StatusTag>}
          {arranged.summaryEdited && checkTag(layout.summaryCheck, !!checking?.summary)}
        </span>
      </div>
    );
  // The entries folded into a shown one, so their lines left out show with it.
  const within = (roleKey?: string) => [roleKey, ...arranged.folds.filter((f) => f.into.roleKey === roleKey).map((f) => f.roleKey)];
  const hiddenIn = (at: At) => {
    const own = at.roleKey
      ? written.experience.filter((e) => within(at.roleKey).includes(e.roleKey)).flatMap((e) => e.bullets.map((b) => ({ b, at: { roleKey: e.roleKey } as Place })))
      : (written.projects ?? []).filter((p) => p.projectKey === at.projectKey).flatMap((p) => p.bullets.map((b) => ({ b, at: { projectKey: p.projectKey } as Place })));
    return own.filter(({ b, at: place }) => stateIn(place, b.text) === "hidden");
  };
  // Add a line: puts a fact on as written (Undo takes it off again), or writes a line from it for this resume.
  const addAsWritten = (factId: string, name: string) =>
    void addLine({ id, factId: factId as Id<"items"> }).then(
      (text) => toast({ message: `Line added to ${name}`, icon: "done", action: { label: "Undo", key: "U", run: () => void removeLine({ id, text }).catch(failed) } }),
      failed,
    );
  const writeFor = (factId: string) =>
    void writeLine({ id, factId: factId as Id<"items"> }).then((jobId) => toast(jobId ? { message: "Writing a line for this resume from your record", icon: "running" } : { message: "Already writing that line.", icon: "failed" }), failed);
  const addRow = (at: At) => {
    const k = entryKey(at);
    const name = at.projectKey ? (written.projects?.find((p) => p.projectKey === at.projectKey)?.name ?? at.where) : (arranged.doc.experience.find((e) => e.roleKey === at.roleKey)?.title ?? at.where);
    const busy = writing.filter((f) => places[f] && entryKey(places[f]) === k);
    const open = (use.unused[k] ?? []).filter((f) => !busy.includes(f) && facts[f]);
    return (
      <>
        {busy.map((f) => (
          <WritingLine key={`w:${f}`} />
        ))}
        {open.length > 0 && (
          <AddLine
            where={name}
            facts={open.map((f) => ({ id: f, text: facts[f] }))}
            room={room}
            cost={lineCost}
            small={small}
            onAdd={(f) => addAsWritten(f, name)}
            onWrite={writeFor}
          />
        )}
      </>
    );
  };
  const after = (at: At) => {
    const hidden = hiddenIn(at);
    const proposed = lines.flatMap((l, i) => (l.state !== "added" && (at.roleKey ? within(at.roleKey).includes(l.roleKey) : l.projectKey === at.projectKey) ? [{ l, i }] : []));
    const k = entryKey(at);
    const adding = (use.unused[k]?.length ?? 0) > 0 || writing.some((f) => places[f] && entryKey(places[f]) === k);
    if (!hidden.length && !proposed.length && !adding) return null;
    return (
      <>
        {hidden.map(({ b, at: place }) => (
          <Line
            key={`h:${entryKey(place)}:${b.text}`}
            text={b.text}
            look={{
              tone: "struck",
              className: "outline-none",
              aside: (
                <>
                  <span className={quiet}>
                    <Button variant="ghost" size="sm" className="h-6" detail="Shows it on this resume again." note="Free" onClick={() => mark(b.text, place, null, "hidden")}>
                      Show
                    </Button>
                  </span>
                  <StatusTag tone="neutral">Hidden</StatusTag>
                </>
              ),
            }}
          />
        ))}
        {proposed.map(({ l, i }) => {
          const set = (state: "added" | "skipped" | null, reason?: string) => void setLine({ id, index: i, state, ...(reason ? { reason } : {}) }).catch(failed);
          const look: LineLook =
            l.state === "skipped"
              ? {
                  tone: "struck",
                  aside: (
                    <>
                      <span className={quiet}>
                        <Button variant="ghost" size="sm" className="h-6" detail="Brings the line back, to add or skip." note="Free" onClick={() => set(null)}>
                          Undo
                        </Button>
                      </span>
                      <StatusTag tone="neutral">Skipped</StatusTag>
                    </>
                  ),
                }
              : {
                  tone: "added",
                  stack: true,
                  aside: (
                    <>
                      {peek({ text: l.text, factIds: l.factIds }, at)}
                      <Button variant="ghost" size="sm" className="h-6" detail="Adds this line to the resume. The rest stays as it is." note="Free · Undo from the line" onClick={() => set("added")}>
                        Add
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6"
                        detail="Leaves it off. What it’s built on isn’t proposed again for this resume unless you change it."
                        note="Free"
                        onClick={() => {
                          set("skipped");
                          setWhy(i);
                        }}
                      >
                        Skip
                      </Button>
                    </>
                  ),
                };
          return (
            <Fragment key={`a:${i}`}>
              <Line text={l.text} look={look} />
              {why === i && (
                <li className="px-1.5 py-1">
                  <ReasonField
                    picks={["Not for this resume", "Already covered", "Wording"]}
                    onDone={({ reason }) => {
                      setWhy(null);
                      if (reason) set("skipped", reason);
                    }}
                  />
                </li>
              )}
            </Fragment>
          );
        })}
        {adding && addRow(at)}
      </>
    );
  };
  return <Page doc={arranged.doc} small={small} parts={{ contact: <ContactBlock contact={contact} small={small} />, line, after, summary, folded: foldedLine(arranged.folds, written) }} />;
}

// Words edited where they're shown: the field takes focus at the end of the text; Enter or Save saves, Esc cancels.
function WordsEditor({ label, initial, rows, onSave, onDone }: { label: string; initial: string; rows: number; onSave: (value: string) => Promise<unknown>; onDone: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const submit = () => {
    if (value.trim() === initial.trim()) return onDone();
    setSaving(true);
    onSave(value.trim())
      .then(onDone)
      .catch((e: unknown) => setError(e instanceof ConvexError ? String(e.data) : "Couldn’t save that."))
      .finally(() => setSaving(false));
  };
  return (
    <div className="flex flex-col gap-2">
      <Field label={label} hint="Your words, on this resume only. It stays built on the same facts." error={error} className="[&>label]:sr-only">
        {(p) => (
          <Textarea
            {...p}
            autoFocus
            rows={rows}
            value={value}
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onDone();
              }
            }}
          />
        )}
      </Field>
      <span className="flex items-center gap-1">
        <Button size="sm" loading={saving} loadingLabel="Saving" detail="Saves your words on this resume. Its PDF, Word and Google Doc follow." note="Free · Undo with U" onClick={submit}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </span>
    </div>
  );
}
