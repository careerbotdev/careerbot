import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { MockupFrame } from "./MockupFrame";
import { PainResumeMockup } from "./Pains";

// A resume that sells you short: playing (once, when scrolled into view: the plain resume slides over the lit one and
// its lit line dims), its final frame (the still), with reduced motion (the still, nothing moves), and on a phone (the
// same drawing, scaled).

const meta = { title: "Site/Mockups/Pain resume", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="pain">
      <PainResumeMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="pain">
      <PainResumeMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="pain">
        <PainResumeMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="pain">
      <PainResumeMockup />
    </MockupFrame>
  ),
};
