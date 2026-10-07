import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { MockupFrame } from "./MockupFrame";
import { OpenMockup } from "./Open";

// Open source's mock-up, on the grey stage the page shows it on (wider than tall from a phone up to medium, taller on
// a large screen): playing (once, when scrolled into view), its final frame (the still), with reduced motion (the
// still, nothing moves), and on a phone (scaled down).

const meta = { title: "Site/Mockups/Open", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function OnStage({ children }: { children: ReactNode }) {
  return (
    <MockupFrame width="lead">
      <div className="flex aspect-[350/240] items-center rounded-site-stage-sm bg-subtle px-[5.7%] lg:aspect-[640/560] lg:rounded-site-band lg:px-[6.25%]">{children}</div>
    </MockupFrame>
  );
}

export const Playing: Story = {
  render: () => (
    <OnStage>
      <OpenMockup />
    </OnStage>
  ),
};

export const FinalFrame: Story = {
  name: "Final frame",
  render: () => (
    <OnStage>
      <OpenMockup still />
    </OnStage>
  ),
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <OnStage>
        <OpenMockup />
      </OnStage>
    </MotionConfig>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <OnStage>
      <OpenMockup />
    </OnStage>
  ),
};
