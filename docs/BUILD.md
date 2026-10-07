# How we build CareerBot

*Companion to the CareerBot PRD · 2026-09-22*

The PRD says what CareerBot is and why. This document holds the **standing rules** for building it: the stack, where it lives, how the system should behave, and how design happens. These hold until the maintainers change them.

Plans, milestones, decisions and open questions live in GitHub issues.

---

## Standing rules

The system should be as easy to understand as the product. A technically minded product person should be able to read this, open the codebase, and follow what's going on.

### The stack

| Piece | What it does for CareerBot |
|---|---|
| **Convex** | The database, with live data pushed to the app. Also runs background jobs and schedules, stores files, and handles sign-in. |
| **Next.js** | The web app. |
| **Cloudflare** | Hosts the web app. |
| **OpenRouter** | All AI calls go through it, and models can be swapped without code changes. Each workspace has its own key and chooses its own models, per task, from OpenRouter's current list. Self-hosters bring their own key; a hosted workspace may instead get a key CareerBot issues for it, with its own spending cap (M9). |
| **Apollo** | Company search and details, job postings, people search, and email reveal. Each workspace uses its own Apollo key. Serving Apollo data to hosted users on CareerBot's account likely needs a separate agreement with Apollo; that waits on Apollo's written answer (M9). |
| **A secret store** | The platform's own keys, tokens and credentials in every environment. Nothing secret lives in the repo; a self-hosted copy keeps its own in an env file that stays out of git (`scripts/with-secrets.sh`, `scripts/sync-convex-env.sh env`). |

**Where it lives.** **careerbot.dev** is the public website for self-hosters, with the docs and a [demo](https://demo.careerbot.dev); **dev.careerbot.dev** runs what's on `master`. A paid hosted version follows (M9). Billing and operator admin aren't built yet; keep new work compatible with them (workspace-scoped data, per-workspace keys, budgets and usage) without building billing.

Company job boards (Greenhouse, Lever, Ashby and the like) are the best source for role descriptions. They're public, complete and free.

**Jev**, TypeSafe's decision model (also available through OpenRouter), fits places where the product makes many small, well-defined judgments, such as ranking hundreds of roles or rating company fit. Use it where it's clearly cheaper or better than a general model. Don't route everything through it.

### System principles

- **Legible.** Plain names, few moving parts, and one obvious place for each kind of logic. Any AI output can explain what it was based on. If something is hard to explain, it's probably too complicated.
- **Let the AI do what it's good at.** Give models rich context and a clear sense of what good looks like, then trust them. Don't pile rules, pattern-matching and mechanical checks on top to force a single "correct" answer. Results will vary somewhat from run to run, and that's fine: much of this work is judgment, not arithmetic. Quality is judged by looking at real output from real narratives and real job data. Automated tests belong on the plumbing (data, permissions, background jobs), not on the exact words a model chose.
- **Expect the data to change.** What needs to be stored will keep shifting as real narratives and job data come through, like two versions of the same fact or a company that posts jobs in three places. Keep the data model easy to change: it has to tolerate change, not wait for change to stop. Don't build polished interface on it until the main flows work end to end on real examples.
- **Spend AI where a person reads the result.** Resumes, letters and insights get the best models. Sorting and ranking should be cheap and cached, so the same question is never paid for twice.
- **Make Apollo credits go far.** Search wide, but fill in details only for companies that look promising. Read companies' own job boards before asking Apollo for postings. Finding people is free; revealing them isn't, so that only happens when the user picks someone.
- **Multi-tenant from day one.** All data belongs to a workspace. Each workspace has its own keys and budgets, sees its own usage, and can be exported or deleted entirely.
- **Private by default.** A person's narratives and record are used only to support that person's own career work.

### Goals are explicit

- **Only what a person says to avoid is excluded.** An avoid list, a firm limit, or past employers. Nothing is excluded because it wasn't mentioned.
- **A wanted list seeds, it doesn't cap.** Wanted industries, company types or titles tell CareerBot where to look first and what to rank higher. CareerBot may add related ones by its own judgment, marked as its suggestion, so a person who isn't sure where they fit isn't boxed in.
- **Every rule that filters or ranks is a visible, switchable setting.** The settings name what they do; the full explanation (hard exclusions, how industries steer, whether AI judges companies against the goals and whether that ranks or hides) lives in the documentation, not in page text. No goal is applied in one step and silently skipped in another.
- **AI judgment on soft qualities is a signal, not a verdict.** Things no data source can filter (a mission worth bragging about, engineering credibility) are judged by AI with a reason, off, ranking, or hiding into a restorable section as the person chooses. The person's own ratings are the final say.

### System map

`docs/architecture/` is a [LikeC4](https://likec4.dev) model of CareerBot: every screen, AI step, service and table, what each reads and writes, and how each AI input is filtered (`#approvedOnly`, `#unreviewedInput`, `#rawNarrative`, `#rejectedAsGuard`). It's the reference for the maintainers, for UI design and for docs. `pnpm arch` opens it; `pnpm arch:check` runs in CI.

- **Same change, same commit.** A change that adds, removes or rewires a Convex function, table, screen or AI step updates the map in the same commit. CI fails when a function, HTTP route or table is missing from the map, or the map names one that's gone. Functions are found by their type (the TypeScript checker) before deploy, and by Convex's own `function-spec` after deploy, never by scanning text.
- **Say what an AI step reads.** A new or changed AI input gets a relationship with its filter tag and, where it matters, a description. CI can't check this part; review does. An input that isn't approved-only is a decision, noted as one.
- **Import rules** (`.dependency-cruiser.cjs`): screens and parts import only Convex's generated API and the shared pure modules; parts never import screens or Convex; no import cycles.

### Docs

The docs at `/docs` are MDX pages in `content/docs`, built with the site (Fumadocs, `src/app/docs`); every self-hosted copy carries the docs for its own version. Their reference parts (screens and addresses, AI steps and what each reads, actions, old addresses, shortcuts, settings) are generated from the system map and the code into `src/app/docs/reference.json`.

- **Same change, same commit.** A change to a screen updates its doc page (the page whose `screen:` names it, under `content/docs/using`) in the same commit, and so does a change to setup, an AI step or a setting the docs describe.
- **Regenerate when the map changes.** A change to `docs/architecture/model.c4` (or to an action's explainer, the old addresses in `next.config.ts`, the G shortcuts or `.env.example`) runs `pnpm docs:gen` and commits the new `reference.json`.
- **Screenshots come from the stories.** A page shows a screen with `<Shot id alt />`; the pictures (`public/docs-shots/<id>-light.webp` and `-dark.webp`, the reader's theme picks one) are shot from the built Storybook with the fictional persona by `pnpm docs:shots` (`scripts/docs-shots.ts`, after `pnpm storybook:build`), never by hand, and their sizes and stories are kept in `src/app/docs/shots.json`. A change to a screen a page shows reruns `pnpm docs:shots` and commits the new pictures. It needs only Playwright.
- **The docs check** (`scripts/docs-check.ts`, part of `pnpm lint`) fails on a stale `reference.json`; a screen, AI step or input with no plain words in `scripts/docs-words.ts`; internal names in a page; a page without a title, description or `sources:` (the repo paths it's true to, each of which must exist); a page missing from its folder's `meta.json`; bold words that aren't the app's own; links to docs pages or app paths that don't exist; and a screenshot that's missing, has no real alt text, whose story is gone, or that no page shows.

### Test personas

`testdata/personas/` holds a few fictional people with very different careers, each with role stories written the way people really talk, a goals narrative, limits, projects, target companies, job postings and an `answer-key.json` (facts that should come out, the contradiction the conflict check should catch, claims that must not be inflated, numbers they only guessed at that must stay estimates, directions that fit and don't, limits that should set roles apart). `pnpm personas:run <slug>` seeds one into a fresh workspace on a backend on your own machine (`npx convex dev --local`, or self-hosted at localhost; cloud deployments are refused unless a dedicated test deployment is named with `--allow-deployment <name>`, reached with its own `CONVEX_DEPLOY_KEY`), runs the real AI steps with `OPENROUTER_API_KEY` under a hard budget (`--budget`, default $3), and writes a scored report to the persona's `runs/` folder, which isn't committed. Projects are read from their README with the same project read a GitHub repository gets. Discovery spends Apollo credits and runs only with `--discovery`. It judges output against what a person said, not exact words, and lists what needs a human eye.

The demo workspace is one of these runs, frozen: `testdata/demo/renata-alvarez.json` is a snapshot of Renata Alvarez's run, carried on through the app's own functions (an Outreach pursuit, people added by hand, an outreach message written by the real AI step, her own monthly budget), so the demo never needs the test deployment again. `pnpm demo prepare` makes that working copy, `pnpm demo export` writes the snapshot (every table with a workspaceId is copied or left out on purpose in `scripts/demo.ts`; keys, Drive and GitHub connections and unfinished jobs are left out), and `pnpm demo seed --allow-deployment <name>` replaces a deployment's demo workspace with it, every row with a new id (`--check` compares the counts). The seeded demo is held at the moment of its snapshot (`workspaces.asOf`): what's new, due, recent or this month's is counted from then, on the server (`clockOf`) and in the app (`src/app/clock.ts`), so it reads the same whatever day it's opened. Where the app would show a live source the demo doesn't have (job boards read, a company's website, keys), it says so or leaves that part out. Each step refuses any deployment not named with `--allow-deployment` and reached with its own `CONVEX_DEPLOY_KEY`. Every persona's target companies and postings are made up too, with `.example` domains. The demo at demo.careerbot.dev runs on its own Convex deployment (only its sign-in keys, `SITE_URL` and `CAREERBOT_MODE=demo` in its settings) and its own Worker (wrangler env `demo`); `scripts/as-demo.sh` points a deploy step at it. careerbot.dev links to it only when its build has `DEMO_URL`.

### Left to the builder

Screens, navigation, components, data schemas, prompts, and how the AI steps fit together are decided by whoever builds each piece, when they build it, and explained in the pull request that brings them. Screens and components follow the design rules below.

### Releases

A release is a version tag (`v0.8.0`), and its version comes from the changes in it, not from a guess.

- **Every releasable change adds a change file**, `.changes/<slug>.yaml`, in the same commit: `bump` (`patch`, `minor` or `breaking`), `kind` (`new`, `better` or `fixed`), `note` (one plain sentence for a person: what they can now do, or what's fixed; no code, commits or issue numbers), `selfHost` (`null`, or the steps someone who runs their own copy has to take), and optionally `shot` (a docs screenshot id). Releasable means `src/`, `convex/`, `compose.yaml`, `Dockerfile`, `docker/`, `.env.example` and package.json's `dependencies`; tests, stories, docs and scripts aren't.
- **The version is computed.** The largest bump wins: before 1.0, `breaking` and `minor` raise the middle number and `patch` the last; from 1.0, `breaking` raises the first. `pnpm release:version` prints the next version and the change files behind it.
- **The check** (`pnpm changes:check`, part of `pnpm lint`) fails when a branch changes releasable paths since the last release (or since it left master, when that's later; on a pull request, since its base) without adding a change file, when the system map gains a screen, table or function but every change file says `patch`, and when `.env.example` or `compose.yaml` changes but no change file has `selfHost` steps. `reviewed: true` in a change file says a person looked and the bump or the missing steps are right.
- **To release:** the maintainer runs `pnpm release:prepare --summary "Two plain sentences on what the release brings."`, which consumes the change files: it bumps package.json's version, adds the release to `src/app/changelog/releases.json` (the source of /changelog and careerbot.dev/releases.json) and `CHANGELOG.md`, sets compose.yaml's image versions, deletes the change files and commits "Release vX.Y.Z". The update that carries it here is tagged with the same version. CI refuses a tag that isn't the version package.json, both of compose.yaml's images and the newest release in releases.json and CHANGELOG.md all name (`scripts/release.ts check-consistency`).

### Design

**Character.** Compact, calm and tool-like, in the spirit of Linear, Drizzle Studio and Apple Notes: dense enough to work in all day, using the full width of the screen with several panes where the work needs them. Fully responsive: each screen is designed for large, medium and small screens alike, so it's naturally usable on a phone and at every size in between. Content comes first and the interface stays out of the way. No marketing styling inside the product, no mascots, no confetti. The public website can be more expressive, but it uses the same brand and palette.

**Brand.** The CareerBot logo, both the mark and the wordmark, is already designed and ready to use. Add it to the repo and to Paper once, and use it as provided rather than redrawing or restyling it.

**Palette.** An instrument panel: near-black ink, white paper, one amber light for actions, and green and burnt orange lights for outcomes. Seven core colors do almost all the work, each with one meaning.

| Color | Hex | Role |
|---|---|---|
| Ink | `#15171A` | Text in light mode; background in dark mode |
| Paper | `#FFFFFF` | Background in light mode; text in dark mode |
| Amber | `#FFBA08` | **Primary.** Actions only: the main action on a view |
| Green | `#4F7F52` | Good outcomes only: strong fit, approved, done |
| Burnt orange | `#BF5700` | Caution: some fit, worth a second look |
| Red | `#D2462F` | Problems: errors, out-of-date lines, anything against a limit or destructive |
| Steel | `#6E8FA8` | Structure and information: selected, in progress, current |

Light mode is ink on paper, and dark mode flips it to paper on ink. Low scores and weak fits get no color, just muted grey, and a color never stands alone: a score always shows its number. A set of category colors for telling groups apart is defined in DESIGN.md but reserved until a screen needs it.

Tints, shades and tones of these seven are fine to use. Greys for borders and secondary text come from blending ink into paper, and lighter or darker versions of the core colors cover hovers, subtle backgrounds, dark mode and similar states. A new supporting color is defined in DESIGN.md first, fits the palette, and gets one meaning.

Every color, core or supporting, has to meet the same contrast bar (WCAG AA) when used for text. Amber is only ever a background with ink text on top, never text on paper. Steel is never text; it's a border, a fill with ink text, or a tint behind selected items. Green and burnt orange take paper text as fills, and their lighter dark-mode versions take ink; words on their tints use the darker `-text` shades. Red can be text in light mode, but in dark mode it's only a background, with paper text on top. DESIGN.md lists the contrast numbers behind these rules.

**Interaction.** Screens are panes: a list and the item it opens side by side, with a third pane when the work needs it. Every review uses the shared review card, one decision at a time, with the same keys everywhere. Few buttons show at once: one Amber action per pane, the rest in the item's ⋯ menu, a right-click menu and ⌘K, and work from other areas comes to the item rather than sending you to another page. Generated documents appear as they're written, and lists stay put while you work through them. Reversible actions happen at once with Undo; only deleting asks first.

**Explained.** Anything that can be done can be explained. Every action carries its explainer (what it does, what it costs, whether it can be undone) in a tooltip, or a long press on a phone. A new feature or action doesn't get built until its explainer and a line on how it's used are written down in its issue or pull request.

**Controls.** Every control is one of our own themed parts, never the browser's or the operating system's default. Dropdowns, checkboxes, radios, switches, date and time pickers, file pickers, sliders, tooltips, menus and dialogs are built as Storybook parts that follow DESIGN.md, and screens use those parts. Native elements may sit underneath for accessibility, but they never show their default look. The same goes for the browser's quieter defaults: scrollbars, text selection, the text cursor, autofilled fields, form validation bubbles, focus outlines, number spinners, `confirm` and `alert` boxes, and the right-click menu on anything that has its own.

**Words.** Labels and messages say what something is or what to do next, in plain words. Pages, sections and panels get short common nouns you'd use in documentation ("Goals", "History", "Notes"), not phrases ("What you want", "How we got here"). The interface never talks about itself: no notes on how the product is built, why a design choice was made, or how a feature works behind the scenes. It never narrates its internals either: no model names outside the AI model settings, no AI steps, passes or sort stages, nothing "judged" or "set aside by AI". Say what the thing is for the person, briefly ("Other roles", "Not the work of any of your directions"). If an explanation would genuinely help, it goes in a tooltip, not on the screen. Empty states say what to do next in one sentence.

**No filler.** No eyebrows: a small label above a heading appears only when it tells the reader something the heading doesn't, like a real count or status. No lines written to fill space, and nothing that points to context the reader doesn't have (a brief, a milestone, a past decision). This holds for the design file too: every line on a Paper board stands on its own for someone who has only that file, and the specimens carry the board, with captions only where a rule can't be seen.

### How design happens

The rule is simple: design something once, record it as a reusable part, and reuse it everywhere. Whoever is designing, whether a person or an AI that may not remember last week's work, checks what already exists before making anything new. Three tools share the job.

- **DESIGN.md holds the tokens.** Colors, type, spacing and the other design tokens live in one file at the root of the repo, in Google's DESIGN.md format, and feed the app's styles and Paper's tokens. A color changes there and flows everywhere.
- **Paper is where things are designed first.** Screens are sketched and designed in Paper before they're built, at both desktop and phone widths. Before designing anything, look in Paper for a similar screen or pattern and build on it. When a design changes, update the other screens that use it, so they stay consistent. The component set is laid out in Paper too, so every part has a visual source. The maintainers react to pictures in Paper before code gets written; a contributor without the Paper file shows the new screen or part in its Storybook stories instead.
- **Storybook is the library of parts.** Every primitive and component lives in Storybook with its variants and states, in light and dark. Screens are built from these parts instead of restyling them. When a screen needs something new, it becomes a new part, or a new variant of an existing one, before the screen uses it.

Paper and Storybook both have MCP servers. Whoever is doing design work should use them to see what exists, make changes, and check the results with screenshots.

A part is done when its Storybook stories match its Paper board in light and dark, at desktop and phone widths, by screenshot. `pnpm design:check` (part of `pnpm lint`, so part of every push) fails on anything that steps outside the system: a browser-default control in a screen, a colour, radius or type size that isn't a token, a dark-only token name, a browser tooltip or `confirm` box, or an icon from outside the icon map.

`pnpm check:rendered` (in CI after `pnpm storybook:build`, or locally after it) opens the critical screens from the built Storybook (Today, Review as cards and as a list, a company's ratings, a resume line edit, the website's waitlist, the privacy page, Talk in a story and in the first story) at 320, 390, 800, 1280 and 1440 wide, in light, in dark, and in Storybook's default view with both. It fails when any visible control reaches past the screen's edge, a pane or the page scrolls sideways, the key action can't be reached with Tab, or the screen throws. The website's parts get the same checks, and each of its mock-ups has to play without errors inside a phone's width and, with reduced motion, show exactly its final frame. The docs (home, a guide, How the AI works) get the edge checks from 320 to 1440 in light and dark, and search, the phone's contents sheet and Previous and Next are checked to work. The checks live in `tests/rendered/` and find controls by role, label and `data-tour`, never by fixture text.

Launch stills, clips and graphics are made with tooling kept outside this repository.
