import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WEBSITE } from "../mode";
import { HowItWorks } from "../site/HowItWorks";
import { pageMetadata } from "../site/meta";
import { HEADS } from "../site/words";

export const metadata: Metadata = pageMetadata("/how-it-works", HEADS.howItWorks);

// Public to everyone, signed in or not, outside the app's frame (Shell). Part of careerbot.dev only: not on a
// self-hosted copy or the demo (mode.ts).
export default function HowItWorksPage() {
  if (!WEBSITE) notFound();
  return <HowItWorks />;
}
