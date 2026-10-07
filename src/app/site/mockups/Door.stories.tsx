import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { DoorMockup } from "./Door";

// The closing's door: playing (once, when scrolled into view: the envelopes drift and fade, the line draws out, the
// reply slides up and its check fades in last), its final frame (the still), with reduced motion (the still, nothing
// moves), and on a phone (302 wide). Shown on the page itself, above where the closing's heading goes.

const meta = { title: "Site/Mockups/Door", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <div className="px-5 py-16">
      <DoorMockup />
    </div>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <div className="px-5 py-16">
      <DoorMockup still />
    </div>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <div className="px-5 py-16">
        <DoorMockup />
      </div>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <div className="px-5 py-16">
      <DoorMockup />
    </div>
  ),
};
