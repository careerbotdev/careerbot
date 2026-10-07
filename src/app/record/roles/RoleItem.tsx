"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { recordDoc, resumeTitle } from "../../../../convex/resumeDoc";
import { Avatar } from "@/components/Avatar";
import { SourceQuote } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { Input, Textarea } from "@/components/Field";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import { useScreenSize } from "@/components/Panes";
import { Properties, Property } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { ReviewCard, ReviewStatement } from "@/components/ReviewCard";
import type { SelectOption } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { TabPanel, Tabs } from "@/components/Tabs";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { type ItemNav, ItemTop, onItemKey } from "../../pursuits/third";
import { useArrangement } from "../../resumes/arrangement";
import { useBar, useCommands } from "../../shell/ShellContext";
import { Facts, useFactsHaveCards } from "../facts/Facts";
import type { useRoleActions } from "./actions";
import { type Placement, RoleForm, type RoleChange } from "./RoleForm";
import { type Context, EXPLAIN, type Fact, monthLabel, monthSpan, plural, type Question, readMonth, type Role, type Row, roleName, roleTitle, titleNote, yearSpan } from "./words";

// A role open beside the list: its title, employer, dates and place; Approve, Edit and Reject while it's new, or its
// rejection and Restore once rejected. Then Facts (a disagreement about its details first, then its facts), Context,
// Sources and History, its notes, and its details beside (under it when the pane is narrow), edited in place.

const REASONS = ["Same job as another", "Not a real role", "Wrong dates", "Too short to list", "Not mine"];
type Tab = "facts" | "context" | "sources" | "history";
const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

export function RoleItem({
  role,
  rows,
  questions,
  actions,
  nav,
  small,
  fact,
  onOpenFact,
  third,
  onGone,
}: {
  role: Role;
  rows: Row[];
  questions: Question[];
  actions: ReturnType<typeof useRoleActions>;
  nav: ItemNav;
  small: boolean;
  fact: string | null;
  onOpenFact: (id: string) => void;
  // The fact pane's toggle: open now, and what it does.
  third: { open: boolean; toggle: () => void };
  onGone: () => void;
}) {
  const roleKey = role.roleKey ?? "";
  const size = useScreenSize();
  const [tab, setTab] = useState<Tab>("facts");
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const editRole = useMutation(api.extract.editRole);
  const presentation = useQuery(api.resume.presentation);
  const cards = useFactsHaveCards({ roleKey });
  const rejected = role.status === "rejected";
  const proposed = role.status === "proposed";

  // How it shows on every resume: its own entry, folded into the entry before or after it, or left out.
  const approved = rows.filter((r): r is Role => r.kind === "role" && r.status === "approved" && r.counts);
  const a = useArrangement({ doc: recordDoc(approved.map((r) => ({ ...r.data, roleKey: r.roleKey }))), settings: presentation ?? { roles: [] }, layout: null, level: "record" });
  const entry = a.entryOf(roleKey);
  const eff = a.effOf(roleKey);
  const placed: Placement = eff?.hidden ? "out" : eff?.fold?.into === "previous" ? "previous" : eff?.fold?.into === "next" ? "next" : "own";
  const target = (into: "previous" | "next") => (entry ? a.foldTarget(roleKey, into) : null);
  const foldLabel = (into: "previous" | "next") => {
    const t = target(into);
    return t ? `Fold into ${t.title}${t.employer ? `, ${t.employer}` : ""}` : into === "previous" ? "Fold into the one before" : "Fold into the one after";
  };
  const placement = {
    value: placed,
    options: [
      { value: "own", label: "Own entry" },
      { value: "previous", label: foldLabel("previous"), disabled: !target("previous") },
      { value: "next", label: foldLabel("next"), disabled: !target("next") },
      { value: "out", label: "Leave out" },
    ] satisfies SelectOption<Placement>[],
    reason: entry ? undefined : "Approve it first",
  };
  const placedWords = placed === "out" ? "Left out" : placed === "own" ? "Own entry" : foldLabel(placed).replace("Fold", "Folded");

  const save = (c: RoleChange, place?: Placement) => {
    const d = role.data;
    const before = { employer: d.employer ?? "", title: d.title ?? "", alternateTitles: d.alternateTitles ?? [], start: d.start ?? "", end: d.end ?? "", location: d.location ?? "", change: d.change ?? "none" };
    setEditing(false);
    void editRole({ id: role.id, ...c }).then(
      () => toast({ message: `Saved: ${c.title}`, icon: "approve", action: { label: "Undo", key: "U", run: () => void editRole({ id: role.id, ...before }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
    if (place && place !== placed) a.place(roleKey, place === "own" ? {} : place === "out" ? { hidden: true } : { fold: { into: place, bullets: "move" } });
  };
  const reject = (reason?: string) => {
    setRejecting(false);
    actions.reject(role, reason);
  };
  const addContext = () => {
    setTab("context");
    setAddingContext(true);
  };

  const menu = actions.roleMenu(role, { item: { edit: () => setEditing(true), addContext }, onGone });
  // ⌘K: what the ⋯ can do, under the role's name.
  useCommands(
    menu.flatMap((m, i): Command[] =>
      typeof m === "object" && "label" in m && m.onSelect && !m.disabled ? [{ id: `role-${role.id}-${i}`, group: roleTitle(role), label: m.label, icon: m.icon, keys: m.keys, detail: m.hint, onSelect: m.onSelect }] : [],
    ),
  );

  useEffect(() => {
    const onKey = onItemKey({
      ...(rejected ? { u: () => actions.restore(role) } : { x: addContext }),
      ...(proposed && !cards && !editing ? { a: () => actions.approve(role), r: () => setRejecting(true) } : {}),
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useBar(
    !small
      ? null
      : rejecting
        ? { kind: "reason", decision: "Reject", picks: REASONS, onDone: ({ reason }) => reject(reason) }
        : cards && !rejected
          ? null
          : rejected
            ? {
                kind: "actions",
                actions: (
                  <BarMenu menu={menu} title={roleTitle(role)}>
                    <Button size="lg" variant="primary" icon="undo" className="flex-1" detail={EXPLAIN.restore.detail} note={EXPLAIN.restore.note} onClick={() => actions.restore(role)}>
                      Restore
                    </Button>
                  </BarMenu>
                ),
              }
            : proposed
              ? {
                  kind: "actions",
                  actions: (
                    <BarMenu menu={menu} title={roleTitle(role)}>
                      <Button size="lg" detail={EXPLAIN.reject.detail} note={EXPLAIN.reject.note} onClick={() => setRejecting(true)}>
                        Reject
                      </Button>
                      <Button size="lg" variant="primary" className="flex-1" detail={EXPLAIN.approve.detail} note={EXPLAIN.approve.note} onClick={() => actions.approve(role)}>
                        Approve
                      </Button>
                    </BarMenu>
                  ),
                }
              : null,
  );

  const wide = size === "large" && !third.open;
  const facts = rows.filter((r): r is Fact => r.kind === "fact" && r.roleKey === roleKey && !r.projectKey && r.status !== "rejected");
  const context = rows.filter((r): r is Context => r.kind === "context" && r.roleKey === roleKey && !r.projectKey);
  const stories = storiesOf(role, facts);
  const toggle = !small && !rejected ? (
    <Button
      variant="ghost"
      iconOnly
      icon="thirdPane"
      aria-label={third.open ? "Close the fact" : "Open a fact"}
      aria-pressed={third.open}
      className="aria-pressed:bg-border"
      detail={third.open ? "Closes the fact beside the role." : "Opens the role’s first fact beside it, with its sources and history."}
      note="Free"
      onClick={third.toggle}
    />
  ) : undefined;

  const details = editing ? (
    <section aria-label="Details" className="flex flex-col gap-3.5">
      <h3 className="text-label leading-label font-medium text-text">Details</h3>
      <RoleForm role={role} placement={placement} onSave={save} onCancel={() => setEditing(false)} />
    </section>
  ) : (
    <Details role={role} rows={rows} placed={rejected ? null : placedWords} stories={stories} columns={wide ? 1 : 2} />
  );

  return (
    <div data-tour="record.item" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop nav={nav} small={small} menu={menu} title={roleTitle(role)} actions={toggle} />
      <header className="flex flex-col gap-4 px-4 pt-2 pb-5 md:px-6 lg:px-8">
        <div className="flex items-start gap-3.5">
          <Avatar name={role.data.employer || roleTitle(role)} company size={40} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Heading>{roleTitle(role)}</Heading>
            <Text size="sm" muted>
              {[role.data.employer, monthSpan(role.data.start, role.data.end), role.data.location].filter(Boolean).join(" · ")}
            </Text>
          </div>
        </div>
        {!rejected && titleNote(role.data) && <p className="border-l-2 border-caution pl-3.5 text-body-sm leading-body-sm text-text md:ml-[54px]">{titleNote(role.data)}</p>}
        {proposed && !small && (
          <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">
            <Button variant="primary" keys={cards ? undefined : "A"} detail={EXPLAIN.approve.detail} note={EXPLAIN.approve.note} onClick={() => actions.approve(role)}>
              Approve
            </Button>
            <Button icon="edit" detail={EXPLAIN.edit.detail} note={EXPLAIN.edit.note} onClick={() => setEditing(true)}>
              Edit details
            </Button>
            <Button keys={cards ? undefined : "R"} aria-pressed={rejecting} detail={EXPLAIN.reject.detail} note={EXPLAIN.reject.note} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        )}
        {rejecting && !small && <ReasonField decision="Reject" picks={REASONS} onDone={({ reason }) => reject(reason)} className="max-w-[560px] md:ml-[54px]" />}
        {rejected && <Rejection role={role} actions={actions} small={small} />}
      </header>
      {rejected ? (
        <RejectedBody role={role} rows={rows} wide={wide} details={details} />
      ) : (
        <div className="flex shrink-0 flex-col">
        <Tabs
          label="Role"
          className="px-4 md:px-6 lg:px-8"
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          tabs={[
            { value: "facts", label: "Facts", count: facts.length },
            { value: "context", label: "Context", count: context.length },
            { value: "sources", label: "Sources", count: stories.length },
            { value: "history", label: "History" },
          ]}
        >
          <div className={wide ? "flex min-h-0" : "flex flex-col"}>
            <div className="flex min-w-0 flex-1 flex-col gap-8 px-4 py-6 md:px-6 lg:px-8">
              <TabPanel value="facts" className="flex flex-col gap-6">
                <Disagreements role={role} questions={questions} />
                <Facts owner={{ roleKey }} open={fact} onOpen={onOpenFact} />
              </TabPanel>
              <TabPanel value="context">
                <ContextList role={role} context={context} facts={facts} adding={addingContext} setAdding={setAddingContext} onOpenFact={onOpenFact} />
              </TabPanel>
              <TabPanel value="sources">
                <Sources role={role} stories={stories} actions={actions} />
              </TabPanel>
              <TabPanel value="history">
                <History role={role} stories={stories} />
              </TabPanel>
              {!wide && details}
              <RoleNotes id={role.id} />
            </div>
            {wide && <aside className="w-60 shrink-0 border-l px-6 py-6">{details}</aside>}
          </div>
        </Tabs>
        </div>
      )}
    </div>
  );
}

// The phone bar for a role: its ⋯ first, then the actions.
function BarMenu({ menu, title, children }: { menu: MenuEntry[]; title: string; children: ReactNode }) {
  return (
    <>
      <Menu label={`More for ${title}`} title={title} items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />
      {children}
    </>
  );
}

// The stories a role and its facts were read from, newest version cited, with how many of its facts each gave.
type Story = { id: Id<"narratives">; version: number; facts: number; quotes: string[] };
function storiesOf(role: Role, facts: Fact[]): Story[] {
  const out = new Map<string, Story>();
  for (const s of role.sources) out.set(s.narrativeId, { id: s.narrativeId, version: s.version, facts: 0, quotes: s.quotes });
  for (const f of facts)
    for (const s of f.sources) {
      const was = out.get(s.narrativeId) ?? { id: s.narrativeId, version: s.version, facts: 0, quotes: [] };
      out.set(s.narrativeId, { ...was, version: Math.max(was.version, s.version), facts: was.facts + 1 });
    }
  return [...out.values()];
}

function useStoryTitles() {
  const narratives = useQuery(api.narratives.list);
  return (id: string) => narratives?.find((n) => n.id === id)?.title ?? "Story";
}

// Its details: employer, dates, place, team, the title resumes use, how it shows on them, its projects, skills and tools,
// and the story it came from.
function Details({ role, rows, placed, stories, columns }: { role: Role; rows: Row[]; placed: string | null; stories: Story[]; columns: 1 | 2 }) {
  const skills = useQuery(api.skills.list);
  const title = useStoryTitles();
  const d = role.data;
  const mine = (skills?.items ?? []).filter((s) => s.status !== "rejected" && s.sources.some((x) => x.kind === "role" && x.key === role.roleKey));
  const count = (kind: "skill" | "tool") => mine.filter((s) => s.kind === kind).length;
  const projects = rows.filter((r) => r.kind === "project" && r.status !== "rejected" && r.roleKey === role.roleKey);
  const link = "tap self-start rounded-sm underline decoration-border decoration-1 underline-offset-3 transition-colors duration-100 hover:decoration-text";
  const story = stories.find((s) => role.sources.some((x) => x.narrativeId === s.id)) ?? stories[0];
  return (
    <Properties columns={columns}>
      <Property label="Employer">{d.employer || "Not given"}</Property>
      <Property label="Dates">{monthSpan(d.start, d.end) || "Not given"}</Property>
      <Property label="Location">{d.location || "Not given"}</Property>
      {d.team?.length ? <Property label="Team">{d.team.join(", ")}</Property> : null}
      <Property label="Title on resumes">{d.break ? "Career break" : (resumeTitle(d)?.text ?? "None")}</Property>
      {d.alternateTitles?.length ? <Property label="Also called">{d.alternateTitles.join(", ")}</Property> : null}
      {placed && <Property label="On resumes">{placed}</Property>}
      {projects.length > 0 && (
        <Property label="Projects">
          {projects.map((p) => (
            <Link key={p.id} href={`/record/projects?project=${p.id}`} className={link}>
              {p.kind === "project" ? p.data.name : ""}
            </Link>
          ))}
        </Property>
      )}
      {(count("skill") > 0 || count("tool") > 0) && (
        <Property label="Skills and tools">
          {count("skill") > 0 && (
            <Link href="/record/skills" className={link}>
              {plural(count("skill"), "skill")}
            </Link>
          )}
          {count("tool") > 0 && (
            <Link href="/record/tools" className={link}>
              {plural(count("tool"), "tool")}
            </Link>
          )}
        </Property>
      )}
      <Property label="Story">
        {story ? (
          <Link href={`/record/story?story=${story.id}`} className={link}>
            {title(story.id)} · version {story.version}
          </Link>
        ) : (
          "You added it yourself"
        )}
      </Property>
    </Properties>
  );
}

// A disagreement about this role between the record and a story, one at a time: 1 the record is right, 2 the story
// is, 3 neither (then type what's right). For two jobs whose dates overlap, shown on both: 1 both are right (they held
// both), 2 the first job's end is wrong, 3 the other's start is (then type the month). The record changes only with
// the answer; Undo takes the answer back.
function Disagreements({ role, questions }: { role: Role; questions: Question[] }) {
  const router = useRouter();
  const answer = useMutation(api.conflicts.answer);
  const reopen = useMutation(api.conflicts.reopen);
  const mine = questions.filter((q) => q.roleKey === role.roleKey || q.data.overlap?.starts.roleKey === role.roleKey);
  const [at, setAt] = useState(0);
  const [other, setOther] = useState<string | null>(null);
  // For jobs that overlap: which date they're typing.
  const [fixing, setFixing] = useState<"start" | "end">();
  const [problem, setProblem] = useState<string | null>(null);
  const q = mine[Math.min(at, mine.length - 1)];
  const overlap = q?.data.overlap;
  const dated = !!overlap || q?.data.field === "start" || q?.data.field === "end";
  const pick = (p: "record" | "narrative" | "other" | "both", value?: string) => {
    if (!q) return;
    setOther(null);
    void answer({ id: q.id, pick: p, value, field: overlap && p === "other" ? fixing : undefined }).then(
      () =>
        toast({
          message: p === "record" ? "Kept what your record says" : p === "both" ? "Kept both jobs as they are" : "Updated your record",
          icon: "approve",
          action: { label: "Undo", key: "U", run: () => void reopen({ id: q.id }) },
        }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const fix = (field: "start" | "end") => {
    setFixing(field);
    setOther("");
  };
  const saveOther = () => {
    if (other === null) return;
    if (dated) {
      const m = readMonth(other);
      if ("problem" in m || !m.value) return setProblem("problem" in m ? m.problem : "Write a month and year, like May 2021.");
      return pick("other", m.value);
    }
    if (!other.trim()) return setProblem("Write what’s right.");
    pick("other", other.trim());
  };
  useEffect(() => {
    if (!q || other !== null) return;
    const onKey = onItemKey(
      overlap
        ? { "1": () => pick("both"), "2": () => fix("end"), "3": () => fix("start") }
        : { "1": () => pick("record"), ...(q.data.narrativeValue ? { "2": () => pick("narrative") } : {}), "3": () => setOther("") },
    );
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!q) return null;
  const story = q.sources[0];
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") saveOther();
    if (e.key === "Escape") {
      e.preventDefault();
      setOther(null);
    }
  };
  return (
    <ReviewCard
      kind="Disagreement"
      context={roleName(role)}
      position={{ index: Math.min(at, mine.length - 1) + 1, total: mine.length }}
      onNext={() => setAt(Math.min(at + 1, mine.length - 1))}
      onPrevious={() => setAt(Math.max(at - 1, 0))}
      actions={
        overlap
          ? [
              { label: "Both are right", keys: "1", detail: "You held both jobs at once. Neither changes, and this isn’t asked again.", note: "Free · Undo with U", onSelect: () => pick("both") },
              { label: "Fix end date", keys: "2", detail: `Type the month your ${overlap.ends.employer} job ended; your record takes it.`, note: "Free · Undo with U", onSelect: () => fix("end") },
              { label: "Fix start date", keys: "3", detail: `Type the month your ${overlap.starts.employer} job started; your record takes it.`, note: "Free · Undo with U", onSelect: () => fix("start") },
            ]
          : [
              { label: "Record is right", keys: "1", detail: "Keeps your record as it is. This question isn’t asked again.", note: "Free · Undo with U", onSelect: () => pick("record") },
              {
                label: "Story is right",
                keys: "2",
                detail: "Changes your record to what the story says.",
                note: "Free · Undo with U",
                onSelect: () => pick("narrative"),
                ...(q.data.narrativeValue ? {} : { reason: "Type it under Neither" }),
              },
              { label: "Neither", keys: "3", detail: "Type what’s right; your record takes it.", note: "Free · Undo with U", onSelect: () => setOther("") },
            ]
      }
      aside={story ? { label: "Open story", detail: "Opens the story this was read from.", note: "Free", onSelect: () => router.push(`/record/story?story=${story.narrativeId}`) } : undefined}
      footer={
        other !== null ? (
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <Input
                autoFocus
                aria-label={overlap ? `When your ${fixing === "end" ? overlap.ends.employer : overlap.starts.employer} job ${fixing === "end" ? "ended" : "started"}` : "What’s right"}
                placeholder={dated ? "May 2021" : "What’s right"}
                value={other}
                onChange={(e) => (setOther(e.target.value), setProblem(null))}
                onKeyDown={onKeyDown}
                aria-invalid={!!problem}
              />
              {problem && <Text size="sm" className="text-red dark:text-text">{problem}</Text>}
            </div>
            <Button keys="↵" detail="Changes your record to what you typed." note="Free · Undo with U" onClick={saveOther}>
              Save
            </Button>
            <Button variant="ghost" keys="Esc" onClick={() => setOther(null)}>
              Cancel
            </Button>
          </div>
        ) : undefined
      }
    >
      <ReviewStatement>{q.data.question}</ReviewStatement>
      <dl className="flex flex-col border-t">
        <div className="flex gap-4 border-b py-2.5">
          <dt className={`${overlap ? "w-32" : "w-16"} shrink-0 text-body-sm leading-body-sm text-muted`}>{overlap ? overlap.ends.employer : "Record"}</dt>
          <dd className="text-body-sm leading-body-sm text-text">{q.data.recordSays}</dd>
        </div>
        <div className="flex gap-4 py-2.5">
          <dt className={`${overlap ? "w-32" : "w-16"} shrink-0 text-body-sm leading-body-sm text-muted`}>{overlap ? overlap.starts.employer : "Story"}</dt>
          <dd className="flex min-w-0 flex-col gap-1 text-body-sm leading-body-sm text-text">
            {q.data.narrativeSays}
            {story?.quotes[0] && <span className="text-muted">“{story.quotes[0]}”</span>}
          </dd>
        </div>
      </dl>
    </ReviewCard>
  );
}

// Context kept for the role: what the story said around a fact, their answers, and what was left out of a line, each
// with the fact it sharpens. X adds their own.
function ContextList({ role, context, facts, adding, setAdding, onOpenFact }: { role: Role; context: Context[]; facts: Fact[]; adding: boolean; setAdding: (on: boolean) => void; onOpenFact: (id: string) => void }) {
  const add = useMutation(api.extract.addContext);
  const [all, setAll] = useState(false);
  const [text, setText] = useState("");
  const shown = all ? context : context.slice(0, 6);
  const factText = (id?: string) => facts.find((f) => f.id === id)?.data.text;
  const save = () => {
    if (!text.trim() || !role.roleKey) return;
    void add({ roleKey: role.roleKey, text }).then(
      () => {
        setText("");
        setAdding(false);
        toast({ message: "Added context", icon: "approve" });
      },
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setAdding(false);
    }
  };
  return (
    <section aria-label="Context" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-label leading-label font-medium text-text">
        Context <span className="text-muted tabular-nums">{context.length}</span>
      </h3>
      {context.length > 0 && (
        <ul className="flex flex-col border-t">
          {shown.map((c) => {
            const sharpens = factText(c.data.factId);
            return (
              <li key={c.id} className="flex flex-col gap-1 border-b py-2.5 md:flex-row md:gap-4">
                <span className="w-24 shrink-0 text-body-sm leading-body-sm text-muted">{c.data.from === "your note" ? "Your answer" : c.data.from === "left out of the line" ? "Left out" : c.sources.length ? "Story" : "Your note"}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-sm leading-body-sm text-text">{c.data.text}</span>
                  {sharpens && c.data.factId && (
                    <button type="button" onClick={() => onOpenFact(c.data.factId!)} className="min-h-11 truncate rounded-sm text-left text-body-sm leading-body-sm text-muted hover:text-text hover:underline md:min-h-0">
                      Sharpens: {sharpens}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {context.length === 0 && !adding && <Text size="sm" muted>Nothing kept about this role yet. Context sharpens its facts when they’re rewritten.</Text>}
      {adding ? (
        <div className="flex flex-col gap-2">
          <Textarea autoFocus rows={3} aria-label="Context" placeholder="Something true about this role that its facts don’t say" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} />
          <div className="flex items-center gap-2">
            <Button keys="⌘↵" detail="Keeps this with the role; rewrites of its facts use it." note="Free" onClick={save}>
              Save
            </Button>
            <Button variant="ghost" keys="Esc" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {context.length > 6 ? (
            <button type="button" onClick={() => setAll(!all)} className="tap rounded-sm text-body-sm leading-body-sm text-text underline decoration-border underline-offset-3 hover:decoration-text">
              {all ? "Fewer" : `${context.length - 6} more`}
            </button>
          ) : (
            <span />
          )}
          <Button variant="ghost" icon="add" keys="X" detail="Adds something true about this role in your words; rewrites of its facts use it." note="Free" onClick={() => setAdding(true)}>
            Add context
          </Button>
        </div>
      )}
    </section>
  );
}

// The stories the role and its facts rest on, each with Open in Story and Read again.
function Sources({ role, stories, actions }: { role: Role; stories: Story[]; actions: ReturnType<typeof useRoleActions> }) {
  const title = useStoryTitles();
  const readAgain = useMutation(api.sources.readAgain);
  if (!stories.length) return <Text size="sm" muted>You added this role yourself; no story rests under it.</Text>;
  const read = (id: Id<"narratives">) =>
    void readAgain({ source: { narrativeId: id }, includingRejected: false }).then(
      () => toast({ message: `Reading the ${title(id)} story again`, icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );
  return (
    <section aria-label="Sources" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-label leading-label font-medium text-text">
        Sources <span className="text-muted tabular-nums">{stories.length}</span>
      </h3>
      <ul className="flex flex-col border-t">
        {stories.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 border-b py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href={`/record/story?story=${s.id}`} className="min-w-0 truncate rounded-sm text-body-sm leading-body-sm font-medium text-text hover:underline max-md:py-[13px]">
                {title(s.id)} story · version {s.version}
              </Link>
              <span className="text-body-sm leading-body-sm text-muted">{s.facts ? plural(s.facts, "fact") : "The role itself"}</span>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" icon="tryAgain" detail="Reads this story again against your record as it is now, for what was missed." note={actions.cost.read ?? "Uses your AI budget"} onClick={() => read(s.id)}>
                Read again
              </Button>
            </div>
            {role.sources.some((x) => x.narrativeId === s.id) && s.quotes.map((q) => <SourceQuote key={q} text={q} source={`${title(s.id)} story · version ${s.version}`} />)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// What happened to the role: read from its story, answers that changed its details, approvals undone, edits.
function History({ role, stories }: { role: Role; stories: Story[] }) {
  const title = useStoryTitles();
  const day = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const FIELD: Record<string, string> = { start: "Start", end: "End", title: "Title", employer: "Employer" };
  const dated = [
    ...(role.data.history ?? []).map((h) => ({ at: h.at, text: `${FIELD[h.field] ?? h.field} changed from ${h.from ? monthLabel(h.from) : "nothing"} to ${monthLabel(h.to)}, answering a disagreement` })),
    ...(role.undone ?? []).map((u) => ({ at: u.at, text: "Approval undone" })),
  ].sort((x, y) => y.at - x.at);
  const read = stories.filter((s) => role.sources.some((x) => x.narrativeId === s.id));
  return (
    <section aria-label="History" className="flex flex-col gap-2">
      <h3 className="text-label leading-label font-medium text-text">History</h3>
      <ol className="flex flex-col gap-1.5">
        {dated.map((e, i) => (
          <li key={i} className="flex gap-4 text-body-sm leading-body-sm">
            <span className="w-14 shrink-0 text-muted tabular-nums">{day(e.at)}</span>
            <span className="min-w-0 text-text">{e.text}</span>
          </li>
        ))}
        {role.data.edited && (
          <li className="flex gap-4 text-body-sm leading-body-sm">
            <span className="w-14 shrink-0" />
            <span className="text-text">Details edited by you</span>
          </li>
        )}
        {read.map((s) => (
          <li key={s.id} className="flex gap-4 text-body-sm leading-body-sm">
            <span className="w-14 shrink-0" />
            <span className="text-text">
              Read from the {title(s.id)} story, version {s.version}
            </span>
          </li>
        ))}
        {!read.length && !role.data.edited && !dated.length && <li className="text-body-sm leading-body-sm text-muted">Added by you</li>}
      </ol>
    </section>
  );
}

// A rejected role's decision: the Rejected tag and why (changed in place), and Restore.
function Rejection({ role, actions, small }: { role: Role; actions: ReturnType<typeof useRoleActions>; small: boolean }) {
  const [editing, setEditing] = useState(false);
  const why = role.data.rejectedBecause;
  if (editing)
    return (
      <ReasonField
        decision="Rejected"
        picks={REASONS}
        defaultValue={why ?? ""}
        onDone={({ reason }) => {
          setEditing(false);
          if ((reason ?? "") !== (why ?? "")) actions.reject(role, reason);
        }}
        className="max-w-[560px] md:ml-[54px]"
      />
    );
  return (
    <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">
      <StatusTag tone="neutral">Rejected</StatusTag>
      <span className="text-body-sm leading-body-sm text-text">{why || "No reason given"}</span>
      <Button size="sm" variant="ghost" iconOnly icon="edit" aria-label="Change why" detail="Changes why you rejected it." note="Free · Undo with U" onClick={() => setEditing(true)} />
      <span className="flex-1" />
      {!small && (
        <Button icon="undo" keys="U" detail={EXPLAIN.restore.detail} note={EXPLAIN.restore.note} onClick={() => actions.restore(role)}>
          Restore
        </Button>
      )}
    </div>
  );
}

// What a rejected role rested on, the role kept in its place, and its notes.
function RejectedBody({ role, rows, wide, details }: { role: Role; rows: Row[]; wide: boolean; details: ReactNode }) {
  const title = useStoryTitles();
  const overlaps = (r: Role) => !!r.data.start && !!role.data.start && String(r.data.start) <= String(role.data.end ?? "9999") && String(role.data.start) <= String(r.data.end ?? "9999");
  const kept = rows.filter((r): r is Role => r.kind === "role" && r.id !== role.id && r.status === "approved" && !r.data.break && r.data.employer === role.data.employer && overlaps(r));
  const quotes = role.sources.flatMap((s) => s.quotes.map((q) => ({ q, source: `${title(s.narrativeId)} story · version ${s.version}` })));
  return (
    <div className={`border-t ${wide ? "flex min-h-0" : "flex flex-col"}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-8 px-4 py-6 md:px-6 lg:px-8">
        {quotes.length > 0 && (
          <section aria-label="Built on" data-tour="record.builton" className="flex flex-col gap-2">
            <h3 className="text-label leading-label font-medium text-text">Built on</h3>
            {quotes.map(({ q, source }) => (
              <SourceQuote key={q} text={q} source={source} />
            ))}
          </section>
        )}
        {kept.length > 0 && (
          <section aria-label="Kept instead" className="flex flex-col gap-2">
            <h3 className="text-label leading-label font-medium text-text">Kept instead</h3>
            <ul className="flex flex-col border-t">
              {kept.map((r) => (
                <li key={r.id} className="flex items-center gap-3 border-b py-2.5">
                  <Avatar name={r.data.employer || roleTitle(r)} company size={28} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-sm leading-body-sm font-medium text-text">{roleTitle(r)}</span>
                    <span className="truncate text-body-sm leading-body-sm text-muted">{[yearSpan(r.data.start, r.data.end), r.data.employer].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Link href={`/record/roles?role=${r.id}`} className="tap rounded-sm text-body-sm leading-body-sm text-text underline decoration-border underline-offset-3 hover:decoration-text">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!wide && details}
        <RoleNotes id={role.id} />
      </div>
      {wide && <aside className="w-60 shrink-0 border-l px-6 py-6">{details}</aside>}
    </div>
  );
}

function RoleNotes({ id }: { id: Id<"items"> }) {
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
