import type { TourDef } from "@/components/Tour";

// Today, and the frame around every screen: the areas, ⌘K, Activity and, on a phone, the bar.
export const TODAY_TOUR: TourDef = {
  id: "today",
  name: "Today",
  steps: [
    { title: "Today", body: "What needs you now, in one list: decisions to review, pursuits with a step due, new strong roles and resumes to update. Open a line to act on it." },
    { target: "shell.areas", side: "right", title: "The areas", body: "Review for decisions, Pursuits for roles and applications, then Companies, Resumes, your Record, Goals and Reports. G then a letter jumps to one: G then P opens Pursuits." },
    { target: "shell.search", side: "right", title: "Search or jump to", body: "⌘K finds any screen, role, company or action by name. The screen you're on lists its own actions first." },
    { target: "today.review", title: "Review", body: "Every decision waiting for you, counted. Open it to go through the cards one by one; a no takes its reason with it." },
    { target: "today.pursuits", title: "Pursuits due", body: "Pursuits with a step due: a follow-up, an interview to prepare for, or one that has gone quiet." },
    { target: "today.roles", title: "New strong roles", body: "Roles ranked strong for one of your directions this week that you haven't rated or started. Interested keeps one in mind; Start begins a pursuit." },
    { target: "today.resumes", title: "Resumes to update", body: "Resumes whose record changed since they were written, each with Rewrite and what it costs." },
    { target: "today.item", side: "left", title: "The open line", body: "The line you open shows here with what you can do with it. J and K move through the list." },
    { target: "shell.activity", side: "right", title: "Activity", body: "Work CareerBot is doing in the background, how far it has got, and what has been spent this month." },
    { target: "shell.bar", side: "top", title: "The bar", body: "The areas sit here. With a line open, the bar turns into its actions." },
  ],
};
