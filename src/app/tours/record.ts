import type { TourDef } from "@/components/Tour";

// Record, the same on each of its pages (Story, Roles, Projects, Skills, Tools, Certifications, Insights, Breaks), with
// Story's own parts: writing a story and reading it.
export const RECORD_TOUR: TourDef = {
  id: "record",
  name: "Record",
  steps: [
    { title: "Record", body: "What’s true about your career, which every resume is written from: your stories, roles, projects, skills, tools, certifications, insights and breaks. Only what you approve goes on resumes." },
    { target: "record.tabs", title: "Tabs", body: "Split the list by kind or status. Rejected, or Removed in Breaks, keeps what you turned down with why, so you can restore it." },
    { target: "record.list", title: "The list", body: "Everything on this page. Open a row to see it beside the list; J and K move through the list and Esc closes what’s open." },
    { target: "record.new", title: "New story or note", body: "Starts a story to write in, or a quick note for something smaller. N writes a new story and ⇧N a quick note." },
    { target: "record.item", side: "left", title: "The open item", body: "The one you opened, with its actions beside the title. Where something was proposed, Approve adds it to your record, Edit corrects it and Reject keeps it out, with why if you like. U undoes." },
    { target: "record.read", title: "Read", body: "Reads the story for roles, facts and context for your record; what it costs shows beside it. What it proposes waits in Review and on the Proposals tab. Save your changes before you read." },
    { target: "record.talk", title: "Talk", body: "Type by speaking: your words appear in the story as you say them, and save when you stop. ⇧T starts and stops." },
    { target: "record.builton", title: "Built on", body: "Where this came from: the words and facts in your record it’s built on. Each one opens where it lives." },
    { target: "record.more", title: "More", body: "The page’s other actions, each with what it does and what it costs." },
  ],
};
