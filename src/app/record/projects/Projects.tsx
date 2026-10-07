"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { useFactPane } from "@/app/record/facts/Facts";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { type Filter, FilterBar, FilterOptions } from "@/components/FilterBar";
import { Icons } from "@/components/icons";
import { List, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { RejectedRow } from "@/components/RejectedRow";
import { StatusTag } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { RECORD_TOUR } from "../../tours/record";
import { GitHub } from "./GitHub";
import { ProjectItem } from "./ProjectItem";
import { byRecent, CHOOSES_REPOS, commits, EDITS, type Fact, jobsOf, OPENS_REPO, type Project, REJECTS, type Role, span } from "./words";

// Projects: the projects read from their GitHub repositories, as a list (All or Rejected, filtered by role) and the one
// open beside it (?project=, with ?fact= a fact's sources in the third pane), and the GitHub connection opened from the
// row pinned under the list (?github=1). Coming back from connecting on GitHub (?github=connected|failed|requested) says
// how it went and opens the connection. J and K move through the list, Esc closes what's open. On a phone the list comes
// first and an item opens full screen with a way back.

type Tab = "all" | "rejected";
const NO_ROLE = "none";
const OPENS_CONNECTION = "Opens your GitHub connection, to read repositories into projects.";
const RETURNED = {
  connected: { message: "GitHub is connected. Pick repositories to read.", icon: "link" },
  failed: { message: "GitHub didn’t connect. Try again.", icon: "failed" },
  requested: { message: "Your organization’s owner needs to approve CareerBot on GitHub first.", icon: "link" },
} as const;
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]"));

export function Projects() {
  const params = useSearchParams();
  const router = useRouter();
  const size = useScreenSize();
  const small = size === "small";
  const rows = useQuery(api.extract.items);
  const github = useQuery(api.github.status);
  const tour = useTour(RECORD_TOUR, !!rows && !!github);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState<boolean | null>(null);
  const [intent, setIntent] = useState<{ id: string; do: "edit" | "reject" } | null>(null);
  const filtersShown = filtersOpen ?? !small;

  const tab: Tab = params.get("tab") === "rejected" ? "rejected" : "all";
  const asked = params.get("project");
  const factParam = params.get("fact");
  const githubParam = params.get("github");
  const githubOpen = githubParam !== null;

  const go = useCallback(
    (change: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(change)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      router.push(`/record/projects${q ? `?${q}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  // Back from GitHub: say how it went, once, and show the connection.
  const said = useRef(false);
  useEffect(() => {
    if (said.current || !githubParam || !(githubParam in RETURNED)) return;
    said.current = true;
    toast({ ...RETURNED[githubParam as keyof typeof RETURNED] });
    router.replace("/record/projects?github=1", { scroll: false });
  }, [githubParam, router]);

  const all = useMemo(() => (rows ?? []).filter((r): r is Project => r.kind === "project").sort(byRecent), [rows]);
  const facts = useMemo(() => (rows ?? []).filter((r): r is Fact => r.kind === "fact" && !!r.projectKey), [rows]);
  const jobs = useMemo(() => jobsOf(rows ?? []), [rows]);
  const roleOf = useCallback((p: Project) => jobs.find((r) => r.roleKey === p.roleKey), [jobs]);

  // ?project= is the project's id or key; a ?fact= alone opens the project holding it.
  const byFact = factParam && !asked ? facts.find((f) => f.id === factParam)?.projectKey : undefined;
  const open = all.find((p) => p.id === asked || p.projectKey === asked || (byFact && p.projectKey === byFact)) ?? null;
  const live = all.filter((p) => p.status !== "rejected");
  const rejected = all.filter((p) => p.status === "rejected");
  const shown = tab === "rejected" ? rejected.filter((p) => !reasonFilter || (p.data.rejectedBecause ?? "") === reasonFilter) : live.filter((p) => !roleFilter || (roleFilter === NO_ROLE ? !roleOf(p) : p.roleKey === roleFilter));
  const at = open ? shown.findIndex((p) => p.id === open.id) : -1;

  const openProject = useCallback((id: string) => go({ project: id, fact: null, github: null }), [go]);
  const close = useCallback(() => go({ project: null, fact: null, github: null }), [go]);
  const openGitHub = useCallback(() => go({ project: null, fact: null, github: "1" }), [go]);
  const move = (by: number) => {
    if (!shown.length) return;
    const next = shown[Math.min(shown.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
    if (next) openProject(next.id);
  };
  const setTab = useCallback((t: Tab) => go({ tab: t === "all" ? null : t }), [go]);
  const closeFact = useCallback(() => go({ fact: null }), [go]);
  const third = useFactPane(open ? factParam : null, closeFact);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "Escape") {
        if (factParam) closeFact();
        else if (open || githubOpen) close();
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const commands = useMemo(
    (): Command[] => [
      { id: "projects-all", group: "Projects", label: "All projects", icon: "projects", onSelect: () => setTab("all") },
      { id: "projects-rejected", group: "Projects", label: "Rejected projects", icon: "reject", onSelect: () => setTab("rejected") },
      { id: "projects-github", group: "Projects", label: "GitHub connection", detail: "Read repositories into projects", icon: "link", keywords: ["repositories", "connect"], onSelect: openGitHub },
      ...all.map((p): Command => ({ id: `project-${p.id}`, group: "Projects", label: p.data.name, detail: p.data.repo, icon: "projects", onSelect: () => openProject(p.id) })),
    ],
    [all, setTab, openGitHub, openProject],
  );
  useCommands(commands);

  if (!rows || !github) return null;

  const rowMenu = (p: Project): MenuEntry[] =>
    p.status === "rejected"
      ? [{ label: "Open on GitHub", icon: "openElsewhere", detail: OPENS_REPO, note: "Free", onSelect: () => window.open(p.data.url, "_blank", "noreferrer") }]
      : [
          { label: "Edit", icon: "edit", detail: EDITS, note: "Free", onSelect: () => (setIntent({ id: p.id, do: "edit" }), openProject(p.id)) },
          { label: "Open on GitHub", icon: "openElsewhere", detail: OPENS_REPO, note: "Free", onSelect: () => window.open(p.data.url, "_blank", "noreferrer") },
          "separator",
          { label: "Reject", icon: "reject", detail: REJECTS, note: "Free · Undo with U", onSelect: () => (setIntent({ id: p.id, do: "reject" }), openProject(p.id)) },
        ];
  const restore = (p: Project) => (setIntent(null), openProject(p.id));

  const roleFilters: Filter[] =
    tab === "all"
      ? [
          {
            id: "role",
            label: "Role",
            value: roleFilter === null ? "All" : roleFilter === NO_ROLE ? "Independent" : (jobs.find((r) => r.roleKey === roleFilter)?.data.title ?? "All"),
            onClear: () => setRoleFilter(null),
            editor: (
              <FilterOptions
                label="Role"
                multiple={false}
                selected={[roleFilter ?? "all"]}
                onChange={([v]) => setRoleFilter(v === "all" ? null : v)}
                options={[
                  { value: "all", label: "All roles", count: live.length },
                  ...jobs.filter((r) => live.some((p) => p.roleKey === r.roleKey)).map((r) => ({ value: r.roleKey!, label: `${r.data.title} · ${r.data.employer ?? ""}`, count: live.filter((p) => p.roleKey === r.roleKey).length })),
                  { value: NO_ROLE, label: "Independent", count: live.filter((p) => !roleOf(p)).length },
                ]}
              />
            ),
          },
        ]
      : [
          {
            id: "reason",
            label: "Reason",
            value: reasonFilter ?? "Any",
            onClear: () => setReasonFilter(null),
            editor: (
              <FilterOptions
                label="Reason"
                multiple={false}
                selected={[reasonFilter ?? "any"]}
                onChange={([v]) => setReasonFilter(v === "any" ? null : v)}
                options={[{ value: "any", label: "Any reason" }, ...[...new Set(rejected.map((p) => p.data.rejectedBecause ?? "").filter(Boolean))].map((r) => ({ value: r, label: r }))]}
              />
            ),
          },
        ];
  const total = tab === "all" ? live.length : rejected.length;
  const listMenu: MenuEntry[] = [
    { label: "GitHub", icon: "link", detail: OPENS_CONNECTION, note: "Free", onSelect: openGitHub },
    ...(github.connected ? [{ label: "Choose repositories", icon: "openElsewhere" as const, detail: CHOOSES_REPOS, note: "Free", onSelect: () => window.open(github.connected!.settingsUrl, "_blank", "noreferrer") }] : []),
    "separator",
    tour.menu,
  ];

  const line = (p: Project, role: Role | undefined) => {
    const when = span(p.data.start, p.data.end, { short: true });
    const who = role ? role.data.employer || role.data.title : size === "medium" ? null : "Independent";
    return [when, who].filter(Boolean).join(" · ");
  };

  const body = !shown.length ? (
    tab === "rejected" ? (
      <EmptyState icon="reject" title="Nothing rejected">
        Projects you reject show here with why.
      </EmptyState>
    ) : live.length ? (
      <EmptyState icon="projects" title="No projects match">
        Change or clear the filters.
      </EmptyState>
    ) : (
      <EmptyState icon="projects" title="No projects yet" action={small ? <Button detail={OPENS_CONNECTION} note="Free" onClick={openGitHub}>Open GitHub</Button> : undefined}>
        Read your GitHub repositories to add them as projects.
      </EmptyState>
    )
  ) : (
    <List label="Projects" tour="record.list" className="p-2">
      {shown.map((p) => {
        const role = roleOf(p);
        const waiting = p.status === "proposed" ? 1 : 0;
        return p.status === "rejected" ? (
          <RejectedRow
            key={p.id}
            title={p.data.name}
            line={line(p, role)}
            lead={<Avatar name={p.data.name} company size={28} />}
            decision="Rejected"
            reason={p.data.rejectedBecause ?? undefined}
            onRestore={() => restore(p)}
            menu={rowMenu(p)}
            selected={open?.id === p.id}
            onOpen={() => openProject(p.id)}
          />
        ) : (
          <ListRow
            key={p.id}
            title={p.data.name}
            line={line(p, role)}
            lead={<Avatar name={p.data.name} company size={28} />}
            tag={waiting ? <StatusTag tone="info">To review</StatusTag> : undefined}
            meta={commits(p.data.commits)}
            menu={rowMenu(p)}
            selected={open?.id === p.id}
            onOpen={() => openProject(p.id)}
          />
        );
      })}
    </List>
  );

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Projects"
        actions={
          <>
            <Button variant="ghost" iconOnly icon="filter" aria-label={filtersShown ? "Hide filters" : "Show filters"} aria-pressed={filtersShown} detail="Shows or hides the filters." note="Free" onClick={() => setFiltersOpen(!filtersShown)} />
            <Menu label="More for Projects" items={listMenu} trigger={<Button variant="ghost" iconOnly icon="more" aria-label="More for Projects" className="data-[state=open]:bg-border data-[state=open]:text-text" data-tour="record.more" />} />
          </>
        }
      />
      <div data-tour="record.tabs">
      <Tabs
        label="Projects by status"
        className="px-4"
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        tabs={[
          { value: "all", label: "All", count: live.length },
          { value: "rejected", label: "Rejected", count: rejected.length },
        ]}
      />
      </div>
      {filtersShown && total > 0 && <FilterBar filters={roleFilters} matches={{ shown: shown.length, total }} onClearAll={roleFilter || reasonFilter ? () => (setRoleFilter(null), setReasonFilter(null)) : undefined} />}
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      <GitHubRow account={github.connected?.account ?? null} read={all.length} selected={githubOpen && !open} onOpen={openGitHub} />
    </div>
  );

  const nav = { at: at + 1, of: shown.length, onMove: move, back: { label: "Projects", onBack: close } };
  const item = open ? (
    <ProjectItem
      key={open.id}
      project={open}
      rows={facts}
      jobs={jobs}
      nav={nav}
      small={small}
      large={size === "large"}
      intent={intent?.id === open.id ? intent.do : null}
      fact={factParam}
      onFact={(id) => go({ fact: id })}
    />
  ) : githubOpen ? (
    <GitHub projects={all} small={small} large={size === "large"} onBack={close} onOpenProject={openProject} />
  ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        list={list}
        item={item}
        third={open ? third : undefined}
        empty={
          <EmptyState icon="projects" title={all.length ? "No project open" : "No projects yet"} action={all.length ? undefined : <Button detail={OPENS_CONNECTION} note="Free" onClick={openGitHub}>Open GitHub</Button>}>
            {all.length ? "Pick one from the list, or press J." : "Read your GitHub repositories to add them as projects."}
          </EmptyState>
        }
      />
    </div>
  );
}

// The GitHub row pinned under the list: the account and how many repositories have been read, or Not connected.
function GitHubRow({ account, read, selected, onOpen }: { account: string | null; read: number; selected: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onOpen}
      className={`flex h-[52px] shrink-0 items-center gap-3 border-t px-5 text-left transition-colors duration-100 hover:bg-subtle ${selected ? "bg-subtle" : ""}`}
    >
      <Icons.link aria-hidden size={16} className="shrink-0 text-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-sm leading-body-sm font-medium text-text">GitHub</span>
        <span className="truncate text-label leading-label text-muted">{account ? `${account} · ${read} ${read === 1 ? "repository" : "repositories"} read` : "Not connected"}</span>
      </span>
      <Icons.goIn aria-hidden size={16} className="shrink-0 text-muted" />
    </button>
  );
}
