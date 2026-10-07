"use client";

import { useState, type KeyboardEvent } from "react";
import { DayPicker, type ChevronProps } from "react-day-picker";
import { Button } from "./Button";
import { Field, Input } from "./Field";
import { Icons } from "./icons";
import { Popover } from "./Popover";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const capital = (word: string) => word[0].toUpperCase() + word.slice(1);

// What a typed day reads as: the day (YYYY-MM-DD), or what's wrong with it in plain words.
// Takes "Oct 3", "October 3, 2026", "3 Oct", "10/3", "2026-10-03", "today", "tomorrow", "thu" and "next thu".
// Without a year: this year, or next year when that day is more than two months gone.
export function readDayOrProblem(text: string, today = new Date()): { day: string } | { problem: string } {
  const t = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  const vague = { problem: "Type a date like Oct 3 or next Thu." };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const shift = { today: 0, tomorrow: 1, yesterday: -1 }[t];
  if (shift !== undefined) return { day: iso(new Date(start.getTime() + shift * DAY_MS)) };
  const weekday = /^(?:(next|this) )?([a-z]{3,})\.?$/.exec(t);
  const wd = weekday ? WEEKDAYS.findIndex((w) => w.startsWith(weekday[2])) : -1;
  if (weekday && wd >= 0) {
    const ahead = (wd - start.getDay() + 7) % 7 || (weekday[1] === "next" ? 7 : 0);
    return { day: iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + ahead)) };
  }
  let y: number | undefined;
  let m: number | undefined;
  let d: number | undefined;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  const named = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(t) ?? /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?: (\d{4}))?$/.exec(t);
  if (isoMatch) [y, m, d] = [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])];
  else if (slash) [m, d, y] = [Number(slash[1]), Number(slash[2]), slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : undefined];
  else if (named) {
    const [word, num] = /^\d/.test(named[1]) ? [named[2], named[1]] : [named[1], named[2]];
    const i = word.length >= 3 ? MONTHS.findIndex((x) => x.startsWith(word)) : -1;
    if (i < 0) return vague;
    [m, d, y] = [i + 1, Number(num), named[3] ? Number(named[3]) : undefined];
  } else return vague;
  if (m < 1 || m > 12 || d < 1) return vague;
  if (y === undefined) {
    y = today.getFullYear();
    if (new Date(y, m - 1, Math.min(d, 28)).getTime() < today.getTime() - 61 * DAY_MS) y += 1;
  }
  const length = new Date(y, m, 0).getDate();
  if (d > length) return { problem: m === 2 && length === 28 && d === 29 ? `February ${y} has 28 days.` : `${capital(MONTHS[m - 1])} has ${length} days.` };
  return { day: `${y}-${pad(m)}-${pad(d)}` };
}

// A typed day as YYYY-MM-DD, or null when it isn't one.
export function readDay(text: string, today = new Date()): string | null {
  const read = readDayOrProblem(text, today);
  return "day" in read ? read.day : null;
}

// "Sep 24, 2026", as the field shows a day.
const shown = (day: string) => toDate(day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Chevron({ orientation }: ChevronProps) {
  return orientation === "left" ? <Icons.back aria-hidden /> : <Icons.goIn aria-hidden />;
}

// The month grid, weeks from Monday; the chosen day is steel. Opens on the chosen day, or today, and takes the arrow keys.
function Calendar({ selected, onSelect, onToday, onClear }: { selected: string | null; onSelect: (day: string) => void; onToday: () => void; onClear: () => void }) {
  const [month, setMonth] = useState(() => (selected ? toDate(selected) : new Date()));
  return (
    <div className="p-1 max-md:p-0">
      <DayPicker
        mode="single"
        selected={selected ? toDate(selected) : undefined}
        onSelect={(d) => d && onSelect(iso(d))}
        month={month}
        onMonthChange={setMonth}
        weekStartsOn={1}
        showOutsideDays
        navLayout="around"
        autoFocus
        components={{ Chevron }}
        classNames={{
          root: "w-full",
          months: "w-full",
          month: "flex w-full flex-wrap items-center px-1 max-md:px-0",
          button_previous:
            "flex size-7 items-center justify-center rounded-sm text-text transition-colors duration-100 hover:bg-subtle aria-disabled:opacity-50 max-md:size-11",
          button_next:
            "flex size-7 items-center justify-center rounded-sm text-text transition-colors duration-100 hover:bg-subtle aria-disabled:opacity-50 max-md:size-11",
          month_caption: "flex flex-1 justify-center",
          caption_label: "text-body-sm leading-body-sm font-semibold text-text",
          month_grid: "mt-2 w-full table-fixed border-collapse",
          weekdays: "",
          weekday: "pb-px text-center text-label leading-label font-normal text-muted",
          weeks: "",
          week: "",
          day: "p-0 text-center",
          day_button:
            "mx-auto flex h-[30px] w-full items-center justify-center rounded-sm text-body-sm leading-body-sm text-text tabular-nums transition-colors duration-100 hover:bg-subtle max-md:h-11",
          selected: "[&>button]:bg-steel-subtle [&>button]:font-semibold [&>button]:shadow-[inset_0_0_0_1px_var(--color-steel)] [&>button]:hover:bg-steel-subtle",
          outside: "[&>button]:text-muted [&>button]:opacity-50",
          today: "",
          disabled: "[&>button]:opacity-50",
          hidden: "invisible",
          focused: "",
        }}
      />
      <div className="mt-1 flex justify-between border-t border-border px-1 pt-2 pb-0.5 max-md:px-0">
        <Button variant="ghost" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

// A labelled day: type it in words, or pick it from the calendar behind the calendar button (↓ opens it from the field).
// Enter or leaving the field saves what's typed; an empty field clears the day. A day that doesn't exist says why.
export function DateField({
  label,
  value,
  onChange,
  placeholder = "No date",
  hint,
  disabled,
  className = "",
}: {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value ? shown(value) : "");
  const [seen, setSeen] = useState(value);
  const [open, setOpen] = useState(false);
  // Checked when you leave the field or press Enter; after that the error follows what you type.
  const [checked, setChecked] = useState(false);
  if (value !== seen) {
    setSeen(value);
    setText(value ? shown(value) : "");
  }
  const read = text.trim() ? readDayOrProblem(text) : null;
  const day = read && "day" in read ? read.day : null;
  const choose = (next: string | null) => {
    setText(next ? shown(next) : "");
    setChecked(false);
    setOpen(false);
    if (next !== value) onChange(next);
  };
  const save = () => {
    const bad = read !== null && "problem" in read;
    setChecked(bad);
    if (bad) return;
    if (day !== value) onChange(day);
    if (day) setText(shown(day));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") save();
    if (e.key === "ArrowDown" && !disabled) {
      e.preventDefault();
      setOpen(true);
    }
  };
  return (
    <Field
      label={label}
      className={className}
      error={checked && read && "problem" in read ? read.problem : undefined}
      hint={day && day !== value ? toDate(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : hint}
    >
      {(props) => (
        <Input
          {...props}
          disabled={disabled}
          start={
            <Popover
              open={open}
              onOpenChange={setOpen}
              title={label}
              align="start"
              width={240}
              trigger={
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Choose ${label.toLowerCase()}`}
                  className="-mx-2 -my-2 flex size-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-100 hover:text-text max-md:-mx-3.5 max-md:-my-3.5 max-md:size-11"
                >
                  <Icons.date aria-hidden />
                </button>
              }
            >
              <Calendar selected={day ?? value} onSelect={choose} onToday={() => choose(readDay("today"))} onClear={() => choose(null)} />
            </Popover>
          }
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
        />
      )}
    </Field>
  );
}
