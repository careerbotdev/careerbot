"use client";

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { dates, type ResumeDoc } from "../../../convex/resumeDoc";
import { Button } from "@/components/Button";
import { Combobox, type ComboboxOption } from "@/components/Combobox";
import { CostAction } from "@/components/CostEstimate";
import { ErrorLine } from "@/components/Field";
import { List, ListRow } from "@/components/ListRow";
import type { ScreenSize } from "@/components/Panes";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Select } from "@/components/Select";
import { StatusTag } from "@/components/StatusTag";
import { TabPanel, Tabs } from "@/components/Tabs";
import { Text } from "@/components/Text";
import { aboutUsd } from "../costs";
import { useBar } from "../shell/ShellContext";
import { modelName, type Recommendations, shortName } from "../ModelChoice";
import { Line, Page } from "../resumes/Sheet";
import { modelOptions, REASONING_OPTIONS, type ReasoningOption, toReasoning, useModelCatalog } from "../useModelCatalog";
import { GroupHead, monthDay, saved, SettingsPane } from "./ui";

// Compare models, a pane of AI (reached from Advanced): one task run by up to four models, from the recommended ones or
// all of OpenRouter's, with each model's estimate before running and the total on Compare. Results side by side (on a
// phone one model at a time, switched by tabs) with what each cost and took, and Use this model. Past comparisons below.
// Nothing a comparison writes goes into the record or resumes.

type Task = "extract" | "resume" | "insights";
type Contender = { model: string; reasoning: ReasoningOption };
type Comparison = NonNullable<FunctionReturnType<typeof api.compare.get>>;
type Run = Comparison["contenders"][number];

const MAX = 4;
const TASKS: { value: Task; label: string; line: string; subject: string }[] = [
  { value: "extract", label: "Read a story", line: "Each model reads the story fresh, as a first read without your record.", subject: "Reading" },
  { value: "resume", label: "Base resume", line: "Each model writes your base resume from your approved record.", subject: "Base resume" },
  { value: "insights", label: "Insights", line: "Each model looks across your approved record for insights.", subject: "Insights" },
];
const TASK_OF: Record<Task, (typeof TASKS)[number]> = { extract: TASKS[0], resume: TASKS[1], insights: TASKS[2] };
const REASONING_LABELS = REASONING_OPTIONS.map((o) => ({ value: o.value, label: o.value === "default" ? "Default reasoning" : o.value === "none" ? "No reasoning" : `${o.label} reasoning` }));

export function Compare({ size, recommended }: { size: ScreenSize; recommended: { data?: Recommendations; error?: string } }) {
  const small = size === "small";
  const stories = useQuery(api.narratives.list);
  const tasks = useQuery(api.aiSettings.list);
  const past = useQuery(api.compare.list);
  const start = useMutation(api.compare.start);
  const { models: catalog, error: catalogError } = useModelCatalog();
  const [task, setTask] = useState<Task>("extract");
  const [storyId, setStoryId] = useState<Id<"narratives">>();
  const [picked, setPicked] = useState<Contender[]>();
  const [viewing, setViewing] = useState<Id<"comparisons">>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const listed = recommended.data?.models ?? [];
  const name = (id: string) => modelName(id, catalog, listed);
  const readable = (stories ?? []).filter((n) => n.kind !== "goals" && !n.rejected);
  const story = storyId ?? readable[0]?.id;
  const estimate = useQuery(api.compare.estimate, { task, narrativeId: task === "extract" ? story : undefined });

  // Starts with the model the task uses now.
  const using = tasks?.find((t) => t.task === task)?.choice;
  const contenders = picked ?? (using ? [{ model: using.model, reasoning: (using.reasoning ?? "default") as ReasoningOption }] : []);
  const update = (i: number, patch: Partial<Contender>) => setPicked(contenders.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // Recommended models first, then every OpenRouter model that answers in JSON.
  const all = modelOptions(catalog, true);
  const options: ComboboxOption[] = [
    ...listed.map((m) => ({ ...(all.find((o) => o.value === m.id) ?? { value: m.id }), label: shortName(m.name), note: "Recommended" })),
    ...all.filter((o) => !listed.some((m) => m.id === o.value)),
  ];
  const price = (id: string) => catalog?.find((m) => m.id === id) ?? listed.find((m) => m.id === id)?.price ?? null;
  // What this run would cost with each model: the tokens it takes, at the model's price.
  const each = contenders.map((c) => {
    const p = price(c.model);
    return p && estimate ? (estimate.inputTokens * p.inPerM + estimate.outputTokens * p.outPerM) / 1e6 : null;
  });
  const known = each.filter((u): u is number => u !== null);
  const total = known.length && known.length === each.length ? aboutUsd(known.reduce((a, b) => a + b, 0)) : null;
  const amount = total ?? "Uses your AI budget";
  const about = TASK_OF[task];

  const compare = () => {
    setError(undefined);
    setStarting(true);
    void start({ task, narrativeId: task === "extract" ? story : undefined, contenders: contenders.map((c) => ({ model: c.model, reasoning: toReasoning(c.reasoning) })) })
      .then(setViewing, (e: unknown) => setError(e instanceof ConvexError ? String(e.data) : "Couldn’t start the comparison. Try again."))
      .finally(() => setStarting(false));
  };
  const shown = viewing ?? past?.[0]?.id;
  // The pane's one action; on a phone it sits in the bottom bar.
  const action = (
    <CostAction
      variant="primary"
      size={small ? "lg" : "md"}
      amount={amount}
      budget="From your AI budget"
      loading={starting}
      loadingLabel="Starting"
      reason={!contenders.length ? "Add a model first." : task === "extract" && !story ? "Choose a story first." : undefined}
      detail="Runs this task with each model, side by side, and shows what each cost and took. Your record and resumes don’t change."
      note={`${amount} from your AI budget. Can’t be undone once run.`}
      onClick={compare}
    >
      Compare
    </CostAction>
  );
  useBar(small ? { kind: "actions", actions: action } : null);

  return (
    <SettingsPane title="Compare models" size={size} back={{ href: "/settings?section=ai&advanced=1", label: "AI" }} wide>
      <div className="flex max-w-160 flex-col gap-8">
        <section aria-label="Task" className="flex flex-col">
          <GroupHead label="Task" line={about.line} />
          <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center">
            <SegmentedControl label="Task" hideLabel wide={small} value={task} onChange={setTask} options={TASKS} />
            {task === "extract" && stories && (
              <Select
                label="Story"
                placeholder="Choose a story"
                value={story}
                onChange={setStoryId}
                options={readable.map((n) => ({ value: n.id, label: n.title }))}
                reason={readable.length ? undefined : "Write a story in Record first."}
                className="w-full @lg:w-auto @lg:min-w-0 @lg:flex-1"
              />
            )}
          </div>
        </section>

        <section aria-label="Models" className="flex flex-col">
          <GroupHead label="Models" count={contenders.length} line={`Up to ${MAX}. Each estimate is what this run would cost with that model.`} />
          {catalogError && <ErrorLine>{catalogError}</ErrorLine>}
          {contenders.length > 0 && (
            <ul className="flex flex-col border-b">
              {contenders.map((c, i) => (
                <li key={i} className="flex flex-col gap-2 border-t py-2.5 @xl:flex-row @xl:items-center">
                  <div className="min-w-0 @xl:flex-1">
                    <Combobox label={`Model ${i + 1}`} value={c.model} onChange={(model) => update(i, { model })} options={options} searchPlaceholder="Search models…" />
                  </div>
                  {(price(c.model)?.reasoning ?? true) && (
                    <Select label={`Reasoning for model ${i + 1}`} value={c.reasoning} onChange={(reasoning) => update(i, { reasoning })} options={REASONING_LABELS} className="w-full @xl:w-48" />
                  )}
                  <div className="flex items-center justify-between gap-2 @xl:w-36 @xl:shrink-0 @xl:justify-end">
                    <Text size="sm" muted tabular className="whitespace-nowrap">
                      {aboutUsd(each[i]) ?? "No estimate yet"}
                    </Text>
                    <Button
                      variant="ghost"
                      size={small ? "lg" : "md"}
                      iconOnly
                      icon="close"
                      aria-label={`Take ${name(c.model)} out`}
                      detail="Takes this model out of the comparison."
                      note="Free · Add it again any time"
                      onClick={() => setPicked(contenders.filter((_, j) => j !== i))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {contenders.length < MAX && (
            <div className="flex pt-2">
              <Combobox
                variant="button"
                icon="add"
                label="Add a model"
                placeholder="Add a model"
                searchPlaceholder="Search models…"
                value={undefined}
                onChange={(model) => setPicked([...contenders, { model, reasoning: "default" }])}
                options={options.filter((o) => !contenders.some((c) => c.model === o.value))}
              />
            </div>
          )}
        </section>

        {(!small || error) && (
          <div className="flex flex-col gap-2">
            {!small && action}
            {error && <ErrorLine>{error}</ErrorLine>}
          </div>
        )}
      </div>

      {shown && <Results id={shown} small={small} name={name} tasks={tasks} />}

      {past && past.length > 0 && (
        <section aria-label="Past comparisons" className="flex max-w-160 flex-col">
          <GroupHead label="Past comparisons" count={past.length} />
          <List label="Past comparisons" className="-mx-2">
            {past.map((p) => (
              <ListRow
                key={p.id}
                title={p.narrativeTitle ? `Reading “${p.narrativeTitle}”` : TASK_OF[p.task].subject}
                line={`${p.models.map(name).join(", ")} · ${monthDay(p.at)}`}
                tag={p.running ? <StatusTag tone="info">Running</StatusTag> : undefined}
                selected={p.id === shown}
                onOpen={() => setViewing(p.id)}
              />
            ))}
          </List>
        </section>
      )}
    </SettingsPane>
  );
}

type Tasks = FunctionReturnType<typeof api.aiSettings.list> | undefined;

// One comparison: each model's column (a tab each on a phone).
function Results({ id, small, name, tasks }: { id: Id<"comparisons">; small: boolean; name: (id: string) => string; tasks: Tasks }) {
  const c = useQuery(api.compare.get, { id });
  const [tab, setTab] = useState("0");
  if (!c) return null;
  const about = TASK_OF[c.task];
  const title = c.narrativeTitle ? `Reading “${c.narrativeTitle}”` : about.subject;
  const line = [
    monthDay(c.at),
    c.task === "extract" ? "A first read, without your record" : "From your approved record as it was then",
    c.task === "resume" ? "not saved to your resumes" : "not added to your record",
  ].join(" · ");
  const column = (x: Run, i: number) => <Column key={i} run={x} task={c.task} small={small} name={name} tasks={tasks} />;
  return (
    <section aria-label="Results" className="flex flex-col">
      <GroupHead label={title} line={line} />
      {small ? (
        <Tabs label="Models" tabs={c.contenders.map((x, i) => ({ value: String(i), label: name(x.model) }))} value={tab} onValueChange={setTab}>
          {c.contenders.map((x, i) => (
            <TabPanel key={i} value={String(i)} className="pt-3">
              {column(x, i)}
            </TabPanel>
          ))}
        </Tabs>
      ) : (
        <div className="grid gap-6 border-t pt-3" style={{ gridTemplateColumns: `repeat(${c.contenders.length}, minmax(0, 1fr))` }}>
          {c.contenders.map(column)}
        </div>
      )}
    </section>
  );
}

const TASK_WORDS: Record<Task, string> = { extract: "Reading stories", resume: "Writing resumes", insights: "Finding insights" };

// A model's run: its name, what it cost and took, Use this model, then what it wrote.
function Column({ run: x, task, small, name, tasks }: { run: Run; task: Task; small: boolean; name: (id: string) => string; tasks: Tasks }) {
  const main = useQuery(api.aiSettings.defaultChoice);
  const setDefault = useMutation(api.aiSettings.setDefault);
  const set = useMutation(api.aiSettings.set);
  const [raw, setRaw] = useState(false);
  const row = tasks?.find((t) => t.task === task);
  // A task with its own model (Advanced) changes that; otherwise the main model does.
  const own = row?.own ?? false;
  const current = own ? row?.choice : main;
  const reasoning = x.reasoning ?? undefined;
  const inUse = current?.model === x.model && (current?.reasoning ?? undefined) === reasoning;
  const use = () => {
    const before = current;
    const choice = { model: x.model, reasoning };
    void (own ? set({ task, ...choice }) : setDefault(choice)).then(() =>
      saved(own ? `${row?.label ?? TASK_WORDS[task]} now uses ${name(x.model)}` : `Every task now uses ${name(x.model)}`, () => {
        if (before) void (own ? set({ task, ...before }) : setDefault(before));
      }),
    );
  };
  const out = (x.output ?? {}) as Output;
  const meta = x.status === "done" ? [`$${(x.costUsd ?? 0).toFixed(4)}`, `${x.seconds ?? 0} seconds`, `${(x.inputTokens ?? 0).toLocaleString()} in · ${(x.outputTokens ?? 0).toLocaleString()} out`] : [];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-body-md leading-body-md font-medium text-text">{name(x.model)}</span>
          {x.status === "running" && (
            <StatusTag tone="info" icon="running">
              Running
            </StatusTag>
          )}
          {x.status === "paused" && <StatusTag tone="caution">Paused</StatusTag>}
          {x.status === "failed" && <StatusTag tone="problem">Failed</StatusTag>}
          {x.status === "done" && inUse && <StatusTag tone="info">In use</StatusTag>}
        </div>
        <Text size="sm" muted tabular>
          {[REASONING_LABELS.find((r) => r.value === (x.reasoning ?? "default"))?.label, ...meta].join(" · ")}
        </Text>
        {x.resolvedModel && x.resolvedModel !== x.model && (
          <Text size="sm" muted>
            Answered by {name(x.resolvedModel)}
          </Text>
        )}
        {x.status === "done" && !inUse && (
          <Button
            size={small ? "lg" : "sm"}
            className="self-start"
            detail={own ? `${row?.label ?? TASK_WORDS[task]} uses this model from now on; it has its own model under Advanced.` : "Every task uses this model from now on, from reading your stories to writing letters."}
            note="Free · Undo with U"
            onClick={use}
          >
            Use this model
          </Button>
        )}
      </div>
      {x.status === "paused" && <Text size="sm">{x.error} It continues when the budget allows.</Text>}
      {x.status === "failed" && <ErrorLine>{x.error ?? "The call didn’t work."}</ErrorLine>}
      {out.raw && (
        <div className="flex flex-col gap-1.5">
          <Button variant="ghost" size="sm" className="-ml-2 self-start" icon={raw ? "expand" : "goIn"} detail="Shows the start of the reply the model sent back." note="Free" onClick={() => setRaw(!raw)}>
            What the model sent back
          </Button>
          {raw && <pre className="max-h-64 overflow-auto rounded-sm bg-subtle p-2 text-body-sm leading-body-sm whitespace-pre-wrap text-muted">{out.raw}</pre>}
        </div>
      )}
      {x.status === "done" && task === "extract" && <Reading out={out} />}
      {x.status === "done" && task === "resume" && out.doc && <Page doc={out.doc} small />}
      {x.status === "done" && task === "insights" && <Insights insights={out.insights ?? []} />}
    </div>
  );
}

type OutRole = { key?: string; employer?: string; title?: string; start?: string; end?: string | null; location?: string };
type Output = {
  raw?: string;
  roles?: OutRole[];
  facts?: { roleKey?: string; text: string }[];
  context?: { text: string }[];
  doc?: ResumeDoc;
  insights?: { text: string; facts: string[] }[];
};

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// A read: its roles, each with the facts found for it, then facts tied to no role and the context.
function Reading({ out }: { out: Output }) {
  const roles = out.roles ?? [];
  const facts = out.facts ?? [];
  const context = out.context ?? [];
  const loose = facts.filter((f) => !roles.some((r) => r.key === f.roleKey));
  return (
    <div className="flex flex-col gap-4">
      <Text size="sm" muted tabular>
        {[count(roles.length, "role"), count(facts.length, "fact"), `${context.length} context`].join(" · ")}
      </Text>
      {roles.map((r, i) => {
        const mine = facts.filter((f) => f.roleKey === r.key);
        return (
          <div key={r.key ?? i} className="flex flex-col gap-1">
            <span className="text-body-sm leading-body-sm font-medium text-text">{r.title || "No title stated"}</span>
            <span className="text-body-sm leading-body-sm text-muted">
              {[r.employer || "Employer not stated", dates({ start: r.start, end: r.end ?? undefined }).replace("Present", "now"), r.location].filter(Boolean).join(" · ")}
            </span>
            {mine.length > 0 && (
              <ul className="-mx-1.5 flex flex-col gap-1">
                {mine.map((f, k) => (
                  <Line key={k} text={f.text} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {loose.length > 0 && <Group title="Not tied to a role" lines={loose.map((f) => f.text)} />}
      {context.length > 0 && <Group title="Context" lines={context.map((c) => c.text)} />}
    </div>
  );
}

function Insights({ insights }: { insights: NonNullable<Output["insights"]> }) {
  return (
    <div className="flex flex-col gap-4">
      <Text size="sm" muted tabular>
        {count(insights.length, "insight")}
      </Text>
      {insights.map((i, k) => (
        <div key={k} className="flex flex-col gap-1">
          <span className="text-body-sm leading-body-sm text-text">{i.text}</span>
          <ul className="-mx-1.5 flex flex-col gap-1">
            {i.facts.map((f, j) => (
              <li key={j} className="flex items-start gap-2 px-1.5 text-body-sm leading-body-sm text-muted">
                <span aria-hidden="true">–</span>
                <span className="min-w-0 flex-1">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Group({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label leading-label font-medium text-muted">{title}</span>
      <ul className="-mx-1.5 flex flex-col gap-1">
        {lines.map((t, k) => (
          <Line key={k} text={t} />
        ))}
      </ul>
    </div>
  );
}
