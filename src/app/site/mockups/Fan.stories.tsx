import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { FanMockup } from "./Fan";
import { MockupFrame } from "./MockupFrame";

// The Directions fan: playing (once, when scrolled into view: the fan draws out, the steel path reaches the amber
// direction and what carries over is checked), its final frame (the still), with reduced motion (the still, nothing
// moves), and at a phone's width (scaled down; a phone's page leaves it out).

const meta = { title: "Site/Mockups/Fan", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="hero">
      <FanMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="hero">
      <FanMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="hero">
        <FanMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="hero">
      <FanMockup />
    </MockupFrame>
  ),
};
