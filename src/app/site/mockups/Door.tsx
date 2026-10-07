"use client";

import { Bar, Card, Lines, Mark, Stage, Thread } from "./draw";
import { Envelope, type EnvelopeAt } from "./Hero";
import { type Step, useMockupMotion } from "./motion";

// The closing's door (Calm v3 — large and small, Closing › Door): the hero once more, in a line. A row of envelopes
// fading into the distance, a steel line from the nearest one to a reply with a green check. 420 × 80, 302 wide on a
// phone, on the page itself (no stage). Its motion (Calm v3 — motion: the closing replays the hero's last two frames,
// once) plays when scrolled into view: the envelopes drift left and fade, the line draws out, the reply slides up and
// its check fades in last.

const W = 420;
const H = 80;

// Furthest (left, small and faint) to nearest.
const MAIL: EnvelopeAt[] = [
  { x: 30, y: 40, turn: -14, size: 0.42, opacity: 0.15 },
  { x: 70, y: 40, turn: 10, size: 0.55, opacity: 0.3 },
  { x: 118, y: 40, turn: -6, size: 0.7, opacity: 0.55 },
  { x: 180, y: 40, turn: 0, size: 0.9, opacity: 1 },
];

// As in the hero from 2.2s to 3.4s: the envelopes 30px to the right and a third stronger, drifting to where they rest.
const steps: Step[] = [
  { m: "mail", to: { x: [30, 0] }, at: 0, duration: 1.4 },
  ...MAIL.map(({ opacity }, i): Step => ({ m: `mail-${i}`, to: { opacity: [Math.min(1, opacity / 0.75), opacity] }, at: 0, duration: 1.4 })),
  { m: "start", to: { opacity: [0, 1] }, at: 0.1, duration: 0.2 },
  { m: "line", to: { strokeDashoffset: [1, 0] }, at: 0.15, duration: 0.6, ease: "easeInOut" },
  { m: "reply", to: { opacity: [0, 1], y: [8, 0] }, at: 0.7, duration: 0.5 },
  { m: "check", to: { opacity: [0, 1] }, at: 1.25, duration: 0.3 },
];

export function DoorMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <div className="mx-auto w-full max-w-75.5 md:max-w-105">
      {/* The reply's shadow reaches below the drawing, so the stage doesn't clip. */}
      <Stage w={W} h={H} radius="none" className="overflow-visible!" label="A row of envelopes fading into the distance, and a steel line from the nearest to a reply with a green check." scope={scope}>
        <div data-m="mail" className="absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="absolute inset-0 size-full overflow-visible">
            {MAIL.map((envelope, i) => (
              <Envelope key={envelope.x} {...envelope} m={`mail-${i}`} />
            ))}
          </svg>
        </div>
        <Lines w={W} h={H}>
          <Thread d="M216 40 C 250 40, 262 40, 290 40" m="line" />
          <circle data-m="start" cx="216" cy="40" r="3" className="fill-steel" />
        </Lines>
        <Card x={290} y={18} w={130} h={44} r="pill" className="rounded-bl-site-mark" m="reply">
          <Mark x={12} y={12} state="done" m="check" />
          <Bar x={40} y={19} w={70} h={7} tone="strong" />
        </Card>
      </Stage>
    </div>
  );
}
