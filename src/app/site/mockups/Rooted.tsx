"use client";

import { type AnimationPlaybackControls, type AnimationSequence, useAnimate, useInView } from "motion/react";
import { useContext, useEffect, useRef } from "react";
import { Band, Bar, Card, End, Lines, Mark, Stage, Thread } from "./draw";
import { easeOut, MockupClock, useHoldStill } from "./motion";

// Rooted (More features, "Nothing you can't talk to"): a passage of your resume with one line lit, and a steel
// thread from that line down to the checked fact it's built on. Its motion answers the pointer: on a device that can
// hover, the thread draws down from the lit line to its fact while the pointer is over the mock-up and draws back
// when it leaves; on a device that can't, it draws once when scrolled into view. On a clip's clock (motion.ts), the
// drawing is held at the clock's time.

const LABEL = "A passage of a resume with one line lit, and a steel thread from that line down to the checked fact it is built on.";

const draw: AnimationSequence = [
  ['[data-m="from"]', { opacity: 1 }, { duration: 0.15, ease: [...easeOut] }],
  ['[data-m="thread"]', { strokeDashoffset: 0 }, { duration: 0.6, ease: "easeInOut" }],
  ['[data-m="to"]', { opacity: 1 }, { duration: 0.2, ease: [...easeOut] }],
];
const undraw: AnimationSequence = [
  ['[data-m="to"]', { opacity: 0 }, { duration: 0.15, ease: [...easeOut] }],
  ['[data-m="thread"]', { strokeDashoffset: 1 }, { duration: 0.4, ease: "easeInOut" }],
  ['[data-m="from"]', { opacity: 0 }, { duration: 0.15, ease: [...easeOut] }],
];

// The drawing from its first frame, for a clip's clock: each step names where it starts.
const drawFromStart: AnimationSequence = [
  ['[data-m="from"]', { opacity: [0, 1] }, { duration: 0.15, ease: [...easeOut] }],
  ['[data-m="thread"]', { strokeDashoffset: [1, 0] }, { duration: 0.6, ease: "easeInOut" }],
  ['[data-m="to"]', { opacity: [0, 1] }, { duration: 0.2, ease: [...easeOut] }],
];

export function RootedMockup({ still = false }: { still?: boolean }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const hold = useHoldStill(still);
  const clock = useContext(MockupClock);
  const clocked = clock !== null;
  const seen = useInView(scope, { amount: 0.35, once: true });
  const playing = useRef<AnimationPlaybackControls>(null);
  const canHover = useRef(false);

  // Undrawn until pointed at; on a device that can hover, drawn while the pointer is over the stage.
  useEffect(() => {
    if (hold || clocked) return;
    const stage = scope.current;
    animate([
      ['[data-m="thread"]', { strokeDashoffset: 1 }, { duration: 0 }],
      ['[data-m="from"], [data-m="to"]', { opacity: 0 }, { duration: 0, at: 0 }],
    ]);
    canHover.current = matchMedia("(hover: hover)").matches;
    if (!canHover.current) return;
    const enter = () => {
      playing.current?.stop();
      playing.current = animate(draw);
    };
    const leave = () => {
      playing.current?.stop();
      playing.current = animate(undraw);
    };
    stage.addEventListener("pointerenter", enter);
    stage.addEventListener("pointerleave", leave);
    return () => {
      stage.removeEventListener("pointerenter", enter);
      stage.removeEventListener("pointerleave", leave);
      playing.current?.stop();
    };
  }, [hold, clocked, animate, scope]);

  // On a clip's clock, built once, paused, then held at the clock's time.
  useEffect(() => {
    if (hold || !clocked) return;
    const timeline = animate(drawFromStart);
    timeline.pause();
    playing.current = timeline;
    return () => timeline.stop();
  }, [hold, clocked, animate]);
  useEffect(() => {
    if (clock !== null && playing.current) playing.current.time = clock;
  }, [clock, hold]);

  // On a device that can't hover, drawn once when it's seen.
  useEffect(() => {
    if (hold || clocked || canHover.current || !seen) return;
    playing.current = animate(draw);
  }, [hold, clocked, seen, animate]);

  return (
    <Stage w={568} h={240} label={LABEL} scope={scope}>
      <Card x={44} y={30} w={300} h={118}>
        <Bar x={20} y={22} w={250} h={6} />
        <Bar x={20} y={40} w={196} h={6} />
        <Band x={10} y={52} w={280} h={22} className="bg-site-highlight" />
        <Bar x={20} y={60} w={228} h={6} tone="primary" />
        <Bar x={20} y={84} w={236} h={6} />
        <Bar x={20} y={100} w={150} h={6} />
      </Card>

      <Card x={300} y={176} w={220} h={42} r="pill" tone="selected">
        <Mark x={12} y={12} state="done" />
        <Bar x={40} y={17} w={140} tone="strong" />
      </Card>

      <Lines w={568} h={240}>
        <Thread d="M298 93 C298 134.5 410 134.5 410 176" m="thread" />
        <End cx={298} cy={93} m="from" />
        <End cx={410} cy={176} m="to" />
      </Lines>
    </Stage>
  );
}
