import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import type { Job } from "./Activity";
import { Avatar } from "./Avatar";
import { BottomBar } from "./BottomBar";
import { Button } from "./Button";
import { Keys } from "./Kbd";
import { List, ListRow } from "./ListRow";
import { Menu, type MenuEntry } from "./Menu";
import { PaneHeader, PaneLayout, useScreenSize, type ScreenSize } from "./Panes";
import { ScoreBadge, type FitLevel } from "./ScoreBadge";
import { SegmentedControl } from "./SegmentedControl";
import { Sidebar } from "./Sidebar";
import { StatusTag } from "./StatusTag";
import { TabPanel, Tabs } from "./Tabs";

const meta = { title: "Patterns/Panes", component: PaneLayout } satisfies Meta<typeof PaneLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

const jobs: Job[] = [
  { id: "rank", label: "Ranking 38 new roles", state: "running", progress: 24 / 38, detail: "24 of 38", brief: "Ranking 24 of 38" },
  { id: "resume", label: "Writing your Solutions Consulting resume", state: "running", progress: 0.3, detail: "About a minute" },
  { id: "story", label: "Read your Ironbridge story", state: "done", detail: "5 facts to review", time: "8:52" },
];
const account: MenuEntry[] = [
  { label: "Profile", icon: "account" },
  { label: "Sign out", icon: "signOut" },
];
const itemMenu: MenuEntry[] = [
  { label: "Copy link", icon: "link" },
  { label: "Open loadstar.example.com", icon: "openElsewhere" },
  "separator",
  { label: "Remove company", icon: "delete", tone: "danger" },
];

// Item padding by size (DESIGN.md, Layout): 16, 24, 32.
const pad = { small: "px-4", medium: "px-6", large: "px-8" } as const;

// The app around the panes: the sidebar at large, the rail at medium, the bottom bar on a phone.
function Screen({ size, current, width, height = 900, children }: { size: ScreenSize; current: string; width?: number; height?: number; children: ReactNode }) {
  const sidebar = { current, counts: { review: 14, pursuits: 6 }, activity: { jobs }, user: { name: "Wren Castellano" }, account, onSearch: () => {}, open: ["record"] };
  return (
    <div className="overflow-x-auto">
      <div data-overlay-root style={{ width, height }} className="relative flex transform-gpu overflow-hidden border bg-surface">
        {size !== "small" && <Sidebar {...sidebar} rail={size === "medium"} onToggle={size === "large" ? () => {} : undefined} fresh={["review"]} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">{children}</div>
          {size === "small" && (
            <BottomBar
              mode={{
                kind: "nav",
                current: current === "/companies" ? "More" : "Pursuits",
                items: [
                  { label: "Today", icon: "today", href: "/" },
                  { label: "Review", icon: "review", href: "/review", count: 14 },
                  { label: "Pursuits", icon: "pursuits", href: "/pursuits" },
                  { label: "More", icon: "more" },
                ],
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Companies ---------------------------------------------------------------------------------------------------------

const companies = [
  { id: "loadstar", name: "Loadstar Systems", line: "Transportation management software", roles: 38 },
  { id: "meridian", name: "Meridian Coldchain", line: "Cold-chain logistics software", roles: 21 },
  { id: "orchard", name: "Orchard Forecasting", line: "Demand-planning software", roles: 12 },
  { id: "fernhill", name: "Fernhill Foods", line: "Packaged foods", roles: 64 },
  { id: "kestrel", name: "Kestrel Freight", line: "Digital freight brokerage", roles: 17 },
  { id: "lumen", name: "Lumen Planning", line: "AI supply planning", roles: 3 },
  { id: "copperline", name: "Copperline Robotics", line: "Warehouse robotics", roles: 9 },
];

const openRoles: { score: number; level: FitLevel; title: string; place: string }[] = [
  { score: 91, level: "strong", title: "Senior Product Manager, Load Planning", place: "Remote, US" },
  { score: 86, level: "strong", title: "Product Manager, Carrier Network", place: "Columbus or remote" },
  { score: 58, level: "weak", title: "Implementation Manager, Europe", place: "Rotterdam" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="pb-2 text-label leading-label font-medium text-text">{title}</h3>
      {children}
    </section>
  );
}

function Loadstar({ size }: { size: ScreenSize }) {
  const [rating, setRating] = useState<"target" | "maybe" | "no">("target");
  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      {size !== "small" && (
        <PaneHeader
          actions={
            <>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">1 of 12</span>
              <Keys keys="J" />
              <Keys keys="K" />
              <Menu label="More for Loadstar Systems" items={itemMenu} />
            </>
          }
        />
      )}
      <div className={`flex flex-col gap-4 border-b pt-1 pb-5 ${pad[size]}`}>
        <div className="flex items-start gap-3.5">
          <Avatar name="Loadstar Systems" company size={40} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg">Loadstar Systems</h1>
            <p className="text-body-sm leading-body-sm text-muted">Transportation management software · Columbus · 140 people · Series B</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">
          <SegmentedControl
            label="Rating"
            hideLabel
            value={rating}
            onChange={setRating}
            options={[
              { value: "target", label: "Target" },
              { value: "maybe", label: "Maybe" },
              { value: "no", label: "Not for me" },
            ]}
          />
          <Button variant="primary" icon="tryAgain">
            Find roles now
          </Button>
          <span className="text-body-sm leading-body-sm text-muted">About 1 Apollo credit</span>
        </div>
      </div>
      <div className={`flex max-w-[720px] flex-col gap-7 py-6 ${pad[size]}`}>
        <div className="flex flex-col gap-1.5 border-l-2 border-good pl-3.5">
          <p className="text-body-sm leading-body-sm font-semibold text-good-text">Fits your goals</p>
          <p className="text-body-md leading-body-md">A software company whose customers are dispatchers and load planners, the people you moved onto a new TMS at Ironbridge and built Palletwise for.</p>
        </div>
        <Section title="Open roles">
          {openRoles.map((r) => (
            <div key={r.title} className="flex h-10 items-center gap-3 border-t">
              <ScoreBadge score={r.score} level={r.level} size="sm" />
              <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm font-medium">{r.title}</span>
              <span className="text-body-sm leading-body-sm text-muted">{r.place}</span>
            </div>
          ))}
        </Section>
        <Section title="People">
          <div className="flex h-12 items-center gap-3 border-t">
            <Avatar name="Rafael Duarte" size={24} />
            <div className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
              <span className="font-medium">Rafael Duarte</span>
              <span className="text-muted">Head of Product</span>
            </div>
            <span className="hidden text-body-sm leading-body-sm text-muted md:inline">1 Apollo credit</span>
            <Button size="sm" icon="email">
              Reveal email
            </Button>
          </div>
          <div className="flex h-12 items-center gap-3 border-t">
            <Avatar name="Lena Marsh" size={24} />
            <div className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
              <span className="font-medium">Lena Marsh</span>
              <span className="text-muted">Senior Recruiter, Product</span>
            </div>
            <span className="truncate text-body-sm leading-body-sm text-muted">lena.marsh@loadstar.example.com</span>
          </div>
        </Section>
        <p className="text-body-sm leading-body-sm text-muted">Job board, checked 2 hours ago · 38 roles, all with full descriptions</p>
      </div>
    </div>
  );
}

function Companies({ size, width, height, open: initial = "loadstar" }: { size: ScreenSize; width?: number; height?: number; open?: string | null }) {
  const [open, setOpen] = useState<string | null>(initial);
  const [tab, setTab] = useState("targets");
  const list = (
    <>
      <PaneHeader
        title="Companies"
        count={86}
        actions={
          <>
            <Button variant="ghost" size={size === "small" ? "lg" : "md"} iconOnly icon="filter" aria-label="Filter" />
            <Button variant="ghost" size={size === "small" ? "lg" : "md"} iconOnly icon="add" aria-label="Add a company" />
          </>
        }
      />
      <Tabs
        label="Companies by rating"
        value={tab}
        onValueChange={setTab}
        className="px-4"
        tabs={[
          { value: "targets", label: "Targets", count: 12 },
          { value: "found", label: "Found", count: 64 },
          { value: "aside", label: "Set aside", count: 10 },
        ]}
      >
        <TabPanel value={tab} className="overflow-y-auto p-2">
          <List label="Companies">
            {companies.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                line={c.line}
                lead={<Avatar name={c.name} company size={size === "small" ? 32 : 32} />}
                tag={<StatusTag tone="good">Target</StatusTag>}
                meta={`${c.roles} roles`}
                selected={size !== "small" && open === c.id}
                onOpen={() => setOpen(c.id)}
              />
            ))}
          </List>
        </TabPanel>
      </Tabs>
    </>
  );
  return (
    <Screen size={size} current="/companies" width={width} height={height}>
      <PaneLayout
        size={size}
        list={list}
        item={open ? <Loadstar size={size} /> : undefined}
        back={{ label: "Companies", onBack: () => setOpen(null), actions: <Menu label="More for Loadstar Systems" items={itemMenu} trigger={<Button variant="ghost" size="lg" iconOnly icon="more" aria-label="More for Loadstar Systems" />} /> }}
      />
    </Screen>
  );
}

// Pursuits with a third pane -----------------------------------------------------------------------------------------

const pursuits: { id: string; score: number; level: FitLevel; title: string; line: string; tag: string; tone: "info" | "neutral" | "good"; meta: string; caution?: boolean }[] = [
  { id: "loadstar", score: 91, level: "strong", title: "Senior Product Manager, Load Planning", line: "Loadstar Systems · Remote, US", tag: "Interviewing", tone: "info", meta: "Panel Thu 10:00" },
  { id: "meridian", score: 88, level: "strong", title: "Solutions Consultant, Food & Beverage", line: "Meridian Coldchain · Chicago, IL", tag: "Applied", tone: "info", meta: "Follow up today", caution: true },
  { id: "lumen", score: 84, level: "strong", title: "Solutions Engineer, Manufacturing", line: "Lumen Planning · Remote, US", tag: "Preparing", tone: "neutral", meta: "Resume ready" },
  { id: "kestrel", score: 79, level: "some", title: "Network Planning Manager", line: "Kestrel Freight · Chicago, IL", tag: "Preparing", tone: "neutral", meta: "Letter to write" },
  { id: "northgate", score: 72, level: "some", title: "Distribution Operations Manager", line: "Northgate Grocers · Cleveland, OH", tag: "Applied", tone: "info", meta: "Sent Sep 18" },
  { id: "parcelpoint", score: 64, level: "some", title: "Head of Operations", line: "Parcelpoint · Philadelphia or remote", tag: "Offer", tone: "good", meta: "Reply by Oct 2" },
];

const bullets = [
  "Opened the Ohio Valley cross-dock and planned its first 40 lanes.",
  "Led the move to a new transportation management system for about 180 dispatchers and planners at four terminals.",
  "Cut empty miles by 11% by matching backhauls between terminals that had planned them separately.",
];

function TailoredResume() {
  return (
    <div className="flex flex-col gap-3 rounded-sm border bg-surface px-5 py-6">
      <div className="flex flex-col gap-0.5">
        <p className="text-title-md leading-title-md font-semibold">Wren Castellano</p>
        <p className="text-body-sm leading-body-sm text-muted">Supply chain operations, from the loading dock to the planning software</p>
      </div>
      {[
        { role: "Network Operations Manager, Ironbridge Logistics", years: "2020–2023", items: bullets },
        { role: "Senior Supply Planning Manager, Brightwater Provisions", years: "2023–now", items: ["Built a load-planning calculator the shipping docks at both plants use to fit more cases on every truck."] },
      ].map((r) => (
        <div key={r.role} className="flex flex-col gap-1.5 text-body-sm leading-body-sm">
          <div className="flex justify-between gap-2">
            <span className="font-semibold">{r.role}</span>
            <span className="text-muted tabular-nums">{r.years}</span>
          </div>
          {r.items.map((b) => (
            <p key={b} className="flex gap-2 px-1.5 py-[3px]">
              <span className="text-muted">–</span>
              {b}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function Pursuit({ size, onThird, third }: { size: ScreenSize; onThird: () => void; third: boolean }) {
  const [tab, setTab] = useState("overview");
  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      {size !== "small" && (
        <PaneHeader
          actions={
            <>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">1 of 6</span>
              <Keys keys="J" />
              <Keys keys="K" />
              <Button variant={third ? "secondary" : "ghost"} iconOnly icon="thirdPane" aria-label="Tailored resume" aria-pressed={third} onClick={onThird} />
              <Menu label="More for Senior Product Manager, Load Planning" items={itemMenu.slice(0, 1)} />
            </>
          }
        />
      )}
      <div className={`flex flex-col gap-4 pt-1 pb-5 ${pad[size]}`}>
        <div className="flex items-start gap-3.5">
          <ScoreBadge score={91} level="strong" size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg">Senior Product Manager, Load Planning</h1>
            <p className="text-body-sm leading-body-sm text-muted">Loadstar Systems · Remote, US · $165k–$205k</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">
          <Button variant="outline" iconEnd="expand">
            Interviewing
          </Button>
          <Button variant="primary">Prepare for the panel</Button>
          <Button iconOnly icon="ask" aria-label="Ask about this role" />
          <Button iconOnly icon="people" aria-label="People" />
        </div>
      </div>
      <Tabs
        label="Senior Product Manager, Load Planning"
        value={tab}
        onValueChange={setTab}
        className={pad[size]}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "resume", label: "Resume" },
          { value: "letter", label: "Letter" },
          { value: "people", label: "People", count: 2 },
          { value: "notes", label: "Notes" },
        ]}
      >
        <TabPanel value={tab} className={`flex max-w-[640px] flex-col gap-6 py-5 ${pad[size]}`}>
          <div className="flex flex-col gap-1 border-l-2 border-caution pl-3">
            <p className="text-label-caps leading-label-caps font-medium tracking-label-caps text-muted uppercase">Next step</p>
            <p className="text-body-md leading-body-md font-semibold">Panel interview, Thursday Oct 1 at 10:00</p>
            <p className="text-body-sm leading-body-sm text-muted">With Rafael Duarte, Head of Product, and two senior engineers.</p>
          </div>
          <Section title="Fit">
            <div className="flex flex-col gap-1 border-t py-3">
              <span className="flex items-center gap-2 text-body-sm leading-body-sm font-medium">
                <ScoreBadge score={91} level="strong" size="sm" />
                Supply Chain Product <span className="text-good-text">Strong</span>
              </span>
              <p className="pl-7 text-body-sm leading-body-sm text-muted">Moved 180 dispatchers onto a new TMS at Ironbridge and built your own load planner, Palletwise.</p>
            </div>
            <div className="flex flex-col gap-1 border-t py-3">
              <span className="flex items-center gap-2 text-body-sm leading-body-sm font-medium">
                <ScoreBadge score={68} level="some" size="sm" />
                Solutions Consulting <span className="text-caution-text">Some</span>
              </span>
              <p className="pl-7 text-body-sm leading-body-sm text-muted">Palletwise and Lanebook show technical range; the role leans on presenting to customers more than you have.</p>
            </div>
          </Section>
        </TabPanel>
      </Tabs>
    </div>
  );
}

function Pursuits({ size, width, height, third: initialThird = true }: { size: ScreenSize; width?: number; height?: number; third?: boolean }) {
  const [open, setOpen] = useState<string | null>("loadstar");
  const [third, setThird] = useState(initialThird);
  const [tab, setTab] = useState("pursuing");
  const list = (
    <>
      <PaneHeader
        title="Pursuits"
        count={6}
        actions={
          <>
            <Button variant="ghost" size={size === "small" ? "lg" : "md"} iconOnly icon="filter" aria-label="Filter" />
            <Menu label="More for Pursuits" items={[{ label: "Export", icon: "export" }]} />
          </>
        }
      />
      <Tabs
        label="Roles by status"
        value={tab}
        onValueChange={setTab}
        className="px-4"
        tabs={[
          { value: "all", label: "All roles", count: 412 },
          { value: "interested", label: "Interested", count: 9 },
          { value: "pursuing", label: "Pursuing", count: 6 },
          { value: "closed", label: "Closed", count: 3 },
          { value: "not-for-me", label: "Not for me", count: 41 },
        ]}
      >
        <TabPanel value={tab} className="overflow-y-auto p-2">
          <List label="Pursuits">
            {pursuits.map((p) => (
              <ListRow
                key={p.id}
                title={p.title}
                line={p.line}
                lead={<ScoreBadge score={p.score} level={p.level} />}
                tag={<StatusTag tone={p.tone}>{p.tag}</StatusTag>}
                meta={p.caution ? <span className="text-caution-text">{p.meta}</span> : p.meta}
                selected={size !== "small" && open === p.id}
                onOpen={() => setOpen(p.id)}
              />
            ))}
          </List>
        </TabPanel>
      </Tabs>
    </>
  );
  return (
    <Screen size={size} current="/pursuits" width={width} height={height}>
      <PaneLayout
        size={size}
        list={list}
        item={open ? <Pursuit size={size} third={third} onThird={() => setThird((t) => !t)} /> : undefined}
        back={{ label: "Pursuing", onBack: () => setOpen(null) }}
        third={{
          title: "Tailored resume",
          actions: (
            <>
              <StatusTag tone="good">Up to date</StatusTag>
              <Menu label="More for the tailored resume" items={[{ label: "Download", icon: "export" }]} />
            </>
          ),
          open: third,
          onOpenChange: setThird,
          children: <TailoredResume />,
        }}
      />
    </Screen>
  );
}

// Large (1440): the list stays put on the left and the item opens beside it. Drag the divider, or focus it and use the
// arrow keys, to resize the list between 320 and 480. J and K move through the list; Esc closes the item.
export const ListAndItem: Story = {
  name: "List and item",
  args: { list: null },
  render: () => <Companies size="large" width={1440} />,
};

// Large, with a third pane: the role's tailored resume opens beside the item at 380 (resizable 340 to 480) and the list
// narrows to 340. The resume button in the item's header, or its ×, folds it away.
export const WithAThirdPane: Story = {
  name: "With a third pane",
  args: { list: null },
  render: () => <Pursuits size="large" width={1440} />,
};

// Medium (1024): the rail, the list at 320 and the item filling the rest; the third pane slides over as a drawer.
export const Medium: Story = {
  args: { list: null },
  render: () => <Pursuits size="medium" width={1024} height={768} third={false} />,
};

// Small (390): the list; opening a row shows the item full screen with Back. The third pane is a sheet.
export const Small: Story = {
  args: { list: null },
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Companies size="small" width={390} height={844} open={null} />
      <Pursuits size="small" width={390} height={844} third={false} />
    </div>
  ),
};

function Live() {
  const size = useScreenSize();
  return <Pursuits size={size} height={typeof window === "undefined" ? 800 : window.innerHeight - 48} third={false} />;
}

// Follows the window: resize it through 390, 768, 1024 and 1440 to see the sizes change.
export const FollowsTheWindow: Story = {
  name: "Follows the window",
  args: { list: null },
  render: () => <Live />,
};

// A wide list, for a screen read mostly as its list (Today): 540 on large screens, 420 on medium.
export const WideList: Story = {
  name: "Wide list",
  args: { list: null },
  render: () => (
    <div className="flex flex-col gap-6">
      {(["large", "medium"] as const).map((size) => (
        <Screen key={size} size={size} current="/" width={size === "large" ? 1440 : 1024} height={420}>
          <PaneLayout
            size={size}
            wide
            list={
              <List label="Today" className="px-2 pt-2">
                <ListRow lead={<Avatar name="Meridian Coldchain" company size={28} />} title="Follow up with Meridian Coldchain" line="Solutions Consultant · No news for 7 days" trail={<Button size="sm">Followed up</Button>} />
                <ListRow lead={<ScoreBadge score={86} level="strong" />} title="Solutions Consultant, Demand Planning" line="Orchard Forecasting · Pittsburgh or remote" trail={<Button size="sm">Interested</Button>} />
              </List>
            }
            empty={<div className="size-full" />}
          />
        </Screen>
      ))}
    </div>
  ),
};
