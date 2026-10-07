"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command as Cmdk } from "cmdk";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icons, type IconName } from "./icons";
import { Kbd, Keys } from "./Kbd";
import { ScoreBadge, type FitLevel } from "./ScoreBadge";
import { Sheet } from "./Sheet";
import { useThemeRoot } from "./themeRoot";
import { useSmall } from "./useSmall";

// One thing ⌘K reaches: a screen, an item or an action, in a named group ("Actions", "Roles", "Go to"). `detail` is the
// muted words after the name (its company). A role shows its fit score in place of an icon. `keywords` also match.
// `onSelect` gets `beside: true` when chosen with ⌘↵, to open it in the pane beside rather than in place.
export type Command = {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon?: IconName;
  score?: { value: number; level: FitLevel };
  keys?: string;
  keywords?: string[];
  onSelect: (how: { beside: boolean }) => void;
};

function groupsOf(commands: Command[]) {
  const groups = new Map<string, Command[]>();
  for (const c of commands) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  return [...groups];
}

// ⌘K (Ctrl+K elsewhere) opens and closes the palette from anywhere. Arrow keys move, Enter opens, ⌘↵ opens beside,
// Esc closes. What you're looking at comes first: order `commands` that way. A 640px panel over the backdrop on
// medium screens and up; a near full-height sheet with the field at the top on a phone.
export function CommandPalette({
  open,
  onOpenChange,
  commands,
  placeholder = "Search or jump to",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
  placeholder?: string;
}) {
  const small = useSmall();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [anchor, container] = useThemeRoot();
  // Each opening starts from an empty field.
  const change = (next: boolean) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };

  useEffect(() => {
    const toggle = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (open) setSearch("");
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, [open, onOpenChange]);

  const choose = (command: Command, beside: boolean) => {
    change(false);
    command.onSelect({ beside });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
    const command = commands.find((c) => c.id === selected);
    if (!command) return;
    e.preventDefault();
    choose(command, true);
  };

  const list = (
    <Cmdk.List className={small ? "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2" : "max-h-[min(440px,60vh)] overflow-y-auto pt-1 pb-2"}>
      <Cmdk.Empty className="px-3 py-8 text-center text-body-sm leading-body-sm text-muted">Nothing matches “{search}”.</Cmdk.Empty>
      {groupsOf(commands).map(([group, items]) => (
        <Cmdk.Group
          key={group}
          heading={group}
          className={
            small
              ? "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
              : "[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-7 [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-px"
          }
        >
          {items.map((c) => {
            const Icon = c.icon && Icons[c.icon];
            return (
              <Cmdk.Item
                key={c.id}
                value={c.id}
                keywords={[c.label, c.detail ?? "", ...(c.keywords ?? [])]}
                onSelect={() => choose(c, false)}
                className={`group/cmd flex cursor-default items-center gap-2.5 rounded-sm px-2 select-none data-[selected=true]:bg-subtle dark:data-[selected=true]:bg-hover ${
                  small ? "h-11" : "mx-1.5 h-9"
                }`}
              >
                {c.score ? (
                  <ScoreBadge score={c.score.value} level={c.score.level} size="sm" />
                ) : (
                  Icon && <Icon size={small ? 20 : 16} className="shrink-0 text-muted group-data-[selected=true]/cmd:text-text" />
                )}
                <span className="min-w-0 truncate text-body-md leading-body-md text-text">{c.label}</span>
                {c.detail && <span className="shrink-0 text-body-sm leading-body-sm text-muted">{c.detail}</span>}
                <span className="flex-1" />
                {!small &&
                  (c.keys ? (
                    <Keys keys={c.keys} />
                  ) : (
                    <Icons.goIn aria-hidden className="hidden shrink-0 text-muted group-data-[selected=true]/cmd:block" />
                  ))}
              </Cmdk.Item>
            );
          })}
        </Cmdk.Group>
      ))}
    </Cmdk.List>
  );

  const root = (children: ReactNode) => (
    <Cmdk
      label={placeholder}
      loop
      value={selected}
      onValueChange={setSelected}
      onKeyDown={onKeyDown}
      className={`flex min-h-0 flex-col [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:leading-label [&_[cmdk-group-heading]]:text-muted ${small ? "h-[80vh]" : ""}`}
    >
      {children}
    </Cmdk>
  );

  if (small) {
    return (
      <Sheet open={open} onOpenChange={change} title={placeholder} hideTitle>
        {root(
          <>
            <div className="px-2 pt-1 pb-2">
              <div className="flex h-11 items-center gap-0.5 rounded-sm border bg-surface px-2.5 focus-within:border-steel focus-within:ring-1 focus-within:ring-steel">
                <Icons.search className="mr-1.5 shrink-0 text-muted" />
                <Cmdk.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder={placeholder}
                  className="h-full min-w-0 flex-1 bg-transparent text-body-md leading-body-md text-text outline-none placeholder:text-muted"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear"
                    onClick={() => setSearch("")}
                    className="-mr-2.5 flex size-11 shrink-0 items-center justify-center text-muted hover:text-text"
                  >
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
  }

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
            <Dialog.Title className="sr-only">{placeholder}</Dialog.Title>
            {root(
              <>
                <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b px-3.5">
                  <Icons.search className="shrink-0 text-muted" />
                  <Cmdk.Input
                    value={search}
                    onValueChange={setSearch}
                    placeholder={placeholder}
                    className="h-full min-w-0 flex-1 bg-transparent text-title-md leading-title-md text-text outline-none placeholder:text-muted"
                  />
                  <Kbd>Esc</Kbd>
                </div>
                {list}
                <div className="flex h-10 shrink-0 items-center gap-3.5 border-t px-3.5 text-label leading-label text-muted">
                  <span className="flex items-center gap-1.5">
                    <Kbd>↑↓</Kbd>Move
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>↵</Kbd>Open
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>⌘↵</Kbd>Open beside
                  </span>
                  <span className="flex-1" />
                  <span className="flex items-center gap-1.5">
                    <Kbd>?</Kbd>All shortcuts
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
