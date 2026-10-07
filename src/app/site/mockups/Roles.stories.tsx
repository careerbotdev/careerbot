import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { MockupFrame } from "./MockupFrame";
import { RolesMockup } from "./Roles";

// Step 02's mock-up (Aim, don't spray): playing (once, when scrolled into view), its final frame (the still), with reduced motion (the
// still, nothing moves), and on a phone (the same drawing, scaled down).

const meta = { title: "Site/Mockups/Roles", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <MockupFrame width="lead">
      <RolesMockup />
    </MockupFrame>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <MockupFrame width="lead">
      <RolesMockup still />
    </MockupFrame>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <MockupFrame width="lead">
        <RolesMockup />
      </MockupFrame>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <MockupFrame width="lead">
      <RolesMockup />
    </MockupFrame>
  ),
};
