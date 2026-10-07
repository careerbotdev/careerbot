import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Logo } from "./Logo";

const meta = { title: "Components/Logo", component: Logo } satisfies Meta<typeof Logo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Logos: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Logo />
      <Logo height={40} />
      <Logo variant="mark" height={32} />
    </div>
  ),
};
