"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { pursuitHref as hrefOf, type Path, takesApply, takesOutreach } from "../../../convex/pursuitSteps";
import type { FirstPursuit, SetupStep } from "../../../convex/today";
import { Button, type ButtonSize, type ButtonVariant, buttonLook } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { CostAction } from "@/components/CostEstimate";
import { Field, Input, Textarea } from "@/components/Field";
import { Icons } from "@/components/icons";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NumberField } from "@/components/NumberField";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { ProgressBar } from "@/components/Progress";
import { ScoreBadge } from "@/components/ScoreBadge";
import { SegmentedControl } from "@/components/SegmentedControl";
import { StatusTag } from "@/components/StatusTag";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { addSpoken, DeviceDictation, Listening, LiveText, Saved, TalkButton, TalkStopped, TalkTip, useCanTalk, useDevice, useTalk, useTalkKey } from "@/components/Talk";
import { Tooltip } from "@/components/Tooltip";
import { draftKey } from "../localDrafts";
import { ModelChoice, type ModelChoiceValue, useRecommended } from "../ModelChoice";
import { day } from "../pursuits/dates";
import { PersonRow } from "../pursuits/People";
import { DRIVE_RETURNED } from "../settings/Drive";
import { useModelCatalog } from "../useModelCatalog";
import { useBar } from "../shell/ShellContext";
import { DONE, docsHref, type Go, type Learn, type Named, PATH_ROWS, type PathDef, type PathKey, PURSUIT_STEPS, type PursuitKey, SETUP_STEPS, type SetupKey, type StepKey, STORY_GUIDE, WHAT_TO_COVER } from "./steps";

export type Setup = FunctionReturnType<typeof api.today.setup>;

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : fallback, icon: "failed" });
const NOT_YET: SetupStep = { done: false, detail: null, at: null };
const REQUIRED = SETUP_STEPS.filter((s) => !s.optional);
const HIDE = { detail: "Puts Getting started away; Today shows what needs you instead. Bring it back from Today’s ⋯ menu.", note: "Free · Undo with U" };
const SHOW_TODAY = { detail: "Puts Getting started away and shows Today’s new roles and reminders. Bring it back from Today’s ⋯ menu.", note: "Free · Undo with U" };

// Where Getting started stands: Setup until its steps are done (Google Drive connected or skipped), then the first
// pursuit, then done. The first pursuit's steps: the shared ones and those of the path or paths it takes (either path
// finishes it); a path it doesn't take shows as a row that adds it (Apply only where there's a posting to apply
// through).
function progress(setup: Setup) {
  const first = setup.firstPursuit;
  const setupDone = SETUP_STEPS.every((s) => setup.steps[s.key].done);
  const stepOf = (key: PursuitKey) => first?.steps[key] ?? NOT_YET;
  const path = first?.path ?? null;
  const takes = (part: "outreach" | "apply") => (part === "outreach" ? takesOutreach(path) : takesApply(path));
  const steps = PURSUIT_STEPS.filter((s) => s.part === "shared" || takes(s.part));
  const paths = PATH_ROWS.filter((r) => !takes(r.path) && (r.path === "outreach" || !first || first.postingId !== null));
  const allDone = setupDone && steps.every((s) => stepOf(s.key).done);
  const current: StepKey | "done" = !setupDone ? SETUP_STEPS.find((s) => !setup.steps[s.key].done)!.key : (steps.find((s) => !stepOf(s.key).done)?.key ?? "done");
  return { first, setupDone, stepOf, steps, paths, allDone, current };
}

// The steps not done yet, of those showing: Setup's, then (once Setup is done) the first pursuit's.
export const stepsLeft = (setup: Setup) => {
  const { setupDone, steps, stepOf } = progress(setup);
  return SETUP_STEPS.filter((s) => !setup.steps[s.key].done).length + (setupDone ? steps.filter((s) => !stepOf(s.key).done).length : 0);
};

const isSetupKey = (k: string): k is SetupKey => SETUP_STEPS.some((s) => s.key === k);
const isPursuitKey = (k: string): k is PursuitKey => PURSUIT_STEPS.some((s) => s.key === k);
const isPathKey = (k: string): k is PathKey => PATH_ROWS.some((r) => r.key === k);

// A first-pursuit step's line: until it's done, what it takes (Follow up: the day it's due); once done, what was done
// (the day, where that's what it is).
function pursuitLine(key: PursuitKey, s: SetupStep, named: Named) {
  const def = PURSUIT_STEPS.find((d) => d.key === key)!;
  if (!s.done) return key === "followUp" && s.at !== null ? `Due ${day(s.at)}, if you haven’t heard back` : def.line(named);
  if (key === "message" && s.at !== null) return s.detail ? `${s.detail} · ${day(s.at)}` : `Sent ${day(s.at)}`;
  if (s.at === null) return s.detail ?? def.line(named);
  return key === "pursuit" ? `Started ${day(s.at)}` : key === "applied" ? `Applied ${day(s.at)}` : key === "followUp" ? `Followed up ${day(s.at)}` : (s.detail ?? def.line(named));
}

// Getting started, on Today until it's put away (Hide until later, or Show Today once every step is done): Setup's
// steps with how far along they are, then once Setup is done the first pursuit's, with Setup folded to one row that
// opens it again. The step chosen opens beside them (?step=<key>; the first not done unless another was chosen; on a
// phone, the list alone until one is opened).
export function GettingStarted({ setup }: { setup: Setup }) {
  const small = useScreenSize() === "small";
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const hide = useMutation(api.today.hideSetup);
  // Bring your data from another copy: only while the workspace is still empty.
  const data = useQuery(api.yourData.status);
  const { first, setupDone, stepOf, steps, paths, allDone, current } = progress(setup);
  const named: Named = { company: first?.company ?? null, direction: first?.direction ?? null };
  const asked = params.get("step") ?? "";
  const valid =
    isSetupKey(asked) ||
    (setupDone && isPursuitKey(asked) && steps.some((s) => s.key === asked)) ||
    (setupDone && isPathKey(asked) && paths.some((r) => r.key === asked)) ||
    (asked === "done" && allDone);
  const chosen = valid ? (asked as StepKey | "done") : small ? null : current;
  const [setupOpen, setSetupOpen] = useState(() => isSetupKey(asked));
  const open = (key: StepKey | "done" | null) => router.push(key === null ? path : `${path}?step=${key}`, { scroll: false });
  const putAway = (words: string) =>
    void hide({ hidden: true }).then(
      () => toast({ message: words, action: { label: "Undo", key: "U", run: () => void hide({ hidden: false }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const showToday = (size: ButtonSize) => (
    <Button variant="primary" size={size} className={size === "lg" ? "flex-1" : "self-start"} {...SHOW_TODAY} onClick={() => putAway("Getting started is put away")}>
      Show Today
    </Button>
  );
  useBar(small && allDone && chosen === null ? { kind: "actions", actions: showToday("lg") } : null);

  const required = REQUIRED.filter((s) => setup.steps[s.key].done).length;
  const pursuitDone = steps.filter((s) => stepOf(s.key).done).length;
  const [value, of] = setupDone ? [pursuitDone, steps.length] : [required, REQUIRED.length];
  const drive = setup.steps.drive.done ? (setup.skipped.includes("drive") ? " · Google Drive skipped" : " · Google Drive connected") : "";
  const chosenPath = first?.path ?? null;

  const setupRows = SETUP_STEPS.map((s, i) => {
    const state = setup.steps[s.key];
    const isCurrent = s.key === current;
    return (
      <ListRow
        key={s.key}
        title={s.title}
        line={state.done ? (state.detail ?? s.line) : s.line}
        muted={!state.done && !isCurrent}
        selected={small ? isCurrent : chosen === s.key}
        onOpen={() => open(s.key)}
        lead={<Marker n={i + 1} done={state.done} current={isCurrent} />}
        tag={s.optional ? <StatusTag tone="neutral">Optional</StatusTag> : undefined}
      />
    );
  });

  // The first pursuit's steps, numbered, with a path not taken just before Follow up.
  const pursuitRow = (s: (typeof steps)[number], n: number) => {
    const state = stepOf(s.key);
    const isCurrent = s.key === current;
    return (
      <ListRow
        key={s.key}
        title={s.title}
        line={pursuitLine(s.key, state, named)}
        muted={!state.done && !isCurrent}
        selected={small ? isCurrent : chosen === s.key}
        onOpen={() => open(s.key)}
        lead={<Marker n={n} done={state.done} current={isCurrent} />}
        tag={s.part !== "shared" ? <StatusTag tone="neutral">{s.part === "outreach" ? "Outreach" : "Apply"}</StatusTag> : undefined}
      />
    );
  };
  const pathRows = paths.map((r) => (
    <ListRow
      key={r.key}
      title={chosenPath ? r.too : r.title}
      line={r.line}
      muted
      selected={!small && chosen === r.key}
      onOpen={() => open(r.key)}
      lead={
        <span className="flex size-6 items-center justify-center rounded-sm border border-dashed text-muted">
          <Icons.add size={14} aria-hidden="true" />
        </span>
      }
    />
  ));
  const beforeFollowUp = steps.filter((s) => s.key !== "followUp");
  const followUp = steps.find((s) => s.key === "followUp")!;

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 px-4 pt-5 pb-3">
        <Heading size="display">Getting started</Heading>
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <ProgressBar label="Getting started" value={value} max={of} status="steps" valueText={`${value} of ${of}`} />
          </div>
          <Text size="sm" muted tabular className="shrink-0">
            {value} of {of}
          </Text>
        </div>
      </header>
      <List label="Getting started" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!setupDone ? (
          <ListGroup label="Setup">{setupRows}</ListGroup>
        ) : (
          <>
            <li className="flex flex-col gap-0.5">
              <ul role="list" className="flex flex-col gap-0.5">
                <ListRow
                  title="Setup"
                  line={`${required} of ${REQUIRED.length}${drive}`}
                  lead={<Marker n={0} done current={false} />}
                  onOpen={() => setSetupOpen((o) => !o)}
                  tag={<Icons.goIn size={16} aria-label={setupOpen ? "Open" : "Closed"} className={`text-muted transition-transform duration-100 ${setupOpen ? "rotate-90" : ""}`} />}
                />
                {setupOpen && setupRows}
              </ul>
            </li>
            <ListGroup label="Your first pursuit" line={first ? `${first.title} · ${first.company}` : undefined}>
              {beforeFollowUp.map((s, i) => pursuitRow(s, i + 1))}
              {pathRows}
              {pursuitRow(followUp, steps.length)}
            </ListGroup>
          </>
        )}
      </List>
      {data?.empty && !data.import && (
        <div className="px-4 pb-2">
          <Button
            variant="ghost"
            size="sm"
            icon="openElsewhere"
            detail="Opens Settings, Your data, to import an export from another CareerBot copy."
            note="Free"
            onClick={() => router.push("/settings?section=yourdata")}
          >
            Bring your data from another copy
          </Button>
        </div>
      )}
      {!allDone && (
        <div className="border-t px-4 py-3">
          <Button variant="ghost" size="sm" {...HIDE} onClick={() => putAway("Getting started is put away")}>
            Hide until later
          </Button>
        </div>
      )}
    </div>
  );

  // The pane's place in Getting started, its ⋯ menu (its Learn more page; Hide until later) and what it shows.
  const pathRow = chosen !== null && isPathKey(chosen) ? PATH_ROWS.find((r) => r.key === chosen)! : null;
  const learn: Learn =
    chosen === null || chosen === "done"
      ? DONE.learn
      : isSetupKey(chosen)
        ? SETUP_STEPS.find((s) => s.key === chosen)!.learn
        : pathRow
          ? pathRow.learn
          : PURSUIT_STEPS.find((s) => s.key === chosen)!.learn;
  const place =
    chosen === null || chosen === "done"
      ? { part: "Getting started", step: "Done", back: "Getting started" }
      : isSetupKey(chosen)
        ? { part: "Setup", step: `Step ${SETUP_STEPS.findIndex((s) => s.key === chosen) + 1} of ${SETUP_STEPS.length}`, back: "" }
        : pathRow
          ? { part: "Your first pursuit", step: chosenPath ? pathRow.too : pathRow.title, back: "" }
          : { part: "Your first pursuit", step: `Step ${steps.findIndex((s) => s.key === chosen) + 1} of ${steps.length}`, back: "" };
  const menu: MenuEntry[] = [
    { label: `Learn more: ${learn.label}`, icon: "help", detail: "Opens its page in the documentation, in a new tab.", note: "Free", onSelect: () => window.open(docsHref(learn.path), "_blank", "noreferrer") },
    ...(allDone ? [] : ["separator" as const, { label: "Hide until later", icon: "close" as const, ...HIDE, onSelect: () => putAway("Getting started is put away") }]),
  ];
  const more = <Menu label="More for this step" title={place.part} items={menu} />;
  const frame = (key: StepKey | "done", children: ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {!small && (
        <PaneHeader
          className="md:pl-12"
          title={
            <span className="text-body-sm leading-body-sm font-normal text-muted tabular-nums">
              {place.part} · {place.step}
            </span>
          }
          actions={more}
        />
      )}
      <div key={key} className="flex max-w-[720px] flex-col gap-5 px-4 pt-2 pb-6 md:px-12">
        {children}
      </div>
    </div>
  );

  const item =
    chosen === null
      ? undefined
      : chosen === "done"
        ? frame(
            "done",
            <>
              <Intro title={DONE.title} why={DONE.why} />
              {!small && showToday("md")}
              <Unlocks unlocks={DONE.unlocks} learn={DONE.learn} />
            </>,
          )
        : isSetupKey(chosen)
          ? frame(chosen, <SetupStepPane key={chosen} k={chosen} setup={setup} small={small} onNext={open} />)
          : pathRow
            ? frame(chosen, <PathRowPane key={chosen} r={pathRow} first={first} named={named} small={small} onNext={open} />)
            : frame(chosen, <PursuitStepPane key={chosen} k={chosen as PursuitKey} first={first} named={named} state={stepOf(chosen as PursuitKey)} small={small} onNext={open} />);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={list} item={item} back={{ label: place.back || place.step, onBack: () => open(null), actions: more }} />
    </div>
  );
}

// A step's number: a tick once done, ink while it's the one to do, outlined after.
function Marker({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  if (done)
    return (
      <span className="flex size-6 items-center justify-center rounded-sm bg-good-subtle text-good-text">
        <Icons.approve size={14} aria-label="Done" />
      </span>
    );
  return (
    <span className={`flex size-6 items-center justify-center rounded-sm border font-mono text-mono leading-mono font-medium ${current ? "border-text bg-text text-surface" : "text-muted"}`}>
      {n}
    </span>
  );
}

function Intro({ title, why }: { title: string; why: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Heading>{title}</Heading>
      <Text muted>{why}</Text>
    </div>
  );
}

// What the step unlocks, and its page in the documentation.
function Unlocks({ unlocks, learn }: { unlocks: string; learn: Learn }) {
  return (
    <div className="flex flex-col gap-1 border-t pt-3">
      <Text size="label">What this unlocks</Text>
      <Text size="sm" muted>
        {unlocks}
      </Text>
      <Text size="sm" muted className="flex flex-wrap items-center gap-x-1.5 pt-2">
        Learn more:
        <a
          href={docsHref(learn.path)}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center gap-1 font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text"
        >
          {learn.label}
          <Icons.openElsewhere size={12} aria-hidden="true" />
        </a>
      </Text>
    </div>
  );
}

// A link that does a step's work elsewhere, with its explainer: in the app, or (external) in a new tab.
function GoLink({ go, href, variant = "primary", size = "md", external = false, className = "" }: { go: Omit<Go, "href">; href: string; variant?: ButtonVariant; size?: ButtonSize; external?: boolean; className?: string }) {
  const look = buttonLook(variant, `${size === "lg" ? "flex-1" : ""} ${className}`, size);
  return (
    <Tooltip content={go.label} detail={go.detail} note={go.note}>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={look}>
          {go.label}
          <Icons.openElsewhere aria-hidden="true" />
        </a>
      ) : (
        <Link href={href} className={look}>
          {go.label}
        </Link>
      )}
    </Tooltip>
  );
}

// A pane's actions: the main one beside the rest, or on a phone in the bottom bar (the rest stay in the pane).
function Actions({ small, main, children }: { small: boolean; main?: (size: ButtonSize) => ReactNode; children?: ReactNode }) {
  useBar(small && main ? { kind: "actions", actions: main("lg") } : null);
  if (!children && (small || !main)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!small && main?.("md")}
      {children}
    </div>
  );
}

function SetupStepPane({ k, setup, small, onNext }: { k: SetupKey; setup: Setup; small: boolean; onNext: (key: StepKey) => void }) {
  const s = SETUP_STEPS.find((d) => d.key === k)!;
  const state = setup.steps[k];
  const next = SETUP_STEPS[SETUP_STEPS.indexOf(s) + 1]?.key ?? "pursuit";
  const go = s.go;
  const body =
    k === "key" && !state.done ? (
      <KeyStep small={small} onSaved={() => onNext(next)} />
    ) : k === "story" && !state.done ? (
      <StoryWriter setup={setup} small={small} />
    ) : k === "apollo" && !state.done ? (
      <ApolloStep small={small} onSaved={() => onNext(next)} />
    ) : k === "drive" ? (
      <DriveStep setup={setup} small={small} onDone={() => onNext(next)} />
    ) : go ? (
      <Actions small={small} main={(size) => <GoLink go={go} href={go.href} size={size} variant={state.done ? "secondary" : "primary"} className={size === "md" ? "self-start" : ""} />} />
    ) : null;
  return (
    <>
      <Intro title={s.title} why={s.why} />
      {body}
      <Unlocks unlocks={s.unlocks} learn={s.learn} />
    </>
  );
}

// The pursuit's page, at one of its tabs.
const pursuitHref = (first: FirstPursuit, tab?: "resume" | "letter" | "people") => `${hrefOf({ id: first.pursuitId, postingId: first.postingId })}${tab ? `&tab=${tab}` : ""}`;

function PursuitStepPane({ k, first, named, state, small, onNext }: { k: PursuitKey; first: FirstPursuit | null; named: Named; state: SetupStep; small: boolean; onNext: (key: StepKey) => void }) {
  const s = PURSUIT_STEPS.find((d) => d.key === k)!;
  const go = s.go(named);
  const variant: ButtonVariant = state.done ? "secondary" : "primary";
  const tab = k === "tailor" ? "resume" : k === "letter" ? "letter" : k === "contacts" || k === "message" ? "people" : undefined;
  // Every step but the first works on the pursuit; before there is one, the first step is where to start.
  const toPursuit = (size: ButtonSize) =>
    first ? (
      <GoLink go={go} href={pursuitHref(first, tab)} size={size} variant={variant} className={size === "md" ? "self-start" : ""} />
    ) : (
      <Button variant="primary" size={size} className={size === "lg" ? "flex-1" : "self-start"} reason="Start a pursuit first." detail={go.detail} note={go.note}>
        {go.label}
      </Button>
    );
  let body: ReactNode;
  switch (k) {
    case "pursuit":
      body = (
        <>
          {!state.done && <RolesToStart onStarted={() => onNext("tailor")} />}
          <Actions small={small} main={(size) => <GoLink go={go} href={first ? pursuitHref(first) : "/pursuits"} size={size} variant={variant} className={size === "md" ? "self-start" : ""} />} />
        </>
      );
      break;
    case "path":
      body = (
        <>
          {first && <PathChoice first={first} onChosen={(path) => onNext(takesOutreach(path) ? "contacts" : "letter")} />}
          <Actions small={small} main={toPursuit} />
        </>
      );
      break;
    case "contacts":
      body = (
        <>
          {first && <PeopleFound pursuitId={first.pursuitId} company={first.company} />}
          <Actions small={small} main={toPursuit} />
        </>
      );
      break;
    case "applied":
      body = (
        <Actions small={small} main={(size) => (first?.applyUrl ? <GoLink go={go} href={first.applyUrl} size={size} variant={variant} external /> : toPursuit(size))}>
          {first && !state.done && <MarkApplied first={first} onDone={() => onNext("followUp")} />}
        </Actions>
      );
      break;
    default:
      body = <Actions small={small} main={toPursuit} />;
  }
  return (
    <>
      <Intro title={s.title} why={s.why(named)} />
      {body}
      <Unlocks unlocks={s.unlocks(named)} learn={s.learn} />
    </>
  );
}

// Choose a path: Outreach and Apply, each a check box (both can be on), as on the pursuit's Overview. Apply only where
// there's a posting to apply through.
function PathChoice({ first, onChosen }: { first: FirstPursuit; onChosen: (path: Path) => void }) {
  const setPath = useMutation(api.pursuits.setPath);
  const outreach = takesOutreach(first.path);
  const apply = takesApply(first.path);
  const choose = (o: boolean, a: boolean) => {
    const path: Path | null = o && a ? "both" : o ? "outreach" : a ? "apply" : null;
    void setPath({ id: first.pursuitId, path }).then(
      () => path && !first.path && onChosen(path),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  return (
    <section aria-label="Path" className="flex flex-col gap-3">
      <Checkbox label="Outreach" checked={outreach} onChange={(on) => choose(on, apply)} description="Write to the hiring manager, someone on the team or a recruiter. CareerBot finds them and drafts an outreach message from your record; you send it from your own email." />
      {first.postingId && (
        <Checkbox label="Apply" checked={apply} onChange={(on) => choose(outreach, on)} description="Send your tailored resume and letter through the posting, then mark it Applied. CareerBot keeps a copy of exactly what you sent." />
      )}
    </section>
  );
}

// A path the first pursuit doesn't take (yet): what it is, and a button that adds it (before a path is chosen,
// chooses it).
function PathRowPane({ r, first, named, small, onNext }: { r: PathDef; first: FirstPursuit | null; named: Named; small: boolean; onNext: (key: StepKey) => void }) {
  const setPath = useMutation(api.pursuits.setPath);
  const label = first?.path ? r.too : r.choose;
  const add = (size: ButtonSize) => (
    <Button
      variant="primary"
      size={size}
      className={size === "lg" ? "flex-1" : "self-start"}
      reason={first ? undefined : "Start a pursuit first."}
      detail={first?.path ? `Adds ${r.title} to your ${first.company} pursuit: its steps show here and on the pursuit.` : `Puts the pursuit on ${r.title}. You can add the other path any time.`}
      note="Free"
      onClick={() =>
        first &&
        void setPath({ id: first.pursuitId, path: first.path ? "both" : r.path }).then(
          () => onNext(r.path === "outreach" ? "contacts" : "letter"),
          (e: unknown) => failed(e, "Couldn’t save that."),
        )
      }
    >
      {label}
    </Button>
  );
  return (
    <>
      <Intro title={first?.path ? r.too : r.title} why={r.why(named)} />
      <Actions small={small} main={add} />
      <Unlocks unlocks={r.unlocks} learn={r.learn} />
    </>
  );
}

// Your first pursuit, step 1: their strongest new roles, each with Start.
function RolesToStart({ onStarted }: { onStarted: () => void }) {
  const roles = useQuery(api.today.roles);
  const start = useMutation(api.pursuits.start);
  if (!roles?.length) return null;
  return (
    <section className="flex flex-col">
      <Text size="label" className="pb-2">
        Your strongest new roles
      </Text>
      <ul className="flex flex-col border-t">
        {roles.slice(0, 3).map((r) => (
          <li key={r.id} className="flex min-h-14 items-center gap-3 border-b py-2">
            <ScoreBadge score={r.score} level={r.level} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-md leading-body-md font-medium text-text">{r.title}</span>
              <span className="truncate text-body-sm leading-body-sm text-muted">{[r.company.name, r.location].filter(Boolean).join(" · ")}</span>
            </span>
            <Button
              size="sm"
              detail="Starts a pursuit of this role: its status, resume, letter, answers and people in one place."
              note="Free"
              onClick={() =>
                void start({ postingId: r.id, directionId: r.direction?.id }).then(
                  () => {
                    toast({ message: `Started: ${r.title}`, icon: "pursuits" });
                    onStarted();
                  },
                  (e: unknown) => failed(e, "Couldn’t start."),
                )
              }
            >
              Start
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Your first pursuit, Find contacts: the people already found at the company, each with Reveal email.
function PeopleFound({ pursuitId, company }: { pursuitId: FirstPursuit["pursuitId"]; company: string }) {
  const data = useQuery(api.people.list, { pursuitId });
  if (!data?.people.length) return null;
  return (
    <section className="flex flex-col">
      <Text size="label" className="pb-2">
        People at {company}
      </Text>
      <ul className="flex flex-col border-t">
        {data.people.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </ul>
    </section>
  );
}

function MarkApplied({ first, onDone }: { first: FirstPursuit; onDone: () => void }) {
  const setStatus = useMutation(api.pursuits.setStatus);
  return (
    <Button
      variant="ghost"
      detail={`Marks your ${first.company} pursuit Applied today and keeps a copy of the resume and letter you sent.`}
      note="Free · Undo with U"
      onClick={() =>
        void setStatus({ id: first.pursuitId, status: "applied" }).then(
          () => {
            toast({ message: `${first.company}: Applied`, icon: "done", action: { label: "Undo", key: "U", run: () => void setStatus({ id: first.pursuitId, status: "preparing" }) } });
            onDone();
          },
          (e: unknown) => failed(e, "Couldn’t save that."),
        )
      }
    >
      Mark Applied
    </Button>
  );
}

// Setup, step 9: connect Google Drive (Google's consent screen, then back here), or skip it. Once connected, Settings
// has the rest.
function DriveStep({ setup, small, onDone }: { setup: Setup; small: boolean; onDone: () => void }) {
  const status = useQuery(api.drive.status);
  const connect = useMutation(api.drive.connect);
  const skip = useMutation(api.today.skipStep);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const outcome = params.get("drive");
  const said = useRef(false);
  useEffect(() => {
    if (said.current || !outcome || !DRIVE_RETURNED[outcome]) return;
    said.current = true;
    toast(DRIVE_RETURNED[outcome]);
    router.replace(`${path}?step=drive`, { scroll: false });
  }, [outcome, router, path]);

  const connected = !!status?.connected;
  const skipped = setup.skipped.includes("drive");
  const settings = SETUP_STEPS.find((s) => s.key === "drive")!.go!;
  const main = (size: ButtonSize) =>
    connected ? (
      <GoLink go={settings} href={settings.href} size={size} variant="secondary" className={size === "md" ? "self-start" : ""} />
    ) : (
      <Button
        variant="primary"
        size={size}
        icon="google"
        className={size === "lg" ? "flex-1" : ""}
        reason={status === undefined ? "Loading…" : status.ready ? undefined : "Not available yet"}
        detail="Opens Google to let CareerBot keep a Google Doc of each resume in a CareerBot folder in your Drive. You come back here once it’s done."
        note="Free"
        onClick={() => void connect({ from: "today" }).then((url) => window.location.assign(url), (e: unknown) => failed(e, "Couldn’t start connecting. Try again."))}
      >
        Connect Google Drive
      </Button>
    );
  return (
    <Actions small={small} main={main}>
      {!connected && !skipped && (
        <Button
          variant="ghost"
          detail="Leaves Google Drive out of Getting started. Connect it any time in Settings, Google Drive."
          note="Free · Undo with U"
          onClick={() =>
            void skip({ step: "drive", skipped: true }).then(
              () => {
                toast({ message: "Google Drive skipped", action: { label: "Undo", key: "U", run: () => void skip({ step: "drive", skipped: false }) } });
                onDone();
              },
              (e: unknown) => failed(e, "Couldn’t save that."),
            )
          }
        >
          Skip
        </Button>
      )}
    </Actions>
  );
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
// Tokens per word, and what reading a story adds around it (its instructions, and what comes back), for the estimate
// before they've read one.
const TOKENS_PER_WORD = 1.35;
const READ_OVERHEAD_TOKENS = 3000;
const REPLY_PER_TOKEN_IN = 1.5;

// About what reading the story will cost: from what their reading has cost per word so far, or before that from the
// model they chose for reading and its price.
function useReadEstimate(setup: Setup, count: number): { amount: string; reason?: string } {
  const settings = useQuery(api.aiSettings.list);
  const known = setup.storyUsdPerWord;
  const { models } = useModelCatalog();
  const model = settings?.find((s) => s.task === "extract")?.choice?.model;
  if (settings && !model) return { amount: "", reason: "Choose a model for reading narratives in Settings first." };
  let usd: number | null = null;
  if (known !== null) usd = known * Math.max(count, 1);
  else {
    const priced = models?.find((m) => m.id === model);
    if (priced) {
      const input = count * TOKENS_PER_WORD + READ_OVERHEAD_TOKENS;
      usd = (input * priced.inPerM + input * REPLY_PER_TOKEN_IN * priced.outPerM) / 1e6;
    }
  }
  if (usd === null) return { amount: "" };
  return { amount: usd < 0.01 ? "Under $0.01" : `About $${usd.toFixed(2)}` };
}

type Draft = { title: string; body: string };

// The draft kept in this browser for this workspace, so leaving and coming back loses nothing. (This part renders only
// in the browser, once signed in.)
function keptDraft(key: string): Draft {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (kept && typeof kept === "object" && "title" in kept && "body" in kept && typeof kept.title === "string" && typeof kept.body === "string") return { title: kept.title, body: kept.body };
  } catch {
    // Nothing readable kept: start empty.
  }
  return { title: "", body: "" };
}

// ⌘↵ (Ctrl+↵) inside a step's fields does its main action.
const onSubmitKey = (run: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    run();
  }
};

// Setup, step 3 in place: what to cover, then a title and the story, kept on this device as they write (or talk, with
// Talk); Done, read it saves it as their first story and has it read. GitHub adds projects (on a phone, from ⋯ there's
// Learn more; GitHub is under the story).
function StoryWriter({ setup, small }: { setup: Setup; small: boolean }) {
  const create = useMutation(api.narratives.create);
  const read = useMutation(api.extract.start);
  const key = draftKey(setup.workspaceId, "firstStory");
  const [draft, setDraft] = useState<Draft>(() => keptDraft(key));
  const [busy, setBusy] = useState(false);
  const count = words(draft.body);
  const estimate = useReadEstimate(setup, count);

  const write = (next: Draft) => {
    setDraft(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  // Talk: each finished phrase goes into the story, kept on the device like typing; while listening, the words of this
  // time show under what was there (`split`: where they start).
  const canTalk = useCanTalk();
  const device = useDevice();
  const [split, setSplit] = useState<number | null>(null);
  const talk = useTalk({
    onStart: () => setSplit(draft.body.replace(/\s+$/, "").length),
    onWords: (text, first) =>
      setDraft((d) => {
        const next = { ...d, body: addSpoken(d.body, text, first) };
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      }),
    onStopped: () => setSplit(null),
  });
  useTalkKey(talk, !!canTalk);
  const listening = talk.state === "listening";

  const reason = estimate.reason ?? (count === 0 ? "Write your story first." : listening ? "Stop talking first." : undefined);
  const submit = useCallback(() => {
    if (reason || busy) return;
    setBusy(true);
    create({ kind: "career", title: draft.title, body: draft.body })
      .then((narrativeId) => read({ narrativeId }))
      .then(() => {
        localStorage.removeItem(key);
        toast({ message: `Reading ${draft.title.trim() || "your story"}`, icon: "running" });
      })
      .catch((e: unknown) => {
        setBusy(false);
        failed(e, "Couldn’t save your story.");
      });
  }, [reason, busy, create, read, draft, key]);

  const done = (size: "md" | "lg") => (
    <CostAction
      amount={estimate.amount}
      budget="From your AI budget"
      variant="primary"
      size={size}
      className={size === "lg" ? "flex-1" : ""}
      keys={size === "md" ? "⌘↵" : undefined}
      loading={busy}
      loadingLabel="Saving"
      reason={reason}
      detail="Saves this as your first story and reads it into roles and facts for you to review."
      onClick={submit}
    >
      Done, read it
    </CostAction>
  );
  useBar(small ? { kind: "actions", actions: done("lg") } : null);

  return (
    <div className="flex flex-col gap-5" onKeyDown={onSubmitKey(submit)}>
      <section aria-label="What to cover" className="flex flex-col gap-2 rounded-sm bg-subtle px-3.5 py-3">
        <Text size="label">What to cover</Text>
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
          {WHAT_TO_COVER.map((w) => (
            <li key={w} className="flex items-start gap-2 text-body-sm leading-body-sm text-text">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 bg-muted" />
              {w}
            </li>
          ))}
        </ul>
      </section>
      <Field label="Title" className="md:w-[420px]">
        {(props) => <Input {...props} value={draft.title} placeholder="Ironbridge Logistics, 2020–2023" onChange={(e) => write({ ...draft, title: e.target.value })} />}
      </Field>
      <div className="flex flex-col gap-3">
        <Textarea
          aria-label="Your story"
          rows={listening ? 1 : small ? 14 : 12}
          grow={listening}
          className={listening ? "" : "min-h-[300px]"}
          value={split === null ? draft.body : draft.body.slice(0, split)}
          placeholder={listening ? undefined : "What you owned, what was hard, what changed."}
          onChange={(e) => {
            if (split === null) {
              if (talk.state === "stopped") talk.dismiss();
              return write({ ...draft, body: e.target.value });
            }
            // Typing above the words still arriving: they stay after it.
            write({ ...draft, body: e.target.value + draft.body.slice(split) });
            setSplit(e.target.value.length);
          }}
          start={canTalk && !listening ? <TalkButton talk={talk} size="sm" variant="secondary" /> : undefined}
          status={count > 0 ? "Saved" : undefined}
          count={`${count} ${count === 1 ? "word" : "words"}`}
          live={listening ? <LiveText text={split === null ? "" : draft.body.slice(split).replace(/^\s+/, "")} interim={talk.interim} /> : undefined}
          footer={listening ? <Listening talk={talk} saved={<Saved />} look="inline" /> : undefined}
        />
        {listening && <TalkTip href={docsHref(STORY_GUIDE)} />}
        {talk.state === "stopped" && <TalkStopped talk={talk} saved="saved" phone={small} />}
        {canTalk === false && <DeviceDictation device={device} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!small && done("md")}
        <span className="flex-1" />
        <GoLink go={{ label: "Connect GitHub", detail: "Opens Projects to connect GitHub and add what you’ve built.", note: "Free" }} href="/record/projects?github=1" variant="ghost" />
      </div>
    </div>
  );
}

// Setup, step 2 in place: the OpenRouter key (checked with OpenRouter), the monthly AI budget, and the one model every
// task uses, saved together by Save and continue.
function KeyStep({ small, onSaved }: { small: boolean; onSaved: () => void }) {
  const key = useQuery(api.openrouterKey.status);
  const budgets = useQuery(api.budgets.status);
  const main = useQuery(api.aiSettings.defaultChoice);
  const saveKey = useAction(api.openrouterKey.save);
  const setBudgets = useMutation(api.budgets.set);
  const setDefault = useMutation(api.aiSettings.setDefault);
  const recommended = useRecommended();
  const { models } = useModelCatalog();
  const [typed, setTyped] = useState("");
  const [budget, setBudget] = useState<number | null>(null);
  const [model, setModel] = useState<ModelChoiceValue | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const hasKey = !!key?.set;
  const monthly = budget ?? (budgets?.aiMonthlyUsd || 25);
  const choice = model ?? main ?? null;
  const reason =
    key === undefined || budgets === undefined || main === undefined
      ? "Loading…"
      : !hasKey && !typed.trim()
        ? "Paste your OpenRouter key first."
        : !(monthly > 0)
          ? "Set a monthly budget first."
          : !choice
            ? "Choose a model first."
            : undefined;

  const submit = async () => {
    if (reason || busy || !budgets || !choice) return;
    setBusy(true);
    setError(undefined);
    try {
      if (typed.trim()) {
        const saved = await saveKey({ key: typed });
        if (!saved.ok) return setError(saved.message);
      }
      if (monthly !== budgets.aiMonthlyUsd) await setBudgets({ aiMonthlyUsd: monthly, apolloMonthlyCredits: budgets.apolloMonthlyCredits, apolloMode: budgets.apolloMode });
      if (choice.model !== main?.model || choice.reasoning !== main?.reasoning) await setDefault(choice);
      onSaved();
    } catch {
      setError("Couldn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const action = (size: "md" | "lg") => (
    <Button
      variant="primary"
      size={size}
      className={size === "lg" ? "flex-1" : "self-start"}
      keys={size === "md" ? "⌘↵" : undefined}
      loading={busy}
      loadingLabel="Checking"
      reason={reason}
      detail="Checks the key with OpenRouter, then saves it with your budget and model. You can change any of them in Settings."
      note="Free"
      onClick={() => void submit()}
    >
      Save and continue
    </Button>
  );
  useBar(small ? { kind: "actions", actions: action("lg") } : null);

  return (
    <div className="flex flex-col gap-5" onKeyDown={onSubmitKey(() => void submit())}>
      <Field
        label="OpenRouter key"
        className="md:w-[420px]"
        error={error}
        hint={
          <>
            {key?.set ? `Key ending in ${key.last4} added. Paste another to replace it. ` : "No key yet? "}
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="text-text underline decoration-border underline-offset-3 hover:decoration-text">
              Create one at openrouter.ai
            </a>
          </>
        }
      >
        {(props) => <Input {...props} type="password" autoComplete="off" placeholder="sk-or-…" className="font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} />}
      </Field>
      <div className="flex flex-col gap-1.5">
        <Text size="label" as="span" aria-hidden="true">
          Monthly AI budget
        </Text>
        <div className="flex items-center gap-2">
          <NumberField label="Monthly AI budget" hideLabel currency min={0} example={25} value={monthly} onChange={(n) => setBudget(n ?? 0)} className="w-28 shrink-0" />
          <Text size="sm" muted>
            a month. AI work pauses when it’s reached.
          </Text>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex flex-col gap-1 pb-3">
          <Text size="label">Model</Text>
          <Text size="sm" muted>
            Every task uses it. You can change it any time in Settings.
          </Text>
        </div>
        <ModelChoice value={choice} onChange={setModel} recommendations={recommended.data} catalog={models} />
        {recommended.error && (
          <Text size="sm" muted className="pt-2">
            {recommended.error}
          </Text>
        )}
      </div>
      {!small && action("md")}
    </div>
  );
}

const APOLLO_MODES = [
  { value: "on", label: "On" },
  { value: "onRequest", label: "Only when I ask" },
  { value: "paused", label: "Paused" },
] as const;
type ApolloMode = (typeof APOLLO_MODES)[number]["value"];

// Setup, step 7 in place: the Apollo key (checked with Apollo), the credits set aside each month, and whether Apollo
// work runs on its own, saved together by Save and continue.
function ApolloStep({ small, onSaved }: { small: boolean; onSaved: () => void }) {
  const key = useQuery(api.apolloKey.status);
  const budgets = useQuery(api.budgets.status);
  const saveKey = useAction(api.apolloKey.save);
  const setBudgets = useMutation(api.budgets.set);
  const [typed, setTyped] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [mode, setMode] = useState<ApolloMode | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const monthly = credits ?? (budgets?.apolloMonthlyCredits || 400);
  const runs = mode ?? budgets?.apolloMode ?? "on";
  const reason = key === undefined || budgets === undefined ? "Loading…" : !key.set && !typed.trim() ? "Paste your Apollo key first." : undefined;

  const submit = async () => {
    if (reason || busy || !budgets) return;
    setBusy(true);
    setError(undefined);
    try {
      if (typed.trim()) {
        const saved = await saveKey({ key: typed });
        if (!saved.ok) return setError(saved.message);
      }
      if (monthly !== budgets.apolloMonthlyCredits || runs !== budgets.apolloMode) await setBudgets({ aiMonthlyUsd: budgets.aiMonthlyUsd, apolloMonthlyCredits: monthly, apolloMode: runs });
      onSaved();
    } catch {
      setError("Couldn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const action = (size: ButtonSize) => (
    <Button
      variant="primary"
      size={size}
      className={size === "lg" ? "flex-1" : "self-start"}
      keys={size === "md" ? "⌘↵" : undefined}
      loading={busy}
      loadingLabel="Checking"
      reason={reason}
      detail="Checks the key with Apollo and reads the credits left in your plan, then saves it with your credit budget and how Apollo work runs. You can change any of them in Settings."
      note="Free"
      onClick={() => void submit()}
    >
      Save and continue
    </Button>
  );
  useBar(small ? { kind: "actions", actions: action("lg") } : null);

  return (
    <div className="flex flex-col gap-5" onKeyDown={onSubmitKey(() => void submit())}>
      <Field
        label="Apollo key"
        className="md:w-[420px]"
        error={error}
        hint={
          <>
            {key?.set ? `Key ending in ${key.last4} added. Paste another to replace it. ` : "Needs a master key, or one with company search, organization enrichment and credit usage. No key yet? "}
            {!key?.set && (
              <a
                href="https://app.apollo.io/#/settings/integrations/api"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-text underline decoration-border underline-offset-3 hover:decoration-text"
              >
                Create one at apollo.io
                <Icons.openElsewhere size={12} aria-hidden="true" />
              </a>
            )}
          </>
        }
      >
        {(props) => <Input {...props} type="password" autoComplete="off" className="font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} />}
      </Field>
      <div className="flex flex-col gap-1.5 md:w-[420px]">
        <Text size="label" as="span" aria-hidden="true">
          Credits set aside each month
        </Text>
        <NumberField label="Credits set aside each month" hideLabel unit="credits" min={0} example={400} value={monthly} onChange={(n) => setCredits(n ?? 0)} className="w-36 shrink-0" />
        <Text size="sm" muted>
          0 lets CareerBot use whatever is left in your Apollo plan. Never more than that.
        </Text>
      </div>
      <div className="flex flex-col gap-1.5">
        <Text size="label" as="span" aria-hidden="true">
          Automated Apollo work
        </Text>
        <Text size="sm" muted>
          Finding companies, their details and job postings on its own, within the credits above.
        </Text>
        <div className="mt-0.5 self-start">
          <SegmentedControl label="Automated Apollo work" hideLabel value={runs} onChange={setMode} options={APOLLO_MODES} />
        </div>
      </div>
      {!small && action("md")}
    </div>
  );
}
