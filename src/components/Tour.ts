"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

// A guided tour of one screen (driver.js), one step at a time: the part it's about lit up, the rest dimmed, and a card
// beside it with what the part is for and how to use it (Back, Next, Done; arrow keys; Esc or × to stop). On a phone
// the card sits at the bottom of the screen, like the Sheet, instead of beside the part. A step points at a part by its
// `data-tour` name; a part that isn't on the screen right now (nothing there yet, or not shown at this size) is left
// out, so a tour only ever talks about what's in front of the person. A step with no part is a card on its own.
// Tours never click, spend or change anything.

export type TourStep = {
  // The `data-tour` name of the part, or none for a card on its own.
  target?: string;
  title: string;
  body: string;
  side?: "top" | "right" | "bottom" | "left";
};
export type TourDef = { id: string; name: string; steps: TourStep[] };

// The part as shown now: the first one with that name that's on the screen (a screen can hold a hidden copy for the
// other size).
function shown(name: string): Element | undefined {
  return [...document.querySelectorAll(`[data-tour="${name}"]`)].find((el) => el.getClientRects().length > 0 && el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false);
}

// The steps that apply right now, each with its part.
export function stepsNow(tour: TourDef): DriveStep[] {
  return tour.steps.flatMap((s): DriveStep[] => {
    const popover = { title: s.title, description: s.body, ...(s.side ? { side: s.side } : {}) };
    if (!s.target) return [{ popover }];
    const element = shown(s.target);
    return element ? [{ element, popover }] : [];
  });
}

const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Runs the tour. Returns false when none of its steps apply here.
export function runTour(tour: TourDef, onEnd?: () => void): boolean {
  const steps = stepsNow(tour).map((s) => ({ ...s, popover: { ...s.popover, title: escape(String(s.popover?.title ?? "")), description: escape(String(s.popover?.description ?? "")) } }));
  if (!steps.length) return false;
  const backdrop = getComputedStyle(document.documentElement).getPropertyValue("--color-backdrop").trim();
  const d = driver({
    steps,
    animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    duration: 160,
    overlayColor: backdrop,
    overlayOpacity: 1,
    stagePadding: 4,
    stageRadius: 2,
    smoothScroll: true,
    popoverClass: "cb-tour",
    popoverOffset: 8,
    showProgress: steps.length > 1,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    showButtons: ["next", "previous", "close"],
    disableActiveInteraction: true,
    onDestroyed: () => onEnd?.(),
  });
  d.drive();
  return true;
}
