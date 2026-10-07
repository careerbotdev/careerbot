"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type Contact, LENGTHS, arrange } from "../../../convex/resumeDoc";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/icons";
import { Kbd } from "@/components/Kbd";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NoteBlock } from "@/components/NoteBlock";
import { PaneHeader } from "@/components/Panes";
import { Properties, Property } from "@/components/Properties";
import { StatusTag } from "@/components/StatusTag";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { useBar } from "../shell/ShellContext";
import { Compare, choicesOf } from "./Compare";
import { DriveProperty } from "./Drive";
import { EditSheet } from "./EditSheet";
import { ExportMenu, useExport } from "./Export";
import { Banner, VersionView } from "./History";
import { FactChanges, useLinesWaiting } from "./FactChanges";
import { Requirements, strongOf } from "./Requirements";
import { aboutUsd } from "../costs";
import { Mark } from "./ResumesList";
import { EXPLAIN, FREE_UNDO, type Overview, type ResumeData, type Row, STATE, type TailoredRow, day, plural, resumeHref, tailoredName } from "./words";

// One resume open: its header (what it is, how it stands, Export and Write again), then the page to work on beside its
// details and notes. A base or direction resume can be written again, have what's new added, and be compared with or
// restored from its history; a tailored resume is frozen as written for its posting, and can only be tailored again.

export type Pane = "layout" | "history" | "posting";
// What the open item is showing: a pane beside it, an older version, or two versions side by side.
export type ItemView = { pane: Pane | null; viewing: Id<"resumes"> | null; compare: { from: Id<"resumes">; to: Id<"resumes"> } | "closed" | null };
export type ItemNav = { at: number; of: number; onMove: (by: number) => void; back: { label: string; onBack: () => void } };
type Costs = { resume: string; directionResume: string; tailor: string; lines: string };

const failed = (e: unknown, fallback = "Couldn’t start.") => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const busy = (s?: string) => s === "queued" || s === "running";

// The item's 52px top: on a phone the way back; beside the list, where it is with J and K; then the pane toggle and ⋯.
function Top({ nav, small, menu, title, pane, onPane }: { nav: ItemNav; small: boolean; menu: MenuEntry[]; title: string; pane: ReactNode; onPane?: () => void }) {
  const more = <Menu label={`More for ${title}`} title={title} items={menu} />;
  if (small) return <PaneHeader back={nav.back} actions={more} />;
  return (
    <PaneHeader
      actions={
        <>
          {nav.at > 0 && (
            <span className="text-body-sm leading-body-sm text-muted tabular-nums">
              {nav.at} of {nav.of}
            </span>
          )}
          {(["J", "K"] as const).map((k) => (
            <Tooltip key={k} content={k === "J" ? "Next" : "Previous"} keys={k}>
              <button type="button" aria-label={k === "J" ? "Next" : "Previous"} onClick={() => nav.onMove(k === "J" ? 1 : -1)} className="flex rounded-sm">
                <Kbd>{k}</Kbd>
              </button>
            </Tooltip>
          ))}
          {onPane && pane}
          {more}
        </>
      }
    />
  );
}

function Head({ mark, title, line, tag, children, small }: { mark: ReactNode; title: string; line: string; tag?: ReactNode; children: ReactNode; small: boolean }) {
  return (
    <div className={`flex flex-col gap-4 border-b pb-6 ${small ? "px-4 pt-1" : "px-8"}`}>
      <div className="flex items-start gap-3.5">
        {mark}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg text-text">{title}</h1>
          <p className="text-body-sm leading-body-sm text-muted">{line}</p>
          {tag && <div className="flex pt-1.5">{tag}</div>}
        </div>
      </div>
      {!small && <div data-tour="resumes.actions" className="flex flex-wrap items-center gap-2 pl-[54px]">{children}</div>}
    </div>
  );
}

// A toggle for a pane beside the item (Layout, History, Posting).
function PaneButton({ label, icon, on, onClick, keys, detail }: { label: string; icon: "settings" | "activity" | "thirdPane"; on: boolean; onClick: () => void; keys: string; detail: string }) {
  return (
    <Button variant="ghost" icon={icon} keys={keys} aria-pressed={on} className="aria-pressed:bg-border" detail={detail} note="Free" onClick={onClick}>
      {label}
    </Button>
  );
}

// Notes on a resume, dated. They're never read by anything that writes.
function Notes({ id }: { id: Id<"resumes"> }) {
  const subject = { kind: "resume" as const, id };
  const notes = useQuery(api.notes.list, { subject });
  const add = useMutation(api.notes.add);
  const edit = useMutation(api.notes.edit);
  const remove = useMutation(api.notes.remove);
  return (
    <NoteBlock
      heading
      notes={notes ?? []}
      onAdd={(text) => void add({ subject, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onEdit={(nid, text) => void edit({ id: nid as Id<"notes">, text }).catch((e: unknown) => failed(e, "Couldn’t save the note."))}
      onDelete={(nid) => void remove({ id: nid as Id<"notes"> }).catch((e: unknown) => failed(e, "Couldn’t delete the note."))}
    />
  );
}

// The body: the page (and its banners) beside the details on a wide pane, above them on a narrow one.
function Body({ main, details, small }: { main: ReactNode; details?: ReactNode; small: boolean }) {
  return (
    <div className="@container flex flex-1">
      <div className="flex w-full flex-col @3xl:flex-row">
        <div data-tour="resumes.page" className={`flex min-w-0 flex-1 flex-col gap-5.5 ${small ? "px-2 py-4" : "px-8 py-5"}`}>{main}</div>
        {details && <aside data-tour="resumes.details" className={`flex shrink-0 flex-col gap-3.5 border-t py-5 @3xl:w-60 @3xl:border-t-0 @3xl:border-l ${small ? "px-4" : "px-6"}`}>{details}</aside>}
      </div>
    </div>
  );
}

export function useCosts(): Costs {
  const c = useQuery(api.estimates.costs, {});
  const about = (usd: number | null | undefined) => aboutUsd(usd) ?? "Uses your AI budget";
  return { resume: about(c?.resume), directionResume: about(c?.directionResume), tailor: about(c?.tailor), lines: about(c?.resumeLines) };
}

// A base or direction resume.
export function ResumeItem({ row, overview, view, setView, nav, small, contact }: { row: Row; overview: Overview; view: ItemView; setView: (v: Partial<ItemView>) => void; nav: ItemNav; small: boolean; contact: Contact | null }) {
  const directionId = row.directionId ?? undefined;
  const scope = directionId ? { directionId } : {};
  const data = useQuery(api.resume.list, scope);
  const costs = useCosts();
  const router = useRouter();
  const start = useMutation(api.resume.start);
  const rewrite = useMutation(api.resume.rewrite);
  const whatsNew = useMutation(api.resume.whatsNew);
  const keep = useMutation(api.resume.keep);
  const discard = useMutation(api.resume.discard);
  const reopen = useMutation(api.resume.reopen);
  const addAll = useMutation(api.resume.addAll);
  const closeAdditions = useMutation(api.resume.closeAdditions);
  const current = data?.versions[0];
  const name = row.directionId ? `${row.name} resume` : "Base resume";
  const cost = row.directionId ? costs.directionResume : costs.resume;
  const shown = current?.doc && data ? arrange(current.doc, data.settings, current.layout) : null;
  const exportItems = useExport({ doc: shown?.doc ?? null, contact, name, resumeId: current?.id });
  const writing = row.writing || busy(data?.last?.status);

  const write = () =>
    void (current ? rewrite(scope) : start(scope)).then(
      (jobId) =>
        toast(
          jobId ? { message: current ? "Writing a new version. You’ll see it beside this one before you keep it." : `Writing your ${name}`, icon: "running" } : { message: "A resume is being written. Try again when it’s done.", icon: "failed" },
        ),
      (e: unknown) => failed(e),
    );
  const addNew = () =>
    void whatsNew(scope).then(
      (jobId) => toast(jobId ? { message: "Writing lines for what’s new", icon: "running" } : { message: "A resume is being written. Try again when it’s done.", icon: "failed" }),
      (e: unknown) => failed(e),
    );
  const decide = (kind: "keep" | "discard") =>
    void (kind === "keep" ? keep({ id: row.versionId! }) : discard({ id: row.versionId! })).then(
      () => {
        setView({ compare: null });
        toast({ message: kind === "keep" ? "Kept the new version" : "Discarded the new version", icon: kind === "keep" ? "approve" : "reject", action: { label: "Undo", key: "U", run: () => void reopen({ id: row.versionId! }).catch((e: unknown) => failed(e, "Couldn’t undo.")) } });
      },
      (e: unknown) => failed(e, "Couldn’t save that."),
    );

  const review = row.state === "review" && !!row.versionId && !!current;
  const compare = view.compare === "closed" ? null : (view.compare ?? (review ? { from: current!.id, to: row.versionId! } : null));
  const togglePane = (p: Pane) => setView({ pane: view.pane === p ? null : p });
  const canCompare = (data?.versions.filter((v) => v.doc).length ?? 0) > 1 || review;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "l" && current) setView({ pane: view.pane === "layout" ? null : "layout" });
      else if (k === "h" && current) setView({ pane: view.pane === "history" ? null : "history" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, view.pane, setView]);

  const writeButton = (primary: boolean, size: "md" | "lg" = "md") => (
    <CostAction
      amount={cost}
      budget="From your AI budget"
      variant={primary ? "primary" : "secondary"}
      size={size}
      icon="tryAgain"
      loading={writing}
      loadingLabel="Writing"
      reason={row.blocked ?? (review ? "A new version is waiting. Keep or discard it first." : undefined)}
      detail={current ? EXPLAIN.writeAgain : EXPLAIN.write(row)}
      onClick={write}
    >
      {current ? "Write again" : "Write"}
    </CostAction>
  );
  const linesWaiting = useLinesWaiting(current ? { kind: "resume", id: current.id } : null);
  const bannerPrimary = !compare && !view.viewing && (row.state === "changed" || row.state === "unknown" || !!current?.additions || linesWaiting);
  useBar(
    small && current
      ? {
          kind: "actions",
          actions:
            compare && review ? (
              <>
                <Button size="lg" className="flex-1" icon="reject" detail={EXPLAIN.discard} note={FREE_UNDO} onClick={() => decide("discard")}>
                  Discard
                </Button>
                <Button size="lg" variant="primary" className="flex-1" icon="approve" detail={EXPLAIN.keep} note={FREE_UNDO} onClick={() => decide("keep")}>
                  Keep
                </Button>
              </>
            ) : compare ? (
              <Button size="lg" className="flex-1" icon="close" detail={EXPLAIN.closeCompare} note="Free" onClick={() => setView({ compare: "closed" })}>
                Close compare
              </Button>
            ) : (
              <>
                <ExportMenu doc={shown?.doc ?? null} contact={contact} name={name} resumeId={current?.id} primary={!bannerPrimary} size="lg" className="flex-1" />
                {!bannerPrimary && writeButton(false, "lg")}
              </>
            ),
        }
      : null,
  );

  const menu: MenuEntry[] = [
    ...(current ? [{ label: "Write again", icon: "tryAgain" as const, hint: cost, detail: EXPLAIN.writeAgain, note: cost, onSelect: write, ...(review ? { disabled: true, reason: "A new version is waiting" } : {}) }] : []),
    ...(row.state === "changed" ? [{ label: "Add what’s new", icon: "add" as const, hint: costs.lines, detail: EXPLAIN.addNew, note: costs.lines, onSelect: addNew }] : []),
    ...(canCompare ? [{ label: "Compare versions", icon: "switch" as const, detail: "Shows two versions side by side, with what changed.", note: "Free", onSelect: () => setView({ compare: review ? null : { from: data!.versions[1].id, to: current!.id }, viewing: null }) }] : []),
    ...(current
      ? [
          "separator" as const,
          { label: "Layout", icon: "settings" as const, keys: "L", detail: EXPLAIN.layout, note: "Free", onSelect: () => togglePane("layout") },
          { label: "History", icon: "activity" as const, keys: "H", detail: EXPLAIN.history, note: "Free", onSelect: () => togglePane("history") },
          { label: "Export", icon: "export" as const, items: exportItems },
        ]
      : []),
    ...(row.directionId
      ? [
          "separator" as const,
          { label: `Open ${row.name} in Goals`, icon: "directions" as const, detail: EXPLAIN.inGoals, note: "Free", onSelect: () => router.push(`/goals/directions?direction=${row.directionId}`) },
        ]
      : []),
  ];

  if (!data) return null;
  const header = (
    <Head
      small={small}
      mark={<Mark icon={row.directionId ? "directions" : "resumes"} size={40} />}
      title={row.name}
      line={
        current
          ? [row.directionId ? "Direction resume" : null, `${row.directionId ? "written" : "Written"} ${day(current.at)}`, current.counts && plural(current.counts.roles, "role"), current.counts && plural(current.counts.facts, "fact")].filter(Boolean).join(" · ")
          : row.directionId
            ? "Direction resume · not written yet"
            : "Not written yet"
      }
      tag={writing ? <StatusTag tone="info" icon="running">Writing</StatusTag> : STATE[row.state] && <StatusTag tone={STATE[row.state]!.tone}>{STATE[row.state]!.label}</StatusTag>}
    >
      {compare && review ? (
        <>
          <Button variant="primary" icon="approve" detail={EXPLAIN.keep} note={FREE_UNDO} onClick={() => decide("keep")}>
            Keep
          </Button>
          <Button icon="reject" detail={EXPLAIN.discard} note={FREE_UNDO} onClick={() => decide("discard")}>
            Discard
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" icon="close" detail={EXPLAIN.closeCompare} note="Free" onClick={() => setView({ compare: "closed" })}>
            Close compare
          </Button>
        </>
      ) : compare ? (
        <>
          <ExportMenu doc={shown?.doc ?? null} contact={contact} name={name} resumeId={current?.id} />
          <span className="flex-1" />
          <Button variant="ghost" icon="close" detail={EXPLAIN.closeCompare} note="Free" onClick={() => setView({ compare: "closed" })}>
            Close compare
          </Button>
        </>
      ) : current ? (
        <>
          <ExportMenu doc={shown?.doc ?? null} contact={contact} name={name} resumeId={current.id} primary={!bannerPrimary} />
          {!bannerPrimary && writeButton(false)}
          <span className="flex-1" />
          <PaneButton label="Layout" icon="settings" keys="L" on={view.pane === "layout"} detail={EXPLAIN.layout} onClick={() => togglePane("layout")} />
          <PaneButton label="History" icon="activity" keys="H" on={view.pane === "history"} detail={EXPLAIN.history} onClick={() => togglePane("history")} />
        </>
      ) : (
        writeButton(true)
      )}
    </Head>
  );

  let main: ReactNode;
  if (!current) {
    main = (
      <EmptyState icon={row.directionId ? "directions" : "resumes"} title={writing ? "Writing…" : "Not written yet"} action={small ? writeButton(true, "lg") : undefined}>
        {row.blocked ?? (data.last?.status === "failed" ? `The last try failed: ${data.last.error}` : row.directionId ? `A resume for ${row.name}, written from your approved record and its positioning.` : "A neutral account of your career, written from your approved record.")}
      </EmptyState>
    );
  } else if (compare) {
    main = (
      <Compare
        from={compare.from}
        to={compare.to}
        choices={choicesOf(data.versions.filter((v) => v.doc), review ? row.versionId : null)}
        onFrom={(from) => setView({ compare: { ...compare, from } })}
        onTo={(to) => setView({ compare: { ...compare, to } })}
        facts={data.facts}
        contact={contact}
        stacked={small}
      />
    );
  } else if (view.viewing) {
    main = <VersionView id={view.viewing} contact={contact} small={small} onCompare={() => setView({ compare: { from: view.viewing!, to: current.id }, viewing: null })} onDone={() => setView({ viewing: null })} />;
  } else {
    const adds = current.additions;
    const open = adds?.lines.filter((l) => l.state === null).length ?? 0;
    const settled = adds ? adds.lines.length - open : 0;
    main = (
      <>
        {writing && <Banner tone="steel" title="Writing a new version" line="You’ll see it beside this one before you keep it." />}
        {!writing && data.last?.status === "failed" && <Banner tone="caution" title="The last try failed" line={data.last.error ?? undefined}>{writeButton(false)}</Banner>}
        {review && (
          <Banner tone="steel" title="A new version is waiting" line={row.summary ?? undefined}>
            <Button variant="ghost" icon="switch" detail="Shows the new version beside this one, with what changed." note="Free" onClick={() => setView({ compare: null })}>
              Compare
            </Button>
          </Banner>
        )}
        {busy(data.lines?.status) && <Banner tone="good" title="Writing lines for what’s new" line="Only for facts and projects you added or reworded since it was written." />}
        {adds && (
          <Banner tone="good" title={`${plural(adds.lines.length, "new line")} for what’s new since ${day(current.at)}`} line="Only lines for facts and projects you added or reworded since. The rest of the resume stays as it is.">
            {open > 0 && (
              <Button variant="primary" icon="approveAll" detail="Adds every line not yet added or skipped." note="Free" onClick={() => void addAll({ id: current.id }).catch((e: unknown) => failed(e, "Couldn’t add them."))}>
                {settled ? `Add the other ${open}` : `Add all ${open}`}
              </Button>
            )}
            <Button variant="ghost" detail="Closes this. Lines you added stay; the rest go." note="Free" onClick={() => void closeAdditions({ id: current.id }).catch((e: unknown) => failed(e, "Couldn’t save that."))}>
              Done
            </Button>
          </Banner>
        )}
        {!adds && !busy(data.lines?.status) && (row.state === "changed" || row.state === "unknown") && (
          <Banner tone="caution" title={row.state === "changed" ? "Changed since it was written" : "Written before changes were listed"} line={row.state === "changed" && row.summary ? `Since ${day(current.at)}: ${row.summary}.` : "Write it again to keep track of what changes under it."}>
            {writeButton(true)}
            {row.state === "changed" && (
              <span className="md:ml-2">
                <CostAction amount={costs.lines} budget="From your AI budget" icon="add" detail={EXPLAIN.addNew} onClick={addNew}>
                  Add what’s new
                </CostAction>
              </span>
            )}
          </Banner>
        )}
        {data.lines?.status === "failed" && !adds && <Banner tone="caution" title="Couldn’t write lines for what’s new" line={data.lines.error ?? undefined} />}
        <FactChanges target={{ kind: "resume", id: current.id }} />
        {current.doc ? (
          <EditSheet id={current.id} version={current} settings={data.settings} facts={data.facts} contact={contact} small={small} canAdd />
        ) : (
          <Banner tone="caution" title="This version is plain text" line="Write it again to use titles and folding.">
            {writeButton(true)}
          </Banner>
        )}
      </>
    );
  }

  const tailored = overview.tailored.filter((t) => t.directionId === row.directionId);
  const length = data.length.own ?? data.length.record;
  const folds = shown?.folds ?? [];
  const details = current && !compare && (
    <>
      <Properties>
        {row.directionId && (
          <Property label="Direction">
            <Link href={`/goals/directions?direction=${row.directionId}`} className="tap w-fit underline decoration-border underline-offset-3 hover:decoration-text">
              {row.name}
            </Link>
          </Property>
        )}
        <Property label="Written">{day(current.at, true)}{current.restoredFrom ? ` · restored from ${day(current.restoredFrom)}` : ""}</Property>
        {current.counts && <Property label="Built on">{[plural(current.counts.facts, "fact"), plural(current.counts.insights, "insight"), plural(current.counts.roles, "role")].join(" · ")}</Property>}
        <Property label="Length">
          {LENGTHS[length]} · {data.length.own ? "set for this resume" : "same as every resume"}
        </Property>
        {shown && (
          <Property label="Roles">
            {[shown.doc.experience.filter((e) => !e.break).length, ...folds.map((f) => `${current.doc!.experience.find((e) => e.roleKey === f.roleKey)?.employer ?? "A role"} folded into ${f.into.employer}`)].join(" · ")}
          </Property>
        )}
        <DriveProperty resumeId={current.id} />
      </Properties>
      {row.directionId && (
        <section className="flex flex-col gap-2 border-t pt-3.5">
          <h3 className="flex items-center gap-1.5 text-label leading-label font-medium text-text">
            Tailored from this {tailored.length > 0 && <span className="text-muted tabular-nums">{tailored.length}</span>}
          </h3>
          {tailored.map((t) => (
            <Link key={t.id} href={resumeHref(t.id)} className="flex min-h-11 w-fit items-center text-body-sm md:block md:min-h-0 leading-body-sm text-text underline decoration-border underline-offset-3 hover:decoration-text">
              {tailoredName(t)}
            </Link>
          ))}
          <Link href={`/goals/directions?direction=${row.directionId}&pane=tailor`} className="flex h-11 items-center md:h-8 gap-2 rounded-sm bg-subtle px-3 text-label leading-label font-medium text-text hover:bg-border">
            <Icons.resumes aria-hidden size={16} />
            Tailor a resume
          </Link>
          <span className="text-label leading-label text-muted">{costs.tailor}</span>
        </section>
      )}
      <div data-tour="resumes.notes" className="border-t pt-3.5">
        <Notes id={data.versions.at(-1)!.id} />
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <Top nav={nav} small={small} menu={menu} title={name} pane={null} />
      {header}
      <Body small={small} main={main} details={details || undefined} />
    </div>
  );
}

// A tailored resume: frozen as written for its posting. It can be arranged (Layout), exported and tailored again.
export function TailoredItem({ row, view, setView, nav, small, contact }: { row: TailoredRow; view: ItemView; setView: (v: Partial<ItemView>) => void; nav: ItemNav; small: boolean; contact: Contact | null }) {
  const data = useQuery(api.resume.list, { directionId: row.directionId });
  const costs = useCosts();
  const router = useRouter();
  const start = useMutation(api.resume.start);
  const t = data?.tailored.find((x) => x.id === row.id);
  const name = `${tailoredName(row)} resume`;
  const shown = t?.doc && data ? arrange(t.doc, data.settings, t.layout) : null;
  const exportItems = useExport({ doc: shown?.doc ?? null, contact, name, resumeId: row.id });
  const drive = useQuery(api.drive.fileFor, { id: row.id });
  const linesWaiting = useLinesWaiting({ kind: "resume", id: row.id });
  const tailoring = busy(data?.last?.status);
  const again = () =>
    void start({ directionId: row.directionId, ...(t?.role ? { postingId: t.role.id } : { posting: t!.posting }) }).then(
      (jobId) => toast(jobId ? { message: "Tailoring a new resume. This one stays as it is.", icon: "running" } : { message: "A resume is being written. Try again when it’s done.", icon: "failed" }),
      (e: unknown) => failed(e),
    );
  const againButton = (size: "md" | "lg" = "md") => (
    <CostAction amount={costs.tailor} budget="From your AI budget" size={size} icon="tryAgain" loading={tailoring} loadingLabel="Tailoring" detail={EXPLAIN.tailorAgain} onClick={again}>
      Tailor again
    </CostAction>
  );
  useBar(
    small && t
      ? {
          kind: "actions",
          actions: (
            <>
              <ExportMenu doc={shown?.doc ?? null} contact={contact} name={name} resumeId={row.id} primary={!linesWaiting} size="lg" className="flex-1" />
              {againButton("lg")}
            </>
          ),
        }
      : null,
  );
  const menu: MenuEntry[] = [
    { label: "Tailor again", icon: "tryAgain", hint: costs.tailor, detail: EXPLAIN.tailorAgain, note: costs.tailor, onSelect: again },
    { label: "Posting", icon: "thirdPane", detail: EXPLAIN.posting, note: "Free", onSelect: () => setView({ pane: "posting" }) },
    { label: "Layout", icon: "settings", keys: "L", detail: EXPLAIN.tailoredLayout, note: "Free", onSelect: () => setView({ pane: "layout" }) },
    { label: "Export", icon: "export", items: exportItems },
    ...(t?.role ? ["separator" as const, { label: "Open the pursuit", icon: "pursuits" as const, detail: "Opens the pursuit for this posting.", note: "Free", onSelect: () => router.push(`/pursuits?role=${t.role!.id}`) }] : []),
  ];
  if (!data) return null;
  if (!t) return <EmptyState icon="resumes" title="Not found">This tailored resume isn’t here any more.</EmptyState>;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <Top
        nav={nav}
        small={small}
        menu={menu}
        title={name}
        onPane={() => setView({ pane: view.pane ? null : "posting" })}
        pane={<Button variant="ghost" iconOnly icon="thirdPane" aria-label="Posting" aria-pressed={view.pane === "posting"} className="aria-pressed:bg-border" detail={EXPLAIN.posting} note="Free" onClick={() => setView({ pane: view.pane === "posting" ? null : "posting" })} />}
      />
      <Head small={small} mark={<Avatar name={row.company ?? row.title} company size={40} />} title={row.title} line={[row.company, `tailored from ${row.direction}`, day(row.at)].filter(Boolean).join(" · ")}>
        <ExportMenu doc={shown?.doc ?? null} contact={contact} name={name} resumeId={row.id} primary={!linesWaiting} />
        {againButton()}
        <span className="flex-1" />
        <PaneButton label="Layout" icon="settings" keys="L" on={view.pane === "layout"} detail={EXPLAIN.tailoredLayout} onClick={() => setView({ pane: view.pane === "layout" ? null : "layout" })} />
      </Head>
      <Body
        small={small}
        main={
          t.doc ? (
            <>
              <FactChanges target={{ kind: "resume", id: t.id }} />
              <EditSheet id={t.id} version={{ doc: t.doc, layout: t.layout ?? { roles: [] }, additions: null }} settings={data.settings} facts={data.facts} contact={contact} small={small} canAdd={false} />
            </>
          ) : (
            <Banner tone="caution" title="This version is plain text" line="Tailor it again to use titles and folding.">
              {againButton()}
            </Banner>
          )
        }
        details={
          drive ? (
            <Properties>
              <DriveProperty resumeId={row.id} />
            </Properties>
          ) : undefined
        }
      />
    </div>
  );
}

// The posting a tailored resume was written for: where it's from, how the record meets each requirement, notes.
export function PostingPane({ row, data }: { row: TailoredRow; data: ResumeData }) {
  const t = data.tailored.find((x) => x.id === row.id);
  if (!t) return null;
  return (
    <div className="-mx-4 flex flex-col">
      <section className="flex flex-col gap-1 border-b px-4 pb-4">
        <p className="text-body-sm leading-body-sm font-medium text-text">{row.title}</p>
        <p className="text-body-sm leading-body-sm text-muted">{[row.company, `tailored ${day(row.at)}`].filter(Boolean).join(" · ")}</p>
        {t.role && (
          <div className="flex flex-wrap gap-x-4 pt-1 text-body-sm leading-body-sm">
            {t.role.url && (
              <a href={t.role.url} target="_blank" rel="noreferrer" className="text-text underline decoration-border underline-offset-3 hover:decoration-text">
                Read the posting ↗
              </a>
            )}
            <Link href={`/pursuits?role=${t.role.id}`} className="text-text underline decoration-border underline-offset-3 hover:decoration-text">
              Open the pursuit
            </Link>
          </div>
        )}
      </section>
      {t.requirements.length > 0 && (
        <section className="flex flex-col gap-2 border-b px-4 py-4">
          <h3 className="flex items-center gap-1.5 text-label leading-label font-medium text-text">
            Requirements <span className="font-normal text-muted">{strongOf(t.requirements)}</span>
          </h3>
          <Requirements requirements={t.requirements} facts={data.facts} />
        </section>
      )}
      {!t.role && (
        <section className="flex flex-col gap-2 border-b px-4 py-4">
          <h3 className="text-label leading-label font-medium text-text">The posting</h3>
          <p className="text-body-sm leading-body-sm whitespace-pre-wrap text-muted">{t.posting}</p>
        </section>
      )}
      <div className="px-4 py-4">
        <Notes id={t.id} />
      </div>
    </div>
  );
}
