"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Icons } from "./icons";
import { Popover } from "./Popover";
import { ProgressBar } from "./Progress";
import { Spinner } from "./Spinner";
import { useSmall } from "./useSmall";

// One piece of background work: running (with how far along, 0 to 1, when it's known), done, failed, or cancelled.
// `detail` is the second fact: "24 of 38" or "Waiting to start" while running, "5 facts to review" once done, "The page
// didn't load." when it failed, "Cancelled after 3 steps". `brief` is the whole thing in a few words for tight spots
// ("Ranking 24 of 38"). `time`: when it started, or finished. `waiting`: queued or paused, not started yet.
// onCancel stops running work; onClear takes finished work off the list.
export type Job = {
  id: string;
  label: string;
  state: "running" | "done" | "failed" | "cancelled";
  progress?: number;
  detail?: string;
  brief?: string;
  time?: string;
  waiting?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
  onClear?: () => void;
};

// This month's spending, shown under the list: "September", ["AI $4.12 of $25", "Apollo 312 of 500"].
export type Spend = { period: string; lines: string[] };

function tally(jobs: Job[]) {
  const running = jobs.filter((j) => j.state === "running");
  const failed = jobs.filter((j) => j.state === "failed");
  const known = running.filter((j) => j.progress !== undefined);
  const progress = known.length ? known.reduce((sum, j) => sum + (j.progress ?? 0), 0) / known.length : 0;
  const label = running.length ? `${running.length} running` : failed.length ? `${failed.length} failed` : "Activity";
  return { running, failed, progress, label };
}

function StateIcon({ jobs, size = 16 }: { jobs: Job[]; size?: 16 | 20 }) {
  const { running, failed } = tally(jobs);
  if (running.length) return <Spinner size={size} className="text-steel" />;
  if (failed.length) return <Icons.failed size={size} className="shrink-0 text-red" />;
  return <Icons.activity size={size} className="shrink-0 text-muted" />;
}

// The sidebar's one indicator for everything running. "2 running" with a thin steel bar; it opens upward into the list
// of running, done, failed and cancelled work. `look`: "sidebar" (a 30px row), "rail" (the icon alone, 56px sidebar)
// or "phone" (a 44px row in the bottom bar's More). On a phone the list opens as a sheet, Clear finished in its title.
export function Activity({
  jobs,
  spend,
  onClearFinished,
  look = "sidebar",
  defaultOpen = false,
}: {
  jobs: Job[];
  spend?: Spend;
  onClearFinished?: () => void;
  look?: "sidebar" | "rail" | "phone";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { running, progress, label } = tally(jobs);
  const brief = running[0]?.brief ?? running[0]?.detail;

  const trigger =
    look === "rail" ? (
      <button
        type="button"
        aria-label={label}
        className="flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-100 hover:bg-hover data-[state=open]:bg-hover"
      >
        <StateIcon jobs={jobs} />
      </button>
    ) : look === "phone" ? (
      <button type="button" className="flex h-11 w-full items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-100 hover:bg-hover">
        <StateIcon jobs={jobs} size={20} />
        <span className="min-w-0 flex-1 text-body-md leading-body-md text-text">{label}</span>
        {brief && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{brief}</span>}
      </button>
    ) : (
      <button
        type="button"
        className="flex h-[30px] w-full items-center gap-2.5 rounded-sm px-2 text-left outline-offset-[-2px] transition-colors duration-100 hover:bg-hover data-[state=open]:bg-hover"
      >
        <StateIcon jobs={jobs} />
        <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm font-medium text-text">{label}</span>
        {running.length > 0 && (
          <span className="flex w-9 shrink-0">
            <ProgressBar label="All running work" value={progress} className="h-[3px]" />
          </span>
        )}
      </button>
    );

  return (
    <Popover
      trigger={trigger}
      title="Activity"
      action={onClearFinished && <ClearFinished jobs={jobs} onClick={onClearFinished} small />}
      open={open}
      onOpenChange={setOpen}
      align={look === "rail" ? "end" : "start"}
      side={look === "rail" ? "right" : "top"}
      width={380}
    >
      <ActivityList jobs={jobs} spend={spend} onClearFinished={onClearFinished} />
    </Popover>
  );
}

const isFinished = (j: Job) => j.state !== "running";

// Clear finished, in the panel's header (the sheet's title on a phone); dimmed when nothing is finished.
function ClearFinished({ jobs, onClick, small = false }: { jobs: Job[]; onClick: () => void; small?: boolean }) {
  return (
    <Button
      variant="ghost"
      size={small ? "lg" : "sm"}
      className={small ? "px-1" : "px-2"}
      reason={jobs.some(isFinished) ? undefined : "Nothing finished to clear."}
      detail="Takes everything done, failed or cancelled off this list. What they did stays."
      note="Free · Undo with U"
      onClick={onClick}
    >
      Clear finished
    </Button>
  );
}

// A row's trailing action. On a large screen it shows on hover (or when Tab reaches it) in place of the time; on a
// phone it always shows, in a slot of its own.
function Trailing({ time, children, small }: { time?: string; children: ReactNode; small: boolean }) {
  if (small) return <span className="flex w-24 shrink-0 justify-center">{children}</span>;
  return (
    <>
      {time && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums group-focus-within:hidden group-hover:hidden">{time}</span>}
      <span className="sr-only shrink-0 group-focus-within:not-sr-only group-focus-within:flex group-hover:not-sr-only group-hover:flex">{children}</span>
    </>
  );
}

// The list the indicator opens: running work (Cancel), then what failed or was cancelled (Try again), then what
// finished (× clears one; Clear finished clears them all).
export function ActivityList({ jobs, spend, onClearFinished }: { jobs: Job[]; spend?: Spend; onClearFinished?: () => void }) {
  const small = useSmall();
  const { running } = tally(jobs);
  const finished = [...jobs.filter((j) => j.state === "failed" || j.state === "cancelled"), ...jobs.filter((j) => j.state === "done")];
  // On a phone the sheet already pads its content 8px, so rows sit 16px in, as on the board.
  const row = `group flex items-center ${small ? "min-h-14 gap-3 py-2 pr-1 pl-2" : "min-h-12 gap-2.5 px-3 py-2 hover:bg-subtle"}`;
  const second = (job: Job) => (small ? (job.detail ?? (job.time && (job.state === "running" ? `Started ${job.time}` : job.time))) : job.detail);
  const text = (job: Job) => (
    <div className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
      <span className="text-text">{job.label}</span>
      {second(job) && <span className="text-muted">{second(job)}</span>}
    </div>
  );
  const time = (job: Job) => (small ? undefined : job.time);

  return (
    // In the panel the header and the spending stay put and the list scrolls between them once it's taller than the
    // room; in the phone's sheet, the sheet scrolls.
    <div className="flex min-h-0 flex-col md:-m-1">
      {!small && (
        <div className="flex h-11 shrink-0 items-center gap-2 border-b pr-2 pl-3">
          <h2 className="text-body-sm leading-body-sm font-semibold text-text">Activity</h2>
          <span className="min-w-0 flex-1 text-label leading-label text-muted tabular-nums">{running.length > 0 && `${running.length} running`}</span>
          {onClearFinished && <ClearFinished jobs={jobs} onClick={onClearFinished} />}
        </div>
      )}
      {jobs.length === 0 ? (
        <p className="px-3 py-6 text-center text-body-sm leading-body-sm text-muted">Nothing running or recent.</p>
      ) : (
        <div className="flex min-h-0 flex-col overflow-y-auto py-1">
          {running.length > 0 && (
            <ul>
              {running.map((job) => (
                <li key={job.id} className={row}>
                  <Spinner className="text-steel" />
                  {text(job)}
                  {job.onCancel ? (
                    <Trailing time={time(job)} small={small}>
                      <Button
                        size={small ? "md" : "sm"}
                        className={small ? "w-24 dark:border-border" : "dark:border-border"}
                        detail={job.waiting ? "Takes it off before it runs again. Nothing more is charged." : "Stops it after the step it’s on, which is still charged. What it already finished stays."}
                        note="Free · Can’t be undone"
                        onClick={job.onCancel}
                      >
                        Cancel
                      </Button>
                    </Trailing>
                  ) : (
                    time(job) && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{time(job)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {running.length > 0 && finished.length > 0 && <div role="presentation" className="my-1 h-px shrink-0 bg-border" />}
          {finished.length > 0 && (
            <ul>
              {finished.map((job) => (
                <li key={job.id} className={row}>
                  {job.state === "failed" ? (
                    <Icons.failed aria-label="Failed" className="shrink-0 text-red" />
                  ) : job.state === "cancelled" ? (
                    <Icons.cancelled aria-label="Cancelled" className="shrink-0 text-muted" />
                  ) : (
                    <Icons.done aria-label="Done" className="shrink-0 text-good" />
                  )}
                  {text(job)}
                  {job.onRetry ? (
                    <span className={small ? "flex w-24 shrink-0 justify-center" : "flex shrink-0"}>
                      <Button
                        size={small ? "md" : "sm"}
                        className={small ? "w-24 dark:border-border" : "dark:border-border"}
                        detail="Starts this work again."
                        note="About what the first try cost, from your budgets"
                        onClick={job.onRetry}
                      >
                        Try again
                      </Button>
                    </span>
                  ) : job.onClear ? (
                    <Trailing time={time(job)} small={small}>
                      <Button
                        variant="ghost"
                        size={small ? "lg" : "sm"}
                        iconOnly
                        icon="close"
                        aria-label="Clear"
                        detail="Takes this off the list. What it did stays."
                        note="Free · Undo with U"
                        onClick={job.onClear}
                      />
                    </Trailing>
                  ) : (
                    time(job) && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{time(job)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {spend && (
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3.5 border-t px-3 py-3 text-label leading-label text-muted tabular-nums md:py-0">
          <span className="flex-1">{spend.period}</span>
          {spend.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
