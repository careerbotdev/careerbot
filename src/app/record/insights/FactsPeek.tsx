"use client";

import Link from "next/link";
import { Icons } from "@/components/icons";
import { type Insight, type Owners, placeOf } from "./words";

// What an insight is built on, beside it (the third pane; a drawer on medium screens, a sheet on a phone): its facts
// grouped by the role or project they come from, each with the words from their story it was read from, and a way to
// the story. A fact opens where it lives. `lit`: the fact pointed at in the item, lit here too.
export function FactsPeek({ insight, owners, lit, onLight }: { insight: Insight; owners: Owners; lit: string | null; onLight: (id: string | null) => void }) {
  const groups = new Map<string, { label: string; project: boolean; story: string | null; open: string | null; facts: Insight["basedOn"] }>();
  for (const f of insight.basedOn) {
    const place = placeOf(f, owners);
    const g = groups.get(place.key) ?? { label: place.label, project: !!f.projectKey, story: null, open: null, facts: [] };
    const source = owners.facts.get(f.id)?.sources[0];
    const project = f.projectKey ? owners.projects.get(f.projectKey) : undefined;
    g.story ??= source ? `/record/story?story=${source.narrativeId}` : null;
    g.open ??= project ? `/record/projects?project=${project.id}` : null;
    g.facts.push(f);
    groups.set(place.key, g);
  }
  return (
    <div className="-mx-4 -mb-4 flex flex-col">
      {[...groups].map(([key, g]) => {
        const Mark = g.project ? Icons.projects : Icons.story;
        const to = g.project ? g.open : g.story;
        return (
          <section key={key} aria-label={g.label} className="flex flex-col">
            <h3 className="flex items-center gap-1.5 px-4 pt-3.5 pb-1.5">
              <Mark size={14} aria-hidden className="shrink-0 text-muted" />
              <span className="min-w-0 truncate text-label leading-label font-medium text-text">{g.label}</span>
              <span className="text-label leading-label text-muted tabular-nums">{g.facts.length}</span>
              <span className="flex-1" />
              {to && (
                <Link href={to} className="tap shrink-0 text-label leading-label text-muted underline decoration-border underline-offset-3 hover:text-text hover:decoration-text">
                  {g.project ? "Open project" : "Open story"}
                </Link>
              )}
            </h3>
            {g.facts.map((f) => {
              const place = placeOf(f, owners);
              const quote = owners.facts.get(f.id)?.sources[0]?.quotes[0];
              const on = lit === f.id;
              const body = (
                <>
                  <span className="flex items-start gap-2">
                    <span className={`min-w-0 flex-1 text-body-sm leading-body-sm ${f.counts ? "text-text" : "text-muted"} ${on ? "" : "line-clamp-2"}`}>{f.text}</span>
                    <Icons.goIn aria-hidden className={`mt-0.5 shrink-0 text-muted ${on ? "block" : "hidden group-hover/fact:block group-focus-visible/fact:block"}`} />
                  </span>
                  {!f.counts && <span className="text-label leading-label text-muted">No longer in your record</span>}
                  {quote && <span className="border-l-2 border-steel pl-3 text-body-sm leading-body-sm text-muted">“{quote}”</span>}
                  <span className="sr-only">Open in {place.where}</span>
                </>
              );
              const look = `group/fact flex flex-col gap-1.5 border-t px-4 py-2.5 text-left transition-colors duration-100 hover:bg-surface focus-visible:bg-surface focus-visible:outline-none ${
                on ? "bg-surface shadow-[inset_2px_0_0_var(--color-steel)]" : ""
              }`;
              const light = { onMouseEnter: () => onLight(f.id), onMouseLeave: () => onLight(null), onFocus: () => onLight(f.id), onBlur: () => onLight(null) };
              return place.href ? (
                <Link key={f.id} href={place.href} className={look} {...light}>
                  {body}
                </Link>
              ) : (
                <div key={f.id} className={look}>
                  {body}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
