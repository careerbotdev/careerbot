"use client";

import { Bar, Card, Lines, Stage } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Sound familiar? (the Calm v3 boards): a drawing for each of the three pains, 376 × 260 at every width (the phone
// board shows the same drawings, scaled). Their motion is on Calm v3 — motion:
// - Applying into the void: envelopes along a dotted trail, each smaller and fainter, into a grey hole. It loops every
//   6s while in view: they drift right, shrinking and fading as they reach the void, and the next ones slide in behind.
// - A resume that sells you short: a plain, uniform resume on top of a tilted one whose best line is lit amber. It
//   plays once: the lit one slides into place, the plain one slides over it, and the lit line dims, half hidden.
// - Stuck, and not sure where to go: a dot, a path up to a fork and three branches ending in fog. It plays once: the
//   path draws up to the fork, the branches draw out, the fog thickens over their ends and the dot pulses once.

const W = 376;
const H = 260;

// The grey stage: 18px corners on a phone, 20 from medium screens up, whatever the drawing's scale.
const GROUND = "bg-subtle rounded-site-stage-sm md:rounded-site-stage";

// Applying into the void.

// The envelopes along the trail, front to back: their middle, tilt, size (of the front one's 76 × 52) and opacity.
const ENVELOPES = [
  { x: 78, y: 150, turn: -6, size: 1, opacity: 1 },
  { x: 140, y: 110, turn: 8, size: 0.85, opacity: 0.8 },
  { x: 196, y: 158, turn: -10, size: 0.7, opacity: 0.6 },
  { x: 244, y: 112, turn: 12, size: 0.56, opacity: 0.42 },
  { x: 282, y: 146, turn: -14, size: 0.44, opacity: 0.28 },
  { x: 308, y: 120, turn: 16, size: 0.34, opacity: 0.16 },
  { x: 326, y: 138, turn: -18, size: 0.26, opacity: 0.08 },
];

// How the envelopes drift (per second: px right, size and opacity lost), the loop, and when the next ones come in.
const DRIFT = { x: 31, size: 0.1, opacity: 0.13 };
const LOOP = 6;
const NEXT = 4.5;

// Each loop starts from the still. The envelopes on the trail (`sent-*`) drift right, shrinking and fading until each
// is gone, all of them by the loop's end; the next ones (`next-*`) come in behind them, the front one sliding in from
// the left, the others fading up in their places front to back, so the loop ends on the still again.
const voidSteps: Step[] = ENVELOPES.flatMap(({ size, opacity }, i): Step[] => {
  const gone = Math.min(opacity / DRIFT.opacity, LOOP);
  const fade: Step[] =
    gone <= NEXT
      ? [{ m: `sent-${i}`, to: { opacity: [opacity, 0] }, at: 0, duration: gone, ease: "linear" }]
      : [
          { m: `sent-${i}`, to: { opacity: [opacity, opacity - DRIFT.opacity * NEXT] }, at: 0, duration: NEXT, ease: "linear" },
          { m: `sent-${i}`, to: { opacity: [opacity - DRIFT.opacity * NEXT, 0] }, at: NEXT, duration: LOOP - NEXT, ease: "linear" },
        ];
  // The next ones hold their size (`scale` rides along, since moving one rewrites its whole transform).
  const next: Step[] =
    i === 0
      ? [
          { m: "next-0", to: { x: [-60, 0], scale: [size, size] }, at: 4.2, duration: LOOP - 4.2 },
          { m: "next-0", to: { opacity: [0, opacity] }, at: 4.2, duration: 0.9 },
        ]
      : [{ m: `next-${i}`, to: { opacity: [0, opacity], x: [-24, 0], scale: [size, size] }, at: NEXT + i * 0.15, duration: 0.6 }];
  return [
    { m: `sent-${i}`, to: { x: [0, DRIFT.x * gone], scale: [size, size - DRIFT.size * gone] }, at: 0, duration: gone, ease: "linear" },
    ...fade,
    ...next,
  ];
});

// An envelope, drawn at the front one's size and scaled to its place; its edge stays 1px at every size.
function Envelope({ x, y, turn, size, opacity, m }: (typeof ENVELOPES)[number] & { m: string }) {
  return (
    <div data-m={m} className="absolute" style={{ left: x - 38.5, top: y - 26.5, width: 77, height: 53, opacity, transform: `scale(${size})` }}>
      <svg viewBox="-38.5 -26.5 77 53" aria-hidden className="size-full overflow-visible" style={{ rotate: `${turn}deg` }}>
        <rect x="-38" y="-26" width="76" height="52" rx="6" vectorEffect="non-scaling-stroke" className="fill-surface stroke-border" />
        <path d="M-33 -20 L0 3 L33 -20" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-site-skeleton-strong" />
      </svg>
    </div>
  );
}

export function PainVoidMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(voidSteps, { loop: LOOP, still });
  return (
    <Stage w={W} h={H} radius="none" className={GROUND} label="Envelopes drifting along a dotted trail, each smaller and fainter, into a grey hole." scope={scope}>
      {/* The void: a grey hole on the right, fading out into the stage. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(42% 42% at 84% 50%, var(--color-site-line), color-mix(in oklab, var(--color-site-skeleton) 60%, transparent) 55%, transparent)" }}
      />
      <Lines w={W} h={H}>
        <path d="M78 150 C 140 100, 200 170, 250 118 S 310 140, 330 132" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 5" className="stroke-site-skeleton-strong" />
      </Lines>
      {ENVELOPES.map((envelope, i) => (
        <Envelope key={`sent-${envelope.x}`} {...envelope} m={`sent-${i}`} />
      ))}
      {ENVELOPES.map((envelope, i) => (
        <Envelope key={`next-${envelope.x}`} {...envelope} opacity={0} m={`next-${i}`} />
      ))}
    </Stage>
  );
}

// A resume that sells you short.

// The tilted resume behind: its lines (left, top, width), the lit one after the second.
const LIT_LINES = [
  { x: 18, y: 52, w: 110 },
  { x: 18, y: 64, w: 90 },
  { x: 18, y: 116, w: 112 },
  { x: 18, y: 128, w: 80 },
  { x: 18, y: 150, w: 96 },
];
// The plain resume on top: a heading, a rule, then three sections alike, each a short title over two full lines.
const SECTIONS = [72, 115, 158];
// How dim the lit line ends, half hidden: its wash and its amber line.
const DIM = { wash: 1 / 3, line: 0.35 };

// From the still back to the lit resume on its own, 60px left of its place; it slides into place as the plain one
// fades in, which follows it and slides over it; then the lit line dims.
const resumeSteps: Step[] = [
  { m: "lit", to: { x: [-60, 0] }, at: 0, duration: 1.6, ease: "easeInOut" },
  { m: "plain", to: { opacity: [0, 1] }, at: 0.3, duration: 1.3 },
  { m: "plain", to: { x: [-60, 0] }, at: 0.8, duration: 0.8 },
  { m: "lit-wash", to: { opacity: [1, DIM.wash] }, at: 1.2, duration: 1.2 },
  { m: "lit-line", to: { opacity: [1, DIM.line] }, at: 1.2, duration: 1.2 },
];

export function PainResumeMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(resumeSteps, { still });
  return (
    <Stage
      w={W}
      h={H}
      radius="none"
      className={GROUND}
      label="A plain, uniform resume on top of a tilted one whose best line is lit amber, dimmed and half hidden behind it."
      scope={scope}
    >
      <div data-m="lit" className="absolute inset-0">
        <Card x={176} y={46} w={150} h={176} className="origin-top-left rotate-6">
          <Bar x={18} y={22} w={70} tone="heading" />
          {LIT_LINES.slice(0, 2).map((line) => (
            <Bar key={line.y} {...line} h={5} />
          ))}
          <div data-m="lit-wash" className="absolute rounded-site-mark bg-site-highlight" style={{ left: 10, top: 84, width: 130, height: 18, opacity: DIM.wash }} />
          <div data-m="lit-line" className="absolute rounded-site-pill bg-primary" style={{ left: 18, top: 90, width: 104, height: 6, opacity: DIM.line }} />
          {LIT_LINES.slice(2).map((line) => (
            <Bar key={line.y} {...line} h={5} />
          ))}
        </Card>
      </div>
      <Card x={62} y={34} w={176} h={196} m="plain">
        <Bar x={20} y={22} w={80} tone="heading" />
        <Bar x={20} y={38} w={52} h={5} />
        <div className="absolute bg-border" style={{ left: 20, top: 56, width: 136, height: 1 }} />
        {SECTIONS.map((y) => (
          <div key={y}>
            <Bar x={20} y={y} w={44} h={5} tone="strong" />
            <Bar x={20} y={y + 13} w={128} h={5} />
            <Bar x={20} y={y + 24} w={128} h={5} />
          </div>
        ))}
      </Card>
    </Stage>
  );
}

// Stuck, and not sure where to go.

const DOT = { x: 188, y: 214 };
const FORK = { x: 188, y: 150 };
const BRANCHES = [`M${FORK.x} ${FORK.y} C 188 110, 96 110, 84 40`, `M${FORK.x} ${FORK.y} L188 30`, `M${FORK.x} ${FORK.y} C 188 110, 280 110, 292 40`];
// Where each branch ends: a blank pill (left, top), 64 × 22.
const ENDS = [
  { x: 52, y: 22 },
  { x: 156, y: 12 },
  { x: 260, y: 22 },
];
// The fog, in the page's colour: a wash down from the top, and two banks across the ends (their middle, reach and
// how thick, in %), soft-edged. How thin it all is before it rolls in.
const surface = (percent: number) => `color-mix(in oklab, var(--color-surface) ${percent}%, transparent)`;
const FOG = `linear-gradient(${surface(72)}, ${surface(60)} 30%, transparent 62%)`;
const FOG_BANKS = [
  { x: 90, y: 70, rx: 110, ry: 26, thick: 45 },
  { x: 290, y: 84, rx: 120, ry: 24, thick: 40 },
];
const bank = (thick: number) => `radial-gradient(closest-side, ${surface(thick)} 70%, transparent)`;
const THIN_FOG = 0.55;

// From the still back to the dot under thin fog; the path draws up to the fork, the branches draw out, their ends
// appear as the fog thickens over them, and a ring pulses out from the dot once.
const stuckSteps: Step[] = [
  { m: "path", to: { strokeDashoffset: [1, 0] }, at: 0.1, duration: 0.5, ease: "easeInOut" },
  { m: "fork", to: { opacity: [0, 1] }, at: 0.5, duration: 0.2 },
  { m: "branch", to: { strokeDashoffset: [1, 0] }, at: 0.6, duration: 1.4, ease: "easeInOut" },
  { m: "end", to: { opacity: [0, 1] }, at: 1.8, duration: 0.5 },
  { m: "fog", to: { opacity: [THIN_FOG, 1] }, at: 0.9, duration: 1.5, ease: "linear" },
  { m: "pulse", to: { opacity: [0, 1, 0], scale: [0.7, 1, 1.3] }, at: 2.0, duration: 0.9, ease: "easeInOut" },
];

// A line drawn as it grows (its length is 1, so a dash offset from 1 to 0 draws it).
function Grow({ d, m, className }: { d: string; m: string; className: string }) {
  return <path data-m={m} d={d} fill="none" strokeWidth="2" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={0} className={className} />;
}

export function PainStuckMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(stuckSteps, { still });
  return (
    <Stage w={W} h={H} radius="none" className={GROUND} label="A dot with a path up to a fork, its three branches leading off into fog." scope={scope}>
      <Lines w={W} h={H}>
        <Grow d={`M${DOT.x} 206 L${FORK.x} ${FORK.y}`} m="path" className="stroke-site-fit" />
        {BRANCHES.map((d) => (
          <Grow key={d} d={d} m="branch" className="stroke-site-skeleton-strong" />
        ))}
        {ENDS.map(({ x, y }) => (
          <rect key={x} data-m="end" x={x} y={y} width="64" height="22" rx="11" className="fill-surface stroke-border" />
        ))}
      </Lines>
      {/* The fog: a wash of the page's colour over the top, thickest at the ends, and two soft banks across them. */}
      <div data-m="fog" className="absolute inset-0" style={{ background: FOG }}>
        {FOG_BANKS.map(({ x, y, rx, ry, thick }) => (
          <div key={x} className="absolute" style={{ left: x - rx, top: y - ry, width: rx * 2, height: ry * 2, background: bank(thick) }} />
        ))}
      </div>
      <Lines w={W} h={H}>
        <circle data-m="fork" cx={FORK.x} cy={FORK.y} r="3.5" className="fill-site-fit" />
        <circle cx={DOT.x} cy={DOT.y} r="11" strokeWidth="3" className="fill-text stroke-surface" />
      </Lines>
      {/* The pulse: a ring round the dot. */}
      <div data-m="pulse" className="absolute rounded-site-pill border-2 border-text" style={{ left: DOT.x - 19, top: DOT.y - 19, width: 38, height: 38, opacity: 0 }} />
    </Stage>
  );
}
