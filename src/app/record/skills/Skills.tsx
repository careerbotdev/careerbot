"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BulkBar } from "@/components/BulkBar";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { FilterOptions } from "@/components/FilterBar";
import type { MenuEntry } from "@/components/Menu";
import { PaneLayout, type ThirdPane, useScreenSize } from "@/components/Panes";
import { toast } from "@/components/Toast";
import { selectEntries, useSelection } from "@/components/useSelection";
import { aboutUsd } from "../../costs";
import { useBar, useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { RECORD_TOUR } from "../../tours/record";
import { useSkillActions } from "./actions";
import { Item, ResumePreview, ResumeTag } from "./Item";
import { Selection } from "./Selection";
import { GatherLine, OnlyOne, type RowGroup, SkillRows, SkillsList } from "./SkillsList";
import { APPROVES, EDITS, FREE_UNDO, GATHERS_AGAIN, groupOf, KEEPS_BOTH, KIND_OPTIONS, KINDS, type Kind, LEAVES_OUT, NO_GROUP, plural, REJECTS, REOPENS, SHOWS, type Skill, type Tab, TAB_LABELS, UNAPPROVES, WHY } from "./words";

// Skills, Tools and Certifications: one screen per kind (the route says which), each a list of what's proposed,
// approved or rejected, by group, and the one open beside it (?item=; one of another kind opens on its own route).
// Proposed ones are reviewed one at a time (Approve A, Edit E, Reject R with why; Merge M or Keep both for a
// near-duplicate) or several at once from the bulk bar. J and K move through the list, Esc closes what's open. Gather
// again reads the record for new ones. On a phone the list comes first and an item opens full screen with a way back.

const TABS: Tab[] = ["proposed", "approved", "rejected"];
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));
const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t start.", icon: "failed" });

export function Skills({ kind }: { kind: Kind }) {
  const params = useSearchParams();
  const router = useRouter();
  const size = useScreenSize();
  const small = size === "small";
  const large = size === "large";
  const words = KINDS[kind];
  const data = useQuery(api.skills.list);
  const presentation = useQuery(api.resume.presentation);
  const costs = useQuery(api.estimates.costs, {});
  const tour = useTour(RECORD_TOUR, data !== undefined);
  const start = useMutation(api.skills.start);
  const act = useSkillActions();
  const open = params.get("item");
  const onResumes = useQuery(api.skills.onResumes, open ? { id: open as Id<"items"> } : "skip");
  const [filter, setFilter] = useState<string | null>(null);
  const sel = useSelection();
  const checked = sel.checked;
  const [rowWhy, setRowWhy] = useState<string | null>(null);
  const [bulkWhy, setBulkWhy] = useState(false);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [third, setThird] = useState<{ item: string; key: string } | null>(null);
  const asked = useRef(false);

  const all = useMemo(() => (data?.items ?? []).filter((s) => s.kind === kind), [data, kind]);
  const openItem = data?.items.find((s) => s.id === open);
  const leftOut = useMemo(() => new Set((presentation?.skills ?? []).filter((k) => k.hidden).map((k) => k.key)), [presentation]);
  const counts = { proposed: 0, approved: 0, rejected: 0 } as Record<Tab, number>;
  for (const s of all) if (s.status in counts) counts[s.status as Tab]++;
  const asked_tab = params.get("tab") as Tab | null;
  const tab: Tab = TABS.find((t) => t === asked_tab) ?? (openItem?.kind === kind && TABS.includes(openItem.status as Tab) ? (openItem.status as Tab) : counts.proposed || !counts.approved ? "proposed" : "approved");
  const certs = kind === "certification";
  const filterOf = (s: Skill) => (certs ? (s.issuer ?? "No issuer") : groupOf(s));
  const groups = useMemo(() => [...new Set((data?.items ?? []).flatMap((s) => (s.group ? [s.group] : [])))].sort((a, b) => a.localeCompare(b)), [data]);

  // The rows as shown: this tab, the filter, by group (groups A to Z, "No group" last), oldest first inside each.
  const inTab = all.filter((s) => s.status === tab);
  const shown = inTab.filter((s) => !filter || filterOf(s) === filter);
  const by = new Map<string, Skill[]>();
  for (const s of shown) by.set(groupOf(s), [...(by.get(groupOf(s)) ?? []), s]);
  const rowGroups: RowGroup[] = [...by.entries()].sort(([a], [b]) => (a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b))).map(([label, rows]) => ({ label, rows }));
  const entries = certs ? shown : rowGroups.flatMap((g) => g.rows);
  const at = entries.findIndex((s) => s.id === open);

  // Another kind's item opens on its own route.
  useEffect(() => {
    if (openItem && openItem.kind !== kind) router.replace(`${KINDS[openItem.kind].route}?item=${openItem.id}`, { scroll: false });
  }, [openItem, kind, router]);

  const go = (change: { item?: string | null; tab?: Tab | null }) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.push(`${words.route}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const openRow = (id: string) => go({ item: id });
  const close = () => go({ item: null });
  const move = (by: number) => {
    if (!entries.length) return;
    const next = entries[Math.min(entries.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
    if (next) openRow(next.id);
  };
  // After a decision on the open one, the next opens (the one before it at the end of the list).
  const moveOn = (s: Skill) => {
    if (s.id !== open) return;
    const next = entries[at + 1] ?? entries[at - 1];
    if (next) openRow(next.id);
    else close();
  };
  const setTab = (t: Tab) => {
    sel.done();
    const next = new URLSearchParams(params.toString());
    next.set("tab", t);
    next.delete("item");
    router.replace(`${words.route}?${next.toString()}`, { scroll: false });
  };

  const busy = data?.last?.status === "queued" || data?.last?.status === "running";
  const cost = aboutUsd(costs?.skills) ?? "Uses your AI budget";
  const gather = () =>
    void start({}).then(() => {
      asked.current = true;
      toast({ message: "Gathering skills, tools and certifications", icon: "running" });
    }, failed);
  // What gathering found, once it's done.
  const last = data?.last;
  useEffect(() => {
    if (!asked.current || !last || last.status === "queued" || last.status === "running") return;
    asked.current = false;
    if (last.status === "failed") toast({ message: "Gathering didn’t finish. Try again from the list.", icon: "failed" });
    else toast({ message: last.added ? `Gathered again · ${plural(last.added, "new one")} to review` : "Gathered again · nothing new this time", icon: "done" });
  }, [last]);

  const chosen = all.filter((s) => checked.has(s.id));
  const clear = () => {
    sel.done();
    setBulkWhy(false);
  };
  const bulkApprove = () => {
    act.approve(chosen);
    clear();
  };
  const bulkReject = (reason?: string) => {
    act.reject(chosen, reason);
    clear();
  };

  const menuFor = (s: Skill, h: { edit?: () => void; reject?: () => void; keepBoth?: () => void }): MenuEntry[] => {
    if (s.status === "rejected") return [{ label: "Reopen", icon: "undo", hint: "Free", detail: REOPENS, note: FREE_UNDO, onSelect: () => act.reopen(s) }];
    const out = leftOut.has(s.id);
    return [
      ...(s.status === "proposed" && !s.sameAs
        ? [
            {
              label: "Approve",
              icon: "approve" as const,
              keys: "A",
              hint: "Free",
              detail: APPROVES(s.kind),
              note: FREE_UNDO,
              onSelect: () => {
                moveOn(s);
                act.approve([s]);
              },
            },
          ]
        : []),
      ...(h.edit ? [{ label: "Edit", icon: "edit" as const, keys: "E", detail: EDITS, note: "Free", onSelect: h.edit }] : []),
      ...(s.status === "approved"
        ? [{ label: out ? "Show on resumes" : "Leave out of resumes", icon: out ? ("approve" as const) : ("setAside" as const), hint: "Free", detail: out ? SHOWS() : LEAVES_OUT(), note: FREE_UNDO, onSelect: () => act.setLeftOut([s], !out, () => out) }]
        : []),
      {
        label: "Group",
        items: [
          ...groups.map((g) => ({ label: g, checked: s.group === g, onSelect: () => act.regroup([s], g) })),
          ...(groups.length ? ["separator" as const] : []),
          { label: "No group", checked: !s.group, onSelect: () => act.regroup([s], "") },
        ],
      },
      {
        label: "Kind",
        items: KIND_OPTIONS.map((k) => ({
          label: k.label,
          checked: s.kind === k.value,
          onSelect: () => {
            if (s.kind === k.value) return;
            moveOn(s);
            act.rekind(s, k.value);
          },
        })),
      },
      "separator",
      s.status === "approved"
        ? { label: "Undo approval", icon: "undo", hint: "Free", detail: UNAPPROVES(s.kind), note: FREE_UNDO, onSelect: () => act.unapprove([s]) }
        : s.sameAs && h.keepBoth
          ? { label: "Keep both", icon: "reject", keys: "R", detail: KEEPS_BOTH, note: WHY, onSelect: h.keepBoth }
          : { label: "Reject", icon: "reject", keys: "R", detail: REJECTS(s.kind), note: WHY, onSelect: h.reject },
    ];
  };
  const rowMenu = (s: Skill) =>
    menuFor(s, {
      edit: () => {
        setEditFor(s.id);
        openRow(s.id);
      },
      reject: () => setRowWhy(s.id),
    });

  const listMenu: MenuEntry[] = [
    { label: "Gather again", icon: "tryAgain", hint: cost, detail: GATHERS_AGAIN, note: cost, onSelect: gather, ...(busy ? { disabled: true, reason: "Gathering now" } : {}) },
    ...(tab !== "rejected" ? selectEntries(sel, shown.map((s) => s.id), words.lowerMany) : []),
    "separator",
    tour.menu,
  ];
  const bulkMore: MenuEntry[] = [
    {
      label: "Group",
      items: [
        ...groups.map((g) => ({ label: g, detail: `Moves ${checked.size === 1 ? "it" : "them"} into ${g}.`, note: FREE_UNDO, onSelect: () => act.regroup(chosen, g) })),
        ...(groups.length ? ["separator" as const] : []),
        { label: "No group", detail: `Takes ${checked.size === 1 ? "it" : "them"} out of ${checked.size === 1 ? "its group" : "their groups"}.`, note: FREE_UNDO, onSelect: () => act.regroup(chosen, "") },
      ],
    },
    ...(tab === "approved"
      ? [
          { label: "Leave out of resumes", icon: "setAside" as const, detail: LEAVES_OUT(checked.size), note: FREE_UNDO, onSelect: () => act.setLeftOut(chosen, true, (s) => leftOut.has(s.id)) },
          { label: "Show on resumes", icon: "approve" as const, detail: SHOWS(checked.size), note: FREE_UNDO, onSelect: () => act.setLeftOut(chosen, false, (s) => leftOut.has(s.id)) },
        ]
      : []),
    ...(shown.length > checked.size ? [{ label: `Select all ${shown.length}`, detail: "Checks every row shown.", note: "Free", onSelect: () => sel.check(shown.map((s) => s.id), true) }] : []),
  ];

  // J/K, Esc; and while selecting, A approves the checked rows and R asks why before rejecting them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((key === "j" || key === "k") && !sel.on) {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "Escape") {
        if (third) setThird(null);
        else if (sel.on) clear();
        else if (open) close();
        else return;
        e.preventDefault();
      } else if (checked.size && !bulkWhy && tab === "proposed" && (key === "a" || key === "r")) {
        e.preventDefault();
        if (key === "a") bulkApprove();
        else setBulkWhy(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const commands = useMemo(
    (): Command[] => [
      ...TABS.filter((t) => t !== "rejected" || counts.rejected).map((t): Command => ({ id: `skills-${kind}-${t}`, group: words.many, label: `${words.many}: ${TAB_LABELS[t]}`, icon: words.icon, onSelect: () => setTab(t) })),
      { id: `skills-${kind}-gather`, group: words.many, label: "Gather skills, tools and certifications again", detail: cost, icon: "tryAgain", onSelect: gather },
      { id: `skills-${kind}-select`, group: words.many, label: `Select ${words.lowerMany}`, icon: "select", onSelect: sel.start },
      ...(Object.keys(KINDS) as Kind[]).filter((k) => k !== kind).map((k): Command => ({ id: `skills-go-${k}`, group: "Record", label: KINDS[k].many, icon: KINDS[k].icon, onSelect: () => router.push(KINDS[k].route) })),
      ...(openItem && openItem.kind === kind
        ? openItem.status === "proposed" && !openItem.sameAs
          ? [{ id: "skills-approve", group: openItem.name, label: `Approve ${openItem.name}`, icon: "approve" as const, keys: "A", onSelect: () => (moveOn(openItem), act.approve([openItem])) }]
          : openItem.status === "approved"
            ? [
                { id: "skills-unapprove", group: openItem.name, label: `Undo approval of ${openItem.name}`, icon: "undo" as const, onSelect: () => act.unapprove([openItem]) },
                {
                  id: "skills-leave-out",
                  group: openItem.name,
                  label: leftOut.has(openItem.id) ? `Show ${openItem.name} on resumes` : `Leave ${openItem.name} out of resumes`,
                  icon: "setAside" as const,
                  onSelect: () => act.setLeftOut([openItem], !leftOut.has(openItem.id), () => leftOut.has(openItem.id)),
                },
              ]
            : openItem.status === "rejected"
              ? [{ id: "skills-reopen", group: openItem.name, label: `Reopen ${openItem.name}`, icon: "undo" as const, onSelect: () => act.reopen(openItem) }]
              : []
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, openItem, counts.rejected, cost, leftOut],
  );
  useCommands(commands);

  const none = checked.size ? undefined : "None selected";
  useBar(
    small && sel.on && !open
      ? bulkWhy
        ? { kind: "reason", decision: `Reject ${checked.size}`, picks: undefined, onDone: ({ reason }) => bulkReject(reason) }
        : {
            kind: "bulk",
            count: checked.size,
            onDone: clear,
            actions:
              tab === "proposed" ? (
                <>
                  <Button size="lg" className="flex-1" detail={REJECTS(kind, checked.size)} note={WHY} reason={none} onClick={() => setBulkWhy(true)}>
                    Reject
                  </Button>
                  <Button size="lg" variant="primary" className="flex-1" detail={APPROVES(kind, checked.size)} note={FREE_UNDO} reason={none} onClick={bulkApprove}>
                    Approve
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" className="flex-1" detail={LEAVES_OUT(checked.size)} note={FREE_UNDO} reason={none} onClick={() => act.setLeftOut(chosen, true, (s) => leftOut.has(s.id))}>
                    Leave out
                  </Button>
                  <Button size="lg" className="flex-1" detail={UNAPPROVES(kind, checked.size)} note={FREE_UNDO} reason={none} onClick={() => (act.unapprove(chosen), clear())}>
                    Undo approval
                  </Button>
                </>
              ),
          }
      : null,
  );

  if (!data) return null;

  const filterValues = [...new Set(inTab.map(filterOf))].sort((a, b) => a.localeCompare(b));
  const filters = [
    {
      id: "group",
      label: certs ? "Issuer" : "Group",
      value: filter ?? "All",
      onClear: () => setFilter(null),
      editor: (
        <FilterOptions
          label={certs ? "Issuer" : "Group"}
          multiple={false}
          selected={[filter ?? "all"]}
          onChange={([v]) => setFilter(v === "all" ? null : v)}
          options={[{ value: "all", label: "All", count: inTab.length }, ...filterValues.map((g) => ({ value: g, label: g, count: inTab.filter((s) => filterOf(s) === g).length }))]}
        />
      ),
    },
  ];

  const gatherButton = (
    <Button variant="primary" loading={busy} loadingLabel="Gathering" detail="Reads your approved roles, projects and facts for skills, tools and certifications, and proposes each one once." note={cost} onClick={gather}>
      Gather
    </Button>
  );
  let body;
  if (!all.length && !certs)
    body = (
      <EmptyState icon={words.icon} title={`No ${words.lowerMany} yet`} action={gatherButton}>
        Gather to list the {words.lowerMany} your approved roles, projects and facts show.
      </EmptyState>
    );
  else if (!shown.length && tab === "approved" && counts.proposed)
    body = (
      <EmptyState
        icon={words.icon}
        title={`No approved ${words.lowerMany}`}
        action={
          <Button variant="primary" detail={counts.proposed === 1 ? "Opens it to review." : "Opens the first one to review."} note="Free" onClick={() => router.replace(`${words.route}?tab=proposed&item=${all.find((s) => s.status === "proposed")!.id}`, { scroll: false })}>
            {counts.proposed === 1 ? "Review it" : "Review them"}
          </Button>
        }
      >
        {counts.proposed === 1 ? `${all.find((s) => s.status === "proposed")!.name} is waiting in Proposed.` : `${counts.proposed} are waiting in Proposed.`}
      </EmptyState>
    );
  else if (!shown.length && !certs)
    body = (
      <EmptyState icon={words.icon} title={filter ? "None in this group" : tab === "proposed" ? "Nothing to review" : `No ${TAB_LABELS[tab].toLowerCase()} ${words.lowerMany}`}>
        {filter ? "Change or clear the filter." : tab === "proposed" ? `New ${words.lowerMany} show here after you gather again.` : undefined}
      </EmptyState>
    );
  else
    body = (
      <SkillRows
        groups={rowGroups}
        flat={certs}
        open={open}
        onOpen={openRow}
        checked={checked}
        onCheck={tab !== "rejected" ? sel.check : null}
        selecting={sel.on}
        leftOut={leftOut}
        paired={new Set(all.flatMap((s) => (s.status === "proposed" && s.sameAs ? [s.sameAs.id as string] : [])))}
        menuFor={rowMenu}
        onApprove={(s) => {
          moveOn(s);
          act.approve([s]);
        }}
        why={rowWhy}
        onWhy={setRowWhy}
        onReject={(s, reason) => {
          moveOn(s);
          act.reject([s], reason);
        }}
        onReopen={act.reopen}
        after={certs && tab !== "rejected" && counts.proposed + counts.approved <= 1 ? <OnlyOne count={counts.proposed + counts.approved} cost={cost} busy={busy} onGather={gather} /> : undefined}
      />
    );

  const list = (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <SkillsList
        kind={kind}
        small={small}
        tab={tab}
        onTab={setTab}
        counts={counts}
        filters={filters}
        matches={filter ? { shown: shown.length, total: inTab.length } : undefined}
        menu={listMenu}
        status={<GatherLine last={data.last} cost={cost} onGather={gather} />}
      >
        {body}
      </SkillsList>
      {!small && sel.on && (
        <div className="absolute inset-x-2 bottom-2">
          <BulkBar
            count={checked.size}
            onDone={clear}
            actions={
              tab === "proposed"
                ? [
                    { label: "Approve", keys: "A", detail: APPROVES(kind, checked.size), note: FREE_UNDO, onSelect: bulkApprove, primary: true },
                    { label: "Reject", keys: "R", detail: REJECTS(kind, checked.size), note: WHY, onSelect: () => setBulkWhy(true) },
                  ]
                : [{ label: "Undo approval", detail: UNAPPROVES(kind, checked.size), note: FREE_UNDO, onSelect: () => (act.unapprove(chosen), clear()) }]
            }
            more={bulkMore}
          />
        </div>
      )}
    </div>
  );

  const item =
    checked.size > 0 && !small ? (
      <Selection kind={kind} tab={tab} items={chosen} groups={groups} leftOut={leftOut} large={large} why={bulkWhy} onWhyDone={bulkReject} menu={bulkMore} />
    ) : openItem && openItem.kind === kind ? (
      <Item
        key={`${openItem.id}:${editFor === openItem.id}`}
        s={openItem}
        items={data.items}
        groups={groups}
        nav={{ at: at + 1, of: entries.length, onMove: move, back: { label: words.many, onBack: close } }}
        position={openItem.status === "proposed" && at >= 0 ? { index: at + 1, total: entries.length } : null}
        small={small}
        large={large}
        leftOut={leftOut.has(openItem.id)}
        menu={(s, h) => menuFor(s, h)}
        onDone={() => moveOn(openItem)}
        startEditing={editFor === openItem.id}
        onEdited={() => setEditFor(null)}
        resume={third?.item === openItem.id ? third.key : null}
        onResume={(key) => setThird(key ? { item: openItem.id, key } : null)}
      />
    ) : undefined;

  const pane = third && third.item === open ? onResumes?.find((r) => r.key === third.key) : undefined;
  const thirdPane: ThirdPane | undefined =
    pane && openItem
      ? {
          title: pane.name,
          actions: <ResumeTag r={pane} />,
          open: true,
          onOpenChange: (o) => !o && setThird(null),
          children: <ResumePreview s={openItem} r={pane} index={onResumes!.indexOf(pane) + 1} total={onResumes!.length} />,
        }
      : undefined;

  const first = entries[0];
  const empty = (
    <EmptyState
      icon={words.icon}
      title={counts.proposed ? `${plural(counts.proposed, words.lower, words.lowerMany)} to review` : `${plural(counts.approved, words.lower, words.lowerMany)} in your record`}
      action={
        first ? (
          <Button variant={counts.proposed ? "primary" : "secondary"} keys="J" detail={tab === "proposed" ? "Opens the first one to review." : "Opens the first one in the list."} note="Free" onClick={() => openRow(first.id)}>
            {tab === "proposed" ? "Review the first" : "Open the first"}
          </Button>
        ) : undefined
      }
    >
      {counts.proposed ? "Approve the ones that belong on your resumes; reject the rest." : "Resumes list the approved ones you show."}
    </EmptyState>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={list} item={item} empty={empty} third={thirdPane} />
    </div>
  );
}
