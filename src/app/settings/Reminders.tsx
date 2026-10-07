"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { REMINDER_RULES, RULE_LABELS } from "../../../convex/pursuitSteps";
import type { ScreenSize } from "@/components/Panes";
import { Switch } from "@/components/Switch";
import { saved, SettingsPane } from "./ui";

// Which reminders a pursuit shows as its next step, each switchable.
export function Reminders({ size }: { size: ScreenSize }) {
  const rules = useQuery(api.pursuits.reminderRules);
  const set = useMutation(api.pursuits.setReminderRule);
  return (
    <SettingsPane title="Reminders" size={size}>
      {rules && (
        <div className="flex flex-col border-b">
          {REMINDER_RULES.map((rule) => (
            <div key={rule} className="border-t py-4">
              <Switch
                label={RULE_LABELS[rule].title}
                description={RULE_LABELS[rule].line}
                checked={rules[rule]}
                onChange={(on) => void set({ rule, on }).then(() => saved(`${RULE_LABELS[rule].title}: ${on ? "on" : "off"}`, () => void set({ rule, on: !on })))}
              />
            </div>
          ))}
        </div>
      )}
    </SettingsPane>
  );
}
