"use client";

import { type ReactNode, useRef } from "react";
import { Drawer } from "vaul";
import { useThemeRoot } from "./themeRoot";

// Slow (240ms) in with ease-out, out with ease-in, over vaul's own slide keyframes; a fade with reduced motion.
export const slowMotion =
  "[animation-duration:240ms]! data-[state=open]:[animation-timing-function:var(--ease-out)]! data-[state=closed]:[animation-timing-function:var(--ease-in)]! " +
  "motion-reduce:data-[state=open]:[animation-name:fadeIn]! motion-reduce:data-[state=closed]:[animation-name:fadeOut]!";

// The phone's one surface for choosing and looking (DESIGN.md, Components): menus, long-press menus, popovers, select
// lists, pickers, a tooltip's explanation, the bar's More, the third pane and ⌘K. It rises from the bottom over the
// backdrop with a grab handle and a title, fits its content up to 90% of the screen and scrolls inside past that,
// respects the safe area, and closes by swiping down, tapping the backdrop or Esc.
// `description` is a muted second line under the title; `action` sits right of the title ("Clear"); `footer` holds the
// one action the content needs, full width; `hideTitle` keeps the title for screen readers only (⌘K opens on its field).
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  action,
  hideTitle = false,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  action?: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [anchor, container] = useThemeRoot();
  const panel = useRef<HTMLDivElement>(null);
  return (
    <>
      <span ref={anchor} hidden />
      <Drawer.Root open={open} onOpenChange={onOpenChange} container={container} autoFocus>
        <Drawer.Portal>
          <Drawer.Overlay className={`fixed inset-0 z-50 bg-backdrop ${slowMotion}`} />
          <Drawer.Content
            ref={panel}
            {...(description ? {} : { "aria-describedby": undefined })}
            // Unless something inside took focus itself (a search field, a calendar's day), focus lands on the sheet, so
            // nothing lights up on opening and Tab starts from its top.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              panel.current?.focus();
            }}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[90%] flex-col rounded-t-sm border-t bg-surface text-text shadow-overlay outline-none dark:bg-subtle ${slowMotion}`}
          >
            <div aria-hidden="true" className="flex shrink-0 justify-center pt-2 pb-1">
              <div className="h-1 w-9 rounded-sm bg-control-border" />
            </div>
            <div className={hideTitle ? "sr-only" : "flex min-h-11 shrink-0 items-center gap-2 px-4"}>
              <div className="flex min-w-0 flex-1 flex-col">
                <Drawer.Title className="line-clamp-1 text-title-md leading-title-md font-semibold">{title}</Drawer.Title>
                {description && <Drawer.Description className="text-body-sm leading-body-sm text-muted">{description}</Drawer.Description>}
              </div>
              {action}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-3">{children}</div>
            {/* The sheet's action: full width and 44 tall, whatever size the button was made at. */}
            {footer && <div className="flex shrink-0 flex-col gap-2 border-t px-4 pt-3 pb-1 *:h-11 *:w-full">{footer}</div>}
            <div aria-hidden="true" className="h-[max(env(safe-area-inset-bottom),12px)] shrink-0" />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
