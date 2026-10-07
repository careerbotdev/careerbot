"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/icons";
import { List, ListGroup, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { PaneHeader } from "@/components/Panes";
import { RejectedRow } from "@/components/RejectedRow";
import { Switch } from "@/components/Switch";
import { limitSummary } from "../limitWords";
import { ADD_LIMIT_WORDS, allWords, effectShort, type Effects, kindName, type Limit, rowScope } from "./words";

// The list of limits: Firm, Preference, Proposed (waiting for a decision) and Rejected, each row with its short rule,
// a switch on every approved one, and what it does to your roles; all your limits together at the foot.

export type Group = { label: string; rows: Limit[] };

export function LimitsList({
  groups,
  approvedCount,
  selected,
  effects,
  show,
  onShow,
  small,
  onOpen,
  onAdd,
  onSwitch,
  onRestore,
  menu,
}: {
  groups: Group[];
  approvedCount: number;
  selected: string | null;
  effects: Effects | undefined;
  show: { proposed: boolean; rejected: boolean };
  onShow: (show: { proposed: boolean; rejected: boolean }) => void;
  small: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onSwitch: (l: Limit, on: boolean) => void;
  onRestore: (l: Limit) => void;
  menu: MenuEntry[];
}) {
  const fails = new Map(effects?.limits.map((x) => [x.id as string, x.fails]));
  const trail = (l: Limit) => {
    const d = l.data;
    const n = fails.get(l.id);
    let words: ReactNode = null;
    if (d.sentenceChanged) words = <span className="text-caution-text">Sentence changed</span>;
    else if (d.clash) words = <span className="text-caution-text">Clashes</span>;
    else if (l.status === "approved" && d.off) words = "Off";
    else if (n !== undefined) words = effectShort(d.firm !== false, n);
    return (
      <span className="flex flex-col items-end gap-0.5">
        {l.status === "approved" && (
          <span className="flex h-5 items-center">
            <Switch label={`Use ${d.label}`} hideLabel checked={d.off !== true} onChange={(on) => onSwitch(l, on)} />
          </span>
        )}
        {words && <span className="text-body-sm leading-body-sm whitespace-nowrap text-muted tabular-nums">{words}</span>}
      </span>
    );
  };
  const rows = groups.filter((g) => g.rows.length);
  return (
    <div data-tour="limits.list" className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Limits"
        count={approvedCount}
        actions={
          <>
            <Button variant="ghost" iconOnly icon="add" aria-label="Add a limit" detail={ADD_LIMIT_WORDS.detail} note={ADD_LIMIT_WORDS.note} onClick={onAdd} />
            <Menu
              label="Show"
              title="Show"
              trigger={<Button variant="ghost" iconOnly icon="filter" aria-label="Show" className="data-[state=open]:bg-border" />}
              items={[
                { label: "Proposed limits", checked: show.proposed, onSelect: () => onShow({ ...show, proposed: !show.proposed }) },
                { label: "Rejected limits", checked: show.rejected, onSelect: () => onShow({ ...show, rejected: !show.rejected }) },
              ]}
            />
            {!small && <Menu label="More for Limits" items={menu} />}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {rows.length ? (
          <List label="Limits" className="p-2">
            {rows.map((g) => (
              <ListGroup key={g.label} label={g.label} count={g.rows.length}>
                {g.rows.map((l) =>
                  l.status === "rejected" ? (
                    <RejectedRow
                      key={l.id}
                      title={kindName(l.data.kind)}
                      line={l.data.rejectedBecause ? `Why: ${l.data.rejectedBecause}` : l.data.value}
                      decision="Rejected"
                      onRestore={() => onRestore(l)}
                      selected={l.id === selected}
                      onOpen={() => onOpen(l.id)}
                    />
                  ) : (
                    <ListRow
                      key={l.id}
                      title={kindName(l.data.kind)}
                      line={[limitSummary(l.data.kind, l.data.rule, l.data.value), rowScope(l.data)].filter(Boolean).join(" · ")}
                      muted={l.status === "approved" && l.data.off === true}
                      selected={l.id === selected}
                      onOpen={() => onOpen(l.id)}
                      trail={trail(l)}
                    />
                  ),
                )}
              </ListGroup>
            ))}
          </List>
        ) : (
          <EmptyState icon="limits" title="No limits yet" action={<Button detail={ADD_LIMIT_WORDS.detail} note={ADD_LIMIT_WORDS.note} onClick={onAdd}>Add a limit</Button>}>
            Read your goals to have them proposed, or add one yourself.
          </EmptyState>
        )}
      </div>
      {effects && (
        <footer data-tour="limits.effects" className="flex h-11 shrink-0 items-center gap-2 border-t px-4">
          <span className="min-w-0 flex-1 truncate text-body-sm leading-body-sm text-muted tabular-nums">{allWords(effects)}</span>
          <Link href="/pursuits?status=all" className="tap flex items-center gap-1 rounded-sm text-label leading-label font-medium text-muted transition-colors duration-100 hover:text-text">
            Pursuits
            <Icons.goIn aria-hidden="true" size={12} />
          </Link>
        </footer>
      )}
    </div>
  );
}
