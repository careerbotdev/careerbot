import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { HeroMockup } from "./Hero";
import { MockupFrame } from "./MockupFrame";

// The hero's mock-up: playing (on load: the door part plays once and holds, the envelopes drift into the void on a
// 5.3s loop), its final frame (the still), with reduced motion (the still, nothing moves), and on a phone (the same
// pieces drawn closer together).

const meta = { title: "Site/Mockups/Hero", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="hero">
      <HeroMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="hero">
      <HeroMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="hero">
        <HeroMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="hero">
      <HeroMockup />
    </MockupFrame>
  ),
};
