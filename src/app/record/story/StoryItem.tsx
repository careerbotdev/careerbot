"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import type { Command } from "@/components/CommandPalette";
import { CostEstimate } from "@/components/CostEstimate";
import { Dialog } from "@/components/Dialog";
import { Field, Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { Kbd, KeyHint } from "@/components/Kbd";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import { PaneHeader, type ScreenSize } from "@/components/Panes";
import { Properties, Property } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { Select } from "@/components/Select";
import { TabPanel, Tabs } from "@/components/Tabs";
import { addSpoken, DeviceDictation, Listening, LiveText, Saved, TalkButton, TalkStopped, TalkTip, useCanTalk, useDevice, useTalk, useTalkKey } from "@/components/Talk";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { WritingArea } from "@/components/WritingArea";
import { aboutUsd } from "../../costs";
import { useDemo } from "../../demo/demo";
import { useBar, useCommands, useConfirm } from "../../shell/ShellContext";
import { docsHref, STORY_GUIDE } from "../../today/steps";
import { Proposals, type Run, useProposals, useRoleNames } from "./Proposals";
import { Compare, type Pair, type Story, VersionList } from "./Versions";
import { EXPLAIN, when, wordCount, wordsLabel } from "./words";

// One story or quick note, open beside the list: written in place (saved when you leave the text, or with ⌘S; each save
// is a version), or talked in with Talk (⇧T; saved when they stop), read with R (the one Amber action), what the read
// proposed on the Proposals tab, and its details and notes beside it. Versions (⇧V) opens beside it and turns the item
// into the comparison of two versions.

export type Third = "versions" | null;
export type Nav = { at: number; of: number; onMove: (by: number) => void; back: { label: string; onBack: () => void } };
export type Tab = "story" | "proposals";

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : fallback, icon: "failed" });
const busyElsewhere = (e: KeyboardEvent) => !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));
// Quick picks for why a story or note is rejected.
const REJECT_PICKS = ["Not my words", "Covered in another story", "Out of date", "Not accurate"];

type Props = {
  id: Id<"narratives">;
  size: ScreenSize;
  nav: Nav;
  tab: Tab;
  onTab: (t: Tab) => void;
  third: Third;
  onThird: (t: Third) => void;
  pair: Pair | null;
  onPair: (p: Pair | null) => void;
  fresh: boolean;
  onDeleted: () => void;
};

export function StoryItem(props: Props) {
  const story = useQuery(api.narratives.get, { id: props.id });
  const run = useQuery(api.extract.runFor, { narrativeId: props.id });
  if (story === undefined || run === undefined) return null;
  if (story === null) return <p className="p-8 text-body-sm leading-body-sm text-muted">This story isn’t in your record anymore.</p>;
  return <Item {...props} story={story} run={run} />;
}

function Item({ id, size, nav, tab, onTab, third, onThird, pair, onPair, fresh, onDeleted, story, run }: Props & { story: Story; run: Run }) {
  const small = size === "small";
  const note = story.kind === "note";
  const noun = note ? "note" : "story";
  const costs = useQuery(api.estimates.costs, {});
  const roles = useRoleNames();
  const save = useMutation(api.narratives.save);
  const start = useMutation(api.extract.start);
  const readAgain = useMutation(api.sources.readAgain);
  const reject = useMutation(api.sources.reject);
  const restoreSource = useMutation(api.sources.restore);
  const restoreVersion = useMutation(api.narratives.restore);
  const remove = useMutation(api.narratives.remove);
  const link = useMutation(api.narratives.link);
  const ask = useConfirm();

  // The text as written here; `base` is what was last saved, so a restore elsewhere shows unless they're mid-change.
  const [draft, setDraft] = useState({ title: story.title, body: story.body });
  const [base, setBase] = useState({ title: story.title, body: story.body });
  if (base.title !== story.title || base.body !== story.body) {
    setBase({ title: story.title, body: story.body });
    if (draft.title === base.title && draft.body === base.body) setDraft({ title: story.title, body: story.body });
  }
  const dirty = draft.body !== story.body || (draft.title.trim() !== "" && draft.title.trim() !== story.title);
  const [saving, setSaving] = useState(false);
  // In the demo, leaving a field or the story doesn't save: nothing would be kept, and the refusal would show with no
  // click. Save and ⌘S still say why.
  const demo = useDemo();
  const [again, setAgain] = useState(false);
  // Reject… asks why first; the decision and its reason are saved together once they save or skip it.
  const [rejecting, setRejecting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Saves run in order, so a second one while the first is on its way saves what was written since.
  const doSave = () => {
    if (!dirty) return;
    setSaving(true);
    void save({ id, title: draft.title, body: draft.body })
      .then(() => setDraft((d) => (d.title.trim() ? d : { ...d, title: story.title })), (e: unknown) => failed(e, "Couldn’t save it."))
      .finally(() => setSaving(false));
  };

  // Talk: each finished phrase goes into the body; while listening, the words of this time show under what was there
  // (`split`: where they start) and the text above stays editable. Stop saves once the last words are in.
  const canTalk = useCanTalk();
  const device = useDevice();
  const [split, setSplit] = useState<number | null>(null);
  const talk = useTalk({
    onStart: () => setSplit(draft.body.replace(/\s+$/, "").length),
    onWords: (text, first) => setDraft((d) => ({ ...d, body: addSpoken(d.body, text, first) })),
    onStopped: () => {
      setSplit(null);
      doSave();
    },
  });
  const listening = talk.state === "listening";
  // The comparison fills the item: beside the versions on a large screen; on a medium one once a version is picked in
  // the drawer, until Esc or Back to the story.
  const versionsOpen = story.versions.length > 0 && (size === "large" ? third === "versions" : size === "medium" && pair !== null);
  const showWriting = tab === "story" && !versionsOpen;
  useTalkKey(talk, !!canTalk && showWriting);
  const spoken = split === null ? "" : draft.body.slice(split).replace(/^\s+/, "");
  // In the demo nothing saves when they stop, so the label says so.
  const savedLabel = saving ? "Saving…" : dirty ? (demo ? "Not saved in the demo" : "Saves when you stop") : <Saved />;
  // Leaving the story saves what was written.
  const latest = useRef({ dirty, draft, save, id, demo });
  useEffect(() => {
    latest.current = { dirty, draft, save, id, demo };
  });
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.dirty && !l.demo) void l.save({ id: l.id, title: l.draft.title, body: l.draft.body }).catch(() => toast({ message: "Couldn’t save your last changes.", icon: "failed" }));
    },
    [],
  );
  useEffect(() => {
    if (!fresh) return;
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [fresh]);

  const reading = run?.status === "queued" || run?.status === "running";
  const thisVersion = run && run.version === story.version && run.status !== "failed";
  const readVersion = run?.lastRead === story.version;
  const empty = !draft.body.trim();
  const cost = aboutUsd(run?.lastRead ? costs?.readRevision : costs?.read);
  const readReason = story.rejected ? "Restore it first" : empty ? "Write something first" : listening ? "Stop talking first" : dirty ? "Save your changes first" : undefined;
  const readDetail = run?.lastRead
    ? `Reads what changed since version ${run.lastRead} for new facts and updates to the ones already in your record. What it proposes waits in Review.`
    : `Reads this ${noun} for roles, facts and context for your record. What it proposes waits in Review.`;
  const readNote = cost ?? "Uses your AI budget";
  const canRead = !story.rejected && !thisVersion;
  const read = () => {
    if (!canRead || readReason || reading) return;
    void start({ narrativeId: id }).then(
      () => toast({ message: `Reading ${story.title}`, icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start reading."),
    );
  };
  const againReason = story.rejected ? "Restore it first" : reading ? "Reading now" : !readVersion ? "Read this version first" : undefined;
  const againCost = aboutUsd(costs?.read);

  const restore = (version: number) => {
    const was = story.version;
    void restoreVersion({ id, version }).then(
      (next) => {
        onPair(null);
        toast({ message: `Version ${version} restored as version ${next}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void restoreVersion({ id, version: was }).catch((e: unknown) => failed(e, "Couldn’t undo it.")) } });
      },
      (e: unknown) => failed(e, "Couldn’t restore it."),
    );
  };
  const rejectIt = (reason?: string) => {
    setRejecting(false);
    void reject({ source: { narrativeId: id }, reason }).then(
      () =>
        toast({
          message: `Rejected ${story.title}. What came from it is left out of your record.`,
          icon: "reject",
          action: { label: "Undo", key: "U", run: () => void restoreSource({ source: { narrativeId: id } }).catch((e: unknown) => failed(e, "Couldn’t undo it.")) },
        }),
      (e: unknown) => failed(e, "Couldn’t reject it."),
    );
  };
  const restoreIt = () =>
    void restoreSource({ source: { narrativeId: id } }).then(
      () => toast({ message: `Restored ${story.title}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void reject({ source: { narrativeId: id } }).catch((e: unknown) => failed(e, "Couldn’t undo it.")) } }),
      (e: unknown) => failed(e, "Couldn’t restore it."),
    );
  const linkTo = (roleKey: string | null) => {
    const was = story.roleKey;
    if (roleKey === was) return;
    void link({ id, roleKey }).then(
      () =>
        toast({
          message: roleKey ? `Linked to ${roles.get(roleKey)?.name ?? "the role"}` : "Linked to no role",
          icon: "link",
          action: { label: "Undo", key: "U", run: () => void link({ id, roleKey: was }).catch((e: unknown) => failed(e, "Couldn’t undo it.")) },
        }),
      (e: unknown) => failed(e, "Couldn’t link it."),
    );
  };
  const deleteIt = async () => {
    const count = story.versions.length;
    const yes = await ask({
      title: `Delete the ${story.title} ${noun}?`,
      body: `${count === 1 ? "Its one version goes" : `Its ${count} versions go`} with it. The facts it gave your record stay, each marked for you to Keep it or Reject it.`,
      confirmLabel: `Delete ${noun}`,
    });
    if (!yes) return;
    latest.current.dirty = false;
    void remove({ id }).then(
      () => {
        toast({ message: `Deleted the ${story.title} ${noun}`, icon: "delete" });
        onDeleted();
      },
      (e: unknown) => failed(e, "Couldn’t delete it."),
    );
  };
  const toggleVersions = () => {
    setComparing(false);
    onThird(third === "versions" ? null : "versions");
  };

  const roleOptions = [...roles].map(([key, r]) => ({ label: r.title, hint: r.employer, key }));
  const linked = story.roleKey ? roles.get(story.roleKey) : undefined;
  const menu: MenuEntry[] = [
    { label: "Versions", icon: "time", keys: "⇧V", onSelect: toggleVersions, ...EXPLAIN.versions, ...(story.versions.length ? {} : { disabled: true, reason: "Nothing saved yet" }) },
    {
      label: "Link to a role",
      icon: "link",
      hint: linked?.employer || linked?.title,
      items: [
        ...roleOptions.map((r) => ({ label: r.label, hint: r.hint, checked: story.roleKey === r.key, onSelect: () => linkTo(r.key) })),
        "separator" as const,
        { label: "No role", checked: !story.roleKey, onSelect: () => linkTo(null) },
      ],
    },
    "separator",
    {
      label: "Read again…",
      icon: "tryAgain",
      hint: againCost ?? undefined,
      detail: "Asks what it missed, then reads it again against your record as it is now; only what isn’t there yet is proposed.",
      note: againCost ?? "Uses your AI budget",
      onSelect: () => setAgain(true),
      ...(againReason ? { disabled: true, reason: againReason } : {}),
    },
    story.rejected
      ? { label: "Restore", icon: "undo", onSelect: restoreIt, ...EXPLAIN.restore }
      : { label: "Reject…", icon: "reject", onSelect: () => setRejecting(true), detail: `Leaves this ${noun} and what came from it out of your record, with why if you like.`, note: "Free · Undo with U" },
    "separator",
    {
      label: `Delete ${noun}…`,
      icon: "delete",
      tone: "danger",
      onSelect: () => void deleteIt(),
      detail: `Deletes the ${noun} and its versions. The facts it gave your record stay, for you to keep or reject.`,
      note: "Free · Asks first · can’t be undone",
    },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat || busyElsewhere(e)) return;
      if (e.key === "V" && e.shiftKey) {
        e.preventDefault();
        toggleVersions();
      } else if (e.key === "Escape" && versionsOpen && size === "medium") {
        e.preventDefault();
        onPair(null);
      } else if (e.key === "r" && !e.shiftKey && canRead && !small) {
        e.preventDefault();
        read();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const commands = useMemo(
    (): Command[] => [
      ...(canRead ? [{ id: "story-read", group: story.title, label: `Read ${story.title}`, icon: "tryAgain" as const, keys: "R", onSelect: read }] : []),
      { id: "story-save", group: story.title, label: "Save", icon: "done", keys: "⌘S", onSelect: doSave },
      { id: "story-versions", group: story.title, label: "Versions", icon: "time", keys: "⇧V", onSelect: toggleVersions },
      ...(canTalk && !versionsOpen
        ? [listening
            ? { id: "story-talk", group: story.title, label: "Stop talking", icon: "stop" as const, keys: "⇧T", onSelect: talk.stop }
            : {
                id: "story-talk",
                group: story.title,
                label: "Talk",
                icon: "talk" as const,
                keys: "⇧T",
                onSelect: () => {
                  onTab("story");
                  talk.start();
                },
              }]
        : []),
      { id: "story-proposals", group: story.title, label: "What the read proposed", icon: "review", onSelect: () => onTab("proposals") },
      ...(againReason ? [] : [{ id: "story-again", group: story.title, label: "Read again…", icon: "tryAgain" as const, onSelect: () => setAgain(true) }]),
      story.rejected ? { id: "story-restore", group: story.title, label: `Restore ${story.title}`, icon: "undo", onSelect: restoreIt } : { id: "story-reject", group: story.title, label: `Reject ${story.title}…`, icon: "reject", onSelect: () => setRejecting(true) },
      { id: "story-delete", group: story.title, label: `Delete ${noun}…`, icon: "delete", onSelect: () => void deleteIt() },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story, canRead, againReason, dirty, draft, third, canTalk, listening, versionsOpen],
  );
  useCommands(commands);

  const proposals = useProposals(id, run?.lastRead ?? null);
  const phoneVersions = small && third === "versions";
  useBar(
    small && rejecting
      ? { kind: "reason", decision: "Reject", picks: REJECT_PICKS, onDone: ({ reason }) => rejectIt(reason) }
      : small && !phoneVersions
      ? {
          kind: "actions",
          actions: listening ? (
            <Listening talk={talk} saved={savedLabel} look="bar" />
          ) : dirty ? (
            <Button size="lg" variant="primary" className="flex-1" loading={saving} loadingLabel="Saving" detail="Saves what you wrote as a new version." note="Free · Earlier versions stay in Versions" onClick={doSave}>
              Save
            </Button>
          ) : (
            <>
              <Button size="lg" iconOnly icon="time" aria-label="Versions" detail={EXPLAIN.versions.detail} note={EXPLAIN.versions.note} onClick={toggleVersions} />
              {canTalk && showWriting && <TalkButton talk={talk} noun={noun} size="lg" variant="secondary" />}
              <span className="flex-1" />
              {canRead && cost && <CostEstimate amount={cost} />}
              {canRead ? (
                <Button size="lg" variant="primary" className="flex-1" loading={reading} loadingLabel="Reading" reason={reading ? undefined : readReason} detail={readDetail} note={readNote} onClick={read}>
                  Read
                </Button>
              ) : (
                proposals.waiting > 0 && (
                  <Button size="lg" variant="primary" className="flex-1" detail="Shows what the read proposed for your record, to approve or reject." note="Free" onClick={() => onTab("proposals")}>
                    Proposals {proposals.count}
                  </Button>
                )
              )}
            </>
          ),
        }
      : null,
  );

  // The versions on a phone: their own page, and the comparison from there.
  if (phoneVersions) {
    const shownPair = pair ?? { from: story.versions[1]?.version ?? story.version, to: story.version };
    return comparing ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PaneHeader back={{ label: "Versions", onBack: () => setComparing(false) }} />
        <div className="flex flex-col gap-4 px-4 pb-6">
          <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg text-text">{story.title}</h1>
          <Compare story={story} pair={shownPair} onPair={onPair} onRestore={restore} />
        </div>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PaneHeader back={{ label: story.title, onBack: () => onThird(null) }} />
        <h1 className="px-4 pb-3 text-title-lg leading-title-lg font-semibold tracking-title-lg text-text">Versions</h1>
        <div className="px-2">
          <VersionList
            story={story}
            pair={null}
            onPick={(v) => {
              onPair({ from: v, to: story.version });
              setComparing(true);
            }}
            onRestore={restore}
          />
        </div>
      </div>
    );
  }

  const current = story.versions[0];
  const status = saving ? (
    <span className="text-body-sm leading-body-sm text-muted">Saving…</span>
  ) : dirty ? (
    <span className="flex items-center gap-3 text-body-sm leading-body-sm text-muted">
      Unsaved changes
      {!small && (
        <KeyHint keys="⌘S" onClick={doSave}>
          Save
        </KeyHint>
      )}
    </span>
  ) : current ? (
    <span className="flex items-center gap-1.5 text-body-sm leading-body-sm text-muted">
      <Icons.done aria-hidden size={14} />
      {readVersion && run?.lastReadAt ? `Version ${story.version} · read ${when(run.lastReadAt)}` : `Version ${story.version} · saved ${when(current.at)}`}
    </span>
  ) : (
    <span className="text-body-sm leading-body-sm text-muted">Not written yet</span>
  );
  const more = <Menu label={`More for ${story.title}`} title={story.title} items={menu} />;
  const pad = size === "large" ? "px-8" : size === "medium" ? "px-6" : "px-4";
  const shownPair = pair ?? { from: story.versions[1]?.version ?? story.version, to: story.version };

  const top = small ? (
    <PaneHeader back={nav.back} actions={more} />
  ) : (
    <header className={`flex h-[52px] shrink-0 items-center gap-2 pr-3 ${size === "large" ? "pl-8" : "pl-6"}`}>
      {status}
      <span className="flex-1" />
      {nav.at > 0 && (
        <span className="text-body-sm leading-body-sm text-muted tabular-nums">
          {nav.at} of {nav.of}
        </span>
      )}
      <Step label="Next" keys="J" onClick={() => nav.onMove(1)} />
      <Step label="Previous" keys="K" onClick={() => nav.onMove(-1)} />
      <Button variant="ghost" iconOnly icon="thirdPane" aria-label="Versions" keys="⇧V" aria-pressed={versionsOpen} className={versionsOpen ? "bg-border" : ""} detail={EXPLAIN.versions.detail} note={EXPLAIN.versions.note} onClick={toggleVersions} />
      {more}
    </header>
  );

  const readAction = rejecting && !small ? (
    <ReasonField decision="Reject" picks={REJECT_PICKS} onDone={({ reason }) => rejectIt(reason)} className="max-w-[600px]" />
  ) : story.rejected ? (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-body-sm leading-body-sm text-muted">
        Rejected{story.rejectedBecause ? ` · ${story.rejectedBecause}` : ""}. What came from it is left out of your record.
      </span>
      <Button icon="undo" detail={EXPLAIN.restore.detail} note={EXPLAIN.restore.note} onClick={restoreIt}>
        Restore
      </Button>
    </div>
  ) : run?.status === "paused" && run.version === story.version ? (
    <p className="text-body-sm leading-body-sm text-caution-text">Waiting for budget. {run.error}</p>
  ) : run?.status === "failed" && run.version === story.version && !dirty ? (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" keys="R" icon="tryAgain" reason={readReason} detail={readDetail} note={readNote} onClick={read}>
        Try again
      </Button>
      <span className="flex items-center gap-1.5 text-body-sm leading-body-sm text-text">
        <Icons.failed aria-hidden className="shrink-0 text-red" />
        Couldn’t read it: {run.error ?? "try again."}
      </span>
    </div>
  ) : canRead || reading ? (
    !small && (
      <div className="flex items-center gap-2">
        <Button variant="primary" keys={reading ? undefined : "R"} loading={reading} loadingLabel="Reading…" reason={reading ? undefined : readReason} detail={readDetail} note={readNote} onClick={read} data-tour="record.read">
          Read
        </Button>
        {cost && !reading && <CostEstimate amount={cost} />}
      </div>
    )
  ) : null;

  // Talk sits at the end of the read's row; while listening, Stop is under the words.
  const talkHead = canTalk && showWriting && !small && !listening ? <TalkButton talk={talk} noun={noun} tour="record.talk" /> : null;
  const head = (
    <div className={`flex shrink-0 flex-col gap-4 border-b pb-6 ${pad}`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        {versionsOpen ? (
          <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg text-text">{story.title}</h1>
        ) : (
          <WritingArea
            ref={titleRef}
            variant="title"
            aria-label="Title"
            placeholder={note ? "What it’s about" : "Employer or project"}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value.replace(/\n/g, " ") })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                bodyRef.current?.focus();
              } else if (e.key === "Escape") e.currentTarget.blur();
            }}
            onBlur={() => (draft.title.trim() ? !demo && doSave() : setDraft({ ...draft, title: story.title }))}
          />
        )}
        <p className="text-body-sm leading-body-sm text-muted">
          {small ? status : versionsOpen ? `Comparing version ${shownPair.from} with version ${shownPair.to}` : `${note ? "Note" : "Story"} · ${wordsLabel(wordCount(draft.body))}`}
        </p>
      </div>
      {versionsOpen ? (
        size === "medium" && (
          <div>
            <Button variant="ghost" icon="back" keys="Esc" detail="Closes the comparison." note="Free" onClick={() => onPair(null)}>
              Back to the {noun}
            </Button>
          </div>
        )
      ) : readAction || talkHead ? (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">{readAction}</div>
          {talkHead}
        </div>
      ) : null}
    </div>
  );

  const details = (
    <Details
      story={story}
      run={run}
      proposals={proposals}
      roleOptions={roleOptions}
      linked={linked?.name}
      onLink={linkTo}
      onProposals={() => onTab("proposals")}
      columns={size === "medium" ? 2 : 1}
    />
  );
  const writing = (
    <div className="flex flex-col gap-4">
      <WritingArea
        ref={bodyRef}
        aria-label={note ? "Note" : "Story"}
        placeholder={listening ? undefined : note ? "One more thing about a role, a project or a result." : "What happened here, in your own words. Out of order and half-remembered is fine."}
        value={split === null ? draft.body : draft.body.slice(0, split)}
        rows={listening ? 1 : note ? 3 : 8}
        onChange={(e) => {
          if (split === null) {
            if (talk.state === "stopped") talk.dismiss();
            return setDraft({ ...draft, body: e.target.value });
          }
          // Typing above the words still arriving: they stay after it.
          setDraft({ ...draft, body: e.target.value + draft.body.slice(split) });
          setSplit(e.target.value.length);
        }}
        onBlur={demo ? undefined : doSave}
        onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
        className="max-w-[600px]"
      />
      {listening && (
        <>
          <LiveText text={spoken} interim={talk.interim} />
          {!small && <Listening talk={talk} saved={savedLabel} />}
          <TalkTip href={docsHref(STORY_GUIDE)} className="pt-1 pl-3.5" />
        </>
      )}
      {talk.state === "stopped" && <TalkStopped talk={talk} noun={noun} saved={saving ? "saving" : dirty ? "unsaved" : "saved"} phone={small} />}
      {canTalk === false && size === "medium" && <DeviceDictation device={device} />}
    </div>
  );

  return (
    <div data-tour="record.item" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      {top}
      {head}
      {versionsOpen ? (
        <div className={`py-5 ${pad}`}>
          <Compare story={story} pair={shownPair} onPair={onPair} onRestore={restore} />
        </div>
      ) : (
        <Tabs
          label={story.title}
          inFlow
          value={tab}
          onValueChange={(v) => onTab(v as Tab)}
          className={`sticky top-0 z-10 bg-surface ${pad}`}
          tabs={[
            { value: "story", label: note ? "Note" : "Story" },
            { value: "proposals", label: "Proposals", count: proposals.count || undefined },
          ]}
          end={canTalk === false && size === "large" ? <DeviceDictation device={device} /> : undefined}
        >
          <TabPanel value="story" className="flex min-h-0 flex-1 flex-col">
            {size === "large" ? (
              <div className="flex min-h-0 flex-1">
                <div className={`flex min-w-0 flex-1 flex-col py-5 ${pad}`}>{writing}</div>
                <div className="w-60 shrink-0 self-stretch border-l px-6 py-5">{details}</div>
              </div>
            ) : (
              <>
                <div className={`py-5 ${pad}`}>{writing}</div>
                <div className={`border-t py-5 ${pad}`}>{details}</div>
              </>
            )}
          </TabPanel>
          <TabPanel value="proposals">
            <Proposals narrativeId={id} title={story.title} run={run} version={story.versions.length} pad={pad} />
          </TabPanel>
        </Tabs>
      )}
      {canTalk === false && small && showWriting && device && (
        <div className="sticky bottom-0 mt-auto border-t bg-surface px-4 py-2.5">
          <DeviceDictation device={device} />
        </div>
      )}
      <ReadAgain open={again} onOpenChange={setAgain} title={story.title} version={story.version} cost={againCost} onRead={(lookFor, includingRejected) =>
        void readAgain({ source: { narrativeId: id }, includingRejected, lookFor: lookFor || undefined }).then(
          () => toast({ message: `Reading ${story.title} again`, icon: "running" }),
          (e: unknown) => failed(e, "Couldn’t start reading."),
        )
      } />
    </div>
  );
}

function Step({ label, keys, onClick }: { label: string; keys: string; onClick: () => void }) {
  return (
    <Tooltip content={label} keys={keys}>
      <button type="button" aria-label={label} onClick={onClick} className="flex rounded-sm">
        <Kbd>{keys}</Kbd>
      </button>
    </Tooltip>
  );
}

// Beside the story: the role it's about, when it was last read and what that read proposed, then notes on it.
function Details({
  story,
  run,
  proposals,
  roleOptions,
  linked,
  onLink,
  onProposals,
  columns,
}: {
  story: Story;
  run: Run;
  proposals: { count: number; waiting: number };
  roleOptions: { label: string; hint: string; key: string }[];
  linked: string | undefined;
  onLink: (roleKey: string | null) => void;
  onProposals: () => void;
  columns: 1 | 2;
}) {
  const subject = { kind: "narrative" as const, id: story.id };
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const edit = useMutation(api.notes.edit);
  const removeNote = useMutation(api.notes.remove);
  const underline = "tap self-start rounded-sm underline decoration-border decoration-1 underline-offset-3 transition-colors duration-100 hover:decoration-text";
  // Unlinked, a story is about the roles its reads found in it.
  const items = useQuery(api.extract.items);
  const readRoles = (items ?? []).flatMap((i) => (i.kind === "role" && i.status !== "rejected" && i.roleKey && i.sources.some((s) => s.narrativeId === story.id) ? [{ key: i.roleKey, name: [i.data.title, i.data.employer].filter(Boolean).join(", ") }] : []));
  const shownRoles = linked && story.roleKey ? [{ key: story.roleKey, name: linked }] : readRoles;
  return (
    <div className="flex flex-col gap-6">
      <Properties columns={columns}>
        <Property label={story.kind !== "note" && shownRoles.length > 1 ? "Roles" : "Role"}>
          {story.kind === "note" ? (
            <Select
              label="Role"
              value={story.roleKey ?? "none"}
              onChange={(v) => onLink(v === "none" ? null : v)}
              options={[...roleOptions.map((r) => ({ value: r.key, label: [r.label, r.hint].filter(Boolean).join(", ") })), "separator", { value: "none", label: "No role" }]}
              className="w-full min-w-0"
            />
          ) : shownRoles.length ? (
            shownRoles.map((r) => (
              <Link key={r.key} href={`/record/roles?role=${encodeURIComponent(r.key)}`} className={underline}>
                {r.name}
              </Link>
            ))
          ) : (
            <span className="text-muted">None</span>
          )}
        </Property>
        <Property label="Last read">{run?.lastRead ? `Version ${run.lastRead}${run.lastReadAt ? ` · ${when(run.lastReadAt)}` : ""}` : <span className="text-muted">Not read yet</span>}</Property>
        {run?.lastRead ? (
          <Property label="Proposals">
            <button type="button" onClick={onProposals} className={`${underline} text-left`}>
              {proposals.count} from version {run.lastRead}
              {proposals.waiting ? ` · ${proposals.waiting} in Review` : ""}
            </button>
          </Property>
        ) : null}
      </Properties>
      {notes && (
        <NoteBlock
          heading
          notes={notes}
          onAdd={(text) => void add({ subject, text }).catch((e: unknown) => failed(e, "Couldn’t add the note."))}
          onEdit={(noteId, text) => void edit({ id: noteId as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
          onDelete={(noteId) => void removeNote({ id: noteId as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
        />
      )}
    </div>
  );
}

// Read again: what they think was missed, and whether to look past what they rejected from it, for this read only.
function ReadAgain({ open, onOpenChange, title, version, cost, onRead }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; version: number; cost: string | null; onRead: (lookFor: string, includingRejected: boolean) => void }) {
  const [lookFor, setLookFor] = useState("");
  const [including, setIncluding] = useState(false);
  const go = () => {
    onRead(lookFor.trim(), including);
    onOpenChange(false);
    setLookFor("");
    setIncluding(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Read again"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <span className="flex-1" />
          {cost && <CostEstimate amount={cost} className="self-center" />}
          <Button
            variant="primary"
            detail="Reads it against your record as it is now. Only what isn’t there yet is proposed."
            note={cost ?? "Uses your AI budget"}
            onClick={go}
          >
            Read again
          </Button>
        </>
      }
    >
      <p className="text-body-sm leading-body-sm text-muted">
        {title} · version {version} · only new facts are added
      </p>
      <Field label="What did it miss? (optional)">
        {(props) => <Textarea {...props} rows={2} value={lookFor} onChange={(e) => setLookFor(e.target.value)} placeholder="The plant move, the safety award" />}
      </Field>
      <Checkbox label="Including what I rejected" description="Looks past what you rejected from it, for this read only." checked={including} onChange={setIncluding} />
    </Dialog>
  );
}
