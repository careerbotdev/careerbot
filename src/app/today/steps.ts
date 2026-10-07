// Getting started's steps and their words: Setup, then your first pursuit. Each step: its title, the line under it
// until it's done, what its pane says (why), what it unlocks, its Learn more page, and where it's done (the link's
// words and its explainer). The first pursuit's words name the company once a pursuit is started. Pure module.

import { SELF_HOSTED } from "../mode";

// The docs live under /docs; each step's Learn more page is one of these, in one place.
export const DOCS = "/docs";
export const docsHref = (path: string) => `${DOCS}/${path}`;
// How to tell your story: the first story's Learn more, and the link under Talk while it listens.
export const STORY_GUIDE = "best-practices/your-story";

export type Learn = { label: string; path: string };
export type Go = { href: string; label: string; detail: string; note: string };

export type SetupKey = "signIn" | "key" | "story" | "review" | "goals" | "resume" | "apollo" | "companies" | "drive";
export type PursuitKey = "pursuit" | "tailor" | "path" | "contacts" | "message" | "letter" | "applied" | "followUp";
// The rows for a path the first pursuit doesn't take (yet): Outreach or Apply before one is chosen, then Outreach too
// or Apply too. Not steps: they add that path.
export type PathKey = "outreachPath" | "applyPath";
export type StepKey = SetupKey | PursuitKey | PathKey;

export type SetupDef = { key: SetupKey; title: string; line: string; why: string; unlocks: string; learn: Learn; go?: Go; optional?: boolean };

// A self-hosted copy signs in with a username and password (its owner made with the setup code; mode.ts), careerbot.dev
// with Google or GitHub.
export const SETUP_STEPS: SetupDef[] = [
  {
    key: "signIn",
    title: "Sign in",
    line: SELF_HOSTED ? "With your username and password" : "With Google or GitHub",
    why: "Your workspace is yours alone: your stories, record and search.",
    unlocks: "Everything else here.",
    learn: { label: "Signing in and your account", path: "start/sign-in" },
    go: { href: "/settings?section=account", label: "Change", detail: "Opens Settings, Account: your name and how you sign in.", note: "Free" },
  },
  {
    key: "key",
    title: "Add an OpenRouter key and a budget",
    line: "Pays for CareerBot’s AI, within a budget you set",
    why: "CareerBot’s AI runs on your own OpenRouter account, so you see and control every cent. It never spends past the budget you set here.",
    unlocks: "Reading your stories, and everything written from them.",
    learn: { label: "OpenRouter keys and your AI budget", path: "start/openrouter" },
    go: { href: "/settings?section=keys", label: "Open Settings", detail: "Opens Settings, Keys: your OpenRouter key, to replace or remove it.", note: "Free" },
  },
  {
    key: "story",
    title: "Write your first story",
    line: "In your own words. It’s the root of your record.",
    why: "Pick one job and tell it the way you’d tell a friend. Rough is fine. CareerBot builds your record from your own words, so give it real time: 20 minutes or more for a job is normal.",
    unlocks: "Facts about that work to review, then insights across jobs as you add more stories.",
    learn: { label: "How to tell your story", path: STORY_GUIDE },
  },
  {
    key: "review",
    title: "Review what CareerBot understood",
    line: "Unlocks your record",
    why: "Your story, read into roles and facts. Approve what’s right, edit what’s close, reject what’s wrong. Only what you approve is used.",
    unlocks: "Your record, which resumes and ranking are built from.",
    learn: { label: "Reviewing facts", path: "start/review" },
    go: { href: "/review", label: "Review", detail: "Opens Review, with what CareerBot understood from your story, one item at a time.", note: "Free" },
  },
  {
    key: "goals",
    title: "Write your goals",
    line: "Then approve limits and directions",
    why: "Say where you want to go next, in your own words. CareerBot turns it into directions and limits for you to approve.",
    unlocks: "Companies found and roles ranked for each direction.",
    learn: { label: "Goals, directions and limits", path: "start/goals" },
    go: { href: "/goals", label: "Open Goals", detail: "Opens Goals, to write where you want to go next and approve the directions and limits that come from it.", note: "Free" },
  },
  {
    key: "resume",
    title: "See your base resume",
    line: "Built from your approved record",
    why: "Your base resume, written from your approved record.",
    unlocks: "A resume for each direction, and one tailored to any role.",
    learn: { label: "Your resumes", path: "start/resumes" },
    go: { href: "/resumes", label: "Open Resumes", detail: "Opens your base resume in Resumes.", note: "Free" },
  },
  {
    key: "apollo",
    title: "Add an Apollo key and a budget",
    line: "Finds companies and their open roles",
    why: "Apollo finds companies that fit your directions, fills in their details and finds people there. It runs on your own Apollo account and spends only the credits you set aside here.",
    unlocks: "Companies found for each direction, with their details and open roles.",
    learn: { label: "Apollo keys and credits", path: "start/apollo" },
    go: { href: "/settings?section=budgets", label: "Open Settings", detail: "Opens Settings, Budgets: the Apollo credits set aside each month and how Apollo work runs.", note: "Free" },
  },
  {
    key: "companies",
    title: "Find companies and your first roles",
    line: "Ranked for each direction",
    why: "Choose the companies you’d like to work at; their open roles are read and ranked against your directions.",
    unlocks: "New strong roles on Today every morning.",
    learn: { label: "Finding companies", path: "start/companies" },
    go: { href: "/companies", label: "Open Companies", detail: "Opens Companies, to find companies for your directions and rate the ones you’d like to work at.", note: "Free · A search shows its Apollo credits before it starts" },
  },
  {
    key: "drive",
    title: "Keep your resumes in Google Drive",
    line: "A Google Doc of each resume",
    why: "Keeps a Google Doc of each resume in your CareerBot folder, updated when you keep a new version. CareerBot can only see the files it makes. On a copy you run yourself, the Google setup for Drive also lets you sign in with Google, if you want to. GitHub sign-in is optional too.",
    unlocks: "Your resumes in Drive, ready to share or print.",
    learn: { label: "Google Drive", path: "start/google-drive" },
    go: { href: "/settings?section=drive", label: "Open Settings", detail: "Opens Settings, Google Drive: the account, the CareerBot folder and how syncing went.", note: "Free" },
    optional: true,
  },
];

// What the first pursuit's words name: the company and the direction its resume starts from, once a pursuit is
// started (null before).
export type Named = { company: string | null; direction: string | null };
const at = (n: Named) => n.company ?? "the company";
const its = (n: Named) => (n.company ? `${n.company}’s` : "the company’s");
const yours = (n: Named) => (n.company ? `your ${n.company} pursuit` : "your pursuit");

// part: the steps every pursuit takes (shared), or only one on that path.
export type PursuitDef = {
  key: PursuitKey;
  part: "shared" | "outreach" | "apply";
  title: string;
  line: (n: Named) => string;
  why: (n: Named) => string;
  unlocks: (n: Named) => string;
  learn: Learn;
  go: (n: Named) => Omit<Go, "href">;
};

const OPEN_PEOPLE = (n: Named) => ({ label: "Open People", detail: `Opens ${yours(n)} at its People tab.`, note: "Free · Revealing an email is 1 Apollo credit" });

// In order: the shared start, Outreach's steps, Apply's, then following up. The steps shown are the shared ones and
// those of the path or paths chosen.
export const PURSUIT_STEPS: PursuitDef[] = [
  {
    key: "pursuit",
    part: "shared",
    title: "Pick a role and start a pursuit",
    line: () => "From your strongest new roles",
    why: () => "Choose one strong fit to go after. A pursuit keeps everything for that role in one place: its resume, the people you write to, your letter and answers, and what happened.",
    unlocks: () => "A resume tailored to that role.",
    learn: { label: "Starting a pursuit", path: "start/first-pursuit" },
    go: () => ({ label: "Open Pursuits", detail: "Opens Pursuits at your strongest new roles. Start on a role begins its pursuit.", note: "Free" }),
  },
  {
    key: "tailor",
    part: "shared",
    title: "Tailor your resume",
    line: () => "To the posting, from your direction’s resume",
    why: (n) =>
      `A resume written for this posting, starting from your ${n.direction ? `${n.direction} resume` : "resume for its direction"}, with how well you cover each requirement. Read it through and edit any line you couldn’t talk to.`,
    unlocks: () => "An outreach message and a cover letter built on it.",
    learn: { label: "Tailoring a resume", path: "start/tailoring" },
    go: (n) => ({ label: "Open the resume", detail: `Opens ${yours(n)} at its Resume tab, where Tailor a resume writes one for this posting.`, note: "Free · Tailoring shows its cost first" }),
  },
  {
    key: "path",
    part: "shared",
    title: "Choose a path",
    line: () => "Outreach, Apply, or both",
    why: (n) =>
      `Two ways in, with equal weight. Outreach writes to the people who hire at ${at(n)}: the hiring manager, someone on the team or a recruiter. Apply sends your tailored resume and letter through the posting. Most people only apply and wait; doing both is common, and you can add the other path any time.`,
    unlocks: () => "The steps for the path you choose.",
    learn: { label: "Two paths: Outreach and Apply", path: "start/paths" },
    go: (n) => ({ label: "Open the pursuit", detail: `Opens ${yours(n)} at its Overview, where you can choose a path too.`, note: "Free" }),
  },
  {
    key: "contacts",
    part: "outreach",
    title: "Find contacts",
    line: () => "Hiring manager, team and recruiting",
    why: (n) =>
      `People at ${at(n)} in three groups: the hiring manager, the team (close to the work, often quick to reply) and recruiting. Finding them is free. Know someone there already? Add them yourself.`,
    unlocks: () => "Someone to write to.",
    learn: { label: "Finding contacts", path: "start/people" },
    go: OPEN_PEOPLE,
  },
  {
    key: "message",
    part: "outreach",
    title: "Send your outreach message",
    line: () => "From your own email",
    why: () =>
      "A short message from your record: who you are, why this role, why you fit, and one small ask. Reveal the email of the one person you’ll write to, send it from your own email with your resume attached, then mark it sent.",
    unlocks: (n) => `Someone at ${at(n)} who knows your name, and a follow-up step a week later.`,
    learn: { label: "The outreach message", path: "start/outreach-message" },
    go: OPEN_PEOPLE,
  },
  {
    key: "letter",
    part: "apply",
    title: "Write the cover letter and answers",
    line: () => "Answers with Ask about this role",
    why: () =>
      "A cover letter from your tailored resume and record. For the application’s questions, paste each one into Ask about this role and keep the answers you’ll use. It never claims what your record doesn’t support.",
    unlocks: () => "Everything the application asks for, ready to paste.",
    learn: { label: "Cover letters and Ask about this role", path: "start/letters-and-answers" },
    go: (n) => ({ label: "Open the letter", detail: `Opens ${yours(n)} at its Letter tab. Ask about this role opens beside it with /.`, note: "Free · Writing shows its cost first" }),
  },
  {
    key: "applied",
    part: "apply",
    title: "Apply and mark it Applied",
    line: (n) => `On ${its(n)} site, then mark it here`,
    why: (n) =>
      `Apply on ${its(n)} job board with your tailored resume and letter, then mark the pursuit Applied. CareerBot keeps a copy of what you sent and counts the days to a follow-up.`,
    unlocks: () => "A follow-up step, due a week after you apply.",
    learn: { label: "Applying and tracking a pursuit", path: "start/applying" },
    go: (n) => ({ label: "Open the posting", detail: `Opens ${its(n)} posting on its job board in a new tab, to apply there.`, note: "Free" }),
  },
  {
    key: "followUp",
    part: "shared",
    title: "Follow up",
    line: () => "If you haven’t heard back",
    why: () =>
      "A week with no reply is the moment for a short note to the person you wrote to, or after your application. CareerBot drafts one from your record and what it follows; send it from your own email, then mark it sent.",
    unlocks: () => "Your first pursuit, done end to end.",
    learn: { label: "Following up", path: "start/following-up" },
    go: (n) => ({ label: "Open the follow-up", detail: `Opens ${yours(n)} at its follow-up, drafted from your record and what it follows.`, note: "Free · A draft shows its cost first" }),
  },
];

// The rows for a path not taken: before a path is chosen, its name; once the other is chosen, "too". Its pane says
// what the path is and adds it (choose: the button's words before a path is chosen; too: after).
export type PathDef = { key: PathKey; path: "outreach" | "apply"; title: string; too: string; choose: string; line: string; why: (n: Named) => string; unlocks: string; learn: Learn };
export const PATH_ROWS: PathDef[] = [
  {
    key: "outreachPath",
    path: "outreach",
    title: "Outreach",
    too: "Outreach too",
    choose: "Choose Outreach",
    line: "Write to the people who hire",
    why: (n) =>
      `Write to the hiring manager, someone on the team or a recruiter at ${at(n)}. CareerBot finds them and drafts a short outreach message from your record; you send it from your own email. A message gets you noticed before your application is read.`,
    unlocks: "Two steps: find contacts, then send your outreach message.",
    learn: { label: "Two paths: Outreach and Apply", path: "start/paths" },
  },
  {
    key: "applyPath",
    path: "apply",
    title: "Apply",
    too: "Apply too",
    choose: "Choose Apply",
    line: "Through the posting",
    why: (n) => `Apply through ${its(n)} posting with your tailored resume and a cover letter. CareerBot keeps a copy of exactly what you sent.`,
    unlocks: "Two steps: write the cover letter and answers, then apply and mark it Applied.",
    learn: { label: "Two paths: Outreach and Apply", path: "start/paths" },
  },
];

// Once every step is done.
export const DONE = {
  title: "Getting started is done",
  why: "Your record, your first resume and your first pursuit are all in place. Today now becomes your daily list.",
  unlocks: "New strong roles each morning, reminders for every pursuit, and anything waiting for your review.",
  learn: { label: "A job search with CareerBot", path: "start" },
};

// Story, what to cover: shown beside the first story as it's written.
export const WHAT_TO_COVER = ["What you did, and what you owned", "Results, with numbers", "Tools and methods you used", "The people and the setting", "What was hard", "Why you moved on"];
