"use client";

import { type ReactNode, useRef } from "react";
import { Drawer as Vaul } from "vaul";
import { Button } from "./Button";
import { Sheet, slowMotion } from "./Sheet";
import { useThemeRoot } from "./themeRoot";
import { useSmall } from "./useSmall";

// The third pane at medium widths: it slides over the item from the right, 400 wide, over the backdrop. A 52px header
// holds the title, any `actions` (a status, a ⋯ menu) and the close button; the body scrolls. Esc, a click outside or
// a swipe to the right closes it. On phones the third pane is the Sheet.
export function Drawer({
  open,
  onOpenChange,
  title,
  actions,
  children,
  width = 400,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const small = useSmall();
  const [anchor, container] = useThemeRoot();
  const panel = useRef<HTMLDivElement>(null);
  if (small) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} title={title} action={actions}>
        <div className="px-2">{children}</div>
      </Sheet>
    );
  }
  return (
    <>
      <span ref={anchor} hidden />
      <Vaul.Root open={open} onOpenChange={onOpenChange} direction="right" container={container} autoFocus>
        <Vaul.Portal>
          <Vaul.Overlay className={`fixed inset-0 z-50 bg-backdrop ${slowMotion}`} />
          <Vaul.Content
            ref={panel}
            aria-describedby={undefined}
            // Focus lands on the pane itself, so Tab starts from its top and nothing in the header lights up.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              panel.current?.focus();
            }}
            style={{ width }}
            className={`fixed inset-y-0 right-0 z-50 flex max-w-full flex-col border-l bg-surface text-text shadow-overlay outline-none ${slowMotion}`}
          >
            <div className="flex h-13 shrink-0 items-center gap-2 border-b pr-2 pl-4">
              <Vaul.Title className="min-w-0 flex-1 truncate text-title-md leading-title-md font-semibold">{title}</Vaul.Title>
              {actions}
              <Vaul.Close asChild>
                <Button variant="ghost" iconOnly icon="close" aria-label="Close" />
              </Vaul.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 select-text">{children}</div>
          </Vaul.Content>
        </Vaul.Portal>
      </Vaul.Root>
    </>
  );
}
