import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { MockupFrame } from "./MockupFrame";
import { StoryMockup } from "./Story";

// Step 01's mock-up (Know your story): playing (looping every 6s from its still), its final frame (the still), with reduced motion (the
// still, nothing moves), and on a phone (the same drawing, scaled down).

const meta = { title: "Site/Mockups/Story", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="lead">
      <StoryMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="lead">
      <StoryMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="lead">
        <StoryMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="lead">
      <StoryMockup />
    </MockupFrame>
  ),
};
