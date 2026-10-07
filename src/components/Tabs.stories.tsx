import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { TabPanel, Tabs, type TabItem } from "./Tabs";

const meta = { title: "Components/Tabs", component: Tabs } satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

const statuses: TabItem[] = [
  { value: "all", label: "All roles", count: 412 },
  { value: "interested", label: "Interested", count: 9 },
  { value: "pursuing", label: "Pursuing", count: 6 },
  { value: "closed", label: "Closed", count: 3 },
  { value: "not-for-me", label: "Not for me", count: 41 },
];

const views: TabItem[] = [
  { value: "overview", label: "Overview" },
  { value: "resume", label: "Resume" },
  { value: "letter", label: "Letter" },
  { value: "people", label: "People", count: 2 },
  { value: "notes", label: "Notes" },
  { value: "timeline", label: "Timeline" },
];

function Bar({ tabs, initial, label, width, className }: { tabs: TabItem[]; initial: string; label: string; width?: number; className?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ width }} className={width ? "border" : ""}>
      <Tabs tabs={tabs} value={value} onValueChange={setValue} label={label} className={className}>
        {tabs.map((t) => (
          <TabPanel key={t.value} value={t.value} className="px-4 py-3 text-body-sm leading-body-sm text-muted">
            {t.label}
            {t.count !== undefined && `: ${t.count}`}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}

// Views of the same thing with their counts, and an item's views. The current tab is underlined in ink; a tab under the
// pointer gets a quiet underline. Tab reaches the current tab; the arrow keys move and switch, Home and End jump.
export const Default: Story = {
  name: "Tabs",
  args: { tabs: statuses, value: "pursuing", onValueChange: () => {}, label: "Roles by status" },
  render: () => (
    <div className="flex max-w-[566px] flex-col gap-5">
      <Bar tabs={statuses.slice(0, 4)} initial="pursuing" label="Roles by status" />
      <Bar tabs={views} initial="overview" label="Senior Product Manager, Load Planning" />
    </div>
  ),
};

// When the tabs don't fit, the last ones fold into More, which opens a menu. The current tab is never folded: picking
// Closed from More brings it out in place of the last one shown.
export const Overflow: Story = {
  args: { tabs: statuses, value: "pursuing", onValueChange: () => {}, label: "Roles by status" },
  render: () => (
    <div className="flex flex-col gap-7">
      <Bar tabs={statuses} initial="pursuing" label="Roles by status" width={340} className="px-4" />
      <Bar tabs={statuses} initial="closed" label="Roles by status" width={340} className="px-4" />
    </div>
  ),
};
