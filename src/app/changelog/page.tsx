import type { Metadata } from "next";
import { pageMetadata } from "../site/meta";
import { Changelog } from "../site/Changelog";
import { HEADS } from "../site/words";
import { RELEASES } from "./releases";

export const metadata: Metadata = {
  ...pageMetadata("/changelog", HEADS.changelog),
  alternates: { canonical: "/changelog", types: { "application/rss+xml": [{ url: "/changelog/rss.xml", title: "CareerBot changelog" }] } },
};

// Public to everyone, signed in or not, outside the app's frame (Shell), on careerbot.dev, the demo and every
// self-hosted copy: each shows the releases up to its own version.
export default function ChangelogPage() {
  return <Changelog releases={RELEASES} />;
}
