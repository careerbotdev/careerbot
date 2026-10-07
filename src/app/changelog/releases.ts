import type { Release } from "../../../convex/releases";
import data from "./releases.json";

// The release notes, newest first: releases.json beside this file, written by `pnpm release:prepare` from the change
// files in .changes/ (one per change a person would notice). The same list is /changelog, its RSS feed, the public
// careerbot.dev/releases.json that self-hosted copies check for a new version (convex/updates.ts), CHANGELOG.md and each
// GitHub Release (scripts/release-notes.ts).
export type { Release };
export const RELEASES: Release[] = data;

// This build's version (package.json, set by next.config.ts).
export const VERSION = process.env.NEXT_PUBLIC_CAREERBOT_VERSION ?? "";

// Where a release is on /changelog: #v0.7.0.
export const releaseAnchor = (version: string) => `v${version}`;

// "October 5, 2026" from 2026-10-05, the same in every time zone.
export function releaseDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
