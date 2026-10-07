# CareerBot

*Product vision · rewritten 2026-09-22*

CareerBot helps a person rebuild their career story from scratch, see what it adds up to, point it at the roles they actually want, and go after those roles with materials they can stand behind.

---

## Why it exists

Resumes drift. Every job change bends the description of what you did toward the posting in front of you, and ten years in, the document is a stack of those bends. It stops sounding like you. More often than not it also undersells you: most people describe their work more modestly than it deserves, use their old employer's titles instead of the market's, and leave out the connections that make them interesting.

CareerBot exists to **reset, remember, record and reimagine**. You start over from your own account of what happened, employer by employer and project by project, in your own words, not from the old resume. CareerBot turns that account into a record of your career, connects dots you hadn't connected, and writes you up in the strongest terms your story supports.

**Reimagine** is the other half. Plenty of people have spent years in one kind of role and want to see where else their skills apply. Someone who has spent a decade teaching middle school science, and built half the department's curriculum along the way, might want a seat in instructional design. CareerBot treats that as a first-class job. It proposes directions, including ones outside your history, shows which experiences carry over and how to frame them, finds companies where the move makes sense, and builds a resume that reads as if you had been heading there all along.

## The idea

You tell it your story. It builds a record of what you've done and what that adds up to. You tell it where you want to go, or ask it where you could go. It finds companies worth wanting, watches their openings, and tells you which roles deserve your time and why. Everything it writes about you is something you can speak to in an interview, because it comes from something real.

That is the shared core: understand yourself professionally, put it into words, make materials you can use, and find the companies you want. From there, two paths go after a role, with equal weight:

- **Apply** through the posting, with a resume, cover letter and answers written for that role. This works for many people, and CareerBot makes each application as strong as your record allows.
- **Outreach** to the people who hire: the hiring manager, people on the team, or the company's recruiters. A short message says who you are, why this role and why you fit, and makes one small ask. It works for a company with no open role too.

You can take either path, or both for the same role. CareerBot has an opinion here: most candidates are far too passive. They apply and wait. CareerBot encourages you to get a foot in the door on your own terms, so outreach is never an extra or an afterthought. Either way, CareerBot never sends anything. You send every application and every message yourself.

## Principles

**1. Every line has a root.** Everything CareerBot puts on a resume, cover letter or outreach note links back to something you said or did. The link isn't a leash. It's what makes boldness safe. Because every line has a real root, CareerBot is free to:

- claim full ownership of the work you drove, instead of hiding behind "helped" and "supported";
- translate your titles into what the market calls the work you actually did;
- frame your experience in the vocabulary of the role you want, even if you've never held that title;
- join things you did in different places into a bigger claim: "together, these mean you did this."

The one thing it won't do is invent: a customer, a result or a skill with nothing behind it. The test isn't "did you say these exact words." It's "can you talk about this, because it happened."

CareerBot works the way a great career coach does. Most people undersell themselves, so it pushes them up instead of holding them back, and it never hedges on their behalf. Its job is to present you as the strongest possible fit for the role you want. What you submit is your call, and so is how you explain it to an employer. You can always see where any line came from, which also makes good interview prep.

**2. Companies before jobs.** Attention and money go to companies the person is excited about. Broad job feeds are useful for discovering companies. The roles worth reviewing come from watching the companies that matter.

**3. Your goals, in your words.** A single goals narrative says what you want next: the work, the kinds of companies that excite you, what you want to avoid, and practical limits like location, pay and travel. Directions, company discovery and role ranking all work from it, so there's no preferences form to fill in. CareerBot pulls out the hard limits, such as a pay floor or where you'll work, as clear values and shows them back to you so you can check and correct them directly. When your company ratings start disagreeing with what you wrote, CareerBot points out the gap and suggests how you might update your goals.

**4. It proposes, you decide.** CareerBot does the heavy lifting and makes strong suggestions. But nothing enters your record or goes out under your name without your say-so. Spending runs on budgets you set, not on approvals for every step.

**5. It grows with you.** A career record is never finished. You'll remember more about past roles, start new ones, and change your mind about what you want. You can add a narrative or revise one at any time. CareerBot works out what changed and proposes it as new facts, updates to the ones you've already approved, or fresh insights, without making you start over. When your goals narrative changes, CareerBot proposes matching changes to your directions, and company discovery and role rankings shift too.
## What it feels like

*Morning, on a phone.* Overnight, a few new roles appeared at companies you've marked as targets, and CareerBot thinks two of them are worth a look. A dozen new companies are waiting for a quick rating. Each card shows what the company builds, how it's growing, and a one-line reason it might suit you. You flick through them with your thumb, and two minutes later you have two new targets.

*At a desk.* You open the best role. The job description comes first, followed by a plain-language read on how well it fits each of your directions, what's interesting about the company, and who you'd want to talk to there. You decide to pursue it. Within a couple of minutes a tailored resume and cover letter appear, section by section, framed in this posting's language. Any line will show you what it's built on. An honest map shows which requirements you cover strongly and where you're thin. You apply through the posting, then reveal the hiring manager's email and send a short outreach message from your own inbox.

*Evening.* You remember a detail about an old project and add it to that narrative. CareerBot proposes an update to one of your facts and shows it next to the current version. You accept it, and CareerBot flags the two resume lines that relied on it so you can update just those. Nothing gets rewritten behind your back.

## Who it's for

- **The searcher.** A mid-to-senior professional running a deliberate search toward one or more directions. Uses it daily: the phone for quick reviews, the desktop for pursuit work.
- **The self-hoster.** CareerBot is open source, and anyone can run their own instance for free, bringing their own OpenRouter and Apollo keys. A public website at careerbot.dev introduces CareerBot and helps people get their own copy running.
- **The hosted user.** Someone who signs up at careerbot.dev and pays instead of running anything, with usage capped so costs stay bounded. Whether CareerBot provides the inference, they bring their own key, or both, is a pricing decision still to be made. The hosted version comes after the open-source release; its pricing is decided earlier.

One deployment serves many workspaces. Each workspace is one person's search, with its own data, usage and budgets.

A person's narratives and record are used only to support that person's own career work. A workspace can be exported or deleted entirely.

It isn't for recruiters, teams or marketplaces. There are no public profiles and no candidate database.

## How it works

These are the main flows as the user experiences them. Apart from the shared review pattern described first, how they're laid out on screen is up to the builder.

### One fast way to review everything
Much of CareerBot is you responding to a stream of proposals: facts and insights, candidate companies, new roles. All of them use the same card-based review, so once you've learned it in one place you know it everywhere. You see one item at a time with the essentials visible at a glance, and every move has a keyboard shortcut: approve, reject, edit, skip, go back and undo. The same moves work with a thumb on a phone. The specific actions fit the item (rating a company isn't the same as approving a fact), but moving through the stack, going back and undoing always work the same way. A stack of twenty should take a couple of minutes.

Roles get their quick first pass on cards too: pursue, save or pass, based on a summary. When you want to read the whole posting and think it over, it opens on its own page.

### Tell your story
You write or dictate narratives, one per employer or project, plus the goals narrative. Rough is fine: out of order, repetitive, half-remembered, full of asides. Any order is fine too: first job forward, most recent job back, or jumping around. CareerBot understands each narrative as a whole and connects it to everything else it knows about you. Its picture of you fills out with each one, and your goals are always read against your whole career as it stands.

Starting from scratch should feel like having help, not like homework. If you want the help, CareerBot can ask follow-up questions where an answer would really improve your record: "You said you rebuilt onboarding. What was broken before, and what changed after?" Follow-ups are opt-in, and you can turn them on for any narrative. They never interrupt you. They wait together in one place, so you can work through them whenever you like, answer the ones worth answering, and skip the rest.

Each career narrative yields two things, and both come to you as cards to review:

- **The structured record.** Employer, title, location, dates, team, projects, tools and skills, captured the same way for every role no matter how loosely you told it. Mention your start and end dates in passing, and they become proper employment dates.
- **Career facts.** Short, clear statements about what you did in a role: what you owned, what you did, how big it was and what came of it. A fact is CareerBot's understanding of your account, not a quote from it. One fact might combine things you mentioned minutes apart, in different words, into a single line. Everything else you said, such as a customer's size or the state the team was in, is context. It helps CareerBot write sharper facts but doesn't become a fact itself.

Your goals narrative yields what you want: the directions you're drawn to, plus your hard limits as clear values you can check and correct.

When two accounts disagree, such as different dates for the same job, CareerBot asks you instead of picking one.

### See what it adds up to
You review what CareerBot found, one card at a time. Every proposal can go several ways, and you pick whichever is quickest in the moment:

- **Approve** it as it stands.
- **Edit** it yourself.
- **Add context** ("it was a team of three and I led it") and let CareerBot rework it.
- **Ask for a rewrite**, with or without direction ("lead with the revenue impact").
- **Reject** it, or **skip** it for later.

A rework or rewrite comes back as a new suggestion for you to accept. It never replaces the card silently.

Facts are about one part of your story. **Insights** are about you. CareerBot reads across your whole record the way a good career editor would, connects dots across roles and companies, and proposes insights: things that are true of you but that you may never have put into words. Say you moved a hospital unit, a clinic and a school district onto new scheduling systems. The insight is that you're someone who runs system rollouts across very different organisations, and that belongs on a resume. Or say you cut new-hire turnover in two different jobs by rebuilding how people were trained. That's a retention story, not a training story.

Insights build on the facts you've approved, so they sharpen as your record grows. You don't need to finish your whole history first. Four jobs in, CareerBot is already connecting threads across those four. When you finish reviewing a new or revised narrative, it takes a fresh look across everything and queues anything genuinely new. It doesn't interrupt you, and it never brings back an insight you've rejected. You can also ask for a fresh look at any time. You review insights on the same cards with the same options, and they often supply a resume's strongest lines. Over time, related facts and insights group into **stories**, the arcs that resumes are built from.

### A resume at every level
As soon as your story is in, CareerBot writes you a **base resume** from your record. Each direction then gets its own **direction resume**, and each role you pursue gets a **tailored resume**. All three are views of one record, each narrower than the last, so fixing a fact fixes all of them. Every level is also a checkpoint. Reading it tells you whether CareerBot has understood you, can position you, and can aim you at a specific job, so you can move forward with confidence or fix what's off first.

### Say where you want to go
From your goals narrative, your record and your insights, CareerBot proposes **directions**. Each has a positioning, target titles, and the vocabulary that part of the market uses. Some directions continue your current path. Some are adjacent moves that reuse most of your record. Some are stretches you've said you want to try. For each one, CareerBot shows which stories carry over, which need reframing, and how your past titles translate. You shape the directions, keep the ones you want, and can ask for more. Each direction gets its own resume, built from whichever stories serve it best. Two directions can read like two different people, and both are true. Each direction also becomes the search criteria CareerBot uses to find companies and roles for it.

### Find companies worth wanting
CareerBot casts a wide net for companies that match your goals narrative and directions. It's better to surface too many good candidates than to miss the right one. It searches with Apollo and also picks up companies that appear in job feeds or that you add yourself. It filters out staffing agencies, job boards and other non-employers. For the rest it fills in what they build, their size, growth, funding and tech, then shows them to you for a quick rating. Companies you're excited about become **targets**, and every rating teaches CareerBot more about what you're looking for.

### Watch targets and rank roles
CareerBot checks each target's openings on a regular schedule. The aim is every open role at that company, without the duplicates and junk that job data is full of. Where it can, it reads the company's own job board, and it falls back to Apollo where it can't. Outside data has gaps, and CareerBot is open about them. You can see how complete and how recent the coverage is for each target, a role without a full description is clearly marked, and you can paste in a posting or fix details yourself.

Each role is ranked, for each direction, by how much of your time it deserves, with a short reason in plain language. The ranking isn't a prediction of whether you'll be hired. Gaps in your background are something to handle in tailoring, not a reason to skip a role you'd love. When a posting is too thin to judge, CareerBot says "read this one yourself" rather than faking confidence. A daily queue gathers what's new, what's worth a look and what needs a follow-up.

### Pursue
A pursuit is one role you've decided to go after, or a company you want to write to when it has no open role. Marking a role Interested only keeps it in mind; you press Start on a role when you mean to go after it. Pursuits are the main screen, and finding roles is part of it: one screen that works like an inbox. On the left is the list, with a Status filter (all ranked roles, the ones you marked Interested, the pursuits under way, the ones that closed) and the role filters; each row shows the role, its company, its score and its status or next step. Clicking a row opens that role in the panel beside the list, the main view, where its header always shows the role and what to do next: Start, or once started, the pursuit's status. A role and its pursuit are one thing in one place: once you start, everything about going after it appears in the same panel, under the role. On a phone the list comes first and a role opens full screen.

A pursuit holds the role, its company and direction, the path you chose, the tailored resume and cover letter, answers to application questions, contacts and outreach messages, follow-ups, notes and a dated timeline. You set its status yourself: Preparing, then Contacted or Applied, In conversation, Interviewing, Offer, or Closed with a reason (rejected, withdrawn, no response, declined). Contacted and Applied are one step, and a pursuit can be both, each with its own date. You apply yourself, through the posting; marking a pursuit Applied keeps the exact resume and cover letter you sent. An outreach message you mark sent makes it Contacted.

- **The package.** A resume tailored to the posting, starting from that direction's resume, with how well you cover each requirement; a cover letter; answers as needed.
- **Ask about this role.** A chat kept with the pursuit, grounded in your approved record, the role, its company and your tailored resume. Paste an application question and get an answer you can use. It never claims what your record doesn't support; answers you keep are saved to the pursuit, and anything new it learns about you comes back as a fact to review.
- **Two paths.** Each pursuit takes Apply, Outreach or both, and the choice only changes the next steps CareerBot suggests. For outreach it finds people at the company in three groups, each as good a way in as the others: the hiring manager, people on the team, and recruiting. You can add someone by hand too. You choose whose email to reveal, and it drafts an outreach message grounded in your record: who you are, why this role, why you fit, with facts you approved, and one small ask that suits the person. You send it from your own email, with your resume as a PDF if you like. It's a few thoughtful messages, not a blast: CareerBot suggests one person at a time, up to three a pursuit, and never the same message to two people.
- **Follow-ups and the next contact.** When an outreach message has had no reply for a week, CareerBot suggests a follow-up to that person, drafted from what you sent. A week after the follow-up it suggests the next contact, in group order. After three people it suggests applying or closing the pursuit. A reply you mark moves the pursuit to In conversation and stops the reminders.
- **Outreach with no open role.** You can start a pursuit at a company you want even when it has no opening for you. It uses your direction's resume and has the people, the outreach message and notes, without tailoring or a cover letter.
- **Reminders.** Inside the app, each one switchable: follow up when an application or outreach has gone quiet, prepare before an interview, and a check on pursuits that have stalled.
- **Outcomes.** What happened with each pursuit is kept, including which path got replies, so ranking and resume choices can learn from it later. Nothing changes on its own.

Exports to PDF and Word are clean and consistent. You mark replies yourself; reading your email for them may come later.

### Keep it current
Narratives are living documents. Come back whenever you remember something, start a new job, or want something different. There are two ways to add to your story:

- **Edit the narrative it belongs to.** If you remember more about a past job, add it to that job's narrative or correct what's there. Goals work the same way: there's one goals narrative, and you keep editing it as your goals change.
- **Or add a new one.** A new job gets its own narrative. A quick note like "one more thing about Acme" works too, and CareerBot links it to the right role.

Either way, CareerBot compares the change with what it already knows and proposes only the difference: new facts, updates to existing ones, and anything that no longer holds. Each arrives as a card like everything else, with the current version beside the proposed update. Approved items aren't proposed again, and nothing approved changes without your okay. If you delete a passage, CareerBot flags the facts that came from it for you to decide on rather than removing them, since you may have moved the passage somewhere else. Every narrative keeps its history, so you can see what changed and go back to an earlier version.

Updates spread from there. A change to your goals leads CareerBot to suggest changes to your directions, and company discovery and role rankings adjust to match. When an approved fact changes, CareerBot finds the lines in your documents that relied on it and offers to update just those. Reordering or hiding things in a document never triggers a rewrite.

### Stay within budget
CareerBot spends money in two places: AI through OpenRouter, and company and people data through Apollo. You set the limits, and the product works inside them without asking permission for each step.

- **AI.** A monthly dollar budget. When it's reached, CareerBot tells you. You can wait for it to reset or raise it, and the paused work picks up where it left off.
- **Automated Apollo work.** A separate monthly credit budget for finding companies, filling in their details and checking for new roles. It works the same way when it's reached. Apollo credits are limited and costly, so you can also pause automated Apollo work altogether or set it to run only when you ask.
- **People.** Revealing someone's email is always a choice you make for a specific person, because it's easy to burn credits on people you'd never contact. CareerBot shows a running count, reveals email only unless you ask for a phone number too, and never spends credits on people automatically.

## What good looks like

- You read your resume and think "that's me on a good day," and you can talk to every line.
- The company search casts a wide net. The companies you'd have named yourself show up, along with plenty you wouldn't have thought of, and staffing agencies and job boards are filtered out.
- Nearly every open role at a target shows up, very little that doesn't belong gets in, and you can see how complete and current the coverage is.
- A stack of twenty cards, whether facts, companies or roles, takes a couple of minutes without reaching for the mouse.
- Coming back months later to add a new job or change direction is as easy as the first time.
- A tailored package takes a couple of minutes, not an afternoon.
- An outreach message takes minutes and reads as if you wrote it to that one person.
- A new user gets from sign-up to a first resume in one sitting.
- Spending stays inside the budgets you set, and hitting a limit pauses work instead of breaking it.

## Judging quality

Quality is judged on workspaces whose only inputs are narratives written directly into CareerBot. Nothing is imported. Everything else is produced fresh by the product, so its quality can be judged honestly. The fictional people in `testdata/personas/` make the same test repeatable for anyone.

## Using this document

CareerBot is described in two documents. This PRD says what the product is and why, and it governs. The companion, BUILD.md, holds the standing rules for building it (stack, domains, system principles, brand and design process). Plans, decisions and open questions live in GitHub issues.

This PRD deliberately leaves out screens, buttons and schemas. Those are decided during development. If a decision changes the product itself, update this document too so the two don't drift apart.
