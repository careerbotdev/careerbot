"use client";

import type { ReactNode } from "react";
import { ListRow } from "./ListRow";
import type { MenuEntry } from "./Menu";
import { StatusTag } from "./StatusTag";

type RejectedRowProps = {
  title: string;
  line?: ReactNode;
  /** A ScoreBadge for a role; nothing for a fact or a line. */
  lead?: ReactNode;
  /** The decision in words: "Not for me", "Rejected", "Set aside". */
  decision: string;
  /** Why, as it was picked or typed. Rows without one show the decision alone. */
  reason?: string;
  /** Takes the decision back: the item returns to where it came from. Shown on hover or focus. */
  onRestore: () => void;
  /** The key the screen binds to Restore, shown in its tooltip. */
  restoreKeys?: string;
  menu?: MenuEntry[];
  selected?: boolean;
  href?: string;
  onOpen?: () => void;
};

// A row for something turned down: muted, with its decision as a neutral tag and its reason under it, so a list of them
// shows the pattern ("Not for me · Pay below my floor"). Restore replaces the tag on hover.
export function RejectedRow({ title, line, lead, decision, reason, onRestore, restoreKeys, menu, selected, href, onOpen }: RejectedRowProps) {
  return (
    <ListRow
      title={title}
      line={line}
      lead={lead}
      muted
      tag={<StatusTag tone="neutral">{decision}</StatusTag>}
      meta={reason && <span className="block max-w-36 truncate text-text">{reason}</span>}
      actions={[{ label: "Restore", icon: "undo", onSelect: onRestore, keys: restoreKeys, detail: "Brings it back from what you turned down.", note: "Free · Undo by turning it down again" }]}
      menu={menu}
      selected={selected}
      href={href}
      onOpen={onOpen}
    />
  );
}
