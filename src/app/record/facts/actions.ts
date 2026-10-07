"use client";

import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { MenuEntry } from "@/components/Menu";
import { toast } from "@/components/Toast";
import { act, connectedOf, type Fact, failed, FREE_UNDO, type RecordData, roleName, short } from "./shared";

// What can be done to one fact, each at once with its toast and Undo (only a rewrite, which spends, has none).
export type FactActions = {
  approve: () => void;
  undoApproval: () => void;
  reject: (reason?: string) => void;
  restore: () => void;
  keep: () => void;
  edit: (text: string) => void;
  rework: (note: string) => void;
  move: (roleKey: string) => void;
  disconnect: () => void;
};

export function useFactActions(r: RecordData | undefined, f: Fact | undefined): FactActions {
  const review = useMutation(api.extract.review);
  const edit = useMutation(api.extract.edit);
  const rework = useMutation(api.extract.rework);
  const revert = useMutation(api.extract.revertWording);
  const move = useMutation(api.extract.moveFact);
  const keepOrphan = useMutation(api.extract.keepOrphan);
  const flagOrphan = useMutation(api.extract.flagOrphan);
  const disconnect = useMutation(api.sameWork.disconnect);
  const reopen = useMutation(api.sameWork.reopen);
  const connect = useMutation(api.sameWork.connect);
  if (!f || !r) {
    const none = () => {};
    return { approve: none, undoApproval: none, reject: none, restore: none, keep: none, edit: none, rework: none, move: none, disconnect: none };
  }
  const id = f.id;
  const was = f.status === "approved" ? "approved" : "proposed";
  const words = short(f.data.text);
  return {
    approve: () => act(review({ id, status: "approved" }), `Approved: ${words}`, "approve", () => review({ id, status: "proposed" })),
    undoApproval: () => act(review({ id, status: "proposed" }), `Back to review: ${words}`, "undo", () => review({ id, status: "approved" })),
    reject: (reason) => act(review({ id, status: "rejected", note: reason }), `Rejected: ${words}`, "reject", () => review({ id, status: was })),
    restore: () => act(review({ id, status: "proposed" }), `Restored: ${words}`, "undo", () => review({ id, status: "rejected", note: f.data.rejectedBecause ?? undefined })),
    keep: () =>
      act(keepOrphan({ id }), `Kept: ${words}`, "approve", () => flagOrphan({ id, noLongerSaid: f.data.noLongerSaid ?? null, sourceDeleted: f.data.sourceDeleted ?? null })),
    edit: (text) => act(edit({ id, text }), `Approved in your words: ${short(text)}`, "approve", () => revert({ id })),
    rework: (note) => void rework({ id, note }).then(() => toast({ message: `Writing a rewrite: ${words}`, icon: "running" }), failed),
    move: (roleKey) => {
      const to = r.roles.find((x) => x.roleKey === roleKey);
      const from = f.roleKey;
      act(move({ id, roleKey }), `Moved to ${to ? roleName(to) : "another role"}`, "roles", from ? () => move({ id, roleKey: from }) : undefined);
    },
    disconnect: () => {
      const c = connectedOf(r).get(id);
      if (!c) return;
      const [project, role] = f.projectKey ? [f, c.other] : [c.other, f];
      const lead = c.lead as Fact["id"];
      act(disconnect({ id }), `Not the same work: ${words}`, "link", () => reopen({ id: project.id, other: role.id, lead }).then(() => connect({ id: project.id })));
    },
  };
}

// What opens in place for a fact: its words to edit, a note to rewrite it with, or why it's rejected.
export type FactFields = { edit: () => void; context: () => void; reject: () => void; open?: () => void };

// The fact's ⋯ menu (and its right-click menu): Edit, Add context or rewrite, Move to role, Approve or Undo approval,
// Reject or Restore, and Keep it or Not the same work when those apply.
export function factMenu(r: RecordData, f: Fact, a: FactActions, fields: FactFields, cost: string): MenuEntry[] {
  const rejected = f.status === "rejected";
  const roles = f.projectKey ? [] : r.roles.filter((x) => x.roleKey && x.roleKey !== f.roleKey && x.status !== "rejected");
  const orphan = !rejected && (f.data.noLongerSaid || f.data.sourceDeleted);
  const connected = connectedOf(r).get(f.id);
  const suggestion = !!f.data.suggestion;
  return [
    ...(fields.open ? [{ label: "Sources and history", icon: "thirdPane" as const, onSelect: fields.open, ...EXPLAIN.sources }] : []),
    { label: "Edit", icon: "edit", keys: "E", onSelect: fields.edit, ...EXPLAIN.edit },
    {
      label: "Add context or rewrite",
      icon: "builtOn",
      hint: cost,
      detail: EXPLAIN.rewrite.detail,
      note: cost,
      onSelect: fields.context,
      ...(suggestion ? { disabled: true, reason: f.data.suggestion?.pending ? "A rewrite is being written" : "A rewrite is waiting" } : {}),
    },
    ...(roles.length
      ? [{ label: "Move to role", icon: "roles" as const, items: roles.map((x) => ({ label: roleName(x), onSelect: () => a.move(x.roleKey!) })) }]
      : []),
    ...(orphan ? [{ label: "Keep it", icon: "approve" as const, hint: "Free", detail: "Keeps the fact as it reads.", note: FREE_UNDO, onSelect: a.keep }] : []),
    ...(connected
      ? [{ label: `Not the same work as ${connected.where}`, icon: "link" as const, hint: "Free", detail: "Resumes write the two facts as separate lines again.", note: FREE_UNDO, onSelect: a.disconnect }]
      : []),
    ...(f.status === "approved" ? [{ label: "Undo approval", icon: "undo" as const, detail: "Takes it back to review. Resumes stop using it.", note: FREE_UNDO, onSelect: a.undoApproval }] : []),
    ...(f.status === "proposed" ? [{ label: "Approve", icon: "approve" as const, detail: "Adds it to your record, where resumes, letters and ranking can use it.", note: FREE_UNDO, onSelect: a.approve }] : []),
    "separator",
    rejected
      ? { label: "Restore", icon: "undo", detail: "Puts it back in your record to review.", note: FREE_UNDO, onSelect: a.restore }
      : { label: "Reject", icon: "reject", keys: "R", detail: "Takes it out of your record. Resumes stop using it.", note: FREE_UNDO, onSelect: fields.reject },
  ];
}

export const EXPLAIN = {
  edit: { detail: "Your wording, approved as you write it.", note: FREE_UNDO },
  sources: { detail: "Opens where the fact came from and how its wording changed.", note: "Free" },
  rewrite: { detail: "Writes a new wording from the fact, its sources and your note, for you to approve or reject." },
  context: "Say what it leaves out (“a team of three, and I led it”) or how to say it (“lead with the savings”).",
};
