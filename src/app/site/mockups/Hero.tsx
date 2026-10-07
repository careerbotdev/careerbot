"use client";

import { Bar, Band, Card, End, Label, Lines, Mark, Stage, Thread } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// The hero's mock-up (Calm v3 — large and small, Hero mock-up): out of the void, in the door. Grey envelopes drift
// left into a darker grey void; beside it a resume with one line lit amber, a steel thread from that line to a person,
// and their reply with a green check. Wide on medium and large screens; on a phone the same pieces drawn closer
// together, and the sign-in page shows that phone drawing as its scene (Sign in — large and small).
//
// Its motion (Calm v3 — motion, Hero — out of the void, in the door) plays on load: the door part plays once and
// holds (the resume line lights amber, the thread draws out, the person fades in, the reply slides up and its check
// fades in last), while the envelopes keep drifting into the void and fading on a slow loop that pauses off screen.
// The still is the board's last frame (3.4s): the envelopes 90px further in and at 45% of their strength.

const LABEL = "Grey envelopes drifting into a grey void; a resume with one line lit amber, a thread from that line to a person, and their reply with a green check.";

// The void's size, in its own coordinates (both drawings scale it), and its ground: the line grey pooling at the middle
// of its left edge, in an ellipse 0.6 of its size, fading as the square of the distance out (stops at ¼, ½ and ¾).
const pool = (percent: number) => `color-mix(in srgb, var(--color-site-line) ${percent}%, transparent)`;
const VOID = {
  w: 560,
  h: 520,
  ground: `radial-gradient(336px 312px at 0 249.6px, var(--color-site-line), ${pool(56.25)} 25%, ${pool(25)} 50%, ${pool(6.25)} 75%, transparent)`,
};

// An envelope: the board draws one 76 × 52 and scales it by `size`. `turn`: its tilt, in degrees.
export type EnvelopeAt = { x: number; y: number; turn: number; size: number; opacity: number };

export function Envelope({ x, y, turn, size, opacity, m }: EnvelopeAt & { m?: string }) {
  const s = (n: number) => Math.round(n * size * 100) / 100;
  return (
    <g data-m={m} transform={`translate(${x} ${y}) rotate(${turn})`} opacity={opacity}>
      <rect x={s(-38)} y={s(-26)} width={s(76)} height={s(52)} rx={s(6)} className="fill-surface stroke-border" />
      <path
        d={`M${s(-33)} ${s(-20)} L0 ${s(3)} L${s(33)} ${s(-20)}`}
        fill="none"
        strokeWidth={s(1.4)}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-site-skeleton-strong"
      />
    </g>
  );
}

// The envelopes in the void, nearest (right) to furthest (left): smaller and fainter the further in.
const MAIL: EnvelopeAt[] = [
  { x: 470, y: 250, turn: -4, size: 1, opacity: 1 },
  { x: 400, y: 150, turn: 6, size: 0.92, opacity: 0.9 },
  { x: 385, y: 345, turn: -8, size: 0.9, opacity: 0.85 },
  { x: 310, y: 225, turn: 10, size: 0.8, opacity: 0.7 },
  { x: 255, y: 120, turn: -12, size: 0.7, opacity: 0.55 },
  { x: 235, y: 330, turn: 14, size: 0.68, opacity: 0.5 },
  { x: 170, y: 200, turn: -16, size: 0.58, opacity: 0.35 },
  { x: 120, y: 285, turn: 18, size: 0.5, opacity: 0.25 },
  { x: 95, y: 150, turn: -20, size: 0.45, opacity: 0.18 },
  { x: 60, y: 240, turn: 22, size: 0.4, opacity: 0.12 },
];

// The envelopes' drift, about 26px a second: in the still (the board's 3.4s) they're 90px in and at 45%. From there
// they drift 30px further in and fade out, come back in at the start, and drift to the still again (0s to 3.4s on the
// board): one 5.3s loop that ends where it began, the door part playing over its first 3.8s.
const DRIFT = { x: -90, opacity: 0.45 };
const driftSteps: Step[] = [
  { m: "mail", to: { x: [DRIFT.x, -120], opacity: [DRIFT.opacity, 0] }, at: 0, duration: 1.1, ease: "linear" },
  { m: "mail", to: { x: [21, 0], opacity: [0, 1] }, at: 1.1, duration: 0.8, ease: "linear" },
  { m: "mail", to: { x: [0, DRIFT.x], opacity: [1, DRIFT.opacity] }, at: 1.9, duration: 3.4, ease: "linear" },
];
const DRIFT_LOOP = 5.3;

// The void, at (x, y) scaled by `scale`, and the envelopes drifting into it. Their drift loops on its own clock, so the
// void is a motion scope of its own.
function Void({ x, y, scale, still }: { x: number; y: number; scale: number; still: boolean }) {
  const scope = useMockupMotion(driftSteps, { loop: DRIFT_LOOP, still });
  return (
    <div ref={scope} className="absolute origin-top-left" style={{ left: x, top: y, width: VOID.w, height: VOID.h, scale }}>
      <div className="absolute inset-0" style={{ background: VOID.ground }} />
      <div data-m="mail" className="absolute inset-0" style={{ opacity: DRIFT.opacity, transform: `translateX(${DRIFT.x}px)` }}>
        <svg viewBox={`0 0 ${VOID.w} ${VOID.h}`} aria-hidden className="absolute inset-0 size-full">
          {MAIL.map((envelope) => (
            <Envelope key={envelope.x} {...envelope} />
          ))}
        </svg>
      </div>
    </div>
  );
}

// From the still back to the first frame (the resume alone, its line not lit yet), then the door part, once: the line
// lights, the thread draws out to the person, the person fades in, the reply slides up and its check fades in last.
const doorSteps: Step[] = [
  { m: "lit, person, reply, link, thread-start, thread-stop, check", to: { opacity: 0 }, at: 0, duration: 0.4 },
  { m: "thread", to: { strokeDashoffset: 1 }, at: 0, duration: 0.4 },
  { m: "person", to: { y: 6 }, at: 0, duration: 0.4 },
  { m: "reply", to: { y: 10 }, at: 0, duration: 0.4 },
  { m: "lit", to: { opacity: 1 }, at: 1.0, duration: 0.5 },
  { m: "thread-start", to: { opacity: 1 }, at: 1.65, duration: 0.2 },
  { m: "thread", to: { strokeDashoffset: 0 }, at: 1.7, duration: 0.7, ease: "easeInOut" },
  { m: "thread-stop", to: { opacity: 1 }, at: 2.35, duration: 0.2 },
  { m: "person", to: { opacity: 1, y: 0 }, at: 2.25, duration: 0.45 },
  { m: "link", to: { opacity: 1 }, at: 2.85, duration: 0.3 },
  { m: "reply", to: { opacity: 1, y: 0 }, at: 2.85, duration: 0.5 },
  { m: "check", to: { opacity: 1 }, at: 3.5, duration: 0.3 },
];

// Where each piece sits in a drawing w × h. `thread`: from the lit line to the person; `link`: the person to the reply.
type Layout = {
  w: number;
  h: number;
  void: { x: number; y: number; scale: number };
  resume: { x: number; y: number };
  person: { x: number; y: number };
  reply: { x: number; y: number };
  thread: { d: string; from: [number, number]; to: [number, number] };
  link: string;
};

// 1200 × 520: the void on the left half, the resume, the person and their reply to its right.
const WIDE: Layout = {
  w: 1200,
  h: 520,
  void: { x: 0, y: 0, scale: 1 },
  resume: { x: 600, y: 70 },
  person: { x: 930, y: 110 },
  reply: { x: 960, y: 262 },
  thread: { d: "M800 330 C 870 330, 860 154, 930 154", from: [800, 330], to: [930, 154] },
  link: "M1045 198 L1045 262",
};

// 760 × 640 (the phone's drawing, 350 wide on the board): a smaller void, the resume over it, the person and reply
// close beside it.
const PHONE: Layout = {
  w: 760,
  h: 640,
  void: { x: 0, y: 0, scale: 480 / 560 },
  resume: { x: 80, y: 220 },
  person: { x: 440, y: 300 },
  reply: { x: 470, y: 450 },
  thread: { d: "M280 480 C 350 480, 370 344, 440 344", from: [280, 480], to: [440, 344] },
  link: "M555 388 L555 450",
};

// A resume section: its heading, then lines 13px apart.
const SECTIONS = [
  { y: 114, lines: [190, 172, 120] },
  { y: 183, lines: [200, 160] },
  { y: 311, lines: [184, 140] },
];

// The resume, 250 × 380: its sections in grey, and one line, in the third section, lit amber.
function Resume({ x, y }: { x: number; y: number }) {
  return (
    <Card x={x} y={y} w={250} h={380}>
      <Label x={24} y={20} className="text-site-tag leading-site-tag font-medium text-muted">
        Resume
      </Label>
      <Bar x={24} y={52} w={120} h={11} tone="heading" />
      <Bar x={24} y={72} w={80} h={6} />
      <div className="absolute top-23.5 left-6 h-px w-50.5 bg-border" />
      {SECTIONS.map(({ y: top, lines }) => (
        <div key={top}>
          <Bar x={24} y={top} w={64} h={6} tone="strong" />
          {lines.map((w, i) => (
            <Bar key={w} x={24} y={top + 18 + i * 13} w={w} h={5} />
          ))}
        </div>
      ))}
      <Bar x={24} y={239} w={64} h={6} tone="strong" />
      <Bar x={24} y={257} w={176} h={6} />
      <Band x={14} y={251} w={222} h={20} className="bg-site-highlight" m="lit" />
      <Bar x={24} y={257} w={176} h={6} tone="primary" m="lit" />
      <Bar x={24} y={273} w={150} h={5} />
      <Bar x={24} y={286} w={110} h={5} />
    </Card>
  );
}

// The person the lit line reached, 230 × 88.
function Person({ x, y }: { x: number; y: number }) {
  return (
    <Card x={x} y={y} w={230} h={88} m="person">
      <div className="absolute top-5.5 left-5 size-11 overflow-clip rounded-site-pill bg-steel-subtle">
        <svg viewBox="0 0 44 44" aria-hidden className="size-full">
          <circle cx="22" cy="18" r="7" className="fill-steel" />
          <path d="M9 38c2-7 7-10 13-10s11 3 13 10" className="fill-steel" />
        </svg>
      </div>
      <Bar x={78} y={30} w={104} h={8} tone="heading" />
      <Bar x={78} y={48} w={72} h={6} />
    </Card>
  );
}

// Their reply, 200 × 96: a speech bubble with a green check.
function Reply({ x, y }: { x: number; y: number }) {
  return (
    <Card x={x} y={y} w={200} h={96} className="rounded-bl-site-mark" m="reply">
      <Label x={18} y={16} className="text-site-tag leading-site-tag font-medium text-muted">
        Reply
      </Label>
      <Mark x={164} y={16} state="done" m="check" />
      <Bar x={18} y={48} w={150} h={6} />
      <Bar x={18} y={62} w={120} h={6} />
    </Card>
  );
}

// Every piece, placed by `layout`, in its final frame.
function Scene({ layout, still }: { layout: Layout; still: boolean }) {
  const { w, h, thread } = layout;
  return (
    <>
      <Void {...layout.void} still={still} />
      <Resume {...layout.resume} />
      <Person {...layout.person} />
      <Reply {...layout.reply} />
      <Lines w={w} h={h}>
        <Thread d={thread.d} m="thread" />
        <Thread d={layout.link} m="link" dashed />
        <End cx={thread.from[0]} cy={thread.from[1]} m="thread-start" />
        <End cx={thread.to[0]} cy={thread.to[1]} m="thread-stop" />
      </Lines>
    </>
  );
}

export function HeroMockup({ still = false }: { still?: boolean }) {
  return (
    <>
      <div className="md:hidden">
        <HeroPhone still={still} />
      </div>
      <div className="hidden md:block">
        <HeroWide still={still} />
      </div>
    </>
  );
}

function HeroWide({ still }: { still: boolean }) {
  const scope = useMockupMotion(doorSteps, { still });
  return (
    <Stage w={WIDE.w} h={WIDE.h} label={LABEL} radius="none" className="rounded-site-band bg-subtle" scope={scope}>
      <Scene layout={WIDE} still={still} />
    </Stage>
  );
}

function HeroPhone({ still }: { still: boolean }) {
  const scope = useMockupMotion(doorSteps, { still });
  return (
    <Stage w={PHONE.w} h={PHONE.h} label={LABEL} radius="none" className="rounded-site-stage bg-subtle" scope={scope}>
      <Scene layout={PHONE} still={still} />
    </Stage>
  );
}

// The sign-in page's scene: the phone drawing on a grey stage that fills the box it's given (h-full w-full). Below
// large screens, a strip (190px on the Sign in — small board) cropped to cover it around the resume, the person and the
// reply; from large screens up, the right half of the page (672 × 852 on the Sign in — large board), the drawing 608
// wide at the stage's left edge and centred top to bottom, shrinking to fit a shorter stage.
export function SignInScene({ still = false }: { still?: boolean }) {
  return (
    <>
      <div className="size-full lg:hidden">
        <SceneBox still={still} className="rounded-site-stage-sm" place={STRIP} />
      </div>
      <div className="hidden size-full lg:block">
        <SceneBox still={still} className="rounded-site-band" place={PANEL} />
      </div>
    </>
  );
}

// How the phone drawing sits in a sign-in stage (a size container): `origin` is the drawing's point that lands on the
// stage point (`left`, `top`), and `scale` is worked out from the stage's size (cqw, cqh; tan(atan2(a, b)) is a / b).
type Place = { left: string; top: string; origin: [number, number]; scale: string };

// The strip crops the drawing's band from y 174 to 587 (412.57 tall) around its middle, covering the stage.
const STRIP: Place = {
  left: "50%",
  top: "50%",
  origin: [PHONE.w / 2, 380],
  scale: `max(tan(atan2(100cqw, ${PHONE.w}px)), tan(atan2(100cqh, 412.57px)))`,
};

// The panel fits the drawing 608/672 of the stage's width, or 512/852 of its height for the drawing's 640.
const PANEL: Place = {
  left: "0",
  top: "50%",
  origin: [0, PHONE.h / 2],
  scale: `tan(atan2(min(${((608 / 672) * 100).toFixed(3)}cqw, ${((512 / 852) * (PHONE.w / PHONE.h) * 100).toFixed(3)}cqh), ${PHONE.w}px))`,
};

function SceneBox({ still, className, place }: { still: boolean; className: string; place: Place }) {
  const scope = useMockupMotion(doorSteps, { still });
  const [ox, oy] = place.origin;
  return (
    <div
      ref={scope}
      role="img"
      aria-label={LABEL}
      className={`relative size-full overflow-clip bg-subtle select-none ${className}`}
      style={{ containerType: "size" }}
    >
      <div
        className="absolute"
        style={{ left: place.left, top: place.top, width: PHONE.w, height: PHONE.h, transformOrigin: `${ox}px ${oy}px`, translate: `${-ox}px ${-oy}px`, scale: place.scale }}
      >
        <Scene layout={PHONE} still={still} />
      </div>
    </div>
  );
}
