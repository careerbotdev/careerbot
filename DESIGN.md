---
version: alpha
name: CareerBot
description: Instrument panel. Near-black ink, white paper, one amber light for actions, green and burnt orange for outcomes. Compact, calm, tool-like.
colors:
  # Core seven
  ink: "#15171A"
  paper: "#FFFFFF"
  primary: "#FFBA08"
  steel: "#6E8FA8"
  red: "#D2462F"
  good: "#4F7F52"
  caution: "#BF5700"
  # Light mode roles (ink blended into paper)
  surface: "#FFFFFF"
  text: "#15171A"
  muted: "#656668"
  border: "#E1E1E1"
  subtle: "#F4F5F5"
  primary-hover: "#E8AA0A"
  steel-subtle: "#E8EDF1"
  red-hover: "#B63F2C"
  good-subtle: "#E3EDE3"
  good-text: "#3F6B42"
  caution-subtle: "#F7E3D3"
  caution-text: "#9A4600"
  # State shades, controls and overlays
  primary-active: "#CA950C"
  subtle-active: "#D2D3D4"
  red-active: "#A0392A"
  control-border: "#848587"
  hover: "#E7E8E8"
  inverse: "#15171A"
  inverse-text: "#FFFFFF"
  inverse-muted: "#B4B5B6"
  backdrop: "#15171A52"
  # Dark mode roles (paper blended into ink)
  surface-dark: "#15171A"
  text-dark: "#FFFFFF"
  muted-dark: "#B4B5B6"
  border-dark: "#3F4143"
  subtle-dark: "#25272A"
  steel-subtle-dark: "#313D47"
  good-dark: "#86B889"
  good-subtle-dark: "#26362B"
  good-text-dark: "#86B889"
  caution-dark: "#E08A4A"
  caution-subtle-dark: "#482A12"
  caution-text-dark: "#E08A4A"
  subtle-active-dark: "#555659"
  control-border-dark: "#76787B"
  hover-dark: "#3F4143"
  inverse-dark: "#25272A"
  inverse-text-dark: "#FFFFFF"
  inverse-muted-dark: "#B4B5B6"
  backdrop-dark: "#00000080"
  # The public website only: the mock-ups' skeleton bars, idle lines, other fits, the pale wash behind a lit line, and
  # the terminal's lines. Drawn shapes, never text.
  site-skeleton: "#E4E5E6"
  site-skeleton-strong: "#CBCDCF"
  site-line: "#D5D6D7"
  site-fit: "#9A9B9D"
  site-highlight: "#FFF3D1"
  site-terminal-line: "#3F4143"
  site-skeleton-dark: "#2E3033"
  site-skeleton-strong-dark: "#4A4C4F"
  site-line-dark: "#45474A"
  site-fit-dark: "#76787B"
  site-highlight-dark: "#3A3016"
  # Category colors: reserved, not used yet
  category-green: "#4F7F52"
  category-burnt-orange: "#BF5700"
  category-blue: "#4F6F99"
  category-violet: "#72628F"
  category-steel: "#6E8FA8"
  category-brick: "#9A5046"
typography:
  display:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 600
    lineHeight: 36px
    letterSpacing: -0.02em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  row-title:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.04em
  mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.01em
  figure:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 36px
    letterSpacing: -0.02em
  # The public website (careerbot.dev) and the sign-in page only: larger type for a page people read once, not a tool they work in.
  site-hero:
    fontFamily: Inter
    fontSize: 84px
    fontWeight: 600
    lineHeight: 88px
    letterSpacing: -0.04em
  site-hero-sm:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -0.04em
  site-closing:
    fontFamily: Inter
    fontSize: 80px
    fontWeight: 600
    lineHeight: 84px
    letterSpacing: -0.04em
  site-display:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: 600
    lineHeight: 70px
    letterSpacing: -0.04em
  site-display-sm:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 600
    lineHeight: 44px
    letterSpacing: -0.035em
  site-headline:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: 600
    lineHeight: 62px
    letterSpacing: -0.035em
  site-headline-sm:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -0.035em
  site-contrast:
    fontFamily: Inter
    fontSize: 52px
    fontWeight: 600
    lineHeight: 58px
    letterSpacing: -0.035em
  site-section:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 54px
    letterSpacing: -0.035em
  site-section-sm:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 38px
    letterSpacing: -0.03em
  site-statement:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: 600
    lineHeight: 52px
    letterSpacing: -0.035em
  site-statement-sm:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: -0.03em
  site-step:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 600
    lineHeight: 42px
    letterSpacing: -0.03em
  site-step-sm:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.03em
  site-callout:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: 600
    lineHeight: 50px
    letterSpacing: -0.035em
  site-not-invited-sm:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -0.035em
  site-title:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -0.02em
  site-heading:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 600
    lineHeight: 46px
    letterSpacing: -0.03em
  site-band:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 600
    lineHeight: 42px
    letterSpacing: -0.03em
  site-band-sm:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 600
    lineHeight: 33px
    letterSpacing: -0.03em
  site-subheading:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 30px
    letterSpacing: -0.02em
  site-subheading-sm:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.02em
  site-card-heading:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.015em
  site-pain-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.02em
  site-lead:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 400
    lineHeight: 34px
  site-lead-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  site-intro:
    fontFamily: Inter
    fontSize: 21px
    fontWeight: 400
    lineHeight: 32px
  site-body-xl:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: 400
    lineHeight: 31px
  site-body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 29px
  site-body-lg-sm:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 400
    lineHeight: 27px
  site-answer:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 400
    lineHeight: 28px
  site-body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 26px
  site-body-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 24px
  site-question-sm:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.01em
  site-tile:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 500
    lineHeight: 25px
  site-point:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
  site-note:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
  site-item:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  site-item-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 500
    lineHeight: 22px
  site-group:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 18px
    letterSpacing: 0.02em
  site-nav:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 500
    lineHeight: 20px
  site-chip:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 18px
  site-tag:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 16px
  site-index:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.04em
  site-control:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 20px
  # The docs (careerbot.dev/docs): code as written, a numbered step's title and an AI step card's title. The docs'
  # other text uses the website's steps.
  docs-code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 22px
  docs-step:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.01em
  docs-card-title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.01em
rounded:
  none: 0px
  xs: 1px
  sm: 2px
  # The public website and the sign-in page only: the stage a mock-up is drawn on (smaller on a phone), a card inside a
  # mock-up (smaller on the phone's hero), the waitlist's field and button and the sign-in buttons, a large stage and
  # the calls to action between sections, a company's tile, a lit band inside a card, and pills (chips, skeleton bars,
  # tags, Sign in).
  site-stage: 20px
  site-stage-sm: 18px
  site-card: 12px
  site-card-sm: 10px
  site-field: 12px
  site-band: 24px
  site-tile: 9px
  site-mark: 5px
  site-pill: 999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "6": 24px
  "8": 32px
  "12": 48px
  "16": 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 32px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 32px
  button-secondary-dark:
    backgroundColor: "{colors.subtle-dark}"
    textColor: "{colors.text-dark}"
  button-destructive:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 32px
  button-destructive-hover:
    backgroundColor: "{colors.red-hover}"
    textColor: "{colors.paper}"
  selected:
    backgroundColor: "{colors.steel-subtle}"
    textColor: "{colors.ink}"
  selected-dark:
    backgroundColor: "{colors.steel-subtle-dark}"
    textColor: "{colors.paper}"
  in-progress:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.ink}"
  score-strong:
    backgroundColor: "{colors.good}"
    textColor: "{colors.paper}"
  score-strong-dark:
    backgroundColor: "{colors.good-dark}"
    textColor: "{colors.ink}"
  score-some:
    backgroundColor: "{colors.caution}"
    textColor: "{colors.paper}"
  score-some-dark:
    backgroundColor: "{colors.caution-dark}"
    textColor: "{colors.ink}"
  score-weak:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.muted}"
  score-weak-dark:
    backgroundColor: "{colors.subtle-dark}"
    textColor: "{colors.muted-dark}"
  good-tag:
    backgroundColor: "{colors.good-subtle}"
    textColor: "{colors.good-text}"
  good-tag-dark:
    backgroundColor: "{colors.good-subtle-dark}"
    textColor: "{colors.good-text-dark}"
  caution-tag:
    backgroundColor: "{colors.caution-subtle}"
    textColor: "{colors.caution-text}"
  caution-tag-dark:
    backgroundColor: "{colors.caution-subtle-dark}"
    textColor: "{colors.caution-text-dark}"
  problem-tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.red}"
  problem-tag-dark:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
  info-tag:
    backgroundColor: "{colors.steel-subtle}"
    textColor: "{colors.ink}"
  info-tag-dark:
    backgroundColor: "{colors.steel-subtle-dark}"
    textColor: "{colors.paper}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 16px
  card-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
  text-muted:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
  text-muted-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.muted-dark}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 6px 10px
    height: 32px
  row-hover:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.text}"
  error-text:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.red}"
  border-light:
    backgroundColor: "{colors.border}"
    textColor: "{colors.ink}"
  border-dark:
    backgroundColor: "{colors.border-dark}"
    textColor: "{colors.paper}"
---

## Overview

CareerBot is a tool you work in all day: compact, calm and quiet, in the spirit of Linear, Drizzle Studio and Apple Notes. Content comes first and the interface stays out of the way. No marketing styling inside the product, no mascots, no confetti. The public website may be more expressive but uses the same palette and logo.

This file is the single source of design tokens. `pnpm tokens` turns the front matter into `src/app/tokens.css`, which the app's styles and Storybook read, and `src/app/tokens.json`, the same values resolved for what can't read CSS: the share card, and the browser's theme color (`surface` and `surface-dark`). Paper's tokens are kept in step with this file. Change a value here, run `pnpm tokens`, and it flows everywhere.

## Colors

The palette is an instrument panel: near-black ink, white paper, one amber light for actions, and two outcome lights, green for good and burnt orange for caution. Every color has one meaning, and color never carries a meaning on its own: a score always shows its number, a state always has its words.

- **Ink (#15171A):** text in light mode, background in dark mode.
- **Paper (#FFFFFF):** background in light mode, text in dark mode.
- **Amber (#FFBA08), the primary:** actions only. The main action on a view, and nothing else.
- **Green (#4F7F52, `good`):** good outcomes only: a strong fit, approved, done.
- **Burnt orange (#BF5700, `caution`):** caution: some fit, worth a second look.
- **Red (#D2462F):** problems: errors, out-of-date lines, anything against a limit, anything destructive.
- **Steel (#6E8FA8):** structure and information: selected, in progress, current, the line beside a note. Used as a border, a fill or a tint, never as text.

Low scores and weak fits get no color: `subtle` with `muted` text, so only the fits worth reading stand out.

Green and burnt orange each come with a `-subtle` tint for tags and a `-text` shade for words on that tint, all with `-dark` twins. In dark mode the lighter `good-dark` (#86B889) and `caution-dark` (#E08A4A) replace them and take ink text.

The role colors (`surface`, `text`, `muted`, `border`, `subtle`, `steel-subtle`, `good`, `caution` and their tints and text shades) have `-dark` twins. The greys are blends of ink into paper, or paper into ink for dark mode. Components use the role names; the app swaps each role for its `-dark` twin in dark mode.

Supporting roles, each with one job:

- **Pressed states.** `primary-active`, `subtle-active` and `red-active` are the pressed shades of the three filled buttons; `primary-hover` and `red-hover` are their hover shades. A secondary button hovers to `subtle-active` at half strength and presses to `subtle-active`.
- **`control-border`** outlines unchecked checkboxes and radios and fills a switch's off track: 3.7:1 on paper and 3.4:1 on `subtle`, above the 3:1 controls need. In dark mode `control-border-dark` is 4.1:1 on ink and 3.4:1 on `subtle-dark`; on a hovered or selected dark row an unchecked control uses `muted-dark` instead (5.0:1).
- **`hover`** is the background of a hovered row or sidebar item (ink at 6% over `subtle`); `hover-dark` is `border-dark`.
- **`inverse`**, `inverse-text` and `inverse-muted` are the surface of tooltips, toasts and the bulk bar: ink with paper text in light mode, `subtle-dark` with a `border-dark` border in dark mode.
- **`backdrop`** dims the screen behind a dialog, drawer or the command palette: ink at 32% in light mode, black at 50% in dark mode.
- On a raised surface in dark mode, a secondary button takes a `border-dark` border so it doesn't sink into the surface.
- Errors in dark mode keep their words in the text colour and put the meaning in a red icon, because red is never text in dark mode.

**Category colors are reserved.** `category-green`, `category-burnt-orange`, `category-blue`, `category-violet`, `category-steel` and `category-brick` are set aside for telling groups apart (such as directions) and aren't used yet. They never stand for good, caution or a problem.

**The public website's drawings.** The mock-ups on careerbot.dev are drawn from skeleton bars and cards rather than words, with their own greys, used nowhere in the app and never as text: `site-skeleton` for a line of text, `site-skeleton-strong` for a heading or a chip's label, `site-line` for idle lines and empty marks (and the dashed edge of a section not written yet), `site-fit` for fits that aren't the best, `site-highlight` for the pale amber wash behind a lit line, and `site-terminal-line` for the lines in the dark terminal. Each has a `-dark` twin except the terminal's, which is dark in both modes. The void envelopes drift into is a soft radial gradient of `site-line` into `site-skeleton`, and the fog over a lost path's ends fades into the page's own `surface`. A mock-up has at most one amber accent; steel marks what's selected and the threads between things.

Contrast rules, for any color used as text (WCAG AA, 4.5:1):

- Amber is only ever a background with ink text on top (10.5:1), never text on paper.
- Steel is never text (3.4:1 on paper). As a fill it takes ink text (5.3:1); selected items use the `steel-subtle` tint (ink 15.2:1, or paper on `steel-subtle-dark` 11.1:1) with a steel border.
- Green as a fill takes paper text (4.7:1; ink is only 3.8:1). In dark mode `good-dark` takes ink text (7.9:1). Words on the green tint use `good-text` (5.2:1 on `good-subtle`), or `good-text-dark` on `good-subtle-dark` (5.6:1).
- Burnt orange as a fill takes paper text (4.6:1; ink is only 3.9:1). In dark mode `caution-dark` takes ink text (6.8:1). Burnt orange itself is only 3.7:1 on its tint, so words on the tint use `caution-text` (5.2:1 on `caution-subtle`), or `caution-text-dark` on `caution-subtle-dark` (4.9:1).
- Red can be text in light mode (4.5:1 on paper). In dark mode red is only a background, with paper text on top.
- Ink on paper is 18:1. `muted` is 5.8:1 on paper and 5.3:1 on `subtle`; `muted-dark` is 8.7:1 on ink and 7.3:1 on `subtle-dark`.

A new supporting color goes here first, fits the palette, meets the same contrast bar, and gets one meaning.

## Typography

Inter for everything people read, and JetBrains Mono for keys, key endings and IDs (`⌘K`, `A`, `••••4f2a`). The scale is small on purpose: 14px body for density, 13px for secondary lines, 12px medium for labels and buttons, and two title sizes. Weight and color carry hierarchy before size does.

- **`display`** (28/36, 600, −0.02em) appears at most once per screen and only where a screen opens on an overview rather than a list: Today's date, Getting started, an empty area. Everywhere else a pane starts with its 52px header.
- **`title-lg`** heads an item pane; **`title-md`** heads a pane or a group.
- **`row-title`** (14/20, 500) is the first line of a list row; the second line is `body-sm` in `muted`.
- **`label`** is for buttons, tags and field labels; **`label-caps`** (uppercase, +0.04em) only for group labels inside a list or menu.
- **`mono`** is for key hints and codes.
- **`figure`** (32/36, 600, −0.02em) is a report's big number (money, a count), in tabular figures; on a phone it steps down to `display`.
- Scores, counts, money and dates in columns use tabular figures (`tabular-nums`) so they line up.
- Reading text (a posting, a resume, a story) keeps a 640px measure.
- **The public website** (careerbot.dev's pages, its privacy page and the sign-in page) is read once rather than worked in, so it has larger steps of its own, used nowhere in the app; each `-sm` step is its phone size. `site-hero` (84/88; `site-hero-sm` 44/48) for the one headline, a page's heading and the closing line on a phone; `site-closing` (80/84) for the closing line; `site-display` (64/70; `site-display-sm` 40/44) for How it works' four steps and the whole search in one place; `site-headline` (56/62; `site-headline-sm` 36/40) for Where job searches go wrong, How CareerBot fixes it, Why isn't your job search working? and where else your experience fits; `site-contrast` (52/58) for Why's three words; `site-section` (48/54; `site-section-sm` 32/38) for Questions, The licence, What you need to run it, how it differs from the hosted version, and Sign in; `site-statement` (44/52; `site-statement-sm` 28/34) for the line that closes Why; `site-callout` (44/50) for It writes boldly, but never makes things up on How it works and the sign-in page's not-invited heading (`site-not-invited-sm` 34/40 on a phone); `site-step` (36/42; `site-step-sm` 26/32) for a step's title on How it works; `site-heading` (40/46) for Everything CareerBot does and Sign in on a phone; `site-title` (40/48) for the privacy page's title; `site-band` (36/42; `site-band-sm` 28/33) for a call to action between sections; `site-subheading` (24/30; `site-subheading-sm` 22/28) for a pain's title and a card's title on Home; `site-card-heading` (20/26) for a step on Home, a card's title on a phone and a need on Open source; `site-pain-sm` (18/24) for a pain in Home's list on a phone; `site-lead` (22/34; `site-lead-sm` 18/28) under the headline and a page's heading; `site-intro` (21/32) under the whole search's heading; `site-body-xl` (19/31) for Why's lines and the words beside a drawing; `site-body-lg` (18/29; `site-body-lg-sm` 17/27) for a step's words, the licence and the sign-in page's; `site-body` (16/26; `site-body-sm` 15/24) for paragraphs; `site-answer` (17/28) for an answer and a pain's words, and `site-question-sm` (17/24, 600) for a question, a short step or a need on a phone (`title-lg` above); `site-tile` (17/25, 500) for the portal's tiles; `site-point` (16/22, 600) and `site-note` (15/22) for a link under a card on a phone, the notes under a form and the sign-in page's links; `site-item` (16/24) and `site-item-sm` (15/22) for the features table's rows, under `site-group` (13/18, 600, +0.02em) area names on a phone; `site-nav` (15/20, 500) for the header's links, the feature names under Home's steps and the links under a card; `site-chip` (14/18, 500) for the pain a step answers; `site-tag` (13/16, 500) for a tag above a heading and the word Answers; `site-index` (13/16, JetBrains Mono) for a step's or a need's number; `site-control` (16/20) for the waitlist's field and button and the sign-in buttons.
- **The docs** (careerbot.dev/docs, and every self-hosted copy's /docs) are read like the website, so they use its steps: `site-headline` (`site-display-sm` on a phone) for the docs home's title, `site-title` (`site-section-sm`) for a page's title, `site-body-xl` (`site-lead-sm`) under it, `site-subheading` (`site-subheading-sm`) for a section, `site-body` for paragraphs, `site-body-sm` and `site-note` inside callouts and rows, `site-group` for small headings (On this page), `body-md` for the sidebar and the contents. Three are their own: `docs-code` (13/22, JetBrains Mono) for code as written, which wraps on a phone rather than scrolling sideways; `docs-step` (17/24, 600) for a numbered step's title; `docs-card-title` (18/24, 600) for an AI step card's title. Docs parts (code blocks, callouts, cards, search, the page tree) keep the product's 2px corners; only the shared site header and footer keep the website's pills. Reading text keeps the 640px measure.

## Layout

A 4px grid. Spacing steps are named by grid units, matching Tailwind's scale: 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px, 8 = 32px, 12 = 48px, 16 = 64px. The two large steps are for empty states, getting started and sign-in.

Heights follow a fixed rhythm: 20 for tags and key hints, 28 for compact rows, menu items and small buttons, 32 for controls, 36 for tab bars, 44 for touch targets and large buttons, 52 for pane headers, 56 for two-line list rows. There is one row density; compact 28px rows appear only in tables and menus.

Screens use the full width of the window, like a desktop tool. They are built from panes: a list and the item it opens side by side, and more panes where the work needs them (filters, a detail, a related item). Panes are resizable where it helps, and nothing is centred in a narrow column on a wide screen. A width the person sets by dragging a divider is one setting for the whole app, not for one screen: the list's width and the third pane's width are kept in the browser, and every screen opens its panes at them, within its own limits (Today's wide list stays 480 to 600), after a reload too. Double-clicking a divider puts its pane back to the usual width. Long reading text (a posting, a resume, a narrative) keeps a comfortable line length inside its pane.

Every screen is fully responsive and designed for each size, not squeezed into it: large screens show every pane; medium screens keep the list and the item and fold secondary panes (filters, a detail) into drawers or toggles; small screens stack them, list first, and an item opens full screen with a way back. Controls stay reachable and touch-sized on small screens, and nothing scrolls sideways. Each screen is sketched in Paper at desktop and phone widths, and checked in between.

Sizes and panes:

| | Small | Medium | Large |
|---|---|---|---|
| Width | under 768 | 768 to 1279 | 1280 and up |
| Tailwind prefix | none | `md:` | `lg:` |
| Sidebar | bottom bar | 56px rail | 240px |
| List pane | full screen | 320px | 360px, resizable 320 to 480 |
| Item pane | full screen, with Back | fills the rest (392 at 768; no minimum) | fills the rest, at least 480 |
| Third pane | full-height sheet | 400px drawer over the item | 380px, resizable 340 to 480 |
| Item padding | 16px | 24px | 32px |

A dialog is 440px wide and the command palette 640px. On small screens neither exists: the command palette is a sheet and a dialog's choice moves into the bottom bar (Components).

## Elevation & Depth

Flat. Separation comes from borders and the `subtle` background. Only surfaces that float above the page cast a shadow, at one of two levels:

- **Raised** (`shadow-raised`): menus, popovers, tooltips and toasts. Light: `0 8px 24px -6px` ink at 16% plus `0 2px 4px -2px` ink at 8%. Dark: `0 8px 24px -6px` black at 50%, on `subtle-dark`.
- **Overlay** (`shadow-overlay`): dialogs, drawers and the command palette, over the `backdrop`. Light: `0 24px 64px -12px` ink at 28% plus `0 4px 12px -4px` ink at 10%. Dark: `0 24px 64px -12px` black at 60%.
- **Card** (`shadow-site-card`) and **lift** (`shadow-site-lift`), on the public website only: a card inside a mock-up (`0 1px 2px` ink at 4% plus `0 10px 28px` ink at 6%), and a card lifted while it moves (`0 2px 4px` ink at 6% plus `0 18px 40px` ink at 14%). Black at 30–50% in dark mode.

Focus is a 2px steel ring with a 1px gap in the surface colour, on every button, row, tab and control. A text field shows focus by turning its border steel, with a 1px steel ring inside it.

## Motion

Motion confirms what happened; it never decorates. Four durations: instant (0) for state changes a key press causes, fast (100ms) for hover and press, base (160ms) for menus, popovers, toasts and panes opening, slow (240ms) for drawers, sheets and the command palette. Things arrive with `ease-out` (`cubic-bezier(0.2, 0, 0, 1)`) and leave with `ease-in` (`cubic-bezier(0.4, 0, 1, 1)`); spinners turn linearly. A tooltip waits 500ms before it shows. With reduced motion, everything becomes a short fade.

Never: re-sorting a list under the pointer, bouncing, numbers counting up, confetti.

**The public website** moves more, to show what CareerBot does, with the same rules: fades, short slides and lines that draw, nothing bounces, only opacity, transforms and a line's dash offset move, so nothing reflows. Each mock-up is drawn in its still, the last frame of its motion. The hero's door part (the lit line, the thread to a person, the reply and its check) plays once on load and holds while its envelopes keep drifting into the void on a 5.3-second loop; Applying into the void loops every 6 seconds and the story every 6; loops pause off screen and while the page is hidden. The rest play once when scrolled into view: the other pains, Why it isn't working (its words fade up after the drawings), the method's steps, the directions fan, the portal (its tiles fade up in reading order, 80ms apart) and the closing's envelopes and reply, which replay the hero's last two frames. With reduced motion every mock-up holds its still. The key frames and timings are on the Calm v3 — motion board in Paper (and Calm — motion on the Website v2 page for the mock-ups carried over).

## Iconography

Lucide icons, as drawn, at a 1.5px stroke that stays 1.5px at every size (`absoluteStrokeWidth`). 16px inside the interface, 20px in empty states and the phone bar. Icons are `muted` at rest and take the text colour when their item is current or hovered; they are never amber. A red icon marks a failure and a green one a finished result, and nothing else is coloured. Each concept has one icon, used everywhere it appears; the map lives on the Icons board in Paper and in `src/components/icons.tsx`. Other services keep their own marks (Google, GitHub, X, LinkedIn), filled in one colour like the icons around them: the sign-in buttons, and the website footer's links to CareerBot elsewhere.

## Shapes

Square, like the logo mark. The radii are `none` (0px) and `sm` (2px), plus `xs` (1px) only for small marks and for a part nested inside a 2px corner (a radio's mark, a switch's knob, a segment inside its track, a thin progress bar). Buttons, inputs, cards, tags and swatches use `sm`; the mark, dividers and full-bleed surfaces use `none`. Nothing is pill-shaped or noticeably rounded.

The public website's mock-ups are softer, and only there (and on the sign-in page, which shares the website's look): `site-stage` (20px; `site-stage-sm` 18px on a phone) for the grey stage a mock-up is drawn on, `site-band` (24px) for a large stage (the hero, the portal, the directions fan) and the dark calls to action between sections, `site-card` (12px; `site-card-sm` 10px) for a card inside a mock-up, `site-field` (12px) for the waitlist's field and button and the sign-in buttons, `site-tile` (9px) for a company's letter tile, `site-mark` (5px) for a lit band inside a card, and `site-pill` for chips, skeleton bars, tags and the Sign in link. A mock-up's stage scales with its width, corners included, unless its corners sit on the unscaled box around it.

## Components

Buttons come in three sizes: small 28px, medium 32px (the default) and large 44px (touch and phone). Primary is amber with ink text and is used once per pane for the main action. Secondary is `subtle` with text color. Ghost has no fill until hovered. Outline sits on the page colour with a `border` and is the trigger for menus and selects. Icon buttons are square at the button's height. Destructive is red with paper text, appears only where something is about to be deleted (the dialog that asks first, or the bottom bar on a phone), and is the only action that asks. A loading button shows a spinner and a present-tense label ("Approving") and ignores clicks. A disabled button says why in its tooltip. A key hint sits inside the button at its right edge on screens with a keyboard, never on phones. Selected rows and current items use `steel-subtle` with a steel border. Inputs have a 1px `border` and show focus as described under Elevation & Depth.

A fit score is a square badge with its number in tabular figures, at 40px in an item header, 28px in a list row and 20px inline: strong fit on `good` with paper text, some fit on `caution` with paper text, weak or no fit on `subtle` with `muted` text; in dark mode `good-dark` and `caution-dark` with ink text.

A status in words is a `StatusTag`: a small `sm`-rounded tag in the `label` type with 6px side padding and a 1px border, in one of four tones. `good` (approved, done) and `caution` (needs a look) use the `-subtle` tint with the `-text` shade, with the border transparent. Red has no tint, so `problem` is red text in a 1px red border on no fill in light mode (4.5:1 on paper), and paper on a red fill in dark mode, where red is never text. `info` (current) is ink on `steel-subtle`. A status shown as words in a line uses the same meanings without the tag: `good-text` for a strong match or a fit, `caution-text` for a partial or some fit, `muted` for a miss. Left rules follow them too: `caution` beside a question or suggestion waiting on you, `good` beside a finished result, steel for everything else.

A fifth `neutral` tone (`subtle` with `muted` text, no border) marks states that are neither good nor waiting: Preparing, Maybe, Not for me.

Every control is a themed part from `src/components`: no browser-default dropdowns, checkboxes, radios, date or time pickers, file pickers, sliders, tooltips, menus or dialogs. The browser's quieter defaults are themed too: scrollbars, text selection, the text cursor, autofilled fields, focus outlines, validation bubbles and number spinners. When a screen needs a control that doesn't exist yet, it's built as a Storybook part first, keyboard accessible, in light and dark.

Selecting several rows of a list is a mode entered on purpose, never by the pointer passing over a row: Select in the list's ⋯ menu (or a row's right-click menu), X or Space on a focused row, Shift- or ⌘-click on a row, or a long press on a phone. Only then does every row show its checkbox, in a column at the left that rows which can't be checked keep empty so the list stays lined up; a click checks a row instead of opening it, and the bulk bar shows the count, the actions the checked rows share (off while none are) and Done. Done or Esc leaves and unchecks everything, as does acting on what's checked. Hovering a row only tints it and shows its actions over its tag and date, so nothing in a row moves under the pointer. One part does it everywhere (`useSelection` with `ListRow`, `BulkBar` and the bottom bar's bulk mode).

On small screens two patterns replace everything that would float or pop up, and each has its own job:

- **The bottom bar morphs for actions.** The bar that holds Today, Review, Pursuits and More turns into the actions of what's in front of you, in thumb reach: an open item's actions (its one Amber action and one or two others), the bulk actions, count and Done while a list is selecting, and the choice when something is about to be deleted ("Delete story" in red beside "Cancel"). Finishing or cancelling turns it back. Nothing asks in a pop-up on a phone.
- **The sheet is for choosing and looking.** The ⋯ menu, the context menu (opened by a long press; on a row that can be checked, a long press checks it and starts selecting instead), a popover, the list of a select or combobox, the date and time pickers, a tooltip's explanation (on a long press), the rest of the sidebar (the bar's More), the third pane (full height) and the command palette all open as one `Sheet` part, the same everywhere: it rises from the bottom over the `backdrop`, has a grab handle and a title, fits its content up to 90% of the screen height and scrolls inside past that, respects the safe area, and closes by swiping down, tapping the backdrop or Back. Choosing an item in it closes it; nothing floats beside the pointer on a phone.

## Do's and Don'ts

- Do use role colors (`surface`, `text`, `muted`, `border`, `subtle`, `good`, `caution`) in components, not the core hex values.
- Do keep one amber action per view.
- Do show the number or the words alongside any status color.
- Don't use amber for anything but actions, or green for anything but good outcomes.
- Don't use amber or steel as text.
- Don't put `good` or `caution` text on their own tints; use `good-text` and `caution-text`.
- Don't use red as text in dark mode.
- Don't use the category colors until a screen needs them, and never for status.
- Don't add gradients or decorative color inside the product, or shadows outside the two elevation levels.
- Don't round corners beyond 2px.
- Don't use native browser or OS controls with their default look (`<select>`, checkboxes, radios, date, time and file pickers, sliders, `title` tooltips, `confirm` and `alert`, validation bubbles, default scrollbars and selection).
- Don't hardcode a color, size or radius anywhere else. Add or change it here.
