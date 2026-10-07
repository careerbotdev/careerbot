import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { StatusTag } from "./StatusTag";
import { Table, type Column, type Sort } from "./Table";
import { Icons } from "./icons";

const meta = { title: "Components/Table", component: Table } satisfies Meta<typeof Table>;
export default meta;
type Story = StoryObj<typeof meta>;

type Company = { id: string; name: string; rating: "Target" | "Maybe"; people: number; roles: number; coverage: string; failed?: boolean; checked: string; checkedMinutes: number };

const companies: Company[] = [
  { id: "meridian", name: "Meridian Coldchain", rating: "Target", people: 780, roles: 38, coverage: "Job board", checked: "2h", checkedMinutes: 120 },
  { id: "kestrel", name: "Kestrel Freight", rating: "Target", people: 560, roles: 21, coverage: "Failed", failed: true, checked: "1d", checkedMinutes: 1440 },
  { id: "loadstar", name: "Loadstar Systems", rating: "Target", people: 140, roles: 12, coverage: "Job board", checked: "2h", checkedMinutes: 120 },
  { id: "fernhill", name: "Fernhill Foods", rating: "Maybe", people: 9200, roles: 64, coverage: "Job board", checked: "6h", checkedMinutes: 360 },
  { id: "lumen", name: "Lumen Planning", rating: "Maybe", people: 24, roles: 3, coverage: "Apollo", checked: "3d", checkedMinutes: 4320 },
];

const more: Company[] = [
  { id: "northgate", name: "Northgate Grocers", rating: "Target", people: 12400, roles: 17, coverage: "Job board", checked: "5h", checkedMinutes: 300 },
  { id: "tidewell", name: "Tidewell Medical Supply", rating: "Maybe", people: 2400, roles: 9, coverage: "Apollo", checked: "2d", checkedMinutes: 2880 },
  { id: "copperline", name: "Copperline Robotics", rating: "Target", people: 450, roles: 45, coverage: "Job board", checked: "4h", checkedMinutes: 240 },
  { id: "parcelpoint", name: "Parcelpoint", rating: "Maybe", people: 40, roles: 6, coverage: "Job board", checked: "1d", checkedMinutes: 1440 },
  { id: "orchard", name: "Orchard Forecasting", rating: "Target", people: 32, roles: 4, coverage: "Job board", checked: "8h", checkedMinutes: 480 },
  { id: "bramblewood", name: "Bramblewood Home", rating: "Maybe", people: 600, roles: 11, coverage: "Apollo", checked: "3d", checkedMinutes: 4320 },
  { id: "ashgrove", name: "Ashgrove Manufacturing", rating: "Target", people: 3100, roles: 72, coverage: "Job board", checked: "1h", checkedMinutes: 60 },
];

const columns: Column<Company>[] = [
  {
    key: "name",
    label: "Company",
    sortable: true,
    cell: (c) => (
      <span className="flex items-center gap-2">
        <Avatar name={c.name} company size={20} />
        <span className="truncate font-medium">{c.name}</span>
      </span>
    ),
  },
  { key: "rating", label: "Rating", width: 96, cell: (c) => <StatusTag tone={c.rating === "Target" ? "good" : "neutral"}>{c.rating}</StatusTag> },
  { key: "people", label: "People", width: 72, align: "end", sortable: true, cell: (c) => c.people.toLocaleString("en-US") },
  { key: "roles", label: "Open roles", width: 84, align: "end", sortable: true, cell: (c) => c.roles },
  {
    key: "coverage",
    label: "Coverage",
    width: 96,
    cell: (c) =>
      c.failed ? (
        // Red words in light mode; in dark mode the words stay in the text colour and the icon carries the red.
        <span className="flex items-center gap-2 text-red dark:text-text">
          <Icons.failed aria-hidden className="text-red" />
          {c.coverage}
        </span>
      ) : (
        <span className="text-muted">{c.coverage}</span>
      ),
  },
  { key: "checkedMinutes", label: "Checked", width: 72, align: "end", sortable: true, cell: (c) => <span className="text-muted">{c.checked}</span> },
];

function sorted(rows: Company[], sort: Sort) {
  const dir = sort.dir === "asc" ? 1 : -1;
  const key = sort.key as keyof Company;
  return [...rows].sort((a, b) => (a[key]! < b[key]! ? -dir : a[key]! > b[key]! ? dir : 0));
}

// Companies, sorted by open roles; Meridian Coldchain is open. Click a header to sort, a row (or Enter on it) to open; J and K
// move between rows.
export const Companies: Story = {
  args: { label: "Companies", columns: [], rows: [], rowKey: () => "" },
  render: function Render() {
    const [sort, setSort] = useState<Sort>({ key: "roles", dir: "desc" });
    const [open, setOpen] = useState("meridian");
    return (
      <Table
        label="Companies"
        columns={columns}
        rows={sorted(companies, sort)}
        rowKey={(c) => c.id}
        sort={sort}
        onSort={setSort}
        selectedKey={open}
        onOpen={(c) => setOpen(c.id)}
      />
    );
  },
};

// The header stays put while the body scrolls.
export const StickyHeader: Story = {
  args: { label: "Companies", columns: [], rows: [], rowKey: () => "" },
  render: function Render() {
    const [sort, setSort] = useState<Sort>({ key: "people", dir: "desc" });
    const [open, setOpen] = useState<string>();
    return (
      <Table
        label="Companies"
        className="h-60"
        columns={columns}
        rows={sorted([...companies, ...more], sort)}
        rowKey={(c) => c.id}
        sort={sort}
        onSort={setSort}
        selectedKey={open}
        onOpen={(c) => setOpen(c.id)}
      />
    );
  },
};
