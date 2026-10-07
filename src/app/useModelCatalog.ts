"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { CatalogModel } from "../../convex/aiSettings";
import type { ComboboxOption } from "@/components/Combobox";
import { useDemo } from "./demo/demo";

// OpenRouter's current model list, loaded once per page. The demo reads nothing on its own (no list there; a choice
// shows by its name).
export function useModelCatalog() {
  const load = useAction(api.aiSettings.catalog);
  const demo = useDemo();
  const [models, setModels] = useState<CatalogModel[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!demo) load({}).then(setModels, () => setError("Couldn’t load models from OpenRouter."));
  }, [demo, load]);
  return { models, error };
}

const price = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(3) : n.toFixed(2)}`;

// Tasks that read structured replies need models that support JSON output.
export function modelOptions(models: CatalogModel[] | undefined, needsJson: boolean): ComboboxOption[] {
  return (models ?? [])
    .filter((m) => !needsJson || m.json)
    .map((m) => ({
      value: m.id,
      label: m.name,
      detail: `${price(m.inPerM)} in · ${price(m.outPerM)} out per million tokens${m.reasoning ? " · reasoning" : ""}`,
    }));
}

export const REASONING_OPTIONS = [
  { value: "default", label: "Model default" },
  { value: "none", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;
export type ReasoningOption = (typeof REASONING_OPTIONS)[number]["value"];
export const toReasoning = (r: ReasoningOption) => (r === "default" ? undefined : r);
