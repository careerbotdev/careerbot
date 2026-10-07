import Link from "next/link";
import { SearchField } from "./DocsFrame";
import { Icon } from "./Icon";
import { components } from "./mdx";
import type { DocsPage } from "./source";
import { FoldedToc, Toc } from "./Toc";
import { groupOf, neighbours } from "./tree";

// One docs page (the Docs page in Paper): its place (Docs › the part it's in), title and description, On this page, the
// page itself, Previous and Next, and Edit this page on GitHub. The docs home (content/docs/index.mdx) is wider, with
// no On this page, and search in the page on a phone.

const EDIT = "https://github.com/careerbotdev/careerbot/blob/master/content/docs/";

export function DocsArticle({ page }: { page: DocsPage }) {
  const Body = page.data.body;
  if (page.url === "/docs")
    return (
      <article className="flex w-full flex-col gap-10 px-5 pt-8 pb-14 md:px-10 md:pt-12 lg:gap-14 lg:pt-16 lg:pr-0 lg:pb-28 lg:pl-16">
        <header className="flex max-w-222 flex-col gap-3 lg:gap-4">
          <h1 className="text-site-display-sm leading-site-display-sm tracking-site-display-sm font-semibold text-text lg:text-site-headline lg:leading-site-headline lg:tracking-site-headline">
            {page.data.title}
          </h1>
          <p className="text-site-lead-sm leading-site-lead-sm text-muted lg:text-site-intro lg:leading-site-intro">{page.data.description}</p>
          <SearchField className="mt-3 h-11 lg:hidden" />
        </header>
        <div className="flex max-w-222 flex-col gap-5">
          <Body components={components} />
        </div>
      </article>
    );

  const group = groupOf(page.url);
  const { previous, next } = neighbours(page.url);
  const edit = EDIT + page.path;
  return (
    <div className="flex min-w-0 flex-1">
      <article className="flex min-w-0 flex-1 px-5 pt-7 pb-14 md:px-10 md:pt-12 lg:pt-16 lg:pr-6 lg:pb-28 lg:pl-14">
        <div className="flex w-full max-w-160 min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-2.5 pb-1.5 lg:gap-3 lg:pb-3">
            <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-body-md leading-body-md font-medium text-muted lg:flex">
              <Link href="/docs" className="hover:text-text">
                Docs
              </Link>
              {group && (
                <>
                  <Icon name="goIn" size={14} aria-hidden="true" className="shrink-0" />
                  <Link href={group.url} className="hover:text-text">
                    {group.title}
                  </Link>
                </>
              )}
            </nav>
            <h1 className="text-site-section-sm leading-site-section-sm tracking-site-section-sm font-semibold text-text lg:text-site-title lg:leading-site-title lg:tracking-site-title">
              {page.data.title}
            </h1>
            <p className="text-site-lead-sm leading-site-lead-sm text-muted lg:text-site-body-xl lg:leading-site-body-xl">{page.data.description}</p>
          </header>
          <FoldedToc toc={page.data.toc} />
          <Body components={components} />
          {(previous || next) && (
            <nav aria-label="Previous and next" className="flex gap-3 pt-8 md:gap-4 md:pt-12">
              {previous ? <Neighbour page={previous} side="previous" /> : <span className="flex-1" />}
              {next ? <Neighbour page={next} side="next" /> : <span className="flex-1" />}
            </nav>
          )}
          <a href={edit} target="_blank" rel="noreferrer" className="flex items-center gap-2 self-start pt-2 text-body-md leading-body-md text-muted hover:text-text lg:hidden">
            <Icon name="edit" aria-hidden="true" className="shrink-0" />
            Edit this page on GitHub
          </a>
        </div>
      </article>
      <Toc toc={page.data.toc} edit={edit} />
    </div>
  );
}

function Neighbour({ page, side }: { page: { title: string; url: string }; side: "previous" | "next" }) {
  const arrow = side === "previous" ? "previous" : "onward";
  return (
    <Link
      href={page.url}
      className={`flex min-w-0 flex-1 basis-0 flex-col gap-1 rounded-sm border border-border px-4 py-3.5 transition-colors duration-100 hover:bg-subtle md:px-5 md:py-4 ${side === "next" ? "items-end text-right" : "items-start"}`}
    >
      <span className="flex items-center gap-1.5 text-body-sm leading-body-sm text-muted">
        {side === "previous" && <Icon name={arrow} aria-hidden="true" />}
        {side === "previous" ? "Previous" : "Next"}
        {side === "next" && <Icon name={arrow} aria-hidden="true" />}
      </span>
      <span className="text-site-item leading-site-item font-semibold text-text">{page.title}</span>
    </Link>
  );
}
