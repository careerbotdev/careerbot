"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/icons";
import { List, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, type ThirdPane, useScreenSize } from "@/components/Panes";
import { RejectedRow } from "@/components/RejectedRow";
import { Spinner } from "@/components/Spinner";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { RECORD_TOUR } from "../../tours/record";
import { useRoleNames } from "./Proposals";
import { StoryItem, type Tab, type Third } from "./StoryItem";
import { type Pair, VersionList } from "./Versions";
import { EXPLAIN, when, wordsLabel } from "./words";

// Story: their stories and quick notes in one list (All, Stories, Notes), and the one open beside it (?story=), written
// and read there. The goals story lives in Goals, so its address goes there. N writes a new story and ⇧N a quick note
// while none is open (with one open, N adds a note to it); J and K move through the list, Esc closes what's open. On a
// phone the list comes first and a story opens full screen with a way back.

type Row = FunctionReturnType<typeof api.narratives.list>[number];
type ListTab = "all" | "stories" | "notes";
const LIST_TABS: ListTab[] = ["all", "stories", "notes"];
const TAB_LABELS: Record<ListTab, string> = { all: "All", stories: "Stories", notes: "Notes" };

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

export function Story() {
  const params = useSearchParams();
  const router = useRouter();
  const size = useScreenSize();
  const small = size === "small";
  const list = useQuery(api.narratives.list);
  const sources = useQuery(api.sources.list);
  const create = useMutation(api.narratives.create);
  const roles = useRoleNames();
  const tour = useTour(RECORD_TOUR, list !== undefined);
  const [third, setThird] = useState<{ story: string; pane: Third } | null>(null);
  const [pairs, setPairs] = useState<Record<string, Pair | null>>({});
  const [fresh, setFresh] = useState<string | null>(null);

  const open = params.get("story");
  const listTab: ListTab = LIST_TABS.find((t) => t === params.get("show")) ?? "all";
  const tab: Tab = params.get("tab") === "proposals" ? "proposals" : "story";
  const goals = list?.find((n) => n.kind === "goals");
  // Newest first as they arrive, then kept in place while they work: saving a story doesn't move it up the list.
  const [order, setOrder] = useState<string[]>([]);
  const arrived = (list ?? []).filter((n) => n.kind !== "goals" && !order.includes(n.id)).map((n) => n.id);
  if (arrived.length) setOrder([...arrived, ...order]);
  const rows = useMemo(() => (list ?? []).filter((n) => n.kind !== "goals").sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)), [list, order]);
  const shown = rows.filter((n) => listTab === "all" || (listTab === "notes" ? n.kind === "note" : n.kind === "career"));
  const at = shown.findIndex((n) => n.id === open);

  // The goals story is read and written in Goals.
  useEffect(() => {
    if (goals && open === goals.id) router.replace("/goals");
  }, [goals, open, router]);

  const go = useCallback(
    (change: Record<string, string | null>) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(change)) {
        if (v) q.set(k, v);
        else q.delete(k);
      }
      router.push(q.toString() ? `/record/story?${q}` : "/record/story", { scroll: false });
    },
    [params, router],
  );
  const openStory = useCallback((id: string) => go({ story: id, tab: null }), [go]);
  const close = useCallback(() => go({ story: null, tab: null }), [go]);
  const move = useCallback(
    (by: number) => {
      if (!shown.length) return;
      const next = shown[Math.min(shown.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
      if (next) openStory(next.id);
    },
    [shown, at, openStory],
  );
  const pane = third && third.story === open ? third.pane : null;
  const setPane = useCallback((p: Third) => setThird(p && open ? { story: open, pane: p } : null), [open]);

  const write = useCallback(
    (kind: "career" | "note") =>
      void create({ kind, title: "", body: "" }).then(
        (id) => {
          setFresh(id);
          router.push(`/record/story?${new URLSearchParams({ ...(listTab === "all" ? {} : { show: kind === "note" ? "notes" : "stories" }), story: id })}`, { scroll: false });
        },
        (e: unknown) => failed(e, "Couldn’t start it."),
      ),
    [create, router, listTab],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((key === "j" || key === "k") && !e.shiftKey) {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "n" && !open && !e.repeat) {
        e.preventDefault();
        write(e.shiftKey ? "note" : "career");
      } else if (key === "Escape") {
        if (pane) setThird(null);
        else if (open) close();
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, open, pane, close, write]);

  const setListTab = useCallback((t: ListTab) => router.replace(`/record/story?${new URLSearchParams({ ...(t === "all" ? {} : { show: t }), ...(open ? { story: open } : {}) })}`, { scroll: false }), [router, open]);

  const commands = useMemo(
    (): Command[] => [
      { id: "story-new", group: "Story", label: "New story", icon: "story", keys: open ? undefined : "N", onSelect: () => write("career") },
      { id: "story-note", group: "Story", label: "Quick note", icon: "edit", keys: open ? undefined : "⇧N", onSelect: () => write("note") },
      ...LIST_TABS.map((t): Command => ({ id: `story-tab-${t}`, group: "Story", label: t === "all" ? "All stories and notes" : TAB_LABELS[t], icon: "story", onSelect: () => setListTab(t) })),
      ...rows.map((n): Command => ({ id: `story-open-${n.id}`, group: "Stories", label: n.title, detail: n.kind === "note" ? "Note" : "Story", icon: n.kind === "note" ? "edit" : "story", onSelect: () => openStory(n.id) })),
    ],
    [write, setListTab, rows, openStory, open],
  );
  useCommands(commands);

  if (!list) return null;

  const newMenu: MenuEntry[] = [
    { label: "New story", icon: "story", keys: open || small ? undefined : "N", onSelect: () => write("career"), ...EXPLAIN.newStory },
    { label: "Quick note", icon: "edit", keys: open || small ? undefined : "⇧N", onSelect: () => write("note"), ...EXPLAIN.quickNote },
  ];
  const listMenu: MenuEntry[] = [
    ...newMenu,
    "separator",
    { label: "Goals story", icon: "goals", hint: "In Goals", onSelect: () => router.push("/goals"), detail: "Opens your goals story, which lives in Goals.", note: "Free" },
    "separator",
    tour.menu,
  ];
  const runs = new Map((sources?.narratives ?? []).map((s) => [s.id as string, s]));
  const counts = { all: rows.length, stories: rows.filter((n) => n.kind === "career").length, notes: rows.filter((n) => n.kind === "note").length };
  const empty = rows.length === 0;

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Story"
        actions={
          <>
            <Menu label="New story or note" align="end" items={newMenu} trigger={<Button variant="ghost" iconOnly icon="add" aria-label="New story or note" className="data-[state=open]:bg-border" data-tour="record.new" />} />
            <Menu label="More for Story" items={listMenu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Story" className="data-[state=open]:bg-border data-[state=open]:text-text" data-tour="record.more" />} />
          </>
        }
      />
      {!empty && (
        <div data-tour="record.tabs">
        <Tabs
          label="Stories and notes"
          className="px-4"
          value={listTab}
          onValueChange={(v) => setListTab(v as ListTab)}
          tabs={LIST_TABS.map((t) => ({ value: t, label: TAB_LABELS[t], count: counts[t] }))}
        />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          small && <FirstStory onWrite={() => write("career")} small />
        ) : (
          <List label="Stories and notes" tour="record.list" className="p-2">
            {shown.map((n) => (
              <StoryRow key={n.id} n={n} source={runs.get(n.id)} role={n.roleKey ? roles.get(n.roleKey)?.name : undefined} selected={n.id === open} onOpen={() => openStory(n.id)} />
            ))}
          </List>
        )}
      </div>
    </div>
  );

  const openRow = rows.find((n) => n.id === open);
  const item = openRow ? (
    <StoryItem
      key={openRow.id}
      id={openRow.id}
      size={size}
      nav={{ at: at + 1, of: shown.length, onMove: move, back: { label: "Story", onBack: close } }}
      tab={tab}
      onTab={(t) => go({ tab: t === "story" ? null : t })}
      third={pane}
      onThird={setPane}
      pair={pairs[openRow.id] ?? null}
      onPair={(p) => setPairs((all) => ({ ...all, [openRow.id]: p }))}
      fresh={fresh === openRow.id}
      onDeleted={() => {
        const next = shown[at + 1] ?? shown[at - 1];
        if (next && !small) openStory(next.id);
        else close();
      }}
    />
  ) : undefined;

  const story = openRow?.id;
  const thirdPane: ThirdPane | undefined =
    story && pane === "versions" && !small
        ? {
            title: "Versions",
            open: true,
            onOpenChange: (o) => !o && setThird(null),
            children: (
              <VersionsPane
                id={story}
                pair={pairs[story] ?? null}
                onPair={(p) => {
                  setPairs((all) => ({ ...all, [story]: p }));
                  // In the drawer, picking one shows the comparison behind it.
                  if (p && size === "medium") setThird(null);
                }}
              />
            ),
          }
        : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={listPane} item={item} empty={<FirstStory onWrite={() => write("career")} small={false} empty={empty} />} third={thirdPane} />
    </div>
  );
}

// The versions beside the story: click one to compare it (From) with the one picked as To, Restore on hover.
function VersionsPane({ id, pair, onPair }: { id: Id<"narratives">; pair: Pair | null; onPair: (p: Pair | null) => void }) {
  const story = useQuery(api.narratives.get, { id });
  const restore = useMutation(api.narratives.restore);
  if (!story) return null;
  const shown = pair ?? { from: story.versions[1]?.version ?? story.version, to: story.version };
  return (
    <div className="-mx-2">
      <VersionList
        story={story}
        pair={shown}
        onPick={(v) => onPair(v === shown.to ? { from: shown.from, to: v } : { from: v, to: shown.to })}
        onRestore={(version) => {
          const was = story.version;
          void restore({ id, version }).then(
            (next) => {
              onPair(null);
              toast({ message: `Version ${version} restored as version ${next}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void restore({ id, version: was }) } });
            },
            (e: unknown) => failed(e, "Couldn’t restore it."),
          );
        }}
      />
    </div>
  );
}

type Source = NonNullable<FunctionReturnType<typeof api.sources.list>>["narratives"][number];

// A row: its mark, title, kind and length (or the role a note is on), when it was saved, and how its read stands.
function StoryRow({ n, source, role, selected, onOpen }: { n: Row; source: Source | undefined; role: string | undefined; selected: boolean; onOpen: () => void }) {
  const run = useQuery(api.extract.runFor, n.rejected ? "skip" : { narrativeId: n.id });
  const restore = useMutation(api.sources.restore);
  const reject = useMutation(api.sources.reject);
  const note = n.kind === "note";
  const lead = note ? (
    <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm border bg-subtle text-muted">
      <Icons.edit />
    </span>
  ) : (
    <Avatar name={n.title} company size={28} />
  );
  const line = note ? `Note · ${role ?? wordsLabel(n.words)}` : `Story · version ${n.version} · ${wordsLabel(n.words)}`;
  if (n.rejected)
    return (
      <RejectedRow
        title={n.title}
        line={line}
        lead={lead}
        decision="Rejected"
        reason={n.rejectedBecause ?? undefined}
        selected={selected}
        onOpen={onOpen}
        onRestore={() =>
          void restore({ source: { narrativeId: n.id } }).then(
            () => toast({ message: `Restored ${n.title}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void reject({ source: { narrativeId: n.id } }) } }),
            (e: unknown) => failed(e, "Couldn’t restore it."),
          )
        }
      />
    );
  const status = source?.run?.status ?? run?.status;
  const state =
    status === "queued" || status === "running" ? (
      <span className="flex items-center gap-1.5">
        <Spinner />
        Reading…
      </span>
    ) : status === "paused" ? (
      <span className="text-caution-text">Waiting for budget</span>
    ) : status === "failed" ? (
      <span className="text-text">Couldn’t read</span>
    ) : run !== undefined && n.words > 0 && run?.lastRead !== n.version ? (
      "Not read"
    ) : source?.proposed ? (
      `${source.proposed} in Review`
    ) : null;
  return (
    <ListRow
      title={n.title}
      line={line}
      lead={lead}
      tag={<span className="text-body-sm leading-body-sm whitespace-nowrap text-muted tabular-nums">{when(n.updatedAt)}</span>}
      meta={state ?? undefined}
      selected={selected}
      onOpen={onOpen}
    />
  );
}

// With nothing open: the way to start. A new workspace says what a story is for.
function FirstStory({ onWrite, small, empty = true }: { onWrite: () => void; small: boolean; empty?: boolean }) {
  if (!empty)
    return (
      <EmptyState
        icon="story"
        title="Pick a story"
        action={
          <Button icon="add" keys="N" detail={EXPLAIN.newStory.detail} note={EXPLAIN.newStory.note} onClick={onWrite}>
            New story
          </Button>
        }
      >
        Open one from the list to write or read it.
      </EmptyState>
    );
  return (
    <EmptyState
      icon="story"
      title="Tell your story"
      action={
        <Button variant="primary" keys={small ? undefined : "N"} detail={EXPLAIN.newStory.detail} note={EXPLAIN.newStory.note} onClick={onWrite}>
          Write your first story
        </Button>
      }
    >
      Write about one job or project to start. Any order, rough is fine.
    </EmptyState>
  );
}
