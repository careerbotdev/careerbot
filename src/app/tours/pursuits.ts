import type { TourDef } from "@/components/Tour";

// Pursuits: the tabs and filters, the list, a role's Start/Interested/Not for me, a pursuit's status and tabs, J and K.
export const PURSUITS_TOUR: TourDef = {
  id: "pursuits",
  name: "Pursuits",
  steps: [
    { title: "Pursuits", body: "The roles ranked for your directions and the pursuits you’ve started, in one place. Open a role to decide on it; start it to track the application." },
    { target: "pursuits.tabs", title: "Tabs", body: "All roles lists every ranked role, best first. Interested keeps the roles you marked until you start them. Pursuing holds what’s under way, Closed what has ended." },
    { target: "pursuits.filters", title: "Filters", body: "Direction shows one direction’s roles and pursuits. On All roles and Interested, + Filter adds more role filters and Clear puts them back." },
    { target: "pursuits.list", title: "The list", body: "Each row shows the score, the title, the company and place, its status or Interested, and when it was posted. A row’s menu marks it Interested or Not for me without opening it." },
    { target: "pursuits.role", title: "Deciding on a role", body: "Start (S) begins a pursuit of the role, free. Interested (I) keeps it in mind. Not for me (R) sets it aside and asks why." },
    { target: "pursuits.status", title: "A pursuit", body: "Status records where it stands; set Closed with the reason when it ends, and Undo takes a change back. The tabs below hold its Overview, the Role as it was posted, Resume, Letter, Answers, People and Notes." },
    { target: "pursuits.keys", title: "Keys", body: "J and K move to the next and previous item in the list. Esc closes the one open." },
    { target: "pursuits.more", title: "More for Pursuits", body: "By direction shows how your pursuits went for each direction. Select several marks many roles at once; Rank again and Check roles again refresh the list and show what they cost." },
  ],
};
