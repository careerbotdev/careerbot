"use client";

import { Bar, Card, Disc, End, Lines, Stage, Thread } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// People (How CareerBot gets you in the door, Step 04, "Start a conversation"; Calm v3 — large and small): a
// company's people as a small tree, the likely hiring manager lit amber in a steel ring, a dotted thread from them to
// a short note being drafted, and a dashed line from the note down to your inbox, ready to send. On a phone, the same
// drawing larger in its stage. Its motion plays once when scrolled into view: the key person lights up, the dotted
// thread fades in and the note slides in (Website v2 — Calm › Calm — motion), then the line to the inbox fades in and
// the send arrow slides a few px.

const LABEL = "A company's people as a small tree with one person lit, a dotted thread from them to a short note being drafted, and a line from the note to your inbox.";

// The tree's branches, each from a person down to the one below.
const BRANCHES = [
  "M128 48 L128 84 L78 84 L78 120",
  "M128 48 L128 84 L178 84 L178 120",
  "M78 120 L78 156 L48 156 L48 192",
  "M78 120 L78 156 L108 156 L108 192",
  "M178 120 L178 156 L158 156 L158 192",
  "M178 120 L178 156 L208 156 L208 192",
];
// Everyone, the key person (178, 120) among them: lit, they're drawn over.
const PEOPLE = [
  [128, 48],
  [78, 120],
  [178, 120],
  [48, 192],
  [108, 192],
  [158, 192],
  [208, 192],
];

const steps: Step[] = [
  { m: "key", to: { opacity: [0, 1] }, at: 0.3, duration: 0.4 },
  { m: "ring", to: { opacity: [0, 1], scale: [0.8, 1] }, at: 0.45, duration: 0.5 },
  { m: "from", to: { opacity: [0, 1] }, at: 0.95, duration: 0.2 },
  { m: "thread", to: { opacity: [0, 1] }, at: 1.0, duration: 0.5 },
  { m: "to", to: { opacity: [0, 1] }, at: 1.35, duration: 0.2 },
  { m: "note", to: { opacity: [0, 1], x: [16, 0] }, at: 1.3, duration: 0.5 },
  { m: "send-from", to: { opacity: [0, 1] }, at: 1.95, duration: 0.2 },
  { m: "send", to: { opacity: [0, 1] }, at: 2.0, duration: 0.5 },
  { m: "arrow", to: { x: [-6, 0] }, at: 2.4, duration: 0.45 },
];

export function PeopleMockup({ still = false }: { still?: boolean }) {
  return (
    <>
      <div className="md:hidden">
        <PeoplePhone still={still} />
      </div>
      <div className="hidden md:block">
        <PeopleWide still={still} />
      </div>
    </>
  );
}

// 640 × 440: the tree and the note, the inbox below the note.
function PeopleWide({ still }: { still: boolean }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <Stage w={640} h={440} label={LABEL} scope={scope}>
      <Drawing people={{ x: 36, y: 56 }} inbox={{ x: 336, y: 316 }} line={{ x: 446, from: 244, to: 314 }} />
    </Stage>
  );
}

// 350 × 241 on the small board, drawn here in the tree's own units (568 wide), so the tree fills the stage's width.
function PeoplePhone({ still }: { still: boolean }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <Stage w={568} h={391} label={LABEL} radius="none" className="rounded-site-stage-sm bg-subtle" scope={scope}>
      <Drawing people={{ x: 0, y: 19.5 }} inbox={{ x: 300, y: 270 }} line={{ x: 410, from: 207.5, to: 269.5 }} width={2} />
    </Stage>
  );
}

type Point = { x: number; y: number };

// The tree and the note at `people`, the inbox card at `inbox`, and the dashed line between them. `width`: the lines'
// width, thicker where the drawing is shown smaller.
function Drawing({ people, inbox, line, width = 1.5 }: { people: Point; inbox: Point; line: { x: number; from: number; to: number }; width?: number }) {
  return (
    <>
      <div className="absolute" style={{ left: people.x, top: people.y, width: 568, height: 240 }}>
        <Lines w={568} h={240}>
          {BRANCHES.map((d) => (
            <path key={d} d={d} fill="none" strokeWidth="1.5" className="stroke-site-line" />
          ))}
          {PEOPLE.map(([cx, cy]) => (
            <circle key={`${cx} ${cy}`} cx={cx} cy={cy} r="11" strokeWidth="1.5" className="fill-surface stroke-site-line" />
          ))}
          <circle data-m="ring" cx="178" cy="120" r="21" fill="none" strokeWidth="1.5" className="stroke-steel" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
          <circle data-m="key" cx="178" cy="120" r="14" className="fill-primary" />
          <Thread d="M199 120 C249.5 120 249.5 110 300 110" dashed m="thread" />
          <End cx={199} cy={120} m="from" />
          <End cx={300} cy={110} m="to" />
        </Lines>

        <Card x={300} y={46} w={220} h={140} m="note">
          <Disc x={16} y={16} size={24} className="bg-subtle" />
          <Bar x={50} y={20} w={84} h={7} tone="strong" />
          <Bar x={50} y={32} w={54} h={5} />
          {[188, 170, 120].map((w, i) => (
            <Bar key={w} x={16} y={56 + i * 14} w={w} h={5} />
          ))}
          <Card x={16} y={104} w={64} h={20} tone="plain" r="pill" shadow={false}>
            <Bar x={12} y={7} w={40} h={5} tone="strong" />
          </Card>
        </Card>
      </div>

      <Lines w={640} h={440}>
        <Thread d={`M${line.x} ${line.from} L${line.x} ${line.to}`} dashed width={width} m="send" />
        <End cx={line.x} cy={line.from} m="send-from" />
      </Lines>

      <Card x={inbox.x} y={inbox.y} w={220} h={60}>
        <div className="absolute flex items-center justify-center rounded-site-mark bg-subtle" style={{ left: 16, top: 13, width: 32, height: 32 }}>
          <svg viewBox="0 0 20 20" aria-hidden style={{ width: 18, height: 18 }}>
            <rect x="2" y="4.5" width="16" height="11" rx="2" fill="none" strokeWidth="1.5" className="stroke-text" />
            <path d="M3 6l7 5 7-5" fill="none" strokeWidth="1.5" strokeLinejoin="round" className="stroke-text" />
          </svg>
        </div>
        <Bar x={60} y={18.5} w={96} h={7} tone="heading" />
        <Bar x={60} y={33.5} w={120} h={6} />
        <svg data-m="arrow" viewBox="0 0 20 20" aria-hidden className="absolute" style={{ left: 184, top: 20, width: 18, height: 18 }}>
          <path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-steel" />
        </svg>
      </Card>
    </>
  );
}
