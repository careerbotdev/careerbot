"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { FilterOptions } from "@/components/FilterBar";
import type { MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { toast } from "@/components/Toast";
import { useCommands } from "../../shell/ShellContext";
import { useTour } from "../../shell/useTour";
import { RECORD_TOUR } from "../../tours/record";
import { useFactPane } from "../facts/Facts";
import { useRoleActions } from "./actions";
import { RoleForm, type RoleChange } from "./RoleForm";
import { BreakItem } from "../breaks/BreakItem";
import { RoleItem } from "./RoleItem";
import { type Line, RejectedRows, RolesList, Timeline, type View } from "./RolesList";
import { EXPLAIN, newestFirst, type Project, type Question, type Role, type Row, roleTitle } from "./words";

// Roles: the timeline of their roles (newest first, breaks as gaps, linked projects inside their role) or the ones they
// rejected, and the role open beside it (?role= its id or roleKey), with a fact's sources in the third pane (?fact=).
// ?fact= alone opens the role holding the fact; a project's fact opens in Projects. ?add=1 adds a role, ?view=rejected
// shows the rejected ones, ?employer= filters the timeline. J and K move through the list, Esc closes what's open. On a
// phone the list comes first and a role opens full screen with a way back.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog], [role=list]"));

// What waits for review in a role: new facts, rewrites waiting, facts its revised story no longer says, disagreements
// (a question about two jobs that overlap waits on both).
function toReview(rows: Row[], role: Role, questions: Question[]) {
  const facts = rows.filter((r) => r.kind === "fact" && r.roleKey === role.roleKey && !r.projectKey);
  const waiting = facts.filter((f) => f.kind === "fact" && (f.status === "proposed" || (f.status === "approved" && (!!f.data.suggestion?.text || !!f.data.noLongerSaid || !!f.data.sourceDeleted))));
  return waiting.length + questions.filter((q) => q.roleKey === role.roleKey || q.data.overlap?.starts.roleKey === role.roleKey).length;
}

export function Roles() {
  const params = useSearchParams();
  const router = useRouter();
  const size = useScreenSize();
  const small = size === "small";
  const items = useQuery(api.extract.items);
  const questions = useQuery(api.conflicts.list);
  const addRole = useMutation(api.extract.addRole);
  const rows = useMemo(() => items ?? [], [items]);
  const tour = useTour(RECORD_TOUR, !!items && !!questions);
  const actions = useRoleActions(rows);
  const view: View = params.get("view") === "rejected" ? "rejected" : "timeline";
  const employer = params.get("employer");
  const roleParam = params.get("role");
  const factParam = params.get("fact");
  const adding = params.get("add") === "1";

  const go = useCallback(
    (change: Record<string, string | null>, how: "push" | "replace" = "push") => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(change)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      const url = `/record/roles${q.size ? `?${q}` : ""}`;
      if (how === "replace") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, router],
  );

  const roles = rows.filter((r): r is Role => r.kind === "role");
  const timeline = newestFirst(roles.filter((r) => r.status !== "rejected"));
  const rejected = newestFirst(roles.filter((r) => r.status === "rejected" && !r.data.break));
  const shown = employer ? timeline.filter((r) => !r.data.break && r.data.employer === employer) : timeline;
  const lines: Line[] = shown.map((role) => ({
    role,
    facts: rows.filter((r) => r.kind === "fact" && r.roleKey === role.roleKey && !r.projectKey && r.status !== "rejected").length,
    toReview: toReview(rows, role, questions ?? []),
    projects: rows.filter((r): r is Project => r.kind === "project" && r.status !== "rejected" && !!role.roleKey && r.roleKey === role.roleKey),
  }));
  // What J and K move through: the rows as shown, breaks included.
  const entries = view === "rejected" ? rejected : shown;
  // ?role= takes an item id or a roleKey; for a key, the approved role before a new one, before a rejected one.
  const rank = { approved: 0, proposed: 1, rejected: 2 } as Record<string, number>;
  const open = roleParam ? (roles.find((r) => r.id === roleParam) ?? roles.filter((r) => r.roleKey === roleParam).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3))[0]) : undefined;
  const at = entries.findIndex((e) => e.id === open?.id);

  // ?fact= alone: open the role holding it, or the project in Projects.
  useEffect(() => {
    if (!items) return;
    if (factParam && !roleParam) {
      const f = items.find((r) => r.id === factParam && r.kind === "fact");
      if (!f) return;
      if (f.projectKey) {
        const p = items.find((r) => r.kind === "project" && r.projectKey === f.projectKey);
        if (p) router.replace(`/record/projects?project=${p.id}&fact=${f.id}`);
        return;
      }
      const holder = items.find((r) => r.kind === "role" && r.roleKey === f.roleKey && r.status === "approved") ?? items.find((r) => r.kind === "role" && r.roleKey === f.roleKey);
      if (holder) go({ role: holder.id }, "replace");
    }
  }, [items, factParam, roleParam, router, go]);

  const openRole = useCallback((r: Role) => go({ role: r.id, fact: null, add: null }), [go]);
  const close = useCallback(() => go({ role: null, fact: null, add: null }), [go]);
  const move = (by: number) => {
    if (!entries.length) return;
    const next = entries[Math.min(entries.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
    if (next) openRole(next);
  };
  const setView = useCallback((v: View) => go({ view: v === "rejected" ? "rejected" : null }, "replace"), [go]);
  const startAdding = useCallback(() => go({ add: "1", role: null, fact: null }), [go]);
  const closeFact = useCallback(() => go({ fact: null }), [go]);

  const factsOpen = !!open && (!!open.data.break || open.status !== "rejected");
  const factPane = useFactPane(factsOpen ? factParam : null, closeFact);
  const firstFact = rows.find((r) => r.kind === "fact" && !!open && r.roleKey === open.roleKey && !r.projectKey && r.status !== "rejected");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "Escape") {
        if (factParam) closeFact();
        else if (adding || open) close();
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const listMenu = actions.listMenu(startAdding);
  const commands = useMemo(
    (): Command[] => [
      { id: "roles-timeline", group: "Roles", label: "Timeline", icon: "roles", onSelect: () => setView("timeline") },
      { id: "roles-rejected", group: "Roles", label: "Rejected roles", icon: "reject", onSelect: () => setView("rejected") },
      ...listMenu.flatMap((m, i): Command[] => (typeof m === "object" && "label" in m && m.onSelect && !m.disabled ? [{ id: `roles-list-${i}`, group: "Roles", label: m.label, icon: m.icon, detail: m.hint, onSelect: m.onSelect }] : [])),
      ...timeline
        .filter((r) => !r.data.break)
        .map((r): Command => ({ id: `roles-open-${r.id}`, group: "Roles", label: roleTitle(r), detail: r.data.employer, icon: "roles", keywords: [r.data.employer ?? ""], onSelect: () => openRole(r) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, questions, setView, openRole, startAdding],
  );
  useCommands(commands);

  if (!items || !questions) return null;

  const employers = [...new Set(timeline.filter((r) => !r.data.break && r.data.employer).map((r) => r.data.employer!))];
  const filters = [
    {
      id: "employer",
      label: "Employer",
      value: employer ?? undefined,
      onClear: () => go({ employer: null }, "replace"),
      editor: (
        <FilterOptions
          label="Employer"
          multiple={false}
          selected={[employer ?? "all"]}
          onChange={([v]) => go({ employer: v === "all" ? null : v }, "replace")}
          options={[{ value: "all", label: "All employers" }, ...employers.map((e) => ({ value: e, label: e, count: timeline.filter((r) => r.data.employer === e).length }))]}
        />
      ),
    },
  ];
  const menuFor = (r: Role): MenuEntry[] => actions.roleMenu(r, { onGone: close });
  const jobs = timeline.filter((r) => !r.data.break);

  const body =
    view === "rejected" ? (
      <RejectedRows roles={rejected} selected={open?.id ?? null} onOpen={openRole} onRestore={actions.restore} />
    ) : !timeline.length ? (
      <EmptyState
        icon="roles"
        title="No roles yet"
        action={
          <Button detail={EXPLAIN.add.detail} note={EXPLAIN.add.note} onClick={startAdding}>
            Add a role
          </Button>
        }
      >
        Roles come from your stories as they’re read. You can also add one yourself.
      </EmptyState>
    ) : (
      <Timeline lines={lines} selected={open?.id ?? null} onOpen={openRole} menuFor={menuFor} />
    );

  const list = (
    <RolesList view={view} onView={setView} counts={{ roles: jobs.length, rejected: rejected.length }} filters={filters} matches={employer ? { shown: shown.length, total: jobs.length } : undefined} menu={[...listMenu, "separator", tour.menu]}>
      {body}
    </RolesList>
  );

  const back = { label: view === "rejected" ? "Rejected" : "Roles", onBack: close };
  const save = (c: RoleChange) =>
    void addRole({ employer: c.employer, title: c.title, alternateTitles: c.alternateTitles, location: c.location, start: c.start, end: c.end }).then(
      (id) => {
        go({ add: null, role: id, view: null });
        toast({ message: `Added: ${c.title}`, icon: "approve" });
      },
      (e: unknown) => failed(e, "Couldn’t add it."),
    );
  const item = adding ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PaneHeader title={small ? undefined : "New role"} back={small ? back : undefined} />
      <div className="flex max-w-[480px] flex-col gap-2 px-4 pb-6 md:px-6 lg:px-8">
        {small && <h1 className="text-title-lg leading-title-lg font-semibold text-text">New role</h1>}
        <RoleForm onSave={(c) => save(c)} onCancel={close} saveLabel="Add role" />
      </div>
    </div>
  ) : open?.data.break ? (
    <BreakItem
      key={open.id}
      role={open}
      rows={rows}
      small={small}
      large={size === "large"}
      nav={{ at: at + 1, of: entries.length, onMove: move, back }}
      fact={factsOpen ? factParam : null}
      onFact={(id) => go({ fact: id })}
      onRemoved={() => {}}
    />
  ) : open ? (
    <RoleItem
      key={open.id}
      role={open}
      rows={rows}
      questions={questions}
      actions={actions}
      nav={{ at: at + 1, of: entries.length, onMove: move, back }}
      small={small}
      fact={factsOpen ? factParam : null}
      onOpenFact={(id) => go({ fact: id })}
      third={{ open: !!factParam && factsOpen, toggle: () => (factParam ? closeFact() : firstFact && go({ fact: firstFact.id })) }}
      onGone={close}
    />
  ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        list={list}
        item={item}
        empty={
          <EmptyState icon="roles" title="No role open">
            Pick a role from the list, or press J.
          </EmptyState>
        }
        third={factPane}
      />
    </div>
  );
}
