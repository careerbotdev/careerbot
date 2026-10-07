"use client";

import { type KeyboardEvent, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Icons } from "./icons";
import { Skeleton } from "./Skeleton";
import { Tooltip } from "./Tooltip";

// Charts for reports (the Chart board in Paper). Every chart shows its numbers, and every number explains itself: hover
// or focus a number, bar, row or point for its tooltip, long-press it on a phone. Colour means what it means everywhere
// else: steel for amounts that mean nothing on their own, green only for good outcomes, burnt orange for caution, red
// for problems, the track for weak fits and empty space; the category colours, in their order, tell series apart and
// never stand for a status. Arrow keys move between a chart's bars or points; Tab leaves.

export type Tone = "steel" | "good" | "caution" | "red" | "track" | "blue" | "violet" | "brick" | "categorySteel" | "green" | "orange";

// A number's explainer: what it counts (`title`), then the figures behind it and anything worth knowing.
export type Explain = { title: string; detail?: ReactNode; note?: ReactNode };

// Each tone as a fill, the words on that fill, a line and a dot.
const TONES: Record<Tone, { bg: string; on: string; stroke: string; fill: string }> = {
  steel: { bg: "bg-steel", on: "text-ink", stroke: "stroke-steel", fill: "fill-steel" },
  good: { bg: "bg-good", on: "text-paper dark:text-ink", stroke: "stroke-good", fill: "fill-good" },
  caution: { bg: "bg-caution", on: "text-paper dark:text-ink", stroke: "stroke-caution", fill: "fill-caution" },
  red: { bg: "bg-red", on: "text-paper", stroke: "stroke-red", fill: "fill-red" },
  track: { bg: "bg-border", on: "text-muted", stroke: "stroke-border", fill: "fill-border" },
  blue: { bg: "bg-category-blue", on: "text-paper", stroke: "stroke-category-blue", fill: "fill-category-blue" },
  violet: { bg: "bg-category-violet", on: "text-paper", stroke: "stroke-category-violet", fill: "fill-category-violet" },
  brick: { bg: "bg-category-brick", on: "text-paper", stroke: "stroke-category-brick", fill: "fill-category-brick" },
  categorySteel: { bg: "bg-category-steel", on: "text-ink", stroke: "stroke-category-steel", fill: "fill-category-steel" },
  green: { bg: "bg-category-green", on: "text-paper", stroke: "stroke-category-green", fill: "fill-category-green" },
  orange: { bg: "bg-category-burnt-orange", on: "text-paper", stroke: "stroke-category-burnt-orange", fill: "fill-category-burnt-orange" },
};

// The category colours in the order series take them.
export const CATEGORIES: Tone[] = ["blue", "violet", "brick", "categorySteel", "green", "orange"];

const figures = "tabular-nums";

// The width an element is drawn at, kept up to date as it changes.
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// A chart's bars or points: one tab stop (the last one focused), the arrow keys move, Home and End jump.
function usePoints(count: number) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const current = Math.min(at, Math.max(0, count - 1));
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const next = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: count - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      const to = Math.min(count - 1, Math.max(0, next));
      setAt(to);
      ref.current?.querySelectorAll<HTMLElement>("[data-point]")[to]?.focus();
    },
    [current, count],
  );
  const point = (i: number) => ({ "data-point": "", tabIndex: i === current ? 0 : -1, onFocus: () => setAt(i) });
  return { ref, onKeyDown, point };
}

// Anything shown with its explainer: the tooltip on hover and focus (a sheet on a long press), and a dashed underline
// while it's pointed at, so a number reads as something to ask about.
export function Explained({ explain, side = "bottom", className = "", children }: { explain: Explain; side?: "top" | "bottom"; className?: string; children: ReactNode }) {
  return (
    <Tooltip content={explain.title} detail={explain.detail} note={explain.note} side={side}>
      <span tabIndex={0} className={`cursor-default border-b border-dashed border-transparent outline-offset-2 transition-colors duration-100 hover:border-muted focus-visible:border-muted ${className}`}>
        {children}
      </span>
    </Tooltip>
  );
}

// ---- Numbers ----

// How much of a budget is used: steel, burnt orange from 80%, red once it's past.
export function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const share = max > 0 ? value / max : 0;
  const fill = share > 1 ? "bg-red" : share >= 0.8 ? "bg-caution" : "bg-steel";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="flex h-1 w-full shrink-0 overflow-clip rounded-xs bg-border">
      <div className={`h-full ${fill}`} style={{ width: `${Math.min(1, share) * 100}%` }} />
    </div>
  );
}

// A small line of how something grew, ending in a dot at the latest value. Steel, or green for a good outcome.
export function Sparkline({ label, values, tone = "steel", width = 80, height = 28 }: { label: string; values: number[]; tone?: "steel" | "good"; width?: number; height?: number }) {
  if (values.length < 2) return <span className="shrink-0" style={{ width, height }} />;
  const pad = 3;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (values.length - 1);
  const y = (v: number) => (hi === lo ? height / 2 : height - pad - ((v - lo) * (height - 2 * pad)) / (hi - lo));
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const end = values.length - 1;
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline points={points} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={TONES[tone].stroke} />
      <circle cx={x(end)} cy={y(values[end])} r={2.5} className={TONES[tone].fill} />
    </svg>
  );
}

export type NumberLine = { text: ReactNode; tone?: "muted" | "good" | "caution" | "problem" };

const LINE_TONES = { muted: "text-muted", good: "text-good-text", caution: "text-caution-text", problem: "text-red dark:text-text" };

// A big number with what it's out of, a meter against a budget, a sparkline, and lines under it (how it changed:
// green only when more is good). The number carries its explainer.
export function ChartNumber({
  label,
  value,
  of,
  meter,
  spark,
  lines = [],
  explain,
}: {
  label: string;
  value: string;
  of?: string;
  meter?: { value: number; max: number };
  spark?: { values: number[]; tone?: "steel" | "good" };
  lines?: NumberLine[];
  explain: Explain;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-label leading-label font-medium text-muted">{label}</span>
      <span className={`flex min-w-0 flex-wrap items-end ${spark ? "gap-3" : "gap-1.5"}`}>
        <Explained explain={explain} className={`text-display leading-display font-semibold tracking-display text-text md:text-figure md:leading-figure md:tracking-figure ${figures}`}>
          {value}
        </Explained>
        {of && <span className={`pb-1 text-body-sm leading-body-sm text-muted ${figures}`}>{of}</span>}
        {spark && <Sparkline label={`${label} over time`} values={spark.values} tone={spark.tone} />}
      </span>
      {meter && <Meter label={label} value={meter.value} max={meter.max} />}
      {lines.map((l, i) => (
        <span key={i} className={`flex items-center gap-1.5 text-body-sm leading-body-sm ${figures} ${LINE_TONES[l.tone ?? "muted"]}`}>
          {l.tone === "problem" && <Icons.failed className="shrink-0 text-red" aria-hidden />}
          {l.text}
        </span>
      ))}
    </div>
  );
}

// ---- The frame every chart sits in ----

export type LegendItem = { label: string; tone: Tone } | { label: string; budget: true };

// A colour's square: 8px in a legend, 16px on the board that lists what each colour means.
export function Swatch({ tone, large = false }: { tone: Tone; large?: boolean }) {
  return <span className={`shrink-0 rounded-xs ${large ? "size-4" : "size-2"} ${TONES[tone].bg}`} />;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-label leading-label text-muted">
          {"budget" in item ? <span className="w-4 shrink-0 border-t border-dashed border-text" /> : <Swatch tone={item.tone} />}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

// A chart's title and what it covers ("by month", "Sep 1–29"), its legend, then the chart; its place held while it
// loads, and what will appear there while there's nothing to show.
export function Chart({
  title,
  meta,
  legend,
  loading = false,
  empty,
  children,
}: {
  title: string;
  meta?: ReactNode;
  legend?: LegendItem[];
  loading?: boolean;
  empty?: { title: string; line: string } | false;
  children?: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2.5">
      <header className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-label leading-label font-medium text-text">{title}</h3>
        {meta && <span className={`shrink-0 text-label leading-label text-muted ${figures}`}>{meta}</span>}
      </header>
      {legend && !loading && !empty && <Legend items={legend} />}
      {loading ? <ChartLoading /> : empty ? <ChartEmpty title={empty.title} line={empty.line} /> : children}
    </section>
  );
}

export function ChartLoading() {
  return (
    <div aria-label="Loading" role="status" className="flex flex-col">
      <div className="flex h-28 items-end gap-3 border-b">
        {[40, 64, 52, 88].map((h) => (
          <div key={h} className="grow basis-0 bg-subtle" style={{ height: h }} />
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-2 grow basis-0" />
        ))}
      </div>
    </div>
  );
}

export function ChartEmpty({ title, line }: { title: string; line: string }) {
  return (
    <div className="flex h-28 flex-col items-center justify-center gap-0.5 border-b px-4 text-center">
      <p className="text-body-sm leading-body-sm font-medium text-text">{title}</p>
      <p className="text-label leading-label text-muted">{line}</p>
    </div>
  );
}

// ---- Bars ----

export type Part = { label: string; value: number; display: string; tone: Tone };

export type BarPoint = {
  key: string;
  // Under the bar ("Sep", "Sep 22"); `short` when there's no room ("22").
  label: string;
  value: number;
  display: string;
  // Stacked: the parts from the bottom up. Otherwise the bar is steel, or red past the budget.
  parts?: Part[];
  tone?: Tone;
  explain: Explain;
};

// Upright bars for time. A dashed line marks a budget, and a bar past it turns red. The amount sits on each bar, and
// on each part of a stacked bar where it fits; a part too thin for its number gives it in the tooltip.
export function Bars({ label, points, height = 134, budget }: { label: string; points: BarPoint[]; height?: number; budget?: number }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const { ref: group, onKeyDown, point } = usePoints(points.length);
  const stacked = points.some((p) => p.parts);
  const gap = points.length > 12 ? 4 : stacked ? 10 : 12;
  const column = points.length ? (width - gap * (points.length - 1)) / points.length : 0;
  const plot = height - 22;
  const top = Math.max(budget ?? 0, ...points.map((p) => p.value), 0);
  const scale = (v: number) => (top > 0 ? (v / top) * plot : 0);
  const fits = (text: string) => column >= text.length * 7 + 2;
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(width / 48))));

  return (
    <div ref={box} className="flex min-w-0 flex-col">
      <div ref={group} role="group" aria-label={label} onKeyDown={onKeyDown} className="relative flex shrink-0 items-end border-b" style={{ height, gap }}>
        {points.map((p, i) => {
          const over = budget !== undefined && !p.parts && p.value > budget;
          const tone = p.tone ?? (over ? "red" : "steel");
          return (
            <Tooltip key={p.key} content={p.explain.title} detail={p.explain.detail} note={p.explain.note} side="top">
              <div {...point(i)} className="flex h-full min-w-0 grow basis-0 cursor-default flex-col items-center justify-end gap-1 outline-offset-2">
                <span className="sr-only">{p.label}</span>
                {fits(p.display) && <span className={`text-label leading-label font-medium whitespace-nowrap text-text ${figures}`}>{p.display}</span>}
                {p.parts ? (
                  <span className="flex w-full flex-col-reverse gap-px">
                    {p.parts
                      .filter((part) => part.value > 0)
                      .map((part) => {
                        const h = Math.max(1, scale(part.value));
                        return (
                          <span key={part.label} className={`flex w-full shrink-0 items-center justify-center ${TONES[part.tone].bg}`} style={{ height: h }}>
                            {h >= 16 && fits(part.display) && <span className={`text-label leading-label font-medium ${figures} ${TONES[part.tone].on}`}>{part.display}</span>}
                          </span>
                        );
                      })}
                  </span>
                ) : (
                  <span className={`w-full shrink-0 rounded-t-xs ${TONES[tone].bg}`} style={{ height: p.value > 0 ? Math.max(1, scale(p.value)) : 0 }} />
                )}
              </div>
            </Tooltip>
          );
        })}
        {budget !== undefined && <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-text" style={{ bottom: scale(budget) }} />}
      </div>
      <div aria-hidden className="flex pt-1.5" style={{ gap }}>
        {points.map((p, i) => (
          <span
            key={p.key}
            className={`flex min-w-0 grow basis-0 text-label leading-label whitespace-nowrap text-muted ${
              every > 1 && i === 0 ? "justify-start" : every > 1 && i === points.length - 1 ? "justify-end" : "justify-center"
            }`}
          >
            {i === points.length - 1 || (i % every === 0 && points.length - 1 - i >= every) ? p.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export type BarRow = {
  key: string;
  label: string;
  // A muted line under the name ("Roles and companies").
  sub?: string;
  value: number;
  display: string;
  // Stacked: parts left to right, each with its number inside.
  parts?: Part[];
  tone?: Tone;
  explain: Explain;
};

// Bars lying down, for things with names: the name, the bar, the amount. Stacked rows show each part's number inside
// and the total at the end; with `share`, every row fills the width and the parts are shares of it.
export function BarList({ label, rows, labelWidth = 150, valueWidth = 56, share = false }: { label: string; rows: BarRow[]; labelWidth?: number; valueWidth?: number; share?: boolean }) {
  const { ref: group, onKeyDown, point } = usePoints(rows.length);
  const top = Math.max(0, ...rows.map((r) => r.value));
  return (
    <div ref={group} role="group" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col">
      {rows.map((r, i) => {
        const width = share || top === 0 ? 100 : (r.value / top) * 100;
        return (
          <Tooltip key={r.key} content={r.explain.title} detail={r.explain.detail} note={r.explain.note}>
            <div {...point(i)} className={`flex cursor-default items-center gap-3 outline-offset-1 ${r.parts ? "py-[5px]" : "py-1.5"}`}>
              <span className="flex min-w-0 shrink-0 flex-col" style={{ width: labelWidth }}>
                <span className="truncate text-body-sm leading-body-sm text-text">{r.label}</span>
                {r.sub && <span className="truncate text-label leading-label text-muted">{r.sub}</span>}
              </span>
              <span className="flex min-w-0 grow basis-0 items-center">
                {r.parts ? (
                  <span className="flex min-w-0 gap-px" style={{ width: `${width}%` }}>
                    {r.parts
                      .filter((part) => part.value > 0)
                      .map((part) => (
                        <span key={part.label} className={`flex h-5 min-w-6 basis-0 items-center justify-center ${TONES[part.tone].bg}`} style={{ flexGrow: part.value }}>
                          <span className={`text-label leading-label font-medium ${figures} ${TONES[part.tone].on}`}>{part.display}</span>
                        </span>
                      ))}
                  </span>
                ) : (
                  <span className={`h-3 rounded-r-xs ${TONES[r.tone ?? "steel"].bg}`} style={{ width: `${width}%`, minWidth: r.value > 0 ? 2 : 0 }} />
                )}
              </span>
              <span className={`shrink-0 text-right text-body-sm leading-body-sm font-medium whitespace-nowrap text-text ${figures}`} style={{ width: valueWidth }}>
                {r.display}
              </span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ---- Lines ----

export type Series = { key: string; label: string; tone: Tone; values: number[] };

// A round top for the axis, twice a round middle line (80 → 160, 120 → 240), at or above the highest value.
function niceTop(v: number) {
  if (v <= 0) return 2;
  const half = v / 2;
  const p = 10 ** Math.floor(Math.log10(half));
  return 2 * ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= half) ?? 10 * p);
}

const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US"));

// Change over time: two gridlines and the axis, the latest value at the end of each line. Hover or focus a point in
// time for a guide line and its tooltip (the day, each number and what it counts).
export function LineChart({
  label,
  series,
  xLabels,
  explain,
  height = 168,
  format = compact,
}: {
  label: string;
  series: Series[];
  // One per point ("Jun 30"); shown under the axis where there's room.
  xLabels: string[];
  explain: (i: number) => Explain;
  height?: number;
  format?: (n: number) => string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const { ref: group, onKeyDown, point } = usePoints(xLabels.length);
  const [active, setActive] = useState<number | null>(null);
  const axis = 36;
  const endRoom = 40;
  const plotW = Math.max(0, width - axis - 8 - endRoom);
  const n = xLabels.length;
  const top = niceTop(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => (n <= 1 ? plotW / 2 : 4 + (i * (plotW - 8)) / (n - 1));
  const y = (v: number) => height - 4 - (v / top) * (height - 8);
  const step = n <= 1 ? plotW : (plotW - 8) / (n - 1);
  const ticks = [0, top / 2, top];
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 72))));

  return (
    <div ref={box} className="flex min-w-0 flex-col">
      <div className="flex items-start gap-2">
        <div aria-hidden className="relative shrink-0" style={{ width: axis, height }}>
          {ticks.map((t) => (
            <span key={t} className={`absolute right-0 text-label leading-label text-muted ${figures}`} style={{ top: y(t) - 8 }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative shrink-0" style={{ width: plotW, height }}>
          {plotW > 0 && (
            <svg aria-hidden width={plotW} height={height} viewBox={`0 0 ${plotW} ${height}`} className="overflow-visible">
              {ticks.map((t) => (
                <line key={t} x1={0} x2={plotW} y1={y(t)} y2={y(t)} className="stroke-border" />
              ))}
              {active !== null && <line x1={x(active)} x2={x(active)} y1={0} y2={height} strokeDasharray="2 3" className="stroke-muted" />}
              {series.map((s) => (
                <g key={s.key}>
                  <polyline
                    points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
                    fill="none"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={TONES[s.tone].stroke}
                  />
                  {s.values.length > 0 && <circle cx={x(s.values.length - 1)} cy={y(s.values.at(-1)!)} r={3.5} className={TONES[s.tone].fill} />}
                  {active !== null && s.values[active] !== undefined && <circle cx={x(active)} cy={y(s.values[active])} r={5} strokeWidth={2} className={`fill-surface ${TONES[s.tone].stroke}`} />}
                </g>
              ))}
            </svg>
          )}
          {series.map((s) =>
            s.values.length ? (
              <span key={s.key} aria-hidden className={`absolute text-label leading-label font-medium whitespace-nowrap text-text ${figures}`} style={{ left: plotW + 8, top: y(s.values.at(-1)!) - 8 }}>
                {format(s.values.at(-1)!)}
              </span>
            ) : null,
          )}
          <div ref={group} role="group" aria-label={label} onKeyDown={onKeyDown} className="absolute inset-0">
            {xLabels.map((l, i) => {
              const e = explain(i);
              return (
                <Tooltip key={i} content={e.title} detail={e.detail} note={e.note} side="top">
                  <div
                    {...point(i)}
                    onFocus={() => {
                      point(i).onFocus();
                      setActive(i);
                    }}
                    onBlur={() => setActive(null)}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    className="absolute top-0 h-full cursor-default outline-offset-0"
                    style={{ left: Math.max(0, x(i) - step / 2), width: step }}
                  >
                    <span className="sr-only">{l}</span>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
      <div aria-hidden className="relative h-[22px]" style={{ marginLeft: axis + 8, width: plotW }}>
        {xLabels.map((l, i) =>
          i === n - 1 || (i % every === 0 && n - 1 - i >= every) ? (
            <span
              key={i}
              className="absolute top-1.5 text-label leading-label whitespace-nowrap text-muted"
              style={{ left: x(i), transform: i === 0 ? "translateX(-4px)" : i === n - 1 ? "translateX(calc(-100% + 4px))" : "translateX(-50%)" }}
            >
              {l}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

// ---- Funnel ----

export type Step = { key: string; label: string; value: number; parts?: Part[]; explain: Explain };

// Steps from start to outcome, each with its count and its share of the step before. Only the last step, a good
// outcome, is green (`outcome`); split by a category (directions), each step's parts take category colours. A label
// longer than `labelWidth` wraps.
export function Funnel({ label, steps, outcome = true, labelWidth = 88 }: { label: string; steps: Step[]; outcome?: boolean; labelWidth?: number }) {
  const { ref: group, onKeyDown, point } = usePoints(steps.length);
  const first = steps[0]?.value ?? 0;
  return (
    <div ref={group} role="group" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col gap-1">
      {steps.map((s, i) => {
        const width = first > 0 ? (s.value / first) * 100 : 0;
        const prev = steps[i - 1];
        const share = prev && prev.value > 0 ? `${Math.round((s.value / prev.value) * 100)}%` : null;
        const tone: Tone = outcome && i === steps.length - 1 && i > 0 ? "good" : "steel";
        return (
          <Tooltip key={s.key} content={s.explain.title} detail={s.explain.detail} note={s.explain.note}>
            <div {...point(i)} className="flex cursor-default items-center gap-3 outline-offset-1">
              <span className="shrink-0 text-body-sm leading-body-sm text-text" style={{ width: labelWidth }}>
                {s.label}
              </span>
              <span className="flex min-w-0 grow basis-0 items-center gap-2.5">
                {s.parts ? (
                  <>
                    {s.value > 0 && (
                      <span className="flex min-w-0 gap-px" style={{ width: `${width}%` }}>
                        {s.parts
                          .filter((p) => p.value > 0)
                          .map((p) => (
                            <span key={p.label} className={`flex h-7 min-w-6 basis-0 items-center justify-center ${TONES[p.tone].bg}`} style={{ flexGrow: p.value }}>
                              <span className={`text-label leading-label font-medium ${figures} ${TONES[p.tone].on}`}>{p.display}</span>
                            </span>
                          ))}
                      </span>
                    )}
                    <span className={`shrink-0 text-body-sm leading-body-sm font-semibold text-text ${figures}`}>{s.value}</span>
                    {share && <span className={`shrink-0 text-label leading-label text-muted ${figures}`}>{share}</span>}
                  </>
                ) : (
                  <>
                    <span className={`flex h-7 min-w-7 shrink-0 items-center px-2 ${TONES[tone].bg}`} style={{ width: `${width}%` }}>
                      <span className={`text-body-sm leading-body-sm font-semibold ${figures} ${TONES[tone].on}`}>{s.value}</span>
                    </span>
                    {share && prev && (
                      <span className={`min-w-0 truncate text-label leading-label text-muted ${figures}`}>
                        {share} of {prev.label.toLowerCase()}
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}
