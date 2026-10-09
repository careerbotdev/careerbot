import { expect, test } from "@playwright/test";
import { openStory } from "./helpers";

// A link in an item's Details column longer than the column (an open role's title) is cut short inside it, its arrow
// still showing, rather than running past the column and the window's edge.
test("a long link in Details is cut short inside its column", async ({ page }) => {
  const errors = await openStory(page, "components-properties--details-column", { width: 1440, height: 900 }, "light");
  const list = page.getByRole("region", { name: "Details" }).locator("dl");
  const links = await list.getByRole("link").evaluateAll((els) =>
    els.map((a) => {
      const words = a.querySelector("span")!;
      const arrow = a.querySelector("svg")!.getBoundingClientRect();
      const dd = a.closest("dd")!.getBoundingClientRect();
      return { name: words.textContent ?? "", right: Math.round(arrow.right), column: Math.round(dd.right), cut: words.scrollWidth > words.clientWidth };
    }),
  );
  for (const l of links) expect(l.right, `${l.name}: its arrow ends at ${l.right}, past the column's ${l.column}`).toBeLessThanOrEqual(l.column);
  expect(
    links.some((l) => l.cut),
    "no link in the story is long enough to be cut short",
  ).toBe(true);
  expect(errors).toEqual([]);
});
