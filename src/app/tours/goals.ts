import type { TourDef } from "@/components/Tour";

// Goals, Limits and Directions: the goals story, and the limits and directions read from it.
export const GOALS_TOUR: TourDef = {
  id: "goals",
  name: "Goals",
  steps: [
    { title: "Goals", body: "Your goals story says what you want next in your own words. Reading it proposes limits, which filter and rank roles, and directions, the kinds of work search looks for." },
    { target: "goals.versions", side: "right", title: "Versions", body: "Each save keeps a new version, newest first. Open an earlier one to read it; Restore as newest brings it back." },
    { target: "goals.story", title: "The story", body: "Your goals as you wrote them: the work, the pay, where, and what to avoid. E edits it; ⌘↵ saves and Esc cancels." },
    { target: "goals.read", side: "bottom", title: "Read my goals", body: "Reads this version for your limits and directions, at the cost shown beside it. What it proposes waits in Review; the Produced tab lists what came from each read." },
    { target: "limits.list", side: "right", title: "Limits", body: "Your limits, grouped as Firm, Preference, Proposed and Rejected. A firm limit hides roles that fail it; a preference ranks them lower. The switch turns one off without deleting it. J and K move through the list." },
    { target: "limits.effects", side: "top", title: "What your limits do", body: "All your limits together: how many roles they hide and how many they show. Pursuits opens every role to see them." },
    { target: "directions.list", side: "right", title: "Directions", body: "Approved directions rank roles for you. Proposed ones wait here with Approve and Reject on each row. J and K move through the list." },
    { target: "directions.suggest", side: "top", title: "Suggest more", body: "Proposes kinds of work your approved record supports that you haven’t considered, at the cost shown. They wait under Proposed." },
  ],
};
