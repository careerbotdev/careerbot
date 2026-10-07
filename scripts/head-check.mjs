// Checks the built site's head against the site it's built for (SITE_URL, else localhost), after `pnpm build`:
//   SITE_URL=https://dev.careerbot.dev node scripts/head-check.mjs
// Home, How it works, Open source, Questions and Privacy name themselves (canonical, og:url) and the share card with
// its alt text, all at this site's address; only careerbot.dev may be indexed. The demo's build (CAREERBOT_MODE=demo,
// demo.careerbot.dev) has none of the website's pages, so only its Home (the demo's entry) is checked, and it's never
// indexed. The deploy runs it on the build it's about to ship.
import { readFileSync } from "node:fs";

const site = new URL(process.env.SITE_URL || "http://localhost:3000");
const indexed = site.origin === "https://careerbot.dev";
const problems = [];

function head(file) {
  const html = readFileSync(`.next/server/app/${file}`, "utf8");
  const tags = new Map();
  for (const [, attrs] of html.match(/<head>([\s\S]*?)<\/head>/)[1].matchAll(/<(?:meta|link)\s([^>]*?)\/?>/g)) {
    const attr = (name) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    const key = attr("property") ?? attr("name") ?? (attr("rel") === "canonical" ? "canonical" : undefined);
    if (key) tags.set(key, attr("content") ?? attr("href"));
  }
  return tags;
}

const WEBSITE_PAGES = [
  ["how-it-works.html", "/how-it-works"],
  ["open-source.html", "/open-source"],
  ["questions.html", "/questions"],
  ["privacy.html", "/privacy"],
];
const PAGES = [["index.html", "/"], ...(process.env.CAREERBOT_MODE === "demo" ? [] : WEBSITE_PAGES)];
for (const [file, path] of PAGES) {
  const tags = head(file);
  const page = new URL(path, site).href.replace(/\/$/, "");
  const expect = (key, ok, what) => ok(tags.get(key)) || problems.push(`${path}: ${key} is ${JSON.stringify(tags.get(key))}, expected ${what}`);
  const here = (url) => url?.replace(/\/$/, "") === page;
  const onSite = (url) => url?.startsWith(site.origin + "/");
  expect("canonical", here, page);
  expect("og:url", here, page);
  expect("og:image", onSite, `an image on ${site.origin}`);
  expect("og:image:alt", Boolean, "alt text");
  expect("twitter:card", (v) => v === "summary_large_image", "summary_large_image");
  expect("twitter:image", onSite, `an image on ${site.origin}`);
  expect("twitter:image:alt", Boolean, "alt text");
  expect("robots", (v) => (indexed ? v === undefined : v?.includes("noindex")), indexed ? "no robots tag" : "noindex");
}

const robots = readFileSync(".next/server/app/robots.txt.body", "utf8");
if (indexed !== !/^Disallow: \/$/m.test(robots)) problems.push(`robots.txt ${indexed ? "blocks" : "doesn't block"} search engines on ${site.origin}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`head matches ${site.origin} (${indexed ? "indexed" : "not indexed"})`);
