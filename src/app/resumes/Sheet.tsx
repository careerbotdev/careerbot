"use client";

import { Fragment, type ReactNode } from "react";
import { type Bullet, type Contact, type Entry, type ProjectEntry, type ResumeDoc, breakLine, dates, shortUrl } from "../../../convex/resumeDoc";

// A resume as a page: the contact block, summary, experience (a project linked to a role inside it), projects and
// skills, in the order and wording every export uses. `Page` takes what the screen adds around the words (a line's
// Built on and Pin, a proposed line, a hidden one); `ResumeSheet` is the page read only, as it exports.

// How one line reads on the page: its words, a tone for the line (a proposal or a line that was added, one resting on
// a fact that changed, one struck out) and whatever sits at its right. `stack`: what's at its right goes under the words
// when both don't fit (always on a phone), so a line's actions never squeeze its words. `onEdit`: clicking the words
// (or Enter on them) opens them to edit. `note`: a short line under the words (what a check against facts found).
export type LineLook = { tone?: "added" | "problem" | "struck"; aside?: ReactNode; className?: string; stack?: boolean; onEdit?: () => void; note?: ReactNode };

const toneOf: Partial<Record<NonNullable<LineLook["tone"]>, string>> = {
  added: "border-l-2 border-good bg-good-subtle",
  problem: "border-l-2 border-red bg-subtle",
};

export function Line({ text, look = {} }: { text: string; look?: LineLook }) {
  // Stacked, the words keep at least 20rem beside what's at their right before that wraps under them (on a phone it
  // always goes under). The basis goes on the row's child: with a note that's the column holding the words, where a
  // basis would be a height.
  const grow = look.stack ? "flex-1 md:flex-[1_1_20rem]" : "flex-1";
  const wordsGrow = look.note ? "flex-1" : grow;
  const words = look.onEdit ? (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Edit: ${text}`}
      onClick={look.onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          look.onEdit!();
        }
      }}
      className={`min-w-0 ${wordsGrow} cursor-text rounded-xs text-body-sm leading-body-sm text-text outline-none focus-visible:ring-1 focus-visible:ring-steel`}
    >
      {text}
    </span>
  ) : (
    <span className={`min-w-0 ${wordsGrow} text-body-sm leading-body-sm ${look.tone === "struck" ? "text-muted line-through" : "text-text"}`}>{text}</span>
  );
  return (
    <li className={`group/line relative flex items-start gap-2 rounded-sm px-1.5 py-[3px] ${look.stack ? "flex-wrap" : ""} ${look.tone ? (toneOf[look.tone] ?? "") : ""} ${look.className ?? ""}`}>
      <span aria-hidden="true" className="text-body-sm leading-body-sm text-muted">
        –
      </span>
      {look.note ? (
        <span className={`flex min-w-0 ${grow} flex-col gap-0.5`}>
          {words}
          {look.note}
        </span>
      ) : (
        words
      )}
      {look.aside && <span className={`flex shrink-0 items-center gap-1 ${look.stack ? "ml-auto max-w-full flex-wrap justify-end max-md:basis-full" : ""}`}>{look.aside}</span>}
    </li>
  );
}

// Where a line sits: its employer or project name, and the role or project it belongs to.
export type At = { where: string; roleKey?: string; projectKey?: string };

export type PageParts = {
  // The contact block at the top: read only, or the fields to edit it in place.
  contact?: ReactNode;
  // One line of an entry or project as shown. Defaults to its words.
  line?: (b: Bullet, at: At) => ReactNode;
  // Lines after an entry's own: the ones left out here, lines proposed for it.
  after?: (at: At) => ReactNode;
  // Beside an entry's title (a New title tag).
  titleTag?: (e: Entry) => ReactNode;
  // The muted line under a title, when the page has more to say (the roles folded into it).
  folded?: (e: Entry) => string | null;
  // The summary as shown, or the field to edit it in place. Defaults to its words.
  summary?: (text: string) => ReactNode;
};

export function Page({ doc, parts = {}, small = false }: { doc: ResumeDoc; parts?: PageParts; small?: boolean }) {
  const bullets = (list: Bullet[], at: At) => {
    const after = parts.after?.(at);
    if (!list.length && !after) return null;
    return (
      <ul className="-mx-1.5 flex flex-col gap-1">
        {list.map((b, i) => (
          <Fragment key={`${at.where}.${i}`}>{parts.line ? parts.line(b, at) : <Line text={b.text} />}</Fragment>
        ))}
        {after}
      </ul>
    );
  };
  const project = (p: ProjectEntry, inRole: boolean) => (
    <div key={p.projectKey} className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 text-body-sm leading-body-sm font-medium text-text">
          {inRole && <span className="font-normal text-muted">Project: </span>}
          {p.name}
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="ml-2 break-all font-normal text-muted underline decoration-border underline-offset-3 hover:text-text">
              {shortUrl(p.url)}
            </a>
          )}
        </span>
        <span className="flex-1" />
        {!inRole && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{dates(p)}</span>}
      </div>
      {bullets(p.bullets, { where: p.name, projectKey: p.projectKey })}
    </div>
  );
  return (
    <article className={`flex flex-col gap-3.5 rounded-sm border bg-surface ${small ? "px-4 py-5" : "px-9 py-8"}`}>
      {parts.contact}
      {doc.summary && (parts.summary ? parts.summary(doc.summary) : <p className="text-body-sm leading-body-sm text-text">{doc.summary}</p>)}
      {doc.experience.length > 0 && (
        <Section title="Experience">
          {doc.experience.map((e, i) =>
            e.break ? (
              <p key={e.roleKey ?? i} className="text-body-sm leading-body-sm text-muted">
                {breakLine(e)}
              </p>
            ) : (
              <div key={e.roleKey ?? i} className="flex flex-col gap-1.5">
                <div className={`flex gap-x-2 ${small ? "flex-col" : "items-baseline"}`}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="text-body-sm leading-body-sm font-medium text-text">{e.title}</span>
                    {parts.titleTag?.(e)}
                  </span>
                  <span className="flex-1" />
                  <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{dates(e).replace("Present", "now")}</span>
                </div>
                <span className="text-body-sm leading-body-sm text-muted">{[e.employer, e.location, parts.folded?.(e)].filter(Boolean).join(" · ")}</span>
                {bullets(e.bullets, { where: e.employer, roleKey: e.roleKey })}
                {(e.projects ?? []).map((p) => project(p, true))}
              </div>
            ),
          )}
        </Section>
      )}
      {(doc.projects ?? []).length > 0 && <Section title="Projects">{doc.projects!.map((p) => project(p, false))}</Section>}
      {doc.skills.length > 0 && (
        <Section title="Skills">
          <div className="flex flex-col gap-1">
            {doc.skills.map((g) => (
              <p key={g.group} className="text-body-sm leading-body-sm text-text">
                <span className="font-medium">{g.group}:</span> {g.items.join(", ")}
              </p>
            ))}
          </div>
        </Section>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="border-b pb-1 text-label leading-label font-medium text-muted">{title}</h3>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

// The name and contact line at the top, read only.
export function ContactLines({ contact }: { contact: Contact | null }) {
  if (!contact) return null;
  const rest = [contact.location, contact.email, contact.phone, ...contact.links].filter(Boolean);
  return (
    <header className="flex flex-col gap-1">
      <h2 className="text-title-lg leading-title-lg font-semibold text-text">{contact.name}</h2>
      <p className="text-body-sm leading-body-sm text-muted">{rest.join("  ·  ")}</p>
    </header>
  );
}

// The resume read only, exactly as it exports: a direction resume in Goals, a version in History.
export function ResumeSheet({ doc, contact, small = false, parts }: { doc: ResumeDoc; contact: Contact | null; small?: boolean; parts?: Omit<PageParts, "contact"> }) {
  return <Page doc={doc} small={small} parts={{ ...parts, contact: <ContactLines contact={contact} /> }} />;
}
