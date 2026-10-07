import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { BuiltOn, BuiltOnChip, BuiltOnPeek, type BuiltOnSource } from "./BuiltOn";
import { toast } from "./Toast";

const meta = { title: "Patterns/Built on", component: BuiltOn } satisfies Meta<typeof BuiltOn>;
export default meta;
type Story = StoryObj<typeof meta>;

const closed: BuiltOnSource[] = [
  { kind: "fact", text: "Opened the Ohio Valley cross-dock and planned its first 40 lanes.", source: "Fact · Ironbridge Logistics", approved: true, onOpen: () => {} },
  { kind: "fact", text: "Cut empty miles by 11% by matching backhauls between terminals that had been planning them separately.", source: "Fact · Ironbridge Logistics", onOpen: () => {} },
  { kind: "quote", text: "I sat with the night planners for the whole first month, until every new lane left on time.", source: "Ironbridge story · written Sep 8", onOpen: () => {} },
];

// A line in a record entry, lit in steel while its peek is open.
function Line({ text, sources, open, onOpenChange }: { text: string; sources?: BuiltOnSource[]; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <div className={`flex items-start gap-2 rounded-sm px-1.5 py-[3px] ${open ? "bg-steel-subtle shadow-[inset_2px_0_0_var(--color-steel)]" : ""}`}>
      <span aria-hidden="true" className="text-body-sm leading-body-sm text-muted">
        –
      </span>
      <span className="min-w-0 flex-1 text-body-sm leading-body-sm text-text">{text}</span>
      {sources && (
        <BuiltOnPeek
          sources={sources}
          open={open}
          onOpenChange={onOpenChange}
          align="end"
          onOpenRecord={() => toast({ message: "Opened in Record", icon: "record" })}
          onEdit={() => toast({ message: "Editing the line", icon: "edit" })}
        />
      )}
    </div>
  );
}

function Entry({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <div className="flex w-141 max-w-full flex-col gap-1.5 rounded-sm border bg-surface p-4">
      <div className="flex justify-between gap-3 text-body-sm leading-body-sm">
        <span className="font-semibold text-text">Network Operations Manager, Ironbridge Logistics</span>
        <span className="text-muted tabular-nums">2020–2023</span>
      </div>
      <Line text="Led the move to a new transportation management system for about 180 dispatchers and planners." />
      <Line text="Opened a 40-lane cross-dock and matched backhauls across terminals, cutting empty miles by 11%." sources={closed} open={open} onOpenChange={onOpenChange} />
    </div>
  );
}

// Anything CareerBot wrote shows what it rests on, one click away. The peek, open: each source links to where it
// lives, with the line's own actions under them. Esc goes back.
export const Peek: Story = {
  args: { sources: closed },
  render: () => (
    <div className="h-[480px]">
      <Entry open />
    </div>
  ),
};

function Everywhere() {
  const rows: [string, string, number, BuiltOnSource[]][] = [
    ["A resume line", "Built the Power BI scorecard every terminal manager opens on Monday morning.", 2, closed.slice(0, 2)],
    ["A fit reason", "Planned a 40-lane cross-dock and cut empty miles at Ironbridge, the network problems Loadstar’s software solves.", 4, closed],
    ["An insight", "You move whole operations onto new software and stay until nobody asks for the old way.", 5, closed],
    ["An answer", "Why Loadstar Systems? I’ve run dispatch on the kind of software you build, from the planner’s side…", 3, closed],
    ["A letter", "At Ironbridge I planned every lane of the new cross-dock myself…", 2, closed.slice(1)],
  ];
  return (
    <div className="flex w-141 max-w-full flex-col">
      {rows.map(([what, text, count, sources]) => (
        <div key={what} className="flex min-h-11 items-center gap-3 border-t py-1">
          <span className="w-27 shrink-0 text-body-sm leading-body-sm text-muted">{what}</span>
          <span className="min-w-0 flex-1 text-body-sm leading-body-sm text-text">{text}</span>
          <BuiltOnPeek sources={sources} count={count} align="end" onOpenRecord={() => {}} onEdit={() => {}} />
        </div>
      ))}
    </div>
  );
}

// The same chip and peek on every kind of writing. On a phone the peek is the Sheet.
export const TheSameEverywhere: Story = { name: "The same everywhere", args: Peek.args, render: () => <Everywhere /> };

// Live: the chip opens the peek and the line lights up with it; Esc, a click outside or a choice closes it.
function Live() {
  const [open, setOpen] = useState(false);
  return <Entry open={open} onOpenChange={setOpen} />;
}

export const InARecordEntry: Story = { name: "In a record entry", args: Peek.args, render: () => <Live /> };

// The chip alone, where the sources open elsewhere (an insight's third pane): pressed while that pane is open.
function ChipAlone() {
  const [pressed, setPressed] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <BuiltOnChip count={5} pressed={pressed} onClick={() => setPressed(!pressed)} />
      <span className="text-body-sm leading-body-sm text-muted">{pressed ? "Sources open beside" : "Sources closed"}</span>
    </div>
  );
}

export const ChipOnItsOwn: Story = { name: "Chip on its own", args: Peek.args, render: () => <ChipAlone /> };

// Inside a card: the sources as they read, with a count when not all of them show.
export const InACard: Story = {
  name: "In a card",
  args: Peek.args,
  render: () => (
    <div className="flex w-122.5 max-w-full flex-col gap-6">
      <BuiltOn
        sources={[
          {
            kind: "quote",
            text: "We opened the cross-dock in the spring of 2021 with forty lanes, most of them grocery loads between Pittsburgh and Columbus.",
            source: "Ironbridge story · written Sep 8",
          },
        ]}
      />
      <BuiltOn
        count={2}
        sources={[
          {
            kind: "quote",
            text: "I want to help build the software planners use, the way I wrote my own load planner when nothing on the market fit our docks.",
            source: "Goals · written Sep 20",
          },
        ]}
      />
    </div>
  ),
};
