"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialog";
import { Textarea } from "./Field";
import { Icons } from "./icons";
import { Kbd, KeyHint } from "./Kbd";

/** A note in the person's own words on any item. `at` is when it was written (ms). */
export type Note = { id: string; text: string; at: number };

type NoteBlockProps = {
  notes: Note[];
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  /** "Notes" and the count above the list, where the notes are a section of an item pane. */
  heading?: boolean;
  className?: string;
};

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// Where N would type or pick instead of adding a note.
const typingOrAsking = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]";

// Notes on an item, short and dated, each beside a steel rule. Hover or focus shows Edit and Delete (always shown on
// a phone); Delete asks first. "Add a note" (or N anywhere outside a field) opens the editor in place: ⌘↵ saves, Esc
// cancels, and focus goes back to where it came from.
export function NoteBlock({ notes, onAdd, onEdit, onDelete, heading = false, className = "" }: NoteBlockProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(typingOrAsking)) return;
      e.preventDefault();
      setEditing((now) => now ?? "new");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // After the editor closes, focus goes back to the note's Edit button, or to Add a note, if nothing else has taken it.
  const close = (id: string | null) => {
    setEditing(null);
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      (root.current?.querySelector<HTMLElement>(`[data-note-edit="${id}"]`) ?? add.current)?.focus();
    });
  };

  return (
    <div ref={root} className={`flex flex-col ${heading ? "gap-3" : "gap-4"} ${className}`}>
      {heading && (
        <h3 className="flex items-center gap-2">
          <span className="text-title-md leading-title-md font-semibold text-text">Notes</span>
          {notes.length > 0 && <span className="text-body-sm leading-body-sm text-muted tabular-nums">{notes.length}</span>}
        </h3>
      )}
      {notes.length > 0 && (
        <ul className={`flex flex-col ${heading ? "gap-3" : "gap-4"}`}>
          {notes.map((n) =>
            editing === n.id ? (
              <li key={n.id}>
                <NoteEditor
                  initial={n.text}
                  onSave={(text) => {
                    if (text !== n.text) onEdit(n.id, text);
                    close(n.id);
                  }}
                  onCancel={() => close(n.id)}
                />
              </li>
            ) : (
              <li
                key={n.id}
                className="group/note relative flex gap-3 border-l-2 border-steel py-0.5 pl-3 transition-colors duration-100 focus-within:bg-subtle md:hover:bg-subtle"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-body-md leading-body-md whitespace-pre-wrap text-text">{n.text}</p>
                  <time dateTime={new Date(n.at).toISOString()} className="text-body-sm leading-body-sm text-muted">
                    {day.format(n.at)}
                  </time>
                </div>
                <div className="flex shrink-0 items-start gap-0.5 bg-inherit md:absolute md:top-0.5 md:right-0 md:pl-1 md:opacity-0 md:group-hover/note:opacity-100 md:focus-within:opacity-100">
                  <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label="Edit note" detail="Opens the note to change its words." note="Free" data-note-edit={n.id} onClick={() => setEditing(n.id)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon="delete"
                    aria-label="Delete note"
                    detail="Deletes this note."
                    note="Free · Asks first · can’t be undone"
                    data-note-delete={n.id}
                    onClick={() => {
                      asked.current = n.id;
                      setDeleting(n);
                    }}
                  />
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {editing === "new" && (
        <NoteEditor
          initial=""
          onSave={(text) => {
            onAdd(text);
            close(null);
          }}
          onCancel={() => close(null)}
        />
      )}
      <button
        ref={add}
        type="button"
        aria-keyshortcuts="N"
        onClick={() => setEditing("new")}
        className="flex h-11 w-full items-center gap-2 rounded-sm border border-dashed border-border px-2 text-left text-body-sm leading-body-sm text-muted transition-colors duration-100 hover:bg-subtle hover:text-text md:h-8"
      >
        <Icons.add aria-hidden="true" />
        <span className="flex-1">Add a note</span>
        <span aria-hidden="true" className="hidden md:inline-flex">
          <Kbd>N</Kbd>
        </span>
      </button>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        // Cancelled, focus goes back to the note's Delete button; deleted, to Add a note.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          (root.current?.querySelector<HTMLElement>(`[data-note-delete="${asked.current}"]`) ?? add.current)?.focus();
        }}
        title="Delete this note?"
        body={deleting?.text}
        confirmLabel="Delete note"
        onConfirm={() => deleting && onDelete(deleting.id)}
      />
    </div>
  );
}

// The note being written: a Textarea that grows, with its keys inside the box. Empty text saves nothing.
function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = area.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const save = () => (text.trim() ? onSave(text.trim()) : onCancel());

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <Textarea
      ref={area}
      rows={1}
      aria-label={initial ? "Edit note" : "New note"}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      count={
        <span className="flex items-center gap-1.5">
          <KeyHint keys="⌘↵" onClick={save}>
            Save
          </KeyHint>
          <KeyHint keys="Esc" onClick={onCancel}>
            Cancel
          </KeyHint>
        </span>
      }
    />
  );
}
