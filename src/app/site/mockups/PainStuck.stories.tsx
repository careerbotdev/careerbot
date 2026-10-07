import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { MockupFrame } from "./MockupFrame";
import { PainStuckMockup } from "./Pains";

// Stuck, and not sure where to go: playing (once, when scrolled into view: the path draws to the fork, the branches draw
// out into the fog and the dot pulses once), its final frame (the still), with reduced motion (the still, nothing
// moves), and on a phone (the same drawing, scaled).

const meta = { title: "Site/Mockups/Pain stuck", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="pain">
      <PainStuckMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="pain">
      <PainStuckMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="pain">
        <PainStuckMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="pain">
      <PainStuckMockup />
    </MockupFrame>
  ),
};
