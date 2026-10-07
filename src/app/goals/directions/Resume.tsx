"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { type KeyboardEvent, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { present } from "../../../../convex/resumeDoc";
import { Button, buttonLook } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { Field, Textarea } from "@/components/Field";
import { List, ListRow } from "@/components/ListRow";
import { Menu } from "@/components/Menu";
import { Select } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { aboutUsd } from "../../costs";
import { useExport } from "../../resumes/Export";
import { ResumeSheet } from "../../resumes/Sheet";
import { day, dayTime, failed, Section } from "../ui";
import { type Direction, postingName, versionName } from "./words";

// A direction's resumes: its own versions (the third pane's Resume, with Rewrite, Copy and Export) and the resumes
// tailored from it (the third pane's Tailor a resume, and the Resumes tab). Tailored resumes are kept as written.

type State = "review" | "unknown" | "changed" | "upToDate" | "notWritten";
const STATES: Record<State, { tone: "good" | "caution" | "neutral"; words: string }> = {
  upToDate: { tone: "good", words: "Up to date" },
  changed: { tone: "caution", words: "Record changed" },
  review: { tone: "caution", words: "New version to review" },
  unknown: { tone: "neutral", words: "Not checked" },
  notWritten: { tone: "neutral", words: "Not written" },
};

// How the direction's resume stands against the record now (Resumes' overview), for a tag.
export function useResumeState(directionId: Id<"items">) {
  const overview = useQuery(api.resume.overview, {});
  const row = overview?.directions.find((x) => x.directionId === directionId);
  return row ? { ...STATES[row.state], writing: row.writing } : null;
}

export function ResumeStateTag({ directionId }: { directionId: Id<"items"> }) {
  const s = useResumeState(directionId);
  return s ? <StatusTag tone={s.tone}>{s.words}</StatusTag> : null;
}

const busyOf = (last: { status: string } | null | undefined) => last?.status === "queued" || last?.status === "running";

// Write (or rewrite) the direction's resume, or tailor one to a posting.
function useStart(directionId: Id<"items">) {
  const start = useMutation(api.resume.start);
  return (posting?: string) =>
    start({ directionId, ...(posting ? { posting } : {}) }).then(
      (jobId) => {
        toast(jobId ? { message: posting ? "Tailoring a resume" : "Writing the resume", icon: "running" } : { message: "A resume is being written. Try again when it’s done.", icon: "failed" });
        return !!jobId;
      },
      (e: unknown) => {
        failed(e, "Couldn’t start.");
        return false;
      },
    );
}

// The third pane's Resume: which version, Rewrite, Copy and Export, then the page as it exports.
export function ResumePane({ d, version, onVersion }: { d: Direction; version: string | null; onVersion: (id: string) => void }) {
  const data = useQuery(api.resume.list, { directionId: d.id });
  const contact = useQuery(api.profile.get) ?? null;
  const costs = useQuery(api.estimates.costs, {});
  const start = useStart(d.id);
  const v = data?.versions.find((x) => x.id === version) ?? data?.versions[0];
  const doc = v?.doc && data ? present(v.doc, data.settings, v.layout) : null;
  const name = `${d.data.name} resume`;
  // Its Google Doc holds the current version only.
  const exports = useExport({ doc, contact, name, resumeId: v && v === data?.versions[0] ? v.id : undefined });
  if (!data) return null;
  const busy = busyOf(data.last);
  const amount = aboutUsd(costs?.directionResume);
  const blocked = d.data.detailStatus !== "approved" ? "Approve the positioning first" : undefined;
  const write = (
    <CostAction
      amount={amount ?? "Uses your AI budget"}
      variant={v ? "ghost" : "primary"}
      size={v ? "sm" : "md"}
      icon="tryAgain"
      loading={busy}
      loadingLabel="Writing"
      reason={blocked}
      detail={v ? "Writes a new version from your approved record and this direction’s positioning. Earlier versions stay." : "Writes this direction’s resume from your approved record and its positioning."}
      onClick={() => void start()}
    >
      {v ? "Rewrite" : "Write the resume"}
    </CostAction>
  );
  if (!v)
    return (
      <div className="flex flex-col items-start gap-3 pt-1">
        <Text size="sm" muted>
          {busy ? "Writing…" : "No resume for this direction yet."}
        </Text>
        {!busy && write}
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <Select label="Version" value={v.id as string} onChange={onVersion} className="w-full" options={data.versions.map((x) => ({ value: x.id as string, label: versionName(d.data.name, x.at) }))} />
      <div className="-ml-2.5 flex flex-wrap items-center gap-x-1 gap-y-1">
        {write}
        <Menu label="Copy" items={exports.filter((e) => typeof e === "object" && "icon" in e && e.icon === "copy")} align="start" trigger={<Button variant="ghost" size="sm" icon="copy" disabled={!doc}>Copy</Button>} />
        <Menu label="Export" items={exports} align="start" trigger={<Button variant="ghost" size="sm" icon="export" disabled={!doc}>Export</Button>} />
      </div>
      {!busy && data.last?.status === "failed" && <Text size="sm">The last try failed: {data.last.error}</Text>}
      {doc ? <ResumeSheet doc={doc} contact={contact} small /> : <Text size="sm" muted>This version is plain text. Rewrite it to see it here.</Text>}
    </div>
  );
}

// The third pane's Tailor a resume: paste a posting, tailor, and the ones tailored before (each opens in Resumes).
export function TailorPane({ d }: { d: Direction }) {
  const data = useQuery(api.resume.list, { directionId: d.id });
  const costs = useQuery(api.estimates.costs, {});
  const start = useStart(d.id);
  const [posting, setPosting] = useState("");
  if (!data) return null;
  const busy = busyOf(data.last);
  const amount = aboutUsd(costs?.tailor) ?? "Uses your AI budget";
  const tailor = () => {
    if (!posting.trim() || busy) return;
    void start(posting).then((ok) => ok && setPosting(""));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      tailor();
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
        <Field label="Posting">{(p) => <Textarea rows={10} grow={false} placeholder="Paste the job posting." value={posting} onChange={(e) => setPosting(e.target.value)} {...p} />}</Field>
        <CostAction
          amount={amount}
          variant="primary"
          icon="resumes"
          keys="⌘↵"
          loading={busy}
          loadingLabel="Tailoring"
          reason={d.data.detailStatus !== "approved" ? "Approve the positioning first" : !posting.trim() ? "Paste a posting first" : undefined}
          detail={`Writes a resume for this posting from your ${d.data.name} resume. It’s kept as written.`}
          onClick={tailor}
        >
          Tailor a resume
        </CostAction>
        {!busy && data.last?.status === "failed" && <Text size="sm">The last try failed: {data.last.error}</Text>}
      </div>
      {data.tailored.length > 0 && (
        <Section label="Earlier" count={data.tailored.length}>
          <List label="Tailored resumes" className="-mx-2">
            {data.tailored.map((t) => {
              const p = postingName(t);
              return (
                <ListRow
                  key={t.id}
                  title={[p.title, p.company].filter(Boolean).join(" · ")}
                  line={[dayTime(t.at), p.place].filter(Boolean).join(" · ")}
                  href={`/resumes?resume=${t.id}`}
                  actions={[{ label: "Tailor again", icon: "tryAgain", detail: `Writes a new resume for this posting from your ${d.data.name} resume.`, note: amount, onSelect: () => void start(t.posting) }]}
                />
              );
            })}
          </List>
        </Section>
      )}
    </div>
  );
}

// The Resumes tab: the direction's versions (open beside) and the resumes tailored from it (open in Resumes).
export function ResumesTab({ d, onOpen }: { d: Direction; onOpen: (versionId: string | null) => void }) {
  const data = useQuery(api.resume.list, { directionId: d.id });
  const state = useResumeState(d.id);
  if (!data) return null;
  return (
    <div className="flex flex-col gap-7">
      <Section
        label="Versions"
        count={data.versions.length}
        extra={
          <Link href={`/resumes?resume=${d.id}`} className={buttonLook("ghost", "", "sm")}>
            Open in Resumes
          </Link>
        }
      >
        {data.versions.length ? (
          <List label="Versions" className="-mx-2">
            {data.versions.map((v, i) => (
              <ListRow
                key={v.id}
                title={versionName(d.data.name, v.at)}
                line={i === 0 ? "In use" : `Written ${day(v.at)}`}
                tag={i === 0 && state ? <StatusTag tone={state.tone}>{state.words}</StatusTag> : undefined}
                onOpen={() => onOpen(v.id)}
              />
            ))}
          </List>
        ) : (
          <Text size="sm" muted>
            {d.data.detailStatus === "approved" ? "No resume yet. Open Resume beside to write one." : "Approve the positioning to write this direction’s resume."}
          </Text>
        )}
      </Section>
      <Section label="Tailored" count={data.tailored.length}>
        {data.tailored.length ? (
          <List label="Tailored resumes" className="-mx-2">
            {data.tailored.map((t) => {
              const p = postingName(t);
              return <ListRow key={t.id} title={[p.title, p.company].filter(Boolean).join(" · ")} line={[dayTime(t.at), p.place].filter(Boolean).join(" · ")} href={`/resumes?resume=${t.id}`} />;
            })}
          </List>
        ) : (
          <Text size="sm" muted>
            Tailor a resume to a posting and it’s kept here.
          </Text>
        )}
      </Section>
    </div>
  );
}

// The Resume row in Details: the version in use and how it stands, opening it beside.
export function ResumeProperty({ d, onOpen }: { d: Direction; onOpen: () => void }) {
  const data = useQuery(api.resume.list, { directionId: d.id });
  const v = data?.versions[0];
  if (!v) return <span className="text-muted">{d.data.detailStatus === "approved" ? "Not written" : "After the positioning is approved"}</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      <button type="button" onClick={onOpen} className="tap rounded-sm text-left underline decoration-border decoration-1 underline-offset-3 transition-colors duration-100 hover:decoration-text">
        {versionName(d.data.name, v.at)}
      </button>
      <span className="flex">
        <ResumeStateTag directionId={d.id} />
      </span>
    </span>
  );
}
