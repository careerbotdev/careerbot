import { siteUrl } from "../../site/meta";
import { CHANGELOG } from "../../site/words";
import { RELEASES, releaseAnchor } from "../releases";

// /changelog/rss.xml: the changelog as an RSS feed, a release an item, its notes as the description (HTML), built with
// the site.
export const dynamic = "force-static";

const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function list(title: string, items: string[]) {
  return items.length ? `<h3>${title}</h3><ul>${items.map((i) => `<li>${escape(i)}</li>`).join("")}</ul>` : "";
}

export function GET() {
  const site = siteUrl();
  const page = new URL("/changelog", site).href;
  const items = RELEASES.map((r) => {
    const link = `${page}#${releaseAnchor(r.version)}`;
    const notes = [
      `<p>${escape(r.summary)}</p>`,
      list(CHANGELOG.new, r.new),
      list(CHANGELOG.better, r.better),
      list(CHANGELOG.fixed, r.fixed),
      list(r.needsAction ? `${CHANGELOG.selfHost} (${CHANGELOG.readFirst})` : CHANGELOG.selfHost, r.selfHost),
    ].join("");
    return [
      "<item>",
      `<title>CareerBot ${r.version}</title>`,
      `<link>${link}</link>`,
      `<guid isPermaLink="true">${link}</guid>`,
      `<pubDate>${new Date(`${r.date}T12:00:00Z`).toUTCString()}</pubDate>`,
      `<description>${escape(notes)}</description>`,
      "</item>",
    ].join("");
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "<title>CareerBot changelog</title>",
    `<link>${page}</link>`,
    `<atom:link href="${new URL("/changelog/rss.xml", site).href}" rel="self" type="application/rss+xml"/>`,
    `<description>${escape(CHANGELOG.sub)}</description>`,
    "<language>en</language>",
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
