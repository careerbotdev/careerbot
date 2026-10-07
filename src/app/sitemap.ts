import { source } from "./docs/source";
import { sitemapFile } from "./site/meta";

// sitemap.xml: careerbot.dev's public pages and its docs; empty where the site isn't indexed (site/meta.ts).
export default function sitemap() {
  return sitemapFile(source.getPages().map((page) => page.url));
}
