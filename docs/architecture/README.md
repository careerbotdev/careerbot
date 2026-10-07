# System map

A [LikeC4](https://likec4.dev) model of CareerBot: screens, AI steps, services and tables, what each reads and writes, and how each AI step's inputs are filtered.

- `pnpm arch` opens the interactive diagrams (views: `index`, `aiFlows`, `screens`, `platform`, `data`).
- `pnpm arch:check` checks the import rules, validates the model, and fails if a Convex function or table is missing from it.
- `npx likec4 mcp docs/architecture` serves the model to AI tools (for example, a UI-building agent).

Files: `spec.c4` (kinds and tags), `model.c4` (elements and relationships), `views.c4` (diagrams).

## Input filter tags

| Tag | Meaning |
|---|---|
| `#approvedOnly` | only what the person approved |
| `#unreviewedInput` | includes proposals they haven't reviewed, so it can shape output before they decide |
| `#rawNarrative` | their own words, unfiltered |
| `#rejectedAsGuard` | rejected items, passed so they aren't proposed again |

Maintenance rules are in docs/BUILD.md, "System map".
