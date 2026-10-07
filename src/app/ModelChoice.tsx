"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { CatalogModel, Reasoning, Recommended } from "../../convex/aiSettings";
import { RadioGroup, type RadioOption } from "@/components/RadioGroup";
import { Tooltip } from "@/components/Tooltip";
import { useDemo } from "./demo/demo";

// The one model choice every task follows (Settings, AI; Getting started, step 2): a few recommended models, each with
// a line on what it's good at and what a month like this workspace's last one would cost with it.

export type ModelChoiceValue = { model: string; reasoning?: Reasoning };
export type Recommendations = { usage: { days: number; inputTokens: number; outputTokens: number }; models: Recommended[] };

// The recommended models with today's prices, loaded once per screen; not in the demo, which reads nothing on its own.
export function useRecommended() {
  const load = useAction(api.aiSettings.recommended);
  const demo = useDemo();
  const [data, setData] = useState<Recommendations>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!demo) load({}).then(setData, () => setError("Couldn’t load prices from OpenRouter."));
  }, [demo, load]);
  return { data, error };
}

// OpenRouter names lead with the maker ("DeepSeek: DeepSeek V4.1 Flash"); the model's own name is enough.
export const shortName = (name: string) => name.replace(/^[^:]{1,40}:\s*/, "");

// A model's name from its id (answers can carry a dated id, "deepseek/deepseek-v4.1-flash-20260901"): the catalog's or
// the recommended list's name, else the id after its maker.
export function modelName(id: string, catalog?: readonly { id: string; name: string }[], recommended?: readonly { id: string; name: string }[]) {
  const all = [...(recommended ?? []), ...(catalog ?? [])];
  const found = all.find((m) => m.id === id) ?? all.find((m) => id.startsWith(`${m.id}-`));
  return found ? shortName(found.name) : (id.split("/").pop() ?? id);
}

const perM = (n: number) => `$${n.toFixed(n < 1 || !Number.isInteger(n) ? 2 : 0)}`;

// What a month like the last one costs on a model, or its price per million tokens before there's any use to go by.
function cost(price: { inPerM: number; outPerM: number }, usage: Recommendations["usage"]) {
  if (usage.inputTokens + usage.outputTokens === 0)
    return { text: `${perM(price.inPerM)} / ${perM(price.outPerM)} per M`, why: "OpenRouter’s price per million tokens read, then written. Once CareerBot has done some work, this shows a month’s cost instead." };
  const usd = (usage.inputTokens * price.inPerM + usage.outputTokens * price.outPerM) / 1e6;
  const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);
  return {
    text: usd < 1 ? "Under $1 a month" : `About $${Math.round(usd)} a month`,
    why: `What your last ${usage.days} days of AI work (${tokens(usage.inputTokens)} tokens read, ${tokens(usage.outputTokens)} written) would cost with this model, at OpenRouter’s price today.`,
  };
}

// The picker. `value` null: nothing chosen yet. A model chosen from the full catalog shows as a row of its own, above
// the recommended ones. Choosing keeps the reasoning setting when the new model takes one.
export function ModelChoice({
  value,
  onChange,
  recommendations,
  catalog,
}: {
  value: ModelChoiceValue | null;
  onChange: (choice: ModelChoiceValue) => void;
  recommendations: Recommendations | undefined;
  catalog: CatalogModel[] | undefined;
}) {
  const usage = recommendations?.usage ?? { days: 30, inputTokens: 0, outputTokens: 0 };
  const listed = recommendations?.models ?? [];
  const meta = (price: { inPerM: number; outPerM: number } | null) => {
    if (!price) return "Not offered now";
    const c = cost(price, usage);
    return (
      <Tooltip content={c.text} detail={c.why}>
        <span>{c.text}</span>
      </Tooltip>
    );
  };
  const own = value && !listed.some((m) => m.id === value.model) ? catalog?.find((m) => m.id === value.model) : undefined;
  const options: RadioOption<string>[] = [
    ...(value && !listed.some((m) => m.id === value.model)
      ? [{ value: value.model, label: modelName(value.model, catalog), description: "Chosen from all OpenRouter models.", meta: own ? meta(own) : undefined }]
      : []),
    ...listed.map((m) => ({ value: m.id, label: shortName(m.name), description: m.description, meta: meta(m.price) })),
  ];
  const takesReasoning = (id: string) => listed.find((m) => m.id === id)?.price?.reasoning ?? catalog?.find((m) => m.id === id)?.reasoning ?? false;
  return (
    <RadioGroup
      label="Model"
      hideLabel
      divided
      value={value?.model ?? null}
      onChange={(model) => onChange({ model, reasoning: takesReasoning(model) ? value?.reasoning : undefined })}
      options={options}
    />
  );
}
