import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { MockupFrame } from "./MockupFrame";
import { AimMockup, ScatterMockup } from "./Why";

// Why it isn't working's two drawings side by side, the usual search and what works: playing (once, when scrolled into
// view), their final frame (the still), with reduced motion (the still, nothing moves), and on a phone (stacked, the
// same drawings scaled down).

const meta = { title: "Site/Mockups/Why", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Both({ still = false }: { still?: boolean }) {
  return (
    <MockupFrame width="hero">
      <div className="flex flex-col gap-12 md:flex-row">
        <div className="min-w-0 flex-1">
          <ScatterMockup still={still} />
        </div>
        <div className="min-w-0 flex-1">
          <AimMockup still={still} />
        </div>
      </div>
    </MockupFrame>
  );
}

export const Playing: Story = { render: () => <Both /> };

export const FinalFrame: Story = { name: "Final frame", render: () => <Both still /> };

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <Both />
    </MotionConfig>
  ),
};

export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Both /> };
