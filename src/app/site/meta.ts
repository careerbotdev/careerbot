import type { Metadata, MetadataRoute, Viewport } from "next";
import tokens from "../tokens.json";
import { PUBLIC_PAGES } from "./nav";
import { SHARE_ALT, SHARE_SIZE } from "./ShareCard";
import { DESCRIPTION, HERO, PAGE_TITLE, SHARE_DESCRIPTION, SHARE_TITLE } from "./words";

// What the site says about itself to search engines, link previews and browsers: the head's metadata (layout.tsx and
// each public page), robots.txt, sitemap.xml and the home page's structured data. Every address is built from the
// site's own base URL, SITE_URL, from the build's environment (Infisical dev or prod in CI, inlined by next.config.ts),
// so dev.careerbot.dev's links and share card point at dev and careerbot.dev's at prod. A build without it (local) uses
// localhost. Only careerbot.dev is indexed by search engines; dev, local, the demo (demo.careerbot.dev) and
// self-hosted copies aren't, but link previews work everywhere.

export const SITE_NAME = "CareerBot";
const PRODUCTION_URL = "https://careerbot.dev";
const LOCAL_URL = "http://localhost:3000";
const TITLE = PAGE_TITLE;

// The crawlers that draw link previews (Facebook, X, LinkedIn, Slack, Discord, WhatsApp), allowed even where search
// engines aren't. Slack's announces itself as Slackbot-LinkExpanding.
const LINK_PREVIEW_BOTS = ["facebookexternalhit", "Twitterbot", "LinkedInBot", "Slackbot", "Slackbot-LinkExpanding", "Discordbot", "WhatsApp"];

// The public pages, for the sitemap: Home, then the others (nav.ts), then the docs' pages (sitemap.ts passes them in).
const PUBLIC_PATHS = ["/", ...PUBLIC_PAGES];

export const siteUrl = () => new URL(process.env.SITE_URL || LOCAL_URL);
const indexed = (site: URL) => site.origin === PRODUCTION_URL;
const OPEN_GRAPH = { type: "website", siteName: SITE_NAME, locale: "en_US" } as const;

// Defaults for every page (layout.tsx). The share card comes from opengraph-image.png and twitter-image.png, with
// their size and alt text, beside layout.tsx. Signed-in screens keep these: nothing from a workspace goes in the head.
export function rootMetadata(): Metadata {
  const site = siteUrl();
  return {
    metadataBase: site,
    title: { default: TITLE, template: `%s · ${SITE_NAME}` },
    description: DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: { ...OPEN_GRAPH, title: SHARE_TITLE, description: SHARE_DESCRIPTION },
    twitter: { card: "summary_large_image", title: SHARE_TITLE, description: SHARE_DESCRIPTION },
    ...(indexed(site) ? {} : { robots: { index: false, follow: false } }),
  };
}

// A public page's own head: its title (the template adds " · CareerBot"; none keeps the default), description and
// address, which link previews and search engines take as the page's canonical one. `share` is a shorter description
// for link previews (about 125 characters); without it the description is used. A page's own openGraph and twitter
// replace the layout's, share card included, so they name the card again.
export function pageMetadata(path: string, page: { title?: string; description: string; share?: string }): Metadata {
  const title = page.title ? `${page.title} · ${SITE_NAME}` : SHARE_TITLE;
  const shared = page.share ?? page.description;
  const card = (url: string) => [{ url, ...SHARE_SIZE, alt: SHARE_ALT, type: "image/png" }];
  return {
    ...(page.title ? { title: page.title } : {}),
    description: page.description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH, title, description: shared, url: path, images: card("/opengraph-image.png") },
    twitter: { card: "summary_large_image", title, description: shared, images: card("/twitter-image.png") },
  };
}

// The browser's bar and the phone's status bar match the page's surface, light and dark.
export const VIEWPORT: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: tokens.colors.surface },
    { media: "(prefers-color-scheme: dark)", color: tokens.colors["surface-dark"] },
  ],
};

export function robotsFile(): MetadataRoute.Robots {
  const site = siteUrl();
  if (!indexed(site)) return { rules: [{ userAgent: LINK_PREVIEW_BOTS, allow: "/" }, { userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/" }, { userAgent: LINK_PREVIEW_BOTS, allow: "/" }],
    sitemap: new URL("/sitemap.xml", site).href,
  };
}

export function sitemapFile(docs: string[] = []): MetadataRoute.Sitemap {
  const site = siteUrl();
  return indexed(site) ? [...PUBLIC_PATHS, ...docs].map((path) => ({ url: new URL(path, site).href })) : [];
}

// The home page's structured data: the site, and CareerBot as a web app. No price: the hosted version is invite-only
// and the source is free to run, so there's no offer anyone can buy today.
export function structuredData() {
  const url = siteUrl().href;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: SITE_NAME, url, description: HERO.subline, inLanguage: "en" },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        description: HERO.subline,
        url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
      },
    ],
  };
}
