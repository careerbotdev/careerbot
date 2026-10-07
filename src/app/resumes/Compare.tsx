"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Bullet, Contact, ResumeDoc } from "../../../convex/resumeDoc";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Select } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { sourcesOf } from "./EditSheet";
import { ChangeRow } from "./History";
import { Line, ResumeSheet } from "./Sheet";
import { day } from "./words";

// Two versions of one resume side by side (the older left): what changed in substance, then both pages, the lines one
// has and the other doesn't marked, and a role whose title changed tagged. Either side can be any kept version, or
// the new one waiting to be kept or discarded.

export type Choice = { id: Id<"resumes">; label: string };

const lines = (d: ResumeDoc) => [...d.experience.flatMap((e) => [...e.bullets, ...(e.projects ?? []).flatMap((p) => p.bullets)]), ...(d.projects ?? []).flatMap((p) => p.bullets)];
// Whether a line says something the other page doesn't: none of its facts are behind a line there (or, with none, no
// line there has its words).
const newTo = (b: Bullet, other: ResumeDoc) => {
  const all = lines(other);
  if (!b.factIds.length) return !all.some((x) => x.text === b.text);
  const cited = new Set(all.flatMap((x) => x.factIds));
  return !b.factIds.some((f) => cited.has(f));
};

export function Compare({
  from,
  to,
  choices,
  onFrom,
  onTo,
  facts,
  contact,
  stacked,
}: {
  from: Id<"resumes">;
  to: Id<"resumes">;
  choices: Choice[];
  onFrom: (id: Id<"resumes">) => void;
  onTo: (id: Id<"resumes">) => void;
  facts: Record<string, string>;
  contact: Contact | null;
  stacked: boolean;
}) {
  const a = useQuery(api.resume.version, { id: from });
  const b = useQuery(api.resume.version, { id: to });
  const changes = useQuery(api.resume.compare, { from, to });
  if (!a || !b) return null;
  const side = (v: typeof a, other: typeof b, pick: Id<"resumes">, onPick: (id: Id<"resumes">) => void, left: boolean) => (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <Select label={left ? "Older version" : "Newer version"} value={pick as string} onChange={(id) => onPick(id as Id<"resumes">)} options={choices.map((c) => ({ value: c.id as string, label: c.label }))} className="w-60 max-w-full" />
      {v.doc && other.doc ? (
        <ResumeSheet
          doc={v.doc}
          contact={contact}
          small={stacked}
          parts={{
            line: (x, at) =>
              !newTo(x, other.doc!) ? (
                <Line text={x.text} />
              ) : left ? (
                <Line text={x.text} look={{ aside: <StatusTag tone="neutral">Not in new</StatusTag> }} />
              ) : (
                <Line text={x.text} look={{ tone: "added", aside: x.factIds.length > 0 && <BuiltOnPeek align="end" sources={sourcesOf(x.factIds, facts, at)} /> }} />
              ),
            titleTag: (e) => {
              const was = other.doc!.experience.find((x) => x.roleKey && x.roleKey === e.roleKey);
              return !left && was && was.title !== e.title ? <StatusTag tone="info">New title</StatusTag> : null;
            },
          }}
        />
      ) : (
        <p className="rounded-sm border bg-surface p-4 text-body-sm leading-body-sm whitespace-pre-wrap text-text">{v.text}</p>
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      {changes && changes.changes.length > 0 && (
        <section className="flex flex-col">
          <h3 className="flex items-center gap-1.5 pb-2 text-label leading-label font-medium text-text">
            What changed <span className="text-muted tabular-nums">{changes.changes.length}</span>
          </h3>
          <ul className="flex flex-col border-b">
            {changes.changes.map((c, i) => (
              <ChangeRow key={i} c={c} facts={facts} wide />
            ))}
          </ul>
        </section>
      )}
      <div className="@container">
        <div className={`flex flex-col gap-4 ${stacked ? "" : "@3xl:flex-row"}`}>
          {side(a, b, from, onFrom, true)}
          {side(b, a, to, onTo, false)}
        </div>
      </div>
    </div>
  );
}

// The choices for either side: every kept version (the current one marked) and the one waiting, if any.
export function choicesOf(versions: { id: Id<"resumes">; at: number }[], waiting: Id<"resumes"> | null): Choice[] {
  return [...(waiting ? [{ id: waiting, label: "New version" }] : []), ...versions.map((v, i) => ({ id: v.id, label: `${day(v.at)}${i === 0 ? " · current" : ""}` }))];
}
