import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Skeleton, SkeletonRow, WritingCaret } from "./Skeleton";

const meta = { title: "Components/Skeleton", component: Skeleton } satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SkeletonAndWriting: Story = {
  name: "Skeleton and writing",
  render: () => (
    <div className="flex max-w-[566px] flex-col gap-6">
      <div className="flex flex-col gap-0.5 border">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
      <div className="flex flex-col gap-2.5 border p-4">
        <h3 className="text-title-md leading-title-md font-semibold text-text">Supply Chain Product resume</h3>
        <p className="text-body-sm leading-body-sm font-semibold text-text">Network Operations Manager, Ironbridge Logistics · 2020–2023</p>
        <p className="flex gap-2 text-body-sm leading-body-sm">
          <span className="text-muted">–</span>
          <span className="text-text">Opened the Ohio Valley cross-dock and planned its first 40 lanes.</span>
        </p>
        <p className="flex items-center text-body-sm leading-body-sm">
          <span className="mr-2 text-muted">–</span>
          <span className="text-text">Led the move to a new transportation management system for</span>
          <WritingCaret />
        </p>
        <Skeleton className="h-2.5 w-4/5" />
        <Skeleton className="h-2.5 w-3/5" />
      </div>
    </div>
  ),
};
