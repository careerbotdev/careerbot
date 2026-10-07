// The website's words (careerbot.dev), written to the person looking for work rather than about the product: their
// pains first, then why the usual search fails, then the method and what they get. No results, numbers or
// testimonials: there are no users yet, so it promises an approach, not an outcome. The AGPL source is public on
// GitHub; the hosted version follows (invite-only while it's tested), and the waitlist is for it: one email when it
// opens. The site is four pages (Home, How it works, Open source, Questions)
// and the privacy page. Each page's head (title, description) is here too (meta.ts puts it in the page's head), and
// the sign-in page's and the demo's words are here as well.

import { DEMO, SELF_HOSTED, WEBSITE } from "../mode";

// careerbot.dev itself, for links from a build that isn't it: the demo's Leave the demo, Get notified and Privacy.
export const CAREERBOT_URL = "https://careerbot.dev";
// The demo's way in (its own deployment and build, mode.ts), from the build's DEMO_URL: the demo's address
// (https://demo.careerbot.dev), in Infisical dev and prod and inlined by next.config.ts. It's set once the demo is live,
// so careerbot.dev never links to a demo that isn't there: unset, Home has no Open the demo, Questions doesn't offer it
// and /demo on careerbot.dev isn't sent anywhere (next.config.ts).
export const DEMO_URL = process.env.DEMO_URL ? new URL("/demo", process.env.DEMO_URL).href : undefined;

// The headline. The owner picked it (2026-09-30); its last words are marked in amber. The others are kept for a later
// wording test.
export const HEADLINE_LEAD = "Hundreds of job applications. No callbacks.";
export const HEADLINE_MARK = "Let’s fix that.";
export const HEADLINE = `${HEADLINE_LEAD} ${HEADLINE_MARK}`;
export const HEADLINE_OPTIONS = [
  "Hundreds of job applications. No callbacks. Let’s fix that.",
  "You’re not getting called back. CareerBot is here to help.",
  "You’re not getting called back. CareerBot fixes that.",
  "Stop applying into the void.",
];

export const HERO = {
  tag: "Open source",
  subline:
    "CareerBot learns your whole career, points you at the companies and roles where you’ll stand out, and gets you ready to apply or to write straight to the people who hire.",
  cta: "Get notified",
  note: "We’ll email you when the hosted version opens. The source is already on GitHub.",
  joined: "You’re on the list. We’ll email you when the hosted version opens.",
  // Under the waitlist: a way to look around a made-up person's search first (DEMO_URL).
  demo: { label: "Open the demo", note: "A made-up person’s search, no sign-up." },
};

// The head's versions, sized for where they show (tab and search: title about 60 characters, description about 155;
// link previews: title about 60, description about 125).
export const PAGE_TITLE = "CareerBot · Open-source AI job search assistant";
export const SHARE_TITLE = "CareerBot: an open-source AI job search assistant";
export const DESCRIPTION = "CareerBot is an AI job search assistant. It learns your work history, finds roles that fit you, and helps you apply or write to the people who hire.";
export const SHARE_DESCRIPTION = "An AI job search assistant that finds roles that fit you and helps you apply or write to the people who hire.";

// The other public pages' heads (the layout adds " · CareerBot" to each title); `share` is the shorter description
// for link previews.
export const HEADS = {
  howItWorks: {
    title: "How CareerBot helps with your job search",
    description:
      "Four steps, from your work history to the people who hire: your real wins, roles you’d stand out for, tailored resumes, then apply or write to a person.",
    share: "From your work history to the people who hire: your real wins, roles that fit, tailored resumes, and applying or outreach.",
  },
  openSource: {
    title: "Open source: run your own CareerBot",
    description:
      "CareerBot is open source under the AGPL-3.0. What you need to run your own copy, what it costs, and how it differs from the hosted version.",
    share: "CareerBot is open source under the AGPL-3.0: what you need to run your own copy, and what it costs.",
  },
  questions: {
    title: "Questions about CareerBot",
    description: "Whether CareerBot gets you a job, makes things up or sends anything for you, whether to still apply, what it costs, and what happens to your data.",
    share: "What CareerBot does and doesn’t do, what it costs, and what happens to your data.",
  },
  changelog: {
    title: "Changelog",
    description: "What’s new, better and fixed in each version of CareerBot, and what to do when you update a copy you run yourself.",
    share: "What’s new, better and fixed in each version of CareerBot.",
  },
};

// The public pages, in the header's and the footer's order, then the docs. A self-hosted copy and the demo have no
// website, only the docs; a self-hosted copy signs in at /, and the demo opens at /demo (mode.ts).
const DOCS_PAGE = { label: "Docs", href: "/docs" };
export const PAGES: readonly { label: string; href: string }[] = WEBSITE
  ? [
      { label: "Home", href: "/" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Open source", href: "/open-source" },
      { label: "Questions", href: "/questions" },
      DOCS_PAGE,
    ]
  : [DOCS_PAGE];
export const SIGN_IN_LINK = DEMO ? { label: "Open the demo", href: "/demo" } : { label: "Sign in", href: SELF_HOSTED ? "/" : "/sign-in" };
export const MENU = { open: "Menu", close: "Close" };

// The footer: a line on what CareerBot is for, the links in two groups (Product: the pages, then the changelog), then
// the licence and Privacy.
export const FOOTER = {
  description: "Aim at the right roles, tailor every application and start real conversations.",
  product: "Product",
  account: "Account",
  changelog: { label: "Changelog", href: "/changelog" },
  licence: "© 2026 CareerBot. Open source under the AGPL-3.0.",
  // careerbot.dev's own page; the demo, which has none, links to it there.
  privacy: { label: "Privacy", href: DEMO ? `${CAREERBOT_URL}/privacy` : "/privacy" },
};

// The changelog (Changelog.tsx): its heading, the feed, a release's groups, and what a self-hoster reads first.
export const CHANGELOG = {
  heading: "Changelog",
  sub: "What’s new, better and fixed in each version of CareerBot, newest first.",
  rss: { label: "RSS feed", href: "/changelog/rss.xml" },
  new: "New",
  better: "Better",
  fixed: "Fixed",
  selfHost: "If you host your own copy",
  readFirst: "Read before updating",
  howToUpdate: { label: "How to update", href: "/docs/self-hosting/updates#updating" },
};

// Home's call to action after the pains, so a reader who's convinced there can sign up.
export const CTA_BAND = { heading: "Ready to stop applying into the void?", cta: "Get notified" };

// Where job searches go wrong: the pains, in the reader's words. `short` is the first sentence, for a phone's list.
export const PAINS = {
  heading: "Where job searches go wrong",
  items: [
    {
      title: "Applying into the void",
      body: "You send application after application and hear nothing back. Not a no. Nothing. And every one takes a little more out of you.",
      short: "You send application after application and hear nothing back.",
    },
    {
      title: "A resume that sells you short",
      body: "It lists duties instead of wins, uses titles nobody searches for, and reads like everyone else’s. You know you’re better than it makes you look.",
      short: "It lists duties instead of wins, uses titles nobody searches for, and reads like everyone else’s.",
    },
    {
      title: "Stuck, and not sure where to go",
      body: "You know you could do more, but you can’t see which roles you’d be great at, or how to get from here to there.",
      short: "You know you could do more, but you can’t see which roles you’d be great at, or how to get from here to there.",
    },
  ],
};

// Why the usual search doesn't work, and what does. General truths about job searching, not claims about CareerBot's
// results.
export const WHY = {
  heading: "Why isn’t your job search working?",
  words: [
    ["Broad.", "Generic.", "Anonymous."],
    ["Aim.", "Tailor.", "Talk."],
  ],
  body: [
    "Most job searches are broad, generic and anonymous: the same resume sent to hundreds of postings, read by nobody who knows your name.",
    "The people who get hired tend to do the opposite. They aim at a few places worth wanting. They show each one exactly what it’s looking for. And they talk to a person.",
  ],
  close: "CareerBot is built to help you do all three.",
};

// The method: four steps, each tied to a pain. How it works has each step in full; Home has the short version. Step 04
// is both paths, with equal weight.
export const METHOD = {
  heading: "Four steps, from your work history to the people who hire",
  steps: [
    {
      n: "01",
      title: "Record what you’ve really done",
      body: "Tell CareerBot what you’ve done, in your own words. It turns that into a record of your real wins, including the ones you forgot to mention, so you never start from a blank page again.",
      short: "Tell CareerBot what you’ve done in your own words, and it keeps a record of your real wins.",
      pain: "A resume that sells you short",
    },
    {
      n: "02",
      title: "Find the roles you’d stand out for",
      body: "Pick the companies you’d be excited to work for. CareerBot watches their openings and tells you which roles you’d stand out for, so your effort goes where it counts.",
      short: "Pick companies worth wanting, and it tells you which of their openings you’d stand out for.",
      pain: "Applying into the void",
    },
    {
      n: "03",
      title: "Tailor each resume and cover letter",
      body: "Every company prizes something different. CareerBot reads each posting and writes your resume and cover letter in that company’s language, leading with what they care about most.",
      short: "It writes each resume and cover letter in that company’s language, leading with what it cares about.",
      pain: "Applying into the void",
    },
    {
      n: "04",
      title: "Get in front of the people who hire",
      body: "Apply through the posting with materials that stand out, or write to the hiring manager, someone on the team or a recruiter. Or both. CareerBot finds the people and drafts a short, specific message from your record. You send it from your own inbox.",
      short: "Apply with materials that stand out, or write to the people who hire. You send everything yourself.",
      pain: "Applying into the void",
    },
  ],
};

// Home's steps: the method in short, a few of its features (each a link to the full list on How it works) and the way
// to the rest.
export const HOME_STEPS = {
  heading: "How CareerBot fixes it",
  sub: "Aim. Tailor. Talk.",
  features: ["Facts you approve", "Directions", "Job board watching", "Requirement check", "Outreach messages", "Follow-ups"],
  more: "See how it works",
};

// For the reader who's lost.
export const HORIZONS = {
  heading: "See where else your experience fits",
  body: "CareerBot looks at everything you’ve done and shows you paths you hadn’t considered, including roles beyond your current title, with what carries over and how to tell that story.",
};

// Two paths into a role, with equal weight, and the product's opinion that most people are too passive. How it works,
// after the four steps.
export const PATHS = {
  heading: "Two paths: Apply and Outreach. Use both.",
  intro:
    "Most job seekers are far too passive. They send an application and wait. CareerBot helps you apply well, and it helps you get a foot in the door on your own terms by writing to the people who hire.",
  paths: [
    {
      title: "Apply",
      body: "Apply through the posting with a resume and cover letter written for that role, and answers to its questions. It works for many people, and CareerBot makes each application as strong as your record allows.",
    },
    {
      title: "Outreach",
      body: "Write to the hiring manager, someone on the team or a recruiter. CareerBot finds them and drafts a short message: who you are, why this role, why you fit, and one small ask. You can write to a company you want even when it has no open role.",
    },
  ],
  note: "CareerBot never sends anything. You apply and send every message yourself: a few thoughtful messages, one person at a time, never a blast.",
};

// What they get: their whole search in one place.
export const PORTAL = {
  heading: "Your whole search in one place",
  intro: "Your record, directions, companies, new roles, applications and outreach, together.",
  items: [
    "A career record that remembers everything you’ve done",
    "Directions matched to your strengths",
    "A watchlist of companies worth wanting",
    "New roles ranked for you as they open",
    "Tailored resumes, cover letters and application answers",
    "The right people to contact, with a message drafted",
    "Every application and outreach tracked, with a nudge to follow up",
  ],
};

// The honesty line: bold, never invented.
export const TRUST = {
  heading: "It writes boldly, but never makes things up",
  body: "CareerBot pushes you up, the way a good coach would. But every line comes from something you really did, so you can talk to all of it in an interview.",
};

// Home's two cards under the steps, each leading to the page that says more.
export const CARDS = [
  {
    title: "Open source, yours to run",
    body: "Run your own copy with your own AI keys, and keep your data in your own accounts.",
    link: { label: "About open source", href: "/open-source" },
  },
  {
    title: TRUST.heading,
    body: "CareerBot describes your work boldly, but every line comes from something you really did.",
    link: { label: "How it works", href: "/how-it-works" },
  },
];

// The features table: everything, grouped, in plain words.
export const TABLE_HEADING = "Everything CareerBot does";
export const TABLE: { area: string; rows: { feature: string; detail: string }[] }[] = [
  {
    area: "Your record",
    rows: [
      { feature: "Stories in your own words", detail: "One per job or project, added or revised any time" },
      { feature: "Facts you approve", detail: "Nothing enters your record without your say-so" },
      { feature: "Insights across jobs", detail: "Work done in different places joined into bigger claims" },
      { feature: "Projects from GitHub", detail: "Read-only, from the repositories you pick" },
    ],
  },
  {
    area: "Where to go",
    rows: [
      { feature: "Directions", detail: "Current, adjacent and stretch paths, with what carries over" },
      { feature: "Goals and limits", detail: "Written once in your words; pay, place and travel pulled out for you to check" },
    ],
  },
  {
    area: "Finding roles",
    rows: [
      { feature: "Company discovery", detail: "Companies that fit your directions, for you to rate" },
      { feature: "Job board watching", detail: "New openings at the companies you care about" },
      { feature: "Fit for every role", detail: "A score for each of your directions" },
      { feature: "Quick review on your phone", detail: "Swipe through companies and roles in a couple of minutes" },
    ],
  },
  {
    area: "Applying",
    rows: [
      { feature: "Tailored resumes", detail: "Written in the posting’s language, every line traceable" },
      { feature: "Cover letters and answers", detail: "For the application questions too" },
      { feature: "Requirement check", detail: "Where you’re strong, partial or thin for each posting" },
      { feature: "PDF, Word and Google Docs", detail: "Docs kept in step with each new version" },
    ],
  },
  {
    area: "Outreach",
    rows: [
      { feature: "People to contact", detail: "The hiring manager, the team and recruiting" },
      { feature: "Outreach messages", detail: "Who you are, why this role, why you fit, one small ask" },
      { feature: "No opening needed", detail: "Write to a company you want even without an open role" },
    ],
  },
  {
    area: "Following through",
    rows: [
      { feature: "Pursuits", detail: "Each application and outreach: status, timeline and next step" },
      { feature: "Follow-ups", detail: "Reminders and drafts when an application or outreach goes quiet" },
      { feature: "What’s working", detail: "Which directions, resumes and paths get replies" },
    ],
  },
  {
    area: "Your control",
    rows: [
      { feature: "Open source", detail: "Run your own copy for free (source going public soon)" },
      { feature: "Your own keys and models", detail: "OpenRouter for AI, Apollo for company data" },
      { feature: "Budgets", detail: "Monthly caps, and each paid step shows its cost first" },
      { feature: "Hosted version", detail: "Coming: nothing to run" },
    ],
  },
];

// How it works: the page's heading and the line under it.
export const HOW_IT_WORKS = {
  heading: "How CareerBot helps with your job search",
  sub: "It learns your work history, finds roles that fit you, and gets you ready to apply or write to the people who hire. Or both.",
};

// Open source: what the AGPL release is and where the source is, what running it takes, and how a copy of your own
// differs from the hosted version.
export const OPEN_SOURCE = {
  heading: "Open source, yours to run",
  sub: "CareerBot is open source under the AGPL-3.0. Run your own copy with your own AI keys, and keep your data in your own accounts.",
  licence: {
    heading: "The licence",
    body: [
      "The AGPL-3.0 lets you use, change and share CareerBot. If you run a changed copy for other people, you share your changes with them under the same licence.",
      "The source is public on GitHub.",
    ],
    source: { label: "View the source on GitHub", href: "https://github.com/careerbotdev/careerbot" },
  },
  needs: {
    heading: "What you need to run it",
    note: "The self-hosting guide walks through each step.",
    guide: { label: "Read the self-hosting guide", href: "/docs/self-hosting" },
    items: [
      { title: "An OpenRouter key", body: "Required. It’s how CareerBot reaches the AI models. You pick the models and pay OpenRouter for what you use." },
      { title: "An Apollo key", body: "Optional. It’s how CareerBot finds companies and the people to contact for you; without it, you add them yourself. You pay Apollo for what you use." },
      {
        title: "Convex, for your data",
        body: "Use Convex’s free cloud plan, the easiest way to run a copy just for you, or run Convex yourself, since it’s open source too.",
      },
      { title: "A place to run it", body: "A Docker image you can install on Coolify, Dokploy or any Docker host, or deploy to Cloudflare." },
      { title: "A way to sign in", body: "A username and password, with nothing to set up. Google or GitHub sign-in is optional." },
    ],
    optional: "Optional: a Brave Search key, to find job boards a company’s website doesn’t link to.",
  },
  compare: {
    heading: "How it differs from the hosted version",
    columns: ["Your own copy", "Hosted version"],
    rows: [
      { label: "When", own: "Available now.", hosted: "Comes later, and is invite-only while it’s tested." },
      { label: "Cost", own: "Free to run. You pay for OpenRouter and Apollo usage, and for Convex beyond its free plan.", hosted: "Paid. We’ll share pricing before it opens." },
      { label: "Running it", own: "Install the Docker image or deploy to Cloudflare, and set up Convex.", hosted: "Nothing to run." },
      { label: "Your data", own: "Lives in your own accounts.", hosted: "Stored with Convex and hosted on Cloudflare, in the United States." },
    ],
  },
  closing: { heading: "Hear when the hosted version opens.", cta: "Get notified" },
};

// Questions, all of them on their page; Home shows the first of them (HOME_QUESTIONS) and the way to the rest.
export const FAQ = [
  {
    q: "Will this get me a job?",
    a: "No tool can promise that. CareerBot is built to put your effort where it counts: better targets, stronger applications and real conversations.",
  },
  {
    q: "Does it make things up?",
    a: "No. It describes your work boldly, in the words employers use, but everything comes from something you told it. If you didn’t do it, it won’t say you did.",
  },
  {
    q: "Should I still apply through the portal?",
    a: "Often, yes. Applying with a resume and cover letter written for the role works for many people, and some companies only hire that way. Just don’t stop there and wait: a short message to the hiring manager, someone on the team or a recruiter puts you in front of a person. CareerBot helps with both, and you can do both for the same role.",
  },
  {
    q: "Can it apply or write to people for me?",
    a: "No. CareerBot never sends anything. It gets your application and your messages ready, and you send them yourself, from the posting or your own inbox: a few thoughtful messages, never a blast.",
  },
  {
    q: "What does it cost?",
    a: "The open-source version is free to run. You pay for the AI and company data you use, and for Convex beyond its free plan. We’ll share pricing for the hosted version before it opens.",
  },
  {
    q: "What happens to my data?",
    a: "It’s used only for your own search. It isn’t sold, used for advertising or shared with employers. The AI models that write for you see the parts they need, and a copy you run yourself keeps everything in your own accounts.",
  },
  {
    q: "When can I use it?",
    a: "Now, if you run your own copy: the source is on GitHub. Join the waitlist and we’ll email you when the hosted version opens.",
  },
];
export const QUESTIONS = { heading: "Questions", all: "All questions" };
// Questions' way to try it (DEMO_URL), before When can I use it?, while the demo is live.
export const DEMO_QUESTION = {
  q: "Can I try it first?",
  a: "Yes. The demo shows a made-up person’s search, with her record, resumes, letters and outreach. It needs no sign-up, and nothing you change is saved.",
  link: "Open the demo",
};
export const HOME_QUESTIONS = ["Will this get me a job?", "What does it cost?", "What happens to my data?"].map((q) => FAQ.find((x) => x.q === q)!);

export const CLOSING = { heading: "Stop applying into the void.", cta: "Get notified" };

// The sign-in page: the hosted version is invite-only while it's tested.
export const SIGN_IN = {
  heading: "Sign in",
  tag: "Invite only",
  body: "The hosted version of CareerBot is invite-only while we test it. Sign in with the account you were invited with.",
  waitlist: { ask: "Not invited?", link: "Get notified when it opens" },
  // Someone signed in with an account that isn't invited.
  notInvited: {
    heading: "This account isn’t invited yet",
    body: "Join the waitlist and we’ll email you when the hosted version opens.",
    other: "Try another account",
  },
};

// The demo (DEMO_URL; src/app/demo): its entry page, where Open the demo signs the visitor in as the made-up person at
// once (a refusal says why: the demo is busy, or there's none here); the banner over the app; and what an action says
// there instead of happening.
export const DEMO_ENTRY = {
  tag: "No sign-up",
  heading: "Demo",
  body: "Renata Alvarez is a made-up ICU nurse moving into clinical operations. CareerBot read her stories and wrote her record, resumes, letters and outreach. Look at anything; nothing you change is saved.",
  open: "Open the demo",
  opening: "Opening",
  detail: "Opens Renata Alvarez’s search, signed in as her, with no account. Nothing you change is saved.",
  failed: "The demo didn’t open. Try again.",
  own: { ask: "Want your own?", link: "Get notified when it opens" },
};
export const DEMO_BANNER = {
  title: "Demo: a fictional person’s search",
  // The person shown: the demo workspace's name (Renata Alvarez), or a story's fixtures' person.
  body: (person: string) => `${person} is made up, and nothing you change is saved.`,
  leave: "Leave the demo",
  leaveShort: "Leave",
  detail: "Signs you out of the demo and goes to careerbot.dev.",
};
export const DEMO_REFUSAL = { message: "This is a demo, so nothing can be changed", action: "Get notified" };
