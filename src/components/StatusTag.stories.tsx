import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Icons } from "./icons";
import { Count, FitWord, StatusTag, UnreadMark, type StatusTone } from "./StatusTag";

const meta = { title: "Components/StatusTag", component: StatusTag } satisfies Meta<typeof StatusTag>;
export default meta;
type Story = StoryObj<typeof meta>;

const vocabulary: [string, StatusTone, string[]][] = [
  ["Good", "good", ["Approved", "Up to date", "Offer", "Target"]],
  ["Caution", "caution", ["Needs a look", "Changed since it was written", "Follow up today"]],
  ["Problem", "problem", ["Against your limits", "Failed", "Couldn’t read"]],
  ["Info", "info", ["Applied", "Interviewing", "New version to keep or discard"]],
  ["Neutral", "neutral", ["Preparing", "Maybe", "Closed · No response"]],
];

export const Tones: Story = {
  args: { tone: "good", children: "Approved" },
  render: () => (
    <div className="flex flex-col">
      {vocabulary.map(([name, tone, words]) => (
        <div key={tone} className="flex min-h-12 items-center gap-4 border-t">
          <span className="w-[72px] shrink-0 text-body-sm leading-body-sm font-medium">{name}</span>
          <div className="flex flex-wrap gap-1.5">
            {words.map((w) => (
              <StatusTag key={w} tone={tone}>
                {w}
              </StatusTag>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const FitCountsAndUnread: Story = {
  name: "Fit, counts and unread",
  args: { tone: "good", children: "Strong" },
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        <StatusTag tone="good">Strong</StatusTag>
        <StatusTag tone="caution">Some</StatusTag>
        <StatusTag tone="neutral">Weak</StatusTag>
        <StatusTag tone="neutral">None</StatusTag>
      </div>
      <div className="flex flex-col gap-1.5 text-body-sm leading-body-sm">
        {(
          [
            ["Supply Chain Product", "strong"],
            ["Solutions Consulting", "some"],
            ["Supply Planning", "weak"],
          ] as const
        ).map(([direction, level]) => (
          <p key={direction} className="flex gap-2">
            <span className="font-medium text-text">{direction}</span>
            <FitWord level={level} />
          </p>
        ))}
      </div>
      <div className="flex items-center gap-4 text-body-sm leading-body-sm">
        <span className="flex items-center gap-2">
          <Icons.review className="text-muted" aria-hidden="true" />
          <span className="font-medium text-text">Review</span>
          <Count>14</Count>
        </span>
        <span className="flex items-center gap-2">
          <UnreadMark />
          <span className="font-semibold text-text">Unread</span>
        </span>
      </div>
    </div>
  ),
};
