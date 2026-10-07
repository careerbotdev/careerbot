import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { BottomBar } from "./BottomBar";
import { List, ListRow } from "./ListRow";
import { Menu } from "./Menu";
import { PaneHeader } from "./Panes";
import { ProgressBar } from "./Progress";
import { ReasonField } from "./ReasonField";
import { RejectedRow } from "./RejectedRow";
import { ReviewCard, ReviewCompany, ReviewKeyLegend, useReviewKeys, type ReviewAction } from "./ReviewCard";
import { ScoreBadge, type FitLevel } from "./ScoreBadge";
import { StatusTag } from "./StatusTag";
import { toast, ToastView } from "./Toast";

// After Reject, Not for me, Set aside, Keep separate or Discard, a Why? field takes focus right where you are. Enter
// saves, Esc skips; Undo still follows.
const meta = { title: "Patterns/Reasons" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const rolePicks = ["Pay", "Location", "Seniority", "Not the work", "Company"];
const companyPicks = ["Not the work", "Company", "Size", "Location", "Industry"];

// Focus held still for a specimen: the field's box on the desktop, the field itself on a phone.
const heldBox =
  "[&_.border:has(>input)]:border-steel! [&_.border:has(>input)]:ring-1 [&_.border:has(>input)]:ring-steel [&_input.border]:border-steel! [&_input.border]:ring-1 [&_input.border]:ring-steel";
const heldField = "[&_input]:border-steel! [&_input]:ring-1 [&_input]:ring-steel";

type Role = { id: string; score: number; level: FitLevel; title: string; line: string; fit?: { title: string; text: string } };
const roles: Role[] = [
  {
    id: "northgate",
    score: 72,
    level: "some",
    title: "Distribution Operations Manager",
    line: "Northgate Grocers · Cleveland, OH · $115k–$125k base",
    fit: { title: "Some fit for Logistics Operations", text: "Runs the grocery distribution you know from Ironbridge; the base is under your floor." },
  },
  { id: "orchard", score: 86, level: "strong", title: "Solutions Consultant, Demand Planning", line: "Orchard Forecasting · Pittsburgh or remote" },
  {
    id: "parcelpoint",
    score: 61,
    level: "some",
    title: "Hub Supervisor",
    line: "Parcelpoint · Philadelphia · $90k–$100k base",
    fit: { title: "Some fit for Logistics Operations", text: "Runs one delivery hub’s night shift; you’d be supervising a crew, not planning a network." },
  },
  { id: "lumen", score: 88, level: "strong", title: "Founding Solutions Lead", line: "Lumen Planning · Remote, US · $160k–$185k base" },
  {
    id: "kestrel",
    score: 70,
    level: "some",
    title: "Network Planning Manager",
    line: "Kestrel Freight · Chicago, IL · $140k–$155k base",
    fit: { title: "Some fit for Network Design", text: "Plans brokered lanes across the Midwest; on-site in Chicago four days a week." },
  },
  { id: "meridian", score: 84, level: "strong", title: "Solutions Consultant, Food & Beverage", line: "Meridian Coldchain · Chicago, IL · $150k–$180k base" },
];

// A role on the card: its score and title, then how it fits.
function RoleBody({ role }: { role: Role }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <ScoreBadge score={role.score} level={role.level} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-title-md leading-title-md font-semibold text-text">{role.title}</span>
          <span className="text-body-sm leading-body-sm text-muted">{role.line}</span>
        </div>
      </div>
      {role.fit && (
        <div className="flex flex-col gap-1 border-l-2 border-caution pl-3.5">
          <span className="text-body-sm leading-body-sm font-semibold text-caution-text">{role.fit.title}</span>
          <span className="text-body-sm leading-body-sm text-text">{role.fit.text}</span>
        </div>
      )}
    </>
  );
}

const moves = (on: { start?: () => void; interested?: () => void; notForMe?: () => void } = {}): ReviewAction[] => [
  { label: "Start", keys: "S", onSelect: on.start ?? (() => {}), intent: "approve" },
  { label: "Interested", keys: "I", onSelect: on.interested ?? (() => {}) },
  { label: "Not for me", keys: "R", onSelect: on.notForMe ?? (() => {}), intent: "reject" },
];

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex w-97 flex-col gap-2.5">
      <p className="flex items-center gap-2">
        <span className="font-mono text-mono leading-mono font-medium text-muted">{n}</span>
        <span className="text-body-sm leading-body-sm font-medium text-text">{title}</span>
      </p>
      {children}
    </div>
  );
}

// On the review card: R, type, Enter. The field takes the actions' place; after Enter the next card comes up and the
// toast carries Undo.
export const OnTheReviewCard: Story = {
  name: "On the review card: R, type, Enter",
  render: () => (
    <div className="flex flex-wrap items-start gap-6.5">
      <Step n={1} title="Press R">
        <ReviewCard kind="New role" context="Logistics Operations" position={{ index: 4, total: 9 }} phone={false} actions={moves()}>
          <RoleBody role={roles[0]} />
        </ReviewCard>
      </Step>
      <Step n={2} title="Pick or type, then Enter">
        <ReviewCard
          kind="New role"
          context="Logistics Operations"
          position={{ index: 4, total: 9 }}
          phone={false}
          actions={moves()}
          footer={<ReasonField picks={rolePicks} defaultPick="Pay" defaultValue="Base under my floor" autoFocus={false} onDone={() => {}} className={heldBox} />}
        >
          <RoleBody role={roles[0]} />
        </ReviewCard>
      </Step>
      <Step n={3} title="Next card, with Undo">
        <div className="flex flex-col gap-2.5">
          <ReviewCard kind="New role" context="Logistics Operations" position={{ index: 5, total: 9 }} phone={false} actions={moves()}>
            <RoleBody role={roles[1]} />
          </ReviewCard>
          <ToastView toast={{ message: "Not for me · Pay", icon: "reject", action: { label: "Undo", key: "U", run: () => {} } }} />
        </div>
      </Step>
    </div>
  ),
};

// Live: R opens the field. Type, or press 1–5 while it's empty, then Enter; Esc skips. The decision is saved with its
// reason in one go, the next card comes up, and U undoes it.
function LiveCards() {
  const [index, setIndex] = useState(0);
  const [asking, setAsking] = useState(false);
  const role = roles[index];
  const decide = (message: string) => {
    const at = index;
    setAsking(false);
    setIndex(Math.min(at + 1, roles.length - 1));
    toast({ message, icon: message.startsWith("Not for me") ? "reject" : "approve", action: { label: "Undo", key: "U", run: () => setIndex(at) } });
  };
  const on = {
    start: () => decide(`Started ${role.title}`),
    interested: () => decide(`Interested in ${role.title}`),
    notForMe: () => setAsking(true),
  };
  useReviewKeys(
    {
      reject: on.notForMe,
      next: () => setIndex((i) => Math.min(i + 1, roles.length - 1)),
      previous: () => setIndex((i) => Math.max(i - 1, 0)),
      other: { s: on.start, i: on.interested },
    },
    !asking,
  );
  return (
    <div className="flex w-174 max-w-full flex-col gap-4">
      <ReviewCard
        kind="New role"
        context="Logistics Operations"
        position={{ index: index + 4, total: 9 }}
        onNext={() => setIndex((i) => Math.min(i + 1, roles.length - 1))}
        onPrevious={() => setIndex((i) => Math.max(i - 1, 0))}
        actions={moves(on)}
        footer={asking ? <ReasonField picks={rolePicks} onDone={({ reason }) => decide(reason ? `Not for me · ${reason}` : "Not for me")} /> : undefined}
      >
        <RoleBody role={role} />
      </ReviewCard>
      <ReviewKeyLegend
        items={[
          ["S", "Start"],
          ["I", "Interested"],
          ["R", "Not for me"],
          ["J", "Next"],
          ["K", "Previous"],
          ["U", "Undo"],
        ]}
      />
    </div>
  );
}
export const OnTheReviewCardLive: Story = { name: "On the review card, live", render: () => <LiveCards /> };

type Pursuit = { id: string; score: number; level: FitLevel; title: string; line: string; tag: string; tone: "neutral" | "good"; meta: string };
const pursuits: Pursuit[] = [
  { id: "kestrel", score: 79, level: "some", title: "Network Planning Manager", line: "Kestrel Freight · Chicago, IL", tag: "Preparing", tone: "neutral", meta: "Letter to write" },
  { id: "northgate", score: 72, level: "some", title: "Distribution Operations Manager", line: "Northgate Grocers · Cleveland, OH", tag: "Interested", tone: "neutral", meta: "Saved Sep 24" },
  { id: "parcelpoint", score: 64, level: "some", title: "Head of Operations", line: "Parcelpoint · Philadelphia or remote", tag: "Offer", tone: "good", meta: "Reply by Oct 2" },
];

// In a row: R on a row opens the same field under it.
export const InARow: Story = {
  name: "In a row",
  render: () => (
    <List label="Pursuits" className="w-141.5 max-w-full">
      {pursuits.map((p) =>
        p.id === "northgate" ? (
          <ListRow
            key={p.id}
            title={p.title}
            line={p.line}
            lead={<ScoreBadge score={p.score} level={p.level} />}
            tag={<StatusTag tone="neutral">Not for me</StatusTag>}
            below={<ReasonField picks={rolePicks} autoFocus={false} onDone={() => {}} className={heldBox} />}
          />
        ) : (
          <ListRow key={p.id} title={p.title} line={p.line} lead={<ScoreBadge score={p.score} level={p.level} />} tag={<StatusTag tone={p.tone}>{p.tag}</StatusTag>} meta={p.meta} />
        ),
      )}
    </List>
  ),
};

// Live: move with J and K, press R on a row, then pick or type and Enter (or Esc). The row stays where it is with its
// reason, Restore on hover; U undoes.
function LiveRows() {
  const [asking, setAsking] = useState<string | null>(null);
  const [turnedDown, setTurnedDown] = useState<Record<string, string | undefined>>({});
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (asking || e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
    const row = (e.target as Element).closest("[data-row]");
    const i = row ? [...e.currentTarget.querySelectorAll("[data-row]")].indexOf(row) : -1;
    if (i < 0 || pursuits[i].id in turnedDown) return;
    e.preventDefault();
    setAsking(pursuits[i].id);
  };
  const restore = (id: string) =>
    setTurnedDown((t) => {
      const rest = { ...t };
      delete rest[id];
      return rest;
    });
  return (
    <div onKeyDown={onKeyDown} className="w-141.5 max-w-full">
      <List label="Pursuits">
        {pursuits.map((p) => {
          const lead = <ScoreBadge score={p.score} level={p.level} />;
          if (p.id in turnedDown) return <RejectedRow key={p.id} title={p.title} line={p.line} lead={lead} decision="Not for me" reason={turnedDown[p.id]} onRestore={() => restore(p.id)} />;
          return (
            <ListRow
              key={p.id}
              title={p.title}
              line={p.line}
              lead={lead}
              tag={<StatusTag tone={asking === p.id ? "neutral" : p.tone}>{asking === p.id ? "Not for me" : p.tag}</StatusTag>}
              meta={asking === p.id ? undefined : p.meta}
              below={
                asking === p.id ? (
                  <ReasonField
                    picks={rolePicks}
                    onDone={({ reason }) => {
                      setAsking(null);
                      setTurnedDown((t) => ({ ...t, [p.id]: reason }));
                      toast({ message: reason ? `Not for me · ${reason}` : "Not for me", icon: "reject", action: { label: "Undo", key: "U", run: () => restore(p.id) } });
                    }}
                  />
                ) : undefined
              }
            />
          );
        })}
      </List>
    </div>
  );
}
export const InARowLive: Story = { name: "In a row, live", render: () => <LiveRows /> };

// Review, large: the decision named above the field ("Not for me · why?"), the keys under the card.
export const ReviewLarge: Story = {
  name: "Review, large",
  render: () => (
    <div className="flex w-174 max-w-full flex-col gap-4">
      <ReviewCard
        kind="Company to rate"
        context="Found for Logistics Operations"
        position={{ index: 2, total: 3 }}
        phone={false}
        actions={[]}
        footer={
          <ReasonField
            decision="Not for me"
            picks={companyPicks}
            defaultPick="Not the work"
            defaultValue="Furniture, not food or freight"
            autoFocus={false}
            onDone={() => {}}
            className={heldBox}
          />
        }
      >
        <ReviewCompany
          name="Bramblewood Home"
          line="Direct-to-consumer furniture · 600 people · Series B"
          fit={{ tone: "caution", title: "Partly fits your goals", text: "Runs its own warehouses and freight; you said you’d rather stay in food or the software planners use." }}
        />
      </ReviewCard>
      <ReviewKeyLegend />
    </div>
  ),
};

// Review, small: the field sits in the bottom bar above the keyboard, with bigger picks, Skip and Save reason.
function Phone() {
  const [done, setDone] = useState(false);
  return (
    <div data-overlay-root className={`relative flex h-[640px] w-[390px] transform-gpu flex-col overflow-hidden border bg-surface ${done ? "" : heldField}`}>
      <PaneHeader
        back={{ label: "Companies to rate", onBack: () => {} }}
        actions={
          <>
            <span className="text-body-sm leading-body-sm text-muted tabular-nums">2 of 3</span>
            <Menu label="More for Bramblewood Home" items={[{ label: "Open bramblewood.example.com", icon: "openElsewhere" }]} />
          </>
        }
      />
      <div className="px-4 pb-3">
        <ProgressBar label="Companies to rate" value={1} max={6} />
      </div>
      <div className="min-h-0 flex-1 px-4">
        <ReviewCard kind="Company to rate" context="Found for Logistics Operations" phone actions={[]}>
          <ReviewCompany name="Bramblewood Home" line="Direct-to-consumer furniture · 600 people" fit={{ tone: "caution", title: "Partly fits your goals", text: "Runs its own warehouses and freight." }} />
        </ReviewCard>
      </div>
      <BottomBar
        mode={
          done
            ? { kind: "nav", current: "Review", items: [{ label: "Today", icon: "today" }, { label: "Review", icon: "review", count: 14 }, { label: "Pursuits", icon: "pursuits" }, { label: "More", icon: "more" }] }
            : {
                kind: "reason",
                decision: "Not for me",
                picks: companyPicks,
                onDone: ({ reason }) => {
                  setDone(true);
                  toast({ message: reason ? `Not for me · ${reason}` : "Not for me", icon: "reject", action: { label: "Undo", run: () => setDone(false) } });
                },
              }
        }
      />
    </div>
  );
}
export const ReviewSmall: Story = { name: "Review, small", render: () => <Phone /> };
