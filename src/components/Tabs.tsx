"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icons } from "./icons";
import { Menu } from "./Menu";

export type TabItem = { value: string; label: string; count?: number };

// Space between tabs, less the 4px each side of a tab that its focus ring and underline hug: 18px of text to text,
// tightening to 14px before any tab folds into More.
const WIDE = 10;
const TIGHT = 6;

const tabLook =
  "relative flex h-full shrink-0 items-center gap-[5px] px-1 text-body-sm leading-body-sm font-medium whitespace-nowrap text-muted transition-colors duration-100 hover:text-text after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 hover:after:bg-border before:absolute before:inset-x-[min(0px,calc(50%-22px))] before:-top-1 before:-bottom-[5px] md:before:hidden";

function Label({ tab }: { tab: TabItem }) {
  return (
    <>
      {tab.label}
      {tab.count !== undefined && <span className="text-label leading-label font-medium text-muted tabular-nums">{tab.count}</span>}
    </>
  );
}

// Views of the same thing, with counts: a 36px bar, the current tab underlined in 2px of ink. Arrow keys move between
// tabs, Home and End jump. When they don't fit, the last ones fold into More, which opens a menu; the current tab
// never folds (picking a folded one brings it out in place of the last shown). Put a TabPanel per tab inside.
// By default the tabs fit the pane and each panel scrolls itself; `inFlow` is for tabs inside a pane that scrolls as a
// whole (below an item's head), where they keep their full height so the panel's padding and a sticky bar hold.
export function Tabs({
  tabs,
  value,
  onValueChange,
  label,
  inFlow = false,
  className = "",
  end,
  children,
}: {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  // What the tabs switch between, for screen readers ("Roles by status").
  label: string;
  inFlow?: boolean;
  // The bar's padding, to line up with the pane ("px-4").
  className?: string;
  // Quiet words at the bar's right end (a hint for the pane).
  end?: ReactNode;
  children?: ReactNode;
}) {
  const room = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ n: tabs.length, gap: WIDE });

  useLayoutEffect(() => {
    const box = room.current;
    const ruler = measure.current;
    if (!box || !ruler) return;
    const count = () => {
      const widths = Array.from(ruler.children).map((el) => (el as HTMLElement).offsetWidth);
      const more = widths.pop() ?? 0;
      // The bar pulls the first tab 4px left so its text lines up with the pane's edge.
      const avail = box.clientWidth + 4;
      const width = (n: number, gap: number) => widths.slice(0, n).reduce((sum, w) => sum + w, 0) + gap * Math.max(0, n - 1);
      const all = widths.length;
      if (width(all, WIDE) <= avail) return setFit({ n: all, gap: WIDE });
      if (width(all, TIGHT) <= avail) return setFit({ n: all, gap: TIGHT });
      let n = all - 1;
      while (n > 0 && width(n, TIGHT) + TIGHT + more > avail) n--;
      setFit({ n, gap: TIGHT });
    };
    count();
    const observer = new ResizeObserver(count);
    observer.observe(box);
    observer.observe(ruler);
    return () => observer.disconnect();
    // Watching the ruler catches new words, counts and tabs as well as the bar's own width.
  }, []);

  // The shown tabs: the first ones that fit, with the current one swapped in for the last if it would have folded.
  const at = tabs.findIndex((t) => t.value === value);
  const shown = fit.n >= tabs.length || at < fit.n ? tabs.slice(0, fit.n) : [...tabs.slice(0, Math.max(0, fit.n - 1)), tabs[at]];
  const folded = tabs.filter((t) => !shown.includes(t));

  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={`flex flex-col ${inFlow ? "grow shrink-0" : "min-h-0"}`}>
      <div className={`relative flex h-9 shrink-0 border-b ${className}`}>
        <div ref={room} className="flex min-w-0 flex-1">
          <RadixTabs.List aria-label={label} className="-ml-1 flex h-full" style={{ gap: fit.gap }}>
            {shown.map((tab) => (
              <RadixTabs.Trigger key={tab.value} value={tab.value} className={`${tabLook} data-[state=active]:text-text data-[state=active]:after:bg-text`}>
                <Label tab={tab} />
              </RadixTabs.Trigger>
            ))}
            {folded.length > 0 && (
              <Menu
                label={`More ${label.toLowerCase()}`}
                align="end"
                items={folded.map((tab) => ({ label: tab.label, count: tab.count, onSelect: () => onValueChange(tab.value) }))}
                trigger={
                  <button type="button" className={`${tabLook} gap-1 data-[state=open]:text-text data-[state=open]:after:bg-border`}>
                    More
                    <Icons.expand size={12} className="shrink-0" />
                  </button>
                }
              />
            )}
          </RadixTabs.List>
        </div>
        {end && <div className="flex shrink-0 items-center pl-3">{end}</div>}
        {/* Every tab and More at full width, out of sight, to know what fits. Clipped to the bar, so a ruler wider than
            the pane (a narrow pane, two-digit counts) never makes the pane scroll sideways. */}
        <div aria-hidden className="pointer-events-none invisible absolute inset-0 overflow-hidden">
          <div ref={measure} className="absolute top-0 left-0 flex h-9 w-max">
            {tabs.map((tab) => (
              <span key={tab.value} className={tabLook}>
                <Label tab={tab} />
              </span>
            ))}
            <span className={`${tabLook} gap-1`}>
              More
              <Icons.expand size={12} className="shrink-0" />
            </span>
          </div>
        </div>
      </div>
      {children}
    </RadixTabs.Root>
  );
}

// One tab's view. Takes focus after the bar with Tab, as the pane's content.
export function TabPanel({ value, className = "", children }: { value: string; className?: string; children: ReactNode }) {
  return (
    <RadixTabs.Content value={value} className={`min-h-0 flex-1 outline-offset-[-2px] ${className}`}>
      {children}
    </RadixTabs.Content>
  );
}
