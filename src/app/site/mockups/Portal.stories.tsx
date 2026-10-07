import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { PortalMockup } from "./Portal";
import { MockupFrame } from "./MockupFrame";

// The career portal's mock-up: playing (once in view, the window rises and the tiles fade up in reading order), its
// final frame (the still), with reduced motion (the still, nothing moves), and at a phone's width (scaled down; a
// phone's page lists the seven instead).

const meta = { title: "Site/Mockups/Portal", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="hero">
      <PortalMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="hero">
      <PortalMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="hero">
        <PortalMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="hero">
      <PortalMockup />
    </MockupFrame>
  ),
};
