"use client";

import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuiltOn, BuiltOnPeek } from "@/components/BuiltOn";
import { BulkBar } from "@/components/BulkBar";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { ProgressBar } from "@/components/Progress";
import { ReasonField } from "@/components/ReasonField";
import { RejectedRow } from "@/components/RejectedRow";
import { type ReviewAction, ReviewActions, ReviewCard, ReviewKeyLegend, ReviewNext, useReviewKeys } from "@/components/ReviewCard";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Count } from "@/components/StatusTag";
import { toast } from "@/components/Toast";
import { selectEntries, useSelection } from "@/components/useSelection";
import { useBar, useCommands } from "../shell/ShellContext";
import { useTour } from "../shell/useTour";
import { REVIEW_TOUR } from "../tours/review";
import { builtOn, CardBody } from "./CardBody";
import { type Card, type Decision, decisionsFor, extrasFor, GROUP_ICON, type Items, restore, TYPE_LABEL, unlocks } from "./decisions";
import { type SetParams, type Summary, useReviewEnv } from "./env";

type Mode = "cards" | "list";
type Group = Summary["groups"][number];

const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : "Couldn’t save that.", icon: "failed" });

// Deciding the checked rows together, beside the list and in the phone's bar.
const APPROVE_CHECKED = { detail: "Approves every one you checked.", note: "Free · Undo with U" } as const;
const REJECT_CHECKED = { detail: "Rejects every one you checked, with why if you like.", note: "Free · Undo with U" } as const;

// Runs a decision and says what happened, with Undo on U when it can be taken back.
function commit(d: Decision, input: { reason?: string; text?: string }) {
  d.run(input)
    .then(() => {
      if (!d.done) return;
      const undo = d.undo;
      // A toast is one line: long fact wording is cut short.
      const message = d.done.length > 64 ? `${d.done.slice(0, 62).trimEnd()}…` : d.done;
      toast({ message, icon: d.intent === "reject" ? "reject" : "approve", action: undo ? { label: "Undo", key: "U", run: () => void undo().catch(failed) } : undefined });
    })
    .catch(failed);
}

// Where a decision's href goes: another screen, or a company's own site in a new tab.
function go(router: { push: (href: string) => void }, href: string) {
  if (href.startsWith("http")) window.open(href, "_blank", "noopener");
  else router.push(href);
}

export function Review() {
  const env = useReviewEnv();
  const summary = env.useSummary();
  const { kind, item, set } = env.useParams();
  const m = env.useDecide();
  const small = useScreenSize() === "small";
  const [mode, setModeState] = useState<Mode>("cards");
  // The list opens on its rows, not on the card that was showing; the cards keep the one open.
  const setMode = useCallback(
    (next: Mode) => {
      setModeState(next);
      if (next === "list" && item) set({ item: null }, true);
    },
    [item, set],
  );
  const router = useRouter();
  const { suggestQuestions: suggest, findConflicts: conflicts, findDuplicates: duplicates } = m;

  const groups = useMemo(() => summary?.groups ?? [], [summary]);
  // The group open: the one asked for while it has something waiting, else (beside the list) the first.
  const group = groups.find((g) => g.kind === kind) ?? (small ? undefined : groups[0]);

  const tour = useTour(REVIEW_TOUR, !!summary);

  const menu: MenuEntry[] = [
    {
      label: "Suggest questions",
      icon: "ask",
      detail: "Looks for questions whose answers would sharpen your record. They wait here for your answers.",
      note: "About $0.02 of your AI budget",
      onSelect: () => void suggest({}).then(() => toast({ message: "Looking for questions to sharpen your record", icon: "running" }), failed),
    },
    {
      label: "Look for conflicts",
      icon: "search",
      detail: "Checks your record against your stories for anything they disagree on. What it finds waits here.",
      note: "Uses your AI budget",
      onSelect: () => void conflicts({}).then(() => toast({ message: "Checking your record against your stories", icon: "running" }), failed),
    },
    {
      label: "Find facts said twice",
      icon: "builtOn",
      detail: "Looks for facts your record says twice. Pairs it finds wait here, to merge or keep both.",
      note: "Uses your AI budget",
      onSelect: () => void duplicates({}).then(() => toast({ message: "Looking for facts said twice", icon: "running" }), failed),
    },
    tour.menu,
  ];

  const commands = useMemo(
    (): Command[] => [
      ...groups.map((g): Command => ({ id: `review-${g.kind}`, group: "Review", label: g.label, detail: `${g.count} waiting`, icon: GROUP_ICON[g.kind], onSelect: () => set({ kind: g.kind, item: null }) })),
      { id: "review-mode", group: "Review", label: mode === "cards" ? "Show as a list" : "Show as cards", icon: "filter", onSelect: () => setMode(mode === "cards" ? "list" : "cards") },
      { id: "review-questions", group: "Review", label: "Suggest questions", detail: "About $0.02 of your AI budget", icon: "ask", onSelect: () => void suggest({}).catch(failed) },
    ],
    [groups, mode, set, setMode, suggest],
  );
  useCommands(commands);

  if (!summary) return null;

  const header = (
    <PaneHeader
      title="Review"
      count={summary.total}
      actions={
        <>
          <div data-tour="review.mode" className="flex">
            <SegmentedControl
              label="Show as"
              hideLabel
              value={mode}
              onChange={setMode}
              options={[
                { value: "cards", label: "Cards" },
                { value: "list", label: "List" },
              ]}
            />
          </div>
          {!small && <Menu label="More for Review" items={menu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Review" data-tour="review.more" />} />}
        </>
      }
    />
  );

  if (summary.total === 0)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <EmptyState icon="review" title="Nothing to review" action={<Button detail="Opens Today: what needs you now." note="Free" onClick={() => router.push("/")}>Open Today</Button>}>
          New facts, roles and updates arrive here.
        </EmptyState>
      </div>
    );

  const unlocking = groups.filter((g) => g.unlocks);
  const then = groups.filter((g) => !g.unlocks);
  const row = (g: Group) => (
    <ListRow
      key={g.kind}
      title={g.label}
      line={g.preview}
      lead={
        <span className="flex size-7 items-center justify-center rounded-sm bg-subtle text-muted">
          {(() => {
            const Icon = Icons[GROUP_ICON[g.kind]];
            return <Icon aria-hidden />;
          })()}
        </span>
      }
      tag={<Count className="text-body-sm leading-body-sm text-text">{g.count}</Count>}
      selected={!small && group?.kind === g.kind}
      onOpen={() => set({ kind: g.kind, item: null })}
    />
  );
  const list = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {header}
      <List label="Review" tour="review.groups" className="px-2 pb-2">
        {unlocking.length > 0 && (
          <ListGroup label="Unlocks work" count={unlocking.reduce((n, g) => n + g.count, 0)}>
            {unlocking.map(row)}
          </ListGroup>
        )}
        {then.length > 0 && (
          <ListGroup label={unlocking.length ? "Then" : "Waiting"} count={then.reduce((n, g) => n + g.count, 0)}>
            {then.map(row)}
          </ListGroup>
        )}
      </List>
      {small && (
        <div className="px-4 pb-4">
          <Menu label="More for Review" items={menu} trigger={<Button variant="ghost" icon="more" data-tour="review.more">More</Button>} />
        </div>
      )}
    </div>
  );

  const pane = group ? <GroupPane key={`${group.kind}:${mode}`} group={group} mode={mode} item={item} set={set} small={small} /> : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={list} item={pane} empty={<EmptyState icon="review" title="Nothing open">Choose a group to review it here.</EmptyState>} />
    </div>
  );
}

// One group, as cards or as a list. In the list, the row opened (?item=) takes the pane as its card, with a way back
// to the list (Back, or Esc); the list returns when it's decided, with the row it came from focused.
function GroupPane({ group, mode, item, set, small }: { group: Group; mode: Mode; item: string | null; set: SetParams; small: boolean }) {
  const data = useReviewEnv().useItems(group.kind);
  // The card showing when the list was chosen stays shut until the address lets go of it (Review's setMode).
  const [left, setLeft] = useState(mode === "list" ? item : null);
  if (left && item !== left) setLeft(null);
  const open = left ? null : item;
  const [from, setFrom] = useState<{ key: string; index: number } | null>(null);
  const index = mode === "list" && data ? data.cards.findIndex((c) => c.key === open) : -1;
  if (open && index >= 0 && (from?.key !== open || from.index !== index)) setFrom({ key: open, index });
  // An opened row that's been decided has left the list; let go of it, so an Undo doesn't open it again.
  const stale = mode === "list" && !!data && !!open && index < 0;
  useEffect(() => {
    if (stale) set({ item: null }, true);
  }, [stale, set]);
  if (!data) return null;
  const back = () => set({ kind: null, item: null });
  if (mode === "cards") return <Cards data={data} label={group.label} item={item} set={set} small={small} onBack={back} />;
  const card = data.cards[index];
  if (card) {
    const move = (by: number) => {
      const next = data.cards[index + by];
      if (next) set({ item: next.key }, true);
    };
    return <Deciding key={card.key} card={card} label={group.label} index={index} total={data.cards.length} next={data.cards[index + 1]} move={move} small={small} onBack={() => set({ item: null })} fromList />;
  }
  return <Rows data={data} label={group.label} small={small} onBack={back} onOpen={(key) => set({ item: key })} current={from} />;
}

// ---- Cards: one decision at a time ----

function Cards({ data, label, item, set, small, onBack }: { data: Items; label: string; item: string | null; set: SetParams; small: boolean; onBack: () => void }) {
  const cards = data.cards;
  // A decided card leaves the list; the one after it takes its place, so the position is kept rather than the key.
  const [last, setLast] = useState(0);
  const found = cards.findIndex((c) => c.key === item);
  if (found >= 0 && found !== last) setLast(found);
  const index = found >= 0 ? found : Math.max(0, Math.min(last, cards.length - 1));
  const card = cards[index];
  const move = (by: number) => {
    const next = cards[index + by];
    if (next) set({ item: next.key }, true);
  };
  if (!card)
    return (
      <EmptyState icon="review" title={`Nothing left in ${label}`}>
        New facts, roles and updates arrive here.
      </EmptyState>
    );
  return <Deciding key={card.key} card={card} label={label} index={index} total={cards.length} next={cards[index + 1]} move={move} small={small} onBack={onBack} />;
}

type Pending = { d: Decision; stage: "why" | "field" };

// `fromList`: opened from a row of the list, so Back (and Esc) returns to the list, on every screen size.
function Deciding({ card, label, index, total, next, move, small, onBack, fromList = false }: { card: Card; label: string; index: number; total: number; next?: Card; move: (by: number) => void; small: boolean; onBack: () => void; fromList?: boolean }) {
  const router = useRouter();
  const m = useReviewEnv().useDecide();
  const decisions = decisionsFor(card, m);
  const extras = extrasFor(card, m);
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  // The card takes focus as it opens (a group chosen, the card before it decided), so its keys work at once; not while
  // they're typing somewhere else.
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("input, textarea, [contenteditable='true'], [role=dialog]")) return;
    holder.current?.querySelector<HTMLElement>("article")?.focus({ preventScroll: true });
  }, []);

  const select = (d: Decision) => {
    if (d.href) return go(router, d.href);
    if (d.why) return setPending({ d, stage: "why" });
    if (d.field) {
      setText(d.field.initial);
      return setPending({ d, stage: "field" });
    }
    commit(d, {});
  };
  const finish = (d: Decision, input: { reason?: string; text?: string }) => {
    setPending(null);
    commit(d, input);
  };
  const save = () => {
    if (!pending || !text.trim()) return;
    finish(pending.d, { text: text.trim() });
  };

  const byKey = (k: string) => decisions.find((d) => d.keys === k);
  const approve = decisions.find((d) => d.intent === "approve");
  const reject = decisions.find((d) => d.intent === "reject");
  const other = Object.fromEntries(decisions.filter((d) => d.keys && !["A", "R", "E"].includes(d.keys)).map((d) => [d.keys!, () => select(d)]));
  if (fromList) other.Escape = onBack;
  useReviewKeys(
    {
      approve: approve && (() => select(approve)),
      reject: reject && (() => select(reject)),
      edit: byKey("E") && (() => select(byKey("E")!)),
      next: () => move(1),
      previous: () => move(-1),
      other,
    },
    !pending,
  );

  const actions: ReviewAction[] = decisions.map((d) => ({ label: d.label, onSelect: () => select(d), keys: d.keys, detail: d.detail, note: d.note, intent: d.intent }));
  const more: MenuEntry[] = [
    ...extras.map((d): MenuEntry => ({ label: d.label, icon: d.icon, detail: d.detail, note: d.note, onSelect: () => select(d) })),
    ...(index + 1 < total ? ["separator" as const, { label: "Skip for now", icon: "time" as const, keys: "J", detail: "Moves on to the next one; this one keeps waiting.", note: "Free", onSelect: () => move(1) }] : []),
  ];
  const sources = builtOn(card);

  const field = pending?.stage === "field" && pending.d.field;
  const footer =
    pending?.stage === "why" && !small ? (
      <ReasonField decision={pending.d.why!.decision} picks={pending.d.why!.picks} onDone={({ reason }) => finish(pending.d, { reason })} />
    ) : field ? (
      <div className="flex flex-col gap-2.5">
        <Textarea
          aria-label={field.label}
          autoFocus
          rows={3}
          value={text}
          placeholder={field.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setPending(null);
            }
          }}
        />
        {!small && (
          <div className="flex items-center gap-2">
            <Button variant="primary" keys="⌘↵" disabled={!text.trim()} onClick={save} detail={pending.d.detail} note={pending.d.note}>
              {field.save}
            </Button>
            <Button keys="Esc" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    ) : undefined;

  useBar(
    small
      ? pending?.stage === "why"
        ? { kind: "reason", decision: pending.d.why!.decision, picks: pending.d.why!.picks, onDone: ({ reason }) => finish(pending.d, { reason }) }
        : field
          ? {
              kind: "actions",
              actions: (
                <>
                  <Button size="lg" onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                  <Button size="lg" variant="primary" className="flex-1" disabled={!text.trim()} detail={pending.d.detail} note={pending.d.note} onClick={save}>
                    {field.save}
                  </Button>
                </>
              ),
            }
          : { kind: "actions", actions: <ReviewActions actions={actions} /> }
      : null,
  );

  const reviewCard = (
    <div ref={holder} data-tour="review.card">
    <ReviewCard
      kind={TYPE_LABEL[card.type]}
      context={card.context}
      position={small ? undefined : { index: index + 1, total }}
      onNext={() => move(1)}
      onPrevious={() => move(-1)}
      builtOn={sources.length > 0 ? <BuiltOn sources={sources} count={sources.length} /> : undefined}
      actions={actions}
      more={more}
      moreLabel={`More for this ${TYPE_LABEL[card.type].toLowerCase()}`}
      footer={footer}
    >
      <CardBody card={card} />
    </ReviewCard>
    </div>
  );

  if (small)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PaneHeader
          back={{ label, onBack }}
          actions={
            <>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">
                {index + 1} of {total}
              </span>
              <Menu items={more} label={`More for this ${TYPE_LABEL[card.type].toLowerCase()}`} title={card.title} description={[TYPE_LABEL[card.type], card.context].filter(Boolean).join(" · ")} />
            </>
          }
        />
        <div className="px-4">
          <ProgressBar label={`${index + 1} of ${total}`} value={index + 1} max={total} className="h-[3px]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{reviewCard}</div>
      </div>
    );

  const hint = unlocks(card);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {fromList ? (
        <PaneHeader back={{ label, onBack }} actions={hint && <span className="text-body-sm leading-body-sm text-muted">{hint}</span>} />
      ) : (
        <div className="flex h-[52px] shrink-0 items-center justify-end px-4 text-body-sm leading-body-sm text-muted">{hint}</div>
      )}
      <div className="flex w-full max-w-[760px] flex-col gap-6 px-8 pb-8">
        {reviewCard}
        {next && <ReviewNext group={label} title={next.title} line={next.line || undefined} onOpen={() => move(1)} />}
        <div data-tour="review.keys">
          <ReviewKeyLegend items={[...decisions.filter((d) => d.keys).map((d): [string, string] => [d.keys!, d.label]), ["J", "Next"], ["K", "Previous"], ["U", "Undo"], ...(fromList ? [["Esc", "Back"] as [string, string]] : [])]} />
        </div>
      </div>
    </div>
  );
}

// ---- List: rows to check and decide together ----

// `current`: the row last opened (by key, else its place if it's been decided), marked and focused on the way back.
function Rows({ data, label, small, onBack, onOpen, current }: { data: Items; label: string; small: boolean; onBack: () => void; onOpen: (key: string) => void; current: { key: string; index: number } | null }) {
  const here = current && (data.cards.find((c) => c.key === current.key) ?? data.cards[Math.min(current.index, data.cards.length - 1)])?.key;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>("[data-row][aria-current=true]")?.focus();
  }, []);
  const router = useRouter();
  const m = useReviewEnv().useDecide();
  const sel = useSelection();
  const [why, setWhy] = useState<{ key: string; d: Decision } | "bulk" | null>(null);
  const rows = data.cards.map((card) => ({ card, decisions: decisionsFor(card, m) }));
  // Bulk makes sense where approving and rejecting are plain review decisions.
  const bulkable = rows.filter((r) => r.decisions.some((d) => d.bulk && d.intent === "approve") && r.decisions.some((d) => d.bulk && d.intent === "reject"));
  const chosen = bulkable.filter((r) => sel.checked.has(r.card.key));

  const bulk = (intent: "approve" | "reject", reason?: string) => {
    const picked = chosen.map((r) => r.decisions.find((d) => d.intent === intent && d.bulk)!);
    sel.done();
    setWhy(null);
    Promise.all(picked.map((d) => d.run({ reason })))
      .then(() =>
        toast({
          message: `${intent === "approve" ? "Approved" : "Rejected"} ${picked.length}`,
          icon: intent === "approve" ? "approveAll" : "reject",
          action: { label: "Undo", key: "U", run: () => void Promise.all(picked.map((d) => d.undo?.())).catch(failed) },
        }),
      )
      .catch(failed);
  };

  const none = chosen.length ? undefined : "None selected";
  useReviewKeys(
    {
      approve: () => {
        if (chosen.length) bulk("approve");
      },
      reject: () => {
        if (chosen.length) setWhy("bulk");
      },
      other: { Escape: sel.done },
    },
    sel.on && why === null,
  );

  const rowWhy = why !== null && why !== "bulk" ? why : null;
  const decideRow = (d: Decision, reason?: string) => {
    setWhy(null);
    commit(d, { reason });
  };
  useBar(
    small
      ? why === "bulk"
        ? { kind: "reason", decision: "Reject", picks: [], onDone: ({ reason }) => bulk("reject", reason) }
        : rowWhy
          ? { kind: "reason", decision: rowWhy.d.why!.decision, picks: rowWhy.d.why!.picks, onDone: ({ reason }) => decideRow(rowWhy.d, reason) }
          : sel.on
            ? {
                kind: "bulk",
                count: chosen.length,
                onDone: sel.done,
                actions: (
                  <>
                    <Button size="lg" {...REJECT_CHECKED} reason={none} onClick={() => setWhy("bulk")}>
                      Reject
                    </Button>
                    <Button size="lg" variant="primary" className="flex-1" {...APPROVE_CHECKED} reason={none} onClick={() => bulk("approve")}>
                      Approve {chosen.length}
                    </Button>
                  </>
                ),
              }
            : null
      : null,
  );

  const pick = (card: Card, d: Decision) => {
    if (d.href) return go(router, d.href);
    if (d.why) return setWhy({ key: card.key, d });
    if (d.field) return onOpen(card.key);
    commit(d, {});
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title={small ? undefined : label}
        count={small ? undefined : data.cards.length}
        back={small ? { label, onBack } : undefined}
        actions={
          <>
            {small && <Count>{data.cards.length}</Count>}
            {bulkable.length > 0 && <Menu label={`More for ${label}`} items={selectEntries(sel, bulkable.map((r) => r.card.key), label.toLowerCase())} />}
          </>
        }
      />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {sel.on && !small && (
          <div className="flex h-10 items-center border-b px-5">
            <Checkbox
              label={chosen.length ? `${chosen.length} of ${bulkable.length} selected` : `Select all ${bulkable.length}`}
              checked={chosen.length === 0 ? false : chosen.length === bulkable.length ? true : "some"}
              onChange={(on) => sel.check(bulkable.map((r) => r.card.key), on)}
            />
          </div>
        )}
        <List label={label} className="px-2 py-2">
          {rows.map(({ card, decisions }) => {
            const approve = decisions.find((d) => d.intent === "approve");
            const reject = decisions.find((d) => d.intent === "reject");
            const sources = builtOn(card);
            const canCheck = bulkable.some((r) => r.card.key === card.key);
            return (
              <ListRow
                key={card.key}
                title={card.title}
                line={card.line || TYPE_LABEL[card.type]}
                checked={sel.checked.has(card.key)}
                selected={card.key === here}
                onCheck={canCheck ? (on) => sel.check([card.key], on) : undefined}
                selecting={sel.on}
                onOpen={() => onOpen(card.key)}
                actions={[
                  ...(approve ? [{ label: approve.label, icon: approve.icon, detail: approve.detail, note: approve.note, onSelect: () => pick(card, approve) }] : []),
                  ...(reject ? [{ label: reject.label, icon: reject.icon, detail: reject.detail, note: reject.note, onSelect: () => pick(card, reject) }] : []),
                ]}
                menu={[...decisions, ...extrasFor(card, m)].map((d): MenuEntry => ({ label: d.label, icon: d.icon, keys: d.keys, detail: d.detail, note: d.note, onSelect: () => pick(card, d) }))}
                trail={sources.length > 0 ? <BuiltOnPeek sources={sources} align="end" onOpenRecord={() => onOpen(card.key)} /> : undefined}
                below={rowWhy?.key === card.key && !small ? <ReasonField decision={rowWhy.d.why!.decision} picks={rowWhy.d.why!.picks} onDone={({ reason }) => decideRow(rowWhy.d, reason)} /> : undefined}
              />
            );
          })}
          {data.declined.length > 0 && (
            <ListGroup label="Turned down" tour="review.declined" count={data.declined.length}>
              {data.declined.map((d) => (
                <RejectedRow
                  key={d.key}
                  title={d.title}
                  line={d.line || undefined}
                  decision={d.decision}
                  reason={d.reason ?? undefined}
                  onRestore={() =>
                    void restore(d, m).then(() => toast({ message: `Restored: ${d.title}`, icon: "undo" }), failed)
                  }
                />
              ))}
            </ListGroup>
          )}
        </List>
      </div>
      {!small && sel.on && (
        <div className="flex flex-col gap-2 px-2 pb-2">
          {why === "bulk" && <ReasonField decision={`Reject ${chosen.length}`} onDone={({ reason }) => bulk("reject", reason)} />}
          <BulkBar
            count={chosen.length}
            onDone={sel.done}
            actions={[
              { label: "Approve", keys: "A", primary: true, ...APPROVE_CHECKED, onSelect: () => bulk("approve") },
              { label: "Reject", keys: "R", ...REJECT_CHECKED, onSelect: () => setWhy("bulk") },
            ]}
          />
        </div>
      )}
    </div>
  );
}
