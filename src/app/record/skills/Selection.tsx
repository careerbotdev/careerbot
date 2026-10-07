"use client";

import type { ReactNode } from "react";
import { Icons } from "@/components/icons";
import { Properties, Property } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Heading, Text } from "@/components/Text";
import { ValueTags } from "@/components/ValueTags";
import { PaneHeader } from "@/components/Panes";
import { Menu, type MenuEntry } from "@/components/Menu";
import { useSkillActions } from "./actions";
import { GroupPicker } from "./Item";
import { KINDS, type Kind, plural, REJECT_PICKS, type Skill, sourceLine, type Tab, TAB_LABELS } from "./words";

// Several checked: what they are, where the record shows them (how many of them each role or project shows), the
// near-duplicates among them (approving both keeps both), and their group and whether resumes show them, set for all
// at once. Reject asks why here before it's done.
export function Selection({
  kind,
  tab,
  items,
  groups,
  leftOut,
  large,
  why,
  onWhyDone,
  menu,
}: {
  kind: Kind;
  tab: Tab;
  items: Skill[];
  groups: string[];
  leftOut: Set<string>;
  large: boolean;
  why: boolean;
  onWhyDone: (reason?: string) => void;
  menu: MenuEntry[];
}) {
  const act = useSkillActions();
  const words = KINDS[kind];
  const Icon = Icons[words.icon];
  const inGroups = [...new Set(items.map((s) => s.group ?? ""))];
  const from = new Map<string, { n: number; source: Skill["sources"][number] }>();
  for (const s of items) for (const x of s.sources) from.set(`${x.kind}:${x.key}`, { n: (from.get(`${x.kind}:${x.key}`)?.n ?? 0) + 1, source: x });
  const sources = [...from.values()].sort((a, b) => b.n - a.n);
  const pairs = items.filter((s) => s.sameAs);
  const out = items.filter((s) => leftOut.has(s.id)).length;
  const approved = tab === "approved";

  const details = (
    <Properties columns={large ? 1 : 2}>
      <Property label="Group">
        <GroupPicker value={inGroups.length === 1 ? inGroups[0] || null : null} groups={groups} onChange={(g) => act.regroup(items, g)} />
      </Property>
      {approved && (
        <Property label="On resumes">
          <SegmentedControl
            label="On resumes"
            hideLabel
            value={out === 0 ? "show" : out === items.length ? "out" : null}
            onChange={(v) => act.setLeftOut(items, v === "out", (s) => leftOut.has(s.id))}
            options={[
              { value: "show", label: "Show" },
              { value: "out", label: "Leave out" },
            ]}
          />
        </Property>
      )}
    </Properties>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <PaneHeader actions={<Menu label="More for the selection" items={menu} />} />
      <div className="flex shrink-0 flex-col gap-4 border-b px-4 pt-2 pb-5 md:px-6 lg:px-8">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border bg-subtle text-muted">
            <Icon size={20} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Heading>
              {plural(items.length, words.lower, words.lowerMany)} selected
            </Heading>
            <Text size="sm" muted>
              {[inGroups.length === 1 ? inGroups[0] || "No group" : plural(inGroups.length, "group"), TAB_LABELS[tab].toLowerCase()].join(" · ")}
            </Text>
          </div>
        </div>
        {why && <ReasonField decision={`Reject ${items.length}`} picks={REJECT_PICKS} onDone={({ reason }) => onWhyDone(reason)} className="max-w-[560px]" />}
      </div>
      <div className="flex flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:px-6 lg:px-8">
          <Section title="Selected" count={items.length}>
            <ValueTags items={items.map((s) => s.name)} max={24} label="Selected" />
          </Section>
          {!large && details}
          {sources.length > 0 && (
            <Section title="From">
              {sources.map(({ n, source }) => (
                <div key={`${source.kind}:${source.key}`} className="flex items-start gap-3 border-t py-2.5 text-body-sm leading-body-sm">
                  <span className="w-12 shrink-0 text-muted tabular-nums">{n}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-text">{source.title}</span>
                    <span className="text-muted">{sourceLine(source)}</span>
                  </span>
                </div>
              ))}
            </Section>
          )}
          {pairs.length > 0 && (
            <Section title="Near duplicates" count={pairs.length}>
              {pairs.map((s) => (
                <div key={s.id} className="flex flex-col gap-0.5 border-t py-2.5 text-body-sm leading-body-sm">
                  <span className="text-text">
                    {s.name} · {s.sameAs!.name}
                  </span>
                  <span className="text-muted">Approving both keeps both. Merge them first to keep one wording.</span>
                </div>
              ))}
            </Section>
          )}
        </div>
        {large && <aside className="w-[260px] shrink-0 border-l px-6 py-5">{details}</aside>}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Text size="label">{title}</Text>
        {count !== undefined && <span className="text-label leading-label text-muted tabular-nums">{count}</span>}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}
