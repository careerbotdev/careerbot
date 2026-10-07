"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { PATHS } from "../../../convex/directionPaths";
import { LIMIT_BUCKETS, type LimitBucket } from "../../../convex/limitBuckets";
import { Button, buttonLook } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { CostEstimate } from "@/components/CostEstimate";
import { EmptyState } from "@/components/EmptyState";
import { Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { List, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, type ScreenSize, useScreenSize } from "@/components/Panes";
import { Properties, Property } from "@/components/Properties";
import { StatusTag } from "@/components/StatusTag";
import { TabPanel, Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { ValueTags } from "@/components/ValueTags";
import { aboutUsd } from "../costs";
import { useBar, useCommands } from "../shell/ShellContext";
import { useTour } from "../shell/useTour";
import { GOALS_TOUR } from "../tours/goals";
import { limitSummary } from "./limitWords";
import { day, dayTime, failed, inlineLink, ItemHead, ItemTop, onItemKey, padOf, Section } from "./ui";

// Goals: the goals story (the one goals narrative) and what reading it produced. The list is the story's versions; the
// item is the story, written and read here (?tab=story), or what it produced (?tab=produced): limits, directions, the
// companies it wants and avoids, and what was rejected, each linking to where it lives. ?version=N shows an earlier
// version, which can be restored as the newest. On a phone the versions are a third tab.

type Items = FunctionReturnType<typeof api.goals.items>;
type Item = Items[number];
type Story = NonNullable<FunctionReturnType<typeof api.narratives.get>>;
type Tab = "story" | "produced" | "versions";

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
// Letters and digits only, so a quote matches its paragraph whatever the quote marks and spacing.
const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const hrefOf = (i: Item) => (i.kind === "limit" ? `/goals/limits?limit=${i.id}` : `/goals/directions?direction=${i.id}`);
const labelOf = (i: Item) => (i.kind === "limit" ? (LIMIT_BUCKETS[i.data.kind as LimitBucket] ?? i.data.label) : i.data.name);

const SAVE_DETAIL = "Saves this as a new version. Earlier versions stay in the list.";
const RESTORE_WORDS = { detail: "Saves this version as the newest. The versions after it stay in the list.", note: "Free · Undo with U" };

export function Goals() {
  const size = useScreenSize();
  const small = size === "small";
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const list = useQuery(api.narratives.list);
  const goalsId = list?.find((n) => n.kind === "goals")?.id;
  const story = useQuery(api.narratives.get, goalsId ? { id: goalsId } : "skip");
  const items = useQuery(api.goals.items);
  const create = useMutation(api.narratives.create);
  const [editing, setEditing] = useState(false);
  const tour = useTour(GOALS_TOUR, !!list && !!items && (!goalsId || !!story));

  const set = useCallback(
    (next: { tab?: Tab | null; version?: number | null }) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) q.set(k, String(v));
        else q.delete(k);
      }
      router.replace(q.toString() ? `${path}?${q}` : path, { scroll: false });
    },
    [params, router, path],
  );

  if (!list || !items || (goalsId && !story)) return null;

  if (!goalsId || !story) {
    const write = () =>
      void create({ kind: "goals", title: "Goals", body: "" }).then(
        () => setEditing(true),
        (e: unknown) => failed(e, "Couldn’t start your goals."),
      );
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PaneHeader title="Goals" />
        <EmptyState icon="goals" title="No goals yet" action={<Button variant="primary" detail="Opens your goals story to write in. Reading it later proposes your limits and directions." note="Free" onClick={write}>Write your goals</Button>}>
          Say what you want next, in your own words: the work, the pay, where, and what to avoid.
        </EmptyState>
      </div>
    );
  }

  const asked = params.get("version");
  const shown = asked ? story.versions.find((v) => v.version === Number(asked)) : undefined;
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "produced" || (tabParam === "versions" && small) ? tabParam : "story";

  const versions = (
    <VersionRows
      story={story}
      shown={shown?.version ?? story.version}
      onOpen={(v) => set({ version: v === story.version ? null : v, ...(small ? { tab: "story" as const } : {}) })}
    />
  );
  const item = (
    <GoalsItem
      key={story.id}
      story={story}
      items={items}
      shown={shown ?? null}
      tab={tab}
      size={size}
      editing={editing && !shown}
      onEditing={setEditing}
      onTab={(t) => set({ tab: t === "story" ? null : t })}
      onVersion={(v) => set({ version: v })}
      versions={small ? versions : null}
      tourMenu={tour.menu}
    />
  );
  if (small) return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{item}</div>;
  const listPane = (
    <div data-tour="goals.versions" className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Goals" />
      <Tabs label="Goals story" value="versions" onValueChange={() => {}} className="px-4" tabs={[{ value: "versions", label: "Versions", count: story.versions.length }]}>
        <TabPanel value="versions" className="overflow-y-auto p-2">
          {versions}
        </TabPanel>
      </Tabs>
    </div>
  );
  return <PaneLayout list={listPane} item={item} />;
}

// The story's versions, newest first: the one shown is selected; an earlier one offers Restore on hover.
function VersionRows({ story, shown, onOpen }: { story: Story; shown: number; onOpen: (version: number) => void }) {
  const restore = useRestore(story);
  return (
    <List label="Versions">
      {story.versions.map((v) => (
        <ListRow
          key={v.version}
          title={`Version ${v.version}`}
          line={`${dayTime(v.at)} · ${words(v.body).toLocaleString("en-US")} words`}
          lead={
            <span className="flex size-7 items-center justify-center rounded-sm border bg-subtle text-body-sm leading-body-sm font-semibold text-muted tabular-nums">
              {v.version}
            </span>
          }
          meta={v.version === story.version ? "Current" : undefined}
          actions={v.version === story.version ? [] : [{ label: "Restore as newest", icon: "undo", detail: RESTORE_WORDS.detail, note: RESTORE_WORDS.note, onSelect: () => restore(v.version) }]}
          selected={v.version === shown}
          onOpen={() => onOpen(v.version)}
        />
      ))}
    </List>
  );
}

// Restores an earlier version as the newest, with Undo (which restores the one that was newest).
function useRestore(story: Story) {
  const restore = useMutation(api.narratives.restore);
  return (version: number) => {
    const was = story.version;
    void restore({ id: story.id, version }).then(
      () => toast({ message: `Restored version ${version} as the newest`, icon: "undo", action: { label: "Undo", key: "U", run: () => void restore({ id: story.id, version: was }).catch((e: unknown) => failed(e)) } }),
      (e: unknown) => failed(e, "Couldn’t restore it."),
    );
  };
}

function GoalsItem({
  story,
  items,
  shown,
  tab,
  size,
  editing,
  onEditing,
  onTab,
  onVersion,
  versions,
  tourMenu,
}: {
  story: Story;
  items: Items;
  shown: Story["versions"][number] | null;
  tab: Tab;
  size: ScreenSize;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onTab: (tab: Tab) => void;
  onVersion: (version: number | null) => void;
  versions: ReactNode;
  tourMenu: MenuEntry;
}) {
  const small = size === "small";
  const save = useMutation(api.narratives.save);
  const read = useMutation(api.goals.start);
  const last = useQuery(api.goals.lastRead);
  const costs = useQuery(api.estimates.costs, {});
  const restore = useRestore(story);
  const router = useRouter();
  const [draft, setDraft] = useState(story.body);
  const [saving, setSaving] = useState(false);
  const dirty = editing && draft !== story.body;
  const reading = last?.status === "queued" || last?.status === "running";
  const cost = aboutUsd(costs?.goals);
  const produced = useProduced(story.id, items);
  const current = story.versions[0];

  const startEdit = () => {
    setDraft(story.body);
    onVersion(null);
    onTab("story");
    onEditing(true);
  };
  const done = () => {
    if (!dirty) return onEditing(false);
    setSaving(true);
    void save({ id: story.id, title: story.title, body: draft })
      .then(() => onEditing(false), (e: unknown) => failed(e, "Couldn’t save your goals."))
      .finally(() => setSaving(false));
  };
  const startRead = () =>
    void read({ narrativeId: story.id }).then(
      () => toast({ message: "Reading your goals", icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start reading."),
    );

  const readReason = reading ? "Reading now" : !story.body.trim() ? "Write your goals first" : dirty ? "Save your changes first" : undefined;
  const readLabel = last ? "Read my goals again" : "Read my goals";
  const readDetail = "Reads this version for your limits and directions. What it proposes waits in Review; what you approved or rejected stays as it is.";
  const readNote = cost ? `${cost}. From your AI budget.` : "Uses your AI budget.";

  const menu: MenuEntry[] = [
    { label: "Edit the story", icon: "edit", keys: "E", detail: "Change your goals story. Saving keeps it as a new version.", note: "Free", onSelect: startEdit, ...(shown ? { disabled: true, reason: "Showing an earlier version" } : {}) },
    { label: readLabel, icon: "tryAgain", hint: cost ?? undefined, detail: readDetail, note: readNote, onSelect: startRead, ...(readReason ? { disabled: true, reason: readReason } : {}) },
    ...(shown ? [{ label: `Restore version ${shown.version} as newest`, icon: "undo" as const, detail: RESTORE_WORDS.detail, note: RESTORE_WORDS.note, onSelect: () => restore(shown.version) }] : []),
    "separator",
    { label: "Limits", icon: "limits", detail: "Opens the limits read from your goals and the ones you added.", note: "Free", onSelect: () => router.push("/goals/limits") },
    { label: "Directions", icon: "directions", detail: "Opens the kinds of work you’re going for.", note: "Free", onSelect: () => router.push("/goals/directions") },
    tourMenu,
  ];

  useEffect(() => {
    const onKey = onItemKey({
      e: () => !editing && !shown && startEdit(),
      Escape: () => (shown ? onVersion(null) : undefined),
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const commands = useMemo(
    (): Command[] => [
      { id: "goals-edit", group: "Goals", label: "Edit your goals story", icon: "edit", onSelect: startEdit },
      { id: "goals-read", group: "Goals", label: readLabel, icon: "tryAgain", onSelect: startRead },
      { id: "goals-produced", group: "Goals", label: "What your goals produced", icon: "goals", onSelect: () => onTab("produced") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readLabel, story.id, story.body],
  );
  useCommands(commands);

  useBar(
    small
      ? editing
        ? {
            kind: "actions",
            actions: (
              <>
                <Button size="lg" onClick={() => onEditing(false)}>Cancel</Button>
                <Button size="lg" variant="primary" className="flex-1" loading={saving} loadingLabel="Saving" detail={SAVE_DETAIL} note="Free" onClick={done}>Save</Button>
              </>
            ),
          }
        : {
            kind: "actions",
            actions: (
              <>
                <Menu label="More for Goals" title="Goals" items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />
                <Button size="lg" className="flex-1" icon="tryAgain" loading={reading} loadingLabel="Reading" reason={reading ? undefined : readReason} detail={readDetail} note={readNote} onClick={startRead}>
                  {readLabel}
                </Button>
                {cost && <CostEstimate amount={cost} />}
              </>
            ),
          }
      : null,
  );

  const line = shown
    ? `Version ${shown.version} of ${story.version} · saved ${dayTime(shown.at)}`
    : editing
      ? `${dirty ? "Unsaved changes" : `Version ${story.version}`} · editing`
      : current
        ? `Version ${story.version} · ${words(story.body).toLocaleString("en-US")} words · saved ${small ? day(current.at) : dayTime(current.at)}`
        : "Not written yet";

  const tabs = [
    { value: "story", label: "Story" },
    { value: "produced", label: "Produced", count: produced.count || undefined },
    ...(small ? [{ value: "versions", label: "Versions", count: story.versions.length }] : []),
  ];
  const pad = padOf(size);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop small={small} position={null} back={{ label: "More", onBack: () => router.back() }} menu={menu} title="Goals" />
      <ItemHead icon="goals" title="Goals" line={line} size={size}>
        {shown ? (
          <>
            <Button icon="undo" detail={RESTORE_WORDS.detail} note={RESTORE_WORDS.note} onClick={() => restore(shown.version)}>
              Restore as newest
            </Button>
            <Button variant="ghost" keys="Esc" detail="Shows the story as it reads now." note="Free" onClick={() => onVersion(null)}>
              Back to the current version
            </Button>
          </>
        ) : (
          !small && (
            <div data-tour="goals.read" className="flex min-w-0 items-center gap-3">
              <Button icon="tryAgain" loading={reading} loadingLabel="Reading…" reason={reading ? undefined : readReason} detail={readDetail} note={readNote} onClick={startRead}>
                {readLabel}
              </Button>
              {cost && <CostEstimate amount={cost} />}
            </div>
          )
        )}
      </ItemHead>
      {last?.status === "failed" && !shown && (
        <p className={`flex items-start gap-1.5 border-b py-3 text-body-sm leading-body-sm text-text ${pad}`}>
          <Icons.failed aria-hidden className="mt-px shrink-0 text-red" />
          The last read failed: {last.error ?? "try again."}
        </p>
      )}
      <Tabs tabs={tabs} value={tab} onValueChange={(v) => onTab(v as Tab)} label="Goals" inFlow className={`sticky top-0 z-10 bg-surface ${pad}`}>
        <TabPanel value="story">
          <div className="flex min-h-0 flex-1">
            <div data-tour="goals.story" className={`flex min-w-0 flex-1 flex-col gap-3 py-6 ${pad}`}>
              {editing ? (
                <StoryEditor draft={draft} setDraft={setDraft} dirty={dirty} saving={saving} onSave={done} onCancel={() => onEditing(false)} small={small} />
              ) : (
                <StoryText body={shown?.body ?? story.body} produced={shown ? null : produced.byParagraph} onEdit={shown ? null : startEdit} />
              )}
            </div>
            {size === "large" && !editing && <StoryDetails story={story} last={last ?? null} produced={produced} onTab={onTab} className="w-60 shrink-0 self-stretch border-l px-6 py-5" />}
          </div>
        </TabPanel>
        <TabPanel value="produced" className={`py-6 ${pad}`}>
          <Produced produced={produced} size={size} />
        </TabPanel>
        {small && (
          <TabPanel value="versions" className="p-2">
            {versions}
          </TabPanel>
        )}
      </Tabs>
    </div>
  );
}

// The story as written, a paragraph at a time. A paragraph that something was read from shows what on hover or focus,
// each linking to where it lives. Clicking the text edits it.
function StoryText({ body, produced, onEdit }: { body: string; produced: ((paragraph: string) => Item[]) | null; onEdit: (() => void) | null }) {
  const paragraphs = body.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length)
    return (
      <Text muted>
        Nothing written yet.{" "}
        {onEdit && (
          <button type="button" onClick={onEdit} className={`${inlineLink} text-text`}>
            Write your goals
          </button>
        )}
      </Text>
    );
  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      {paragraphs.map((p, i) => {
        const from = produced?.(p) ?? [];
        return (
          <div key={i} className="group/para -mx-2.5 flex flex-col gap-2 rounded-sm px-2.5 py-1 focus-within:bg-steel-subtle focus-within:shadow-[inset_2px_0_0_var(--color-steel)] hover:bg-steel-subtle hover:shadow-[inset_2px_0_0_var(--color-steel)]">
            <p onClick={onEdit ?? undefined} className={`text-body-md leading-title-md text-text ${onEdit ? "cursor-text" : ""}`}>
              {p}
            </p>
            {from.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label leading-label max-md:flex max-md:gap-y-7 md:hidden md:group-focus-within/para:flex md:group-hover/para:flex">
                <span className="font-medium text-muted">Produced</span>
                {from.map((i, n) => (
                  <span key={i.id} className="flex items-center gap-2">
                    {n > 0 && <span className="text-muted">·</span>}
                    <Link href={hrefOf(i)} className={`tap ${inlineLink} font-medium text-text`}>
                      {labelOf(i)}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StoryEditor({ draft, setDraft, dirty, saving, onSave, onCancel, small }: { draft: string; setDraft: (t: string) => void; dirty: boolean; saving: boolean; onSave: () => void; onCancel: () => void; small: boolean }) {
  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      <Textarea
        aria-label="Your goals"
        autoFocus
        rows={16}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="What you want next: the work, the pay, where, and what to avoid."
        status={saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
        count={`${words(draft).toLocaleString("en-US")} words`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape" && !dirty) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      {!small && (
        <div className="flex items-center gap-2">
          <Button variant="primary" keys="⌘↵" loading={saving} loadingLabel="Saving" detail={SAVE_DETAIL} note="Free" onClick={onSave}>
            Save
          </Button>
          <Button keys="Esc" onClick={onCancel} detail={dirty ? "Leaves without saving your changes." : undefined}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// What the story produced: every limit and direction read from it, grouped, with what waits in Review.
type LimitItem = Extract<Item, { kind: "limit" }>;
type DirectionItem = Extract<Item, { kind: "direction" }>;
type Produced = {
  limits: LimitItem[];
  directions: DirectionItem[];
  rejected: Item[];
  // The approved Companies limit read from the story, whose lists show as Companies.
  companies: LimitItem | null;
  waiting: { limits: number; directions: number; parts: number };
  // Proposed parts (positioning, criteria) of an approved direction.
  parts: (d: DirectionItem) => number;
  // What was read from a paragraph of the current version.
  byParagraph: (paragraph: string) => Item[];
  count: number;
};
function useProduced(storyId: Id<"narratives">, items: Items): Produced {
  return useMemo(() => {
    const fromStory = items.filter((i) => i.sources.some((s) => s.narrativeId === storyId));
    const limits = fromStory.filter((i): i is Extract<Item, { kind: "limit" }> => i.kind === "limit" && i.status !== "rejected");
    const directions = fromStory.filter((i): i is Extract<Item, { kind: "direction" }> => i.kind === "direction" && i.status !== "rejected");
    const rejected = fromStory.filter((i) => i.status === "rejected");
    const companies = limits.find((l) => l.data.kind === "companies" && l.status === "approved") ?? null;
    const parts = (d: (typeof directions)[number]) => [d.data.detailStatus, d.data.criteriaStatus].filter((s) => s === "proposed").length;
    const waiting = {
      limits: limits.filter((l) => l.status === "proposed").length,
      directions: directions.filter((d) => d.status === "proposed").length,
      parts: directions.filter((d) => d.status === "approved" && parts(d) > 0).length,
    };
    const byParagraph = (p: string) => {
      const text = squash(p);
      return fromStory.filter((i) => i.status !== "rejected" && i.sources.some((s) => s.narrativeId === storyId && s.quotes.some((q) => squash(q).length > 8 && text.includes(squash(q)))));
    };
    return { limits, directions, rejected, companies, waiting, parts, byParagraph, count: limits.length + directions.length + rejected.length };
  }, [items, storyId]);
}

// "2 limits, 1 direction and positioning and criteria for 5 directions are waiting in Review."
function waitingWords({ limits, directions, parts }: Produced["waiting"]) {
  const bits = [
    limits ? `${limits} ${limits === 1 ? "limit" : "limits"}` : "",
    directions ? `${directions} ${directions === 1 ? "direction" : "directions"}` : "",
    parts ? `positioning and criteria for ${parts} ${parts === 1 ? "direction" : "directions"}` : "",
  ].filter(Boolean);
  if (!bits.length) return null;
  const said = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}`;
  return `${said[0].toUpperCase()}${said.slice(1)} ${limits + directions + parts === 1 && !parts ? "is" : "are"} waiting in Review`;
}

function StoryDetails({ story, last, produced, onTab, className }: { story: Story; last: FunctionReturnType<typeof api.goals.lastRead>; produced: Produced; onTab: (t: Tab) => void; className: string }) {
  const current = story.versions[0];
  const waiting = waitingWords(produced.waiting);
  const approvedLimits = produced.limits.filter((l) => l.status === "approved").length;
  const approvedDirections = produced.directions.filter((d) => d.status === "approved").length;
  return (
    <Properties className={className}>
      <Property label="Version">
        {story.version} of {story.version}
      </Property>
      {current && <Property label="Saved">{dayTime(current.at)}</Property>}
      <Property label="Read">
        {last?.status === "queued" || last?.status === "running" ? "Reading now" : last?.status === "done" ? `${day(last.at)} · version ${last.version}` : last?.status === "paused" ? "Waiting for budget" : "Not read yet"}
      </Property>
      {produced.count > 0 && (
        <Property label="Produced">
          <Link href="/goals/limits" className={`tap ${inlineLink} self-start`}>
            {approvedLimits} {approvedLimits === 1 ? "limit" : "limits"}
          </Link>
          <Link href="/goals/directions" className={`tap ${inlineLink} self-start`}>
            {approvedDirections} {approvedDirections === 1 ? "direction" : "directions"}
          </Link>
          {produced.rejected.length > 0 && (
            <button type="button" onClick={() => onTab("produced")} className={`tap ${inlineLink} self-start text-left`}>
              {produced.rejected.length} rejected
            </button>
          )}
        </Property>
      )}
      {waiting && (
        <Property label="Waiting in Review">
          <Link href="/review" className={`tap ${inlineLink} self-start`}>
            {waiting.replace(/ (is|are) waiting in Review$/, "")}
          </Link>
        </Property>
      )}
    </Properties>
  );
}

function Produced({ produced, size }: { produced: Produced; size: ScreenSize }) {
  const waiting = waitingWords(produced.waiting);
  if (!produced.count)
    return (
      <Text size="sm" muted>
        Nothing yet. Read your goals to propose limits and directions from them.
      </Text>
    );
  const rule = produced.companies?.data.rule ?? {};
  const strs = (k: string) => (Array.isArray(rule[k]) ? (rule[k] as string[]) : []);
  const cap = (s: string) => (s === "ai" ? "AI" : s[0].toUpperCase() + s.slice(1));
  const companyRows = produced.companies
    ? ([
        ["Want", strs("industriesWant").map(cap)],
        ["Avoid", strs("industriesAvoid").map(cap)],
        ["Exclude", strs("exclude")],
        ["Sizes", strs("sizes")],
      ] as const).filter(([, xs]) => xs.length)
    : [];
  const limits = (
    <>
      <Section label="Limits" count={produced.limits.length} extra={<MoreLink href="/goals/limits">Limits</MoreLink>}>
        <Rows>
          {produced.limits.map((l) => (
            <Row key={l.id} href={hrefOf(l)} lane={LIMIT_BUCKETS[l.data.kind as LimitBucket] ?? l.data.label} tag={l.status === "proposed" ? <StatusTag tone="info">To review</StatusTag> : <StatusTag tone="neutral">{l.data.firm === false ? "Preference" : "Firm"}</StatusTag>}>
              {limitSummary(l.data.kind, l.data.rule, l.data.value)}
              {l.data.appliesTo?.length ? <span className="text-muted"> · {l.data.appliesTo.join(", ")}</span> : null}
            </Row>
          ))}
        </Rows>
      </Section>
      {produced.rejected.length > 0 && (
        <Section label="Rejected" count={produced.rejected.length}>
          <Rows>
            {produced.rejected.map((i) => (
              <Row key={i.id} href={hrefOf(i)} lane={i.kind === "limit" ? (LIMIT_BUCKETS[i.data.kind as LimitBucket] ?? "Limit") : "Direction"}>
                <span className="font-medium">{i.kind === "limit" ? i.data.label : i.data.name}</span>
                <span className="text-muted">{i.kind === "limit" ? i.data.value : i.data.summary}</span>
                {i.data.rejectedBecause && <span>Why: {i.data.rejectedBecause}</span>}
              </Row>
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
  const directions = (
    <>
      <Section label="Directions" count={produced.directions.length} extra={<MoreLink href="/goals/directions">Directions</MoreLink>}>
        <Rows>
          {produced.directions.map((d) => {
            const n = produced.parts(d);
            return (
              <Row
                key={d.id}
                href={hrefOf(d)}
                lane={d.data.path ? PATHS[d.data.path] : ""}
                tag={d.status === "proposed" ? <StatusTag tone="info">To review</StatusTag> : n > 0 ? <StatusTag tone="info">{n} to review</StatusTag> : undefined}
              >
                {d.data.addsTo ? `Adds ${(d.data.includes ?? []).join(", ")} to ${d.data.name}` : d.data.name}
              </Row>
            );
          })}
        </Rows>
      </Section>
      {produced.companies && companyRows.length > 0 && (
        <Section label="Companies" extra={<MoreLink href={hrefOf(produced.companies)}>Companies limit</MoreLink>}>
          <Rows>
            {companyRows.map(([label, xs]) => (
              <li key={label} className="flex gap-4 border-t py-2.5 text-body-sm leading-body-sm max-md:flex-col max-md:gap-1.5">
                <span className="w-24 shrink-0 text-muted">{label}</span>
                <ValueTags items={xs} label={`Companies: ${label}`} className="min-w-0 flex-1" />
              </li>
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      {waiting && (
        <div className="flex items-center gap-3 rounded-sm border px-4 py-2.5 max-md:flex-col max-md:items-start">
          <Icons.review aria-hidden className="shrink-0 text-text max-md:hidden" />
          <span className="min-w-0 flex-1 text-body-sm leading-body-sm text-text">{waiting}</span>
          <Link href="/review" className={buttonLook("secondary", "", "sm")}>
            Open in Review
          </Link>
        </div>
      )}
      {size === "large" ? (
        <div className="grid grid-cols-2 gap-8">
          <div className="flex min-w-0 flex-col gap-7">{limits}</div>
          <div className="flex min-w-0 flex-col gap-7">{directions}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {limits}
          {directions}
        </div>
      )}
    </div>
  );
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 rounded-sm text-label leading-label font-medium text-muted transition-colors duration-100 hover:text-text">
      {children}
      <Icons.goIn aria-hidden size={14} />
    </Link>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col">{children}</ul>;
}

// One thing it produced: its kind or path in a fixed lane, what it is, and its state at the right; the row opens it.
function Row({ href, lane, tag, children }: { href: string; lane: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <li className="border-t">
      <Link href={href} className="-mx-2 flex gap-4 rounded-sm px-2 py-2.5 text-body-sm leading-body-sm transition-colors duration-100 hover:bg-subtle max-md:min-h-11">
        <span className="w-24 shrink-0 text-muted">{lane}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-text">{children}</span>
        {tag && <span className="flex shrink-0 items-start">{tag}</span>}
      </Link>
    </li>
  );
}
