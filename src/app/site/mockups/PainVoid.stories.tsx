import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { MockupFrame } from "./MockupFrame";
import { PainVoidMockup } from "./Pains";

// Applying into the void's envelopes: playing (looping every 6s while in view: they drift into the void, shrinking and
// fading, and the next ones slide in behind), its final frame (the still), with reduced motion (the still, nothing
// moves), and on a phone (the same drawing, scaled).

const meta = { title: "Site/Mockups/Pain void", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="pain">
      <PainVoidMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="pain">
      <PainVoidMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="pain">
        <PainVoidMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="pain">
      <PainVoidMockup />
    </MockupFrame>
  ),
};
