// The plain words the docs use for the system map (docs/architecture/model.c4), whose titles and labels use the
// builders' words. scripts/docs-gen.ts joins these to the map and writes src/app/docs/reference.json; it fails when the
// map has a screen, an AI step or an input with no words here, or words here name something the map no longer has.
// Each AI step's `reads` is keyed by the label of its input in model.c4, exactly; null leaves an input out (bookkeeping
// that tells the person nothing). Second person, plain words, no internal names: scripts/docs-check.ts checks.

export type ScreenWords = {
  name: string;
  // The model.c4 screen elements this covers (the last part of their id).
  elements: string[];
  // Its addresses in the app.
  paths: string[];
  // The src/app folders whose actions belong to it.
  folders: string[];
};

// The docs' screen keys, in the order the docs list them. Each has its Using page at /docs/using/<key>.
export const SCREENS: Record<string, ScreenWords> = {
  today: { name: "Today", elements: ["today"], paths: ["/", "/sign-in"], folders: ["src/app/today"] },
  review: { name: "Review", elements: ["reviewScreen"], paths: ["/review"], folders: ["src/app/review"] },
  pursuits: {
    name: "Pursuits",
    elements: ["pursuitsScreen", "rolesScreen", "roleScreen", "pursuitScreen"],
    paths: ["/pursuits"],
    folders: ["src/app/pursuits", "src/app/roles"],
  },
  companies: { name: "Companies", elements: ["companiesScreen"], paths: ["/companies"], folders: ["src/app/companies"] },
  resumes: { name: "Resumes", elements: ["resumeScreen"], paths: ["/resumes"], folders: ["src/app/resumes"] },
  record: {
    name: "Record",
    elements: ["narrativesScreen", "recordScreen", "insightsScreen"],
    paths: ["/record/story", "/record/roles", "/record/projects", "/record/skills", "/record/tools", "/record/certifications", "/record/breaks", "/record/insights"],
    folders: ["src/app/record"],
  },
  goals: { name: "Goals", elements: ["goalsScreen"], paths: ["/goals", "/goals/directions", "/goals/limits"], folders: ["src/app/goals"] },
  reports: { name: "Reports", elements: ["reportsScreen"], paths: ["/reports"], folders: ["src/app/reports"] },
  // The Activity panel, opened from the frame on every screen; its parts are shared ones (src/components).
  activity: { name: "Activity", elements: [], paths: [], folders: [] },
  settings: { name: "Settings", elements: ["settingsScreen", "compareScreen"], paths: ["/settings"], folders: ["src/app/settings"] },
  // The frame around every signed-in screen: the sidebar, ⌘K, the bar on a phone.
  shell: { name: "The frame", elements: ["shell"], paths: [], folders: ["src/app/shell"] },
};

// The website's screens, the docs themselves, the changelog and the demo's way in: not part of the app the docs describe.
export const WEBSITE_SCREENS = ["website", "howItWorksScreen", "openSourceScreen", "questionsScreen", "privacyScreen", "docsScreen", "changelogScreen", "demoEntry"];

export const STAGES = [
  { id: "stories", name: "Your stories", line: "Turning what you wrote into facts you can approve." },
  { id: "record", name: "Your record", line: "Reading across what you approved." },
  { id: "goals", name: "Your goals", line: "Turning what you want into directions and limits." },
  { id: "companies", name: "Companies", line: "Sorting and filling in the companies a search finds." },
  { id: "roles", name: "Roles", line: "Deciding which roles deserve your time." },
  { id: "writing", name: "Writing", line: "Everything written under your name." },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export type StepWords = {
  name: string;
  // null: outside the order (Settings' tools that never touch the record).
  stage: StageId | null;
  starts: string;
  may: string;
  mayNot: string;
  reads: Record<string, string | null>;
};

// Inputs read without a filter tag that are public information about a company or a role (the last part of the
// model.c4 element's id): their filter is "public".
export const PUBLIC_SOURCES = ["tPostings", "tPostingTexts", "tCompanies", "companyWebsites", "jinaReader"];

const RECORD_FOR_WRITING = "Your record: roles, facts, projects, context, insights, skills and directions";
const ALL_FACTS_LABEL = "approved roles, facts (with ids to cite), projects, context, insights, skills and directions that count";

// Every AI step a person meets, in the docs' order: by stage, then the two outside it.
export const AI_STEPS: Record<string, StepWords> = {
  extract: {
    name: "Read a story",
    stage: "stories",
    starts: "You choose Read on a story.",
    may: "Propose roles, facts and context, each with the words it came from.",
    mayNot: "Take a fact from any story but this one, or invent a customer, number, result or skill.",
    reads: {
      "the one career narrative": "The story being read",
      "confirmed roles and facts": "Your roles and facts",
      "proposed roles and facts, as a do-not-repeat list": "Roles and facts already waiting in Review, so it doesn’t repeat them",
      "their other narratives, background only": "Your other stories, for background only",
      "confirmed directions and limits": "Your directions and limits",
      "rejected facts with reasons": "Facts you rejected, with your reasons",
    },
  },
  revision: {
    name: "Read the changes",
    stage: "stories",
    starts: "You choose Read on a story that was read before.",
    may: "Propose new facts and updates to facts the change affects, and flag facts the story no longer says.",
    mayNot: "Touch facts from other stories, or change an approved fact without your okay.",
    reads: {
      "the version last read and the revised version": "The version it read before, and the new one",
      "their other narratives, background only": "Your other stories, for background only",
      "confirmed roles and facts": "Your roles and facts",
      "the facts this narrative is a source of, approved and proposed, with their ids": "This story’s facts, approved or waiting",
      "rejected facts with reasons": "Facts you rejected, with your reasons",
    },
  },
  rework: {
    name: "Rewrite a fact",
    stage: "stories",
    starts: "You choose Add context or rewrite on a fact.",
    may: "Suggest new wording, with your note as the final word.",
    mayNot: "Replace the fact. The new wording waits for you to accept it.",
    reads: {
      "the fact, its history, approved context for its role": "The fact, its history and its role’s context",
      "the fact’s source narrative": "The story the fact came from",
    },
  },
  followups: {
    name: "Follow-up questions",
    stage: "stories",
    starts: "You choose Suggest questions on Review.",
    may: "Ask a few short questions where an answer would add or change a resume line.",
    mayNot: "Ask again what you set aside.",
    reads: {
      "approved record": "Your record",
      "career narratives, background only": "Your stories, for background only",
      "already asked, answered or set aside": "Questions already asked, answered or set aside",
      "approved projects and their approved facts": "Your projects and their facts",
    },
  },
  check: {
    name: "Check for disagreements",
    stage: "stories",
    starts: "You choose Check for disagreements on Record, or Look for conflicts on Review.",
    may: "Ask which version is right when a story and your record disagree.",
    mayNot: "Pick one for you.",
    reads: {
      "approved roles and facts; answered questions": "Your roles and facts, and answers you’ve given",
      "every narrative": "Every story",
    },
  },
  insights: {
    name: "Insights",
    stage: "record",
    starts: "After a story or project is fully reviewed, and when you choose Find new insights.",
    may: "Propose what’s true of you across roles and projects, each citing approved facts.",
    mayNot: "Bring back an insight you rejected, or cite a fact you haven’t approved.",
    reads: {
      "approved roles, facts, context, directions (the evidence)": "Your roles, facts, context and directions",
      "career narratives, background only": "Your stories, for background only",
      "approved and pending (do not repeat); rejected with reasons": "Insights you approved, still to review or rejected, so it doesn’t repeat them",
      "approved projects and their approved facts": "Your projects and their facts",
    },
  },
  gatherSkills: {
    name: "Gather skills",
    stage: "record",
    starts: "You choose Gather on Skills.",
    may: "Propose each skill, tool and certification once, with where your record shows it, and offer near-duplicates as merges.",
    mayNot: "Bring back a skill you rejected, in any spelling, or change one you approved beyond adding where it shows.",
    reads: {
      "approved roles that count: their skills and tools": "The skills and tools of your roles",
      "approved projects: their stack and languages": "The stack and languages of your projects",
      "approved facts that count": "Your facts",
      "approved (settled) and awaiting-review skills, tools and certifications": "Skills, tools and certifications you approved or that are waiting in Review",
      "rejected ones with reasons": "Skills you rejected, with your reasons",
    },
  },
  duplicatesStep: {
    name: "Find duplicates",
    stage: "record",
    starts: "You choose Find duplicates on Record, or Find facts said twice on Review.",
    may: "Flag facts in the same role that say the same thing, for you to merge or keep both.",
    mayNot: "Merge anything itself, or flag a pair you kept apart.",
    reads: {
      "approved and awaiting-review facts, by role, with pairs kept apart": "Facts you approved or that are waiting in Review, by role, and the pairs you kept apart",
    },
  },
  sameWorkStep: {
    name: "Find same work",
    stage: "record",
    starts: "You choose Find same work on Record, or you link a project to a role.",
    may: "Suggest pairs of a project’s facts and its role’s facts that describe the same work.",
    mayNot: "Connect facts without you, or pair facts you kept separate.",
    reads: {
      "the approved project (name, summary, stack) and the role it is linked to": "The project: its name, summary and stack, and the role it’s linked to",
      "the linked approved role (title, employer, dates)": "That role’s title, employer and dates",
      "approved facts of the project and of its role that count, not yet connected, with the pairs kept separate": "The facts of the project and of its role not yet connected, and the pairs you kept apart",
    },
  },
  readProject: {
    name: "Read a project",
    stage: "record",
    starts: "You choose GitHub repositories to read on Projects, or Read again on a project.",
    may: "Propose the project and facts about it, each citing the files it came from.",
    mayNot: "Fetch anything that looks secret, like .env files, keys or certificates. It can open that one repository and nothing else.",
    reads: {
      // The GitHub connection it reads with: access, not something it reads about you.
      "their installation": null,
      "git trees, file contents, commits, languages": "The repository: its files, history and languages",
      "this project’s approved and proposed facts, as a do-not-repeat list": "This project’s facts, approved or waiting, so it doesn’t repeat them",
      "this project’s rejected facts with reasons": "This project’s facts you rejected, with your reasons",
      "confirmed directions (what matters to them)": "Your directions, for what matters to you",
    },
  },
  goalsRead: {
    name: "Read my goals",
    stage: "goals",
    starts: "You choose Read my goals.",
    may: "Propose directions, and limits as clear values you can check and correct.",
    mayNot: "Assume a limit you didn’t state. It leaves out anything it would have to guess.",
    reads: {
      "the goals narrative": "Your goals story",
      "approved roles and facts": "Your roles and facts",
      "approved directions and limits (kept as settled)": "Your directions and limits, kept as they are",
      "rejected directions and limits": "Directions and limits you rejected",
    },
  },
  limitRule: {
    name: "Filters from wording",
    stage: "goals",
    starts: "You edit a limit’s wording.",
    may: "Set the limit’s filters to match what it now says.",
    mayNot: "Read your goals story for it.",
    reads: {
      "the limit’s own wording": "That limit’s wording, and nothing else",
    },
  },
  directionsStep: {
    name: "Directions and search criteria",
    stage: "goals",
    starts: "You choose Fill in or Suggest more on Goals.",
    may: "Fill in each direction’s positioning, target titles, the market’s words for the work, which stories carry over, and its search criteria. Suggest new directions.",
    mayNot: "Overwrite anything you approved.",
    reads: {
      "approved record, insights, limits, directions": "Your record, insights, limits and directions",
      "career narratives, background only": "Your stories, for background only",
      "rejected and pending directions (do not repeat)": "Directions you rejected or haven’t reviewed yet, so it doesn’t repeat them",
      "approved projects and their approved facts": "Your projects and their facts",
    },
  },
  screening: {
    name: "Screen companies",
    stage: "companies",
    starts: "After each company search.",
    may: "Sort companies into places to work and non-employers: recruiters, job boards, associations, government, schools, media and investors.",
    mayNot: "Delete anything. You can restore a company it set aside.",
    reads: {
      "name and website only": "Each company’s name and website",
    },
  },
  enrich: {
    name: "Fill in companies",
    stage: "companies",
    starts: "After a company search, or when you choose Fill in details, Check again or Check all again.",
    may: "Add what each company builds, its size and its fit, and find its job board.",
    mayNot: "Spend Apollo credits past the credits you set aside each month.",
    reads: {
      "public hostnames only; every redirect re-checked": "The company’s website",
      "blocked sites only; public company URL only": "The company’s website",
      "approved directions (titles, positioning, criteria) and approved limits": "Your directions and limits",
      "companies they turned down, and why, as preferences": "Companies you turned down, and why, as preferences",
    },
  },
  sortRoles: {
    name: "Sort roles",
    stage: "roles",
    starts: "Once the descriptions of newly found roles are all in.",
    may: "Decide which of your directions a role could be for, leaning toward including it.",
    mayNot: "Judge how well it fits. That’s the next step.",
    reads: {
      "approved directions: name, approved positioning, approved target and criteria titles": "Your directions: their names, positioning and titles",
      "role titles; for the backtest, the first ranking’s verdicts (never written)": "Each role’s title",
      "descriptions without the text the company repeats across its postings": "Each role’s description, without what its company repeats in every posting",
      "company name": "The company’s name",
    },
  },
  rankRoles: {
    name: "Rank roles",
    stage: "roles",
    starts: "Right after sorting.",
    may: "Rate the role for each direction as strong, some, weak or none, with a score from 0 to 100 and a reason in plain words.",
    mayNot: "Predict whether you’ll be hired. The score says how much of your time the role deserves.",
    reads: {
      "approved projects (dates, linked role, summary, stack) with their approved facts, compact, for For you and the stretch": "Your projects and their facts",
      "approved directions (only approved positioning, titles, vocabulary and criteria) and approved limits (Eligibility with its fields)": "Your directions and limits",
      "the roles claimed, each with the directions the sort passed it to that have no verdict yet": "Each role, and the directions the sort passed it to",
      "their whole descriptions without what the company repeats": "Each role’s whole description, without what its company repeats in every posting",
      "company name and one-line summary": "The company’s name and one-line summary",
      "approved roles (employer, title, dates, skills) and their approved facts, compact, for the brief’s For you and the stretch; under v2 their years of work from those roles’ dates":
        "Your roles and their facts, and your years of work",
      "the rubric: whether to count the stretch": "Whether to count how big a stretch a role is",
      "roles they turned down, and why, as preferences, never limits": "Roles you turned down, and why, as preferences, never as limits",
    },
  },
  resume: {
    name: "Resume",
    stage: "writing",
    starts: "You choose Write, Write again, Add what’s new or Update all on Resumes, Write the resume or Rewrite on Goals, or Tailor a resume on a direction or a role.",
    may: "Write a base resume, one for each direction and one tailored to a role, each line citing approved facts, with how well you cover each requirement: strong, partial or thin.",
    mayNot: "Cite anything you haven’t approved. A line with no approved fact behind it is marked No approved basis.",
    reads: {
      "approved skills, tools and certifications that count (the only skills a resume lists; roles’ own skill lists are not sent)": "Your skills, tools and certifications",
      "approved roles, facts, insights, context": "Your roles, facts, insights and context",
      "approved career breaks, with the reason in their words": "Your career breaks, with the reason in your words",
      "the length to write to: the resume’s own, else the record’s (a tailored one: its direction’s), as a target (bullets per role and in all, skills 12 to 20)": "The length to write to",
      "approved positioning (direction and tailored resumes)": "The direction’s positioning, for a direction or tailored resume",
      "the direction resume a tailored one starts from": "For a tailored resume, the direction resume it starts from",
      "approved projects (name, link, dates, linked role) and their approved facts, inside the role they are linked to or under Projects": "Your projects and their facts",
      "facts connected as the same work: one fact, the lead, with the other’s words as context": "Facts that describe the same work, as one",
      "the role tailored to: title and place": "For a tailored resume, the role’s title and place",
      "the company of the role tailored to": "For a tailored resume, the role’s company",
      "the role’s description, as read": "For a tailored resume, the role’s description",
    },
  },
  letter: {
    name: "Cover letter",
    stage: "writing",
    starts: "You choose Write a cover letter in a pursuit.",
    may: "Write a first-person letter whose paragraphs cite approved facts. Your edits become a new version.",
    mayNot: "Write one before a resume is tailored to the role, or once the pursuit was sent.",
    reads: {
      [ALL_FACTS_LABEL]: RECORD_FOR_WRITING,
      "the resume tailored to its role, arranged as it shows (or as sent)": "The resume tailored to the role, or the one you sent",
      "the pursuit: role, company, direction, what was sent": "The pursuit: its role, company, direction and what you sent",
      "the role: place": "The role’s place",
      "its description as the AI reads it": "The role’s description",
      "the company summary": "The company’s summary",
      "their name, to sign it": "Your name, to sign it",
    },
  },
  ask: {
    name: "Ask about this role",
    stage: "writing",
    starts: "You ask a question in a pursuit.",
    may: "Answer application questions in the first person, ready to paste, and say when your record doesn’t support something.",
    mayNot: "Claim what your record doesn’t support. Anything new you tell it comes back as proposals to review.",
    reads: {
      [ALL_FACTS_LABEL]: RECORD_FOR_WRITING,
      "the conversation so far and their latest message": "The conversation so far and your latest message",
      "the resume tailored to its role, arranged as it shows (or as sent)": "The resume tailored to the role, or the one you sent",
      "the pursuit: role, company, what was sent": "The pursuit: its role, company and what you sent",
      "the role: place": "The role’s place",
      "its description as the AI reads it": "The role’s description",
      "the company summary": "The company’s summary",
    },
  },
  outreach: {
    name: "Outreach",
    stage: "writing",
    starts: "You choose Draft a message for a person in a pursuit.",
    may: "Draft a short outreach message signed with your name: who you are, why this role, why you fit, and one small ask, for you to send from your own email.",
    mayNot: "Send anything. You send it, then mark it sent.",
    reads: {
      [ALL_FACTS_LABEL]: RECORD_FOR_WRITING,
      "who it’s to: name, title, group, likely hiring manager; the others already written to there": "Who it’s to: their name, title, group and whether they’re likely the hiring manager; who else you already wrote to there",
      "the pursuit: role, company and when it was applied to": "The pursuit: its role, company and when you applied",
      "the role’s description as the AI reads it": "The role’s description",
      "the company summary": "The company’s summary",
      "their name, to sign it": "Your name, to sign it",
    },
  },
  followUpWriter: {
    name: "Follow-ups",
    stage: "writing",
    starts: "A follow-up is due after a quiet application or an interview, and you choose Write the follow-up in its pursuit or Write follow-up on Today.",
    may: "Draft a short follow-up email signed with your name, for you to send from your own email.",
    mayNot: "Send anything. You send it, then mark it sent.",
    reads: {
      [ALL_FACTS_LABEL]: RECORD_FOR_WRITING,
      "where the application stands: status, dates, timeline": "Where your application stands: its status, dates and timeline",
      "follow-ups already sent": "Follow-ups you already sent",
      "who it’s to, and outreach already sent to them": "Who it’s to, and what you already sent them",
      "the role’s description as the AI reads it": "The role’s description",
      "their name, to sign it": "Your name, to sign it",
    },
  },
  lineCheck: {
    name: "Check against facts",
    stage: "writing",
    starts: "You choose Check against facts on a resume line you put in your own words.",
    may: "Say whether your words say only what their facts support, and which words go beyond them.",
    mayNot: "Change your words. It only answers.",
    reads: {
      "the approved facts the line (or the resume, for the summary) rests on that still count": "The facts the line rests on (for the summary, the facts the whole resume rests on)",
      "their words and where the line sits": "Your words, and where the line sits",
      // Which lines are being checked: bookkeeping for the run.
      "which lines are being checked": null,
    },
  },
  lineUpdate: {
    name: "Update lines",
    stage: "writing",
    starts: "You choose Update lines on a document whose facts changed since it was written.",
    may: "Rewrite just the lines that cite a changed fact.",
    mayNot: "Change a document until you choose Apply.",
    reads: {
      "the approved facts the lines cite that still count: as they read now and, from their history, as the lines were written": "The facts the lines cite, as they read now and as they read when the lines were written",
      "a rejected fact a line cites: its words, as what to take out": "A rejected fact a line cites, as what to take out",
      "the resume in use: its lines, their own words, what it was written from": "The resume in use: its lines, your own words and what it was written from",
      "the newest version of a letter not sent": "The newest version of a letter not yet sent",
      "answers, and whether it was sent (sent: left alone)": "A pursuit’s answers, and whether it was sent (a sent one is left alone)",
      // Whether a document's lines are already being updated: bookkeeping for the run.
      "whether a document’s lines are being updated": null,
    },
  },
  compare: {
    name: "Compare models",
    stage: null,
    starts: "You choose Compare in Settings, AI.",
    may: "Run one of three tasks (reading a story, the base resume or insights) on up to four models, for you to judge.",
    mayNot: "Add anything to your record.",
    reads: {
      "one career narrative, without the record": "One story, without your record",
    },
  },
  firstCall: {
    name: "Test call",
    stage: null,
    starts: "You choose Try it in Settings, AI.",
    may: "Send one test prompt to check your key and model work.",
    mayNot: "Read or change your record.",
    reads: {},
  },
};
