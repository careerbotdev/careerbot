// A release's notes as Markdown, from its entry in src/app/changelog/releases.json: the GitHub Release's body and each
// version's part of CHANGELOG.md (scripts/release.ts, `pnpm release:prepare`).
//
//   pnpm -s release:notes 0.7.0    prints the GitHub Release body for 0.7.0 (a leading v is fine)
//
// CI makes the GitHub Release on a version tag with `gh release create` and this body.
import { pathToFileURL } from "node:url";
import { RELEASES, type Release, releaseAnchor } from "../src/app/changelog/releases";

export type { Release };

const SITE = "https://careerbot.dev";

// A Markdown bullet; an entry of several lines (a self-hoster's steps) goes on under it, indented.
const bullet = (text: string) => `- ${text.trim().replaceAll("\n", "\n  ")}`;

function list(title: string, items: string[]) {
  return items.length ? [`### ${title}`, "", ...items.map(bullet), ""] : [];
}

// The notes without the version and date, which GitHub shows as the release's title and time.
export function releaseBody(r: Release) {
  const selfHost = r.selfHost.length
    ? [
        "### If you host your own copy",
        "",
        ...(r.needsAction ? ["**Read before updating.**", ""] : []),
        ...r.selfHost.map(bullet),
        "",
        `How to update: ${SITE}/docs/self-hosting/updates#updating`,
        "",
      ]
    : [];
  return [
    r.summary,
    "",
    ...list("New", r.new),
    ...list("Better", r.better),
    ...list("Fixed", r.fixed),
    ...selfHost,
    `All releases: ${SITE}/changelog#${releaseAnchor(r.version)}`,
    "",
  ].join("\n");
}

// One version's part of CHANGELOG.md: its heading, then the notes.
export function releaseMarkdown(r: Release) {
  return `## ${r.version} · ${r.date}\n\n${releaseBody(r)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const asked = process.argv[2]?.replace(/^v/, "");
  const release = RELEASES.find((r) => r.version === asked);
  if (!release) {
    console.error(asked ? `No release ${asked} in src/app/changelog/releases.json.` : "usage: pnpm -s release:notes <version>");
    process.exit(1);
  }
  process.stdout.write(releaseBody(release));
}
