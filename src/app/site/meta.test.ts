import { afterEach, expect, test, vi } from "vitest";
import { robotsFile, rootMetadata, sitemapFile } from "./meta";

const PREVIEW_BOTS = ["facebookexternalhit", "Twitterbot", "LinkedInBot", "Slackbot", "Discordbot", "WhatsApp"];

afterEach(() => {
  vi.unstubAllEnvs();
});

// The rules robots.txt applies to one crawler: the group naming it, else the `*` group.
function rulesFor(bot: string) {
  const rules = [robotsFile().rules].flat();
  return rules.find((r) => [r.userAgent].flat().includes(bot)) ?? rules.find((r) => [r.userAgent].flat().includes("*"));
}

test("each build's addresses are its own site's: dev, prod, and localhost when unset", () => {
  vi.stubEnv("SITE_URL", "https://dev.careerbot.dev");
  expect(String(rootMetadata().metadataBase)).toBe("https://dev.careerbot.dev/");
  vi.stubEnv("SITE_URL", "https://careerbot.dev");
  expect(String(rootMetadata().metadataBase)).toBe("https://careerbot.dev/");
  vi.stubEnv("SITE_URL", "");
  expect(String(rootMetadata().metadataBase)).toBe("http://localhost:3000/");
});

test("careerbot.dev is open to search engines and lists its public pages", () => {
  vi.stubEnv("SITE_URL", "https://careerbot.dev");
  expect(rootMetadata().robots).toBeUndefined();
  for (const bot of ["Googlebot", ...PREVIEW_BOTS]) {
    expect(rulesFor(bot)).toMatchObject({ allow: "/" });
    expect(rulesFor(bot)).not.toHaveProperty("disallow");
  }
  expect(robotsFile().sitemap).toBe("https://careerbot.dev/sitemap.xml");
  expect(sitemapFile().map((e) => e.url)).toEqual([
    "https://careerbot.dev/",
    "https://careerbot.dev/how-it-works",
    "https://careerbot.dev/open-source",
    "https://careerbot.dev/questions",
    "https://careerbot.dev/privacy",
    "https://careerbot.dev/changelog",
  ]);
});

test("dev is kept out of search engines but still draws link previews", () => {
  vi.stubEnv("SITE_URL", "https://dev.careerbot.dev");
  expect(rootMetadata().robots).toEqual({ index: false, follow: false });
  expect(rulesFor("Googlebot")).toEqual({ userAgent: "*", disallow: "/" });
  for (const bot of PREVIEW_BOTS) expect(rulesFor(bot)).toMatchObject({ allow: "/" });
  expect(robotsFile().sitemap).toBeUndefined();
  expect(sitemapFile()).toEqual([]);
});
