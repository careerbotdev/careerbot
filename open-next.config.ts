import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The app's pages read live data from Convex in the browser; the pages built at build time (the website and the docs,
// /docs and /api/search) never change until the next deploy. The Worker's static assets hold them, and cache
// interception answers a built page from there before Next.js runs, so a docs page isn't rendered on every request.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
