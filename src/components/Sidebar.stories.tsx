import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import type { Job } from "./Activity";
import { BottomBar } from "./BottomBar";
import type { MenuEntry } from "./Menu";
import { MoreSheet, Sidebar, type SidebarProps } from "./Sidebar";

const meta = { title: "Components/Sidebar", component: Sidebar } satisfies Meta<typeof Sidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

const jobs: Job[] = [
  { id: "rank", label: "Ranking 38 new roles", state: "running", progress: 24 / 38, detail: "24 of 38", brief: "Ranking 24 of 38" },
  { id: "resume", label: "Writing your Solutions Consulting resume", state: "running", progress: 0.3, detail: "About a minute" },
  { id: "kestrel", label: "Couldn’t read Kestrel Freight’s job board", state: "failed", detail: "The page didn’t load.", onRetry: () => {} },
  { id: "story", label: "Read your Ironbridge story", state: "done", detail: "5 facts to review", time: "8:52" },
  { id: "companies", label: "Found 12 companies for Supply Chain Product", state: "done", time: "8:14" },
];

const account: MenuEntry[] = [
  { label: "Profile", icon: "account" },
  { label: "Sign out", icon: "signOut" },
];

const base: SidebarProps = {
  current: "/pursuits",
  counts: { review: 14, pursuits: 6 },
  activity: { jobs, spend: { period: "September", lines: ["AI $4.12 of $25", "Apollo 312 of 500"] } },
  user: { name: "Wren Castellano" },
  account,
  onSearch: () => {},
  onToggle: () => {},
  open: ["record"],
};

const nav = [
  { label: "Today", icon: "today", href: "/" },
  { label: "Review", icon: "review", href: "/review", count: 14 },
  { label: "Pursuits", icon: "pursuits", href: "/pursuits" },
  { label: "More", icon: "more" },
] as const;

// The three sizes. Large: 240 with the logo, search, the areas, then activity, Settings and the account; Record opens
// onto its sub-screens. Medium: the 56px rail, names and keys in tooltips, a steel square where something is new.
// Phone: the bottom bar. Tab or the arrow keys walk the items; → and ← open and close Record and Goals.
export const ExpandedCollapsedAndPhone: Story = {
  name: "Expanded, collapsed and phone",
  args: base,
  render: (args) => (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-6">
        <div className="h-[760px]">
          <Sidebar {...args} />
        </div>
        <div className="h-[520px]">
          <Sidebar {...args} rail fresh={["review"]} />
        </div>
      </div>
      <div className="w-[390px]">
        <BottomBar mode={{ kind: "nav", current: "Today", items: [...nav] }} />
      </div>
    </div>
  ),
};

// A sub-screen is current: Roles under Record.
export const SubScreenCurrent: Story = {
  name: "Sub-screen current",
  args: { ...base, current: "/record/roles", open: [] },
  render: (args) => (
    <div className="h-[760px]">
      <Sidebar {...args} />
    </div>
  ),
};

function Phone() {
  const [more, setMore] = useState(true);
  return (
    <div data-overlay-root className="relative flex h-[844px] w-[390px] transform-gpu flex-col overflow-hidden border bg-surface">
      <div className="flex-1" />
      <BottomBar mode={{ kind: "nav", current: "Pursuits", items: nav.map((i) => (i.label === "More" ? { ...i, onSelect: () => setMore(true) } : i)) }} />
      <MoreSheet
        open={more}
        onOpenChange={setMore}
        current="/pursuits"
        counts={{ companies: 86 }}
        activity={base.activity}
        user={base.user}
        account={account}
      />
    </div>
  );
}

// On a phone the bar's More opens the rest of the sidebar in a sheet: Companies and Resumes, Record and Goals with their
// sub-screens in two columns, then activity, Settings and the account. Choosing a screen closes it.
export const MoreOnAPhone: Story = {
  name: "More on a phone",
  args: base,
  render: () => <Phone />,
};
