"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, Input } from "@/components/Field";
import { List, ListRow } from "@/components/ListRow";
import { Menu, type MenuEntry } from "@/components/Menu";
import { NumberField } from "@/components/NumberField";
import { PaneHeader, PaneLayout, type ScreenSize, useScreenSize } from "@/components/Panes";
import { ProgressBar } from "@/components/Progress";
import { StatusTag, type StatusTone } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { day } from "../pursuits/dates";
import { usd } from "../settings/Budgets";
import { GroupHead, SettingsPane } from "../settings/ui";
import { useConfirm } from "../shell/ShellContext";

// careerbot.dev's admin screen (Admin in Paper), for its operators: People (invite someone, and for each person their
// invite, when they were last active and their AI this month against their allowance, with Set allowance, Suspend and
// Restore; for an invite, Copy link, Send a new link and Withdraw), Cost by step (this month's AI cost per person by
// step: the median, the 95th percentile and the total) and Log (every operator action). Nothing from anyone's
// workspace shows here: no record, stories or resumes.

export type People = FunctionReturnType<typeof api.adminPeople.people>;
export type Person = People[number];
export type Costs = FunctionReturnType<typeof api.adminPeople.costByStep>;
export type LogEntry = FunctionReturnType<typeof api.adminPeople.log>[number];

const SECTIONS = [
  { key: "people", title: "People" },
  { key: "cost", title: "Cost by step" },
  { key: "log", title: "Log" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

const STATUS: Record<Person["status"], { label: string; tone: StatusTone }> = {
  active: { label: "Active", tone: "good" },
  invited: { label: "Invited", tone: "info" },
  expired: { label: "Expired", tone: "neutral" },
  revoked: { label: "Withdrawn", tone: "neutral" },
  suspended: { label: "Suspended", tone: "problem" },
};

const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const linkOf = (path: string) => `${location.origin}${path}`;
const copyLink = (path: string, message: string) =>
  void navigator.clipboard.writeText(linkOf(path)).then(
    () => toast({ message, icon: "copy" }),
    () => toast({ message: `Couldn’t copy it. The link is ${linkOf(path)}`, icon: "failed" }),
  );

export function Admin() {
  const size = useScreenSize();
  const small = size === "small";
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const people = useQuery(api.adminPeople.people);
  const costs = useQuery(api.adminPeople.costByStep);
  const log = useQuery(api.adminPeople.log);
  const asked = params.get("section");
  const chosen: Section | null = SECTIONS.some((s) => s.key === asked) ? (asked as Section) : small ? null : "people";
  const open = (key: Section | null) => router.push(key ? `${path}?section=${key}` : path, { scroll: false });

  const invited = people?.filter((p) => p.status === "invited").length ?? 0;
  const lines: Record<Section, string | undefined> = {
    people: people && `${people.length} ${people.length === 1 ? "person" : "people"}${invited ? ` · ${invited} invited` : ""}`,
    cost: costs && (costs.person.people ? `Median ${usd(costs.person.medianUsd)} a person this month` : "No AI used this month"),
    log: log && (log[0] ? `Last: ${actionWords(log[0])}, ${log[0].email}` : "Nothing yet"),
  };

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Admin" />
      <List label="Admin" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {SECTIONS.map((s) => (
          <ListRow key={s.key} title={s.title} line={lines[s.key] ?? " "} selected={!small && chosen === s.key} onOpen={() => open(s.key)} />
        ))}
      </List>
    </div>
  );
  const panes: Record<Section, React.ReactNode> = {
    people: <PeoplePane size={size} people={people} />,
    cost: <CostPane size={size} costs={costs} />,
    log: <LogPane size={size} log={log} />,
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout list={list} item={chosen ? panes[chosen] : undefined} back={{ label: "Admin", onBack: () => open(null) }} />
    </div>
  );
}

// ---- People ----

export function PeoplePane({ size, people }: { size: ScreenSize; people: People | undefined }) {
  const ask = useConfirm();
  const suspend = useMutation(api.adminPeople.suspend);
  const restore = useMutation(api.adminPeople.restore);
  const resend = useMutation(api.adminPeople.resendInvite);
  const revoke = useMutation(api.adminPeople.revokeInvite);
  const [allowanceFor, setAllowanceFor] = useState<Person | null>(null);
  const small = size === "small";
  const spent = (people ?? []).reduce((n, p) => n + (p.spentUsd ?? 0), 0);
  const spenders = (people ?? []).filter((p) => (p.spentUsd ?? 0) > 0).length;

  const menu = (p: Person): MenuEntry[] => {
    const who = p.name ?? p.email ?? "them";
    if (!p.userId) {
      const email = p.email!;
      return [
        ...(p.link ? [{ label: "Copy invite link", icon: "copy" as const, detail: `Copies the link to send ${email}.`, note: "Free", onSelect: () => copyLink(p.link!, "Invite link copied") }] : []),
        {
          label: "Send a new link",
          detail: `Makes a new invite link for ${email}, good for 14 days, and copies it. The old link stops working.`,
          note: "Free",
          onSelect: () => void resend({ email }).then(({ link }) => copyLink(link, "New invite link copied"), (e: unknown) => failed(e, "Couldn’t make a new link.")),
        },
        ...(p.status !== "revoked"
          ? [{ label: "Withdraw invite", tone: "danger" as const, detail: `${email} can no longer sign up with this invite.`, note: "Free · Send a new link to undo", onSelect: () => void revoke({ email }).then(() => toast({ message: "Invite withdrawn" }), (e: unknown) => failed(e, "Couldn’t withdraw it.")) }]
          : []),
      ];
    }
    const userId = p.userId;
    return [
      ...(p.plan && p.status !== "suspended" ? [{ label: "Set allowance", detail: `${who}’s monthly AI on CareerBot’s key.`, note: "Free", onSelect: () => setAllowanceFor(p) }] : []),
      p.status === "suspended"
        ? { label: "Restore", detail: `${who} can sign in again.`, note: "Free", onSelect: () => void restore({ userId }).then(() => toast({ message: `${who} restored` }), (e: unknown) => failed(e, "Couldn’t restore them.")) }
        : {
            label: "Suspend",
            tone: "danger" as const,
            detail: `Signs ${who} out everywhere; they can’t sign in until restored. Their workspace is kept.`,
            note: "Free · Asks first · Restore to undo",
            onSelect: () =>
              void (async () => {
                if (!(await ask({ title: `Suspend ${who}?`, body: `Signs ${who} out everywhere; they can’t sign in until you restore them. Their workspace is kept.`, confirmLabel: "Suspend" }))) return;
                await suspend({ userId }).then(() => toast({ message: `${who} suspended` }), (e: unknown) => failed(e, "Couldn’t suspend them."));
              })(),
          },
    ];
  };

  return (
    <SettingsPane title="People" size={size} wide>
      <InviteForm small={small} />
      <section aria-label="People" className="flex flex-col">
        <div className="flex flex-wrap items-baseline gap-x-2 pb-4">
          <span className="text-title-lg leading-title-lg font-semibold tracking-title-lg text-text tabular-nums">{usd(spent)}</span>
          <Text size="md" muted as="span">
            of AI across {spenders} {spenders === 1 ? "person" : "people"} this month
          </Text>
        </div>
        {!small && (
          <div className="flex items-center gap-4 border-b py-1.5 text-label leading-label font-medium text-muted">
            <span className="min-w-0 flex-1">Person</span>
            <span className="w-28 shrink-0">Status</span>
            <span className="w-26 shrink-0">Last active</span>
            <span className="w-36 shrink-0">AI this month</span>
            <span className="w-8 shrink-0" />
          </div>
        )}
        <ul aria-label="People" className="flex flex-col">
          {(people ?? []).map((p) => (
            <li key={p.key} className="border-b">
              <PersonRow person={p} small={small} menu={menu(p)} />
            </li>
          ))}
        </ul>
      </section>
      {allowanceFor && <AllowanceDialog person={allowanceFor} onClose={() => setAllowanceFor(null)} />}
    </SettingsPane>
  );
}

function PersonRow({ person: p, small, menu }: { person: Person; small: boolean; menu: MenuEntry[] }) {
  const status = STATUS[p.status];
  const title = p.name ?? p.email ?? "Someone";
  const sub = p.userId ? (p.name ? p.email : null) : p.expiresAt && `Invited ${day(p.invitedAt!)} · ${p.status === "invited" ? "expires" : "expired"} ${day(p.expiresAt)}`;
  const last = p.lastActive ? day(p.lastActive) : "—";
  const ai =
    p.spentUsd === null ? (
      <Text size="sm" muted as="span">
        —
      </Text>
    ) : (
      <AiSpent spentUsd={p.spentUsd} plan={p.plan} />
    );
  const more = <Menu label={`More for ${title}`} title={title} items={menu} />;
  if (small)
    return (
      <div className="flex items-start gap-3 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-body-md leading-body-md font-medium text-text">{title}</span>
            <StatusTag tone={status.tone}>{status.label}</StatusTag>
          </div>
          <Text size="sm" muted>
            {p.userId ? (p.lastActive ? `Active ${last}` : "Not active yet") : sub}
          </Text>
          {p.spentUsd !== null && ai}
        </div>
        {more}
      </div>
    );
  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm leading-body-sm font-medium text-text">{title}</span>
        {sub && <span className="truncate text-body-sm leading-body-sm text-muted">{sub}</span>}
      </div>
      <span className="flex w-28 shrink-0">
        <StatusTag tone={status.tone}>{status.label}</StatusTag>
      </span>
      <span className="w-26 shrink-0 text-body-sm leading-body-sm text-text first-letter:uppercase">{last}</span>
      <span className="flex w-36 shrink-0">{ai}</span>
      <span className="flex w-8 shrink-0 justify-end">{more}</span>
    </div>
  );
}

// What someone's AI cost this month: against their allowance on CareerBot's key, or on their own key.
function AiSpent({ spentUsd, plan }: { spentUsd: number; plan: Person["plan"] }) {
  const of = plan?.source === "platform" ? `of ${usd(plan.allowanceUsd)}` : plan ? "own key" : "";
  return (
    <div className="flex w-full flex-col gap-1">
      <span className="flex items-baseline gap-1 text-body-sm leading-body-sm">
        <span className="font-medium text-text tabular-nums">{usd(spentUsd)}</span>
        {of && <span className="text-muted">{of}</span>}
      </span>
      {plan?.source === "platform" && (
        <ProgressBar label="AI this month" value={spentUsd} max={plan.allowanceUsd} status={spentUsd >= plan.allowanceUsd ? "stopped" : "running"} valueText={`${usd(spentUsd)} ${of}`} />
      )}
    </div>
  );
}

// Invite someone by email: the link is made and copied, and shown to copy again.
function InviteForm({ small }: { small: boolean }) {
  const invite = useMutation(api.adminPeople.invite);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [made, setMade] = useState<{ email: string; link: string } | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) return setError("Type their email first.");
    setSending(true);
    setError(undefined);
    try {
      const { link } = await invite({ email });
      setMade({ email: email.trim().toLowerCase(), link });
      setEmail("");
      copyLink(link, "Invite link copied");
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Couldn’t invite them. Try again.");
    } finally {
      setSending(false);
    }
  };
  return (
    <section aria-label="Invite" className="flex flex-col gap-3">
      <form noValidate onSubmit={submit} className={`flex gap-2 ${small ? "flex-col" : "items-start"}`}>
        <Field label="Email" hideLabel hint="A link for one person, good for 14 days. AI is included up to their allowance each month." error={error} className="min-w-0 flex-1">
          {(p) => <Input {...p} type="email" autoComplete="off" spellCheck={false} placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" size={small ? "lg" : "md"} loading={sending} loadingLabel="Inviting" detail="Makes an invite link for this email, good for 14 days, and copies it for you to send." note="Free">
          Invite
        </Button>
      </form>
      {made && (
        <div role="status" className="flex flex-col gap-2 rounded-sm border border-steel bg-steel-subtle p-3">
          <p className="text-body-sm leading-body-sm font-medium text-text">Invite link for {made.email}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 rounded-sm bg-surface px-2 py-1 font-mono text-body-sm leading-body-sm break-all text-text select-all">{linkOf(made.link)}</code>
            <Button size="sm" icon="copy" detail="Copies the invite link." note="Free" onClick={() => copyLink(made.link, "Invite link copied")}>
              Copy
            </Button>
          </div>
          <p className="text-body-sm leading-body-sm text-muted">Send it to them yourself. It works once, for the Google or GitHub account with this email.</p>
        </div>
      )}
    </section>
  );
}

function AllowanceDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const save = useMutation(api.adminPeople.setAllowance);
  const [amount, setAmount] = useState<number | null>(person.plan?.allowanceUsd ?? null);
  const [saving, setSaving] = useState(false);
  const who = person.name ?? person.email ?? "them";
  const set = async (allowanceUsd: number | null) => {
    setSaving(true);
    try {
      await save({ userId: person.userId as Id<"users">, allowanceUsd });
      toast({ message: allowanceUsd === null ? `${who}’s allowance is back to the default` : `${who}’s allowance set to ${usd(allowanceUsd)} a month` });
      onClose();
    } catch (e) {
      failed(e, "Couldn’t set it. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Allowance for ${who}`}
      footer={
        <>
          {person.plan?.override && (
            <Button variant="ghost" detail="Puts their allowance back to the one everyone gets." note="Free" onClick={() => void set(null)}>
              Use the default
            </Button>
          )}
          <Button variant="primary" loading={saving} loadingLabel="Saving" detail="Sets how much of CareerBot’s AI they can use each month. Paused work picks up when it’s raised." note="Free" onClick={() => amount !== null && void set(amount)}>
            Set allowance
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Text size="md" muted>
          AI work pauses when they reach it and picks up again next month or when you raise it.
        </Text>
        <NumberField label="Monthly allowance" currency min={0} example={5} value={amount} onChange={setAmount} className="w-32" />
      </div>
    </Dialog>
  );
}

// ---- Cost by step ----

// A step's name as the log keeps it ("find companies"), as a heading.
const stepName = (task: string) => task.charAt(0).toUpperCase() + task.slice(1);

export function CostPane({ size, costs }: { size: ScreenSize; costs: Costs | undefined }) {
  const month = costs && new Date(costs.month).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const cols = "w-18 shrink-0 text-right tabular-nums";
  return (
    <SettingsPane title="Cost by step" size={size} wide>
      {costs && (
        <section aria-label="Cost by step" className="flex flex-col">
          <div className="flex flex-col gap-1 pb-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-title-lg leading-title-lg font-semibold tracking-title-lg text-text tabular-nums">{usd(costs.person.medianUsd)}</span>
              <Text size="md" muted as="span">
                median AI a person this month · 95th percentile {usd(costs.person.p95Usd)}
              </Text>
            </div>
            <Text size="sm" muted>
              Across the {costs.person.people} {costs.person.people === 1 ? "person" : "people"} who used AI in {month}.
            </Text>
          </div>
          <div className="flex items-center gap-4 border-b py-1.5 text-label leading-label font-medium text-muted">
            <span className="min-w-0 flex-1">Step</span>
            <span className={cols}>People</span>
            <span className={cols}>Median</span>
            <span className={cols}>p95</span>
            <span className={cols}>Total</span>
          </div>
          <ul aria-label="Steps" className="flex flex-col">
            {costs.steps.map((s) => (
              <li key={s.step} className="flex items-center gap-4 border-b py-2 text-body-sm leading-body-sm text-text">
                <span className="min-w-0 flex-1 truncate font-medium">{stepName(s.step)}</span>
                <span className={cols}>{s.people}</span>
                <span className={cols}>{usd(s.medianUsd)}</span>
                <span className={cols}>{usd(s.p95Usd)}</span>
                <span className={cols}>{usd(s.totalUsd)}</span>
              </li>
            ))}
          </ul>
          {!costs.steps.length && <GroupHead label="No AI used this month yet" />}
        </section>
      )}
    </SettingsPane>
  );
}

// ---- Log ----

export function actionWords(e: Pick<LogEntry, "action" | "amountUsd">) {
  switch (e.action) {
    case "invited":
      return "Invited";
    case "inviteResent":
      return "New invite link";
    case "inviteRevoked":
      return "Invite withdrawn";
    case "allowanceSet":
      return e.amountUsd === null ? "Allowance back to the default" : `Allowance set to ${usd(e.amountUsd)}`;
    case "suspended":
      return "Suspended";
    case "restored":
      return "Restored";
    case "allowlistCarried":
      return "Carried over from the allowlist";
  }
}

export function LogPane({ size, log }: { size: ScreenSize; log: LogEntry[] | undefined }) {
  const small = size === "small";
  const when = (at: number) => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <SettingsPane title="Log" size={size} wide>
      <ul aria-label="Log" className="flex flex-col border-b">
        {(log ?? []).map((e) => (
          <li key={e.id} className={`flex gap-x-4 border-t py-2 text-body-sm leading-body-sm ${small ? "flex-col" : "items-center"}`}>
            <span className="w-30 shrink-0 text-muted tabular-nums">{when(e.at)}</span>
            <span className="min-w-0 flex-1 font-medium text-text">{actionWords(e)}</span>
            <span className="truncate text-text sm:w-56 sm:shrink-0">{e.email}</span>
            <span className="truncate text-muted sm:w-36 sm:shrink-0">{e.by ?? "Convex CLI"}</span>
          </li>
        ))}
      </ul>
      {log && !log.length && <GroupHead label="No actions yet" />}
    </SettingsPane>
  );
}
