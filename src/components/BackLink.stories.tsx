import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BackLink } from "./BackLink";

const meta = { title: "Components/BackLink", component: BackLink } satisfies Meta<typeof BackLink>;
export default meta;
type Story = StoryObj<typeof meta>;

// Above a detail page's heading, back to the list it came from.
export const Default: Story = {
  args: { href: "/record/story", label: "Story" },
  render: (args) => (
    <div className="flex flex-col gap-2 p-4">
      <BackLink {...args} />
      <h1 className="text-title-lg leading-title-lg font-semibold text-text">Ironbridge Logistics, 2020–2023</h1>
    </div>
  ),
};
