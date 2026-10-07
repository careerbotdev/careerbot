import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { PeopleMockup } from "./People";
import { MockupFrame } from "./MockupFrame";

// The People mock-up: playing (the key person lights up, the thread fades in, the note slides in, then the line to
// the inbox fades in and the send arrow slides), its final frame (the still), with reduced motion (the still, nothing
// moves), and on a phone (the drawing redrawn for the small board).

const meta = { title: "Site/Mockups/People", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="lead">
      <PeopleMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="lead">
      <PeopleMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="lead">
        <PeopleMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="lead">
      <PeopleMockup />
    </MockupFrame>
  ),
};
