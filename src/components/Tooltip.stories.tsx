import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

const meta = { title: "Components/Tooltip", component: Tooltip } satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

// Each specimen keeps room below its trigger for the tooltip, which floats over the page.
function Spot({ children, height, width }: { children: ReactNode; height: number; width: number }) {
  return (
    <div className="flex shrink-0 flex-col items-start" style={{ height, width }}>
      {children}
    </div>
  );
}

export const Explainer: Story = {
  name: "Tooltip",
  args: { content: "More actions", children: <button type="button" /> },
  render: () => (
    <div className="flex flex-col gap-7">
      <div className="flex items-start gap-8">
        <Spot height={120} width={100}>
          <Tooltip content="More actions" defaultOpen>
            <Button icon="more" iconOnly aria-label="More actions" />
          </Tooltip>
        </Spot>
        <Spot height={120} width={240}>
          <Tooltip content="Approve" keys="A" detail="Adds this fact to your record." note="Free · Undo with U" defaultOpen>
            <Button variant="primary" keys="A">
              Approve
            </Button>
          </Tooltip>
        </Spot>
      </div>
      <div className="flex items-start gap-8">
        <Spot height={136} width={240}>
          <Tooltip content="Find roles now" detail="Looks for new openings at Loadstar Systems." note="About 1 Apollo credit" defaultOpen>
            <Button icon="tryAgain">Find roles now</Button>
          </Tooltip>
        </Spot>
        <Spot height={136} width={240}>
          <Tooltip content="Tailor a resume" detail="Add an OpenRouter key in Settings to write resumes." defaultOpen>
            <Button icon="resumes" reason="Add an OpenRouter key in Settings to write resumes.">
              Tailor a resume
            </Button>
          </Tooltip>
        </Spot>
      </div>
    </div>
  ),
};

// Hover or focus any of these; the tooltip waits 500ms. On a touch screen, press and hold to read it in a sheet.
export const Live: Story = {
  name: "Hover, focus and long press",
  args: { content: "More actions", children: <button type="button" /> },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" keys="A" detail="Adds this fact to your record." note="Free · Undo with U">
        Approve
      </Button>
      <Button icon="tryAgain" detail="Looks for new openings at Loadstar Systems." note="About 1 Apollo credit">
        Find roles now
      </Button>
      <Button icon="resumes" reason="Add an OpenRouter key in Settings to write resumes.">
        Tailor a resume
      </Button>
      <Button icon="thirdPane" iconOnly aria-label="Show details" keys="]" />
      <Button variant="ghost" icon="more" iconOnly aria-label="More actions" />
    </div>
  ),
};
