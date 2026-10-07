import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ValueTags } from "./ValueTags";

const meta = { title: "Components/ValueTags", component: ValueTags } satisfies Meta<typeof ValueTags>;
export default meta;
type Story = StoryObj<typeof meta>;

// A rule's industries, all shown.
export const Industries: Story = {
  args: { label: "Industries wanted", items: ["Supply chain software", "Food manufacturing", "Freight and logistics", "Cold chain", "Warehouse robotics", "Grocery retail", "Medical distribution", "Packaging"] },
  render: (args) => (
    <div className="w-96">
      <ValueTags {...args} />
    </div>
  ),
};

// A long list folded after eight: "+5" shows the rest.
export const Folded: Story = {
  args: {
    label: "Keywords",
    max: 8,
    items: ["supply planning", "S&OP", "demand forecasting", "inventory optimization", "MRP", "capacity planning", "transportation management", "carrier scorecards", "load planning", "cold chain", "lot traceability", "co-packers", "NetSuite"],
  },
  render: (args) => (
    <div className="w-96">
      <ValueTags {...args} />
    </div>
  ),
};
