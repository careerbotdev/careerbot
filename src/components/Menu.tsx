"use client";

import * as RadixContext from "@radix-ui/react-context-menu";
import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import {
  cloneElement,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { Button } from "./Button";
import { type IconName, Icons } from "./icons";
import { Kbd } from "./Kbd";
import { Sheet } from "./Sheet";
import { useThemeRoot } from "./themeRoot";
import { Tooltip } from "./Tooltip";
import { useSmall } from "./useSmall";

// One thing a menu can do. `keys` shows the key that runs it (the screen binds it, the menu only names it); `hint` and
// `count` are muted words or a number at the right ("Free", "Tue", 41). `checked` makes it one of a set of choices,
// with a tick beside the current one. `tone: "danger"` is for removing things. A `disabled` item stays reachable and
// says why in `reason`. `items` makes it a submenu. `detail` and `note` are an action's explainer (what it does; what
// it costs and whether it can be undone), in a tooltip beside the row, or a long press on a phone.
export type MenuItem = {
  label: string;
  icon?: IconName;
  keys?: string;
  hint?: string;
  count?: number;
  checked?: boolean;
  onSelect?: () => void;
  tone?: "danger";
  disabled?: boolean;
  reason?: string;
  items?: MenuEntry[];
  detail?: ReactNode;
  note?: ReactNode;
};
// A rule between groups, or a small caps label over one.
export type MenuEntry = MenuItem | "separator" | { group: string };

const isItem = (e: MenuEntry): e is MenuItem => typeof e === "object" && "label" in e;
const hasChecks = (entries: MenuEntry[]) => entries.some((e) => isItem(e) && e.checked !== undefined);

// The raised list: `surface` in light, `subtle` in dark (Elevation & Depth), 4px inside, 200 to 320 wide. Fades in at
// the base speed (160ms); fades out with ease-in on vaul's `fadeOut` keyframes, which the Sheet loads.
const panel =
  "z-50 flex w-max max-w-80 flex-col gap-px overflow-y-auto rounded-sm border bg-surface p-1 text-text shadow-raised outline-none dark:bg-subtle " +
  "max-h-[var(--radix-dropdown-menu-content-available-height,var(--radix-context-menu-content-available-height))] " +
  "transition-opacity duration-160 ease-out starting:opacity-0 data-[state=closed]:animate-[fadeOut_160ms_var(--ease-in)]";
// One 30px row. Highlighted (arrow keys or pointer) and a submenu's open parent: `subtle` in light, `hover` in dark.
const row =
  "flex h-7.5 shrink-0 cursor-default items-center gap-2.5 rounded-sm px-2 text-body-sm leading-body-sm outline-none select-none " +
  "data-highlighted:bg-subtle dark:data-highlighted:bg-hover data-[state=open]:bg-subtle dark:data-[state=open]:bg-hover aria-disabled:opacity-50";
const rule = "-mx-1 my-1 h-px shrink-0 bg-border";
const groupLabel = "px-2 pt-2 pb-1 text-label-caps leading-label-caps font-medium tracking-label-caps text-muted uppercase";
// Danger is red in light; in dark, where red is never text, it keeps the text colour.
const tone = (item: MenuItem) => (item.tone === "danger" ? "text-red dark:text-text" : "text-text");
const iconTone = (item: MenuItem) => (item.tone === "danger" ? "text-red dark:text-text" : "text-muted");

// The trailing words, number and key of a row, in that order.
function Trailing({ item, phone }: { item: MenuItem; phone?: boolean }) {
  const words = item.disabled && item.reason ? item.reason : item.hint;
  return (
    <>
      {words && <span className="shrink-0 text-body-sm leading-body-sm text-muted">{words}</span>}
      {item.count !== undefined && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{item.count}</span>}
      {item.keys && !phone && <Kbd>{item.keys}</Kbd>}
    </>
  );
}

// The radix parts both menus share; the dropdown and the context menu have the same shape.
type Parts = Pick<typeof RadixDropdown, "Item" | "CheckboxItem" | "Separator" | "Label" | "Sub" | "SubTrigger" | "SubContent" | "Portal">;
const dropdownParts: Parts = RadixDropdown;
const contextParts = RadixContext as unknown as Parts;

function Entries({ entries, P, container }: { entries: MenuEntry[]; P: Parts; container?: HTMLElement }) {
  const checks = hasChecks(entries);
  return entries.map((entry, i) => {
    if (entry === "separator") return <P.Separator key={i} className={rule} />;
    if (!isItem(entry)) return <P.Label key={i} className={groupLabel}>{entry.group}</P.Label>;
    const item = entry;
    const lead = (
      <>
        {checks && <span className="flex w-4 shrink-0">{item.checked && <Icons.approve aria-hidden="true" />}</span>}
        {item.icon && <Icon name={item.icon} className={iconTone(item)} />}
        <span className={`min-w-0 flex-1 truncate ${tone(item)}`}>{item.label}</span>
      </>
    );
    if (item.items) {
      return (
        <P.Sub key={i}>
          <P.SubTrigger className={row} textValue={item.label} aria-disabled={item.disabled || undefined} disabled={item.disabled}>
            {lead}
            <Trailing item={item} />
            <Icons.goIn aria-hidden="true" className="shrink-0 text-muted" />
          </P.SubTrigger>
          <P.Portal container={container}>
            <P.SubContent sideOffset={8} alignOffset={-5} collisionPadding={8} className={`${panel} min-w-44`}>
              <Entries entries={item.items} P={P} container={container} />
            </P.SubContent>
          </P.Portal>
        </P.Sub>
      );
    }
    // A disabled item stays in the arrow-key order so its reason is heard; choosing it does nothing.
    const select = (e: Event) => {
      if (item.disabled) e.preventDefault();
      else item.onSelect?.();
    };
    if (item.checked !== undefined) {
      return (
        <P.CheckboxItem key={i} className={row} textValue={item.label} checked={item.checked} aria-disabled={item.disabled || undefined} onSelect={select}>
          {lead}
          <Trailing item={item} />
        </P.CheckboxItem>
      );
    }
    return explain(
      item,
      <P.Item key={i} className={row} textValue={item.label} aria-disabled={item.disabled || undefined} onSelect={select}>
        {lead}
        <Trailing item={item} />
      </P.Item>,
      i,
    );
  });
}

// An action's explainer, beside its row (below it on a phone, where a long press opens it in a sheet).
function explain(item: MenuItem, row: ReactElement, key: number, side: "right" | "bottom" = "right") {
  if (item.detail === undefined && item.note === undefined) return row;
  return (
    <Tooltip key={key} content={item.label} keys={item.keys} detail={item.detail} note={item.note} side={side}>
      {row}
    </Tooltip>
  );
}

function Icon({ name, size, className = "" }: { name: IconName; size?: number; className?: string }) {
  const Glyph = Icons[name];
  return <Glyph aria-hidden="true" size={size} className={`shrink-0 ${className}`} />;
}

// The same entries as 44px rows in a Sheet: how Menu and ContextMenu open on phones, and the part for any other list
// of actions a phone opens from its own control (the bar's More). A submenu opens in place, with a way back.
export function MenuSheet({
  open,
  onOpenChange,
  title,
  description,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: MenuEntry[];
}) {
  const [trail, setTrail] = useState<MenuItem[]>([]);
  const current = trail.at(-1);
  const entries = current?.items ?? items;
  const checks = hasChecks(entries);
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTrail([]);
  };
  const sheetRow =
    "flex h-11 w-full shrink-0 items-center gap-2.5 rounded-sm px-2 text-left text-body-md leading-body-md outline-none select-none " +
    "active:bg-subtle dark:active:bg-hover aria-disabled:opacity-50";
  return (
    <Sheet open={open} onOpenChange={close} title={current?.label ?? title} description={current ? undefined : description}>
      <div className="flex flex-col">
        {current && (
          <button type="button" className={sheetRow} onClick={() => setTrail(trail.slice(0, -1))}>
            <Icon name="back" size={20} className="text-muted" />
            <span className="flex-1 text-muted">{trail.at(-2)?.label ?? title}</span>
          </button>
        )}
        {entries.map((entry, i) => {
          if (entry === "separator") return <div key={i} role="separator" className={rule} />;
          if (!isItem(entry)) return <div key={i} className={groupLabel}>{entry.group}</div>;
          const item = entry;
          return explain(
            item,
            <button
              key={i}
              type="button"
              className={sheetRow}
              aria-disabled={item.disabled || undefined}
              aria-checked={item.checked}
              role={item.checked === undefined ? undefined : "menuitemcheckbox"}
              onClick={() => {
                if (item.disabled) return;
                if (item.items) return setTrail([...trail, item]);
                item.onSelect?.();
                close(false);
              }}
            >
              {checks && <span className="flex w-5 shrink-0 justify-center">{item.checked && <Icons.approve aria-hidden="true" />}</span>}
              {item.icon && <Icon name={item.icon} size={20} className={iconTone(item)} />}
              <span className={`min-w-0 flex-1 truncate ${tone(item)}`}>{item.label}</span>
              <Trailing item={item} phone />
              {item.items && <Icons.goIn aria-hidden="true" className="shrink-0 text-muted" />}
            </button>,
            i,
            "bottom",
          );
        })}
      </div>
    </Sheet>
  );
}

// Adds our handlers to an element without dropping its own.
function chain<E>(...fns: (((e: E) => void) | undefined)[]) {
  return (e: E) => fns.forEach((fn) => fn?.(e));
}

type TriggerProps = Record<string, unknown> & { onClick?: (e: MouseEvent) => void };
type RowProps = Record<string, unknown> & {
  style?: CSSProperties;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  onPointerCancel?: (e: PointerEvent) => void;
  onClickCapture?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
};

// A field an entry opened (the Why? box after Reject…) takes focus, and keeps it. While the menu is up it holds on to
// focus, so the field's ask is only seen as the menu losing focus to it; the menu hands focus over as it closes. It
// gives focus back to the button that opened it only when nothing else has taken it.
function useFocusHandoff() {
  const wanted = useRef<HTMLElement | null>(null);
  return {
    onBlur: (e: FocusEvent) => {
      const to = e.relatedTarget;
      if (to instanceof HTMLElement && !to.closest("[role=menu]")) wanted.current = to;
    },
    onCloseAutoFocus: (e: Event) => {
      const field = wanted.current;
      wanted.current = null;
      const taken = document.activeElement;
      if (field?.isConnected) {
        e.preventDefault();
        field.focus();
      } else if (taken && taken !== document.body) e.preventDefault();
    },
  };
}

// The ⋯ menu: everything a pane doesn't show as a button. A dropdown on medium screens and up (arrow keys, Enter,
// Esc, typeahead, right and left through submenus), the Sheet on phones. The default trigger is the ghost ⋯ button
// named `label` ("More"); pass `trigger` for any other. On phones the sheet's title is `title`, else `label`, with
// `description` under it.
export function Menu({
  items,
  label,
  trigger,
  align = "end",
  title,
  description,
  defaultOpen,
}: {
  items: MenuEntry[];
  label?: string;
  trigger?: ReactElement<TriggerProps>;
  align?: "start" | "end";
  title?: string;
  description?: string;
  defaultOpen?: boolean;
}) {
  const small = useSmall();
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [anchor, container] = useThemeRoot();
  const handoff = useFocusHandoff();
  const name = label ?? "More";
  const button: ReactElement<TriggerProps> = trigger ?? (
    <Button variant="ghost" iconOnly icon="more" aria-label={name} className="data-[state=open]:bg-border data-[state=open]:text-text" />
  );
  if (small) {
    return (
      <>
        {cloneElement(button, {
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "data-state": open ? "open" : "closed",
          onClick: chain<MouseEvent>(button.props.onClick, () => setOpen(true)),
        })}
        <MenuSheet open={open} onOpenChange={setOpen} title={title ?? name} description={description} items={items} />
      </>
    );
  }
  return (
    <RadixDropdown.Root open={open} onOpenChange={setOpen}>
      <RadixDropdown.Trigger asChild ref={anchor}>
        {button}
      </RadixDropdown.Trigger>
      <RadixDropdown.Portal container={container}>
        <RadixDropdown.Content aria-label={name} align={align} sideOffset={6} collisionPadding={8} {...handoff} className={`${panel} min-w-50`}>
          <Entries entries={items} P={dropdownParts} container={container} />
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}

// A press held this long on a touch screen opens the context menu.
const longPress = 500;

// A touch held still for `longPress` calls `onLong`; moving more than 10px or lifting first cancels it. The click that
// ends a long press is swallowed so it isn't also a tap.
function useLongPress(onLong: () => void) {
  const timer = useRef<number>(undefined);
  const start = useRef<{ x: number; y: number }>(undefined);
  const fired = useRef(false);
  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    start.current = undefined;
  }, []);
  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, longPress);
    },
    [onLong],
  );
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) stop();
    },
    [stop],
  );
  const onClickCapture = useCallback((e: MouseEvent) => {
    if (!fired.current) return;
    fired.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);
  return { onPointerDown, onPointerMove, onClickCapture, stop };
}

// The same actions on right-click (or the context-menu key, or Shift+F10) over a row, on medium screens and up; a long
// press opens them in the Sheet on phones, titled `title` with `description` under it. The first group is the row's own
// decision. With `onLongPress`, a long press on a phone calls it instead (a row that can be checked starts selecting).
export function ContextMenu({
  items,
  title,
  description,
  onLongPress,
  children,
}: {
  items: MenuEntry[];
  title: string;
  description?: string;
  onLongPress?: () => void;
  children: ReactElement<RowProps>;
}) {
  const small = useSmall();
  const [open, setOpen] = useState(false);
  const [anchor, container] = useThemeRoot();
  const handoff = useFocusHandoff();
  const long = onLongPress ?? (() => setOpen(true));
  const press = useLongPress(long);
  if (small) {
    const props = children.props;
    return (
      <>
        {cloneElement(children, {
          style: { ...props.style, WebkitTouchCallout: "none" },
          onPointerDown: chain<PointerEvent>(props.onPointerDown, press.onPointerDown),
          onPointerMove: chain<PointerEvent>(props.onPointerMove, press.onPointerMove),
          onPointerUp: chain<PointerEvent>(props.onPointerUp, press.stop),
          onPointerCancel: chain<PointerEvent>(props.onPointerCancel, press.stop),
          // The press that opened the sheet isn't also a tap on the row.
          onClickCapture: chain<MouseEvent>(props.onClickCapture, press.onClickCapture),
          // Android's long press and a keyboard's menu key arrive as contextmenu.
          onContextMenu: chain<MouseEvent>(props.onContextMenu, (e) => {
            e.preventDefault();
            long();
          }),
          onKeyDown: chain<KeyboardEvent>(props.onKeyDown, (e) => {
            if (e.key === "F10" && e.shiftKey) {
              e.preventDefault();
              setOpen(true);
            }
          }),
        })}
        <MenuSheet open={open} onOpenChange={setOpen} title={title} description={description} items={items} />
      </>
    );
  }
  return (
    <RadixContext.Root>
      <RadixContext.Trigger asChild ref={anchor}>
        {children}
      </RadixContext.Trigger>
      <RadixContext.Portal container={container}>
        <RadixContext.Content aria-label={title} collisionPadding={8} {...handoff} className={`${panel} min-w-50`}>
          <Entries entries={items} P={contextParts} container={container} />
        </RadixContext.Content>
      </RadixContext.Portal>
    </RadixContext.Root>
  );
}
