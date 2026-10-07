import type { TourDef } from "@/components/Tour";

// Companies: the list by rating, rating one, and the open company with its fit, roles and details.
export const COMPANIES_TOUR: TourDef = {
  id: "companies",
  name: "Companies",
  steps: [
    { title: "Companies", body: "The companies you might work for, found for your directions and rated by you. Companies you rate Target or Maybe have their open roles read into Pursuits." },
    { target: "companies.list", title: "Targets, Maybe, Found, Set aside", body: "Targets and Maybe are the companies you rated. Found holds new ones, best fit first. Set aside holds ones you passed on, ones that don’t fit your goals, and ones that aren’t a place to work. On a row, T rates it Target, M Maybe and R Not for me; J and K move through the list." },
    { target: "companies.filters", side: "bottom", title: "Filters", body: "Shows or hides the filter bar: by direction, or on Set aside by reason." },
    { target: "companies.rating", side: "bottom", title: "Your rating", body: "Target, Maybe or Not for me for the open company. Not for me asks why, so later searches can use the reason." },
    { target: "companies.about", title: "About", body: "What the company does, read from its website. Fill in details, in the list’s ⋯, reads the ones not filled in yet." },
    { target: "companies.fit", title: "Directions", body: "How well the company fits each of your directions, and why." },
    { target: "companies.roles", title: "Open roles", body: "Its best open roles for your directions, ranked. Open one to see it in Pursuits, or all of them from the link below." },
    { target: "companies.details", side: "left", title: "Details", body: "Its website and job board, which you can edit with E, how much of the board has been read, and the people you know there. Check again reads its board afresh and says what it costs first." },
    { target: "companies.more", side: "bottom", title: "More for Companies", body: "Find companies shows each search and its Apollo credits before you start one. Here too: Fill in details, Select several, the companies you’d name, seed companies and Lens settings." },
  ],
};
