"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CLOSED_REASONS, type ClosedReason, DONE, PURSUIT_STATUSES, type PursuitStatus, REASON_LABELS, remindersOf, STATUS_LABELS, takesApply } from "../../../convex/pursuitSteps";
import { Button, type ButtonSize, buttonLook } from "@/components/Button";
import { Icons } from "@/components/icons";
import { Menu, type MenuEntry } from "@/components/Menu";
import { Select } from "@/components/Select";
import { TabPanel, Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { useNow } from "../clock";
import { useBar } from "../shell/ShellContext";
import { AnswersTab } from "./Answers";
import { day } from "./dates";
import { MARK_SENT, SendActions, useFollowUp } from "./FollowUp";
import { LetterTab } from "./Letter";
import { Notes, PursuitOverview, showsFollowUp } from "./Overview";
import { PeopleTab } from "./People";
import { ResumeTab } from "./Resume";
import { Head, RoleBody, Section, useRoleEntries } from "./RoleItem";
import { type ItemNav, ItemTop, onItemKey, useThird } from "./third";
import { ASK_BESIDE, placeAndPay, type Pursuit, RESUME_BESIDE, type Role } from "./words";

// A started pursuit: its status (Closed with why), when it was sent or the step to take (Apply, prepare for the
// interview), Ask and People, and the tailored resume beside it. Tabs: Overview (next step, the follow-up, the
// interview day, timeline), Role (the role as it showed before it was started), Resume, Letter, Answers, People, Notes;
// ?tab= opens it at one (Getting started's links). A pursuit with no open role (role null) has Overview, Role (what the
// company does and the direction it's for; none if neither is known), People and Notes, and no resume, letter or Ask
// beside it.

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
type Choice = Exclude<PursuitStatus, "closed"> | `closed:${ClosedReason}`;
const TABS = ["overview", "role", "resume", "letter", "answers", "people", "notes"] as const;
type Tab = (typeof TABS)[number];

// Its status as one choice: the open statuses, then Closed with each reason. A change can be undone.
function StatusSelect({ p }: { p: Pursuit }) {
  const setStatus = useMutation(api.pursuits.setStatus);
  const value: Choice = p.status === "closed" ? `closed:${p.closedReason ?? "rejected"}` : p.status;
  const choose = (c: Choice) => {
    const [status, reason] = c.split(":") as [PursuitStatus, ClosedReason | undefined];
    const before = { status: p.status, reason: p.closedReason ?? undefined };
    void setStatus({ id: p.id, status, reason }).then(
      () => toast({ message: `${p.company}: ${status === "closed" ? `Closed · ${REASON_LABELS[reason!]}` : STATUS_LABELS[status]}`, icon: "done", action: { label: "Undo", key: "U", run: () => void setStatus({ id: p.id, ...before }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  return (
    <Select
      label="Status"
      value={value}
      onChange={choose}
      className="min-w-0 md:min-w-0"
      options={[
        ...PURSUIT_STATUSES.filter((s): s is Exclude<PursuitStatus, "closed"> => s !== "closed").map((s) => ({ value: s as Choice, label: STATUS_LABELS[s] })),
        "separator",
        ...CLOSED_REASONS.map((r) => ({ value: `closed:${r}` as Choice, label: `Closed · ${REASON_LABELS[r]}` })),
      ]}
    />
  );
}

// The step the header offers: Apply while it's being prepared or contacted and not yet applied (unless its path is
// Outreach alone: Find contacts then), preparing for the interview while interviewing. null: the dates it was
// contacted and applied, or how far a closed one got, in words instead.
function Step({ p, role, size, primary, onPrepare, onPeople }: { p: Pursuit; role: Role | null; size: ButtonSize; primary: boolean; onPrepare: (() => void) | null; onPeople: () => void }) {
  if (p.status === "preparing" && p.path === "outreach")
    return (
      <Button variant={primary ? "primary" : "secondary"} size={size} className={size === "lg" ? "flex-1" : ""} icon="people" detail={`Shows people at ${p.company} to write to.`} note="Finding is free · an email is 1 credit" onClick={onPeople}>
        Find contacts
      </Button>
    );
  if (role && (p.status === "preparing" || (p.status === "contacted" && takesApply(p.path))) && p.appliedAt === null) {
    const href = role.applyUrl ?? role.url;
    return (
      <a href={href} target="_blank" rel="noreferrer" className={buttonLook(primary ? "primary" : "secondary", size === "lg" ? "flex-1" : "", size)}>
        <Icons.openElsewhere aria-hidden />
        Apply
      </a>
    );
  }
  if (p.status === "interviewing" && onPrepare)
    return (
      <Button variant={primary ? "primary" : "secondary"} size={size} className={size === "lg" ? "flex-1" : ""} icon="ask" detail="Opens Ask about this role, to prepare for the interview with your record and the posting." note="Free to open" onClick={onPrepare}>
        {size === "lg" ? "Prepare" : "Prepare for the interview"}
      </Button>
    );
  return null;
}

const stepWords = (p: Pursuit) =>
  p.status === "closed"
    ? p.reached
      ? `Got as far as ${STATUS_LABELS[p.reached]}`
      : null
    : [p.contactedAt !== null && `Contacted ${day(p.contactedAt)}`, p.appliedAt !== null ? `Applied ${day(p.appliedAt)}` : p.sent && `Sent ${day(p.sent.at)}`].filter(Boolean).join(" · ") || null;

export function PursuitItem({ p, role, nav, small }: { p: Pursuit; role: Role | null; nav: ItemNav | null; small: boolean }) {
  const { third, open: openThird } = useThird();
  // Ask and the tailored resume open beside a pursuit of a role.
  const open = role ? openThird : null;
  const asked = useSearchParams().get("tab");
  const outreach = p.companySummary !== null || p.direction !== null;
  const tabNames: readonly Tab[] = role ? TABS : TABS.filter((t) => t === "overview" || (t === "role" && outreach) || t === "people" || t === "notes");
  const [tab, setTab] = useState<Tab>(() => tabNames.find((t) => t === asked) ?? "overview");
  const now = useNow(true);
  const done = useMutation(api.pursuits.done);
  const people = useQuery(api.people.list, { pursuitId: p.id });
  const notes = useQuery(api.notes.list, { subject: { kind: "pursuit", id: p.id } });
  const f = useFollowUp(p.id);
  const common = useRoleEntries(role, p.direction?.id ?? null);
  const due = remindersOf(p, now, p.rules)[0];
  const following = showsFollowUp(due, f);
  const toggle = (kind: "ask" | "resume") => open?.(third?.kind === kind ? null : { kind });
  const prepare = open ? () => open({ kind: "ask" }) : null;

  const menu: MenuEntry[] = [
    ...(open ? [{ label: "Ask about this role", icon: "ask" as const, keys: "/", ...ASK_BESIDE, onSelect: () => open({ kind: "ask" }) }] : []),
    { label: "People", icon: "people", detail: `Shows people at ${p.company} you could reach out to.`, note: "Free", onSelect: () => setTab("people") },
    ...(open ? [{ label: "Tailored resume", icon: "thirdPane" as const, ...RESUME_BESIDE, onSelect: () => open({ kind: "resume" }) }] : []),
    ...(due && !due.step ? ["separator" as const, { label: DONE[due.rule].label, icon: "done" as const, hint: "Free", detail: "Marks it done on the timeline.", note: "Free", onSelect: () => void done({ id: p.id, rule: due.rule }).catch((e: unknown) => failed(e, "Couldn’t save that.")) }] : []),
    ...(small && following && f.data?.draft ? [{ label: "Mark as sent", icon: "done" as const, hint: "Free", ...MARK_SENT, onSelect: f.markSent }] : []),
    ...(common.length ? ["separator" as const, ...common] : []),
  ];

  useEffect(() => {
    const onKey = onItemKey({ ...(open ? { "/": () => toggle("ask") } : {}), ...(role ? { o: () => window.open(role.url, "_blank", "noreferrer") } : {}) });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // On a phone the bar holds ⋯, the resume (as its icon) and the pane's one main action. While a follow-up is due Copy
  // and open Mail takes the room, with Mark as sent and the resume in ⋯, so the bar never runs past the screen.
  const main = following ? <SendActions f={f} size="lg" small primaryOnly /> : <Step p={p} role={role} size="lg" primary onPrepare={prepare} onPeople={() => setTab("people")} />;
  useBar(
    small
      ? {
          kind: "actions",
          actions: (
            <>
              <Menu label={`More for ${p.title}`} title={p.title} items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />
              {open && !following && (
                <Button size="lg" iconOnly icon="resumes" aria-label="Tailored resume" {...RESUME_BESIDE} onClick={() => open({ kind: "resume" })} />
              )}
              {main}
            </>
          ),
        }
      : null,
  );

  const words = stepWords(p);
  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "role", label: "Role" },
    { value: "resume", label: "Resume" },
    { value: "letter", label: "Letter" },
    { value: "answers", label: "Answers", count: p.answers.length || undefined },
    { value: "people", label: "People", count: people?.people.length || undefined },
    { value: "notes", label: "Notes", count: notes?.length || undefined },
  ].filter((t) => tabNames.includes(t.value as Tab));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-4">
      {nav && (
        <ItemTop
          nav={nav}
          small={small}
          menu={menu}
          title={p.title}
          actions={
            open && (
              <Button variant="ghost" iconOnly icon="thirdPane" aria-label="Tailored resume" aria-pressed={third?.kind === "resume"} className="aria-pressed:bg-border" {...RESUME_BESIDE} onClick={() => toggle("resume")} />
            )
          }
        />
      )}
      <Head score={p.score} level={p.level} title={p.title} companyId={p.companyId} company={p.company} line={role ? placeAndPay(role) : "No open role"} closed={p.closed}>
        <div data-tour="pursuits.status" className="flex flex-wrap items-center gap-x-3 gap-y-2 md:pl-[54px]">
          <StatusSelect p={p} />
          {!small && <Step p={p} role={role} size="md" primary={!following} onPrepare={prepare} onPeople={() => setTab("people")} />}
          {words && <Text size="sm" muted>{words}</Text>}
          <span className="flex-1" />
          {open && !small && (
            <Button variant="ghost" iconOnly icon="ask" aria-label="Ask about this role" keys="/" aria-pressed={third?.kind === "ask"} className="aria-pressed:bg-border" {...ASK_BESIDE} onClick={() => toggle("ask")} />
          )}
          {!small && <Button variant="ghost" iconOnly icon="people" aria-label="People" aria-pressed={tab === "people"} className="aria-pressed:bg-border" detail={`Shows people at ${p.company} you could reach out to.`} note="Free" onClick={() => setTab("people")} />}
        </div>
      </Head>
      <Tabs tabs={tabs} value={tab} onValueChange={(v) => setTab(v as Tab)} label="Pursuit" inFlow className="sticky top-0 z-10 bg-surface px-4 md:px-6 lg:px-8">
        <TabPanel value="overview" className="px-4 py-6 md:px-6 lg:px-8">
          <PursuitOverview p={p} f={f} due={due} onPeople={() => setTab("people")} />
        </TabPanel>
        {role ? (
          <TabPanel value="role">
            <RoleBody role={role} />
          </TabPanel>
        ) : (
          outreach && (
            <TabPanel value="role" className="px-4 py-6 md:px-6 lg:px-8">
              <OutreachRole p={p} />
            </TabPanel>
          )
        )}
        {role && (
          <>
            <TabPanel value="resume" className="px-4 py-6 md:px-6 lg:px-8">
              <ResumeTab p={p} role={role} />
            </TabPanel>
            <TabPanel value="letter" className="px-4 py-6 md:px-6 lg:px-8">
              <LetterTab p={p} />
            </TabPanel>
            <TabPanel value="answers" className="px-4 py-6 md:px-6 lg:px-8">
              <AnswersTab p={p} />
            </TabPanel>
          </>
        )}
        <TabPanel value="people" className="px-4 py-6 md:px-6 lg:px-8">
          <PeopleTab pursuitId={p.id} company={p.company} due={due?.rule === "followUp" && (due.step || due.contact) ? due : undefined} canApply={!!role && p.appliedAt === null} />
        </TabPanel>
        <TabPanel value="notes" className="px-4 py-6 md:px-6 lg:px-8">
          <Notes subject={{ kind: "pursuit", id: p.id }} heading={false} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

// A pursuit with no open role, in place of the role: what the company does and the direction it's for.
function OutreachRole({ p }: { p: Pursuit }) {
  return (
    <div className="flex flex-col gap-6">
      <Section title={`About ${p.company}`}>
        {p.companySummary ? (
          <Text measure>{p.companySummary}</Text>
        ) : (
          <Text size="sm" muted>
            Its website hasn’t been read yet.
          </Text>
        )}
        <Link href={`/companies?company=${p.companyId}`} className="w-fit text-body-sm leading-body-sm underline decoration-border underline-offset-3 hover:decoration-text">
          Open in Companies
        </Link>
      </Section>
      {p.direction && (
        <Section title="Direction">
          <Text measure>
            <span className="font-medium">{p.direction.name}</span>
            {p.directionSummary && <> · {p.directionSummary}</>}
          </Text>
          <Link href={`/goals/directions?direction=${p.direction.id}`} className="w-fit text-body-sm leading-body-sm underline decoration-border underline-offset-3 hover:decoration-text">
            Open in Directions
          </Link>
        </Section>
      )}
      <Text size="sm" muted measure>
        No open role: this pursuit reaches out to {p.company} directly.
      </Text>
    </div>
  );
}
