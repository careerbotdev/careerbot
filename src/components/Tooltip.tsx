"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { createContext, useCallback, useContext, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Keys } from "./Kbd";
import { Sheet } from "./Sheet";
import { useThemeRoot } from "./themeRoot";

// One tooltip for every action, on the inverse surface after 500ms of hover or focus. A name alone for an icon button
// ("More actions"); the full explainer for an action: its name and key, then `detail` (what it does, or why it's
// disabled right now) and `note` (what it costs and whether it can be undone: "Free · Undo with U").
// On touch there's no hover: a long press opens the same words in a Sheet titled with the trigger's name.
const LONG_PRESS = 500;
const Nested = createContext(false);

export function Tooltip({
  content,
  keys,
  detail,
  note,
  side = "bottom",
  defaultOpen,
  children,
}: {
  content: ReactNode;
  keys?: string;
  detail?: ReactNode;
  note?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  // Starts open (for showing it in a specimen); it still closes and opens as usual after that.
  defaultOpen?: boolean;
  children: ReactElement;
}) {
  const nested = useContext(Nested);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const touching = useRef(false);
  const pressed = useRef(false);
  // The Sheet mounts on the first long press and stays, so it can animate closed.
  const [sheet, setSheet] = useState<{ title: string; open: boolean }>();
  // Portal into the trigger's themed area, so a tooltip inside a dark pane stays dark.
  const [anchor, scope] = useThemeRoot();
  const bind = useCallback(
    (el: HTMLButtonElement | null) => {
      trigger.current = el;
      anchor(el);
    },
    [anchor],
  );
  const explainer = detail !== undefined || note !== undefined;

  const release = () => {
    touching.current = false;
    window.clearTimeout(timer.current);
  };

  // A part that brings its own tooltip (an icon Button) defers to one wrapped around it by the screen.
  if (nested) return children;

  return (
    <RadixTooltip.Provider delayDuration={LONG_PRESS} skipDelayDuration={300}>
      <RadixTooltip.Root defaultOpen={defaultOpen}>
        <Nested.Provider value={true}>
        <RadixTooltip.Trigger
          asChild
          ref={bind}
          onPointerDown={(e) => {
            pressed.current = false;
            if (e.pointerType !== "touch") return;
            touching.current = true;
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => {
              const el = trigger.current;
              pressed.current = true;
              setSheet({ title: el?.getAttribute("aria-label") || (typeof content === "string" ? content : el?.textContent?.trim() ?? ""), open: true });
            }, LONG_PRESS);
          }}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          onContextMenu={(e) => {
            // A long press is ours: no system menu or callout over the trigger.
            if (touching.current || pressed.current) e.preventDefault();
          }}
          onClickCapture={(e) => {
            // The long press opened the explanation; the lift that ends it isn't a tap.
            if (pressed.current) {
              pressed.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {children}
        </RadixTooltip.Trigger>
        </Nested.Provider>
        <RadixTooltip.Portal container={scope}>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            align="start"
            collisionPadding={8}
            className={`z-50 flex flex-col gap-[3px] rounded-sm border border-inverse bg-inverse shadow-raised transition-opacity duration-160 ease-out starting:opacity-0 dark:border-border ${
              explainer ? "w-60 max-w-[280px] px-2.5 pt-2 pb-[9px]" : "w-max max-w-[280px] px-2 py-[5px]"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 text-label leading-label font-medium text-inverse-text">{content}</span>
              {keys && <Keys keys={keys} on="inverse" className="ml-auto" />}
            </span>
            {detail !== undefined && <span className="text-body-sm leading-body-sm text-inverse-muted">{detail}</span>}
            {note !== undefined && <span className="text-body-sm leading-body-sm text-inverse-muted">{note}</span>}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
      {sheet && (
        <Sheet open={sheet.open} onOpenChange={(open) => setSheet({ ...sheet, open })} title={sheet.title}>
          <div className="flex flex-col gap-1 px-2 pb-2 text-body-md leading-body-md">
            {sheet.title !== content && <p className="text-text">{content}</p>}
            {detail !== undefined && <p className="text-text">{detail}</p>}
            {note !== undefined && <p className="text-muted">{note}</p>}
          </div>
        </Sheet>
      )}
    </RadixTooltip.Provider>
  );
}
