"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import { aboutUsd } from "../../costs";
import { useBar } from "../../shell/ShellContext";
import { BuiltOn } from "@/components/BuiltOn";
import type { MenuEntry } from "@/components/Menu";
import { ReasonField } from "@/components/ReasonField";
import { type ReviewAction, ReviewActions, type ReviewAside, ReviewCard, ReviewStatement, ReviewUpdate, useReviewKeys } from "@/components/ReviewCard";
import { useSmall } from "@/components/useSmall";
import { EXPLAIN, useFactActions } from "./actions";
import { act, type Card, cardsOf, type Fact, FREE_UNDO, monthDay, type Owner, PICKS, type RecordData, roleName, short, sourceLine, sourcesOf, useRecord, WHY } from "./shared";
import { WordsField } from "./WordsField";

// The decisions waiting on a role's or project's facts, one card at a time with its position: a rewrite to approve,
// a new fact, the same work told by a project and its role (Connect or Keep separate), two facts that say the same
// thing (Merge or Keep both). A, E, R, C and M decide the card shown while no fact is open beside it; a negative
// decision asks why in the card and is sent with its reason. On a phone the card's moves go to the bottom bar.
export function FactCards({ owner, open, onOpen }: { owner: Owner; open?: string | null; onOpen?: (factId: string) => void }) {
  const r = useRecord();
  const [at, setAt] = useState(0);
  if (!r) return null;
  const cards = cardsOf(r, owner);
  if (!cards.length) return null;
  const index = Math.min(at, cards.length - 1);
  const card = cards[index];
  return (
    <OneCard
      key={`${card.type}:${card.fact.id}`}
      r={r}
      owner={owner}
      card={card}
      position={{ index: index + 1, total: cards.length }}
      onStep={(by) => setAt(Math.max(0, Math.min(cards.length - 1, index + by)))}
      keys={!open}
      onOpen={onOpen}
    />
  );
}

type Mode = null | "edit" | "context" | "why";

function OneCard({
  r,
  owner,
  card,
  position,
  onStep,
  keys,
  onOpen,
}: {
  r: RecordData;
  owner: Owner;
  card: Card;
  position: { index: number; total: number };
  onStep: (by: number) => void;
  keys: boolean;
  onOpen?: (factId: string) => void;
}) {
  const small = useSmall();
  const [narrow, setNarrow] = useState(false);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(() => setNarrow(el.clientWidth < 560));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const costs = useQuery(api.estimates.costs, {});
  const cost = aboutUsd(costs?.rewrite) ?? "Uses your AI budget";
  const [mode, setMode] = useState<Mode>(null);
  const f = card.fact;
  const a = useFactActions(r, f);
  const accept = useMutation(api.extract.acceptSuggestion);
  const dismiss = useMutation(api.extract.dismissSuggestion);
  const revert = useMutation(api.extract.revertWording);
  const merge = useMutation(api.duplicates.merge);
  const unmerge = useMutation(api.duplicates.unmerge);
  const keepBoth = useMutation(api.duplicates.keepBoth);
  const reopenDuplicate = useMutation(api.duplicates.reopen);
  const connect = useMutation(api.sameWork.connect);
  const keepSeparate = useMutation(api.sameWork.keepSeparate);
  const reopenSameWork = useMutation(api.sameWork.reopen);

  const id = f.id;
  const sug = f.data.suggestion;
  const openSources: MenuEntry = { label: "Sources and history", icon: "thirdPane", onSelect: () => onOpen?.(id), ...EXPLAIN.sources };

  // Each kind's moves (the first is the Amber one), what `why` sends with the reason, and what `edit` saves.
  let kind: string;
  let context: string | undefined;
  let body: ReactNode;
  let builtOn: ReactNode;
  let actions: ReviewAction[];
  let aside: ReviewAside | undefined;
  let more: MenuEntry[] = onOpen ? [openSources] : [];
  let why: { decision: string; picks: string[]; run: (reason?: string) => void } | undefined;
  let edit: { initial: string } | undefined;
  const other: Record<string, () => void> = {};

  const addContext: ReviewAside = { label: "Add context", icon: "builtOn", detail: EXPLAIN.rewrite.detail, note: cost, onSelect: () => setMode("context") };
  const editAction: ReviewAction = { label: "Edit", keys: "E", detail: EXPLAIN.edit.detail, note: FREE_UNDO, onSelect: () => setMode("edit") };

  if (card.type === "rewrite" && sug?.text) {
    const proposed = sug.text;
    kind = "Suggested rewrite";
    context = sug.from === "revision" ? "from your revised story" : sug.note ? "from your note" : undefined;
    body = <ReviewUpdate now={f.data.text} proposed={proposed} />;
    builtOn = sug.note ? <BuiltOn sources={[{ kind: "quote", text: sug.note, source: `Note · written ${monthDay(sug.at)}` }]} /> : undefined;
    why = { decision: "Keep current", picks: PICKS.rewrite, run: (reason) => act(dismiss({ id, reason }), `Kept your wording: ${short(f.data.text)}`, "reject", () => revert({ id })) };
    edit = { initial: proposed };
    actions = [
      {
        label: "Approve",
        keys: "A",
        intent: "approve",
        detail: "The fact takes the new wording and is approved. The old wording stays in its history.",
        note: FREE_UNDO,
        onSelect: () => act(accept({ id }), `Rewritten: ${short(proposed)}`, "approve", () => revert({ id })),
      },
      editAction,
      { label: "Reject", keys: "R", intent: "reject", detail: "Keeps the wording it has. The rewrite stays in its history.", note: WHY, onSelect: () => setMode("why") },
    ];
    aside = addContext;
  } else if (card.type === "sameWork") {
    const onRole = "roleKey" in owner;
    const { other: roleFact, project, role } = card;
    kind = "Same work";
    context = onRole ? `${project.data.name} project` : roleName(role);
    const rows: [string, Fact][] = onRole
      ? [
          ["This role", roleFact],
          [project.data.name, f],
        ]
      : [
          [project.data.name, f],
          [role.data.employer ?? roleName(role), roleFact],
        ];
    body = <Pair r={r} rows={rows} />;
    const undo = () => reopenSameWork({ id, other: roleFact.id, lead: f.data.sameWorkAs!.lead });
    why = { decision: "Keep separate", picks: PICKS.sameWork, run: (reason) => act(keepSeparate({ id, reason }), "Kept separate", "reject", undo) };
    actions = [
      {
        label: "Connect",
        keys: "C",
        intent: "approve",
        detail: "Resumes write one line for the two, from the richer one. Neither fact’s wording changes.",
        note: FREE_UNDO,
        onSelect: () => act(connect({ id }), "Connected as the same work", "link", undo),
      },
      { label: "Keep separate", keys: "R", intent: "reject", detail: "They’re different work; the pair isn’t suggested again.", note: WHY, onSelect: () => setMode("why") },
    ];
    other.c = actions[0].onSelect;
    more = onOpen ? [{ ...openSources, label: "Sources of this fact", onSelect: () => onOpen(onRole ? roleFact.id : id) }] : [];
  } else if (card.type === "duplicate") {
    const twin = card.other;
    const role = r.roles.find((x) => x.roleKey === f.roleKey);
    kind = "Looks like the same fact";
    context = role ? roleName(role) : undefined;
    body = (
      <Pair
        r={r}
        rows={[
          [null, twin],
          [null, f],
        ]}
      />
    );
    // Merging keeps the wording that was there first (or the new one, from ⋯); both facts' sources and history join it.
    const keep = (which: "this" | "other") =>
      act(merge({ id, keep: which }), `Merged: ${short((which === "this" ? f : twin).data.text)}`, "approve", () => unmerge({ id: which === "this" ? twin.id : id }));
    why = { decision: "Keep both", picks: PICKS.duplicate, run: (reason) => act(keepBoth({ id, reason }), "Kept both", "reject", () => reopenDuplicate({ id, other: twin.id })) };
    actions = [
      { label: "Merge", keys: "M", intent: "approve", detail: "One fact in the first wording, approved, with both facts’ sources and history.", note: FREE_UNDO, onSelect: () => keep("other") },
      { label: "Keep both", keys: "R", intent: "reject", detail: "They say different things; the pair isn’t flagged again.", note: WHY, onSelect: () => setMode("why") },
    ];
    other.m = actions[0].onSelect;
    more = [
      { label: "Merge, keeping the second wording", icon: "approve", hint: "Free", detail: "One fact in the second wording, approved, with both facts’ sources and history.", note: FREE_UNDO, onSelect: () => keep("this") },
      ...more,
    ];
  } else {
    kind = "New fact";
    context = undefined;
    body = <ReviewStatement>{f.data.text}</ReviewStatement>;
    const sources = sourcesOf(r, f);
    builtOn = sources.length ? <BuiltOn sources={sources} /> : undefined;
    why = { decision: "Reject", picks: PICKS.fact, run: (reason) => a.reject(reason) };
    edit = { initial: f.data.text };
    actions = [
      { label: "Approve", keys: "A", intent: "approve", detail: "Adds it to your record, where resumes, letters and ranking can use it.", note: FREE_UNDO, onSelect: a.approve },
      editAction,
      { label: "Reject", keys: "R", intent: "reject", detail: "Leaves it out of your record. What you say why steers later reads.", note: WHY, onSelect: () => setMode("why") },
    ];
    aside = addContext;
  }

  const approveAction = actions.find((x) => x.intent === "approve");
  useReviewKeys(
    {
      approve: card.type === "rewrite" || card.type === "fact" ? approveAction?.onSelect : undefined,
      edit: edit ? () => setMode("edit") : undefined,
      reject: () => setMode("why"),
      other,
    },
    keys && mode === null && !small,
  );
  useBar(small && mode === null ? { kind: "actions", actions: <ReviewActions actions={actions} aside={aside} more={more} moreLabel={`More for this ${kind.toLowerCase()}`} /> } : null);

  const done = () => setMode(null);
  const footer =
    mode === "why" && why ? (
      <ReasonField
        decision={why.decision}
        picks={why.picks}
        onDone={({ reason }) => {
          done();
          why!.run(reason);
        }}
      />
    ) : mode === "edit" && edit ? (
      <WordsField
        label="The fact"
        initial={edit.initial}
        save="Save and approve"
        detail={EXPLAIN.edit.detail}
        note={FREE_UNDO}
        onSave={(text) => {
          done();
          a.edit(text);
        }}
        onCancel={done}
      />
    ) : mode === "context" ? (
      <WordsField
        label="Context or direction"
        placeholder={EXPLAIN.context}
        save="Rewrite"
        detail={EXPLAIN.rewrite.detail}
        cost={cost}
        optional
        onSave={(note) => {
          done();
          a.rework(note);
        }}
        onCancel={done}
      />
    ) : undefined;

  // Beside a narrow item (medium screens) the footer has no room for the aside: it goes into ⋯.
  const folded = narrow && aside ? [{ label: aside.label, icon: aside.icon ?? ("add" as const), hint: cost, onSelect: aside.onSelect }, ...(more.length ? ["separator" as const] : []), ...more] : more;
  return (
    <div ref={measure}>
      <ReviewCard
        kind={kind}
        context={context}
        position={position}
        onNext={() => onStep(1)}
        onPrevious={() => onStep(-1)}
        builtOn={builtOn}
        actions={actions}
        aside={narrow ? undefined : aside}
        more={folded.length ? folded : undefined}
        moreLabel={`More for this ${kind.toLowerCase()}`}
        footer={footer}
      >
        {body}
      </ReviewCard>
    </div>
  );
}

// Two facts side by side: where each is (a 96px label on medium and up, above it on a phone), its words and its source.
function Pair({ r, rows }: { r: RecordData; rows: [string | null, Fact][] }) {
  return (
    <div className="-my-1 flex flex-col">
      {rows.map(([label, f]) => (
        <div key={f.id} className="flex flex-col gap-1 border-t py-3 first:border-t-0 first:pt-0 last:pb-0 md:flex-row md:gap-3">
          {label && <span className="shrink-0 text-body-sm leading-body-sm text-muted md:w-24">{label}</span>}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-body-md leading-body-md text-text">{f.data.text}</p>
            <span className="text-body-sm leading-body-sm text-muted">{sourceLine(r, f)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
