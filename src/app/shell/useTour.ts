"use client";

import { useMutation, useQuery } from "convex/react";
import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { MenuItem } from "@/components/Menu";
import { toast } from "@/components/Toast";
import { runTour, type TourDef } from "@/components/Tour";
import { useDemo } from "../demo/demo";
import { useCommands } from "./ShellContext";

export const TOUR_DETAIL = "Walks you through this screen, part by part. It doesn’t change anything.";

// Which screens' tours were offered once already, from the workspace (tours.ts). Given by the signed-in shell; a
// screen shown without it (a story) gets no first-visit offer. The demo keeps nothing, so there each screen's tour is
// offered once a visit, remembered only on this page.
type Offers = { offered: string[] | undefined; markOffered: (tour: string) => void };
const OffersContext = createContext<Offers | null>(null);

export function TourOffers({ children }: { children: ReactNode }) {
  const offered = useQuery(api.tours.offered);
  const mark = useMutation(api.tours.markOffered);
  const demo = useDemo();
  const [offeredHere, setOfferedHere] = useState<string[]>([]);
  const value = useMemo(
    () =>
      demo
        ? { offered: offeredHere, markOffered: (tour: string) => setOfferedHere((was) => [...was, tour]) }
        : { offered, markOffered: (tour: string) => void mark({ tour }) },
    [demo, offeredHere, offered, mark],
  );
  return createElement(OffersContext.Provider, { value }, children);
}

// A screen's tour: in ⌘K while the screen is shown, as an entry for its ⋯ menu, and offered once, quietly, the first
// time the screen opens (remembered for the workspace). `ready`: the screen has loaded what the tour talks about.
// Returns the ⋯ menu entry and a way to start it.
export function useTour(tour: TourDef, ready = true) {
  const offers = useContext(OffersContext);
  const start = useCallback(() => {
    if (!runTour(tour)) toast({ message: "Nothing on this screen to show yet", icon: "help" });
  }, [tour]);
  useCommands(useMemo(() => [{ id: `tour-${tour.id}`, group: "Help", label: `Take the tour of ${tour.name}`, detail: TOUR_DETAIL, icon: "help" as const, onSelect: start }], [tour, start]));

  // The first visit's offer: once per screen per workspace, after the screen has settled, never over a tour.
  const asked = useRef(false);
  const offered = offers?.offered;
  const markOffered = offers?.markOffered;
  useEffect(() => {
    if (!ready || !markOffered || offered === undefined || offered.includes(tour.id) || asked.current) return;
    asked.current = true;
    const t = setTimeout(() => {
      if (document.querySelector(".driver-popover")) return;
      markOffered(tour.id);
      toast({ message: `New to ${tour.name}? A short tour shows how it works.`, icon: "help", action: { label: "Take the tour", run: start } });
    }, 1200);
    return () => clearTimeout(t);
  }, [ready, offered, markOffered, tour.id, tour.name, start]);

  const menu: MenuItem = { label: "Take the tour", icon: "help", detail: TOUR_DETAIL, note: "Free", onSelect: start };
  return { menu, start };
}
