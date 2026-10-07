"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { MenuEntry } from "@/components/Menu";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../../costs";
import { useConfirm } from "../../shell/ShellContext";
import { ADD_BREAK } from "../breaks/words";
import { openAddFact } from "../facts/Facts";
import { EXPLAIN, plural, type Project, type Role, type Row, roleName, roleTitle } from "./words";

// What can be done to a role, shared by the item's ⋯, a row's right-click menu and ⌘K. Reversible changes happen at
// once with Undo; only deleting asks first.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const busy = (s?: string | null) => s === "queued" || s === "running";
// What the checks that appear in both menus look for.
const FIND_DUPLICATES = "Looks for facts that say the same thing twice, for you to merge or keep both.";
const FIND_SAME_WORK = "Looks for project facts that describe the same work as a role’s, for you to connect or keep separate.";

export function useRoleActions(rows: Row[]) {
  const router = useRouter();
  const ask = useConfirm();
  const costs = useQuery(api.estimates.costs, {});
  const duplicatesLast = useQuery(api.duplicates.last);
  const checkLast = useQuery(api.conflicts.lastCheck);
  const sameWorkLast = useQuery(api.sameWork.last);
  const narratives = useQuery(api.narratives.list);
  const review = useMutation(api.extract.review);
  const removeRole = useMutation(api.extract.removeRole);
  const readAgain = useMutation(api.sources.readAgain);
  const startDuplicates = useMutation(api.duplicates.start);
  const startCheck = useMutation(api.conflicts.start);
  const startSameWork = useMutation(api.sameWork.start);
  const link = useMutation(api.projects.link);

  const roles = rows.filter((r): r is Role => r.kind === "role");
  const projects = rows.filter((r): r is Project => r.kind === "project");
  const linked = (roleKey?: string) => projects.filter((p) => p.status === "approved" && p.roleKey && (roleKey === undefined || p.roleKey === roleKey));
  const storyOf = (role: Role) => {
    const id = role.sources[0]?.narrativeId;
    return id ? { id, title: narratives?.find((n) => n.id === id)?.title ?? "story" } : null;
  };

  const approve = (role: Role) =>
    void review({ id: role.id, status: "approved" }).then(
      () => toast({ message: `Approved: ${roleTitle(role)}`, icon: "approve", action: { label: "Undo", key: "U", run: () => void review({ id: role.id, status: "proposed" }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const unapprove = (role: Role) =>
    void review({ id: role.id, status: "proposed" }).then(
      () => toast({ message: `Back to review: ${roleTitle(role)}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void review({ id: role.id, status: "approved" }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const reject = (role: Role, reason?: string) =>
    void review({ id: role.id, status: "rejected", note: reason }).then(
      () => toast({ message: `Rejected: ${roleTitle(role)}`, icon: "reject", action: { label: "Undo", key: "U", run: () => void review({ id: role.id, status: role.status === "rejected" ? "rejected" : "proposed", note: role.data.rejectedBecause ?? undefined }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const restore = (role: Role) =>
    void review({ id: role.id, status: "proposed" }).then(
      () => toast({ message: `Restored: ${roleTitle(role)}`, icon: "undo", action: { label: "Undo", key: "U", run: () => void review({ id: role.id, status: "rejected", note: role.data.rejectedBecause ?? undefined }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );

  const remove = async (role: Role, onGone: () => void) => {
    const facts = rows.filter((r) => r.kind === "fact" && r.roleKey === role.roleKey && !r.projectKey && r.status !== "rejected").length;
    const yes = await ask({
      title: `Delete ${roleName(role)}?`,
      body: `${facts ? `Its ${plural(facts, "fact")}, context and notes go with it` : "Its context and notes go with it"}. Facts you rejected stay, a linked project stays unlinked, and the stories it came from aren’t changed. To keep a fact, move it to another role first.`,
      confirmLabel: "Delete role",
    });
    if (!yes) return;
    await removeRole({ id: role.id }).then(
      () => {
        onGone();
        toast({ message: `Deleted: ${roleTitle(role)}`, icon: "delete" });
      },
      (e: unknown) => failed(e, "Couldn’t delete it."),
    );
  };

  const read = (role: Role) => {
    const story = storyOf(role);
    if (!story) return;
    void readAgain({ source: { narrativeId: story.id }, includingRejected: false }).then(
      () => toast({ message: `Reading the ${story.title} story again`, icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );
  };
  const findDuplicates = () =>
    void startDuplicates({}).then(
      (id) => toast({ message: id ? "Looking for duplicate facts" : "Already looking for duplicates", icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );
  const checkDisagreements = () =>
    void startCheck({}).then(
      () => toast({ message: "Checking your stories against your record", icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );
  const findSameWork = (roleKey?: string) => {
    const these = linked(roleKey);
    void Promise.all(these.map((p) => startSameWork({ id: p.id }))).then(
      () => toast({ message: `Looking for same work in ${plural(these.length, "project")}`, icon: "running" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );
  };
  const linkProject = (p: Project, role: Role) => {
    const was = p.roleKey ?? null;
    void link({ id: p.id, roleKey: role.roleKey ?? null }).then(
      () => toast({ message: `Linked ${p.data.name} to ${roleTitle(role)}`, icon: "link", action: { label: "Undo", key: "U", run: () => void link({ id: p.id, roleKey: was }) } }),
      (e: unknown) => failed(e, "Couldn’t link it."),
    );
  };

  // The gap before a role: from where the role before it (in time) ended to where this one starts.
  const breakBefore = (role: Role) => {
    const older = roles
      .filter((r) => r.status !== "rejected" && !r.data.break && r.id !== role.id && r.data.end && role.data.start && String(r.data.end) <= String(role.data.start))
      .sort((a, b) => String(b.data.end).localeCompare(String(a.data.end)))[0];
    const q = new URLSearchParams({ add: "1", ...(older?.data.end ? { start: older.data.end } : {}), ...(role.data.start ? { end: role.data.start } : {}) });
    router.push(`/record/breaks?${q}`);
  };

  const cost = {
    duplicates: aboutUsd(costs?.duplicates) ?? undefined,
    disagreements: aboutUsd(costs?.disagreements) ?? undefined,
    read: aboutUsd(costs?.read) ?? undefined,
    sameWork: (n: number) => (costs?.sameWork != null && n ? (aboutUsd(costs.sameWork * n) ?? undefined) : undefined),
  };
  const running = {
    duplicates: busy(duplicatesLast?.status),
    disagreements: busy(checkLast?.status),
    sameWork: linked().some((p) => busy(sameWorkLast?.[p.projectKey ?? ""]?.status)),
  };

  // What a check costs: its estimate, or the budget when there's none.
  const spend = (usd?: string) => usd ?? "Uses your AI budget";

  // The list's ⋯: add, and the checks across the whole record.
  const listMenu = (addRole: () => void): MenuEntry[] => [
    { label: "Add a role", icon: "add", onSelect: addRole, ...EXPLAIN.add },
    { label: "Add a break", icon: "breaks", onSelect: () => router.push("/record/breaks?add=1"), ...ADD_BREAK },
    "separator",
    {
      label: "Find duplicates",
      icon: "approveAll",
      hint: cost.duplicates,
      detail: FIND_DUPLICATES,
      note: spend(cost.duplicates),
      onSelect: findDuplicates,
      ...(running.duplicates ? { disabled: true, reason: "Looking now" } : {}),
    },
    {
      label: "Check for disagreements",
      icon: "help",
      hint: cost.disagreements,
      detail: "Compares your stories with your record and asks you about each place they differ.",
      note: spend(cost.disagreements),
      onSelect: checkDisagreements,
      ...(running.disagreements ? { disabled: true, reason: "Checking now" } : {}),
    },
    {
      label: "Find same work",
      icon: "projects",
      hint: cost.sameWork(linked().length),
      detail: FIND_SAME_WORK,
      note: spend(cost.sameWork(linked().length)),
      onSelect: () => findSameWork(),
      ...(running.sameWork ? { disabled: true, reason: "Looking now" } : !linked().length ? { disabled: true, reason: "No linked projects" } : {}),
    },
  ];

  // A role's ⋯ (and right-click): `item` adds what only the open item can do (edit in place, add context).
  const roleMenu = (role: Role, opts: { item?: { edit: () => void; addContext: () => void }; onGone: () => void }): MenuEntry[] => {
    const story = storyOf(role);
    const inRecord = role.status !== "rejected";
    const approved = role.status === "approved";
    const mine = linked(role.roleKey);
    const toLink = projects.filter((p) => p.status === "approved" && p.roleKey !== role.roleKey);
    return [
      ...(opts.item && inRecord
        ? [
            { label: "Edit details", icon: "edit" as const, onSelect: opts.item.edit, ...EXPLAIN.edit },
            { label: "Add a fact", icon: "add" as const, keys: "F", onSelect: openAddFact, detail: "Adds a fact to this role in your words, approved as you write it.", note: "Free" },
            { label: "Add context", icon: "add" as const, keys: "X", onSelect: opts.item.addContext, detail: "Adds your own context to this role, to sharpen its facts.", note: "Free" },
          ]
        : []),
      ...(inRecord
        ? [
            { label: "Add a break before this role", icon: "breaks" as const, onSelect: () => breakBefore(role), detail: "Starts a break with the months between this role and the one before.", note: "Free" },
            "separator" as const,
          ]
        : []),
      ...(inRecord
        ? [
            {
              label: "Find duplicates",
              icon: "approveAll" as const,
              hint: cost.duplicates,
              detail: FIND_DUPLICATES,
              note: spend(cost.duplicates),
              onSelect: findDuplicates,
              ...(running.duplicates ? { disabled: true, reason: "Looking now" } : {}),
            },
            {
              label: "Read the story again",
              icon: "tryAgain" as const,
              hint: cost.read,
              detail: "Reads the story this role came from again, for anything new.",
              note: spend(cost.read),
              onSelect: () => read(role),
              ...(!story ? { disabled: true, reason: "You added it yourself" } : {}),
            },
            ...(mine.length
              ? [
                  {
                    label: "Find same work",
                    icon: "projects" as const,
                    hint: cost.sameWork(mine.length),
                    detail: FIND_SAME_WORK,
                    note: spend(cost.sameWork(mine.length)),
                    onSelect: () => findSameWork(role.roleKey),
                    ...(running.sameWork ? { disabled: true, reason: "Looking now" } : {}),
                  },
                ]
              : []),
            {
              label: "Link a project",
              icon: "link" as const,
              ...(!approved || role.data.break
                ? { disabled: true, reason: "Approve it first" }
                : toLink.length
                  ? {
                      items: toLink.map(
                        (p): MenuEntry => ({ label: p.data.name, hint: p.roleKey ? "Linked elsewhere" : undefined, detail: "Links the project to this role.", note: "Free · Undo with U", onSelect: () => linkProject(p, role) }),
                      ),
                    }
                  : { disabled: true, reason: "No projects to link" }),
            },
            "separator" as const,
          ]
        : []),
      ...(story ? [{ label: `Open the ${story.title} story`, icon: "story" as const, detail: "Opens the story this role was read from.", note: "Free", onSelect: () => router.push(`/record/story?story=${story.id}`) }] : []),
      {
        label: "Copy link",
        icon: "link",
        detail: "Copies a link to this role.",
        note: "Free",
        onSelect: () => void navigator.clipboard.writeText(`${window.location.origin}/record/roles?role=${role.id}`).then(() => toast({ message: "Copied the link", icon: "link" })),
      },
      ...(approved
        ? ["separator" as const, { label: "Undo approval", icon: "undo" as const, detail: "Takes the role back to review; resumes stop using it.", note: "Free · Undo with U", onSelect: () => unapprove(role) }]
        : []),
      "separator",
      { label: "Delete role…", icon: "delete", tone: "danger", detail: "Deletes the role with its facts, context and notes.", note: "Free · Asks first · can’t be undone", onSelect: () => void remove(role, opts.onGone) },
    ];
  };

  return { approve, unapprove, reject, restore, remove, read, findDuplicates, checkDisagreements, findSameWork, breakBefore, storyOf, listMenu, roleMenu, cost, running, linked };
}
