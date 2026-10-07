import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Progress } from "./Progress";
import { Spinner } from "./Spinner";

const meta = { title: "Components/Progress", component: Progress } satisfies Meta<typeof Progress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ProgressAndSpinner: Story = {
  name: "Progress and spinner",
  args: { label: "Ranking 38 new roles", value: 24, max: 38 },
  render: () => (
    <div className="flex max-w-[566px] flex-col gap-[18px]">
      <Progress label="Ranking 38 new roles" value={24} max={38} detail="24 of 38" />
      <Progress label="Reading your Ironbridge story" value={0.3} detail="About a minute" />
      <Progress label="Wrote your Solutions Consulting resume" value={1} status="done" detail="Done" />
      <Progress label="Checking Kestrel Freight’s job board" value={12} max={40} status="stopped" detail="Stopped at 12 of 40" />
      <Progress label="Getting started" value={2} max={7} status="steps" detail="2 of 7" />
      <div className="flex items-center gap-4">
        <Spinner label="Loading" />
        <Spinner size={20} label="Loading" />
        <span className="text-body-sm leading-body-sm text-muted">Spinner, 16 and 20. Only for work under a few seconds.</span>
      </div>
    </div>
  ),
};
