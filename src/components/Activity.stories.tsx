import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Link from "next/link";
import { Activity, ActivityList, type Job } from "./Activity";
import { Button } from "./Button";
import { Icons } from "./icons";

const meta = { title: "Patterns/Activity", component: Activity } satisfies Meta<typeof Activity>;
export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};
const jobs: Job[] = [
  { id: "find", label: "Finding companies", state: "running", detail: "3 steps done", time: "10:31", onCancel: noop },
  { id: "resume", label: "Writing your Sales Engineering resume", state: "running", time: "10:42", onCancel: noop },
  { id: "roles", label: "Checking roles", state: "running", detail: "Waiting to start", time: "10:44", waiting: true, onCancel: noop },
  { id: "letter", label: "Couldn’t write a cover letter for Vercel", state: "failed", detail: "This kept getting interrupted. Try again.", time: "9:58", onRetry: noop, onClear: noop },
  { id: "story", label: "Read your Side story", state: "done", time: "8:52", onClear: noop },
  { id: "companies", label: "Found companies", state: "done", time: "8:14", onClear: noop },
];
// After Cancel on Finding companies: it moves down with the failed work, with how many steps it finished.
const cancelled: Job[] = [
  ...jobs.slice(1, 4),
  { id: "find", label: "Finding companies", state: "cancelled", detail: "Cancelled after 3 steps", time: "10:31", onRetry: noop, onClear: noop },
  ...jobs.slice(4),
];
const spend = { period: "October", lines: ["AI $4.12 of $25", "Apollo 312 of 500"] };

// The panel drawn in place, as on the board, so light and dark both show it.
function Panel({ jobs }: { jobs: Job[] }) {
  return (
    <div className="w-[380px] rounded-sm border bg-surface p-1 text-text shadow-raised dark:bg-subtle">
      <ActivityList jobs={jobs} spend={spend} onClearFinished={noop} />
    </div>
  );
}

// The indicator at the foot of the sidebar, opened: running work, what failed or was cancelled with Try again, and what
// finished, with this month's spending underneath. Hovering running work shows Cancel in place of its time; hovering
// finished work shows × (Clear); Clear finished is in the header. Click the indicator for the real panel, which opens
// upward (Esc or a click outside closes it).
export const IndicatorOpened: Story = {
  name: "Indicator, opened",
  args: { jobs, spend, onClearFinished: noop },
  render: (args) => (
    <div className="flex flex-col items-start gap-1.5">
      <Panel jobs={args.jobs} />
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

// Cancelled work shows as finished: a grey stop, its name, how many steps it finished, and Try again.
export const Cancelled: Story = {
  args: { jobs: cancelled },
  render: (args) => <Panel jobs={args.jobs} />,
};

// After Clear finished: only what's still running is left, and Clear finished is dimmed until something finishes.
export const Cleared: Story = {
  args: { jobs: jobs.slice(1, 3) },
  render: (args) => <Panel jobs={args.jobs} />,
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
