import { defineConfig } from "@playwright/test";

// Rendered checks: the critical screens, from the built Storybook (`pnpm storybook:build`), at phone to wide-desktop
// widths in light and dark. `pnpm check:rendered` runs them; CI runs them after building Storybook.
const PORT = 6007;

export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://127.0.0.1:${PORT}`, browserName: "chromium", reducedMotion: "reduce" },
  // Started from this directory (Playwright's default for webServer).
  webServer: { command: `node serve.mjs ${PORT}`, url: `http://127.0.0.1:${PORT}/iframe.html`, reuseExistingServer: !process.env.CI },
});
