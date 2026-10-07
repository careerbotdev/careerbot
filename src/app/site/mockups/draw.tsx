import type { ReactNode, Ref } from "react";

// The pieces every website mock-up is drawn with (the Website v2 and v3 — Calm boards in Paper): a grey stage, white cards
// with a soft shadow, skeleton bars, chips, check marks and the steel threads between them. Everything is placed in
// the board's own coordinates, in px, and the stage scales the whole drawing to the width it's given, so a mock-up
// keeps the board's proportions at every width. `m` names a piece its motion moves (motion.ts).

type Box = { x: number; y: number; w: number; h: number };
const at = ({ x, y, w, h }: Box) => ({ left: x, top: y, width: w, height: h });

// The stage, w × h on the board. `radius`: the stage's corners (none for a mock-up that sits on a panel of its own).
// The scale is the stage's width over w, worked out by the browser (tan(atan2(a, b)) is a / b as a number).
export function Stage({
  w,
  h,
  label,
  radius = "stage",
  scope,
  className = "",
  children,
}: {
  w: number;
  h: number;
  label: string;
  radius?: "stage" | "stage-sm" | "none";
  scope?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}) {
  const ground = { stage: "rounded-site-stage bg-subtle", "stage-sm": "rounded-site-stage-sm bg-subtle", none: "" }[radius];
  return (
    <div ref={scope} role="img" aria-label={label} className={`@container relative w-full overflow-clip select-none ${className}`} style={{ aspectRatio: `${w} / ${h}` }}>
      <div className={`absolute top-0 left-0 origin-top-left ${ground}`} style={{ width: w, height: h, scale: `tan(atan2(100cqw, ${w}px))` }}>
        {children}
      </div>
    </div>
  );
}

const barTones = {
  skeleton: "bg-site-skeleton",
  strong: "bg-site-skeleton-strong",
  heading: "bg-text opacity-78",
  primary: "bg-primary",
  steel: "bg-steel",
  fit: "bg-site-fit",
  subtle: "bg-subtle",
  onAmber: "bg-ink opacity-55",
  terminal: "bg-site-terminal-line",
} as const;
export type BarTone = keyof typeof barTones;

// A skeleton bar: a line of text, a heading, a fit bar. `origin-left` so a bar can grow along its line.
export function Bar({ x, y, w, h = 8, tone = "skeleton", m, className = "" }: Omit<Box, "h"> & { h?: number; tone?: BarTone; m?: string; className?: string }) {
  return <div data-m={m} className={`absolute origin-left rounded-site-pill ${barTones[tone]} ${className}`} style={at({ x, y, w, h })} />;
}

// A round dot (a person, a window's buttons).
export function Disc({ x, y, size, className, m }: { x: number; y: number; size: number; className: string; m?: string }) {
  return <div data-m={m} className={`absolute rounded-site-pill ${className}`} style={at({ x, y, w: size, h: size })} />;
}

// A lit band behind a line (steel for what's selected, the pale amber wash in Rooted).
export function Band({ x, y, w, h, className = "bg-steel-subtle", m }: Box & { className?: string; m?: string }) {
  return <div data-m={m} className={`absolute rounded-site-mark ${className}`} style={at({ x, y, w, h })} />;
}

const cardTones = {
  paper: "border-border bg-surface",
  selected: "border-steel bg-steel-subtle",
  outlined: "border-steel bg-surface",
  amber: "border-primary bg-primary",
  terminal: "border-site-terminal-line bg-inverse",
  plain: "border-border",
} as const;
export type CardTone = keyof typeof cardTones;

// A card, chip or pill: a surface with a 1px edge. `r`: card corners, or a pill's (chips, keys, direction pills).
export function Card({
  x,
  y,
  w,
  h,
  tone = "paper",
  r = "card",
  shadow = true,
  m,
  className = "",
  children,
}: Box & { tone?: CardTone; r?: "card" | "card-sm" | "pill" | "mark"; shadow?: boolean; m?: string; className?: string; children?: ReactNode }) {
  const round = { card: "rounded-site-card", "card-sm": "rounded-site-card-sm", pill: "rounded-site-pill", mark: "rounded-site-mark" }[r];
  return (
    <div data-m={m} className={`absolute overflow-clip border ${round} ${cardTones[tone]} ${shadow ? "shadow-site-card" : ""} ${className}`} style={at({ x, y, w, h })}>
      {children}
    </div>
  );
}

// A small label inside a mock-up ("Your story", "Facts"), placed by its top-left corner.
export function Label({ x, y, className = "text-body-sm leading-body-sm font-medium text-muted", children }: { x: number; y: number; className?: string; children: ReactNode }) {
  return (
    <div className={`absolute whitespace-nowrap ${className}`} style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

export type MarkState = "done" | "pending" | "empty" | "partial" | "thin";

// A fact's or requirement's mark, drawn on an 18px grid and placed at `size`: done (a filled check), pending (a steel
// ring, waiting for approval), empty (not checked yet), partial (half filled) and thin (a dashed ring).
export function Mark({ x, y, size = 18, state, m }: { x: number; y: number; size?: number; state: MarkState; m?: string }) {
  return (
    <svg data-m={m} viewBox="0 0 18 18" aria-hidden className="absolute" style={at({ x, y, w: size, h: size })}>
      {state === "done" && (
        <>
          <circle cx="9" cy="9" r="9" className="fill-good" />
          <path d="M5.2 9.3l2.4 2.4 5-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="stroke-surface" />
        </>
      )}
      {state === "pending" && <circle cx="9" cy="9" r="8.2" strokeWidth="1.6" className="fill-surface stroke-steel" />}
      {state === "empty" && <circle cx="9" cy="9" r="8.2" strokeWidth="1.6" className="fill-surface stroke-site-line" />}
      {state === "partial" && (
        <>
          <circle cx="9" cy="9" r="8.2" fill="none" strokeWidth="1.6" className="stroke-caution" />
          <path d="M9 0.8 A8.2 8.2 0 0 1 9 17.2 Z" className="fill-caution" />
        </>
      )}
      {state === "thin" && <circle cx="9" cy="9" r="8.2" fill="none" strokeWidth="1.6" strokeDasharray="2.4 2.4" className="stroke-site-fit" />}
    </svg>
  );
}

// A place for a mark whose state changes as the motion plays: each state drawn on top of the one before, the later
// ones faded in by name (`${m}-${state}`).
export function Marks({ x, y, size = 18, states, m }: { x: number; y: number; size?: number; states: MarkState[]; m: string }) {
  return states.map((state) => <Mark key={state} x={x} y={y} size={size} state={state} m={`${m}-${state}`} />);
}

// The lines drawn over a stage: threads between cards, a small tree. Same coordinates as the stage.
export function Lines({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" style={{ width: w, height: h }}>
      {children}
    </svg>
  );
}

// A thread, drawn as it grows: its length is 1, so a dash offset between 1 (not drawn) and 0 (whole) draws it.
// `dashed` threads (a note being drafted) don't grow; they fade in.
export function Thread({ d, m, width = 1.5, tone = "steel", dashed = false }: { d: string; m?: string; width?: number; tone?: "steel" | "line"; dashed?: boolean }) {
  const stroke = tone === "steel" ? "stroke-steel" : "stroke-site-line";
  return dashed ? (
    <path data-m={m} d={d} fill="none" strokeWidth={width} strokeLinecap="round" strokeDasharray="3 4" className={stroke} />
  ) : (
    <path data-m={m} d={d} fill="none" strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={0} className={stroke} />
  );
}

// A thread's end.
export function End({ cx, cy, m }: { cx: number; cy: number; m?: string }) {
  return <circle data-m={m} cx={cx} cy={cy} r="3.5" className="fill-steel" />;
}
