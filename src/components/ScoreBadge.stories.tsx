import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ScoreBadge } from "./ScoreBadge";

const meta = { title: "Components/ScoreBadge", component: ScoreBadge } satisfies Meta<typeof ScoreBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

const scores = [
  [92, "strong", "Strong"],
  [68, "some", "Some"],
  [41, "weak", "Weak"],
  [12, "none", "None"],
  [null, null, "No score"],
] as const;

export const Sizes: Story = {
  name: "Score badge",
  args: { score: 92, level: "strong" },
  render: () => (
    <div className="flex flex-col gap-4">
      {(
        [
          ["lg", "40"],
          ["md", "28"],
          ["sm", "20"],
        ] as const
      ).map(([size, px]) => (
        <div key={size} className="flex items-center gap-2.5">
          {scores.map(([score, level], i) => (
            <ScoreBadge key={i} score={score} level={level} size={size} />
          ))}
        </div>
      ))}
      <div className="flex gap-2.5 pl-[38px]">
        {scores.map(([, , name]) => (
          <span key={name} className="w-10 shrink-0 text-label leading-label whitespace-nowrap text-muted">
            {name}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t pt-3">
        <ScoreBadge score={91} level="strong" size="lg" />
        <div className="flex flex-col">
          <span className="text-body-md leading-body-md font-semibold text-text">Senior Product Manager, Load Planning</span>
          <span className="text-body-sm leading-body-sm text-good-text">Strong fit for Supply Chain Product</span>
        </div>
      </div>
    </div>
  ),
};
