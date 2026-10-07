"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Field, Input } from "./Field";
import { Icons } from "./icons";
import { Popover } from "./Popover";

const pad = (n: number) => String(n).padStart(2, "0");

// A typed time as HH:MM, or null when it isn't one. Takes "2pm", "2:30 pm", "14:00", "1400", "9", "noon" and "midnight".
export function readTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  if (t === "noon") return "12:00";
  if (t === "midnight") return "00:00";
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].startsWith("p") ? 12 : 0);
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

// "9:00", "14:30", as the field and the list show a time.
const shown = (time: string) => `${Number(time.slice(0, 2))}:${time.slice(3)}`;

// Every half hour of the day.
const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);

// The half hours as a listbox: ↑ ↓ move, Home/End jump, Enter picks. Opens on the chosen time, or 9:00.
function TimeList({ label, selected, onSelect }: { label: string; selected: string | null; onSelect: (time: string) => void }) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const near = selected ? TIMES.findIndex((t) => t >= selected) : TIMES.indexOf("09:00");
  const [active, setActive] = useState(near < 0 ? TIMES.length - 1 : near);
  // Opens with the chosen time two rows down in the panel, or mid-sheet on a phone (where the sheet scrolls, not the
  // list), so the times just before it show too; then the list follows the keys.
  useEffect(() => {
    const el = list.current;
    const row = el?.querySelector(`[data-index="${active}"]`);
    if (!el || !row) return;
    el.focus({ preventScroll: true });
    if (el.scrollHeight > el.clientHeight) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - 2 * (row.getBoundingClientRect().height + 1);
    else row.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, []);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const onKeyDown = (e: KeyboardEvent) => {
    const to = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: TIMES.length - 1, PageDown: active + 6, PageUp: active - 6 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      setActive(Math.max(0, Math.min(TIMES.length - 1, to)));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(TIMES[active]);
    }
  };
  return (
    <div
      ref={list}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={`${id}-${active}`}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-px outline-none md:max-h-[185px] md:overflow-y-auto"
    >
      {TIMES.map((time, i) => (
        <div
          key={time}
          id={`${id}-${i}`}
          data-index={i}
          role="option"
          aria-selected={time === selected}
          onMouseMove={() => setActive(i)}
          onClick={() => onSelect(time)}
          className={`flex h-[30px] shrink-0 cursor-default items-center gap-2.5 rounded-sm px-2 text-body-sm leading-body-sm text-text tabular-nums max-md:h-11 ${i === active ? "bg-subtle" : ""}`}
        >
          <span className="flex w-4 shrink-0">{time === selected && <Icons.approve aria-hidden />}</span>
          {shown(time)}
        </div>
      ))}
    </div>
  );
}

// A labelled time: type it ("2pm", "14:00"), or pick a half hour from the list behind the clock button (↓ opens it
// from the field). Enter or leaving the field saves what's typed; an empty field clears the time. Values are HH:MM.
export function TimeField({
  label,
  value,
  onChange,
  placeholder = "Type or pick a time",
  hint = "Type ‘2pm’ or ‘14:00’",
  disabled,
  className = "",
}: {
  label: string;
  value: string | null;
  onChange: (time: string | null) => void;
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
  const time = text.trim() ? readTime(text) : null;
  const bad = !!text.trim() && !time;
  const choose = (next: string) => {
    setText(shown(next));
    setChecked(false);
    setOpen(false);
    if (next !== value) onChange(next);
  };
  const save = () => {
    setChecked(bad);
    if (bad) return;
    if (time !== value) onChange(time);
    if (time) setText(shown(time));
  };
  return (
    <Field label={label} className={className} error={checked && bad ? "Type a time like 2pm or 14:00." : undefined} hint={hint}>
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
              width={200}
              trigger={
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Choose ${label.toLowerCase()}`}
                  className="-mx-2 -my-2 flex size-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-100 hover:text-text max-md:-mx-3.5 max-md:-my-3.5 max-md:size-11"
                >
                  <Icons.time aria-hidden />
                </button>
              }
            >
              <TimeList label={label} selected={time ?? value} onSelect={choose} />
            </Popover>
          }
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "ArrowDown" && !disabled) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
      )}
    </Field>
  );
}
