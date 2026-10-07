import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState, type ReactNode } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Avatar } from "./Avatar";
import { BulkBar } from "./BulkBar";
import { Button } from "./Button";
import { List, ListGroup, ListRow, type RowAction } from "./ListRow";
import { Menu, type MenuEntry } from "./Menu";
import { PaneHeader } from "./Panes";
import { ScoreBadge } from "./ScoreBadge";
import { StatusTag } from "./StatusTag";
import { selectEntries, useSelection } from "./useSelection";

const meta = { title: "Components/ListRow", component: ListRow } satisfies Meta<typeof ListRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};
const actions: RowAction[] = [
  { label: "Open resume", icon: "resumes", keys: "R", onSelect: noop },
  { label: "Ask about it", icon: "ask", keys: "Q", onSelect: noop },
];
const menu: MenuEntry[] = [
  { label: "Open resume", icon: "resumes", keys: "R" },
  { label: "Ask about it", icon: "ask", keys: "Q" },
  { label: "Set aside", icon: "setAside", keys: "S" },
  "separator",
  { label: "Delete", icon: "delete", tone: "danger" },
];

function Caption({ children }: { children: ReactNode }) {
  return <p className="pt-2.5 pb-1 pl-0.5 text-label leading-label text-muted">{children}</p>;
}

// Each state from the List row board. Hover a row to swap its tag and date for its actions; Tab to a row to see focus.
export const States: Story = {
  args: { title: "Network Planning Manager" },
  render: () => (
    <div className="flex max-w-[566px] flex-col gap-0.5">
      <Caption>Default</Caption>
      <List label="Default">
        <ListRow
          lead={<ScoreBadge score={79} level="some" />}
          title="Network Planning Manager"
          line="Kestrel Freight · Chicago, IL"
          tag={<StatusTag tone="neutral">Preparing</StatusTag>}
          meta="Letter to write"
          actions={actions}
          menu={menu}
        />
      </List>
      <Caption>Hover: status gives way to row actions</Caption>
      <List label="Hover">
        <ListRow
          lead={<ScoreBadge score={84} level="strong" />}
          title="Solutions Engineer, Manufacturing"
          line="Lumen Planning · Remote, US"
          tag={<StatusTag tone="info">Applied</StatusTag>}
          meta="Sent Sep 22"
          actions={actions}
          menu={menu}
        />
      </List>
      <Caption>Selected: open in the item pane</Caption>
      <List label="Selected">
        <ListRow
          selected
          lead={<ScoreBadge score={91} level="strong" />}
          title="Senior Product Manager, Load Planning"
          line="Loadstar Systems · Remote, US"
          tag={<StatusTag tone="info">Interviewing</StatusTag>}
          meta="Panel Thu 10:00"
          actions={actions}
          menu={menu}
        />
      </List>
      <Caption>Focus: moved to with J and K</Caption>
      <List label="Focus">
        <ListRow
          lead={<ScoreBadge score={88} level="strong" />}
          title="Solutions Consultant, Food & Beverage"
          line="Meridian Coldchain · Chicago, IL"
          tag={<StatusTag tone="info">Applied</StatusTag>}
          meta={<span className="text-caution-text">Follow up today</span>}
          actions={actions}
          menu={menu}
        />
      </List>
      <Caption>Unread: new since your last visit</Caption>
      <List label="Unread">
        <ListRow
          unread
          lead={<ScoreBadge score={86} level="strong" />}
          title="Solutions Consultant, Demand Planning"
          line="Orchard Forecasting · Pittsburgh or remote"
          tag={<StatusTag tone="info">New</StatusTag>}
          meta="Posted today"
          actions={actions}
          menu={menu}
        />
      </List>
      <Caption>Checked: part of a selection, while the list is selecting</Caption>
      <List label="Checked">
        <ListRow
          checked
          selecting
          onCheck={noop}
          lead={<ScoreBadge score={72} level="some" />}
          title="Distribution Operations Manager"
          line="Northgate Grocers · Cleveland, OH"
          tag={<StatusTag tone="info">Applied</StatusTag>}
          meta="Sent Sep 18"
          actions={actions}
          menu={menu}
        />
      </List>
    </div>
  ),
};

// Group labels carry a count.
export const Groups: Story = {
  args: { title: "Senior Product Manager, Load Planning" },
  render: () => (
    <List label="Pursuits" className="max-w-[566px]">
      <ListGroup label="Interviewing" count={1}>
        <ListRow
          lead={<ScoreBadge score={91} level="strong" />}
          title="Senior Product Manager, Load Planning"
          line="Loadstar Systems · Remote, US"
          tag={<StatusTag tone="info">Interviewing</StatusTag>}
          meta="Panel Thu 10:00"
        />
      </ListGroup>
      <ListGroup label="Applied" count={2}>
        <ListRow
          lead={<ScoreBadge score={88} level="strong" />}
          title="Solutions Consultant, Food & Beverage"
          line="Meridian Coldchain · Chicago, IL"
          tag={<StatusTag tone="info">Applied</StatusTag>}
          meta={<span className="text-caution-text">Follow up today</span>}
        />
        <ListRow
          lead={<ScoreBadge score={72} level="some" />}
          title="Distribution Operations Manager"
          line="Northgate Grocers · Cleveland, OH"
          tag={<StatusTag tone="info">Applied</StatusTag>}
          meta="Sent Sep 18"
        />
      </ListGroup>
    </List>
  ),
};

// A group with a line under its label, naming what its rows are about.
export const GroupLine: Story = {
  name: "Group with a line",
  args: { title: "Tailor your resume" },
  render: () => (
    <List label="Getting started" className="max-w-[400px]">
      <ListGroup label="Your first pursuit" line="Solutions Engineer, Manufacturing · Lumen Planning">
        <ListRow title="Pick a role and start a pursuit" line="Started Sep 30" />
        <ListRow title="Tailor your resume" line="To the posting, from your direction’s resume" />
      </ListGroup>
    </List>
  ),
};

// A group whose rows can be checked: the box by its label checks or clears them all, showing a dash while only some
// are, and how many are selected sits at the right.
export const GroupSelectAll: Story = {
  name: "Group select-all",
  args: { title: "Demand forecasting" },
  render: function Render() {
    const rows = ["Demand forecasting", "Sales and operations planning", "Inventory optimization"];
    const [checked, setChecked] = useState<string[]>(rows.slice(0, 2));
    const all = checked.length === rows.length ? true : checked.length ? ("some" as const) : false;
    return (
      <List label="Skills" className="max-w-[360px]">
        <ListGroup label="Planning" count={rows.length} checked={all} onCheck={(on) => setChecked(on ? rows : [])} meta={checked.length ? `${checked.length} selected` : undefined}>
          {rows.map((r) => (
            <ListRow key={r} title={r} line="Brightwater Provisions" selecting checked={checked.includes(r)} onCheck={(on) => setChecked((c) => (on ? [...c, r] : c.filter((x) => x !== r)))} />
          ))}
        </ListGroup>
      </List>
    );
  },
};

const roles = [
  { id: "loadstar", score: 91, level: "strong", title: "Senior Product Manager, Load Planning", line: "Loadstar Systems · Remote, US", tag: "Interviewing", meta: "Panel Thu 10:00" },
  { id: "meridian", score: 88, level: "strong", title: "Solutions Consultant, Food & Beverage", line: "Meridian Coldchain · Chicago, IL", tag: "Applied", meta: "Follow up today" },
  { id: "orchard", score: 86, level: "strong", title: "Solutions Consultant, Demand Planning", line: "Orchard Forecasting · Pittsburgh or remote", tag: "New", meta: "Posted today", unread: true },
  { id: "lumen", score: 84, level: "strong", title: "Solutions Engineer, Manufacturing", line: "Lumen Planning · Remote, US", tag: "Applied", meta: "Sent Sep 22" },
  { id: "kestrel", score: 79, level: "some", title: "Network Planning Manager", line: "Kestrel Freight · Chicago, IL", tag: "Preparing", meta: "Letter to write" },
  { id: "northgate", score: 72, level: "some", title: "Distribution Operations Manager", line: "Northgate Grocers · Cleveland, OH", tag: "Applied", meta: "Sent Sep 18" },
  { id: "parcelpoint", score: 64, level: "some", title: "Head of Operations", line: "Parcelpoint · Philadelphia or remote", tag: "Offer", meta: "Reply by Oct 2" },
] as const;

// Working a list: J and K (or the arrows) move, Enter opens. Nothing shows a box until you select on purpose: Select in
// the ⋯ menu (or a row's right-click menu), X or Space on a row, Shift- or ⌘-click on a row, or a long press on a
// phone. Then every row shows its box, a click checks a row, and the bulk bar holds the count; Done or Esc leaves.
export const Selecting: Story = {
  args: { title: "Senior Product Manager, Load Planning" },
  render: function Render() {
    const [open, setOpen] = useState<string>("loadstar");
    const sel = useSelection();
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !e.defaultPrevented) sel.done();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [sel]);
    return (
      <div className="relative flex max-w-[566px] flex-col pb-16">
        <PaneHeader title="Roles" actions={<Menu label="More for Roles" items={selectEntries(sel, roles.map((r) => r.id), "roles")} />} />
        <List label="Roles" className="px-2">
          {roles.map((r) => (
            <ListRow
              key={r.id}
              lead={<ScoreBadge score={r.score} level={r.level} />}
              title={r.title}
              line={r.line}
              unread={"unread" in r && r.unread}
              tag={<StatusTag tone={r.tag === "Offer" ? "good" : r.tag === "Preparing" ? "neutral" : "info"}>{r.tag}</StatusTag>}
              meta={r.meta === "Follow up today" ? <span className="text-caution-text">{r.meta}</span> : r.meta}
              actions={actions}
              menu={menu}
              selected={open === r.id}
              onOpen={() => setOpen(r.id)}
              checked={sel.checked.has(r.id)}
              selecting={sel.on}
              onCheck={(on) => sel.check([r.id], on)}
            />
          ))}
        </List>
        {sel.on && (
          <div className="absolute inset-x-2 bottom-2">
            <BulkBar
              count={sel.checked.size}
              actions={[
                { label: "Approve", keys: "A", primary: true, onSelect: sel.done },
                { label: "Set aside", keys: "S", onSelect: sel.done },
              ]}
              more={[{ label: "Delete", icon: "delete", tone: "danger" }]}
              onDone={sel.done}
            />
          </div>
        )}
      </div>
    );
  },
  // Hovering moves nothing; Shift-click starts selecting; a click then checks; Esc leaves; ⋯ Select starts with none.
  // With both themes shown, it works in the first.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.querySelector<HTMLElement>("[data-theme]") ?? canvasElement);
    const row = (name: RegExp) => canvas.getByRole("button", { name });
    const left = (name: RegExp) => row(name).getBoundingClientRect().left;
    const boxes = () => canvas.queryAllByRole("checkbox");
    const bar = () => canvas.queryByRole("group", { name: "Selected rows" });

    const before = left(/Network Planning Manager/);
    await userEvent.hover(row(/Network Planning Manager/));
    await expect(boxes()).toHaveLength(0);
    await expect(left(/Network Planning Manager/)).toBe(before);

    await fireEvent.click(row(/Network Planning Manager/), { shiftKey: true });
    await waitFor(() => expect(boxes()).toHaveLength(roles.length));
    await expect(bar()).toHaveTextContent("1 selected");
    await userEvent.click(row(/Head of Operations/));
    await expect(bar()).toHaveTextContent("2 selected");
    await expect(canvas.getByRole("checkbox", { name: "Select Head of Operations" })).toBeChecked();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(boxes()).toHaveLength(0));
    await expect(bar()).toBeNull();
    await expect(left(/Network Planning Manager/)).toBe(before);

    await userEvent.click(canvas.getByRole("button", { name: "More for Roles" }));
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: /^Select$/ }));
    await waitFor(() => expect(bar()).toHaveTextContent("None selected"));
    await expect(boxes()).toHaveLength(roles.length);
  },
};

// The avatar slot, for people.
export const WithAvatars: Story = {
  args: { title: "Rafael Duarte" },
  render: () => (
    <List label="People" className="max-w-[566px]">
      <ListRow lead={<Avatar name="Rafael Duarte" />} title="Rafael Duarte" line="Head of Product · Loadstar Systems" meta="Met Sep 12" />
      <ListRow lead={<Avatar name="Ines Okafor" />} title="Ines Okafor" line="Recruiter · Meridian Coldchain" tag={<StatusTag tone="caution">Reply due</StatusTag>} meta="Wrote Sep 24" />
      <ListRow lead={<Avatar name="Owen Pak" />} title="Owen Pak" line="Solutions Lead · Orchard Forecasting" meta="Intro Sep 3" />
    </List>
  ),
};

// Compact, 32px and one line: inside tables and menus only.
export const Compact: Story = {
  args: { title: "Loadstar Systems" },
  render: () => (
    <List label="Companies" className="max-w-[360px]">
      <ListRow compact lead={<Avatar name="Loadstar Systems" company size={20} />} title="Loadstar Systems" meta="38 roles" />
      <ListRow compact selected lead={<Avatar name="Meridian Coldchain" company size={20} />} title="Meridian Coldchain" meta="21 roles" />
      <ListRow compact lead={<Avatar name="Orchard Forecasting" company size={20} />} title="Orchard Forecasting" meta="12 roles" />
    </List>
  ),
};

// Lines that act in place (Today): the row opens the item; its actions always show at the right, where a touch can
// reach them too.
export const WithTrail: Story = {
  name: "With trailing actions",
  args: { title: "Follow up with Meridian Coldchain" },
  render: () => (
    <List label="Today" className="max-w-[524px]">
      <ListGroup label="Pursuits" count={1}>
        <ListRow
          selected
          lead={<Avatar name="Meridian Coldchain" company size={28} />}
          title="Follow up with Meridian Coldchain"
          line={<span className="text-caution-text">Solutions Consultant · No news for 7 days</span>}
          trail={<Button size="sm">Followed up</Button>}
        />
      </ListGroup>
      <ListGroup label="New strong roles" count={1}>
        <ListRow
          lead={<ScoreBadge score={86} level="strong" />}
          title="Solutions Consultant, Demand Planning"
          line="Orchard Forecasting · Pittsburgh or remote"
          trail={
            <>
              <Button size="sm">Interested</Button>
              <Button variant="ghost" size="sm" iconOnly icon="reject" aria-label="Not for me" />
            </>
          }
        />
      </ListGroup>
    </List>
  ),
};
