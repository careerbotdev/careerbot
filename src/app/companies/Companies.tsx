"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompanySort } from "../../../convex/companySets";
import { Avatar } from "@/components/Avatar";
import { BulkBar } from "@/components/BulkBar";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar, FilterOptions, type Filter } from "@/components/FilterBar";
import { ListFold } from "@/components/ListFold";
import { List, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { Popover } from "@/components/Popover";
import { ReasonField } from "@/components/ReasonField";
import { FitWord } from "@/components/StatusTag";
import { Spinner } from "@/components/Spinner";
import { TabPanel, Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { selectEntries, useSelection } from "@/components/useSelection";
import { useBar, useCommands } from "../shell/ShellContext";
import { useTour } from "../shell/useTour";
import { COMPANIES_TOUR } from "../tours/companies";
import { checkNote, COMPANY_REASONS, CompanyItem, coverageText, type EditField, editFieldFor, failed, type Rating, WORDS } from "./Company";
import { type CompaniesData, type Company, type Tab, TABS, useCompaniesEnv } from "./env";
import { ASIDE, type AsideKind, archivedFrom, asideKind, companySets, tabOf } from "./sets";
import { findEstimate, rowLine, totalCost } from "./findPlan";
import { SearchSettingsDialog, SearchSettingsScreen } from "./SearchSettings";
import { FindCompanies } from "./Tools";

const TAB_LABEL: Record<Tab, string> = { targets: "Targets", maybe: "Maybe", found: "Found", aside: "Set aside", archived: "Archived" };
const KINDS = Object.keys(ASIDE) as AsideKind[];
const FIT_ORDER = { strong: 3, some: 2, weak: 1, none: 0 } as const;
// Sort by, in the list's ⋯: each order's name and what comes first. Targets, Maybe, Found and Archived follow it.
const SORTS: Record<CompanySort, { label: string; hint: string }> = {
  best: { label: "Best fit", hint: "Strongest first" },
  weakest: { label: "Weakest fit first", hint: "No fit, then weak" },
  board: { label: "Has a job board first", hint: "Then best fit" },
  newest: { label: "Newest found", hint: "Latest first" },
  name: { label: "Name", hint: "A to Z" },
};
const SORT_WORDS = {
  detail: "Changes the order of this list: strongest fit first, weakest first, companies with a job board first (best fit within each), newest found, or A to Z.",
  note: "Free · Change it any time",
};

// Where a key types or picks instead of acting on the list.
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

// Companies: their Targets and Maybes, what was Found for them, what's Set aside and what they Archived, with the one
// chosen open beside the list (?tab=, ?company=), in the order Sort by sets (?sort=). T, M and R rate the row under the
// pointer or focus, else the open company, and A archives or restores it (the checked rows, while selecting); J and K
// move.
export function Companies() {
  const data = useCompaniesEnv().useData();
  if (!data) return null;
  return <Screen data={data} />;
}

function Screen({ data }: { data: CompaniesData }) {
  const env = useCompaniesEnv();
  const { tab: tabParam, company: companyParam, settings: searchSettings, sort, set } = env.useParams();
  const act = env.useAct();
  const size = useScreenSize();
  const small = size === "small";
  const router = useRouter();
  const tour = useTour(COMPANIES_TOUR);

  const sets = useMemo(() => companySets(data.companies, data.lens.judge, sort), [data.companies, data.lens.judge, sort]);
  const opened = companyParam ? data.companies.find((c) => c.id === companyParam) : undefined;
  const tab: Tab = tabParam ?? (opened ? tabOf(sets, opened.id) : null) ?? (sets.targets.length ? "targets" : "found");

  const [direction, setDirection] = useState<string | null>(null);
  const [reason, setReason] = useState<AsideKind | null>(null);
  // The filter bar: shown beside the item, folded away on a phone until asked for.
  const [filtersOpen, setFiltersOpen] = useState<boolean | null>(null);
  const filtersShown = filtersOpen ?? !small;
  const [folds, setFolds] = useState<Record<AsideKind, boolean>>({ goals: true, no: true, out: true });
  const [unrankedOpen, setUnrankedOpen] = useState(true);
  const [why, setWhy] = useState<{ id: string; where: "row" | "item" } | null>(null);
  const sel = useSelection();
  const [dialog, setDialog] = useState<"find" | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The directions companies were judged for, to filter by.
  const directions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of data.companies) for (const f of c.fit) seen.set(f.directionId, f.direction);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [data.companies]);
  const fitOf = (c: Company) => (direction ? c.fit.find((f) => f.directionId === direction) : [...c.fit].sort((a, b) => FIT_ORDER[b.level] - FIT_ORDER[a.level])[0]);

  const groups = tab === "aside" ? KINDS.filter((k) => !reason || k === reason).map((kind) => ({ kind, list: sets.aside[kind] })) : [];
  const listed = tab === "aside" ? [] : sets[tab].filter((c) => !direction || c.fit.some((f) => f.directionId === direction && f.level !== "none"));
  // Found, in an order by fit: the companies whose fit isn't judged yet wait below the ranked ones, in Not ranked yet.
  const splitRanked = tab === "found" && (sort === "best" || sort === "weakest" || sort === "board");
  const ranked = splitRanked ? listed.filter((c) => c.ranked) : listed;
  const unranked = splitRanked ? listed.filter((c) => !c.ranked) : [];
  const shown = tab === "aside" ? groups.flatMap((g) => g.list) : [...ranked, ...unranked];
  const total = tab === "aside" ? KINDS.reduce((n, k) => n + sets.aside[k].length, 0) : sets[tab].length;
  // The rows on screen, in order (a folded group's rows aren't), to find the one under the pointer or focus, and the
  // rows a Shift-click's range runs over.
  const rendered = tab === "aside" ? groups.flatMap((g) => (folds[g.kind] ? g.list : [])) : unrankedOpen ? shown : ranked;
  const renderedIds = rendered.map((c) => c.id);

  const chosen = opened ?? (small ? undefined : shown[0]);
  const at = chosen ? shown.findIndex((c) => c.id === chosen.id) : -1;
  const open = useCallback((id: string | null, replace = false) => set({ company: id }, replace), [set]);
  const move = (by: number) => {
    if (!shown.length) return;
    const next = shown[Math.min(shown.length - 1, Math.max(0, (at < 0 ? (by > 0 ? -1 : 0) : at) + by))];
    if (next) open(next.id, true);
  };
  const pickTab = (t: Tab) => {
    setWhy(null);
    sel.done();
    set({ tab: t, company: null });
  };

  // A company leaving the list it's open in: the next one takes its place, so they can keep working through.
  const leave = (c: Company) => {
    if (chosen?.id !== c.id) return;
    const i = shown.findIndex((x) => x.id === c.id);
    if (i < 0) return;
    open(shown[i + 1]?.id ?? shown[i - 1]?.id ?? null, true);
  };

  const rate = (c: Company, value: Rating | null, why?: string) => {
    const before = { value: c.rating, reason: c.ratingReason ?? undefined };
    if (value !== c.rating) leave(c);
    const message =
      value === "excited" ? `${c.name} is a Target` : value === "maybe" ? `${c.name} is a Maybe` : value === "no" ? `Not for me: ${c.name}${why ? ` · ${why}` : ""}` : `Rating taken off ${c.name}`;
    act
      .rate({ id: c.id, value, ...(value === "no" && why ? { reason: why } : {}) })
      .then(() =>
        toast({
          message: message.length > 64 ? `${message.slice(0, 62).trimEnd()}…` : message,
          icon: value === "excited" ? "approve" : value === "no" ? "reject" : value === null ? "undo" : "companies",
          action: { label: "Undo", key: "U", run: () => void act.rate({ id: c.id, value: before.value, ...(before.reason ? { reason: before.reason } : {}) }).catch(failed) },
        }),
      )
      .catch(failed);
  };
  const keep = (c: Company, on: boolean) => {
    if (on) leave(c);
    act
      .keepAnyway({ id: c.id, keep: on })
      .then(() => toast({ message: on ? `Kept ${c.name}` : `${c.name} is set aside again`, icon: on ? "approve" : "setAside", action: { label: "Undo", key: "U", run: () => void act.keepAnyway({ id: c.id, keep: !on }).catch(failed) } }))
      .catch(failed);
  };
  const employer = (c: Company, on: boolean) => {
    leave(c);
    act
      .setEmployer({ id: c.id, employer: on })
      .then(() =>
        toast({ message: on ? `Restored ${c.name}` : `${c.name} isn’t a place to work`, icon: on ? "undo" : "setAside", action: { label: "Undo", key: "U", run: () => void act.setEmployer({ id: c.id, employer: !on }).catch(failed) } }),
      )
      .catch(failed);
  };
  const recheck = (ids: Company["id"][]) =>
    void act
      .recheck({ ids })
      .then(({ skipped }) => toast({ message: `Checking ${ids.length - skipped} again${skipped ? `; ${skipped} skipped` : ""}`, icon: "running" }))
      .catch(failed);
  // Several companies' names for a toast: "EliseAI, Samsara and Tines", or the first three and how many more.
  const namesOf = (list: Company[]) => {
    const names = list.map((c) => c.name);
    if (names.length > 4) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
  };
  const short = (message: string) => (message.length > 64 ? `${message.slice(0, 62).trimEnd()}…` : message);
  // Companies leaving the list together: when the open one is among them, the next one left takes its place.
  const leaveAll = (list: Company[]) => {
    if (!chosen || !list.some((c) => c.id === chosen.id)) return;
    const gone = new Set<string>(list.map((c) => c.id));
    const i = shown.findIndex((x) => x.id === chosen.id);
    open((shown.slice(i + 1).find((x) => !gone.has(x.id)) ?? shown.slice(0, Math.max(0, i)).findLast((x) => !gone.has(x.id)))?.id ?? null, true);
  };
  // Archive (out of every list, its rating kept) or Restore (back where it was), with Undo.
  const archive = (list: Company[], on: boolean) => {
    if (!list.length) return;
    leaveAll(list);
    const ids = list.map((c) => c.id);
    act
      .archive({ ids, archived: on })
      .then(() =>
        toast({
          message: short(`${on ? "Archived" : "Restored"} ${namesOf(list)}`),
          icon: on ? "archive" : "undo",
          action: { label: "Undo", key: "U", run: () => void act.archive({ ids, archived: !on }).catch(failed) },
        }),
      )
      .catch(failed);
  };
  // The checked companies rated at once, with Undo putting back each one's own rating.
  const rateAll = (list: Company[], value: Rating) => {
    const rateable = list.filter((c) => c.screened?.employer !== false && c.rating !== value);
    if (!rateable.length) return;
    leaveAll(rateable);
    const one = rateable.length === 1;
    const named = namesOf(rateable);
    const message = value === "excited" ? `${named} ${one ? "is a Target" : "are Targets"}` : value === "maybe" ? `${named} ${one ? "is a Maybe" : "are Maybes"}` : `Not for me: ${named}`;
    Promise.all(rateable.map((c) => act.rate({ id: c.id, value })))
      .then(() =>
        toast({
          message: short(message),
          icon: value === "excited" ? "approve" : value === "no" ? "reject" : "companies",
          action: {
            label: "Undo",
            key: "U",
            run: () => void Promise.all(rateable.map((c) => act.rate({ id: c.id, value: c.rating, ...(c.ratingReason ? { reason: c.ratingReason } : {}) }))).catch(failed),
          },
        }),
      )
      .catch(failed);
  };

  const unfilled = useMemo(() => sets.found.filter((c) => !c.details && c.domain), [sets]);
  const fillNote = useMemo(() => checkNote(unfilled, data.apolloJobs), [unfilled, data.apolloJobs]);
  const filling = data.enriching?.status === "queued" || data.enriching?.status === "running";
  const fillIn = () => void act.fillIn({}).then(() => toast({ message: "Filling in details", icon: "running" }), failed);
  const setup = env.useFindSetup();
  const estimate = useMemo(() => (setup ? totalCost(findEstimate(data, setup)) : undefined), [data, setup]);

  // The row under the keyboard's focus, else the pointer.
  const rowAt = (el: Element | null) => {
    const scope = el?.closest("[data-row-scope]");
    const root = listRef.current;
    if (!scope || !root?.contains(scope)) return undefined;
    return rendered[[...root.querySelectorAll("[data-row-scope]")].indexOf(scope)];
  };
  const underHand = () => rowAt(document.activeElement) ?? rowAt(listRef.current?.querySelector("[data-row-scope]:hover") ?? null);
  // Each rating key toggles at once (Not for me with a note, or Change the reason, is in ⋯).
  const rateKey = (c: Company, key: "t" | "m" | "r") => {
    if (c.screened?.employer === false) return;
    const value = key === "t" ? "excited" : key === "m" ? "maybe" : "no";
    rate(c, c.rating === value ? null : value);
  };
  // The screen's keys, bound again after each render so they act on what's shown now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e) || why) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "t" || key === "m" || key === "r") {
        const checkedNow = shown.filter((c) => sel.checked.has(c.id));
        if (sel.on && checkedNow.length) {
          e.preventDefault();
          rateAll(checkedNow, key === "t" ? "excited" : key === "m" ? "maybe" : "no");
          sel.done();
          return;
        }
        const target = underHand() ?? chosen;
        if (!target) return;
        e.preventDefault();
        rateKey(target, key);
      } else if (key === "a") {
        const list = sel.on ? shown.filter((c) => sel.checked.has(c.id)) : [underHand() ?? chosen].filter((c) => c !== undefined);
        if (!list.length) return;
        e.preventDefault();
        archive(list, !list[0].archived);
        if (sel.on) sel.done();
      } else if (key === "e" && chosen) {
        e.preventDefault();
        setEditing({ id: chosen.id, field: editFieldFor(chosen) });
      } else if (key === "Escape") {
        if (sel.on) {
          e.preventDefault();
          sel.done();
        } else if (companyParam) {
          e.preventDefault();
          open(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The popover opens once the menu or palette it was chosen from has closed and handed focus back; opened sooner, that
  // hand-back would close it at once.
  const openFind = useCallback(() => {
    let frames = 0;
    const wait = () => (document.querySelector("[role=menu], [role=dialog]") && frames++ < 60 ? requestAnimationFrame(wait) : setDialog("find"));
    requestAnimationFrame(wait);
  }, []);

  const listMenu: MenuEntry[] = [
    ...(tab === "aside"
      ? []
      : [
          {
            label: "Sort by",
            icon: "sort" as const,
            hint: SORTS[sort].label,
            ...SORT_WORDS,
            items: (Object.keys(SORTS) as CompanySort[]).map((s) => ({ label: SORTS[s].label, hint: SORTS[s].hint, checked: s === sort, onSelect: () => set({ sort: s === "best" ? null : s }, true) })),
          },
        ]),
    ...selectEntries(sel, renderedIds, "companies"),
    "separator",
    { label: "Find companies", icon: "search", hint: estimate, detail: WORDS.find.detail, note: WORDS.find.note, onSelect: openFind },
    {
      label: filling ? "Filling in details" : `Fill in details${unfilled.length ? ` for ${unfilled.length}` : ""}`,
      icon: "tryAgain",
      detail: "Reads the website and job board of each company not filled in yet, then how it fits your directions.",
      note: fillNote,
      disabled: filling || unfilled.length === 0,
      reason: filling ? "Running" : "All filled in",
      onSelect: fillIn,
    },
    "separator",
    { label: "Search settings", icon: "filter", detail: WORDS.settings.detail, note: WORDS.settings.note, onSelect: () => set({ settings: "search" }) },
    "separator",
    tour.menu,
  ];

  // Everything a company can do, for its ⋯ menu, its row's right-click, and the phone's bar. `where`: the row it's opened
  // from, or the open item, which is where Not for me with a note (or Change the reason) asks why.
  const itemMenu = (c: Company, where: "row" | "item"): MenuEntry[] => {
    const out = c.screened?.employer === false;
    const kind = asideKind(sets, c.id);
    const watched = (c.rating === "excited" || c.rating === "maybe") && !out;
    const edit: MenuEntry = {
      label: "Edit website and job board",
      icon: "edit",
      keys: "E",
      detail: "Opens its website or job board for editing.",
      note: "Free",
      onSelect: () => {
        if (chosen?.id !== c.id) open(c.id);
        setEditing({ id: c.id, field: editFieldFor(c) });
      },
    };
    const site: MenuEntry[] = c.domain ? [{ label: "Open its website", icon: "openElsewhere", detail: "Opens the company’s site in a new tab.", note: "Free", onSelect: () => window.open(c.websiteUrl ?? `https://${c.domain}`, "_blank", "noopener") }] : [];
    if (c.archived) return [{ label: "Restore", icon: "undo", keys: "A", detail: WORDS.unarchive.detail, note: WORDS.unarchive.note, onSelect: () => archive([c], false) }, "separator", edit, ...site];
    return [
      ...(out
        ? []
        : ([
            { label: "Target", keys: "T", checked: c.rating === "excited", onSelect: () => rate(c, c.rating === "excited" ? null : "excited") },
            { label: "Maybe", keys: "M", checked: c.rating === "maybe", onSelect: () => rate(c, c.rating === "maybe" ? null : "maybe") },
            { label: "Not for me", keys: "R", checked: c.rating === "no", onSelect: () => rate(c, c.rating === "no" ? null : "no") },
            c.rating === "no"
              ? { label: "Change the reason", icon: "edit", detail: WORDS.reason.detail, note: WORDS.reason.note, onSelect: () => setWhy({ id: c.id, where: small ? "item" : where }) }
              : { label: "Not for me with a note", icon: "reject", detail: WORDS.noNote.detail, note: WORDS.noNote.note, onSelect: () => setWhy({ id: c.id, where: small ? "item" : where }) },
            "separator",
          ] satisfies MenuEntry[])),
      ...(c.goals?.level === "doesnt" && kind !== "goals" && c.goals.keep ? [{ label: "Let it be set aside", icon: "setAside" as const, detail: "Moves it back to Doesn’t fit your goals.", note: "Free · Undo with U", onSelect: () => keep(c, false) }] : []),
      ...(kind === "goals" ? [{ label: "Keep anyway", icon: "approve" as const, detail: WORDS.keep.detail, note: WORDS.keep.note, onSelect: () => keep(c, true) }] : []),
      edit,
      {
        label: "Check again",
        icon: "tryAgain",
        detail: WORDS.check,
        note: checkNote([c], data.apolloJobs),
        disabled: !c.domain || (out && c.screened?.by === "you") || c.checking,
        reason: c.checking ? "Checking" : !c.domain ? "Add its website first" : "Restore it first",
        onSelect: () => recheck([c.id]),
      },
      ...site,
      ...(watched ? [{ label: "Open its roles in Pursuits", icon: "pursuits" as const, detail: "Shows its open roles in Pursuits.", note: "Free", onSelect: () => router.push(`/pursuits?company=${c.id}`) }] : []),
      "separator",
      { label: "Archive", icon: "archive", keys: "A", detail: WORDS.archive.detail, note: WORDS.archive.note, onSelect: () => archive([c], true) },
      out
        ? { label: "Restore", icon: "undo", detail: WORDS.restore.detail, note: WORDS.restore.note, onSelect: () => employer(c, true) }
        : { label: "Not a place to work", icon: "setAside", detail: WORDS.notEmployer.detail, note: WORDS.notEmployer.note, onSelect: () => employer(c, false) },
    ];
  };

  const commands = useMemo(
    (): Command[] => [
      ...TABS.map((t): Command => ({ id: `companies-${t}`, group: "Companies", label: TAB_LABEL[t], icon: "companies", onSelect: () => set({ tab: t, company: null }) })),
      { id: "companies-find", group: "Companies", label: "Find companies", detail: estimate, icon: "search", onSelect: openFind },
      { id: "companies-fill", group: "Companies", label: "Fill in details", detail: fillNote, icon: "tryAgain", onSelect: () => void act.fillIn({}).catch(failed) },
      { id: "companies-search-settings", group: "Companies", label: "Search settings", detail: WORDS.settings.detail, icon: "filter", onSelect: () => set({ settings: "search" }) },
    ],
    [set, estimate, act, openFind, fillNote],
  );
  useCommands(commands);

  // The checked companies, in the list's order.
  const checkedRows = shown.filter((c) => sel.checked.has(c.id));
  const chosenIds = checkedRows.map((c) => c.id);
  const checkAgain = { detail: WORDS.check, note: checkNote(checkedRows, data.apolloJobs), reason: chosenIds.length ? undefined : "None selected" };
  const bulk = (run: () => void) => () => (run(), sel.done());
  const whyFor = why ? data.companies.find((c) => c.id === why.id) : undefined;
  const finishWhy = (reason?: string) => {
    setWhy(null);
    if (whyFor) rate(whyFor, "no", reason);
  };
  useBar(
    small
      ? whyFor
        ? { kind: "reason", decision: `Not for me: ${whyFor.name}`, picks: COMPANY_REASONS.slice(0, 4), onDone: ({ reason }) => finishWhy(reason) }
        : sel.on
          ? {
              kind: "bulk",
              count: chosenIds.length,
              onDone: sel.done,
              actions:
                tab === "archived" ? (
                  <Button size="lg" variant="primary" className="flex-1" detail={WORDS.unarchive.detail} note={WORDS.unarchive.note} onClick={bulk(() => archive(checkedRows, false))}>
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button size="lg" className="flex-1" detail={WORDS.archive.detail} note={WORDS.archive.note} onClick={bulk(() => archive(checkedRows, true))}>
                      Archive
                    </Button>
                    <Button size="lg" variant="primary" className="flex-1" detail={WORDS.excited.detail} note={WORDS.excited.note} onClick={bulk(() => rateAll(checkedRows, "excited"))}>
                      Target
                    </Button>
                  </>
                ),
            }
          : opened
            ? {
                kind: "actions",
                actions: (
                  <>
                    <Menu label={`More for ${opened.name}`} title={opened.name} items={itemMenu(opened, "item")} trigger={<Button size="lg" iconOnly icon="more" aria-label={`More for ${opened.name}`} />} />
                    {opened.archived ? (
                      <Button size="lg" variant="primary" className="flex-1" detail={WORDS.unarchive.detail} note={WORDS.unarchive.note} onClick={() => archive([opened], false)}>
                        Restore
                      </Button>
                    ) : opened.screened?.employer === false ? (
                      <Button size="lg" variant="primary" className="flex-1" detail={WORDS.restore.detail} note={WORDS.restore.note} onClick={() => employer(opened, true)}>
                        Restore
                      </Button>
                    ) : (
                      <>
                        {/* Three ratings fit from 390 wide; narrower, Maybe is in More (where all three are). */}
                        <Button size="lg" className="flex-1" icon={opened.rating === "no" ? "approve" : undefined} detail={WORDS[opened.rating === "no" ? "unrate" : "no"].detail} note={WORDS.no.note} onClick={() => rate(opened, opened.rating === "no" ? null : "no")}>
                          Not for me
                        </Button>
                        <Button size="lg" className="flex-1 max-[390px]:hidden" icon={opened.rating === "maybe" ? "approve" : undefined} detail={WORDS[opened.rating === "maybe" ? "unrate" : "maybe"].detail} note={WORDS.maybe.note} onClick={() => rate(opened, opened.rating === "maybe" ? null : "maybe")}>
                          Maybe
                        </Button>
                        <Button size="lg" variant="primary" className="flex-1" icon={opened.rating === "excited" ? "approve" : undefined} detail={WORDS[opened.rating === "excited" ? "unrate" : "excited"].detail} note={WORDS.excited.note} onClick={() => rate(opened, opened.rating === "excited" ? null : "excited")}>
                          Target
                        </Button>
                      </>
                    )}
                  </>
                ),
              }
            : null
      : null,
  );

  const row = (c: Company) => {
    const out = c.screened?.employer === false;
    // Not ranked yet: no fit word until its fit is judged.
    const waiting = splitRanked && !c.ranked;
    const fit = waiting ? undefined : fitOf(c);
    const line =
      tab === "aside"
        ? asideKind(sets, c.id) === "goals"
          ? c.goals?.reason
          : asideKind(sets, c.id) === "no"
            ? (c.ratingReason ?? "No reason given")
            : c.screened?.kind && c.screened.kind[0].toUpperCase() + c.screened.kind.slice(1)
        : rowLine(c);
    const tag =
      tab === "found" || tab === "archived" ? (
        fit ? (
          <FitWord level={fit.level} className="text-body-sm leading-body-sm" />
        ) : !c.details ? (
          <span className="text-body-sm leading-body-sm text-muted">Not filled in</span>
        ) : undefined
      ) : tab === "targets" || tab === "maybe" ? (
        <RolesTag company={c} />
      ) : undefined;
    return (
      <ListRow
        key={c.id}
        title={c.name}
        line={line ?? undefined}
        lead={<Avatar name={c.name} company size={28} />}
        tag={tag}
        meta={c.archived ? new Date(c.archived.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : undefined}
        muted={waiting}
        selected={!small && chosen?.id === c.id}
        checked={sel.checked.has(c.id)}
        onCheck={(on, range) => sel.pick(c.id, on, range ? renderedIds : undefined)}
        selecting={sel.on}
        onOpen={() => open(c.id)}
        actions={
          c.archived
            ? [{ label: "Restore", icon: "undo", keys: "A", detail: WORDS.unarchive.detail, note: WORDS.unarchive.note, onSelect: () => archive([c], false) }]
            : out
              ? []
              : [
                { label: "Target", keys: "T", detail: WORDS[c.rating === "excited" ? "unrate" : "excited"].detail, note: WORDS.excited.note, onSelect: () => rateKey(c, "t") },
                { label: "Maybe", keys: "M", detail: WORDS[c.rating === "maybe" ? "unrate" : "maybe"].detail, note: WORDS.maybe.note, onSelect: () => rateKey(c, "m") },
                { label: "Not for me", keys: "R", detail: WORDS[c.rating === "no" ? "unrate" : "no"].detail, note: WORDS.no.note, onSelect: () => rateKey(c, "r") },
              ]
        }
        menu={itemMenu(c, "row")}
        below={
          why?.where === "row" && why.id === c.id && !small ? (
            <ReasonField picks={COMPANY_REASONS} defaultValue={c.rating === "no" ? (c.ratingReason ?? "") : ""} onDone={({ reason }) => finishWhy(reason)} />
          ) : undefined
        }
      />
    );
  };

  const filters: Filter[] =
    tab === "aside"
      ? [
          {
            id: "reason",
            label: "Reason",
            value: reason ? ASIDE[reason].label : undefined,
            editor: <FilterOptions label="Reason" multiple={false} options={KINDS.map((k) => ({ value: k, label: ASIDE[k].label, count: sets.aside[k].length }))} selected={reason ? [reason] : []} onChange={([k]) => setReason((k as AsideKind) ?? null)} />,
            onClear: () => setReason(null),
          },
        ]
      : [
          {
            id: "direction",
            label: "Direction",
            value: directions.find((d) => d.value === direction)?.label,
            editor: <FilterOptions label="Direction" multiple={false} options={directions} selected={direction ? [direction] : []} onChange={([d]) => setDirection(d ?? null)} />,
            onClear: () => setDirection(null),
          },
        ];

  const empty = {
    targets: { title: "No targets yet", body: "Rate a company Target to read its roles and rank them first.", action: <Button detail="Shows the companies found for you." note="Free" onClick={() => pickTab("found")}>Open Found</Button> },
    maybe: { title: "No maybes", body: "Companies you rate Maybe have their roles read too.", action: <Button detail="Shows the companies found for you." note="Free" onClick={() => pickTab("found")}>Open Found</Button> },
    found: {
      title: "Nothing waiting",
      body: "Companies found for your directions show here, best fit first.",
      action: (
        <Button onClick={() => setDialog("find")} icon="search" detail={WORDS.find.detail} note={WORDS.find.note}>
          Find companies
        </Button>
      ),
    },
    aside: { title: "Nothing set aside", body: "Companies you pass on, and ones that don’t fit your goals, show here." },
    archived: { title: "Nothing archived", body: "Companies you archive wait here, out of every other list, until you restore them." },
  }[tab];

  const findAnchor = (
    <Popover
      title="Find companies"
      showTitle
      open={dialog === "find"}
      onOpenChange={(o) => setDialog(o ? "find" : null)}
      side={small ? "bottom" : "right"}
      align="start"
      width={360}
      trigger={<span aria-hidden className="pointer-events-none absolute inset-0" />}
    >
      <FindCompanies
        data={data}
        onSettings={() => {
          setDialog(null);
          set({ settings: "search" });
        }}
      />
    </Popover>
  );

  // While a pass is judging fit: how many found companies are ranked, of all found. Runs on its own.
  const rankedCount = sets.found.filter((c) => c.ranked).length;
  const ranking =
    tab === "found" && filling && rankedCount < sets.found.length ? (
      <Tooltip
        content="Ranking"
        detail={`${rankedCount} of the ${sets.found.length} found companies have a fit for your directions. The other ${sets.found.length - rankedCount} are listed below them and move into place as they’re ranked.`}
        note="Runs on its own as companies are read"
      >
        <span tabIndex={0} className="flex items-center gap-1.5 text-label leading-label whitespace-nowrap text-muted tabular-nums">
          <Spinner size={16} />
          Ranking… {rankedCount} of {sets.found.length}
        </span>
      </Tooltip>
    ) : undefined;

  const list = (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Companies"
        actions={
          <>
            <Button variant="ghost" iconOnly icon="filter" data-tour="companies.filters" aria-label={filtersShown ? "Hide filters" : "Show filters"} aria-pressed={filtersShown} detail={filtersShown ? "Hides the filter bar." : "Shows the filter bar for this list."} note="Free" onClick={() => setFiltersOpen(!filtersShown)} />
            <span className="relative flex" data-tour="companies.more">
              <Menu label="More for Companies" items={listMenu} />
              {findAnchor}
            </span>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col *:flex-1" data-tour="companies.list">
      <Tabs label="Companies by rating" value={tab} onValueChange={(v) => pickTab(v as Tab)} className="px-4" tabs={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: t === "aside" ? KINDS.reduce((n, k) => n + sets.aside[k].length, 0) : sets[t].length }))}>
        {TABS.map((t) => (
          <TabPanel key={t} value={t} className="flex flex-col">
            {t === tab && (
              <>
                {filtersShown && total > 0 && <FilterBar filters={filters} matches={{ shown: shown.length, total }} status={ranking} onClearAll={() => (setDirection(null), setReason(null))} />}
                {!filtersShown && ranking && <div className="flex border-b px-4 py-2.5">{ranking}</div>}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {total === 0 ? (
                    <EmptyState icon="companies" title={empty.title} action={empty.action}>
                      {empty.body}
                    </EmptyState>
                  ) : tab === "aside" ? (
                    <List label="Set aside" className="px-2 py-2">
                      {groups
                        .filter((g) => g.list.length > 0)
                        .map((g) => (
                          <ListFold key={g.kind} label={ASIDE[g.kind].label} count={g.list.length} note={ASIDE[g.kind].note} open={folds[g.kind]} onOpenChange={(o) => setFolds({ ...folds, [g.kind]: o })}>
                            {g.list.map(row)}
                          </ListFold>
                        ))}
                    </List>
                  ) : (
                    <List label={TAB_LABEL[tab]} className="px-2 py-2">
                      {ranked.map(row)}
                      {unranked.length > 0 && (
                        <ListFold label="Not ranked yet" count={unranked.length} open={unrankedOpen} onOpenChange={setUnrankedOpen}>
                          {unranked.map(row)}
                        </ListFold>
                      )}
                    </List>
                  )}
                </div>
              </>
            )}
          </TabPanel>
        ))}
      </Tabs>
      </div>
      {!small && sel.on && (
        <div className="px-2 pb-2">
          <BulkBar
            count={chosenIds.length}
            onDone={sel.done}
            actions={
              tab === "archived"
                ? [{ label: "Restore", keys: "A", primary: true, detail: WORDS.unarchive.detail, note: WORDS.unarchive.note, onSelect: bulk(() => archive(checkedRows, false)) }]
                : [
                    { label: "Target", keys: "T", primary: true, detail: WORDS.excited.detail, note: WORDS.excited.note, onSelect: bulk(() => rateAll(checkedRows, "excited")) },
                    { label: "Archive", keys: "A", detail: WORDS.archive.detail, note: WORDS.archive.note, onSelect: bulk(() => archive(checkedRows, true)) },
                  ]
            }
            more={[
              ...(tab === "archived"
                ? []
                : ([
                    { label: "Maybe", keys: "M", detail: WORDS.maybe.detail, note: WORDS.maybe.note, onSelect: bulk(() => rateAll(checkedRows, "maybe")) },
                    { label: "Not for me", keys: "R", detail: WORDS.no.detail, note: WORDS.no.note, onSelect: bulk(() => rateAll(checkedRows, "no")) },
                    "separator",
                  ] satisfies MenuEntry[])),
              { label: "Check again", icon: "tryAgain", ...checkAgain, onSelect: bulk(() => recheck(chosenIds)) },
            ]}
          />
        </div>
      )}
    </div>
  );

  const item = chosen ? (
    <CompanyItem
      key={chosen.id}
      company={chosen}
      data={data}
      aside={asideKind(sets, chosen.id)}
      position={at >= 0 ? { at: at + 1, of: shown.length } : null}
      archived={chosen.archived ? { at: chosen.archived.at, from: TAB_LABEL[archivedFrom(chosen, data.lens.judge) ?? "found"] } : null}
      onUnarchive={() => archive([chosen], false)}
      small={small}
      size={size}
      why={why?.where === "item" && why.id === chosen.id}
      onWhy={(o) => setWhy(o ? { id: chosen.id, where: "item" } : null)}
      onRate={(v, r) => rate(chosen, v, r)}
      onKeep={(on) => keep(chosen, on)}
      onEmployer={(on) => employer(chosen, on)}
      menu={itemMenu(chosen, "item")}
      onMove={move}
      editing={editing?.id === chosen.id ? editing.field : null}
      onEditing={(field) => setEditing(field ? { id: chosen.id, field } : null)}
    />
  ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        list={list}
        item={small ? (searchSettings ? <SearchSettingsScreen data={data} /> : opened ? item : undefined) : item}
        empty={<EmptyState icon="companies" title="Nothing open">Choose a company to see it here.</EmptyState>}
        back={searchSettings ? { label: "Companies", onBack: () => set({ settings: null }) } : { label: TAB_LABEL[tab], onBack: () => open(null) }}
      />
      {!small && <SearchSettingsDialog data={data} open={searchSettings} onOpenChange={(o) => set({ settings: o ? "search" : null }, true)} />}
    </div>
  );
}

// A watched company's roles at a glance: how many were read, or that no board was found. The demo reads no boards: no
// tag there.
function RolesTag({ company: c }: { company: Company }) {
  const env = useCompaniesEnv();
  const coverage = env.useCoverage(c.id, true);
  const demo = env.useDemo();
  if (!coverage || demo) return null;
  if (!coverage.board) return <span className="text-body-sm leading-body-sm text-caution-text">No board found</span>;
  const covered = coverageText(coverage);
  return (
    <span className={`text-body-sm leading-body-sm tabular-nums ${covered.caution ? "text-caution-text" : "text-muted"}`}>
      {coverage.read.toLocaleString("en-US")} open {coverage.read === 1 ? "role" : "roles"}
    </span>
  );
}
