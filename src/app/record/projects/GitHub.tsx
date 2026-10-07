"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Button, buttonLook } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { CostEstimate } from "@/components/CostEstimate";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/icons";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader } from "@/components/Panes";
import { Popover } from "@/components/Popover";
import { Properties, Property, PropertyLink } from "@/components/Properties";
import { Spinner } from "@/components/Spinner";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../../costs";
import { useBar, useCommands } from "../../shell/ShellContext";
import { Body, Head, Section } from "./parts";
import { CHOOSES_REPOS, type Project, SENDS_FILES, when } from "./words";

// The GitHub connection, opened from the row pinned under the Projects list (?github=1): the account and which
// repositories CareerBot can see (chosen on GitHub), then those repositories to pick and read as projects, each with how
// its last read went. Disconnecting asks first; projects already read stay. Not connected: Connect GitHub.

type Repo = FunctionReturnType<typeof api.github.repos>[number];
type Connection = NonNullable<FunctionReturnType<typeof api.github.status>["connected"]>;
type Props = { projects: Project[]; small: boolean; large: boolean; onBack: () => void; onOpenProject: (id: string) => void };

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const repositories = (n: number) => `${n} ${n === 1 ? "repository" : "repositories"}`;
const DISCONNECTS = "Disconnects GitHub from this workspace. Projects already read stay. The app stays installed on GitHub; uninstall it in GitHub’s settings.";
const REFRESHES = "Asks GitHub again which repositories CareerBot can see.";
const CONNECTS = "Opens GitHub to give CareerBot read-only access to all your repositories or the ones you choose.";

export function GitHub(props: Props) {
  const status = useQuery(api.github.status);
  if (status === undefined) return null;
  return status.connected ? <Connected {...props} c={status.connected} /> : <NotConnected {...props} ready={status.ready} />;
}

function Top({ small, onBack, menu }: { small: boolean; onBack: () => void; menu: MenuEntry[] }) {
  const more = <Menu label="More for GitHub" title="GitHub" items={menu} />;
  return small ? <PaneHeader back={{ label: "Projects", onBack }} actions={more} /> : <PaneHeader actions={more} />;
}

function NotConnected({ projects, small, onBack, ready }: Props & { ready: boolean }) {
  const connect = useMutation(api.github.connect);
  const kept = projects.filter((p) => p.status !== "rejected").length;
  const start = useCallback(() => void connect().then((url) => window.location.assign(url), (e: unknown) => failed(e, "Couldn’t start connecting. Try again.")), [connect]);
  const commands = useMemo((): Command[] => (ready ? [{ id: "github-connect", group: "GitHub", label: "Connect GitHub", icon: "link", onSelect: start }] : []), [ready, start]);
  useCommands(commands);
  useBar(small ? { kind: "actions", actions: <ConnectButton ready={ready} onConnect={start} size="lg" /> } : null);
  const menu: MenuEntry[] = [{ label: "Connect GitHub", icon: "link", hint: "Free", detail: CONNECTS, note: "Free", onSelect: start, ...(ready ? {} : { disabled: true, reason: "Not available yet" }) }];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Top small={small} onBack={onBack} menu={menu} />
      <EmptyState icon="link" title="GitHub isn’t connected" action={small ? undefined : <ConnectButton ready={ready} onConnect={start} size="md" />}>
        {`Connect it to read your repositories into projects.${kept ? ` Your ${kept === 1 ? "project stays" : `${kept} projects stay`} in your record.` : ""}`}
      </EmptyState>
    </div>
  );
}

function ConnectButton({ ready, onConnect, size }: { ready: boolean; onConnect: () => void; size: "md" | "lg" }) {
  return (
    <div className={`flex items-center gap-3 ${size === "lg" ? "flex-1" : ""}`}>
      <Button
        variant="primary"
        size={size}
        icon="link"
        className={size === "lg" ? "flex-1" : ""}
        reason={ready ? undefined : "Not available yet"}
        detail={CONNECTS}
        note="Free"
        onClick={onConnect}
      >
        Connect GitHub
      </Button>
      <CostEstimate amount="Free" />
    </div>
  );
}

// Connected: the account and access, Choose repositories and Disconnect, then the repositories. The repositories are
// fetched when the pane opens, again on Refresh list and when they come back to the tab (after choosing on GitHub).
function Connected({ projects, small, large, onBack, onOpenProject, c }: Props & { c: Connection }) {
  const disconnect = useMutation(api.github.disconnect);
  const list = useAction(api.github.repos);
  const [asking, setAsking] = useState(false);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kept = projects.filter((p) => p.status !== "rejected").length;
  const rejected = projects.length - kept;

  const fetchRepos = useCallback(
    () =>
      list().then(
        (r) => {
          setRepos(r);
          setError(null);
        },
        (e: unknown) => setError(e instanceof ConvexError ? String(e.data) : "Couldn’t list your repositories. Try again."),
      ),
    [list],
  );
  const load = useCallback(() => {
    setLoading(true);
    void fetchRepos().finally(() => setLoading(false));
  }, [fetchRepos]);
  useEffect(() => {
    const again = () => void fetchRepos();
    again();
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [fetchRepos]);

  const choose = useCallback(() => window.open(c.settingsUrl, "_blank", "noreferrer"), [c.settingsUrl]);
  const letGo = () => {
    setAsking(false);
    void disconnect().then(() => toast({ message: "GitHub is disconnected. Your projects stay.", icon: "link" }), (e: unknown) => failed(e, "GitHub didn’t let go. Try again."));
  };
  const stays = `Your ${kept === 1 ? "project and its facts stay" : `${kept} projects and their facts stay`} in your record. Read again stops working until you connect GitHub again. To remove CareerBot’s access entirely, uninstall the app in GitHub’s settings.`;

  const menu: MenuEntry[] = [
    { label: "Choose repositories", icon: "openElsewhere", detail: CHOOSES_REPOS, note: "Free", onSelect: choose },
    { label: "Refresh list", icon: "tryAgain", hint: "Free", detail: REFRESHES, note: "Free", onSelect: load },
    "separator",
    { label: "Disconnect…", icon: "close", detail: DISCONNECTS, note: "Free · Asks first · undo by connecting again", onSelect: () => setAsking(true) },
  ];
  const commands = useMemo(
    (): Command[] => [
      { id: "github-choose", group: "GitHub", label: "Choose repositories on GitHub", icon: "openElsewhere", onSelect: choose },
      { id: "github-refresh", group: "GitHub", label: "Refresh the repository list", icon: "tryAgain", onSelect: load },
      { id: "github-disconnect", group: "GitHub", label: "Disconnect GitHub", icon: "close", onSelect: () => setAsking(true) },
    ],
    [choose, load],
  );
  useCommands(commands);
  // On a phone the question takes the bar; the popover under Disconnect asks on larger screens.
  useBar(small && asking ? { kind: "confirm", message: "Disconnect GitHub?", detail: stays, confirmLabel: "Disconnect", onConfirm: letGo, onCancel: () => setAsking(false) } : null);

  const count = repos?.length;
  const sees = count === undefined ? (c.selection === "all" ? "all repositories" : "selected repositories") : c.selection === "all" ? `all ${repositories(count)}` : `${count} selected ${count === 1 ? "repository" : "repositories"}`;
  const lastRead = Math.max(0, ...projects.map((p) => p.data.readAt ?? 0));
  const details = (
    <Properties columns={large ? 1 : 2}>
      <Property label="Account">
        <PropertyLink href={`https://github.com/${c.account}`}>{c.account}</PropertyLink>
      </Property>
      <Property label="Access">{c.selection === "all" ? "All repositories" : "Selected repositories"}</Property>
      <Property label="Projects from GitHub">{rejected ? `${kept} · ${rejected} rejected` : String(kept)}</Property>
      {lastRead > 0 && <Property label="Last read">{when(lastRead)}</Property>}
    </Properties>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <Top small={small} onBack={onBack} menu={menu} />
      <Head name="GitHub" mark="github" line={`Connected as ${c.account} · CareerBot can see ${sees}`}>
        {!small && (
          <div className="flex flex-wrap items-center gap-2 md:pl-[54px]">
            <a href={c.settingsUrl} target="_blank" rel="noreferrer" className={buttonLook("secondary")}>
              <Icons.openElsewhere aria-hidden />
              Choose repositories
            </a>
            <Popover
              title="Disconnect GitHub?"
              showTitle
              open={asking}
              onOpenChange={setAsking}
              width={320}
              trigger={
                <Button variant="ghost" detail={DISCONNECTS} note="Free · Asks first · undo by connecting again">
                  Disconnect
                </Button>
              }
            >
              <Text size="sm" muted>
                {stays}
              </Text>
              <div className="flex gap-2">
                <Button variant="destructive" keys="↵" autoFocus detail={DISCONNECTS} note="Free · Undo by connecting again" onClick={letGo}>
                  Disconnect
                </Button>
                <Button keys="Esc" detail="Leaves GitHub connected." note="Free" onClick={() => setAsking(false)}>
                  Keep
                </Button>
              </div>
            </Popover>
          </div>
        )}
      </Head>
      <Body details={large ? details : undefined}>
        <Repositories repos={repos} error={error} loading={loading} onRefresh={load} projects={projects} small={small} onOpenProject={onOpenProject} />
        {!large && details}
      </Body>
    </div>
  );
}

// The repositories GitHub gives CareerBot, most recently changed first: pick some (or all) and read them as projects.
function Repositories({
  repos,
  error,
  loading,
  onRefresh,
  projects,
  small,
  onOpenProject,
}: {
  repos: Repo[] | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
  projects: Project[];
  small: boolean;
  onOpenProject: (id: string) => void;
}) {
  const read = useMutation(api.projects.read);
  const runs = useQuery(api.projects.runs);
  const costs = useQuery(api.estimates.costs, {});
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const n = picked.size;
  const amount = costs?.repository != null && n ? aboutUsd(costs.repository * n) : null;
  const readPicked = () => {
    if (!n) return;
    const names = [...picked];
    setPicked(new Set());
    void read({ repos: names }).then(
      (queued) => toast({ message: queued ? `Reading ${repositories(queued)}` : "Already reading those", icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start reading."),
    );
  };

  // Enter reads what's picked, from anywhere in the pane but a field, a link or another button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || !n) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, a, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]")) return;
      const button = t?.closest("button");
      if (button && button.getAttribute("role") !== "checkbox") return;
      e.preventDefault();
      readPicked();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const readButton = (size: "md" | "lg") => (
    <Button
      variant="primary"
      size={size}
      icon="tryAgain"
      keys={size === "md" ? "↵" : undefined}
      className={size === "lg" ? "flex-1" : ""}
      reason={n ? undefined : "Pick repositories to read"}
      detail={`Reads each repository you picked into a project with its facts, for you to review. Only new facts are added. ${SENDS_FILES}`}
      note={amount ?? "Uses your AI budget"}
      onClick={readPicked}
    >
      {n ? `Read ${repositories(n)}` : "Read repositories"}
    </Button>
  );
  useBar(
    small && repos?.length
      ? {
          kind: "actions",
          actions: (
            <>
              {readButton("lg")}
              {amount && <CostEstimate amount={amount} />}
            </>
          ),
        }
      : null,
  );

  const refresh = (
    <Button variant="ghost" size="sm" icon="tryAgain" loading={loading} loadingLabel="Refreshing" detail={REFRESHES} note="Free" onClick={onRefresh} className="ml-auto">
      Refresh list
    </Button>
  );
  if (error || !repos || !repos.length)
    return (
      <Section title="Repositories" count={repos?.length || undefined} trail={refresh}>
        <Text size="sm" muted={!error} className={error ? "text-red dark:text-text" : ""}>
          {error ?? (repos ? "No repositories yet. Choose repositories on GitHub." : "Loading repositories…")}
        </Text>
      </Section>
    );

  const toggle = (name: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  const byRepo = new Map(projects.map((p) => [p.data.repo.toLowerCase(), p]));
  return (
    <>
      <Section title="Repositories" count={repos.length} trail={refresh}>
        <ul aria-label="Repositories" className="flex flex-col border-b">
          <li className="flex h-10 shrink-0 items-center gap-3 px-3">
            <Checkbox label="Select all" checked={n === repos.length ? true : n ? "some" : false} onChange={(on) => setPicked(on ? new Set(repos.map((r) => r.fullName)) : new Set())} />
            {n > 0 && <span className="ml-auto text-label leading-label text-muted tabular-nums">{`${n} of ${repos.length} selected`}</span>}
          </li>
          {repos.map((r) => {
            const key = r.fullName.toLowerCase();
            const run = runs?.runs[key];
            const on = picked.has(r.fullName);
            const line = run?.status === "failed" ? run.error : r.description;
            return (
              <li key={r.fullName} className={`flex items-center gap-3 border-t px-3 py-2.5 ${on ? "bg-steel-subtle" : ""}`}>
                <Checkbox label={r.fullName} hideLabel checked={on} onChange={(v) => toggle(r.fullName, v)} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body-md leading-body-md font-medium text-text">{r.name}</span>
                    {r.private && <span className="shrink-0 text-label leading-label text-muted">Private</span>}
                  </span>
                  {line && <span className="line-clamp-1 text-body-sm leading-body-sm text-muted">{line}</span>}
                </div>
                <div className={`flex shrink-0 justify-end text-right text-body-sm leading-body-sm whitespace-nowrap ${small ? "" : "w-[150px]"}`}>
                  <RepoState run={run} project={byRepo.get(key)} onOpen={onOpenProject} />
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      {!small && (
        <div className="flex flex-wrap items-center gap-3">
          {readButton("md")}
          {amount && <CostEstimate amount={amount} />}
          <Text size="sm" muted className="ml-auto">
            Only new facts are added.
          </Text>
        </div>
      )}
    </>
  );
}

// How a repository's last read went: reading now, paused for budget, failed, or its project (in the record, or rejected).
function RepoState({ run, project, onOpen }: { run?: { status: string; error: string | null }; project?: Project; onOpen: (id: string) => void }) {
  if (run?.status === "queued" || run?.status === "running")
    return (
      <span className="flex items-center gap-2 text-muted">
        <Spinner />
        Reading…
      </span>
    );
  if (run?.status === "paused") return <span className="text-caution-text">Waiting for budget</span>;
  if (run?.status === "failed") return <span className="text-red dark:rounded-sm dark:bg-red dark:px-1 dark:text-paper">Couldn’t read</span>;
  if (!project) return null;
  return (
    <button type="button" onClick={() => onOpen(project.id)} className="tap rounded-sm text-muted transition-colors duration-100 hover:text-text">
      {project.status === "rejected" ? <StatusTag tone="neutral">Rejected</StatusTag> : "In your record"}
    </button>
  );
}
