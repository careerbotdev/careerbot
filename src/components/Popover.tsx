"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import { cloneElement, type MouseEvent, type ReactElement, type ReactNode, useState } from "react";
import { Sheet } from "./Sheet";
import { useThemeRoot } from "./themeRoot";
import { useSmall } from "./useSmall";

// A small decision next to what it's about: a raised panel under its trigger on medium screens and up (Esc or a click
// outside closes it), the Sheet on phones. `title` names it for screen readers and heads the sheet; `showTitle` also
// shows it on the panel. The panel has 4px inside, so a list or a field fits edge to edge; a panel with a shown title
// lays its content out in 8px with 12px between. Open and closed are yours to hold (`open`, `onOpenChange`) or its own.
export function Popover({
  trigger,
  title,
  showTitle = false,
  children,
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  width,
}: {
  trigger: ReactElement<Record<string, unknown> & { onClick?: (e: MouseEvent) => void }>;
  title: string;
  showTitle?: boolean;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  width?: number;
}) {
  const small = useSmall();
  const [own, setOwn] = useState(false);
  const [anchor, container] = useThemeRoot();
  const isOpen = open ?? own;
  const setOpen = (o: boolean) => {
    setOwn(o);
    onOpenChange?.(o);
  };
  if (small) {
    const onClick = trigger.props.onClick;
    return (
      <>
        {cloneElement(trigger, {
          "aria-haspopup": "dialog",
          "aria-expanded": isOpen,
          "data-state": isOpen ? "open" : "closed",
          onClick: (e: MouseEvent) => {
            onClick?.(e);
            setOpen(true);
          },
        })}
        <Sheet open={isOpen} onOpenChange={setOpen} title={title}>
          {showTitle ? <div className="flex flex-col gap-3 px-2 pb-2">{children}</div> : children}
        </Sheet>
      </>
    );
  }
  return (
    <RadixPopover.Root open={isOpen} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild ref={anchor}>
        {trigger}
      </RadixPopover.Trigger>
      <RadixPopover.Portal container={container}>
        <RadixPopover.Content
          aria-label={title}
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          style={{ width }}
          className="z-50 flex max-w-[calc(100vw-16px)] flex-col rounded-sm border bg-surface p-1 text-text shadow-raised outline-none dark:bg-subtle transition-opacity duration-160 ease-out starting:opacity-0 data-[state=closed]:animate-[fadeOut_160ms_var(--ease-in)]"
        >
          {showTitle ? (
            <div className="flex flex-col gap-3 p-2">
              <h2 className="text-body-sm leading-body-sm font-semibold">{title}</h2>
              {children}
            </div>
          ) : (
            children
          )}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
