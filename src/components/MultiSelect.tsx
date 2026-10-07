"use client";

import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { CheckBox, Chevron, cmdkRowOn, fieldLook, fieldOpen, listInner, optionRow, raisedSurface, sheetRow } from "@/components/choices";
import { Icons } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useThemeRoot } from "@/components/themeRoot";
import { useSmall } from "@/components/useSmall";

// Pick several from a list. The chosen values sit in the field as tags, each with its own remove button; the list under
// the field has a check box on every option. Type to filter, arrows move, Enter ticks or unticks (the list stays open),
// Backspace in the empty search removes the last tag, Escape closes. On a phone the list opens in a Sheet. `empty`:
// what the field says when nothing is chosen ("Any"). `custom`: what's typed can be added as it is when it isn't one of
// the options, on a row that says so ('Add “Head of Product”'); the tags then keep the order they were added in.
export function MultiSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  empty = "None",
  custom = false,
}: {
  label: string;
  value: readonly T[];
  onChange: (value: T[]) => void;
  options: readonly { value: T; label: string }[];
  empty?: string;
  custom?: boolean;
}) {
  const small = useSmall();
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [themeRef, container] = useThemeRoot();
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const labelOf = (v: T) => options.find((o) => o.value === v)?.label ?? v;
  // Chosen values keep the list's order (a scale reads low to high), not the order they were picked in; with `custom`,
  // the order they were added in, so typed values aren't lost.
  const toggle = (v: T) =>
    onChange(
      custom
        ? value.includes(v)
          ? value.filter((x) => x !== v)
          : [...value, v]
        : options.filter((o) => (o.value === v ? !value.includes(v) : value.includes(o.value))).map((o) => o.value),
    );
  const typed = search.trim();
  const canAdd = custom && typed !== "" && ![...options.map((o) => o.label), ...value].some((x) => x.toLowerCase() === typed.toLowerCase());
  const show = (o: boolean) => {
    setOpen(o);
    if (!o) setSearch("");
  };

  const rows = (row: string) => (
    <>
      {!canAdd && <Command.Empty className="px-2 py-1.5 text-body-sm leading-body-sm text-muted">Nothing matches.</Command.Empty>}
      {options.map((o) => (
        <Command.Item key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)} aria-checked={value.includes(o.value)} className={`${row} ${cmdkRowOn}`}>
          <CheckBox on={value.includes(o.value)} />
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
        </Command.Item>
      ))}
      {custom &&
        value
          .filter((v) => !options.some((o) => o.value === v))
          .map((v) => (
            <Command.Item key={v} value={v} onSelect={() => toggle(v)} aria-checked className={`${row} ${cmdkRowOn}`}>
              <CheckBox on />
              <span className="min-w-0 flex-1 truncate">{v}</span>
            </Command.Item>
          ))}
      {canAdd && (
        <Command.Item
          forceMount
          value={`\u200badd ${typed}`}
          onSelect={() => {
            toggle(typed as T);
            setSearch("");
          }}
          className={`${row} ${cmdkRowOn}`}
        >
          <Icons.add aria-hidden="true" className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">Add “{typed}”</span>
        </Command.Item>
      )}
    </>
  );

  const tags = value.map((v) => (
    <span key={v} className="inline-flex h-5.5 max-w-full shrink-0 items-center gap-1 rounded-sm border bg-subtle pr-1 pl-[7px] text-label leading-label font-medium text-text">
      <span className="truncate">{labelOf(v)}</span>
      <button
        type="button"
        aria-label={`Remove ${labelOf(v)}`}
        onClick={(e) => {
          e.stopPropagation();
          toggle(v);
        }}
        className="relative flex size-3 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-100 before:absolute before:-inset-4 hover:text-text md:before:-inset-2.5"
      >
        <Icons.reject size={12} />
      </button>
    </span>
  ));

  if (small) {
    return (
      <div className="flex flex-col gap-1.5">
        <span id={labelId} className="text-label leading-label font-medium text-text">
          {label}
        </span>
        <div onClick={() => show(true)} className={`flex min-h-11 flex-wrap gap-1 py-1 pr-2 pl-1 ${fieldLook} ${open ? fieldOpen : ""} focus-within:border-steel focus-within:ring-1 focus-within:ring-steel`}>
          {tags}
          <button
            type="button"
            aria-labelledby={labelId}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="flex min-h-11 md:min-h-8.5 min-w-16 flex-1 items-center pl-1 text-left text-muted outline-none"
          >
            <span className="flex-1">{value.length ? "Add" : empty}</span>
            <Chevron open={open} />
          </button>
        </div>
        <Sheet
          open={open}
          onOpenChange={show}
          title={label}
          footer={
            <Button size="lg" className="w-full" onClick={() => show(false)}>
              Done
            </Button>
          }
        >
          <Command label={label} className="flex flex-col gap-2">
            <label className={`flex h-11 ${fieldLook} focus-within:border-steel focus-within:ring-1 focus-within:ring-steel`}>
              <span className="flex pr-1.5 text-muted">
                <Icons.search />
              </span>
              <Command.Input value={search} onValueChange={setSearch} placeholder="Filter" className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
            </label>
            <Command.List className="flex flex-col">{rows(sheetRow)}</Command.List>
          </Command>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-label leading-label font-medium text-text">
        {label}
      </span>
      <Command ref={themeRef} label={label} className="w-full">
        <Popover.Root open={open} onOpenChange={show}>
          <Popover.Anchor asChild>
            <div
              ref={field}
              onClick={() => {
                show(true);
                input.current?.focus();
              }}
              className={`flex min-h-8 cursor-text flex-wrap gap-1 py-1 pr-2 pl-1 ${fieldLook} ${open ? fieldOpen : ""} focus-within:border-steel focus-within:ring-1 focus-within:ring-steel`}
            >
              {tags}
              <Command.Input
                ref={input}
                value={search}
                onValueChange={(s) => {
                  setSearch(s);
                  setOpen(true);
                }}
                aria-labelledby={labelId}
                aria-expanded={open}
                placeholder={value.length ? "Add" : empty}
                onFocus={() => show(true)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && search === "" && value.length) toggle(value[value.length - 1]);
                  if (e.key === "Escape" && open) {
                    e.preventDefault();
                    show(false);
                  }
                  if (e.key === "ArrowDown" && !open) setOpen(true);
                }}
                className="h-5.5 min-w-16 flex-1 bg-transparent pl-1 text-body-md leading-body-md text-text outline-none placeholder:text-muted"
              />
              <span className="flex self-center">
                <Chevron open={open} />
              </span>
            </div>
          </Popover.Anchor>
          <Popover.Portal container={container}>
            <Popover.Content
              align="start"
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onInteractOutside={(e) => field.current?.contains(e.target as Node) && e.preventDefault()}
              className={`${raisedSurface} flex w-70 flex-col overflow-hidden`}
            >
              <Command.List className={`${listInner} overflow-y-auto`}>{rows(optionRow)}</Command.List>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </Command>
    </div>
  );
}
