import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { RootedMockup } from "./Rooted";
import { MockupFrame } from "./MockupFrame";

// The Rooted mock-up: playing (on a device that can hover, the thread draws while the pointer is over it; otherwise
// it draws once when seen), its final frame (the still), with reduced motion (the still, nothing moves), and on a
// phone (the same drawing, scaled down).

const meta = { title: "Site/Mockups/Rooted", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="compact">
      <RootedMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="compact">
      <RootedMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="compact">
        <RootedMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="compact">
      <RootedMockup />
    </MockupFrame>
  ),
};
