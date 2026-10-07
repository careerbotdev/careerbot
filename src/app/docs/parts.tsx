import Image from "next/image";
import Link from "next/link";
import { Children, cloneElement, type ComponentProps, isValidElement, type ReactElement, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Kbd } from "@/components/Kbd";
import { CodeBlock, DocsTabs } from "./interactive";
import shots from "./shots.json";

// The docs' reading parts (the Docs page in Paper): what a page's Markdown becomes, and the parts a page's MDX writes
// by name (content/docs; the list is in Contributing, Writing docs). The website's type steps (DESIGN.md, Typography,
// The docs) in the product's 2px corners. Text keeps the 640px measure the article sets.

const body = "text-site-body leading-site-body";

// A link inside the docs (or the app) moves without a full load; anything else opens as a plain link.
export function DocsLink({ href = "", children, className = "" }: { href?: string; children: ReactNode; className?: string }) {
  const look = `font-medium text-text underline decoration-border decoration-1 underline-offset-3 transition-colors duration-100 hover:decoration-text ${className}`;
  if (href.startsWith("/") || href.startsWith("#"))
    return (
      <Link href={href} className={look}>
        {children}
      </Link>
    );
  return (
    <a href={href} className={look} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

// Sections are ## (in On this page) and ###. Their ids come from fumadocs-mdx; the scroll margin keeps a heading clear
// of the sticky header (and the phone's docs bar) when a contents link jumps to it.
function H2(props: ComponentProps<"h2">) {
  return (
    <h2
      {...props}
      className="scroll-mt-32 pt-4 text-site-subheading-sm leading-site-subheading-sm tracking-site-subheading-sm font-semibold text-text md:pt-8 md:text-site-subheading md:leading-site-subheading md:tracking-site-subheading lg:scroll-mt-24"
    />
  );
}
function H3(props: ComponentProps<"h3">) {
  return <h3 {...props} className="scroll-mt-32 pt-2 text-docs-step leading-docs-step tracking-docs-step font-semibold text-text lg:scroll-mt-24" />;
}

function Pre({ children, ...props }: ComponentProps<"pre"> & { "data-title"?: string }) {
  return <CodeBlock title={props["data-title"]}>{children}</CodeBlock>;
}

export const markdown = {
  h2: H2,
  h3: H3,
  h4: H3,
  p: (props: ComponentProps<"p">) => <p {...props} className={`${body} text-text`} />,
  a: ({ href, children }: ComponentProps<"a">) => <DocsLink href={href}>{children}</DocsLink>,
  strong: (props: ComponentProps<"strong">) => <strong {...props} className="font-semibold" />,
  ul: (props: ComponentProps<"ul">) => <ul {...props} className={`${body} flex list-disc flex-col gap-1.5 pl-5 text-text marker:text-muted`} />,
  ol: (props: ComponentProps<"ol">) => <ol {...props} className={`${body} flex list-decimal flex-col gap-1.5 pl-5 text-text marker:text-muted`} />,
  li: (props: ComponentProps<"li">) => <li {...props} className="pl-1 [&>p]:inline" />,
  code: (props: ComponentProps<"code">) => <code {...props} className="rounded-sm bg-subtle px-1 py-px font-mono text-docs-code [font-variant-ligatures:none] [overflow-wrap:anywhere]" />,
  pre: Pre,
  blockquote: (props: ComponentProps<"blockquote">) => <blockquote {...props} className="border-l-2 border-border pl-3.5 text-muted" />,
  hr: () => <hr className="border-border" />,
  table: (props: ComponentProps<"table">) => <table {...props} className="w-full border-y border-border text-site-body-sm leading-site-body-sm" />,
  th: (props: ComponentProps<"th">) => <th {...props} className="border-b border-border py-2.5 pr-4 text-left align-bottom font-semibold text-text last:pr-0" />,
  td: (props: ComponentProps<"td">) => <td {...props} className="border-t border-border py-2.5 pr-4 align-top text-text [overflow-wrap:anywhere] last:pr-0" />,
};

// A note (subtle, a steel rule) or a caution (the caution tint and rule, its title in caution-text).
export function Callout({ title, type = "note", children }: { title?: string; type?: "note" | "caution"; children: ReactNode }) {
  const caution = type === "caution";
  return (
    <aside className={`flex flex-col gap-1 rounded-r-sm border-l-2 px-4.5 pt-3.5 pb-4 ${caution ? "border-caution bg-caution-subtle" : "border-steel bg-subtle"}`}>
      {title && <p className={`text-site-note leading-site-note font-semibold ${caution ? "text-caution-text" : "text-text"}`}>{title}</p>}
      <div className="flex flex-col gap-2 text-site-body-sm leading-site-body-sm text-text [&_p]:text-site-body-sm [&_p]:leading-site-body-sm">{children}</div>
    </aside>
  );
}

// Numbered steps: a square number with a line down to the next step, the step's title, and what to do.
export function Steps({ children }: { children: ReactNode }) {
  const steps = Children.toArray(children).filter((c): c is ReactElement<{ n?: number }> => isValidElement(c));
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <li key={i}>{cloneElement(step, { n: i + 1 })}</li>
      ))}
    </ol>
  );
}

// A step written on one line reaches here as inline content (words, bold, keys) rather than paragraphs; it goes in a
// paragraph of its own, so the column doesn't set each bold word and key on a row of its own.
export function Step({ title, n, children }: { title: string; n?: number; children: ReactNode }) {
  const inline = Children.toArray(children).some((c) => typeof c === "string" && c.trim() !== "");
  return (
    <div className="flex gap-4">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-border bg-surface font-mono text-site-index leading-site-index font-medium text-text">
          {n}
        </span>
        <span aria-hidden="true" className="w-px grow bg-border" />
      </div>
      <div className="flex min-w-0 grow flex-col gap-2.5 pt-0.5 pb-7">
        <h3 className="text-docs-step leading-docs-step tracking-docs-step font-semibold text-text">{title}</h3>
        {inline ? <p className={`${body} text-text`}>{children}</p> : children}
      </div>
    </div>
  );
}

// Two or three ways to go, side by side (stacked on a phone), each with what it is and when it suits.
export function Choices({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 md:flex-row">{children}</div>;
}
export function Choice({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col gap-2 rounded-sm border border-border px-4.5 py-4">
      <p className="text-site-item leading-site-item font-semibold text-text">{title}</p>
      <div className="flex flex-col gap-2 text-site-note leading-site-note text-text [&_p]:text-site-note [&_p]:leading-site-note">{children}</div>
      {note && <p className="pt-1 text-body-md leading-body-md text-muted">{note}</p>}
    </div>
  );
}

// Views of the same steps (one per way to set up), as the shared Tabs part.
export function Tabs({ labels, children }: { labels: string[]; children: ReactNode }) {
  return <DocsTabs labels={labels}>{children}</DocsTabs>;
}
export function Tab({ children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-5 pt-5">{children}</div>;
}

// What to cover: an unticked box beside each item, with its detail under it.
export function Checklist({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col border-b border-border">{children}</ul>;
}
export function Check({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3 border-t border-border py-2.5">
      <span className="shrink-0 pt-1">
        <span aria-hidden="true" className="block size-4 rounded-sm border-[1.5px] border-control-border" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-site-item leading-site-item font-medium text-text">{title}</span>
        {children && <span className="text-site-note leading-site-note text-muted [&_p]:inline">{children}</span>}
      </span>
    </li>
  );
}

// A term and what it means, in rows (a label column beside the words on large screens, above them on a phone).
export function Terms({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col border-b border-border">{children}</dl>;
}
export function Term({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border py-3.5 md:flex-row md:gap-6">
      <dt className={`${body} shrink-0 font-semibold text-text md:w-42`}>{title}</dt>
      <dd className={`${body} min-w-0 grow text-text [&_p]:inline`}>{children}</dd>
    </div>
  );
}

// A message the app shows, word for word, where it shows, and what to do about it.
export function Messages({ children }: { children: ReactNode }) {
  return <div className="flex flex-col border-b border-border">{children}</div>;
}
export function Message({ text, where, children }: { text: string; where: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border py-3.5">
      <div className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-4">
        <p className="text-site-item leading-site-item font-semibold text-text">“{text}”</p>
        <p className="shrink-0 text-body-md leading-body-md text-muted">{where}</p>
      </div>
      <div className="flex flex-col gap-2 text-site-note leading-site-note text-text [&_p]:text-site-note [&_p]:leading-site-note">{children}</div>
    </div>
  );
}

// A passage from a story and the fact CareerBot proposes from it, waiting for review.
export function StoryToFact({ story, fact }: { story: string; fact: string }) {
  return (
    <figure className="flex flex-col rounded-sm border border-border">
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4.5">
        <p className="text-site-group leading-site-group tracking-site-group font-semibold text-muted">In your story</p>
        <blockquote className={`${body} border-l-2 border-border pl-3.5 text-text`}>{story}</blockquote>
      </div>
      <div className="flex flex-col gap-2.5 bg-subtle px-5 py-4.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-site-group leading-site-group tracking-site-group font-semibold text-muted">The fact CareerBot proposes</p>
          <span className="flex h-5.5 shrink-0 items-center rounded-sm bg-caution-subtle px-1.5 text-label leading-label font-medium text-caution-text">To review</span>
        </div>
        <p className={`${body} font-medium text-text`}>{fact}</p>
      </div>
    </figure>
  );
}

// A screen of the app with the fictional persona's data, light or dark as the reader's theme is (the Logo's way: the
// other one isn't shown, so it isn't loaded or read out). Shown at its own size, smaller where the column is narrower.
// The pictures are static files in public/docs-shots, from `pnpm docs:shots` (scripts/docs-shots.ts), with their sizes
// in shots.json; `alt` says what the screen shows.
const SHOTS: Record<string, { width: number; height: number }> = shots;
export function Shot({ id, alt }: { id: string; alt: string }) {
  const shot = SHOTS[id];
  if (!shot) throw new Error(`No docs shot "${id}": add it to scripts/docs-shots.ts and run pnpm docs:shots`);
  return (
    <figure className="max-w-full self-start overflow-hidden rounded-sm border border-border">
      <Image src={`/docs-shots/${id}-light.webp`} alt={alt} width={shot.width} height={shot.height} className="block h-auto max-w-full dark:hidden" />
      <Image src={`/docs-shots/${id}-dark.webp`} alt={alt} width={shot.width} height={shot.height} className="hidden h-auto max-w-full dark:block" />
    </figure>
  );
}

// Pages to go on to: a row each with its title, one line, and an arrow.
export function Cards({ children }: { children: ReactNode }) {
  return <div className="flex flex-col border-b border-border">{children}</div>;
}
export function Card({ href, title, children }: { href: string; title: string; children?: ReactNode }) {
  return (
    <Link href={href} className="group flex items-start justify-between gap-3 border-t border-border py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-site-item leading-site-item font-medium text-text group-hover:underline group-hover:decoration-1 group-hover:underline-offset-3">{title}</span>
        {children && <span className="text-body-md leading-body-md text-muted [&_p]:inline">{children}</span>}
      </span>
      <Icon name="onward" aria-hidden="true" className="mt-1 shrink-0 text-muted group-hover:text-text" />
    </Link>
  );
}

export { Kbd };
