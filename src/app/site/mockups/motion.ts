"use client";

import { type AnimationPlaybackControls, type AnimationSequence, type DOMKeyframesDefinition, MotionConfigContext, useAnimate, useInView, usePageInView, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useRef } from "react";

// How the website's mock-ups move (the Calm — motion board in Paper): fades, short slides and drawn lines, nothing
// bounces. A mock-up is drawn in its still (the frame the board shows), which is what anyone who asks for less motion
// sees, and what shows before the page's script runs. Its motion is one timeline of steps, each naming the pieces it
// moves by their `m` (draw.tsx), and only moves opacity, transforms and a thread's dash offset, so it stays off the
// page's layout.
//
// Playing once: the timeline waits at its first frame, then plays when the mock-up is scrolled into view. Looping: it
// starts when the mock-up is first seen (the hero, on load), repeats every `loop` seconds, and pauses while the mock-up
// is off screen or the page is hidden. A looping timeline starts from the still, so its first steps fade the still
// back to the first frame.
//
// Clocked (MockupClock, for rendering a clip frame by frame against a fixed clock): the timeline never plays on
// its own; it's held at the clock's time, so each frame of a clip shows the same moment on every run.

export const easeOut = [0.2, 0, 0, 1] as const;

// One step: `m` names the pieces (several as "a, b"), `to` their keyframes, from `at` seconds for `duration`.
export type Step = { m: string; to: DOMKeyframesDefinition; at: number; duration?: number; ease?: typeof easeOut | "linear" | "easeInOut" };

// The time, in seconds, that every mock-up below shows; null (the page) lets them play.
export const MockupClock = createContext<number | null>(null);

// Whether mock-ups hold still: the system asks for less motion, or a MotionConfig above says so (the Reduced motion
// stories), or the mock-up is asked for its still.
export function useHoldStill(still = false) {
  const system = useReducedMotion();
  const { reducedMotion } = useContext(MotionConfigContext);
  return still || !!system || reducedMotion === "always";
}

// Plays `steps` on the mock-up drawn inside the returned scope (pass it to Stage). `still`: hold the still.
export function useMockupMotion(steps: Step[], { loop, still = false }: { loop?: number; still?: boolean } = {}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const hold = useHoldStill(still);
  const clock = useContext(MockupClock);
  const seen = useInView(scope, { amount: 0.35, once: true });
  const onScreen = useInView(scope);
  const pageShown = usePageInView();
  const controls = useRef<AnimationPlaybackControls>(null);
  const stepsRef = useRef(steps);

  // Built once, waiting at its first frame until it's seen.
  useEffect(() => {
    if (hold) return;
    const all = stepsRef.current;
    const end = Math.max(...all.map((s) => s.at + (s.duration ?? 0.4)));
    // Each step's pieces by name: "a, b" is [data-m="a"], [data-m="b"].
    const sequence: AnimationSequence = all.map((s) => [
      s.m
        .split(",")
        .map((name) => `[data-m="${name.trim()}"]`)
        .join(", "),
      s.to,
      { at: s.at, duration: s.duration ?? 0.4, ease: s.ease === undefined ? [...easeOut] : typeof s.ease === "string" ? s.ease : [...s.ease] },
    ]);
    const playback = animate(sequence, loop ? { repeat: Infinity, repeatDelay: Math.max(0, loop - end) } : {});
    playback.pause();
    controls.current = playback;
    // Ending (the mock-up now holds still, e.g. once a phone's size is known, or it leaves): jump to the last frame, the
    // still, rather than freezing wherever it was, which before it played is its first frame (words faded out). A
    // looping one has no last frame to complete to (complete() throws, as when the sign-in's scene leaves on signing
    // in with a password): its first loop's end is the still.
    return () => {
      if (loop) {
        playback.pause();
        playback.time = end;
      } else playback.complete();
      controls.current = null;
    };
  }, [hold, loop, animate]);

  useEffect(() => {
    const playback = controls.current;
    if (!playback) return;
    if (clock !== null) {
      playback.time = clock;
      return;
    }
    if (!seen) return;
    if (!loop || (onScreen && pageShown)) playback.play();
    else playback.pause();
  }, [seen, onScreen, pageShown, loop, hold, clock]);

  return scope;
}
