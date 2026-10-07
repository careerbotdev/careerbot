import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { BottomBar, type BottomBarItem, type BottomBarMode } from "./BottomBar";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { List, ListRow } from "./ListRow";
import { Menu } from "./Menu";
import { PaneHeader } from "./Panes";
import { ScoreBadge } from "./ScoreBadge";
import { StatusTag } from "./StatusTag";
import { selectEntries, useSelection } from "./useSelection";

const meta = { title: "Patterns/Bottom bar", component: BottomBar } satisfies Meta<typeof BottomBar>;
export default meta;
type Story = StoryObj<typeof meta>;

const nav: BottomBarItem[] = [
  { label: "Today", icon: "today", href: "/" },
  { label: "Review", icon: "review", href: "/review", count: 14 },
  { label: "Pursuits", icon: "pursuits", href: "/pursuits" },
  { label: "More", icon: "more", onSelect: () => {} },
];

function Phone({ caption, children, bar }: { caption: string; children: ReactNode; bar: BottomBarMode }) {
  return (
    <figure className="flex flex-col gap-2">
      <div data-overlay-root className="relative flex h-[640px] w-[390px] transform-gpu flex-col overflow-hidden border bg-surface">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        <BottomBar mode={bar} />
      </div>
      <figcaption className="text-label leading-label text-muted">{caption}</figcaption>
    </figure>
  );
}

const pursuits = [
  { title: "Senior Product Manager, Load Planning", line: "Loadstar Systems · Remote, US", score: 91, tag: "Interviewing", meta: "Panel Thu 10:00" },
  { title: "Solutions Consultant, Food & Beverage", line: "Meridian Coldchain · Chicago, IL", score: 88, tag: "Applied", meta: "Follow up today" },
  { title: "Solutions Engineer, Manufacturing", line: "Lumen Planning · Remote, US", score: 84, tag: "Preparing", meta: "Resume ready" },
];

const facts = [
  "Opened the Ohio Valley cross-dock and its first 40 lanes",
  "Cut empty miles by 11% with shared backhauls",
  "Built the Power BI terminal scorecard",
  "Ran quarterly scorecards with the 30 largest carriers",
];

// The four things the bar does, as on the board: the areas; an open item's actions with its one primary action; what
// several selected rows can do; and the question before something is deleted, Cancel focused.
export const OnAPhone: Story = {
  name: "On a phone",
  args: { mode: { kind: "nav", current: "Pursuits", items: nav } },
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Phone caption="Navigation" bar={{ kind: "nav", current: "Pursuits", items: nav }}>
        <PaneHeader title="Pursuits" count={6} />
        <List label="Pursuits" className="px-2">
          {pursuits.map((p) => (
            <ListRow
              key={p.title}
              title={p.title}
              line={p.line}
              lead={<ScoreBadge score={p.score} level="strong" />}
              tag={<StatusTag tone={p.tag === "Preparing" ? "neutral" : "info"}>{p.tag}</StatusTag>}
              meta={p.meta}
            />
          ))}
        </List>
      </Phone>
      <Phone
        caption="An open item"
        bar={{
          kind: "actions",
          actions: (
            <>
              <Menu label="More for Senior Product Manager, Load Planning" items={[{ label: "Write a letter", icon: "edit" }, { label: "Copy link", icon: "link" }]} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />
              <Button size="lg">Tailored resume</Button>
              <Button size="lg" variant="primary" className="flex-1">
                Prepare
              </Button>
            </>
          ),
        }}
      >
        <PaneHeader back={{ label: "Pursuing", onBack: () => {} }} />
        <div className="flex gap-3 px-4 pt-1">
          <ScoreBadge score={91} level="strong" size="lg" />
          <div className="flex flex-col gap-0.5">
            <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg">Senior Product Manager, Load Planning</h1>
            <p className="text-body-sm leading-body-sm text-muted">Loadstar Systems · Remote, US · $165k–$205k</p>
          </div>
        </div>
      </Phone>
      <Phone
        caption="Several selected"
        bar={{
          kind: "bulk",
          count: 3,
          onDone: () => {},
          actions: (
            <>
              <Button size="lg">Reject</Button>
              <Button size="lg" variant="primary" className="flex-1">
                Approve 3
              </Button>
              <Button size="lg" iconOnly icon="more" aria-label="More for 3 facts" />
            </>
          ),
        }}
      >
        <PaneHeader back={{ label: "New facts", onBack: () => {} }} />
        <ul className="flex flex-col gap-0.5 px-2">
          {facts.map((f, i) => (
            <li key={f} className={`flex items-center gap-3 rounded-sm px-2 py-2.5 ${i < 3 ? "bg-steel-subtle" : ""}`}>
              <Checkbox checked={i < 3} onChange={() => {}} label={f} />
            </li>
          ))}
        </ul>
      </Phone>
      <Phone
        caption="Asking before deleting"
        bar={{ kind: "confirm", message: "Delete the Ironbridge story?", detail: "Its 14 approved facts stay in your record.", confirmLabel: "Delete story", onConfirm: () => {}, onCancel: () => {} }}
      >
        <PaneHeader back={{ label: "Story", onBack: () => {} }} />
        <div className="flex flex-col gap-3 px-4 text-body-md leading-body-md">
          <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg">Ironbridge Logistics</h1>
          <p>I joined Ironbridge Logistics in February 2020 to run network operations for its Pittsburgh terminals, a month before grocery volume doubled. I led the switch to a new transportation management system for about 180 dispatchers and planners.</p>
        </div>
      </Phone>
    </div>
  ),
};

function Morphing() {
  const sel = useSelection();
  const [asking, setAsking] = useState(false);
  const bar: BottomBarMode = asking
    ? { kind: "confirm", message: `Delete ${sel.checked.size} facts?`, detail: "They leave your record and every resume.", confirmLabel: "Delete facts", onConfirm: () => (setAsking(false), sel.done()), onCancel: () => setAsking(false) }
    : sel.on
      ? {
          kind: "bulk",
          count: sel.checked.size,
          onDone: sel.done,
          actions: (
            <>
              <Button size="lg" reason={sel.checked.size ? undefined : "None selected"} onClick={() => setAsking(true)}>
                Delete
              </Button>
              <Button size="lg" variant="primary" className="flex-1" reason={sel.checked.size ? undefined : "None selected"} onClick={sel.done}>
                {sel.checked.size ? `Approve ${sel.checked.size}` : "Approve"}
              </Button>
            </>
          ),
        }
      : { kind: "nav", current: "Review", items: nav };
  return (
    <Phone caption="Select in ⋯ (or a long press on a row) turns the bar into the facts’ actions; Delete asks first; Done turns it back." bar={bar}>
      <PaneHeader title="New facts" count={facts.length} actions={<Menu label="More for New facts" items={selectEntries(sel, facts, "facts")} />} />
      <List label="New facts" className="px-2">
        {facts.map((f) => (
          <ListRow key={f} title={f} checked={sel.checked.has(f)} selecting={sel.on} onCheck={(on) => sel.check([f], on)} />
        ))}
      </List>
    </Phone>
  );
}

// The bar morphs in place: select facts and it holds their actions; Delete turns it into the question; finishing or
// cancelling turns it back into the areas.
export const MorphingInPlace: Story = {
  name: "Morphing in place",
  args: { mode: { kind: "nav", current: "Review", items: nav } },
  render: () => <Morphing />,
};
