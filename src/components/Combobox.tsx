"use client";

import * as Popover from "@radix-ui/react-popover";
import { Command, defaultFilter, useCommandState } from "cmdk";
import { useRef, useState } from "react";
import { buttonLook } from "@/components/Button";
import { Chevron, cmdkRowOn, fieldLook, fieldOpen, Initial, listInner, listSeparator, optionRow, raisedSurface, sheetRow } from "@/components/choices";
import { Icons, type IconName } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useThemeRoot } from "@/components/themeRoot";
import { useSmall } from "@/components/useSmall";

// keywords: other words that find it (a state's code). detail: a second line under the label (a model's price).
// note: a short word at the right ("Target"). mark: the letter in a 20px square before it, where a logo would go.
export type ComboboxOption = { value: string; label: string; detail?: string; keywords?: string[]; note?: string; mark?: string };

// What's typed, as an item of its own: it stays in the list but after every option that matches, so Enter picks the
// best match first.
const TYPED = "\u200btyped ";
const filter = (value: string, search: string, keywords?: string[]) => (value.startsWith(TYPED) ? 0.001 : defaultFilter(value, search, keywords));
// cmdk wraps a group's rows in a div of its own; lay those out like the list.
const groupLook = "[&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-px";

// Pick one from a long list by typing to filter. The field turns into the search box while its list is open; arrows
// move, Enter picks, Escape closes. On a phone the search and the list open in a Sheet. `custom`: what's typed can be
// picked as it is when it isn't one of the options, on a row that says so (`addLabel`, 'Use “Pittsburgh”' by default).
// `variant="button"`: a small secondary button with `icon` and the placeholder as its words ("Choose for a task"), for
// adding one from a list rather than showing a choice; its list opens under it with the search box on top.
export function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = "Choose…",
  searchPlaceholder = "Search…",
  empty = "Nothing matches.",
  custom = false,
  addLabel = (typed) => `Use “${typed}”`,
  variant = "field",
  icon,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: readonly ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  custom?: boolean;
  addLabel?: (typed: string) => string;
  variant?: "field" | "button";
  icon?: IconName;
}) {
  const small = useSmall();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // The highlighted row (cmdk's value): the choice when the list opens, then the best match as you type.
  const [active, setActive] = useState("");
  const [themeRef, container] = useThemeRoot();
  const field = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);
  const typed = search.trim();
  const canAdd = custom && typed !== "" && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase());
  const show = (o: boolean) => {
    setOpen(o);
    setSearch("");
    const first = selected ?? options[0];
    if (o) setActive(first ? `${first.label} ${first.value}` : "");
  };
  const pick = (v: string) => {
    onChange(v);
    show(false);
    if (!small) requestAnimationFrame(() => button.current?.focus());
  };
  const shown = <span className={`min-w-0 truncate ${selected || value ? "" : "text-muted"}`}>{selected?.label ?? (value || placeholder)}</span>;

  // Options and the "Add" row are separate groups: cmdk sorts groups by their best match, so the "Add" row (scored
  // lowest) and its rule stay after every option that matches.
  const rows = (row: string) => (
    <>
      <Command.Empty className="px-2 py-1.5 text-body-sm leading-body-sm text-muted">{empty}</Command.Empty>
      <Command.Group className={groupLook}>
        {options.map((o) => (
          <Command.Item key={o.value} value={`${o.label} ${o.value}`} keywords={o.keywords} onSelect={() => pick(o.value)} className={`${row} ${cmdkRowOn}`}>
            {o.mark && <Initial>{o.mark}</Initial>}
            <span className="flex min-w-0 flex-1 flex-col py-1.5">
              <span className="truncate">{o.label}</span>
              {o.detail && <span className="truncate text-muted">{o.detail}</span>}
            </span>
            {o.note && <span className="shrink-0 text-muted">{o.note}</span>}
            {o.value === value && <Icons.approve aria-label="Chosen" />}
          </Command.Item>
        ))}
      </Command.Group>
      {canAdd && (
        <Command.Group className={groupLook}>
          <AddSeparator />
          <Command.Item value={`${TYPED}${typed}`} onSelect={() => pick(typed)} className={`${row} ${cmdkRowOn}`}>
            <span className="flex w-4 shrink-0 text-muted">
              <Icons.add />
            </span>
            <span className="min-w-0 flex-1 truncate">{addLabel(typed)}</span>
          </Command.Item>
        </Command.Group>
      )}
    </>
  );

  const Icon = icon && Icons[icon];
  // The button variant's face: the icon, then the placeholder as its words.
  const face = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      {placeholder}
    </>
  );

  if (small) {
    return (
      <>
        {variant === "button" ? (
          <button ref={button} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => show(true)} className={`${buttonLook("secondary", "self-start", "lg")}`}>
            {face}
          </button>
        ) : (
          <button ref={button} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => show(true)} className={`flex h-11 w-full min-w-48 md:h-8 ${fieldLook} ${open ? fieldOpen : ""}`}>
            {shown}
            <span className="flex-1" />
            <Chevron open={open} />
          </button>
        )}
        <Sheet open={open} onOpenChange={show} title={label}>
          <Command label={label} filter={filter} value={active} onValueChange={setActive} className="flex flex-col gap-2">
            <label className={`flex h-11 ${fieldLook} focus-within:border-steel focus-within:ring-1 focus-within:ring-steel`}>
              <span className="flex pr-1.5 text-muted">
                <Icons.search />
              </span>
              <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder={searchPlaceholder} className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
            </label>
            <Command.List className="flex flex-col">{rows(sheetRow)}</Command.List>
          </Command>
        </Sheet>
      </>
    );
  }

  if (variant === "button") {
    return (
      <Popover.Root open={open} onOpenChange={show}>
        <Popover.Trigger asChild>
          <button
            ref={(el) => {
              button.current = el;
              themeRef(el);
            }}
            type="button"
            aria-haspopup="listbox"
            className={buttonLook("secondary", "self-start", "sm")}
          >
            {face}
          </button>
        </Popover.Trigger>
        <Popover.Portal container={container}>
          <Popover.Content
            align="start"
            sideOffset={4}
            onEscapeKeyDown={() => requestAnimationFrame(() => button.current?.focus())}
            className={`${raisedSurface} flex w-68 flex-col overflow-hidden`}
          >
            <Command label={label} filter={filter} value={active} onValueChange={setActive} className="flex max-h-80 flex-col">
              <label className="flex h-9 shrink-0 items-center border-b px-2.5 text-body-md leading-body-md text-text">
                <span className="flex pr-1.5 text-muted">
                  <Icons.search />
                </span>
                <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder={searchPlaceholder} aria-label={label} className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
              </label>
              <Command.List className={`${listInner} min-h-0 overflow-y-auto`}>{rows(optionRow)}</Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <Command ref={themeRef} label={label} filter={filter} shouldFilter={open} value={active} onValueChange={setActive} className="w-full min-w-48">
      <Popover.Root open={open} onOpenChange={show}>
        <Popover.Anchor asChild>
          <div ref={field} className="w-full">
            {open ? (
              <div className={`flex h-8 ${fieldLook} ${fieldOpen}`}>
                <span className="flex pr-1.5 text-muted">
                  <Icons.search />
                </span>
                <Command.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder={selected?.label ?? searchPlaceholder}
                  aria-label={label}
                  className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
                />
              </div>
            ) : (
              <button
                ref={button}
                type="button"
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={false}
                onClick={() => show(true)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    show(true);
                  } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    show(true);
                    // After the list mounts, so cmdk highlights the best match for it.
                    const key = e.key;
                    requestAnimationFrame(() => setSearch(key));
                  }
                }}
                className={`flex h-8 w-full ${fieldLook}`}
              >
                {shown}
                <span className="flex-1" />
                <Chevron open={false} />
              </button>
            )}
          </div>
        </Popover.Anchor>
        <Popover.Portal container={container}>
          <Popover.Content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={() => requestAnimationFrame(() => button.current?.focus())}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => field.current?.contains(e.target as Node) && e.preventDefault()}
            className={`${raisedSurface} flex w-(--radix-popover-trigger-width) min-w-62 flex-col overflow-hidden`}
          >
            <Command.List className={`${listInner} overflow-y-auto`}>{rows(optionRow)}</Command.List>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Command>
  );
}

// The rule above the "Add" row, only when options match above it.
function AddSeparator() {
  const count = useCommandState((s) => s.filtered.count);
  return count > 1 ? <div role="separator" className={listSeparator} /> : null;
}
