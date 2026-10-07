"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/Button";
import { CostAction } from "@/components/CostEstimate";
import { Select } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { arrange } from "../../../convex/resumeDoc";
import { EditSheet } from "../resumes/EditSheet";
import { ExportMenu } from "../resumes/Export";
import { Requirements, strongOf } from "../resumes/Requirements";
import { ResumeSheet } from "../resumes/Sheet";
import { resumeHref } from "../resumes/words";
import { FactChanges } from "../resumes/FactChanges";
import { day } from "./dates";
import { useThird } from "./third";
import { aboutUsd } from "../costs";
import { type Pursuit, resumeFile, RESUME_BESIDE, type Role } from "./words";

// The resume tailored to a role: the one a pursuit uses (the newest unless they chose another), exactly as sent once
// it's sent; before a pursuit, the newest. Its requirements map first, then the page.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// Tailor a resume to the role for a direction: About its cost, from what tailoring has cost so far.
export function useTailor(postingId: Id<"postings">) {
  const start = useMutation(api.resume.start);
  const costs = useQuery(api.estimates.costs, {});
  const amount = aboutUsd(costs?.tailor) ?? "Uses your AI budget";
  const tailor = (directionId: Id<"items">) =>
    void start({ directionId, postingId })
      .then((jobId) => toast(jobId ? { message: "Tailoring your resume", icon: "running" } : { message: "A resume is being written. Try again when it’s done.", icon: "failed" }))
      .catch((e: unknown) => failed(e, "Couldn’t start."));
  return { amount, tailor };
}

// The resume a pursuit uses as it shows (exactly as sent, once it's sent; with no open role, its direction's resume),
// with their contact block and a file name: for a PDF to attach to an outreach message. Null while loading or when
// there's none.
export function usePursuitResume(pursuitId: Id<"pursuits">) {
  const p = useQuery(api.pursuits.get, { id: pursuitId });
  const contact = useQuery(api.profile.get);
  const data = useQuery(api.resume.forPosting, p?.postingId ? { postingId: p.postingId } : "skip");
  if (!p || (p.postingId && !data) || contact === undefined) return null;
  const name = `${contact?.name ? `${contact.name} - ` : ""}${resumeFile(p.company, p.title)}`;
  if (p.sent) return p.sent.resume ? { doc: p.sent.resume, contact, name } : null;
  if (!data) return p.resume ? { doc: p.resume, contact, name } : null;
  const t = data.tailored.find((x) => x.id === p.resumeId) ?? data.tailored[0];
  return t?.doc ? { doc: arrange(t.doc, data.settings, t.layout).doc, contact, name } : null;
}

// The resume as the third pane shows it: the requirements map, then the page (exactly as sent, once it's sent). `p`:
// the pursuit, when started.
export function ResumePane({ postingId, company, title, p }: { postingId: Id<"postings">; company: string; title: string; p: Pursuit | null }) {
  const contact = useQuery(api.profile.get);
  const data = useQuery(api.resume.forPosting, { postingId });
  const name = resumeFile(company, title);
  if (!data) return null;
  const t = data.tailored.find((x) => x.id === (p?.sent ? p.sent.resumeId : p?.resumeId)) ?? (p?.sent ? undefined : data.tailored[0]);
  const busy = data.last?.status === "queued" || data.last?.status === "running";
  if (!t && !p?.sent) return <Text size="sm" muted>{busy ? "Tailoring…" : "No resume tailored to this role yet."}</Text>;
  return (
    <div className="flex flex-col gap-4">
      {t && (
        <section className="flex flex-col gap-2">
          <Text size="label">
            Requirements <span className="font-normal text-muted">{strongOf(t.requirements)}</span>
          </Text>
          <Requirements requirements={t.requirements} facts={data.facts} />
        </section>
      )}
      {p?.sent ? (
        p.sent.resume ? (
          <>
            <ExportMenu doc={p.sent.resume} contact={contact ?? null} name={name} resumeId={p.sent.resumeId ?? undefined} />
            <ResumeSheet doc={p.sent.resume} contact={contact ?? null} small />
          </>
        ) : (
          <Text size="sm" muted>It was sent without a resume tailored here.</Text>
        )
      ) : (
        t?.doc && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ExportMenu doc={arrange(t.doc, data.settings, t.layout).doc} contact={contact ?? null} name={name} resumeId={t.id} />
              <a href={resumeHref(t.id)} className="tap text-body-sm leading-body-sm text-text underline decoration-border underline-offset-3 hover:decoration-text">
                Titles and layout in Resumes
              </a>
            </div>
            <FactChanges target={{ kind: "resume", id: t.id }} />
            <EditSheet key={t.id} id={t.id} version={{ doc: t.doc, layout: t.layout ?? { roles: [] }, additions: null }} settings={data.settings} facts={data.facts} contact={contact ?? null} small canAdd={false} />
          </>
        )
      )}
    </div>
  );
}

// "Kept as sent" beside the pane's title once it's sent.
export const ResumePaneTag = ({ p }: { p: Pursuit | null }) => (p?.sent ? <StatusTag tone="info">Kept as sent</StatusTag> : null);

// The Resume tab: which version it uses (Tailor it again, the versions), and the resume itself unless it's open beside.
export function ResumeTab({ p, role }: { p: Pursuit; role: Role }) {
  const data = useQuery(api.resume.forPosting, p.sent ? "skip" : { postingId: role.id });
  const setResume = useMutation(api.pursuits.setResume);
  const { amount, tailor } = useTailor(role.id);
  const { third, open } = useThird();
  const beside = third?.kind === "resume";
  const showBeside = open && !beside ? (
    <Button variant="ghost" size="sm" icon="thirdPane" {...RESUME_BESIDE} onClick={() => open({ kind: "resume" })}>
      Open beside
    </Button>
  ) : null;
  if (p.sent)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag tone="info">Sent {day(p.sent.at)} · kept as sent</StatusTag>
          {showBeside}
        </div>
        {!beside && <ResumePane postingId={role.id} company={p.company} title={p.title} p={p} />}
      </div>
    );
  if (!data) return null;
  const busy = data.last?.status === "queued" || data.last?.status === "running";
  const t = data.tailored.find((x) => x.id === p.resumeId) ?? data.tailored[0];
  const directionId = p.direction?.id ?? role.fit[0]?.directionId;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {directionId ? (
          <CostAction
            amount={amount}
            budget="From your AI budget"
            loading={busy}
            loadingLabel="Tailoring"
            detail={`Writes a resume for this role from your approved record${p.direction ? `, for ${p.direction.name}` : ""}. Earlier versions stay.`}
            onClick={() => tailor(directionId)}
          >
            {t ? "Tailor it again" : "Tailor a resume"}
          </CostAction>
        ) : (
          <Text size="sm" muted>Approve a direction this role fits to tailor a resume to it.</Text>
        )}
        {data.tailored.length > 1 && t && (
          <Select
            label="Version in use"
            value={t.id as string}
            onChange={(id) => void setResume({ id: p.id, resumeId: id as Id<"resumes"> }).catch((e: unknown) => failed(e, "Couldn’t save that."))}
            options={data.tailored.map((x) => ({ value: x.id as string, label: `${new Date(x.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${x.direction.name}` }))}
          />
        )}
        {t && showBeside}
      </div>
      {!busy && data.last?.status === "failed" && <Text size="sm">The last try failed: {data.last.error}</Text>}
      {t && !beside && <ResumePane postingId={role.id} company={p.company} title={p.title} p={p} />}
    </div>
  );
}
