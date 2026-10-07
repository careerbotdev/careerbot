# Contributing to CareerBot

Thanks for helping. Bugs, ideas and questions go in [GitHub issues](https://github.com/careerbotdev/careerbot/issues); changes come as pull requests.

The full guide is in the docs (also at careerbot.dev/docs/contributing):

- [Local development](content/docs/contributing/index.mdx)
- [How the code is organised](content/docs/contributing/code.mdx)
- [Checks before a pull request](content/docs/contributing/checks.mdx)
- [Change files](content/docs/contributing/changes.mdx)
- [Writing docs](content/docs/contributing/writing-docs.mdx)
- [How this repository is updated](content/docs/contributing/public-repo.mdx)
- [License](content/docs/contributing/license.mdx)

## How a pull request lands

This repository is published from the maintainer's own copy of CareerBot: each update arrives as one commit. A pull request is reviewed here as usual; once it's accepted, the maintainer applies it to that copy with you as its author, and it reaches `master` in the next update, which names the pull request and lists you as a co-author (by your GitHub noreply address); then the pull request is closed with a link to it. Your commits keep your name, but they arrive squashed into that update rather than merged.

CI runs on pull requests from forks only after a maintainer approves the run, and it runs with read-only access: it holds no secrets and deploys nothing.

## Before you open a pull request

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm arch:check
```

If you changed screens or parts, also run `pnpm storybook:build && pnpm check:rendered`. CI runs all of these on pull requests.

## Rules that the checks hold you to

- **Design.** Colours, type and spacing come from `DESIGN.md` (run `pnpm tokens` after changing it). Screens are built from the Storybook parts in `src/components/`; something new becomes a part, with stories in light and dark, before a screen uses it. Every action says what it does, what it costs and whether it can be undone. See `docs/BUILD.md`, "Design" and "How design happens".
- **System map.** A change that adds, removes or rewires a Convex function, table, screen or AI step updates `docs/architecture/` in the same commit.
- **Docs.** A change to a screen updates its page in `content/docs/` in the same commit; run `pnpm docs:gen` when the generated reference changes.
- **Change files.** A change someone using or running CareerBot would notice adds a `.changes/<slug>.yaml` (see [Change files](content/docs/contributing/changes.mdx)).
- **No real people.** Tests, stories, fixtures and screenshots use the fictional people in `testdata/personas/` and `example.com` addresses, never your own record or anyone else's.

## Commits

One change per commit, with a message that says in plain words what changed and why, written about the product (for example: "Docker: images named after the compose project, so two copies on one host no longer overwrite each other's"). An area prefix such as `Docker:` or `Settings:` helps.

## License

By contributing you agree that your contributions are licensed under the [GNU AGPL-3.0](LICENSE).
