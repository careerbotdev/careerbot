# Changelog

What changed in each version of CareerBot, newest first. The same notes are at https://careerbot.dev/changelog.

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
