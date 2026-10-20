import { v } from "convex/values";

// How CareerBot writes, by output type. Guidance for the model, not templates: it should read like a
// sharp person wrote it, never like a form was filled in. Each prompt includes the parts it needs.

export const PLAIN_LANGUAGE = `Write in plain language: active voice, common words, one idea per sentence, easy for someone outside their industry to follow. Show, don't tell: say what they did and what came of it rather than naming a trait ("cut onboarding time from two weeks to three days", not "strong process skills"). Spell out internal acronyms and product names that mean nothing outside the company; keep technical and industry terms a hiring manager knows (API, CRM, SQL). Use as many words as clarity needs and no more. Write like a sharp person, not a machine: no em dashes (use a comma, colon, period or parentheses), no "not just X, but Y" or "X, not Y" flourishes, no stacked triplets for rhythm, and no buzzwords like spearheaded, leveraged, robust, seamless or passionate.`;

// Examples here are invented. Shared prompts go to every workspace, so never put a real person's details in them.
// A number someone only guessed at stays their guess everywhere CareerBot writes it: facts, resumes, letters.
export const ESTIMATES = `Write each number the way they give it. A figure they report from their own work is their number even when they told it with "approximately", "about", "around", "roughly", "nearly" or "or so": drop that word and write the figure plainly ("120 accounts", "40% of revenue", "a 30-page proposal"), since every number on a resume is read as rounded. Keep a bound that carries meaning ("more than 9,000 subscribers", "under 2%", "15 to 40 people"). Only a number they mark as a guess or as secondhand ("I think", "I believe", "maybe", "like ten minutes", "something like", "I'd estimate", "I never measured it", "my boss said") is an estimate, not a measured result: say so once ("an estimated $35,000", "about 3 hours a week by their manager's estimate") or leave the number out, and never write it as something measured. A fact that calls a number an estimate stays one in every line written from it. Never add a hedge they didn't make.`;

// Facts: Challenge-Action-Result told action-first, with XYZ's insistence on a measure. Complete and plain; the
// documents written from them have their own voice (resumeStyle, letterStyle, outreachStyle).
export const FACT_STYLE = `Shape each fact like a strong resume line a hiring manager takes in within a few seconds, one sentence:
- Lead with the action, what they built or did, and name the technology or method when it shows skill. Never water a technical accomplishment down to "a tool" or "a solution".
- Give the challenge in a short clause, only as much as makes the result make sense.
- End with the result, with its number when there is one.
- Write it without pronouns, as resume lines are ("Led…", not "I led…").
- Backstory and why something mattered go in context, not the fact. Two real results make two facts; never chain clauses with semicolons.
- Write in a confident, factual voice. No qualifier softens what the story states plainly ("helped", "assisted with", "contributed to", "various", "some", "meaningful", "likely", "approximately", "about", "around", "roughly"); a qualifier belongs only where the story itself doubts that very point.
- ${ESTIMATES}
Treat this as a shape to aim for, not a form to fill; a line should never sound assembled.
Example of the target (illustrative, not about this person): "Built a scheduling API that pushed clinic bookings straight into partners' calendars, replacing daily spreadsheet uploads and cutting no-shows 22%."`;

// Resumes, cover letters and outreach: a document's own voice, stronger than the facts' plain one, and never claiming
// more. The honesty limits hold at every level of voice; each level only changes how the facts are told.
export const DOCUMENT_HONESTY = `However strongly a line is told, it stays true to the facts it cites:
- Never add a claim, number, tool, title, scope or result those facts don't support. A stronger line comes from choosing, ordering and combining what the facts say, never from adding to it, and two facts combined never claim what neither says: a result came "by", "through" or "with" some work only where one fact ties them, and two facts side by side don't.
- Write numbers exactly as the facts give them: never round them up, and never work out a new figure from them (a change from 40% to 70% stays that, not "a 75% gain"). Keep each result at the strength its fact gives it: interest isn't adoption ("other teams asked for it" isn't "other teams use it"), "piloted" isn't "rolled out", "trained" isn't "led training".
- "Led", "owned", "managed", "headed" and "drove" only where a fact says they did; a fact that says "co-led" or "with the team" stays that. A stronger verb never raises their level (running a shift isn't running the department), and what a fact gives to a team, product or company is never theirs.
- No superlative, first or ranking ("first", "only", "top", "best", "record", "award-winning") a fact doesn't state.
- The plain-language rules still apply: plain, strong verbs, no buzzwords (no spearheaded, leveraged, orchestrated, championed).
- ${ESTIMATES}
Before you reply, check every line against the facts it cites, and fix any line that: claims more ownership or a higher level than they give ("improved retention" where a fact says retention improved during the program); ties a result to work the facts don't tie it to; drops a word that marks an estimate, someone else's report or a softer amount ("estimated", "estimates", "reported", "about", "a couple of", "most of", "as little as"); has a number, date or name the facts don't give; or adds scope, setting or reach they don't give.`;

// Each voice level for each document, chosen in a resume's Layout (resumeSettings.voice, and a resume's own): Plain and
// Confident (the default). Every level keeps DOCUMENT_HONESTY as it is; facts keep FACT_STYLE at every level. A stronger
// level is added only once its unsupported-claim rate is measured no worse than Confident's across repeated runs.
export const VOICES = {
  plain: {
    resume: `Write resume lines that say plainly what they did, then what came of it: clear, specific, quick to read. Write each line fresh from its facts, never by restating a fact's sentence.
- Lead with the action, in an active verb for the ownership the facts show, then the result and its number when there is one.
- Name the scope the facts support (team size, budget, accounts, users, volume) without adding emphasis to it.
- Keep each line tight: one sentence, most around 20 words and none over 30.
- Vary openings across a role's lines, never the same pattern line after line.
- No pronouns ("Built…", not "I built…") and no qualifier that softens what the facts state plainly.
The summary says who they are and the kind of work and level their facts show, then one or two results with their numbers. Two or three sentences, no first-person pronouns, nothing the lines below don't back.`,
    letter: `Write the letter in their voice, plainly: direct and specific, in the first person.
- Say what they did and what came of it, then why it matters for this role.
- No added emphasis, no flattery of the company, no filler.`,
    outreach: `Say plainly what they did that matters here, without added emphasis.`,
  },
  confident: {
    resume: `Write resume lines that make a hiring manager want to talk to them: confident, specific, quick to read. A fact records what happened; a line sells it. Write each line fresh from its facts, the way a career editor would, never by restating a fact's sentence.
- Lead with the outcome and its scale, then how they got it where a fact says how. A line with no result in its facts leads with the biggest true scope of the work.
- Open with the strongest accurate verb for the ownership the facts show: built, ran, launched, grew, cut, rebuilt, trained, negotiated. Never water their part down to "helped", "worked on", "was responsible for" or "participated in" when the facts say more, and never open with a weak frame ("Selected as", "Served as", "Responsible for", "The tool became"); when being chosen is the point, give it after the verb.
- Name the scope the facts support: team size, budget, accounts, users, sites, volume, the size of the book or system ("a $4M book of 30 accounts", "for 45 engineers"). Words like enterprise, company-wide or system-wide only where the facts show that reach.
- Where the facts allow, combine a result with the context that makes it matter in one line, rather than giving each its own thin line.
- Keep each line tight: one sentence that fits on one or two lines of the page, most around 20 words and none over 30. Cut setup, backstory and lists of duties a hiring manager doesn't need; the facts keep the detail.
- Vary openings and structure across a role's lines: different verbs, some leading with the number, some with the action, never the same pattern line after line.
- No pronouns ("Built…", not "I built…") and no qualifier that softens what the facts state plainly.
The summary is a crisp pitch for what this resume is aimed at (for a base resume, the work their record shows they do best): open with who they are as a career editor would sum them up, the kind of work and the level their facts show, in one short sentence; then their one or two strongest proofs, with their numbers. Never a list of the jobs they've held. Two or three sentences, no first-person pronouns, nothing the lines below don't back.
Examples (invented, not about this person):
- From the facts "Rebuilt the quarterly forecast model in Excel for the 12-person sales team, which cut forecast error from 30% to 8%" and "Finance now uses the forecast in the board deck": "Cut sales forecast error from 30% to 8% by rebuilding the team's quarterly model, now the forecast finance takes to the board."
- From the fact "Selected as one of four engineers on the payments migration team, moving 2 million accounts to the new ledger over six months": "Moved 2 million accounts to the new ledger in six months, one of four engineers picked for the migration."
- A summary, not "Operations manager with experience in logistics, retail and warehousing." but "Operations manager who turns slow manual processes into systems teams run on. Cut order processing from 9 days to 2 across three warehouses and rebuilt returns for a 40-person team."`,
    letter: `Write the letter in their voice on a confident day: direct, specific and warm, in the first person.
- Lead each point with the outcome and its scale, then how they got it, then why it matters for this role.
- Use the strongest accurate verb for their part and the scope the facts support.
- Vary sentence length and openings; not every sentence starts with "I".
- Sound like someone who knows their work is good: no flattery of the company, no filler, no pleading, no "I believe I would be a great fit".`,
    outreach: `Lead with what changed because of them, in active, specific words; sure of what the record shows, never boastful.`,
  },
} as const;
export type Voice = keyof typeof VOICES;
export const DEFAULT_VOICE: Voice = "confident";
export const voiceLevel = v.union(v.literal("plain"), v.literal("confident"));

// The style a resume (base, direction, tailored, its new lines and line updates), a cover letter or an outreach
// message (and a follow-up) is written in at a voice.
export const resumeStyle = (voice: Voice = DEFAULT_VOICE) => `Voice: ${voice}.\n${VOICES[voice].resume}\n${DOCUMENT_HONESTY}`;
export const letterStyle = (voice: Voice = DEFAULT_VOICE) => `Voice: ${voice}.\n${VOICES[voice].letter}\n${DOCUMENT_HONESTY}`;
export const outreachStyle = (voice: Voice = DEFAULT_VOICE) => `${OUTREACH_STYLE}\nVoice: ${voice}. ${VOICES[voice].outreach}\n${DOCUMENT_HONESTY}`;

// Stories and interview prep: the version they'd say out loud.
export const STORY_STYLE = `Tell stories as Situation, Task, Action, Result, in the order someone would say them in an interview: a sentence or two of situation, what they were responsible for, what they did (the most detail goes here), and what came of it, with numbers. ${ESTIMATES}`;

// Insights and fit reads: conclusion first.
export const INSIGHT_STYLE = `Lead with the claim, then the evidence (pyramid principle): one plain sentence saying what is true of them, then the specific roles and facts behind it. The claim should be something worth putting on a resume. ${ESTIMATES}`;

// Outreach messages, follow-ups and answers to application questions.
export const OUTREACH_STYLE = `Keep outreach plain and specific: one real reason this person and this company fit, grounded in their record, and one clear ask. No flattery, no filler. ${ESTIMATES}`;

// What they asked a new version to change (Write again, Tailor again), appended to a document's request. Their note
// steers emphasis, order and wording; it never adds what the record doesn't hold.
export const guidanceOf = (note: string | undefined) =>
  note?.trim()
    ? `\n\nWhat they asked this version to change (follow it within every rule above; it never adds a claim, number, tool, title or scope the record doesn't hold, and anything it asks for that the record doesn't support is left out):\n"""${note.trim()}"""`
    : "";

// Skills and tools: one thing per item, skills in Title Case (skillNames.titleCaseSkill applies the casing on save).
export const SKILL_NAMES = `One thing per item: never join two skills or tools with "and", "&", "/" or a comma ("radio advertising and media buying" is two items, Radio Advertising and Media Buying; "Salesforce/HubSpot" is two), unless the joined phrase is itself the standard name of one thing (Mergers and Acquisitions, Research and Development, Profit and Loss or P&L, Sales and Operations Planning, A/B Testing). Write a skill in Title Case (Radio Advertising, Customer Onboarding, Contract Negotiation, Go-to-Market Strategy, Cross-Functional Leadership), with and, of, for, to, in, on, the, a, an and with lowercase inside a name; acronyms and brands keep their own casing (SEO, CRM, B2B, SaaS, iOS, JavaScript, HubSpot, Google Ads). Tools and certifications keep their official names.`;
