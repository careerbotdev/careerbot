"use client";

import { Bar, Card, End, Label, Lines, Mark, Stage, Thread } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Step 01's mock-up (Know your story): a story with one phrase lit, and the new fact it gave
// among the checked facts, waiting for approval, with a thread from the phrase to it. Its motion (Calm — motion, 01)
// loops every 6s: the highlight glides along the phrase, the new fact slides out of the line and fades in as the
// thread draws, then its check fills, the highlight and thread fade and the fact settles among the others.
//
// The still is the board's 2.0s frame, and a loop has to end where it starts, so the timeline starts there: the check
// fills (the board's 3.2s at 1.2s), the settled fact leaves, and the story is read again from the board's 0.0s at 4.0s
// (1.0s at 5.0s) back to the still at 6.0s.

const LABEL = "A story with one phrase lit, and the new fact it gave, waiting for approval among the checked facts.";

const steps: Step[] = [
  { m: "new-done", to: { opacity: 1 }, at: 0.7, duration: 0.3 },
  { m: "new-lit, phrase, t, t-a, t-b", to: { opacity: 0 }, at: 0.8, duration: 0.4 },
  { m: "new", to: { opacity: 0 }, at: 3.2, duration: 0.5 },
  // Unseen, ready for the next reading.
  { m: "new-done", to: { opacity: 0 }, at: 3.8, duration: 0.01 },
  { m: "new-lit", to: { opacity: 1 }, at: 3.8, duration: 0.01 },
  { m: "new", to: { y: -16 }, at: 3.8, duration: 0.01 },
  { m: "phrase", to: { scaleX: 0 }, at: 3.8, duration: 0.01 },
  { m: "t", to: { strokeDashoffset: 1 }, at: 3.8, duration: 0.01 },
  // The board's 0.0s: the highlight glides along the phrase.
  { m: "phrase", to: { opacity: 1 }, at: 4.3, duration: 0.15 },
  { m: "phrase", to: { scaleX: 1 }, at: 4.3, duration: 0.7, ease: "easeInOut" },
  // 1.0s: the thread draws and the fact slides out of the line.
  { m: "t-a", to: { opacity: 1 }, at: 5.0, duration: 0.15 },
  { m: "t", to: { opacity: 1 }, at: 5.05, duration: 0.01 },
  { m: "t", to: { strokeDashoffset: 0 }, at: 5.05, duration: 0.8, ease: "easeInOut" },
  { m: "new", to: { opacity: 1, y: 0 }, at: 5.3, duration: 0.6 },
  { m: "t-b", to: { opacity: 1 }, at: 5.8, duration: 0.2 },
];

// The checked facts under the story: [x, y, chip width, bar width].
const FACTS = [
  [28, 200, 140, 80],
  [180, 200, 176, 116],
  [28, 252, 176, 116],
  [216, 252, 150, 90],
  [378, 252, 104, 44],
];

export function StoryMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(steps, { loop: 6, still });
  return (
    <Stage w={640} h={440} label={LABEL} scope={scope}>
      <Card x={56} y={56} w={528} h={328}>
        <Label x={28} y={22}>
          Story
        </Label>
        {[472, 453.1, 424.8, 339.8].map((w, i) => (
          <Bar key={w} x={28} y={60 + i * 20} w={w} />
        ))}
        <Bar x={28} y={140} w={236} />
        <Bar x={270} y={140} w={169.9} />
        <Bar x={270} y={140} w={169.9} tone="primary" m="phrase" />
        <div className="absolute top-44 left-0 h-px w-full bg-border" />

        {FACTS.map(([x, y, w, bar]) => (
          <Card key={`${x} ${y}`} x={x} y={y} w={w} h={40} r="pill" shadow={false}>
            <Mark x={12} y={11} state="done" />
            <Bar x={40} y={16} w={bar} tone="strong" />
          </Card>
        ))}
        {/* The new fact: lit (steel) while it waits for approval, settled once its check fills. */}
        <div data-m="new" className="absolute" style={{ left: 368, top: 200, width: 120, height: 40 }}>
          <Card x={0} y={0} w={120} h={40} r="pill" shadow={false}>
            <div data-m="new-lit" className="absolute inset-0 bg-steel-subtle" />
            <Mark x={12} y={11} state="pending" />
            <div data-m="new-done" className="opacity-0">
              <Mark x={12} y={11} state="done" />
            </div>
            <Bar x={40} y={16} w={60} tone="strong" />
          </Card>
          <div data-m="new-lit" className="absolute inset-0 rounded-site-pill border border-steel" />
        </div>
      </Card>

      <Lines w={640} h={440}>
        <Thread d="M411 208 C411 232 484 232 484 256" m="t" />
        <End cx={411} cy={208} m="t-a" />
        <End cx={484} cy={256} m="t-b" />
      </Lines>
    </Stage>
  );
}
