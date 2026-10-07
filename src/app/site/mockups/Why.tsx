"use client";

import { Lines, Stage } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Why it isn't working (the Calm v3 boards): the usual search, a dot spraying lines out to dozens of scattered grey
// dots, beside what works, one steel line from the same dot to a target with an amber centre. Each is 576 × 280 at
// every width (the phone board shows the same drawings, scaled). Their motion (Calm v3 — motion, Why) plays once when
// scrolled into view, both halves on the same clock: the spray draws out to every dot and settles to the few lines
// that stay, while the target's rings draw in, the steel line lands on it and its centre fills amber.

const W = 576;
const H = 280;
// The dot both searches start from.
const FROM = { x: 64, y: 140 };

// The scattered dots: where each sits and its radius. `line`: one of the lines that stay once the spray settles.
const DOTS = [
  { x: 279, y: 58, r: 4, line: true },
  { x: 409, y: 39, r: 4 },
  { x: 363, y: 108, r: 3 },
  { x: 173, y: 142, r: 3.5, line: true },
  { x: 178, y: 43, r: 3 },
  { x: 319, y: 217, r: 3.5 },
  { x: 199, y: 75, r: 4.5, line: true },
  { x: 400, y: 246, r: 3.5 },
  { x: 539, y: 33, r: 4 },
  { x: 492, y: 90, r: 3.5, line: true },
  { x: 207, y: 50, r: 4.5 },
  { x: 273, y: 215, r: 3 },
  { x: 222, y: 159, r: 4.5, line: true },
  { x: 404, y: 110, r: 4 },
  { x: 368, y: 37, r: 3 },
  { x: 275, y: 160, r: 3, line: true },
  { x: 330, y: 93, r: 4.5 },
  { x: 466, y: 187, r: 3.5 },
  { x: 359, y: 229, r: 4.5, line: true },
  { x: 440, y: 90, r: 3.5 },
  { x: 166, y: 180, r: 4.5 },
  { x: 454, y: 157, r: 4, line: true },
  { x: 427, y: 162, r: 3 },
  { x: 381, y: 130, r: 4.5 },
  { x: 484, y: 245, r: 4.5, line: true },
  { x: 339, y: 179, r: 4.5 },
  { x: 304, y: 180, r: 3 },
  { x: 261, y: 120, r: 3.5, line: true },
  { x: 384, y: 84, r: 3.5 },
  { x: 152, y: 121, r: 3.5 },
  { x: 529, y: 185, r: 3, line: true },
  { x: 508, y: 206, r: 3.5 },
  { x: 306, y: 116, r: 4.5 },
  { x: 191, y: 172, r: 3.5, line: true },
  { x: 233, y: 60, r: 4.5 },
  { x: 150, y: 58, r: 4 },
  { x: 190, y: 108, r: 3.5, line: true },
  { x: 160, y: 228, r: 3.5 },
  { x: 335, y: 136, r: 3 },
  { x: 286, y: 84, r: 3, line: true },
  { x: 480, y: 60, r: 3 },
  { x: 216, y: 204, r: 3.5 },
  { x: 292, y: 29, r: 4.5, line: true },
  { x: 161, y: 88, r: 3.5 },
  { x: 253, y: 185, r: 3.5 },
  { x: 531, y: 128, r: 3, line: true },
];

// The grey stage: 18px corners on a phone, 20 from medium screens up, whatever the drawing's scale.
const GROUND = "bg-subtle rounded-site-stage-sm md:rounded-site-stage";

// The dot both searches start from, ringed in the page's colour.
function Start() {
  return <circle cx={FROM.x} cy={FROM.y} r="9" strokeWidth="3" className="fill-text stroke-surface" />;
}

// From the still back to nothing but the start, then the spray: a line out to every dot, the dots as the lines reach
// them, then all but the lines that stay fade away.
const scatterSteps: Step[] = [
  { m: "spray, stay", to: { strokeDashoffset: [1, 0] }, at: 0.05, duration: 0.55 },
  { m: "dot", to: { opacity: [0, 1] }, at: 0.35, duration: 0.3 },
  { m: "spray", to: { opacity: [1, 0] }, at: 0.7, duration: 0.7, ease: "easeInOut" },
];

export function ScatterMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(scatterSteps, { still });
  return (
    <Stage w={W} h={H} radius="none" className={GROUND} label="The usual search: one dot spraying lines out to dozens of scattered grey dots." scope={scope}>
      <Lines w={W} h={H}>
        {DOTS.map(({ x, y, line }) => (
          <path
            key={`${x} ${y}`}
            data-m={line ? "stay" : "spray"}
            d={`M${FROM.x} ${FROM.y} L${x} ${y}`}
            fill="none"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={0}
            opacity={line ? 1 : 0}
            className="stroke-site-line"
          />
        ))}
        {DOTS.map(({ x, y, r }) => (
          <circle key={`${x} ${y}`} data-m="dot" cx={x} cy={y} r={r} className="fill-site-skeleton-strong" />
        ))}
        <Start />
      </Lines>
    </Stage>
  );
}

// The target, from the outside in: its rings (each drawn as it grows), then the lit middle ring's fill.
const TARGET = { x: 430, y: 140 };
const RINGS = [
  { r: 100, width: 1.2, className: "stroke-site-line" },
  { r: 66, width: 1.2, className: "stroke-site-skeleton-strong" },
  { r: 34, width: 1.5, className: "stroke-steel" },
];

// From the still back to nothing but the start, then the rings draw in, the steel line lands and the centre fills.
const aimSteps: Step[] = [
  ...RINGS.map((_, i): Step => ({ m: `ring-${i}`, to: { strokeDashoffset: [1, 0] }, at: 0.05 + i * 0.1, duration: 0.5, ease: "easeInOut" })),
  { m: "ring-fill", to: { opacity: [0, 1] }, at: 0.3, duration: 0.35 },
  { m: "aim", to: { strokeDashoffset: [1, 0] }, at: 0.6, duration: 0.8, ease: "easeInOut" },
  { m: "centre", to: { opacity: [0, 1] }, at: 1.5, duration: 0.5 },
];

export function AimMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(aimSteps, { still });
  return (
    <Stage w={W} h={H} radius="none" className={GROUND} label="What works: one steel line from the same dot to a target, its centre filled amber." scope={scope}>
      <Lines w={W} h={H}>
        <circle data-m="ring-fill" cx={TARGET.x} cy={TARGET.y} r={RINGS[2].r} className="fill-steel-subtle" />
        {RINGS.map(({ r, width, className }, i) => (
          <circle
            key={r}
            data-m={`ring-${i}`}
            cx={TARGET.x}
            cy={TARGET.y}
            r={r}
            fill="none"
            strokeWidth={width}
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={0}
            className={className}
          />
        ))}
        <path
          data-m="aim"
          d={`M${FROM.x} ${FROM.y} C 200 140, 280 140, 416 140`}
          fill="none"
          strokeWidth="1.5"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={0}
          className="stroke-steel"
        />
        <circle data-m="centre" cx={TARGET.x} cy={TARGET.y} r="13" className="fill-primary" />
        <Start />
      </Lines>
    </Stage>
  );
}
