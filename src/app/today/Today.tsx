"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { DONE } from "../../../convex/pursuitSteps";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/icons";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneLayout, useScreenSize } from "@/components/Panes";
import { ProgressBar } from "@/components/Progress";
import { ReasonField } from "@/components/ReasonField";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Spinner } from "@/components/Spinner";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { useNow } from "../clock";
import { useDemo } from "../demo/demo";
import { useBar, useCommands } from "../shell/ShellContext";
import { useActivity } from "../shell/useActivity";
import { type TodayData, type TodayLine, useToday } from "./data";
import { GettingStarted, type Setup, stepsLeft } from "./GettingStarted";
import type { Id } from "../../../convex/_generated/dataModel";
import { useFollowUp } from "../pursuits/FollowUp";
import { ROLE_REASONS } from "../pursuits/RoleItem";
import { INTERESTED, NOT_FOR_ME } from "../pursuits/words";
import { TodayItem } from "./TodayItem";
import { documentLine, lineTitle, pursuitLine, resumeLine, resumeTitle } from "./words";
import { TODAY_TOUR } from "../tours/today";
import { useTour } from "../shell/useTour";

// Past this many lines a day is busy: Working folds to its count, then New strong roles to its best three.
const BUSY = 10;
const TOP_ROLES = 3;

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// Offered both in Today's ⋯ menu and on the page.
const SHOW_STEPS = { detail: "Shows the getting-started steps again, in place of this list.", note: "Free" } as const;
const OPEN_PURSUITS = { detail: "Opens Pursuits: your roles and the pursuits of them.", note: "Free" } as const;

// Today, where the app opens: what needs them now, each line acting in place, the one chosen open beside the list
// (?item=, J and K move, Esc closes). Until Getting started is put away (Hide until later, or Show Today once it's
// done), its steps instead.
export function Today() {
  const setup = useQuery(api.today.setup);
  const data = useToday();
  if (!setup || !data) return null;
  if (!setup.hidden) return <GettingStarted setup={setup} />;
  return <Lines data={data} setup={setup} />;
}

function useItemParam() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("item", id);
      else next.delete("item");
      const q = next.toString();
      router.push(q ? `${path}?${q}` : path, { scroll: false });
    },
    [params, router, path],
  );
  return [params.get("item"), open] as const;
}

// Where a key types or picks instead of moving through Today.
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

function Lines({ data, setup }: { data: TodayData; setup: Setup }) {
  const size = useScreenSize();
  const small = size === "small";
  const router = useRouter();
  const [param, open] = useItemParam();
  const { jobs } = useActivity();
  const hide = useMutation(api.today.hideSetup);
  const [allRoles, setAllRoles] = useState(false);
  const [showWorking, setShowWorking] = useState(false);
  const tour = useTour(TODAY_TOUR);
  const now = useNow();
  // The demo carries no keys, so Getting started would only ask for them: it stays put away there.
  const demo = useDemo();
  const running = (jobs ?? []).filter((j) => j.state === "running");
  const { lines } = data;

  // The line open: the one asked for, else (beside the list) the first that isn't Review.
  const chosen = lines.find((l) => l.id === param) ?? (small ? undefined : (lines.find((l) => l.kind !== "review") ?? lines[0]));
  const at = chosen ? lines.indexOf(chosen) : -1;
  const move = useCallback((by: number) => {
    if (!lines.length) return;
    const next = lines[Math.min(lines.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
    if (next) open(next.id);
  }, [lines, at, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "Escape" && param) {
        e.preventDefault();
        open(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, open, param]);

  const commands = useMemo(
    (): Command[] =>
      lines.map((l) => ({ id: `today-${l.id}`, group: "Today", label: lineTitle(l), icon: l.kind === "review" ? "review" : l.kind === "resume" || l.kind === "document" ? "resumes" : l.kind === "role" ? "roles" : "pursuits", onSelect: () => open(l.id) })),
    [lines, open],
  );
  useCommands(commands);

  const busy = lines.length + running.length > BUSY;
  const workingFolded = busy && !showWorking;
  const rolesFolded = lines.length > BUSY && !allRoles;
  const shownRoles = rolesFolded ? data.roles.slice(0, TOP_ROLES) : data.roles;

  const today = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: small ? "short" : "long", day: "numeric" });
  const menu: MenuEntry[] = [
    ...(demo ? [] : [{ label: "Show getting started", icon: "help" as const, ...SHOW_STEPS, onSelect: () => void hide({ hidden: false }) }]),
    { label: "Open Pursuits", icon: "pursuits", keys: "G then P", ...OPEN_PURSUITS, onSelect: () => router.push("/pursuits") },
    tour.menu,
  ];

  const row = (l: TodayLine) => <Line key={l.id} line={l} selected={!small && chosen?.id === l.id} onOpen={() => open(l.id)} />;
  const list = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-end justify-between gap-3 px-4 pt-5 pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading size="display">{today}</Heading>
          <Text size="sm" muted>
            {lines.length ? `${lines.length} ${lines.length === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}
          </Text>
        </div>
        {small && running.length > 0 ? (
          <Spinner size={20} className="mb-1 text-steel" label={`${running.length} running`} />
        ) : (
          <Menu label="More for Today" align="end" items={menu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Today" data-tour="today.more" />} />
        )}
      </header>
      {lines.length === 0 && running.length === 0 ? (
        <EmptyState icon="today" title="Nothing needs you" action={<Button {...OPEN_PURSUITS} onClick={() => router.push("/pursuits")}>Open Pursuits</Button>}>
          New roles, reminders and decisions show up here as they come in.
        </EmptyState>
      ) : (
        <List label="Today" className="px-2 pb-2">
          {data.review.length > 0 && (
            <ListGroup label="Review" tour="today.review" count={data.review[0].kind === "review" ? data.review[0].summary.total : undefined}>
              {data.review.map(row)}
            </ListGroup>
          )}
          {data.pursuits.length > 0 && (
            <ListGroup label="Pursuits" tour="today.pursuits" count={data.pursuits.length}>
              {data.pursuits.map(row)}
            </ListGroup>
          )}
          {data.roles.length > 0 && (
            <ListGroup label="New strong roles" tour="today.roles" count={data.roles.length}>
              {shownRoles.map(row)}
              {rolesFolded && data.roles.length > TOP_ROLES && (
                <li className="px-1.5">
                  <Button variant="ghost" size="sm" detail="Shows the rest of the new strong roles." note="Free" onClick={() => setAllRoles(true)}>
                    {data.roles.length - TOP_ROLES} more
                  </Button>
                </li>
              )}
            </ListGroup>
          )}
          {data.resumes.length > 0 && (
            <ListGroup label={data.resumes.some((l) => l.kind === "document" && l.doc.target.kind !== "resume") ? "Documents" : "Resumes"} tour="today.resumes" count={data.resumes.length}>
              {data.resumes.map(row)}
            </ListGroup>
          )}
          {running.length > 0 && (
            <ListGroup label="Working" tour="today.working" count={running.length}>
              {workingFolded ? (
                <li className="flex">
                  <button
                    type="button"
                    onClick={() => setShowWorking(true)}
                    className="flex h-9 w-full items-center gap-2.5 rounded-sm px-3 text-left text-body-sm leading-body-sm text-text transition-colors duration-100 hover:bg-subtle"
                  >
                    <Spinner className="text-steel" />
                    <span className="flex-1">{running.length} running</span>
                    <Icons.expand className="text-muted" />
                  </button>
                </li>
              ) : (
                running.map((j) => (
                  <li key={j.id} className="flex flex-col gap-1.5 px-3 py-1.5">
                    <div className="flex items-center gap-2.5 text-body-sm leading-body-sm">
                      <Spinner className="text-steel" />
                      <span className="min-w-0 flex-1 text-text">{j.label}</span>
                      {j.detail && <span className="shrink-0 text-muted tabular-nums">{j.detail}</span>}
                    </div>
                    {j.progress !== undefined && (
                      <div className="pl-[26px]">
                        <ProgressBar label={j.label} value={j.progress} valueText={j.detail} className="h-[3px]" />
                      </div>
                    )}
                  </li>
                ))
              )}
            </ListGroup>
          )}
        </List>
      )}
      {stepsLeft(setup) > 0 && setup.hidden && small && !demo && (
        <div className="px-4 pb-4">
          <Button variant="ghost" {...SHOW_STEPS} onClick={() => void hide({ hidden: false })}>
            Show getting started
          </Button>
        </div>
      )}
      <NewVersion />
    </div>
  );

  const item = chosen ? (
    <TodayItem key={chosen.id} line={chosen} small={small} at={at + 1} of={lines.length} onMove={move} onGone={() => open(lines[at + 1]?.id ?? lines[at - 1]?.id ?? null)} />
  ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        wide
        list={list}
        item={small ? (param ? item : undefined) : item}
        empty={<EmptyState icon="today" title="Nothing open">Choose a line to open it here.</EmptyState>}
        back={{ label: "Today", onBack: () => open(null) }}
      />
    </div>
  );
}

// One line of Today and the action it takes in place.
function Line({ line: l, selected, onOpen }: { line: TodayLine; selected: boolean; onOpen: () => void }) {
  const router = useRouter();
  const rate = useMutation(api.roles.rate);
  const done = useMutation(api.pursuits.done);
  const rewrite = useMutation(api.resume.rewrite);
  const [why, setWhy] = useState(false);
  const small = useScreenSize() === "small";

  const notForMe = (reason?: string) => {
    if (l.kind !== "role") return;
    setWhy(false);
    rate({ id: l.role.id, value: "no", reason })
      .then(() => toast({ message: `Not for me: ${l.role.title}`, icon: "reject", action: { label: "Undo", key: "U", run: () => void rate({ id: l.role.id, value: null }) } }))
      .catch((e: unknown) => failed(e, "Couldn’t save that."));
  };
  useBar(why && small ? { kind: "reason", decision: "Not for me", picks: ROLE_REASONS, onDone: ({ reason }) => notForMe(reason) } : null);

  switch (l.kind) {
    case "review": {
      const s = l.summary;
      return (
        <ListRow
          title={`${s.total} ${s.total === 1 ? "decision" : "decisions"}`}
          line={s.groups[0]?.preview}
          lead={
            <span className="flex size-7 items-center justify-center rounded-sm bg-subtle text-muted">
              <Icons.review aria-hidden />
            </span>
          }
          selected={selected}
          onOpen={onOpen}
          trail={
            <Button size="sm" keys="G then R" detail="Opens Review, where each decision waits in the order it unlocks your other work." note="Free" onClick={() => router.push("/review")}>
              Review
            </Button>
          }
        />
      );
    }
    case "pursuit": {
      const { p, reminder } = l;
      return (
        <ListRow
          title={lineTitle(l)}
          line={<span className={reminder?.rule === "followUp" ? "text-caution-text" : undefined}>{pursuitLine(p, reminder)}</span>}
          lead={<Avatar name={p.company} company size={28} />}
          selected={selected}
          onOpen={onOpen}
          trail={
            reminder?.rule === "followUp" && !reminder.step ? (
              <FollowUpTrail pursuitId={p.id} onOpen={onOpen} />
            ) : reminder?.step ? (
              <Button size="sm" detail="Opens the pursuit, with what’s next." note="Free" onClick={onOpen}>
                Open
              </Button>
            ) : reminder ? (
              <Button
                size="sm"
                detail={`Marks it done on the pursuit’s timeline, and the reminder leaves Today.`}
                note="Free"
                onClick={() => void done({ id: p.id, rule: reminder.rule }).then(() => toast({ message: `${DONE[reminder.rule].label}: ${p.company}`, icon: "done" }), (e: unknown) => failed(e, "Couldn’t save that."))}
              >
                {DONE[reminder.rule].label}
              </Button>
            ) : (
              <Button size="sm" detail="Opens the pursuit, to answer the offer." note="Free" onClick={onOpen}>
                Open
              </Button>
            )
          }
        />
      );
    }
    case "role": {
      const r = l.role;
      return (
        <ListRow
          title={r.title}
          line={[r.company.name, r.location].filter(Boolean).join(" · ")}
          lead={<ScoreBadge score={r.score} level={r.level} />}
          selected={selected}
          onOpen={onOpen}
          below={
            why && !small ? <ReasonField decision="Not for me" picks={ROLE_REASONS} onDone={({ reason }) => notForMe(reason)} /> : undefined
          }
          trail={
            <>
              <Button
                size="sm"
                {...INTERESTED}
                onClick={() =>
                  void rate({ id: r.id, value: "interested" }).then(
                    () => toast({ message: `Interested: ${r.title}`, icon: "approve", action: { label: "Undo", key: "U", run: () => void rate({ id: r.id, value: null }) } }),
                    (e: unknown) => failed(e, "Couldn’t save that."),
                  )
                }
              >
                Interested
              </Button>
              <Button variant="ghost" size="sm" iconOnly icon="reject" aria-label="Not for me" {...NOT_FOR_ME} onClick={() => setWhy(true)} />
            </>
          }
        />
      );
    }
    case "resume": {
      const u = l.update;
      return (
        <ListRow
          title={resumeTitle(u)}
          line={<span className="text-caution-text">{resumeLine(u)}</span>}
          lead={
            <span className="flex size-7 items-center justify-center rounded-sm bg-caution-subtle text-caution-text">
              <Icons.resumes aria-hidden />
            </span>
          }
          selected={selected}
          onOpen={onOpen}
          trail={
            u.state === "review" ? (
              <Button size="sm" detail="Opens the new version, to keep or discard it." note="Free" onClick={onOpen}>
                Open
              </Button>
            ) : (
              <Button
                size="sm"
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
      );
    }
    case "document":
      return (
        <ListRow
          title={lineTitle(l)}
          line={<span className="text-caution-text">{documentLine(l.doc)}</span>}
          lead={
            <span className="flex size-7 items-center justify-center rounded-sm bg-caution-subtle text-caution-text">
              <Icons.resumes aria-hidden />
            </span>
          }
          selected={selected}
          onOpen={onOpen}
          trail={
            <Button size="sm" detail="Opens it with the lines resting on changed facts, to update them." note="Free" onClick={onOpen}>
              Open
            </Button>
          }
        />
      );
  }
}

// A follow-up due: Write follow-up (at its cost) opens it and writes the draft; once there's a draft, Open.
function FollowUpTrail({ pursuitId, onOpen }: { pursuitId: Id<"pursuits">; onOpen: () => void }) {
  const f = useFollowUp(pursuitId);
  if (f.data?.draft || f.data?.writing)
    return (
      <Button size="sm" detail="Opens the follow-up, to read and send it." note="Free" onClick={onOpen}>
        Open
      </Button>
    );
  return (
    <Button
      size="sm"
      detail="Writes a short follow-up from your approved record, this role and how it has gone, and opens it."
      note={f.amount}
      onClick={() => {
        f.write();
        onOpen();
      }}
    >
      Write follow-up
    </Button>
  );
}

// On a self-hosted copy, for its owner: a quiet line at the foot of the list when a newer version of CareerBot is out,
// with Read before updating when it has steps to read first. It opens Settings, Updates (convex/updates.ts).
function NewVersion() {
  const router = useRouter();
  const status = useQuery(api.updates.status);
  const latest = status?.newer[0];
  if (!latest) return null;
  return (
    <div className="mx-2 mt-auto mb-2 border-t pt-1">
      <button
        type="button"
        onClick={() => router.push("/settings?section=updates")}
        className="flex h-11 w-full items-center gap-2.5 rounded-sm px-3 text-left text-body-sm leading-body-sm text-text transition-colors duration-100 hover:bg-subtle md:h-9"
      >
        <Icons.update aria-hidden="true" className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">CareerBot {latest.version} is out</span>
        {status.needsAction && <span className="shrink-0 text-label leading-label font-medium text-caution-text">Read before updating</span>}
        <Icons.goIn aria-hidden="true" className="shrink-0 text-muted" />
      </button>
    </div>
  );
}
