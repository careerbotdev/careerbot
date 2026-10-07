"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { clearanceLabel, EMPLOYMENT_LABELS, payText, seniorityLabel, travelText, valuesOf, visaText, whereText, yearsText } from "../../../convex/roleDetails";
import { Button, type ButtonSize } from "@/components/Button";
import { Icons } from "@/components/icons";
import { Menu, type MenuEntry } from "@/components/Menu";
import { Properties, Property, PropertyLink } from "@/components/Properties";
import { ReasonField } from "@/components/ReasonField";
import { ScoreBadge } from "@/components/ScoreBadge";
import { FitWord, StatusTag } from "@/components/StatusTag";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { useBar } from "../shell/ShellContext";
import { day } from "./dates";
import { Notes } from "./Overview";
import { useTailor } from "./Resume";
import { type ItemNav, ItemTop, onItemKey, useThird } from "./third";
import { aboutUsd } from "../costs";
import { ASK_BESIDE, INTERESTED, NOT_FOR_ME, NOT_INTERESTED, OPEN_POSTING, placeAndPay, RESTORE_ROLE, RESUME_BESIDE, type Role } from "./words";

// A role not started yet: what it is and what it pays, Start (S), Interested (I) and Not for me (R, with why); About
// the job, For you, how it fits each direction, its stretch, the full description and their notes; its details beside
// (under it on smaller screens). The ⋯ menu holds the rest: tailor a resume, write a letter, ask, find people (each
// starts the pursuit first where it needs one), rate the company, adjust the direction, open or copy the posting.

export const ROLE_REASONS = ["Pay", "Location", "Seniority", "Not the work", "Company"];
const failed = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : fallback, icon: "failed" });
const RATINGS = [
  { value: "excited", label: "Target" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Not for me" },
] as const;

// An item's top: its score, title, company (to its page in Companies) and second line, then what can be done with it.
export function Head({ score, level, title, companyId, company, line, closed, children }: { score: number | null; level: "strong" | "some" | "weak" | "none" | null; title: string; companyId: Id<"companies"> | null; company: string; line: string; closed?: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b px-4 pt-2 pb-5 md:px-6 lg:px-8">
      <div className="flex items-start gap-3.5">
        <ScoreBadge size="lg" score={score} level={level} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Heading>{title}</Heading>
          <Text size="sm" muted>
            {companyId ? (
              <Link href={`/companies?company=${companyId}`} className="tap hover:text-text hover:underline">
                {company}
              </Link>
            ) : (
              company
            )}
            {line && ` · ${line}`}
          </Text>
          {closed && (
            <span className="pt-1">
              <StatusTag tone="neutral">No longer listed</StatusTag>
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// The ⋯ entries a role has whether started or not: rate its company, adjust the direction it's shown for, open or copy
// the posting. None for a pursuit with no open role.
export function useRoleEntries(role: Role | null, directionId: string | null): MenuEntry[] {
  const router = useRouter();
  const overview = useQuery(api.roles.overview, {});
  const rateCompany = useMutation(api.enrich.rate);
  if (!role) return [];
  const rating = overview?.companies.find((c) => c.id === role.company.id)?.rating ?? null;
  const direction = role.fit.find((f) => f.directionId === directionId) ?? role.fit[0];
  return [
    {
      label: `Rate ${role.company.name}`,
      icon: "companies",
      hint: RATINGS.find((r) => r.value === rating)?.label,
      items: RATINGS.map((r) => ({
        label: r.label,
        checked: rating === r.value,
        onSelect: () => void rateCompany({ id: role.company.id, value: rating === r.value ? null : r.value }).catch((e: unknown) => failed(e, "Couldn’t save that.")),
      })),
    },
    ...(direction ? [{ label: `Adjust ${direction.name}`, icon: "directions" as const, detail: "Opens this direction in Goals, to change what it looks for.", note: "Free", onSelect: () => router.push(`/goals/directions?direction=${direction.directionId}`) }] : []),
    "separator",
    { label: "Open the posting", icon: "openElsewhere", keys: "O", ...OPEN_POSTING, onSelect: () => window.open(role.url, "_blank", "noreferrer") },
    {
      label: "Copy link",
      icon: "link",
      detail: "Copies a link that opens this role in Pursuits.",
      note: "Free",
      onSelect: () => void navigator.clipboard.writeText(`${window.location.origin}/pursuits?role=${role.id}`).then(() => toast({ message: "Copied the link", icon: "link" })),
    },
  ];
}

export function RoleItem({ role, direction, nav, small }: { role: Role; direction: string | null; nav: ItemNav | null; small: boolean }) {
  const rate = useMutation(api.roles.rate);
  const startPursuit = useMutation(api.pursuits.start);
  const writeLetter = useMutation(api.letters.write);
  const tailored = useQuery(api.resume.forPosting, { postingId: role.id });
  const costs = useQuery(api.estimates.costs, {});
  const { amount, tailor } = useTailor(role.id);
  const { open } = useThird();
  const [why, setWhy] = useState(false);
  const common = useRoleEntries(role, direction);
  const fit = role.fit.find((f) => f.directionId === direction) ?? role.fit[0] ?? null;
  const interested = role.rating === "interested";
  const setAside = role.rating === "no";

  // Starting keeps the role's score for the direction it's shown for; Today and the list then show it as a pursuit.
  const start = () =>
    startPursuit({ postingId: role.id, directionId: fit?.directionId })
      .then((id) => {
        toast({ message: `Started: ${role.title}`, icon: "pursuits" });
        return id;
      })
      .catch((e: unknown) => {
        failed(e, "Couldn’t start.");
        return null;
      });
  const toggleInterested = () =>
    void rate({ id: role.id, value: interested ? null : "interested" }).then(
      () => !interested && toast({ message: `Interested: ${role.title}`, icon: "approve", action: { label: "Undo", key: "U", run: () => void rate({ id: role.id, value: null }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  const notForMe = (reason?: string) => {
    setWhy(false);
    void rate({ id: role.id, value: "no", reason }).then(
      () => toast({ message: `Not for me: ${role.title}`, icon: "reject", action: { label: "Undo", key: "U", run: () => void rate({ id: role.id, value: role.rating }) } }),
      (e: unknown) => failed(e, "Couldn’t save that."),
    );
  };
  const restore = () => void rate({ id: role.id, value: null }).catch((e: unknown) => failed(e, "Couldn’t save that."));
  const askAboutIt = () => void start().then((id) => id && open?.({ kind: "ask" }));
  const letter = () => void start().then((id) => id && writeLetter({ pursuitId: id }).then(() => toast({ message: "Writing your cover letter", icon: "running" }), (e: unknown) => failed(e, "Couldn’t start.")));
  const people = () => void start().then((id) => id && toast({ message: `Started: ${role.title}. Find people under People.`, icon: "people" }));
  const hasResume = (tailored?.tailored.length ?? 0) > 0;
  const fits = role.fit.filter((f) => f.level !== "none");

  const menu: MenuEntry[] = [
    {
      label: "Tailor a resume",
      icon: "resumes",
      hint: amount,
      ...(fits.length ? { items: [{ group: "For which direction" }, ...fits.map((f) => ({ label: f.name, hint: amount, detail: `Writes a resume for this role from your approved record, for ${f.name}. Earlier versions stay.`, note: amount, onSelect: () => tailor(f.directionId) }))] } : { disabled: true, reason: "Fits no direction" }),
    },
    { label: "Write a letter", icon: "edit", keys: "L", hint: aboutUsd(costs?.letter) ?? undefined, detail: "Starts a pursuit of this role and writes a cover letter for it.", note: aboutUsd(costs?.letter) ?? "Uses your AI budget", onSelect: letter, ...(hasResume ? {} : { disabled: true, reason: "Tailor a resume first" }) },
    ...(open ? [{ label: "Ask about this role", icon: "ask" as const, keys: "/", detail: "Starts a pursuit of this role and opens a pane to ask anything about it, or paste an application question.", note: ASK_BESIDE.note, onSelect: askAboutIt }] : []),
    { label: `Find people at ${role.company.name}`, icon: "people", hint: "Free", detail: `Starts a pursuit of this role; its People tab finds people at ${role.company.name}.`, note: "Free", onSelect: people },
    ...(hasResume && open ? [{ label: "Your tailored resume", icon: "thirdPane" as const, ...RESUME_BESIDE, onSelect: () => open({ kind: "resume" }) }] : []),
    "separator",
    // On a phone the bar has room for Start and Not for me only; Interested is here.
    ...(small ? [{ label: interested ? "Not interested" : "Interested", icon: "approve" as const, keys: "I", ...(interested ? NOT_INTERESTED : INTERESTED), onSelect: toggleInterested }] : []),
    ...common,
    "separator",
    setAside ? { label: "Restore", icon: "undo", ...RESTORE_ROLE, onSelect: restore } : { label: "Not for me", icon: "reject", keys: "R", ...NOT_FOR_ME, onSelect: () => setWhy(true) },
  ];

  useEffect(() => {
    const onKey = onItemKey({
      s: () => void start(),
      i: toggleInterested,
      r: () => (setAside ? restore() : setWhy(true)),
      l: () => hasResume && letter(),
      o: () => window.open(role.url, "_blank", "noreferrer"),
      ...(open ? { "/": askAboutIt } : {}),
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Start, Interested and Not for me: in that order beside the title; on a phone, Not for me then Start in the bar after
  // ⋯ (which holds Interested, so the bar fits a 320 px screen), so Start sits in thumb reach.
  const actions = (size: ButtonSize) => {
    const phone = size === "lg";
    const list = [
      <Button key="start" variant="primary" size={size} keys={phone ? undefined : "S"} className={phone ? "flex-1" : ""} detail="Starts a pursuit of this role: its status, resume, letter, answers and people in one place." note="Free" onClick={() => void start()}>
        Start
      </Button>,
      ...(phone
        ? []
        : [
            <Button key="interested" size={size} keys="I" aria-pressed={interested} icon={interested ? "approve" : undefined} {...(interested ? NOT_INTERESTED : INTERESTED)} onClick={toggleInterested}>
              Interested
            </Button>,
          ]),
      setAside ? (
        <Button key="restore" size={size} icon="undo" {...RESTORE_ROLE} onClick={restore}>
          Restore
        </Button>
      ) : (
        <Button key="no" size={size} keys={phone ? undefined : "R"} {...NOT_FOR_ME} onClick={() => setWhy(true)} aria-pressed={why}>
          Not for me
        </Button>
      ),
    ];
    return phone ? [<Menu key="more" label={`More for ${role.title}`} title={role.title} items={menu} trigger={<Button size="lg" iconOnly icon="more" aria-label="More" />} />, ...list.reverse()] : list;
  };
  useBar(small ? (why ? { kind: "reason", decision: "Not for me", picks: ROLE_REASONS, onDone: ({ reason }) => notForMe(reason) } : { kind: "actions", actions: actions("lg") }) : null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-4">
      {nav && <ItemTop nav={nav} small={small} menu={menu} title={role.title} />}
      <Head score={fit?.score ?? null} level={fit?.level ?? null} title={role.title} companyId={role.company.id} company={role.company.name} line={placeAndPay(role)} closed={!!role.closedAt}>
        {!small && (
          <div className="flex flex-col gap-3 md:pl-[54px]">
            <div data-tour="pursuits.role" className="flex flex-wrap items-center gap-2">
              {actions("md")}
              {!nav && <Menu label={`More for ${role.title}`} title={role.title} items={menu} />}
            </div>
            {why && <ReasonField decision="Not for me" picks={ROLE_REASONS} onDone={({ reason }) => notForMe(reason)} className="max-w-[560px]" />}
            {setAside && role.ratingReason && <Text size="sm" muted>Not for me: {role.ratingReason}</Text>}
          </div>
        )}
      </Head>
      <RoleBody role={role} />
    </div>
  );
}

// What a role is, shown alike before and after it's started: About the job, For you, how it fits each direction, its
// stretch, the full description and their notes on it; its details beside on large screens, under the body otherwise.
export function RoleBody({ role }: { role: Role }) {
  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        {role.brief && (
          <>
            <Section title="About the job">
              <Text measure>{role.brief.job}</Text>
            </Section>
            <Section title="For you">
              <Text measure>{role.brief.forYou}</Text>
            </Section>
          </>
        )}
        <Fit role={role} />
        <Description role={role} />
        <div className="lg:hidden">
          <Details role={role} inline />
        </div>
        <Notes subject={{ kind: "posting", id: role.id }} />
      </div>
      <aside className="hidden w-60 shrink-0 border-l px-6 py-6 lg:block">
        <Details role={role} />
      </aside>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <Text size="label">{title}</Text>
      {children}
    </section>
  );
}

// How it fits each direction it was judged for, best first: score, the word, the reason; then its stretch and anything
// it states that's against their limits.
function Fit({ role }: { role: Role }) {
  if (!role.fit.length) return null;
  const stretch = [...new Set(role.fit.flatMap((f) => f.stretch))];
  const problems = [...new Set(role.fit.flatMap((f) => f.problems))];
  return (
    <Section title="Fit">
      <ul className="flex max-w-[640px] flex-col border-t">
        {role.fit.map((f) => (
          <li key={f.directionId} className="flex gap-3 border-b py-3">
            <ScoreBadge size="sm" score={f.score} level={f.level} className="mt-px" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <Text>
                <span className="font-medium">{f.name}</span> <FitWord level={f.level} className="ml-1" />
              </Text>
              {f.reason && <Text size="sm" muted>{f.reason}</Text>}
            </div>
          </li>
        ))}
      </ul>
      {stretch.length > 0 && (
        <Text size="sm" measure className="text-caution-text">
          Stretch: {stretch.join("; ")}
        </Text>
      )}
      {problems.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {problems.map((x) => (
            <StatusTag key={x} tone="problem">
              {x}
            </StatusTag>
          ))}
        </div>
      )}
    </Section>
  );
}

// The full description, folded: how long it is and where it's from, opened in place.
function Description({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const words = role.description ? role.description.split(/\s+/).filter(Boolean).length : 0;
  const Chevron = open ? Icons.expand : Icons.goIn;
  return (
    <section className="flex max-w-[640px] flex-col border-y">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 items-center gap-2 rounded-sm text-left transition-colors duration-100 hover:bg-subtle md:min-h-10">
        <Chevron aria-hidden size={14} className="shrink-0 text-muted" />
        <span className="flex-1 text-body-md leading-body-md font-medium text-text">Full description</span>
        <span className="text-label leading-label text-muted">
          {role.description ? `${words.toLocaleString("en-US")} words · from ${role.company.name}’s job board` : role.hasDescription === null ? "Not read yet" : "None on the board"}
        </span>
      </button>
      {open && (
        <div className="pb-4 pl-[22px]">
          {role.description ? (
            <Text size="sm" className="whitespace-pre-line">
              {role.description}
            </Text>
          ) : (
            <Text size="sm" muted>
              {role.hasDescription === null ? "Its description hasn’t been read yet." : "The job board has no description for it."}
            </Text>
          )}
        </div>
      )}
    </section>
  );
}

// Its details: pay, place, level and years asked, type and travel, clearance and visa, the company and its rating, the
// posting and when it was posted. `inline`: a grid under the body, on medium screens and phones.
export function Details({ role, inline = false }: { role: Role; inline?: boolean }) {
  const overview = useQuery(api.roles.overview, {});
  const d = role.details;
  const rating = overview?.companies.find((c) => c.id === role.company.id)?.rating;
  const pairs = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(" · ");
  const items: [string, ReactNode][] = [
    ["Pay", d.pay ? payText(d.pay.value, true) : "Not listed"],
    ["Place", whereText(valuesOf(d), role.location) ?? "Not given"],
    ["Level", pairs(d.seniority && seniorityLabel(d.seniority.value), d.yearsAsked && `${yearsText(d.yearsAsked.value)} asked`) || "Not given"],
    ["Type", pairs(d.employmentType && EMPLOYMENT_LABELS[d.employmentType.value], d.travel && `${travelText(d.travel.value)} travel`) || "Not given"],
    ["Clearance and visa", pairs(d.clearance && (d.clearance.value === "none" ? "No clearance needed" : `${clearanceLabel(d.clearance.value)} clearance`), d.visa && visaText(d.visa.value).toLowerCase()) || "Not given"],
    [
      "Company",
      <span key="c" className="flex flex-wrap items-center gap-1.5">
        <Link href={`/companies?company=${role.company.id}`} className="underline decoration-border underline-offset-3 hover:decoration-text">
          {role.company.name}
        </Link>
        {rating && <StatusTag tone={rating === "excited" ? "good" : "neutral"}>{rating === "excited" ? "Target" : "Maybe"}</StatusTag>}
      </span>,
    ],
    ["Posting", <PropertyLink key="p" href={role.url}>{`${role.company.name} job board`}</PropertyLink>],
    ["Posted", role.postedAt ? `${day(role.postedAt)} · first seen ${day(role.firstSeen)}` : `First seen ${day(role.firstSeen)}`],
  ];
  if (inline)
    return (
      <dl aria-label="Details" className="grid grid-cols-2 gap-x-6 gap-y-3.5 md:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-label leading-label text-muted">{label}</dt>
            <dd className="text-body-sm leading-body-sm text-text">{value}</dd>
          </div>
        ))}
      </dl>
    );
  return (
    <Properties>
      {items.map(([label, value]) => (
        <Property key={label} label={label}>
          {value}
        </Property>
      ))}
    </Properties>
  );
}
