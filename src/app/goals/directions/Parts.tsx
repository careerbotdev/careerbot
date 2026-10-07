"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { cap } from "../../../../convex/limitBuckets";
import { BuiltOnPeek, type BuiltOnSource } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { ValueTags } from "@/components/ValueTags";
import { inlineLink, Notice, Section, ValueRows } from "../ui";
import { capAll, type Direction, seniorityClashes, sizeLabel, stageLabel } from "./words";

// A direction's parts as read: its criteria, its title map and vocabulary, and the stories that carry over or need
// reframing, each line with what it's built on.

export const facts = (texts: string[]): BuiltOnSource[] => texts.map((text) => ({ kind: "fact", text, source: "Your record", approved: true }));

export const StateTag = ({ approved }: { approved: boolean }) => (approved ? <StatusTag tone="good">Approved</StatusTag> : <StatusTag tone="caution">Proposed</StatusTag>);

// Under the titles: each Seniority limit that rules some of them out, and which.
export function SeniorityNotices({ name, titles }: { name: string; titles: string[] }) {
  const items = useQuery(api.goals.items);
  const clashes = seniorityClashes(name, titles, items ?? []);
  if (!clashes.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {clashes.map((c) => (
        <Notice key={c.id} tone="problem" title={c.title}>
          {c.line}
        </Notice>
      ))}
    </div>
  );
}

// The criteria as rows of values; the seeds say "Your defaults" when they're empty.
export function criteriaRows(d: Direction, all = true) {
  const c = d.data.criteria!;
  const tags = (xs: string[], max?: number) => (xs.length ? <ValueTags items={xs} max={max} /> : <span className="text-muted">Any</span>);
  return [
    {
      label: "Titles",
      value: (
        <span className="flex flex-col gap-2.5">
          {tags(c.titles, all ? undefined : 6)}
          <SeniorityNotices name={d.data.name} titles={c.titles} />
        </span>
      ),
    },
    { label: "Industries", value: tags(capAll(c.industries)) },
    { label: "Sizes", value: tags(c.sizes.map(sizeLabel)) },
    { label: "Stages", value: tags(c.stages.map(stageLabel)) },
    { label: "Keywords", value: c.keywords.length ? <ValueTags items={c.keywords} max={9} /> : <span className="text-muted">None</span> },
    ...(all ? [{ label: "Own seed companies", value: c.seeds?.length ? <ValueTags items={c.seeds} /> : <span className="text-muted">Your defaults</span> }] : []),
  ];
}

const EDIT_CRITERIA = "Change what search looks for in this direction. Saving approves them.";

export function CriteriaView({ d, onEdit }: { d: Direction; onEdit: () => void }) {
  if (!d.data.criteria)
    return (
      <Section label="Criteria">
        <Text size="sm" muted>
          Not filled in yet. Fill in again from ⋯ to propose them, or add them yourself.
        </Text>
        <Button className="self-start" icon="edit" detail="Write what search looks for in this direction. Saving approves them." note="Free" onClick={onEdit}>
          Add criteria
        </Button>
      </Section>
    );
  return (
    <Section
      label="Criteria"
      tag={<StateTag approved={d.data.criteriaStatus === "approved"} />}
      extra={
        <Button variant="ghost" size="sm" icon="edit" detail={EDIT_CRITERIA} note="Free" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      {d.avoided.length > 0 && (
        <Notice tone="problem" title={`Your limits avoid ${d.avoided.map(cap).join(", ")}`} actions={<Button size="sm" detail={EDIT_CRITERIA} note="Free" onClick={onEdit}>Edit criteria</Button>}>
          These criteria still name it; search leaves it out.
        </Notice>
      )}
      <ValueRows rows={criteriaRows(d)} lane="w-28" />
    </Section>
  );
}

export function TitlesView({ d, onEdit }: { d: Direction; onEdit: () => void }) {
  const t = d.data.detail;
  if (!t)
    return (
      <Section label="Title map">
        <Text size="sm" muted>
          Not filled in yet. Fill in again from ⋯ to propose how your titles translate.
        </Text>
      </Section>
    );
  const approved = d.data.detailStatus === "approved";
  return (
    <>
      <Section
        label="Title map"
        count={t.titleMap.length}
        tag={<StateTag approved={approved} />}
        extra={
          <Button variant="ghost" size="sm" icon="edit" detail="Change the positioning, target titles and vocabulary. Saving approves them." note="Free" onClick={onEdit}>
            Edit positioning
          </Button>
        }
      >
        <ul className="flex flex-col">
          {t.titleMap.map((m) => (
            <li key={`${m.from}>${m.to}`} className="flex flex-col gap-0.5 border-t py-2.5">
              <span className="text-body-md leading-body-md text-text">{m.to}</span>
              <span className="text-body-sm leading-body-sm text-muted">From {m.from}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section label="Target titles" count={t.targetTitles.length}>
        <ValueTags items={t.targetTitles} label="Target titles" />
      </Section>
      <Section label="Market vocabulary" count={t.vocabulary.length}>
        <ValueTags items={t.vocabulary} label="Market vocabulary" />
      </Section>
    </>
  );
}

// Stories that carry over (or need reframing, with how): the first two, then the rest on "N more".
export function Stories({ label, stories }: { label: string; stories: Direction["carriesOver"] }) {
  const [all, setAll] = useState(false);
  if (!stories.length) return null;
  const shown = all ? stories : stories.slice(0, 2);
  return (
    <Section label={label} count={stories.length}>
      <ul className="flex flex-col">
        {shown.map((s) => (
          <li key={s.text} className="flex items-start gap-3 border-t px-2 py-2.5 transition-colors duration-100 hover:bg-subtle">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-body-md leading-body-md text-text">{s.text}</span>
              {s.how && <span className="text-body-sm leading-body-sm text-muted">{s.how}</span>}
            </span>
            <BuiltOnPeek sources={facts(s.facts)} align="end" />
          </li>
        ))}
        {stories.length > shown.length && (
          <li className="flex border-t p-2">
            <button type="button" onClick={() => setAll(true)} className={`tap text-body-sm leading-body-sm font-medium text-text ${inlineLink}`}>
              {stories.length - shown.length} more
            </button>
          </li>
        )}
      </ul>
    </Section>
  );
}
