"use client";

import { useRef, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { Group, isCoarsePointer, Panel, Separator, usePanelRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { Drawer } from "./Drawer";
import { Icons } from "./icons";

export type ScreenSize = "small" | "medium" | "large";

const large = "(min-width: 1280px)";
const medium = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const lists = [large, medium].map((q) => window.matchMedia(q));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => lists.forEach((list) => list.removeEventListener("change", onChange));
}

// The window's size class (DESIGN.md, Layout): small under 768, medium to 1279, large from 1280. Large on the server
// and the first render, so markup matches before hydration.
export function useScreenSize(): ScreenSize {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(large).matches ? "large" : window.matchMedia(medium).matches ? "medium" : "small"),
    () => "large",
  );
}

// A pane's 52px top: its title and count, then its actions at the right (ghost icon buttons, a ⋯ menu). With `back`
// it leads with a way back instead, for an item open full screen on a phone.
export function PaneHeader({
  title,
  count,
  actions,
  back,
  className = "",
}: {
  title?: ReactNode;
  count?: number;
  actions?: ReactNode;
  back?: { label: string; onBack: () => void };
  className?: string;
}) {
  return (
    <header className={`flex h-[52px] shrink-0 items-center gap-2 ${back ? "pr-2 pl-1" : "pr-3 pl-4"} ${className}`}>
      {back && (
        <button
          type="button"
          onClick={back.onBack}
          className="-mr-1 flex h-11 min-w-0 items-center gap-1 rounded-sm pr-2 text-body-md leading-body-md text-text transition-colors duration-100 hover:bg-subtle"
        >
          <span className="flex size-11 shrink-0 items-center justify-center">
            <Icons.back size={20} />
          </span>
          <span className="truncate">
            <span className="sr-only">Back to </span>
            {back.label}
          </span>
        </button>
      )}
      {title && <h2 className="min-w-0 truncate text-title-md leading-title-md font-semibold text-text">{title}</h2>}
      {count !== undefined && <span className="text-body-sm leading-body-sm text-muted tabular-nums">{count}</span>}
      <span className="flex-1" />
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

// A third pane: what opens beside the item when the work needs it (a role's tailored resume, a fact's sources).
export type ThirdPane = {
  title: string;
  // A status and a ⋯ menu, left of the close button.
  actions?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

const separator =
  "relative w-px shrink-0 bg-border outline-none transition-colors duration-100 data-[separator=hover]:bg-steel data-[separator=active]:bg-steel data-[separator=focus]:bg-steel";

// The widths the person sets by dragging a divider (or its arrow keys), in pixels: one list width and one third-pane
// width for the whole app, kept in this browser. Every screen opens its panes at them, inside its own limits (Today's
// wide list stays 480 to 600), so a size set on one screen holds on every other, after a reload too. Double-clicking a
// divider puts that pane back to the screen's own width and forgets the one set.
const PANE_SIZES = "careerbot.panes";
type PaneSizes = { list?: number; third?: number };

function readSizes(): PaneSizes {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(PANE_SIZES) ?? "null");
    if (!kept || typeof kept !== "object") return {};
    const { list, third } = kept as Record<string, unknown>;
    return {
      list: typeof list === "number" && Number.isFinite(list) ? list : undefined,
      third: typeof third === "number" && Number.isFinite(third) ? third : undefined,
    };
  } catch {
    return {};
  }
}

function keepSizes(change: PaneSizes) {
  localStorage.setItem(PANE_SIZES, JSON.stringify({ ...readSizes(), ...change }));
}

// A screen's panes. Large: the list (360, resizable 320 to 480; 340 while a third pane is open), the item filling the
// rest (at least 480) and the optional third pane (380, resizable 340 to 480). Drag a divider, or focus it and use the
// arrow keys; the widths set hold across screens and reloads (PANE_SIZES). Medium: the list at 320 and the item; the
// third pane slides over as a drawer. Small: the list, or the open item full screen with a way back; the third pane is
// a sheet. `empty` fills the item pane while nothing is open. `size` pins the size class (previews); otherwise it
// follows the window. `wide`: a list that is the screen's main reading (Today): 540 on large screens (resizable 480 to
// 600) and 420 on medium.
export function PaneLayout({
  list,
  item,
  empty,
  third,
  back,
  size,
  wide = false,
}: {
  list: ReactNode;
  item?: ReactNode;
  empty?: ReactNode;
  third?: ThirdPane;
  // Where Back goes from an item open full screen on a phone ("Pursuing").
  back?: { label: string; onBack: () => void; actions?: ReactNode };
  size?: ScreenSize;
  wide?: boolean;
}) {
  const screen = useScreenSize();
  const at = size ?? screen;
  const thirdOpen = third?.open ?? false;

  if (at === "small") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface">
        {item ? (
          <>
            {back && <PaneHeader back={back} actions={back.actions} />}
            {/* A column, so an item that scrolls itself (with a sticky tab bar) gets the height; any other scrolls here. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{item}</div>
          </>
        ) : (
          list
        )}
        {third && (
          <Drawer open={thirdOpen} onOpenChange={third.onOpenChange} title={third.title} actions={third.actions}>
            {third.children}
          </Drawer>
        )}
      </div>
    );
  }

  if (at === "medium") {
    return (
      <div className="flex h-full min-h-0">
        <section className={`flex ${wide ? "w-[420px]" : "w-80"} shrink-0 flex-col border-r bg-surface`}>{list}</section>
        <section className="flex min-w-0 flex-1 flex-col bg-surface">{item ?? empty}</section>
        {third && (
          <Drawer open={thirdOpen} onOpenChange={third.onOpenChange} title={third.title} actions={third.actions}>
            {third.children}
          </Drawer>
        )}
      </div>
    );
  }

  return <LargePanes list={list} item={item ?? empty} third={third} wide={wide} />;
}

// The large layout's resizable panes. A width the person sets with a divider is kept (PANE_SIZES); a layout the panes
// settle on by themselves, as they open or as a third pane opens or closes, takes the widths kept.
function LargePanes({ list, item, third, wide }: { list: ReactNode; item: ReactNode; third?: ThirdPane; wide: boolean }) {
  const thirdOpen = third?.open ?? false;
  const listPanel = usePanelRef();
  const thirdPanel = usePanelRef();
  const last = useRef<Layout | null>(null);
  const group = useRef<HTMLDivElement>(null);
  const [listMin, listMax] = wide ? [480, 600] : [320, 480];
  // The divider the person is moving (or double-clicking): the one whose hit area the pointer went down in (half the
  // Group's minimum target, 10px or 20px for touch, either side of the 1px line), or the one focused for the arrow
  // keys. Only that divider's pane is kept: a list squeezed by a wider third pane keeps the width the person set.
  const moving = useRef<keyof PaneSizes | null>(null);

  function press(e: PointerEvent<HTMLDivElement>) {
    const reach = isCoarsePointer() ? 10 : 5;
    const hit = [...e.currentTarget.querySelectorAll<HTMLElement>(":scope > [data-pane]")].find((divider) => {
      const r = divider.getBoundingClientRect();
      return e.clientX >= r.left - reach && e.clientX <= r.right + reach;
    });
    moving.current = (hit?.dataset.pane as keyof PaneSizes | undefined) ?? null;
  }

  function settled(layout: Layout, { isUserInteraction }: LayoutChangedMeta) {
    const prev = last.current;
    last.current = layout;
    if (isUserInteraction) {
      const id = moving.current;
      if (!id || layout[id] === undefined || !group.current) return;
      // The width from the layout's share of the panes' total, which a drag doesn't change: the panes themselves still
      // have their old widths at this point.
      const total = [...group.current.querySelectorAll<HTMLElement>(":scope > [data-panel]")].reduce((sum, pane) => sum + pane.offsetWidth, 0);
      keepSizes({ [id]: Math.round((layout[id] / 100) * total) });
      return;
    }
    // The same panes at a new window size keep their pixel widths themselves; only a new set of panes takes the kept ones.
    if (prev && Object.keys(prev).join() === Object.keys(layout).join()) return;
    const kept = readSizes();
    if (kept.list !== undefined) listPanel.current?.resize(Math.min(listMax, Math.max(listMin, kept.list)));
    if (kept.third !== undefined) thirdPanel.current?.resize(Math.min(480, Math.max(340, kept.third)));
  }

  return (
    <Group
      orientation="horizontal"
      className="h-full min-h-0"
      elementRef={group}
      onLayoutChanged={settled}
      onPointerDownCapture={press}
      onKeyDownCapture={(e) => (moving.current = ((e.target as HTMLElement).dataset.pane as keyof PaneSizes | undefined) ?? null)}
      // A double-click on a divider puts its pane back to the screen's own width (the panes do that); forget the kept one.
      onDoubleClickCapture={() => moving.current && keepSizes({ [moving.current]: undefined })}
    >
      <Panel
        id="list"
        panelRef={listPanel}
        defaultSize={wide ? 540 : thirdOpen ? 340 : 360}
        minSize={listMin}
        maxSize={listMax}
        groupResizeBehavior="preserve-pixel-size"
        className="flex h-full flex-col bg-surface"
      >
        {list}
      </Panel>
      <Separator className={separator} aria-label="Resize the list" data-pane="list" />
      <Panel id="item" minSize={480} className="flex h-full min-w-0 flex-col bg-surface">
        {item}
      </Panel>
      {third && thirdOpen && (
        <>
          <Separator className={separator} aria-label={`Resize ${third.title}`} data-pane="third" />
          <Panel
            id="third"
            panelRef={thirdPanel}
            defaultSize={380}
            minSize={340}
            maxSize={480}
            groupResizeBehavior="preserve-pixel-size"
            className="flex h-full flex-col bg-subtle"
          >
            <PaneHeader
              title={third.title}
              actions={
                <>
                  {third.actions}
                  <button
                    type="button"
                    aria-label={`Close ${third.title}`}
                    onClick={() => third.onOpenChange(false)}
                    className="flex size-8 items-center justify-center rounded-sm text-text transition-colors duration-100 hover:bg-hover"
                  >
                    <Icons.close />
                  </button>
                </>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{third.children}</div>
          </Panel>
        </>
      )}
    </Group>
  );
}
