"use client";

import { Bar, Card, Disc, Label, Stage } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Open source's mock-up: a terminal running your own copy, the two keys it runs on (OpenRouter and Apollo), and the
// monthly cap on what it spends, filled well short of its limit. It sits on the section's own grey stage, so it has no
// stage of its own. Its motion (Calm — motion, Open, kept for v3) plays once when scrolled into view: the terminal's
// lines type in one after another, then the cap fills in amber and stops short of the limit.

const LABEL = "A terminal running your own copy, keys for OpenRouter and Apollo, and a monthly spending cap filled well short of its limit.";

// From an empty terminal and an empty cap to the still. The cursor comes in with the second prompt and types its line.
const steps: Step[] = [
  { m: "l1", to: { scaleX: [0, 1] }, at: 0.2, duration: 0.5, ease: "linear" },
  { m: "l2", to: { scaleX: [0, 1] }, at: 0.8, duration: 0.6, ease: "linear" },
  { m: "l3", to: { scaleX: [0, 1] }, at: 1.5, duration: 0.4, ease: "linear" },
  { m: "prompt, cursor", to: { opacity: [0, 1] }, at: 2.0, duration: 0.15 },
  { m: "l4", to: { scaleX: [0, 1] }, at: 2.2, duration: 0.3, ease: "linear" },
  { m: "cursor", to: { x: [-128, 0] }, at: 2.2, duration: 0.3, ease: "linear" },
  { m: "cap", to: { scaleX: [0, 1] }, at: 2.8, duration: 1.1 },
];

const keys = [
  { name: "OpenRouter", x: 40, w: 118 },
  { name: "Apollo", x: 168, w: 84 },
];

// 560 × 380: the terminal, the keys and the cap, top to bottom.
export function OpenMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <Stage w={560} h={380} label={LABEL} radius="none" scope={scope}>
      <Card x={40} y={32} w={480} h={152} tone="terminal">
        {[16, 30, 44].map((x) => (
          <Disc key={x} x={x} y={16} size={8} className="bg-site-terminal-line" />
        ))}
        <Label x={20} y={46} className="font-mono text-site-index leading-site-index font-medium text-inverse-muted">
          $
        </Label>
        <Bar x={40} y={51} w={230} h={7} tone="terminal" m="l1" />
        <Bar x={40} y={73} w={300} h={7} tone="terminal" m="l2" />
        <Bar x={40} y={95} w={190} h={7} tone="terminal" m="l3" />
        <div data-m="prompt">
          <Label x={20} y={112} className="font-mono text-site-index leading-site-index font-medium text-inverse-muted">
            $
          </Label>
        </div>
        <Bar x={40} y={117} w={120} h={7} tone="terminal" m="l4" />
        <div data-m="cursor" className="absolute bg-inverse-muted" style={{ left: 168, top: 113, width: 8, height: 15 }} />
      </Card>

      {keys.map(({ name, x, w }) => (
        <Card key={name} x={x} y={204} w={w} h={32} r="pill" shadow={false}>
          <svg viewBox="0 0 14 14" aria-hidden fill="none" strokeWidth="1.4" className="absolute top-2.25 left-3 size-3.5 stroke-muted">
            <circle cx="4.5" cy="7" r="3" />
            <path d="M7.5 7h5.5M11 7v2.5" strokeLinecap="round" />
          </svg>
          <Label x={32} y={7} className="text-body-sm leading-body-sm font-medium text-text">
            {name}
          </Label>
        </Card>
      ))}

      <Card x={40} y={252} w={480} h={112}>
        <Label x={20} y={18}>
          Monthly cap
        </Label>
        <Bar x={20} y={58} w={440} h={10} />
        <Bar x={20} y={58} w={202.4} h={10} tone="primary" m="cap" />
        <div className="absolute rounded-xs bg-text" style={{ left: 380.8, top: 48, width: 2, height: 30 }} />
        <Label x={370.8} y={84} className="text-label leading-label font-medium text-muted">
          Limit
        </Label>
      </Card>
    </Stage>
  );
}
