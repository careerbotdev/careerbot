import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { Combobox, type ComboboxOption } from "./Combobox";

const companies: ComboboxOption[] = [
  { value: "loadstar", label: "Loadstar Systems", mark: "L", note: "Target" },
  { value: "lodestone", label: "Lodestone Packaging", mark: "L", note: "Found" },
  { value: "meridian", label: "Meridian Coldchain", mark: "M", note: "Target" },
  { value: "orchard", label: "Orchard Forecasting", mark: "O", note: "Maybe" },
  { value: "fernhill", label: "Fernhill Foods", mark: "F", note: "Found" },
];

const models: ComboboxOption[] = [
  { value: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", detail: "$3.00 in · $15.00 out per million tokens · reasoning" },
  { value: "anthropic/claude-haiku-5", label: "Claude Haiku 5", detail: "$0.80 in · $4.00 out per million tokens" },
  { value: "openai/gpt-5-mini", label: "GPT-5 mini", detail: "$0.25 in · $2.00 out per million tokens · reasoning" },
];

function Company({ initial }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex w-62 flex-col gap-1.5">
      <span className="text-label leading-label font-medium text-text">Company</span>
      <Combobox label="Company" value={value} onChange={setValue} options={companies} placeholder="Choose a company" searchPlaceholder="Search companies" custom addLabel={(t) => `Add “${t}” as a company`} />
    </div>
  );
}

const meta = { title: "Components/Combobox" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Company initial="loadstar" />
      <Company />
    </div>
  ),
};

// Typing narrows the list; what's typed can be added when it isn't there.
export const Open: Story = {
  render: () => (
    <div className="h-56">
      <Company />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [field] = within(canvasElement).getAllByRole("button", { name: "Company" });
    await userEvent.click(field);
    await userEvent.keyboard("Lod");
  },
};

// A second line under each option, such as a model's price.
export const WithDetail: Story = {
  render: function WithDetail() {
    const [value, setValue] = useState<string>("anthropic/claude-sonnet-5");
    return (
      <div className="flex w-80 flex-col gap-1.5">
        <span className="text-label leading-label font-medium text-text">Model for resumes</span>
        <Combobox label="Model for resumes" value={value} onChange={setValue} options={models} placeholder="Choose a model" searchPlaceholder="Search models" />
      </div>
    );
  },
};

// Below 768px the search and the list open in the sheet.
export const OnAPhone: Story = {
  globals: { viewport: { value: "mobile2" }, theme: "light" },
  render: () => <Company initial="loadstar" />,
};
