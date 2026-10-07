import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { MultiSelect } from "./MultiSelect";

const industries = [
  { value: "supply-chain-software", label: "Supply chain software" },
  { value: "food-manufacturing", label: "Food manufacturing" },
  { value: "freight", label: "Freight and logistics" },
  { value: "cold-chain", label: "Cold chain" },
  { value: "grocery", label: "Grocery retail" },
];

function Industries({ initial = [] }: { initial?: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-full max-w-142">
      <MultiSelect label="Industries" value={value} onChange={setValue} options={industries} empty="Any" />
    </div>
  );
}

const meta = { title: "Components/MultiSelect" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Industries initial={["supply-chain-software", "food-manufacturing", "freight"]} />
      <Industries />
    </div>
  ),
};

// Every option has a check box; the list stays open while you tick.
export const Open: Story = {
  render: () => (
    <div className="h-64">
      <Industries initial={["supply-chain-software", "food-manufacturing", "freight"]} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [field] = within(canvasElement).getAllByRole("combobox", { name: "Industries" });
    await userEvent.click(field);
  },
};

// Below 768px the list opens in the sheet.
export const OnAPhone: Story = {
  globals: { viewport: { value: "mobile2" }, theme: "light" },
  render: () => <Industries initial={["supply-chain-software", "food-manufacturing", "freight"]} />,
};

// With `custom`, what's typed can be added as it is: a direction's titles, with a suggestion or two to tick.
function Titles() {
  const [value, setValue] = useState(["Product Manager, Supply Chain", "Senior Product Manager, Planning"]);
  return (
    <div className="h-64 w-full max-w-142">
      <MultiSelect label="Titles" value={value} onChange={setValue} options={[{ value: "Solutions Consultant", label: "Solutions Consultant" }]} custom />
    </div>
  );
}

export const TypedValues: Story = {
  name: "Typed values",
  render: () => <Titles />,
  play: async ({ canvasElement }) => {
    const [field] = within(canvasElement).getAllByRole("combobox", { name: "Titles" });
    await userEvent.type(field, "Head of Product");
  },
};
