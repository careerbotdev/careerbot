// The image shown when a link to careerbot.dev is shared: src/app/site/ShareCard.tsx rendered to a 1200x630 PNG by
// Takumi, written where Next serves it (src/app/opengraph-image.png and twitter-image.png, with their alt text). Runs
// as part of `pnpm build`, before `next build`, so a deploy always has the current card (deploys run `pnpm cf:build`,
// and OpenNext's build runs `pnpm build` since open-next.config.ts sets no buildCommand); `pnpm share:card` runs it
// alone, and its output is committed so `next dev` has it too. The Worker can't run Takumi's native renderer, so the
// card is drawn at build time rather than on request.
import { readFile, writeFile } from "node:fs/promises";
import { render } from "takumi-js";
import { SHARE_ALT, SHARE_SIZE, ShareCard } from "../src/app/site/ShareCard";

// A CommonJS script (the package isn't an ES module), so no top-level await.
async function main() {
  const [wordmark, regular, semibold] = await Promise.all([
    readFile("public/brand/wordmark-light.svg"),
    readFile("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2"),
    readFile("node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2"),
  ]);
  const png = await render(<ShareCard wordmark={`data:image/svg+xml;base64,${wordmark.toString("base64")}`} />, {
    ...SHARE_SIZE,
    format: "png",
    fonts: [
      { name: "Inter", data: regular, weight: 400 },
      { name: "Inter", data: semibold, weight: 600 },
    ],
  });
  for (const name of ["opengraph-image", "twitter-image"]) {
    await writeFile(`src/app/${name}.png`, png);
    // No newline at the end: Next puts the file's text in the alt attribute as it is.
    await writeFile(`src/app/${name}.alt.txt`, SHARE_ALT);
  }
  console.log(`src/app/opengraph-image.png, twitter-image.png  ${SHARE_SIZE.width}x${SHARE_SIZE.height}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
