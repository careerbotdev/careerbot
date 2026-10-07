"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "@/components/Toast";
import { KINDS, type Kind, plural, type Skill } from "./words";

// Every decision on skills, tools and certifications, each with its toast and, where it can be taken back, Undo (U).
// Several at once (the bulk bar) say how many; one says its name.

const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t save that.", icon: "failed" });
const undo = (run: () => Promise<unknown>) => ({ label: "Undo", key: "U", run: () => void run().catch(failed) });
const named = (items: Skill[]) => (items.length === 1 ? items[0].name : plural(items.length, KINDS[items[0].kind].lower));

export type SkillForm = { name: string; group: string; kind: Kind; issuer: string; earned: string };

export function useSkillActions() {
  const review = useMutation(api.extract.review);
  const classify = useMutation(api.skills.classify);
  const edit = useMutation(api.skills.edit);
  const mergeIt = useMutation(api.skills.merge);
  const unmerge = useMutation(api.skills.unmerge);
  const keepApart = useMutation(api.skills.keepApart);
  const reopenPair = useMutation(api.skills.reopenPair);
  const show = useMutation(api.resume.setSkillPresentation);
  const back = (items: Skill[]) => () => Promise.all(items.map((i) => review({ id: i.id, status: i.status === "approved" || i.status === "rejected" ? i.status : "proposed", note: i.rejectedBecause ?? undefined })));

  return {
    approve: (items: Skill[]) =>
      void Promise.all(items.map((i) => review({ id: i.id, status: "approved" }))).then(() => toast({ message: `Approved: ${named(items)}`, icon: "approve", action: undo(back(items)) }), failed),
    // The decision and why, together.
    reject: (items: Skill[], reason?: string) =>
      void Promise.all(items.map((i) => review({ id: i.id, status: "rejected", note: reason }))).then(
        () => toast({ message: `Rejected: ${named(items)}`, icon: "reject", action: undo(back(items)) }),
        failed,
      ),
    unapprove: (items: Skill[]) =>
      void Promise.all(items.map((i) => review({ id: i.id, status: "proposed" }))).then(() => toast({ message: `Back in Proposed: ${named(items)}`, icon: "undo", action: undo(back(items)) }), failed),
    reopen: (s: Skill) => void review({ id: s.id, status: "proposed" }).then(() => toast({ message: `Reopened: ${s.name}`, icon: "undo", action: undo(back([s])) }), failed),
    setLeftOut: (items: Skill[], hidden: boolean, was: (s: Skill) => boolean) =>
      void Promise.all(items.map((i) => show({ key: i.id, hidden }))).then(
        () =>
          toast({
            message: `${named(items)} ${hidden ? "left out of resumes" : "shown on resumes"}`,
            icon: hidden ? "setAside" : "approve",
            action: undo(() => Promise.all(items.map((i) => show({ key: i.id, hidden: was(i) })))),
          }),
        failed,
      ),
    regroup: (items: Skill[], group: string) =>
      void classify({ ids: items.map((i) => i.id), group }).then(
        () =>
          toast({
            message: group ? `Moved to ${group}: ${named(items)}` : `Out of its group: ${named(items)}`,
            icon: "done",
            action: undo(() => Promise.all([...new Set(items.map((i) => i.group ?? ""))].map((g) => classify({ ids: items.filter((i) => (i.group ?? "") === g).map((i) => i.id), group: g })))),
          }),
        failed,
      ),
    rekind: (s: Skill, kind: Kind) =>
      void classify({ ids: [s.id], kind }).then(() => toast({ message: `Moved to ${KINDS[kind].many}: ${s.name}`, icon: "done", action: undo(() => classify({ ids: [s.id], kind: s.kind })) }), failed),
    // Saves their wording, approved as given. Resolves true when saved.
    save: (s: Skill, f: SkillForm) =>
      edit({ id: s.id, name: f.name, group: f.group, kind: f.kind, ...(f.kind === "certification" ? { issuer: f.issuer, earned: f.earned } : {}) }).then(
        () => {
          toast({ message: s.status === "approved" ? `Saved: ${f.name.trim()}` : `Approved in your words: ${f.name.trim()}`, icon: "approve" });
          return true;
        },
        (e: unknown) => {
          failed(e);
          return false;
        },
      ),
    // Keep one wording: this one's or the other's. Undo brings back the one merged away.
    merge: (s: Skill, keep: "this" | "other") => {
      const other = s.sameAs!;
      const [kept, goneId] = keep === "this" ? [s.name, other.id] : [other.name, s.id];
      void mergeIt({ id: s.id, keep }).then(() => toast({ message: `Merged into ${kept}`, icon: "approve", action: undo(() => unmerge({ id: goneId })) }), failed);
    },
    keepBoth: (s: Skill, reason?: string) => {
      const other = s.sameAs!;
      void keepApart({ id: s.id, reason }).then(
        () => toast({ message: `Kept both: ${s.name} and ${other.name}`, icon: "done", action: undo(() => reopenPair({ id: s.id, other: other.id })) }),
        failed,
      );
    },
    unmerge: (gone: { id: Id<"items">; name: string }) => void unmerge({ id: gone.id }).then(() => toast({ message: `Unmerged: ${gone.name}`, icon: "undo" }), failed),
    reopenPair: (s: Skill, other: { id: Id<"items">; name: string }) =>
      void reopenPair({ id: s.id, other: other.id }).then(() => toast({ message: `Offered again as the same: ${s.name} and ${other.name}`, icon: "undo" }), failed),
  };
}
