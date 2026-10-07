"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { TabPanel, Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { selectEntries, useSelection } from "@/components/useSelection";
import { useBar, useCommands } from "../shell/ShellContext";
import { useTour } from "../shell/useTour";
import { COMPANIES_TOUR } from "../tours/companies";
import { checkNote, COMPANY_REASONS, CompanyItem, coverageText, type EditField, editFieldFor, failed, type Rating, WORDS } from "./Company";
import { type CompaniesData, type Company, type Tab, TABS, useCompaniesEnv } from "./env";
import { ASIDE, type AsideKind, asideKind, companySets, tabOf } from "./sets";
import { FindCompanies, findEstimate, LensDialog, NamedDialog, SeedsDialog } from "./Tools";

const TAB_LABEL: Record<Tab, string> = { targets: "Targets", maybe: "Maybe", found: "Found", aside: "Set aside" };
const KINDS = Object.keys(ASIDE) as AsideKind[];
const FIT_ORDER = { strong: 3, some: 2, weak: 1, none: 0 } as const;

// Where a key types or picks instead of acting on the list.
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

// Companies: their Targets and Maybes, what was Found for them, and what's Set aside, with the one chosen open beside
// the list (?tab=, ?company=). T, M and R rate the row under the pointer or focus, else the open company; J and K move.
export function Companies() {
  const data = useCompaniesEnv().useData();
  if (!data) return null;
  return <Screen data={data} />;
}

function Screen({ data }: { data: CompaniesData }) {
  const env = useCompaniesEnv();
  const { tab: tabParam, company: companyParam, set } = env.useParams();
  const act = env.useAct();
  const size = useScreenSize();
  const small = size === "small";
  const router = useRouter();
  const tour = useTour(COMPANIES_TOUR);

  const sets = useMemo(() => companySets(data.companies, data.lens.judge), [data.companies, data.lens.judge]);
  const opened = companyParam ? data.companies.find((c) => c.id === companyParam) : undefined;
  const tab: Tab = tabParam ?? (opened ? tabOf(sets, opened.id) : null) ?? (sets.targets.length ? "targets" : "found");

  const [direction, setDirection] = useState<string | null>(null);
  const [reason, setReason] = useState<AsideKind | null>(null);
  // The filter bar: shown beside the item, folded away on a phone until asked for.
  const [filtersOpen, setFiltersOpen] = useState<boolean | null>(null);
  const filtersShown = filtersOpen ?? !small;
  const [folds, setFolds] = useState<Record<AsideKind, boolean>>({ goals: true, no: true, out: true });
  const [why, setWhy] = useState<{ id: string; where: "row" | "item" } | null>(null);
  const sel = useSelection();
  const [dialog, setDialog] = useState<"find" | "named" | "seeds" | "lens" | null>(null);
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
  const shown = tab === "aside" ? groups.flatMap((g) => g.list) : sets[tab].filter((c) => !direction || c.fit.some((f) => f.directionId === direction && f.level !== "none"));
  const total = tab === "aside" ? KINDS.reduce((n, k) => n + sets.aside[k].length, 0) : sets[tab].length;
  // The rows on screen, in order (a folded group's rows aren't), to find the one under the pointer or focus.
  const rendered = tab === "aside" ? groups.flatMap((g) => (folds[g.kind] ? g.list : [])) : shown;

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

  const unfilled = sets.found.filter((c) => !c.details && c.domain);
  const fillNote = checkNote(unfilled, data.apolloJobs);
  const filling = data.enriching?.status === "queued" || data.enriching?.status === "running";
  const fillIn = () => void act.fillIn({}).then(() => toast({ message: "Filling in details", icon: "running" }), failed);
  const estimate = findEstimate(data).total;

  // The row under the keyboard's focus, else the pointer.
  const rowAt = (el: Element | null) => {
    const scope = el?.closest("[data-row-scope]");
    const root = listRef.current;
    if (!scope || !root?.contains(scope)) return undefined;
    return rendered[[...root.querySelectorAll("[data-row-scope]")].indexOf(scope)];
  };
  const underHand = () => rowAt(document.activeElement) ?? rowAt(listRef.current?.querySelector("[data-row-scope]:hover") ?? null);
  const rateKey = (c: Company, key: "t" | "m" | "r", where: "row" | "item") => {
    if (c.screened?.employer === false) return;
    if (key === "r") return setWhy({ id: c.id, where: small ? "item" : where });
    const value = key === "t" ? "excited" : "maybe";
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
        const row = underHand();
        const target = row ?? chosen;
        if (!target) return;
        e.preventDefault();
        rateKey(target, key, row ? "row" : "item");
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
    { label: "Find companies", icon: "search", hint: `About ${estimate} Apollo ${estimate === 1 ? "credit" : "credits"}`, detail: WORDS.find.detail, note: WORDS.find.note, onSelect: openFind },
    {
      label: filling ? "Filling in details" : `Fill in details${unfilled.length ? ` for ${unfilled.length}` : ""}`,
      icon: "tryAgain",
      detail: "Reads the website and job board of each company not filled in yet, then how it fits your directions.",
      note: fillNote,
      disabled: filling || unfilled.length === 0,
      reason: filling ? "Running" : "All filled in",
      onSelect: fillIn,
    },
    ...selectEntries(sel, rendered.map((c) => c.id), "companies"),
    "separator",
    { label: "Companies you’d name", icon: "companies", count: data.named.length || undefined, detail: "Lists companies you already want, added to every search.", note: "Free", onSelect: () => setDialog("named") },
    { label: "Seed companies", icon: "companies", count: data.seeds.length || undefined, detail: "Lists companies you’d love to work at, so searches find ones like them.", note: "Free", onSelect: () => setDialog("seeds") },
    { label: "Lens settings", icon: "filter", detail: "Sets how your goals shape searches and what Found shows.", note: "Free", onSelect: () => setDialog("lens") },
    "separator",
    tour.menu,
  ];

  // Everything a company can do, for its ⋯ menu, its row's right-click, and the phone's bar. `where`: the row it's opened
  // from, or the open item, which is where Not for me asks why.
  const itemMenu = (c: Company, where: "row" | "item"): MenuEntry[] => {
    const out = c.screened?.employer === false;
    const kind = asideKind(sets, c.id);
    const watched = (c.rating === "excited" || c.rating === "maybe") && !out;
    return [
      ...(out
        ? []
        : ([
            { label: "Target", keys: "T", checked: c.rating === "excited", onSelect: () => rate(c, c.rating === "excited" ? null : "excited") },
            { label: "Maybe", keys: "M", checked: c.rating === "maybe", onSelect: () => rate(c, c.rating === "maybe" ? null : "maybe") },
            { label: "Not for me", keys: "R", checked: c.rating === "no", onSelect: () => setWhy({ id: c.id, where: small ? "item" : where }) },
            "separator",
          ] satisfies MenuEntry[])),
      ...(c.goals?.level === "doesnt" && kind !== "goals" && c.goals.keep ? [{ label: "Let it be set aside", icon: "setAside" as const, detail: "Moves it back to Doesn’t fit your goals.", note: "Free · Undo with U", onSelect: () => keep(c, false) }] : []),
      ...(kind === "goals" ? [{ label: "Keep anyway", icon: "approve" as const, detail: WORDS.keep.detail, note: WORDS.keep.note, onSelect: () => keep(c, true) }] : []),
      {
        label: "Edit website and job board",
        icon: "edit",
        keys: "E",
        detail: "Opens its website or job board for editing.",
        note: "Free",
        onSelect: () => {
          if (chosen?.id !== c.id) open(c.id);
          setEditing({ id: c.id, field: editFieldFor(c) });
        },
      },
      {
        label: "Check again",
        icon: "tryAgain",
        detail: WORDS.check,
        note: checkNote([c], data.apolloJobs),
        disabled: !c.domain || (out && c.screened?.by === "you") || c.checking,
        reason: c.checking ? "Checking" : !c.domain ? "Add its website first" : "Restore it first",
        onSelect: () => recheck([c.id]),
      },
      ...(c.domain ? [{ label: "Open its website", icon: "openElsewhere" as const, detail: "Opens the company’s site in a new tab.", note: "Free", onSelect: () => window.open(c.websiteUrl ?? `https://${c.domain}`, "_blank", "noopener") }] : []),
      ...(watched ? [{ label: "Open its roles in Pursuits", icon: "pursuits" as const, detail: "Shows its open roles in Pursuits.", note: "Free", onSelect: () => router.push(`/pursuits?company=${c.id}`) }] : []),
      "separator",
      out
        ? { label: "Restore", icon: "undo", detail: WORDS.restore.detail, note: WORDS.restore.note, onSelect: () => employer(c, true) }
        : { label: "Not a place to work", icon: "setAside", detail: WORDS.notEmployer.detail, note: WORDS.notEmployer.note, onSelect: () => employer(c, false) },
    ];
  };

  const commands = useMemo(
    (): Command[] => [
      ...TABS.map((t): Command => ({ id: `companies-${t}`, group: "Companies", label: TAB_LABEL[t], icon: "companies", onSelect: () => set({ tab: t, company: null }) })),
      { id: "companies-find", group: "Companies", label: "Find companies", detail: `About ${estimate} Apollo credits`, icon: "search", onSelect: openFind },
      { id: "companies-fill", group: "Companies", label: "Fill in details", detail: fillNote, icon: "tryAgain", onSelect: () => void act.fillIn({}).catch(failed) },
      { id: "companies-named", group: "Companies", label: "Companies you’d name", icon: "companies", onSelect: () => setDialog("named") },
      { id: "companies-seeds", group: "Companies", label: "Seed companies", icon: "companies", onSelect: () => setDialog("seeds") },
      { id: "companies-lens", group: "Companies", label: "Lens settings", icon: "filter", onSelect: () => setDialog("lens") },
    ],
    [set, estimate, act, setDialog, openFind, fillNote],
  );
  useCommands(commands);

  const chosenIds = [...sel.checked].filter((id) => data.companies.some((c) => c.id === id)) as Company["id"][];
  const chosenCheck = checkNote(
    data.companies.filter((c) => sel.checked.has(c.id)),
    data.apolloJobs,
  );
  const checkAgain = { detail: WORDS.check, note: chosenCheck, reason: chosenIds.length ? undefined : "None selected" };
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
              actions: (
                <Button size="lg" variant="primary" className="flex-1" {...checkAgain} onClick={() => (recheck(chosenIds), sel.done())}>
                  Check again
                </Button>
              ),
            }
          : opened
            ? {
                kind: "actions",
                actions: (
                  <>
                    <Menu label={`More for ${opened.name}`} title={opened.name} items={itemMenu(opened, "item")} trigger={<Button size="lg" iconOnly icon="more" aria-label={`More for ${opened.name}`} />} />
                    {opened.screened?.employer === false ? (
                      <Button size="lg" variant="primary" className="flex-1" detail={WORDS.restore.detail} note={WORDS.restore.note} onClick={() => employer(opened, true)}>
                        Restore
                      </Button>
                    ) : (
                      <>
                        {/* Three ratings fit from 390 wide; narrower, Maybe is in More (where all three are). */}
                        <Button size="lg" className="flex-1" icon={opened.rating === "no" ? "approve" : undefined} detail={WORDS[opened.rating === "no" ? "unrate" : "no"].detail} note={WORDS.no.note} onClick={() => (opened.rating === "no" ? rate(opened, null) : setWhy({ id: opened.id, where: "item" }))}>
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
    const fit = fitOf(c);
    const line =
      tab === "aside"
        ? asideKind(sets, c.id) === "goals"
          ? c.goals?.reason
          : asideKind(sets, c.id) === "no"
            ? (c.ratingReason ?? "No reason given")
            : c.screened?.kind && c.screened.kind[0].toUpperCase() + c.screened.kind.slice(1)
        : (c.details?.summary ?? c.domain ?? "No website yet");
    const tag =
      tab === "found" ? (
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
        selected={!small && chosen?.id === c.id}
        checked={sel.checked.has(c.id)}
        onCheck={(on) => sel.check([c.id], on)}
        selecting={sel.on}
        onOpen={() => open(c.id)}
        actions={
          out
            ? []
            : [
                { label: "Target", keys: "T", detail: WORDS[c.rating === "excited" ? "unrate" : "excited"].detail, note: WORDS.excited.note, onSelect: () => rateKey(c, "t", "row") },
                { label: "Maybe", keys: "M", detail: WORDS[c.rating === "maybe" ? "unrate" : "maybe"].detail, note: WORDS.maybe.note, onSelect: () => rateKey(c, "m", "row") },
                { label: "Not for me", keys: "R", detail: WORDS.no.detail, note: WORDS.no.note, onSelect: () => rateKey(c, "r", "row") },
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
      <FindCompanies data={data} />
    </Popover>
  );

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
                {filtersShown && total > 0 && <FilterBar filters={filters} matches={{ shown: shown.length, total }} onClearAll={() => (setDirection(null), setReason(null))} />}
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
                      {shown.map(row)}
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
          <BulkBar count={chosenIds.length} onDone={sel.done} actions={[{ label: "Check again", primary: true, detail: WORDS.check, note: chosenCheck, onSelect: () => (recheck(chosenIds), sel.done()) }]} />
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
        item={small ? (opened ? item : undefined) : item}
        empty={<EmptyState icon="companies" title="Nothing open">Choose a company to see it here.</EmptyState>}
        back={{ label: TAB_LABEL[tab], onBack: () => open(null) }}
      />
      <NamedDialog data={data} open={dialog === "named"} onOpenChange={(o) => setDialog(o ? "named" : null)} />
      <SeedsDialog data={data} open={dialog === "seeds"} onOpenChange={(o) => setDialog(o ? "seeds" : null)} />
      <LensDialog data={data} open={dialog === "lens"} onOpenChange={(o) => setDialog(o ? "lens" : null)} />
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
