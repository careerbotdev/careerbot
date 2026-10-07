"use client";

import { useState } from "react";
import { Button } from "./Button";
import { Icons } from "./icons";
import { Popover } from "./Popover";
import { ProgressBar } from "./Progress";
import { Spinner } from "./Spinner";
import { useSmall } from "./useSmall";

// One piece of background work: running (with how far along, 0 to 1, when it's known), done, or failed.
// `detail` is the second fact: "24 of 38" or "About a minute" while running, "5 facts to review" once done, "The page
// didn't load." when it failed. `brief` is the whole thing in a few words for tight spots ("Ranking 24 of 38").
export type Job = {
  id: string;
  label: string;
  state: "running" | "done" | "failed";
  progress?: number;
  detail?: string;
  brief?: string;
  time?: string;
  onRetry?: () => void;
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
// of running, done and failed work. `look`: "sidebar" (a 30px row), "rail" (the icon alone, 56px sidebar) or "phone"
// (a 44px row in the bottom bar's More). On a phone the list opens as a sheet.
export function Activity({
  jobs,
  spend,
  look = "sidebar",
  defaultOpen = false,
}: {
  jobs: Job[];
  spend?: Spend;
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
    <Popover trigger={trigger} title="Activity" open={open} onOpenChange={setOpen} align={look === "rail" ? "end" : "start"} side={look === "rail" ? "right" : "top"} width={360}>
      <ActivityList jobs={jobs} spend={spend} />
    </Popover>
  );
}

// The list the indicator opens: running work with its progress, then what failed (with Try again), then what finished.
export function ActivityList({ jobs, spend }: { jobs: Job[]; spend?: Spend }) {
  const small = useSmall();
  const { running } = tally(jobs);
  const failed = jobs.filter((j) => j.state === "failed");
  const done = jobs.filter((j) => j.state === "done");
  const finished = [...failed, ...done];

  return (
    <div className="flex flex-col md:-m-1">
      {!small && (
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <h2 className="min-w-0 flex-1 text-body-sm leading-body-sm font-semibold text-text">Activity</h2>
          {running.length > 0 && <span className="text-label leading-label text-muted tabular-nums">{running.length} running</span>}
        </div>
      )}
      {jobs.length === 0 ? (
        <p className="px-3 py-6 text-center text-body-sm leading-body-sm text-muted">Nothing running or recent.</p>
      ) : (
        <div className="flex flex-col py-1">
          {running.length > 0 && (
            <ul>
              {running.map((job) => (
                <li key={job.id} className="flex flex-col gap-1.5 px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Spinner className="text-steel" />
                    <span className="min-w-0 flex-1 text-body-sm leading-body-sm text-text">{job.label}</span>
                    {job.detail && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{job.detail}</span>}
                  </div>
                  <div className="pl-[26px]">
                    <ProgressBar label={job.label} value={job.progress ?? 0} valueText={job.detail} className="h-[3px]" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {running.length > 0 && finished.length > 0 && <div role="presentation" className="my-1 h-px bg-border" />}
          {finished.length > 0 && (
            <ul>
              {finished.map((job) => (
                <li key={job.id} className="flex items-center gap-2.5 px-3 py-2">
                  {job.state === "failed" ? (
                    <Icons.failed aria-label="Failed" className="shrink-0 text-red" />
                  ) : (
                    <Icons.done aria-label="Done" className="shrink-0 text-good" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col text-body-sm leading-body-sm">
                    <span className="text-text">{job.label}</span>
                    {job.detail && <span className="text-muted">{job.detail}</span>}
                  </div>
                  {job.state === "failed" && job.onRetry ? (
                    <Button size="sm" className="dark:border-border" detail="Starts this work again." note="About what the first try cost, from your budgets" onClick={job.onRetry}>
                      Try again
                    </Button>
                  ) : (
                    job.time && <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{job.time}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {spend && (
        <div className="flex min-h-10 flex-wrap items-center gap-x-3.5 border-t px-3 py-3 text-label leading-label text-muted tabular-nums md:py-0">
          <span className="flex-1">{spend.period}</span>
          {spend.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
