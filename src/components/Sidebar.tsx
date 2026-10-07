"use client";

import Link from "next/link";
import { Fragment, useId, useState, type KeyboardEvent } from "react";
import { Activity, type Job, type Spend } from "./Activity";
import { Avatar } from "./Avatar";
import { Icons, type IconName } from "./icons";
import { Kbd } from "./Kbd";
import { Logo } from "./Logo";
import { Menu, type MenuEntry } from "./Menu";
import { Sheet } from "./Sheet";
import { Tooltip } from "./Tooltip";

// The areas of CareerBot in order of use. Record and Goals open onto their sub-screens. `keys` are shown in the rail's
// tooltips and the command palette; the shell binds them.
export type Area = { key: string; label: string; icon: IconName; href: string; keys?: string; items?: SubArea[] };
export type SubArea = { key: string; label: string; href: string };

export const AREAS: Area[][] = [
  [
    { key: "today", label: "Today", icon: "today", href: "/", keys: "G then T" },
    { key: "review", label: "Review", icon: "review", href: "/review", keys: "G then R" },
  ],
  [
    { key: "pursuits", label: "Pursuits", icon: "pursuits", href: "/pursuits", keys: "G then P" },
    { key: "companies", label: "Companies", icon: "companies", href: "/companies", keys: "G then C" },
    { key: "resumes", label: "Resumes", icon: "resumes", href: "/resumes", keys: "G then E" },
  ],
  [
    {
      key: "record",
      label: "Record",
      icon: "record",
      href: "/record/roles",
      keys: "G then D",
      items: [
        { key: "story", label: "Story", href: "/record/story" },
        { key: "roles", label: "Roles", href: "/record/roles" },
        { key: "projects", label: "Projects", href: "/record/projects" },
        { key: "skills", label: "Skills", href: "/record/skills" },
        { key: "tools", label: "Tools", href: "/record/tools" },
        { key: "certifications", label: "Certifications", href: "/record/certifications" },
        { key: "breaks", label: "Breaks", href: "/record/breaks" },
        { key: "insights", label: "Insights", href: "/record/insights" },
      ],
    },
  ],
  [
    {
      key: "goals",
      label: "Goals",
      icon: "goals",
      href: "/goals",
      keys: "G then G",
      items: [
        { key: "goals", label: "Goals", href: "/goals" },
        { key: "limits", label: "Limits", href: "/goals/limits" },
        { key: "directions", label: "Directions", href: "/goals/directions" },
      ],
    },
  ],
  [{ key: "reports", label: "Reports", icon: "reports", href: "/reports", keys: "G then O" }],
];

const SETTINGS = { label: "Settings", href: "/settings", keys: "G then S" };

// Pages that sit under an item without sharing its path: a role under Pursuits.
const UNDER: Record<string, string> = { "/roles": "/pursuits" };

// The link a path belongs to ("/goals/directions/42#fit" is Directions). A path that is a link ("/record/tools") is that
// link's item; otherwise the longest href whose page it sits under, the first listed among a page's sections.
function currentHref(current: string) {
  const hrefs = [...AREAS.flat().flatMap((a) => [a.href, ...(a.items ?? []).map((i) => i.href)]), SETTINGS.href];
  if (hrefs.includes(current)) return current;
  const page = current.split("#")[0];
  const first = `/${page.split("/")[1] ?? ""}`;
  const path = UNDER[first] ?? page;
  const base = (h: string) => h.split("#")[0];
  return hrefs.filter((h) => (base(h) === "/" ? path === "/" : path === base(h) || path.startsWith(`${base(h)}/`))).sort((a, b) => base(b).length - base(a).length)[0];
}

export type SidebarProps = {
  // The path of the screen shown ("/pursuits", "/record/roles"); its item is marked current.
  current: string;
  // Counts beside areas, by area key: { review: 14, pursuits: 6 }.
  counts?: Partial<Record<string, number>>;
  // Areas with something new since last looked, by key; the rail marks them with a steel square.
  fresh?: string[];
  activity: { jobs: Job[]; spend?: Spend };
  user: { name: string };
  // The account row's menu (Profile, Sign out).
  account: MenuEntry[];
  // Opens the command palette.
  onSearch: () => void;
  // Collapses the sidebar to the rail, or expands it back. Leave out where the size isn't a choice (medium screens).
  onToggle?: () => void;
  // The 56px icon rail (medium screens, or collapsed).
  rail?: boolean;
  // Groups open at first, by area key ("record"); the one holding the current screen always opens.
  open?: string[];
};

// You, in the account row: the name beside it says who, so the square is decoration.
function Me({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex shrink-0">
      <Avatar name={name} you size={20} />
    </span>
  );
}

// Arrow keys move between the sidebar's items, Home and End jump to the first and last; Right opens a group, Left
// closes it.
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-nav-item]"));
  const at = items.indexOf(document.activeElement as HTMLElement);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to === undefined || at === -1) return;
  e.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
}

// The app's navigation. 240px with the logo, search, the areas and, at the bottom, the activity indicator, Settings
// and the account; or the 56px rail of icons with their names in tooltips. A phone uses the BottomBar and MoreSheet.
export function Sidebar(props: SidebarProps) {
  return props.rail ? <Rail {...props} /> : <Expanded {...props} />;
}

function Expanded({ current, counts = {}, activity, user, account, onSearch, onToggle, open: initial = [] }: SidebarProps) {
  const on = currentHref(current);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(AREAS.flat().flatMap((a) => (a.items ? [[a.key, initial.includes(a.key) || a.items.some((i) => i.href === on)]] : []))),
  );
  const ids = useId();

  const row = (active: boolean) =>
    `group/item flex h-[30px] items-center gap-2.5 rounded-sm px-2 text-body-sm leading-body-sm font-medium text-text outline-offset-[-2px] transition-colors duration-100 ${
      active ? "bg-steel-subtle" : "hover:bg-hover"
    }`;
  const icon = (active: boolean) => `shrink-0 ${active ? "text-text" : "text-muted group-hover/item:text-text"}`;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-subtle px-2 pb-2">
      <div className="flex h-[52px] shrink-0 items-center justify-between pl-2">
        <Link href="/" aria-label="CareerBot, Today" className="flex rounded-sm">
          <Logo height={20} />
        </Link>
        {onToggle && (
          <Tooltip content="Collapse sidebar">
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={onToggle}
              className="flex size-7 items-center justify-center rounded-sm text-text transition-colors duration-100 hover:bg-hover"
            >
              <Icons.sidebar />
            </button>
          </Tooltip>
        )}
      </div>
      <button
        type="button"
        data-tour="shell.search"
        onClick={onSearch}
        className="flex h-8 w-full shrink-0 items-center gap-2 rounded-sm border bg-surface px-2.5 text-left transition-colors duration-100 hover:border-control-border"
      >
        <Icons.search className="mr-1.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-body-md leading-body-md text-muted">Search or jump to</span>
        <span className="pl-1.5">
          <Kbd>⌘K</Kbd>
        </span>
      </button>
      <nav aria-label="Main" data-tour="shell.areas" onKeyDown={moveFocus} className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
        {AREAS.map((group, g) => (
          <ul key={g} className="flex flex-col gap-px pt-3">
            {group.map((area) => {
              const Icon = Icons[area.icon];
              const count = counts[area.key];
              if (!area.items) {
                const active = area.href === on;
                return (
                  <li key={area.key}>
                    <Link href={area.href} data-nav-item aria-current={active ? "page" : undefined} className={row(active)}>
                      <Icon className={icon(active)} />
                      <span className="min-w-0 flex-1 truncate">{area.label}</span>
                      {count !== undefined && (
                        <span className={`text-label leading-label font-medium tabular-nums ${active ? "text-text" : "text-muted"}`}>{count}</span>
                      )}
                    </Link>
                  </li>
                );
              }
              const expanded = open[area.key] ?? false;
              const Chevron = expanded ? Icons.expand : Icons.goIn;
              const listId = `${ids}-${area.key}`;
              return (
                <li key={area.key} className="flex flex-col gap-px">
                  <button
                    type="button"
                    data-nav-item
                    aria-expanded={expanded}
                    aria-controls={listId}
                    onClick={() => setOpen((o) => ({ ...o, [area.key]: !expanded }))}
                    onKeyDown={(e) => {
                      if ((e.key === "ArrowRight" && !expanded) || (e.key === "ArrowLeft" && expanded)) {
                        e.preventDefault();
                        setOpen((o) => ({ ...o, [area.key]: !expanded }));
                      }
                    }}
                    className={`${row(false)} w-full text-left`}
                  >
                    <Icon className={icon(false)} />
                    <span className="min-w-0 flex-1 truncate">{area.label}</span>
                    <Chevron className="shrink-0 text-muted" />
                  </button>
                  {expanded && (
                    <ul id={listId} className="flex flex-col gap-px">
                      {area.items.map((sub) => {
                        const active = sub.href === on;
                        return (
                          <li key={sub.key}>
                            <Link
                              href={sub.href}
                              data-nav-item
                              aria-current={active ? "page" : undefined}
                              className={`flex h-7 items-center rounded-sm pr-2 pl-[34px] text-body-sm leading-body-sm outline-offset-[-2px] transition-colors duration-100 ${
                                active ? "bg-steel-subtle font-medium text-text" : "text-muted hover:bg-hover hover:text-text"
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate">{sub.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col gap-px border-t pt-2">
        <div data-tour="shell.activity" className="flex flex-col">
          <Activity jobs={activity.jobs} spend={activity.spend} />
        </div>
        <Link href={SETTINGS.href} aria-current={on === SETTINGS.href ? "page" : undefined} className={row(on === SETTINGS.href)}>
          <Icons.settings className={icon(on === SETTINGS.href)} />
          <span className="min-w-0 flex-1 truncate">{SETTINGS.label}</span>
        </Link>
        <Menu
          label="Account"
          align="start"
          items={account}
          trigger={
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-sm pr-2 pl-1.5 text-left outline-offset-[-2px] transition-colors duration-100 hover:bg-hover data-[state=open]:bg-hover"
            >
              <Me name={user.name} />
              <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm font-medium text-text">{user.name}</span>
              <Icons.switch className="shrink-0 text-muted" />
            </button>
          }
        />
      </div>
    </aside>
  );
}

function RailItem({ label, icon, href, keys, count, active, fresh }: { label: string; icon: IconName; href: string; keys?: string; count?: number; active: boolean; fresh: boolean }) {
  const Icon = Icons[icon];
  return (
    <li>
      <Tooltip content={count === undefined ? label : `${label} · ${count}`} keys={keys} side="right">
        <Link
          href={href}
          data-nav-item
          aria-label={count === undefined ? label : `${label}, ${count}`}
          aria-current={active ? "page" : undefined}
          className={`group/item relative flex h-8 w-9 items-center justify-center rounded-sm transition-colors duration-100 ${active ? "bg-steel-subtle" : "hover:bg-hover"}`}
        >
          <Icon className={active ? "text-text" : "text-muted group-hover/item:text-text"} />
          {fresh && <span aria-hidden className="absolute top-1.5 right-[5px] size-1.5 rounded-xs bg-steel" />}
          {fresh && <span className="sr-only">, new</span>}
        </Link>
      </Tooltip>
    </li>
  );
}

function Rail({ current, counts = {}, fresh = [], activity, user, account, onSearch, onToggle }: SidebarProps) {
  const on = currentHref(current);
  const mark = <Logo variant="mark" height={20} />;
  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-0.5 border-r bg-subtle pt-3.5 pb-2">
      {onToggle ? (
        <Tooltip content="Expand sidebar" side="right">
          <button type="button" aria-label="Expand sidebar" onClick={onToggle} className="flex rounded-sm">
            {mark}
          </button>
        </Tooltip>
      ) : (
        <Link href="/" aria-label="CareerBot, Today" className="flex rounded-sm">
          {mark}
        </Link>
      )}
      <div className="h-3.5 shrink-0" />
      <Tooltip content="Search or jump to" keys="⌘K" side="right">
        <button
          type="button"
          data-tour="shell.search"
          aria-label="Search or jump to"
          onClick={onSearch}
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-text transition-colors duration-100 hover:bg-hover"
        >
          <Icons.search />
        </button>
      </Tooltip>
      <div className="h-2 shrink-0" />
      <nav aria-label="Main" data-tour="shell.areas" onKeyDown={moveFocus} className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
        <ul className="flex flex-col items-center gap-0.5">
          {AREAS.flat().map((area) => {
            const hrefs = [area.href, ...(area.items ?? []).map((i) => i.href)];
            return (
              <RailItem
                key={area.key}
                label={area.label}
                icon={area.icon}
                href={area.href}
                keys={area.keys}
                count={counts[area.key]}
                active={hrefs.includes(on)}
                fresh={fresh.includes(area.key)}
              />
            );
          })}
        </ul>
      </nav>
      <div data-tour="shell.activity" className="flex flex-col items-center">
        <Activity jobs={activity.jobs} spend={activity.spend} look="rail" />
      </div>
      <div className="h-2 shrink-0" />
      <ul className="flex flex-col items-center gap-0.5">
        <RailItem label={SETTINGS.label} icon="settings" href={SETTINGS.href} keys={SETTINGS.keys} active={on === SETTINGS.href} fresh={false} />
      </ul>
      <Menu
        label="Account"
        align="start"
        items={account}
        trigger={
          <button
            type="button"
            aria-label={`Account, ${user.name}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-100 hover:bg-hover data-[state=open]:bg-hover"
          >
            <Me name={user.name} />
          </button>
        }
      />
    </aside>
  );
}

// The rest of the sidebar on a phone, opened from the bottom bar's More: the areas the bar doesn't hold in the sidebar's
// order, Record and Goals with their sub-screens in two columns, then activity, Settings and the account. Choosing a
// screen closes it.
export function MoreSheet({
  open,
  onOpenChange,
  current,
  counts = {},
  activity,
  user,
  account,
  skip = ["today", "review", "pursuits"],
}: Pick<SidebarProps, "current" | "counts" | "activity" | "user" | "account"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Areas already in the bottom bar.
  skip?: string[];
}) {
  const on = currentHref(current);
  const close = () => onOpenChange(false);
  const row = (active: boolean) =>
    `flex h-11 items-center gap-2.5 rounded-sm px-2 text-body-md leading-body-md text-text transition-colors duration-100 ${active ? "bg-steel-subtle font-medium" : "hover:bg-hover"}`;
  const divider = <li role="presentation" className="-mx-1 my-1 h-px bg-border" />;
  const areas = AREAS.flat().filter((a) => !skip.includes(a.key));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="More">
      <nav aria-label="More">
        <ul className="flex flex-col">
          {areas.map((area, i) => {
            const Icon = Icons[area.icon];
            if (!area.items) {
              const active = area.href === on;
              return (
                <Fragment key={area.key}>
                  {areas[i - 1]?.items && divider}
                  <li>
                    <Link href={area.href} onClick={close} aria-current={active ? "page" : undefined} className={row(active)}>
                      <Icon size={20} className={active ? "shrink-0 text-text" : "shrink-0 text-muted"} />
                      <span className="min-w-0 flex-1 truncate">{area.label}</span>
                      {counts[area.key] !== undefined && <span className="text-body-sm leading-body-sm text-muted tabular-nums">{counts[area.key]}</span>}
                    </Link>
                  </li>
                </Fragment>
              );
            }
            return (
              <Fragment key={area.key}>
                {i > 0 && divider}
                <li>
                  <h3 className="flex h-11 items-center gap-2.5 px-2 text-body-md leading-body-md text-text">
                    <Icon size={20} className="shrink-0 text-muted" />
                    {area.label}
                  </h3>
                  <ul className="flex flex-wrap">
                    {area.items.map((sub) => {
                      const active = sub.href === on;
                      return (
                        <li key={sub.key} className="w-1/2">
                          <Link
                            href={sub.href}
                            onClick={close}
                            aria-current={active ? "page" : undefined}
                            className={`flex h-11 items-center rounded-sm pr-2 pl-[38px] text-body-sm leading-body-sm text-text transition-colors duration-100 ${
                              active ? "bg-steel-subtle font-medium" : "hover:bg-hover"
                            }`}
                          >
                            {sub.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              </Fragment>
            );
          })}
          {divider}
          <li>
            <Activity jobs={activity.jobs} spend={activity.spend} look="phone" />
          </li>
          <li>
            <Link href={SETTINGS.href} onClick={close} aria-current={on === SETTINGS.href ? "page" : undefined} className={row(on === SETTINGS.href)}>
              <Icons.settings size={20} className="shrink-0 text-muted" />
              <span className="flex-1">{SETTINGS.label}</span>
            </Link>
          </li>
          <li>
            <Menu
              label="Account"
              items={account}
              trigger={
                <button type="button" className="flex h-11 w-full items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-100 hover:bg-hover">
                  <Me name={user.name} />
                  <span className="min-w-0 flex-1 truncate text-body-md leading-body-md text-text">{user.name}</span>
                  <Icons.goIn className="shrink-0 text-muted" />
                </button>
              }
            />
          </li>
        </ul>
      </nav>
    </Sheet>
  );
}
