"use client";

import Link from "next/link";
import { useCallback, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { ContextMenu, Menu, type MenuEntry } from "@/components/Menu";
import { Count, UnreadMark } from "@/components/StatusTag";
import type { IconName } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { useSmall } from "@/components/useSmall";

// Rows of a list or table: J/K (and the arrows) move focus, Home/End jump, Tab leaves. The focus target of each row
// carries data-row; the row's whole box (a list item or a table row) carries data-row-scope. One row is the tab stop:
// the last one focused, else the selected one, else the first.
const ROW = "[data-row]";

export function useRowKeys<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const last = useRef<HTMLElement | null>(null);

  const rove = useCallback(() => {
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>(ROW) ?? [])];
    const stop =
      (last.current && rows.includes(last.current) ? last.current : undefined) ??
      rows.find((r) => r.getAttribute("aria-current") === "true" || r.getAttribute("aria-selected") === "true") ??
      rows[0];
    for (const r of rows) r.tabIndex = r === stop ? 0 : -1;
  }, []);
  useLayoutEffect(rove);

  const onFocus = (e: FocusEvent<T>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(ROW);
    if (row && ref.current?.contains(row)) {
      last.current = row;
      rove();
    }
  };

  const onKeyDown = (e: KeyboardEvent<T>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>(ROW)];
    if (!rows.length) return;
    const scope = target.closest("[data-row-scope]");
    const i = rows.findIndex((r) => r.closest("[data-row-scope]") === scope);
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let next: number;
    if (key === "j" || key === "ArrowDown") next = i < 0 ? 0 : Math.min(i + 1, rows.length - 1);
    else if (key === "k" || key === "ArrowUp") next = i < 0 ? 0 : Math.max(i - 1, 0);
    else if (key === "Home") next = 0;
    else if (key === "End") next = rows.length - 1;
    else return;
    e.preventDefault();
    rows[next].focus();
    rows[next].scrollIntoView({ block: "nearest" });
  };

  return { ref, onFocus, onKeyDown };
}

// A list of rows. `label` names it for screen readers; `tour` names it for a guided tour (Tour.ts).
export function List({ label, children, className = "", tour }: { label: string; children: ReactNode; className?: string; tour?: string }) {
  const { ref, onFocus, onKeyDown } = useRowKeys<HTMLUListElement>();
  return (
    <ul role="list" aria-label={label} ref={ref} onFocus={onFocus} onKeyDown={onKeyDown} data-tour={tour} className={`flex flex-col gap-0.5 ${className}`}>
      {children}
    </ul>
  );
}

// A group inside a List: a label-caps heading with its count, then its rows. With `onCheck`, a box before the label
// checks or clears every row in it (`checked` "some" while only part is); `meta` sits at the right ("13 selected").
// `line`: a muted line under the heading, naming what the group is about ("Sales Engineer · Anduril"). `tour` names it
// for a guided tour.
export function ListGroup({
  label,
  count,
  checked,
  onCheck,
  meta,
  line,
  tour,
  children,
}: {
  label: string;
  count?: number;
  checked?: boolean | "some";
  onCheck?: (checked: boolean) => void;
  meta?: ReactNode;
  line?: ReactNode;
  tour?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <li className="flex flex-col gap-0.5" data-tour={tour}>
      <div className="flex h-7 shrink-0 items-center gap-1.5 px-3 pt-2">
        {onCheck && (
          <span className="mr-1.5 flex">
            <Checkbox label={`Select every row in ${label}`} hideLabel checked={checked ?? false} onChange={onCheck} />
          </span>
        )}
        <span id={id} className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-label-caps leading-label-caps font-medium tracking-label-caps text-muted uppercase">{label}</span>
          {count !== undefined && <Count>{count}</Count>}
        </span>
        {meta && <span className="ml-auto shrink-0 text-label leading-label text-muted tabular-nums">{meta}</span>}
      </div>
      {line && <span className="truncate px-3 pb-1.5 text-body-sm leading-body-sm text-muted">{line}</span>}
      <ul role="list" aria-labelledby={id} className="flex flex-col gap-0.5">
        {children}
      </ul>
    </li>
  );
}

/** `keys` shows in the action's tooltip; the screen binds it. With no icon, the button's face is its key (T, M, R).
 * `detail` and `note` are its explainer: what it does; what it costs and whether it can be undone. */
export type RowAction = { label: string; icon?: IconName; onSelect: () => void; keys?: string; detail?: ReactNode; note?: ReactNode };

type ListRowProps = {
  title: string;
  /** The muted second line. */
  line?: ReactNode;
  /** Leading slot: a ScoreBadge (28) or an Avatar (32; 20 when compact). */
  lead?: ReactNode;
  /** Trailing status, usually a StatusTag. */
  tag?: ReactNode;
  /** Under the tag: a date or next step, muted unless the caller colours it. */
  meta?: ReactNode;
  /** Up to three icon actions, shown in place of tag and meta on hover. */
  actions?: RowAction[];
  /** The ⋯ menu beside the actions; also the right-click (long press on phones) menu. A row that can be checked adds
   * Select to it, and on a phone a long press checks it instead. */
  menu?: MenuEntry[];
  selected?: boolean;
  unread?: boolean;
  /** With onCheck, the row can be checked: X or Space, Shift- or ⌘-click, Select in its menu, a long press on a phone,
   * or, while selecting, a click or its box. Checking a row starts selecting (useSelection). */
  checked?: boolean;
  onCheck?: (checked: boolean) => void;
  /** The list is selecting: the box shows on every row that can be checked (a row that can't keeps its place, so the
   * rows stay lined up), and a click checks instead of opening. Otherwise no box shows, hovered or not, so nothing in
   * the row moves. */
  selecting?: boolean;
  href?: string;
  onOpen?: () => void;
  /** 32px, one line: tables and menus only. */
  compact?: boolean;
  /** An item out of play (rejected, not for me): the title in muted too. */
  muted?: boolean;
  /** Under the row, inside its box, which turns `subtle`: the Why? field after R on a row. */
  below?: ReactNode;
  /** Actions that always show at the right, after tag and meta: small Buttons for a line that acts in place (Today). */
  trail?: ReactNode;
  /** A long title (an insight, a fact): up to two lines, the row growing to fit. */
  wrap?: boolean;
};

export function ListRow({ title, line, lead, tag, meta, actions = [], menu, selected, unread, checked = false, onCheck, selecting, href, onOpen, compact, muted, below, trail, wrap = false }: ListRowProps) {
  const checkable = !!onCheck;
  // While selecting, a row's own actions give way to the bulk bar's.
  const hasActions = !(checkable && selecting) && (actions.length > 0 || !!menu);
  const rowMenu: MenuEntry[] | undefined = checkable
    ? [
        ...(menu ? [...menu, "separator" as const] : []),
        { label: checked ? "Unselect" : "Select", keys: "X", detail: checked ? "Unchecks it." : "Checks it, to act on several at once.", note: "Free", onSelect: () => onCheck(!checked) },
      ]
    : menu;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!checkable || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " || e.key.toLowerCase() === "x") {
      e.preventDefault();
      onCheck(!checked);
    }
  };
  // Space activates a button on key up; the row uses it to check instead.
  const onKeyUp = (e: KeyboardEvent<HTMLElement>) => {
    if (checkable && e.key === " ") e.preventDefault();
  };
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (checkable && (selecting || e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onCheck(!checked);
      return;
    }
    onOpen?.();
  };

  // A tag cut short (StatusTag ends a long one in an ellipsis) puts its full words in the row's tooltip, on medium
  // screens and up; on a phone a long press is the row's menu, and the words are in what the row opens.
  const small = useSmall();
  const [tagBox, setTagBox] = useState<HTMLSpanElement | null>(null);
  const [cutTag, setCutTag] = useState<string>();
  useLayoutEffect(() => {
    if (!tagBox) return;
    const measure = () => setCutTag([...tagBox.querySelectorAll("*")].some((el) => el.scrollWidth > el.clientWidth) ? (tagBox.textContent ?? undefined) : undefined);
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(tagBox);
    return () => seen.disconnect();
  }, [tagBox]);

  const look = below
    ? "border-transparent bg-subtle"
    : selected
      ? "border-steel bg-steel-subtle"
      : checked
        ? "border-transparent bg-steel-subtle"
        : "border-transparent md:hover:bg-subtle";

  const mainClass = `flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-sm px-[11px] text-left focus-visible:outline-none ${wrap ? "py-[9px]" : ""}`;
  const body = (
    <>
      {lead && <span className="flex shrink-0">{lead}</span>}
      <span className={`flex min-w-0 flex-1 ${compact ? "items-center gap-2" : "flex-col"}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          {unread && <UnreadMark />}
          <span className={`${wrap ? "line-clamp-2" : "truncate"} ${muted ? "text-muted" : "text-text"} ${compact ? "text-body-sm leading-body-sm" : "text-row-title leading-row-title"} ${unread ? "font-semibold" : "font-medium"}`}>
            {title}
          </span>
        </span>
        {line && <span className="truncate text-body-sm leading-body-sm text-muted">{line}</span>}
      </span>
      {/* At most two fifths of the row beside the title, so a long tag is cut short instead of squeezing the title and
          its line to nothing. */}
      {(tag || meta) && (
        <span
          className={`flex shrink-0 ${compact ? "items-center gap-2" : "max-w-2/5 min-w-0 flex-col items-end gap-0.5"} ${
            hasActions
              ? "md:group-hover/row:invisible md:group-has-[[data-actions]:focus-within]/row:invisible md:group-has-[[data-state=open]]/row:invisible"
              : ""
          }`}
        >
          {tag && (
            <span ref={setTagBox} className="flex max-w-full min-w-0">
              {tag}
            </span>
          )}
          {meta && <span className="text-body-sm leading-body-sm whitespace-nowrap text-muted tabular-nums">{meta}</span>}
        </span>
      )}
    </>
  );
  const mainProps = {
    "data-row": "",
    "aria-current": selected ? ("true" as const) : undefined,
    className: mainClass,
    onClick,
    onKeyDown,
    onKeyUp,
  };
  const main = href ? (
    <Link href={href} {...mainProps}>
      {body}
    </Link>
  ) : (
    <button type="button" {...mainProps}>
      {body}
    </button>
  );

  const inner = (
    <>
      {selecting && (
        <span className="flex w-7 shrink-0 justify-end pr-px">
          {checkable && <Checkbox label={`Select ${title}`} hideLabel checked={checked} onChange={onCheck} />}
        </span>
      )}
      {cutTag && !small ? <Tooltip content={cutTag}>{main}</Tooltip> : main}
      {trail && <span className="flex shrink-0 items-center gap-1 pr-[11px]">{trail}</span>}
      {/* Over the tag and date, the row's full height so nothing of the line peeks out; only the buttons take the
          pointer, so the rest of the row still opens it. */}
      {hasActions && (
        <span
          data-actions=""
          className="pointer-events-none absolute inset-y-0 right-[11px] hidden items-center gap-1 bg-inherit pl-1 opacity-0 focus-within:opacity-100 focus-within:*:pointer-events-auto has-[[data-state=open]]:opacity-100 has-[[data-state=open]]:*:pointer-events-auto md:flex md:group-hover/row:opacity-100 md:group-hover/row:*:pointer-events-auto"
        >
          {actions.slice(0, 3).map((a) =>
            a.icon ? (
              <Button key={a.label} variant="outline" size="sm" iconOnly icon={a.icon} keys={a.keys} detail={a.detail} note={a.note} aria-label={a.label} onClick={a.onSelect} />
            ) : (
              <Tooltip key={a.label} content={a.label} keys={a.keys} detail={a.detail} note={a.note}>
                <Button variant="outline" size="sm" aria-label={a.label} aria-keyshortcuts={a.keys} onClick={a.onSelect} className="w-7 px-0 font-mono text-mono leading-mono">
                  {a.keys}
                </Button>
              </Tooltip>
            ),
          )}
          {rowMenu && <Menu items={rowMenu} align="end" trigger={<Button variant="outline" size="sm" iconOnly icon="more" aria-label="More" />} />}
        </span>
      )}
    </>
  );
  const height = compact ? "h-8" : wrap ? "min-h-14" : "h-14";

  const row = (
    <li
      data-row-scope=""
      data-selected={selected || undefined}
      className={`group/row relative flex ${below ? "flex-col" : `${height} items-center`} shrink-0 rounded-sm border transition-colors duration-100 has-[[data-row]:focus-visible]:outline-2 has-[[data-row]:focus-visible]:outline-offset-1 has-[[data-row]:focus-visible]:outline-steel has-[[data-row]:focus-visible]:outline-solid ${look}`}
    >
      {below ? (
        <>
          <div className={`relative flex ${compact ? "h-8" : wrap ? "min-h-15" : "h-15"} items-center bg-inherit`}>{inner}</div>
          <div className="px-2.5 pb-3">{below}</div>
        </>
      ) : (
        inner
      )}
    </li>
  );

  return rowMenu ? (
    <ContextMenu items={rowMenu} title={title} onLongPress={checkable ? () => onCheck(true) : undefined}>
      {row}
    </ContextMenu>
  ) : (
    row
  );
}
