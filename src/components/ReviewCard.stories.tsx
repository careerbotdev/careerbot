import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { BottomBar } from "./BottomBar";
import { BuiltOn, SourceQuote, type BuiltOnSource } from "./BuiltOn";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Textarea } from "./Field";
import type { MenuEntry } from "./Menu";
import { ReviewActions, ReviewCard, ReviewCompany, ReviewKeyLegend, ReviewNext, ReviewStatement, ReviewUpdate, useReviewKeys, type ReviewAction, type ReviewAside } from "./ReviewCard";
import { toast } from "./Toast";
import { useSmall } from "./useSmall";

const meta = { title: "Patterns/Review card", component: ReviewCard } satisfies Meta<typeof ReviewCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const none = () => {};

const factActions = (run: { approve?: () => void; edit?: () => void; reject?: () => void } = {}): ReviewAction[] => [
  { label: "Approve", keys: "A", onSelect: run.approve ?? none, detail: "Adds this line to your record, where resumes and letters can use it.", note: "Free · Undo with U" },
  { label: "Edit", keys: "E", onSelect: run.edit ?? none, detail: "Change the wording before it goes in your record." },
  { label: "Reject", keys: "R", intent: "reject", onSelect: run.reject ?? none, detail: "Keeps it out of your record.", note: "Free · Undo with U" },
];
const addContext: ReviewAside = { label: "Add context", onSelect: none, detail: "Say what the line leaves out, and it’s rewritten with it." };
const factMore: MenuEntry[] = [
  { label: "Open Ironbridge story", icon: "story" },
  { label: "Copy", icon: "copy" },
  "separator",
  { label: "Set aside", icon: "setAside" },
];

const crossdock: BuiltOnSource = {
  kind: "quote",
  text: "We opened the cross-dock in the spring of 2021 with forty lanes, most of them grocery loads between Pittsburgh and Columbus.",
  source: "Ironbridge story · written Sep 8",
};

function Specimen({ children }: { children: ReactNode }) {
  return <div className="flex w-122.5 max-w-full flex-col gap-3.5">{children}</div>;
}

// Header with the kind, where it's from and the position with K and J; the statement; what it rests on; the moves,
// Amber first; and the keys under the card.
export const Anatomy: Story = {
  args: { kind: "New fact", actions: [], children: null },
  render: () => (
    <Specimen>
      <ReviewCard
        kind="New fact"
        context="Network Operations Manager, Ironbridge Logistics"
        position={{ index: 3, total: 12 }}
        onNext={none}
        onPrevious={none}
        actions={factActions()}
        aside={addContext}
        more={factMore}
        moreLabel="More for this fact"
        builtOn={<BuiltOn sources={[crossdock]} />}
      >
        <ReviewStatement>Opened Ironbridge’s Ohio Valley cross-dock and planned its first 40 lanes, most of them grocery freight between Pittsburgh and Columbus.</ReviewStatement>
      </ReviewCard>
      <ReviewKeyLegend />
    </Specimen>
  ),
};

// A company to rate, and an update shown against what it replaces.
export const OtherKinds: Story = {
  name: "Other kinds",
  args: Anatomy.args,
  render: () => (
    <Specimen>
      <ReviewCard
        kind="Company to rate"
        context="Found for Supply Chain Product"
        position={{ index: 1, total: 9 }}
        onNext={none}
        onPrevious={none}
        actions={[
          { label: "Target", keys: "T", onSelect: none, detail: "Adds Orchard Forecasting to your targets; its open roles are ranked for you.", note: "Free · Undo with U" },
          { label: "Maybe", keys: "M", onSelect: none, detail: "Keeps Orchard Forecasting in view without searching it yet." },
          { label: "Not for me", keys: "R", intent: "reject", onSelect: none, detail: "Leaves Orchard Forecasting out of your searches.", note: "Free · Undo with U" },
        ]}
      >
        <ReviewCompany
          name="Orchard Forecasting"
          line="Demand-planning software · 32 people · Series A"
          fit={{ tone: "good", title: "Fits your goals", text: "Sells forecasting software to food and beverage makers, and hires planners to run its customer pilots." }}
        />
      </ReviewCard>
      <ReviewCard
        kind="Update to a fact"
        context="Senior Supply Planning Manager, Brightwater Provisions"
        position={{ index: 2, total: 4 }}
        onNext={none}
        onPrevious={none}
        actions={factActions()}
        aside={addContext}
        more={factMore}
        moreLabel="More for this update"
        builtOn={<SourceQuote text="It held above 98% for eight quarters in a row, while the line grew by a third." source="Note · written Sep 26" />}
      >
        <ReviewUpdate now="Kept the case fill rate high." proposed="Kept the case fill rate above 98% for eight straight quarters." />
      </ReviewCard>
    </Specimen>
  ),
};

// A phone's frame: the item's header with a way back and the position, the card, and the bar holding its moves.
function Phone({ title, where, bar, children }: { title: string; where: string; bar: ReactNode; children: ReactNode }) {
  return (
    <div data-overlay-root className="relative flex h-[560px] w-[390px] max-w-full transform-gpu flex-col overflow-hidden border bg-surface">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b pr-4 pl-1">
        <Button variant="ghost" size="lg" iconOnly icon="back" aria-label="Back to Review" />
        <h2 className="min-w-0 flex-1 truncate text-title-md leading-title-md font-semibold">{title}</h2>
        <span className="text-body-sm leading-body-sm text-muted tabular-nums">{where}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      <BottomBar mode={{ kind: "actions", actions: bar }} />
    </div>
  );
}

// Swipe right to approve, left to reject; Undo follows in a toast. Shown mid-swipe: the green Approve underlay, the
// card offset and tilted. The moves sit in the bar.
export const OnAPhone: Story = {
  name: "On a phone",
  args: Anatomy.args,
  render: () => (
    <Phone title="New facts" where="3 of 12" bar={<ReviewActions actions={factActions()} aside={addContext} more={factMore} moreLabel="More for this fact" />}>
      <ReviewCard
        phone
        defaultSwipe={64}
        kind="New fact"
        context="Ironbridge Logistics"
        position={{ index: 3, total: 12 }}
        actions={factActions()}
        aside={addContext}
        more={factMore}
        builtOn={<BuiltOn sources={[crossdock]} />}
      >
        <ReviewStatement>Opened Ironbridge’s Ohio Valley cross-dock and planned its first 40 lanes, most of them grocery freight between Pittsburgh and Columbus.</ReviewStatement>
      </ReviewCard>
    </Phone>
  ),
};

type Fact = { id: string; text: string; quote: string; source: string };
const facts: Fact[] = [
  { id: "crossdock", text: "Opened Ironbridge’s Ohio Valley cross-dock and planned its first 40 lanes, most of them grocery freight between Pittsburgh and Columbus.", quote: crossdock.text, source: crossdock.source },
  {
    id: "tms",
    text: "Led the move to a new transportation management system for about 180 dispatchers and planners at four terminals.",
    quote: "The cutover happened over one weekend, and I spent the week before writing a cheat sheet for every dispatcher.",
    source: "Ironbridge story · written Sep 8",
  },
  {
    id: "empty",
    text: "Cut empty miles by 11% by matching backhauls between terminals that had been planning them separately.",
    quote: "Each terminal booked its own backhauls, so our trucks passed each other empty on the turnpike.",
    source: "Ironbridge story · written Sep 8",
  },
  {
    id: "claims",
    text: "Traced a rise in damage claims to one pallet supplier and replaced it, lowering claims costs about $380,000 a year.",
    quote: "Every claim photo showed the same broken pallets, so I went looking for whoever sold them to us.",
    source: "Ironbridge story · written Sep 10",
  },
];

// Working through a group: A, E, R, J, K and U work (U through the toast), the position and what's next follow, and
// on a phone the card swipes and the bar holds the moves.
function Working() {
  const small = useSmall();
  const [index, setIndex] = useState(0);
  const [decided, setDecided] = useState<Record<string, "approved" | "rejected">>({});
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState<Record<string, string>>({});
  const open = facts.filter((f) => !decided[f.id]);
  const at = Math.min(index, Math.max(open.length - 1, 0));
  const fact = open[at];
  const next = open[at + 1];

  const decide = (outcome: "approved" | "rejected") => {
    if (!fact) return;
    const id = fact.id;
    setDecided((d) => ({ ...d, [id]: outcome }));
    toast({
      message: outcome === "approved" ? "Approved" : "Rejected",
      icon: outcome === "approved" ? "approve" : "reject",
      action: {
        label: "Undo",
        key: "U",
        run: () =>
          setDecided((d) => {
            const rest = { ...d };
            delete rest[id];
            return rest;
          }),
      },
    });
  };
  const step = (by: number) => setIndex(Math.max(0, Math.min(open.length - 1, at + by)));
  const actions = factActions({ approve: () => decide("approved"), edit: () => setEditing(true), reject: () => decide("rejected") });

  useReviewKeys({ approve: () => decide("approved"), edit: () => setEditing(true), reject: () => decide("rejected"), next: () => step(1), previous: () => step(-1) }, !!fact && !editing);

  if (!fact)
    return (
      <div className="h-80 w-122.5 max-w-full border">
        <EmptyState icon="done" title="No new facts left">
          Approved ones are in your record.
        </EmptyState>
      </div>
    );

  const card = (
    <ReviewCard
      key={fact.id}
      kind="New fact"
      context={small ? "Ironbridge Logistics" : "Network Operations Manager, Ironbridge Logistics"}
      position={{ index: at + 1, total: open.length }}
      onNext={() => step(1)}
      onPrevious={() => step(-1)}
      actions={actions}
      aside={addContext}
      more={factMore}
      moreLabel="More for this fact"
      builtOn={<BuiltOn sources={[{ kind: "quote", text: fact.quote, source: fact.source }]} />}
      footer={
        editing && (
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" keys="⌘+Enter" onClick={() => setEditing(false)}>
              Save
            </Button>
          </div>
        )
      }
    >
      {editing ? (
        <Textarea
          aria-label="Fact"
          rows={3}
          autoFocus
          value={text[fact.id] ?? fact.text}
          onChange={(e) => setText((t) => ({ ...t, [fact.id]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && e.metaKey)) setEditing(false);
          }}
        />
      ) : (
        <ReviewStatement>{text[fact.id] ?? fact.text}</ReviewStatement>
      )}
    </ReviewCard>
  );

  if (small)
    return (
      <Phone title="New facts" where={`${at + 1} of ${open.length}`} bar={<ReviewActions actions={actions} aside={addContext} more={factMore} moreLabel="More for this fact" />}>
        {card}
      </Phone>
    );
  return (
    <div className="flex w-122.5 max-w-full flex-col gap-3.5">
      {card}
      {next && <ReviewNext group="New facts" title={text[next.id] ?? next.text} line="Network Operations Manager, Ironbridge Logistics" onOpen={() => step(1)} />}
      <ReviewKeyLegend />
    </div>
  );
}

export const WorkingThroughAGroup: Story = { name: "Working through a group", args: Anatomy.args, render: () => <Working /> };
