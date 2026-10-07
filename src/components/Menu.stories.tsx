import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "./Button";
import { ContextMenu, Menu, type MenuEntry } from "./Menu";
import { StatusTag } from "./StatusTag";

const meta = { title: "Components/Menu", component: Menu } satisfies Meta<typeof Menu>;
export default meta;
type Story = StoryObj<typeof meta>;

// A role's ⋯ menu, grouped by kind of work: what to make, the decisions it leads to, and the rest. Rate Loadstar Systems is a
// submenu; Reveal email can't run yet and says why. Hover or focus an action for its explainer; on a phone, press and
// hold it.
const roleActions: MenuEntry[] = [
  { label: "Tailor a resume", icon: "resumes", keys: "T", detail: "Writes a resume for this role from your base resume.", note: "About $0.04 · Undo by deleting it" },
  { label: "Write a letter", icon: "edit", keys: "L", detail: "Writes a cover letter for this role.", note: "About $0.03 · Undo by deleting it" },
  { label: "Ask about this role", icon: "ask", keys: "/", detail: "Answers a question from the posting and your record.", note: "About $0.01" },
  { label: "Find people", icon: "people", hint: "Free", detail: "Lists people at Loadstar Systems who could refer you.", note: "Free" },
  "separator",
  {
    label: "Rate Loadstar Systems",
    icon: "companies",
    items: [
      { label: "Target", checked: true, keys: "T" },
      { label: "Maybe", checked: false, keys: "M" },
      { label: "Not for me", checked: false, keys: "R" },
    ],
  },
  { label: "Adjust Supply Chain Product", icon: "directions", detail: "Opens the direction this role was ranked for.", note: "Free" },
  "separator",
  { label: "Copy link", icon: "link", detail: "Copies the posting’s address.", note: "Free" },
  { label: "Reveal email", icon: "email", disabled: true, reason: "Pick a person first" },
  { label: "Not for me", icon: "reject", keys: "R", detail: "Moves the role to Not for me and asks why.", note: "Free · Undo with U" },
];

// Open, as on the board. Arrow keys move, → opens Rate Loadstar Systems, ← comes back, typing jumps to an item, Esc closes.
// Below 768px the same menu is the bottom sheet.
export const MoreMenu: Story = {
  name: "⋯ menu",
  args: { items: roleActions, label: "More for Senior Product Manager, Load Planning", title: "Senior Product Manager, Load Planning", description: "Loadstar Systems", defaultOpen: true },
  render: (args) => (
    <div className="flex h-96 w-66 justify-end">
      <Menu {...args} />
    </div>
  ),
};

// Right-click the row (or press the menu key, or Shift+F10, with it focused). The first group is the row's own
// decision. On a phone a long press opens the same entries in the sheet.
export const RowContextMenu: Story = {
  name: "Context menu",
  args: { items: [] },
  render: () => (
    <div className="h-80">
      <ContextMenu
        title="Meridian Coldchain"
        description="Cold-chain logistics software"
        items={[
          { label: "Target", keys: "T" },
          { label: "Maybe", keys: "M" },
          { label: "Not for me", keys: "R" },
          "separator",
          { label: "Find roles now", icon: "tryAgain", hint: "About 1 credit" },
          { label: "Open meridian.example.com", icon: "openElsewhere" },
          { label: "Copy link", icon: "link" },
          "separator",
          { label: "Remove company", icon: "delete", tone: "danger" },
        ]}
      >
        <div
          tabIndex={0}
          className="flex w-105 max-w-full items-center gap-3 rounded-sm px-2.75 py-2.25 hover:bg-subtle data-[state=open]:bg-subtle"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border bg-surface text-label leading-label font-medium text-muted">M</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-md leading-body-md font-medium">Meridian Coldchain</span>
            <span className="text-body-sm leading-body-sm text-muted">Cold-chain logistics software · 780 people</span>
          </span>
          <StatusTag tone="neutral">Maybe</StatusTag>
        </div>
      </ContextMenu>
    </div>
  ),
};

// A menu of choices rather than actions: the current one is ticked. How a resume places one of its projects.
function Placement() {
  const [out, setOut] = useState(false);
  const shown = out ? "Left out" : "Show";
  return (
    <div className="flex h-40 items-start gap-3">
      <span className="text-body-md leading-body-md">Palletwise load planner</span>
      <Menu
        label="On this resume"
        align="start"
        trigger={
          <Button variant="ghost" size="sm" iconEnd="expand" aria-label={`On this resume: ${shown}`}>
            {shown}
          </Button>
        }
        items={[
          { label: "Show", checked: !out, onSelect: () => setOut(false) },
          { label: "Leave out", checked: out, onSelect: () => setOut(true) },
        ]}
      />
    </div>
  );
}

export const Choices: Story = { args: { items: [] }, render: () => <Placement /> };

// A long list with group labels, the kind a filter or a folded tab row opens.
export const Groups: Story = {
  args: {
    label: "More tabs",
    align: "start",
    items: [
      { group: "Closed" },
      { label: "Closed", count: 3 },
      { label: "Not for me", count: 41 },
      { group: "Set aside" },
      { label: "Set aside", count: 12 },
    ],
  },
  render: (args) => (
    <div className="h-64">
      <Menu {...args} trigger={<Button variant="ghost" size="sm" iconEnd="expand">More</Button>} />
    </div>
  ),
};
