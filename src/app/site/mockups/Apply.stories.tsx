import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { ApplyMockup } from "./Apply";
import { MockupFrame } from "./MockupFrame";

// Step 03's mock-up (Read the room): playing (once, when scrolled into view, about 4s), its final frame (the still: the third section
// being written), with reduced motion (the still, nothing moves), and on a phone (the same drawing, scaled down).

const meta = { title: "Site/Mockups/Apply", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="lead">
      <ApplyMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="lead">
      <ApplyMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="lead">
        <ApplyMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="lead">
      <ApplyMockup />
    </MockupFrame>
  ),
};
