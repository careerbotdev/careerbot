import { expect, test } from "@playwright/test";
import { expectNothingPastTheEdge, openStory, PHONE, WIDTHS } from "./helpers";

// A row's tag never takes its title's place: in Pursuits' Against your limits, each role's tag is the limit it's
// against, in a sentence. At every width the fold's name stays on one line, each row's title and line keep their
// width (the tag is cut short), nothing reaches past the edge, and on medium screens and up the row's tooltip holds the
// cut tag's full words.

for (const size of WIDTHS)
  test(`${size.width}px: Against your limits keeps each role's title beside a long tag`, async ({ page }) => {
    const errors = await openStory(page, "screens-pursuits--against-your-limits", size, "light");
    const fold = page.getByRole("list", { name: "Against your limits" });
    await expect(fold.locator("[data-row]").first()).toBeVisible();
    await expectNothingPastTheEdge(page);

    const name = page.getByRole("button", { name: /^Against your limits/ }).getByText("Against your limits", { exact: true });
    const lines = await name.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines, "the fold's name wraps").toBe(1);

    const rows = await fold.locator("[data-row]").evaluateAll((els) =>
      els.map((row) => {
        const [, words, tag] = [...row.children].map((el) => el.getBoundingClientRect().width);
        const text = row.querySelector("[data-tone] > span");
        return { row: row.getBoundingClientRect().width, words, tag, cut: !!text && text.scrollWidth > text.clientWidth, full: text?.textContent ?? "" };
      }),
    );
    for (const r of rows) expect(r.words, `a row's title and line are squeezed beside a ${Math.round(r.tag)}px tag in a ${Math.round(r.row)}px row`).toBeGreaterThan(r.row / 4);

    const cut = rows.findIndex((r) => r.cut);
    expect(cut, "no tag in the fold is long enough to be cut short").toBeGreaterThanOrEqual(0);
    if (size.width >= PHONE) {
      await fold.locator("[data-row]").nth(cut).hover();
      await expect(page.getByRole("tooltip")).toHaveText(rows[cut].full);
    }
    expect(errors).toEqual([]);
  });
