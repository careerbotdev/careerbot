"use client";

import { Bar, Card, Label, Stage } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Step 02's mock-up (Aim, don't spray): openings at four companies ranked by fit,
// the best (Meridian Coldchain) on top, outlined, with an amber fit bar and the reason it fits. Its motion (Calm — motion, 02)
// plays once when scrolled into view: the cards slide in from the right, their fit bars fill, the best fit lifts and
// glides to the top while the others move down, then it settles, outlined, and its reason fades in.

const LABEL = "Openings at four companies ranked by how well they fit: Meridian Coldchain on top with the reason it fits, then Loadstar Systems, Orchard Forecasting and one more.";

// Each card is drawn where the board leaves it and starts from where the motion board's 0.0s frame has it (c: 74,
// u: 150, s: 226, v: 302). A fit bar fills by sliding out of its track, from 9.6px showing. The best fit's 64px card crosses
// into the 96px outlined one (a card's height isn't animated), and its bigger shadow is a layer of its own, `s-lift`.
const steps: Step[] = [
  { m: "c, u", to: { y: [-168, -168] }, at: 0, duration: 0.01 },
  { m: "s, s-lift", to: { x: [36, 0], y: [168, 168] }, at: 0, duration: 0.45 },
  { m: "s", to: { opacity: [0.35, 1] }, at: 0, duration: 0.45 },
  { m: "v", to: { x: [36, 0], y: [136, 136], opacity: [0.35, 1] }, at: 0.1, duration: 0.45 },
  // 0.8s: the fit bars are full.
  { m: "c-fit", to: { x: [-67.2, 0] }, at: 0.3, duration: 0.35 },
  { m: "u-fit", to: { x: [-39.6, 0] }, at: 0.35, duration: 0.35 },
  { m: "s-fit", to: { x: [-100.8, 0] }, at: 0.4, duration: 0.35 },
  { m: "v-fit", to: { x: [-84, 0] }, at: 0.45, duration: 0.35 },
  // 1.6s: the best fit, lifted, on its way to the top.
  { m: "s-lift", to: { opacity: 1 }, at: 1.0, duration: 0.25 },
  { m: "s, s-lift", to: { x: -16 }, at: 1.0, duration: 0.3 },
  { m: "s, s-lift", to: { y: 0 }, at: 1.15, duration: 0.7, ease: "easeInOut" },
  { m: "c, u", to: { y: 0 }, at: 1.2, duration: 0.8, ease: "easeInOut" },
  { m: "v", to: { y: 0 }, at: 1.6, duration: 0.7, ease: "easeInOut" },
  { m: "s, s-lift", to: { x: 0 }, at: 1.6, duration: 0.3 },
  // 2.4s: settled, outlined, with its reason.
  { m: "s-lift", to: { opacity: 0 }, at: 1.85, duration: 0.35 },
  { m: "s", to: { opacity: 0 }, at: 1.9, duration: 0.3 },
  { m: "s-top", to: { opacity: [0, 1] }, at: 1.9, duration: 0.3 },
  { m: "reason", to: { opacity: [0, 1] }, at: 2.05, duration: 0.35 },
];

export function RolesMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <Stage w={640} h={440} label={LABEL} scope={scope}>
      <Card x={70} y={242} w={500} h={64} m="c">
        <Role letter="O" name="Orchard Forecasting" sub={170} fit={76.8} m="c-fit" />
      </Card>
      <Card x={70} y={318} w={500} h={64} m="u">
        <Role sub={140} fit={49.2} m="u-fit" />
      </Card>
      <Card x={70} y={166} w={500} h={64} m="v">
        <Role letter="L" name="Loadstar Systems" sub={140} fit={93.6} m="v-fit" />
      </Card>

      <div data-m="s-lift" className="absolute rounded-site-card opacity-0 shadow-site-lift" style={{ left: 70, top: 58, width: 500, height: 64 }} />
      <Card x={70} y={58} w={500} h={64} m="s" className="opacity-0">
        <Role letter="M" name="Meridian Coldchain" sub={170} fit={110.4} m="s-fit" />
      </Card>
      <Card x={70} y={58} w={500} h={96} tone="outlined" m="s-top">
        <Role letter="M" name="Meridian Coldchain" sub={170} fit={110.4} amber />
        <Bar x={14} y={64} w={6} h={6} tone="steel" m="reason" />
        <Bar x={28} y={64} w={260} h={6} tone="strong" m="reason" />
      </Card>
    </Stage>
  );
}

// A role's card: the company's tile and name (a grey bar for one not named), a line about the role and its fit bar.
function Role({ letter, name, sub, fit, amber = false, m }: { letter?: string; name?: string; sub: number; fit: number; amber?: boolean; m?: string }) {
  return (
    <>
      <div className="absolute top-3.5 left-3.5 flex size-9 items-center justify-center rounded-site-tile bg-subtle text-site-nav font-semibold text-text">
        {letter}
      </div>
      {name ? (
        <Label x={62} y={11} className="text-body-md leading-body-md font-semibold text-text">
          {name}
        </Label>
      ) : (
        <Bar x={62} y={17} w={84} tone="strong" />
      )}
      <Bar x={62} y={38} w={sub} h={7} />
      <div className="absolute overflow-clip rounded-site-pill bg-subtle" style={{ left: 350, top: 29, width: 120, height: 6 }}>
        <div data-m={m} className={`h-full rounded-site-pill ${amber ? "bg-primary" : "bg-site-fit"}`} style={{ width: fit }} />
      </div>
    </>
  );
}
