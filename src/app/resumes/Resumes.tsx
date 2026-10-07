"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import type { MenuEntry } from "@/components/Menu";
import { PaneLayout, type ThirdPane, useScreenSize } from "@/components/Panes";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../costs";
import { useCommands } from "../shell/ShellContext";
import { useTour } from "../shell/useTour";
import { RESUMES_TOUR } from "../tours/resumes";
import { HistoryPane } from "./History";
import { LayoutPane } from "./Layout";
import { type ItemView, type Pane, PostingPane, ResumeItem, TailoredItem, useCosts } from "./ResumeItem";
import { ResumesList, type Tab } from "./ResumesList";
import { EXPLAIN, type Overview, type Row, type TailoredRow, resumeHref, tailoredName, toUpdate } from "./words";

// Resumes: the base resume, one per direction and every tailored one, as a list and the one open beside it
// (?resume= "base", a direction's id, or a tailored resume's id; ?tab=update for the ones to update). Layout, History
// and a tailored resume's Posting open as a third pane. J and K move through the list, Esc closes what's open. On a
// phone the list comes first and a resume opens full screen with a way back.

const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t start.", icon: "failed" });
const typing = (e: KeyboardEvent) => !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

type Found = { kind: "row"; row: Row } | { kind: "tailored"; row: TailoredRow };
const find = (o: Overview, key: string | null): Found | null => {
  if (!key) return null;
  const row = [o.base, ...o.directions].find((r) => r.key === key);
  if (row) return { kind: "row", row };
  const t = o.tailored.find((x) => x.id === key);
  return t ? { kind: "tailored", row: t } : null;
};

export function Resumes() {
  const params = useSearchParams();
  const router = useRouter();
  const size = useScreenSize();
  const small = size === "small";
  const overview = useQuery(api.resume.overview);
  const contact = useQuery(api.profile.get);
  const costs = useCosts();
  const start = useMutation(api.resume.start);
  const updateAll = useMutation(api.resume.updateAll);
  const tab: Tab = params.get("tab") === "update" ? "update" : "all";
  const selected = params.get("resume") ?? (small ? null : "base");
  const [views, setViews] = useState<Record<string, ItemView>>({});
  const found = overview ? find(overview, selected) : null;
  const view: ItemView = (selected && views[selected]) || { pane: found?.kind === "tailored" && size === "large" ? "posting" : null, viewing: null, compare: null };
  const setView = (v: Partial<ItemView>) => {
    if (selected) setViews((all) => ({ ...all, [selected]: { ...view, ...v } }));
  };

  const go = useCallback(
    (change: { resume?: string | null; tab?: Tab }) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(change)) {
        if (v === null || v === undefined || (k === "tab" && v === "all")) next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      router.push(q ? `/resumes?${q}` : "/resumes", { scroll: false });
    },
    [params, router],
  );

  // What J and K move through: the rows as listed.
  const entries = useMemo(() => {
    if (!overview) return [];
    const rows = [overview.base, ...overview.directions];
    return tab === "update" ? rows.filter(toUpdate).map((r) => r.key) : [...rows.map((r) => r.key), ...overview.tailored.map((t) => t.id as string)];
  }, [overview, tab]);
  const at = selected ? entries.indexOf(selected) : -1;
  const move = useCallback(
    (by: number) => {
      if (!entries.length) return;
      const next = entries[Math.min(entries.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
      if (next) go({ resume: next });
    },
    [entries, at, go],
  );

  // Bound again each render, so the keys always act on what's shown now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") move(key === "j" ? 1 : -1);
      else if (key === "Escape") {
        if (view.pane) setView({ pane: null });
        else if (view.viewing) setView({ viewing: null });
        else if (view.compare && view.compare !== "closed") setView({ compare: "closed" });
        else if (small && selected) go({ resume: null });
        else return;
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const writeFirst = (r: Row) => void start(r.directionId ? { directionId: r.directionId } : {}).then((jobId) => toast(jobId ? { message: `Writing your ${r.directionId ? `${r.name} resume` : "base resume"}`, icon: "running" } : { message: "A resume is being written. Try again when it’s done.", icon: "failed" }), failed);
  const due = overview ? [overview.base, ...overview.directions].filter((r) => toUpdate(r) && r.state !== "review") : [];
  const costOf = (r: Row) => (r.directionId ? costs.directionResume : costs.resume);
  const usd = useQuery(api.estimates.costs, {});
  const allAmount = due.length ? aboutUsd(due.reduce((sum, r) => sum + ((r.directionId ? usd?.directionResume : usd?.resume) ?? 0), 0) || null) : null;
  const runAll = () => void updateAll({}).then((n) => toast({ message: n ? `Writing ${n} new ${n === 1 ? "version" : "versions"} to keep or discard` : "Nothing to update", icon: n ? "running" : "done" }), failed);

  const commands = useMemo(
    (): Command[] =>
      overview
        ? [
            ...[overview.base, ...overview.directions].map((r): Command => ({ id: `resume-${r.key}`, group: "Resumes", label: r.directionId ? `${r.name} resume` : "Base resume", icon: "resumes", onSelect: () => go({ resume: r.key }) })),
            ...overview.tailored.map((t): Command => ({ id: `resume-${t.id}`, group: "Resumes", label: `${tailoredName(t)} resume`, icon: "resumes", onSelect: () => go({ resume: t.id }) })),
            { id: "resumes-update", group: "Resumes", label: "Resumes to update", icon: "tryAgain", onSelect: () => go({ tab: "update" }) },
          ]
        : [],
    [overview, go],
  );
  useCommands(commands);
  const tour = useTour(RESUMES_TOUR, !!overview);

  if (!overview) return null;
  const listMenu: MenuEntry[] = [
    { label: "Update all", icon: "tryAgain", hint: allAmount ?? undefined, detail: EXPLAIN.updateAll, note: allAmount ?? "Uses your AI budget", onSelect: runAll, ...(due.length ? {} : { disabled: true, reason: "Every resume is up to date" }) },
    { label: "Resumes to update", icon: "filter", detail: "Shows the resumes your record has changed under, or with a new version waiting.", note: "Free", onSelect: () => go({ tab: "update" }) },
    "separator",
    tour.menu,
  ];
  const menuFor = (key: string): MenuEntry[] => {
    const f = find(overview, key);
    if (!f) return [];
    if (f.kind === "tailored") return [{ label: "Open", icon: "goIn", detail: EXPLAIN.open, note: "Free", onSelect: () => go({ resume: key }) }];
    const r = f.row;
    return [
      { label: "Open", icon: "goIn", detail: EXPLAIN.open, note: "Free", onSelect: () => go({ resume: key }) },
      ...(r.state === "notWritten" ? [{ label: "Write", icon: "add" as const, hint: costOf(r), detail: EXPLAIN.write(r), note: costOf(r), onSelect: () => writeFirst(r), ...(r.blocked ? { disabled: true, reason: r.blocked } : {}) }] : []),
      ...(r.directionId ? [{ label: `Open ${r.name} in Goals`, icon: "directions" as const, detail: EXPLAIN.inGoals, note: "Free", onSelect: () => router.push(`/goals/directions?direction=${r.directionId}`) }] : []),
    ];
  };

  const list = (
    <ResumesList
      overview={overview}
      tab={tab}
      onTab={(t) => go({ tab: t })}
      selected={selected}
      onOpen={(key) => go({ resume: key })}
      write={{ amount: costOf, run: writeFirst }}
      menuFor={menuFor}
      menu={listMenu}
      updateAll={{ amount: allAmount, run: runAll, busy: due.length > 0 && due.every((r) => r.writing) }}
    />
  );
  const nav = { at: at + 1, of: entries.length, onMove: move, back: { label: "Resumes", onBack: () => go({ resume: null }) } };
  const item = found ? (
    found.kind === "row" ? (
      <ResumeItem key={found.row.key} row={found.row} overview={overview} view={view} setView={setView} nav={nav} small={small} contact={contact ?? null} />
    ) : (
      <TailoredItem key={found.row.id} row={found.row} view={view} setView={setView} nav={nav} small={small} contact={contact ?? null} />
    )
  ) : selected ? (
    <EmptyState icon="resumes" title="Not found">
      This resume isn’t here any more. <a href={resumeHref("base")}>Open the base resume</a>.
    </EmptyState>
  ) : undefined;
  const third: ThirdPane | undefined =
    found && view.pane
      ? {
          title: { layout: "Layout", history: "History", posting: "Posting" }[view.pane],
          open: true,
          onOpenChange: (o) => !o && setView({ pane: null }),
          children: <Third found={found} pane={view.pane} viewing={view.viewing} onView={(viewing) => setView({ viewing, compare: null })} />,
        }
      : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={list} item={item} third={third} />
    </div>
  );
}

// What the third pane shows for the resume open.
function Third({ found, pane, viewing, onView }: { found: Found; pane: Pane; viewing: Id<"resumes"> | null; onView: (id: Id<"resumes"> | null) => void }) {
  const directionId = found.kind === "tailored" ? found.row.directionId : (found.row.directionId ?? undefined);
  const data = useQuery(api.resume.list, directionId ? { directionId } : {});
  if (!data) return null;
  if (found.kind === "tailored") {
    const t = data.tailored.find((x) => x.id === found.row.id);
    if (pane === "posting") return <PostingPane row={found.row} data={data} />;
    if (!t?.doc) return null;
    return (
      <LayoutPane
        id={t.id}
        doc={t.doc}
        settings={data.settings}
        layout={t.layout}
        titles={{ suggested: data.titles.suggested, direction: data.titles.direction, posting: t.postingTitles }}
        level="tailored"
        directionId={found.row.directionId}
        length={null}
      />
    );
  }
  const current = data.versions[0];
  if (pane === "history") return <HistoryPane directionId={found.row.directionId} facts={data.facts} viewing={viewing} onView={onView} />;
  if (!current?.doc) return null;
  return (
    <LayoutPane
      id={current.id}
      doc={current.doc}
      settings={data.settings}
      layout={current.layout}
      titles={data.titles}
      level={found.row.directionId ? "direction" : "base"}
      directionId={found.row.directionId}
      length={data.length}
    />
  );
}
