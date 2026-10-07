"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { CostAction } from "@/components/CostEstimate";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../costs";
import { Banner } from "./History";
import { plural } from "./words";

// Lines resting on changed facts, where a resume, cover letter or set of answers is shown: an approved fact they
// edited or rejected since leaves the lines citing it out of date. Update lines rewrites only those lines (paid, with
// its estimate); the new lines wait beside the old ones to apply or discard. A line in their own words stays theirs
// unless they tick Use the new line. Nothing shows once it's sent, or when no line rests on a changed fact.

export type FactChangeTarget = FunctionArgs<typeof api.factChanges.forDocument>["target"];

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const WHAT = { resume: "resume", letter: "cover letter", answers: "answers" } as const;
const CHANGE = { edited: "Fact edited", rejected: "Fact rejected" } as const;

export const UPDATE_LINES = {
  detail: "Rewrites only the lines resting on facts you edited or rejected, from the facts as they read now. You see each new line before anything changes.",
  apply: "Puts the new lines in place of the old ones. The rest stays as it is, and Google Drive follows.",
  discard: "Drops the new lines. The old ones stay, still marked.",
} as const;

// Whether new lines wait to be applied: the page's own main action steps back for Apply meanwhile.
export function useLinesWaiting(target: FactChangeTarget | null) {
  return !!useQuery(api.factChanges.forDocument, target ? { target } : "skip")?.update;
}

// primary: Apply is the pane's main action (false where the pane keeps another one).
export function FactChanges({ target, primary = true }: { target: FactChangeTarget; primary?: boolean }) {
  const data = useQuery(api.factChanges.forDocument, { target });
  const costs = useQuery(api.estimates.costs, {});
  const update = useMutation(api.factChanges.update);
  const apply = useMutation(api.factChanges.apply);
  const discard = useMutation(api.factChanges.discard);
  const setUse = useMutation(api.factChanges.setUse);
  if (!data) return null;
  const writing = data.run?.status === "queued" || data.run?.status === "running";
  const what = WHAT[target.kind];

  if (data.update) {
    const lines = data.update.lines;
    const changing = lines.filter((l) => (l.theirs === null || l.use) && l.text !== l.before).length;
    return (
      <Banner tone="steel" title={`${plural(lines.length, "new line")} for changed facts`} line="Only these lines change. A line in your own words stays yours unless you choose the new one.">
        <ul className="flex w-full flex-col gap-3">
          {lines.map((l, i) => (
            <li key={`${i}-${l.before}`} className="flex flex-col gap-1">
              <span className="text-label leading-label text-muted">{CHANGE[l.change]}</span>
              <del className="text-body-sm leading-body-sm text-muted decoration-1">{l.theirs ?? l.before}</del>
              {l.text ? <ins className="text-body-sm leading-body-sm font-medium text-text no-underline">{l.text}</ins> : <span className="text-body-sm leading-body-sm text-text">The line goes: nothing it said still stands.</span>}
              {l.theirs !== null && (
                <Checkbox
                  label="Use the new line"
                  description="This line is in your own words."
                  checked={l.use}
                  onChange={(use) => void setUse({ target, index: i, use }).catch((e: unknown) => failed(e, "Couldn’t save that."))}
                />
              )}
            </li>
          ))}
        </ul>
        <Button
          variant={primary ? "primary" : "secondary"}
          icon="approve"
          detail={UPDATE_LINES.apply}
          note="Free"
          onClick={() =>
            void apply({ target }).then(
              () => toast({ message: changing ? `Updated ${plural(changing, "line")}` : "Kept the lines as they are", icon: "approve" }),
              (e: unknown) => failed(e, "Couldn’t apply them."),
            )
          }
        >
          Apply
        </Button>
        <Button variant="ghost" icon="reject" detail={UPDATE_LINES.discard} note="Free" onClick={() => void discard({ target }).catch((e: unknown) => failed(e, "Couldn’t discard them."))}>
          Discard
        </Button>
      </Banner>
    );
  }
  if (!data.stale.length) return null;
  if (writing) return <Banner tone="steel" title="Updating lines for changed facts" line={`Only the ${plural(data.stale.length, "line")} resting on them.`} />;
  const amount = aboutUsd(costs?.lineUpdate) ?? "Uses your AI budget";
  return (
    <Banner
      tone="caution"
      title={`${plural(data.stale.length, "line")} ${data.stale.length === 1 ? "rests" : "rest"} on changed facts`}
      line={data.run?.status === "failed" && data.run.error ? `The last update failed: ${data.run.error}` : `The rest of the ${what} stays as it is.`}
    >
      <ul className="flex w-full flex-col gap-2">
        {data.stale.map((s) => (
          <li key={s.index} className="flex flex-col gap-0.5">
            <span className="text-body-sm leading-body-sm text-text">{s.theirs ?? s.text}</span>
            <span className="text-label leading-label text-muted">
              {CHANGE[s.change]}
              {s.theirs !== null ? " · in your own words" : ""}
            </span>
          </li>
        ))}
      </ul>
      <CostAction
        amount={amount}
        budget="From your AI budget"
        icon="tryAgain"
        detail={UPDATE_LINES.detail}
        onClick={() =>
          void update({ target }).then(
            (jobId) => toast(jobId ? { message: "Updating lines for changed facts", icon: "running" } : { message: "Its lines are being updated already.", icon: "failed" }),
            (e: unknown) => failed(e, "Couldn’t start."),
          )
        }
      >
        Update lines
      </CostAction>
    </Banner>
  );
}
