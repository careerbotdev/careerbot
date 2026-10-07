import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { SignInScene } from "./Hero";

// The sign-in page's scene (Sign in — large and small): playing (on load, as the hero's), its final frame (the still),
// with reduced motion (the still, nothing moves), and on a phone (the 190px strip). Shown in the box the sign-in page
// gives it: the right half of the page from large screens up (720 × 900 with 24px around), the strip below.

const meta = { title: "Site/Mockups/Sign-in scene", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  render: () => (
    <div className="ml-auto h-47.5 w-full px-5 lg:h-225 lg:max-w-180 lg:p-6">
      <SignInScene />
    </div>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <div className="ml-auto h-47.5 w-full px-5 lg:h-225 lg:max-w-180 lg:p-6">
      <SignInScene still />
    </div>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <div className="ml-auto h-47.5 w-full px-5 lg:h-225 lg:max-w-180 lg:p-6">
        <SignInScene />
      </div>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <div className="ml-auto h-47.5 w-full px-5 lg:h-225 lg:max-w-180 lg:p-6">
      <SignInScene />
    </div>
  ),
};
