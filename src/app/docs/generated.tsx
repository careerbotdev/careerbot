import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { AI_TASKS } from "../../../convex/aiTasks";
import { cap, LIMIT_BUCKETS, type LimitBucket, RULE_FIELDS } from "../../../convex/limitBuckets";
import { Icon } from "./Icon";
import { Keys } from "@/components/Kbd";
import { docsHref, PURSUIT_STEPS, SETUP_STEPS } from "../today/steps";
import type { TourDef } from "@/components/Tour";
import { COMPANIES_TOUR } from "../tours/companies";
import { DRIVE_TOUR } from "../tours/drive";
import { GOALS_TOUR } from "../tours/goals";
import { PURSUITS_TOUR } from "../tours/pursuits";
import { RECORD_TOUR } from "../tours/record";
import { RESUMES_TOUR } from "../tours/resumes";
import { REVIEW_TOUR } from "../tours/review";
import { TODAY_TOUR } from "../tours/today";
import reference from "./reference.json";

// The docs' generated parts: what they show comes from the code, so it can't drift from it. The system map
// (docs/architecture/model.c4: screens, AI steps and what each reads), the action explainers, the old addresses, the
// shortcuts and .env.example are read by `pnpm docs:gen` into reference.json, in plain words (scripts/docs-words.ts);
// Getting started's steps, the tours, the limits and the AI tasks are the app's own modules, imported as they are. The
// docs check (scripts/docs-check.ts) fails when a page names a screen, step or stage that isn't here.

type Filter = "approved" | "yours" | "unreviewed" | "rejected" | "public";
type AiStepData = { id: string; name: string; stage: string | null; starts: string; reads: { text: string; filter: Filter | null }[]; may: string; mayNot: string; tasks: string[]; screens: string[] };
type Reference = {
  screens: { key: string; name: string; paths: string[]; page: string }[];
  stages: { id: string; name: string; line: string }[];
  aiSteps: AiStepData[];
  actions: { screen: string; label: string; detail: string; note: string }[];
  oldAddresses: { from: string; to: string }[];
  shortcuts: { keys: string; label: string; href: string }[];
  configuration: { name: string; group: string; text: string; example: string }[];
};
const REF = reference as Reference;

const TOURS: Record<string, TourDef> = {
  today: TODAY_TOUR,
  review: REVIEW_TOUR,
  pursuits: PURSUITS_TOUR,
  companies: COMPANIES_TOUR,
  resumes: RESUMES_TOUR,
  record: RECORD_TOUR,
  goals: GOALS_TOUR,
  settings: DRIVE_TOUR,
};

const screenOf = (key: string) => REF.screens.find((s) => s.key === key);
const anchor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// An AI step's card lives on its stage's page; the two outside the order (Compare models, Test call) on Models.
const stepHref = (step: AiStepData) => `/docs/ai/${step.stage ?? "models"}#${anchor(step.name)}`;
const STAGED = REF.aiSteps.filter((s) => s.stage);

const groupTitle = "text-site-group leading-site-group tracking-site-group font-semibold text-text";
const rowText = "text-site-note leading-site-note text-text";

// A screen's name, linked to its page (a Using page names its own screen too).
export function Screen({ id }: { id: string }) {
  const screen = screenOf(id);
  return screen ? (
    <Link href={screen.page} className="font-medium text-text underline decoration-border decoration-1 underline-offset-3 hover:decoration-text">
      {screen.name}
    </Link>
  ) : (
    <>{id}</>
  );
}

// An AI step's name, linked to its card.
export function AiStep({ id }: { id: string }) {
  const step = REF.aiSteps.find((s) => s.id === id);
  return step ? (
    <Link href={stepHref(step)} className="font-medium text-text underline decoration-border decoration-1 underline-offset-3 hover:decoration-text">
      {step.name}
    </Link>
  ) : (
    <>{id}</>
  );
}

// Getting started's steps, as Today shows them with both paths taken: Setup, then your first pursuit (its start, the
// Outreach path's steps, the Apply path's, then following up), each with its line and its page.
export function FirstSteps() {
  const none = { company: null, direction: null };
  const part = (title: string, of: (typeof PURSUIT_STEPS)[number]["part"], keys?: string[]) => ({
    title,
    steps: PURSUIT_STEPS.filter((s) => s.part === of && (!keys || keys.includes(s.key))).map((s) => ({ key: s.key, title: s.title, line: s.line(none), learn: s.learn })),
  });
  const groups = [
    { title: "Setup", steps: SETUP_STEPS.map((s) => ({ key: s.key, title: s.title, line: s.optional ? `${s.line} (optional)` : s.line, learn: s.learn })) },
    part("Your first pursuit", "shared", ["pursuit", "tailor", "path"]),
    part("On the Outreach path", "outreach"),
    part("On the Apply path", "apply"),
    part("Either path", "shared", ["followUp"]),
  ];
  let n = 0;
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h3 className={groupTitle}>{group.title}</h3>
          <ol className="flex flex-col border-b border-border">
            {group.steps.map((step) => {
              n += 1;
              return (
                <li key={step.key}>
                  <Link href={docsHref(step.learn.path)} className="group flex items-start gap-4 border-t border-border py-3 md:items-center">
                    <span className="w-6 shrink-0 pt-1 font-mono text-site-index leading-site-index tracking-site-index font-medium text-muted md:pt-0">{String(n).padStart(2, "0")}</span>
                    <span className="flex min-w-0 grow flex-col gap-0.5 md:flex-row md:items-center md:gap-6">
                      <span className="text-site-item leading-site-item font-medium text-text group-hover:underline group-hover:decoration-1 group-hover:underline-offset-3 md:w-80 md:shrink-0">
                        {step.title}
                      </span>
                      <span className="text-site-note leading-site-note text-muted">{step.line}</span>
                    </span>
                    <Icon name="onward" aria-hidden="true" className="mt-1 shrink-0 text-muted group-hover:text-text md:mt-0" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={groupTitle}>{title}</h3>
      {children}
    </section>
  );
}

// A screen at a glance: where it is, its tour step by step, and every action on it with what it does, what it costs
// and whether it can be undone.
export function ScreenFacts({ screen }: { screen: string }) {
  const facts = screenOf(screen);
  const tour = TOURS[screen];
  if (!facts) return null;
  return (
    <div className="flex flex-col gap-6 rounded-sm border border-border px-5 py-4.5">
      {facts.paths.length > 0 && (
        <Block title={facts.paths.length === 1 ? "Address" : "Addresses"}>
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            {facts.paths.map((path) => (
              <code key={path} className="rounded-sm bg-subtle px-1 py-px font-mono text-docs-code text-text">
                {path}
              </code>
            ))}
          </p>
        </Block>
      )}
      {tour && (
        <Block title={`The tour${screen === "settings" ? ": Google Drive" : ""}`}>
          <p className={`${rowText} text-muted`}>
            In ⌘K: <span className="font-medium text-text">Take the tour of {tour.name}</span>. It lights up each part in turn and never changes anything.
          </p>
          <ol className="flex flex-col border-b border-border">
            {tour.steps.map((step, i) => (
              <li key={i} className="flex gap-3 border-t border-border py-2">
                <span className="w-6 shrink-0 pt-0.5 font-mono text-site-index leading-site-index tracking-site-index font-medium text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex min-w-0 flex-col">
                  <span className={`${rowText} font-semibold`}>{step.title}</span>
                  <span className={`${rowText} text-muted`}>{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Block>
      )}
      <ActionRows screen={screen} />
    </div>
  );
}

function ActionRows({ screen }: { screen: string }) {
  const actions = REF.actions.filter((a) => a.screen === screen);
  if (!actions.length) return null;
  return (
    <Block title="Actions">
      <ul className="flex flex-col border-b border-border">
        {actions.map((a, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-t border-border py-2 md:flex-row md:gap-4">
            <span className={`${rowText} font-semibold md:w-44 md:shrink-0`}>{a.label}</span>
            <span className="flex min-w-0 flex-col">
              <span className={rowText}>{a.detail}</span>
              <span className={`${rowText} text-muted`}>{a.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

// Every action on one screen, on its own (the Actions reference lists every screen's).
export function Actions({ screen }: { screen?: string }) {
  if (screen) return <ActionRows screen={screen} />;
  return (
    <div className="flex flex-col gap-8">
      {REF.screens.map((s) => (
        <Fragment key={s.key}>{REF.actions.some((a) => a.screen === s.key) && <NamedActions name={s.name} screen={s.key} />}</Fragment>
      ))}
    </div>
  );
}
function NamedActions({ name, screen }: { name: string; screen: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 id={anchor(name)} className="scroll-mt-32 text-docs-step leading-docs-step tracking-docs-step font-semibold text-text lg:scroll-mt-24">
        {name}
      </h2>
      <ActionRows screen={screen} />
    </div>
  );
}

// The five labels an AI step's inputs carry.
const FILTERS: Record<Filter, { label: string; look: string; meaning: string }> = {
  approved: { label: "Approved only", look: "bg-good-subtle text-good-text", meaning: "Only what you approved." },
  yours: { label: "Your words", look: "bg-steel-subtle text-text", meaning: "Your stories and what you write to it, exactly as you wrote them." },
  unreviewed: { label: "Not yet reviewed", look: "bg-caution-subtle text-caution-text", meaning: "Includes proposals you haven’t reviewed yet, passed so they aren’t repeated, never as facts." },
  rejected: { label: "Rejected, to skip", look: "bg-subtle text-muted", meaning: "Things you turned down, passed only so they aren’t proposed again." },
  public: { label: "Public", look: "bg-subtle text-muted", meaning: "Public information about a company or a role: its website, its job board, its postings." },
};

function FilterTag({ filter }: { filter: Filter }) {
  const f = FILTERS[filter];
  return <span className={`flex h-5.5 shrink-0 items-center rounded-sm px-1.5 text-label leading-label font-medium whitespace-nowrap ${f.look}`}>{f.label}</span>;
}

export function FilterLabels() {
  return (
    <ul className="flex flex-col border-b border-border">
      {(Object.keys(FILTERS) as Filter[]).map((filter) => (
        <li key={filter} className="flex flex-col items-start gap-1.5 border-t border-border py-3 md:flex-row md:gap-3">
          <span className="flex md:w-32 md:shrink-0">
            <FilterTag filter={filter} />
          </span>
          <span className={rowText}>{FILTERS[filter].meaning}</span>
        </li>
      ))}
    </ul>
  );
}

// One AI step: what starts it, what it reads (with each input's label), what it may and may not do, and the model
// setting it runs on.
export function AiStepCard({ step: id }: { step: string }) {
  const step = REF.aiSteps.find((s) => s.id === id);
  if (!step) return null;
  const n = STAGED.indexOf(step) + 1;
  return (
    <article id={anchor(step.name)} className="flex scroll-mt-32 flex-col overflow-clip rounded-sm border border-border bg-surface lg:scroll-mt-24">
      <header className="flex gap-3 px-4 pt-4 pb-3 md:px-5">
        {n > 0 && <span className="w-7 shrink-0 pt-1 font-mono text-site-index leading-site-index tracking-site-index font-medium text-muted">{String(n).padStart(2, "0")}</span>}
        <div className="flex min-w-0 grow flex-col gap-1">
          <h4 className="text-docs-card-title leading-docs-card-title tracking-docs-card-title font-semibold text-text">{step.name}</h4>
          <p className={`${rowText} text-muted`}>{step.starts}</p>
        </div>
      </header>
      {step.reads.length > 0 && (
        <div className={`flex flex-col px-4 pb-3 md:pr-5 ${n > 0 ? "md:pl-15" : "md:pl-5"}`}>
          <p className={`${groupTitle} pb-2`}>Reads</p>
          <ul className="flex flex-col">
            {step.reads.map((read, i) => (
              <li key={i} className="flex flex-col items-start gap-1 border-t border-border py-2 md:flex-row md:gap-3">
                <span className="flex md:w-32 md:shrink-0">{read.filter && <FilterTag filter={read.filter} />}</span>
                <span className={`${rowText} min-w-0`}>{read.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col border-t border-border md:flex-row">
        <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1 px-4 py-3.5 md:border-r md:border-border md:px-5">
          <p className={groupTitle}>May</p>
          <p className={rowText}>{step.may}</p>
        </div>
        <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1 border-t border-border px-4 py-3.5 md:border-t-0 md:px-5">
          <p className={groupTitle}>May not</p>
          <p className={rowText}>{step.mayNot}</p>
        </div>
      </div>
      {step.tasks.length > 0 && (
        <footer className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-b-sm border-t border-border bg-subtle px-4 py-2.5 md:px-5">
          <span className="text-body-sm leading-body-sm text-muted">Model setting</span>
          <span className="text-body-sm leading-body-sm font-medium text-text">{step.tasks.join(" · ")}</span>
        </footer>
      )}
    </article>
  );
}

// One stage of the order: its line, then its steps' cards.
export function AiStage({ stage: id }: { stage: string }) {
  const stage = REF.stages.find((s) => s.id === id);
  if (!stage) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-site-body leading-site-body text-text">{stage.line}</p>
      {REF.aiSteps
        .filter((s) => s.stage === id)
        .map((s) => (
          <AiStepCard key={s.id} step={s.id} />
        ))}
    </div>
  );
}

// The six stages at a glance, each with how many steps it has, linked to its page.
export function AiStageList() {
  return (
    <ol className="grid grid-cols-1 rounded-sm border-t-2 border-steel min-[360px]:grid-cols-2 md:grid-cols-3">
      {REF.stages.map((stage, i) => {
        const count = REF.aiSteps.filter((s) => s.stage === stage.id).length;
        return (
          <li key={stage.id} className="border-b border-border">
            <Link href={`/docs/ai/${stage.id}`} className="group flex items-center gap-3 px-4 py-3.5">
              <span className="font-mono text-mono leading-mono tracking-label-caps font-medium text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-site-note leading-site-note font-semibold text-text group-hover:underline group-hover:decoration-1 group-hover:underline-offset-3">{stage.name}</span>
                <span className="text-body-sm leading-body-sm text-muted">
                  {count} {count === 1 ? "step" : "steps"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

// Every stage with its cards (the AI steps reference).
export function AiOrder() {
  return (
    <div className="flex flex-col gap-10">
      {REF.stages.map((stage) => (
        <section key={stage.id} className="flex flex-col gap-4">
          <h2 id={anchor(stage.name)} className="scroll-mt-32 text-docs-step leading-docs-step tracking-docs-step font-semibold text-text lg:scroll-mt-24">
            {stage.name}
          </h2>
          <AiStage stage={stage.id} />
        </section>
      ))}
      <section className="flex flex-col gap-4">
        <h2 id="outside-the-order" className="scroll-mt-32 text-docs-step leading-docs-step tracking-docs-step font-semibold text-text lg:scroll-mt-24">
          Outside the order
        </h2>
        {REF.aiSteps
          .filter((s) => !s.stage)
          .map((s) => (
            <AiStepCard key={s.id} step={s.id} />
          ))}
      </section>
    </div>
  );
}

// The model settings (Settings, AI): each task and the steps that run on it.
export function AiTasks() {
  return (
    <ul className="flex flex-col border-b border-border">
      {Object.values(AI_TASKS).map((task) => {
        const steps = REF.aiSteps.filter((s) => s.tasks.includes(task));
        return (
          <li key={task} className="flex flex-col gap-0.5 border-t border-border py-2.5 md:flex-row md:gap-4">
            <span className={`${rowText} font-semibold md:w-56 md:shrink-0`}>{task}</span>
            <span className={`${rowText} text-muted`}>
              {steps.length
                ? steps.map((s, i) => (
                    <Fragment key={s.id}>
                      {i > 0 && ", "}
                      <AiStep id={s.id} />
                    </Fragment>
                  ))
                : "Used outside the steps above."}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// The kinds of limit and what each can hold (convex/limitBuckets.ts).
export function Limits() {
  return (
    <div className="flex flex-col gap-5">
      {(Object.keys(LIMIT_BUCKETS) as LimitBucket[]).map((bucket) => (
        <section key={bucket} className="flex flex-col gap-2">
          <h3 className={groupTitle}>{LIMIT_BUCKETS[bucket]}</h3>
          <ul className="flex flex-col border-b border-border">
            {RULE_FIELDS[bucket].map((field) => (
              <li key={field.key} className="flex flex-col gap-0.5 border-t border-border py-2 md:flex-row md:gap-4">
                <span className={`${rowText} font-semibold md:w-56 md:shrink-0`}>{field.label}</span>
                <span className={`${rowText} text-muted`}>
                  {"options" in field
                    ? field.options.map(cap).join(", ")
                    : { number: "A number", bool: "Yes or no", names: "Company names", countries: "Countries", places: "Places, with a distance" }[field.type]}
                  {field.hint ? ` (${field.hint})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// G then a letter, from anywhere in the app.
export function Shortcuts() {
  return (
    <ul className="flex flex-col border-b border-border">
      {REF.shortcuts.map((s) => (
        <li key={s.keys} className="flex items-center gap-4 border-t border-border py-2">
          <span className="flex w-32 shrink-0">
            <Keys keys={s.keys} />
          </span>
          <span className={rowText}>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

// Every screen, its address and its page here.
export function ScreenList() {
  return (
    <ul className="flex flex-col border-b border-border">
      {REF.screens.map((s) => (
        <li key={s.key} className="flex flex-col gap-1 border-t border-border py-2.5 md:flex-row md:gap-4">
          <span className="md:w-44 md:shrink-0">
            <Screen id={s.key} />
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {s.paths.length ? (
              s.paths.map((path) => (
                <code key={path} className="rounded-sm bg-subtle px-1 py-px font-mono text-docs-code text-text">
                  {path}
                </code>
              ))
            ) : (
              <span className={`${rowText} text-muted`}>On every screen</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Addresses that moved, and where they go now (bookmarks keep working).
export function OldAddresses() {
  return (
    <ul className="flex flex-col border-b border-border">
      {REF.oldAddresses.map((a) => (
        <li key={a.from} className="flex flex-col gap-1 border-t border-border py-2 md:flex-row md:items-center md:gap-3">
          <code className="self-start rounded-sm bg-subtle px-1 py-px font-mono text-docs-code text-text">{a.from}</code>
          <Icon name="onward" aria-hidden="true" className="hidden shrink-0 text-muted md:block" />
          <code className="self-start rounded-sm bg-subtle px-1 py-px font-mono text-docs-code text-text">{a.to}</code>
        </li>
      ))}
    </ul>
  );
}

// A self-hosted copy's settings, from .env.example, grouped as it groups them.
export function Configuration() {
  const groups = [...new Set(REF.configuration.map((c) => c.group))];
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h3 className={groupTitle}>{group}</h3>
          <ul className="flex flex-col border-b border-border">
            {REF.configuration
              .filter((c) => c.group === group)
              .map((c) => (
                <li key={c.name} className="flex flex-col gap-1 border-t border-border py-2.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <code className="font-mono text-docs-code font-medium text-text [overflow-wrap:anywhere]">{c.name}</code>
                    {c.example && <code className="font-mono text-docs-code text-muted [overflow-wrap:anywhere]">{c.example}</code>}
                  </span>
                  <span className={rowText}>{c.text}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
