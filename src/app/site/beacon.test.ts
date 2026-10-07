import { describe, expect, test } from "vitest";
import { beaconConfig, optedOut } from "./beacon";

const PROD = "https://careerbot.dev";
const visit = { site: PROD, signedOut: true, optedOut: false };

describe("the analytics beacon", () => {
  test("counts a signed-out visit to careerbot.dev, without following the page's own navigations", () => {
    const config = JSON.parse(beaconConfig(visit) ?? "null");
    expect(config).toEqual({ token: expect.stringMatching(/^[0-9a-f]{32}$/), spa: false });
  });

  test("is never there once signed in, or while that isn't known yet", () => {
    expect(beaconConfig({ ...visit, signedOut: false })).toBeNull();
  });

  test("is only on careerbot.dev: not dev, local or a copy run elsewhere", () => {
    for (const site of ["https://dev.careerbot.dev", "http://localhost:3000", "https://careerbot.example.com", undefined]) {
      expect(beaconConfig({ ...visit, site })).toBeNull();
    }
  });

  test("leaves out a browser that asks not to be tracked", () => {
    expect(optedOut({ globalPrivacyControl: true })).toBe(true);
    expect(optedOut({ doNotTrack: "1" })).toBe(true);
    expect(optedOut({ globalPrivacyControl: false, doNotTrack: "0" })).toBe(false);
    expect(optedOut({ doNotTrack: null })).toBe(false);
    expect(beaconConfig({ ...visit, optedOut: true })).toBeNull();
  });
});
