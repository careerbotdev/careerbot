import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // The Docker image (Dockerfile) runs Next.js's own Node server: a standalone build carries only the files it needs.
  // The Cloudflare build (OpenNext) sets no BUILD_STANDALONE and makes its own.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Cloudflare Workers has no Next.js image optimizer; serve images as-is (in Docker too, so both serve the same).
  images: { unoptimized: true },
  // The site's own address (https://dev.careerbot.dev, https://careerbot.dev), from the build's Infisical environment,
  // fixed into the build: the Worker doesn't have it at run time. The head, robots.txt and sitemap use it
  // (src/app/site/meta.ts); unset (local), they use localhost. The Docker image builds with a stand-in that its
  // start script swaps for the container's SITE_URL (docker/web-start.sh). CAREERBOT_MODE=self-hosted builds a copy
  // someone runs themselves, and CAREERBOT_MODE=demo the demo at demo.careerbot.dev (src/app/mode.ts); careerbot.dev's
  // builds leave it unset. DEMO_URL, the demo's address (https://demo.careerbot.dev), is set in Infisical dev and prod
  // once the demo is live: only then do careerbot.dev's builds link to it (src/app/site/words.ts). The build's version,
  // package.json's (set by `pnpm release:prepare`), is NEXT_PUBLIC_CAREERBOT_VERSION: What's new compares it with the
  // last version each person saw (src/app/shell/WhatsNew.tsx).
  env: { SITE_URL: process.env.SITE_URL, CAREERBOT_MODE: process.env.CAREERBOT_MODE, DEMO_URL: process.env.DEMO_URL, NEXT_PUBLIC_CAREERBOT_VERSION: pkg.version },
  // Old addresses of screens that moved: follow-up questions are reviewed in Review, with conflicts, as Questions;
  // Directions live under Goals; stories and insights are Record sub-screens, and Record opens on Roles; the base resume
  // is one of Resumes, and the old Profile's contact block is edited on the resume (its GitHub is in Record, Projects);
  // comparing models is a pane of Settings, AI. Then, on careerbot.dev's builds only and once the demo is live
  // (DEMO_URL), /demo goes to the demo, which is its own deployment and build at its own address: a redirect here
  // rather than a page, so it answers before anything renders, and not permanent, so browsers don't keep it if the
  // address moves.
  async redirects() {
    return [
      { source: "/followups", destination: "/review?kind=questions", permanent: true },
      { source: "/directions", destination: "/goals/directions", permanent: true },
      { source: "/directions/:id", destination: "/goals/directions?direction=:id", permanent: true },
      { source: "/record", destination: "/record/roles", permanent: true },
      { source: "/narratives", destination: "/record/story", permanent: true },
      { source: "/narratives/:id", destination: "/record/story?story=:id", permanent: true },
      { source: "/insights", destination: "/record/insights", permanent: true },
      { source: "/resume", destination: "/resumes?resume=base", permanent: true },
      { source: "/profile", destination: "/settings", permanent: true },
      { source: "/compare", destination: "/settings?section=ai&compare=1", permanent: true },
      ...(!process.env.CAREERBOT_MODE && process.env.DEMO_URL ? [{ source: "/demo", destination: new URL("/demo", process.env.DEMO_URL).href, permanent: false }] : []),
    ];
  },
};

// The docs (content/docs, src/app/docs): fumadocs-mdx compiles the pages at build time, with the options in
// source.config.ts. It's ESM-only, so this file runs on Node's own TypeScript support (Node 22.18 or later).
export default createMDX()(nextConfig);
