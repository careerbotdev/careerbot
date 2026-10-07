import type { ReactNode } from "react";

// A page of reading on the public site (the Privacy board in Paper): a 720px column with the title and when it was
// last updated, an opening paragraph, then sections, each a heading and its paragraphs.

export function ProsePage({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto flex w-full max-w-180 flex-col gap-8 px-5 pt-10 pb-16 md:px-0 md:pt-16 md:pb-28">
      <header className="flex flex-col gap-2">
        <h1 className="text-site-title leading-site-title tracking-site-title font-semibold">{title}</h1>
        <p className="text-body-md leading-body-md text-muted">Updated {updated}</p>
      </header>
      <p className="text-site-body leading-site-body text-text">{intro}</p>
      {children}
    </article>
  );
}

export function ProseSection({ title, paragraphs }: { title: string; paragraphs: ReactNode[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title-lg leading-title-lg font-semibold">{title}</h2>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-site-body leading-site-body text-text">
          {p}
        </p>
      ))}
    </section>
  );
}

// An email address in running text.
export function ProseEmail({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="rounded-sm underline decoration-border underline-offset-3 transition-colors duration-100 hover:decoration-text">
      {address}
    </a>
  );
}
