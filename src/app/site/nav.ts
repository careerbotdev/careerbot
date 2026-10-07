// Moving around the public pages. Every link between them (Home, How it works, Open source, Questions, Privacy,
// Changelog) is a plain link that loads the whole page, never the app's own navigation: the website's analytics
// (Analytics.tsx) count document loads only.
import { WEBSITE } from "../mode";

// The public pages besides Home: each shows as it is to everyone, signed in or not, outside the app's frame (Shell),
// and is listed in the sitemap with Home (meta.ts). Home is public only when signed out; signed in, / is Today. A
// self-hosted copy and the demo have none of the website's pages (mode.ts), only the changelog.
export const PUBLIC_PAGES = WEBSITE ? ["/how-it-works", "/open-source", "/questions", "/privacy", "/changelog"] : ["/changelog"];

// Shown as it is to everyone, signed in or not, outside the app's frame (Shell): the public pages, and the docs (/docs
// and every page under it), which careerbot.dev, the demo and every self-hosted copy carry, each its own version of
// them, as they do the changelog.
export const isPublic = (path: string) => PUBLIC_PAGES.includes(path) || path === "/docs" || path.startsWith("/docs/");

// Where the website's old sections now live: links shared before the site was split into pages
// (careerbot.dev/#features) open the page instead.
export const MOVED: Record<string, string> = {
  "#features": "/how-it-works",
  "#open-source": "/open-source",
  "#questions": "/questions",
};

// A section on this page by its address ("#features"), shown when the page opens there: scrolled to the top of the
// window (under the sticky bar, by its scroll margin) and focused, so Tab carries on from there. The browser's own jump
// comes before the page exists. False when the page has no such section.
export function showSection(hash: string) {
  const section = document.getElementById(hash.slice(1));
  if (!section) return false;
  section.scrollIntoView({ behavior: "auto", block: "start" });
  if (!section.hasAttribute("tabindex")) section.setAttribute("tabindex", "-1");
  section.focus({ preventScroll: true });
  return true;
}
