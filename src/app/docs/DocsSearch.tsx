"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command as Cmdk } from "cmdk";
import { useDocsSearch } from "fumadocs-core/search/client";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import { Icons } from "@/components/icons";
import { Kbd } from "@/components/Kbd";
import { Sheet } from "@/components/Sheet";
import { useThemeRoot } from "@/components/themeRoot";
import { useSmall } from "@/components/useSmall";
import type { DocsLink } from "./tree";

// Search the docs (the Search open board): ⌘K's look and keys (a 640px panel over the backdrop; a sheet with the field
// at the top on a phone), over the docs' own index (/api/search, built with the site, downloaded once when search
// first opens). A page, a section in it, or the words under a section, each with where it sits. With nothing typed it
// offers the docs' main pages.

const PLACEHOLDER = "Search docs";
// The index's words come back as Markdown, with the match in <mark>: shown as plain words.
const plain = (text: string) => text.replace(/<\/?mark>/g, "").replace(/[*_`]/g, "");

type Row = { id: string; url: string; kind: "page" | "heading" | "text"; title: string; where?: string };

export function DocsSearch({ open, onOpenChange, pages }: { open: boolean; onOpenChange: (open: boolean) => void; pages: DocsLink[] }) {
  const small = useSmall();
  const router = useRouter();
  const [anchor, container] = useThemeRoot();
  const client = useMemo(() => staticClient({ from: "/api/search" }), []);
  const { search, setSearch, query } = useDocsSearch({ client }, [client]);

  useEffect(() => {
    const toggle = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, [open, onOpenChange]);

  const change = (next: boolean) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };
  const go = (url: string) => {
    change(false);
    router.push(url);
  };

  const found = query.data && query.data !== "empty" ? query.data : null;
  const rows: Row[] = search
    ? (found ?? []).map((r) => ({
        id: r.id,
        url: r.url,
        kind: r.type,
        title: plain(r.content),
        where: r.breadcrumbs?.map(plain).join(" › ") || undefined,
      }))
    : pages.map((p) => ({ id: p.url, url: p.url, kind: "page", title: p.title }));

  const list = (
    <Cmdk.List className={small ? "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2" : "max-h-[min(440px,60vh)] overflow-y-auto px-2 pt-2 pb-2"}>
      {search && !query.isLoading && (
        <Cmdk.Empty className="px-3 py-8 text-center text-body-sm leading-body-sm text-muted">Nothing in the docs matches “{search}”.</Cmdk.Empty>
      )}
      {rows.map((row) => {
        const Icon = row.kind === "page" ? Icons.contents : row.kind === "heading" ? Icons.goIn : null;
        return (
          <Cmdk.Item
            key={row.id}
            value={row.id}
            onSelect={() => go(row.url)}
            className={`group/res flex cursor-default items-start gap-2.5 rounded-sm py-2.5 select-none data-[selected=true]:bg-subtle dark:data-[selected=true]:bg-hover ${small ? "px-3" : "px-2.5"}`}
          >
            <span className="flex w-4 shrink-0 pt-0.5">{Icon && <Icon className="text-muted group-data-[selected=true]/res:text-text" />}</span>
            <span className="flex min-w-0 grow flex-col gap-0.5">
              <span className={`text-body-md leading-body-md ${row.kind === "text" ? "line-clamp-2 text-text" : "font-medium text-text"}`}>{row.title}</span>
              {row.where && <span className="text-label leading-label text-muted">{row.where}</span>}
            </span>
            {!small && <span className="hidden shrink-0 pt-0.5 group-data-[selected=true]/res:flex">↵</span>}
          </Cmdk.Item>
        );
      })}
    </Cmdk.List>
  );

  const root = (children: ReactNode) => (
    <Cmdk label={PLACEHOLDER} loop shouldFilter={false} className={`flex min-h-0 flex-col ${small ? "h-[80vh]" : ""}`}>
      {children}
    </Cmdk>
  );

  if (small)
    return (
      <Sheet open={open} onOpenChange={change} title={PLACEHOLDER} hideTitle>
        {root(
          <>
            <div className="px-2 pt-1 pb-2">
              <div className="flex h-11 items-center gap-0.5 rounded-sm border bg-surface px-2.5 focus-within:border-steel focus-within:ring-1 focus-within:ring-steel">
                <Icons.search className="mr-1.5 shrink-0 text-muted" />
                <Cmdk.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder={PLACEHOLDER}
                  className="h-full min-w-0 flex-1 bg-transparent text-body-md leading-body-md text-text outline-none placeholder:text-muted"
                />
                {search && (
                  <button type="button" aria-label="Clear" onClick={() => setSearch("")} className="-mr-2.5 flex size-11 shrink-0 items-center justify-center text-muted hover:text-text">
                    <Icons.close />
                  </button>
                )}
              </div>
            </div>
            {list}
          </>,
        )}
      </Sheet>
    );

  return (
    <>
      <span ref={anchor} hidden />
      <Dialog.Root open={open} onOpenChange={change}>
        <Dialog.Portal container={container}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-backdrop transition-opacity duration-240 ease-out starting:opacity-0 data-[state=closed]:animate-[fadeOut_160ms_var(--ease-in)]" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-[12vh] left-1/2 z-50 flex w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col rounded-sm border bg-surface text-text shadow-overlay outline-none transition-[opacity,translate] duration-240 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0 dark:bg-subtle data-[state=closed]:animate-[fadeOut_160ms_var(--ease-in)]"
          >
            <Dialog.Title className="sr-only">{PLACEHOLDER}</Dialog.Title>
            {root(
              <>
                <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b px-3.5">
                  <Icons.search className="shrink-0 text-muted" />
                  <Cmdk.Input
                    value={search}
                    onValueChange={setSearch}
                    placeholder={PLACEHOLDER}
                    className="h-full min-w-0 flex-1 bg-transparent text-title-md leading-title-md text-text outline-none placeholder:text-muted"
                  />
                  <Kbd>Esc</Kbd>
                </div>
                {list}
                <div className="flex h-10 shrink-0 items-center gap-3.5 rounded-b-sm border-t bg-subtle px-3.5 text-label leading-label text-muted">
                  <span className="flex items-center gap-1.5">
                    <Kbd>↑↓</Kbd>Move
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>↵</Kbd>Open
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>Esc</Kbd>Close
                  </span>
                </div>
              </>,
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
