import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WEBSITE } from "../mode";
import { pageMetadata } from "../site/meta";
import { Privacy } from "../site/Privacy";

export const metadata: Metadata = pageMetadata("/privacy", {
  title: "Privacy",
  description: "What CareerBot keeps, who else sees it, and how to get a copy of your data or have it deleted.",
});

// Public to everyone, signed in or not, outside the app's frame (Shell). careerbot.dev's privacy page: not on a
// self-hosted copy (mode.ts), whose owner decides what happens to its data, or on the demo, whose footer links here
// on careerbot.dev.
export default function PrivacyPage() {
  if (!WEBSITE) notFound();
  return <Privacy />;
}
