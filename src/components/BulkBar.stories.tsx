import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { BulkBar } from "./BulkBar";
import { Checkbox } from "./Checkbox";
import { List, ListRow } from "./ListRow";
import { Count } from "./StatusTag";

const meta = { title: "Patterns/Bulk bar", component: BulkBar } satisfies Meta<typeof BulkBar>;
export default meta;
type Story = StoryObj<typeof meta>;

const facts = [
  { id: "crossdock", title: "Opened the Ohio Valley cross-dock and its first 40 lanes", line: "Network Operations Manager, Ironbridge Logistics" },
  { id: "fill", title: "Kept case fill rate above 98% for eight quarters", line: "Senior Supply Planning Manager, Brightwater Provisions" },
  { id: "tms", title: "Moved 180 dispatchers to a new TMS", line: "Network Operations Manager, Ironbridge Logistics" },
  { id: "carriers", title: "Ran scorecards with the 30 largest carriers", line: "Network Operations Manager, Ironbridge Logistics" },
  { id: "brewhouse", title: "Planned capacity for a second brewhouse", line: "Production Planning Lead, Kettle & Crane Brewing" },
];

// Selecting: the bar shows while the list is selecting, with the actions the checked rows share. Done (or Esc) leaves;
// with none checked the actions are off.
export const SeveralSelected: Story = {
  args: { count: 3, actions: [], onDone: () => {} },
  render: function Render() {
    const [checked, setChecked] = useState(["crossdock", "fill", "tms"]);
    const all = checked.length === facts.length;
    return (
      <div className="relative flex max-w-[566px] flex-col border border-border pb-20">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
          <Checkbox
            label="Select all new facts"
            hideLabel
            checked={all ? true : checked.length ? "some" : false}
            onChange={(on) => setChecked(on ? facts.map((f) => f.id) : [])}
          />
          <span className="text-body-sm leading-body-sm font-medium text-text">New facts</span>
          <Count>{facts.length}</Count>
        </div>
        <List label="New facts" className="p-1">
          {facts.map((f) => (
            <ListRow
              key={f.id}
              title={f.title}
              line={f.line}
              checked={checked.includes(f.id)}
              selecting
              onCheck={(on) => setChecked((c) => (on ? [...c, f.id] : c.filter((id) => id !== f.id)))}
            />
          ))}
        </List>
        <div className="absolute inset-x-4 bottom-4">
          <BulkBar
            count={checked.length}
            actions={[
              { label: "Approve", keys: "A", primary: true, onSelect: () => setChecked([]) },
              { label: "Reject", keys: "R", onSelect: () => setChecked([]) },
              { label: "Edit", keys: "E", onSelect: () => {} },
            ]}
            more={[
              { label: "Set aside", icon: "setAside", keys: "S" },
              { label: "Copy", icon: "copy" },
            ]}
            onDone={() => setChecked([])}
          />
        </div>
      </div>
    );
  },
};

// Just after Select in a list's ⋯ menu: selecting, nothing checked yet.
export const NoneSelected: Story = {
  name: "None selected",
  args: {
    count: 0,
    actions: [
      { label: "Approve", keys: "A", primary: true, onSelect: () => {} },
      { label: "Reject", keys: "R", onSelect: () => {} },
    ],
    onDone: () => {},
  },
  render: (args) => (
    <div className="max-w-[566px]">
      <BulkBar {...args} />
    </div>
  ),
};
