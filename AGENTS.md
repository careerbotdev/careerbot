# CareerBot: agent instructions

Read these before working. They govern everything below.

- `docs/PRD.md`: what CareerBot is and why.
- `docs/BUILD.md`: standing rules (stack, system principles, design, words, system map, releases).
- `DESIGN.md`: design tokens and brand.
- `docs/architecture/`: the system map (LikeC4). `pnpm arch` opens it.
- `CONTRIBUTING.md`: how a change gets into CareerBot.

## Working here

- **Before you open a pull request:** `pnpm typecheck && pnpm lint && pnpm test && pnpm arch:check`. If you changed screens or parts, also `pnpm storybook:build && pnpm check:rendered`. CI runs all of these on pull requests.
- **System map:** a change to a Convex function, table, screen or AI step updates `docs/architecture/` in the same commit (BUILD.md, "System map").
- **Docs:** a change to a screen, setup, an AI step or a setting updates its page in `content/docs/` in the same commit; run `pnpm docs:gen` when the generated reference changes (BUILD.md, "Docs").
- **Change files:** every releasable change adds a `.changes/<slug>.yaml` with its bump and a plain note (BUILD.md, "Releases"); `pnpm lint` checks it.
- **Keys and personal data:** never commit a key, a `.env` file or anyone's real career record. Tests, stories and docs use the fictional people in `testdata/personas/` and `example.com` addresses.
- **Shell:** use non-interactive flags (`cp -f`, `mv -f`, `rm -rf`), because an aliased `-i` prompt hangs the session.

## Where knowledge lives

- **`docs/architecture/` (LikeC4):** the checked system map. CI enforces it.
- **`content/docs/`:** the docs at `/docs`, for people using, running and contributing to CareerBot.
- **GitHub issues and pull requests:** work and discussion.
- **When any of these disagrees with the code, the code wins.**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
