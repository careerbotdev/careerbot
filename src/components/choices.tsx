import { Icons } from "@/components/icons";

// Pieces shared by the choice parts (Select, Combobox, MultiSelect, Checkbox): the raised list, its rows, the check box
// and the status mark. Not a part of its own.

// A field that opens a list, dressed like Input: 32px (44px on a phone), `border`, muted-60 under the pointer, a steel
// border and 1px steel ring when focused or open, `subtle` and faded when disabled.
export const fieldLook =
  "items-center gap-0.5 rounded-sm border border-border bg-surface px-2.5 text-left text-body-md leading-body-md text-text outline-none transition-colors duration-100 hover:border-muted/60 " +
  "focus-visible:border-steel focus-visible:ring-1 focus-visible:ring-steel";
export const fieldOpen = "border-steel ring-1 ring-steel hover:border-steel";
export const fieldDisabled = "cursor-not-allowed bg-subtle text-muted opacity-70 hover:border-border!";

// The raised surface under a field: `surface` in light, `subtle` in dark (Elevation & Depth), at most 320 tall; the list
// inside it sits 4px in with 1px between rows.
export const raisedSurface =
  "z-50 max-h-80 rounded-sm border bg-surface text-text shadow-raised dark:bg-subtle " +
  "transition-[opacity,translate] duration-160 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0";
export const listInner = "flex flex-col gap-px p-1";

// One option: 30px on the raised list, 44px in a phone's sheet. The highlighted row (arrow keys or pointer) is `subtle`
// in light and `hover` (border-dark) on the dark raised list; `cmdkRowOn` is that for cmdk's rows.
export const optionRow = "group/row flex min-h-7.5 cursor-default items-center gap-2.5 rounded-sm px-2 text-body-sm leading-body-sm text-text outline-none select-none";
export const cmdkRowOn = "data-[selected=true]:bg-subtle dark:data-[selected=true]:bg-hover";
export const sheetRow = "group/row flex min-h-11 w-full cursor-default items-center gap-3 rounded-sm px-2 text-left text-body-md leading-body-md text-text outline-none select-none";

// The rule between groups of options, edge to edge.
export const listSeparator = "-mx-1 my-1 h-px shrink-0 bg-border";

// A 16px square box: `control-border` when off (muted under the pointer, and on a hovered or selected dark row), text
// colour with a surface tick when on, a dash when some are on.
export function CheckBox({ on }: { on: boolean | "some" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
        on ? "border-text bg-text text-surface" : "border-control-border bg-surface dark:group-hover/row:border-muted dark:group-aria-selected/row:border-muted dark:group-data-[selected=true]/row:border-muted"
      }`}
    >
      {on === "some" ? <Dash /> : on ? <Tick /> : null}
    </span>
  );
}

// The marks inside a box, drawn at 12px with the board's heavier stroke so they read at that size.
export function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function Dash() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" aria-hidden="true">
      <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// The tick beside the chosen option, in a 16px slot that stays when nothing is ticked so labels line up.
export function ChosenSlot({ on }: { on: boolean }) {
  return <span className="flex w-4 shrink-0 justify-center">{on && <Icons.approve />}</span>;
}

// A status as an 8px square before a choice ("Interviewing"). Tones follow StatusTag.
export type MarkTone = "info" | "good" | "caution" | "problem" | "neutral";
const markColour: Record<MarkTone, string> = { info: "bg-steel", good: "bg-good", caution: "bg-caution", problem: "bg-red", neutral: "bg-muted" };
export function Mark({ tone }: { tone: MarkTone }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-xs ${markColour[tone]}`} />;
}

// A company's or item's initial in a 20px square, where its logo would go.
export function Initial({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-sm border bg-subtle text-label leading-label font-medium text-muted">
      {children}
    </span>
  );
}

// The chevron at a field's right edge; points up while its list is open.
export function Chevron({ open }: { open: boolean }) {
  return (
    <span className="flex shrink-0 items-center pl-1.5 text-muted">
      <Icons.expand className={open ? "rotate-180" : undefined} />
    </span>
  );
}
