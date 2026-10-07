"use client";

import type { FunctionReturnType } from "convex/server";
import { Fragment } from "react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/Button";
import { Icons } from "@/components/icons";
import { Select } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { type Change, changesIn, diff, isHeading, whatChanged, whenLong, wordCount, wordsLabel } from "./words";

// A story's versions: the list (the third pane beside the story, a page of its own on a phone), each with when, how
// long and what it changed, Restore on hover; and the comparison of two of them in the item pane, what was added and
// taken out with the unchanged paragraphs folded.

export type Story = NonNullable<FunctionReturnType<typeof api.narratives.get>>;
type Version = Story["versions"][number];
export type Pair = { from: number; to: number };

export function VersionList({ story, pair, onPick, onRestore }: { story: Story; pair: Pair | null; onPick: (version: number) => void; onRestore: (version: number) => void }) {
  return (
    <ul aria-label="Versions" className="flex flex-col gap-1 pb-2">
      {story.versions.map((v, i) => {
        const current = v.version === story.version;
        const role = pair?.to === v.version ? "To" : pair?.from === v.version ? "From" : null;
        return (
          <li
            key={v.version}
            className={`group/version relative flex items-start gap-3 rounded-sm border px-[11px] py-2.5 transition-colors duration-100 ${
              role === "To" ? "border-steel bg-steel-subtle" : role === "From" ? "border-border bg-surface" : "border-transparent hover:bg-surface"
            }`}
          >
            <button type="button" onClick={() => onPick(v.version)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left outline-offset-2">
              <span className="flex items-center gap-2">
                <span className="text-body-md leading-body-md font-medium text-text">Version {v.version}</span>
                {current && <StatusTag tone="neutral">Current</StatusTag>}
                {role && <StatusTag tone="info">{role}</StatusTag>}
              </span>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">
                {whenLong(v.at)} · {wordsLabel(wordCount(v.body))}
              </span>
              <span className="pt-1 text-body-sm leading-body-sm text-text">{whatChanged(v, story.versions[i + 1], story.versions.slice(i + 2))}</span>
            </button>
            {!current && (
              <span className="shrink-0 md:opacity-0 md:group-hover/version:opacity-100 md:focus-within:opacity-100">
                <Button size="sm" icon="undo" detail={`Saves version ${v.version} as the newest. The versions after it stay in the list.`} note="Free · Undo with U" onClick={() => onRestore(v.version)}>
                  Restore
                </Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Unchanged paragraphs fold, but for the one just before a change (and the heading over it).
type Block = { kind: "change"; change: Change } | { kind: "context"; text: string } | { kind: "fold"; count: number; at: "start" | "middle" | "end" };

function blocksOf(changes: Change[]): Block[] {
  const out: Block[] = [];
  let k = 0;
  while (k < changes.length) {
    if (changes[k].kind !== "same") {
      out.push({ kind: "change", change: changes[k++] });
      continue;
    }
    const run: string[] = [];
    while (k < changes.length && changes[k].kind === "same") run.push(changes[k++].text);
    const end = k === changes.length;
    let keep = end ? 0 : 1;
    if (!end && run.length > 1 && isHeading(run[run.length - 2])) keep = 2;
    keep = Math.min(keep, run.length);
    const folded = run.length - keep;
    if (folded > 0) out.push({ kind: "fold", count: folded, at: out.length === 0 ? "start" : end ? "end" : "middle" });
    for (const text of run.slice(folded)) out.push({ kind: "context", text });
  }
  return out;
}

const foldWords = (b: Extract<Block, { kind: "fold" }>) => {
  const n = `${b.count} ${b.count === 1 ? "paragraph" : "paragraphs"}`;
  return b.at === "start" ? `Opening unchanged · ${n}` : b.at === "end" ? `The rest unchanged · ${n}` : `${n} unchanged`;
};

function Paragraph({ text, muted }: { text: string; muted?: boolean }) {
  return isHeading(text) ? (
    <p className="text-title-md leading-title-md font-semibold text-text">{text}</p>
  ) : (
    <p className={`text-body-md leading-body-md ${muted ? "text-muted" : "text-text"}`}>{text}</p>
  );
}

// The two versions picked, compared: From and To, how much changed, Restore the From version when it isn't the current
// one, then the text with what was added and taken out marked.
export function Compare({ story, pair, onPair, onRestore }: { story: Story; pair: Pair; onPair: (p: Pair) => void; onRestore: (version: number) => void }) {
  const find = (n: number) => story.versions.find((v) => v.version === n);
  const from = find(pair.from);
  const to = find(pair.to);
  const options = story.versions.map((v: Version) => ({ value: String(v.version), label: `Version ${v.version}` }));
  if (!from || !to) return null;
  const changes = diff(from.body, to.body);
  const count = changesIn(changes);
  const delta = wordCount(to.body) - wordCount(from.body);
  return (
    <div className="flex max-w-[600px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select label="From" value={String(pair.from)} onChange={(v) => onPair({ ...pair, from: Number(v) })} options={options} display={<><span className="mr-2 text-muted">From</span>Version {pair.from}</>} className="min-w-0" />
        <Icons.goIn aria-hidden className="shrink-0 text-muted" />
        <Select label="To" value={String(pair.to)} onChange={(v) => onPair({ ...pair, to: Number(v) })} options={options} display={<><span className="mr-2 text-muted">To</span>Version {pair.to}</>} className="min-w-0" />
      </div>
      <div className="flex items-center gap-3">
        <p className="flex-1 text-body-sm leading-body-sm text-muted tabular-nums">
          {delta === 0 ? "Same length" : `${delta > 0 ? "+" : "−"}${wordsLabel(Math.abs(delta))}`} · {count === 0 ? "no changes" : `${count} ${count === 1 ? "change" : "changes"}`}
        </p>
        {pair.from !== story.version && (
          <Button icon="undo" detail={`Saves version ${pair.from} as the newest. The versions after it stay in the list.`} note="Free · Undo with U" onClick={() => onRestore(pair.from)}>
            Restore version {pair.from}
          </Button>
        )}
      </div>
      {blocksOf(changes).map((b, i) => (
        <Fragment key={i}>
          {b.kind === "fold" && (
            <div className="flex items-center gap-2">
              <span className="h-px flex-1 border-t border-dashed" />
              <span className="text-label leading-label font-medium text-muted">{foldWords(b)}</span>
              <span className="h-px flex-1 border-t border-dashed" />
            </div>
          )}
          {b.kind === "context" && <Paragraph text={b.text} muted />}
          {b.kind === "change" &&
            (b.change.kind === "added" ? (
              <div className="rounded-sm bg-good-subtle px-2 py-1 shadow-[inset_2px_0_0_var(--color-good)]">
                <span className="sr-only">Added: </span>
                <Paragraph text={b.change.text} />
              </div>
            ) : (
              <div className="rounded-sm bg-red/6 px-2 py-1 shadow-[inset_2px_0_0_var(--color-red)]">
                <span className="sr-only">Taken out: </span>
                <p className="text-body-md leading-body-md text-muted line-through">{b.change.text}</p>
              </div>
            ))}
        </Fragment>
      ))}
    </div>
  );
}
