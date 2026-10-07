"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { type ReactNode, useRef } from "react";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { useThemeRoot } from "./themeRoot";
import { useSmall } from "./useSmall";

// A dialog is rare: a destructive confirmation, or a short form with nowhere else to live. 440 wide, centred over the
// backdrop, `surface` in light and `subtle` in dark; a title with a close button, the body, and the choices in a footer
// under a rule. Esc, the close button or a click on the backdrop closes it. On phones a form dialog is the Sheet, its
// footer the sheet's action.
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onOpenAutoFocus?: (e: Event) => void;
  // Where focus goes once it has closed, when what opened it is gone (call e.preventDefault() and focus it).
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const small = useSmall();
  const [anchor, container] = useThemeRoot();
  const body = useRef<HTMLDivElement>(null);
  if (small) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} title={title} footer={footer}>
        <div className="flex flex-col gap-3.5 px-2 pb-2">{children}</div>
      </Sheet>
    );
  }
  return (
    <>
      <span ref={anchor} hidden />
      <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
        <RadixDialog.Portal container={container}>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-backdrop transition-opacity duration-160 ease-out starting:opacity-0 data-[state=closed]:animate-[fadeOut_160ms_var(--ease-in)]" />
          <RadixDialog.Content
            aria-describedby={undefined}
            // Focus starts on the first thing in the body (a form's first field), not the close button.
            onOpenAutoFocus={
              onOpenAutoFocus ??
              ((e) => {
                const first = body.current?.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]:not([tabindex='-1'])");
                if (!first) return;
                e.preventDefault();
                first.focus();
              })
            }
            onCloseAutoFocus={onCloseAutoFocus}
            className="fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100%-64px)] w-110 max-w-[calc(100%-32px)] flex-col rounded-sm border bg-surface text-text shadow-overlay outline-none dark:bg-subtle transition-[opacity,scale] duration-160 ease-out starting:scale-98 starting:opacity-0 motion-reduce:starting:scale-100 data-[state=closed]:animate-[fadeOut_160ms_var(--ease-in)]"
          >
            <div className="flex items-start gap-3 px-5 pt-5">
              <RadixDialog.Title className="flex-1 text-title-md leading-title-md font-semibold">{title}</RadixDialog.Title>
              <RadixDialog.Close asChild>
                <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Close" />
              </RadixDialog.Close>
            </div>
            <div ref={body} className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-5 pt-2 pb-5">
              {children}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">{footer}</div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
}

// The only place a destructive button appears (DESIGN.md, Components): it asks before something is deleted or cut off.
// The safe choice comes first and has focus, so Enter never deletes. Reversible actions don't ask; they run at once and
// offer Undo in a toast. On phones the question belongs in the bottom bar's confirm mode, which the screen wires.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onCloseAutoFocus={onCloseAutoFocus}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        cancel.current?.focus();
      }}
      footer={
        <>
          <Button ref={cancel} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="text-body-sm leading-body-sm text-muted">{body}</div>}
    </Dialog>
  );
}
