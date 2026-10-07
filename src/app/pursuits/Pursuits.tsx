"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { REMINDER_RULES, remindersOf, type ReminderRule } from "../../../convex/pursuitSteps";
import { BulkBar } from "@/components/BulkBar";
import { Button, buttonLook } from "@/components/Button";
import type { Command } from "@/components/CommandPalette";
import { FilterOptions } from "@/components/FilterBar";
import type { MenuEntry } from "@/components/Menu";
import { PaneHeader, PaneLayout, type ThirdPane, useScreenSize } from "@/components/Panes";
import { toast } from "@/components/Toast";
import { selectEntries, useSelection } from "@/components/useSelection";
import { useBar, useCommands } from "../shell/ShellContext";
import { useTour } from "../shell/useTour";
import { useNow } from "../clock";
import { PURSUITS_TOUR } from "../tours/pursuits";
import { Ask } from "./Ask";
import { ByDirection } from "./ByDirection";
import { Item } from "./Item";
import { roleFilters, toFilters, useRoleForm } from "./filters";
import { Message } from "./People";
import { AgainstFold, Empty, More, OtherFold, PursuitRows, PursuitsList, type RoleGroup, RoleRows, StaleBanner, type Tab } from "./PursuitsList";
import { ResumePane, ResumePaneTag } from "./Resume";
import { type Third, ThirdContext } from "./third";
import { pursuitsHref } from "./url";
import { INTERESTED_ALL, NOT_FOR_ME_ALL } from "./words";
import { aboutUsd } from "../costs";

// Pursuits: roles and the pursuits of them, as a list and the one open beside it (?role=, with ?direction= the
// direction it's shown for; ?pursuit= for a pursuit with no open role), a third pane beside that when the work needs
// it, and, with none open, how the pursuits went by direction. The tab is ?status= (Pursuing when any are under way,
// else All roles); ?company= starts All roles filtered to one company. J and K move through the list, Esc closes what's
// open. On a phone the list comes first and an item opens full screen with a way back.

const PAGE = 25;
// The views the screen had before tabs: their addresses still land on the matching tab.
const VIEWS: Record<string, Tab> = { roles: "all", shortlist: "interested", pursuing: "pursuing", closed: "closed" };
const TABS: Tab[] = ["all", "interested", "pursuing", "closed"];
const TAB_LABELS: Record<Tab, string> = { all: "All roles", interested: "Interested", pursuing: "Pursuing", closed: "Closed" };
const REMINDER_WORDS: Record<ReminderRule, string> = { followUp: "Follow up when it goes quiet", prepare: "Prepare before an interview", stale: "Check on a stalled pursuit" };
const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const busyElsewhere = (e: KeyboardEvent) =>
  !!(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog], [role=list]"));

export function Pursuits() {
  const params = useSearchParams();
  const router = useRouter();
  const small = useScreenSize() === "small";
  const data = useQuery(api.pursuits.list);
  const now = useNow(true);
  // What's open: a role (its posting), or a pursuit with no open role.
  const noRole = params.get("pursuit");
  const role = params.get("role") ?? noRole;
  const company = params.get("company");
  const [picked, setPicked] = useState<Id<"items"> | undefined>();
  const overview = useQuery(api.roles.overview, picked ? { directionId: picked } : {});
  const places = useQuery(api.roles.places) ?? [];
  const { form, setForm, filters, start } = useRoleForm(overview, company);
  const [third, setThird] = useState<{ role: string | null; pane: Third } | null>(null);
  const [byDirection, setByDirection] = useState(false);
  const sel = useSelection();
  const [want, setWant] = useState(PAGE);
  const rate = useMutation(api.roles.rate);
  const rankAgain = useMutation(api.roles.rankAgain);
  const checkAll = useMutation(api.roles.start);
  const setStretch = useMutation(api.roles.setStretch);
  const setRule = useMutation(api.pursuits.setReminderRule);
  const costs = useQuery(api.estimates.costs, {});

  const rows = useMemo(
    () =>
      (data?.pursuits ?? [])
        .map((p) => ({ p, due: remindersOf(p, now, data!.rules)[0] }))
        // Those with a reminder due first, then by last activity.
        .sort((a, b) => Number(!!b.due) - Number(!!a.due)),
    [data, now],
  );
  const underWay = rows.filter(({ p }) => p.status !== "closed");
  const closed = rows.filter(({ p }) => p.status === "closed");
  const asked = params.get("status") ?? VIEWS[params.get("view") ?? ""] ?? (company ? "all" : null);
  const tab: Tab = TABS.find((t) => t === asked) ?? (underWay.length ? "pursuing" : "all");
  const isRoles = tab === "all" || tab === "interested";
  const ready = !!overview?.directions.length && overview.ranked;
  const scope = picked ? { directionId: picked } : {};
  const listFilters = tab === "interested" ? { ...filters, rating: "interested" as const } : filters;
  const roles = usePaginatedQuery(api.roles.list, isRoles && ready ? { ...scope, filters: listFilters } : "skip", { initialNumItems: PAGE });
  const count = useQuery(api.roles.count, tab === "all" && ready ? { ...scope, filters } : "skip");
  const total = useQuery(api.roles.count, ready ? { ...scope, filters: {} } : "skip");

  // Roles with the same title at one company are one row; Interested leaves out those already started.
  const groups = useMemo(() => {
    const out = new Map<string, RoleGroup>();
    for (const r of roles.results) {
      if (tab === "interested" && r.pursuit) continue;
      const key = `${r.company.id}|${r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
      out.set(key, [...(out.get(key) ?? []), r]);
    }
    return [...out.values()];
  }, [roles.results, tab]);
  // A page filtered by place can come back short: keep reading until a page's worth shows.
  useEffect(() => {
    if (roles.status === "CanLoadMore" && groups.length < want) roles.loadMore(PAGE);
  }, [roles, groups.length, want]);

  const shownPursuits = (tab === "pursuing" ? underWay : closed).filter(({ p }) => !picked || p.directionId === picked);
  // What J and K move through: the rows as shown.
  const entries = isRoles ? groups.map((g) => ({ postingId: g[0].id as string, directionId: g[0].direction?.id ?? null })) : shownPursuits.map(({ p }) => ({ postingId: (p.postingId ?? p.id) as string, directionId: p.directionId }));
  const at = entries.findIndex((e) => e.postingId === role);

  const go = useCallback((change: Parameters<typeof pursuitsHref>[1]) => router.push(pursuitsHref(params, change), { scroll: false }), [router, params]);
  const open = useCallback((key: string, directionId: string | null) => {
    setByDirection(false);
    // A pursuit with no open role opens by its own id.
    if (data?.pursuits.some((p) => p.id === key && !p.postingId)) go({ pursuit: key, role: null, direction: null });
    else go({ role: key, pursuit: null, direction: directionId });
  }, [go, data]);
  const close = useCallback(() => go({ role: null, pursuit: null, direction: null }), [go]);
  const move = useCallback(
    (by: number) => {
      if (!entries.length) return;
      const next = entries[Math.min(entries.length - 1, Math.max(0, (at < 0 ? -1 : at) + by))];
      if (next) open(next.postingId, next.directionId);
    },
    [entries, at, open],
  );
  const pane = third && third.role === role ? third.pane : null;
  const openThird = useCallback((t: Third | null) => setThird(t ? { role, pane: t } : null), [role]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || busyElsewhere(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "j" || key === "k") {
        e.preventDefault();
        move(key === "j" ? 1 : -1);
      } else if (key === "Escape") {
        if (pane) setThird(null);
        else if (sel.on) sel.done();
        else if (role) close();
        else if (byDirection) setByDirection(false);
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, pane, sel, role, close, byDirection]);

  const setTab = useCallback((t: Tab) => {
    sel.done();
    router.replace(pursuitsHref(params, { status: t }), { scroll: false });
  }, [router, params, sel]);

  const busy = overview?.pass?.status === "queued" || overview?.pass?.status === "running";
  const apolloBoards = overview?.coverage.filter((c) => c.board?.provider === "apollo").length ?? 0;
  const rankCost = costs?.rankPerRole != null && total ? aboutUsd(costs.rankPerRole * total.count) : null;
  const rank = () => void rankAgain(scope).then(() => toast({ message: "Ranking your roles again", icon: "running" }), (e: unknown) => failed(e, "Couldn’t start."));
  const rankWords = { detail: "Ranks every open role for what your directions say now.", note: rankCost ?? "Uses your AI budget" };
  const showBy = () => {
    if (small) setByDirection(true);
    else close();
  };
  const tour = useTour(PURSUITS_TOUR, !!data && !!overview);
  const menu: MenuEntry[] = [
    { label: "By direction", icon: "directions", detail: "Shows how your pursuits went for each direction, and where roles come from.", note: "Free", onSelect: showBy },
    ...(isRoles ? selectEntries(sel, groups.filter((g) => !g[0].pursuit).map((g) => g[0].id), "roles") : []),
    "separator",
    { label: "Rank again", icon: "tryAgain", hint: rankCost ?? undefined, ...rankWords, onSelect: rank, ...(busy ? { disabled: true, reason: "Ranking now" } : !overview?.directions.length ? { disabled: true, reason: "No directions yet" } : {}) },
    {
      label: "Check roles again",
      icon: "search",
      hint: apolloBoards ? `${apolloBoards} Apollo ${apolloBoards === 1 ? "credit" : "credits"}` : "Free",
      detail: "Reads the job boards of the companies you watch again, for new roles.",
      note: apolloBoards ? `About ${apolloBoards} Apollo ${apolloBoards === 1 ? "credit" : "credits"}` : "Free",
      onSelect: () => void checkAll({}).then(() => toast({ message: "Checking roles again", icon: "running" }), (e: unknown) => failed(e, "Couldn’t start.")),
      ...(busy ? { disabled: true, reason: "Checking now" } : !overview?.coverage.length ? { disabled: true, reason: "No companies watched" } : {}),
    },
    "separator",
    { label: "Count how big a stretch a role is", checked: overview?.stretch ?? true, onSelect: () => void setStretch({ on: !(overview?.stretch ?? true) }).catch((e: unknown) => failed(e, "Couldn’t save that.")) },
    {
      label: "Reminders",
      icon: "reminder",
      items: REMINDER_RULES.map((r) => ({ label: REMINDER_WORDS[r], checked: data?.rules[r] ?? true, onSelect: () => void setRule({ rule: r, on: !(data?.rules[r] ?? true) }).catch((e: unknown) => failed(e, "Couldn’t save that.")) })),
    },
    "separator",
    tour.menu,
  ];

  const commands = useMemo(
    (): Command[] => [
      ...TABS.map((t): Command => ({ id: `pursuits-${t}`, group: "Pursuits", label: TAB_LABELS[t], icon: "pursuits", onSelect: () => setTab(t) })),
      { id: "pursuits-by-direction", group: "Pursuits", label: "By direction", icon: "directions", onSelect: showBy },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setTab, small, close],
  );
  useCommands(commands);

  // Several roles checked: Interested or Not for me for all of them, with Undo.
  const bulk = (value: "interested" | "no") => {
    const chosen = groups.flatMap((g) => g).filter((r) => sel.checked.has(r.id));
    sel.done();
    void Promise.all(chosen.map((r) => rate({ id: r.id, value }))).then(
      () =>
        toast({
          message: `${value === "no" ? "Not for me" : "Interested"}: ${chosen.length} ${chosen.length === 1 ? "role" : "roles"}`,
          icon: value === "no" ? "reject" : "approve",
          action: { label: "Undo", key: "U", run: () => void Promise.all(chosen.map((r) => rate({ id: r.id, value: r.rating }))) },
        }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const none = sel.checked.size ? undefined : "None selected";
  useBar(
    small && sel.on && !role
      ? {
          kind: "bulk",
          count: sel.checked.size,
          onDone: sel.done,
          actions: (
            <>
              <Button size="lg" className="flex-1" {...NOT_FOR_ME_ALL} reason={none} onClick={() => bulk("no")}>
                Not for me
              </Button>
              <Button size="lg" variant="primary" className="flex-1" {...INTERESTED_ALL} reason={none} onClick={() => bulk("interested")}>
                Interested
              </Button>
            </>
          ),
        }
      : null,
  );
  useEffect(() => {
    if (!sel.checked.size) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || busyElsewhere(e)) return;
      const key = e.key.toLowerCase();
      if (key === "i" || key === "r") {
        e.preventDefault();
        bulk(key === "i" ? "interested" : "no");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!data || !overview) return null;

  const filterItems = [
    ...(overview.directions.length
      ? [
          {
            id: "direction",
            label: "Direction",
            value: overview.directions.find((d) => d.id === picked)?.name ?? "All",
            onClear: () => setPicked(undefined),
            editor: (
              <FilterOptions
                label="Direction"
                multiple={false}
                selected={[picked ?? "all"]}
                onChange={([v]) => setPicked(v === "all" ? undefined : (v as Id<"items">))}
                options={[{ value: "all", label: "All directions" }, ...overview.directions.map((d) => ({ value: d.id as string, label: d.name }))]}
              />
            ),
          },
        ]
      : []),
    ...(isRoles && ready ? roleFilters({ form, setForm, start, overview, places, rating: tab === "all" }) : []),
  ];
  const onCheck = isRoles ? (id: string, on: boolean) => sel.check([id], on) : null;

  let body;
  if (!isRoles) {
    body = (
      <PursuitRows
        rows={shownPursuits}
        selected={role}
        onOpen={open}
        empty={tab === "pursuing" ? <Empty title="Nothing under way">Open a role and press Start to begin a pursuit.</Empty> : <Empty title="None closed">Pursuits you close show here.</Empty>}
      />
    );
  } else if (!overview.directions.length) {
    body = (
      <Empty icon="directions" title="No directions yet" action={<Link href="/goals" className={buttonLook()}>Open Goals</Link>}>
        Approve a direction in Goals to rank roles for it.
      </Empty>
    );
  } else if (!overview.ranked) {
    body = (
      <Empty icon="roles" title="No roles ranked yet" action={overview.coverage.some((c) => c.read > 0) && !busy ? <Button {...rankWords} onClick={rank}>Rank roles</Button> : undefined}>
        {picked ? "No roles are ranked for this direction yet." : "Roles are ranked once their companies’ boards are read."}
      </Empty>
    );
  } else if (!groups.length && roles.status === "Exhausted") {
    body = tab === "interested" ? <Empty title="No roles you’re interested in">Mark roles Interested to keep them here until you start them.</Empty> : <Empty title="No roles match">Change or clear the filters.</Empty>;
  } else {
    body = (
      <RoleRows
        groups={groups}
        selected={role}
        onOpen={open}
        checked={sel.checked}
        onCheck={onCheck}
        selecting={sel.on}
        more={<More status={roles.status === "CanLoadMore" && groups.length < want ? "LoadingMore" : roles.status} onMore={() => setWant(want + PAGE)} />}
      >
        {tab === "all" && overview.against.count > 0 && <AgainstFold key={`against:${picked ?? ""}`} scope={scope} count={overview.against} selected={role} onOpen={open} />}
        {tab === "all" && overview.sortedOut.count > 0 && <OtherFold key={`other:${picked ?? ""}`} scope={scope} count={overview.sortedOut} selected={role} onOpen={open} />}
      </RoleRows>
    );
  }
  const directionName = overview.directions.find((d) => d.id === picked)?.name;
  const list = (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PursuitsList
        small={small}
        tab={tab}
        onTab={setTab}
        counts={{ all: total?.count, pursuing: underWay.length, closed: closed.length }}
        filters={filterItems}
        matches={tab === "all" && count && total ? { shown: count.count, total: total.count } : undefined}
        onClearAll={isRoles && JSON.stringify(toFilters(form)) !== JSON.stringify(toFilters(start)) ? () => setForm(start) : undefined}
        menu={menu}
        banner={
          isRoles && overview.stale ? (
            <StaleBanner
              text={directionName ? `Ranked before you changed ${directionName}` : "Ranked before you changed a direction"}
              action={
                <Button size="sm" variant="outline" loading={busy} loadingLabel="Ranking" {...rankWords} onClick={rank}>
                  Rank again
                </Button>
              }
            />
          ) : undefined
        }
      >
        {body}
      </PursuitsList>
      {!small && sel.on && (
        <div className="absolute inset-x-2 bottom-2">
          <BulkBar
            count={sel.checked.size}
            onDone={sel.done}
            actions={[
              { label: "Interested", keys: "I", ...INTERESTED_ALL, onSelect: () => bulk("interested"), primary: true },
              { label: "Not for me", keys: "R", ...NOT_FOR_ME_ALL, onSelect: () => bulk("no") },
            ]}
          />
        </div>
      )}
    </div>
  );

  const back = { label: TAB_LABELS[tab], onBack: close };
  const item = role ? (
    <Item key={role} {...(noRole ? { pursuitId: noRole as Id<"pursuits"> } : { postingId: role as Id<"postings"> })} direction={params.get("direction")} small={small} nav={{ at: at + 1, of: entries.length, onMove: move, back }} />
  ) : small && byDirection ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader back={{ label: TAB_LABELS[tab], onBack: () => setByDirection(false) }} />
      <ByDirection menu={menu} />
    </div>
  ) : undefined;

  const thirdPane: ThirdPane | undefined =
    role && pane
      ? {
          title: pane.kind === "resume" ? "Tailored resume" : pane.kind === "ask" ? "Ask about this role" : `Outreach message to ${pane.name.split(" ")[0]}`,
          actions: pane.kind === "resume" && !noRole ? <ThirdTag postingId={role as Id<"postings">} /> : undefined,
          open: true,
          onOpenChange: (o) => !o && setThird(null),
          children: <ThirdBody postingId={noRole ? null : (role as Id<"postings">)} pursuitId={noRole as Id<"pursuits"> | null} pane={pane} />,
        }
      : undefined;

  return (
    <ThirdContext.Provider value={{ third: pane, open: role ? openThird : null }}>
      <div className="flex h-full min-h-0 flex-col">
        <PaneLayout list={list} item={item} empty={<ByDirection menu={menu} />} third={thirdPane} />
      </div>
    </ThirdContext.Provider>
  );
}

// What the third pane shows for the item open: a role or its pursuit (postingId), or a pursuit with no open role
// (pursuitId), which has Ask and messages but no tailored resume.
function ThirdBody({ postingId, pursuitId, pane }: { postingId: Id<"postings"> | null; pursuitId: Id<"pursuits"> | null; pane: Third }) {
  const role = useQuery(api.roles.get, postingId ? { id: postingId } : "skip");
  const started = useQuery(api.pursuits.forPosting, postingId ? { postingId } : "skip");
  const p = useQuery(api.pursuits.get, pursuitId ? { id: pursuitId } : started ? { id: started.id } : "skip");
  if (postingId && (!role || started === undefined || (started && !p))) return null;
  if (pane.kind === "resume") return role ? <ResumePane postingId={role.id} company={role.company.name} title={role.title} p={p ?? null} /> : null;
  if (!p) return null;
  if (pane.kind === "ask") return <Ask pursuitId={p.id} />;
  return <Message pursuitId={p.id} contactId={pane.contactId} />;
}

function ThirdTag({ postingId }: { postingId: Id<"postings"> }) {
  const started = useQuery(api.pursuits.forPosting, { postingId });
  const p = useQuery(api.pursuits.get, started ? { id: started.id } : "skip");
  return <ResumePaneTag p={p ?? null} />;
}
