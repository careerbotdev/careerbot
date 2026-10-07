import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";

const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/**/*.stories.tsx"],
  staticDirs: ["../public"],
  addons: ["@storybook/addon-mcp"],
  // The docs' pages (content/docs, src/app/docs/source.ts) compile from MDX the way next.config.ts's createMDX() does.
  viteFinal(config) {
    config.plugins = [...(config.plugins ?? []), ...fumadocsMdx({ index: false })];
    return config;
  },
};

export default config;
