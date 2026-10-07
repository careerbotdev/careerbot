"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button, type ButtonSize } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import type { MenuEntry } from "@/components/Menu";
import { Menu } from "@/components/Menu";
import type { ScreenSize } from "@/components/Panes";
import { NoteBlock } from "@/components/NoteBlock";
import { Properties, Property } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { ReviewCard } from "@/components/ReviewCard";
import { TabPanel, Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../../costs";
import { useBar } from "../../shell/ShellContext";
import type { Id } from "../../../../convex/_generated/dataModel";
import { failed, inlineLink, ItemBody, ItemHead, ItemTop, onItemKey, padOf, type Position, Section, ValueRows } from "../ui";
import { useDirectionActs } from "./acts";
import { CriteriaForm, DetailForm, DirectionForm } from "./forms";
import { criteriaRows, CriteriaView, facts, StateTag, Stories, TitlesView } from "./Parts";
import { ResumeProperty, ResumesTab } from "./Resume";
import { COPY_LINK_WORDS, type Direction, fillInWords, type Fit, fromOf, type ItemTab, type Pane, PART_WORDS, type Part, pathWord, positioningFacts, proposedParts, REJECT_PICKS, REJECT_WORDS, rolesWord } from "./words";

// An approved direction: its top (where it is, the resume beside, ⋯), its head with Tailor a resume, a review card
// for a part still proposed, and its tabs: Overview (with Details), Criteria, Titles, Resumes and Notes.

const EDIT_PART = "Change it as you want it. Saving approves it.";

type Editing = "direction" | "criteria" | "detail" | null;

export function DirectionItem({
  d,
  others,
  fit,
  size,
  position,
  back,
  tab,
  onTab,
  pane,
  onPane,
  onGone,
}: {
  d: Direction;
  // The other approved directions, to merge into.
  others: Direction[];
  fit: Fit | undefined;
  size: ScreenSize;
  position: Position | null;
  back: { label: string; onBack: () => void };
  tab: ItemTab;
  onTab: (t: ItemTab) => void;
  pane: Pane | null;
  onPane: (p: Pane | null, version?: string | null) => void;
  // After it leaves the list (rejected, merged, back in review): the screen opens the next.
  onGone: () => void;
}) {
  const small = size === "small";
  const acts = useDirectionActs();
  const detail = useMutation(api.directions.detail);
  const costs = useQuery(api.estimates.costs, {});
  const resumes = useQuery(api.resume.list, { directionId: d.id });
  const notes = useQuery(api.notes.list, { subject: { kind: "item", id: d.id } });
  const addNote = useMutation(api.notes.add);
  const editNote = useMutation(api.notes.edit);
  const removeNote = useMutation(api.notes.remove);
  const [editing, setEditing] = useState<Editing>(null);
  const [rejecting, setRejecting] = useState(false);
  const [partAt, setPartAt] = useState(0);

  const parts = proposedParts(d);
  const part: Part | undefined = parts[Math.min(partAt, parts.length - 1)];
  const positioned = d.data.detailStatus === "approved";
  const tailorCost = aboutUsd(costs?.tailor);
  const fillCost = aboutUsd(costs?.directionDetail);
  const resumeCount = (resumes?.versions.length ?? 0) + (resumes?.tailored.length ?? 0);

  const edit = (what: Exclude<Editing, null>) => {
    setRejecting(false);
    setEditing(what);
    if (what === "criteria") onTab("criteria");
    if (what === "detail") onTab("titles");
  };
  const editPart = (p: Part) => edit(p === "detail" ? "detail" : "criteria");
  const tailor = () => (positioned ? onPane("tailor") : undefined);
  const toggleResume = () => onPane(pane === "resume" ? null : "resume");
  const fillIn = () =>
    void detail({ id: d.id }).then(
      (jobId) => toast(jobId ? { message: `Filling in ${d.data.name} again`, icon: "running" } : { message: "Directions are being filled in. Try again when it’s done.", icon: "failed" }),
      (e: unknown) => failed(e, "Couldn’t start."),
    );
  const reject = (reason?: string) => {
    setRejecting(false);
    void acts.reject(d, reason).then(onGone);
  };
  const fill = fillInWords(!!d.data.detail, fillCost);
  const refill = fillInWords(true, fillCost);
  const approvePartWords = { detail: `Approves this ${part === "detail" ? "positioning: resumes are written from it" : "criteria: search looks for them"}.`, note: "Free · Undo with U" };
  const resumeDetail = pane === "resume" ? "Closes the resume beside this direction." : "Opens this direction’s resume beside it.";

  const menu: MenuEntry[] = [
    { label: "Edit direction", icon: "edit", keys: part ? undefined : "E", detail: "Change its title, what it includes, its fit and what it is.", note: "Free", onSelect: () => edit("direction") },
    { label: "Edit positioning", icon: "edit", detail: "Change the positioning, the titles to aim at and the words to use. Saving approves it.", note: "Free", onSelect: () => edit("detail"), ...(d.data.detail ? {} : { disabled: true, reason: "Not filled in yet" }) },
    { label: d.data.detail ? "Fill in again" : "Fill in", icon: "tryAgain", hint: fillCost ?? undefined, detail: fill.detail, note: fill.note, onSelect: fillIn },
    {
      label: "Merge into…",
      icon: "switch",
      ...(others.length ? { items: others.map((o) => ({ label: o.data.name, onSelect: () => void acts.merge(d, { id: o.id, name: o.data.name }).then(onGone) })) } : { disabled: true, reason: "No other approved directions" }),
    },
    "separator",
    { label: "Undo approval", icon: "undo", detail: "Moves it back to Proposed; roles aren’t ranked for it until you approve it again.", note: "Free · Undo with U", onSelect: () => void acts.undoApproval(d).then(onGone) },
    ...(positioned ? [{ label: "Undo positioning approval", icon: "undo" as const, detail: "Puts the positioning back up for review; resumes aren’t written from it until you approve it again.", note: "Free · Undo with U", onSelect: () => acts.unapprovePart(d, "detail") }] : []),
    ...(d.data.criteriaStatus === "approved" && d.data.criteria ? [{ label: "Undo criteria approval", icon: "undo" as const, detail: "Puts the criteria back up for review; search doesn’t look for them until you approve them again.", note: "Free · Undo with U", onSelect: () => acts.unapprovePart(d, "criteria") }] : []),
    { label: pane === "resume" ? "Hide resume" : "Show resume", icon: "thirdPane", keys: ".", detail: resumeDetail, note: "Free", onSelect: toggleResume },
    { label: "Copy link", icon: "link", detail: COPY_LINK_WORDS.detail, note: COPY_LINK_WORDS.note, onSelect: () => acts.copyLink(d) },
    "separator",
    { label: "Reject", icon: "reject", keys: "R", detail: REJECT_WORDS.detail, note: REJECT_WORDS.note, onSelect: () => setRejecting(true) },
  ];

  useEffect(() => {
    if (editing) return;
    const onKey = onItemKey({
      e: () => (part ? editPart(part) : edit("direction")),
      r: () => setRejecting(true),
      t: tailor,
      ".": toggleResume,
      ...(part ? { a: () => acts.approvePart(d, part) } : {}),
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tailorButton = (btn: ButtonSize) => (
    <Button
      variant="primary"
      size={btn}
      icon="resumes"
      keys={btn === "lg" ? undefined : "T"}
      className={btn === "lg" ? "flex-1" : ""}
      reason={positioned ? undefined : "Approve the positioning first"}
      detail={`Paste a posting and get a resume for it, written from your ${d.data.name} resume. It’s kept as written.`}
      note={tailorCost ?? "Uses your AI budget"}
      onClick={tailor}
    >
      Tailor a resume
    </Button>
  );
  const more = (btn: ButtonSize) => <Menu label={`More for ${d.data.name}`} title={d.data.name} items={menu} trigger={<Button size={btn} iconOnly icon="more" aria-label="More" />} />;
  useBar(
    small && !editing
      ? rejecting
        ? { kind: "reason", decision: `Reject ${d.data.name}`, picks: REJECT_PICKS, onDone: ({ reason }) => reject(reason) }
        : {
            kind: "actions",
            actions: part ? (
              <>
                {more("lg")}
                <Button size="lg" detail={EDIT_PART} note="Free" onClick={() => editPart(part)}>
                  Edit
                </Button>
                <Button size="lg" variant="primary" className="flex-1" detail={approvePartWords.detail} note={approvePartWords.note} onClick={() => acts.approvePart(d, part)}>
                  Approve {PART_WORDS[part].toLowerCase()}
                </Button>
              </>
            ) : (
              <>
                {more("lg")}
                {tailorButton("lg")}
              </>
            ),
          }
      : null,
  );

  const line = `${pathWord(d)} · approved${editing === "criteria" ? " · editing criteria" : editing === "detail" ? " · editing positioning" : ""}${small && fit ? ` · ${rolesWord(fit.count).toLowerCase()}` : ""}`;
  const count = (n: number) => (n ? n : undefined);
  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "criteria", label: "Criteria" },
    { value: "titles", label: "Titles", count: count(d.data.detail?.titleMap.length ?? 0) },
    { value: "resumes", label: "Resumes", count: count(resumeCount) },
    { value: "notes", label: "Notes", count: count(notes?.length ?? 0) },
  ];

  const review = part && !editing && (
    <ReviewCard
      kind={PART_WORDS[part]}
      context="proposed"
      position={parts.length > 1 ? { index: parts.indexOf(part) + 1, total: parts.length } : undefined}
      onNext={() => setPartAt(parts.indexOf(part) + 1)}
      onPrevious={() => setPartAt(parts.indexOf(part) - 1)}
      builtOn={
        part === "detail" && positioningFacts(d).length > 0 ? (
          <div className="flex">
            <BuiltOnPeek sources={facts(positioningFacts(d))} onEdit={() => editPart("detail")} />
          </div>
        ) : undefined
      }
      actions={[
        { label: "Approve", keys: "A", intent: "approve", detail: approvePartWords.detail, note: approvePartWords.note, onSelect: () => acts.approvePart(d, part) },
        { label: "Edit", keys: "E", detail: EDIT_PART, note: "Free", onSelect: () => editPart(part) },
      ]}
      more={[{ label: "Fill in again", icon: "tryAgain", hint: fillCost ?? undefined, detail: refill.detail, note: refill.note, onSelect: fillIn }]}
      moreLabel={`More for this ${PART_WORDS[part].toLowerCase()}`}
    >
      {part === "detail" ? <p className="text-body-md leading-body-md text-text">{d.data.detail!.positioning}</p> : <ValueRows rows={criteriaRows(d, false)} lane="w-24" />}
    </ReviewCard>
  );

  const from = fromOf(d);
  const details = (columns: 1 | 2, className: string) => (
    <Properties columns={columns} className={className}>
      <Property label="Path">{pathWord(d)}</Property>
      {!!d.data.includes?.length && <Property label="Includes">{d.data.includes.join(", ")}</Property>}
      <Property label="Roles">
        {fit?.count ? (
          <>
            <Link href="/pursuits?status=all" className={`tap self-start ${inlineLink}`}>
              {rolesWord(fit.count)}
              {fit.more ? "+" : ""}
            </Link>
            <span className="text-muted">
              {fit.strong} Strong · {fit.some} Some
            </span>
          </>
        ) : (
          <span className="text-muted">No roles yet</span>
        )}
      </Property>
      <Property label="Resume">
        <ResumeProperty d={d} onOpen={() => onPane("resume")} />
      </Property>
      <Property label="From">
        {from.href ? (
          <Link href={from.href} className={`tap self-start ${inlineLink}`}>
            {from.label}
          </Link>
        ) : (
          from.label
        )}
      </Property>
    </Properties>
  );

  const positioning = d.data.detail;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <ItemTop
        small={small}
        position={position}
        back={back}
        menu={menu}
        title={d.data.name}
        actions={
          !small && (
            <Button variant={pane === "resume" ? "secondary" : "ghost"} iconOnly icon="thirdPane" keys="." aria-label={pane === "resume" ? "Hide resume" : "Show resume"} aria-pressed={pane === "resume"} detail={resumeDetail} note="Free" onClick={toggleResume} />
          )
        }
      />
      <ItemHead icon="directions" title={d.data.name} line={line} size={size}>
        {!small && !editing && pane !== "tailor" && (
          <div className="flex min-w-0 items-center gap-3">
            {tailorButton("md")}
            {tailorCost && <CostEstimate amount={tailorCost} />}
          </div>
        )}
        {!small && rejecting && <ReasonField decision={`Reject ${d.data.name}`} picks={REJECT_PICKS} onDone={({ reason }) => reject(reason)} className="max-w-[560px]" />}
      </ItemHead>
      {editing === "direction" ? (
        <div className={`max-w-[720px] py-6 ${padOf(size)}`}>
          <DirectionForm d={d} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <Tabs label={`${d.data.name} views`} value={tab} onValueChange={(v) => onTab(v as ItemTab)} tabs={tabs} inFlow className={padOf(size)}>
          <TabPanel value="overview">
            <ItemBody size={size} details={details}>
              {review}
              {d.data.summary && (
                <Section label="Summary">
                  <Text>{d.data.summary}</Text>
                </Section>
              )}
              {positioning && positioned && (
                <Section label="Positioning" tag={<StateTag approved />} extra={positioningFacts(d).length > 0 && <BuiltOnPeek sources={facts(positioningFacts(d))} align="end" onEdit={() => edit("detail")} />}>
                  <Text>{positioning.positioning}</Text>
                </Section>
              )}
              {!positioning && (
                <Section label="Positioning">
                  <Text size="sm" muted>
                    Not filled in yet: how to position your record for this direction, the titles to aim at, and what search looks for.
                  </Text>
                  <div className="flex items-center gap-3">
                    <Button icon="tryAgain" detail={fill.detail} note={fill.note} onClick={fillIn}>
                      Fill in
                    </Button>
                    {fillCost && <CostEstimate amount={fillCost} />}
                  </div>
                </Section>
              )}
              <Stories label="Carries over" stories={d.carriesOver} />
              <Stories label="Reframe" stories={d.reframe} />
            </ItemBody>
          </TabPanel>
          <TabPanel value="criteria">
            <Body size={size}>{editing === "criteria" ? <CriteriaForm d={d} onDone={() => setEditing(null)} /> : <CriteriaView d={d} onEdit={() => edit("criteria")} />}</Body>
          </TabPanel>
          <TabPanel value="titles">
            <Body size={size}>{editing === "detail" ? <DetailForm d={d} onDone={() => setEditing(null)} /> : <TitlesView d={d} onEdit={() => edit("detail")} />}</Body>
          </TabPanel>
          <TabPanel value="resumes">
            <Body size={size}>
              <ResumesTab d={d} onOpen={(v) => onPane("resume", v)} />
            </Body>
          </TabPanel>
          <TabPanel value="notes">
            <Body size={size}>
              <NoteBlock
                notes={notes ?? []}
                onAdd={(text) => void addNote({ subject: { kind: "item", id: d.id }, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
                onEdit={(id, text) => void editNote({ id: id as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
                onDelete={(id) => void removeNote({ id: id as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
              />
            </Body>
          </TabPanel>
        </Tabs>
      )}
    </div>
  );
}

// A tab's body without Details: the item's padding, sections a step apart.
function Body({ size, children }: { size: ScreenSize; children: ReactNode }) {
  return <div className={`flex max-w-[880px] flex-col gap-7 py-6 ${padOf(size)}`}>{children}</div>;
}
