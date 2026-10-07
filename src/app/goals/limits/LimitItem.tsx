"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BuiltOn, BuiltOnPeek, SourceQuote, type BuiltOnSource } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import type { ScreenSize } from "@/components/Panes";
import { Popover } from "@/components/Popover";
import { Properties, Property } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { ReviewActions, ReviewCard, ReviewStatement, useReviewKeys, type ReviewAction } from "@/components/ReviewCard";
import { SegmentedControl } from "@/components/SegmentedControl";
import { StatusTag } from "@/components/StatusTag";
import { Switch } from "@/components/Switch";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { aboutUsd } from "../../costs";
import { useBar, useConfirm } from "../../shell/ShellContext";
import { failed, inlineLink, ItemBody, ItemHead, ItemTop, Notice, onItemKey, type Position, Section, ValueRows } from "../ui";
import { AddLimit, LimitForm } from "./LimitForm";
import { allWords, catches, clashWith, conditionsOf, effectLong, type Effects, headScope, kindName, type Limit, roles, ruleFieldRows, scopeWords, versionOf, whenWords } from "./words";

// One limit open: its sentence and what it filters by (the rule), what that does to your roles, where it came from and
// your notes, with Details beside. Approved, it has How firm and On beside the title; proposed, it's a review card;
// rejected, it can be restored. ?edit=1 turns the body into the form (E), ?add=1 opens Add a limit instead.

const REJECT_PICKS = ["Too strict", "Not a real limit", "Already covered", "Wrong reading"];
// Explainers for what a limit offers in several places: its pane, its ⋯ menu, its review card and the phone's bar.
const RESTORE = { detail: "Puts it back with the proposed limits, to approve or change.", note: "Free · Undo with U" };
const REJECT = { detail: "Nothing filters by it; say why if you like, so a new read of your goals doesn’t propose it again.", note: "Free · Undo with U" };
const APPROVE = { detail: "Filters and ranks your roles by this limit from now on.", note: "Free · Undo with U" };
const EDIT = "Change its sentence, how firm it is, where it applies and its rule. Saving approves it.";
const FIRMNESS = [
  { value: "firm" as const, label: "Firm" },
  { value: "preference" as const, label: "Preference" },
];

type Shared = {
  limits: Limit[];
  directions: string[];
  effects: Effects | undefined;
  position: Position | null;
  size: ScreenSize;
  onBack: () => void;
};

export function LimitItem({
  limit: l,
  editing,
  focus,
  onEdit,
  onEditDone,
  onGone,
  ...shared
}: Shared & { limit: Limit; editing: boolean; focus: string | null; onEdit: (field?: string) => void; onEditDone: (saved: boolean) => void; onGone: () => void }) {
  const { limits, directions, effects, position, size, onBack } = shared;
  const small = size === "small";
  const router = useRouter();
  const review = useMutation(api.extract.review);
  const setOn = useMutation(api.goals.setLimitOn);
  const update = useMutation(api.goals.updateLimit);
  const removeLimit = useMutation(api.goals.removeLimit);
  const ask = useConfirm();
  const [why, setWhy] = useState(false);
  const d = l.data;
  const firm = d.firm !== false;
  const on = d.off !== true;
  const handAdded = l.sources.length === 0;
  const label = d.label;

  // goals.items lists proposed, approved and rejected limits only.
  const was = l.status === "approved" || l.status === "rejected" ? l.status : "proposed";
  const decide = (status: "approved" | "proposed" | "rejected", message: string, note?: string) =>
    void review({ id: l.id, status, ...(note ? { note } : {}) }).then(
      () => toast({ message, icon: status === "rejected" ? "reject" : status === "approved" ? "approve" : "undo", action: { label: "Undo", key: "U", run: () => void review({ id: l.id, status: was }).catch((e: unknown) => failed(e)) } }),
      (e: unknown) => failed(e),
    );
  const approve = () => decide("approved", `Approved: ${label}`);
  const unapprove = () => decide("proposed", `Back to proposed: ${label}`);
  const reject = (reason?: string) => {
    setWhy(false);
    decide("rejected", `Rejected: ${label}`, reason);
  };
  const restore = () => decide("proposed", `Restored: ${label}`);
  const switchOn = (next: boolean) =>
    void setOn({ id: l.id, on: next }).then(
      () => toast({ message: `${next ? "On" : "Off"}: ${label}`, icon: next ? "approve" : "undo", action: { label: "Undo", key: "U", run: () => void setOn({ id: l.id, on: !next }).catch((e: unknown) => failed(e)) } }),
      (e: unknown) => failed(e),
    );
  // How firm, saved with everything else as it is.
  const setFirm = (next: boolean) => {
    const as = (f: boolean) => ({ id: l.id, value: d.value, firm: f, rule: d.rule ?? null, appliesTo: d.appliesTo ?? [], when: conditionsOf(d) });
    void update(as(next)).then(
      () => toast({ message: `${next ? "Firm" : "A preference"}: ${label}`, icon: "approve", action: { label: "Undo", key: "U", run: () => void update(as(!next)).catch((e: unknown) => failed(e)) } }),
      (e: unknown) => failed(e),
    );
  };
  const remove = () =>
    void ask({ title: "Delete this limit?", body: `${label}: “${d.value}” Nothing filters by it after this.`, confirmLabel: "Delete limit" }).then((yes) => {
      if (!yes) return;
      void removeLimit({ id: l.id }).then(() => {
        toast({ message: `Deleted: ${label}`, icon: "delete" });
        onGone();
      }, (e: unknown) => failed(e));
    });

  const proposed = l.status === "proposed";
  const approved = l.status === "approved";
  const rejected = l.status === "rejected";
  const menu: MenuEntry[] = rejected
    ? [{ label: "Restore", icon: "undo", detail: RESTORE.detail, note: RESTORE.note, onSelect: restore }]
    : [
        ...(proposed ? [{ label: "Approve", icon: "approve" as const, keys: "A", detail: APPROVE.detail, note: APPROVE.note, onSelect: approve }] : []),
        { label: "Edit", icon: "edit", keys: "E", detail: EDIT, note: "Free", onSelect: () => onEdit() },
        ...(approved ? [{ label: "Undo approval", icon: "undo" as const, detail: "Puts it back with the proposed limits; nothing filters by it until you approve it again.", note: "Free · Undo with U", onSelect: unapprove }] : []),
        { label: "Reject…", icon: "reject", keys: "R", detail: REJECT.detail, note: REJECT.note, onSelect: () => setWhy(true) },
        ...(proposed ? ["separator" as const, { label: "Open in Review", icon: "review" as const, detail: "Opens Review, where it waits with what else is proposed.", note: "Free", onSelect: () => router.push("/review") }] : []),
        ...(handAdded ? ["separator" as const, { label: "Delete", icon: "delete" as const, tone: "danger" as const, detail: "Deletes this limit you added; nothing filters by it after.", note: "Free · Asks first · can’t be undone", onSelect: remove }] : []),
      ];

  // E and R on an approved limit; A, E and R on a proposed one (as on every review card).
  useEffect(() => {
    if (editing || why || !approved) return;
    const onKey = onItemKey({ e: () => onEdit(), r: () => setWhy(true) });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useReviewKeys({ approve, edit: () => onEdit(), reject: () => setWhy(true) }, proposed && !editing && !why);

  const reviewActions: ReviewAction[] = [
    { label: "Approve", keys: "A", intent: "approve", detail: APPROVE.detail, note: APPROVE.note, onSelect: approve },
    { label: "Edit", keys: "E", detail: "Change it before approving; saving approves it.", note: "Free", onSelect: () => onEdit() },
    { label: "Reject", keys: "R", intent: "reject", detail: REJECT.detail, note: REJECT.note, onSelect: () => setWhy(true) },
  ];
  const stale = !!d.sentenceChanged;
  const phoneBar = () => {
    if (!small || editing) return null;
    if (why) return { kind: "reason" as const, decision: `Reject ${label}`, picks: REJECT_PICKS, onDone: ({ reason }: { reason?: string }) => reject(reason) };
    if (proposed) return { kind: "actions" as const, actions: <ReviewActions actions={reviewActions} more={menu} moreLabel={`More for ${label}`} /> };
    const more = <Menu key="more" label={`More for ${label}`} title={label} items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />;
    if (rejected)
      return {
        kind: "actions" as const,
        actions: (
          <>
            {more}
            <Button size="lg" variant="primary" className="flex-1" icon="undo" detail={RESTORE.detail} note={RESTORE.note} onClick={restore}>
              Restore
            </Button>
          </>
        ),
      };
    return {
      kind: "actions" as const,
      actions: (
        <>
          {more}
          <Button size="lg" variant={stale ? "secondary" : "primary"} className={stale ? "" : "flex-1"} detail={EDIT} note="Free" onClick={() => onEdit()}>
            Edit
          </Button>
          {stale && <UpdateRule id={l.id} size="lg" />}
        </>
      ),
    };
  };
  useBar(phoneBar());

  const version = versionOf(l);
  const quotes: BuiltOnSource[] = l.sources.flatMap((s) => s.quotes.map((q) => ({ kind: "quote" as const, text: q, source: `Goals · version ${s.version}`, href: `/goals?version=${s.version}` })));
  const line = `${headScope(d)} · ${editing ? "editing" : rejected ? "rejected" : proposed ? "proposed" : "approved"}`;

  const details = (columns: 1 | 2, className: string) => (
    <Properties columns={columns} className={className}>
      <Property label="Kind">{kindName(d.kind)}</Property>
      <Property label="Applies to">{scopeWords(d.appliesTo)}</Property>
      <Property label="Only when">{whenWords(d)}</Property>
      <Property label="From">
        {version !== null ? (
          <Link href={`/goals?version=${version}`} className={`tap self-start ${inlineLink}`}>
            Goals · version {version}
          </Link>
        ) : (
          "You added it"
        )}
      </Property>
      {editing && d.note && <Property label="Note">{d.note}</Property>}
      {rejected && d.rejectedBecause && <Property label="Why rejected">{d.rejectedBecause}</Property>}
    </Properties>
  );

  let body: ReactNode;
  if (editing)
    body = <LimitForm key={l.id} target={{ limit: l }} limits={limits} directions={directions} effects={effects} focus={focus} small={small} onSaved={() => onEditDone(true)} onCancel={() => onEditDone(false)} />;
  else if (proposed)
    body = (
      <>
        <ReviewCard
          kind="Proposed limit"
          context={version !== null ? `Goals · version ${version}` : undefined}
          actions={reviewActions}
          more={menu}
          moreLabel={`More for ${label}`}
          builtOn={quotes.length > 0 ? <BuiltOn sources={quotes} count={quotes.length} /> : undefined}
          footer={why && !small ? <ReasonField decision={`Reject ${label}`} picks={REJECT_PICKS} onDone={({ reason }) => reject(reason)} /> : undefined}
        >
          <ReviewStatement>{d.value}</ReviewStatement>
          {d.note && <p className="text-body-sm leading-body-sm text-muted">{d.note}</p>}
          <ProposedEffect limit={l} />
          {(d.clash || clashWith(limits, { id: l.id, kind: d.kind, appliesTo: d.appliesTo ?? [], when: conditionsOf(d) })) && <ClashNotice limit={l} limits={limits} />}
        </ReviewCard>
        <RuleSection limit={l} onEdit={onEdit} />
        <Notes id={l.id} />
      </>
    );
  else
    body = (
      <>
        {stale && approved && (
          <Notice tone="caution" title="You changed the sentence after this rule was set" actions={<><UpdateRule id={l.id} /><KeepRule id={l.id} /></>}>
            The rule still filters by the old sentence.
          </Notice>
        )}
        <div className="flex flex-col gap-2">
          <p className={`text-title-md leading-6 font-medium ${rejected ? "text-muted" : "text-text"}`}>{d.value}</p>
          {d.note && <p className="text-body-sm leading-body-sm text-muted">{d.note}</p>}
          {(d.edited || quotes.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {d.edited && <span className="text-body-sm leading-body-sm text-muted">Your wording · edited</span>}
              {quotes.length > 0 && <BuiltOnPeek sources={quotes} onEdit={approved ? () => onEdit() : undefined} />}
            </div>
          )}
        </div>
        <RuleSection limit={l} onEdit={approved ? onEdit : undefined} />
        {approved && <FiltersSection limit={l} effects={effects} />}
        {l.sources.length > 0 && (
          <Section
            label="Sources"
            count={quotes.length}
            extra={version !== null ? <Link href={`/goals?version=${version}`} className={`text-label leading-label text-muted ${inlineLink}`}>Goals · version {version}</Link> : undefined}
          >
            <div className="flex flex-col gap-2.5">
              {quotes.map((q) => (
                <SourceQuote key={q.text} text={q.text} source={q.source} />
              ))}
            </div>
          </Section>
        )}
        <Notes id={l.id} />
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop small={small} position={position} back={{ label: "Limits", onBack }} menu={small || editing ? [] : menu} title={label} />
      <ItemHead icon="limits" title={kindName(d.kind)} line={line} size={size}>
        {approved && !editing && (
          <>
            <Tooltip content="How firm" detail="Firm hides roles that fail it. A preference keeps them, ranked lower." note="Free · Undo with U">
              <span className="inline-flex">
                <SegmentedControl label="How firm" hideLabel value={firm ? "firm" : "preference"} onChange={(v) => setFirm(v === "firm")} options={FIRMNESS} />
              </span>
            </Tooltip>
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
            <Tooltip content={on ? "Switch off" : "Switch on"} detail={on ? "Kept and shown, but nothing filters or ranks by it until you switch it on." : "Filters and ranks your roles by it again."} note="Free · Undo with U">
              <span className="inline-flex items-center gap-2">
                <Switch label={`Use ${label}`} hideLabel checked={on} onChange={switchOn} />
                <span aria-hidden="true" className="text-body-sm leading-body-sm font-medium text-text">
                  {on ? "On" : "Off"}
                </span>
              </span>
            </Tooltip>
          </>
        )}
        {rejected && !small && (
          <Button icon="undo" detail={RESTORE.detail} note={RESTORE.note} onClick={restore}>
            Restore
          </Button>
        )}
        {why && approved && !small && (
          <div className="basis-full pt-1">
            <ReasonField decision={`Reject ${label}`} picks={REJECT_PICKS} onDone={({ reason }) => reject(reason)} className="max-w-[560px]" />
          </div>
        )}
      </ItemHead>
      <ItemBody size={size} details={details}>
        {body}
      </ItemBody>
    </div>
  );
}

// Add a limit, in the item pane.
export function AddPane({ onSaved, onCancel, ...shared }: Shared & { onSaved: (id: Id<"items">) => void; onCancel: () => void }) {
  const { size, position, onBack } = shared;
  const small = size === "small";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop small={small} position={position} back={{ label: "Limits", onBack }} menu={[]} title="Add a limit" />
      <ItemHead icon="limits" title="Add a limit" line="Approved as you save it" size={size} />
      <ItemBody size={size}>
        <AddLimit limits={shared.limits} directions={shared.directions} effects={shared.effects} small={small} onSaved={onSaved} onCancel={onCancel} />
      </ItemBody>
    </div>
  );
}

// Read the rule again from the sentence as it reads now, with what that has cost before.
function UpdateRule({ id, size = "sm" }: { id: Id<"items">; size?: "sm" | "lg" }) {
  const updateRule = useMutation(api.goals.updateRule);
  const costs = useQuery(api.estimates.costs, {});
  const amount = aboutUsd(costs?.limitRule);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    void updateRule({ id }).then(
      () => toast({ message: "Reading the rule from your sentence", icon: "running" }),
      (e: unknown) => {
        setBusy(false);
        failed(e, "Couldn’t start.");
      },
    );
  };
  const button = { size, icon: "tryAgain" as const, loading: busy, loadingLabel: "Updating", detail: "Reads the rule again from the sentence as it reads now; roles are filtered by the new rule.", onClick: run };
  if (size === "lg")
    return (
      <Button {...button} variant="primary" className="flex-1" note={amount ?? "Uses your AI budget"}>
        Update the rule
      </Button>
    );
  return amount ? (
    <CostAction {...button} variant="secondary" amount={amount}>
      Update the rule
    </CostAction>
  ) : (
    <Button {...button} variant="secondary" note="Uses your AI budget">
      Update the rule
    </Button>
  );
}

function KeepRule({ id }: { id: Id<"items"> }) {
  const keepRule = useMutation(api.goals.keepRule);
  return (
    <Button size="sm" variant="ghost" detail="Keeps filtering by the rule as it is, and stops asking." note="Free" onClick={() => void keepRule({ id }).catch((e: unknown) => failed(e))}>
      Keep the rule
    </Button>
  );
}

// The rule a search checks, one row per field; a value opens the form at that field.
function RuleSection({ limit: l, onEdit }: { limit: Limit; onEdit?: (field?: string) => void }) {
  const d = l.data;
  const rows = ruleFieldRows(d.kind, d.rule);
  const tag = d.sentenceChanged ? <StatusTag tone="problem">Out of date</StatusTag> : undefined;
  let content: ReactNode;
  if (d.ruleStale) content = <p className="text-body-sm leading-body-sm text-muted">Reading the rule from your sentence…</p>;
  else if (!rows.length)
    content = (
      <div className="flex flex-col items-start gap-3 border-t pt-2.5">
        <p className="text-body-sm leading-body-sm text-muted">This limit has no rule yet, so nothing is filtered by it.</p>
        {l.status === "approved" && <UpdateRule id={l.id} />}
      </div>
    );
  else
    content = (
      <ValueRows
        rows={rows.map((r) => ({
          label: r.label,
          value: onEdit ? (
            <Tooltip content={`Change ${r.label.toLowerCase()}`} keys="E">
              <button
                type="button"
                onClick={() => onEdit(r.key)}
                className="tap self-start rounded-sm text-left font-medium text-text underline decoration-control-border decoration-dashed decoration-1 underline-offset-4 transition-colors duration-100 hover:decoration-text"
              >
                {r.value}
              </button>
            </Tooltip>
          ) : (
            <span className="font-medium">{r.value}</span>
          ),
        }))}
      />
    );
  return (
    <Section label="Rule" tag={tag}>
      {content}
    </Section>
  );
}

// What it does to your roles, and what all your limits do together.
function FiltersSection({ limit: l, effects }: { limit: Limit; effects: Effects | undefined }) {
  const d = l.data;
  const firm = d.firm !== false;
  const fails = effects?.limits.find((x) => x.id === l.id)?.fails;
  const what = catches(d.kind, d.rule);
  const row = "flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t py-2.5 text-body-sm leading-body-sm";
  return (
    <Section label="What it filters">
      <div className="flex flex-col">
        <div className={row}>
          {fails === undefined ? (
            <span className="text-muted">Counting…</span>
          ) : (
            <>
              <span className="font-medium text-text tabular-nums">{d.off ? `Off. When on, ${effectLong(firm, fails).toLowerCase()}` : effectLong(firm, fails)}</span>
              {what && <span className="min-w-0 text-muted">{what}</span>}
              <span className="flex-1" />
              {fails > 0 && <SeeThem limit={l} firm={firm} />}
            </>
          )}
        </div>
        {effects && (
          <div className={`${row} border-b`}>
            <span className="font-medium text-text">All your limits</span>
            <span className="text-muted tabular-nums">{allWords(effects)}</span>
          </div>
        )}
      </div>
    </Section>
  );
}

// The roles a limit fails, each opening in Pursuits.
function SeeThem({ limit: l, firm }: { limit: Limit; firm: boolean }) {
  const [open, setOpen] = useState(false);
  const list = useQuery(api.goals.hiddenBy, open ? { id: l.id } : "skip");
  const title = firm ? "Roles it hides" : "Roles it ranks lower";
  return (
    <Popover
      title={title}
      showTitle
      open={open}
      onOpenChange={setOpen}
      align="end"
      width={360}
      trigger={
        <button type="button" className={`tap text-body-sm leading-body-sm text-text ${inlineLink}`}>
          See them
        </button>
      }
    >
      {!list ? (
        <p className="text-body-sm leading-body-sm text-muted">Finding them…</p>
      ) : (
        <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
          {list.map((r) => (
            <li key={`${r.postingId}:${r.directionId ?? ""}`}>
              <Link
                href={`/pursuits?status=all&role=${r.postingId}${r.directionId ? `&direction=${r.directionId}` : ""}`}
                className="flex min-h-11 flex-col justify-center rounded-sm px-1 py-1.5 transition-colors duration-100 hover:bg-subtle md:min-h-9"
              >
                <span className="truncate text-body-sm leading-body-sm font-medium text-text">{r.title}</span>
                <span className="truncate text-body-sm leading-body-sm text-muted">{r.company}</span>
              </Link>
            </li>
          ))}
          {list.length === 50 && <li className="px-1 pt-1.5 text-body-sm leading-body-sm text-muted">The first 50. All of them are in Pursuits.</li>}
        </ul>
      )}
    </Popover>
  );
}

// What a proposed limit would do once approved.
function ProposedEffect({ limit: l }: { limit: Limit }) {
  const d = l.data;
  const firm = d.firm !== false;
  const probe = useQuery(api.goals.effects, { draft: { kind: d.kind, firm, rule: d.rule ?? null, appliesTo: d.appliesTo ?? [], when: conditionsOf(d) } });
  if (!probe?.draft) return null;
  const what = catches(d.kind, d.rule);
  return (
    <p className="text-body-sm leading-body-sm text-muted">
      Approved, it would {firm ? `hide ${roles(probe.draft.fails)}` : `rank ${roles(probe.draft.fails)} lower`}
      {what ? ` ${what}` : ""}.
    </p>
  );
}

// Another limit of the same kind over the same directions: approving both makes them fight.
function ClashNotice({ limit: l, limits }: { limit: Limit; limits: Limit[] }) {
  const other = clashWith(limits, { id: l.id, kind: l.data.kind, appliesTo: l.data.appliesTo ?? [], when: conditionsOf(l.data) });
  return (
    <Notice tone="caution" title={other ? `Clashes with ${other.limit.data.label}` : "Clashes with another limit"}>
      {other ? "Both cover the same roles. Keep one of them, or set Only when on one." : "Another limit read from your goals covers the same thing. Keep one, or set Only when on the other."}
    </Notice>
  );
}

function Notes({ id }: { id: Id<"items"> }) {
  const subject = { kind: "item" as const, id };
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const edit = useMutation(api.notes.edit);
  const remove = useMutation(api.notes.remove);
  return (
    <Section label="Notes" count={notes?.length || undefined}>
      <NoteBlock
        notes={notes ?? []}
        onAdd={(text) => void add({ subject, text }).catch((e: unknown) => failed(e))}
        onEdit={(noteId, text) => void edit({ id: noteId as Id<"notes">, text }).catch((e: unknown) => failed(e))}
        onDelete={(noteId) => void remove({ id: noteId as Id<"notes"> }).catch((e: unknown) => failed(e))}
      />
    </Section>
  );
}
