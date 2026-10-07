"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { resumeTitle } from "../../../../convex/resumeDoc";
import { FactCards, Facts, openAddFact, useFactsHaveCards } from "@/app/record/facts/Facts";
import { Button, type ButtonSize } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import { Field, Input, Textarea } from "@/components/Field";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import { Properties, Property, PropertyLink } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { StatusTag } from "@/components/StatusTag";
import { TabPanel, Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../../costs";
import { type ItemNav, ItemTop, onItemKey } from "../../pursuits/third";
import { useBar } from "../../shell/ShellContext";
import { Body, Head, Section } from "./parts";
import { APPROVES, commits, EDITS, type Fact, OPENS_REPO, type Project, READS_AGAIN, REJECTS, RESTORES, type Role, roleName, SENDS_FILES, span, when } from "./words";

// A project from GitHub: its name, repository, dates and commits, with Read again (its cost) and Open on GitHub; then
// Facts (the same-work card in place, Summary, Stack, its facts, Notes), Sources (the repository and its last read) and
// History; its details beside (repository, dates, commits, the role it was part of, whether resumes show it, the skills
// and tools it gave, when it was read). A proposed project is approved (A) or rejected (R); an approved one can be
// linked to a role, left out of resumes, searched for the same work in its role, edited (E: saving approves it), have
// its approval undone (U) or be rejected (R). Rejecting asks why and sets its unreviewed facts aside; Restore brings them
// back. Everything reversible happens at once with Undo.

export const PROJECT_REASONS = ["Still building it", "Not my work", "Too small to show", "Just an experiment"];
const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const MONTH = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

type Intent = "edit" | "reject" | null;

export function ProjectItem({
  project,
  rows,
  jobs,
  nav,
  small,
  large,
  intent,
  fact,
  onFact,
}: {
  project: Project;
  rows: Fact[];
  jobs: Role[];
  nav: ItemNav;
  small: boolean;
  large: boolean;
  intent: Intent;
  fact: string | null;
  onFact: (id: string) => void;
}) {
  const review = useMutation(api.extract.review);
  const link = useMutation(api.projects.link);
  const show = useMutation(api.resume.setProjectPresentation);
  const readAgain = useMutation(api.sources.readAgain);
  const findSameWork = useMutation(api.sameWork.start);
  const presentation = useQuery(api.resume.presentation);
  const sources = useQuery(api.sources.list);
  const sameWork = useQuery(api.sameWork.last);
  const costs = useQuery(api.estimates.costs, {});
  const [editing, setEditing] = useState(intent === "edit");
  const [why, setWhy] = useState<"reject" | "change" | null>(intent === "reject" ? "reject" : null);
  const [tab, setTab] = useState("facts");

  const d = project.data;
  const key = project.projectKey ?? "";
  const owner = { projectKey: key };
  const hasCards = useFactsHaveCards(owner);
  const approved = project.status === "approved";
  const rejected = project.status === "rejected";
  const role = jobs.find((r) => r.roleKey === project.roleKey);
  const leftOut = !!presentation?.projects.some((p) => p.projectKey === key && p.hidden);
  const run = sources?.projects[key]?.run ?? null;
  const reading = run?.status === "queued" || run?.status === "running";
  const finding = sameWork?.[key]?.status === "queued" || sameWork?.[key]?.status === "running";
  const mine = rows.filter((f) => f.projectKey === key);
  const hasRejectedFacts = mine.some((f) => f.status === "rejected");
  const readCost = aboutUsd(costs?.repository) ?? undefined;
  const findCost = aboutUsd(costs?.sameWork) ?? undefined;

  const decide = (status: "approved" | "proposed", message: string, undo: () => Promise<unknown>) =>
    void review({ id: project.id, status }).then(
      () => toast({ message, icon: status === "approved" ? "approve" : "undo", action: { label: "Undo", key: "U", run: () => void undo().catch((e: unknown) => failed(e, "Couldn’t undo that.")) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const approve = () => decide("approved", `Approved: ${d.name}`, () => review({ id: project.id, status: "proposed" }));
  const undoApproval = () => decide("proposed", `Back to review: ${d.name}`, () => review({ id: project.id, status: "approved" }));
  // The decision and its reason go together, once the reason is saved or skipped.
  const reject = (reason?: string) => {
    const was = project.status;
    setWhy(null);
    void review({ id: project.id, status: "rejected", note: reason }).then(
      () =>
        was !== "rejected" &&
        toast({
          message: `Rejected: ${d.name}`,
          icon: "reject",
          action: { label: "Undo", key: "U", run: () => void review({ id: project.id, status: "proposed" }).then(() => was === "approved" && review({ id: project.id, status: "approved" })) },
        }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const restore = () =>
    void review({ id: project.id, status: "proposed" }).then(
      () => toast({ message: `Restored: ${d.name}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void review({ id: project.id, status: "rejected", note: d.rejectedBecause ?? undefined }) } }),
      (e: unknown) => failed(e, "Couldn’t restore it."),
    );
  const linkTo = (roleKey: string | null) => {
    const was = project.roleKey ?? null;
    if (was === roleKey) return;
    const to = jobs.find((r) => r.roleKey === roleKey);
    void link({ id: project.id, roleKey }).then(
      () => toast({ message: to ? `Linked to ${roleName(to)}` : `${d.name} has no role now`, icon: "link", action: { label: "Undo", key: "U", run: () => void link({ id: project.id, roleKey: was }) } }),
      (e: unknown) => failed(e, "Couldn’t link it."),
    );
  };
  const setShown = (hidden: boolean) =>
    void show({ projectKey: key, hidden }).then(
      () => toast({ message: hidden ? `Left out of resumes: ${d.name}` : `Shown on resumes: ${d.name}`, icon: hidden ? "setAside" : "resumes", action: { label: "Undo", key: "U", run: () => void show({ projectKey: key, hidden: !hidden }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const again = (includingRejected: boolean) =>
    void readAgain({ source: { projectId: project.id }, includingRejected }).then(
      () => toast({ message: `Reading ${d.name} again`, icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start reading."),
    );
  const find = () =>
    void findSameWork({ id: project.id }).then(
      (job) => toast({ message: job ? `Looking for the same work in ${role ? roleName(role) : "its role"}` : "Already looking", icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start looking."),
    );
  const openGitHub = () => window.open(d.url, "_blank", "noreferrer");

  const menu: MenuEntry[] = rejected
    ? [
        { label: "Restore", icon: "undo", keys: "R", detail: RESTORES, note: "Free · Undo with U", onSelect: restore },
        { label: "Change the reason", icon: "edit", detail: "Changes why you rejected it.", note: "Free", onSelect: () => setWhy("change") },
        "separator",
        { label: "Open on GitHub", icon: "openElsewhere", detail: OPENS_REPO, note: "Free", onSelect: openGitHub },
      ]
    : [
        { label: "Edit", icon: "edit", keys: "E", detail: EDITS, note: "Free", onSelect: () => setEditing(true) },
        {
          label: "Link to a role",
          icon: "link",
          ...(approved && jobs.length
            ? { items: [...jobs.map((r) => ({ label: roleName(r), checked: r.roleKey === project.roleKey, onSelect: () => linkTo(r.roleKey!) })), "separator" as const, { label: "No role", checked: !project.roleKey, onSelect: () => linkTo(null) }] }
            : { disabled: true, reason: approved ? "No roles in your record yet" : "Approve it first" }),
        },
        {
          label: leftOut ? "Show on resumes" : "Leave out of resumes",
          icon: leftOut ? "resumes" : "setAside",
          detail: leftOut ? "Lists the project on your resumes again." : "Keeps the project in your record but off your resumes.",
          note: "Free · Undo with U",
          onSelect: () => setShown(!leftOut),
          ...(approved ? {} : { disabled: true, reason: "Approve it first" }),
        },
        "separator",
        {
          label: "Find same work",
          icon: "search",
          hint: findCost,
          detail: "Looks for this project’s facts that describe the same work as its role’s, for you to connect or keep separate.",
          note: findCost ?? "Uses your AI budget",
          onSelect: find,
          ...(finding ? { disabled: true, reason: "Looking now" } : !approved ? { disabled: true, reason: "Approve it first" } : !role ? { disabled: true, reason: "Link it to a role first" } : {}),
        },
        { label: "Read again", icon: "tryAgain", hint: readCost, detail: READS_AGAIN, note: readCost ?? "Uses your AI budget", onSelect: () => again(false), ...(reading ? { disabled: true, reason: "Reading now" } : {}) },
        ...(hasRejectedFacts
          ? [
              {
                label: "Read again with rejected facts",
                icon: "tryAgain" as const,
                hint: readCost,
                detail: `Reads the repository again, this time without skipping facts you rejected, so they can be offered again. ${SENDS_FILES}`,
                note: readCost ?? "Uses your AI budget",
                onSelect: () => again(true),
                ...(reading ? { disabled: true, reason: "Reading now" } : {}),
              },
            ]
          : []),
        { label: "Open on GitHub", icon: "openElsewhere", detail: OPENS_REPO, note: "Free", onSelect: openGitHub },
        { label: "Add a fact", icon: "add", keys: "F", detail: "Adds a fact about this project to your record.", note: "Free", onSelect: () => openAddFact() },
        "separator",
        approved
          ? { label: "Undo approval", icon: "undo", keys: "U", detail: "Takes the project out of your record and back to review.", note: "Free · Undo with U", onSelect: undoApproval }
          : { label: "Approve", icon: "approve", keys: "A", detail: APPROVES, note: "Free · Undo with U", onSelect: approve },
        { label: "Reject", icon: "reject", keys: "R", detail: REJECTS, note: "Free · Undo with U", onSelect: () => setWhy("reject") },
      ];

  useEffect(() => {
    if (editing || why) return;
    const onKey = onItemKey(
      rejected
        ? { r: restore }
        : { e: () => setEditing(true), r: () => setWhy("reject"), ...(approved ? { u: undoApproval } : { a: approve }) },
    );
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const reasonField = (bar: boolean) => (
    <ReasonField
      key={why ?? ""}
      decision={why === "change" ? "Rejected" : "Reject"}
      picks={PROJECT_REASONS}
      defaultValue={why === "change" ? (d.rejectedBecause ?? "") : ""}
      onDone={({ reason }) => (why === "change" && !reason ? setWhy(null) : reject(reason))}
      bar={bar}
      className={bar ? "" : "max-w-[560px]"}
    />
  );

  // The header's actions, in this order beside the title; on a phone in the bar after ⋯, the main one last.
  const actions = (size: ButtonSize): ReactNode[] => {
    const phone = size === "lg";
    const grow = phone ? "flex-1" : "";
    if (rejected)
      return [
        <Button key="restore" size={size} icon="undo" keys={phone ? undefined : "R"} className={grow} detail={RESTORES} note="Free · Undo with U" onClick={restore}>
          Restore
        </Button>,
      ];
    const read = (
      <Button key="read" size={size} icon="tryAgain" className={grow} loading={reading} loadingLabel="Reading" detail={READS_AGAIN} note={readCost ?? "Uses your AI budget"} onClick={() => again(false)}>
        Read again
      </Button>
    );
    if (!approved)
      return [
        <Button key="approve" variant="primary" size={size} keys={phone ? undefined : "A"} className={grow} detail={APPROVES} note="Free · Undo with U" onClick={approve}>
          Approve
        </Button>,
        <Button key="reject" size={size} keys={phone ? undefined : "R"} className={grow} aria-pressed={!!why} detail={REJECTS} note="Free · Undo with U" onClick={() => setWhy("reject")}>
          Reject
        </Button>,
        ...(phone ? [] : [read]),
      ];
    return [read, ...(phone ? [] : [readCost ? <CostEstimate key="cost" amount={readCost} /> : null])];
  };

  const bar = small
    ? hasCards && !why && !editing
      ? null
      : why
        ? { kind: "reason" as const, decision: why === "change" ? "Rejected" : "Reject", picks: PROJECT_REASONS, onDone: ({ reason }: { reason?: string }) => (why === "change" && !reason ? setWhy(null) : reject(reason)) }
        : editing
          ? null
          : {
              kind: "actions" as const,
              actions: (
                <>
                  <Menu label={`More for ${d.name}`} title={d.name} items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />
                  {[...actions("lg")].reverse()}
                  {approved && readCost && <CostEstimate amount={readCost} />}
                </>
              ),
            }
    : null;
  useBar(bar);

  const line = [small ? null : d.repo, span(d.start, d.end), commits(d.commits)].filter(Boolean).join(" · ");
  const head = editing ? (
    <EditForm project={project} small={small} onDone={() => setEditing(false)} />
  ) : (
    <Head name={d.name} line={line}>
      {!small && (
        <div className="flex flex-col gap-3 md:pl-[54px]">
          {rejected ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag tone="neutral">Rejected</StatusTag>
              {d.rejectedBecause && <Text size="sm">{d.rejectedBecause}</Text>}
              <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label="Change the reason" detail="Changes why you rejected it." note="Free" onClick={() => setWhy("change")} />
              <span className="ml-auto flex">{actions("md")}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {actions("md")}
              <span className="w-2 shrink-0" />
              <Button variant="ghost" icon="openElsewhere" detail={OPENS_REPO} note="Free" onClick={openGitHub}>
                Open on GitHub
              </Button>
            </div>
          )}
          {why && reasonField(false)}
          <RunLine run={run} />
        </div>
      )}
      {small && <RunLine run={run} />}
    </Head>
  );

  const notes = <ProjectNotes id={project.id} />;
  const details = <Details project={project} jobs={jobs} role={role} leftOut={leftOut} onLink={linkTo} onShow={setShown} inline={!large} />;

  if (rejected)
    return (
      <div data-tour="record.item" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <ItemTop nav={nav} small={small} menu={menu} title={d.name} />
        {head}
        <Body details={large ? details : undefined}>
          {notes}
          {d.summary && (
            <Section title="Summary">
              <Text measure>{d.summary}</Text>
            </Section>
          )}
          <SetAside id={project.id} />
          <Stack stack={d.stack} />
        </Body>
      </div>
    );

  const factsTab = (
    <>
      {!large && !small && details}
      <FactCards owner={owner} open={fact} onOpen={onFact} />
      {!editing && d.summary && (
        <Section title="Summary">
          <Text measure>{d.summary}</Text>
        </Section>
      )}
      <Stack stack={d.stack} />
      <Facts owner={owner} open={fact} onOpen={onFact} cards={false} />
      {small && details}
      {notes}
    </>
  );

  return (
    <div data-tour="record.item" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop nav={nav} small={small} menu={menu} title={d.name} />
      {head}
      {small ? (
        <Body>{factsTab}</Body>
      ) : (
        <Tabs
          label={`${d.name} by part`}
          inFlow
          className="px-4 md:px-6 lg:px-8"
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: "facts", label: "Facts", count: mine.filter((f) => f.status !== "rejected").length },
            { value: "sources", label: "Sources", count: 1 },
            { value: "history", label: "History" },
          ]}
        >
          <TabPanel value="facts">
            <Body details={large ? details : undefined}>{factsTab}</Body>
          </TabPanel>
          <TabPanel value="sources">
            <Body details={large ? details : undefined}>
              <Repository project={project} run={run} reading={reading} cost={readCost} onRead={() => again(false)} facts={mine.length} />
            </Body>
          </TabPanel>
          <TabPanel value="history">
            <Body details={large ? details : undefined}>
              <History project={project} />
            </Body>
          </TabPanel>
        </Tabs>
      )}
    </div>
  );
}

// How its last read went, when that's worth saying: waiting for budget, or why it failed.
function RunLine({ run }: { run: { status: string; error: string | null } | null }) {
  if (run?.status === "paused") return <Text size="sm" className="text-caution-text">Waiting for budget</Text>;
  if (run?.status === "failed") return <Text size="sm" className="text-red dark:text-text">{`Couldn’t read it${run.error ? `: ${run.error}` : "."}`}</Text>;
  return null;
}

function Stack({ stack }: { stack?: string[] }) {
  if (!stack?.length) return null;
  return (
    <Section title="Stack">
      <div className="flex flex-wrap gap-1.5">
        {stack.map((s) => (
          <StatusTag key={s} tone="neutral">
            {s}
          </StatusTag>
        ))}
      </div>
    </Section>
  );
}

function ProjectNotes({ id }: { id: Id<"items"> }) {
  const subject = { kind: "item" as const, id };
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const edit = useMutation(api.notes.edit);
  const remove = useMutation(api.notes.remove);
  return (
    <NoteBlock
      heading
      notes={notes ?? []}
      onAdd={(text) => void add({ subject, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onEdit={(noteId, text) => void edit({ id: noteId as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onDelete={(noteId) => void remove({ id: noteId as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
    />
  );
}

// The facts set aside with a rejected project: back in the record, for review, when it's restored.
function SetAside({ id }: { id: Id<"items"> }) {
  const facts = useQuery(api.projects.setAside, { id });
  const [all, setAll] = useState(false);
  if (!facts?.length) return null;
  const shown = all ? facts : facts.slice(0, 3);
  return (
    <Section title="Set aside" count={facts.length} trail={<span className="text-label leading-label text-muted">· back in your record when you restore</span>}>
      <ul className="flex flex-col border-t">
        {shown.map((f) => (
          <li key={f.id} className="border-b px-2 py-2.5 text-body-md leading-body-md text-muted">
            {f.text}
          </li>
        ))}
      </ul>
      {facts.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="tap self-start rounded-sm px-2 text-body-sm leading-body-sm font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text">
          {`${facts.length - shown.length} more`}
        </button>
      )}
    </Section>
  );
}

// Its details: beside the body on large screens; inline (Role, On resumes, Repository) above it otherwise.
function Details({
  project,
  jobs,
  role,
  leftOut,
  onLink,
  onShow,
  inline,
}: {
  project: Project;
  jobs: Role[];
  role: Role | undefined;
  leftOut: boolean;
  onLink: (roleKey: string | null) => void;
  onShow: (hidden: boolean) => void;
  inline: boolean;
}) {
  const skills = useQuery(api.skills.list);
  const d = project.data;
  const approved = project.status === "approved";
  const rejected = project.status === "rejected";
  const from = (skills?.items ?? []).filter((s) => s.status !== "rejected" && s.sources.some((x) => x.kind === "project" && x.key === project.projectKey));
  const nSkills = from.filter((s) => s.kind === "skill").length;
  const nTools = from.filter((s) => s.kind === "tool").length;
  const roleSelect = (
    <Select
      label="Role"
      value={project.roleKey ?? "none"}
      onChange={(v) => onLink(v === "none" ? null : v)}
      reason={approved ? (jobs.length ? undefined : "No roles in your record yet") : "Approve it first"}
      className="w-full"
      options={[...jobs.map((r) => ({ value: r.roleKey!, label: resumeTitle(r.data)?.text ?? "Untitled role" })), "separator" as const, { value: "none", label: "No role" }]}
    />
  );
  const shown = (
    <SegmentedControl
      label="On resumes"
      hideLabel
      value={leftOut ? "out" : "show"}
      onChange={(v) => onShow(v === "out")}
      disabled={!approved}
      options={[
        { value: "show", label: "Show" },
        { value: "out", label: "Leave out" },
      ]}
    />
  );
  const repo = <PropertyLink href={d.url}>{d.repo}</PropertyLink>;
  if (inline)
    return (
      <dl aria-label="Details" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3.5">
        {!rejected && (
          <>
            <Property label="Role">
              {roleSelect}
              {role && <span className="pt-1 text-label leading-label text-muted">{[role.data.employer, span(role.data.start, role.data.end, { open: true })].filter(Boolean).join(" · ")}</span>}
            </Property>
            <Property label="On resumes">{shown}</Property>
          </>
        )}
        <Property label="Repository">{repo}</Property>
      </dl>
    );
  return (
    <Properties>
      <Property label="Repository">{repo}</Property>
      {span(d.start, d.end) && <Property label="Dates">{span(d.start, d.end)}</Property>}
      {d.commits !== undefined && <Property label="Commits">{[d.commits.toLocaleString("en-US"), d.private && "private repository"].filter(Boolean).join(" · ")}</Property>}
      {!rejected && (
        <>
          <Property label="Role">
            {roleSelect}
            {role && <span className="pt-1 text-label leading-label text-muted">{[role.data.employer, span(role.data.start, role.data.end, { open: true })].filter(Boolean).join(" · ")}</span>}
          </Property>
          <Property label="On resumes">{shown}</Property>
        </>
      )}
      {nSkills + nTools > 0 && (
        <Property label="Skills and tools">
          {nSkills > 0 && (
            <Link href="/record/skills" className="self-start underline decoration-border underline-offset-3 hover:decoration-text">
              {`${nSkills} ${nSkills === 1 ? "skill" : "skills"}`}
            </Link>
          )}
          {nTools > 0 && (
            <Link href="/record/tools" className="self-start underline decoration-border underline-offset-3 hover:decoration-text">
              {`${nTools} ${nTools === 1 ? "tool" : "tools"}`}
            </Link>
          )}
        </Property>
      )}
      {d.readAt && <Property label="Read">{`${when(d.readAt)} · from GitHub`}</Property>}
    </Properties>
  );
}

// Sources: the repository it was read from, when, how many facts came of it, and Read again.
function Repository({ project, run, reading, cost, onRead, facts }: { project: Project; run: { status: string; error: string | null } | null; reading: boolean; cost?: string; onRead: () => void; facts: number }) {
  const d = project.data;
  return (
    <Section title="Sources" count={1}>
      <div className="flex flex-wrap items-center gap-3 border-y py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <PropertyLink href={d.url}>{d.repo}</PropertyLink>
          <Text size="sm" muted>
            {[d.readAt ? `Read ${when(d.readAt)}` : "GitHub", `${facts} ${facts === 1 ? "fact" : "facts"} from it`].join(" · ")}
          </Text>
          <RunLine run={run} />
        </div>
        {reading ? (
          <span className="flex items-center gap-2 text-body-sm leading-body-sm text-muted">
            <Spinner />
            Reading…
          </span>
        ) : (
          <>
            <Button size="sm" icon="tryAgain" detail={READS_AGAIN} note={cost ?? "Uses your AI budget"} onClick={onRead}>
              Read again
            </Button>
            {cost && <CostEstimate amount={cost} />}
          </>
        )}
      </div>
    </Section>
  );
}

// History: what happened to it, newest first.
function History({ project }: { project: Project }) {
  const d = project.data;
  const events: { at: number | null; text: string }[] = [
    ...(project.undone ?? []).map((u) => ({ at: u.at, text: "Approval undone" })),
    ...(d.readAt ? [{ at: d.readAt, text: "Read from GitHub" }] : []),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  if (project.status === "rejected") events.unshift({ at: null, text: d.rejectedBecause ? `Rejected: ${d.rejectedBecause}` : "Rejected" });
  if (d.edited) events.unshift({ at: null, text: "Edited by you" });
  return (
    <Section title="History">
      {events.length ? (
        <ol className="flex flex-col gap-1.5">
          {events.map((e, i) => (
            <li key={i} className="flex gap-4 text-body-sm leading-body-sm">
              <span className="w-14 shrink-0 text-muted tabular-nums">{e.at ? when(e.at).replace(/^Today, .*/, "Today") : ""}</span>
              <span className="min-w-0 text-text">{e.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Text size="sm" muted>
          Nothing yet.
        </Text>
      )}
    </Section>
  );
}

// Edit: its name, summary and dates (YYYY-MM). Saving approves it as corrected. ⌘↵ saves, Esc cancels.
function EditForm({ project, small, onDone }: { project: Project; small: boolean; onDone: () => void }) {
  const edit = useMutation(api.projects.edit);
  const d = project.data;
  const [form, setForm] = useState({ name: d.name, summary: d.summary ?? "", start: d.start ?? "", end: d.end ?? "" });
  const [tried, setTried] = useState(false);
  const bad = (v: string) => v.trim() !== "" && !MONTH.test(v.trim());
  const problem = !form.name.trim() ? "name" : bad(form.start) ? "start" : bad(form.end) ? "end" : null;
  const save = () => {
    setTried(true);
    if (problem) return;
    void edit({ id: project.id, ...form }).then(
      () => {
        onDone();
        toast({ message: `Saved and approved: ${form.name.trim()}`, icon: "approve" });
      },
      (e: unknown) => failed(e, "Couldn’t save it."),
    );
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onDone();
    }
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  useBar(
    small
      ? {
          kind: "actions",
          actions: (
            <>
              <Button size="lg" className="flex-1" onClick={onDone}>
                Cancel
              </Button>
              <Button size="lg" variant="primary" className="flex-1" detail="Saves your corrections and approves the project." note="Free" onClick={save}>
                Save and approve
              </Button>
            </>
          ),
        }
      : null,
  );
  return (
    <div onKeyDown={onKeyDown} className="flex shrink-0 flex-col gap-4 border-b px-4 pt-2 pb-6 md:px-6 lg:px-8">
      <Field label="Name" error={tried && problem === "name" ? "Give it a name." : undefined}>
        {(p) => <Input {...p} autoFocus value={form.name} onChange={set("name")} />}
      </Field>
      <Field label="Summary">{(p) => <Textarea {...p} rows={2} value={form.summary} onChange={set("summary")} />}</Field>
      <div className="flex flex-wrap items-start gap-3">
        <Field label="Start" className="w-36" error={tried && problem === "start" ? "Use YYYY-MM." : undefined}>
          {(p) => <Input {...p} placeholder="YYYY-MM" value={form.start} onChange={set("start")} />}
        </Field>
        <Field label="End" className="w-36" error={tried && problem === "end" ? "Use YYYY-MM." : undefined}>
          {(p) => <Input {...p} placeholder="YYYY-MM" value={form.end} onChange={set("end")} />}
        </Field>
        <Text size="sm" muted className="self-center md:pt-6">
          YYYY-MM · leave End blank if you’re still on it
        </Text>
      </div>
      {!small && (
        <div className="flex gap-2">
          <Button variant="primary" keys="⌘↵" detail="Saves your corrections and approves the project." note="Free" onClick={save}>
            Save and approve
          </Button>
          <Button keys="Esc" onClick={onDone}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
