"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { type FormEvent, Fragment, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CONTACT_GROUPS, type ContactGroup, GROUP_LABELS } from "../../../convex/contactGroups";
import type { Reminder } from "../../../convex/pursuitSteps";
import { Avatar } from "@/components/Avatar";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { CostAction, RevealEmail } from "@/components/CostEstimate";
import { ExternalLink } from "@/components/ExternalLink";
import { Field, Input } from "@/components/Field";
import { Menu } from "@/components/Menu";
import { Select } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { day } from "./dates";
import { usePursuitResume } from "./Resume";
import { useThird } from "./third";
import { reminderTitle } from "./words";
import { downloadPdf } from "../resumes/Export";
import { aboutUsd } from "../costs";
import { useDemo } from "../demo/demo";

// Contacts at a pursuit's company, only when they ask (free Apollo searches), in three groups: Hiring manager, Team
// and Recruiting; an email revealed only for the person they choose, at its cost; a message to them, opened beside, to
// send from their own email. While outreach is quiet, the step due (follow up, or the next contact) leads, and its
// person is marked.

type People = FunctionReturnType<typeof api.people.list>;
type Person = People["people"][number];

const PARTS = [
  ["who", "Who I am"],
  ["why", "Why this role"],
  ["fit", "Why I fit"],
  ["ask", "The ask"],
] as const;

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });

// Find people at the company (free), and how many Apollo credits are left once some were found (not in the demo, which
// has no Apollo key and reads nothing on its own).
function useFind(pursuitId: Id<"pursuits">, company: string, found: boolean) {
  const find = useAction(api.people.find);
  const balance = useAction(api.apolloKey.balance);
  const demo = useDemo();
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (found && !demo) void balance({}).then((b) => setLeft(b?.left ?? null), () => setLeft(null));
  }, [found, demo, balance]);
  const go = () => {
    setBusy(true);
    void find({ pursuitId })
      .then((n) => n === 0 && toast({ message: `Apollo has no one listed at ${company}.`, icon: "people" }))
      .catch((e: unknown) => failed(e, "Couldn’t look."))
      .finally(() => setBusy(false));
  };
  return { go, busy, left };
}

// `due`: an outreach reminder due now (pursuitSteps.remindersOf); canApply: whether applying is still open to it, for
// its words.
export function PeopleTab({ pursuitId, company, due, canApply = false }: { pursuitId: Id<"pursuits">; company: string; due?: Reminder; canApply?: boolean }) {
  const data = useQuery(api.people.list, { pursuitId });
  const found = (data?.people.length ?? 0) > 0;
  const { go, busy, left } = useFind(pursuitId, company, found);
  if (!data) return null;
  const sent = data.people.flatMap((person) => person.sent.map((s) => ({ ...s, person: person.name }))).sort((a, b) => b.at - a.at);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Text size="label" className="flex-1">
          Contacts at {company}
        </Text>
        {found && left !== null && (
          <Text size="sm" muted tabular>
            {left.toLocaleString("en-US")} credits left
          </Text>
        )}
        <Button
          size="sm"
          variant={found ? "ghost" : "secondary"}
          icon="search"
          loading={busy}
          loadingLabel="Looking"
          detail={`Looks up the hiring manager, the team and recruiting at ${company} in Apollo. Emails stay hidden until you reveal one.`}
          note="Free"
          onClick={go}
        >
          {found ? "Find again" : "Find contacts"}
        </Button>
      </div>
      {due && (
        <section aria-label="Next step" className="flex flex-col gap-0.5 border-l-2 border-caution pl-3.5">
          <Text className="font-semibold">{reminderTitle(due, { company, canApply })}</Text>
          <Text size="sm" muted>
            {due.text}.
          </Text>
        </section>
      )}
      {found ? (
        <>
          <Text size="sm" muted>
            Hiring manager, team and recruiting all work. Write to one person at a time; if they don’t reply after a follow-up, try the next.
          </Text>
          {CONTACT_GROUPS.map((g, i) => {
            const people = data.people.filter((x) => x.group === g);
            return (
              <section key={g} aria-label={GROUP_LABELS[g].title} className="flex flex-col">
                <div className="flex items-baseline gap-2 border-b pb-1.5">
                  <Text size="label" muted tabular>
                    {i + 1}
                  </Text>
                  <Text size="label-caps">{GROUP_LABELS[g].title}</Text>
                  <Text size="sm" muted className="min-w-0 truncate">
                    {GROUP_LABELS[g].line}
                  </Text>
                </div>
                {people.length > 0 ? (
                  <ul className="flex flex-col">
                    {people.map((person) => (
                      <PersonRow key={person.id} person={person} flag={due?.contact?.id === person.id ? (due.step === "nextContact" ? "Next contact" : "Follow up") : undefined} />
                    ))}
                  </ul>
                ) : (
                  <Text size="sm" muted className="px-3 py-2">
                    No one found
                  </Text>
                )}
              </section>
            );
          })}
        </>
      ) : (
        <Text size="sm" muted>
          Find the hiring manager, people on the team and recruiters, then reveal the email of the one you want to write to.
        </Text>
      )}
      <AddContact pursuitId={pursuitId} company={company} />
      {sent.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Text size="label">Sent</Text>
          {sent.map((s) => (
            <Text key={s.at} size="sm" className="flex gap-4">
              <span className="w-14 shrink-0 text-muted tabular-nums">{day(s.at)}</span>
              <span className="min-w-0">
                To {s.person} · {s.subject}
              </span>
            </Text>
          ))}
        </section>
      )}
    </div>
  );
}

// Add a contact: someone they know at the company, with the email they type, in the group they choose. Free; no
// Apollo. Offered under the groups, and the way in when Apollo can't look the company up.
function AddContact({ pursuitId, company }: { pursuitId: Id<"pursuits">; company: string }) {
  const add = useMutation(api.people.add);
  const [form, setForm] = useState<{ name: string; title: string; email: string; group: ContactGroup } | null>(null);
  const [error, setError] = useState<string>();
  if (!form)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button size="sm" variant="ghost" icon="add" detail={`Adds someone you know at ${company}, with the email you type.`} note="Free" onClick={() => setForm({ name: "", title: "", email: "", group: "hiringManager" })}>
          Add a contact
        </Button>
        <Text size="sm" muted>
          Someone you know there
        </Text>
      </div>
    );
  const save = (e: FormEvent) => {
    e.preventDefault();
    void add({ pursuitId, ...form }).then(
      () => {
        setForm(null);
        setError(undefined);
      },
      (x: unknown) => setError(x instanceof ConvexError ? String(x.data) : "Couldn’t add them."),
    );
  };
  return (
    <form noValidate onSubmit={save} aria-label="Add a contact" className="flex flex-col gap-3 rounded-sm border p-4">
      <Text size="label">Add a contact</Text>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" error={error}>
          {(p) => <Input {...p} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label="Title">{(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
        <Field label="Email">{(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <div className="flex flex-col gap-1.5">
          <Text size="label" aria-hidden>
            Group
          </Text>
          <Select label="Group" value={form.group} onChange={(group) => setForm({ ...form, group })} options={CONTACT_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g].title }))} className="w-full" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" detail="Adds them to this pursuit’s contacts." note="Free">
          Add
        </Button>
        <Button size="sm" variant="ghost" detail="Closes the form without adding anyone." note="Free" onClick={() => setForm(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Mark a reply from a contact, with Undo (which also puts the pursuit's status back if the reply moved it).
export function useMarkReplied() {
  const mark = useMutation(api.people.markReplied);
  const unmark = useMutation(api.people.unmarkReplied);
  return (x: { id: Id<"contacts">; name: string }) =>
    void mark({ contactId: x.id }).then(
      (status) => toast({ message: `${x.name} replied`, icon: "done", action: { label: "Undo", key: "U", run: () => void unmark({ contactId: x.id, status }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
}

// One person: initials, name (Replied, the step due for them, Sent, or Likely hiring manager), title and email; ⋯
// marks a reply and moves them to another group. Not revealed: its cost and Reveal email. Revealed: the row opens the
// message to them beside (on Pursuits; Getting started has no pane beside).
export function PersonRow({ person: x, flag }: { person: Person; flag?: string }) {
  const reveal = useAction(api.people.reveal);
  const setGroup = useMutation(api.people.setGroup);
  const unmark = useMutation(api.people.unmarkReplied);
  const markReplied = useMarkReplied();
  const { third, open } = useThird();
  const [busy, setBusy] = useState(false);
  const on = third?.kind === "message" && third.contactId === x.id;
  const body = (
    <>
      <Avatar name={x.name} size={28} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body-md leading-body-md text-text">{x.name}</span>
          {x.repliedAt !== null ? (
            <StatusTag tone="good">Replied {day(x.repliedAt)}</StatusTag>
          ) : flag ? (
            <StatusTag tone="caution">{flag}</StatusTag>
          ) : x.sent.length > 0 ? (
            <StatusTag tone="neutral">Sent {day(x.sent[0].at)}</StatusTag>
          ) : (
            x.hiringManager && <StatusTag tone="neutral">Likely hiring manager</StatusTag>
          )}
        </span>
        <span className="truncate text-body-sm leading-body-sm text-muted">{[x.title, x.email ?? (x.revealed && !x.added ? "No email in Apollo" : null)].filter(Boolean).join(" · ")}</span>
      </span>
    </>
  );
  return (
    <li className={`flex min-h-14 items-center gap-3 border-b px-3 py-2 ${on ? "bg-steel-subtle" : ""}`}>
      {x.revealed && open ? (
        <button type="button" onClick={() => open({ kind: "message", contactId: x.id, name: x.name })} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left">
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      {x.linkedinUrl && <ExternalLink href={x.linkedinUrl} label="Open on LinkedIn" />}
      <Menu
        label={`More for ${x.name}`}
        title={x.name}
        items={[
          x.repliedAt === null
            ? { label: "Mark a reply", icon: "done" as const, detail: "Records that this person answered. Moves the pursuit to In conversation if it’s behind.", note: "Free · Undo with U", onSelect: () => markReplied(x) }
            : { label: "Clear the reply", icon: "undo" as const, detail: "Takes back that this person answered.", note: "Free", onSelect: () => void unmark({ contactId: x.id }).catch((e: unknown) => failed(e, "Couldn’t save that.")) },
          "separator" as const,
          ...CONTACT_GROUPS.filter((g) => g !== x.group).map((g) => ({
            label: `Move to ${GROUP_LABELS[g].title}`,
            detail: "Puts this person in another group. Changes the order only.",
            note: "Free",
            onSelect: () => void setGroup({ contactId: x.id, group: g }).catch((e: unknown) => failed(e, "Couldn’t move them.")),
          })),
        ]}
      />
      {!x.revealed && (
        <RevealEmail
          person={x.name}
          cost="1 credit"
          note="1 Apollo credit"
          loading={busy}
          onReveal={() => {
            setBusy(true);
            void reveal({ contactId: x.id })
              .then((email) => !email && toast({ message: `Apollo has no email for ${x.name}.`, icon: "email" }))
              .catch((e: unknown) => failed(e, "Couldn’t reveal it."))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </li>
  );
}

// The outreach message to one person, beside the item: written from their approved record, with what it's built on
// and what each of its four parts says; Copy and open Mail, Download resume (a mailto draft can't attach a file), Mark
// as sent; Rewrite at its cost. What was sent to them before, under it.
export function Message({ pursuitId, contactId }: { pursuitId: Id<"pursuits">; contactId: Id<"contacts"> }) {
  const data = useQuery(api.people.list, { pursuitId });
  const resume = usePursuitResume(pursuitId);
  const costs = useQuery(api.estimates.costs, {});
  const draft = useMutation(api.people.draft);
  const markSent = useMutation(api.people.markSent);
  const markReplied = useMarkReplied();
  const x = data?.people.find((c) => c.id === contactId);
  if (!data || !x) return null;
  const d = x.draft;
  const amount = aboutUsd(costs?.outreach) ?? "Uses your AI budget";
  const write = () => void draft({ contactId }).catch((e: unknown) => failed(e, "Couldn’t start it."));
  const detail = `Writes an outreach message to ${x.name} from your approved record and this role: who you are, why this role, why you fit, and one small ask.`;
  return (
    <div className="flex flex-col gap-3">
      {d ? (
        <div className="flex flex-col rounded-sm border bg-surface">
          <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
            <div className="flex items-start gap-3">
              <Text className="min-w-0 flex-1 font-semibold">{d.subject}</Text>
              {d.factIds.length > 0 && <BuiltOnPeek align="end" sources={d.factIds.flatMap((id) => (data.facts[id] ? [{ kind: "fact" as const, text: data.facts[id], source: "Approved fact", approved: true }] : []))} />}
            </div>
            <Text className="whitespace-pre-line">{d.text}</Text>
          </div>
          <div className="mx-4 flex items-center gap-2 border-t py-2">
            <CostAction amount={amount} budget="From your AI budget" variant="ghost" size="sm" icon="tryAgain" loading={x.writing} loadingLabel="Writing" detail={detail} onClick={write}>
              Rewrite
            </CostAction>
          </div>
          {d.parts && (
            <section aria-label="What it says" className="mx-4 flex flex-col gap-1.5 border-t py-3">
              <Text size="label-caps" muted>
                What it says
              </Text>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm leading-body-sm">
                {PARTS.map(([key, label]) => (
                  <Fragment key={key}>
                    <dt className="text-text">{label}</dt>
                    <dd className="min-w-0 text-muted">{d.parts![key]}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          )}
        </div>
      ) : (
        <CostAction amount={amount} budget="From your AI budget" variant="primary" loading={x.writing} loadingLabel="Writing" detail={detail} onClick={write}>
          Draft a message
        </CostAction>
      )}
      {x.failed !== null && !x.writing && <Text size="sm">The last try failed: {x.failed}</Text>}
      {d && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon="email"
            detail="Copies the message and opens it in your email, addressed and ready to send."
            note="Free"
            onClick={() => {
              void navigator.clipboard.writeText(`${d.subject}\n\n${d.text}`).then(() => toast({ message: "Copied the message", icon: "copy" }));
              window.location.href = `mailto:${encodeURIComponent(x.email ?? "")}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.text)}`;
            }}
          >
            Copy and open Mail
          </Button>
          {resume && (
            <Button
              variant="secondary"
              icon="export"
              detail="Downloads this pursuit’s tailored resume as a PDF to attach to your email."
              note="Free"
              reason={resume.contact?.name ? undefined : "Add your name at the top of the resume first."}
              onClick={() => resume.contact && void downloadPdf(resume.doc, resume.contact, resume.name)}
            >
              Download resume
            </Button>
          )}
          {x.draftSent ? (
            <StatusTag tone="good" icon="done">
              Sent
            </StatusTag>
          ) : (
            <Button variant="ghost" detail="Keeps the message as sent, on the pursuit's timeline." note="Free" onClick={() => void markSent({ contactId }).catch((e: unknown) => failed(e, "Couldn’t save that."))}>
              Mark as sent
            </Button>
          )}
          {x.sent.length > 0 && x.repliedAt === null && (
            <Button variant="ghost" icon="done" detail="Records that this person answered. Moves the pursuit to In conversation if it’s behind." note="Free · Undo with U" onClick={() => markReplied(x)}>
              Mark a reply
            </Button>
          )}
        </div>
      )}
      {x.sent.length > 0 && (
        <section className="flex flex-col gap-3 pt-2">
          <Text size="label">Sent</Text>
          {x.sent.map((s) => (
            <div key={s.at} className="flex flex-col gap-1 border-l-2 border-good pl-3">
              <Text size="sm" muted>
                {day(s.at)} · to {s.to}
              </Text>
              <Text size="sm" className="font-medium">
                {s.subject}
              </Text>
              <Text size="sm" className="whitespace-pre-line">
                {s.text}
              </Text>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
