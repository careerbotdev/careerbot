import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Link from "next/link";
import { Activity, ActivityList, type Job } from "./Activity";
import { Button } from "./Button";
import { Icons } from "./icons";

const meta = { title: "Patterns/Activity", component: Activity } satisfies Meta<typeof Activity>;
export default meta;
type Story = StoryObj<typeof meta>;

const jobs: Job[] = [
  { id: "rank", label: "Ranking 38 new roles", state: "running", progress: 24 / 38, detail: "24 of 38", brief: "Ranking 24 of 38" },
  { id: "resume", label: "Writing your Solutions Consulting resume", state: "running", progress: 0.3, detail: "About a minute" },
  { id: "kestrel", label: "Couldn’t read Kestrel Freight’s job board", state: "failed", detail: "The page didn’t load.", onRetry: () => {} },
  { id: "story", label: "Read your Ironbridge story", state: "done", detail: "5 facts to review", time: "8:52" },
  { id: "companies", label: "Found 12 companies for Supply Chain Product", state: "done", time: "8:14" },
];
const spend = { period: "September", lines: ["AI $4.12 of $25", "Apollo 312 of 500"] };

// The indicator at the foot of the sidebar, opened: running work with its progress, what failed with Try again, and
// what finished, with this month's spending underneath. The panel is drawn in place, as on the board, so light and dark
// both show it; click the indicator for the real one, which opens upward (Esc or a click outside closes it).
export const IndicatorOpened: Story = {
  name: "Indicator, opened",
  args: { jobs, spend },
  render: (args) => (
    <div className="flex flex-col items-start gap-1.5">
      <div className="w-[360px] rounded-sm border bg-surface p-1 text-text shadow-raised dark:bg-subtle">
        <ActivityList jobs={args.jobs} spend={args.spend} />
      </div>
      <div className="flex w-60 flex-col gap-px border bg-subtle p-2">
        <Activity {...args} />
        <Link href="/settings" className="flex h-[30px] items-center gap-2.5 rounded-sm px-2 text-body-sm leading-body-sm font-medium text-text hover:bg-hover">
          <Icons.settings className="text-muted" />
          Settings
        </Link>
      </div>
    </div>
  ),
};

// With nothing running, the indicator names what needs a look, or just opens the recent list.
export const States: Story = {
  args: { jobs },
  render: () => (
    <div className="flex w-60 flex-col gap-px border bg-subtle p-2">
      <Activity jobs={jobs} spend={spend} />
      <Activity jobs={jobs.filter((j) => j.state !== "running")} spend={spend} />
      <Activity jobs={jobs.filter((j) => j.state === "done")} spend={spend} />
    </div>
  ),
};

// Each action still shows its own brief state where it was started: a loading button while it runs, then its result.
export const AnActionsOwnState: Story = {
  name: "An action’s own state",
  args: { jobs },
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="primary" loading loadingLabel="Tailoring">
        Tailor a resume
      </Button>
      <Button loading loadingLabel="Finding people">
        Find people
      </Button>
      <span className="flex items-center gap-1.5 text-body-sm leading-body-sm text-good-text">
        <Icons.done className="text-good" />
        Resume ready
      </span>
    </div>
  ),
};
