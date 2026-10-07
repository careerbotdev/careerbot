"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Icons } from "@/components/icons";
import { Kbd } from "@/components/Kbd";
import { Sheet } from "@/components/Sheet";
import { Analytics } from "../site/Analytics";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { DocsSearch } from "./DocsSearch";
import type { DocsNode } from "./tree";

// The docs' frame (the Docs page in Paper): the site's header (Docs current) and footer around the docs. Large
// screens: a 248px sidebar with search (⌘K) and the page tree, sticky under the header, then the page. Medium screens
// and phones: a docs bar under the header, with the page tree in a sheet (its button names the part you're in) and
// search. Search opens from anywhere with ⌘K.

const Ui = createContext<{ openSearch: () => void }>({ openSearch: () => {} });
export const useDocsUi = () => useContext(Ui);

// The page tree. A folder's row opens and closes it (the folder you're in starts open); its pages sit under a hairline,
// the one you're on on steel-subtle. `onGo`: a page was chosen (the phone's sheet closes).
function Tree({ tree, large, onGo }: { tree: DocsNode[]; large: boolean; onGo?: () => void }) {
  const path = usePathname();
  const inside = (node: DocsNode) => node.url === path || !!node.children?.some((c) => c.url === path);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(tree.filter(inside).map((n) => [n.title, true])));
  const row = large ? "h-8 px-2 text-body-md leading-body-md" : "h-11 px-0 text-site-nav leading-site-nav";
  return (
    <ul className={`flex flex-col ${large ? "gap-0.5" : ""}`}>
      {tree.map((node) => {
        if (!node.children)
          return (
            <li key={node.url}>
              <Link
                href={node.url}
                onClick={onGo}
                aria-current={node.url === path ? "page" : undefined}
                className={`flex items-center rounded-sm font-medium text-text ${row} ${node.url === path ? "bg-steel-subtle" : "hover:bg-subtle"}`}
              >
                {node.title}
              </Link>
            </li>
          );
        const expanded = open[node.title] ?? false;
        const Chevron = expanded ? Icons.expand : Icons.goIn;
        return (
          <li key={node.title}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen((o) => ({ ...o, [node.title]: !expanded }))}
              className={`flex w-full items-center justify-between rounded-sm text-left font-medium text-text hover:bg-subtle ${row}`}
            >
              {node.title}
              <Chevron aria-hidden="true" className="shrink-0 text-muted" />
            </button>
            {expanded && (
              <div className={`flex pt-0.5 pb-1.5 ${large ? "pl-2" : ""}`}>
                <ul className={`flex grow flex-col gap-px border-l border-border ${large ? "pl-1" : "pl-1"}`}>
                  {node.children.map((page) => (
                    <li key={page.url}>
                      <Link
                        href={page.url}
                        onClick={onGo}
                        aria-current={page.url === path ? "page" : undefined}
                        className={`flex items-center rounded-sm pr-2 pl-3 ${large ? "min-h-7.5 py-1.25 text-body-md leading-body-md" : "min-h-10.5 py-2.5 text-site-nav leading-site-nav"} ${
                          page.url === path ? "bg-steel-subtle font-medium text-text" : "text-muted hover:bg-subtle hover:text-text"
                        }`}
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The search field's look, as a button that opens search.
export function SearchField({ className = "" }: { className?: string }) {
  const { openSearch } = useDocsUi();
  return (
    <button
      type="button"
      onClick={openSearch}
      className={`flex h-9 w-full shrink-0 items-center gap-2 rounded-sm border border-border bg-surface pr-1.5 pl-2.5 text-left text-body-md leading-body-md text-muted transition-colors duration-100 hover:border-control-border ${className}`}
    >
      <Icons.search aria-hidden="true" className="shrink-0" />
      <span className="grow">Search docs</span>
      <span className="hidden md:flex">
        <Kbd>⌘K</Kbd>
      </span>
    </button>
  );
}

export function DocsFrame({ tree, children }: { tree: DocsNode[]; children: ReactNode }) {
  const path = usePathname();
  const [search, setSearch] = useState(false);
  const [nav, setNav] = useState(false);
  const group = tree.find((node) => node.url === path || node.children?.some((c) => c.url === path));
  const pages = tree.map((node) => ({ title: node.title, url: node.url }));
  return (
    <Ui.Provider
      value={{
        openSearch: () => {
          setNav(false);
          setSearch(true);
        },
      }}
    >
      <div className="flex min-h-dvh w-full flex-col bg-surface text-text">
        <SiteHeader solid />
        <div className="sticky top-16 z-20 flex h-13 shrink-0 items-center justify-between border-b border-border bg-surface pr-2 pl-2 md:px-8 lg:hidden">
          <button type="button" onClick={() => setNav(true)} className="flex h-11 min-w-0 items-center gap-2 rounded-sm px-3 text-site-nav leading-site-nav font-medium text-text hover:bg-subtle">
            <Icons.contents size={20} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{group?.title ?? "Docs"}</span>
            <Icons.expand aria-hidden="true" className="shrink-0 text-muted" />
          </button>
          <button type="button" aria-label="Search docs" onClick={() => setSearch(true)} className="flex size-11 shrink-0 items-center justify-center rounded-sm text-text hover:bg-subtle">
            <Icons.search size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="flex w-full flex-1 lg:px-16">
          <div className="mx-auto flex w-full max-w-300">
            <aside className="sticky top-18 hidden h-[calc(100dvh-4.5rem)] w-62 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border pt-8 pr-6 pb-16 lg:flex">
              <SearchField />
              <nav aria-label="Docs">
                <Tree tree={tree} large />
              </nav>
            </aside>
            <main className="flex min-w-0 flex-1">{children}</main>
          </div>
        </div>
        <SiteFooter />
        <Analytics />
      </div>
      <DocsSearch open={search} onOpenChange={setSearch} pages={pages} />
      <Sheet open={nav} onOpenChange={setNav} title="Docs">
        <div className="flex flex-col gap-3 px-4 pb-6">
          <SearchField className="h-11" />
          <nav aria-label="Docs">
            <Tree key={path} tree={tree} large={false} onGo={() => setNav(false)} />
          </nav>
        </div>
      </Sheet>
    </Ui.Provider>
  );
}
