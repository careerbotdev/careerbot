import { afterEach, beforeEach, expect, test } from "vitest";
import { redirectBack } from "./auth";

// Where sign-in may send someone back to: the site, a path on it, or an origin listed in AUTH_REDIRECT_ORIGINS; never a
// look-alike address or anywhere else.

const saved = { site: process.env.SITE_URL, origins: process.env.AUTH_REDIRECT_ORIGINS };
beforeEach(() => {
  process.env.SITE_URL = "https://dev.careerbot.dev";
  process.env.AUTH_REDIRECT_ORIGINS = "http://localhost:3000";
});
afterEach(() => {
  process.env.SITE_URL = saved.site;
  process.env.AUTH_REDIRECT_ORIGINS = saved.origins;
});

test("a path, the site and a listed origin are allowed", () => {
  expect(redirectBack("/record?story=1")).toBe("https://dev.careerbot.dev/record?story=1");
  expect(redirectBack("?code=1")).toBe("https://dev.careerbot.dev?code=1");
  expect(redirectBack("https://dev.careerbot.dev/today")).toBe("https://dev.careerbot.dev/today");
  expect(redirectBack("http://localhost:3000")).toBe("http://localhost:3000");
  expect(redirectBack("http://localhost:3000/review")).toBe("http://localhost:3000/review");
});

test("look-alike and unlisted addresses are refused", () => {
  for (const to of ["https://dev.careerbot.dev.evil.com/", "http://localhost:30001/", "https://evil.com", "http://localhost:3000@evil.com"])
    expect(() => redirectBack(to), to).toThrow();
});

test("with no extra origins, only the site is allowed", () => {
  delete process.env.AUTH_REDIRECT_ORIGINS;
  expect(() => redirectBack("http://localhost:3000")).toThrow();
});
