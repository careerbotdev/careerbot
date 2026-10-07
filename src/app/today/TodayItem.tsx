"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DONE, pursuitHref } from "../../../convex/pursuitSteps";
import { Avatar } from "@/components/Avatar";
import { Button, type ButtonSize } from "@/components/Button";
import { Icons } from "@/components/icons";
import { Kbd } from "@/components/Kbd";
import { PaneHeader } from "@/components/Panes";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { SendActions, useFollowUp } from "../pursuits/FollowUp";
import { Item } from "../pursuits/Item";
import { PursuitOverview } from "../pursuits/Overview";
import { FactChanges } from "../resumes/FactChanges";
import { useBar, useConfirm } from "../shell/ShellContext";
import type { TodayLine } from "./data";
import { Snooze } from "./Snooze";
import { documentLine, lineTitle, pursuitLine, resumeLine } from "./words";

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// The line open beside Today's list (full screen on a phone, its actions in the bottom bar): where it stands in the
// list with J and K, then what it is and what can be done with it.
export function TodayItem({ line, small, at, of, onMove, onGone }: { line: TodayLine; small: boolean; at: number; of: number; onMove: (by: number) => void; onGone: () => void }) {
  return (
    <div data-tour="today.item" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {!small && (
        <PaneHeader
          actions={
            <>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">
                {at} of {of}
              </span>
              <Step label="Next" keys="J" onClick={() => onMove(1)} />
              <Step label="Previous" keys="K" onClick={() => onMove(-1)} />
            </>
          }
        />
      )}
      {line.kind === "review" ? (
        <ReviewItem line={line} small={small} />
      ) : line.kind === "pursuit" ? (
        <PursuitItem line={line} small={small} onGone={onGone} />
      ) : line.kind === "role" ? (
        <Item postingId={line.role.id} direction={line.role.direction?.id ?? null} nav={null} small={small} />
      ) : line.kind === "resume" ? (
        <ResumeItem line={line} small={small} onGone={onGone} />
      ) : (
        <DocumentItem line={line} small={small} />
      )}
    </div>
  );
}

function Step({ label, keys, onClick }: { label: string; keys: string; onClick: () => void }) {
  return (
    <Tooltip content={label} keys={keys}>
      <button type="button" aria-label={label} onClick={onClick} className="flex rounded-sm">
        <Kbd>{keys}</Kbd>
      </button>
    </Tooltip>
  );
}

// An item's top: what it is, its second line, and its actions (on a phone, in the bottom bar instead).
function Head({ lead, title, line, actions, small }: { lead?: ReactNode; title: string; line?: ReactNode; actions: (size: ButtonSize) => ReactNode; small: boolean }) {
  useBar(small ? { kind: "actions", actions: actions("lg") } : null);
  return (
    <div className="flex flex-col gap-4 border-b px-4 pt-2 pb-6 md:px-8">
      <div className="flex items-start gap-3.5">
        {lead}
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading>{title}</Heading>
          {line && <Text size="sm" muted>{line}</Text>}
        </div>
      </div>
      {!small && <div className="flex flex-wrap items-center gap-2">{actions("md")}</div>}
    </div>
  );
}

function ReviewItem({ line, small }: { line: Extract<TodayLine, { kind: "review" }>; small: boolean }) {
  const router = useRouter();
  const { groups } = line.summary;
  return (
    <>
      <Head
        small={small}
        lead={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-subtle text-muted">
            <Icons.review size={20} aria-hidden />
          </span>
        }
        title={lineTitle(line)}
        line={groups[0]?.preview}
        actions={(size) => (
          <Button variant="primary" size={size} className={small ? "flex-1" : ""} keys="G then R" detail="Opens Review, where each decision waits in the order it unlocks your other work." note="Free" onClick={() => router.push("/review")}>
            Review
          </Button>
        )}
      />
      <ul className="flex flex-col px-2 py-4 md:px-6">
        {groups.map((g) => (
          <li key={g.kind}>
            <Link href={`/review?kind=${g.kind}`} className="flex items-baseline gap-3 rounded-sm px-2 py-2.5 transition-colors duration-100 hover:bg-subtle">
              <Text as="span" className="font-medium">
                {g.label}
              </Text>
              <Text as="span" size="sm" muted tabular>
                {g.count}
              </Text>
              <Text as="span" size="sm" muted className="min-w-0 flex-1 truncate">
                {g.preview}
              </Text>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// A pursuit's reminder (or an offer to answer): what's due and its actions in the header (for a follow-up, the draft's
// Copy and open Mail and Mark as sent; for the next contact, its People; after three contacts with no reply, Close ·
// No response), then the pursuit's overview: the follow-up draft when one is due, the timeline.
function PursuitItem({ line, small, onGone }: { line: Extract<TodayLine, { kind: "pursuit" }>; small: boolean; onGone: () => void }) {
  const done = useMutation(api.pursuits.done);
  const setStatus = useMutation(api.pursuits.setStatus);
  const router = useRouter();
  const p = useQuery(api.pursuits.get, { id: line.p.id });
  const f = useFollowUp(line.p.id);
  const { reminder } = line;
  return (
    <>
      <Head
        small={small}
        lead={<Avatar name={line.p.company} company size={40} />}
        title={lineTitle(line)}
        line={pursuitLine(line.p, reminder)}
        actions={(size) => (
          <>
            {reminder?.rule === "followUp" && !reminder.step && <SendActions f={f} size={size} small={small} />}
            {reminder && <Snooze pursuitId={line.p.id} rule={reminder.rule} size={size} iconOnly={small && reminder.rule === "followUp"} onSnoozed={onGone} />}
            {reminder?.step === "nextContact" && (
              <Button variant="primary" size={size} className={small ? "flex-1" : ""} icon="people" detail="Opens the pursuit’s contacts, to write to the next one." note="Free" onClick={() => router.push(`${pursuitHref(line.p)}&tab=people`)}>
                People
              </Button>
            )}
            {reminder?.step === "noReply" && (
              <Button
                variant="primary"
                size={size}
                className={small ? "flex-1" : ""}
                detail="Closes the pursuit as No response."
                note="Free"
                onClick={() =>
                  void setStatus({ id: line.p.id, status: "closed", reason: "noResponse" }).then(() => {
                    toast({ message: `${line.p.company}: Closed · No response`, icon: "done" });
                    onGone();
                  }, (e: unknown) => failed(e, "Couldn’t save that."))
                }
              >
                Close · No response
              </Button>
            )}
            {reminder && reminder.rule !== "followUp" && (
              <Button
                variant="primary"
                size={size}
                className={small ? "flex-1" : ""}
                detail="Marks it done on the pursuit’s timeline, and the reminder leaves Today."
                note="Free"
                onClick={() =>
                  void done({ id: line.p.id, rule: reminder.rule }).then(() => {
                    toast({ message: `${DONE[reminder.rule].label}: ${line.p.company}`, icon: "done" });
                    onGone();
                  }, (e: unknown) => failed(e, "Couldn’t save that."))
                }
              >
                {DONE[reminder.rule].label}
              </Button>
            )}
            {!reminder && (
              <Button variant="primary" size={size} className={small ? "flex-1" : ""} detail="Opens the pursuit, with its resume, letter, answers and people." note="Free" onClick={() => router.push(pursuitHref(line.p))}>
                Open in Pursuits
              </Button>
            )}
          </>
        )}
      />
      <div className="px-4 pt-6 pb-6 md:px-8">{p && <PursuitOverview p={p} f={f} due={reminder ?? undefined} step={false} />}</div>
    </>
  );
}

function ResumeItem({ line, small, onGone }: { line: Extract<TodayLine, { kind: "resume" }>; small: boolean; onGone: () => void }) {
  const keep = useMutation(api.resume.keep);
  const discard = useMutation(api.resume.discard);
  const rewrite = useMutation(api.resume.rewrite);
  const ask = useConfirm();
  const u = line.update;
  const versionId: Id<"resumes"> | undefined = u.state === "review" ? u.versionId : undefined;
  const summary = u.state === "unknown" ? "Written before changes were listed. Rewrite it to see what changes from here on." : u.summary;
  return (
    <>
      <Head
        small={small}
        lead={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-caution-subtle text-caution-text">
            <Icons.resumes size={20} aria-hidden />
          </span>
        }
        title={lineTitle(line)}
        line={resumeLine(u)}
        actions={(size) =>
          versionId ? (
            <>
              <Button
                size={size}
                detail="Deletes the new version; the current one stays."
                note="Free · Asks first · can’t be undone"
                onClick={async () => {
                  if (!(await ask({ title: "Discard the new version?", body: "The resume you have now stays as it is.", confirmLabel: "Discard" }))) return;
                  discard({ id: versionId }).then(onGone, (e: unknown) => failed(e, "Couldn’t discard it."));
                }}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size={size}
                className={small ? "flex-1" : ""}
                detail="Makes the new version the one you use."
                note="Free"
                onClick={() => void keep({ id: versionId }).then(() => {
                  toast({ message: `Kept the new ${lineTitle(line)}`, icon: "done" });
                  onGone();
                }, (e: unknown) => failed(e, "Couldn’t keep it."))}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size={size}
              className={small ? "flex-1" : ""}
              loading={u.writing}
              loadingLabel="Writing"
              detail="Writes a new version from your approved record, for you to keep or discard."
              note="Uses your AI budget"
              onClick={() => void rewrite({ directionId: u.target.directionId }).catch((e: unknown) => failed(e, "Couldn’t start it."))}
            >
              Rewrite
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        {summary && <Text measure>{summary}</Text>}
        {line.facts && <FactChanges target={line.facts.target} primary={false} />}
        {u.preview && <pre className="max-w-[640px] border-l-2 border-steel-subtle pl-4 font-sans text-body-sm leading-body-sm whitespace-pre-wrap text-text">{u.preview}</pre>}
      </div>
    </>
  );
}

// A document in use resting on changed facts (a tailored resume, a cover letter, answers): the lines, Update lines, and
// the way to the document itself.
function DocumentItem({ line, small }: { line: Extract<TodayLine, { kind: "document" }>; small: boolean }) {
  const router = useRouter();
  const d = line.doc;
  return (
    <>
      <Head
        small={small}
        lead={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-caution-subtle text-caution-text">
            <Icons.resumes size={20} aria-hidden />
          </span>
        }
        title={lineTitle(line)}
        line={documentLine(d)}
        actions={(size) => (
          <Button size={size} className={small ? "flex-1" : ""} icon="goIn" detail={d.target.kind === "resume" ? "Opens the resume in Resumes." : "Opens its pursuit."} note="Free" onClick={() => router.push(d.href)}>
            {d.target.kind === "resume" ? "Open in Resumes" : "Open in Pursuits"}
          </Button>
        )}
      />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <FactChanges target={d.target} />
      </div>
    </>
  );
}
