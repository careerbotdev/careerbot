import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { Why } from "./Why";

// Why it isn't working, large (resize for medium) and on a phone, and with reduced motion (the drawings and words
// held still).

const meta = { title: "Site/Parts/Why", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = { render: () => <Why /> };

export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Why /> };

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <Why />
    </MotionConfig>
  ),
};
