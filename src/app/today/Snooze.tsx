"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { dayOf, type ReminderRule, SNOOZE_CHOICES, snoozeDay } from "../../../convex/pursuitSteps";
import { Button, type ButtonSize } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { Popover } from "@/components/Popover";
import { toast } from "@/components/Toast";
import { useNow } from "../clock";

const shown = (day: string) => new Date(dayOf(day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Snooze a pursuit's reminder: Tomorrow, In 3 days, Next week, or a day picked. It leaves Today until then, with Undo.
// `iconOnly` where the phone's bar also holds two send actions.
export function Snooze({
  pursuitId,
  rule,
  size = "md",
  iconOnly = false,
  onSnoozed,
}: {
  pursuitId: Id<"pursuits">;
  rule: ReminderRule;
  size?: ButtonSize;
  iconOnly?: boolean;
  onSnoozed?: () => void;
}) {
  const snooze = useMutation(api.pursuits.snooze);
  const unsnooze = useMutation(api.pursuits.unsnooze);
  const [open, setOpen] = useState(false);
  const now = useNow(true);
  const tomorrow = snoozeDay(now, 1);
  const until = (day: string) => {
    setOpen(false);
    snooze({ id: pursuitId, rule, until: day })
      .then(() => {
        onSnoozed?.();
        toast({ message: `Snoozed until ${shown(day)}`, icon: "time", action: { label: "Undo", key: "U", run: () => void unsnooze({ id: pursuitId }) } });
      })
      .catch((e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t snooze it.", icon: "failed" }));
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title="Snooze until"
      align="start"
      width={240}
      trigger={
        <Button icon="time" size={size} iconOnly={iconOnly} aria-label="Snooze" detail="Hides this reminder until the day you pick. It comes back on Today then." note="Free · Undo with U">
          Snooze
        </Button>
      }
    >
      <div className="flex flex-col gap-px">
        {SNOOZE_CHOICES.map((c) => (
          <Button key={c.label} variant="ghost" className="justify-start max-md:h-11" detail="Hides this reminder until that day. It comes back on Today then." note="Free · Undo with U" onClick={() => until(snoozeDay(now, c.days))}>
            <span className="flex-1 text-left">{c.label}</span>
            <span className="text-muted">{shown(snoozeDay(now, c.days))}</span>
          </Button>
        ))}
        <div className="border-t px-1 pt-2 pb-1">
          <DateField label="Pick a day" value={null} placeholder="A day after today" onChange={(day) => day && day >= tomorrow && until(day)} hint="The day it comes back" />
        </div>
      </div>
    </Popover>
  );
}
