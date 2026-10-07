"use client";

import { AnchorProvider, type TOCItemType, useActiveAnchor } from "fumadocs-core/toc";
import { useState } from "react";
import { Icons } from "@/components/icons";

// On this page: a page's sections (## and ###). Large screens: a column beside the page, the section you're reading
// marked with a 2px steel rule, then Edit this page on GitHub. Medium screens and phones: folded under the page's
// title, opened with its row.

function Items({ toc, onGo }: { toc: TOCItemType[]; onGo?: () => void }) {
  const active = useActiveAnchor();
  return (
    <ul className="flex flex-col">
      {toc.map((item) => {
        const current = item.url === `#${active}`;
        return (
          <li key={item.url} className="flex">
            <a
              href={item.url}
              onClick={onGo}
              aria-current={current ? "location" : undefined}
              className={`flex w-full py-1.25 text-body-md leading-body-md ${item.depth > 2 ? "pl-6" : "pl-3"} ${
                current ? "border-l-2 border-steel font-medium text-text" : "border-l border-border pl-3.25 text-muted hover:text-text"
              }`}
            >
              {item.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function Toc({ toc, edit }: { toc: TOCItemType[]; edit: string }) {
  return (
    <AnchorProvider toc={toc} single>
      <div className="sticky top-18 hidden max-h-[calc(100dvh-4.5rem)] w-58 shrink-0 flex-col gap-3 overflow-y-auto pt-16 pb-16 pl-8 lg:flex">
        {toc.length > 0 && (
          <>
            <p className="text-site-group leading-site-group tracking-site-group font-semibold text-text">On this page</p>
            <Items toc={toc} />
          </>
        )}
        <div className={`flex flex-col pt-3 ${toc.length > 0 ? "border-t border-border" : ""}`}>
          <a href={edit} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-body-md leading-body-md text-muted hover:text-text">
            <Icons.edit aria-hidden="true" className="shrink-0" />
            Edit this page on GitHub
          </a>
        </div>
      </div>
    </AnchorProvider>
  );
}

export function FoldedToc({ toc }: { toc: TOCItemType[] }) {
  const [open, setOpen] = useState(false);
  if (!toc.length) return null;
  return (
    <AnchorProvider toc={toc} single>
      <div className="flex flex-col border-y border-border lg:hidden">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-11 items-center justify-between px-0.5 text-site-nav leading-site-nav font-medium text-text">
          On this page
          <Icons.expand aria-hidden="true" className={`shrink-0 text-muted transition-transform duration-100 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="pb-3">
            <Items toc={toc} onGo={() => setOpen(false)} />
          </div>
        )}
      </div>
    </AnchorProvider>
  );
}
