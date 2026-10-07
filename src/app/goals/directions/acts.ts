"use client";

import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "@/components/Toast";
import { failed } from "../ui";
import type { Direction, Part } from "./words";

// What can be decided about a direction, each at once with its toast and Undo: approve, reject (with why), restore,
// undo an approval, merge into another, a part approved or taken back, and its link copied.
export function useDirectionActs() {
  const review = useMutation(api.extract.review);
  const merge = useMutation(api.goals.merge);
  const unmerge = useMutation(api.goals.unmerge);
  const approvePart = useMutation(api.directions.approvePart);
  const unapprovePart = useMutation(api.directions.unapprovePart);
  const set = (d: Direction, status: "approved" | "rejected" | "proposed", note?: string) => review({ id: d.id, status, ...(note ? { note } : {}) });
  const back = (d: Direction) => () => void set(d, d.status === "approved" ? "approved" : "proposed").catch((e: unknown) => failed(e));

  return {
    approve: (d: Direction) =>
      set(d, "approved").then(
        () => toast({ message: `Approved ${d.data.name}`, icon: "approve", action: { label: "Undo", key: "U", run: back(d) } }),
        (e: unknown) => failed(e),
      ),
    // Rejected at once, with Undo; a reason given after is saved with it.
    reject: (d: Direction, reason?: string) =>
      set(d, "rejected", reason).then(
        () => toast({ message: `Rejected ${d.data.name}`, icon: "reject", action: { label: "Undo", key: "U", run: back(d) } }),
        (e: unknown) => failed(e),
      ),
    because: (d: Direction, reason: string) => void set(d, "rejected", reason).catch((e: unknown) => failed(e)),
    restore: (d: Direction) =>
      void set(d, "proposed").then(
        () => toast({ message: `Restored ${d.data.name}`, icon: "undo" }),
        (e: unknown) => failed(e),
      ),
    undoApproval: (d: Direction) =>
      set(d, "proposed").then(
        () => toast({ message: `${d.data.name} is back in review`, icon: "undo", action: { label: "Undo", key: "U", run: () => void set(d, "approved").catch((e: unknown) => failed(e)) } }),
        (e: unknown) => failed(e),
      ),
    merge: (d: Direction, into: { id: Id<"items">; name: string }) =>
      merge({ id: d.id, into: into.id }).then(
        () => toast({ message: `Merged ${d.data.name} into ${into.name}`, icon: "approve", action: { label: "Undo", key: "U", run: () => void unmerge({ id: d.id }).catch((e: unknown) => failed(e)) } }),
        (e: unknown) => failed(e),
      ),
    approvePart: (d: Direction, part: Part) =>
      void approvePart({ id: d.id, part }).then(
        () => toast({ message: `Approved the ${part === "detail" ? "positioning" : "criteria"} of ${d.data.name}`, icon: "approve", action: { label: "Undo", key: "U", run: () => void unapprovePart({ id: d.id, part }).catch((e: unknown) => failed(e)) } }),
        (e: unknown) => failed(e),
      ),
    unapprovePart: (d: Direction, part: Part) =>
      void unapprovePart({ id: d.id, part }).then(
        () => toast({ message: `The ${part === "detail" ? "positioning" : "criteria"} of ${d.data.name} is back in review`, icon: "undo", action: { label: "Undo", key: "U", run: () => void approvePart({ id: d.id, part }).catch((e: unknown) => failed(e)) } }),
        (e: unknown) => failed(e),
      ),
    copyLink: (d: Direction) =>
      void navigator.clipboard.writeText(`${window.location.origin}/goals/directions?direction=${d.id}`).then(
        () => toast({ message: "Copied the link", icon: "link" }),
        () => toast({ message: "Couldn’t copy.", icon: "failed" }),
      ),
  };
}
