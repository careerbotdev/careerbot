import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { METHOD } from "../words";
import { STEP_TILES } from "./Steps";

// Home's four step tiles: playing (each once, when scrolled into view: 01 the amber line draws, the connector runs
// down and the new fact arrives; 02 the rows arrive, then the top one's outline and amber bar; 03 the marks fill in one
// by one, then the amber rule; 04 the person lights amber, the dotted line, the note, then the inbox row), their final
// frames (the stills), with reduced motion (the stills, nothing moves), and on a phone (two across, as on a medium
// screen; a phone's page lists the steps without tiles). Shown four across, as on a large screen; the frame around them
// is one drawing for the checks, which compare the whole row.

const meta = { title: "Site/Mockups/Steps", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Row({ still = false }: { still?: boolean }) {
  return (
    <div role="img" aria-label="Home's four step tiles" className="mx-auto grid w-full max-w-300 grid-cols-2 gap-6 p-5 lg:grid-cols-4">
      {STEP_TILES.map((Tile, i) => (
        <Tile key={METHOD.steps[i].n} still={still} />
      ))}
    </div>
  );
}

export const Playing: Story = { render: () => <Row /> };

export const FinalFrame: Story = { name: "Final frame", render: () => <Row still /> };

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <Row />
    </MotionConfig>
  ),
};

export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Row /> };
