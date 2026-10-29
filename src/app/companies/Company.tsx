"use client";

import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { GROUP_LABELS } from "../../../convex/contactGroups";
import { pursuitHref, STATUS_LABELS } from "../../../convex/pursuitSteps";
import { Avatar } from "@/components/Avatar";
import { BuiltOnPeek, type BuiltOnSource } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import { Field, Input } from "@/components/Field";
import { Kbd } from "@/components/Kbd";
import { ListFold } from "@/components/ListFold";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import { PaneHeader } from "@/components/Panes";
import { Properties, Property, PropertyLink } from "@/components/Properties";
import { RatingControl } from "@/components/RatingControl";
import { ReasonField } from "@/components/ReasonField";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Count, FitWord, StatusTag } from "@/components/StatusTag";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { clockNow } from "../clock";
import { type Company, type CompaniesData, type CompanyCoverage, type CompanyRole, type Coverage, useCompaniesEnv } from "./env";
import { ASIDE, type AsideKind } from "./sets";

export type Rating = "excited" | "maybe" | "no";

export type EditField = "website" | "board";
// E edits the job board when it has a website but no board, else the website.
export const editFieldFor = (c: Company): EditField => (c.domain && !c.details?.board ? "board" : "website");

export const failed = (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : "Couldn’t save that.", icon: "failed" });

// Quick reasons for Not for me on a company.
export const COMPANY_REASONS = ["Industry", "Size", "Reputation", "Place", "Not my work"];

// The words for an action offered in several places (the pane, its ⋯ menu, a row, the phone's bar), so each says the same.
const FREE_UNDO = "Free · Undo with U";
export const WORDS = {
  excited: { detail: "Reads its roles and ranks them first.", note: FREE_UNDO },
  maybe: { detail: "Reads its roles too.", note: FREE_UNDO },
  no: { detail: "Sets it aside and stops reading its roles.", note: FREE_UNDO },
  noNote: { detail: "Sets it aside and stops reading its roles. Asks why first.", note: "Free · Undo with U · Why steers what’s proposed next" },
  reason: { detail: "Changes why it’s not for you.", note: "Free · Undo with U · Why steers what’s proposed next" },
  unrate: { detail: "Takes your rating off; it goes back to Found.", note: FREE_UNDO },
  keep: { detail: "Moves it to Found, where you can rate it.", note: FREE_UNDO },
  restore: { detail: "Counts it as a place to work again; it goes back to Found.", note: FREE_UNDO },
  notEmployer: { detail: "Sets it aside as not a place to work and stops listing its roles.", note: FREE_UNDO },
  archive: { detail: "Hides it from every list until you restore it. Your rating stays; its roles aren’t read while it’s archived.", note: FREE_UNDO },
  unarchive: { detail: "Puts it back in the list it was archived from, with your rating as it was.", note: FREE_UNDO },
  check: "Reads its website and job board afresh, then how it fits your directions.",
  find: { detail: "Shows each search and what it costs before you start one.", note: "Free" },
  settings: { detail: "Sets what searches look for and how found companies are sorted: companies you like, industries, your goals and your ratings.", note: "Free" },
  checkRoles: "Reads its job board once and lists its open roles here. They aren’t scored, and they’re read again only when you check, or every day once you rate it Target or Maybe.",
  searched: "Its job board is too large to read whole, so CareerBot searches it for your directions’ titles and reads what it finds. Roles under other titles aren’t here; the job board has them all.",
  partial: "Its job board shows only so many of its roles to read. The rest are on the job board.",
  more: { detail: "Lists the next 100 of its open roles.", note: "Free" },
} as const;

export const RATINGS = [
  { value: "excited", label: "Target", keys: "T", good: true, detail: `${WORDS.excited.detail} Undo with U.` },
  { value: "maybe", label: "Maybe", keys: "M", detail: `${WORDS.maybe.detail} Undo with U.` },
  { value: "no", label: "Not for me", keys: "R", detail: `${WORDS.no.detail} Undo with U.` },
] as const;

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const when = (at: number) => {
  const days = Math.floor((new Date(clockNow()).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : day.format(at);
};

const GOALS = {
  fits: ["Fits", "text-good-text"],
  partly: ["Partly", "text-caution-text"],
  doesnt: ["Doesn’t fit", "text-muted"],
  unknown: ["Can’t tell", "text-muted"],
} as const;

// How much of a company's board has been read: every role ("214 of 214 roles read · today"), or some of them when its
// board was searched by their titles or lists only so many ("40 of 3,048 roles read · searched by your titles · today");
// and whether that's a problem (couldn't read it, never read, or not read lately).
export function coverageText(cv: Omit<Coverage, "rating">): { text: string; caution: boolean } {
  if (!cv.board) return { text: "No board read yet", caution: true };
  if (cv.lastFailed) return { text: `Couldn’t read its board · ${when(cv.lastFailed)}`, caution: true };
  if (!cv.lastRead) return { text: "Not read yet", caution: true };
  const of = cv.boardTotal !== null && cv.boardTotal > cv.read ? cv.boardTotal : cv.complete ? cv.read : null;
  const read = `${cv.read.toLocaleString("en-US")}${of !== null ? ` of ${of.toLocaleString("en-US")}` : ""} roles read`;
  return { text: [read, cv.searched && "searched by your titles", when(cv.lastRead)].filter(Boolean).join(" · "), caution: cv.stale };
}

// What checking a company again costs: reading its site and board is free; with Ask Apollo on, a company with no public
// board asks Apollo for its postings.
export const checkCost = (c: Company, apolloJobs: boolean) => (apolloJobs && !c.details?.board ? "About 1 Apollo credit" : "Free");

// What checking companies again spends, for its explainer: reading is free, what's written about them uses their AI
// budget, and with Ask Apollo on each one with no public board may ask Apollo for its postings.
export const checkNote = (companies: Company[], apolloJobs: boolean) => {
  const n = apolloJobs ? companies.filter((c) => !c.details?.board).length : 0;
  return n ? `About ${n.toLocaleString("en-US")} Apollo ${n === 1 ? "credit" : "credits"}, plus some AI budget` : "Uses your AI budget";
};

// The open company: its header with the rating, why it's set aside when it is, about it, how it fits their goals and
// directions, its open roles, its details (website and job board edited in place), and their notes.
export function CompanyItem({
  company: c,
  data,
  aside,
  position,
  archived,
  onUnarchive,
  small,
  size,
  why,
  onWhy,
  onRate,
  onKeep,
  onEmployer,
  menu,
  onMove,
  editing,
  onEditing,
}: {
  company: Company;
  data: CompaniesData;
  aside: AsideKind | null;
  position: { at: number; of: number } | null;
  // Archived: when, and the tab it was in (and goes back to).
  archived: { at: number; from: string | null } | null;
  onUnarchive: () => void;
  small: boolean;
  size: "small" | "medium" | "large";
  why: boolean;
  onWhy: (open: boolean) => void;
  onRate: (value: Rating | null, reason?: string) => void;
  onKeep: (keep: boolean) => void;
  onEmployer: (employer: boolean) => void;
  menu: MenuEntry[];
  onMove: (by: number) => void;
  // Which of its details is being edited in place (E, or its Edit button).
  editing: EditField | null;
  onEditing: (field: EditField | null) => void;
}) {
  const env = useCompaniesEnv();
  const coverage = env.useCompanyCoverage(c.id);
  const notes = env.useNotes(c.id);
  const people = env.usePeople(c.id);
  // The demo reads no websites or boards: what would ask for them, or say none was read, is left out there.
  const demo = env.useDemo();
  const act = env.useAct();
  const router = useRouter();
  // Start outreach: a pursuit at this company with no open role, for the direction it fits best, opened at People.
  const startOutreach = () =>
    void act.startOutreach({ companyId: c.id, ...(c.fit[0] ? { directionId: c.fit[0].directionId } : {}) }).then((id) => router.push(`${pursuitHref({ id })}&tab=people`), failed);

  const out = c.screened?.employer === false;
  const theirsOut = out && c.screened?.by === "you";
  const sources: BuiltOnSource[] = data.companyGoals.map((g) => ({ kind: "fact", text: g.text, source: "Limits · Companies", approved: true, href: `/goals/limits?limit=${g.id}` }));
  const line = [c.domain, c.checking ? "Checking again" : null].filter(Boolean).join(" · ") || "No website yet";

  const rating = (
    <RatingControl
      label={`Your rating of ${c.name}`}
      value={c.rating}
      onChange={(v) => onRate(v)}
      options={RATINGS}
    />
  );

  const website = (
    <Property label="Website">
      {editing === "website" ? (
        <EditInPlace
          label="Website"
          initial={c.domain ?? ""}
          placeholder="acme.com"
          hint={theirsOut ? "You set this one aside, so it isn’t checked until you restore it." : "Its details are read again from the new site."}
          save={theirsOut ? "Save website" : "Save and check"}
          detail={theirsOut ? "Saves the website; it’s checked once you restore the company." : "Saves the website and reads the company again from it."}
          note={`${theirsOut ? "Free" : checkNote([c], data.apolloJobs)} · Edit it again to change it`}
          onSave={(website) => act.setWebsite({ id: c.id, website })}
          onDone={() => onEditing(null)}
        />
      ) : (
        <Editable label="Edit the website" onEdit={() => onEditing("website")}>
          {c.domain ? <PropertyLink href={c.websiteUrl ?? `https://${c.domain}`}>{c.domain}</PropertyLink> : <span className="text-muted">None yet</span>}
        </Editable>
      )}
    </Property>
  );
  const boardUrl = c.details?.board?.url ?? c.boardUrl;
  const board = (
    <Property label="Job board">
      {editing === "board" ? (
        <EditInPlace
          label="Job board"
          initial={c.boardUrl ?? c.details?.board?.url ?? ""}
          placeholder="jobs.lever.co/acme"
          hint="Paste the board’s own page if it wasn’t found."
          save={theirsOut ? "Save" : "Save and check"}
          detail={theirsOut ? "Saves the job board; it’s read once you restore the company." : "Saves the job board and reads the company again from it."}
          note={`${theirsOut ? "Free" : "Uses your AI budget"} · Edit it again to change it`}
          onSave={(url) => act.setBoard({ id: c.id, url })}
          onDone={() => onEditing(null)}
        />
      ) : (
        <Editable label="Edit the job board" onEdit={() => onEditing("board")}>
          {boardUrl ? (
            <PropertyLink href={boardUrl}>{boardUrl.replace(/^https?:\/\/(www\.|boards\.|job-boards\.)?/, "").replace(/\/$/, "")}</PropertyLink>
          ) : (
            <span className="text-muted">{c.details ? "None found" : "Not looked for yet"}</span>
          )}
        </Editable>
      )}
    </Property>
  );
  const covered = coverage && coverageText(coverage);
  // When its roles were last read and its fit last checked: "Roles read today · fit checked Oct 20".
  const checked = [c.rolesAt && `Roles read ${when(c.rolesAt)}`, c.fitAt && `${c.rolesAt ? "fit" : "Fit"} checked ${when(c.fitAt)}`].filter(Boolean).join(" · ");
  const details = (columns: 1 | 2, className: string) => (
    <Properties columns={columns} className={className}>
      {website}
      {(!demo || boardUrl) && board}
      {coverage?.watched && covered && !demo && (
        <Property label="Coverage">
          <span className="flex flex-col gap-1.5">
            <span className={covered.caution ? "text-caution-text" : ""}>{covered.text}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Button
                size="sm"
                icon="tryAgain"
                loading={coverage.checking}
                loadingLabel="Checking"
                detail={`Reads its job board again and looks up roles that had no description.${data.fitRefresh ? " If roles matching your titles opened or closed, its fit is checked again." : ""}`}
                note={data.fitRefresh ? `${checkCost(c, data.apolloJobs)} · Its fit, if checked again: under $0.01 from your AI budget` : checkCost(c, data.apolloJobs)}
                onClick={() => void act.checkRoles({ companyId: c.id }).catch(failed)}
              >
                Check again
              </Button>
              <CostEstimate amount={checkCost(c, data.apolloJobs)} />
            </span>
          </span>
        </Property>
      )}
      {coverage && !coverage.watched && c.details?.jobs && (
        <Property label="Open roles">
          <span>
            {c.details.jobs.open.toLocaleString("en-US")}
            {c.details.jobs.remote ? ` · ${c.details.jobs.remote} remote` : ""}
            {c.details.jobs.matching.length ? ` · ${c.details.jobs.matching.length} match your titles` : ""}
          </span>
          {c.details.jobs.matching.slice(0, 3).map((j) => (
            <PropertyLink key={j.url} href={j.url}>
              {j.title}
            </PropertyLink>
          ))}
        </Property>
      )}
      {checked && (
        <Property label="Checked">
          <span>{checked}</span>
        </Property>
      )}
      <Property label="Found">
        <span>{`${c.found.join(", ").replace(/^./, (x) => x.toUpperCase())} · ${when(c.foundAt)}`}</span>
        {/* The pages the web search saw it on. */}
        {c.evidence.map((url, i) => (
          <PropertyLink key={url} href={url}>
            {c.evidence.length > 1 ? `Where it was seen (${i + 1})` : "Where it was seen"}
          </PropertyLink>
        ))}
      </Property>
      {people && people.length > 0 && (
        <Property label="Contacts">
          {people.map((p) => (
            <span key={`${p.name}-${p.pursuitId}`}>{[p.name, p.title, GROUP_LABELS[p.group].title].filter(Boolean).join(", ")}</span>
          ))}
        </Property>
      )}
    </Properties>
  );

  const pad = size === "large" ? "px-8" : size === "medium" ? "px-6" : "px-4";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {!small && (
        <PaneHeader
          actions={
            <>
              {position && (
                <>
                  <span className="text-body-sm leading-body-sm text-muted tabular-nums">
                    {position.at} of {position.of}
                  </span>
                  <Step label="Next" keys="J" onClick={() => onMove(1)} />
                  <Step label="Previous" keys="K" onClick={() => onMove(-1)} />
                </>
              )}
              <Menu label={`More for ${c.name}`} items={menu} />
            </>
          }
        />
      )}
      <div className={`flex shrink-0 flex-col gap-4 border-b pb-6 ${pad} ${small ? "pt-1" : ""}`}>
        <div className="flex items-start gap-3.5">
          <Avatar name={c.name} company size={40} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Heading>{c.name}</Heading>
            <Text size="sm" muted>
              {line}
            </Text>
          </div>
        </div>
        {archived ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:pl-[54px]">
            {!small && (
              <Button variant="primary" size="sm" keys="A" detail={WORDS.unarchive.detail} note={WORDS.unarchive.note} onClick={onUnarchive}>
                Restore
              </Button>
            )}
            <Text size="sm" muted>
              {[`Archived ${new Date(archived.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, archived.from && `was in ${archived.from}`].filter(Boolean).join(" · ")}
            </Text>
          </div>
        ) : (
          <>
            {!small && !out && <div className="flex flex-col gap-3 md:pl-[54px]" data-tour="companies.rating">{rating}</div>}
            {!out && (
              <div className="md:pl-[54px]">
                <Button size="sm" icon="people" detail="Starts a pursuit at this company without an open role, to write to the people who hire there." note="Free" onClick={startOutreach}>
                  Start outreach
                </Button>
              </div>
            )}
          </>
        )}
        {!small && why && (
          <div className="md:pl-[54px]">
            <ReasonField
              decision={`Not for me: ${c.name}`}
              picks={COMPANY_REASONS}
              defaultValue={c.rating === "no" ? (c.ratingReason ?? "") : ""}
              onDone={({ reason }) => {
                onWhy(false);
                onRate("no", reason);
              }}
            />
          </div>
        )}
      </div>
      <div className="flex flex-1">
        <div className={`flex min-w-0 flex-1 flex-col gap-6 py-6 ${pad}`}>
          {aside && <AsideNote kind={aside} company={c} sources={sources} onKeep={onKeep} onEmployer={onEmployer} onRestore={() => onRate(null)} />}
          {(c.details?.summary || !demo) && (
            <Section label="About" tour="companies.about">
              {c.details?.summary ? (
                <Text measure>{c.details.summary}</Text>
              ) : (
                <Text size="sm" muted>
                  {c.domain ? "Its website hasn’t been read yet. Fill in details, in the list’s ⋯, reads it." : "Add its website in Details to read what it does."}
                </Text>
              )}
            </Section>
          )}
          {data.lens.judge !== "off" && c.goals && aside !== "goals" && (
            <Section label="Your goals" extra={sources.length > 0 ? <BuiltOnPeek sources={sources} /> : undefined}>
              <FitRows>
                <FitRow word={<span className={`font-medium ${GOALS[c.goals.level][1]}`}>{GOALS[c.goals.level][0]}</span>} title={c.goals.reason} />
              </FitRows>
              {c.goals.level === "doesnt" && c.goals.keep && (
                <Text size="sm" muted>
                  You kept it anyway.
                </Text>
              )}
            </Section>
          )}
          {c.fit.length > 0 && (
            <Section label="Directions" tour="companies.fit">
              <FitRows>
                {c.fit.map((f) => (
                  <FitRow key={f.directionId} word={<FitWord level={f.level} />} title={f.direction} line={f.reason} />
                ))}
              </FitRows>
            </Section>
          )}
          <OpenRoles company={c} coverage={coverage} demo={demo} canCheck={!out && !archived} apolloJobs={data.apolloJobs} />
          {size !== "large" && <div className="flex flex-col" data-tour="companies.details">{details(2, "border-t pt-5")}</div>}
          <Section label="Notes" count={notes?.length || undefined}>
            <NoteBlock
              notes={notes ?? []}
              onAdd={(text) => void act.addNote({ subject: { kind: "company", id: c.id }, text }).catch(failed)}
              onEdit={(id, text) => void act.editNote({ id: id as Id<"notes">, text }).catch(failed)}
              onDelete={(id) => void act.removeNote({ id: id as Id<"notes"> }).catch(failed)}
            />
          </Section>
        </div>
        {size === "large" && <div className="flex w-60 shrink-0 self-stretch" data-tour="companies.details">{details(1, "min-w-0 flex-1 border-l px-6 py-5")}</div>}
      </div>
    </div>
  );
}

// Why it's set aside, and the way back: Keep anyway for a goals misfit, Restore for the rest.
function AsideNote({ kind, company: c, sources, onKeep, onEmployer, onRestore }: { kind: AsideKind; company: Company; sources: BuiltOnSource[]; onKeep: (keep: boolean) => void; onEmployer: (employer: boolean) => void; onRestore: () => void }) {
  const reason =
    kind === "goals"
      ? c.goals?.reason
      : kind === "no"
        ? (c.ratingReason ?? "No reason given.")
        : `${c.screened?.kind ? c.screened.kind[0].toUpperCase() + c.screened.kind.slice(1) : "Not an employer"}${c.screened?.by === "you" ? ", by your call." : "."}`;
  const action =
    kind === "goals" ? (
      <Button variant="outline" detail={WORDS.keep.detail} note={WORDS.keep.note} onClick={() => onKeep(true)}>
        Keep anyway
      </Button>
    ) : kind === "no" ? (
      <Button variant="outline" detail={WORDS.unrate.detail} note={WORDS.unrate.note} onClick={onRestore}>
        Restore
      </Button>
    ) : (
      <Button variant="outline" detail={WORDS.restore.detail} note={WORDS.restore.note} onClick={() => onEmployer(true)}>
        Restore
      </Button>
    );
  return (
    <div className="flex items-start gap-4 rounded-sm bg-subtle px-4 py-3.5 max-md:flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body-sm leading-body-sm font-semibold text-text">{ASIDE[kind].label}</p>
        {reason && <p className="text-body-sm leading-body-sm text-text">{reason}</p>}
        {kind === "goals" && sources.length > 0 && (
          <div className="pt-1">
            <BuiltOnPeek sources={sources} />
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

function Section({ label, count, extra, tour, children }: { label: string; count?: number; extra?: ReactNode; tour?: string; children: ReactNode }) {
  return (
    <section aria-label={label} data-tour={tour} className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-label leading-label font-medium text-text">
        {label}
        {count !== undefined && <Count>{count.toLocaleString("en-US")}</Count>}
        {extra}
      </h3>
      {children}
    </section>
  );
}

function FitRows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col">{children}</ul>;
}

// A judgment as a row: the level's word in a fixed lane, then what it's about and why.
function FitRow({ word, title, line }: { word: ReactNode; title: string; line?: string }) {
  return (
    <li className="flex gap-3 border-t py-2.5 text-body-sm leading-body-sm">
      <span className="w-19 shrink-0">{word}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-text">{title}</span>
        {line && <span className="text-muted">{line}</span>}
      </span>
    </li>
  );
}

// Where its roles stand, in the order they show: those that fit their directions (best first), those against their
// limits, the rest (not the work of their directions), and those not scored yet: waiting for the next check, or never
// scored at a company that isn't a Target or Maybe.
const GROUPS: { group: CompanyRole["group"]; label: (watched: boolean) => string; note: (watched: boolean) => string | undefined }[] = [
  { group: "fit", label: () => "Fit your directions", note: () => "Best first" },
  { group: "against", label: () => "Against your limits", note: () => "Against a firm limit you set" },
  { group: "other", label: () => "Other roles", note: () => "Not the work of your directions" },
  { group: "waiting", label: (watched) => (watched ? "Waiting to be scored" : "Not scored"), note: (watched) => (watched ? undefined : "Rate it Target or Maybe to score them") },
];
// A search field shows once a company has more roles than this.
const SEARCH_FROM = 20;

// Its open roles, every one read from its board whatever it was ranked (roles.atCompany), grouped by where each stands
// (GROUPS), a page at a time. Above them, how much of its board was read: all of it, or what a search by their titles
// found, with the board itself for the rest. A company that isn't a Target or Maybe isn't read every day: until its
// roles are checked once, it says so and offers to check them now.
function OpenRoles({ company: c, coverage, demo, canCheck, apolloJobs }: { company: Company; coverage: CompanyCoverage | undefined; demo: boolean; canCheck: boolean; apolloJobs: boolean }) {
  const env = useCompaniesEnv();
  const act = env.useAct();
  const [search, setSearch] = useState("");
  const words = search.trim();
  const roles = env.useCompanyRoles(c.id, words);
  if (!coverage) return null;
  const cost = checkCost(c, apolloJobs);
  const check = (label: string) => (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Button size="sm" icon="tryAgain" loading={coverage.checking} loadingLabel="Checking" detail={WORDS.checkRoles} note={cost} onClick={() => void act.checkRoles({ companyId: c.id }).catch(failed)}>
        {label}
      </Button>
      {label !== "Check again" && <CostEstimate amount={cost} />}
    </span>
  );
  if (!coverage.watched && coverage.lastRead === null) {
    if (demo) return null;
    return (
      <Section label="Open roles" tour="companies.roles">
        <Text size="sm" muted measure>
          Roles are read every day only at Targets and Maybe companies. {coverage.board ? `Check now to see what ${c.name} has open.` : "Add its job board in Details to check its roles."}
        </Text>
        {coverage.board && canCheck && check("Check its roles now")}
      </Section>
    );
  }
  const covered = coverageText(coverage);
  const partial = coverage.lastRead !== null && !coverage.complete;
  // Best score first, then the newest (posted, else first seen); roles with no score after those with one.
  const groups = GROUPS.map((g) => ({
    ...g,
    rows: roles.rows.filter((r) => r.group === g.group).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.postedAt ?? b.firstSeen) - (a.postedAt ?? a.firstSeen)),
  })).filter((g) => g.rows.length);
  const searchable = !!words || coverage.read > SEARCH_FROM || roles.status === "CanLoadMore";
  const empty = words ? `No roles match “${words}”.` : coverage.board || demo ? "No open roles on its board." : "No roles yet: CareerBot hasn’t found a job board it can read.";
  return (
    <Section label="Open roles" count={!words && roles.status === "Exhausted" ? roles.rows.length : undefined} tour="companies.roles">
      {!demo && (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-sm leading-body-sm">
          <span className={coverage.watched && covered.caution ? "text-caution-text" : "text-muted"}>
            {covered.text}
            {!coverage.watched && " · read again when you check"}
          </span>
          {partial && <Button variant="ghost" size="sm" iconOnly icon="help" aria-label="How its roles are read" detail={coverage.searched ? WORDS.searched : WORDS.partial} note="Free" />}
          {partial && coverage.board && <PropertyLink href={coverage.board.url}>Open the job board</PropertyLink>}
          {!coverage.watched && canCheck && check("Check again")}
        </span>
      )}
      {searchable && (
        <Input icon="search" aria-label="Search its roles" placeholder={`Search its ${coverage.read.toLocaleString("en-US")} roles`} value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} />
      )}
      {roles.status === "LoadingFirstPage" ? null : groups.length ? (
        <ul className="-mx-3 flex flex-col">
          {groups.map((g) => (
            <ListFold key={`${g.group}:${words}`} label={g.label(coverage.watched)} count={g.rows.length} note={g.note(coverage.watched)} noteInline defaultOpen={g.group === "fit" || !!words || groups.length === 1}>
              {g.rows.map((r) => (
                <RoleLine key={r.id} role={r} />
              ))}
            </ListFold>
          ))}
        </ul>
      ) : (
        <Text size="sm" muted>
          {empty}
        </Text>
      )}
      {(roles.status === "CanLoadMore" || roles.status === "LoadingMore") && (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Button size="sm" loading={roles.status === "LoadingMore"} loadingLabel="Loading" detail={WORDS.more.detail} note={WORDS.more.note} onClick={roles.loadMore}>
            Show more
          </Button>
          <Text size="sm" muted>
            {roles.rows.length.toLocaleString("en-US")} shown
          </Text>
        </span>
      )}
    </Section>
  );
}

// One open role: its score (– when it has none), title, what it is to them (its pursuit, their rating, or the limit
// it's against), its place and when it was posted (first seen, when the board doesn't say); on a phone the place and
// date go under the title. Opens the role in Pursuits.
function RoleLine({ role: r }: { role: CompanyRole }) {
  const posted = day.format(r.postedAt ?? r.firstSeen);
  const tag = r.pursuit ? (
    <StatusTag tone={r.pursuit.status === "offer" ? "good" : r.pursuit.status === "preparing" || r.pursuit.status === "closed" ? "neutral" : "info"}>{STATUS_LABELS[r.pursuit.status]}</StatusTag>
  ) : r.rating ? (
    <StatusTag tone="neutral">{r.rating === "interested" ? "Interested" : "Not for me"}</StatusTag>
  ) : r.group === "against" && r.problems[0] ? (
    <StatusTag tone="problem">{r.problems[0]}</StatusTag>
  ) : null;
  return (
    <li>
      <Link href={`/pursuits?role=${r.id}`} className="flex min-h-9 items-center gap-2.5 rounded-sm border-t px-3 py-1.5 text-body-sm leading-body-sm transition-colors duration-100 hover:bg-subtle max-md:min-h-11">
        <ScoreBadge score={r.score} level={r.level} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center">
          <span className="min-w-0 truncate font-medium text-text md:flex-1">{r.title}</span>
          <span className="truncate text-muted md:hidden">{[r.place, posted].filter(Boolean).join(" · ")}</span>
        </span>
        {tag && <span className="flex max-w-40 min-w-0 shrink-0">{tag}</span>}
        <span className="hidden w-32 shrink-0 truncate text-right text-muted md:block">{r.place}</span>
        <span className="hidden w-12 shrink-0 text-right text-muted tabular-nums md:block">{posted}</span>
      </Link>
    </li>
  );
}

function Step({ label, keys, onClick }: { label: string; keys: string; onClick: () => void }) {
  return (
    <Tooltip content={label} keys={keys}>
      <button type="button" aria-label={label} onClick={onClick} className="flex rounded-sm">
        <Kbd>{keys}</Kbd>
      </button>
    </Tooltip>
  );
}

// A property's value with an Edit button beside it, shown on hover or focus (always on a phone).
function Editable({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <span className="group/edit flex min-w-0 items-center gap-1">
      <span className="flex min-w-0">{children}</span>
      <span className="md:opacity-0 md:group-hover/edit:opacity-100 md:group-focus-within/edit:opacity-100">
        <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label={label} keys="E" detail="Opens it for editing here." note="Free" onClick={onEdit} />
      </span>
    </span>
  );
}

// A property edited where it's shown: the field takes focus with its hint under it; Enter or Save saves, Esc cancels.
function EditInPlace({ label, initial, placeholder, hint, save, detail, note, onSave, onDone }: { label: string; initial: string; placeholder: string; hint: string; save: string; detail: string; note: string; onSave: (value: string) => Promise<unknown>; onDone: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const submit = () => {
    if (value.trim() === initial.trim()) return onDone();
    setSaving(true);
    onSave(value.trim())
      .then(onDone)
      .catch((e: unknown) => setError(e instanceof ConvexError ? String(e.data) : "Couldn’t save that."))
      .finally(() => setSaving(false));
  };
  return (
    <span className="flex flex-col gap-2">
      <Field label={label} hint={hint} error={error} className="[&>label]:sr-only">
        {(p) => (
          <Input
            {...p}
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onDone();
              }
            }}
          />
        )}
      </Field>
      <span className="flex items-center gap-1">
        <Button size="sm" loading={saving} loadingLabel="Saving" detail={detail} note={note} onClick={submit}>
          {save}
        </Button>
        <Button variant="ghost" size="sm" keys="Esc" onClick={onDone}>
          Cancel
        </Button>
      </span>
    </span>
  );
}
