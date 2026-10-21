# Changelog

What changed in each version of CareerBot, newest first. The same notes are at https://careerbot.dev/changelog.

## 0.15.0 · 2026-10-21

Companies you like now searches as you type, for free, from your own companies and Wikidata, takes a pasted list of names or websites, and copies the list back out. Every company you like is added and used to find more like it, unless you turn that off.

### Better

- Companies you like are found free as you type or pasted as a list; each is added to your companies and used to find more like it unless you turn that off.

### If you host your own copy

**Read before updating.**

- After deploying, run `npx convex run discovery:foldLikes` once. Companies you like that were only added to your companies keep "find more like it" off, so their searches don't change; ones that were only used to find more like them are now added to your companies too.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.15.0

## 0.14.0 · 2026-10-20

Resumes get their own engaging voice with a Plain or Confident setting, Write again takes your guidance, and you can add any fact, reorder lines and keep pins across versions. Companies you like replaces seed and named companies, with Find by name.

### New

- Companies you like: find a company by name or website, then add it to your companies, find more like it, or both.
- A resume's Layout has a Voice, Plain or Confident, that also sets cover letters and outreach, with an example from your record.
- Add a line puts an approved fact a resume doesn't use under its role, as written or written for it; Details says how many facts it uses.
- Move a resume line up or down within its role from its menu, with Option and the arrow keys, or by dragging; the order carries into new versions.
- Built on a resume line shows the fact beside the line, and Rewrite this fact… asks for a new wording with your comment.
- Set how a role shows on resumes in Record > Roles: its own entry, folded into another role (with or without its lines), or left out.
- Write again, Tailor again and a cover letter's Write again take an optional note on what should change, kept in History with Use again.

### Better

- A resume's details show its line count and about how many pages it fills, and say when a version runs past the length you chose.
- Resumes and cover letters have their own confident voice, leading with what came of your work, and claim nothing the facts they cite don't.

### Fixed

- The Activity panel no longer runs off the top of the window when it holds a long list; its header stays in view and the list scrolls.
- Write again keeps your pinned and hidden resume lines even when it words them differently, and says what it kept.

### If you host your own copy

**Read before updating.**

- After deploying, run `npx convex run discovery:foldLikes` once to move existing seed and named companies into Companies you like.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.14.0

## 0.13.1 · 2026-10-19

Directions now propose 10 to 20 job titles, covering the many ways companies name the same work, and their criteria show the industries your goals add to every search. A clearer message when GitHub isn't set up on a self-hosted copy.

### Better

- A direction's industries show the ones your goals add to its search, and mark its own ones your goals don't name as from your record.
- Filling in a direction lists 10 to 20 titles, the names companies actually use for that work at your level.

### Fixed

- When GitHub isn't set up on a copy, Projects and Settings say so, and a self-hosted copy's owner gets a link to how to set it up.
- On a phone, Settings' GitHub row shows its button once instead of twice.

All releases: https://careerbot.dev/changelog#v0.13.1

## 0.13.0 · 2026-10-16

Companies can be sorted and archived, directions can be merged with Undo, and Getting started can use any model. Skills are one per item in Title Case.

### New

- Companies can be sorted, shows how far ranking has got, checks a range with Shift-click, and can archive companies out of every list until restored.

### Better

- Getting started can use any OpenRouter model, aliases included, not just the four recommended ones, each shown with its price per million tokens.
- Merging a direction carries over its titles, criteria, companies, roles, pursuits, resumes and notes at their better fit, and Undo puts it all back.
- Skills come one per item in Title Case (Radio Advertising, Media Buying), a combined one awaiting review is split, and a name you edited stays as written.

### If you host your own copy

**Read before updating.**

- Optional, once: run `npx convex run skills:titleCase` to put the skill names CareerBot already proposed in Title Case (names you edited are left alone); `npx convex run skills:titleCaseUndo` puts them back.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.13.0

## 0.12.2 · 2026-10-16

Find companies without Apollo using AI web search and job boards, or alongside it. Settings is now about your account, with search settings on Companies, plus Reset account, cancel and clear in Activity, and deleting a story with what came only from it.

### Fixed

- Release images build from Docker Hub's node image when CI is signed in there, as AWS's mirror now limits shared runners too.

All releases: https://careerbot.dev/changelog#v0.12.2

## 0.12.1 · 2026-10-16

Find companies without Apollo using AI web search and job boards, or alongside it. Settings is now about your account, with search settings on Companies, plus Reset account, cancel and clear in Activity, and deleting a story with what came only from it.

### Fixed

- Self-hosted copies pull Convex's images from ghcr.io/convex, where Convex moved them; the old address refuses downloads.

### If you host your own copy

**Read before updating.**

- Take the new compose.yaml before your next pull. A copy already running keeps working until its Convex images need pulling again.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.12.1

## 0.12.0 · 2026-10-16

Find companies without Apollo using AI web search and job boards, or alongside it. Settings is now about your account, with search settings on Companies, plus Reset account, cancel and clear in Activity, and deleting a story with what came only from it.

### New

- Cancel work in Activity (it stops after the step it's on, keeping what it finished), and clear finished items off the list, with Undo.
- Companies can be found without an Apollo key, by a web search for ones that fit each direction and ones hiring now, each with where it was seen.
- Reset your account in Settings, Your data to clear your workspace and start over, keeping your sign-in, settings, spending and, if you like, your keys.

### Better

- Settings is for your account: keys, Drive and GitHub are in Connections, search settings on Companies, reminders in Pursuits; direction seeds add to yours.
- Deleting a story asks whether what came only from it goes too, with counts, and keeps anything another story also backs.
- Search settings opens in a wider dialog on a computer, with each setting's choices beside it.

### Fixed

- Deleting a story now also deletes what you rejected that came only from it, with its reasons, so it no longer steers what CareerBot finds in your other stories.

All releases: https://careerbot.dev/changelog#v0.12.0

## 0.11.0 · 2026-10-15

Reading a story now covers the whole story, writes figures plainly, and gathers your skills, tools and certifications. Review's arrow keys decide, rejecting no longer asks why, directions fill themselves in when approved, and limits only clash when they truly conflict.

### New

- An approved direction with nothing filled in now fills itself in, with the cost shown before you approve, and Getting started shows each direction's state.

### Better

- Deciding the last of a story's items says it then reads insights and gathers your skills, with the cost; edits to approved facts no longer start either.
- Reject, Not for me and Remove now act at once everywhere, with Undo; "… with a note" in the ⋯ menu asks why first when you want to say.
- In Review the arrow keys decide (→ approve, ← reject, ↑ edit, ↓ reject with a note), S skips a card to the end, and Reject no longer asks why first.

### Fixed

- Limits clash only when both can't hold; Work and Companies never clash, and a clash names the other limit with Edit and Keep both.
- Models that always point at a family's newest model, like Claude Haiku Latest, now run, priced as the model they point at.
- Reading a story writes confident facts with your numbers as given, covers every part and tool, and gathers your skills, tools and certifications after review.
- In Brave on a computer, which has no speech recognition, Talk no longer fails after asking for the microphone; it points to dictation or another browser.

All releases: https://careerbot.dev/changelog#v0.11.0

## 0.10.1 · 2026-10-14

The release notes for 0.10.0 now describe careerbot.dev's own AI as coming once it's turned on. Until then you add your own OpenRouter key.

### Fixed

- The 0.10.0 notes now say careerbot.dev's own AI comes once it's turned on; until then you add your own OpenRouter key.

All releases: https://careerbot.dev/changelog#v0.10.1

## 0.10.0 · 2026-10-14

You can delete your account from Settings, sort Pursuits by when roles were posted, and careerbot.dev now lets people in by invite. CareerBot reads more job boards, and connecting GitHub or Google Drive only finishes for the account that started it.

### New

- Delete your account in Settings, Your data, by typing its name; your workspace, files, keys and Drive and GitHub connections go with it, then you're signed out.
- CareerBot now reads Eightfold boards and iCIMS career sites, and keeps more of what Workable, BambooHR, Rippling and JazzHR boards state about a role.
- On careerbot.dev you join with an invite link that says what's included, and Getting started fits in one sitting.
- careerbot.dev can now offer CareerBot's own AI within a monthly allowance, once it's turned on; Settings and Today say when it's used up and what you can do.
- Pursuits can list roles newest posted first, across every role that passes your filters, from Sort by on the list's menu.

### Better

- The Apollo key in Settings and the Apollo docs now say it's optional, used only for your own search, and that your use must follow Apollo's terms.
- CareerBot no longer reads SmartRecruiters or Teamtailor boards, because their published rules ask automated readers and AI to stay away.

### Fixed

- Connecting GitHub or Google Drive now finishes only in the account that started it, so nobody can send you a link that puts yours in their account.
- Importing an edited export file can no longer link your rows to rows from another account on the same copy.
- Filtering Pursuits by Posted within no longer makes the list start over again and again, and says so when no roles were posted in that time.
- Checking an OpenRouter or Brave key and loading the model list now need you to be signed in.
- The mouse wheel and trackpad scroll the page again with the pointer over an image, a row or a card, in the app and the docs.

All releases: https://careerbot.dev/changelog#v0.10.0

## 0.9.6 · 2026-10-14

Arrow keys now move through Review, next to J and K. Building the release images no longer depends on Docker Hub's anonymous download limit.

### Better

- In Review the arrow keys step through cards as J and K do; → or ↓ for the next, ← or ↑ for the previous, and ↓ or ↑ on a row opened from List.

### Fixed

- Building the images no longer fails when Docker Hub limits downloads, because the Node base image now comes from its official public mirror.

All releases: https://careerbot.dev/changelog#v0.9.6

## 0.9.5 · 2026-10-09

Checking roles now waits when other AI work holds the budget, runs one check at a time, and never throws away AI work you already paid for. Ranking roles again while a check runs no longer fails.

### Fixed

- A long link in an item's Details, like an open role's title on a company, is now cut short inside the column instead of running past the edge of the window.
- Ranking roles again for a direction while a roles check is running no longer fails; the roles are ranked again alongside the check.
- Checking roles near the end of your AI budget now keeps every role sort it paid for, instead of throwing some away when the budget turned one down.
- Ranking roles again while a roles check is paused for the budget now picks that check up again instead of running a second one beside it.
- Checking roles near the end of your AI budget no longer pauses while there's budget left; it waits for running AI work to finish, then carries on.

All releases: https://careerbot.dev/changelog#v0.9.5

## 0.9.4 · 2026-10-08

Checking roles is faster and no longer fails when many roles are saved at once. When your AI budget runs short, it now pauses with a plain reason and resumes when you raise it.

### Fixed

- Checking roles at many companies at once no longer fails with "Couldn't check roles" when the Reports counts are updated by several checks together.
- Checking roles reads job descriptions many times faster, because the workers that share the work no longer keep reaching for the same roles.
- Checking roles with too little AI budget left for its next step now pauses and says why in Activity, instead of staying on running.

All releases: https://careerbot.dev/changelog#v0.9.4

## 0.9.3 · 2026-10-08

The website now explains how CareerBot starts from your career, not your resume, and links to CareerBot on GitHub, X and LinkedIn. An open tab no longer keeps loading pages in the background.

### Better

- The website's footer links to CareerBot on GitHub, X and LinkedIn, and every footer links to the source on GitHub.
- The website now explains how CareerBot differs from tools that start from your resume, and Questions answers how it differs from a resume builder.

### Fixed

- In Pursuits, a role against your limits keeps its title and company in view; a long limit is cut short, its full words in a tooltip.
- An open CareerBot tab no longer keeps loading pages in the background.
- The website now says plainly that paid work waits for a budget and that your own copy runs from prebuilt Docker images.

All releases: https://careerbot.dev/changelog#v0.9.3

## 0.9.2 · 2026-10-07

The privacy docs now point to Settings, Your data for a copy of everything, and the home page no longer says the source is coming soon. The public export now checks personal details more strictly.

### Fixed

- The home page comparison no longer says the source is going public soon; it is on GitHub.
- The privacy docs now point to Settings, Your data for a copy of everything; deleting an account is still by email.

All releases: https://careerbot.dev/changelog#v0.9.2

## 0.9.1 · 2026-10-07

The source is now public on GitHub, and the open-source page links to it. An export now refuses up front when it would be too big for any copy to import.

### Better

- The public repository and release images now use the CareerBot organization.
- The Open source page links to the source on GitHub and the self-hosting guide, and the waitlist is now for the hosted version only.

### Fixed

- A workspace with more documents and pursuits than an import can open is now told so when it exports, instead of making an export no copy can import.

### If you host your own copy

**Read before updating.**

- Update compose.yaml to use `ghcr.io/careerbotdev/careerbot-web` and `ghcr.io/careerbotdev/careerbot-setup` before pulling the new release.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.9.1

## 0.9.0 · 2026-10-06

You can now export everything in your workspace as one file and import it into another copy, including careerbot.dev. Lists and their selection look cleaner, and a copy you run yourself can use any ports you choose.

### New

- Export your whole workspace from Settings, Your data, and import it into an empty workspace on another copy or careerbot.dev.

### Fixed

- The docs' link to a page's source opens it on the repository's master branch.
- A hovered row's actions no longer let its second line peek out, and while nothing is selected the bulk bar's actions say why they're off.

### If you host your own copy

**Read before updating.**

- CONVEX_PORT and CONVEX_SITE_PORT can now be changed while NEXT_PUBLIC_CONVEX_URL and CONVEX_SITE_ORIGIN are localhost addresses (set those to match). Before, another port there broke sign-in, and would leave an export or import waiting.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.9.0

## 0.8.1 · 2026-10-06

Update steps for copies you run yourself are now listed one per line, and Settings says Not checked yet until the first update check. The hosted version now only announces a release once its images are ready.

### Fixed

- A copy you run yourself hears of a new version only once its images can be pulled.
- The steps for a copy you run yourself show as one list in the release notes, without a second bullet before the first.
- The privacy page and docs now say the daily update check shows careerbot.dev your server's IP address, as any web request does.
- Settings, Updates says Not checked yet until a check has reached careerbot.dev, instead of Up to date.

All releases: https://careerbot.dev/changelog#v0.8.1

## 0.8.0 · 2026-10-06

You can now try CareerBot without an account in a read-only demo, and lists show checkboxes only when you choose to select. Copies you run yourself now update from ready-made images and tell you when a new version is out.

### New

- You can look around CareerBot without an account in a read-only demo at demo.careerbot.dev, with a made-up person's search already in it.
- On a copy you run yourself, Settings shows when a new version is out, with its notes and the steps to update.
- After an update, a note tells you the new version and opens what changed in it.

### Better

- A copy you run yourself now downloads ready-made images for each release instead of building on your server.
- Lists no longer show checkboxes as you move over them; choose Select in the list's menu, Shift-click or long-press to pick several.
- The demo says plainly that it reads no job boards and holds no keys, and its dates stay as of the day it was made.
- The docs show screenshots of the app, in light or dark to match your theme.

### Fixed

- The open-source page now says an Apollo key is optional, as it always was.
- The Built on card on a resume line stays under its chip when you move your pointer into it.
- A career break now opens beside your roles like a role does, and its long text no longer spills out of the list.
- Role details now say No clearance needed instead of None clearance.
- Pane widths you set by dragging now stay the same on every screen and after a reload.
- In the docs, a step written on one line no longer puts each bold word and key on a row of its own.

### If you host your own copy

**Read before updating.**

- Back up first ([Backups](https://careerbot.dev/docs/self-hosting/updates#backups)).
- Docker Compose: in the folder you cloned, `git pull`, then `docker compose pull && docker compose up -d` (no more `--build`). To stay on one release from now on, set it in `.env`, such as `CAREERBOT_VERSION=0.8.0`.
- Coolify and Dokploy: deploy again. Nothing is built on the server any more. Later updates: change `CAREERBOT_VERSION` to the new version and deploy again ([Updating](https://careerbot.dev/docs/self-hosting/updates#updating)).
- The images Docker Compose built for earlier versions aren't used any more. They're named after your folder: `docker image rm careerbot-web careerbot-convex-setup` removes them for a folder called `careerbot`.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.8.0

## 0.7.0 · 2026-10-05

A pursuit now takes one of two paths, or both: apply through the posting, or write to the hiring manager, the team or a recruiter. CareerBot finds the people, drafts the message, reminds you to follow up and shows which path brings replies.

### New

- Choose a path for each pursuit: Apply through the posting, Outreach to the people who hire, or both.
- Find contacts in three groups (hiring manager, team and recruiting), move someone to another group, and add a person you already know at the company.
- Write an outreach message in four parts: who you are, why this role, why you fit, and one small ask that suits the person.
- Start outreach at a company that has no open role.
- Mark a reply on a contact, and the pursuit moves to In conversation.
- When an outreach message gets no reply for a week, CareerBot asks you to follow up, then to write to the next contact.
- Outcomes shows replies, interviews and offers by path, and replies by group.
- A pursuit's Role tab shows the role as it was when you started.
- Getting started walks you through your first pursuit on either path.
- Docs at /docs, in every copy, for its own version.

### Better

- Firm limits on pay, seniority, travel, schedule and past employers set roles apart, with the reason.
- Time away from work is offered as a career break, and numbers you only guessed at stay estimates in resumes and letters.
- Resumes, cover letters and other writing fail less often.
- Pursuits fit a phone's screen down to 320 pixels wide.

### Fixed

- With 10 or more pursuits, the Pursuits list no longer runs past the edge at half width.

### If you host your own copy

**Read before updating.**

- Docker Compose now publishes its ports on this machine only (`127.0.0.1`). If you reached CareerBot or Convex from another machine without a proxy, set `BIND_ADDRESS=0.0.0.0` in `.env`.

How to update: https://careerbot.dev/docs/self-hosting/updates#updating

All releases: https://careerbot.dev/changelog#v0.7.0
