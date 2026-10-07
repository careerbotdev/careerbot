import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Select, type SelectOption } from "./Select";

const directions: (SelectOption<string> | "separator")[] = [
  { value: "all", label: "All directions" },
  "separator",
  { value: "product", label: "Supply Chain Product", count: 212 },
  { value: "solutions", label: "Solutions Consulting", count: 146 },
  { value: "planning", label: "Supply Planning", count: 54 },
];

const statuses: SelectOption<string>[] = [
  { value: "interested", label: "Interested", mark: "neutral" },
  { value: "applied", label: "Applied", mark: "info" },
  { value: "interviewing", label: "Interviewing", mark: "info" },
  { value: "offer", label: "Offer", mark: "good" },
  { value: "closed", label: "Closed", mark: "neutral" },
];

function Specimen({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex w-62 flex-col gap-1.5">
      <span className="text-label leading-label font-medium text-text">{label}</span>
      {children}
      {note && <span className="text-body-sm leading-body-sm text-muted">{note}</span>}
    </div>
  );
}

function Choose({ label, initial, options, ...rest }: { label: string; initial?: string; options: readonly (SelectOption<string> | "separator")[]; disabled?: boolean; reason?: string }) {
  const [value, setValue] = useState(initial);
  return <Select label={label} value={value} onChange={setValue} options={options} className="w-62" {...rest} />;
}

const meta = { title: "Components/Select" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => (
    <div className="flex flex-wrap gap-x-6 gap-y-5">
      <Specimen label="Direction" note="Default">
        <Choose label="Direction" initial="all" options={directions} />
      </Specimen>
      <Specimen label="Status" note="With a leading mark">
        <Choose label="Status" initial="interviewing" options={statuses} />
      </Specimen>
      <Specimen label="Model for resumes" note="Disabled until a key is added">
        <Choose label="Model for resumes" initial="sonnet" options={[{ value: "sonnet", label: "Claude Sonnet 5" }]} disabled reason="Add an OpenRouter key in Settings first." />
      </Specimen>
      <Specimen label="Direction" note="Nothing chosen">
        <Select label="Direction" value={undefined} onChange={() => {}} options={directions} placeholder="Choose a direction…" className="w-62" />
      </Specimen>
    </div>
  ),
};

// The list open under the field, with the choice ticked and counts at the right.
export const Open: Story = {
  render: () => (
    <div className="h-64">
      <Specimen label="Direction">
        <Choose label="Direction" initial="product" options={directions} />
      </Specimen>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [field] = within(canvasElement).getAllByRole("combobox", { name: "Direction" });
    await userEvent.click(field);
    await expect(await within(document.body).findAllByRole("option")).not.toHaveLength(0);
  },
};

// In running text, such as a resume's role title: no box until the pointer is over it.
export const Inline: Story = {
  render: function Inline() {
    const [value, setValue] = useState("official");
    const options = [
      { value: "official", label: "Official: Production Planning Lead" },
      { value: "translated", label: "Translated: Materials Planning Manager" },
    ];
    return (
      <p className="text-body-md leading-body-md">
        <Select label="Title" variant="inline" value={value} onChange={setValue} options={options} display={value === "official" ? "Production Planning Lead" : "Materials Planning Manager"} />
        <span className="text-muted"> · Kettle & Crane Brewing · 2017–2020</span>
      </p>
    );
  },
};

// Below 768px the list opens in the sheet.
export const OnAPhone: Story = {
  globals: { viewport: { value: "mobile2" }, theme: "light" },
  render: () => (
    <div className="flex flex-col gap-5">
      <Specimen label="Direction" note="Tap to choose in a sheet">
        <Choose label="Direction" initial="product" options={directions} />
      </Specimen>
      <Specimen label="Status" note="With a leading mark">
        <Choose label="Status" initial="interviewing" options={statuses} />
      </Specimen>
    </div>
  ),
};
