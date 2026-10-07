"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { CatalogModel } from "../../../convex/aiSettings";
import type { AiTask } from "../../../convex/aiTasks";
import { Button, buttonLook } from "@/components/Button";
import { Combobox } from "@/components/Combobox";
import { ErrorLine, Input } from "@/components/Field";
import { Icons } from "@/components/icons";
import type { ScreenSize } from "@/components/Panes";
import { Select } from "@/components/Select";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { ModelChoice, type ModelChoiceValue, modelName, type Recommendations } from "../ModelChoice";
import { modelOptions, REASONING_OPTIONS, type ReasoningOption, toReasoning, useModelCatalog } from "../useModelCatalog";
import { GroupHead, saved, SettingsPane } from "./ui";

// AI: the one model every task uses, a test call to try it, and Advanced, folded: the tasks given a model of their
// own, choosing one for another task, how roles are sorted, a model from the full list, and Compare models.

// TypeSafe's decision models (Jev), offered for sorting roles.
const DECISION_MAKER = "typesafe/";

export function Ai({ size, recommended }: { size: ScreenSize; recommended: { data?: Recommendations; error?: string } }) {
  const main = useQuery(api.aiSettings.defaultChoice);
  const setDefault = useMutation(api.aiSettings.setDefault);
  const { models: catalog, error: catalogError } = useModelCatalog();
  const listed = recommended.data?.models;
  const name = (id: string) => modelName(id, catalog, listed);

  const choose = (next: ModelChoiceValue) => {
    const before = main;
    void setDefault(next).then(() =>
      saved(`Every task now uses ${name(next.model)}`, () => {
        if (before) void setDefault(before);
      }),
    );
  };

  return (
    <SettingsPane title="AI" size={size}>
      <section aria-label="Model" className="flex flex-col">
        <GroupHead label="Model" line={main ? "Every task uses this model, from reading your stories to writing letters." : "Choose the model every task uses."} />
        {main !== undefined && <ModelChoice value={main} onChange={choose} recommendations={recommended.data} catalog={catalog} />}
        {recommended.error && (
          <div className="pt-2">
            <ErrorLine>{recommended.error}</ErrorLine>
          </div>
        )}
      </section>
      <TryIt size={size} name={name} catalog={catalog} model={main?.model} />
      <Advanced size={size} main={main ?? null} name={name} catalog={catalog} catalogError={catalogError} onChooseMain={choose} />
    </SettingsPane>
  );
}

const PROMPT = "In one sentence, what does a great career coach do?";
// A test call's prompt and reply, in tokens, for its estimate.
const TRY_TOKENS = { in: 40, out: 120 };

type TestResult = { text?: string; model?: string; costUsd?: number; ms?: number };

// The first call: one question to check the key and see how the model answers.
function TryIt({ size, name, catalog, model }: { size: ScreenSize; name: (id: string) => string; catalog?: CatalogModel[]; model?: string }) {
  const start = useMutation(api.jobs.start);
  const job = useQuery(api.jobs.latestTestCall);
  const [prompt, setPrompt] = useState(PROMPT);
  const busy = job?.status === "queued" || job?.status === "running";
  const price = catalog?.find((m) => m.id === model);
  const usd = price ? (TRY_TOKENS.in * price.inPerM + TRY_TOKENS.out * price.outPerM) / 1e6 : null;
  const estimate = usd === null ? null : usd < 0.01 ? "Under $0.01" : `About $${usd.toFixed(2)}`;
  const result = job?.status === "done" ? (job.result as TestResult | undefined) : undefined;
  const small = size === "small";
  const run = () => void start({ prompt });
  return (
    <section aria-label="Try it" className="flex flex-col gap-3">
      <GroupHead label="Try it" line="Ask the model one question to check your key and see how it answers." />
      <div className="-mt-3 flex flex-col gap-2 @lg:flex-row @lg:items-center">
        <Input aria-label="Question" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && prompt.trim() && !busy && model && run()} className="min-w-0 @lg:flex-1" />
        <div className="flex items-center gap-3">
          <Button
            size={small ? "lg" : "md"}
            loading={busy}
            loadingLabel="Asking"
            reason={!model ? "Choose a model first." : !prompt.trim() ? "Write a question first." : undefined}
            detail="Sends the question to the model and shows its answer, with what it cost."
            note={estimate ? `${estimate} from your AI budget` : "From your AI budget"}
            onClick={run}
          >
            Try it
          </Button>
          {estimate && (
            <Text size="sm" muted className="shrink-0">
              {estimate}
            </Text>
          )}
        </div>
      </div>
      {result && (
        <div className="flex flex-col gap-1 border-l-2 border-good py-0.5 pl-3.5">
          <Text>{result.text}</Text>
          <Text size="sm" muted tabular>
            {[result.model && name(result.model), result.ms !== undefined && `${(result.ms / 1000).toFixed(1)} seconds`, `$${(result.costUsd ?? 0).toFixed(4)}`].filter(Boolean).join(" · ")}
          </Text>
        </div>
      )}
      {job?.status === "paused" && <Text size="sm">Paused: {job.error} It continues when the budget allows.</Text>}
      {job?.status === "failed" && <ErrorLine>{job.error ?? "The call didn’t work."}</ErrorLine>}
    </section>
  );
}

function Advanced({
  size,
  main,
  name,
  catalog,
  catalogError,
  onChooseMain,
}: {
  size: ScreenSize;
  main: ModelChoiceValue | null;
  name: (id: string) => string;
  catalog?: CatalogModel[];
  catalogError?: string;
  onChooseMain: (choice: ModelChoiceValue) => void;
}) {
  const tasks = useQuery(api.aiSettings.list);
  const method = useQuery(api.roles.sortMethodChoice);
  const set = useMutation(api.aiSettings.set);
  const clearTask = useMutation(api.aiSettings.clearTask);
  const setSortMethod = useMutation(api.roles.setSortMethod);
  // Open when coming back from Compare models.
  const [open, setOpen] = useState(useSearchParams().get("advanced") === "1");
  const small = size === "small";

  const own = (tasks ?? []).filter((t) => !t.decision && t.own);
  const following = (tasks ?? []).filter((t) => !t.decision && !t.own);
  const summary = own.length === 0 ? "Every task uses the main model" : own.length === 1 ? `${own[0].label} uses its own model` : `${own.length} tasks use their own model`;

  // Sorting roles: the model sorting uses (its own, or the main one), or a decision model.
  const sorter = tasks?.find((t) => t.task === "roleSort")?.choice;
  const jev = tasks?.find((t) => t.task === "roleSortJev")?.choice;
  const decisionModels = [...new Set([...(jev ? [jev.model] : []), ...(catalog ?? []).filter((m) => m.id.startsWith(DECISION_MAKER)).map((m) => m.id)])];
  const sortValue = method === "jev" && jev ? jev.model : "model";
  const sortOptions = [{ value: "model", label: sorter ? name(sorter.model) : "The main model" }, ...decisionModels.map((id) => ({ value: id, label: name(id) }))];
  const chooseSort = (value: string) => {
    const before = { method, jev };
    const done = () =>
      saved(`Sorting roles with ${value === "model" ? (sorter ? name(sorter.model) : "the main model") : name(value)}`, () => {
        if (before.jev && before.jev.model !== value) void set({ task: "roleSortJev", ...before.jev });
        if (before.method) void setSortMethod({ method: before.method });
      });
    if (value === "model") return void setSortMethod({ method: "model" }).then(done);
    void Promise.all([jev?.model === value ? null : set({ task: "roleSortJev", model: value }), setSortMethod({ method: "jev" })]).then(done);
  };

  const giveOwn = (task: AiTask) => {
    if (!main) return;
    const label = tasks?.find((t) => t.task === task)?.label ?? task;
    void set({ task, ...main }).then(() => toast({ message: `${label} has its own model now. Choose it below.` }));
  };
  const backToMain = (task: AiTask, label: string, before: ModelChoiceValue | null) =>
    void clearTask({ task }).then(() =>
      saved(`${label} uses the main model again`, () => {
        if (before) void set({ task, ...before });
      }),
    );

  const Chevron = open ? Icons.expand : Icons.goIn;
  return (
    <section aria-label="Advanced" className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="ai-advanced"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2.5 border-t py-3 text-left transition-colors duration-100 hover:bg-subtle max-md:min-h-11 ${open ? "" : "border-b"}`}
      >
        <Chevron aria-hidden="true" className="shrink-0 text-muted" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 @lg:flex-row @lg:items-baseline @lg:justify-between @lg:gap-4">
          <span className="text-body-md leading-body-md font-medium text-text">Advanced</span>
          {!open && tasks && <span className="truncate text-body-sm leading-body-sm text-muted">{summary}</span>}
        </span>
      </button>
      {open && tasks && (
        <div id="ai-advanced" className="flex flex-col gap-7 pt-3 pb-2 @lg:pl-6.5">
          {catalogError && <ErrorLine>{catalogError}</ErrorLine>}
          <div className="flex flex-col">
            <GroupHead label="Tasks with their own model" count={own.length} line={main ? `Every other task uses ${name(main.model)}.` : "Every other task uses the main model."} />
            {own.length > 0 && (
              <ul className="flex flex-col border-b">
                {own.map((t) => (
                  <li key={t.task} className="flex flex-col gap-2 border-t py-2.5 @xl:flex-row @xl:items-center">
                    <span className="min-w-0 flex-1 text-body-sm leading-body-sm font-medium text-text">{t.label}</span>
                    <div className="@xl:w-47 @xl:shrink-0">
                      <Combobox
                        label={`Model for ${t.label.toLowerCase()}`}
                        value={t.choice?.model}
                        onChange={(model) => void set({ task: t.task, model, reasoning: t.choice?.reasoning })}
                        options={modelOptions(catalog, t.task !== "firstCall")}
                        searchPlaceholder="Search models…"
                      />
                    </div>
                    {t.choice && (catalog?.find((m) => m.id === t.choice?.model)?.reasoning ?? true) && (
                      <Select
                        label={`Reasoning for ${t.label.toLowerCase()}`}
                        value={(t.choice.reasoning ?? "default") as ReasoningOption}
                        onChange={(r) => void set({ task: t.task, model: t.choice!.model, reasoning: toReasoning(r) })}
                        options={REASONING_OPTIONS.map((o) => ({ value: o.value, label: o.value === "default" ? "Model’s default reasoning" : o.value === "none" ? "No reasoning" : `${o.label} reasoning` }))}
                        className="w-full @xl:w-46"
                      />
                    )}
                    <span className="hidden @xl:flex">
                      <Button
                        variant="ghost"
                        iconOnly
                        icon="close"
                        aria-label={`${t.label}: use the main model`}
                        detail="Goes back to the model every other task uses."
                        note="Free · Undo with U"
                        onClick={() => backToMain(t.task, t.label, t.choice)}
                      />
                    </span>
                    <Button
                      variant="ghost"
                      size={small ? "lg" : "md"}
                      className="self-start @xl:hidden"
                      detail="Goes back to the model every other task uses."
                      note="Free · Undo with U"
                      onClick={() => backToMain(t.task, t.label, t.choice)}
                    >
                      Use the main model
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {following.length > 0 && main && (
              <div className="flex pt-2">
                <Combobox
                  variant="button"
                  icon="add"
                  label="Choose a model for a task"
                  placeholder="Choose for a task"
                  searchPlaceholder="Find a task"
                  value={undefined}
                  onChange={(task) => giveOwn(task as AiTask)}
                  options={following.map((t) => ({ value: t.task, label: t.label }))}
                />
              </div>
            )}
          </div>
          <Choice title="Sorting roles" line="Sorts new roles into your directions. Jev is a decision model made for this; the main model works too.">
            {method !== undefined && <Select label="Sorting roles" value={sortValue} onChange={chooseSort} options={sortOptions} className="w-full @lg:w-47" />}
          </Choice>
          <Choice title="A model that isn’t listed" line="Pick any OpenRouter model for every task instead of one above.">
            <Combobox
              variant="button"
              label="Choose from all models"
              placeholder="Choose from all models"
              searchPlaceholder="Search models…"
              value={main?.model}
              onChange={(model) => onChooseMain({ model, reasoning: main?.reasoning })}
              options={modelOptions(catalog, true)}
            />
          </Choice>
          <Choice title="Compare models" line="Run one task with up to four models and see what each does, side by side: reading a story, writing the base resume or finding insights. Uses your AI budget; your record and resumes don’t change.">
            <Link href="/settings?section=ai&compare=1" className={buttonLook("secondary", "self-start", small ? "lg" : "md")}>
              Compare models
              <Icons.goIn aria-hidden="true" />
            </Link>
          </Choice>
        </div>
      )}
    </section>
  );
}

function Choice({ title, line, children }: { title: string; line: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-3.5 @lg:flex-row @lg:items-start @lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-sm leading-body-sm font-medium text-text">{title}</span>
        <span className="text-body-sm leading-body-sm text-muted">{line}</span>
      </div>
      <div className="flex shrink-0 flex-col @lg:items-end">{children}</div>
    </div>
  );
}
