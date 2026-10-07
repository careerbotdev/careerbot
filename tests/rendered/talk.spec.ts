import { expect, type Page, test } from "@playwright/test";
import { expectNothingPastTheEdge, openStory, PHONE, THEMES, WIDTHS } from "./helpers";

// Talk, on the Story screen and Getting started's first story, from the built Storybook with a stand-in for the
// browser's speech recognition (window.talkFake, src/components/talkFake.ts): where the browser can listen there's a
// Talk button; words still being heard show greyed, then land in the story once final; Stop says how many went in.
// Where it can't, there's no Talk button and a line points to the device's own dictation.

const hear = (page: Page, text: string, final = false) => page.evaluate(([t, f]) => window.talkFake?.hear(t, f), [text, final] as const);

async function talkFlow(page: Page, box: string, noun: string) {
  await page.getByRole("button", { name: "Talk", exact: true }).click();
  const live = page.getByRole("group", { name: "Being heard" });
  await expect(live).toBeVisible();
  await hear(page, "talking about the");
  await expect(live.locator(".text-muted")).toHaveText("talking about the");
  await hear(page, "talking about the night shift", true);
  await expect(live).toContainText("Talking about the night shift");
  await expect(live.locator(".text-muted")).toHaveCount(0);
  await hear(page, "and the dock");
  await expect(live.locator(".text-muted")).toHaveText("and the dock");
  await expectNothingPastTheEdge(page);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByText(`Stopped. 8 words added to your ${noun}.`)).toBeVisible();
  await expect(page.getByRole("textbox", { name: box })).toHaveValue(/Talking about the night shift and the dock$/);
  await expect(page.getByRole("group", { name: "Being heard" })).toHaveCount(0);
}

for (const size of WIDTHS) {
  const phone = size.width < PHONE;
  for (const theme of THEMES) {
    test.describe(`${size.width}px, ${theme}`, () => {
      test("Story: Talk, words being heard, then in the story, Stop", async ({ page }) => {
        const errors = await openStory(page, phone ? "screens-story--phone-talk" : "screens-story--talk", size, theme);
        await talkFlow(page, "Story", "story");
        expect(errors).toEqual([]);
      });

      test("Story: no Talk where the browser can't listen, the device's dictation instead", async ({ page }) => {
        const errors = await openStory(page, phone ? "screens-story--phone-talk-unsupported" : "screens-story--talk-unsupported-mac", size, theme);
        await expect(page.getByRole("textbox", { name: "Story" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Talk", exact: true })).toHaveCount(0);
        await expect(page.getByText(phone ? "To talk instead, tap the mic on your keyboard." : "for your Mac’s dictation")).toBeVisible();
        await expectNothingPastTheEdge(page);
        expect(errors).toEqual([]);
      });

      test("Getting started: Talk in the first story", async ({ page }) => {
        const errors = await openStory(page, phone ? "screens-getting-started--first-story-talk-phone" : "screens-getting-started--first-story-talk", size, theme);
        await talkFlow(page, "Your story", "story");
        expect(errors).toEqual([]);
      });
    });
  }
}

// What the browser does on its own: ending a session mid-talk (it listens again), and refusing the microphone (it
// stops, says so in plain words, and keeps what was already heard).
test("Story: listens again when the browser ends a session, and says why it stopped on a problem", async ({ page }) => {
  const errors = await openStory(page, "screens-story--talk", WIDTHS[3], "light");
  await page.getByRole("button", { name: "Talk", exact: true }).click();
  await hear(page, "first part", true);
  const starts = await page.evaluate(() => window.talkFake?.starts());
  await page.evaluate(() => window.talkFake?.end());
  await expect.poll(() => page.evaluate(() => window.talkFake?.starts())).toBe((starts ?? 0) + 1);
  await expect(page.getByRole("group", { name: "Listening" })).toBeVisible();
  await hear(page, "second part", true);
  await expect(page.getByRole("group", { name: "Being heard" })).toContainText("First part second part");
  await page.evaluate(() => window.talkFake?.fail("not-allowed"));
  await expect(page.getByText("The microphone is blocked for this site.", { exact: false })).toBeVisible();
  await expect(page.getByText("4 words added to your story.", { exact: false })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Story" })).toHaveValue(/First part second part$/);
  expect(errors).toEqual([]);
});
