"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { type ReactNode, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { cap } from "../../../../convex/limitBuckets";
import { BuiltOnPeek, type BuiltOnSource } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { CompanyLine, CompanyPicker } from "@/components/CompanyPicker";
import { CostEstimate } from "@/components/CostEstimate";
import { useScreenSize } from "@/components/Panes";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { ValueTags } from "@/components/ValueTags";
import { findWords } from "../../companies/likes";
import { inlineLink, Notice, Section, ValueRows } from "../ui";
import { capAll, type Direction, fillInWords, goalIndustriesLabel, RECORD_INDUSTRIES_LABEL, seniorityClashes, sizeLabel, stageLabel } from "./words";

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

// The criteria as rows of values; the seeds show Search settings' (for every direction) above the direction's own.
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
    { label: "Industries", value: <Industries d={d} /> },
    { label: "Sizes", value: tags(c.sizes.map(sizeLabel)) },
    { label: "Stages", value: tags(c.stages.map(stageLabel)) },
    { label: "Keywords", value: c.keywords.length ? <ValueTags items={c.keywords} max={9} /> : <span className="text-muted">None</span> },
    ...(all ? [{ label: "Companies you like", value: <Seeds d={d} /> }] : []),
  ];
}

// A direction's companies to find more like: Search settings' Companies you like with Find more like it on (for every
// direction, muted), then its own, each with Remove, and the picker to add one with one choice: find more like it, for
// this direction only (no Add to my companies; that's Search settings'). Each change saves its whole list, with Undo.
function Seeds({ d }: { d: Direction }) {
  const own = d.data.criteria?.seeds ?? [];
  const known = useQuery(api.discovery.seeds, { domains: own });
  const finding = useQuery(api.findCompanies.settings);
  const costs = useQuery(api.estimates.costs, {});
  const set = useMutation(api.discovery.setDirectionSeeds);
  const find = useAction(api.companyLookup.find);
  const website = useAction(api.companyLookup.website);
  const small = useScreenSize() === "small";
  const words = finding && costs && findWords({ finding: finding.finding, braveKey: finding.braveKey, byNameUsd: costs.findByName });
  const name = d.data.name;
  const save = (seeds: string[], message: string) => set({ id: d.id, seeds }).then(() => toast({ message, action: { label: "Undo", key: "U", run: () => void set({ id: d.id, seeds: own }) } }));
  const plainly = (e: unknown, fallback: string): never => {
    throw new Error(e instanceof ConvexError ? String(e.data) : fallback);
  };
  const mine = (known?.own ?? []).filter((s) => !known?.everyDirection.some((x) => x.domain === s.domain));
  return (
    <span className="flex flex-col gap-3">
      {known && (
        <span className="flex flex-col gap-1">
          <span className="text-body-sm leading-body-sm text-muted">From Search settings, for every direction</span>
          {known.everyDirection.length ? <ValueTags items={known.everyDirection.map((s) => s.name ?? s.domain)} className="opacity-70" /> : <span className="text-muted">None yet</span>}
        </span>
      )}
      <span className="flex flex-col gap-1">
        <span className="text-body-sm leading-body-sm text-muted">Find more like these for {name}</span>
        {mine.length > 0 && (
          <ul aria-label={`Companies ${name} finds more like`} className="flex flex-col">
            {mine.map((s) => (
              <CompanyLine
                key={s.domain}
                name={s.name}
                domain={s.domain}
                small={small}
                removeDetail={`${name}’s search stops looking for companies like ${s.name ?? s.domain}. Companies already found stay where they are.`}
                onRemove={() => void save(own.filter((x) => x !== s.domain), `Removed ${s.name ?? s.domain} from ${name}`).catch(() => toast({ message: "Couldn’t remove that.", icon: "failed" }))}
              />
            ))}
          </ul>
        )}
        {words && (
          <CompanyPicker
            label={`Find more like a company, for ${name}`}
            small={small}
            findNote={words.note}
            findDetail={words.detail}
            addDetail={(n) => `Searches for ${name} also find companies like ${n ?? "this website"}. It isn’t added to your companies.`}
            addNote={words.likeNote.replace("Free to turn on", "Free to add")}
            find={(q) => find({ name: q }).then((r) => ({ companies: r.companies, source: words.source(r.source, r.costUsd) }), (e: unknown) => plainly(e, "Couldn’t search. Try again."))}
            website={(site) => website({ website: site }).catch((e: unknown) => plainly(e, "Couldn’t read that website. Try again."))}
            onAdd={(c) => save([...own.filter((x) => x !== c.domain), c.domain], `${name} finds more like ${c.name ?? c.domain}`).catch((e: unknown) => plainly(e, "Couldn’t add that."))}
          />
        )}
      </span>
    </span>
  );
}

// A direction's industries: with goals that want some, theirs (muted, for every direction or this one) above the
// direction's own ones they don't name (from their record); otherwise the direction's own, as chosen.
export function Industries({ d }: { d: Direction }) {
  const own = d.data.criteria?.industries ?? [];
  if (!d.fromGoals.length) return own.length ? <ValueTags items={capAll(own)} /> : <span className="text-muted">Any</span>;
  return (
    <span className="flex flex-col gap-3">
      <span className="flex flex-col gap-1">
        <span className="text-body-sm leading-body-sm text-muted">{goalIndustriesLabel(d.data.name, d.goalsScoped)}</span>
        <ValueTags items={capAll(d.fromGoals)} className="opacity-70" />
      </span>
      {d.fromRecord.length > 0 && (
        <span className="flex flex-col gap-1">
          <span className="text-body-sm leading-body-sm text-muted">{RECORD_INDUSTRIES_LABEL}</span>
          <ValueTags items={capAll(d.fromRecord)} />
        </span>
      )}
    </span>
  );
}

const EDIT_CRITERIA = "Change what search looks for in this direction. Saving approves them.";

// Filling a direction in from an empty tab: what starts it and its estimate.
type Fill = { run: () => void; cost: string | null };

// An empty part: being filled in, its fill-in failed, or never filled in, with Fill in (and what else they can do).
function NotFilled({ d, fill, what, children }: { d: Direction; fill: Fill; what: string; children?: ReactNode }) {
  if (d.fill === "filling")
    return (
      <Text size="sm" muted>
        Filling in {what} now. It’s proposed for you to review when it’s done.
      </Text>
    );
  const words = fillInWords(false, fill.cost);
  return (
    <>
      <Text size="sm" muted>
        {d.fill === "failed" ? "Couldn’t fill in. Try again: " : "Not filled in yet: "}
        {what}.
      </Text>
      <div className="flex flex-wrap items-center gap-3">
        <Button icon="tryAgain" detail={words.detail} note={words.note} onClick={fill.run}>
          Fill in
        </Button>
        {fill.cost && <CostEstimate amount={fill.cost} />}
        {children}
      </div>
    </>
  );
}

export function CriteriaView({ d, onEdit, fill }: { d: Direction; onEdit: () => void; fill: Fill }) {
  if (!d.data.criteria)
    return (
      <Section label="Criteria" tag={d.fill === "filling" ? <StatusTag tone="info">Filling in</StatusTag> : undefined}>
        <NotFilled d={d} fill={fill} what="the industries, company sizes and titles search looks for in this direction">
          <Button variant="ghost" icon="edit" detail="Write what search looks for in this direction. Saving approves them." note="Free" onClick={onEdit}>
            Add criteria
          </Button>
        </NotFilled>
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

export function TitlesView({ d, onEdit, fill }: { d: Direction; onEdit: () => void; fill: Fill }) {
  const t = d.data.detail;
  if (!t)
    return (
      <Section label="Title map" tag={d.fill === "filling" ? <StatusTag tone="info">Filling in</StatusTag> : undefined}>
        <NotFilled d={d} fill={fill} what="how your titles translate in this market, the titles to aim at and the words to use" />
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
